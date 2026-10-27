/**
 * Knowledge Graph 3D Page — Thin wrapper that extracts knowledgeBaseId
 * from route params and renders the full-screen 3D visualization.
 */

import { useRoute, Link } from "wouter";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import KnowledgeGraph3D from "@/components/knowledge-graph-3d/KnowledgeGraph3D";

export default function KnowledgeGraph3DPage() {
  const [matched, params] = useRoute("/app/knowledge-graph-3d/:id");

  if (!matched || !params?.id) {
    return (
      <div className="fixed inset-0 bg-[#020815] flex items-center justify-center z-40">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto" />
          <h2 className="text-lg font-bold text-gray-100">
            Invalid Knowledge Graph
          </h2>
          <p className="text-sm text-gray-400">
            No knowledge base ID was provided.
          </p>
          <Link href="/app/knowledge-base">
            <Button
              variant="outline"
              className="gap-2 border-[#243645] text-gray-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Knowledge Base
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return <KnowledgeGraph3D knowledgeBaseId={params.id} />;
}
