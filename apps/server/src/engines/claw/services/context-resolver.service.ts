"use strict";

/**
 * Context Resolver Service
 *
 * Resolves claw context manifests with extends-based inheritance.
 * Merges tools, MCP servers, skills, prompt fragments, and env vars
 * from the full context chain into a single resolved context.
 *
 * Used at claw provisioning time and at runtime for tool-bridge validation.
 */

import { db } from "../../../db";
import {
  clawContexts,
  clawContextAssignments,
  agentMcpDefinitions,
  agentMcpInstances,
  orgMcpServers,
} from "@wtrops/shared";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../../../utils/logger";
import { evaluate } from "../policy/opa-client";

const SOURCE = "ClawContextResolver";
const MAX_EXTENDS_DEPTH = 10; // Prevent circular inheritance

// ── Types ──

export interface ContextManifest {
  tools?: {
    mcpServers?: ContextToolRef[];
    workflows?: ContextToolRef[];
    skills?: ContextToolRef[];
    knowledgeGraphs?: ContextToolRef[];
  };
  prompt?: {
    system?: string;
    fragments?: ContextToolRef[];
  };
  env?: Record<string, string>;
  runtime?: {
    augmentations?: RuntimeAugmentation[];
  };
  policy?: {
    opaBundle?: string;
    requireApprovalForToolChanges?: boolean;
  };
}

export interface ContextToolRef {
  ref: string; // e.g., "org/compliance-agent", "wf/escalation-router", "skill/pii-scanner"
  required?: boolean;
  minSecurityScore?: string;
}

export interface RuntimeAugmentation {
  condition: string;
  addTools?: ContextToolRef[];
  addPromptFragments?: ContextToolRef[];
  overrideEnv?: Record<string, string>;
}

export interface ResolvedContext {
  contextIds: string[];
  mcpServerRefs: ContextToolRef[];
  workflowRefs: ContextToolRef[];
  skillRefs: ContextToolRef[];
  knowledgeGraphRefs: ContextToolRef[];
  promptSystem: string;
  promptFragments: ContextToolRef[];
  env: Record<string, string>;
  opaBundle: string | null;
  dataClassification: string;
  // Resolved agent-MCP endpoints for tool bridge
  agentMcpEndpoints: AgentMcpEndpoint[];
  // All tool names available in this context (for tool bridge validation)
  allowedToolNames: string[];
}

export interface AgentMcpEndpoint {
  definitionId: string;
  name: string;
  topology: string;
  endpoint: string | null;
  toolNames: string[];
  healthStatus: string;
}

// ── Context Resolution ──

/**
 * Resolve all contexts assigned to a claw into a single merged context.
 * Follows extends chains. Validates against OPA policy.
 */
export async function resolveClawContexts(
  clawId: string,
  organizationId: string,
): Promise<ResolvedContext> {
  // 1. Get all context assignments for this claw
  const assignments = await db
    .select()
    .from(clawContextAssignments)
    .where(eq(clawContextAssignments.clawId, clawId));

  if (assignments.length === 0) {
    return emptyResolvedContext();
  }

  const contextIds = assignments.map((a) => a.contextId);

  // 2. Load all assigned contexts
  const contexts = await db
    .select()
    .from(clawContexts)
    .where(
      and(
        inArray(clawContexts.id, contextIds),
        eq(clawContexts.organizationId, organizationId),
      ),
    );

  // 3. Resolve extends chains for each context
  const allResolvedManifests: ContextManifest[] = [];
  const allContextIds: string[] = [];

  for (const ctx of contexts) {
    const chain = await resolveExtendsChain(ctx.id, organizationId);
    allContextIds.push(...chain.map((c) => c.id));

    // Merge chain from base to leaf (leaf wins on conflicts)
    for (const chainCtx of chain) {
      const manifest = chainCtx.manifest as ContextManifest;
      if (manifest) {
        allResolvedManifests.push(manifest);
      }
    }
  }

  // 4. Merge all manifests
  const merged = mergeManifests(allResolvedManifests);

  // 5. Apply runtime overrides from assignments
  for (const assignment of assignments) {
    if (assignment.runtimeOverrides) {
      const overrides = assignment.runtimeOverrides as ContextManifest;
      if (overrides.env) {
        Object.assign(merged.env, overrides.env);
      }
    }
  }

  // 6. Resolve agent-MCP endpoints for MCP server refs that point to agent-MCPs
  const agentMcpEndpoints = await resolveAgentMcpEndpoints(
    merged.mcpServerRefs,
    organizationId,
  );

  // 7. Collect all allowed tool names
  const allowedToolNames = collectAllowedToolNames(
    merged,
    agentMcpEndpoints,
  );

  // 8. Determine highest data classification from all contexts
  const classifications = contexts.map(
    (c) => c.dataClassification || "internal",
  );
  const dataClassification = highestClassification(classifications);

  return {
    contextIds: [...new Set(allContextIds)],
    mcpServerRefs: merged.mcpServerRefs,
    workflowRefs: merged.workflowRefs,
    skillRefs: merged.skillRefs,
    knowledgeGraphRefs: merged.knowledgeGraphRefs,
    promptSystem: merged.promptSystem,
    promptFragments: merged.promptFragments,
    env: merged.env,
    opaBundle: merged.opaBundle,
    dataClassification,
    agentMcpEndpoints,
    allowedToolNames,
  };
}

