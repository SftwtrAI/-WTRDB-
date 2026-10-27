/** Minimal structured logger. */
type Level = "info" | "warn" | "error" | "debug";

function log(level: Level, scope: string, msg: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] [${scope}] ${msg}`;
  if (extra !== undefined) {
    console[level === "debug" ? "log" : level](line, extra);
  } else {
    console[level === "debug" ? "log" : level](line);
  }
}

export function createLogger(scope: string) {
  return {
    info: (msg: string, extra?: unknown) => log("info", scope, msg, extra),
    warn: (msg: string, extra?: unknown) => log("warn", scope, msg, extra),
    error: (msg: string, extra?: unknown) => log("error", scope, msg, extra),
    debug: (msg: string, extra?: unknown) => log("debug", scope, msg, extra),
  };
}

export type Logger = ReturnType<typeof createLogger>;
