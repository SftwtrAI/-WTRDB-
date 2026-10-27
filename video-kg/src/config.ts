import "dotenv/config";
import path from "node:path";

function int(name: string, def: number): number {
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
  reconcileModel: str("RECONCILE_MODEL", "gpt-5-mini"),
  queryModel: str("QUERY_MODEL", "gpt-5"),

  // Shared infra (must match version-2.0)
  databaseUrl: str("DATABASE_URL"),
  falkordbUrl: str("FALKORDB_URL", "redis://localhost:6380"),
  jwtSecret: str("JWT_SECRET"),

  // version-2.0
  v2BaseUrl: str("V2_BASE_URL", "http://localhost:5001").replace(/\/$/, ""),

  // CORS — extra browser origins allowed to call this service (comma-separated).
  // The v2 client origin is allowed by default; add others here if needed.
  corsOrigins: str("CORS_ORIGINS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // This service
  port: int("VIDEO_KG_PORT", 6060),
  dataDir: DATA_DIR,
  uploadsDir: path.join(DATA_DIR, "uploads"),
  tusDir: path.join(DATA_DIR, "tus"),
  jobsDir: path.join(DATA_DIR, "jobs"),

  // Pipeline knobs
  maxVideoBytes: int("MAX_VIDEO_BYTES", 2 * 1024 * 1024 * 1024),
  sampleFps: Number(str("SAMPLE_FPS", "1")) || 1,
  sceneThreshold: Number(str("SCENE_THRESHOLD", "0.4")) || 0.4,
  maxFramesPerWindow: int("MAX_FRAMES_PER_WINDOW", 6),
  frameMaxDim: int("FRAME_MAX_DIM", 768),
  maxAnalyzeSeconds: int("MAX_ANALYZE_SECONDS", 0),
  ffmpegForceCpu: str("FFMPEG_FORCE_CPU", "0") === "1",

  // Ownership / auth
  defaultUserId: str("DEFAULT_USER_ID"),
  userEmail: str("USER_EMAIL"),
  userPassword: str("USER_PASSWORD"),
};

export type Config = typeof config;
