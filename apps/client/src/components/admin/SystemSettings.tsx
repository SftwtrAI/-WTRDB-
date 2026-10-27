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
import { useState, useEffect } from "react";
import {
  Loader2,
  Save,
  Shield,
  Timer,
  Clock,
  Webhook,
  CreditCard,
  Bell,
  Key,
  RefreshCw,
  Phone,
  Wrench,
  Server,
  Database,
  Activity,
  Cpu,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface SystemSettingsData {
  jwt_expiry_days: number;
  otp_expiry_minutes: number;
  password_reset_expiry_minutes: number;
  phone_number_monthly_credits: number;
  low_credits_threshold: number;
  webhook_retry_max_attempts: number;
  webhook_retry_intervals_minutes: number[];
  webhook_expiry_hours: number;
  system_phone_pool_size: number;
  // Connection Limits
  max_ws_connections_per_process: number;
  max_ws_connections_per_user: number;
  max_ws_connections_per_ip: number;
  max_openai_connections_per_credential: number;
  openai_connection_timeout_ms: number;
  openai_idle_timeout_ms: number;
  db_pool_min_connections: number;
  db_pool_max_connections: number;
  db_pool_idle_timeout_ms: number;
  campaign_batch_concurrency: number;
}

const DEFAULT_SETTINGS: SystemSettingsData = {
  jwt_expiry_days: 7,
  otp_expiry_minutes: 5,
  password_reset_expiry_minutes: 5,
  phone_number_monthly_credits: 50,
  low_credits_threshold: 50,
  webhook_retry_max_attempts: 5,
  webhook_retry_intervals_minutes: [1, 5, 15, 30, 60],
  webhook_expiry_hours: 24,
  system_phone_pool_size: 5,
  max_ws_connections_per_process: 1000,
  max_ws_connections_per_user: 5,
  max_ws_connections_per_ip: 10,
  max_openai_connections_per_credential: 50,
  openai_connection_timeout_ms: 3600000,
  openai_idle_timeout_ms: 300000,
  db_pool_min_connections: 2,
  db_pool_max_connections: 20,
  db_pool_idle_timeout_ms: 30000,
  campaign_batch_concurrency: 10,
};

export default function SystemSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [formData, setFormData] =
    useState<SystemSettingsData>(DEFAULT_SETTINGS);
  const [originalData, setOriginalData] =
    useState<SystemSettingsData>(DEFAULT_SETTINGS);
  const [webhookIntervalsStr, setWebhookIntervalsStr] =
    useState("1, 5, 15, 30, 60");
  const [originalIntervalsStr, setOriginalIntervalsStr] =
    useState("1, 5, 15, 30, 60");
  const [hasChanges, setHasChanges] = useState(false);
  const [syncingAllCalls, setSyncingAllCalls] = useState(false);
  const [syncingWebhooks, setSyncingWebhooks] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    data: settings,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["/api/admin/system-settings"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/system-settings");
      if (!response.ok) {
        throw new Error("Failed to fetch system settings");
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (settings) {
      const newFormData = {
        jwt_expiry_days:
          settings.jwt_expiry_days ?? DEFAULT_SETTINGS.jwt_expiry_days,
        otp_expiry_minutes:
          settings.otp_expiry_minutes ?? DEFAULT_SETTINGS.otp_expiry_minutes,
        password_reset_expiry_minutes:
          settings.password_reset_expiry_minutes ??
          DEFAULT_SETTINGS.password_reset_expiry_minutes,
        phone_number_monthly_credits:
          settings.phone_number_monthly_credits ??
          DEFAULT_SETTINGS.phone_number_monthly_credits,
        low_credits_threshold:
          settings.low_credits_threshold ??
          DEFAULT_SETTINGS.low_credits_threshold,
        webhook_retry_max_attempts:
          settings.webhook_retry_max_attempts ??
          DEFAULT_SETTINGS.webhook_retry_max_attempts,
        webhook_retry_intervals_minutes:
          settings.webhook_retry_intervals_minutes ??
          DEFAULT_SETTINGS.webhook_retry_intervals_minutes,
        webhook_expiry_hours:
          settings.webhook_expiry_hours ??
          DEFAULT_SETTINGS.webhook_expiry_hours,
        system_phone_pool_size:
          settings.system_phone_pool_size ??
          DEFAULT_SETTINGS.system_phone_pool_size,
        max_ws_connections_per_process:
          settings.max_ws_connections_per_process ??
          DEFAULT_SETTINGS.max_ws_connections_per_process,
        max_ws_connections_per_user:
          settings.max_ws_connections_per_user ??
          DEFAULT_SETTINGS.max_ws_connections_per_user,
        max_ws_connections_per_ip:
          settings.max_ws_connections_per_ip ??
          DEFAULT_SETTINGS.max_ws_connections_per_ip,
        max_openai_connections_per_credential:
          settings.max_openai_connections_per_credential ??
          DEFAULT_SETTINGS.max_openai_connections_per_credential,
        openai_connection_timeout_ms:
          settings.openai_connection_timeout_ms ??
          DEFAULT_SETTINGS.openai_connection_timeout_ms,
        openai_idle_timeout_ms:
          settings.openai_idle_timeout_ms ??
          DEFAULT_SETTINGS.openai_idle_timeout_ms,
        db_pool_min_connections:
          settings.db_pool_min_connections ??
          DEFAULT_SETTINGS.db_pool_min_connections,
        db_pool_max_connections:
          settings.db_pool_max_connections ??
          DEFAULT_SETTINGS.db_pool_max_connections,
        db_pool_idle_timeout_ms:
          settings.db_pool_idle_timeout_ms ??
          DEFAULT_SETTINGS.db_pool_idle_timeout_ms,
        campaign_batch_concurrency:
          settings.campaign_batch_concurrency ??
          DEFAULT_SETTINGS.campaign_batch_concurrency,
      };
      setFormData(newFormData);
      setOriginalData(newFormData);
      const intervalsStr =
        newFormData.webhook_retry_intervals_minutes.join(", ");
      setWebhookIntervalsStr(intervalsStr);
      setOriginalIntervalsStr(intervalsStr);
      setHasChanges(false);
    }
  }, [settings]);

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/settings/${key}`, {
        value,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update setting");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/system-settings"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      const intervals = webhookIntervalsStr
        .split(",")
        .map((s) => parseInt(s.trim()))
        .filter((n) => !isNaN(n));
      const originalIntervals = originalIntervalsStr
        .split(",")
        .map((s) => parseInt(s.trim()))
        .filter((n) => !isNaN(n));

      // Only update settings that have actually changed
      const changedSettings: { key: string; value: any }[] = [];

      if (formData.jwt_expiry_days !== originalData.jwt_expiry_days) {
        changedSettings.push({
          key: "jwt_expiry_days",
          value: formData.jwt_expiry_days,
        });
      }
      if (formData.otp_expiry_minutes !== originalData.otp_expiry_minutes) {
        changedSettings.push({
          key: "otp_expiry_minutes",
          value: formData.otp_expiry_minutes,
        });
      }
      if (
        formData.password_reset_expiry_minutes !==
        originalData.password_reset_expiry_minutes
      ) {
        changedSettings.push({
          key: "password_reset_expiry_minutes",
          value: formData.password_reset_expiry_minutes,
        });
      }
      if (
        formData.phone_number_monthly_credits !==
        originalData.phone_number_monthly_credits
      ) {
        changedSettings.push({
          key: "phone_number_monthly_credits",
          value: formData.phone_number_monthly_credits,
        });
      }
      if (
        formData.low_credits_threshold !== originalData.low_credits_threshold
      ) {
        changedSettings.push({
          key: "low_credits_threshold",
          value: formData.low_credits_threshold,
        });
      }
      if (
        formData.webhook_retry_max_attempts !==
        originalData.webhook_retry_max_attempts
      ) {
        changedSettings.push({
          key: "webhook_retry_max_attempts",
          value: formData.webhook_retry_max_attempts,
        });
      }
      if (JSON.stringify(intervals) !== JSON.stringify(originalIntervals)) {
        changedSettings.push({
          key: "webhook_retry_intervals_minutes",
          value: intervals,
        });
      }
      if (formData.webhook_expiry_hours !== originalData.webhook_expiry_hours) {
        changedSettings.push({
          key: "webhook_expiry_hours",
          value: formData.webhook_expiry_hours,
        });
      }
      if (
        formData.system_phone_pool_size !== originalData.system_phone_pool_size
      ) {
        changedSettings.push({
          key: "system_phone_pool_size",
          value: formData.system_phone_pool_size,
        });
      }
      if (
        formData.max_ws_connections_per_process !==
        originalData.max_ws_connections_per_process
      ) {
        changedSettings.push({
          key: "max_ws_connections_per_process",
          value: formData.max_ws_connections_per_process,
        });
      }
      if (
        formData.max_ws_connections_per_user !==
        originalData.max_ws_connections_per_user
      ) {
        changedSettings.push({
          key: "max_ws_connections_per_user",
          value: formData.max_ws_connections_per_user,
        });
      }
      if (
        formData.max_ws_connections_per_ip !==
        originalData.max_ws_connections_per_ip
      ) {
        changedSettings.push({
          key: "max_ws_connections_per_ip",
          value: formData.max_ws_connections_per_ip,
        });
      }
      if (
        formData.max_openai_connections_per_credential !==
        originalData.max_openai_connections_per_credential
      ) {
        changedSettings.push({
          key: "max_openai_connections_per_credential",
          value: formData.max_openai_connections_per_credential,
        });
      }
      if (
        formData.openai_connection_timeout_ms !==
        originalData.openai_connection_timeout_ms
      ) {
        changedSettings.push({
          key: "openai_connection_timeout_ms",
          value: formData.openai_connection_timeout_ms,
        });
      }
      if (
        formData.openai_idle_timeout_ms !== originalData.openai_idle_timeout_ms
      ) {
        changedSettings.push({
          key: "openai_idle_timeout_ms",
          value: formData.openai_idle_timeout_ms,
        });
      }
      if (
        formData.db_pool_min_connections !==
        originalData.db_pool_min_connections
      ) {
        changedSettings.push({
          key: "db_pool_min_connections",
          value: formData.db_pool_min_connections,
        });
      }
      if (
        formData.db_pool_max_connections !==
        originalData.db_pool_max_connections
      ) {
        changedSettings.push({
          key: "db_pool_max_connections",
          value: formData.db_pool_max_connections,
        });
      }
      if (
        formData.db_pool_idle_timeout_ms !==
        originalData.db_pool_idle_timeout_ms
      ) {
        changedSettings.push({
          key: "db_pool_idle_timeout_ms",
          value: formData.db_pool_idle_timeout_ms,
        });
      }
      if (
        formData.campaign_batch_concurrency !==
        originalData.campaign_batch_concurrency
      ) {
        changedSettings.push({
          key: "campaign_batch_concurrency",
          value: formData.campaign_batch_concurrency,
        });
      }

      if (changedSettings.length === 0) {
        toast({
          title: "No Changes",
          description: "No settings were modified.",
        });
        setIsSaving(false);
        return;
      }

      // Update all changed settings in parallel using Promise.allSettled
      // to handle partial failures gracefully
      const results = await Promise.allSettled(
        changedSettings.map(async (setting) => {
          const response = await apiRequest(
            "PATCH",
            `/api/admin/settings/${setting.key}`,
            { value: setting.value },
          );
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.error || `Failed to update ${setting.key}`,
            );
          }
          return { key: setting.key, result: await response.json() };
        }),
      );

      // Count successes and failures
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected");

      // Invalidate query caches and refetch to sync state
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/system-settings"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      await refetch();

      if (failed.length === 0) {
        setHasChanges(false);
        toast({
          title: "Settings Saved",
          description: `${succeeded} setting(s) updated successfully.`,
        });
      } else if (succeeded > 0) {
        toast({
          title: "Partial Save",
          description: `${succeeded} setting(s) saved, ${failed.length} failed. Please try again.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Save Failed",
          description: "Could not save settings. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Save Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (
    key: keyof SystemSettingsData,
    value: number | string,
  ) => {
    setHasChanges(true);
    if (key === "webhook_retry_intervals_minutes") {
      setWebhookIntervalsStr(value as string);
    } else {
      setFormData((prev) => ({
        ...prev,
        [key]: typeof value === "string" ? parseInt(value) || 0 : value,
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">System Configuration</h3>
          <p className="text-sm text-muted-foreground">
            Configure security, credits, and webhook settings for the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-settings"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={isSaving || !hasChanges}
            data-testid="button-save-all-settings"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save All Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Security Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              Security Settings
            </CardTitle>
            <CardDescription>
              Authentication and security token expiration times
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="jwt_expiry_days"
                className="flex items-center gap-2"
              >
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                JWT Token Expiry
                <InfoTooltip content="How long users stay logged in before needing to sign in again" />
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="jwt_expiry_days"
                  type="number"
                  min={1}
                  max={90}
                  value={formData.jwt_expiry_days}
                  onChange={(e) =>
                    handleInputChange("jwt_expiry_days", e.target.value)
                  }
                  className="w-24"
                  data-testid="input-jwt-expiry"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label
                htmlFor="otp_expiry_minutes"
                className="flex items-center gap-2"
              >
                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                OTP Verification Expiry
                <InfoTooltip content="Time before email verification codes expire" />
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="otp_expiry_minutes"
                  type="number"
                  min={1}
                  max={60}
                  value={formData.otp_expiry_minutes}
                  onChange={(e) =>
                    handleInputChange("otp_expiry_minutes", e.target.value)
                  }
                  className="w-24"
                  data-testid="input-otp-expiry"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label
                htmlFor="password_reset_expiry"
                className="flex items-center gap-2"
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Password Reset Expiry
                <InfoTooltip content="Time before password reset codes expire" />
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="password_reset_expiry"
                  type="number"
                  min={1}
                  max={60}
                  value={formData.password_reset_expiry_minutes}
                  onChange={(e) =>
                    handleInputChange(
                      "password_reset_expiry_minutes",
                      e.target.value,
                    )
                  }
                  className="w-24"
                  data-testid="input-password-reset-expiry"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credits Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-primary" />
              Credits & Billing
            </CardTitle>
            <CardDescription>
              Phone billing and credit notification thresholds
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="phone_monthly_credits"
                className="flex items-center gap-2"
              >
                Phone Number Monthly Cost
                <InfoTooltip content="Credits deducted monthly for each rented phone number" />
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="phone_monthly_credits"
                  type="number"
                  min={0}
                  max={1000}
                  value={formData.phone_number_monthly_credits}
                  onChange={(e) =>
                    handleInputChange(
                      "phone_number_monthly_credits",
                      e.target.value,
                    )
                  }
                  className="w-24"
                  data-testid="input-phone-monthly-credits"
                />
                <span className="text-sm text-muted-foreground">
                  credits/month
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label
                htmlFor="low_credits_threshold"
                className="flex items-center gap-2"
              >
                <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                Low Credits Alert Threshold
                <InfoTooltip content="Send notification email when user credits fall below this amount" />
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="low_credits_threshold"
                  type="number"
                  min={0}
                  max={500}
                  value={formData.low_credits_threshold}
                  onChange={(e) =>
                    handleInputChange("low_credits_threshold", e.target.value)
                  }
                  className="w-24"
                  data-testid="input-low-credits-threshold"
                />
                <span className="text-sm text-muted-foreground">credits</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Settings */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Webhook className="h-4 w-4 text-primary" />
              Webhook Retry Settings
            </CardTitle>
            <CardDescription>
              Configure automatic retry behavior for failed webhook deliveries
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label
                  htmlFor="webhook_max_attempts"
                  className="flex items-center gap-2"
                >
                  Max Retry Attempts
                  <InfoTooltip content="Maximum number of times to retry a failed webhook" />
                </Label>
                <Input
                  id="webhook_max_attempts"
                  type="number"
                  min={1}
                  max={10}
                  value={formData.webhook_retry_max_attempts}
                  onChange={(e) =>
                    handleInputChange(
                      "webhook_retry_max_attempts",
                      e.target.value,
                    )
                  }
                  className="w-full"
                  data-testid="input-webhook-max-attempts"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="webhook_expiry"
                  className="flex items-center gap-2"
                >
                  Webhook Expiry
                  <InfoTooltip content="Hours before giving up on retrying a failed webhook" />
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="webhook_expiry"
                    type="number"
                    min={1}
                    max={168}
                    value={formData.webhook_expiry_hours}
                    onChange={(e) =>
                      handleInputChange("webhook_expiry_hours", e.target.value)
                    }
                    data-testid="input-webhook-expiry"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    hours
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="webhook_intervals"
                  className="flex items-center gap-2"
                >
                  Retry Intervals (minutes)
                  <InfoTooltip content="Comma-separated list of wait times between retry attempts" />
                </Label>
                <Input
                  id="webhook_intervals"
                  type="text"
                  value={webhookIntervalsStr}
                  onChange={(e) =>
                    handleInputChange(
                      "webhook_retry_intervals_minutes",
                      e.target.value,
                    )
                  }
                  placeholder="1, 5, 15, 30, 60"
                  data-testid="input-webhook-intervals"
                />
              </div>
            </div>

            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground">
                <strong>Current Configuration:</strong> Failed webhooks will
                retry up to{" "}
                <Badge variant="secondary" className="mx-1">
                  {formData.webhook_retry_max_attempts}
                </Badge>
                times with intervals of{" "}
                <Badge variant="secondary" className="mx-1">
                  {webhookIntervalsStr}
                </Badge>
                minutes. Webhooks expire after{" "}
                <Badge variant="secondary" className="mx-1">
                  {formData.webhook_expiry_hours}
                </Badge>
                hours.
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Resources */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4 text-primary" />
              {t("admin.settings.resources.title") || "System Resources"}
            </CardTitle>
            <CardDescription>
              {t("admin.settings.resources.description") ||
                "Configure system resource pools and limits"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label
                htmlFor="system_phone_pool_size"
                className="flex items-center gap-2"
              >
                {t("admin.settings.resources.poolSize") ||
                  "System Phone Pool Size"}
                <InfoTooltip
                  content={
                    t("admin.settings.resources.poolSizeTooltip") ||
                    "Number of shared phone numbers available in the system pool for Free tier users"
                  }
                />
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="system_phone_pool_size"
                  type="number"
                  min={1}
                  max={100}
                  value={formData.system_phone_pool_size}
                  onChange={(e) =>
                    handleInputChange("system_phone_pool_size", e.target.value)
                  }
                  className="w-24"
                  data-testid="input-pool-size"
                />
                <span className="text-sm text-muted-foreground">phones</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.settings.resources.poolSizeHint") ||
                  "Shared phone numbers for users on Free plan"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Tools */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-primary" />
              {t("admin.settings.tools.title") || "System Tools"}
            </CardTitle>
            <CardDescription>
              {t("admin.settings.tools.description") ||
                "Administrative tools for data synchronization and maintenance"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>
                {t("admin.settings.tools.syncAllCalls") || "Sync All Calls"}
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                {t("admin.settings.tools.syncAllCallsDesc") ||
                  "Synchronize call data from LiveKit and Twilio"}
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  setSyncingAllCalls(true);
                  try {
                    const res = await apiRequest(
                      "POST",
                      "/api/admin/sync-all-calls",
                    );
                    const result = (await res.json()) as {
                      total: number;
                      success: number;
                      failed: number;
                      skipped: number;
                      errors?: string[];
                    };
                    let description =
                      t("admin.settings.tools.syncedCalls", {
                        success: result.success,
                        total: result.total,
                      }) || `Synced ${result.success}/${result.total} calls`;
                    if (result.skipped > 0) {
                      description += ` (${result.skipped} skipped)`;
                    }
                    if (result.failed > 0) {
                      description += ` (${result.failed} failed)`;
                    }
                    toast({
                      title:
                        t("admin.settings.tools.callSyncComplete") ||
                        "Call Sync Complete",
                      description,
                    });
                  } catch (error: any) {
                    toast({
                      title: t("common.error") || "Error",
                      description: error.message,
                      variant: "destructive",
                    });
                  } finally {
                    setSyncingAllCalls(false);
                  }
                }}
                disabled={syncingAllCalls}
                data-testid="button-sync-all-calls"
              >
                {syncingAllCalls ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("admin.settings.tools.syncingFromSources") ||
                      "Syncing..."}
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("admin.settings.tools.syncAllCalls") || "Sync All Calls"}
                  </>
                )}
              </Button>
            </div>

            <Separator />

            <div>
              <Label>
                {t("admin.settings.tools.syncIncomingWebhooks") ||
                  "Sync Incoming Webhooks"}
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                {t("admin.settings.tools.syncIncomingWebhooksDesc") ||
                  "Configure LiveKit dispatch rules for all incoming agents"}
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  setSyncingWebhooks(true);
                  try {
                    const res = await apiRequest(
                      "POST",
                      "/api/admin/sync-incoming-webhooks",
                    );
                    const result = (await res.json()) as {
                      total: number;
                      success: number;
                      failed: number;
                      webhookUrl?: string;
                      errors?: string[];
                    };
                    toast({
                      title:
                        t("admin.settings.tools.webhookSyncComplete") ||
                        "Webhook Sync Complete",
                      description:
                        t("admin.settings.tools.webhooksConfigured", {
                          success: result.success,
                          total: result.total,
                        }) ||
                        `Configured ${result.success}/${result.total} webhooks` +
                          (result.failed > 0
                            ? ` (${result.failed} failed)`
                            : ""),
                    });
                  } catch (error: any) {
                    toast({
                      title: t("common.error") || "Error",
                      description: error.message,
                      variant: "destructive",
                    });
                  } finally {
                    setSyncingWebhooks(false);
                  }
                }}
                disabled={syncingWebhooks}
                data-testid="button-sync-webhooks"
              >
                {syncingWebhooks ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("admin.settings.tools.syncing") || "Syncing..."}
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("admin.settings.tools.syncIncomingWebhooks") ||
                      "Sync Incoming Webhooks"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Connection Limits */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-primary" />
              Connection Limits
            </CardTitle>
            <CardDescription>
              Configure WebSocket, OpenAI, and database connection limits for
              scaling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-3">
              {/* WebSocket Settings */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" />
                  WebSocket Limits
                </h4>
                <div className="space-y-2">
                  <Label
                    htmlFor="max_ws_connections_per_process"
                    className="flex items-center gap-2"
                  >
                    Per Process
                    <InfoTooltip content="Maximum total WebSocket connections per server process" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="max_ws_connections_per_process"
                      type="number"
                      min={1}
                      max={10000}
                      value={formData.max_ws_connections_per_process}
                      onChange={(e) =>
                        handleInputChange(
                          "max_ws_connections_per_process",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-ws-per-process"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      connections
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="max_ws_connections_per_user"
                    className="flex items-center gap-2"
                  >
                    Per User
                    <InfoTooltip content="Maximum concurrent call connections per user account" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="max_ws_connections_per_user"
                      type="number"
                      min={1}
                      max={100}
                      value={formData.max_ws_connections_per_user}
                      onChange={(e) =>
                        handleInputChange(
                          "max_ws_connections_per_user",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-ws-per-user"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      connections
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="max_ws_connections_per_ip"
                    className="flex items-center gap-2"
                  >
                    Per IP
                    <InfoTooltip content="Maximum WebSocket connections from a single IP address" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="max_ws_connections_per_ip"
                      type="number"
                      min={1}
                      max={100}
                      value={formData.max_ws_connections_per_ip}
                      onChange={(e) =>
                        handleInputChange(
                          "max_ws_connections_per_ip",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-ws-per-ip"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      connections
                    </span>
                  </div>
                </div>
              </div>

              {/* OpenAI Settings */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5" />
                  OpenAI Pool
                </h4>
                <div className="space-y-2">
                  <Label
                    htmlFor="max_openai_connections_per_credential"
                    className="flex items-center gap-2"
                  >
                    Per Credential
                    <InfoTooltip content="Maximum concurrent OpenAI Realtime connections per API key" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="max_openai_connections_per_credential"
                      type="number"
                      min={1}
                      max={500}
                      value={formData.max_openai_connections_per_credential}
                      onChange={(e) =>
                        handleInputChange(
                          "max_openai_connections_per_credential",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-openai-per-credential"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      connections
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="openai_connection_timeout_ms"
                    className="flex items-center gap-2"
                  >
                    Connection Timeout
                    <InfoTooltip content="Maximum duration for OpenAI connections before auto-disconnect (1 hour = 3600000ms)" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="openai_connection_timeout_ms"
                      type="number"
                      min={60000}
                      max={7200000}
                      value={formData.openai_connection_timeout_ms}
                      onChange={(e) =>
                        handleInputChange(
                          "openai_connection_timeout_ms",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-openai-timeout"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      ms
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="openai_idle_timeout_ms"
                    className="flex items-center gap-2"
                  >
                    Idle Timeout
                    <InfoTooltip content="Time before idle OpenAI connections are closed (5 min = 300000ms)" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="openai_idle_timeout_ms"
                      type="number"
                      min={10000}
                      max={3600000}
                      value={formData.openai_idle_timeout_ms}
                      onChange={(e) =>
                        handleInputChange(
                          "openai_idle_timeout_ms",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-openai-idle"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Database & Campaign */}
              <div className="space-y-4">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Database className="h-3.5 w-3.5" />
                  Database & Campaign
                </h4>
                <div className="space-y-2">
                  <Label
                    htmlFor="db_pool_min_connections"
                    className="flex items-center gap-2"
                  >
                    Min Connections
                    <InfoTooltip content="Minimum database connections kept warm in pool" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="db_pool_min_connections"
                      type="number"
                      min={1}
                      max={50}
                      value={formData.db_pool_min_connections}
                      onChange={(e) =>
                        handleInputChange(
                          "db_pool_min_connections",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-db-min"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      connections
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="db_pool_max_connections"
                    className="flex items-center gap-2"
                  >
                    Max Connections
                    <InfoTooltip content="Maximum database connections in pool" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="db_pool_max_connections"
                      type="number"
                      min={1}
                      max={100}
                      value={formData.db_pool_max_connections}
                      onChange={(e) =>
                        handleInputChange(
                          "db_pool_max_connections",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-db-max"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      connections
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="db_pool_idle_timeout_ms"
                    className="flex items-center gap-2"
                  >
                    Idle Timeout
                    <InfoTooltip content="Time before idle DB connections are released" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="db_pool_idle_timeout_ms"
                      type="number"
                      min={1000}
                      max={300000}
                      value={formData.db_pool_idle_timeout_ms}
                      onChange={(e) =>
                        handleInputChange(
                          "db_pool_idle_timeout_ms",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-db-idle"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      ms
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="campaign_batch_concurrency"
                    className="flex items-center gap-2"
                  >
                    Campaign Concurrency
                    <InfoTooltip content="Number of concurrent calls per campaign batch" />
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="campaign_batch_concurrency"
                      type="number"
                      min={1}
                      max={100}
                      value={formData.campaign_batch_concurrency}
                      onChange={(e) =>
                        handleInputChange(
                          "campaign_batch_concurrency",
                          e.target.value,
                        )
                      }
                      className="w-full"
                      data-testid="input-campaign-concurrency"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      calls
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {hasChanges && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom">
          <span className="text-sm font-medium">Unsaved changes</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSaveAll}
            disabled={updateSettingMutation.isPending}
            data-testid="button-save-floating"
          >
            {updateSettingMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
