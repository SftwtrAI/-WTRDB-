import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Cookie,
  Shield,
  BarChart3,
  Megaphone,
  Settings,
  X,
} from "lucide-react";
import { AuthStorage } from "@/lib/auth-storage";
import { Link } from "wouter";

const CONSENT_STORAGE_KEY = "wtrops_cookie_consent";

interface ConsentPreferences {
  cookieConsent: boolean;
  analyticsConsent: boolean;
  marketingConsent: boolean;
  timestamp: string;
}

interface UserData {
  id: number;
  cookieConsent?: boolean;
  analyticsConsent?: boolean;
  marketingConsent?: boolean;
  consentTimestamp?: string;
}

function getStoredConsent(): ConsentPreferences | null {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function setStoredConsent(preferences: ConsentPreferences): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(preferences));
  } catch (e) {
    console.error("Failed to store consent preferences:", e);
  }
}

export function CookieConsentBanner() {
  const { t } = useTranslation();
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferencesDialog, setShowPreferencesDialog] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    cookieConsent: true,
    analyticsConsent: true,
    marketingConsent: false,
    timestamp: "",
  });

  const isAuthenticated = AuthStorage.isAuthenticated();

  const { data: userData } = useQuery<UserData>({
    queryKey: ["/api/auth/me"],
    enabled: isAuthenticated,
  });

  const saveConsentMutation = useMutation({
    mutationFn: async (prefs: Partial<ConsentPreferences>) => {
      if (!isAuthenticated) {
        return null;
      }
      const res = await apiRequest("PATCH", "/api/auth/me", {
        cookieConsent: prefs.cookieConsent,
        analyticsConsent: prefs.analyticsConsent,
        marketingConsent: prefs.marketingConsent,
      });
      return res.json();
    },
    onSuccess: () => {
      if (isAuthenticated) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      }
    },
  });

  useEffect(() => {
    if (isAuthenticated && userData) {
      if (userData.consentTimestamp) {
        setShowBanner(false);
        setPreferences({
          cookieConsent: userData.cookieConsent ?? true,
          analyticsConsent: userData.analyticsConsent ?? true,
          marketingConsent: userData.marketingConsent ?? false,
          timestamp: userData.consentTimestamp,
        });
      } else {
        setShowBanner(true);
      }
    } else if (!isAuthenticated) {
      const storedConsent = getStoredConsent();
      if (storedConsent) {
        setShowBanner(false);
        setPreferences(storedConsent);
      } else {
        setShowBanner(true);
      }
    }
  }, [isAuthenticated, userData]);

  const handleAcceptAll = () => {
    const newPreferences: ConsentPreferences = {
      cookieConsent: true,
      analyticsConsent: true,
      marketingConsent: true,
      timestamp: new Date().toISOString(),
    };
    setPreferences(newPreferences);
    setStoredConsent(newPreferences);
    saveConsentMutation.mutate(newPreferences);
    setShowBanner(false);
  };

  const handleAcceptEssential = () => {
    const newPreferences: ConsentPreferences = {
      cookieConsent: true,
      analyticsConsent: false,
      marketingConsent: false,
      timestamp: new Date().toISOString(),
    };
    setPreferences(newPreferences);
    setStoredConsent(newPreferences);
    saveConsentMutation.mutate(newPreferences);
    setShowBanner(false);
  };

  const handleSavePreferences = () => {
    const updatedPreferences: ConsentPreferences = {
      ...preferences,
      timestamp: new Date().toISOString(),
    };
    setPreferences(updatedPreferences);
    setStoredConsent(updatedPreferences);
    saveConsentMutation.mutate(updatedPreferences);
    setShowPreferencesDialog(false);
    setShowBanner(false);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-[100] bg-background border-t shadow-lg animate-in slide-in-from-bottom duration-300"
        data-testid="banner-cookie-consent"
      >
        <div className="container mx-auto px-4 py-4 max-w-6xl">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                <Cookie className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h3
                  className="font-medium text-sm"
                  data-testid="text-cookie-title"
                >
                  {t("cookies.title", "We value your privacy")}
                </h3>
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="text-cookie-description"
                >
                  {t(
                    "cookies.description",
                    "We use cookies to enhance your browsing experience, analyze site traffic, and personalize content. By clicking 'Accept All', you consent to our use of cookies.",
                  )}{" "}
                  <Link
                    href="/privacy"
                    className="text-primary hover:underline"
                    data-testid="link-privacy-policy"
                  >
                    {t("cookies.learnMore", "Learn more")}
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreferencesDialog(true)}
                className="flex-1 lg:flex-none"
                data-testid="button-manage-preferences"
              >
                <Settings className="h-4 w-4 mr-2" />
                {t("cookies.managePreferences", "Manage")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAcceptEssential}
                className="flex-1 lg:flex-none"
                data-testid="button-accept-essential"
              >
                {t("cookies.acceptEssential", "Essential Only")}
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
                className="flex-1 lg:flex-none"
                data-testid="button-accept-all"
              >
                {t("cookies.acceptAll", "Accept All")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={showPreferencesDialog}
        onOpenChange={setShowPreferencesDialog}
      >
        <DialogContent
          className="sm:max-w-lg"
          data-testid="dialog-cookie-preferences"
        >
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2"
              data-testid="text-preferences-title"
            >
              <Shield className="h-5 w-5 text-primary" />
              {t("cookies.preferencesTitle", "Cookie Preferences")}
            </DialogTitle>
            <DialogDescription data-testid="text-preferences-description">
              {t(
                "cookies.preferencesDescription",
                "Customize your cookie preferences. Essential cookies are always enabled as they are required for the site to function properly.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Cookie className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">
                    {t("cookies.essential.title", "Essential Cookies")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "cookies.essential.description",
                      "Required for the website to function. Cannot be disabled.",
                    )}
                  </p>
                </div>
              </div>
              <Switch checked disabled data-testid="switch-essential-cookies" />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">
                    {t("cookies.analytics.title", "Analytics Cookies")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "cookies.analytics.description",
                      "Help us understand how visitors interact with our website.",
                    )}
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.analyticsConsent}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({
                    ...prev,
                    analyticsConsent: checked,
                  }))
                }
                data-testid="switch-analytics-cookies"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Megaphone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="font-medium">
                    {t("cookies.marketing.title", "Marketing Cookies")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "cookies.marketing.description",
                      "Used to track visitors across websites for advertising purposes.",
                    )}
                  </p>
                </div>
              </div>
              <Switch
                checked={preferences.marketingConsent}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({
                    ...prev,
                    marketingConsent: checked,
                  }))
                }
                data-testid="switch-marketing-cookies"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPreferencesDialog(false)}
              data-testid="button-cancel-preferences"
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleSavePreferences}
              data-testid="button-save-preferences"
            >
              {t("cookies.savePreferences", "Save Preferences")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
