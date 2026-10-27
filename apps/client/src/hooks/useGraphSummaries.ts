import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface KnowledgeGraphSummary {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: "pending" | "extracting" | "completed" | "failed";
  lastUpdated: string;
  extractedChunks?: number;
  totalChunks?: number;
}

export function useGraphSummaries(knowledgeBaseIds: string[]) {
  return useQuery<Record<string, KnowledgeGraphSummary>>({
    queryKey: ["/api/knowledge-graph/summaries", knowledgeBaseIds.join(",")],
    queryFn: async () => {
      if (knowledgeBaseIds.length === 0) return {};
      const summaries: Record<string, KnowledgeGraphSummary> = {};
      await Promise.all(
        knowledgeBaseIds.map(async (id) => {
          try {
            const res = await apiRequest("GET", `/api/knowledge-graph/${id}/summary`);
            if (res.ok) {
              const data = await res.json();
              summaries[id] = data;
            }
          } catch {}
        })
      );
      return summaries;
    },
    enabled: knowledgeBaseIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasExtracting = Object.values(data).some(s => s.status === "extracting");
      return hasExtracting ? 5000 : false;
    },
  });
}
