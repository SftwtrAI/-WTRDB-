import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { startIngest } from "./jobs/ingest.js";
import { getJob } from "./jobs/jobStore.js";

/**
 * CLI ingest: `npm run ingest -- /path/to/video.mp4 ["Title"]`
 * Ingests a LOCAL file (no HTTP upload), runs the pipeline, polls to completion.
 */
async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: npm run ingest -- <video-file> ["title"]');
    process.exit(1);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`file not found: ${abs}`);
    process.exit(1);
  }
  const title = process.argv[3] || path.basename(abs);

  const job = await startIngest({ sourcePath: abs, title });
  console.log(`Job ${job.id} (kb ${job.kbId}) started for "${title}"`);

  // Poll
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await getJob(job.id);
    if (!j) continue;
    process.stdout.write(`\r[${j.status}] ${j.progress}%   `);
    if (j.status === "completed") {
      console.log(
        `\n✅ Done. ${j.artifacts.entityCount} nodes, ${j.artifacts.relationshipCount} edges.`,
      );
      console.log(`   React Flow: ${config.v2BaseUrl}/app/knowledge-graph/${j.kbId}`);
      console.log(`   3D:         ${config.v2BaseUrl}/app/knowledge-graph-3d/${j.kbId}`);
      process.exit(0);
    }
    if (j.status === "failed") {
      console.error(`\n❌ Failed: ${j.error}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
