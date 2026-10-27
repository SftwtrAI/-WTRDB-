import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MergeMode = "union" | "intersection" | "differential" | "conflict_resolution";

export type FederationStatus = "pending" | "materializing" | "materialized" | "failed" | "stale";

export interface FederationConstituent {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  entityCount: number;
  relationshipCount: number;
  freshness: number;
  lastUpdated: string;
}

export interface QualityMetrics {
  /** Sheaf cohomology: dim(H^0) / |V| — fraction of globally consistent entity configs */
  consistencyScore: number;
  /** dim(H^1) — number of independent conflict modes */
  conflictDimension: number;
  /** Persistent homology quality 0-1 */
  topologicalQuality: number;
  /** Weighted freshness 0-1 */
  freshness: number;
  /** w_c * consistency + w_t * topo + w_f * freshness */
  compositeScore: number;
}

export interface AlignmentEntry {
  id: string;
  sourceEntity: string;
  sourceType: string;
  sourceGraph: string;
  targetEntity: string;
  targetType: string;
  targetGraph: string;
  confidence: number;
  tier: 1 | 2 | 3;
  decision: "SAME" | "DIFFERENT" | "UNSURE";
  overridden: boolean;
}

export interface ConflictEntry {
  id: string;
  type: "entity_alignment" | "edge_conflict" | "property_conflict" | "temporal_conflict";
  severity: "high" | "medium" | "low";
  description: string;
  leftSource: string;
  leftEntity: string;
  leftValue: string;
  rightSource: string;
  rightEntity: string;
  rightValue: string;
  suggestion: string;
  status: "unresolved" | "resolved" | "deferred";
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: "accept_left" | "accept_right" | "custom";
}

export interface MergeOperation {
  id: string;
  mode: MergeMode;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  entitiesMerged: number;
  conflictsFound: number;
  conflictsResolved: number;
  triggeredBy: string;
}

