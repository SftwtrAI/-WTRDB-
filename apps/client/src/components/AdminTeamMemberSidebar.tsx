/**
 * Admin Team Member Sidebar
 * Shows admin panel navigation based on granted permissions for admin sub-admins
 */
import {
  Users,
  BookOpen,
  Settings,
  ChevronsUpDown,
  BarChart3,
  Home,
  LogOut,
  Shield,
  CreditCard,
  UserCheck,
  Webhook,
  FileText,
  Globe,
  Building2,
  Key,
  Puzzle,
  MessageSquare,
  Headphones,
  ListOrdered,
  ContactRound,
  Brain,
  Activity,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useBranding } from "@/components/BrandingProvider";
import { TeamAuth } from "@/lib/team-auth";
import { Badge } from "@/components/ui/badge";

interface PermissionActions {
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

interface AdminTeamPermissions {
  [sectionId: string]: {
    [subsectionId: string]: PermissionActions;
  };
}

interface AdminTeamMemberData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: {
    id: string;
    name: string;
  };
  status: string;
}

interface AdminTeamData {
  id: string;
  name: string;
  type: "admin";
}

interface AdminTeamAuthResponse {
  member: AdminTeamMemberData;
  team: AdminTeamData;
  permissions: AdminTeamPermissions;
}

// Admin section mappings to routes
const ADMIN_SECTION_ROUTES: Record<
  string,
  { url: string; icon: any; label: string; subsection?: string }[]
> = {
  user_management: [
    {
      url: "/admin?tab=users",
      icon: Users,
      label: "Users",
      subsection: "users",
    },
    {
      url: "/admin?tab=contacts",
      icon: ContactRound,
      label: "Contacts",
      subsection: "contacts",
    },
  ],
  billing_management: [
    {
      url: "/admin?tab=billing",
      icon: CreditCard,
      label: "Billing",
      subsection: "plans",
    },
  ],
  platform_settings: [
    {
      url: "/admin?tab=settings",
      icon: Settings,
      label: "Settings",
      subsection: "general",
    },
    {
      url: "/admin?tab=communications",
      icon: MessageSquare,
      label: "Communications",
      subsection: "communications",
    },
  ],
  api_credentials: [
    {
      url: "/admin?tab=voice-ai",
      icon: Brain,
      label: "Voice AI",
      subsection: "voice_ai",
    },
  ],
  team_oversight: [
    {
      url: "/admin?tab=teams",
      icon: Building2,
      label: "User Teams",
      subsection: "teams",
    },
  ],
  analytics_reports: [
    {
      url: "/admin?tab=analytics",
      icon: BarChart3,
      label: "Analytics",
      subsection: "overview",
    },
    {
      url: "/admin?tab=calls",
      icon: Headphones,
      label: "Call Monitoring",
      subsection: "calls",
    },
    {
      url: "/admin?tab=queue",
      icon: ListOrdered,
      label: "Batch Jobs",
      subsection: "batch_jobs",
    },
  ],
  plugins: [
    {
      url: "/admin?tab=settings",
      icon: Puzzle,
      label: "Plugin Settings",
      subsection: "plugins",
    },
  ],
  admin_team: [
    {
      url: "/admin?tab=admin-team",
      icon: Building2,
      label: "Admin Team",
      subsection: "members",
    },
  ],
};

