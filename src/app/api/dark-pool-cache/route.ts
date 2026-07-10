import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/dark-pool-cache?symbol=SPY
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase()
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  try {
    const row = await prisma.darkPoolCache.findUnique({ where: { key: symbol } })
    if (!row) return NextResponse.json({ days: null })
    const parsed = JSON.parse(row.data)
    return NextResponse.json({ days: parsed.days ?? null, generatedAt: parsed.generatedAt ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: 'db error' }, { status: 500 })
  }
}

// POST /api/dark-pool-cache
export async function POST(req: NextRequest) {
  let body: { symbol?: string; days?: unknown[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const symbol = body.symbol?.toUpperCase()
  const incomingDays: unknown[] = body.days ?? []
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 })
  if (!Array.isArray(incomingDays) || incomingDays.length === 0) return NextResponse.json({ error: 'days required' }, { status: 400 })
  try {
    const row = await prisma.darkPoolCache.findUnique({ where: { key: symbol } })
    const existingDays: unknown[] = row ? (JSON.parse(row.data).days ?? []) : []
    const map = new Map<string, unknown>()
    for (const d of existingDays) map.set((d as any).date, d)
    for (const d of incomingDays) map.set((d as any).date, d)
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    const cutoff = new Date(today); let wc = 0
    while (wc < 756) { cutoff.setUTCDate(cutoff.getUTCDate() - 1); const dow = cutoff.getUTCDay(); if (dow !== 0 && dow !== 6) wc++ }
    const cutoffStr = cutoff.toISOString().split('T')[0]
    const mergedDays = [...map.values()].filter(d => (d as any).date >= cutoffStr).sort((a, b) => ((a as any).date as string).localeCompare((b as any).date as string))
    const payload = JSON.stringify({ symbol, generatedAt: new Date().toISOString(), days: mergedDays })
    await prisma.darkPoolCache.upsert({ where: { key: symbol }, create: { key: symbol, data: payload }, update: { data: payload } })
    return NextResponse.json({ saved: mergedDays.length })
  } catch (err: any) {
    return NextResponse.json({ error: 'db error' }, { status: 500 })
  }
}