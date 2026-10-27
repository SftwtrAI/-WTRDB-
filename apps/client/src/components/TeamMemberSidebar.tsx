/**
 * Team Member Sidebar
 * Shows navigation based on granted permissions for team members
 * Supports both user team members and admin sub-admins
 */
import {
  Users,
  BookOpen,
  Link as LinkIcon,
  Phone,
  Settings,
  ChevronsUpDown,
  Plus,
  BarChart3,
  Home,
  Target,
  LogOut,
  Coins,
  Shield,
  CreditCard,
  TrendingUp,
  UserCheck,
  Workflow,
  Webhook,
  ClipboardList,
  Calendar,
  Layout,
  FileText,
  Wrench,
  Globe,
  Building2,
  Key,
  Puzzle,
  MessageSquare,
  Headphones,
  ListOrdered,
  ContactRound,
  Package,
  DollarSign,
  Brain,
  Bot,
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
import { Button } from "@/components/ui/button";
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

interface TeamMemberPermissions {
  [sectionId: string]: {
    [subsectionId: string]: PermissionActions;
  };
}

interface TeamMemberData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: {
    id: string;
    name: string;
    permissions?: TeamMemberPermissions;
  };
}

interface TeamData {
  id: string;
  name: string;
  type: "user" | "admin";
  parentUserId?: string;
}

interface TeamAuthResponse {
  member: TeamMemberData;
  team: TeamData;
  permissions: TeamMemberPermissions;
}

// User section mappings to routes
const USER_SECTION_ROUTES: Record<
  string,
  { url: string; icon: any; label: string; group: string; iconColor?: string }[]
> = {
  dashboard: [
    {
      url: "/app",
      icon: Home,
      label: "Home",
      group: "build",
      iconColor: "text-blue-500",
    },
  ],
  campaigns: [
    {
      url: "/app/campaigns",
      icon: Target,
      label: "Campaigns",
      group: "build",
      iconColor: "text-orange-500",
    },
  ],
  agents: [
    {
      url: "/app/agents",
      icon: Bot,
      label: "Agents",
      group: "build",
      iconColor: "text-blue-500",
    },
    {
      url: "/app/prompt-templates",
      icon: FileText,
      label: "Prompt Templates",
      group: "build",
      iconColor: "text-green-500",
    },
  ],
  knowledge_base: [
    {
      url: "/app/knowledge-base",
      icon: BookOpen,
      label: "Knowledge Base",
      group: "build",
      iconColor: "text-violet-500",
    },
  ],
  templates: [
    {
      url: "/app/flows/templates",
      icon: Layout,
      label: "Templates",
      group: "build",
      iconColor: "text-fuchsia-500",
    },
  ],
  contacts: [
    {
      url: "/app/contacts",
      icon: UserCheck,
      label: "All Contacts",
      group: "evaluate",
      iconColor: "text-teal-500",
    },
  ],
  crm: [
    {
      url: "/app/crm",
      icon: ContactRound,
      label: "Quick CRM",
      group: "evaluate",
      iconColor: "text-cyan-500",
    },
  ],
  calls: [
    {
      url: "/app/calls",
      icon: Phone,
      label: "Calls",
      group: "evaluate",
      iconColor: "text-blue-500",
    },
  ],
  analytics: [
    {
      url: "/app/analytics",
      icon: BarChart3,
      label: "Analytics",
      group: "evaluate",
      iconColor: "text-purple-500",
    },
  ],
  website_widget: [
    {
      url: "/app/tools/widgets",
      icon: Globe,
      label: "Website Widget",
      group: "tools",
      iconColor: "text-sky-500",
    },
  ],
  webhooks: [
    {
      url: "/app/flows/webhooks",
      icon: Webhook,
      label: "Webhooks",
      group: "tools",
      iconColor: "text-violet-500",
    },
  ],
  phone_numbers: [
    {
      url: "/app/phone-numbers",
      icon: Phone,
      label: "Phone Numbers",
      group: "telephony",
      iconColor: "text-emerald-500",
    },
    {
      url: "/app/incoming-connections",
      icon: LinkIcon,
      label: "Incoming Connections",
      group: "telephony",
      iconColor: "text-amber-500",
    },
  ],
  billing: [
    {
      url: "/app/billing",
      icon: CreditCard,
      label: "Billing & Credits",
      group: "billing",
      iconColor: "text-amber-500",
    },
    {
      url: "/app/transaction-history",
      icon: FileText,
      label: "Transaction History",
      group: "billing",
      iconColor: "text-slate-500",
    },
  ],
  api_keys: [
    {
      url: "/app/api-keys",
      icon: Key,
      label: "API Keys",
      group: "settings",
      iconColor: "text-slate-500",
    },
  ],
  settings: [
    {
      url: "/app/settings",
      icon: Settings,
      label: "Settings",
      group: "settings",
    },
  ],
  team: [
    {
      url: "/app/team",
      icon: Users,
      label: "Team Management",
      group: "settings",
    },
  ],
};

