import pino, { type Logger } from 'pino';

export type { Logger };

/** Structured context carried through logs for tracing (spec §43). */
export interface LogContext {
  requestId?: string;
  jobId?: string;
  workerId?: string;
  userId?: string;
  providerId?: string;
}

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

export const rootLogger: Logger = pino({
  level,
  base: { service: process.env.VEYRA_SERVICE_NAME ?? 'veyra' },
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', '*.secret', '*.refreshToken'],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Create a child logger bound to a request/job/worker context. */
export function createLogger(context: LogContext = {}): Logger {
  return rootLogger.child(context);
}
