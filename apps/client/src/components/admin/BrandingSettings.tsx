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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import {
  Settings,
  RefreshCw,
  Edit,
  Loader2,
  CheckCircle,
  Image,
  Globe,
  Type,
  Tag,
  X,
  Upload,
  Sun,
  Moon,
  Mail,
  Twitter,
  Linkedin,
  Github,
  Link,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AuthStorage } from "@/lib/auth-storage";

interface BrandingData {
  app_name: string;
  app_tagline: string;
  admin_email: string | null;
  logo_url: string | null;
  logo_url_light: string | null;
  logo_url_dark: string | null;
  favicon_url: string | null;
  branding_updated_at: string | null;
  social_twitter_url: string | null;
  social_linkedin_url: string | null;
  social_github_url: string | null;
}

export default function BrandingSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formData, setFormData] = useState({
    app_name: "",
    app_tagline: "",
    admin_email: "",
    social_twitter_url: "",
    social_linkedin_url: "",
    social_github_url: "",
  });
  const [logoLightPreview, setLogoLightPreview] = useState<string | null>(null);
  const [logoDarkPreview, setLogoDarkPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [isUploadingLogoLight, setIsUploadingLogoLight] = useState(false);
  const [isUploadingLogoDark, setIsUploadingLogoDark] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);

  const logoLightInputRef = useRef<HTMLInputElement>(null);
  const logoDarkInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const {
    data: branding,
    isLoading,
    isError,
    refetch,
  } = useQuery<BrandingData>({
    queryKey: ["/api/admin/branding"],
  });

  // Cache-bust helper: append timestamp to image URLs to avoid stale browser cache
  const cacheBust = (url: string | null | undefined): string => {
    if (!url) return "";
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${branding?.branding_updated_at || "1"}`;
  };

  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = "none";
  };

  // Clear localStorage branding cache so stale data isn't served
  const clearBrandingCache = () => {
    try {
      localStorage.removeItem("wtrops-branding:v1");
    } catch {}
  };

  const updateBrandingMutation = useMutation({
    mutationFn: async (data: {
      app_name: string;
      app_tagline: string;
      admin_email: string;
      social_twitter_url: string;
      social_linkedin_url: string;
      social_github_url: string;
    }) => {
      return apiRequest("PATCH", "/api/admin/branding", data);
    },
    onSuccess: () => {
      clearBrandingCache();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      toast({ title: t("admin.branding.updateSuccess") });
      setIsEditOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: t("admin.branding.updateFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteLogoLightMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/admin/branding/logo-light");
    },
    onSuccess: () => {
      clearBrandingCache();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      setLogoLightPreview(null);
      toast({ title: t("admin.branding.logoDeleted") });
    },
  });

  const deleteLogoDarkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/admin/branding/logo-dark");
    },
    onSuccess: () => {
      clearBrandingCache();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      setLogoDarkPreview(null);
      toast({ title: t("admin.branding.logoDeleted") });
    },
  });

  const deleteFaviconMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/admin/branding/favicon");
    },
    onSuccess: () => {
      clearBrandingCache();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      setFaviconPreview(null);
      toast({ title: t("admin.branding.faviconDeleted") });
    },
  });

  const handleOpenEdit = () => {
    if (branding) {
      setFormData({
        app_name: branding.app_name,
        app_tagline: branding.app_tagline || "",
        admin_email: branding.admin_email || "",
        social_twitter_url: branding.social_twitter_url || "",
        social_linkedin_url: branding.social_linkedin_url || "",
        social_github_url: branding.social_github_url || "",
      });
      setLogoLightPreview(branding.logo_url_light || branding.logo_url);
      setLogoDarkPreview(branding.logo_url_dark);
      setFaviconPreview(branding.favicon_url);
    }
    setIsEditOpen(true);
  };

  const handleLogoLightUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: t("admin.branding.invalidFileType"),
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("admin.branding.fileTooLarge"),
        variant: "destructive",
      });
      return;
    }

    setIsUploadingLogoLight(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const uploadHeaders: Record<string, string> = {};
      const authHeader = AuthStorage.getAuthHeader();
      if (authHeader) {
        uploadHeaders["Authorization"] = authHeader;
      }

      const response = await fetch("/api/admin/branding/upload-logo-light", {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const result = await response.json();
      setLogoLightPreview(result.logo_url_light);
      clearBrandingCache();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      toast({ title: t("admin.branding.logoUploaded") });
    } catch (error: any) {
      toast({
        title: t("admin.branding.uploadFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogoLight(false);
      if (logoLightInputRef.current) logoLightInputRef.current.value = "";
    }
  };

  const handleLogoDarkUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: t("admin.branding.invalidFileType"),
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("admin.branding.fileTooLarge"),
        variant: "destructive",
      });
      return;
    }

    setIsUploadingLogoDark(true);
    const formData = new FormData();
    formData.append("logo", file);

    try {
      const uploadHeaders: Record<string, string> = {};
      const authHeader = AuthStorage.getAuthHeader();
      if (authHeader) {
        uploadHeaders["Authorization"] = authHeader;
      }

      const response = await fetch("/api/admin/branding/upload-logo-dark", {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const result = await response.json();
      setLogoDarkPreview(result.logo_url_dark);
      clearBrandingCache();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      toast({ title: t("admin.branding.logoUploaded") });
    } catch (error: any) {
      toast({
        title: t("admin.branding.uploadFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogoDark(false);
      if (logoDarkInputRef.current) logoDarkInputRef.current.value = "";
    }
  };

  const handleFaviconUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: t("admin.branding.invalidFileType"),
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("admin.branding.fileTooLarge"),
        variant: "destructive",
      });
      return;
    }

    setIsUploadingFavicon(true);
    const formData = new FormData();
    formData.append("favicon", file);

    try {
      const uploadHeaders: Record<string, string> = {};
      const authHeader = AuthStorage.getAuthHeader();
      if (authHeader) {
        uploadHeaders["Authorization"] = authHeader;
      }

      const response = await fetch("/api/admin/branding/upload-favicon", {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const result = await response.json();
      setFaviconPreview(result.favicon_url);
      clearBrandingCache();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      toast({ title: t("admin.branding.faviconUploaded") });
    } catch (error: any) {
      toast({
        title: t("admin.branding.uploadFailed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploadingFavicon(false);
      if (faviconInputRef.current) faviconInputRef.current.value = "";
    }
  };

  const handleSave = () => {
    updateBrandingMutation.mutate(formData);
  };

  const isConfigured =
    branding?.app_name &&
    (branding?.logo_url ||
      branding?.logo_url_light ||
      branding?.logo_url_dark ||
      branding?.favicon_url);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 gap-3">
          <p className="text-sm text-muted-foreground">
            {t("admin.branding.updateFailed")}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("admin.branding.refresh")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>{t("admin.branding.title")}</CardTitle>
                <CardDescription>
                  {t("admin.branding.description")}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={isConfigured ? "default" : "secondary"}
                className="gap-1"
              >
                {isConfigured ? (
                  <>
                    <CheckCircle className="h-3 w-3" />
                    {t("admin.branding.configured")}
                  </>
                ) : (
                  t("admin.branding.notConfigured")
                )}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                data-testid="button-refresh-branding"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("admin.branding.refresh")}
              </Button>
              <Button
                size="sm"
                onClick={handleOpenEdit}
                data-testid="button-edit-branding"
              >
                <Edit className="h-4 w-4 mr-2" />
                {t("admin.branding.editSettings")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 text-emerald-400 border-emerald-400"
              >
                <CheckCircle className="h-3 w-3" />
                {t("admin.branding.liveData")}
              </Badge>
              {branding?.branding_updated_at && (
                <span className="text-sm text-muted-foreground">
                  {format(new Date(branding.branding_updated_at), "dd/MM/yyyy")}
                </span>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Type className="h-4 w-4 text-muted-foreground" />
                  {t("admin.branding.applicationTitle")}
                </div>
                <div className="px-4 py-3 bg-muted/50 rounded-md">
                  <span className="text-foreground">
                    {branding?.app_name || "Wtrops.ai"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  {t("admin.branding.tagline")}
                </div>
                <div className="px-4 py-3 bg-muted/50 rounded-md min-h-[44px]">
                  <span className="text-foreground">
                    {branding?.app_tagline ||
                      "AI Voice Calling Agents & Lead Intelligence SaaS Platform"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Admin Email
                </div>
                <div className="px-4 py-3 bg-muted/50 rounded-md min-h-[44px]">
                  <span className="text-foreground">
                    {branding?.admin_email || (
                      <span className="text-muted-foreground italic">
                        Not configured
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sun className="h-4 w-4 text-amber-500" />
                  {t("admin.branding.logoLight")}
                </div>
                <div className="px-4 py-3 bg-slate-100 rounded-md border flex items-center gap-3">
                  {branding?.logo_url_light || branding?.logo_url ? (
                    <>
                      <div className="h-10 w-16 bg-white rounded border flex items-center justify-center overflow-hidden">
                        <img
                          src={cacheBust(
                            branding.logo_url_light || branding.logo_url,
                          )}
                          alt="Logo Light"
                          className="max-h-full max-w-full object-contain"
                          onError={handleImgError}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {t("admin.branding.logoUploaded")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t("admin.branding.forLightMode")}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-16 bg-slate-100 rounded border flex items-center justify-center">
                        <Image className="h-5 w-5 text-slate-400" />
                      </div>
                      <span className="text-sm text-slate-500">
                        {t("admin.branding.noLogo")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Moon className="h-4 w-4 text-indigo-500" />
                  {t("admin.branding.logoDark")}
                </div>
                <div className="px-4 py-3 bg-slate-900 rounded-md border border-slate-700 flex items-center gap-3">
                  {branding?.logo_url_dark ? (
                    <>
                      <div className="h-10 w-16 bg-slate-700 rounded border border-slate-600 flex items-center justify-center overflow-hidden">
                        <img
                          src={cacheBust(branding.logo_url_dark)}
                          alt="Logo Dark"
                          className="max-h-full max-w-full object-contain"
                          onError={handleImgError}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">
                          {t("admin.branding.logoUploaded")}
                        </p>
                        <p className="text-xs text-slate-400">
                          {t("admin.branding.forDarkMode")}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-16 bg-slate-700 rounded border border-slate-600 flex items-center justify-center">
                        <Image className="h-5 w-5 text-slate-400" />
                      </div>
                      <span className="text-sm text-slate-400">
                        {t("admin.branding.noLogo")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {t("admin.branding.favicon")}
                </div>
                <div className="px-4 py-3 bg-muted/50 rounded-md flex items-center gap-3">
                  {branding?.favicon_url ? (
                    <>
                      <div className="h-10 w-10 bg-background rounded border flex items-center justify-center overflow-hidden">
                        <img
                          src={cacheBust(branding.favicon_url)}
                          alt="Favicon"
                          className="max-h-full max-w-full object-contain"
                          onError={handleImgError}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {t("admin.branding.faviconUploaded")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("admin.branding.faviconReady")}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-background rounded border flex items-center justify-center">
                        <Globe className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {t("admin.branding.noFavicon")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isConfigured && (
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-emerald-400">
                  {t("admin.branding.configurationComplete")}
                </span>
                {branding?.branding_updated_at && (
                  <span className="text-muted-foreground ml-auto">
                    {t("admin.branding.lastUpdated")}:{" "}
                    {format(
                      new Date(branding.branding_updated_at),
                      "dd/MM/yyyy",
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t("admin.branding.editTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("admin.branding.editDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-primary" />
                <Label>{t("admin.branding.applicationName")} *</Label>
              </div>
              <Input
                value={formData.app_name}
                onChange={(e) =>
                  setFormData({ ...formData, app_name: e.target.value })
                }
                placeholder="Wtrops.ai"
                data-testid="input-app-name"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <Label>{t("admin.branding.tagline")}</Label>
              </div>
              <Textarea
                value={formData.app_tagline}
                onChange={(e) =>
                  setFormData({ ...formData, app_tagline: e.target.value })
                }
                placeholder="AI Voice Calling Agents & Lead Intelligence SaaS Platform"
                rows={3}
                data-testid="input-tagline"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <Label>Admin Email (Contact Form)</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Contact form submissions from the website will be sent to this
                email address.
              </p>
              <Input
                type="email"
                value={formData.admin_email}
                onChange={(e) =>
                  setFormData({ ...formData, admin_email: e.target.value })
                }
                placeholder="admin@example.com"
                data-testid="input-admin-email"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Link className="h-4 w-4 text-primary" />
                <Label>Social Media Links</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure social media links that will appear in the website
                footer.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Twitter className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">Twitter / X</Label>
                  </div>
                  <Input
                    type="url"
                    value={formData.social_twitter_url}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        social_twitter_url: e.target.value,
                      })
                    }
                    placeholder="https://twitter.com/yourhandle"
                    data-testid="input-social-twitter"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">LinkedIn</Label>
                  </div>
                  <Input
                    type="url"
                    value={formData.social_linkedin_url}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        social_linkedin_url: e.target.value,
                      })
                    }
                    placeholder="https://linkedin.com/company/yourcompany"
                    data-testid="input-social-linkedin"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">GitHub</Label>
                  </div>
                  <Input
                    type="url"
                    value={formData.social_github_url}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        social_github_url: e.target.value,
                      })
                    }
                    placeholder="https://github.com/yourorg"
                    data-testid="input-social-github"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-amber-500" />
                  <Label>{t("admin.branding.logoLight")}</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.branding.logoLightDescription")}
                </p>
                <div className="space-y-3">
                  {logoLightPreview && (
                    <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-md border">
                      <div className="h-12 w-20 bg-white rounded border flex items-center justify-center overflow-hidden">
                        <img
                          src={cacheBust(logoLightPreview)}
                          alt="Logo light preview"
                          className="max-h-full max-w-full object-contain"
                          onError={handleImgError}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {t("admin.branding.logoCurrent")}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLogoLightMutation.mutate()}
                        disabled={deleteLogoLightMutation.isPending}
                        data-testid="button-delete-logo-light"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      ref={logoLightInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoLightUpload}
                      className="hidden"
                      id="logo-light-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => logoLightInputRef.current?.click()}
                      disabled={isUploadingLogoLight}
                      className="w-full"
                      data-testid="button-upload-logo-light"
                    >
                      {isUploadingLogoLight ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {t("admin.branding.chooseFile")}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4 text-indigo-500" />
                  <Label>{t("admin.branding.logoDark")}</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.branding.logoDarkDescription")}
                </p>
                <div className="space-y-3">
                  {logoDarkPreview && (
                    <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-md border border-slate-700">
                      <div className="h-12 w-20 bg-slate-700 rounded border border-slate-600 flex items-center justify-center overflow-hidden">
                        <img
                          src={cacheBust(logoDarkPreview)}
                          alt="Logo dark preview"
                          className="max-h-full max-w-full object-contain"
                          onError={handleImgError}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-200">
                          {t("admin.branding.logoCurrent")}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLogoDarkMutation.mutate()}
                        disabled={deleteLogoDarkMutation.isPending}
                        className="text-slate-400 hover:text-slate-200"
                        data-testid="button-delete-logo-dark"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      ref={logoDarkInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoDarkUpload}
                      className="hidden"
                      id="logo-dark-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => logoDarkInputRef.current?.click()}
                      disabled={isUploadingLogoDark}
                      className="w-full"
                      data-testid="button-upload-logo-dark"
                    >
                      {isUploadingLogoDark ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {t("admin.branding.chooseFile")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <Label>{t("admin.branding.favicon")}</Label>
              </div>
              <div className="space-y-3">
                {faviconPreview && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                    <div className="h-12 w-12 bg-background rounded border flex items-center justify-center overflow-hidden">
                      <img
                        src={cacheBust(faviconPreview)}
                        alt="Favicon preview"
                        className="max-h-full max-w-full object-contain"
                        onError={handleImgError}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {t("admin.branding.faviconCurrent")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteFaviconMutation.mutate()}
                      disabled={deleteFaviconMutation.isPending}
                      data-testid="button-delete-favicon"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFaviconUpload}
                    className="hidden"
                    id="favicon-upload"
                  />
                  <Button
                    variant="outline"
                    onClick={() => faviconInputRef.current?.click()}
                    disabled={isUploadingFavicon}
                    className="w-full"
                    data-testid="button-upload-favicon"
                  >
                    {isUploadingFavicon ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {t("admin.branding.chooseFile")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              data-testid="button-cancel-branding"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateBrandingMutation.isPending || !formData.app_name}
              data-testid="button-save-branding"
            >
              {updateBrandingMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t("admin.branding.updateSettings")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
