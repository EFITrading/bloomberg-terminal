import { NextRequest, NextResponse } from 'next/server'
import { gunzip } from 'zlib'
import { promisify } from 'util'
import { prisma } from '@/lib/prisma'
import { redis, getCachedFullDay } from '@/lib/redis'

export const runtime = 'nodejs'
export const maxDuration = 60

const gunzipAsync = promisify(gunzip)

const dayKey = (day: string) => `flow:byticker:v2:${day}`

async function loadDayAll(day: string): Promise<any[]> {
  const cachedFull = await getCachedFullDay(day)
  if (cachedFull) return cachedFull.trades as any[]

  const rows = await prisma.flowBatch.findMany({
    where: { tradingDate: day },
    orderBy: { batchTime: 'asc' },
    select: { data: true },
  })
  if (rows.length > 0) {
    const out: any[] = []
    for (const r of rows) {
      const buf = await gunzipAsync(Buffer.from(r.data, 'base64'))
      const batch: any[] = JSON.parse(buf.toString('utf8'))
      for (const t of batch) out.push(t)
    }
    return out
  }

  const start = new Date(`${day}T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  const flow = await prisma.flow.findFirst({
    where: { date: { gte: start, lt: end } },
    orderBy: { createdAt: 'desc' },
  })
  if (!flow) return []
  const buf = await gunzipAsync(Buffer.from(flow.data, 'base64'))
  return JSON.parse(buf.toString('utf8'))
}

const memResults = new Map<string, any[]>()
const memIndex = new Map<string, Map<string, any[]>>()
let redisDownUntil = 0

function groupByTicker(all: any[]): Map<string, any[]> {
  const byTicker = new Map<string, any[]>()
  for (const t of all) {
    const k = t?.underlying_ticker?.toUpperCase()
    if (!k) continue
    const arr = byTicker.get(k)
    if (arr) arr.push(t); else byTicker.set(k, [t])
  }
  return byTicker
}

// Used when Redis is unavailable (e.g. plan limit): per-day index kept in memory, small LRU
async function getDayFromMemory(day: string, ticker: string, isToday: boolean): Promise<any[]> {
  const rk = `${day}:${ticker}`
  if (!isToday && memResults.has(rk)) return memResults.get(rk)!
  let idx = isToday ? undefined : memIndex.get(day)
  if (!idx) {
    idx = groupByTicker(await loadDayAll(day))
    if (!isToday) {
      memIndex.set(day, idx)
      if (memIndex.size > 6) memIndex.delete(memIndex.keys().next().value as string)
    }
  }
  const trades = idx.get(ticker) ?? []
  if (!isToday) {
    memResults.set(rk, trades)
    if (memResults.size > 20000) memResults.delete(memResults.keys().next().value as string)
  }
  return trades
}

async function getDay(day: string, ticker: string, isToday: boolean): Promise<any[]> {
  if (!redis || isToday || Date.now() < redisDownUntil) return getDayFromMemory(day, ticker, isToday)
  try {
    const raw = await redis.hget<any>(dayKey(day), ticker)
    if (raw !== null && raw !== undefined) return typeof raw === 'string' ? JSON.parse(raw) : raw
    const trades = await getDayFromMemory(day, ticker, isToday)
    // Store only this ticker's slice (small) rather than the whole day
    await redis.hset(dayKey(day), { [ticker]: JSON.stringify(trades) })
    return trades
  } catch (e) {
    console.warn('[ticker-history] Redis unavailable, using in-memory fallback:', String(e).slice(0, 120))
    redisDownUntil = Date.now() + 5 * 60 * 1000
    return getDayFromMemory(day, ticker, isToday)
  }
}

// One ticker's flow trades across every saved day, streamed as NDJSON (one line per day)
// so the client can start while later days are still decoding.
export async function GET(request: NextRequest) {
  const ticker = (request.nextUrl.searchParams.get('ticker') || '').trim().toUpperCase()
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })
  const maxDays = Math.min(parseInt(request.nextUrl.searchParams.get('days') || '365', 10) || 365, 730)

  const [flows, batches] = await Promise.all([
    prisma.flow.findMany({ select: { date: true } }),
    prisma.flowBatch.findMany({ select: { tradingDate: true }, distinct: ['tradingDate'] }),
  ])
  const daySet = new Set<string>()
  for (const f of flows) daySet.add(new Date(f.date).toISOString().split('T')[0])
  for (const b of batches) daySet.add(b.tradingDate)
  const days = [...daySet].sort((a, b) => b.localeCompare(a)).slice(0, maxDays)
  const todayUtc = new Date().toISOString().split('T')[0]

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let next = 0
      const worker = async () => {
        while (next < days.length) {
          const day = days[next++]
          try {
            const trades = await getDay(day, ticker, day >= todayUtc)
            controller.enqueue(encoder.encode(JSON.stringify({ day, trades }) + '\n'))
          } catch (e) {
            console.error('[ticker-history] day failed', day, e)
            controller.enqueue(encoder.encode(JSON.stringify({ day, trades: [], error: String(e) }) + '\n'))
          }
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()])
      controller.enqueue(encoder.encode(JSON.stringify({ done: true, total: days.length }) + '\n'))
      controller.close()
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } })
}
