/**
 * Seed script: RBAC test data
 *
 * Creates an organization with one Managing Director and three Plant Owners,
 * each owning a knowledge base + brain endpoint, and writes synthetic
 * plant-specific data into FalkorDB. Idempotent — safe to run repeatedly.
 *
 *   pnpm tsx apps/server/src/scripts/seed-rbac-test.ts
 *
 * Flags:
 *   --rotate       Force-regenerate every brain endpoint API key. Use this
 *                  if a token has leaked, or after pasting tokens into chat.
 *   --show-tokens  Print full URLs in the summary. Default redacts the token.
 *                  WARNING: tokens printed here land in shell history and any
 *                  CI/log capture. Use --rotate after you're done.
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";
import Redis from "ioredis";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  brainEndpoints,
  knowledgeBase,
  knowledgeGraphs,
  organizationMembers,
  organizations,
  roles,
  userRoles,
  users,
} from "@wtrops/shared";
import { initRbacEngine, permissionService } from "../engines/rbac";
import {
  createFalkorDBClient,
  getGraphName,
} from "../infrastructure/falkordb/client";

const ORG_SLUG = "rbac-test-org";
const ORG_NAME = "RBAC Test Org";

const SEED_USERS = [
  { email: "md@example.com", password: "md123", name: "Managing Director", roleName: "managing_director", orgRole: "owner" },
  { email: "owner_a@example.com", password: "a123", name: "Plant Owner A", roleName: "plant_owner", orgRole: "member" },
  { email: "owner_b@example.com", password: "b123", name: "Plant Owner B", roleName: "plant_owner", orgRole: "member" },
  { email: "owner_c@example.com", password: "c123", name: "Plant Owner C", roleName: "plant_owner", orgRole: "member" },
] as const;

interface PlantSpec {
  letter: "A" | "B" | "C";
  ownerEmail: string;
  city: string;
  equipment: string[];
  sensors: string[];
  operators: string[];
  events: { type: string; on: string; daysAgo: number; note: string }[];
}

const PLANTS: PlantSpec[] = [
  {
    letter: "A",
    ownerEmail: "owner_a@example.com",
    city: "Bangalore",
    equipment: ["Pump-A1", "Pump-A2", "ClarifierTank-A"],
    sensors: ["pH-A1", "Turbidity-A1"],
    operators: ["Asha", "Ravi"],
    events: [{ type: "MaintenanceEvent", on: "Pump-A1", daysAgo: 14, note: "Replaced impeller seal" }],
  },
  {
    letter: "B",
    ownerEmail: "owner_b@example.com",
    city: "Mumbai",
    equipment: ["Pump-B1", "Pump-B2", "RO-Module-B"],
    sensors: ["pH-B1", "Conductivity-B1"],
    operators: ["Priya", "Karan"],
    events: [{ type: "MaintenanceEvent", on: "RO-Module-B", daysAgo: 30, note: "Membrane cleaning cycle" }],
  },
  {
    letter: "C",
    ownerEmail: "owner_c@example.com",
    city: "Chennai",
    equipment: ["Pump-C1", "UV-Disinfector-C"],
    sensors: ["pH-C1", "Flow-C1"],
    operators: ["Meera", "Arjun"],
    events: [{ type: "IncidentReport", on: "UV-Disinfector-C", daysAgo: 3, note: "Lamp failure detected" }],
  },
];

function generateApiKey(): string {
  return `brn_${crypto.randomBytes(24).toString("hex")}`;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const FLAGS = new Set(process.argv.slice(2));
const ROTATE_KEYS = FLAGS.has("--rotate");
const SHOW_TOKENS = FLAGS.has("--show-tokens");
const WRITE_ENV = FLAGS.has("--write-env");
const ENV_TARGET = "/root/rbac-test/.env.local";

function redactToken(url: string): string {
  return url.replace(/brn_[a-f0-9]+/, (m) => `${m.slice(0, 8)}…${m.slice(-4)}`);
}

async function main(): Promise<void> {
  console.log("[seed-rbac-test] starting", ROTATE_KEYS ? "(rotating keys)" : "");

  // 1. Roles + permissions wired up
  await initRbacEngine();
  console.log("[seed-rbac-test] RBAC engine initialized (roles + permissions)");

  // 2. Users (insert MD first so it can own the org)
  const userIds: Record<string, string> = {};
  for (const u of SEED_USERS) {
    const existing = await db.select().from(users).where(eq(users.email, u.email)).limit(1);
    if (existing.length) {
      userIds[u.email] = existing[0].id;
      console.log(`[user] reuse ${u.email} -> ${existing[0].id}`);
      continue;
    }
    const hash = await bcrypt.hash(u.password, 10);
    const [row] = await db
      .insert(users)
      .values({ email: u.email, password: hash, name: u.name, role: "user" })
      .returning({ id: users.id });
    userIds[u.email] = row.id;
    console.log(`[user] insert ${u.email} -> ${row.id}`);
  }
  const mdId = userIds["md@example.com"];

  // 3. Organization
  const existingOrg = await db.select().from(organizations).where(eq(organizations.slug, ORG_SLUG)).limit(1);
  let orgId: string;
  if (existingOrg.length) {
    orgId = existingOrg[0].id;
    console.log(`[org] reuse ${ORG_SLUG} -> ${orgId}`);
  } else {
    const [row] = await db
      .insert(organizations)
      .values({ name: ORG_NAME, slug: ORG_SLUG, ownerId: mdId })
      .returning({ id: organizations.id });
    orgId = row.id;
    console.log(`[org] insert ${ORG_SLUG} -> ${orgId}`);
  }

  // 4. Memberships
  for (const u of SEED_USERS) {
    const userId = userIds[u.email];
    const existing = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)))
      .limit(1);
    if (existing.length) continue;
    await db.insert(organizationMembers).values({ organizationId: orgId, userId, role: u.orgRole, invitedBy: mdId });
    console.log(`[member] add ${u.email} as ${u.orgRole}`);
  }

  // 5. RBAC role assignments
  const roleIdByName: Record<string, string> = {};
  for (const name of ["managing_director", "plant_owner"]) {
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, name), eq(roles.isSystemRole, true)))
      .limit(1);
    if (!r) throw new Error(`System role ${name} missing — seedSystemRoles failed`);
    roleIdByName[name] = r.id;
  }
  for (const u of SEED_USERS) {
    const userId = userIds[u.email];
    const roleId = roleIdByName[u.roleName];
    const existing = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.organizationId, orgId), eq(userRoles.roleId, roleId)))
      .limit(1);
    if (existing.length) continue;
    await db.insert(userRoles).values({ userId, organizationId: orgId, roleId, assignedBy: mdId });
    console.log(`[user_role] ${u.email} -> ${u.roleName}`);
  }

  // 6/7/8. Per-plant: KB, knowledge_graphs row, FalkorDB data
  const falkorUrl = process.env.FALKORDB_URL || "redis://localhost:6379";
  const redis = new Redis(falkorUrl, { maxRetriesPerRequest: 3 });
  const falkor = createFalkorDBClient(redis);

  const endpointSummaries: { plant: string; ownerEmail: string; kbId: string; apiKey: string }[] = [];

  try {
    for (const plant of PLANTS) {
      const ownerId = userIds[plant.ownerEmail];
      const kbTitle = `Plant ${plant.letter} KG`;

      // KB
      const existingKb = await db
        .select()
        .from(knowledgeBase)
        .where(and(eq(knowledgeBase.userId, ownerId), eq(knowledgeBase.title, kbTitle)))
        .limit(1);
      let kbId: string;
      if (existingKb.length) {
        kbId = existingKb[0].id;
        console.log(`[kb] reuse Plant ${plant.letter} -> ${kbId}`);
      } else {
        const [row] = await db
          .insert(knowledgeBase)
          .values({
            userId: ownerId,
            type: "manual",
            title: kbTitle,
            content: `Synthetic seed data for Plant ${plant.letter} (${plant.city}).`,
          })
          .returning({ id: knowledgeBase.id });
        kbId = row.id;
        console.log(`[kb] insert Plant ${plant.letter} -> ${kbId}`);
      }

      // FalkorDB graph
      const graphName = getGraphName(ownerId, kbId);
      // Wipe + reseed so the script is idempotent on the graph contents too.
      await falkor.query(graphName, "MATCH (n) DETACH DELETE n").catch(() => undefined);

      // NOTE: labels must be drawn from ENTITY_TYPES in
      // apps/server/src/services/knowledge-graph-prompts.ts so the `ask`
      // tool's NL→Cypher LLM knows about them. We use canonical labels and
      // disambiguate with a `kind` property on each node.
      const plantNodeName = `Plant ${plant.letter}`;
      const cyphers: string[] = [];
      cyphers.push(
        `MERGE (p:Organization:Location {name: "${esc(plantNodeName)}"}) SET p.kind = "Plant", p.type = "WaterTreatmentPlant", p.city = "${esc(plant.city)}", p.code = "P${plant.letter}", p.description = "Water treatment plant in ${esc(plant.city)}"`,
      );
      // Also add a Location node for the city, since the LLM may treat "Plant A" as a location too.
      cyphers.push(
        `MERGE (loc:Location {name: "${esc(plant.city)}"}) SET loc.kind = "City"`,
      );
      cyphers.push(
        `MATCH (p:Organization:Location {name: "${esc(plantNodeName)}"}), (loc:Location {name: "${esc(plant.city)}"}) MERGE (p)-[:LOCATED_IN]->(loc)`,
      );
      for (const eq of plant.equipment) {
        cyphers.push(
          `MERGE (e:Infrastructure:Product {name: "${esc(eq)}"}) SET e.kind = "Equipment", e.plant = "${esc(plantNodeName)}" WITH e MATCH (p:Organization:Location {name: "${esc(plantNodeName)}"}) MERGE (e)-[:LOCATED_IN]->(p)`,
        );
      }
      for (const s of plant.sensors) {
        cyphers.push(
          `MERGE (s:Infrastructure {name: "${esc(s)}"}) SET s.kind = "Sensor", s.plant = "${esc(plantNodeName)}" WITH s MATCH (p:Organization:Location {name: "${esc(plantNodeName)}"}) MERGE (s)-[:LOCATED_IN]->(p)`,
        );
      }
      for (const op of plant.operators) {
        cyphers.push(
          `MERGE (o:Person {name: "${esc(op)}"}) SET o.role = "Operator", o.plant = "${esc(plantNodeName)}" WITH o MATCH (p:Organization:Location {name: "${esc(plantNodeName)}"}) MERGE (o)-[:WORKS_AT]->(p)`,
        );
      }
      for (const ev of plant.events) {
        const ts = new Date(Date.now() - ev.daysAgo * 86400_000).toISOString();
        const evName = `${ev.type}-${ev.on}-${ev.daysAgo}d`;
        cyphers.push(
          `MERGE (ev:Event:Document {name: "${esc(evName)}"}) SET ev.kind = "${esc(ev.type)}", ev.type = "${esc(ev.type)}", ev.note = "${esc(ev.note)}", ev.description = "${esc(ev.note)}", ev.occurredAt = "${ts}", ev.date = "${ts}", ev.target = "${esc(ev.on)}", ev.plant = "${esc(plantNodeName)}"`,
        );
        // Connect event to the targeted equipment via multiple relationship
        // types so the NL→Cypher LLM finds it however it phrases the path.
        cyphers.push(
          `MATCH (ev:Event {name: "${esc(evName)}"}), (target {name: "${esc(ev.on)}"}) MERGE (ev)-[:MENTIONS]->(target) MERGE (ev)-[:RELATED_TO]->(target) MERGE (target)-[:PARTICIPATES_IN]->(ev)`,
        );
        cyphers.push(
          `MATCH (ev:Event {name: "${esc(evName)}"}), (p:Organization:Location {name: "${esc(plantNodeName)}"}) MERGE (ev)-[:LOCATED_IN]->(p)`,
        );
        // Also stamp the event info as properties directly on the targeted
        // equipment, so simple property-only queries ("p.lastServiced") work.
        if (ev.type === "MaintenanceEvent") {
          cyphers.push(
            `MATCH (target {name: "${esc(ev.on)}"}) SET target.lastServiced = "${ts}", target.lastServiceNote = "${esc(ev.note)}", target.status = "Operational"`,
          );
        } else if (ev.type === "IncidentReport") {
          cyphers.push(
            `MATCH (target {name: "${esc(ev.on)}"}) SET target.lastIncidentAt = "${ts}", target.lastIncidentNote = "${esc(ev.note)}", target.status = "Attention Needed"`,
          );
        }
      }
      for (const c of cyphers) {
        await falkor.query(graphName, c);
      }

      // Count entities + relationships for the metadata row
      const entResult = await falkor.query(graphName, "MATCH (n) RETURN count(n) AS c");
      const relResult = await falkor.query(graphName, "MATCH ()-[r]->() RETURN count(r) AS c");
      const entCount = Number((entResult.records[0] as any)?.c ?? 0);
      const relCount = Number((relResult.records[0] as any)?.c ?? 0);

      // knowledge_graphs row
      const existingKg = await db
        .select()
        .from(knowledgeGraphs)
        .where(and(eq(knowledgeGraphs.userId, ownerId), eq(knowledgeGraphs.knowledgeBaseId, kbId)))
        .limit(1);
      if (existingKg.length) {
        await db
          .update(knowledgeGraphs)
          .set({
            status: "completed",
            entityCount: entCount,
            relationshipCount: relCount,
            falkordbGraphName: graphName,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeGraphs.id, existingKg[0].id));
      } else {
        await db.insert(knowledgeGraphs).values({
          userId: ownerId,
          knowledgeBaseId: kbId,
          status: "completed",
          entityCount: entCount,
          relationshipCount: relCount,
          falkordbGraphName: graphName,
        });
      }
      console.log(`[kg] Plant ${plant.letter}: ${entCount} entities, ${relCount} relationships`);

      // 9. Brain endpoint
      const epName = `Plant ${plant.letter} Brain`;
      const existingEp = await db
        .select()
        .from(brainEndpoints)
        .where(
          and(
            eq(brainEndpoints.userId, ownerId),
            eq(brainEndpoints.knowledgeBaseId, kbId),
            eq(brainEndpoints.name, epName),
          ),
        )
        .limit(1);
      let apiKey: string;
      if (existingEp.length) {
        if (ROTATE_KEYS) {
          apiKey = generateApiKey();
          await db
            .update(brainEndpoints)
            .set({ apiKey, allowCypher: true, updatedAt: new Date() })
            .where(eq(brainEndpoints.id, existingEp[0].id));
          console.log(`[endpoint] rotate Plant ${plant.letter} -> new key`);
        } else {
          apiKey = existingEp[0].apiKey;
          if (!existingEp[0].allowCypher) {
            await db
              .update(brainEndpoints)
              .set({ allowCypher: true, updatedAt: new Date() })
              .where(eq(brainEndpoints.id, existingEp[0].id));
          }
          console.log(`[endpoint] reuse Plant ${plant.letter} -> ${redactToken(`brn_${"x".repeat(48)}`)}`);
        }
      } else {
        apiKey = generateApiKey();
        await db.insert(brainEndpoints).values({
          userId: ownerId,
          knowledgeBaseId: kbId,
          name: epName,
          apiKey,
          allowNlQueries: true,
          allowCypher: true,
        });
        console.log(`[endpoint] insert Plant ${plant.letter} -> ${apiKey}`);
      }

      endpointSummaries.push({ plant: plant.letter, ownerEmail: plant.ownerEmail, kbId, apiKey });
    }
  } finally {
    redis.disconnect();
  }

  // Invalidate cached permissions (seedPermissions may have changed role mappings).
  await permissionService.invalidateOrgCache(orgId);
  console.log("[cache] permission cache invalidated for org");

  // 10. Output
  console.log("\n=== SEED COMPLETE ===");
  console.log("Org:", ORG_NAME, `(slug=${ORG_SLUG}, id=${orgId})`);
  console.log("\nUsers:");
  for (const u of SEED_USERS) {
    console.log(`  ${u.email} / ${u.password}  [${u.roleName}]`);
  }
  const base = process.env.WTRDB_BASE_URL || "http://localhost:5100";

  if (WRITE_ENV) {
    let existing = "";
    try {
      existing = fs.readFileSync(ENV_TARGET, "utf8");
    } catch {
      // file doesn't exist yet — start from scratch
      existing = "SESSION_SECRET=change-me\nWTRDB_BASE_URL=" + base + "\n";
    }
    let updated = existing;
    for (const s of endpointSummaries) {
      const key = `BRAIN_URL_PLANT_${s.plant}`;
      const url = `${base}/api/brain/${s.apiKey}/mcp`;
      const line = `${key}=${url}`;
      if (new RegExp(`^${key}=.*$`, "m").test(updated)) {
        updated = updated.replace(new RegExp(`^${key}=.*$`, "m"), line);
      } else {
        updated = updated.replace(/\n*$/, "\n") + line + "\n";
      }
    }
    fs.writeFileSync(ENV_TARGET, updated, { mode: 0o600 });
    fs.chmodSync(ENV_TARGET, 0o600); // ensure existing file is locked down too
    console.log(`\n✓ Tokens written to ${ENV_TARGET} (mode 0600). Nothing printed.`);
    console.log("\nUseful flags:");
    console.log("  --rotate       Regenerate every API key (invalidates previous tokens).");
    return;
  }

  if (SHOW_TOKENS) {
    console.log("\nBrain MCP URLs (FULL — paste into .env.local, treat as secrets):");
    for (const s of endpointSummaries) {
      console.log(`  Plant ${s.plant} (${s.ownerEmail}): ${base}/api/brain/${s.apiKey}/mcp`);
    }
    console.log("\n⚠️  Tokens are now in your terminal scrollback. Rotate after committing/pushing/sharing.");
  } else {
    console.log("\nBrain MCP URLs (REDACTED — re-run with --show-tokens to print full URLs):");
    for (const s of endpointSummaries) {
      const url = `${base}/api/brain/${s.apiKey}/mcp`;
      console.log(`  Plant ${s.plant} (${s.ownerEmail}): ${redactToken(url)}`);
    }
    console.log("\nTo write tokens to /root/rbac-test/.env.local without printing them, run:");
    console.log("  pnpm tsx apps/server/src/scripts/seed-rbac-test.ts --write-env");
  }
  console.log("\nUseful flags:");
  console.log("  --rotate       Regenerate every API key (invalidates previous tokens).");
  console.log("  --show-tokens  Print full URLs (for first-time setup).");
  console.log("  --write-env    Write tokens straight to /root/rbac-test/.env.local.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-rbac-test] FAILED:", err);
    process.exit(1);
  });
