import { randomUUID } from "node:crypto";
import { createLogger } from "../logger.js";
import { createJob, updateJob } from "./jobStore.js";
import { runPipeline } from "./runPipeline.js";
import { resolveUserId } from "../auth/v2auth.js";
import { userExists } from "../graph/v2Inject.js";
import type { Job } from "../types.js";

const log = createLogger("ingest");

/**
 * Register a new ingest job for an on-disk video and kick off the pipeline in
 * the background. `videoId` lets callers (e.g. tus) reuse the upload id.
 */
export async function startIngest(input: {
  sourcePath: string;
  title: string;
  videoId?: string;
}): Promise<Job> {
  const userId = await resolveUserId();
  if (!(await userExists(userId))) {
    throw new Error(
      `Resolved user ${userId} does not exist in the wtrdb users table.`,
    );
  }

  const videoId = input.videoId ?? randomUUID();
  const kbId = randomUUID();
  const job = await createJob({ videoId, kbId, userId, title: input.title });
  await updateJob(job.id, { artifacts: { sourcePath: input.sourcePath } });

  // Fire-and-forget; status is tracked in the job file.
  runPipeline(job.id).catch((err) =>
    log.error(`pipeline crashed for job ${job.id}: ${err.message}`),
  );

  return job;
}