/**
 * Resolve an extends chain for a given context.
 * Returns array ordered from base (first) to leaf (last).
 */
async function resolveExtendsChain(
  contextId: string,
  organizationId: string,
  depth = 0,
): Promise<Array<typeof clawContexts.$inferSelect>> {
  if (depth >= MAX_EXTENDS_DEPTH) {
    logger.warn(
      `Context extends chain exceeded max depth ${MAX_EXTENDS_DEPTH} for ${contextId}`,
      undefined,
      SOURCE,
    );
    return [];
  }

  const [ctx] = await db
    .select()
    .from(clawContexts)
    .where(
      and(
        eq(clawContexts.id, contextId),
        eq(clawContexts.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!ctx) {
    logger.warn(`Context ${contextId} not found in org ${organizationId}`, undefined, SOURCE);
    return [];
  }

  if (ctx.extendsContextId) {
    const parentChain = await resolveExtendsChain(
      ctx.extendsContextId,
      organizationId,
      depth + 1,
    );
    return [...parentChain, ctx];
  }

  return [ctx];
}

/**
 * Merge multiple manifests. Later manifests override earlier ones.
 * Tool refs are additive (union). Env vars are merged (later wins).
 */
function mergeManifests(manifests: ContextManifest[]): {
  mcpServerRefs: ContextToolRef[];
  workflowRefs: ContextToolRef[];
  skillRefs: ContextToolRef[];
  knowledgeGraphRefs: ContextToolRef[];
  promptSystem: string;
  promptFragments: ContextToolRef[];
  env: Record<string, string>;
  opaBundle: string | null;
} {
  const mcpServerMap = new Map<string, ContextToolRef>();
  const workflowMap = new Map<string, ContextToolRef>();
  const skillMap = new Map<string, ContextToolRef>();
  const knowledgeGraphMap = new Map<string, ContextToolRef>();
  const promptFragmentMap = new Map<string, ContextToolRef>();
  let promptSystem = "";
  const env: Record<string, string> = {};
  let opaBundle: string | null = null;

  for (const manifest of manifests) {
    // Tools are additive (keyed by ref to deduplicate)
    if (manifest.tools?.mcpServers) {
      for (const ref of manifest.tools.mcpServers) {
        mcpServerMap.set(ref.ref, ref);
      }
    }
    if (manifest.tools?.workflows) {
      for (const ref of manifest.tools.workflows) {
        workflowMap.set(ref.ref, ref);
      }
    }
    if (manifest.tools?.skills) {
      for (const ref of manifest.tools.skills) {
        skillMap.set(ref.ref, ref);
      }
    }
    if (manifest.tools?.knowledgeGraphs) {
      for (const ref of manifest.tools.knowledgeGraphs) {
        knowledgeGraphMap.set(ref.ref, ref);
      }
    }

    // Prompt: system replaces, fragments are additive
    if (manifest.prompt?.system) {
      promptSystem = manifest.prompt.system;
    }
    if (manifest.prompt?.fragments) {
      for (const frag of manifest.prompt.fragments) {
        promptFragmentMap.set(frag.ref, frag);
      }
    }

    // Env: later wins
    if (manifest.env) {
      Object.assign(env, manifest.env);
    }

    // Policy: later wins
    if (manifest.policy?.opaBundle) {
      opaBundle = manifest.policy.opaBundle;
    }
  }

  return {
    mcpServerRefs: Array.from(mcpServerMap.values()),
    workflowRefs: Array.from(workflowMap.values()),
    skillRefs: Array.from(skillMap.values()),
    knowledgeGraphRefs: Array.from(knowledgeGraphMap.values()),
    promptSystem,
    promptFragments: Array.from(promptFragmentMap.values()),
    env,
    opaBundle,
  };
}

/**
 * Resolve agent-MCP endpoints from MCP server refs.
 * Refs starting with "org/" are checked against agentMcpDefinitions.
 */
async function resolveAgentMcpEndpoints(
  mcpServerRefs: ContextToolRef[],
  organizationId: string,
): Promise<AgentMcpEndpoint[]> {
  const endpoints: AgentMcpEndpoint[] = [];

  // Extract agent-MCP refs (format: "org/<name>")
  const agentRefs = mcpServerRefs.filter((r) => r.ref.startsWith("org/"));
  if (agentRefs.length === 0) return endpoints;

  const agentNames = agentRefs.map((r) => r.ref.replace("org/", ""));

  // Look up agent-MCP definitions by name in this org
  const definitions = await db
    .select()
    .from(agentMcpDefinitions)
    .where(
      and(
        eq(agentMcpDefinitions.organizationId, organizationId),
        eq(agentMcpDefinitions.isPublished, true),
      ),
    );

  const matchedDefs = definitions.filter((d) => agentNames.includes(d.name));

  for (const def of matchedDefs) {
    // For shared topology, find a healthy instance
    if (def.topology === "shared") {
      const [instance] = await db
        .select()
        .from(agentMcpInstances)
        .where(
          and(
            eq(agentMcpInstances.definitionId, def.id),
            eq(agentMcpInstances.status, "healthy"),
          ),
        )
        .limit(1);

      endpoints.push({
        definitionId: def.id,
        name: def.name,
        topology: def.topology,
        endpoint: instance?.endpoint ?? null,
        toolNames: (def.toolNames as string[]) || [],
        healthStatus: instance?.status ?? "no_instance",
      });
    } else {
      // Sidecar: endpoint resolved at provisioning time, not here
      endpoints.push({
        definitionId: def.id,
        name: def.name,
        topology: def.topology,
        endpoint: null, // Set by claw-manager when sidecar starts
        toolNames: (def.toolNames as string[]) || [],
        healthStatus: def.healthStatus || "unknown",
      });
    }
  }

  // Check for required refs that couldn't be resolved
  for (const ref of agentRefs) {
    const name = ref.ref.replace("org/", "");
    const found = matchedDefs.find((d) => d.name === name);
    if (!found && ref.required) {
      logger.error(
        `Required agent-MCP "${name}" not found or not published in org ${organizationId}`,
        undefined,
        SOURCE,
      );
    }
  }

  return endpoints;
}

/**
 * Collect all tool names available in the resolved context.
 * Used by the tool bridge to validate invocations.
 */
function collectAllowedToolNames(
  merged: ReturnType<typeof mergeManifests>,
  agentMcpEndpoints: AgentMcpEndpoint[],
): string[] {
  const names: string[] = [];

  // MCP server tools (org/ refs resolved from agent-MCP definitions)
  for (const ep of agentMcpEndpoints) {
    for (const tool of ep.toolNames) {
      names.push(`agent_mcp:${ep.name}/${tool}`);
    }
  }

  // Standard MCP server refs
  for (const ref of merged.mcpServerRefs) {
    if (!ref.ref.startsWith("org/")) {
      names.push(`mcp:${ref.ref}`);
    }
  }

  // Workflow refs
  for (const ref of merged.workflowRefs) {
    names.push(`workflow:${ref.ref}`);
  }

  // Skill refs
  for (const ref of merged.skillRefs) {
    names.push(`skill:${ref.ref}`);
  }

  // Knowledge graph refs — resolve to actual FalkorDB graph names
  // kg:kb/{id} → leaf graph, kg:federation/{id} → federation graph
  for (const ref of merged.knowledgeGraphRefs) {
    names.push(`kg:${ref.ref}`);
  }

  return names;
}

/**
 * Validate a context assignment against OPA policy.
 */
export async function validateContextAssignment(
  clawId: string,
  contextId: string,
  organizationId: string,
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const result = await evaluate({
    org_id: organizationId,
    claw_id: clawId,
    action: "context_assign",
    resource: contextId,
    context: { user_id: userId },
  });
  return { allowed: result.allow, reason: result.reason };
}

/**
 * Get a preview of the resolved context for a claw (without persisting).
 */
export async function previewResolvedContext(
  clawId: string,
  organizationId: string,
): Promise<ResolvedContext> {
  return resolveClawContexts(clawId, organizationId);
}

// ── Helpers ──

function emptyResolvedContext(): ResolvedContext {
  return {
    contextIds: [],
    mcpServerRefs: [],
    workflowRefs: [],
    skillRefs: [],
    knowledgeGraphRefs: [],
    promptSystem: "",
    promptFragments: [],
    env: {},
    opaBundle: null,
    dataClassification: "internal",
    agentMcpEndpoints: [],
    allowedToolNames: [],
  };
}

const CLASSIFICATION_RANK: Record<string, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

function highestClassification(classifications: string[]): string {
  let highest = "internal";
  let highestRank = CLASSIFICATION_RANK[highest] ?? 1;

  for (const c of classifications) {
    const rank = CLASSIFICATION_RANK[c] ?? 1;
    if (rank > highestRank) {
      highest = c;
      highestRank = rank;
    }
  }

  return highest;
}

// ── Knowledge Graph Ref Resolution ──

/**
 * Parsed knowledge graph reference.
 *
 * Ref format:
 *   "kg:kb/{id}"          → leaf graph → FalkorDB name: kg_{userId}_{kbId}
 *   "kg:federation/{id}"  → federation graph → FalkorDB name: kgf_{userId}_{federationId}
 *   "{plain_id}"          → legacy leaf graph (backward compat)
 */
export interface ResolvedKnowledgeGraphRef {
  /** Original ref string from manifest */
  ref: string;
  /** "leaf" | "federation" */
  type: "leaf" | "federation";
  /** The KB ID or federation ID extracted from the ref */
  id: string;
  /** The FalkorDB named graph to query */
  graphName: string;
  /** Data classification for this graph (federation = max of constituents) */
  classification: string;
}

/**
 * Resolve knowledge graph refs from a context manifest into concrete
 * FalkorDB graph names. Handles both leaf (kg:kb/{id}) and federation
 * (kg:federation/{id}) references.
 *
 * Federation classification = max(constituent leaf classifications),
 * enforcing the sheaf-theoretic security lattice (Math Core K.15-17).
 *
 * @param refs - Knowledge graph refs from the resolved context
 * @param userId - The owning user's ID (used in graph naming)
 * @param organizationId - Organization for classification lookup
 */
export async function resolveKnowledgeGraphRefs(
  refs: ContextToolRef[],
  userId: string,
  organizationId: string,
): Promise<ResolvedKnowledgeGraphRef[]> {
  const resolved: ResolvedKnowledgeGraphRef[] = [];

  for (const toolRef of refs) {
    const ref = toolRef.ref;

    if (ref.startsWith("kb/") || ref.startsWith("kg:kb/")) {
      // Leaf graph: kg:kb/{kbId} or just kb/{kbId}
      const kbId = ref.replace(/^(kg:)?kb\//, "");
      const graphName = `kg_${userId}_${kbId}`;

      // Look up classification from knowledge_graphs or default to "internal"
      let classification = "internal";
      try {
        const result = await db.execute(
          /* sql */ `SELECT data_classification FROM knowledge_graphs WHERE knowledge_base_id = '${kbId}' LIMIT 1`,
        );
        const row = (result as any)?.rows?.[0];
        if (row?.data_classification) {
          classification = row.data_classification;
        }
      } catch {
        // Table may not have data_classification column yet
      }

      resolved.push({
        ref,
        type: "leaf",
        id: kbId,
        graphName,
        classification,
      });
    } else if (
      ref.startsWith("federation/") ||
      ref.startsWith("kg:federation/")
    ) {
      // Federation graph: kg:federation/{fedId} or federation/{fedId}
      const fedId = ref.replace(/^(kg:)?federation\//, "");
      const graphName = `kgf_${userId}_${fedId}`;

      // Federation classification = max of constituent classifications
      // Look up constituent classifications from federation_registry
      let classification = "internal";
      try {
        const result = await db.execute(
          /* sql */ `
          SELECT kg.data_classification
          FROM federation_constituents fc
          JOIN knowledge_graphs kg ON kg.knowledge_base_id = fc.knowledge_base_id
          WHERE fc.federation_id = '${fedId}'
        `,
        );
        const rows = (result as any)?.rows || [];
        const classifications = rows
          .map((r: any) => r.data_classification)
          .filter(Boolean);
        if (classifications.length > 0) {
          classification = highestClassification(classifications);
        }
      } catch {
        // Federation tables may not exist yet — use default
        logger.debug(
          `Could not resolve federation classification for ${fedId}, using default`,
          undefined,
          SOURCE,
        );
      }

      resolved.push({
        ref,
        type: "federation",
        id: fedId,
        graphName,
        classification,
      });
    } else {
      // Legacy plain ID — treat as leaf KB
      const kbId = ref;
      const graphName = `kg_${userId}_${kbId}`;
      resolved.push({
        ref,
        type: "leaf",
        id: kbId,
        graphName,
        classification: "internal",
      });
    }
  }

  return resolved;
}
