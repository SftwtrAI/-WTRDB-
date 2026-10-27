import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link, FileText, Type, Search, ChevronDown, ChevronUp, FileStack, Trash2, Upload, Globe, FileType, Crown, Zap, Lock, Library, Loader2, CheckCircle2, AlertCircle, Brain, RefreshCw, Network, AlertTriangle } from "lucide-react";
import { GraphOverviewGrid } from "@/components/knowledge-graph/GraphOverviewGrid";
import { CinematicGenerationStage } from "@/components/knowledge-graph/CinematicGenerationStage";
import { ApproachTrail } from "@/components/knowledge-graph/cinematic/ApproachTrail";
import { FirstSuccessConfetti } from "@/components/knowledge-graph/cinematic/FirstSuccessConfetti";
import { AuthStorage } from "@/lib/auth-storage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useIsViewer } from "@/hooks/useIsViewer";

interface KnowledgeBaseItem {
  id: string;
  type: string;
  title: string;
  content?: string;
  url?: string;
  fileUrl?: string;
  storageSize: number;
  createdAt: string;
  ragStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  ragProgress?: number;
  chunkCount?: number;
  isRAGEnabled?: boolean;
}

interface StorageUsage {
  maxStorageBytes: number;
  usedStorageBytes: number;
  remainingBytes: number;
  usagePercent: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  planType: string;
  credits: number;
}

interface GraphSummary {
  knowledgeBaseId: string;
  entityCount: number;
  relationshipCount: number;
  entityTypes: string[];
  status: string;
  lastUpdated?: string;
}

