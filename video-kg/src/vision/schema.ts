import { z } from "zod";

/**
 * Per-window analysis contract. The JSON schema is used for OpenAI strict
 * structured outputs; the zod schema validates the parsed result at runtime.
 * Keep the two in sync.
 */

export const windowAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    persons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          localId: { type: "string", description: "window-local id e.g. p1" },
          appearance: {
            type: "string",
            description: "distinguishing visual description (clothing, build)",
          },
          role: { type: "string", description: "role if evident, else ''" },
        },
        required: ["localId", "appearance", "role"],
      },
    },
    objects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          localId: { type: "string" },
          type: { type: "string", description: "object category e.g. backpack" },
        },
        required: ["localId", "type"],
      },
    },
    locations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "scene/setting name" },
        },
        required: ["name"],
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", description: "what happens, e.g. 'picks up backpack'" },
          actorLocalId: {
            type: ["string", "null"],
            description: "person localId performing the action, or null",
          },
          objectLocalIds: { type: "array", items: { type: "string" } },
          locationName: { type: ["string", "null"] },
          confidence: { type: "number" },
          timestampStartSec: { type: "number" },
          timestampEndSec: { type: "number" },
          evidenceFrameIds: { type: "array", items: { type: "string" } },
        },
        required: [
          "action",
          "actorLocalId",
          "objectLocalIds",
          "locationName",
          "confidence",
          "timestampStartSec",
          "timestampEndSec",
          "evidenceFrameIds",
        ],
      },
    },
    interactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          personLocalId: { type: "string" },
          objectLocalId: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["personLocalId", "objectLocalId", "confidence"],
      },
    },
  },
  required: ["persons", "objects", "locations", "events", "interactions"],
} as const;

export const windowAnalysisZod = z.object({
  persons: z.array(
    z.object({
      localId: z.string(),
      appearance: z.string(),
      role: z.string(),
    }),
  ),
  objects: z.array(z.object({ localId: z.string(), type: z.string() })),
  locations: z.array(z.object({ name: z.string() })),
  events: z.array(
    z.object({
      action: z.string(),
      actorLocalId: z.string().nullable(),
      objectLocalIds: z.array(z.string()),
      locationName: z.string().nullable(),
      confidence: z.number(),
      timestampStartSec: z.number(),
      timestampEndSec: z.number(),
      evidenceFrameIds: z.array(z.string()),
    }),
  ),
  interactions: z.array(
    z.object({
      personLocalId: z.string(),
      objectLocalId: z.string(),
      confidence: z.number(),
    }),
  ),
});

export type WindowAnalysisRaw = z.infer<typeof windowAnalysisZod>;

// ── Entity reconciliation contract (cross-window track_id mapping) ──

export const reconcileJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mappings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          localId: { type: "string" },
          matchedTrackId: {
            type: ["integer", "null"],
            description: "existing global trackId this person matches, or null if new",
          },
        },
        required: ["localId", "matchedTrackId"],
      },
    },
  },
  required: ["mappings"],
} as const;

export const reconcileZod = z.object({
  mappings: z.array(
    z.object({
      localId: z.string(),
      matchedTrackId: z.number().int().nullable(),
    }),
  ),
});

export type ReconcileResult = z.infer<typeof reconcileZod>;