export function AdminTeamMemberSidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { branding, currentLogo, showLogo, showFavicon } = useBranding();
  const { setOpenMobile, isMobile } = useSidebar();

  // Fetch admin team member data and permissions
  const {
    data: authData,
    isLoading,
    error,
  } = useQuery<AdminTeamAuthResponse>({
    queryKey: ["/api/admin/team/auth/me"],
    queryFn: async () => {
      const token = TeamAuth.getToken();
      if (!token) throw new Error("No token");
      const response = await fetch("/api/admin/team/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok)
        throw new Error("Failed to fetch admin team member data");
      return response.json();
    },
    retry: false,
  });

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleLogout = () => {
    TeamAuth.clearAuth();
    window.location.href = "/admin/team/login";
  };

  if (isLoading) {
    return null;
  }

  if (error || !authData) {
    // Session invalid, redirect to login
    TeamAuth.clearAuth();
    window.location.href = "/admin/team/login";
    return null;
  }

  const { member, team, permissions } = authData;
  const memberName =
    member.firstName && member.lastName
      ? `${member.firstName} ${member.lastName}`
      : member.email;
  const memberInitial = (
    member.firstName?.[0] ||
    member.email[0] ||
    "A"
  ).toUpperCase();
  const roleName = member.role?.name || "Admin Team Member";

  // Check if user has read permission in a section (any subsection with canRead)
  const hasSectionAccess = (sectionId: string): boolean => {
    const sectionPerms = permissions[sectionId];
    if (!sectionPerms) return false;
    return Object.values(sectionPerms).some((perm) => perm.canRead === true);
  };

  // Check if user has a specific permission
  const hasSubsectionRead = (
    sectionId: string,
    subsectionId: string,
  ): boolean => {
    const sectionPerms = permissions[sectionId];
    if (!sectionPerms) return false;
    const subsectionPerm = sectionPerms[subsectionId];
    if (!subsectionPerm) return false;
    return subsectionPerm.canRead === true;
  };

  // Build navigation items based on permissions
  const buildNavItems = (): {
    url: string;
    icon: any;
    label: string;
    section: string;
  }[] => {
    const items: { url: string; icon: any; label: string; section: string }[] =
      [];
    const addedUrls = new Set<string>();

    Object.entries(ADMIN_SECTION_ROUTES).forEach(([sectionId, routes]) => {
      if (hasSectionAccess(sectionId)) {
        routes.forEach((route) => {
          // Check specific subsection permission if defined
          if (
            route.subsection &&
            !hasSubsectionRead(sectionId, route.subsection)
          ) {
            return;
          }

          const baseUrl = route.url.split("?")[0];
          if (!addedUrls.has(route.url)) {
            items.push({
              url: route.url,
              icon: route.icon,
              label: route.label,
              section: sectionId,
            });
            addedUrls.add(route.url);
          }
        });
      }
    });

    return items;
  };

  const navItems = buildNavItems();

  // Group items by category for display
  const groupedItems = {
    management: navItems.filter((i) =>
      ["user_management", "team_oversight", "admin_team"].includes(i.section),
    ),
    platform: navItems.filter((i) =>
      ["platform_settings", "api_credentials", "plugins"].includes(i.section),
    ),
    analytics: navItems.filter((i) =>
      ["analytics_reports"].includes(i.section),
    ),
    billing: navItems.filter((i) => ["billing_management"].includes(i.section)),
  };

  const isActiveUrl = (url: string): boolean => {
    const currentUrl = window.location.pathname + window.location.search;
    if (url.includes("?")) {
      return currentUrl.includes(url.split("?")[1]);
    }
    return location === url || location.startsWith(url);
  };

  return (
    <Sidebar collapsible="icon">
      {/* Header with responsive logo */}
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:hidden">
          {showLogo && (
            <img
              src={currentLogo!}
              alt={branding.app_name}
              className="h-8 w-auto max-w-[140px] object-contain"
            />
          )}
          <SidebarTrigger
            className="h-6 w-6 shrink-0"
            data-testid="button-admin-sidebar-toggle"
          />
        </div>
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center gap-2">
          {showFavicon && (
            <img
              src={branding.favicon_url!}
              alt={branding.app_name}
              className="h-6 w-6 object-contain"
            />
          )}
          <SidebarTrigger
            className="h-5 w-5 shrink-0"
            data-testid="button-admin-sidebar-toggle-collapsed"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:px-0 px-2 py-1">
        {/* Admin Team Member Badge */}
        <div className="mx-2 my-2 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Shield className="h-4 w-4 text-orange-500" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">Admin Team</span>
              <span className="text-[10px] text-muted-foreground">
                {team.name}
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/admin" && !window.location.search}
                  tooltip="Dashboard"
                  data-testid="link-admin-dashboard"
                >
                  <Link href="/admin" onClick={handleNavClick}>
                    <Home className="h-4 w-4 text-blue-500" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Management Section */}
        {groupedItems.management.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Management
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupedItems.management.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActiveUrl(item.url)}
                      tooltip={item.label}
                      data-testid={`link-admin-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Platform Section */}
        {groupedItems.platform.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Platform
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupedItems.platform.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActiveUrl(item.url)}
                      tooltip={item.label}
                      data-testid={`link-admin-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Analytics Section */}
        {groupedItems.analytics.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Analytics
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupedItems.analytics.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActiveUrl(item.url)}
                      tooltip={item.label}
                      data-testid={`link-admin-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Billing Section */}
        {groupedItems.billing.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Billing
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupedItems.billing.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActiveUrl(item.url)}
                      tooltip={item.label}
                      data-testid={`link-admin-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Activity Logs - Always visible for admin team members */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Audit
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActiveUrl("/admin?tab=activity-logs")}
                  tooltip="Activity Logs"
                  data-testid="link-admin-activity-logs"
                >
                  <Link
                    href="/admin?tab=activity-logs"
                    onClick={handleNavClick}
                  >
                    <Activity className="h-4 w-4" />
                    <span>Activity Logs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-2 py-1.5 mt-auto border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover-elevate cursor-pointer"
              data-testid="button-admin-team-member-menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-orange-500 text-white text-xs font-medium">
                  {memberInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="text-xs font-medium text-sidebar-foreground truncate">
                  {memberName}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {roleName}
                </span>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{memberName}</p>
              <p className="text-xs text-muted-foreground">{member.email}</p>
              <Badge variant="secondary" className="mt-1 text-xs">
                {roleName}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-destructive focus:text-destructive"
              data-testid="button-admin-team-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>{t("auth.logout")}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
