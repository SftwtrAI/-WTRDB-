import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X,
  Search,
  Loader2,
  AlertCircle,
  Sparkles,
  Clock,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { ENTITY_COLORS } from "./GraphNode";

// --- Types ---

interface QueryResult {
  answer: string;
  entities: Array<{
    id: string;
    name: string;
    label: string;
  }>;
}

interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
}

interface QueryHistoryEntry {
  query: string;
  answer: string;
  timestamp: number;
}

interface GraphQueryPanelProps {
  knowledgeBaseId: string;
  onHighlightEntities: (entityIds: string[]) => void;
  isOpen: boolean;
  onClose: () => void;
  entities?: Array<{ id: string; name: string; label: string }>;
  relationships?: Array<{ id: string; type: string }>;
  prefillQuery?: string;
  onPrefillConsumed?: () => void;
}

// --- LocalStorage helpers ---

function getStorageKey(knowledgeBaseId: string): string {
  return `wtrdb-kg-queries-${knowledgeBaseId}`;
}

function loadQueryHistory(knowledgeBaseId: string): QueryHistoryEntry[] {
  try {
    const raw = localStorage.getItem(getStorageKey(knowledgeBaseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function saveQueryHistory(
  knowledgeBaseId: string,
  history: QueryHistoryEntry[]
): void {
  try {
    localStorage.setItem(
      getStorageKey(knowledgeBaseId),
      JSON.stringify(history.slice(0, 10))
    );
  } catch {
    // Private browsing or quota exceeded — silently ignore
  }
}

function clearQueryHistory(knowledgeBaseId: string): void {
  try {
    localStorage.removeItem(getStorageKey(knowledgeBaseId));
  } catch {
    // Silently ignore
  }
}

// --- Suggestion generation ---

function generateSuggestions(
  entities?: Array<{ id: string; name: string; label: string }>,
  relationships?: Array<{ id: string; type: string }>
): string[] {
  const suggestions: string[] = [];

  if (entities && entities.length > 0) {
    // Most common entity types
    const typeCounts = new Map<string, number>();
    for (const e of entities) {
      typeCounts.set(e.label, (typeCounts.get(e.label) || 0) + 1);
    }
    const sortedTypes = Array.from(typeCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    if (sortedTypes.length > 0) {
      const topType = sortedTypes[0][0];
      suggestions.push(
        `What ${topType.toLowerCase()}s are mentioned?`
      );
    }
  }

  if (entities && relationships && entities.length >= 2) {
    // Connection counts per entity
    const connectionCounts = new Map<string, number>();
    // Relationships have id and type but no source/target in the prop type,
    // so we count entity mentions across all relationships generically
    for (const e of entities) {
      connectionCounts.set(e.name, 0);
    }
    // We'll approximate by entity frequency (entities passed are already filtered)
    // Pick 2 most-connected based on how many relationships exist
    const entityNames = entities.map((e) => e.name);
    if (entityNames.length >= 2) {
      suggestions.push(
        `How is ${entityNames[0]} connected to ${entityNames[1]}?`
      );
    }
    if (entityNames.length >= 1) {
      suggestions.push(
        `What are the key relationships involving ${entityNames[0]}?`
      );
    }
  }

  // Always include
  suggestions.push("Summarize the main topics in this document");

  // Add one more if we have entity data
  if (entities && entities.length > 2) {
    suggestions.push("What are the most important entities?");
  }

  // Ensure uniqueness and limit to 6
  return [...new Set(suggestions)].slice(0, 6);
}

// --- Component ---

export function GraphQueryPanel({
  knowledgeBaseId,
  onHighlightEntities,
  isOpen,
  onClose,
  entities,
  relationships,
  prefillQuery,
  onPrefillConsumed,
}: GraphQueryPanelProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  // Conversational context (last 3 exchanges)
  const [conversationHistory, setConversationHistory] = useState<
    ConversationEntry[]
  >([]);
  // Visual conversation thread
  const [conversationThread, setConversationThread] = useState<
    Array<{ query: string; answer: string; entities?: QueryResult["entities"] }>
  >([]);

  // Query history (localStorage)
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const prefillHandled = useRef(false);

  // Load query history on mount
  useEffect(() => {
    if (isOpen) {
      setQueryHistory(loadQueryHistory(knowledgeBaseId));
    }
  }, [isOpen, knowledgeBaseId]);

  // Generate suggestions
  const suggestions = useMemo(
    () => generateSuggestions(entities, relationships),
    [entities, relationships]
  );

  // Random entity names for error recovery
  const randomEntityNames = useMemo(() => {
    if (!entities || entities.length === 0) return [];
    const shuffled = [...entities].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3).map((e) => e.name);
  }, [entities]);

  // Handle prefill query
  useEffect(() => {
    if (prefillQuery && isOpen && !prefillHandled.current) {
      prefillHandled.current = true;
      setQuery(prefillQuery);
      onPrefillConsumed?.();
      // Auto-submit after a short delay to let the UI render
      setTimeout(() => {
        submitQuery(prefillQuery);
      }, 100);
    }
    if (!prefillQuery) {
      prefillHandled.current = false;
    }
  }, [prefillQuery, isOpen]);

  // Scroll thread to bottom when new entries added
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [conversationThread]);

  const submitQuery = useCallback(
    async (queryText?: string) => {
      const q = (queryText || query).trim();
      if (!q || isLoading) return;

      setIsLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await apiRequest("POST", "/api/knowledge-graph/query", {
          query: q,
          knowledgeBaseIds: [knowledgeBaseId],
          conversationHistory:
            conversationHistory.length > 0 ? conversationHistory : undefined,
        });
        const data: QueryResult = await res.json();
        setResult(data);

        // Auto-highlight entities
        if (data.entities && data.entities.length > 0) {
          onHighlightEntities(data.entities.map((e) => e.id));
        }

        // Update conversation history (keep last 3 exchanges = 6 messages)
        const newHistory: ConversationEntry[] = [
          ...conversationHistory,
          { role: "user" as const, content: q },
          { role: "assistant" as const, content: data.answer || "" },
        ].slice(-6);
        setConversationHistory(newHistory);

        // Update visual thread
        setConversationThread((prev) => [
          ...prev,
          { query: q, answer: data.answer || "", entities: data.entities },
        ]);

        // Save to localStorage history
        const historyEntry: QueryHistoryEntry = {
          query: q,
          answer: (data.answer || "").slice(0, 100),
          timestamp: Date.now(),
        };
        const updatedHistory = [
          historyEntry,
          ...queryHistory.filter((h) => h.query !== q),
        ].slice(0, 10);
        setQueryHistory(updatedHistory);
        saveQueryHistory(knowledgeBaseId, updatedHistory);
      } catch (err: any) {
        setError(
          err.message ||
            "Failed to query the knowledge graph. Please try again."
        );
      } finally {
        setIsLoading(false);
        setQuery("");
      }
    },
    [
      query,
      isLoading,
      knowledgeBaseId,
      conversationHistory,
      queryHistory,
      onHighlightEntities,
    ]
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await submitQuery();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    submitQuery(suggestion);
  };

  const handleHistoryClick = (entry: QueryHistoryEntry) => {
    setQuery(entry.query);
    setShowHistory(false);
    submitQuery(entry.query);
  };

  const handleClearHistory = () => {
    clearQueryHistory(knowledgeBaseId);
    setQueryHistory([]);
  };

  const handleNewConversation = () => {
    setConversationHistory([]);
    setConversationThread([]);
    setResult(null);
    setError(null);
    setQuery("");
    inputRef.current?.focus();
  };

  const handleReHighlight = () => {
    if (result?.entities && result.entities.length > 0) {
      onHighlightEntities(result.entities.map((e) => e.id));
    }
  };

  // Format timestamp for history
  const formatTimestamp = (ts: number): string => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  // Error message rendering with actionable guidance
  const renderError = () => {
    if (!error) return null;

    const isNotFound =
      error.toLowerCase().includes("no entities") ||
      error.toLowerCase().includes("not found");

    return (
      <div
        className={`rounded-lg px-3 py-2.5 border ${
          isNotFound
            ? "bg-yellow-500/5 border-yellow-500/20"
            : "bg-yellow-500/5 border-yellow-500/20"
        }`}
        data-testid="query-error"
      >
        <div className="flex items-start gap-2">
          <AlertCircle
            className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5"
          />
          <div className="flex-1">
            {isNotFound ? (
              <>
                <p className="text-xs text-yellow-300">
                  No matching entities found.
                  {randomEntityNames.length > 0 && " Try asking about:"}
                </p>
                {randomEntityNames.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {randomEntityNames.map((name) => (
                      <button
                        key={name}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-[#07A288]/40 text-[#07A288] hover:bg-[#07A288]/10 transition-colors"
                        onClick={() => {
                          setError(null);
                          setQuery(`Tell me about ${name}`);
                          submitQuery(`Tell me about ${name}`);
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-yellow-300">
                Something went wrong. Try rephrasing your question or asking
                about a specific entity.
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 text-xs text-[#07A288] hover:text-[#07A288] hover:bg-[#07A288]/10"
              onClick={() => {
                setError(null);
                submitQuery();
              }}
              data-testid="query-retry"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
      <div className="pointer-events-auto max-w-2xl mx-auto mb-0">
        <div
          className="bg-[#0B1014]/95 backdrop-blur-xl border border-[#243645] border-b-0 rounded-t-xl shadow-2xl overflow-hidden"
          style={{
            animation: "slideUp 0.25s ease-out",
          }}
          data-testid="graph-query-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#243645]/60">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[#07A288]" />
              <span className="text-xs font-semibold text-gray-300">
                Query Knowledge Graph
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-600 hidden sm:inline">
                Press Q to toggle
              </span>
              {conversationThread.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 hover:bg-[#111A21]"
                  onClick={handleNewConversation}
                  title="New conversation"
                  data-testid="new-conversation"
                >
                  <RotateCcw className="h-3 w-3 text-gray-400" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 hover:bg-[#111A21]"
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </div>
          </div>

          {/* Conversation thread (previous exchanges) */}
          {conversationThread.length > 0 && (
            <div
              ref={threadRef}
              className="px-4 py-2 max-h-[160px] overflow-y-auto border-b border-[#243645]/40 space-y-2"
              data-testid="conversation-thread"
            >
              {conversationThread.map((entry, idx) => (
                <div key={idx} className="space-y-1">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="bg-[#07A288]/10 border border-[#07A288]/20 rounded-lg px-2.5 py-1.5 max-w-[85%]">
                      <p className="text-[11px] text-gray-300">{entry.query}</p>
                    </div>
                  </div>
                  {/* Assistant message */}
                  <div className="flex justify-start">
                    <div className="bg-[#111A21] border border-[#243645]/60 rounded-lg px-2.5 py-1.5 max-w-[85%]">
                      <p className="text-[11px] text-gray-400 line-clamp-3">
                        {entry.answer}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Query input */}
          <form
            onSubmit={handleSubmit}
            className="p-3 border-b border-[#243645]/60"
          >
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  ref={inputRef}
                  placeholder="Ask a question about your knowledge graph..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9 h-9 text-sm bg-[#111A21] border-[#243645] focus-visible:ring-[#07A288]/50"
                  autoFocus
                  disabled={isLoading}
                  data-testid="query-input"
                />
              </div>
              <Button
                type="submit"
                disabled={!query.trim() || isLoading}
                className="h-9 px-4 bg-gradient-to-r from-[#07A288] to-[#5BBE4E] text-[#041514] font-semibold hover:brightness-110 text-xs"
                data-testid="query-submit"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Ask"
                )}
              </Button>
            </div>

            {/* Suggestions — show when input is empty and no conversation yet */}
            {!query && conversationThread.length === 0 && !result && !error && (
              <div
                className="flex flex-wrap gap-1.5 mt-2"
                data-testid="query-suggestions"
              >
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="text-[10px] px-2.5 py-1 rounded-full border border-[#07A288]/30 text-[#07A288] hover:bg-[#07A288]/10 hover:border-[#07A288]/50 transition-colors"
                    onClick={() => handleSuggestionClick(suggestion)}
                    data-testid="suggestion-chip"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* History toggle */}
            {queryHistory.length > 0 &&
              !isLoading &&
              conversationThread.length === 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1 mt-2 text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
                  onClick={() => setShowHistory((prev) => !prev)}
                  data-testid="history-toggle"
                >
                  <Clock className="h-3 w-3" />
                  <span>Recent</span>
                  {showHistory ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              )}
          </form>

          {/* Query history dropdown */}
          {showHistory && queryHistory.length > 0 && (
            <div
              className="px-4 py-2 border-b border-[#243645]/40 max-h-[140px] overflow-y-auto"
              data-testid="query-history"
            >
              <div className="space-y-1">
                {queryHistory.map((entry, idx) => (
                  <button
                    key={`${entry.timestamp}-${idx}`}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#111A21] transition-colors group"
                    onClick={() => handleHistoryClick(entry)}
                    data-testid="history-entry"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-gray-300 truncate flex-1">
                        {entry.query}
                      </p>
                      <span className="text-[9px] text-gray-600 flex-shrink-0">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">
                      {entry.answer}
                    </p>
                  </button>
                ))}
              </div>
              <button
                className="flex items-center gap-1 mt-2 text-[9px] text-gray-600 hover:text-red-400 transition-colors"
                onClick={handleClearHistory}
                data-testid="clear-history"
              >
                <Trash2 className="h-2.5 w-2.5" />
                Clear history
              </button>
            </div>
          )}

          {/* Results area */}
          {(isLoading || error || result) && (
            <div className="px-4 py-3 max-h-[240px] overflow-y-auto">
              {/* Loading */}
              {isLoading && (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-[#07A288]" />
                  <span className="text-xs text-gray-400">
                    Analyzing knowledge graph...
                  </span>
                </div>
              )}

              {/* Error with actionable guidance */}
              {error && renderError()}

              {/* Result */}
              {result && (
                <div className="space-y-3" data-testid="query-result">
                  {/* Answer */}
                  {result.answer && (
                    <div className="bg-[#111A21] rounded-lg px-3 py-2.5 border border-[#243645]/60">
                      <p className="text-sm text-gray-300 leading-relaxed">
                        {result.answer}
                      </p>
                    </div>
                  )}

                  {/* Relevant entities */}
                  {result.entities && result.entities.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                          Relevant Entities ({result.entities.length})
                        </span>
                        <button
                          className="text-[10px] text-[#07A288] hover:text-[#07A288]/80 transition-colors flex items-center gap-1"
                          onClick={handleReHighlight}
                          data-testid="re-highlight"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          Re-highlight
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {result.entities.map((entity) => {
                          const color =
                            ENTITY_COLORS[entity.label] || ENTITY_COLORS.Other;
                          return (
                            <Badge
                              key={entity.id}
                              className="text-[10px] border cursor-default"
                              style={{
                                backgroundColor: `${color}15`,
                                borderColor: `${color}50`,
                                color: color,
                              }}
                            >
                              {entity.name}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Slide-up animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
