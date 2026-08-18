/** Top-level generation job lifecycle. */
export const JobStatus = {
  QUEUED: 'QUEUED',
  WAITING_FOR_GPU: 'WAITING_FOR_GPU',
  RUNNING: 'RUNNING',
  POST_PROCESSING: 'POST_PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
]);

/** Individual workflow stage lifecycle (text-to-3d, game-ready, etc.). */
export const StageStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type StageStatus = (typeof StageStatus)[keyof typeof StageStatus];

/** Named stages for the resumable Text-to-3D workflow. */
export const TextTo3DStage = {
  PROMPT_ANALYSIS: 'PROMPT_ANALYSIS',
  PROMPT_ENHANCEMENT: 'PROMPT_ENHANCEMENT',
  CONCEPT_IMAGE: 'CONCEPT_IMAGE',
  IMAGE_PREPROCESS: 'IMAGE_PREPROCESS',
  SHAPE_GENERATION: 'SHAPE_GENERATION',
  TEXTURE_GENERATION: 'TEXTURE_GENERATION',
  POSTPROCESS: 'POSTPROCESS',
  QUALITY_CHECK: 'QUALITY_CHECK',
  EXPORT: 'EXPORT',
} as const;

export type TextTo3DStage = (typeof TextTo3DStage)[keyof typeof TextTo3DStage];

export const TEXT_TO_3D_STAGE_ORDER: readonly TextTo3DStage[] = [
  TextTo3DStage.PROMPT_ANALYSIS,
  TextTo3DStage.PROMPT_ENHANCEMENT,
  TextTo3DStage.CONCEPT_IMAGE,
  TextTo3DStage.IMAGE_PREPROCESS,
  TextTo3DStage.SHAPE_GENERATION,
  TextTo3DStage.TEXTURE_GENERATION,
  TextTo3DStage.POSTPROCESS,
  TextTo3DStage.QUALITY_CHECK,
  TextTo3DStage.EXPORT,
];

/** Progress event streamed to the client over SSE/WebSocket. */
export interface JobProgressEvent {
  jobId: string;
  status: JobStatus;
  /** 0..100 — must reflect real worker stage progress, never faked. */
  progress: number;
  stage?: string;
  message?: string;
  at: string; // ISO timestamp
}
