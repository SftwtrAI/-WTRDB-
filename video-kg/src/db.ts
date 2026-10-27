import pg from "pg";
import { config } from "./config.js";

/**
 * Shared Postgres pool. Points at the SAME database as version-2.0 so we can
 * (a) insert knowledge_base / knowledge_graphs rows that v2's UI reads, and
 * (b) optionally read v2's global_settings.openai_api_key, and
 * (c) store our own video_jobs rows (in a table we own — see jobs/jobStore).
 *
 * We only ever INSERT into v2's tables (never ALTER/UPDATE existing rows), and
 * the video_jobs table is created by this service, not by v2.
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
