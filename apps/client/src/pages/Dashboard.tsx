import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Users,
  UserPlus,
  Loader2,
  Megaphone,
  Bot,
  Workflow,
  Flame,
  ThermometerSun,
  Snowflake,
  XCircle,
  Target,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Contact2,
  Calendar,
  FileText,
  BookOpen,
  Webhook,
  Coins,
  Crown,
  Layers,
} from "lucide-react";
import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { AuthStorage } from "@/lib/auth-storage";
import { useIsViewer } from "@/hooks/useIsViewer";
import { DashboardGraphCard } from "@/components/knowledge-graph/DashboardGraphCard";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface CallTypeStat {
  count: number;
  trend: number;
  successRate: number;
  avgDuration: number;
}

interface CampaignStat {
  count: number;
  active: number;
  completed: number;
  successRate: number;
  avgDuration: number;
  totalCalls: number;
}

interface DashboardData {
  callTypeStats: {
    incoming: CallTypeStat;
    outgoing: CallTypeStat;
    campaign: CampaignStat;
  };
  weeklyCallsChart: Array<{ date: string; incoming: number; outgoing: number }>;
  leadDistribution: {
    hot: number;
    warm: number;
    cold: number;
    lost: number;
  };
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  recentCalls: Array<{
    id: string;
    phoneNumber: string | null;
    status: string;
    duration: number | null;
    classification: string | null;
    callDirection: string | null;
    createdAt: string;
    callType: string;
  }>;
  recentUsers: Array<{
    id: string;
    email: string;
    createdAt: string | null;
  }>;
  userName: string;
  totalCalls: number;
  totalThisWeek: number;
  totalPrevWeek: number;
  weeklyTrend: number;
  appointmentsBooked: number;
  formsSubmitted: number;
  formsCount: number;
  knowledgeBaseCount: number;
  webhooksCount: number;
  templatesCount: number;
}

interface CurrentUser {
  id: string;
  credits: number;
  planType: string;
}

interface UserSubscriptionSummary {
  status: string;
  plan?: {
    displayName?: string;
    includedCredits?: number;
    signupBonusCredits?: number;
    creditRolloverMonths?: number;
    creditRolloverCap?: number;
  } | null;
}

interface CreditBalanceBreakdown {
  totalCredits: number;
  bucketCredits: number;
  legacyCredits: number;
}

function getGreeting(t: (key: string) => string): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return t("dashboard.greeting.morning");
  if (hour >= 12 && hour < 17) return t("dashboard.greeting.afternoon");
  if (hour >= 17 && hour < 21) return t("dashboard.greeting.evening");
  return t("dashboard.greeting.default");
}

