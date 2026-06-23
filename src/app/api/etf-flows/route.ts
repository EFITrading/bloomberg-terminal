import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const POLY_KEY = process.env.POLYGON_API_KEY || process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
const DB_KEY = 'main'

const ETF_TICKERS = [
    'SPY', 'QQQ', 'IWM', 'DIA',
    'XLK', 'XLF', 'XLY', 'XLV', 'XLE', 'XLU', 'XLP', 'XLI', 'XLB', 'XLC', 'XLRE',
    'TLT', 'HYG',
    'GLD', 'SLV',
    'ARKK', 'KWEB', 'XHB', 'SMH', 'XBI', 'TAN', 'IGV', 'XRT', 'KRE', 'ITA',
]

type FlowPoint = { time: number; date: string; periodFlow: number; cumFlow: number }
type StoredPayload = {
    flows: Record<string, FlowPoint[]>
    baseAUM: Record<string, number>
    lastShares: Record<string, number | null>
    lastCumFlow: Record<string, number>
    dateStrings: string[]
    lastDate: string
}

// ─── Date helpers (UTC — avoids local-tz off-by-one after 4 PM PST) ──────────
function getLatestTradingDate(): string {
    const now = new Date()
    const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const d = new Date(nowUtc)
    const dow = d.getUTCDay()
    const adj = dow === 0 ? 2 : dow === 6 ? 1 : 0
    return new Date(nowUtc - adj * 86400000).toISOString().split('T')[0]
}

function buildWeeklyDates(fromDaysBack: number): string[] {
    const now = new Date()
    const step = 7
    const getDateStr = (daysBack: number) => {
        const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        const ms = nowUtc - daysBack * 86400000
        const d = new Date(ms)
        const dow = d.getUTCDay()
        const adj = dow === 0 ? 2 : dow === 6 ? 1 : 0
        return new Date(ms - adj * 86400000).toISOString().split('T')[0]
    }
    const dates: string[] = []
    for (let i = 0; i <= fromDaysBack; i += step) dates.push(getDateStr(i))
    const latest = getDateStr(0)
    if (!dates.includes(latest)) dates.unshift(latest)
    return [...new Set(dates)].sort()
}

// ─── Concurrency-limited Polygon fetch ───────────────────────────────────────
function makeThrottledFetch(concurrency: number) {
    let active = 0
    const queue: Array<() => void> = []
    const runNext = () => {
        while (active < concurrency && queue.length > 0) {
            active++
            queue.shift()!()
        }
    }
    return (url: string): Promise<any> =>
        new Promise((resolve) => {
            const task = async () => {
                const delays = [500, 1000, 2000]
                for (let attempt = 0; attempt <= delays.length; attempt++) {
                    try {
                        const r = await fetch(url, { headers: { Accept: 'application/json' } })
                        if (r.ok) { active--; runNext(); resolve(await r.json()); return }
                        if (r.status >= 400 && r.status < 500) { active--; runNext(); resolve(null); return }
                    } catch { /* retry */ }
                    if (attempt < delays.length) await new Promise<void>(res => setTimeout(res, delays[attempt]))
                }
                active--; runNext(); resolve(null)
            }
            queue.push(task); runNext()
        })
}

// ─── Fetch snapshot prices for all tickers ───────────────────────────────────
async function fetchPrices(): Promise<Record<string, number>> {
    const priceMap: Record<string, number> = {}
    try {
        const res = await fetch(
            `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${ETF_TICKERS.join(',')}&apiKey=${POLY_KEY}`,
            { headers: { Accept: 'application/json' } }
        )
        if (res.ok) {
            const json = await res.json()
                ; ((json.tickers as any[]) || []).forEach((t: any) => {
                    const p = t.day?.c || t.prevDay?.c
                    if (p) priceMap[t.ticker] = p
                })
        }
    } catch { /* ignore */ }
    return priceMap
}

