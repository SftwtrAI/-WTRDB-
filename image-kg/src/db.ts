import pg from "pg";
import { config } from "./config.js";

/**
 * Shared Postgres pool. Points at the SAME database as wtrdb-v2 so we can
 * (a) insert knowledge_base / knowledge_graphs rows that v2's UI reads, and
 * (b) optionally read v2's global_settings.openai_api_key.
 *
 * We only ever INSERT/UPDATE our own rows (identified by kbId) into v2's tables;
 * this service never ALTERs v2's schema.
 */
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
});

export async function dbHealthCheck(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Read v2's stored OpenAI key as a fallback when OPENAI_API_KEY is unset. */
export async function readV2OpenAiKey(): Promise<string | null> {
  try {
    const res = await pool.query(
      "SELECT value FROM global_settings WHERE key = $1 LIMIT 1",
      ["openai_api_key"],
    );
    const v = res.rows[0]?.value;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}
