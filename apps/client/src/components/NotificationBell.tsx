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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();
  const [expandedNotifications, setExpandedNotifications] = useState<
    Set<string>
  >(new Set());

  const toggleNotificationExpand = (
    id: string,
    e: { stopPropagation: () => void },
  ) => {
    e.stopPropagation();
    setExpandedNotifications((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const isNotificationExpanded = (id: string) => expandedNotifications.has(id);

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
    mutationFn: async (id: string) => {
      return await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/notifications/unread-count"],
      });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      setIsOpen(false);
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

  const getNotificationIcon = (type: string) => {
    const iconMap: Record<string, typeof AlertCircle> = {
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
    const IconComponent = iconMap[type] || Bell;
    return <IconComponent className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 group"
          data-testid="button-notifications"
        >
          <span className="inline-flex items-center justify-center h-6 w-6 group-hover:scale-125 transition-transform duration-200">
            <Bell className="h-full w-full group-hover:hidden" />
            <img
              src="/gif/bell.gif"
              alt=""
              className="h-full w-full object-contain hidden group-hover:block invert"
            />
          </span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending || unreadCount === 0}
              className="h-7 text-xs"
              data-testid="button-mark-all-read"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No notifications yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                We'll notify you when something important happens
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`relative group overflow-visible ${
                    !notification.isRead ? "bg-accent/30" : ""
                  }`}
                >
                  <div
                    className={`flex items-start gap-3 px-4 py-3 pr-10 ${
                      notification.link
                        ? "hover-elevate active-elevate-2 cursor-pointer"
                        : ""
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="font-medium text-sm leading-tight">
                          {notification.title}
                        </h4>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!notification.isRead && (
                            <div className="w-2 h-2 bg-primary rounded-full" />
                          )}
                        </div>
                      </div>
                      <p
                        className={`text-sm text-muted-foreground mb-1 ${
                          isNotificationExpanded(notification.id)
                            ? ""
                            : "line-clamp-2"
                        }`}
                      >
                        {notification.message}
                      </p>
                      {notification.message &&
                        notification.message.length > 60 && (
                          <button
                            onClick={(e) =>
                              toggleNotificationExpand(notification.id, e)
                            }
                            className="text-xs text-primary flex items-center gap-1 mb-1 hover:underline"
                            data-testid={`button-expand-notification-${notification.id}`}
                          >
                            {isNotificationExpanded(notification.id) ? (
                              <>
                                <ChevronUp className="h-3 w-3" />
                                Show less
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" />
                                Read more
                              </>
                            )}
                          </button>
                        )}
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteNotificationMutation.mutate(notification.id);
                    }}
                    data-testid={`button-delete-notification-${notification.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
