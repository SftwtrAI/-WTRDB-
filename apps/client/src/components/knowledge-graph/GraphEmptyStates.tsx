import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  FileText,
  Network,
  Sparkles,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Brain,
  Cpu,
  Bot,
  Upload,
} from "lucide-react";

// ─── Entity colors matching GraphNode conventions ───────────────────────────
const ENTITY_COLORS: Record<string, string> = {
  Person: "#07A288",
  Organization: "#5BBE4E",
  Concept: "#B8E52B",
  Location: "#3B82F6",
  Event: "#F59E0B",
  Product: "#8B5CF6",
  Document: "#6B7280",
  Other: "#EC4899",
};

// ─── Shared sample data for the before/after visualization ──────────────────
const SAMPLE_TEXT =
  "John Smith, CEO of Acme Corp, met with Sarah Johnson from TechVentures to discuss the Series B funding round. The meeting took place at their San Francisco headquarters.";

const SAMPLE_ENTITIES: { label: string; type: string }[] = [
  { label: "John Smith", type: "Person" },
  { label: "Sarah Johnson", type: "Person" },
  { label: "Acme Corp", type: "Organization" },
  { label: "TechVentures", type: "Organization" },
  { label: "Series B", type: "Event" },
  { label: "San Francisco", type: "Location" },
];

const SAMPLE_QUERIES = [
  "What organizations are mentioned?",
  "Who is the CEO of Acme Corp?",
  "What events involve TechVentures?",
  "Show all people and their affiliations",
];

// ─── Props ──────────────────────────────────────────────────────────────────
export interface NoDocsEmptyStateProps {
  onUploadDocs?: () => void;
}

export interface NoGraphsEmptyStateProps {
  onGenerateAll?: () => void;
  isGenerating?: boolean;
}

