import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildUrl(base: string | undefined): string {
  if (!base) return '';
  try {
    const u = new URL(base);
    u.searchParams.set('connection_limit', '1');
    u.searchParams.set('pool_timeout', '20');
    return u.toString();
  } catch {
    return base + (base.includes('?') ? '&' : '?') + 'connection_limit=1&pool_timeout=20';
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
    datasources: {
      db: {
        url: buildUrl(process.env.POSTGRES_PRISMA_DATABASE_URL),
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