// Admin section mappings to tab values
const ADMIN_SECTION_TABS: Record<
  string,
  { tabValue: string; icon: any; label: string }[]
> = {
  user_management: [
    { tabValue: "users", icon: Users, label: "Users" },
    { tabValue: "contacts", icon: ContactRound, label: "Contacts" },
  ],
  billing_management: [
    { tabValue: "billing", icon: CreditCard, label: "Billing" },
  ],
  platform_settings: [
    { tabValue: "settings", icon: Settings, label: "Settings" },
    {
      tabValue: "communications",
      icon: MessageSquare,
      label: "Communications",
    },
  ],
  api_credentials: [{ tabValue: "voice-ai", icon: Brain, label: "Voice AI" }],
  team_oversight: [{ tabValue: "teams", icon: Building2, label: "Teams" }],
  analytics_reports: [
    { tabValue: "analytics", icon: BarChart3, label: "Analytics" },
    { tabValue: "calls", icon: Headphones, label: "Call Monitoring" },
    { tabValue: "queue", icon: ListOrdered, label: "Batch Jobs" },
  ],
  plugins: [{ tabValue: "settings", icon: Puzzle, label: "Plugins" }],
  admin_team: [{ tabValue: "teams", icon: Building2, label: "Admin Team" }],
};

// Flow automation available if agents.flow_builder permission exists
const FLOW_AUTOMATION_ROUTES = [
  {
    url: "/app/flows",
    icon: Workflow,
    label: "Flow Builder",
    iconColor: "text-indigo-500",
  },
  {
    url: "/app/flows/execution",
    icon: BarChart3,
    label: "Execution Logs",
    iconColor: "text-slate-500",
  },
  {
    url: "/app/flows/forms",
    icon: ClipboardList,
    label: "Forms",
    iconColor: "text-cyan-500",
  },
  {
    url: "/app/flows/appointments",
    icon: Calendar,
    label: "Appointments",
    iconColor: "text-rose-500",
  },
];

