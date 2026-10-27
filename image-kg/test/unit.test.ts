import { describe, it, expect } from "vitest";
import { parseExtraction, stripToJson, ParseError } from "../src/parser.js";
import { validateExtraction } from "../src/validator.js";
import { buildFragment, fragmentToDelta } from "../src/graph/graphBuilder.js";
import { generateFragmentWrite } from "../src/graph/cypherGen.js";
import type { ValidatedExtraction } from "../src/extract.js";
import type { PreparedImage } from "../src/preprocess.js";
import type { Provenance } from "../src/graph/graphBuilder.js";

const PREPARED: PreparedImage = {
  sourceImageId: "img_deadbeef",
  hash: "deadbeef",
  preparedPath: "/tmp/x.jpg",
  width: 100,
  height: 80,
  sizeBytes: 1234,
  mime: "image/jpeg",
};
const PROV: Provenance = {
  model_name: "gpt-5",
  model_version: "gpt-5",
  extraction_version: "v1",
  prompt_version: "p1",
  created_at: "2026-07-09T00:00:00.000Z",
};

const EXTRACTION: ValidatedExtraction = {
  objects: [
    { local_ref: "o1", category: "Animal", name: "golden retriever", properties: { color: "golden" }, confidence: 0.95, bbox: [1, 2, 3, 4] },
    { local_ref: "o2", category: "Furniture", name: "wooden bench", properties: {}, confidence: 0.9, bbox: null },
  ],
  relationships: [
    { source_ref: "o1", target_ref: "o2", type: "sitting on", confidence: 0.88 },
  ],
};

describe("parser", () => {
  it("strips code fences", () => {
    expect(stripToJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("parses a valid extraction", () => {
    const raw = parseExtraction(
      JSON.stringify({ objects: [{ local_ref: "o1", category: "Animal", name: "dog", properties: [], confidence: 0.9, bbox: null }], relationships: [] }),
    );
    expect(raw.objects[0].name).toBe("dog");
  });
  it("throws on garbage", () => {
    expect(() => parseExtraction("not json at all")).toThrow(ParseError);
  });
});

describe("validator", () => {
  const raw = (o: any) => ({ objects: o.objects, relationships: o.relationships }) as any;
  it("passes a clean fragment", () => {
    expect(
      validateExtraction(
        raw({
          objects: [{ local_ref: "o1", category: "Animal", name: "dog", properties: [], confidence: 0.9, bbox: null }],
          relationships: [],
        }),
      ),
    ).toEqual([]);
  });
  it("flags a dangling relationship ref", () => {
    const errs = validateExtraction(
      raw({
        objects: [{ local_ref: "o1", category: "A", name: "n", properties: [], confidence: 0.5, bbox: null }],
        relationships: [{ source_ref: "o1", target_ref: "o9", type: "x", confidence: 0.5 }],
      }),
    );
    expect(errs.join()).toMatch(/target_ref 'o9' does not match/);
  });
  it("flags out-of-range confidence and missing category", () => {
    const errs = validateExtraction(
      raw({
        objects: [{ local_ref: "o1", category: "  ", name: "n", properties: [], confidence: 1.5, bbox: null }],
        relationships: [],
      }),
    );
    expect(errs.join()).toMatch(/missing category/);
    expect(errs.join()).toMatch(/not in \[0,1\]/);
  });
});

describe("graphBuilder", () => {
  it("derives deterministic content-hash ids", () => {
    const a = buildFragment(EXTRACTION, PREPARED, PROV);
    const b = buildFragment(EXTRACTION, PREPARED, PROV);
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    expect(a.nodes[0].id).toMatch(/^[a-z0-9_]+_[0-9a-f]{12}$/);
  });
  it("delta carries Image anchor + DERIVED_FROM per node", () => {
    const frag = buildFragment(EXTRACTION, PREPARED, PROV);
    const delta = fragmentToDelta(frag);
    expect(delta.nodes.find((n) => n.label === "Image")).toBeTruthy();
    const derived = delta.edges.filter((e) => e.type === "DERIVED_FROM");
    expect(derived.length).toBe(frag.nodes.length);
  });
});

describe("cypherGen", () => {
  it("is deterministic (byte-identical query + params)", () => {
    const frag = buildFragment(EXTRACTION, PREPARED, PROV);
    const a = generateFragmentWrite(frag, "kb1");
    const b = generateFragmentWrite(frag, "kb1");
    expect(a.query).toBe(b.query);
    expect(JSON.stringify(a.params)).toBe(JSON.stringify(b.params));
  });
  it("uses MERGE on id, DERIVED_FROM, and a single RETURN", () => {
    const frag = buildFragment(EXTRACTION, PREPARED, PROV);
    const { query } = generateFragmentWrite(frag, "kb1");
    expect(query).toMatch(/MERGE \(img:`Image` \{id:\$imageId\}\)/);
    expect(query).toMatch(/MERGE \(a\)-\[:`DERIVED_FROM`\]->\(img\)/);
    expect(query.match(/RETURN/g)?.length).toBe(1);
  });
  it("sanitizes a malicious category so it cannot break out of the label", () => {
    const evil: ValidatedExtraction = {
      objects: [{ local_ref: "o1", category: "Animal`) DETACH DELETE n //", name: "x", properties: {}, confidence: 0.9, bbox: null }],
      relationships: [],
    };
    const frag = buildFragment(evil, PREPARED, PROV);
    const { query } = generateFragmentWrite(frag, "kb1");
    expect(query).not.toContain("DETACH DELETE");
    // label is whitelisted to identifier chars only
    expect(frag.nodes[0].label).toMatch(/^[A-Za-z0-9_]+$/);
  });
  it("passes model values as params, never inlined into query text", () => {
    const frag = buildFragment(EXTRACTION, PREPARED, PROV);
    const { query, params } = generateFragmentWrite(frag, "kb1");
    // the free-form name lives in params, not in the query template
    expect(query).not.toContain("golden retriever");
    expect(JSON.stringify(params)).toContain("golden retriever");
  });
});
