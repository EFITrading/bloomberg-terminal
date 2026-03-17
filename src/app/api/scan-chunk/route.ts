import { NextRequest, NextResponse } from 'next/server'

import { OptionsFlowService, getSmartDateRange } from '@/lib/optionsFlowService'

// This endpoint mirrors exactly what stream-options-flow does for a single chunk.
// The cron calls it 70 times concurrently — each call runs in its OWN Vercel Lambda
// with 10 isolated workers, which is exactly how the browser's 70 parallel SSEs work.
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const polygonApiKey = process.env.POLYGON_API_KEY
  if (!polygonApiKey) {
    return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 })
  }

  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10)
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10)
  const startTs = request.nextUrl.searchParams.get('start')
  const endTs = request.nextUrl.searchParams.get('end')
  const dateParam = request.nextUrl.searchParams.get('date')
  const liveParam = request.nextUrl.searchParams.get('live')

  const optionsFlowService = new OptionsFlowService(polygonApiKey)
  const allSymbols = optionsFlowService.getTop1000Symbols()

  const chunk = allSymbols.slice(offset, offset + limit)
  if (chunk.length === 0) {
    return NextResponse.json({ trades: [], offset, limit, total: allSymbols.length })
  }

  // Use date range passed from cron (so all chunks scan the same window),
  // or fall back to a fresh getSmartDateRange() call.
  let dateRange: { startTimestamp: number; endTimestamp: number; currentDate: string; isLive: boolean }
  if (startTs && endTs && dateParam && liveParam !== null) {
    dateRange = {
      startTimestamp: parseInt(startTs, 10),
      endTimestamp: parseInt(endTs, 10),
      currentDate: dateParam,
      isLive: liveParam === 'true',
    }
  } else {
    dateRange = await getSmartDateRange()
  }

  try {
    const trades = await optionsFlowService.fetchLiveOptionsFlowUltraFast(
      chunk.join(','),
      undefined,
      dateRange
    )

    return NextResponse.json({
      trades,
      offset,
      limit,
      total: allSymbols.length,
      tickers: chunk.length,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[SCAN-CHUNK] Error at offset=${offset}:`, msg)
    return NextResponse.json({ trades: [], error: msg, offset, limit })
  }
}