export function TeamMemberSidebar() {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { branding, currentLogo, showLogo, showFavicon } = useBranding();
  const { setOpenMobile, isMobile } = useSidebar();

  // Fetch team member data and permissions
  const { data: authData, isLoading } = useQuery<TeamAuthResponse>({
    queryKey: ["/api/team/auth/me"],
    queryFn: async () => {
      const token = TeamAuth.getToken();
      if (!token) throw new Error("No token");
      const response = await fetch("/api/team/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch team member data");
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
    window.location.href = "/team/login";
  };

  if (isLoading || !authData) {
    return null;
  }

  const { member, team, permissions } = authData;
  const isAdminTeam = team.type === "admin";
  const memberName =
    member.firstName && member.lastName
      ? `${member.firstName} ${member.lastName}`
      : member.email;
  const memberInitial = (
    member.firstName?.[0] ||
    member.email[0] ||
    "T"
  ).toUpperCase();
  const roleName = member.role?.name || "Team Member";

  // Check if user has read permission in a section (any subsection with canRead)
  const hasSectionAccess = (sectionId: string): boolean => {
    const sectionPerms = permissions[sectionId];
    if (!sectionPerms) return false;
    return Object.values(sectionPerms).some((perm) => perm.canRead === true);
  };

  // Check if user has a specific permission
  const hasPermission = (
    sectionId: string,
    subsectionId: string,
    action: "canCreate" | "canRead" | "canUpdate" | "canDelete",
  ): boolean => {
    const sectionPerms = permissions[sectionId];
    if (!sectionPerms) return false;
    const subsectionPerm = sectionPerms[subsectionId];
    if (!subsectionPerm) return false;
    return subsectionPerm[action] === true;
  };

  // Build navigation items based on permissions
  const buildNavItems = () => {
    const groups: Record<
      string,
      { url: string; icon: any; label: string; iconColor?: string }[]
    > = {
      build: [],
      evaluate: [],
      telephony: [],
      billing: [],
      settings: [],
      flowAutomation: [],
      tools: [],
    };

    // Add user section routes based on permissions
    Object.entries(USER_SECTION_ROUTES).forEach(([sectionId, routes]) => {
      if (hasSectionAccess(sectionId)) {
        routes.forEach((route) => {
          groups[route.group].push({
            url: route.url,
            icon: route.icon,
            label: route.label,
            iconColor: route.iconColor,
          });
        });
      }
    });

    // Add flow automation if agents section has flow_builder read permission
    if (hasPermission("agents", "flow_builder", "canRead")) {
      groups.flowAutomation = FLOW_AUTOMATION_ROUTES.map((r) => ({
        url: r.url,
        icon: r.icon,
        label: r.label,
        iconColor: r.iconColor,
      }));
    }

    return groups;
  };

  // Build admin tab items for admin team members
  const buildAdminTabs = (): {
    tabValue: string;
    icon: any;
    label: string;
  }[] => {
    if (!isAdminTeam) return [];

    const tabs: { tabValue: string; icon: any; label: string }[] = [];
    const addedTabs = new Set<string>();

    Object.entries(ADMIN_SECTION_TABS).forEach(([sectionId, sectionTabs]) => {
      if (hasSectionAccess(sectionId)) {
        sectionTabs.forEach((tab) => {
          if (!addedTabs.has(tab.tabValue)) {
            tabs.push(tab);
            addedTabs.add(tab.tabValue);
          }
        });
      }
    });

    return tabs;
  };

  const navGroups = buildNavItems();
  const adminTabs = buildAdminTabs();

  return (
    <Sidebar collapsible="icon">
      {/* Header with responsive logo */}
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border">
        {/* When expanded: Logo on left, toggle on right */}
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
            data-testid="button-sidebar-toggle"
          />
        </div>
        {/* When collapsed: Favicon + toggle stacked */}
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
            data-testid="button-sidebar-toggle-collapsed"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:px-0 px-2 py-1">
        {/* Team Member Badge */}
        <div className="mx-2 my-2 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <Shield className="h-4 w-4 text-primary" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">
                {isAdminTeam ? "Admin Team" : "Team Member"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {team.name}
              </span>
            </div>
          </div>
        </div>

        {/* Build Section */}
        {navGroups.build.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("sidebar.build")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navGroups.build.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.label}
                      data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon
                          className={`h-4 w-4 ${item.iconColor || ""}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Evaluate Section */}
        {navGroups.evaluate.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("sidebar.evaluate")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navGroups.evaluate.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.label}
                      data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon
                          className={`h-4 w-4 ${item.iconColor || ""}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Telephony Section */}
        {navGroups.telephony.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("sidebar.telephony")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navGroups.telephony.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.label}
                      data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon
                          className={`h-4 w-4 ${item.iconColor || ""}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Flow Automation Section */}
        {navGroups.flowAutomation.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("sidebar.flowAutomation")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navGroups.flowAutomation.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.label}
                      data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon
                          className={`h-4 w-4 ${item.iconColor || ""}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Tools Section */}
        {navGroups.tools.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("sidebar.tools") || "Tools"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navGroups.tools.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        location === item.url || location.startsWith(item.url)
                      }
                      tooltip={item.label}
                      data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon
                          className={`h-4 w-4 ${item.iconColor || ""}`}
                        />
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
        {navGroups.billing.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("sidebar.billing")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navGroups.billing.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.label}
                      data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon
                          className={`h-4 w-4 ${item.iconColor || ""}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Settings Section */}
        {navGroups.settings.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("sidebar.settings") || "Settings"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navGroups.settings.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.label}
                      data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Link href={item.url} onClick={handleNavClick}>
                        <item.icon
                          className={`h-4 w-4 ${item.iconColor || ""}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin Section - For admin team members */}
        {isAdminTeam && adminTabs.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("nav.administration")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/admin")}
                    tooltip={t("nav.adminDashboard")}
                    data-testid="link-admin-dashboard"
                  >
                    <Link href="/admin" onClick={handleNavClick}>
                      <Shield className="h-4 w-4" />
                      <span>{t("nav.adminDashboard")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-2 py-1.5 mt-auto border-t border-sidebar-border">
        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover-elevate cursor-pointer"
              data-testid="button-team-member-menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {memberInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs font-medium text-sidebar-foreground truncate">
                  {memberName}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {roleName}
                </span>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
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
              data-testid="button-team-logout"
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
