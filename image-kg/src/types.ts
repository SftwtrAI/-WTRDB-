/** Job + pipeline domain types. */

export type JobStage =
  | "uploaded"
  | "preprocessing"
  | "extracting"
  | "validating"
  | "writing"
  | "completed"
  | "failed";

export interface JobArtifacts {
  sourcePath?: string; // raw uploaded bytes on disk
  imageId?: string; // content id: img_<sha256> (the graph's source_image_id)
  preparedPath?: string; // normalized jpeg fed to vision
  width?: number;
  height?: number;
  sizeBytes?: number; // size of the raw upload
  mime?: string;
  extractionPath?: string; // cached validated extraction (resume)
  fragmentPath?: string; // saved graph fragment (debug/resume)
  entityCount?: number;
  relationshipCount?: number;
}

export interface Job {
  id: string; // job id
  imageId: string; // upload handle (route id + upload dir), mirrors video-kg's videoId
  kbId: string; // knowledge_base id → FalkorDB graph kg_{userId}_{kbId}
  userId: string;
  title: string;
  status: JobStage;
  progress: number;
  error: string | null;
  artifacts: JobArtifacts;
  createdAt: string;
  updatedAt: string;
}
