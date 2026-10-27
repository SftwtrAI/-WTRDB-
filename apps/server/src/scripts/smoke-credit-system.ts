import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creditBalanceBuckets,
  plans,
  users,
  userSubscriptions,
} from "@wtrops/shared";
import {
  debitCredits,
  expireDueBuckets,
  getUserCreditBreakdown,
  grantCredits,
} from "../services/credit-ledger-service";
import { processMonthlyCreditsGrant } from "../services/monthly-credit-grant-cron";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function run() {
  const runId = randomUUID().slice(0, 8);
  const email = `credit-smoke-${runId}@example.com`;
  const now = new Date();

  console.log("== Credit System Smoke Test ==");
  console.log(`Run ID: ${runId}`);

  const [freePlan] = await db
    .select({ id: plans.id, includedCredits: plans.includedCredits })
    .from(plans)
    .where(eq(plans.name, "free"))
    .limit(1);
  assert(freePlan, "Free plan not found. Seed plans first.");

  const [user] = await db
    .insert(users)
    .values({
      email,
      password: "smoke-test-password",
      name: "Credit Smoke User",
      role: "user",
      isActive: true,
      planType: "free",
      credits: 0,
    })
    .returning({ id: users.id });
  assert(user?.id, "Failed to create smoke test user.");

  try {
    await db.insert(userSubscriptions).values({
      userId: user.id,
      planId: freePlan.id,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      billingPeriod: "monthly",
    });

    console.log("1) grantCredits + idempotency");
    const g1 = await grantCredits({
      userId: user.id,
      amount: 300,
      sourceType: "topup",
      sourceId: "smoke-topup",
      description: "Smoke test grant",
      idempotencyKey: `smoke:grant:${runId}`,
    });
    assert(g1.success, "grantCredits failed");
    assert(g1.newBalance === 300, "Expected balance 300 after first grant");

    const g2 = await grantCredits({
      userId: user.id,
      amount: 300,
      sourceType: "topup",
      sourceId: "smoke-topup",
      description: "Smoke test grant duplicate",
      idempotencyKey: `smoke:grant:${runId}`,
    });
    assert(g2.success, "Idempotent grant failed");
    assert(g2.alreadyProcessed === true, "Expected idempotent grant to be alreadyProcessed");

    console.log("2) debitCredits + idempotency");
    const d1 = await debitCredits({
      userId: user.id,
      amount: 120,
      sourceType: "voice_call",
      sourceId: "smoke-call-1",
      description: "Smoke test debit",
      idempotencyKey: `smoke:debit:${runId}`,
    });
    assert(d1.success, "debitCredits failed");
    assert(d1.newBalance === 180, "Expected balance 180 after first debit");

    const d2 = await debitCredits({
      userId: user.id,
      amount: 120,
      sourceType: "voice_call",
      sourceId: "smoke-call-1",
      description: "Smoke test debit duplicate",
      idempotencyKey: `smoke:debit:${runId}`,
    });
    assert(d2.success, "Idempotent debit failed");
    assert(d2.alreadyProcessed === true, "Expected idempotent debit to be alreadyProcessed");

    console.log("3) breakdown endpoint logic");
    const b1 = await getUserCreditBreakdown(user.id);
    assert(b1.totalCredits === 180, "Expected totalCredits 180");
    assert(b1.bucketCredits >= 180, "Expected bucketCredits to include remaining granted credits");

    console.log("4) expiry flow");
    const [bucket] = await db
      .select({ id: creditBalanceBuckets.id })
      .from(creditBalanceBuckets)
      .where(
        and(
          eq(creditBalanceBuckets.userId, user.id),
          eq(creditBalanceBuckets.status, "active"),
        ),
      )
      .limit(1);
    assert(bucket?.id, "No active bucket found to expire");

    await db
      .update(creditBalanceBuckets)
      .set({ expiresAt: new Date(Date.now() - 60 * 1000) })
      .where(eq(creditBalanceBuckets.id, bucket.id));

    await expireDueBuckets(100);
    const [afterExpire] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    assert((afterExpire?.credits || 0) <= 180, "Expiry should not increase credits");

    console.log("5) monthly grant cron (free plan)");
    await db
      .update(users)
      .set({
        credits: 0,
        rolloverCredits: 0,
        monthlyCreditsGrantedAt: null,
      })
      .where(eq(users.id, user.id));

    await processMonthlyCreditsGrant();

    const [afterMonthly] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    assert(
      (afterMonthly?.credits || 0) <= freePlan.includedCredits,
      "Monthly grant should respect free plan cap logic",
    );

    console.log("6) second monthly grant run should be idempotent for same month");
    const firstMonthlyBalance = afterMonthly?.credits || 0;
    await processMonthlyCreditsGrant();
    const [afterSecondMonthly] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    assert(
      (afterSecondMonthly?.credits || 0) === firstMonthlyBalance,
      "Second monthly grant run in same month should not double grant",
    );

    console.log("✅ PASS: Credit system smoke tests passed");
    console.log(
      JSON.stringify(
        {
          runId,
          userId: user.id,
          finalCredits: afterSecondMonthly?.credits || 0,
          freePlanIncludedCredits: freePlan.includedCredits,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
    console.log("Cleanup complete (smoke user deleted).");
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ FAIL:", err?.message || err);
    process.exit(1);
  });
