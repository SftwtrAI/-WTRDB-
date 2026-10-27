import { randomUUID } from "crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creditBalanceBuckets,
  creditPackages,
  plans,
  users,
  userSubscriptions,
} from "@wtrops/shared";
import {
  calculateCallCredits,
  deductCallCreditsV2,
} from "../services/credit-service";
import {
  debitCredits,
  expireDueBuckets,
  getUserCreditBreakdown,
  grantCredits,
} from "../services/credit-ledger-service";
import { processMonthlyCreditsGrant } from "../services/monthly-credit-grant-cron";

type TestCase = {
  name: string;
  fn: () => Promise<void>;
};

class Suite {
  private tests: TestCase[] = [];
  private passed = 0;
  private failed = 0;

  add(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`Running ${this.tests.length} tests...`);
    for (const t of this.tests) {
      try {
        await t.fn();
        this.passed++;
        console.log(`✅ ${t.name}`);
      } catch (error: any) {
        this.failed++;
        console.error(`❌ ${t.name}`);
        console.error(`   ${error?.message || error}`);
      }
    }
    console.log("\n=== Summary ===");
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function getInfoSchemaCount(table: string, column?: string): Promise<number> {
  if (column) {
    const res = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM information_schema.columns
      WHERE table_name = ${table}
        AND column_name = ${column}
    `);
    return Number((res.rows?.[0] as any)?.count || 0);
  }
  const res = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_name = ${table}
  `);
  return Number((res.rows?.[0] as any)?.count || 0);
}

async function runPreflightChecks() {
  const missing: string[] = [];
  const requiredTables = [
    "users",
    "plans",
    "user_subscriptions",
    "credit_ledger_entries",
    "credit_balance_buckets",
    "infra_rate_cards",
    "credit_packages",
  ];

  for (const table of requiredTables) {
    const count = await getInfoSchemaCount(table);
    if (count !== 1) missing.push(`table ${table}`);
  }

  const requiredColumns: Array<{ table: string; column: string }> = [
    { table: "plans", column: "signup_bonus_credits" },
    { table: "plans", column: "credit_rollover_months" },
    { table: "plans", column: "credit_rollover_cap" },
  ];

  for (const item of requiredColumns) {
    const count = await getInfoSchemaCount(item.table, item.column);
    if (count !== 1) missing.push(`column ${item.table}.${item.column}`);
  }

  if (missing.length > 0) {
    throw new Error(
      [
        `Preflight failed. Missing DB objects: ${missing.join(", ")}.`,
        "Run migrations with DATABASE_URL loaded:",
        "set -a; source .env; set +a",
        "psql \"$DATABASE_URL\" -f migrations/0004_credit_system_columns.sql",
        "psql \"$DATABASE_URL\" -f migrations/0005_credit_ledger_tables.sql",
      ].join("\n"),
    );
  }
}

async function main() {
  const runId = randomUUID().slice(0, 8);
  console.log("== Credit Feature Test Suite ==");
  console.log(`Run ID: ${runId}`);
  await runPreflightChecks();

  const [freePlan] = await db
    .select({
      id: plans.id,
      includedCredits: plans.includedCredits,
      creditRolloverCap: plans.creditRolloverCap,
    })
    .from(plans)
    .where(eq(plans.name, "free"))
    .limit(1);
  assert(freePlan, "Free plan not found. Seed plans first.");

  const [testUser] = await db
    .insert(users)
    .values({
      email: `credit-suite-${runId}@example.com`,
      password: "credit-suite-password",
      name: "Credit Suite User",
      role: "user",
      isActive: true,
      planType: "free",
      credits: 0,
    })
    .returning({ id: users.id });
  assert(testUser?.id, "Failed to create suite test user");

  await db.insert(userSubscriptions).values({
    userId: testUser.id,
    planId: freePlan.id,
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    billingPeriod: "monthly",
  });

  const suite = new Suite();

  suite.add("Schema: credit_ledger_entries table exists", async () => {
    const count = await getInfoSchemaCount("credit_ledger_entries");
    assert(count === 1, "credit_ledger_entries table missing");
  });

  suite.add("Schema: credit_balance_buckets table exists", async () => {
    const count = await getInfoSchemaCount("credit_balance_buckets");
    assert(count === 1, "credit_balance_buckets table missing");
  });

  suite.add("Schema: infra_rate_cards table exists", async () => {
    const count = await getInfoSchemaCount("infra_rate_cards");
    assert(count === 1, "infra_rate_cards table missing");
  });

  suite.add("Schema: plans.signup_bonus_credits exists", async () => {
    const count = await getInfoSchemaCount("plans", "signup_bonus_credits");
    assert(count === 1, "plans.signup_bonus_credits missing");
  });

  suite.add("Seed data: core plans available", async () => {
    const rows = await db
      .select({ name: plans.name })
      .from(plans)
      .where(
        or(
          eq(plans.name, "free"),
          eq(plans.name, "starter"),
          eq(plans.name, "growth"),
          eq(plans.name, "scale"),
          eq(plans.name, "enterprise"),
        ),
      );
    const names = new Set(rows.map((r) => r.name));
    for (const n of ["free", "starter", "growth", "scale", "enterprise"]) {
      assert(names.has(n), `Plan missing: ${n}`);
    }
  });

  suite.add("Seed data: credit packages available", async () => {
    const rows = await db.select({ id: creditPackages.id }).from(creditPackages);
    assert(rows.length >= 3, "Expected at least 3 credit packages");
  });

  suite.add("Ledger grant: credits increase", async () => {
    const result = await grantCredits({
      userId: testUser.id,
      amount: 300,
      sourceType: "topup",
      sourceId: "suite-topup-1",
      description: "Suite topup grant",
      idempotencyKey: `suite:grant:${runId}`,
    });
    assert(result.success, "grantCredits failed");
    assert(result.newBalance === 300, `Expected balance 300, got ${result.newBalance}`);
  });

  suite.add("Ledger grant: idempotency works", async () => {
    const result = await grantCredits({
      userId: testUser.id,
      amount: 300,
      sourceType: "topup",
      sourceId: "suite-topup-1",
      description: "Suite topup duplicate",
      idempotencyKey: `suite:grant:${runId}`,
    });
    assert(result.success, "idempotent grant failed");
    assert(result.alreadyProcessed === true, "duplicate grant was not idempotent");
  });

  suite.add("Ledger debit: credits decrease", async () => {
    const result = await debitCredits({
      userId: testUser.id,
      amount: 120,
      sourceType: "voice_call",
      sourceId: "suite-call-1",
      description: "Suite call debit",
      idempotencyKey: `suite:debit:${runId}`,
    });
    assert(result.success, "debitCredits failed");
    assert(result.newBalance === 180, `Expected balance 180, got ${result.newBalance}`);
  });

  suite.add("Ledger debit: idempotency works", async () => {
    const result = await debitCredits({
      userId: testUser.id,
      amount: 120,
      sourceType: "voice_call",
      sourceId: "suite-call-1",
      description: "Suite call duplicate",
      idempotencyKey: `suite:debit:${runId}`,
    });
    assert(result.success, "idempotent debit failed");
    assert(result.alreadyProcessed === true, "duplicate debit was not idempotent");
  });

  suite.add("Ledger debit: insufficient credits fails", async () => {
    const result = await debitCredits({
      userId: testUser.id,
      amount: 999999,
      sourceType: "voice_call",
      sourceId: "suite-call-insufficient",
      description: "Suite insufficient debit",
      idempotencyKey: `suite:insufficient:${runId}`,
    });
    assert(!result.success, "insufficient debit should fail");
    assert(result.error?.includes("Insufficient"), "missing insufficient-credit error");
  });

  suite.add("Breakdown: bucket + total consistency", async () => {
    const breakdown = await getUserCreditBreakdown(testUser.id);
    assert(breakdown.totalCredits >= breakdown.bucketCredits, "total must be >= bucket credits");
  });

  suite.add("Expiry: expired buckets reduce balance", async () => {
    const [bucket] = await db
      .select({ id: creditBalanceBuckets.id })
      .from(creditBalanceBuckets)
      .where(
        and(
          eq(creditBalanceBuckets.userId, testUser.id),
          eq(creditBalanceBuckets.status, "active"),
          gt(creditBalanceBuckets.remainingCredits, 0),
        ),
      )
      .limit(1);
    assert(bucket, "No active bucket available for expiry test");

    await db
      .update(creditBalanceBuckets)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(creditBalanceBuckets.id, bucket.id));

    const [before] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);
    await expireDueBuckets(1000);
    const [after] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);

