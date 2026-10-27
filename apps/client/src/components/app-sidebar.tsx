import {
  Settings,
  ChevronsUpDown,
  LogOut,
  Coins,
  Shield,
  BrainCircuit,
  BookOpen,
  Network,
  Orbit,
  GitMerge,
  Telescope,
  AlertTriangle,
  FlaskConical,
  RadioTower,
  Compass,
  LayoutDashboard,
  FileText,
  CreditCard,
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
import { AuthStorage } from "@/lib/auth-storage";

interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
  credits?: number;
  planType?: string;
}

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { branding, currentLogo, showLogo, showFavicon } = useBranding();
  const { setOpenMobile, isMobile } = useSidebar();

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const exploreItems = [
    {
      title: "Dashboard",
      url: "/app/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Constellation",
      url: "/app/constellation",
      icon: Orbit,
    },
  ];

  const knowledgeGraphItems = [
    {
      title: t("nav.knowledgeBase"),
      url: "/app/knowledge-base",
      icon: BookOpen,
    },
    {
      title: "Schema Observatory",
      url: "/app/knowledge-graph/:id/schema",
      icon: Telescope,
    },
    {
      title: "Federations",
      url: "/app/federations",
      icon: Network,
    },
    {
      title: "Merge Playground",
      url: "/app/merge-playground",
      icon: GitMerge,
    },
    {
      title: "Conflict Dashboard",
      url: "/app/federations/:id/conflicts",
      icon: AlertTriangle,
    },
  ];

  const intelligenceItems = [
    {
      title: "Graph Pulse",
      url: "/app/graph-pulse",
      icon: RadioTower,
    },
    {
      title: "Eval Harness",
      url: "/app/eval-harness",
      icon: FlaskConical,
    },
    {
      title: "Brain Endpoints",
      url: "/app/brain-endpoints",
      icon: BrainCircuit,
    },
  ];

  const learnItems = [
    {
      title: "Cartographer",
      url: "/app/cartographer",
      icon: Compass,
    },
  ];

  const platformItems = [
    {
      title: t("nav.accountSettings") || "Settings",
      url: "/app/settings",
      icon: Settings,
    },
    {
      title: t("nav.promptTemplates") || "Prompt Templates",
      url: "/app/prompt-templates",
      icon: FileText,
    },
    {
      title: t("nav.billingCredits") || "Billing",
      url: "/app/billing",
      icon: CreditCard,
    },
  ];

  // Fetch current user data including credits - ONLY from server, no localStorage fallback
  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  // If no user data from server, don't render (security: prevents localStorage spoofing)
  if (userLoading || !user) {
    return null;
  }

  const userName = user.name || "User";
  const userInitial = userName.charAt(0).toUpperCase() || "U";
  const isPro = user.planType === "pro";

  // Credits from user data
  const remainingCredits = user.credits || 0;

  const handleLogout = () => {
    // Logout request clears the HttpOnly refresh token cookie on the server
    fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    AuthStorage.clearAuth();
    window.location.href = "/login";
  };

  const renderSection = (
    label: string,
    items: { title: string; url: string; icon: React.ElementType }[],
  ) => (
    <SidebarGroup>
      <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={
                  location === item.url ||
                  (item.url !== "/app/dashboard" &&
                    location.startsWith(item.url + "/"))
                }
                tooltip={item.title}
                data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Link href={item.url} onClick={handleNavClick}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

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
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          {!showLogo && (
            <span className="text-lg font-bold tracking-tight text-foreground">
              wtrdb
            </span>
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
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <SidebarTrigger
            className="h-5 w-5 shrink-0"
            data-testid="button-sidebar-toggle-collapsed"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:px-0 px-2 py-1">
        {/* Explore */}
        {renderSection("Explore", exploreItems)}

        {/* Knowledge Graphs */}
        {renderSection("Knowledge Graphs", knowledgeGraphItems)}

        {/* Intelligence */}
        {renderSection("Intelligence", intelligenceItems)}

        {/* Learn */}
        {renderSection("Learn", learnItems)}

        {/* Platform */}
        {renderSection("Platform", platformItems)}

        {/* Admin - Show for admins only */}
        {user.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("nav.administration")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/admin"}
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

        {/* Credit Status */}
        <div className="mx-2 my-2 group-data-[collapsible=icon]:hidden">
          <div className="relative overflow-hidden rounded-xl border border-slate-600/60 p-3 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 shadow-sm">
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_3s_ease-in-out_infinite]"
              style={{ backgroundSize: "200% 100%" }}
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 shadow-inner">
                    <Coins className="h-4 w-4 text-slate-300" />
                  </div>
                  <span className="text-sm font-semibold text-slate-200">
                    {t("sidebar.credits")}
                  </span>
                </div>
                {isPro ? (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide bg-gradient-to-r from-amber-500 to-yellow-600 text-amber-950 shadow-sm border border-yellow-600/30">
                    {t("sidebar.pro")}
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs font-medium text-slate-300 hover:bg-slate-600/60"
                    onClick={() => setLocation("/app/upgrade")}
                    data-testid="button-upgrade-inline"
                  >
                    {t("sidebar.upgrade")}
                  </Button>
                )}
              </div>
              <div className="mt-1.5 text-xl font-bold bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-clip-text text-transparent">
                {remainingCredits.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-2 py-1.5 mt-auto border-t border-sidebar-border">
        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover-elevate cursor-pointer"
              data-testid="button-user-menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs font-medium text-sidebar-foreground truncate">
                  {userName}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {t("sidebar.myWorkspace")}
                </span>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 p-0">
            {/* Credits Section */}
            <div className="relative overflow-hidden m-2 rounded-xl border border-slate-600/60 p-4 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 shadow-sm">
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_3s_ease-in-out_infinite]"
                style={{ backgroundSize: "200% 100%" }}
              />
              <div className="relative space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-slate-600 to-slate-700 shadow-inner">
                      <Coins className="h-4 w-4 text-slate-300" />
                    </div>
                    <span className="text-sm font-semibold text-slate-200">
                      {t("sidebar.credits")}
                    </span>
                  </div>
                  {isPro ? (
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide bg-gradient-to-r from-amber-500 to-yellow-600 text-amber-950 shadow-sm border border-yellow-600/30">
                      {t("sidebar.proMember")}
                    </span>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 px-3 text-xs font-semibold"
                      onClick={() => setLocation("/app/upgrade")}
                      data-testid="button-upgrade-dropdown"
                    >
                      {t("sidebar.upgrade")}
                    </Button>
                  )}
                </div>
                <div className="text-2xl font-bold bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-clip-text text-transparent">
                  {remainingCredits.toLocaleString()}{" "}
                  <span className="text-sm font-medium text-slate-400">
                    credits
                  </span>
                </div>
              </div>
            </div>
            <DropdownMenuSeparator />

            {/* Account Settings */}
            <DropdownMenuItem
              onClick={() => setLocation("/app/settings")}
              className="cursor-pointer"
              data-testid="link-account-settings"
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>{t("nav.accountSettings")}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Log out */}
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-destructive focus:text-destructive"
              data-testid="button-logout"
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