export interface Federation {
  id: string;
  name: string;
  description?: string;
  mergeMode: MergeMode;
  status: FederationStatus;
  constituents: FederationConstituent[];
  quality: QualityMetrics;
  alignmentWeights: {
    name: number;
    embedding: number;
    type: number;
    structural: number;
    property: number;
  };
  entityCount: number;
  relationshipCount: number;
  materializedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Placeholder data — used until backend APIs are wired up
// ---------------------------------------------------------------------------

const PLACEHOLDER_FEDERATIONS: Federation[] = [
  {
    id: "fed_001",
    name: "IT Infrastructure Knowledge",
    description: "Merged view of IT engineering and Google Admin knowledge bases",
    mergeMode: "conflict_resolution",
    status: "materialized",
    constituents: [
      {
        knowledgeBaseId: "kb_001",
        knowledgeBaseName: "IT Engineer Docs",
        entityCount: 142,
        relationshipCount: 267,
        freshness: 0.87,
        lastUpdated: "2026-03-28T14:22:00Z",
      },
      {
        knowledgeBaseId: "kb_002",
        knowledgeBaseName: "Google Admin Export",
        entityCount: 89,
        relationshipCount: 156,
        freshness: 0.93,
        lastUpdated: "2026-04-01T09:15:00Z",
      },
    ],
    quality: {
      consistencyScore: 0.84,
      conflictDimension: 3,
      topologicalQuality: 0.72,
      freshness: 0.89,
      compositeScore: 0.82,
    },
    alignmentWeights: { name: 0.25, embedding: 0.30, type: 0.10, structural: 0.20, property: 0.15 },
    entityCount: 198,
    relationshipCount: 389,
    materializedAt: "2026-04-01T10:30:00Z",
    createdAt: "2026-03-15T08:00:00Z",
    updatedAt: "2026-04-01T10:30:00Z",
  },
  {
    id: "fed_002",
    name: "Security Policies",
    description: "Unified security and compliance knowledge",
    mergeMode: "union",
    status: "stale",
    constituents: [
      {
        knowledgeBaseId: "kb_003",
        knowledgeBaseName: "Security Handbook",
        entityCount: 56,
        relationshipCount: 98,
        freshness: 0.65,
        lastUpdated: "2026-02-20T11:00:00Z",
      },
      {
        knowledgeBaseId: "kb_004",
        knowledgeBaseName: "Compliance Docs",
        entityCount: 34,
        relationshipCount: 61,
        freshness: 0.91,
        lastUpdated: "2026-03-30T16:45:00Z",
      },
      {
        knowledgeBaseId: "kb_005",
        knowledgeBaseName: "Incident Reports",
        entityCount: 78,
        relationshipCount: 134,
        freshness: 0.42,
        lastUpdated: "2026-01-15T08:30:00Z",
      },
    ],
    quality: {
      consistencyScore: 0.67,
      conflictDimension: 7,
      topologicalQuality: 0.58,
      freshness: 0.62,
      compositeScore: 0.63,
    },
    alignmentWeights: { name: 0.25, embedding: 0.30, type: 0.10, structural: 0.20, property: 0.15 },
    entityCount: 145,
    relationshipCount: 271,
    materializedAt: "2026-03-01T12:00:00Z",
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-03-30T16:45:00Z",
  },
  {
    id: "fed_003",
    name: "Customer Onboarding",
    mergeMode: "intersection",
    status: "pending",
    constituents: [
      {
        knowledgeBaseId: "kb_006",
        knowledgeBaseName: "CRM Export",
        entityCount: 210,
        relationshipCount: 340,
        freshness: 0.95,
        lastUpdated: "2026-04-02T08:00:00Z",
      },
      {
        knowledgeBaseId: "kb_007",
        knowledgeBaseName: "Onboarding Playbook",
        entityCount: 45,
        relationshipCount: 72,
        freshness: 0.78,
        lastUpdated: "2026-03-25T14:00:00Z",
      },
    ],
    quality: {
      consistencyScore: 0,
      conflictDimension: 0,
      topologicalQuality: 0,
      freshness: 0.88,
      compositeScore: 0,
    },
    alignmentWeights: { name: 0.25, embedding: 0.30, type: 0.10, structural: 0.20, property: 0.15 },
    entityCount: 0,
    relationshipCount: 0,
    createdAt: "2026-04-02T09:00:00Z",
    updatedAt: "2026-04-02T09:00:00Z",
  },
];

const PLACEHOLDER_ALIGNMENTS: AlignmentEntry[] = [
  {
    id: "align_001",
    sourceEntity: "Alice Chen",
    sourceType: "Person",
    sourceGraph: "IT Engineer Docs",
    targetEntity: "Alice C.",
    targetType: "Person",
    targetGraph: "Google Admin Export",
    confidence: 0.97,
    tier: 1,
    decision: "SAME",
    overridden: false,
  },
  {
    id: "align_002",
    sourceEntity: "dc01",
    sourceType: "Infrastructure",
    sourceGraph: "IT Engineer Docs",
    targetEntity: "Domain Controller 01",
    targetType: "Infrastructure",
    targetGraph: "Google Admin Export",
    confidence: 0.88,
    tier: 2,
    decision: "SAME",
    overridden: false,
  },
  {
    id: "align_003",
    sourceEntity: "Active Directory",
    sourceType: "Technology",
    sourceGraph: "IT Engineer Docs",
    targetEntity: "AD Service",
    targetType: "Service",
    targetGraph: "Google Admin Export",
    confidence: 0.72,
    tier: 3,
    decision: "SAME",
    overridden: true,
  },
  {
    id: "align_004",
    sourceEntity: "VPN Gateway",
    sourceType: "Infrastructure",
    sourceGraph: "IT Engineer Docs",
    targetEntity: "VPN_GW",
    targetType: "Infrastructure",
    targetGraph: "Google Admin Export",
    confidence: 0.91,
    tier: 1,
    decision: "SAME",
    overridden: false,
  },
  {
    id: "align_005",
    sourceEntity: "Bob Martinez",
    sourceType: "Person",
    sourceGraph: "IT Engineer Docs",
    targetEntity: "Robert Martinez",
    targetType: "Person",
    targetGraph: "Google Admin Export",
    confidence: 0.62,
    tier: 2,
    decision: "UNSURE",
    overridden: false,
  },
];

const PLACEHOLDER_CONFLICTS: ConflictEntry[] = [
  {
    id: "conflict_001",
    type: "edge_conflict",
    severity: "high",
    description: "Who manages security-team@?",
    leftSource: "IT Engineer Docs",
    leftEntity: "Alice Chen",
    leftValue: "MANAGES -> security-team@",
    rightSource: "Google Admin Export",
    rightEntity: "Bob Martinez",
    rightValue: "MANAGES -> security-team@",
    suggestion: "Accept Right (more recent source, updated Jan 2026)",
    status: "unresolved",
  },
  {
    id: "conflict_002",
    type: "property_conflict",
    severity: "medium",
    description: "Conflicting IP address for dc01",
    leftSource: "IT Engineer Docs",
    leftEntity: "dc01",
    leftValue: "ip_address: 10.0.1.5",
    rightSource: "Google Admin Export",
    rightEntity: "Domain Controller 01",
    rightValue: "ip_address: 10.0.1.15",
    suggestion: "Accept Left (higher source reliability score)",
    status: "unresolved",
  },
  {
    id: "conflict_003",
    type: "temporal_conflict",
    severity: "low",
    description: "Overlapping validity for backup schedule",
    leftSource: "IT Engineer Docs",
    leftEntity: "Backup_Server",
    leftValue: "schedule: daily 2AM (valid from Jan 2025)",
    rightSource: "Google Admin Export",
    rightEntity: "Backup_Server",
    rightValue: "schedule: daily 3AM (valid from Mar 2025)",
    suggestion: "Accept Right (temporal precedence: newer validity window)",
    status: "deferred",
  },
];

const PLACEHOLDER_OPERATIONS: MergeOperation[] = [
  {
    id: "op_001",
    mode: "conflict_resolution",
    startedAt: "2026-04-01T10:28:00Z",
    completedAt: "2026-04-01T10:30:00Z",
    status: "completed",
    entitiesMerged: 198,
    conflictsFound: 3,
    conflictsResolved: 1,
    triggeredBy: "admin@openapproach.com",
  },
  {
    id: "op_002",
    mode: "union",
    startedAt: "2026-03-20T15:00:00Z",
    completedAt: "2026-03-20T15:02:00Z",
    status: "completed",
    entitiesMerged: 185,
    conflictsFound: 0,
    conflictsResolved: 0,
    triggeredBy: "admin@openapproach.com",
  },
  {
    id: "op_003",
    mode: "intersection",
    startedAt: "2026-03-15T09:00:00Z",
    completedAt: "2026-03-15T09:01:00Z",
    status: "completed",
    entitiesMerged: 67,
    conflictsFound: 0,
    conflictsResolved: 0,
    triggeredBy: "admin@openapproach.com",
  },
];

// ---------------------------------------------------------------------------
// API → Frontend type mapping
// ---------------------------------------------------------------------------

/** Map a raw API federation row to the frontend Federation interface */
function mapApiFederation(raw: any): Federation {
  const weights = raw.alignmentConfig?.weights ?? {};
  const consistencyScore = raw.consistencyScore ? Number(raw.consistencyScore) : 0;
  const topoQuality = raw.topoQuality ? Number(raw.topoQuality) : 0;
  const freshness = raw.freshnessScore ? Number(raw.freshnessScore) : 0;
  const compositeScore = raw.compositeQuality ? Number(raw.compositeQuality) : 0;

  let status: FederationStatus = "pending";
  if (raw.isMaterialized && raw.materializedAt) {
    status = "materialized";
  }

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? undefined,
    mergeMode: raw.mergeMode ?? "union",
    status,
    constituents: (raw.constituentKbIds ?? []).map((kbId: string) => ({
      knowledgeBaseId: kbId,
      knowledgeBaseName: kbId.slice(0, 8) + "...",
      entityCount: 0,
      relationshipCount: 0,
      freshness: freshness,
      lastUpdated: raw.updatedAt ?? raw.createdAt ?? "",
    })),
    quality: {
      consistencyScore,
      conflictDimension: raw.conflictDimension ?? 0,
      topologicalQuality: topoQuality,
      freshness,
      compositeScore,
    },
    alignmentWeights: {
      name: weights.name ?? 0.25,
      embedding: weights.embed ?? 0.30,
      type: weights.type ?? 0.10,
      structural: weights.struct ?? 0.20,
      property: weights.prop ?? 0.15,
    },
    entityCount: raw.entityCount ?? 0,
    relationshipCount: raw.edgeCount ?? 0,
    materializedAt: raw.materializedAt ?? undefined,
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useFederations() {
  return useQuery<Federation[]>({
    queryKey: ["/api/federations"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/federations");
        if (res.ok) {
          const data = await res.json();
          const rows = data.federations ?? data;
          if (Array.isArray(rows) && rows.length > 0) {
            return rows.map(mapApiFederation);
          }
        }
      } catch {
        // API not implemented yet — fall back to placeholder data
      }
      return PLACEHOLDER_FEDERATIONS;
    },
  });
}

export function useFederation(id: string) {
  return useQuery<Federation>({
    queryKey: ["/api/federations", id],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/federations/${id}`);
        if (res.ok) {
          const raw = await res.json();
          if (raw && raw.id) {
            return mapApiFederation(raw);
          }
        }
      } catch {
        // API not implemented yet — fall back to placeholder data
      }
      return PLACEHOLDER_FEDERATIONS.find((f) => f.id === id) ?? PLACEHOLDER_FEDERATIONS[0];
    },
    enabled: !!id,
  });
}

export function useFederationAlignments(federationId: string) {
  return useQuery<AlignmentEntry[]>({
    queryKey: ["/api/federations", federationId, "alignments"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/federations/${federationId}/alignments`);
        if (res.ok) {
          const data = await res.json();
          return data.alignments ?? data;
        }
      } catch {}
      return PLACEHOLDER_ALIGNMENTS;
    },
    enabled: !!federationId,
  });
}

