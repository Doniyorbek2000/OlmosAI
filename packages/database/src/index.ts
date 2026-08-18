import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/**
 * Singleton Prisma client. In dev with hot-reload we cache it on globalThis to
 * avoid exhausting the connection pool across module reloads.
 */
const globalForPrisma = globalThis as unknown as { __veyraPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__veyraPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__veyraPrisma = prisma;
}
