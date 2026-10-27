import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  X,
  AlertCircle,
  Sparkles,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  Phone,
  PhoneOff,
  PhoneCall,
  Zap,
  Bell,
  Info,
  AlertTriangle,
  Gift,
  Megaphone,
  CreditCard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BannerNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  icon: string | null;
  displayType: string;
  priority: number;
  dismissible: boolean;
  expiresAt: Date | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: Date;
}

const iconMap: Record<string, LucideIcon> = {
  low_credits: AlertCircle,
  membership_upgraded: Sparkles,
  membership_expiry: Clock,
  campaign_completed: CheckCircle,
  campaign_failed: XCircle,
  campaign_paused: Pause,
  phone_billing_success: Phone,
  phone_billing_failed: PhoneOff,
  phone_released: PhoneCall,
  welcome: Zap,
  system: Bell,
  info: Info,
  warning: AlertTriangle,
  gift: Gift,
  announcement: Megaphone,
  billing: CreditCard,
  settings: Settings,
  alert: AlertCircle,
  success: CheckCircle,
  error: XCircle,
  bell: Bell,
};

function getIcon(notification: BannerNotification): LucideIcon {
  if (notification.icon && iconMap[notification.icon]) {
    return iconMap[notification.icon];
  }
  if (iconMap[notification.type]) {
    return iconMap[notification.type];
  }
  return Bell;
}

function getAccentColor(type: string): {
  border: string;
  icon: string;
  bg: string;
} {
  if (
    type.includes("failed") ||
    type.includes("error") ||
    type === "low_credits"
  ) {
    return {
      border: "border-l-red-400",
      icon: "text-red-400",
      bg: "bg-red-950/20",
    };
  }
  if (
    type.includes("success") ||
    type.includes("completed") ||
    type === "welcome" ||
    type === "membership_upgraded"
  ) {
    return {
      border: "border-l-emerald-400",
      icon: "text-emerald-400",
      bg: "bg-emerald-950/20",
    };
  }
  if (type.includes("warning") || type.includes("expiry")) {
    return {
      border: "border-l-amber-400",
      icon: "text-amber-400",
      bg: "bg-amber-950/20",
    };
  }
  return {
    border: "border-l-primary",
    icon: "text-primary",
    bg: "bg-primary/5",
  };
}

export function HeaderBannerNotifications() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: notifications = [], isLoading } = useQuery<
    BannerNotification[]
  >({
    queryKey: ["/api/notifications/banner"],
    refetchInterval: 60000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("PATCH", `/api/notifications/${id}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/banner"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  const handleNotificationClick = (notification: BannerNotification) => {
    if (notification.link) {
      // Check if it's an external URL
      if (
        notification.link.startsWith("http://") ||
        notification.link.startsWith("https://")
      ) {
        window.open(notification.link, "_blank", "noopener,noreferrer");
      } else {
        // Internal link - use client-side routing
        setLocation(notification.link);
      }
    }
  };

  const handleDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    dismissMutation.mutate(id);
  };

  if (isLoading || notifications.length === 0) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-2"
      data-testid="header-banner-notifications"
    >
      {notifications.slice(0, 3).map((notification) => {
        const IconComponent = getIcon(notification);
        const colors = getAccentColor(notification.type);

        return (
          <div
            key={notification.id}
            className={`
              flex items-center gap-2 py-1.5 pl-3 pr-2
              rounded-md border border-border/50 border-l-[3px]
              ${colors.border} ${colors.bg}
              transition-all duration-200
              hover:shadow-sm hover:border-border
              ${notification.link ? "cursor-pointer" : ""}
            `}
            onClick={() => handleNotificationClick(notification)}
            data-testid={`banner-notification-${notification.id}`}
          >
            <IconComponent className={`h-4 w-4 shrink-0 ${colors.icon}`} />
            <span
              className="text-sm font-medium text-foreground truncate max-w-[140px]"
              title={notification.title}
            >
              {notification.title}
            </span>
            {notification.dismissible && (
              <button
                className="h-5 w-5 ml-1 shrink-0 rounded-full opacity-60 hover:opacity-100 hover:bg-foreground/10 flex items-center justify-center transition-opacity"
                onClick={(e) => handleDismiss(e, notification.id)}
                disabled={dismissMutation.isPending}
                data-testid={`dismiss-banner-${notification.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
