import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Globe, Clock, Loader2 } from "lucide-react";

interface TimezoneEnforcementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const COMMON_TIMEZONES = [
  {
    region: "Americas",
    zones: [
      { value: "America/New_York", label: "Eastern Time (New York)" },
      { value: "America/Chicago", label: "Central Time (Chicago)" },
      { value: "America/Denver", label: "Mountain Time (Denver)" },
      { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
      { value: "America/Anchorage", label: "Alaska Time (Anchorage)" },
      { value: "Pacific/Honolulu", label: "Hawaii Time (Honolulu)" },
      { value: "America/Toronto", label: "Eastern Time (Toronto)" },
      { value: "America/Vancouver", label: "Pacific Time (Vancouver)" },
      { value: "America/Mexico_City", label: "Central Time (Mexico City)" },
      { value: "America/Sao_Paulo", label: "Brasilia Time (São Paulo)" },
      { value: "America/Buenos_Aires", label: "Argentina Time (Buenos Aires)" },
    ],
  },
  {
    region: "Europe",
    zones: [
      { value: "Europe/London", label: "GMT/BST (London)" },
      { value: "Europe/Paris", label: "CET (Paris)" },
      { value: "Europe/Berlin", label: "CET (Berlin)" },
      { value: "Europe/Rome", label: "CET (Rome)" },
      { value: "Europe/Madrid", label: "CET (Madrid)" },
      { value: "Europe/Amsterdam", label: "CET (Amsterdam)" },
      { value: "Europe/Brussels", label: "CET (Brussels)" },
      { value: "Europe/Stockholm", label: "CET (Stockholm)" },
      { value: "Europe/Warsaw", label: "CET (Warsaw)" },
      { value: "Europe/Moscow", label: "MSK (Moscow)" },
      { value: "Europe/Istanbul", label: "TRT (Istanbul)" },
    ],
  },
  {
    region: "Asia Pacific",
    zones: [
      { value: "Asia/Dubai", label: "GST (Dubai)" },
      { value: "Asia/Kolkata", label: "IST (Mumbai/Delhi)" },
      { value: "Asia/Singapore", label: "SGT (Singapore)" },
      { value: "Asia/Hong_Kong", label: "HKT (Hong Kong)" },
      { value: "Asia/Shanghai", label: "CST (Shanghai/Beijing)" },
      { value: "Asia/Tokyo", label: "JST (Tokyo)" },
      { value: "Asia/Seoul", label: "KST (Seoul)" },
      { value: "Asia/Jakarta", label: "WIB (Jakarta)" },
      { value: "Asia/Bangkok", label: "ICT (Bangkok)" },
      { value: "Australia/Sydney", label: "AEST (Sydney)" },
      { value: "Australia/Melbourne", label: "AEST (Melbourne)" },
      { value: "Australia/Perth", label: "AWST (Perth)" },
      { value: "Pacific/Auckland", label: "NZST (Auckland)" },
    ],
  },
  {
    region: "Africa & Middle East",
    zones: [
      { value: "Africa/Cairo", label: "EET (Cairo)" },
      { value: "Africa/Johannesburg", label: "SAST (Johannesburg)" },
      { value: "Africa/Lagos", label: "WAT (Lagos)" },
      { value: "Africa/Nairobi", label: "EAT (Nairobi)" },
      { value: "Asia/Jerusalem", label: "IST (Jerusalem)" },
      { value: "Asia/Riyadh", label: "AST (Riyadh)" },
    ],
  },
];

export function TimezoneEnforcementModal({
  open,
  onOpenChange,
  onSuccess,
}: TimezoneEnforcementModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedTimezone, setSelectedTimezone] = useState("");

  const detectedTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "";
    }
  }, []);

  const saveTimezoneMutation = useMutation({
    mutationFn: async (timezone: string) => {
      const res = await apiRequest("PATCH", "/api/auth/me", { timezone });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: t("settings.timezone.saved", "Timezone saved"),
        description: t(
          "settings.timezone.savedDesc",
          "Your timezone has been saved successfully.",
        ),
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t("settings.timezone.saveFailed", "Failed to save timezone"),
        description: error.message || t("common.tryAgain", "Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!selectedTimezone) {
      toast({
        title: t("settings.timezone.required", "Timezone required"),
        description: t(
          "settings.timezone.requiredDesc",
          "Please select your timezone to continue.",
        ),
        variant: "destructive",
      });
      return;
    }
    saveTimezoneMutation.mutate(selectedTimezone);
  };

  const handleDetectTimezone = () => {
    if (detectedTimezone) {
      setSelectedTimezone(detectedTimezone);
      toast({
        title: t("settings.timezone.detected", "Timezone detected"),
        description: detectedTimezone,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="dialog-timezone-enforcement"
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            data-testid="text-timezone-modal-title"
          >
            <Globe className="h-5 w-5 text-primary" />
            {t("settings.timezone.setupTitle", "Set Your Timezone")}
          </DialogTitle>
          <DialogDescription data-testid="text-timezone-modal-description">
            {t(
              "settings.timezone.setupDescription",
              "Your timezone is required to ensure calls are scheduled at the correct local time for your contacts. This helps avoid calling contacts at inconvenient hours.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {t("settings.timezone.currentTime", "Current time")}:{" "}
              {new Date().toLocaleTimeString()}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone-select">
              {t("settings.timezone.label", "Timezone")}
            </Label>
            <Select
              value={selectedTimezone}
              onValueChange={setSelectedTimezone}
            >
              <SelectTrigger
                id="timezone-select"
                className="w-full"
                data-testid="select-timezone"
              >
                <SelectValue
                  placeholder={t(
                    "settings.timezone.placeholder",
                    "Select your timezone",
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((group) => (
                  <div key={group.region}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                      {group.region}
                    </div>
                    {group.zones.map((tz) => (
                      <SelectItem
                        key={tz.value}
                        value={tz.value}
                        data-testid={`timezone-option-${tz.value.replace(/\//g, "-")}`}
                      >
                        {tz.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {detectedTimezone && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDetectTimezone}
              className="w-full"
              data-testid="button-detect-timezone"
            >
              <Globe className="h-4 w-4 mr-2" />
              {t(
                "settings.timezone.useDetected",
                "Use detected timezone",
              )}: {detectedTimezone}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!selectedTimezone || saveTimezoneMutation.isPending}
            className="w-full sm:w-auto"
            data-testid="button-save-timezone"
          >
            {saveTimezoneMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t("settings.timezone.continue", "Continue to Create Campaign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
