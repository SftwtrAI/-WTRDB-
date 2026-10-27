import fs from "node:fs/promises";
import { falkorQuery, getGraphName } from "../src/falkor.js";
import { pool } from "../src/db.js";
import { resolveUserId } from "../src/auth/v2auth.js";
import { writeFragment } from "../src/graph/falkorWriter.js";
import type { GraphFragment } from "../src/graph/graphBuilder.js";

const BASE = process.env.IMAGE_KG_BASE || "http://localhost:6061";
const IMG = process.argv[2];

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

async function main() {
  if (!IMG) throw new Error("usage: tsx scripts/e2e.ts <image-file>");
  const bytes = await fs.readFile(IMG);

  // 1. Upload
  const up = await fetch(`${BASE}/images?name=e2e_test.jpg`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  const upJson: any = await up.json();
  console.log("upload:", upJson);
  check("upload accepted", up.ok && !!upJson.kbId, JSON.stringify(upJson));
  const { imageId, kbId } = upJson;

  // 2. Early state: extracting + empty FalkorDB
  await new Promise((r) => setTimeout(r, 1200));
  const userId = await resolveUserId();
  const g = getGraphName(userId, kbId);
  const early = await pool.query(
    "SELECT status FROM knowledge_graphs WHERE knowledge_base_id=$1",
    [kbId],
  );
  check("early status is extracting", early.rows[0]?.status === "extracting", early.rows[0]?.status);

  // 3. Poll to completion
  let status = "";
  for (let i = 0; i < 120; i++) {
    const r: any = await (await fetch(`${BASE}/images/${imageId}`)).json();
    status = r.status;
    if (status === "completed" || status === "failed") break;
    await new Promise((res) => setTimeout(res, 2000));
  }
  check("job completed", status === "completed", status);
  if (status !== "completed") {
    const r: any = await (await fetch(`${BASE}/images/${imageId}`)).json();
    console.log("job detail:", r);
    return finish();
  }

  // 4. Provenance completeness on every domain node
  const nodes = (
    await falkorQuery(
      g,
      `MATCH (n) WHERE NOT n:Image RETURN n.id AS id, n.name AS name, n.source_image_id AS sourceImageId, n.model_name AS model, n.model_version AS modelV, n.extraction_version AS extV, n.prompt_version AS promptV, n.confidence AS confidence`,
    )
  ).records;
  check("has domain nodes", nodes.length > 0, `${nodes.length} nodes`);
  const provComplete = nodes.every(
    (n) =>
      n.sourceImageId &&
      n.model &&
      n.modelV &&
      n.extV &&
      n.promptV &&
      n.confidence != null,
  );
  check("every node has full provenance", provComplete);

  // 5. Image anchor + DERIVED_FROM backbone (no orphans)
  const img = (await falkorQuery(g, `MATCH (i:Image) RETURN i.id AS id, i.hash AS hash`)).records;
  check("image node exists with hash", img.length === 1 && !!img[0].hash, JSON.stringify(img[0] ?? {}));
  check(
    "source_image_id matches Image id",
    nodes.every((n) => n.sourceImageId === img[0]?.id),
  );
  const orphans = (
    await falkorQuery(
      g,
      `MATCH (n) WHERE NOT n:Image AND NOT (n)-[:DERIVED_FROM]->(:Image) RETURN count(n) AS c`,
    )
  ).records[0]?.c;
  check("no orphan nodes (all DERIVED_FROM Image)", Number(orphans) === 0, `orphans=${orphans}`);

  // 6. Counts match metadata
  const nCount = Number(
    (await falkorQuery(g, `MATCH (n) WHERE NOT n:Image RETURN count(n) AS c`)).records[0]?.c,
  );
  const rCount = Number(
    (
      await falkorQuery(
        g,
        `MATCH ()-[r]->() WHERE type(r)<>'DERIVED_FROM' RETURN count(r) AS c`,
      )
    ).records[0]?.c,
  );
  const meta = await pool.query(
    "SELECT entity_count, relationship_count, entity_types FROM knowledge_graphs WHERE knowledge_base_id=$1",
    [kbId],
  );
  check(
    "node count == metadata entity_count",
    nCount === meta.rows[0]?.entity_count,
    `falkor=${nCount} meta=${meta.rows[0]?.entity_count}`,
  );
  check(
    "edge count == metadata relationship_count",
    rCount === meta.rows[0]?.relationship_count,
    `falkor=${rCount} meta=${meta.rows[0]?.relationship_count}`,
  );

  // 7. Open labels (categories) present
  const labels = (
    await falkorQuery(g, `MATCH (n) WHERE NOT n:Image RETURN DISTINCT labels(n)[0] AS l`)
  ).records.map((r) => r.l);
  check("uses open category labels", labels.length > 0, labels.join(","));

  // 8. Idempotency — re-write the same fragment; counts must not grow
  const fragPath = `${process.cwd()}/data/uploads/${imageId}/fragment.json`;
  const frag = JSON.parse(await fs.readFile(fragPath, "utf8")) as GraphFragment;
  await writeFragment(userId, kbId, frag);
  const nCount2 = Number(
    (await falkorQuery(g, `MATCH (n) WHERE NOT n:Image RETURN count(n) AS c`)).records[0]?.c,
  );
  const rCount2 = Number(
    (
      await falkorQuery(
        g,
        `MATCH ()-[r]->() WHERE type(r)<>'DERIVED_FROM' RETURN count(r) AS c`,
      )
    ).records[0]?.c,
  );
  check("re-ingest is idempotent (nodes)", nCount2 === nCount, `${nCount}->${nCount2}`);
  check("re-ingest is idempotent (edges)", rCount2 === rCount, `${rCount}->${rCount2}`);

  // 9. GraphRAG query
  const q: any = await (
    await fetch(`${BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kbId, question: "What objects are in this image?" }),
    })
  ).json();
  console.log("query answer:", q.answer);
  check("graphrag returned an answer", !!q.answer && typeof q.answer === "string");
  check("graphrag grounded (found)", q.found === true);

  // 10. Categories observability
  const cats: any = await (await fetch(`${BASE}/categories?kbId=${kbId}`)).json();
  check("categories endpoint works", Array.isArray(cats.categories) && cats.categories.length > 0, JSON.stringify(cats.categories));

  console.log(`\nkbId=${kbId}  imageId=${imageId}  graph=${g}`);
  finish();
}

function finish() {
  console.log(`\n${failures === 0 ? "ALL PASSED" : failures + " FAILED"}`);
  pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E error:", e);
  process.exit(1);
});
