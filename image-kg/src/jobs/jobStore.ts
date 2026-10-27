import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { Job, JobArtifacts, JobStage } from "../types.js";

/**
 * File-based job store: one JSON file per job under data/jobs/. Kept on local
 * disk (not in v2's Postgres) so this service never adds tables to v2's
 * database. Resumable: artifacts record what each stage produced.
 */

function jobPath(id: string): string {
  return path.join(config.jobsDir, `${id}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.jobsDir, { recursive: true });
}

export async function createJob(input: {
  imageId: string;
  kbId: string;
  userId: string;
  title: string;
}): Promise<Job> {
  await ensureDir();
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    imageId: input.imageId,
    kbId: input.kbId,
    userId: input.userId,
    title: input.title,
    status: "uploaded",
    progress: 0,
    error: null,
    artifacts: {},
    createdAt: now,
    updatedAt: now,
  };
  await writeJob(job);
  return job;
}

export async function writeJob(job: Job): Promise<void> {
  await ensureDir();
  job.updatedAt = new Date().toISOString();
  const tmp = jobPath(job.id) + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(job, null, 2), "utf8");
  await fs.rename(tmp, jobPath(job.id));
}

export async function getJob(id: string): Promise<Job | null> {
  try {
    const raw = await fs.readFile(jobPath(id), "utf8");
    return JSON.parse(raw) as Job;
  } catch {
    return null;
  }
}

export async function findJobByImageId(imageId: string): Promise<Job | null> {
  return findJob((j) => j.imageId === imageId);
}

export async function findJobByKbId(kbId: string): Promise<Job | null> {
  return findJob((j) => j.kbId === kbId);
}

async function findJob(pred: (j: Job) => boolean): Promise<Job | null> {
  try {
    const files = await fs.readdir(config.jobsDir);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const job = await getJob(f.replace(/\.json$/, ""));
      if (job && pred(job)) return job;
    }
  } catch {
    /* dir may not exist yet */
  }
  return null;
}

export async function listJobs(): Promise<Job[]> {
  try {
    const files = await fs.readdir(config.jobsDir);
    const jobs: Job[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const job = await getJob(f.replace(/\.json$/, ""));
      if (job) jobs.push(job);
    }
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function updateJob(
  id: string,
  patch: {
    status?: JobStage;
    progress?: number;
    error?: string | null;
    artifacts?: Partial<JobArtifacts>;
  },
): Promise<Job | null> {
  const job = await getJob(id);
  if (!job) return null;
  if (patch.status !== undefined) job.status = patch.status;
  if (patch.progress !== undefined) job.progress = patch.progress;
  if (patch.error !== undefined) job.error = patch.error;
  if (patch.artifacts) job.artifacts = { ...job.artifacts, ...patch.artifacts };
  await writeJob(job);
  return job;
}