export function useFederationConflicts(federationId: string) {
  return useQuery<ConflictEntry[]>({
    queryKey: ["/api/federations", federationId, "conflicts"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/federations/${federationId}/conflicts`);
        if (res.ok) {
          const data = await res.json();
          return data.conflicts ?? data;
        }
      } catch {}
      return PLACEHOLDER_CONFLICTS;
    },
    enabled: !!federationId,
  });
}

export function useFederationOperations(federationId: string) {
  return useQuery<MergeOperation[]>({
    queryKey: ["/api/federations", federationId, "operations"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/federations/${federationId}/operations`);
        if (res.ok) {
          const data = await res.json();
          return data.operations ?? data;
        }
      } catch {}
      return PLACEHOLDER_OPERATIONS;
    },
    enabled: !!federationId,
  });
}

export function useCreateFederation() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      mergeMode: MergeMode;
      constituentKbIds: string[];
      alignmentWeights?: Record<string, number>;
    }) => {
      const res = await apiRequest("POST", "/api/federations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/federations"] });
      toast({
        title: "Federation created",
        description: "Your federation has been created and is ready for materialization.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create federation",
        description: error.message || "An error occurred while creating the federation.",
        variant: "destructive",
      });
    },
  });
}

export function useMaterializeFederation() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (federationId: string) => {
      const res = await apiRequest("POST", `/api/federations/${federationId}/materialize`);
      return res.json();
    },
    onSuccess: (_data, federationId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/federations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/federations", federationId] });
      toast({
        title: "Materialization started",
        description: "The federation graph is being materialized. This may take a moment.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Materialization failed",
        description: error.message || "An error occurred during materialization.",
        variant: "destructive",
      });
    },
  });
}

export function useResolveConflict() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      federationId: string;
      conflictId: string;
      resolution: "accept_left" | "accept_right" | "defer";
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/federations/${data.federationId}/conflicts/${data.conflictId}/resolve`,
        { resolution: data.resolution },
      );
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/federations", variables.federationId, "conflicts"],
      });
      toast({
        title: "Conflict resolved",
        description: "The conflict has been resolved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resolve conflict",
        description: error.message || "An error occurred while resolving the conflict.",
        variant: "destructive",
      });
    },
  });
}
