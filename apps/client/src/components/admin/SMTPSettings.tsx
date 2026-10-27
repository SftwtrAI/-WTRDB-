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
  Mail,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  TestTube,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SMTPData {
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password_set: boolean;
  smtp_password_masked: string;
  smtp_from_email: string;
  smtp_from_name: string;
}

export default function SMTPSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_from_email: "",
    smtp_from_name: "",
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { data: smtpSettings, isLoading } = useQuery<SMTPData>({
    queryKey: ["/api/admin/smtp"],
  });

  useEffect(() => {
    if (smtpSettings) {
      setFormData({
        smtp_host: smtpSettings.smtp_host || "",
        smtp_port: smtpSettings.smtp_port || 587,
        smtp_username: smtpSettings.smtp_username || "",
        smtp_password: smtpSettings.smtp_password_set ? "********" : "",
        smtp_from_email: smtpSettings.smtp_from_email || "",
        smtp_from_name: smtpSettings.smtp_from_name || "",
      });
    }
  }, [smtpSettings]);

  const updateSMTPMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("PATCH", "/api/admin/smtp", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/smtp"] });
      toast({ title: t("admin.smtp.updateSuccess") });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: t("admin.smtp.updateFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testSMTPMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/smtp/test");
      return response.json();
    },
    onSuccess: (data: any) => {
      setTestResult({
        success: data.success,
        message: data.success
          ? t("admin.smtp.testSuccess")
          : data.error || t("admin.smtp.testFailed"),
      });
    },
    onError: (error: any) => {
      setTestResult({
        success: false,
        message: error.message || t("admin.smtp.testFailed"),
      });
    },
  });

  const handleChange = (key: keyof typeof formData, value: string | number) => {
    setFormData({ ...formData, [key]: value });
    setHasChanges(true);
    setTestResult(null);
  };

  const handleSave = () => {
    updateSMTPMutation.mutate(formData);
  };

  const handleTest = () => {
    testSMTPMutation.mutate();
  };

  const isFullyConfigured =
    smtpSettings?.smtp_host &&
    smtpSettings?.smtp_port &&
    smtpSettings?.smtp_username &&
    smtpSettings?.smtp_password_set;
  const isPartiallyConfigured =
    smtpSettings?.smtp_host && smtpSettings?.smtp_port;
  const missingFields: string[] = [];
  if (!smtpSettings?.smtp_host) missingFields.push(t("admin.smtp.host"));
  if (!smtpSettings?.smtp_port) missingFields.push(t("admin.smtp.port"));
  if (!smtpSettings?.smtp_username)
    missingFields.push(t("admin.smtp.username"));
  if (!smtpSettings?.smtp_password_set)
    missingFields.push(t("admin.smtp.password"));

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>{t("admin.smtp.title")}</CardTitle>
            <CardDescription>{t("admin.smtp.description")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("admin.smtp.host")}</Label>
            <Input
              value={formData.smtp_host}
              onChange={(e) => handleChange("smtp_host", e.target.value)}
              placeholder="smtp.example.com"
              data-testid="input-smtp-host"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.smtp.port")}</Label>
            <Input
              type="number"
              value={formData.smtp_port}
              onChange={(e) =>
                handleChange("smtp_port", parseInt(e.target.value) || 587)
              }
              placeholder="587"
              data-testid="input-smtp-port"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("admin.smtp.username")}</Label>
            <Input
              value={formData.smtp_username}
              onChange={(e) => handleChange("smtp_username", e.target.value)}
              placeholder={t("admin.smtp.usernamePlaceholder")}
              data-testid="input-smtp-username"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.smtp.password")}</Label>
            <Input
              type="password"
              value={formData.smtp_password}
              onChange={(e) => handleChange("smtp_password", e.target.value)}
              placeholder={
                smtpSettings?.smtp_password_set
                  ? "••••••••"
                  : t("admin.smtp.passwordPlaceholder")
              }
              data-testid="input-smtp-password"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("admin.smtp.fromEmail")}</Label>
            <Input
              type="email"
              value={formData.smtp_from_email}
              onChange={(e) => handleChange("smtp_from_email", e.target.value)}
              placeholder="noreply@example.com"
              data-testid="input-smtp-from-email"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.smtp.fromName")}</Label>
            <Input
              value={formData.smtp_from_name}
              onChange={(e) => handleChange("smtp_from_name", e.target.value)}
              placeholder="Wtrops.ai"
              data-testid="input-smtp-from-name"
            />
          </div>
        </div>

        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{testResult.message}</AlertDescription>
          </Alert>
        )}

        {!testResult && isFullyConfigured && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription className="text-emerald-400">
              {t("admin.smtp.configured")}
            </AlertDescription>
          </Alert>
        )}

        {!testResult && isPartiallyConfigured && !isFullyConfigured && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t("admin.smtp.missingFields") || "Missing fields"}:{" "}
              {missingFields.join(", ")}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={updateSMTPMutation.isPending || !hasChanges}
            data-testid="button-save-smtp"
          >
            {updateSMTPMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t("admin.smtp.save")}
          </Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testSMTPMutation.isPending || !formData.smtp_host}
            data-testid="button-test-smtp"
          >
            {testSMTPMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4 mr-2" />
            )}
            {t("admin.smtp.testConnection")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
