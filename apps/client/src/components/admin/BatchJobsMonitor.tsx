import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Phone,
  RefreshCw,
  Layers,
  PlayCircle,
  PauseCircle,
  StopCircle,
  BarChart3,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

interface BatchJobStats {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  pending: number;
}

interface BatchJob {
  campaignId: string;
  campaignName: string;
  batchJobId: string;
  batchJobStatus: string;
  agentName?: string;
  totalContacts: number;
  totalCallsScheduled?: number;
  totalCallsDispatched?: number;
  createdAt?: string;
  lastUpdatedAt?: string;
  stats?: {
    pending: number;
    scheduled: number;
    dispatched: number;
    in_progress: number;
    completed: number;
    failed: number;
    total: number;
    progress: number;
  };
  error?: string;
}

interface BatchJobsResponse {
  batchJobs: BatchJob[];
}

export default function BatchJobsMonitor() {
  const {
    data: batchData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<BatchJobsResponse>({
    queryKey: ["/api/admin/batch-jobs"],
    refetchInterval: 15000,
  });

  const batchJobs = batchData?.batchJobs || [];

  const aggregateStats = batchJobs.reduce<BatchJobStats>(
    (acc, job) => {
      switch (job.batchJobStatus) {
        case "completed":
          acc.completed++;
          break;
        case "failed":
          acc.failed++;
          break;
        case "in_progress":
          acc.inProgress++;
          break;
        case "pending":
        case "scheduled":
          acc.pending++;
          break;
      }
      acc.total++;
      return acc;
    },
    { total: 0, completed: 0, failed: 0, inProgress: 0, pending: 0 },
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="bg-slate-900 text-slate-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "scheduled":
        return (
          <Badge variant="secondary" className="bg-blue-900 text-blue-200">
            <Clock className="h-3 w-3 mr-1" />
            Scheduled
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="secondary" className="bg-amber-900 text-amber-200">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            In Progress
          </Badge>
        );
      case "completed":
        return (
          <Badge
            variant="secondary"
            className="bg-emerald-900 text-emerald-200"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="text-slate-400">
            <StopCircle className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return "N/A";
    }
  };

  const getProgressValue = (job: BatchJob) => {
    if (job.stats?.progress !== undefined) {
      return job.stats.progress;
    }
    if (job.totalCallsScheduled && job.totalCallsDispatched !== undefined) {
      return Math.round(
        (job.totalCallsDispatched / job.totalCallsScheduled) * 100,
      );
    }
    return 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Batch Jobs Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Monitor batch calling jobs across all campaigns
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          data-testid="button-refresh-batch-jobs"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <Layers className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-batch-total">
              {isLoading ? "..." : aggregateStats.total}
            </div>
            <p className="text-xs text-muted-foreground">All batch jobs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              data-testid="text-batch-pending"
            >
              {isLoading ? "..." : aggregateStats.pending}
            </div>
            <p className="text-xs text-muted-foreground">Waiting to start</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <PlayCircle className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              data-testid="text-batch-in-progress"
            >
              {isLoading ? "..." : aggregateStats.inProgress}
            </div>
            <p className="text-xs text-muted-foreground">Currently calling</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              data-testid="text-batch-completed"
            >
              {isLoading ? "..." : aggregateStats.completed}
            </div>
            <p className="text-xs text-muted-foreground">
              Successfully finished
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertCircle className="h-4 w-4 text-rose-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-batch-failed">
              {isLoading ? "..." : aggregateStats.failed}
            </div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Batch Jobs
          </CardTitle>
          <CardDescription>
            Real-time view of batch calling jobs (auto-refreshes every 15
            seconds)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : batchJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No batch jobs found</p>
              <p className="text-sm mt-1">
                Start a campaign to create a batch calling job
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Agent
                    </TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Calls
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Last Update
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchJobs.map((job) => (
                    <TableRow
                      key={job.batchJobId}
                      data-testid={`row-batch-job-${job.batchJobId}`}
                    >
                      <TableCell>
                        {getStatusBadge(job.batchJobStatus)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <Link href={`/admin/campaigns/${job.campaignId}`}>
                            <span className="font-medium hover:underline cursor-pointer">
                              {job.campaignName}
                            </span>
                          </Link>
                          <span className="text-xs text-muted-foreground font-mono">
                            {job.batchJobId?.slice(0, 8)}...
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm">
                          {job.agentName || "N/A"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="w-24 sm:w-32 space-y-1">
                          <Progress
                            value={getProgressValue(job)}
                            className="h-2"
                          />
                          <span className="text-xs text-muted-foreground">
                            {getProgressValue(job)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-col text-sm">
                          {job.stats ? (
                            <>
                              <span className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                {job.stats.completed} completed
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                {job.stats.in_progress} in progress
                              </span>
                              {job.stats.failed > 0 && (
                                <span className="flex items-center gap-1 text-rose-500">
                                  <XCircle className="h-3 w-3" />
                                  {job.stats.failed} failed
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              {job.totalCallsDispatched || 0} /{" "}
                              {job.totalCallsScheduled || job.totalContacts}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {formatTime(job.lastUpdatedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/campaigns/${job.campaignId}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`button-view-campaign-${job.campaignId}`}
                          >
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
