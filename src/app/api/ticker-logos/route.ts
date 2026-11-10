import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

type Row = { ticker: string; mime: string; data: Buffer | null }

// Returns every stored logo for the requested tickers in ONE query as data URIs.
// null = known to have no logo; tickers absent from the response are not stored yet.
export async function GET(req: NextRequest) {
  const tickers = Array.from(
    new Set(
      (req.nextUrl.searchParams.get('tickers') || '')
        .split(',')
        .map((t) => t.toUpperCase().trim())
        .filter((t) => /^[A-Z0-9.\-]{1,10}$/.test(t))
    )
  ).slice(0, 400)
  if (tickers.length === 0) return NextResponse.json({})

  let rows: Row[] = []
  try {
    rows = await prisma.$queryRaw<Row[]>`SELECT "ticker", "mime", "data" FROM "TickerLogo" WHERE "ticker" = ANY(${tickers})`
  } catch {
    return NextResponse.json({})
  }
  const out: Record<string, string | null> = {}
  for (const r of rows) {
    out[r.ticker] = r.data ? `data:${r.mime};base64,${Buffer.from(r.data).toString('base64')}` : null
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'private, max-age=600' } })
}
