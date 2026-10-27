import { logger } from "../../utils/logger";

const SOURCE = "TaskQueue";

export interface TaskJob {
  id: string;
  executionId: string;
  userId: string;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  processedAt?: Date;
  lastError?: string;
}

export class TaskQueueService {
  private queue: TaskJob[] = [];
  private processing: Map<string, TaskJob> = new Map();
  private onProcess?: (job: TaskJob) => Promise<void>;

  setProcessor(handler: (job: TaskJob) => Promise<void>): void {
    this.onProcess = handler;
  }

  addJob(executionId: string, userId: string): TaskJob {
    const job: TaskJob = {
      id: `taskjob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      executionId,
      userId,
      status: "pending",
      createdAt: new Date(),
    };
    this.queue.push(job);
    logger.info(SOURCE, `Queued job ${job.id} for execution ${executionId}`);

    // Process next tick
    setImmediate(() => this.processNext());
    return job;
  }

  private async processNext(): Promise<void> {
    if (!this.onProcess) return;

    const job = this.queue.find((j) => j.status === "pending");
    if (!job) return;

    job.status = "processing";
    job.processedAt = new Date();
    this.processing.set(job.id, job);

    try {
      await this.onProcess(job);
      job.status = "completed";
    } catch (err: any) {
      job.status = "failed";
      job.lastError = err.message;
      logger.error(
        SOURCE,
        `Job ${job.id} failed: ${err.message}`,
      );
    } finally {
      this.processing.delete(job.id);
    }
  }

  getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    return {
      total: this.queue.length,
      pending: this.queue.filter((j) => j.status === "pending").length,
      processing: this.processing.size,
      completed: this.queue.filter((j) => j.status === "completed").length,
      failed: this.queue.filter((j) => j.status === "failed").length,
    };
  }

  clearCompleted(): void {
    this.queue = this.queue.filter(
      (j) => j.status !== "completed" && j.status !== "failed",
    );
  }
}

export const taskQueue = new TaskQueueService();
