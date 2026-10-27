import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import {
  Save,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Phone,
  Pencil,
  Key,
  ShieldAlert,
  Eye,
  EyeOff,
  Activity,
  Plus,
  Trash2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useTranslation } from "react-i18next";
import BrandingSettings from "./BrandingSettings";
import SMTPSettings from "./SMTPSettings";

interface Settings {
  default_llm_free: string;
  pro_plan_bonus_credits: number;
  credit_price_per_minute: number;
  min_credit_purchase: number;
  openai_api_key: string;
  openai_configured: boolean;
  invoice_prefix: string;
  invoice_start_number: number;
}

interface ConnectionStatus {
  connected: boolean;
  error?: string;
  details?: string;
  loading?: boolean;
}

interface GlobalSettingsProps {
  onSwitchTab?: (tab: string) => void;
}

/**
 * Sanitize error messages to prevent displaying raw HTML or overly technical errors
 * Returns a clean, user-friendly error message
 */
function sanitizeErrorMessage(
  error: string | undefined,
  fallbackMessage: string,
): string | undefined {
  if (!error) return undefined;

  // Detect HTML content (like 502 Bad Gateway pages)
  if (
    error.includes("<html") ||
    error.includes("<!DOCTYPE") ||
    error.includes("<head>") ||
    error.includes("<body>")
  ) {
    return "Service temporarily unavailable. Please check your server configuration.";
  }

  // Detect JSON parsing errors (indicates server returned non-JSON)
  if (error.includes("Unexpected token") || error.includes("JSON")) {
    return "Service temporarily unavailable. Please check your server configuration.";
  }

  // Detect network/connection errors
  if (
    error.includes("Failed to fetch") ||
    error.includes("NetworkError") ||
    error.includes("ECONNREFUSED")
  ) {
    return "Unable to connect to server. Please check if the service is running.";
  }

  // If error is too long (likely contains debug info), truncate it
  if (error.length > 200) {
    return fallbackMessage;
  }

  return error;
}

