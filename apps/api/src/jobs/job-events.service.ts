import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import type { JobProgressEvent } from '@veyra/types';
import { REDIS } from '../redis/redis.module';

/** Redis channel a job publishes real progress to. */
export const jobChannel = (jobId: string): string => `job:progress:${jobId}`;

@Injectable()
export class JobEventsService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Worker side: publish a real stage-progress event. */
  async publish(event: JobProgressEvent): Promise<void> {
    await this.redis.publish(jobChannel(event.jobId), JSON.stringify(event));
  }

  /**
   * API side: stream progress for a job as SSE. Uses a dedicated subscriber
   * connection per stream, cleaned up on unsubscribe. Completes on terminal
   * status.
   */
  stream(jobId: string): Observable<JobProgressEvent> {
    return new Observable<JobProgressEvent>((subscriber) => {
      const sub = this.redis.duplicate();
      const channel = jobChannel(jobId);
      sub.subscribe(channel).catch((err) => subscriber.error(err));
      sub.on('message', (_ch, message) => {
        try {
          const event = JSON.parse(message) as JobProgressEvent;
          subscriber.next(event);
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(event.status)) {
            subscriber.complete();
          }
        } catch {
          // ignore malformed messages
        }
      });
      return () => {
        void sub.unsubscribe(channel).catch(() => undefined);
        void sub.quit().catch(() => undefined);
      };
    });
  }
}
