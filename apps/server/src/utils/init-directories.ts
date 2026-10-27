import fs from "fs";
import path from "path";

const REQUIRED_DIRECTORIES = [
  "kyc",
  "exports",
  "data",
  "data/invoices",
  "data/refund-notes",
  "logs",
  "public/images",
  "public/audio",
];

export function initializeDirectories(): void {
  for (const dir of REQUIRED_DIRECTORIES) {
    const fullPath = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`[init] Created directory: ${dir}`);
    }
  }
}