export default function KnowledgeBase() {
  const { t } = useTranslation();
  const isViewer = useIsViewer();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlName, setUrlName] = useState("");

  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textName, setTextName] = useState("");

  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deletingItem, setDeletingItem] = useState<KnowledgeBaseItem | null>(null);

  // Cinematic graph generation modal state
  const [cinematicOpen, setCinematicOpen] = useState(false);
  const [cinematicKbId, setCinematicKbId] = useState<string | null>(null);
  const [cinematicTitle, setCinematicTitle] = useState<string>("");

  const openCinematicFor = useCallback((item: KnowledgeBaseItem) => {
    setCinematicKbId(item.id);
    setCinematicTitle(item.title);
    setCinematicOpen(true);
  }, []);

  const handleGenerateGraph = useCallback(
    (item: KnowledgeBaseItem) => {
      openCinematicFor(item);
      apiRequest("POST", `/api/knowledge-graph/${item.id}/generate`)
        .then(() => {
          toast({
            title: "Knowledge graph generation started",
            description: `Knowledge graph generation started for "${item.title}"`,
          });
        })
        .catch(() => {
          toast({
            title: t("common.error"),
            description: "Failed to start graph generation",
            variant: "destructive",
          });
        });
    },
    [openCinematicFor, toast, t],
  );

  // URL tab parameter support
  const initialTab = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "graphs" ? "graphs" : "documents";
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    history.replaceState(null, "", url.toString());
  }, []);

  // Auto-generate preference
  const [autoGenerateKG, setAutoGenerateKG] = useState(() => {
    const stored = localStorage.getItem("wtrdb-kg-auto-generate");
    return stored === null ? true : stored === "true";
  });

  const handleAutoGenerateChange = useCallback((checked: boolean) => {
    setAutoGenerateKG(checked);
    localStorage.setItem("wtrdb-kg-auto-generate", String(checked));
  }, []);

  // Insights collapsible state
  const [insightsOpen, setInsightsOpen] = useState(() => {
    const stored = localStorage.getItem("wtrdb-kb-insights-open");
    return stored === null ? true : stored === "true";
  });

  const handleInsightsToggle = useCallback((open: boolean) => {
    setInsightsOpen(open);
    localStorage.setItem("wtrdb-kb-insights-open", String(open));
  }, []);

  // Track items that were processing on last render for auto-generate
  const prevProcessingRef = useRef<Set<string>>(new Set());

  const { toast } = useToast();

  const { data: user, isLoading: userLoading, isError: userError } = useQuery<User>({
    queryKey: ['/api/auth/me'],
  });

  const { data: storageUsage } = useQuery<StorageUsage>({
    queryKey: ["/api/rag-knowledge/storage"],
    enabled: user?.planType !== 'free',
  });

  const { data: knowledgeBase = [], isLoading, refetch } = useQuery<KnowledgeBaseItem[]>({
    queryKey: ["/api/rag-knowledge"],
    enabled: user?.planType !== 'free',
    refetchInterval: (query) => {
      const items = query.state.data as KnowledgeBaseItem[] | undefined;
      const hasProcessingItems = items?.some(item => item.ragStatus === 'processing');
      return hasProcessingItems ? 3000 : false;
    },
  });

  // Fetch graph summaries for insights (per-item, matching existing backend API)
  const completedKbIds = knowledgeBase
    .filter(item => item.ragStatus === 'completed')
    .map(item => item.id);

  const { data: graphSummariesMap = {} } = useQuery<Record<string, GraphSummary>>({
    queryKey: ["knowledge-graph-summaries", "kb-page", completedKbIds.join(",")],
    queryFn: async () => {
      if (completedKbIds.length === 0) return {};
      const summaries: Record<string, GraphSummary> = {};
      await Promise.all(
        completedKbIds.map(async (id) => {
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
    enabled: completedKbIds.length > 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || typeof data !== "object") return false;
      const values = Object.values(data);
      if (values.length === 0) return false;
      const hasExtracting = values.some(
        (s: any) => s.status === "pending" || s.status === "extracting"
      );
      return hasExtracting ? 3000 : false;
    },
  });
  const graphSummaries = Object.values(graphSummariesMap);

  // Auto-generate: when an item transitions from processing to completed, trigger graph generation
  useEffect(() => {
    if (!autoGenerateKG || knowledgeBase.length === 0) return;

    const currentProcessing = new Set(
      knowledgeBase.filter(item => item.ragStatus === 'processing').map(item => item.id)
    );
    const justCompleted = knowledgeBase.filter(
      item => item.ragStatus === 'completed' && prevProcessingRef.current.has(item.id)
    );

    if (justCompleted.length > 0) {
      justCompleted.forEach((item, idx) => {
        // Check if a graph already exists for this item
        const existingSummary = graphSummaries.find(s => s.knowledgeBaseId === item.id);
        if (!existingSummary) {
          // Open the cinematic stage for the first auto-generated item.
          if (idx === 0) {
            setCinematicKbId(item.id);
            setCinematicTitle(item.title);
            setCinematicOpen(true);
          }
          apiRequest('POST', `/api/knowledge-graph/${item.id}/generate`)
            .then(() => {
              toast({
                title: "Knowledge graph generation started",
                description: `Knowledge graph generation started for "${item.title}"`,
              });
            })
            .catch(() => {
              // Silently ignore if API doesn't exist yet
            });
        }
      });
    }

    prevProcessingRef.current = currentProcessing;
  }, [knowledgeBase, autoGenerateKG, graphSummaries, toast]);

  const uploadFileMutation = useMutation({
    mutationFn: async (data: { file: File; name?: string }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      if (data.name) {
        formData.append('name', data.name);
      }
      
      const headers: Record<string, string> = {};
      const authHeader = AuthStorage.getAuthHeader();
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      
      const response = await fetch('/api/rag-knowledge/upload', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('knowledgeBase.errors.uploadFailed'));
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rag-knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rag-knowledge/storage'] });
      setFileDialogOpen(false);
      setSelectedFile(null);
      setFileName('');
      toast({
        title: t('knowledgeBase.toast.fileUploaded'),
        description: t('knowledgeBase.toast.fileUploadedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('knowledgeBase.toast.uploadFailed'),
        description: error.message || t('knowledgeBase.toast.uploadFailedDesc'),
        variant: "destructive",
      });
    },
  });

  const addUrlMutation = useMutation({
    mutationFn: async (data: { url: string; name?: string }) => {
      const res = await apiRequest('POST', '/api/rag-knowledge/url', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rag-knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rag-knowledge/storage'] });
      setUrlDialogOpen(false);
      setUrlInput('');
      setUrlName('');
      toast({
        title: t('knowledgeBase.toast.urlAdded'),
        description: t('knowledgeBase.toast.urlAddedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('knowledgeBase.toast.urlFailed'),
        description: error.message || t('knowledgeBase.toast.urlFailedDesc'),
        variant: "destructive",
      });
    },
  });

  const addTextMutation = useMutation({
    mutationFn: async (data: { text: string; name: string }) => {
      const res = await apiRequest('POST', '/api/rag-knowledge/text', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rag-knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rag-knowledge/storage'] });
      setTextDialogOpen(false);
      setTextInput('');
      setTextName('');
      toast({
        title: t('knowledgeBase.toast.textAdded'),
        description: t('knowledgeBase.toast.textAddedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('knowledgeBase.toast.textFailed'),
        description: error.message || t('knowledgeBase.toast.textFailedDesc'),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/rag-knowledge/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rag-knowledge'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rag-knowledge/storage'] });
      setDeletingItem(null);
      toast({
        title: t('common.delete'),
        description: t('knowledgeBase.toast.deleted'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('knowledgeBase.toast.deleteFailed'),
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: t('knowledgeBase.toast.fileTooLarge'),
          description: t('knowledgeBase.toast.fileTooLargeDesc'),
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      if (!fileName) {
        setFileName(file.name);
      }
    }
  };

  const handleUploadFile = () => {
    if (!selectedFile) {
      toast({
        title: t('knowledgeBase.toast.noFileSelected'),
        description: t('knowledgeBase.toast.noFileSelectedDesc'),
        variant: "destructive",
      });
      return;
    }
    uploadFileMutation.mutate({ file: selectedFile, name: fileName || selectedFile.name });
  };

  const handleAddUrl = () => {
    if (!urlInput) {
      toast({
        title: t('knowledgeBase.toast.urlRequired'),
        description: t('knowledgeBase.toast.urlRequiredDesc'),
        variant: "destructive",
      });
      return;
    }
    addUrlMutation.mutate({ url: urlInput, name: urlName || urlInput });
  };

  const handleAddText = () => {
    if (!textInput || !textName) {
      toast({
        title: t('knowledgeBase.toast.requiredFields'),
        description: t('knowledgeBase.toast.requiredFieldsDesc'),
        variant: "destructive",
      });
      return;
    }
    if (textInput.length > 300000) {
      toast({
        title: t('knowledgeBase.toast.textTooLong'),
        description: t('knowledgeBase.toast.textTooLongDesc'),
        variant: "destructive",
      });
      return;
    }
    addTextMutation.mutate({ text: textInput, name: textName });
  };

  const filteredItems = knowledgeBase.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !typeFilter || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    paginatedItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination(filteredItems, 10);

  const totalSize = knowledgeBase.reduce((sum, item) => sum + item.storageSize, 0);
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'url':
        return <Globe className="h-4 w-4" />;
      case 'file':
        return <FileText className="h-4 w-4" />;
      case 'text':
        return <Type className="h-4 w-4" />;
      default:
        return <FileType className="h-4 w-4" />;
    }
  };

  const getTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" => {
    switch (type) {
      case 'url':
        return 'default';
      case 'file':
        return 'secondary';
      case 'text':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: string | undefined) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Loader2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: string | undefined) => {
    switch (status) {
      case 'processing':
        return t('knowledgeBase.status.processing');
      case 'completed':
        return t('knowledgeBase.status.ready');
      case 'failed':
        return t('knowledgeBase.status.failed');
      default:
        return t('knowledgeBase.status.pending');
    }
  };

  if (userLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('knowledgeBase.title')}</h1>
        </div>
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">{t('knowledgeBase.unableToLoad')}</h2>
          <p className="text-muted-foreground">
            {t('knowledgeBase.unableToLoadDesc')}
          </p>
        </Card>
      </div>
    );
  }

  const isFreeUser = user?.planType === 'free';

  if (isFreeUser) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('knowledgeBase.title')}</h1>
        </div>

        <div className="p-8 text-center border rounded-lg">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex justify-center">
              <div className="relative">
                <Library className="w-20 h-20 text-muted-foreground/30" />
                <Lock className="w-8 h-8 text-primary absolute -bottom-1 -right-1 bg-background rounded-full p-1" />
              </div>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-2xl font-bold">{t('knowledgeBase.unlock.title')}</h2>
              <p className="text-muted-foreground text-lg">
                {t('knowledgeBase.unlock.description')}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg mb-4">{t('knowledgeBase.unlock.proFeatures')}</h3>
              <div className="grid gap-3 text-left">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{t('knowledgeBase.unlock.uploadDocs')}</p>
                    <p className="text-sm text-muted-foreground">{t('knowledgeBase.unlock.uploadDocsDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{t('knowledgeBase.unlock.addWebContent')}</p>
                    <p className="text-sm text-muted-foreground">{t('knowledgeBase.unlock.addWebContentDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{t('knowledgeBase.unlock.customText')}</p>
                    <p className="text-sm text-muted-foreground">{t('knowledgeBase.unlock.customTextDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Brain className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{t('knowledgeBase.unlock.aiSearch')}</p>
                    <p className="text-sm text-muted-foreground">{t('knowledgeBase.unlock.aiSearchDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">{t('knowledgeBase.unlock.storage')}</p>
                    <p className="text-sm text-muted-foreground">{t('knowledgeBase.unlock.storageDesc')}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button 
                size="lg" 
                className="gap-2"
                onClick={() => setLocation('/app/upgrade')}
                data-testid="button-upgrade-to-pro"
              >
                <Crown className="w-5 h-5" />
                {t('knowledgeBase.unlock.upgradeButton')}
              </Button>
              <p className="text-sm text-muted-foreground mt-3">
                {t('knowledgeBase.unlock.upgradeDesc')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const urlCount = knowledgeBase.filter(item => item.type === 'url').length;
  const fileCount = knowledgeBase.filter(item => item.type === 'file').length;
  const textCount = knowledgeBase.filter(item => item.type === 'text').length;
  const processingCount = knowledgeBase.filter(item => item.ragStatus === 'processing').length;
  const totalChunks = knowledgeBase.reduce((sum, item) => sum + (item.chunkCount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950/40 via-purple-900/30 to-fuchsia-950/40 border border-violet-900/50 p-6 md:p-8">
        <div className="absolute inset-0 bg-grid-slate-700/20 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.5))]" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Brain className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{t('knowledgeBase.title')}</h1>
              <p className="text-muted-foreground mt-0.5">{t('knowledgeBase.description')}</p>
            </div>
          </div>
          {!isViewer && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setUrlDialogOpen(true)}
                className="bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg"
                data-testid="button-add-url"
              >
                <Link className="h-4 w-4 mr-2" />
                {t('knowledgeBase.actions.addUrl')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setFileDialogOpen(true)}
                data-testid="button-add-files"
              >
                <FileText className="h-4 w-4 mr-2" />
                {t('knowledgeBase.actions.addFiles')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setTextDialogOpen(true)}
                data-testid="button-create-text"
              >
                <Type className="h-4 w-4 mr-2" />
                {t('knowledgeBase.actions.createText')}
              </Button>
            </div>
          )}
        </div>
        
        <div className="relative mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-violet-800/30">
            <div className="text-2xl font-bold text-violet-300">{knowledgeBase.length}</div>
            <div className="text-violet-400/70 text-sm">{t('knowledgeBase.stats.totalItems')}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-blue-800/30">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-blue-300">{totalChunks}</div>
              <Brain className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-blue-400/70 text-sm">{t('knowledgeBase.stats.knowledgeChunks')}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-emerald-800/30">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-emerald-300">{urlCount + fileCount}</div>
              <FileText className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-emerald-400/70 text-sm">{t('knowledgeBase.stats.docsAndUrls')}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-amber-800/30">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-amber-300">{textCount}</div>
              <Type className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-amber-400/70 text-sm">{t('knowledgeBase.stats.textEntries')}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-purple-800/30">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-purple-300">{formatBytes(totalSize)}</div>
                <span className="text-xs text-purple-400/70">/ 20 MB</span>
              </div>
              <Progress 
                value={storageUsage?.usagePercent || Math.round((totalSize / (20 * 1024 * 1024)) * 100)} 
                className="h-1.5" 
              />
            </div>
            <div className="text-purple-400/70 text-sm mt-1">{t('knowledgeBase.stats.storageUsed')}</div>
          </div>
        </div>

        {processingCount > 0 && (
          <div className="relative mt-4 bg-blue-950/30 rounded-lg p-3 flex items-center gap-3 border border-blue-800">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm text-blue-300">
              {t('knowledgeBase.processing.message', { count: processingCount })}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-auto h-7 text-blue-600"
              onClick={() => refetch()}
              data-testid="button-refresh-status"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              {t('common.refresh')}
            </Button>
          </div>
        )}
      </div>

      {/* Insights Banner */}
      {graphSummaries.length > 0 && (() => {
        const completedGraphs = graphSummaries.filter(s => s.status === "completed");
        const totalGraphEntities = completedGraphs.reduce((sum, s) => sum + s.entityCount, 0);
        const completedDocsCount = completedGraphs.length;
        const totalGraphRelationships = completedGraphs.reduce((sum, s) => sum + s.relationshipCount, 0);
        const staleGraphs = completedGraphs.filter(s => {
          if (!s.lastUpdated) return false;
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          return new Date(s.lastUpdated).getTime() < thirtyDaysAgo;
        });
        return (
          <Collapsible open={insightsOpen} onOpenChange={handleInsightsToggle}>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3" data-testid="insights-banner">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Graph Insights</span>
                    <span className="text-xs text-muted-foreground">
                      {totalGraphEntities} entities across {completedDocsCount} documents, {totalGraphRelationships} connections
                    </span>
                  </div>
                  {insightsOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span><strong className="text-primary">{totalGraphEntities}</strong> entities</span>
                    <span><strong className="text-emerald-400">{totalGraphRelationships}</strong> relationships</span>
                    <span><strong className="text-foreground">{completedDocsCount}</strong> completed graphs</span>
                  </div>
                  {staleGraphs.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 rounded px-2 py-1.5 border border-amber-800/30" data-testid="stale-graph-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {staleGraphs.length} graph{staleGraphs.length !== 1 ? "s" : ""} may be outdated &mdash; consider regenerating
                      </span>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })()}

      {/* Tabs: Documents and Knowledge Graphs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} data-testid="kb-tabs">
        <TabsList>
          <TabsTrigger value="documents" data-testid="tab-documents">
            <FileText className="h-4 w-4 mr-1.5" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="graphs" data-testid="tab-graphs">
            <Network className="h-4 w-4 mr-1.5" />
            Knowledge Graphs
            {graphSummaries.filter(s => s.status === "completed").length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {graphSummaries.filter(s => s.status === "completed").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[250px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('knowledgeBase.searchPlaceholder')}
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-knowledge-base"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2" data-testid="button-filter-type">
                    {typeFilter ? t(`knowledgeBase.types.${typeFilter}`) : t('knowledgeBase.filters.allTypes')}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setTypeFilter(null)}>
                    {t('knowledgeBase.filters.allTypes')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTypeFilter('file')}>
                    <FileText className="mr-2 h-4 w-4" />
                    {t('knowledgeBase.types.file')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTypeFilter('url')}>
                    <Link className="mr-2 h-4 w-4" />
                    {t('knowledgeBase.types.url')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTypeFilter('text')}>
                    <Type className="mr-2 h-4 w-4" />
                    {t('knowledgeBase.types.text')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">{t('knowledgeBase.loading')}</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                  <FileStack className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">{t('knowledgeBase.empty.title')}</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery || typeFilter ? t('knowledgeBase.empty.adjustFilters') : t('knowledgeBase.empty.uploadFirst')}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('knowledgeBase.table.name')}</TableHead>
                        <TableHead>{t('common.type')}</TableHead>
                        <TableHead>{t('knowledgeBase.table.aiStatus')}</TableHead>
                        <TableHead className="hidden md:table-cell">{t('knowledgeBase.table.chunks')}</TableHead>
                        <TableHead className="hidden sm:table-cell">{t('knowledgeBase.table.size')}</TableHead>
                        <TableHead className="hidden lg:table-cell">{t('knowledgeBase.table.created')}</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedItems.map((item) => (
                        <TableRow key={item.id} data-testid={`row-kb-item-${item.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {getTypeIcon(item.type)}
                              <span className="truncate max-w-[200px]">{item.title}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getTypeBadgeVariant(item.type)}>
                              {item.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(item.ragStatus)}
                                  <span className="text-sm text-muted-foreground">
                                    {getStatusText(item.ragStatus)}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {item.ragStatus === 'completed'
                                  ? t('knowledgeBase.tooltips.indexed')
                                  : item.ragStatus === 'processing'
                                  ? t('knowledgeBase.tooltips.generating')
                                  : item.ragStatus === 'failed'
                                  ? t('knowledgeBase.tooltips.failed')
                                  : t('knowledgeBase.tooltips.waiting')}
                              </TooltipContent>
                            </Tooltip>
                            {(() => {
                              const s = graphSummariesMap[item.id];
                              if (!s || (s.status !== "extracting" && s.status !== "pending")) return null;
                              const done = s.extractedChunks ?? 0;
                              const total = s.totalChunks ?? 0;
                              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                              return (
                                <div className="mt-2 w-40 space-y-1" data-testid={`kg-progress-${item.id}`}>
                                  <Progress value={pct} className="h-1.5" />
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>
                                      {total > 0
                                        ? `Chunk ${done}/${total}`
                                        : s.status === "pending" ? "Queued…" : "Starting…"}
                                    </span>
                                    <span>
                                      {s.entityCount} ent · {s.relationshipCount} rel
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden md:table-cell">
                            {item.chunkCount || 0}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden sm:table-cell">
                            {formatBytes(item.storageSize)}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden lg:table-cell">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {!isViewer && (
                              <ApproachTrail
                                active={
                                  graphSummariesMap[item.id]?.status === "extracting" ||
                                  graphSummariesMap[item.id]?.status === "pending"
                                }
                                className="inline-flex"
                              >
                              <div className="flex items-center gap-1">
                                {item.ragStatus === 'completed' &&
                                  !graphSummariesMap[item.id] && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleGenerateGraph(item)}
                                      title="Generate knowledge graph"
                                      data-testid={`button-generate-graph-${item.id}`}
                                    >
                                      <Network className="h-4 w-4 text-primary" />
                                    </Button>
                                  )}
                                {item.ragStatus === 'completed' &&
                                  graphSummariesMap[item.id] && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setCinematicKbId(item.id);
                                        setCinematicTitle(item.title);
                                        setCinematicOpen(true);
                                      }}
                                      title="Replay cinematic"
                                      data-testid={`button-replay-cinematic-${item.id}`}
                                    >
                                      <Network className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingItem(item)}
                                  data-testid={`button-delete-${item.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                              </ApproachTrail>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <DataPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={handleItemsPerPageChange}
                />
              </>
            )}
          </div>
        </TabsContent>

        {/* Knowledge Graphs Tab */}
        <TabsContent value="graphs">
          <div className="mt-4">
            <GraphOverviewGrid />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('knowledgeBase.dialog.addUrl.title')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeBase.dialog.addUrl.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="url">{t('knowledgeBase.labels.url')}</Label>
              <Input
                id="url"
                placeholder={t('knowledgeBase.placeholders.url')}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                data-testid="input-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url-name">{t('knowledgeBase.labels.nameOptional')}</Label>
              <Input
                id="url-name"
                placeholder={t('knowledgeBase.placeholders.urlName')}
                value={urlName}
                onChange={(e) => setUrlName(e.target.value)}
                data-testid="input-url-name"
              />
            </div>
            <div className="flex items-center space-x-2" data-testid="auto-generate-kg-url">
              <Checkbox
                id="auto-generate-url"
                checked={autoGenerateKG}
                onCheckedChange={(checked) => handleAutoGenerateChange(!!checked)}
              />
              <Label htmlFor="auto-generate-url" className="text-sm text-muted-foreground cursor-pointer">
                Automatically generate knowledge graph after processing
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUrlDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleAddUrl}
              disabled={addUrlMutation.isPending}
              data-testid="button-submit-url"
            >
              {addUrlMutation.isPending ? t('knowledgeBase.actions.adding') : t('knowledgeBase.actions.addUrl')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('knowledgeBase.dialog.uploadFile.title')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeBase.dialog.uploadFile.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file">{t('knowledgeBase.labels.file')}</Label>
              <div className="flex gap-2">
                <Input
                  type="file"
                  id="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".txt,.md,.html,.htm,.json,.xml,.csv"
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                  data-testid="button-select-file"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {selectedFile ? selectedFile.name : t('knowledgeBase.actions.chooseFile')}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file-name">{t('knowledgeBase.labels.nameOptional')}</Label>
              <Input
                id="file-name"
                placeholder={t('knowledgeBase.placeholders.fileName')}
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                data-testid="input-file-name"
              />
            </div>
            <div className="flex items-center space-x-2" data-testid="auto-generate-kg-file">
              <Checkbox
                id="auto-generate-file"
                checked={autoGenerateKG}
                onCheckedChange={(checked) => handleAutoGenerateChange(!!checked)}
              />
              <Label htmlFor="auto-generate-file" className="text-sm text-muted-foreground cursor-pointer">
                Automatically generate knowledge graph after processing
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setFileDialogOpen(false);
              setSelectedFile(null);
              setFileName('');
            }}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleUploadFile} 
              disabled={!selectedFile || uploadFileMutation.isPending}
              data-testid="button-submit-file"
            >
              {uploadFileMutation.isPending ? t('knowledgeBase.actions.uploading') : t('knowledgeBase.actions.uploadFile')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={textDialogOpen} onOpenChange={setTextDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('knowledgeBase.dialog.createText.title')}</DialogTitle>
            <DialogDescription>
              {t('knowledgeBase.dialog.createText.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="text-name">{t('common.name')}</Label>
              <Input
                id="text-name"
                placeholder={t('knowledgeBase.placeholders.textName')}
                value={textName}
                onChange={(e) => setTextName(e.target.value)}
                data-testid="input-text-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="text-content">{t('knowledgeBase.labels.content')}</Label>
              <Textarea
                id="text-content"
                placeholder={t('knowledgeBase.placeholders.textContent')}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={10}
                className="resize-none font-mono text-sm"
                data-testid="input-text-content"
              />
              <p className="text-xs text-muted-foreground">
                {textInput.length.toLocaleString()} / 300,000 {t('knowledgeBase.labels.characters')}
              </p>
            </div>
            <div className="flex items-center space-x-2" data-testid="auto-generate-kg-text">
              <Checkbox
                id="auto-generate-text"
                checked={autoGenerateKG}
                onCheckedChange={(checked) => handleAutoGenerateChange(!!checked)}
              />
              <Label htmlFor="auto-generate-text" className="text-sm text-muted-foreground cursor-pointer">
                Automatically generate knowledge graph after processing
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTextDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleAddText} 
              disabled={addTextMutation.isPending}
              data-testid="button-submit-text"
            >
              {addTextMutation.isPending ? t('knowledgeBase.actions.adding') : t('knowledgeBase.actions.addText')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('knowledgeBase.dialog.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('knowledgeBase.dialog.delete.description', { title: deletingItem?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingItem && deleteMutation.mutate(deletingItem.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CinematicGenerationStage
        open={cinematicOpen}
        onOpenChange={setCinematicOpen}
        knowledgeBaseId={cinematicKbId}
        documentTitle={cinematicTitle}
      />

      <FirstSuccessConfetti
        trigger={Object.values(graphSummariesMap).some(
          (s: any) => s?.status === "completed",
        )}
      />
    </div>
  );
}