    assert((after?.credits || 0) <= (before?.credits || 0), "expiry should not increase credits");
  });

  suite.add("Monthly grant: first run grants up to included credits", async () => {
    await db
      .update(users)
      .set({
        credits: 0,
        rolloverCredits: 0,
        monthlyCreditsGrantedAt: null,
      })
      .where(eq(users.id, testUser.id));

    await db
      .delete(creditBalanceBuckets)
      .where(
        and(
          eq(creditBalanceBuckets.userId, testUser.id),
          eq(creditBalanceBuckets.sourceType, "monthly_grant"),
        ),
      );

    await processMonthlyCreditsGrant();
    const [row] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);
    assert((row?.credits || 0) <= freePlan.includedCredits, "monthly grant exceeded included credits");
  });

  suite.add("Monthly grant: same month is idempotent", async () => {
    const [before] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);
    await processMonthlyCreditsGrant();
    const [after] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, testUser.id))
      .limit(1);
    assert((after?.credits || 0) === (before?.credits || 0), "same-month grant should not double-credit");
  });

  suite.add("Monthly grant: rollover cap respected", async () => {
    await db
      .update(users)
      .set({
        credits: 0,
        rolloverCredits: 0,
        monthlyCreditsGrantedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      })
      .where(eq(users.id, testUser.id));

    await db
      .delete(creditBalanceBuckets)
      .where(
        and(
          eq(creditBalanceBuckets.userId, testUser.id),
          eq(creditBalanceBuckets.sourceType, "monthly_grant"),
        ),
      );

    await grantCredits({
      userId: testUser.id,
      amount: Math.max(0, freePlan.creditRolloverCap - 50),
      sourceType: "monthly_grant",
      sourceId: "preload-rollover",
      description: "Preload rollover",
      idempotencyKey: `suite:rollover-preload:${runId}`,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });

    await processMonthlyCreditsGrant();

    const activeMonthlyBuckets = await db
      .select({ remaining: creditBalanceBuckets.remainingCredits })
      .from(creditBalanceBuckets)
      .where(
        and(
          eq(creditBalanceBuckets.userId, testUser.id),
          eq(creditBalanceBuckets.sourceType, "monthly_grant"),
          eq(creditBalanceBuckets.status, "active"),
          gt(creditBalanceBuckets.remainingCredits, 0),
          or(
            isNull(creditBalanceBuckets.expiresAt),
            gt(creditBalanceBuckets.expiresAt, new Date()),
          ),
        ),
      );
    const totalMonthlyBanked = activeMonthlyBuckets.reduce((s, r) => s + r.remaining, 0);
    assert(
      totalMonthlyBanked <= freePlan.creditRolloverCap,
      `rollover cap breached: ${totalMonthlyBanked} > ${freePlan.creditRolloverCap}`,
    );
  });

  suite.add("Call cost calc: totals are coherent", async () => {
    const cost = await calculateCallCredits({
      durationSeconds: 125,
      modelTier: "mini",
      callDirection: "outgoing",
    });
    assert(cost.total === cost.tokenCredits + cost.infraCredits, "call cost total mismatch");
    assert(cost.total > 0, "call cost should be positive");
  });

  suite.add("Call debit V2: applies usage debit", async () => {
    await grantCredits({
      userId: testUser.id,
      amount: 200,
      sourceType: "topup",
      sourceId: "suite-call-v2-fund",
      description: "Fund for V2 call debit",
      idempotencyKey: `suite:v2fund:${runId}`,
    });
    const result = await deductCallCreditsV2({
      userId: testUser.id,
      callId: `suite-v2-${runId}`,
      fromNumber: "+911111111111",
      toNumber: "+922222222222",
      durationSeconds: 90,
      engine: "livekit",
      callDirection: "outgoing",
      modelTier: "mini",
    });
    assert(result.success, "deductCallCreditsV2 failed");
    assert((result.creditsDeducted || 0) > 0, "deductCallCreditsV2 deducted zero credits");
  });

  try {
    await suite.run();
  } finally {
    await db.delete(users).where(eq(users.id, testUser.id));
    console.log("Cleanup complete (suite user deleted).");
  }
}

main().catch((error) => {
  console.error("❌ Fatal suite error:", error?.message || error);
  process.exit(1);
});
