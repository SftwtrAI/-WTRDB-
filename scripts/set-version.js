#!/usr/bin/env node
/**
 * Set Version Script
 * Usage: node scripts/set-version.js 1.2.0
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = path.join(__dirname, "..", "VERSION");

const version = process.argv[2];

if (!version) {
  console.error("❌ Usage: node scripts/set-version.js <version>");
  console.error("   Example: node scripts/set-version.js 1.2.0");
  process.exit(1);
}

// Validate semver format
const semverRegex = /^\d+\.\d+\.\d+$/;
if (!semverRegex.test(version)) {
  console.error(
    "❌ Invalid version format. Use semantic versioning (e.g., 1.2.0)",
  );
  process.exit(1);
}

try {
  fs.writeFileSync(VERSION_FILE, version.trim());
  console.log(`✅ Version set to ${version}`);
  console.log(`   File: ${VERSION_FILE}`);
} catch (error) {
  console.error("❌ Failed to write version:", error.message);
  process.exit(1);
}
