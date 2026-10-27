import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Bell,
  Check,
  Trash2,
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

interface NotificationListProps {
  maxHeight?: string;
  onNavigate?: (path: string) => void;
}

export function NotificationList({ maxHeight = "400px", onNavigate }: NotificationListProps) {
  const [, setLocation] = useLocation();
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setExpandedNotifications((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 15000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 15000,
  });

  const unreadCount = unreadData?.count || 0;

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const handleClick = (notification: Notification) => {
    if (!notification.isRead) markAsReadMutation.mutate(notification.id);
    if (notification.link) {
      if (notification.link.startsWith("http://") || notification.link.startsWith("https://")) {
        window.open(notification.link, "_blank", "noopener,noreferrer");
      } else {
        (onNavigate ?? setLocation)(notification.link);
      }
    }
  };

  const getIcon = (type: string) => {
    const map: Record<string, typeof AlertCircle> = {
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
    };
    const Icon = map[type] || Bell;
    return <Icon className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </span>
        {notifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending || unreadCount === 0}
            className="h-6 text-[10px] px-2"
          >
            <Check className="h-3 w-3 mr-1" />
            Mark all
          </Button>
        )}
      </div>
      <ScrollArea style={{ maxHeight }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(36,54,69,0.5)]">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`relative group ${!n.isRead ? "bg-accent/30" : ""}`}
              >
                <div
                  className={`flex items-start gap-2.5 px-3 py-2.5 pr-8 ${
                    n.link ? "hover:bg-[rgba(7,162,136,0.08)] cursor-pointer" : ""
                  }`}
                  onClick={() => handleClick(n)}
                >
                  <div className="flex-shrink-0 mt-0.5">{getIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1 mb-0.5">
                      <h4 className="font-medium text-xs leading-tight">{n.title}</h4>
                      {!n.isRead && <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0 mt-1" />}
                    </div>
                    <p className={`text-[11px] text-muted-foreground mb-0.5 ${
                      expandedNotifications.has(n.id) ? "" : "line-clamp-2"
                    }`}>
                      {n.message}
                    </p>
                    {n.message && n.message.length > 60 && (
                      <button
                        onClick={(e) => toggleExpand(n.id, e)}
                        className="text-[10px] text-primary flex items-center gap-0.5 mb-0.5 hover:underline"
                      >
                        {expandedNotifications.has(n.id) ? (
                          <><ChevronUp className="h-2.5 w-2.5" /> Less</>
                        ) : (
                          <><ChevronDown className="h-2.5 w-2.5" /> More</>
                        )}
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2.5 right-1.5 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteNotificationMutation.mutate(n.id);
                  }}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
