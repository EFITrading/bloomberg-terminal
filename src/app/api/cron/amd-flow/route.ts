import { promisify } from 'util'
import { gzip } from 'zlib'

import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'
import { OptionsFlowService, getSmartDateRange } from '@/lib/optionsFlowService'

const gzipAsync = promisify(gzip)

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel Cron (or manually with the correct secret)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.error('[AMD-CRON] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const polygonApiKey = process.env.POLYGON_API_KEY
  if (!polygonApiKey) {
    return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 })
  }

  const scanStartTime = Date.now()
  console.log(`[ALL-CRON] Starting ALL options flow auto-scan at ${new Date().toISOString()}`)

  try {
    // Get the date range once so all chunks scan the same trading session
    const { currentDate, isLive, startTimestamp, endTimestamp } = await getSmartDateRange()

    // Determine base URL for self-calls to /api/scan-chunk
    // Each scan-chunk call runs in its OWN Vercel Lambda (separate process, separate workers)
    // — exactly the same architecture as the browser's 70 parallel SSEs.
    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXTAUTH_URL || 'https://www.efitrading.com'

    // How many symbols are in the list
    const optionsFlowService = new OptionsFlowService(polygonApiKey)
    const totalSymbols = optionsFlowService.getTop1000Symbols().length

    const CHUNK_SIZE = 10  // same as the frontend (BATCH = 10)
    const MAX_SSE    = 70  // same as the frontend (MAX_SSE = 70)

    // Build all offsets — mirrors exactly what the frontend does:
    // const offsets = Array.from({ length: MAX_SSE }, (_, i) => i * BATCH)
    const offsets = Array.from({ length: MAX_SSE }, (_, i) => i * CHUNK_SIZE)
      .filter(offset => offset < totalSymbols)

    console.log(`[ALL-CRON] Firing ${offsets.length} parallel scan-chunk requests (${CHUNK_SIZE} tickers each, ${totalSymbols} total symbols)`)

    // Fire ALL chunk requests simultaneously — each becomes its own Lambda invocation,
    // just like the browser's Promise.all(offsets.map(off => openSSE(off)))
    const chunkResults = await Promise.all(
      offsets.map(async (offset) => {
        const url = `${baseUrl}/api/scan-chunk?secret=${encodeURIComponent(cronSecret)}&offset=${offset}&limit=${CHUNK_SIZE}&start=${startTimestamp}&end=${endTimestamp}&date=${currentDate}&live=${isLive}`
        try {
          const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            // Give each chunk up to 280 s — well within Vercel's 300 s function limit
            signal: AbortSignal.timeout(280_000),
          })
          if (!res.ok) {
            console.error(`[ALL-CRON] Chunk offset=${offset} failed: HTTP ${res.status}`)
            return []
          }
          const json = await res.json()
          const trades = json.trades ?? []
          console.log(`[ALL-CRON] Chunk offset=${offset}: ${trades.length} trades`)
          return trades
        } catch (err) {
          console.error(`[ALL-CRON] Chunk offset=${offset} error:`, err instanceof Error ? err.message : err)
          return []
        }
      })
    )

    const trades = chunkResults.flat()
    const processingTime = Date.now() - scanStartTime
    console.log(`[ALL-CRON] Fetched ${trades.length} trades in ${processingTime}ms`)

    if (trades.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No trades found — nothing saved',
        trades: 0,
        processingTime,
      })
    }

    // Use current timestamp as the unique date key so each auto-scan is its own record
    // (truncated to the minute to give retries within the same minute idempotency)
    const now = new Date()
    now.setSeconds(0, 0)
    const scanDateKey = now.toISOString() // e.g. "2026-03-17T14:03:00.000Z"

    // Compress and save — same logic as /api/flows/save
    const payload = { date: scanDateKey, data: trades, auto: true, ticker: 'ALL' }
    const dataString = JSON.stringify(payload)
    const originalSize = Buffer.byteLength(dataString, 'utf8')

    const compressed = await gzipAsync(dataString)
    const compressedBase64 = compressed.toString('base64')

    console.log(
      `[AMD-CRON] Compressing: ${(originalSize / 1024).toFixed(1)}KB → ${(compressed.length / 1024).toFixed(1)}KB`
    )

    const flow = await prisma.flow.upsert({
      where: { date: now },
      update: { data: compressedBase64, size: trades.length },
      create: { date: now, data: compressedBase64, size: trades.length },
      select: { id: true, date: true, size: true },
    })

    console.log(`[ALL-CRON] Saved ALL scan → id=${flow.id} trades=${flow.size}`)

    return NextResponse.json({
      ok: true,
      savedAt: flow.date,
      trades: flow.size,
      processingTime,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[ALL-CRON] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