// ─── GET handler ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
    const t0 = Date.now()
    try {
        const latestExpected = getLatestTradingDate()

        // ── 1. Load from DB ──────────────────────────────────────────────────────
        let stored: StoredPayload | null = null
        try {
            const row = await prisma.etfFlowHistory.findUnique({ where: { key: DB_KEY } })
            if (row) stored = JSON.parse(row.data) as StoredPayload
        } catch (dbErr) {
            console.error('[etf-flows] DB read error:', dbErr)
        }

        // ── 2. Already up to date? ───────────────────────────────────────────────
        if (stored && stored.lastDate >= latestExpected) {
            return NextResponse.json({ flows: stored.flows, baseAUM: stored.baseAUM, source: 'db-cache' })
        }

        // ── 3. Determine new dates to fetch ─────────────────────────────────────
        let isIncremental = false
        let newDates: string[] = []
        let allDateStrings: string[] = []

        if (stored && stored.dateStrings.length > 0) {
            // Incremental — only dates after the last stored date
            isIncremental = true
            const existingSet = new Set(stored.dateStrings)
            const fullDates = buildWeeklyDates(365 * 5)
            newDates = fullDates.filter(d => d > stored!.lastDate)
            allDateStrings = [...stored.dateStrings, ...newDates.filter(d => !existingSet.has(d))].sort()
        } else {
            // Full 5-year scan
            allDateStrings = buildWeeklyDates(365 * 5)
            newDates = allDateStrings
        }

        if (newDates.length === 0) {
            // Edge case: dates computed but nothing actually new
            if (stored) {
                return NextResponse.json({ flows: stored.flows, baseAUM: stored.baseAUM, source: 'db-cache' })
            }
        }

        // ── 4. Fetch current prices ──────────────────────────────────────────────
        const priceMap = await fetchPrices()

        // ── 5. Fetch shares_outstanding for new dates only ───────────────────────
        const throttledFetch = makeThrottledFetch(15)
        const newSharesPerTicker: Record<string, Array<{ date: string; shares: number | null }>> = {}

        await Promise.all(
            ETF_TICKERS.map(async (ticker) => {
                const points = await Promise.all(
                    newDates.map(async (date) => {
                        const json = await throttledFetch(
                            `https://api.polygon.io/v3/reference/tickers/${ticker}?date=${date}&apiKey=${POLY_KEY}`
                        )
                        return { date, shares: json?.results?.share_class_shares_outstanding ?? null }
                    })
                )
                newSharesPerTicker[ticker] = points
            })
        )

        // ── 6. Build updated flows ───────────────────────────────────────────────
        const flows: Record<string, FlowPoint[]> = stored ? { ...stored.flows } : {}
        const baseAUM: Record<string, number> = stored ? { ...stored.baseAUM } : {}
        const lastShares: Record<string, number | null> = stored ? { ...stored.lastShares } : {}
        const lastCumFlow: Record<string, number> = stored ? { ...stored.lastCumFlow } : {}

        for (const ticker of ETF_TICKERS) {
            const price = priceMap[ticker] || 100
            if (!flows[ticker]) flows[ticker] = []

            if (!isIncremental) {
                // Full scan — need to apply split-adjustment and compute from scratch
                const allShares = newSharesPerTicker[ticker].map(p => p.shares)

                // Split-adjust
                const adjusted = [...allShares]
                for (let i = 1; i < adjusted.length; i++) {
                    const prev = adjusted[i - 1]; const curr = adjusted[i]
                    if (prev == null || curr == null) continue
                    const ratio = curr / prev
                    if (ratio >= 1.4 || ratio <= 0.6) {
                        for (let j = 0; j < i; j++) {
                            if (adjusted[j] != null) adjusted[j] = adjusted[j]! * ratio
                        }
                    }
                }

                const firstShares = adjusted.find(s => s != null) ?? 1
                baseAUM[ticker] = firstShares * price

                let cumFlow = 0
                const points: FlowPoint[] = []
                for (let i = 1; i < allDateStrings.length; i++) {
                    const older = adjusted[i - 1]; const newer = adjusted[i]
                    if (older == null || newer == null) continue
                    const periodFlow = (newer - older) * price
                    cumFlow += periodFlow
                    const [y, m, dd] = allDateStrings[i].split('-')
                    points.push({ time: Date.UTC(+y, +m - 1, +dd), date: allDateStrings[i], periodFlow, cumFlow })
                }
                flows[ticker] = points
                lastShares[ticker] = adjusted[adjusted.length - 1] ?? null
                lastCumFlow[ticker] = cumFlow

            } else {
                // Incremental — append new periods using stored lastShares as the baseline
                let cumFlow = lastCumFlow[ticker] ?? 0
                let prevShares = lastShares[ticker] ?? null

                for (const { date, shares } of newSharesPerTicker[ticker]) {
                    if (prevShares == null || shares == null) { prevShares = shares; continue }
                    const ratio = shares / prevShares
                    // Skip obvious splits (would distort flow)
                    if (ratio >= 1.4 || ratio <= 0.6) { prevShares = shares; continue }
                    const periodFlow = (shares - prevShares) * price
                    cumFlow += periodFlow
                    const [y, m, dd] = date.split('-')
                    flows[ticker].push({ time: Date.UTC(+y, +m - 1, +dd), date, periodFlow, cumFlow })
                    prevShares = shares
                }
                lastShares[ticker] = newSharesPerTicker[ticker][newSharesPerTicker[ticker].length - 1]?.shares ?? prevShares
                lastCumFlow[ticker] = cumFlow
            }
        }

        // ── 7. Save to DB ────────────────────────────────────────────────────────
        const payload: StoredPayload = {
            flows, baseAUM, lastShares, lastCumFlow,
            dateStrings: allDateStrings,
            lastDate: latestExpected,
        }
        const payloadStr = JSON.stringify(payload)
        const sizeKB = (Buffer.byteLength(payloadStr, 'utf8') / 1024).toFixed(1)
        const tSave = Date.now()
        try {
            await prisma.etfFlowHistory.upsert({
                where: { key: DB_KEY },
                create: { key: DB_KEY, data: payloadStr },
                update: { data: payloadStr },
            })
            console.log(`[etf-flows] ✅ DB saved — ${allDateStrings.length} dates | +${newDates.length} new | ${sizeKB} KB | ${Date.now() - tSave}ms | total ${Date.now() - t0}ms`)
        } catch (saveErr) {
            console.error('[etf-flows] ❌ DB save error:', saveErr)
        }

        return NextResponse.json({
            flows,
            baseAUM,
            source: isIncremental ? 'db-incremental' : 'db-fresh',
        })
    } catch (err: any) {
        console.error('[etf-flows] ❌ Fatal error:', err)
        return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 })
    }
}
