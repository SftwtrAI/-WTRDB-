import { runPipeline } from "./runPipeline.js";
import { createLogger } from "../logger.js";

/**
 * Standalone runner / retry tool: `npm run worker -- <jobId>` re-runs (resumes)
 * a job's pipeline. Useful after a crash, since runPipeline skips completed
 * stages and per-window vision results.
 */
const log = createLogger("worker");

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error("usage: npm run worker -- <jobId>");
    process.exit(1);
  }
  try {
    await runPipeline(jobId);
    log.info("done");
    process.exit(0);
  } catch (err: any) {
    log.error(err.message);
    process.exit(1);
  }
}

main();