export interface GraphPageEmptyStateProps {
  documentTitle?: string;
  onRetry?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. NO DOCS — user hasn't uploaded any documents yet
// ═══════════════════════════════════════════════════════════════════════════
export function NoDocsEmptyState({ onUploadDocs }: NoDocsEmptyStateProps) {
  return (
    <Card
      data-testid="empty-state-no-docs"
      className="mx-auto max-w-lg border-[#243645] bg-[#111A21] text-center"
    >
      <CardHeader>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#07A288]/10">
          <FileText className="h-7 w-7 text-[#07A288]" />
        </div>
        <CardTitle className="text-lg">No documents yet</CardTitle>
        <CardDescription>
          Upload documents to your Knowledge Base first, then generate knowledge
          graphs to visualize entities and relationships.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {onUploadDocs && (
          <Button
            onClick={onUploadDocs}
            className="bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
            data-testid="upload-docs-btn"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Documents
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. NO GRAPHS — documents exist but no graphs have been generated
// ═══════════════════════════════════════════════════════════════════════════
export function NoGraphsEmptyState({
  onGenerateAll,
  isGenerating,
}: NoGraphsEmptyStateProps) {
  return (
    <div data-testid="empty-state-no-graphs" className="mx-auto max-w-3xl space-y-6">
      {/* Before / After value proposition */}
      <Card className="border-[#243645] bg-[#111A21] overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#243645]">
            {/* LEFT — Raw document text */}
            <div className="p-6">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Your Document
                </span>
              </div>
              <div className="rounded-lg border border-[#243645] bg-[#0B1014] p-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {SAMPLE_TEXT}
                </p>
              </div>
            </div>

            {/* Arrow separator (visible on md+) */}
            <div className="relative hidden md:block">
              <div className="absolute -left-3 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[#243645] bg-[#111A21]">
                <ArrowRight className="h-3 w-3 text-[#07A288]" />
              </div>

              {/* RIGHT — Extracted entities */}
              <div className="p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Network className="h-4 w-4 text-[#07A288]" />
                  <span className="text-xs font-medium uppercase tracking-wider text-[#07A288]">
                    Knowledge Graph
                  </span>
                </div>
                <div className="space-y-2">
                  {SAMPLE_ENTITIES.map((entity) => (
                    <div
                      key={entity.label}
                      className="flex items-center gap-2"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            ENTITY_COLORS[entity.type] || ENTITY_COLORS.Other,
                        }}
                      />
                      <Badge
                        variant="outline"
                        className="border-[#243645] text-foreground"
                      >
                        {entity.type}
                      </Badge>
                      <span className="text-sm text-foreground">
                        {entity.label}
                      </span>
                    </div>
                  ))}
                  {/* Relationship hint */}
                  <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed border-[#243645] px-3 py-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-[#07A288] to-[#5BBE4E]" />
                    <span className="text-xs text-muted-foreground">
                      8 relationships discovered
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-[#5BBE4E] to-[#B8E52B]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sample queries */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Example questions you'll be able to ask:
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SAMPLE_QUERIES.map((query) => (
            <Card
              key={query}
              className="border-[#07A288]/20 bg-[#07A288]/5 px-4 py-3"
            >
              <div className="flex items-start gap-2">
                <Search className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#07A288]" />
                <span className="text-sm text-foreground">{query}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Generate CTA */}
      <div className="flex justify-center">
        {onGenerateAll && (
          <Button
            onClick={onGenerateAll}
            disabled={isGenerating}
            className="bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
            data-testid="generate-all-btn"
          >
            {isGenerating ? (
              <>
                <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Knowledge Graphs
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. GRAPH PAGE EMPTY — on the graph viewer but nothing to show
// ═══════════════════════════════════════════════════════════════════════════

interface FaqItem {
  question: string;
  answer: string;
  icon: React.ReactNode;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is a Knowledge Graph?",
    answer:
      "A knowledge graph is a structured representation of information that maps entities (people, organizations, concepts) and the relationships between them. Instead of reading through pages of text, you can visually explore who is connected to whom, which organizations are involved, and how different concepts relate.",
    icon: <Brain className="h-4 w-4 text-[#07A288]" />,
  },
  {
    question: "How are entities extracted?",
    answer:
      "Our AI reads through your documents and identifies key entities like people, organizations, locations, events, and concepts. It then analyzes the context to discover relationships between these entities \u2014 such as \"works at\", \"located in\", or \"participated in\". The result is a rich, interconnected graph of knowledge.",
    icon: <Cpu className="h-4 w-4 text-[#5BBE4E]" />,
  },
  {
    question: "How can I use this with my AI agents?",
    answer:
      "Once your knowledge graph is generated, your AI agents can query it to provide more accurate, context-aware responses. Agents can traverse relationships to answer complex questions like \"Who are all the people connected to this organization?\" \u2014 something that\u2019s difficult with traditional document search alone.",
    icon: <Bot className="h-4 w-4 text-[#B8E52B]" />,
  },
];

export function GraphPageEmptyState({
  documentTitle,
  onRetry,
}: GraphPageEmptyStateProps) {
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  return (
    <div data-testid="empty-state-graph-page" className="mx-auto max-w-lg space-y-6">
      <Card className="border-[#243645] bg-[#111A21] text-center">
        <CardHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#07A288]/10">
            <Network className="h-7 w-7 text-[#07A288]" />
          </div>
          <CardTitle className="text-lg">
            {documentTitle
              ? `No graph for "${documentTitle}" yet`
              : "No graph data available"}
          </CardTitle>
          <CardDescription>
            Generate a knowledge graph from this document to visualize entities
            and their relationships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {onRetry && (
            <Button
              onClick={onRetry}
              className="bg-[#07A288] text-[#041514] hover:bg-[#07A288]/90"
              data-testid="retry-generate-btn"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Graph
            </Button>
          )}
        </CardContent>
      </Card>

      {/* FAQ Collapsibles */}
      <div className="space-y-2" data-testid="graph-faq-section">
        {FAQ_ITEMS.map((faq) => {
          const isOpen = openFaq === faq.question;
          return (
            <Collapsible
              key={faq.question}
              open={isOpen}
              onOpenChange={(open) =>
                setOpenFaq(open ? faq.question : null)
              }
            >
              <Card className="border-[#243645] bg-[#111A21]">
                <CollapsibleTrigger asChild>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#0B1014]/50 transition-colors rounded-xl"
                    data-testid={`faq-trigger-${faq.question.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {faq.icon}
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {faq.question}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-[#243645] px-4 py-3">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {faq.answer}
                    </p>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

// Backwards-compatible wrapper matching the old API
interface GraphEmptyStatesProps {
  variant: "no-docs" | "no-graphs" | "graph-page-empty";
  onGenerateAll?: () => void;
  onUploadDocs?: () => void;
  documentTitle?: string;
  onRetry?: () => void;
}

export function GraphEmptyStates({ variant, onGenerateAll, onUploadDocs, documentTitle, onRetry }: GraphEmptyStatesProps) {
  if (variant === "no-docs") {
    return <NoDocsEmptyState onUploadDocs={onUploadDocs} />;
  }
  if (variant === "no-graphs") {
    return <NoGraphsEmptyState onGenerateAll={onGenerateAll} />;
  }
  return <GraphPageEmptyState documentTitle={documentTitle} onRetry={onRetry} />;
}
