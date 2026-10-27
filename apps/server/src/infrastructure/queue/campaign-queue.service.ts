import { storage } from "../../storage";
import { logger } from "../../utils/logger";

const SOURCE = "Campaign Queue";
const DEFAULT_BATCH_CONCURRENCY = 10;

export interface CampaignJob {
  id: string;
  campaignId: string;
  contactId: string;
  engine: "plivo" | "twilio";
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  lastError?: string;
  createdAt: Date;
  processedAt?: Date;
}

interface CampaignQueueState {
  jobs: CampaignJob[];
  status: "idle" | "processing";
}

export class CampaignQueueService {
  private queues: Map<string, CampaignQueueState> = new Map();
  private jobIndex: Map<string, { campaignId: string; index: number }> =
    new Map();

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private ensureQueue(campaignId: string): CampaignQueueState {
    if (!this.queues.has(campaignId)) {
      this.queues.set(campaignId, { jobs: [], status: "idle" });
      logger.info(
        `Initialized queue for campaign ${campaignId}`,
        undefined,
        SOURCE,
      );
    }
    return this.queues.get(campaignId)!;
  }

  async getBatchConcurrency(): Promise<number> {
    try {
      const setting = await storage.getGlobalSetting(
        "campaign_batch_concurrency",
      );
      const value =
        typeof setting?.value === "number"
          ? setting.value
          : DEFAULT_BATCH_CONCURRENCY;
      return value;
    } catch (error) {
      logger.warn(
        `Failed to get batch concurrency setting, using default: ${DEFAULT_BATCH_CONCURRENCY}`,
        undefined,
        SOURCE,
      );
      return DEFAULT_BATCH_CONCURRENCY;
    }
  }

  addJob(
    campaignId: string,
    contactId: string,
    engine: "plivo" | "twilio",
  ): CampaignJob {
    const queue = this.ensureQueue(campaignId);

    const job: CampaignJob = {
      id: this.generateJobId(),
      campaignId,
      contactId,
      engine,
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
    };

    queue.jobs.push(job);
    this.jobIndex.set(job.id, { campaignId, index: queue.jobs.length - 1 });

    logger.info(
      `Added job ${job.id} for contact ${contactId} (engine: ${engine})`,
      undefined,
      SOURCE,
    );
    return job;
  }

  addBulkJobs(
    campaignId: string,
    contacts: { contactId: string; engine: "plivo" | "twilio" }[],
  ): CampaignJob[] {
    const queue = this.ensureQueue(campaignId);
    const jobs: CampaignJob[] = [];
    const startIndex = queue.jobs.length;

    for (let i = 0; i < contacts.length; i++) {
      const { contactId, engine } = contacts[i];
      const job: CampaignJob = {
        id: this.generateJobId(),
        campaignId,
        contactId,
        engine,
        status: "pending",
        attempts: 0,
        createdAt: new Date(),
      };

      queue.jobs.push(job);
      this.jobIndex.set(job.id, { campaignId, index: startIndex + i });
      jobs.push(job);
    }

    logger.info(
      `Added ${jobs.length} jobs in bulk for campaign ${campaignId}`,
      undefined,
      SOURCE,
    );
    return jobs;
  }

  getNextJob(campaignId: string): CampaignJob | null {
    const queue = this.queues.get(campaignId);
    if (!queue) {
      return null;
    }

    const pendingJob = queue.jobs.find((job) => job.status === "pending");
    if (pendingJob) {
      pendingJob.status = "processing";
      pendingJob.attempts += 1;
      queue.status = "processing";
      logger.info(
        `Retrieved next job ${pendingJob.id} for campaign ${campaignId}`,
        undefined,
        SOURCE,
      );
      return pendingJob;
    }

    return null;
  }

  updateJobStatus(
    jobId: string,
    status: "pending" | "processing" | "completed" | "failed",
    error?: string,
  ): boolean {
    const jobInfo = this.jobIndex.get(jobId);
    if (!jobInfo) {
      logger.warn(`Job ${jobId} not found in index`, undefined, SOURCE);
      return false;
    }

    const queue = this.queues.get(jobInfo.campaignId);
    if (!queue) {
      logger.warn(
        `Queue for campaign ${jobInfo.campaignId} not found`,
        undefined,
        SOURCE,
      );
      return false;
    }

    const job = queue.jobs.find((j) => j.id === jobId);
    if (!job) {
      logger.warn(`Job ${jobId} not found in queue`, undefined, SOURCE);
      return false;
    }

    job.status = status;
    if (error) {
      job.lastError = error;
    }
    if (status === "completed" || status === "failed") {
      job.processedAt = new Date();
    }

    const hasProcessingJobs = queue.jobs.some((j) => j.status === "processing");
    const hasPendingJobs = queue.jobs.some((j) => j.status === "pending");
    if (!hasProcessingJobs && !hasPendingJobs) {
      queue.status = "idle";
    }

    logger.info(
      `Updated job ${jobId} status to ${status}${error ? ` (error: ${error})` : ""}`,
      undefined,
      SOURCE,
    );
    return true;
  }

  getJobStats(campaignId: string): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const queue = this.queues.get(campaignId);
    if (!queue) {
      return { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
    }

    const stats = {
      total: queue.jobs.length,
      pending: queue.jobs.filter((j) => j.status === "pending").length,
      processing: queue.jobs.filter((j) => j.status === "processing").length,
      completed: queue.jobs.filter((j) => j.status === "completed").length,
      failed: queue.jobs.filter((j) => j.status === "failed").length,
    };

    return stats;
  }

  getCampaignJobs(campaignId: string): CampaignJob[] {
    const queue = this.queues.get(campaignId);
    if (!queue) {
      return [];
    }
    return [...queue.jobs];
  }

  clearCampaign(campaignId: string): boolean {
    const queue = this.queues.get(campaignId);
    if (!queue) {
      logger.warn(
        `No queue found for campaign ${campaignId} to clear`,
        undefined,
        SOURCE,
      );
      return false;
    }

    for (const job of queue.jobs) {
      this.jobIndex.delete(job.id);
    }

    this.queues.delete(campaignId);
    logger.info(
      `Cleared all jobs for campaign ${campaignId}`,
      undefined,
      SOURCE,
    );
    return true;
  }

  getCampaignQueueStatus(
    campaignId: string,
  ): "idle" | "processing" | "not_found" {
    const queue = this.queues.get(campaignId);
    if (!queue) {
      return "not_found";
    }
    return queue.status;
  }

  getActiveCampaigns(): string[] {
    const activeCampaigns: string[] = [];
    const entries = Array.from(this.queues.entries());
    for (const [campaignId, queue] of entries) {
      if (
        queue.status === "processing" ||
        queue.jobs.some((j: CampaignJob) => j.status === "pending")
      ) {
        activeCampaigns.push(campaignId);
      }
    }
    return activeCampaigns;
  }
}

export const campaignQueue = new CampaignQueueService();
