import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

/**
 * Queue abstraction. BullMQ is the current backend, but consumers depend on
 * this interface (not BullMQ directly) so RabbitMQ/Kafka can replace it later
 * without touching business logic (spec §18).
 */
export interface JobQueue<T> {
  add(name: string, data: T, opts?: EnqueueOptions): Promise<string>;
  close(): Promise<void>;
}

export interface EnqueueOptions {
  /** Idempotency: BullMQ dedupes by jobId. */
  jobId?: string;
  priority?: number;
  attempts?: number;
  backoffMs?: number;
  delayMs?: number;
}

export interface QueueProcessor<T> {
  (job: { id: string; name: string; data: T }): Promise<void>;
}

export const QUEUE_NAMES = {
  GENERATION: 'generation',
  ASSET_PROCESSING: 'asset-processing',
  WEBHOOK: 'webhook-delivery',
} as const;

export function createRedis(url: string): Redis {
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/** BullMQ-backed queue. */
export class BullJobQueue<T> implements JobQueue<T> {
  // Internally untyped to avoid BullMQ's ExtractDataType/ExtractNameType
  // conditional-type friction; the public add() keeps the T contract.
  private readonly queue: Queue;

  constructor(queueName: string, connection: Redis) {
    this.queue = new Queue(queueName, { connection });
  }

  async add(name: string, data: T, opts: EnqueueOptions = {}): Promise<string> {
    const jobOpts: JobsOptions = {
      jobId: opts.jobId,
      priority: opts.priority,
      attempts: opts.attempts ?? 1,
      delay: opts.delayMs,
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    };
    if (opts.backoffMs) {
      jobOpts.backoff = { type: 'exponential', delay: opts.backoffMs };
    }
    const job = await this.queue.add(name, data, jobOpts);
    return job.id ?? '';
  }

  close(): Promise<void> {
    return this.queue.close();
  }
}

/** BullMQ-backed worker wrapper. */
export function startWorker<T>(
  queueName: string,
  connection: Redis,
  processor: QueueProcessor<T>,
  concurrency = 1,
): Worker {
  return new Worker(
    queueName,
    async (job: Job) => {
      await processor({ id: job.id ?? '', name: job.name, data: job.data as T });
    },
    { connection, concurrency },
  );
}
