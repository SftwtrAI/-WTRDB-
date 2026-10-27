import path from "node:path";
import { startIngest } from "./jobs/ingest.js";
import { getJob } from "./jobs/jobStore.js";
import { createLogger } from "./logger.js";

const log = createLogger("cli");

/**
 * Ingest a single local image and wait for completion.
 *   npm run ingest -- ./photo.jpg
 */
async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx src/cli.ts <image-file>");
    process.exit(1);
  }
  const sourcePath = path.resolve(file);
  const job = await startIngest({ sourcePath, title: path.basename(sourcePath) });
  log.info(`ingest started: job=${job.id} kb=${job.kbId}`);

  // Poll the job file until terminal.
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const j = await getJob(job.id);
    if (!j) continue;
    log.info(`  status=${j.status} progress=${j.progress}`);
    if (j.status === "completed") {
      log.info(`done: ${j.artifacts.entityCount} nodes, ${j.artifacts.relationshipCount} edges → kb ${j.kbId}`);
      process.exit(0);
    }
    if (j.status === "failed") {
      log.error(`failed: ${j.error}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
