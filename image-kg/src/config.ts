import "dotenv/config";
import path from "node:path";

function int(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function str(name: string, def = ""): string {
  const v = process.env[name];
  return v === undefined ? def : v;
}

const DATA_DIR = path.resolve(str("DATA_DIR", "./data"));

export const config = {
  // OpenAI
  openaiApiKey: str("OPENAI_API_KEY"),
  visionModel: str("VISION_MODEL", "gpt-5"),
  queryModel: str("QUERY_MODEL", "gpt-5"),

  // Shared infra (must match wtrdb-v2)
  databaseUrl: str("DATABASE_URL"),
  falkordbUrl: str("FALKORDB_URL", "redis://localhost:6380"),
  jwtSecret: str("JWT_SECRET"),

  // wtrdb-v2 server (live-events bridge + deep links)
  v2BaseUrl: str("V2_BASE_URL", "http://localhost:5001").replace(/\/$/, ""),

  // Extra browser origins allowed to call this service (comma-separated).
  corsOrigins: str("CORS_ORIGINS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // This service
  port: int("IMAGE_KG_PORT", 6061),
  dataDir: DATA_DIR,
  uploadsDir: path.join(DATA_DIR, "uploads"),
  jobsDir: path.join(DATA_DIR, "jobs"),

  // Pipeline knobs
  maxImageBytes: int("MAX_IMAGE_BYTES", 25 * 1024 * 1024),
  imageMaxDim: int("IMAGE_MAX_DIM", 1024),
  minConfidence: num("MIN_CONFIDENCE", 0.3),

  // Provenance (recorded on every node/edge)
  extractionVersion: str("EXTRACTION_VERSION", "v1"),
  promptVersion: str("PROMPT_VERSION", "p1"),

  // Ownership / auth
  defaultUserId: str("DEFAULT_USER_ID"),
  userEmail: str("USER_EMAIL"),
  userPassword: str("USER_PASSWORD"),
};

export type Config = typeof config;
