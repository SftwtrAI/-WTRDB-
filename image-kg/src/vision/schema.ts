import { z } from "zod";

/**
 * Extraction output contract (EXTRACTION_SPEC §5). The JSON schema drives OpenAI
 * strict structured outputs; the zod schema validates the parsed result. Keep
 * the two in sync.
 *
 * NOTE: OpenAI strict mode cannot express an arbitrary-key map, so `properties`
 * is modeled as an array of {key,value} pairs and folded into a map downstream.
 * Category, name, and relationship type are FREE-FORM strings — the schema
 * constrains structure and required fields, never vocabulary.
 */
export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          local_ref: {
            type: "string",
            description: "temporary handle to wire relationships, e.g. o1",
          },
          category: {
            type: "string",
            description: "BROAD common-sense category (node label), model's choice",
          },
          name: {
            type: "string",
            description: "specific free-form descriptor (property), model's words",
          },
          properties: {
            type: "array",
            description: "visible attributes as key/value pairs (may be empty)",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                key: { type: "string" },
                value: { type: "string" },
              },
              required: ["key", "value"],
            },
          },
          confidence: { type: "number", description: "0..1" },
          bbox: {
            type: ["array", "null"],
            description: "[x1,y1,x2,y2] if available, else null",
            items: { type: "number" },
          },
        },
        required: ["local_ref", "category", "name", "properties", "confidence", "bbox"],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source_ref: { type: "string" },
          target_ref: { type: "string" },
          type: {
            type: "string",
            description: "short lowercase relationship label, model's words",
          },
          confidence: { type: "number", description: "0..1" },
        },
        required: ["source_ref", "target_ref", "type", "confidence"],
      },
    },
  },
  required: ["objects", "relationships"],
} as const;

export const extractionZod = z.object({
  objects: z.array(
    z.object({
      local_ref: z.string(),
      category: z.string(),
      name: z.string(),
      properties: z.array(z.object({ key: z.string(), value: z.string() })),
      confidence: z.number(),
      bbox: z.array(z.number()).nullable(),
    }),
  ),
  relationships: z.array(
    z.object({
      source_ref: z.string(),
      target_ref: z.string(),
      type: z.string(),
      confidence: z.number(),
    }),
  ),
});

export type RawExtraction = z.infer<typeof extractionZod>;
export type RawObject = RawExtraction["objects"][number];
export type RawRelationship = RawExtraction["relationships"][number];
