import Redis from "ioredis";
import { pool } from "../src/db.js";
import { getGraphName } from "../src/falkor.js";

// Delete one or more image-kg test KBs from the shared FalkorDB + Postgres.
//   tsx scripts/cleanup.ts <userId> <kbId> [<kbId> ...]
async function main() {
  const [userId, ...kbIds] = process.argv.slice(2);
  if (!userId || kbIds.length === 0) throw new Error("usage: tsx scripts/cleanup.ts <userId> <kbId...>");
  const r = new Redis(process.env.FALKORDB_URL || "redis://localhost:6380");
  for (const kb of kbIds) {
    const g = getGraphName(userId, kb);
    try {
      await (r as any).call("GRAPH.DELETE", g);
      console.log("deleted falkor graph", g);
    } catch (e: any) {
      console.log("graph delete:", g, e.message);
    }
    const a = await pool.query("DELETE FROM knowledge_graphs WHERE knowledge_base_id=$1", [kb]);
    const b = await pool.query("DELETE FROM knowledge_base WHERE id=$1", [kb]);
    console.log(`kb ${kb}: knowledge_graphs=${a.rowCount} knowledge_base=${b.rowCount}`);
  }
  await r.quit();
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
