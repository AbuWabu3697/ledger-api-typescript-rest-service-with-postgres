import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient instance.
 * Using a module-level singleton avoids exhausting the connection pool
 * during hot reloads in development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