export default function Dashboard() {
  const { t } = useTranslation();
  const isViewer = useIsViewer();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [chartView, setChartView] = useState<"all" | "incoming" | "outgoing">(
    "all",
  );
  const [, setLocation] = useLocation();
  const buildAuthHeaders = () => {
    const headers: Record<string, string> = {};
    const authHeader = AuthStorage.getAuthHeader();
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }
    return headers;
  };

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard", {
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch dashboard data");
      return response.json();
    },
  });

  const { data: contacts = [] } = useQuery<
    Array<{ source: "campaign" | "call"; callCount: number }>
  >({
    queryKey: ["/api/contacts/deduplicated"],
    queryFn: async () => {
      const response = await fetch("/api/contacts/deduplicated", {
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch contacts");
      return response.json();
    },
  });

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    },
  });

  const { data: subscription } = useQuery<UserSubscriptionSummary | null>({
    queryKey: ["/api/user-subscription"],
    queryFn: async () => {
      const response = await fetch("/api/user-subscription", {
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
  });

  const { data: creditBreakdown } = useQuery<CreditBalanceBreakdown | null>({
    queryKey: ["/api/credits/balance-breakdown"],
    queryFn: async () => {
      const response = await fetch("/api/credits/balance-breakdown", {
        credentials: "include",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
  });

  const contactsCount = contacts.length;
  const campaignContactsCount = contacts.filter(
    (c) => c.source === "campaign",
  ).length;
  const callContactsCount = contacts.filter((c) => c.source === "call").length;

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const weeklyChartData = (dashboard?.weeklyCallsChart || []).map((day) => ({
    name: new Date(day.date).toLocaleDateString("en-US", { weekday: "short" }),
    Incoming: day.incoming,
    Outgoing: day.outgoing,
    Total: day.incoming + day.outgoing,
  }));

  const leadData = dashboard?.leadDistribution
    ? [
        {
          name: t("dashboard.hot"),
          value: dashboard.leadDistribution.hot,
          color: "#ef4444",
        },
        {
          name: t("dashboard.warm"),
          value: dashboard.leadDistribution.warm,
          color: "#5BBE4E",
        },
        {
          name: t("dashboard.cold"),
          value: dashboard.leadDistribution.cold,
          color: "#07A288",
        },
        {
          name: t("dashboard.lost"),
          value: dashboard.leadDistribution.lost,
          color: "#6b7280",
        },
      ]
    : [];

  const totalLeads = leadData.reduce((sum, d) => sum + d.value, 0);

  const sentimentData = dashboard?.sentimentDistribution
    ? [
        {
          name: t("dashboard.positive"),
          value: dashboard.sentimentDistribution.positive,
          color: "#B8E52B",
        },
        {
          name: t("dashboard.neutral"),
          value: dashboard.sentimentDistribution.neutral,
          color: "#6b7280",
        },
        {
          name: t("dashboard.negative"),
          value: dashboard.sentimentDistribution.negative,
          color: "#ef4444",
        },
      ].filter((d) => d.value > 0)
    : [];

  const totalSentiment = sentimentData.reduce((sum, d) => sum + d.value, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const TrendBadge = ({ trend }: { trend: number }) => {
    if (trend === 0)
      return <span className="text-muted-foreground/60 text-xs ml-1">--</span>;
    const isPositive = trend > 0;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-xs font-medium ml-2 ${isPositive ? "text-emerald-600" : "text-red-500"}`}
      >
        {isPositive ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )}
        {Math.abs(trend)}%
      </span>
    );
  };

  const greeting = getGreeting(t);
  const userName = dashboard?.userName || "User";

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header with Greeting and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1
            className="text-xl md:text-2xl font-semibold tracking-tight text-foreground"
            data-testid="text-dashboard-title"
          >
            {greeting}, {userName}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            {t("dashboard.subtitle")}
          </p>
        </div>
        {!isViewer && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="bg-primary hover:bg-primary/90"
                data-testid="button-quick-actions"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("dashboard.quickActions")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => setCreateDialogOpen(true)}
                data-testid="menu-create-campaign"
              >
                <Megaphone className="h-4 w-4 mr-2" />
                {t("dashboard.createCampaign")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLocation("/app/agents")}
                data-testid="menu-create-agent"
              >
                <Bot className="h-4 w-4 mr-2" />
                {t("dashboard.createAgent")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLocation("/app/flows/new")}
                data-testid="menu-flow-builder"
              >
                <Workflow className="h-4 w-4 mr-2" />
                {t("dashboard.flowBuilder")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className="bg-gradient-to-br from-emerald-950/30 to-teal-950/30 border-emerald-900/50 cursor-pointer hover-elevate"
          data-testid="card-credits-available"
          onClick={() => setLocation("/app/billing")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Available Credits
              </p>
              <Coins className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold tracking-tight mt-1">
              {(currentUser?.credits || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              1 credit = ₹0.84
            </p>
          </CardContent>
        </Card>

        <Card
          className="bg-gradient-to-br from-indigo-950/30 to-blue-950/30 border-indigo-900/50 cursor-pointer hover-elevate"
          data-testid="card-plan-summary"
          onClick={() => setLocation("/app/upgrade")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Current Plan
              </p>
              <Crown className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="text-xl font-semibold mt-1 capitalize">
              {subscription?.plan?.displayName ||
                currentUser?.planType ||
                "Free"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(subscription?.plan?.includedCredits || 0).toLocaleString()}{" "}
              credits/month
              {(subscription?.plan?.signupBonusCredits || 0) > 0
                ? ` • ${(subscription?.plan?.signupBonusCredits || 0).toLocaleString()} one-time signup bonus`
                : ""}
              {(subscription?.plan?.creditRolloverCap || 0) > 0
                ? ` • ${(subscription?.plan?.creditRolloverMonths || 0).toString()}m rollover cap ${(subscription?.plan?.creditRolloverCap || 0).toLocaleString()}`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card
          className="bg-gradient-to-br from-amber-950/30 to-orange-950/30 border-amber-900/50 cursor-pointer hover-elevate"
          data-testid="card-ledger-breakdown"
          onClick={() => setLocation("/app/billing")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Credit Breakdown
              </p>
              <Layers className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-lg font-semibold mt-1">
              Bucketed {(creditBreakdown?.bucketCredits || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Legacy {(creditBreakdown?.legacyCredits || 0).toLocaleString()} •
              Total {(creditBreakdown?.totalCredits || currentUser?.credits || 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards Row - with colored backgrounds like the image */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Calls - Tinted cyan/blue like "Views" in image */}
        <Card
          className="bg-gradient-to-br from-cyan-950/30 to-sky-950/30 border-cyan-900/50"
          data-testid="card-total-calls"
        >
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t("dashboard.totalCalls")}
            </p>
            <div className="flex items-baseline">
              <span className="text-3xl font-bold tracking-tight">
                {dashboard?.totalCalls || 0}
              </span>
              <TrendBadge trend={dashboard?.weeklyTrend || 0} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("dashboard.allTime")}
            </p>
          </CardContent>
        </Card>

        {/* Incoming Calls - Tinted green */}
        <Card
          className="bg-gradient-to-br from-emerald-950/30 to-green-950/30 border-emerald-900/50"
          data-testid="card-incoming-calls"
        >
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t("dashboard.incomingCalls")}
            </p>
            <div className="flex items-baseline">
              <span className="text-3xl font-bold tracking-tight">
                {dashboard?.callTypeStats?.incoming?.count || 0}
              </span>
              <TrendBadge
                trend={dashboard?.callTypeStats?.incoming?.trend || 0}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>
                {dashboard?.callTypeStats?.incoming?.successRate || 0}%{" "}
                {t("dashboard.success")}
              </span>
              <span>
                {t("dashboard.avg")}{" "}
                {formatDuration(
                  dashboard?.callTypeStats?.incoming?.avgDuration || 0,
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Outgoing Calls - Blue/indigo tint */}
        <Card
          className="bg-gradient-to-br from-blue-950/30 to-indigo-950/30 border-blue-900/50"
          data-testid="card-outgoing-calls"
        >
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t("dashboard.outgoingCalls")}
            </p>
            <div className="flex items-baseline">
              <span className="text-3xl font-bold tracking-tight">
                {dashboard?.callTypeStats?.outgoing?.count || 0}
              </span>
              <TrendBadge
                trend={dashboard?.callTypeStats?.outgoing?.trend || 0}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>
                {dashboard?.callTypeStats?.outgoing?.successRate || 0}%{" "}
                {t("dashboard.success")}
              </span>
              <span>
                {t("dashboard.avg")}{" "}
                {formatDuration(
                  dashboard?.callTypeStats?.outgoing?.avgDuration || 0,
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Contacts Card - Teal tint */}
        <Card
          className="bg-gradient-to-br from-teal-950/30 to-cyan-950/30 border-teal-900/50 cursor-pointer hover-elevate"
          data-testid="card-contacts"
          onClick={() => setLocation("/app/contacts")}
        >
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t("dashboard.contacts")}
            </p>
            <div className="flex items-baseline">
              <span className="text-3xl font-bold tracking-tight">
                {contactsCount}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {t("common.total")}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="flex items-center gap-1 text-emerald-500">
                <Users className="h-3 w-3" />
                {campaignContactsCount} {t("dashboard.campaigns")}
              </span>
              <span className="flex items-center gap-1 text-violet-500">
                <Phone className="h-3 w-3" />
                {callContactsCount} {t("calls.title").toLowerCase()}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Campaigns Card - Purple/violet tint */}
        <Card
          className="bg-gradient-to-br from-violet-950/30 to-purple-950/30 border-violet-900/50"
          data-testid="card-campaigns"
        >
          <CardContent className="pt-5 pb-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {t("dashboard.campaignsCard")}
            </p>
            <div className="flex items-baseline">
              <span className="text-3xl font-bold tracking-tight">
                {dashboard?.callTypeStats?.campaign?.count || 0}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {t("common.total")}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="flex items-center gap-1 text-amber-500">
                <Target className="h-3 w-3" />
                {dashboard?.callTypeStats?.campaign?.active || 0}{" "}
                {t("common.active").toLowerCase()}
              </span>
              <span className="flex items-center gap-1 text-emerald-500">
                <CheckCircle2 className="h-3 w-3" />
                {dashboard?.callTypeStats?.campaign?.successRate || 0}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats Row - Appointments, Forms, Knowledge Base, Webhooks, Templates, Knowledge Graphs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Appointments Booked Card */}
        <Card
          className="bg-gradient-to-br from-pink-950/30 to-rose-950/30 border-pink-900/50 cursor-pointer hover-elevate"
          data-testid="card-appointments"
          onClick={() => setLocation("/app/flows/appointments")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("dashboard.appointmentsBooked")}
                </p>
                <span className="text-2xl font-bold tracking-tight">
                  {dashboard?.appointmentsBooked || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Forms Submitted Card */}
        <Card
          className="bg-gradient-to-br from-indigo-950/30 to-purple-950/30 border-indigo-900/50 cursor-pointer hover-elevate"
          data-testid="card-forms-submitted"
          onClick={() => setLocation("/app/flows/forms")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("dashboard.formsSubmitted")}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">
                    {dashboard?.formsSubmitted || 0}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({dashboard?.formsCount || 0}{" "}
                    {t("forms.totalForms").toLowerCase()})
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Knowledge Base Card */}
        <Card
          className="bg-gradient-to-br from-amber-950/30 to-orange-950/30 border-amber-900/50 cursor-pointer hover-elevate"
          data-testid="card-knowledge-base"
          onClick={() => setLocation("/app/knowledge-base")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("dashboard.knowledgeBase")}
                </p>
                <span className="text-2xl font-bold tracking-tight">
                  {dashboard?.knowledgeBaseCount || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhooks Card */}
        <Card
          className="bg-gradient-to-br from-cyan-950/30 to-teal-950/30 border-cyan-900/50 cursor-pointer hover-elevate"
          data-testid="card-webhooks"
          onClick={() => setLocation("/app/flows/webhooks")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center">
                <Webhook className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("dashboard.webhooks")}
                </p>
                <span className="text-2xl font-bold tracking-tight">
                  {dashboard?.webhooksCount || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates Card */}
        <Card
          className="bg-gradient-to-br from-green-950/30 to-emerald-950/30 border-green-900/50 cursor-pointer hover-elevate"
          data-testid="card-templates"
          onClick={() => setLocation("/app/prompt-templates")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("dashboard.templates")}
                </p>
                <span className="text-2xl font-bold tracking-tight">
                  {dashboard?.templatesCount || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Knowledge Graphs Card */}
        <DashboardGraphCard />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Calls Chart - Now with tabs like image */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">
                {t("dashboard.callActivity")}
              </CardTitle>
              {/* Tab-style navigation like the image */}
              <div className="flex items-center border-b border-transparent">
                <button
                  onClick={() => setChartView("all")}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                    chartView === "all"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="tab-all-calls"
                >
                  {t("dashboard.allCalls")}
                </button>
                <button
                  onClick={() => setChartView("incoming")}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                    chartView === "incoming"
                      ? "border-emerald-500 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="tab-incoming-calls"
                >
                  {t("dashboard.incoming")}
                </button>
                <button
                  onClick={() => setChartView("outgoing")}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                    chartView === "outgoing"
                      ? "border-blue-500 text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="tab-outgoing-calls"
                >
                  {t("dashboard.outgoing")}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {weeklyChartData.length > 0 ? (
              <div className="h-[280px]" data-testid="chart-weekly-calls">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={weeklyChartData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorIncoming"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#B8E52B"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#B8E52B"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorOutgoing"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#07A288"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#07A288"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="name"
                      tick={{
                        fontSize: 11,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{
                        fontSize: 11,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                      tickLine={false}
                      axisLine={false}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    {(chartView === "all" || chartView === "incoming") && (
                      <Area
                        type="monotone"
                        dataKey="Incoming"
                        stroke="#B8E52B"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorIncoming)"
                      />
                    )}
                    {(chartView === "all" || chartView === "outgoing") && (
                      <Area
                        type="monotone"
                        dataKey="Outgoing"
                        stroke="#07A288"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorOutgoing)"
                      />
                    )}
                    {chartView === "all" && (
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                        iconType="circle"
                        iconSize={8}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t("dashboard.noCallData")}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lead Distribution Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.leadDistribution")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leadData.length > 0 ? (
              <div className="h-[280px]" data-testid="chart-lead-distribution">
                <ResponsiveContainer width="100%" height="70%">
                  <PieChart>
                    <Pie
                      data={leadData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {leadData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [
                        `${value} (${((value / totalLeads) * 100).toFixed(0)}%)`,
                        "",
                      ]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {leadData.map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {item.name}
                      </span>
                      <span className="text-xs font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Users className="h-8 w-8 opacity-40" />
                <p className="text-sm">{t("dashboard.noLeadData")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sentiment Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Distribution Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.sentimentAnalysis")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sentimentData.length > 0 ? (
              <div
                className="h-[280px]"
                data-testid="chart-sentiment-distribution"
              >
                <ResponsiveContainer width="100%" height="70%">
                  <PieChart>
                    <Pie
                      data={sentimentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {sentimentData.map((entry, index) => (
                        <Cell
                          key={`sentiment-cell-${index}`}
                          fill={entry.color}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [
                        `${value} (${((value / totalSentiment) * 100).toFixed(0)}%)`,
                        "",
                      ]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {sentimentData.map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {item.name}
                      </span>
                      <span className="text-xs font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Target className="h-8 w-8 opacity-40" />
                <p className="text-sm">{t("dashboard.noSentimentData")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Call Types Summary Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.callTypeBreakdown")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-emerald-950/30">
                <div className="flex items-center gap-3">
                  <PhoneIncoming className="h-5 w-5 text-emerald-500" />
                  <div>
                    <span className="text-sm font-medium">
                      {t("dashboard.incomingCalls")}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {dashboard?.callTypeStats?.incoming?.successRate || 0}%{" "}
                      {t("dashboard.success")}
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-emerald-600">
                  {dashboard?.callTypeStats?.incoming?.count || 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-blue-950/30">
                <div className="flex items-center gap-3">
                  <PhoneOutgoing className="h-5 w-5 text-blue-500" />
                  <div>
                    <span className="text-sm font-medium">
                      {t("dashboard.outgoingCalls")}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {dashboard?.callTypeStats?.outgoing?.successRate || 0}%{" "}
                      {t("dashboard.success")}
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-blue-600">
                  {dashboard?.callTypeStats?.outgoing?.count || 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-violet-950/30">
                <div className="flex items-center gap-3">
                  <Target className="h-5 w-5 text-violet-500" />
                  <div>
                    <span className="text-sm font-medium">
                      {t("dashboard.campaignsCard")}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {dashboard?.callTypeStats?.campaign?.active || 0}{" "}
                      {t("common.active").toLowerCase()}
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold text-violet-600">
                  {dashboard?.callTypeStats?.campaign?.count || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Calls */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base font-semibold">
              {t("dashboard.recentCalls")}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/app/calls")}
              data-testid="button-view-all-calls"
            >
              {t("common.viewAll")}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2" data-testid="list-recent-calls">
              {(dashboard?.recentCalls || []).length > 0 ? (
                dashboard?.recentCalls.slice(0, 5).map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/40 hover-elevate cursor-pointer transition-colors"
                    onClick={() => setLocation(`/app/calls/${call.id}`)}
                    data-testid={`call-item-${call.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          call.callType === "incoming"
                            ? "bg-emerald-500/10"
                            : call.callType === "batch"
                              ? "bg-purple-500/10"
                              : "bg-blue-500/10"
                        }`}
                      >
                        {call.callType === "incoming" ? (
                          <PhoneIncoming className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {call.phoneNumber || t("dashboard.unknown")}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {call.callType}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatDuration(call.duration)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {call.createdAt
                          ? formatDistanceToNow(new Date(call.createdAt), {
                              addSuffix: true,
                            })
                          : ""}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t("dashboard.noRecentCalls")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Users (Admin only) / Lead Summary for regular users */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {(dashboard?.recentUsers || []).length > 0
                ? t("dashboard.recentUsers")
                : t("dashboard.leadSummary")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(dashboard?.recentUsers || []).length > 0 ? (
              <div className="space-y-2" data-testid="list-recent-users">
                {dashboard?.recentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/40"
                    data-testid={`user-item-${user.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <UserPlus className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("dashboard.registeredAgo", { time: "" })
                            .replace("{{time}}", "")
                            .trim()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {user.createdAt
                          ? formatDistanceToNow(new Date(user.createdAt), {
                              addSuffix: true,
                            })
                          : "Recently"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2" data-testid="lead-summary">
                <div className="flex items-center justify-between p-3 rounded-lg bg-red-950/30">
                  <div className="flex items-center gap-3">
                    <Flame className="h-5 w-5 text-red-500" />
                    <span className="text-sm font-medium">
                      {t("dashboard.hot")}{" "}
                      {t("calls.classification.hot").split(" ")[1] || "Leads"}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-red-500">
                    {dashboard?.leadDistribution?.hot || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-amber-950/30">
                  <div className="flex items-center gap-3">
                    <ThermometerSun className="h-5 w-5 text-amber-500" />
                    <span className="text-sm font-medium">
                      {t("dashboard.warm")}{" "}
                      {t("calls.classification.warm").split(" ")[1] || "Leads"}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-amber-500">
                    {dashboard?.leadDistribution?.warm || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-blue-950/30">
                  <div className="flex items-center gap-3">
                    <Snowflake className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">
                      {t("dashboard.cold")}{" "}
                      {t("calls.classification.cold").split(" ")[1] || "Leads"}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-blue-500">
                    {dashboard?.leadDistribution?.cold || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/60">
                  <div className="flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t("dashboard.lost")}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-muted-foreground">
                    {dashboard?.leadDistribution?.lost || 0}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
