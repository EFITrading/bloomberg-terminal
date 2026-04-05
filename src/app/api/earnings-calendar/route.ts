import { NextRequest, NextResponse } from 'next/server'

interface NasdaqRow {
  symbol: string
  name: string
  marketTime: string
  eps_forecast: string
  noOfEsts: string
  lastYearRptDt: string
  lastYearsEps: string
}

interface EarningsEvent {
  date: string
  dayNum: number
  month: number
  year: number
  time: string
  event: string
  importance: 'critical' | 'high' | 'medium' | 'low'
  country: string
  forecast?: string
  prior?: string
  type: 'earnings'
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function getWeekdays(year: number, month: number): string[] {
  const days: string[] = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    const dow = date.getDay()
    if (dow !== 0 && dow !== 6) {
      days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }
  return days
}

async function fetchNasdaqEarnings(dateStr: string): Promise<NasdaqRow[]> {
  try {
    const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.nasdaq.com/market-activity/earnings',
        Origin: 'https://www.nasdaq.com',
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.data?.rows) ? (data.data.rows as NasdaqRow[]) : []
  } catch {
    return []
  }
}

function parseEps(val: string | undefined): string | undefined {
  if (!val) return undefined
  const trimmed = val.trim()
  if (trimmed === '-' || trimmed.toLowerCase() === 'n/a' || trimmed === '') return undefined
  const num = parseFloat(trimmed)
  if (isNaN(num)) return undefined
  return `$${num.toFixed(2)} EPS`
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const year = parseInt(sp.get('year') ?? '')
  const month = parseInt(sp.get('month') ?? '') // 0-indexed

  if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
    return NextResponse.json({ success: false, error: 'Invalid params' }, { status: 400 })
  }

  const weekdays = getWeekdays(year, month)
  const events: EarningsEvent[] = []

  // Fetch all trading days in parallel, batched to avoid rate limits
  const BATCH = 5
  for (let i = 0; i < weekdays.length; i += BATCH) {
    const batch = weekdays.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(fetchNasdaqEarnings))

    for (let j = 0; j < batch.length; j++) {
      const dateStr = batch[j]
      const [yyyy, mm, dd] = dateStr.split('-').map(Number)
      const m = mm - 1

      for (const row of results[j]) {
        const sym = (row.symbol ?? '').trim().toUpperCase()
        const name = (row.name ?? '').trim()
        if (!sym || sym === '-' || !name || name === '-') continue

        const timing = row.marketTime === 'time-after-hours' ? 'Post-Market' : 'Pre-Market'
        const estimates = parseInt(row.noOfEsts) || 0
        const importance: 'high' | 'medium' = estimates >= 5 ? 'high' : 'medium'

        const ev: EarningsEvent = {
          date: `${MONTH_SHORT[m]} ${dd}`,
          dayNum: dd,
          month: m,
          year: yyyy,
          time: timing,
          event: `${name} (${sym}) Earnings`,
          importance,
          country: 'US',
          type: 'earnings',
        }

        const forecast = parseEps(row.eps_forecast)
        const prior = parseEps(row.lastYearsEps)
        if (forecast) ev.forecast = forecast
        if (prior) ev.prior = prior

        events.push(ev)
      }
    }
  }

  return NextResponse.json(
    { success: true, events, year, month, count: events.length },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
      },
    }
  )
}
