import "dotenv/config";
import { processKnowledgeBase } from "../services/knowledge-graph-extraction";

const KB_ID = process.argv[2];
const USER_ID = process.argv[3];

if (!KB_ID || !USER_ID) {
  console.error("Usage: tsx resume-kb-extraction.ts <kbId> <userId>");
  process.exit(1);
}

(async () => {
  console.log(`[resume] starting extraction for kb=${KB_ID} user=${USER_ID}`);
  await processKnowledgeBase(KB_ID, USER_ID);
  console.log("[resume] done");
  process.exit(0);
})().catch((err) => {
  console.error("[resume] failed:", err);
  process.exit(1);
});
