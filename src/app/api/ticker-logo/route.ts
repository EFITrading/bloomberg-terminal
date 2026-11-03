import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// Logos are fetched from Polygon once, stored in Postgres, and served from there afterwards.
const POLYGON_API_KEY = process.env.POLYGON_API_KEY
const FOUND_TTL_MS = 90 * 86400_000
const MISSING_TTL_MS = 7 * 86400_000
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=86400' }

type Logo = { mime: string; data: Buffer | null }
type Row = { mime: string; data: Buffer | null; updatedAt: Date }

let tableReady: Promise<unknown> | null = null
const ensureTable = () =>
  (tableReady ??= prisma
    .$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "TickerLogo" ("ticker" TEXT PRIMARY KEY, "mime" TEXT NOT NULL DEFAULT 'image/png', "data" BYTEA, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`
    )
    .catch((e) => {
      tableReady = null
      throw e
    }))

const inflight = new Map<string, Promise<Logo>>()

async function fetchFromPolygon(ticker: string): Promise<Logo> {
  if (!POLYGON_API_KEY) throw new Error('no key')
  const details = await fetch(
    `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${POLYGON_API_KEY}`
  )
  if (details.status === 404) return { mime: 'image/png', data: null }
  if (!details.ok) throw new Error(`details ${details.status}`)
  const json = await details.json()
  const raw: string | undefined = json?.results?.branding?.icon_url || json?.results?.branding?.logo_url
  if (!raw) return { mime: 'image/png', data: null }
  const img = await fetch(`${raw}${raw.includes('?') ? '&' : '?'}apiKey=${POLYGON_API_KEY}`)
  if (!img.ok) throw new Error(`img ${img.status}`)
  return { mime: img.headers.get('content-type') || 'image/png', data: Buffer.from(await img.arrayBuffer()) }
}

async function getLogo(ticker: string): Promise<Logo | null> {
  await ensureTable()
  const rows = await prisma
    .$queryRaw<Row[]>`SELECT "mime", "data", "updatedAt" FROM "TickerLogo" WHERE "ticker" = ${ticker}`
    .catch(() => [] as Row[])
  const row = rows[0]
  if (row) {
    const age = Date.now() - new Date(row.updatedAt).getTime()
    if (row.data ? age < FOUND_TTL_MS : age < MISSING_TTL_MS) {
      return { mime: row.mime, data: row.data ? Buffer.from(row.data) : null }
    }
  }
  let job = inflight.get(ticker)
  if (!job) {
    job = (async () => {
      const res = await fetchFromPolygon(ticker)
      await prisma
        .$executeRaw`INSERT INTO "TickerLogo" ("ticker", "mime", "data", "updatedAt") VALUES (${ticker}, ${res.mime}, ${res.data}, NOW())
          ON CONFLICT ("ticker") DO UPDATE SET "mime" = EXCLUDED."mime", "data" = EXCLUDED."data", "updatedAt" = NOW()`
        .catch(() => null)
      return res
    })().finally(() => inflight.delete(ticker))
    inflight.set(ticker, job)
  }
  try {
    return await job
  } catch {
    // Polygon failed (rate limit etc.): serve stale if we have it, otherwise don't cache a miss
    return row?.data ? { mime: row.mime, data: Buffer.from(row.data) } : null
  }
}

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get('ticker') || '').toUpperCase().trim()
  if (!/^[A-Z0-9.\-]{1,10}$/.test(ticker)) return new NextResponse(null, { status: 400 })
  const logo = await getLogo(ticker)
  if (!logo) return new NextResponse(null, { status: 503 })
  if (!logo.data) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=86400' } })
  return new NextResponse(new Uint8Array(logo.data), {
    headers: { 'Content-Type': logo.mime, ...CACHE_HEADERS },
  })
}
