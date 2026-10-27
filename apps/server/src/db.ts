"use strict";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool, types } = pg;
import * as schema from "@wtrops/shared";

/**
 * Fix timezone handling for `timestamp without time zone` columns.
 *
 * PostgreSQL `timestamp` (without timezone) stores naive timestamps.
 * The `pg` library's default type parser interprets them in the Node.js
 * process's LOCAL timezone, which can differ from PostgreSQL's timezone
 * (e.g., WSL2 defaults to UTC while PG may use Asia/Kolkata).
 *
 * This causes timestamps to shift by the timezone offset when read back.
 * Fix: Force the pg driver to interpret naive timestamps as UTC.
 *
 * OID 1114 = timestamp without time zone
 * OID 1184 = timestamp with time zone (already handled correctly by pg)
 */
types.setTypeParser(1114, (stringValue: string) => {
  // Append '+00' to force UTC interpretation of naive timestamps
  return new Date(stringValue + "+00");
});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Ensure all PG sessions use UTC timezone for consistency
pool.on("connect", (client) => {
  client.query("SET timezone = 'UTC'");
});

export const db = drizzle(pool, { schema });
