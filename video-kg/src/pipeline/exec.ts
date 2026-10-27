import { spawn } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a command, capturing stdout/stderr. Rejects on non-zero exit unless
 * allowNonZero is set. ffmpeg writes progress/info to stderr, so callers that
 * need to parse it should read result.stderr.
 */
export function run(
  cmd: string,
  args: string[],
  opts: { allowNonZero?: boolean; maxBuffer?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const maxBuffer = opts.maxBuffer ?? 64 * 1024 * 1024;
    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (stdout.length > maxBuffer) stdout = stdout.slice(-maxBuffer);
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > maxBuffer) stderr = stderr.slice(-maxBuffer);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result: ExecResult = { code: code ?? -1, stdout, stderr };
      if (code === 0 || opts.allowNonZero) resolve(result);
      else
        reject(
          new Error(
            `${cmd} exited ${code}: ${stderr.slice(-2000) || stdout.slice(-2000)}`,
          ),
        );
    });
  });
}
