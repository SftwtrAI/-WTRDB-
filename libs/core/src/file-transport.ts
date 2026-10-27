"use strict";

import fs from "node:fs";
import path from "node:path";

/**
 * Daily-rotating file transport for logging.
 * Writes log lines to `logs/{appName}-YYYY-MM-DD.log`.
 * Rotates to a new file when the date changes.
 * Zero external dependencies — uses Node.js fs only.
 */
export class DailyFileTransport {
  private appName: string;
  private logsDir: string;
  private currentDate: string = "";
  private stream: fs.WriteStream | null = null;

  constructor(appName: string, logsDir?: string) {
    this.appName = appName;
    this.logsDir = logsDir || path.resolve(process.cwd(), "logs");
    this.ensureLogsDir();
  }

  private ensureLogsDir(): void {
    try {
      fs.mkdirSync(this.logsDir, { recursive: true });
    } catch {
      // Directory may already exist or be unwritable — fail silently,
      // file writes will error and we'll catch those too.
    }
  }

  private getDateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  private getFilePath(dateStr: string): string {
    return path.join(this.logsDir, `${this.appName}-${dateStr}.log`);
  }

  private ensureStream(): fs.WriteStream | null {
    const today = this.getDateString();

    if (today !== this.currentDate) {
      // Date rolled over — close old stream and open new file
      if (this.stream) {
        try {
          this.stream.end();
        } catch {
          /* ignore */
        }
      }
      this.currentDate = today;
      try {
        this.stream = fs.createWriteStream(this.getFilePath(today), {
          flags: "a",
        });
        this.stream.on("error", () => {
          // Silently drop file writes if the stream errors (e.g., disk full)
          this.stream = null;
        });
      } catch {
        this.stream = null;
      }
    }

    return this.stream;
  }

  /**
   * Write a line to the current day's log file.
   * Each call appends the line followed by a newline.
   */
  write(line: string): void {
    const stream = this.ensureStream();
    if (stream) {
      stream.write(line + "\n");
    }
  }

  /**
   * Close the current write stream (for graceful shutdown).
   */
  close(): void {
    if (this.stream) {
      try {
        this.stream.end();
      } catch {
        /* ignore */
      }
      this.stream = null;
    }
  }
}