export default function GlobalSettings({ onSwitchTab }: GlobalSettingsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<Settings>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const [vobizStatus, setVobizStatus] = useState<ConnectionStatus>({
    connected: false,
    loading: true,
  });
  const [openaiStatus, setOpenaiStatus] = useState<ConnectionStatus>({
    connected: false,
    loading: true,
  });

  const scrollToOpenai = () => {
    document
      .getElementById("openai-credentials")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/admin/settings"],
  });

  // KYC Settings Query
  interface VoiceEngineSettings {
    twilio_kyc_required: boolean; // Reused key for backward compat — controls phone number KYC
  }

  const { data: voiceEngineSettings, isLoading: kycSettingsLoading } =
    useQuery<VoiceEngineSettings>({
      queryKey: ["/api/settings/voice-engine"],
    });

  const isKycRequired = voiceEngineSettings?.twilio_kyc_required ?? true;

  const updateKycSetting = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/settings/${key}`, {
        value: enabled,
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update setting");
      }
      return { key, enabled };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/settings/voice-engine"],
      });
      toast({
        title: "KYC setting updated",
        description: data.enabled
          ? "KYC verification is now required for phone number purchases"
          : "KYC verification is no longer required for phone number purchases",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update setting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testVobizConnection = useCallback(async () => {
    setVobizStatus((prev) => ({ ...prev, loading: true }));
    try {
      const response = await apiRequest(
        "POST",
        "/api/admin/test-connection/vobiz",
      );
      const data = await response.json();
      const sanitizedError = sanitizeErrorMessage(
        data.error,
        "Vobiz credentials not configured",
      );
      setVobizStatus({
        connected: data.connected,
        error: sanitizedError,
        loading: false,
      });
    } catch (error: any) {
      const sanitizedError = sanitizeErrorMessage(
        error.message,
        "Connection test failed",
      );
      setVobizStatus({
        connected: false,
        error: sanitizedError || "Connection test failed",
        loading: false,
      });
    }
  }, []);

  const testOpenAIConnection = useCallback(async () => {
    setOpenaiStatus((prev) => ({ ...prev, loading: true }));
    try {
      const response = await apiRequest(
        "POST",
        "/api/admin/test-connection/openai",
      );
      const data = await response.json();
      const sanitizedError = sanitizeErrorMessage(
        data.error,
        "OpenAI API key not configured",
      );
      setOpenaiStatus({
        connected: data.connected,
        error: sanitizedError,
        loading: false,
      });
    } catch (error: any) {
      const sanitizedError = sanitizeErrorMessage(
        error.message,
        "Connection test failed",
      );
      setOpenaiStatus({
        connected: false,
        error: sanitizedError || "Connection test failed",
        loading: false,
      });
    }
  }, []);

  const testAllConnections = useCallback(() => {
    testVobizConnection();
    testOpenAIConnection();
  }, [testVobizConnection, testOpenAIConnection]);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
      testAllConnections();
    }
  }, [settings]);

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      return apiRequest("PATCH", `/api/admin/settings/${key}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: any) => {
      toast({
        title: t("admin.settings.updateFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleChange = (key: keyof Settings, value: any) => {
    setFormData({
      ...formData,
      [key]: value,
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    const promises = Object.keys(formData).map((key) => {
      if (key !== "openai_configured") {
        const typedKey = key as keyof Settings;
        if (formData[typedKey] !== settings?.[typedKey]) {
          return updateSetting.mutateAsync({
            key,
            value: formData[typedKey],
          });
        }
      }
      return Promise.resolve();
    });

    try {
      await Promise.all(promises);
      toast({ title: t("admin.settings.settingsUpdated") });
      setHasChanges(false);
    } catch (error) {}
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const isAnyLoading = vobizStatus.loading || openaiStatus.loading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t("admin.settings.title")}</h2>
          <p className="text-muted-foreground">
            {t("admin.settings.description")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={testAllConnections}
          disabled={isAnyLoading}
          data-testid="button-refresh-connections"
        >
          {isAnyLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {t("admin.settings.connectionStatus.refreshAll") || "Refresh Status"}
        </Button>
      </div>

      {/* Connection Status Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Vobiz Telephony Status */}
        <Card
          className={`relative overflow-hidden border-2 ${
            vobizStatus.loading
              ? "border-muted bg-gradient-to-br from-muted/5 to-transparent"
              : vobizStatus.connected
                ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent"
                : "border-red-500/30 bg-gradient-to-br from-red-500/5 to-transparent"
          }`}
        >
          <div
            className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl ${
              vobizStatus.loading
                ? "bg-muted/20"
                : vobizStatus.connected
                  ? "bg-emerald-500/20"
                  : "bg-red-500/20"
            }`}
          />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-xl ${
                    vobizStatus.loading
                      ? "bg-muted/10 ring-1 ring-muted/20"
                      : vobizStatus.connected
                        ? "bg-emerald-500/10 ring-1 ring-emerald-500/20"
                        : "bg-red-500/10 ring-1 ring-red-500/20"
                  }`}
                >
                  {vobizStatus.loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <Phone
                      className={`h-6 w-6 ${
                        vobizStatus.connected
                          ? "text-emerald-500"
                          : "text-red-500"
                      }`}
                    />
                  )}
                </div>
                <div>
                  <CardTitle className="text-lg">Vobiz Telephony</CardTitle>
                  <CardDescription className="text-sm">
                    Indian voice telephony (SIP)
                  </CardDescription>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-medium text-sm ${
                  vobizStatus.loading
                    ? "bg-muted/10 text-muted-foreground ring-1 ring-muted/30"
                    : vobizStatus.connected
                      ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30"
                      : "bg-red-500/10 text-red-400 ring-1 ring-red-500/30"
                }`}
              >
                {vobizStatus.loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {t("admin.settings.connectionStatus.checking") ||
                        "Checking..."}
                    </span>
                  </>
                ) : vobizStatus.connected ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {t("admin.settings.connectionStatus.connected") ||
                        "Connected"}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    <span>
                      {t("admin.settings.connectionStatus.disconnected") ||
                        "Disconnected"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <p className="text-sm text-muted-foreground">
              {vobizStatus.loading
                ? "Verifying Vobiz API connection..."
                : vobizStatus.connected
                  ? "Vobiz is configured and ready for calls"
                  : vobizStatus.error ||
                    "Configure Vobiz credentials below to enable Indian telephony"}
            </p>
          </CardContent>
        </Card>

        {/* OpenAI Connection Status */}
        <Card
          className={`relative overflow-hidden border-2 ${
            openaiStatus.loading
              ? "border-muted bg-gradient-to-br from-muted/5 to-transparent"
              : openaiStatus.connected
                ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent"
                : "border-red-500/30 bg-gradient-to-br from-red-500/5 to-transparent"
          }`}
        >
          <div
            className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl ${
              openaiStatus.loading
                ? "bg-muted/20"
                : openaiStatus.connected
                  ? "bg-emerald-500/20"
                  : "bg-red-500/20"
            }`}
          />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-xl ${
                    openaiStatus.loading
                      ? "bg-muted/10 ring-1 ring-muted/20"
                      : openaiStatus.connected
                        ? "bg-emerald-500/10 ring-1 ring-emerald-500/20"
                        : "bg-red-500/10 ring-1 ring-red-500/20"
                  }`}
                >
                  {openaiStatus.loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <svg
                      className={`h-6 w-6 ${openaiStatus.connected ? "text-emerald-500" : "text-red-500"}`}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
                    </svg>
                  )}
                </div>
                <div>
                  <CardTitle className="text-lg">
                    {t("admin.settings.openai.title") || "OpenAI API"}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {t("admin.settings.connectionStatus.embeddings") ||
                      "Embeddings & RAG"}
                  </CardDescription>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-medium text-sm ${
                  openaiStatus.loading
                    ? "bg-muted/10 text-muted-foreground ring-1 ring-muted/30"
                    : openaiStatus.connected
                      ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30"
                      : "bg-red-500/10 text-red-400 ring-1 ring-red-500/30"
                }`}
              >
                {openaiStatus.loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {t("admin.settings.connectionStatus.checking") ||
                        "Checking..."}
                    </span>
                  </>
                ) : openaiStatus.connected ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {t("admin.settings.connectionStatus.connected") ||
                        "Connected"}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    <span>
                      {t("admin.settings.connectionStatus.disconnected") ||
                        "Disconnected"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {openaiStatus.loading
                  ? t("admin.settings.connectionStatus.verifying") ||
                    "Verifying API connection..."
                  : openaiStatus.connected
                    ? t("admin.settings.connectionStatus.openaiReady") ||
                      "OpenAI is configured for RAG embeddings"
                    : openaiStatus.error ||
                      t("admin.settings.connectionStatus.openaiSetup") ||
                      "Configure OpenAI API key for embeddings"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={scrollToOpenai}
                className="shrink-0"
                data-testid="button-edit-openai"
              >
                <Pencil className="h-4 w-4 mr-2" />
                {t("admin.settings.connectionStatus.edit") || "Edit"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 1. Branding Settings */}
      <BrandingSettings />

      {/* 2. Vobiz Telephony Settings */}
      <VobizSettings />

      {/* 3. OpenAI API Credentials */}
      <Card id="openai-credentials">
        <CardHeader>
          <CardTitle>{t("admin.settings.openai.title")}</CardTitle>
          <CardDescription>
            {t("admin.settings.openai.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center">
              <Label>{t("admin.settings.openai.apiKey")}</Label>
              <InfoTooltip content={t("admin.settings.openai.apiKeyTooltip")} />
            </div>
            <Input
              type="password"
              value={formData.openai_api_key || ""}
              onChange={(e) => handleChange("openai_api_key", e.target.value)}
              placeholder={t("admin.settings.openai.apiKeyPlaceholder")}
              data-testid="input-openai-key"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("admin.settings.openai.apiKeyFormat")}
            </p>
          </div>
          {settings?.openai_configured && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm text-green-600">
                {formData.openai_api_key
                  ? t("admin.settings.openai.configuredViaDb")
                  : t("admin.settings.openai.configuredViaEnv")}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* 4. SMTP Email Settings */}
      <SMTPSettings />

      {/* 5-8. Plan Settings, Pricing, System Resources, System Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 5. Plan Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.settings.planSettings.title")}</CardTitle>
            <CardDescription>
              {t("admin.settings.planSettings.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center">
                <Label>{t("admin.settings.planSettings.defaultLlm")}</Label>
                <InfoTooltip
                  content={t("admin.settings.planSettings.defaultLlmTooltip")}
                />
              </div>
              <Input
                value={formData.default_llm_free || ""}
                onChange={(e) =>
                  handleChange("default_llm_free", e.target.value)
                }
                placeholder={t(
                  "admin.settings.planSettings.defaultLlmPlaceholder",
                )}
                data-testid="input-default-llm"
              />
            </div>
            <div>
              <div className="flex items-center">
                <Label>{t("admin.settings.planSettings.bonusCredits")}</Label>
                <InfoTooltip
                  content={t("admin.settings.planSettings.bonusCreditsTooltip")}
                />
              </div>
              <Input
                type="number"
                value={formData.pro_plan_bonus_credits || 0}
                onChange={(e) =>
                  handleChange(
                    "pro_plan_bonus_credits",
                    parseInt(e.target.value) || 0,
                  )
                }
                data-testid="input-bonus-credits"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin.settings.planSettings.bonusCreditsHint")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 6. Pricing Settings - only Credit Price, Phone Monthly Cost, Min Purchase */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.settings.pricing.title")}</CardTitle>
            <CardDescription>
              {t("admin.settings.pricing.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center">
                <Label>{t("admin.settings.pricing.creditPrice")}</Label>
                <InfoTooltip
                  content={t("admin.settings.pricing.creditPriceTooltip")}
                />
              </div>
              <Input
                type="number"
                step="0.01"
                value={formData.credit_price_per_minute || 0}
                onChange={(e) =>
                  handleChange(
                    "credit_price_per_minute",
                    parseFloat(e.target.value) || 0,
                  )
                }
                data-testid="input-credit-price"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin.settings.pricing.creditPriceHint")}
              </p>
            </div>
            <div>
              <div className="flex items-center">
                <Label>{t("admin.settings.pricing.minPurchase")}</Label>
                <InfoTooltip
                  content={t("admin.settings.pricing.minPurchaseTooltip")}
                />
              </div>
              <Input
                type="number"
                value={formData.min_credit_purchase || 10}
                onChange={(e) =>
                  handleChange(
                    "min_credit_purchase",
                    parseInt(e.target.value) || 10,
                  )
                }
                data-testid="input-min-purchase"
              />
            </div>
          </CardContent>
        </Card>

        {/* 7. Invoice Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Settings</CardTitle>
            <CardDescription>
              Configure invoice numbering format and series
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center">
                <Label>Invoice Prefix</Label>
                <InfoTooltip content="Prefix for invoice numbers (e.g., 'INV' creates INV-2025-00001)" />
              </div>
              <Input
                value={formData.invoice_prefix || "INV"}
                onChange={(e) =>
                  handleChange("invoice_prefix", e.target.value.toUpperCase())
                }
                placeholder="INV"
                data-testid="input-invoice-prefix"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: PREFIX-YEAR-NUMBER (e.g., INV-2025-00001)
              </p>
            </div>
            <div>
              <div className="flex items-center">
                <Label>Starting Number</Label>
                <InfoTooltip content="Starting number for the invoice series. Leave at 1 to continue from existing invoices." />
              </div>
              <Input
                type="number"
                min="1"
                value={formData.invoice_start_number || 1}
                onChange={(e) =>
                  handleChange(
                    "invoice_start_number",
                    parseInt(e.target.value) || 1,
                  )
                }
                data-testid="input-invoice-start"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used only when no invoices exist for the current year
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 8. KYC Verification Requirements */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5" />
              <div>
                <CardTitle className="text-lg">
                  KYC Verification Requirements
                </CardTitle>
                <CardDescription>
                  Control whether users must complete KYC verification before
                  purchasing phone numbers
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Phone Number Purchases</p>
                <p className="text-xs text-muted-foreground">
                  Require KYC verification before users can purchase phone
                  numbers
                </p>
              </div>
              {kycSettingsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <div className="flex items-center gap-3">
                  <Label
                    htmlFor="kyc-toggle"
                    className="text-sm text-muted-foreground"
                  >
                    {isKycRequired ? "Required" : "Not Required"}
                  </Label>
                  <Switch
                    id="kyc-toggle"
                    checked={isKycRequired}
                    onCheckedChange={(checked) =>
                      updateKycSetting.mutate({
                        key: "twilio_kyc_required",
                        enabled: checked,
                      })
                    }
                    disabled={updateKycSetting.isPending}
                    data-testid="switch-kyc-required"
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              When enabled, users must upload and have their KYC documents
              approved in their Profile before purchasing phone numbers.
              Required documents: Photo ID, Company Registration, GST
              Certificate, and Authorization Letter.
            </p>
          </CardContent>
        </Card>

        {/* 9. Demo Call Widget Settings */}
        <DemoCallSettings />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateSetting.isPending}
          data-testid="button-save-settings"
        >
          {updateSetting.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("admin.settings.saving")}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {t("admin.settings.saveSettings")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function DemoCallSettings() {
  const { toast } = useToast();

  interface DemoSettings {
    demo_widget_enabled: boolean;
    demo_max_duration: number;
    demo_cooldown_minutes: number;
    demo_max_concurrent: number;
    demo_system_prompt: string;
    demo_knowledge_base_ids: string[];
    landing_widget_token: string;
  }

  interface KnowledgeBaseItem {
    id: string;
    title: string;
    type: string;
  }

  const [localMaxDuration, setLocalMaxDuration] = useState<string>("60");
  const [localCooldown, setLocalCooldown] = useState<string>("5");
  const [localMaxConcurrent, setLocalMaxConcurrent] = useState<string>("10");
  const [localSystemPrompt, setLocalSystemPrompt] = useState<string>("");
  const [selectedKBs, setSelectedKBs] = useState<string[]>([]);
  const [localWidgetToken, setLocalWidgetToken] = useState<string>("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const { data: demoSettings, isLoading } = useQuery<DemoSettings>({
    queryKey: ["/api/admin/settings/demo"],
  });

  const { data: knowledgeBases } = useQuery<KnowledgeBaseItem[]>({
    queryKey: ["/api/rag-knowledge"],
  });

  useEffect(() => {
    if (demoSettings) {
      if (focusedField !== "maxDuration") {
        setLocalMaxDuration(String(demoSettings.demo_max_duration ?? 60));
      }
      if (focusedField !== "cooldown") {
        setLocalCooldown(String(demoSettings.demo_cooldown_minutes ?? 5));
      }
      if (focusedField !== "maxConcurrent") {
        setLocalMaxConcurrent(String(demoSettings.demo_max_concurrent ?? 10));
      }
      if (focusedField !== "systemPrompt") {
        setLocalSystemPrompt(demoSettings.demo_system_prompt ?? "");
      }
      setSelectedKBs(demoSettings.demo_knowledge_base_ids ?? []);
      if (focusedField !== "widgetToken") {
        setLocalWidgetToken(demoSettings.landing_widget_token ?? "");
      }
    }
  }, [demoSettings, focusedField]);

  const updateDemoSetting = useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: string;
      value: boolean | number | string | string[];
    }) => {
      const res = await apiRequest("PATCH", `/api/admin/settings/${key}`, {
        value,
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update setting");
      }
      return { key, value };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/demo"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/demo-config"] });
      toast({ title: "Demo setting updated" });
    },
    onError: (error: any, variables) => {
      if (variables.key === "demo_knowledge_base_ids") {
        setSelectedKBs(demoSettings?.demo_knowledge_base_ids ?? []);
      }
      toast({
        title: "Failed to update setting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isEnabled = demoSettings?.demo_widget_enabled ?? false;

  const handleNumberBlur = (
    key: string,
    localValue: string,
    min: number,
    max: number,
    defaultVal: number,
    setLocal: (val: string) => void,
  ) => {
    const parsed = parseInt(localValue) || defaultVal;
    const clamped = Math.max(min, Math.min(max, parsed));
    setLocal(String(clamped));
    updateDemoSetting.mutate({ key, value: clamped });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <Phone className="h-5 w-5" />
          <div>
            <CardTitle className="text-lg">Demo Call Widget</CardTitle>
            <CardDescription>
              Allow website visitors to try your AI voice agent directly in
              their browser
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable Demo Widget</p>
            <p className="text-xs text-muted-foreground">
              Show "Try Demo Call" button on the landing page
            </p>
          </div>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex items-center gap-3">
              <Label
                htmlFor="demo-enabled-toggle"
                className="text-sm text-muted-foreground"
              >
                {isEnabled ? "Enabled" : "Disabled"}
              </Label>
              <Switch
                id="demo-enabled-toggle"
                checked={isEnabled}
                onCheckedChange={(checked) =>
                  updateDemoSetting.mutate({
                    key: "demo_widget_enabled",
                    value: checked,
                  })
                }
                disabled={updateDemoSetting.isPending}
                data-testid="switch-demo-enabled"
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="landing-widget-token">Website Widget Token</Label>
          <p className="text-xs text-muted-foreground">
            If set, the landing page will show the embeddable website widget instead of the demo call widget. Leave empty to use the default demo call widget.
          </p>
          <Input
            id="landing-widget-token"
            type="text"
            placeholder="wgt_xxx..."
            maxLength={100}
            value={localWidgetToken}
            onChange={(e) => setLocalWidgetToken(e.target.value)}
            onFocus={() => setFocusedField("widgetToken")}
            onBlur={() => {
              setFocusedField(null);
              updateDemoSetting.mutate({
                key: "landing_widget_token",
                value: localWidgetToken.trim(),
              });
            }}
            disabled={updateDemoSetting.isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="demo-max-duration">Max Duration (seconds)</Label>
            <Input
              id="demo-max-duration"
              type="number"
              min={10}
              max={300}
              value={localMaxDuration}
              onChange={(e) => setLocalMaxDuration(e.target.value)}
              onFocus={() => setFocusedField("maxDuration")}
              onBlur={() => {
                setFocusedField(null);
                handleNumberBlur(
                  "demo_max_duration",
                  localMaxDuration,
                  10,
                  300,
                  60,
                  setLocalMaxDuration,
                );
              }}
              data-testid="input-demo-max-duration"
            />
            <p className="text-xs text-muted-foreground">10-300 seconds</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-cooldown">Cooldown (minutes)</Label>
            <Input
              id="demo-cooldown"
              type="number"
              min={1}
              max={60}
              value={localCooldown}
              onChange={(e) => setLocalCooldown(e.target.value)}
              onFocus={() => setFocusedField("cooldown")}
              onBlur={() => {
                setFocusedField(null);
                handleNumberBlur(
                  "demo_cooldown_minutes",
                  localCooldown,
                  1,
                  60,
                  5,
                  setLocalCooldown,
                );
              }}
              data-testid="input-demo-cooldown"
            />
            <p className="text-xs text-muted-foreground">
              Wait time between calls per IP
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="demo-max-concurrent">Max Concurrent Sessions</Label>
            <Input
              id="demo-max-concurrent"
              type="number"
              min={1}
              max={100}
              value={localMaxConcurrent}
              onChange={(e) => setLocalMaxConcurrent(e.target.value)}
              onFocus={() => setFocusedField("maxConcurrent")}
              onBlur={() => {
                setFocusedField(null);
                handleNumberBlur(
                  "demo_max_concurrent",
                  localMaxConcurrent,
                  1,
                  100,
                  10,
                  setLocalMaxConcurrent,
                );
              }}
              data-testid="input-demo-max-concurrent"
            />
            <p className="text-xs text-muted-foreground">1-100 sessions</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="demo-system-prompt">System Prompt</Label>
          <textarea
            id="demo-system-prompt"
            className="w-full min-h-[100px] p-3 border rounded-md bg-background text-sm resize-y"
            placeholder="You are a helpful AI assistant demonstrating the capabilities of our voice AI platform..."
            value={localSystemPrompt}
            onChange={(e) => setLocalSystemPrompt(e.target.value)}
            onFocus={() => setFocusedField("systemPrompt")}
            onBlur={() => {
              setFocusedField(null);
              if (
                localSystemPrompt !== (demoSettings?.demo_system_prompt ?? "")
              ) {
                updateDemoSetting.mutate({
                  key: "demo_system_prompt",
                  value: localSystemPrompt,
                });
              }
            }}
            data-testid="textarea-demo-system-prompt"
          />
          <p className="text-xs text-muted-foreground">
            Define the AI agent's personality and behavior for demo calls
          </p>
        </div>

        <div className="space-y-3">
          <Label>Knowledge Base (Optional)</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Select knowledge bases to provide context to the AI during demo
            calls
          </p>
          {knowledgeBases && knowledgeBases.length > 0 ? (
            <div
              className={`space-y-2 max-h-48 overflow-y-auto border rounded-md p-3 ${updateDemoSetting.isPending ? "opacity-60 pointer-events-none" : ""}`}
            >
              {knowledgeBases.map((kb) => (
                <label
                  key={kb.id}
                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedKBs.includes(kb.id)}
                    disabled={updateDemoSetting.isPending}
                    onChange={(e) => {
                      const newSelection = e.target.checked
                        ? [...selectedKBs, kb.id]
                        : selectedKBs.filter((id) => id !== kb.id);
                      setSelectedKBs(newSelection);
                      updateDemoSetting.mutate({
                        key: "demo_knowledge_base_ids",
                        value: newSelection,
                      });
                    }}
                    className="rounded border-input"
                    data-testid={`checkbox-kb-${kb.id}`}
                  />
                  <span className="text-sm">{kb.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {kb.type}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No knowledge bases available. Add content in the Knowledge Base
              section first.
            </p>
          )}
          {updateDemoSetting.isPending && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving...
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground border-t pt-4">
          Demo calls use OpenAI Realtime API. Visitors can choose from available
          languages and voices before starting a call. Each demo session is
          rate-limited by IP address to prevent abuse.
        </p>
      </CardContent>
    </Card>
  );
}

function VobizSettings() {
  const { toast } = useToast();
  const [authId, setAuthId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [sipDomain, setSipDomain] = useState("");
  const [sipUsername, setSipUsername] = useState("");
  const [sipPassword, setSipPassword] = useState("");
  const [trunkId, setTrunkId] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const {
    data: settings,
    isLoading,
    error: loadError,
  } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/settings/vobiz"],
    retry: 2,
  });

  useEffect(() => {
    if (settings) {
      setAuthId(settings.vobiz_auth_id || "");
      setAuthToken(settings.vobiz_auth_token || "");
      setSipDomain(settings.vobiz_sip_domain || "");
      setSipUsername(settings.vobiz_sip_username || "");
      setSipPassword(settings.vobiz_sip_password || "");
      setTrunkId(settings.vobiz_trunk_id || "");
      setHasChanges(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/settings/vobiz", {
        authId,
        authToken,
        sipDomain,
        sipUsername,
        sipPassword,
        trunkId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/settings/vobiz"],
      });
      setHasChanges(false);
      toast({
        title: "Saved",
        description: data?.verified
          ? "Vobiz credentials saved and verified."
          : "Vobiz credentials saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save.",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/settings/vobiz/test", {
        authId,
        authToken,
      });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.valid) {
        toast({
          title: "Connection Successful",
          description: `Connected to Vobiz account: ${result.accountId}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Connection Failed",
          description: result.error || "Could not connect to Vobiz.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Test Failed",
        description: error.message,
      });
    },
  });

  const isConfigured = !!(
    settings?.vobiz_auth_id && settings?.vobiz_auth_token
  );
  const markChanged = () => setHasChanges(true);

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </Card>
    );
  }

  return (
    <Card id="vobiz-credentials">
      {loadError && (
        <div className="mx-6 mt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load Vobiz settings: {(loadError as Error).message}.
              Your saved credentials may still exist — try refreshing the page.
            </AlertDescription>
          </Alert>
        </div>
      )}
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Vobiz Telephony</CardTitle>
            <CardDescription>
              Configure Vobiz credentials for Indian phone numbers and SIP
              trunking.
            </CardDescription>
          </div>
          {isConfigured && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium ring-1 ring-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" /> Configured
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Auth ID</Label>
            <Input
              placeholder="Your Vobiz Auth ID"
              value={authId}
              onChange={(e) => {
                setAuthId(e.target.value);
                markChanged();
              }}
              data-testid="input-vobiz-auth-id"
            />
          </div>
          <div className="space-y-2">
            <Label>Auth Token</Label>
            <div className="relative">
              <Input
                type={showSecrets ? "text" : "password"}
                placeholder="Your Vobiz Auth Token"
                value={authToken}
                onChange={(e) => {
                  setAuthToken(e.target.value);
                  markChanged();
                }}
                data-testid="input-vobiz-auth-token"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowSecrets(!showSecrets)}
              >
                {showSecrets ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-3">SIP Configuration</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SIP Domain</Label>
              <Input
                placeholder="e.g. 5f3a607b.sip.vobiz.ai"
                value={sipDomain}
                onChange={(e) => {
                  setSipDomain(e.target.value);
                  markChanged();
                }}
                data-testid="input-vobiz-sip-domain"
              />
            </div>
            <div className="space-y-2">
              <Label>Trunk ID</Label>
              <Input
                placeholder="Vobiz trunk ID (optional)"
                value={trunkId}
                onChange={(e) => {
                  setTrunkId(e.target.value);
                  markChanged();
                }}
                data-testid="input-vobiz-trunk-id"
              />
            </div>
            <div className="space-y-2">
              <Label>SIP Username</Label>
              <Input
                placeholder="SIP auth username"
                value={sipUsername}
                onChange={(e) => {
                  setSipUsername(e.target.value);
                  markChanged();
                }}
                data-testid="input-vobiz-sip-username"
              />
            </div>
            <div className="space-y-2">
              <Label>SIP Password</Label>
              <Input
                type={showSecrets ? "text" : "password"}
                placeholder="SIP auth password"
                value={sipPassword}
                onChange={(e) => {
                  setSipPassword(e.target.value);
                  markChanged();
                }}
                data-testid="input-vobiz-sip-password"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !authId || !authToken}
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Activity className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={
              saveMutation.isPending || !authId || !authToken || !hasChanges
            }
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>

        <VobizPhoneNumbers />
      </CardContent>
    </Card>
  );
}

function VobizPhoneNumbers() {
  const { toast } = useToast();
  const [newNumber, setNewNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const { data: vobizNumbers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/phone-numbers/vobiz"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/phone-numbers/add-manual",
        {
          phoneNumber: newNumber.trim(),
          friendlyName: newLabel.trim() || undefined,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/phone-numbers/vobiz"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      setNewNumber("");
      setNewLabel("");
      toast({
        title: "Phone number added",
        description: "Number is now available for outbound and inbound calls.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to add number",
        description: error.message,
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "DELETE",
        `/api/admin/phone-numbers/vobiz/${id}`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/phone-numbers/vobiz"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/phone-numbers"] });
      toast({ title: "Phone number removed" });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to remove number",
        description: error.message,
      });
    },
  });

  const provisionTrunkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/phone-numbers/vobiz/provision-trunk",
      );
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Outbound trunk ready",
        description: `LiveKit SIP trunk: ${data.trunkId}`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Trunk provisioning failed",
        description: error.message,
      });
    },
  });

  const isValidNumber = /^\+\d{10,15}$/.test(newNumber.replace(/\s+/g, ""));

  return (
    <div className="border-t pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">Phone Numbers</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => provisionTrunkMutation.mutate()}
          disabled={provisionTrunkMutation.isPending}
        >
          {provisionTrunkMutation.isPending ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : null}
          Provision Outbound Trunk
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Add your Vobiz phone numbers manually. These will be available for
        outbound campaigns and inbound routing.
      </p>

      <div className="flex gap-2 mb-3">
        <Input
          placeholder="+919876543210"
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          className="flex-1"
          data-testid="input-vobiz-add-number"
        />
        <Input
          placeholder="Label (optional)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="w-40"
          data-testid="input-vobiz-add-label"
        />
        <Button
          size="sm"
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending || !isValidNumber}
        >
          {addMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : vobizNumbers.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          No Vobiz phone numbers added yet.
        </p>
      ) : (
        <div className="space-y-2">
          {vobizNumbers.map((pn: any) => (
            <div
              key={pn.id}
              className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-mono">{pn.phoneNumber}</span>
                {pn.friendlyName && pn.friendlyName !== pn.phoneNumber && (
                  <span className="text-xs text-muted-foreground">
                    ({pn.friendlyName})
                  </span>
                )}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${pn.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-gray-500/10 text-gray-500"}`}
                >
                  {pn.status}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => removeMutation.mutate(pn.id)}
                disabled={removeMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
