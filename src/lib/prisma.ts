import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDirectUrl(): string {
  // Only block actual Prisma Accelerate proxy URLs.
  // db.prisma.io is a legitimate direct Postgres server — NOT Accelerate.
  const isAccelerate = (url: string) =>
    url.startsWith('prisma+postgres://') ||
    url.includes('accelerate.prisma-data.net') ||
    url.includes('accelerate.prisma.io')

  const candidates = [
    process.env.POSTGRES_URL,              // direct postgres://...@db.prisma.io:5432/...
    process.env.DATABASE_PRIVATE_URL,
    process.env.DATABASE_PUBLIC_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_DATABASE_URL, // last resort — Accelerate proxy
  ]

  for (const url of candidates) {
    if (url && !isAccelerate(url)) {
      const sep = url.includes('?') ? '&' : '?'
      return url + sep + 'connection_limit=1&pool_timeout=20'
    }
  }
  // Absolute last resort — Accelerate (will work but has connection limits)
  const fallback = candidates.find(Boolean) ?? ''
  const sep = fallback.includes('?') ? '&' : '?'
  return fallback + sep + 'connection_limit=1&pool_timeout=20'
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
    datasources: {
      db: {
        url: getDirectUrl(),
      },
    },
  });

// Always cache the client on the global object, even in production. Serverless
// platforms (Vercel) keep warm lambda instances alive between invocations, and
// without this cache every single request creates a brand-new PrismaClient
// (each opening its own DB connection) — that's what was exhausting the
// "too many connections" limit on the pooled DB role.
globalForPrisma.prisma = prisma;

export default prisma;
