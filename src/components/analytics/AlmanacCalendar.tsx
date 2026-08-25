'use client'

import React, { useEffect, useState } from 'react'
import { useAlmanacCalendarMobile } from './useAlmanacCalendarMobile'

interface DailyStats {
  winRate: number
  avgReturn: number
  upYears: number
  totalYears: number
  yearlyBreakdown?: { year: number; return: number; date: string }[]
}

interface EconomicEvent {
  date: string
  name: string
}

interface CalendarDay {
  date: Date
  dayOfMonth: number
  isCurrentMonth: boolean
  isHoliday: boolean
  holidayName?: string
  events: string[]
  tradingDayOfMonth: number
  stats?: DailyStats
}

interface AlmanacCalendarProps {
  month?: number
  year?: number
  symbol?: string
  onBack?: () => void
  onMonthChange?: (month: number, year: number) => void
}

const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
]

const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

// Market Holidays - dynamically generate for any year
function getMarketHolidays(year: number): Record<string, string> {
  const holidays: Record<string, string> = {}

  // New Year's Day - Jan 1 (or observed)
  let newYears = new Date(year, 0, 1)
  if (newYears.getDay() === 0) newYears = new Date(year, 0, 2)
  if (newYears.getDay() === 6) newYears = new Date(year - 1, 11, 31)
  holidays[formatDate(newYears)] = "New Year's Day"

  // MLK Day - 3rd Monday of January
  holidays[formatDate(getNthWeekday(year, 0, 1, 3))] = 'MLK Day'

  // Presidents Day - 3rd Monday of February
  holidays[formatDate(getNthWeekday(year, 1, 1, 3))] = "Presidents' Day"

  // Good Friday - Friday before Easter
  const easter = getEasterDate(year)
  const goodFriday = new Date(easter)
  goodFriday.setDate(easter.getDate() - 2)
  holidays[formatDate(goodFriday)] = 'Good Friday'

  // Memorial Day - Last Monday of May
  holidays[formatDate(getLastWeekday(year, 4, 1))] = 'Memorial Day'

  // Juneteenth - June 19 (or observed)
  let juneteenth = new Date(year, 5, 19)
  if (juneteenth.getDay() === 0) juneteenth = new Date(year, 5, 20)
  if (juneteenth.getDay() === 6) juneteenth = new Date(year, 5, 18)
  holidays[formatDate(juneteenth)] = 'Juneteenth'

  // Independence Day - July 4 (or observed)
  let july4 = new Date(year, 6, 4)
  if (july4.getDay() === 0) july4 = new Date(year, 6, 5)
  if (july4.getDay() === 6) july4 = new Date(year, 6, 3)
  holidays[formatDate(july4)] = 'Independence Day'

  // Labor Day - 1st Monday of September
  holidays[formatDate(getNthWeekday(year, 8, 1, 1))] = 'Labor Day'

  // Thanksgiving - 4th Thursday of November
  holidays[formatDate(getNthWeekday(year, 10, 4, 4))] = 'Thanksgiving'

  // Christmas - Dec 25 (or observed)
  let christmas = new Date(year, 11, 25)
  if (christmas.getDay() === 0) christmas = new Date(year, 11, 26)
  if (christmas.getDay() === 6) christmas = new Date(year, 11, 24)
  holidays[formatDate(christmas)] = 'Christmas'

  return holidays
}

// Early close dates
function getEarlyCloseDates(year: number): Record<string, string> {
  const dates: Record<string, string> = {}

  // Day before Independence Day (if weekday)
  const july3 = new Date(year, 6, 3)
  if (july3.getDay() >= 1 && july3.getDay() <= 5) {
    dates[formatDate(july3)] = 'Independence Day Eve'
  }

  // Day after Thanksgiving
  const thanksgiving = getNthWeekday(year, 10, 4, 4)
  const dayAfter = new Date(thanksgiving)
  dayAfter.setDate(thanksgiving.getDate() + 1)
  dates[formatDate(dayAfter)] = 'Day After Thanksgiving'

  // Christmas Eve (if weekday)
  const dec24 = new Date(year, 11, 24)
  if (dec24.getDay() >= 1 && dec24.getDay() <= 5) {
    dates[formatDate(dec24)] = 'Christmas Eve'
  }

  return dates
}

// FOMC Meeting dates - dynamically calculate (8 meetings per year)
// Fed typically meets every ~6 weeks, 2-day meetings ending on Wed
function getFOMCDates(year: number): string[] {
  // These are officially published by the Fed - we cache the known years
  const fomcSchedule: Record<number, string[]> = {
    2024: [
      '2024-01-31',
      '2024-03-20',
      '2024-05-01',
      '2024-06-12',
      '2024-07-31',
      '2024-09-18',
      '2024-11-07',
      '2024-12-18',
    ],
    2025: [
      '2025-01-29',
      '2025-03-19',
      '2025-05-07',
      '2025-06-18',
      '2025-07-30',
      '2025-09-17',
      '2025-11-06',
      '2025-12-10',
    ],
    2026: [
      '2026-01-28',
      '2026-03-18',
      '2026-05-06',
      '2026-06-17',
      '2026-07-29',
      '2026-09-16',
      '2026-11-05',
      '2026-12-16',
    ],
  }
  return fomcSchedule[year] || []
}

// FOMC Minutes - released ~3 weeks after each meeting
function getFOMCMinutesDates(year: number): string[] {
  const minutesSchedule: Record<number, string[]> = {
    2024: [
      '2024-01-03',
      '2024-02-21',
      '2024-04-10',
      '2024-05-22',
      '2024-07-03',
      '2024-08-21',
      '2024-10-09',
      '2024-11-26',
    ],
    2025: [
      '2025-01-08',
      '2025-02-19',
      '2025-04-09',
      '2025-05-28',
      '2025-07-09',
      '2025-08-20',
      '2025-10-08',
      '2025-11-26',
    ],
    2026: [
      '2026-01-07',
      '2026-02-18',
      '2026-04-08',
      '2026-05-27',
      '2026-07-08',
      '2026-08-19',
      '2026-10-07',
      '2026-11-25',
    ],
  }
  return minutesSchedule[year] || []
}

// Helper functions
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Polygon daily-bar timestamps are UTC midnight of the session date — use UTC components
// so the derived date string doesn't shift to the previous day in western timezones.
function formatDateUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function getNthWeekday(year: number, month: number, dayOfWeek: number, n: number): Date {
  let count = 0
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month, day)
    if (date.getMonth() !== month) break
    if (date.getDay() === dayOfWeek) {
      count++
      if (count === n) return date
    }
  }
  return new Date(year, month, 1)
}

function getLastWeekday(year: number, month: number, dayOfWeek: number): Date {
  let lastDate = new Date(year, month, 1)
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month, day)
    if (date.getMonth() !== month) break
    if (date.getDay() === dayOfWeek) lastDate = date
  }
  return lastDate
}

function getEasterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

function getThirdFriday(year: number, month: number): number {
  return getNthWeekday(year, month, 5, 3).getDate()
}

// Calculate estimated release dates when FRED doesn't have data
// Based on typical release patterns
function getEstimatedReleaseDates(year: number, month: number): Record<string, string[]> {
  const events: Record<string, string[]> = {}

  // Jobs Report - First Friday of month
  const firstFriday = getNthWeekday(year, month, 5, 1)
  const jobsDate = formatDate(firstFriday)
  events[jobsDate] = ['Jobs Report (Est.)']

  // CPI - Usually 2nd or 3rd week, Wednesday
  // Typically around the 10th-15th
  let cpiDay = 10
  while (new Date(year, month, cpiDay).getDay() !== 3 && cpiDay <= 15) cpiDay++
  if (cpiDay <= 15) {
    const cpiDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(cpiDay).padStart(2, '0')}`
    if (!events[cpiDate]) events[cpiDate] = []
    events[cpiDate].push('CPI (Est.)')
  }

  // PPI - Usually day after CPI, Thursday
  let ppiDay = 11
  while (new Date(year, month, ppiDay).getDay() !== 4 && ppiDay <= 16) ppiDay++
  if (ppiDay <= 16) {
    const ppiDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(ppiDay).padStart(2, '0')}`
    if (!events[ppiDate]) events[ppiDate] = []
    events[ppiDate].push('PPI (Est.)')
  }

  // Retail Sales - Around 15th-17th
  let retailDay = 15
  while (
    new Date(year, month, retailDay).getDay() === 0 ||
    new Date(year, month, retailDay).getDay() === 6
  )
    retailDay++
  const retailDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(retailDay).padStart(2, '0')}`
  if (!events[retailDate]) events[retailDate] = []
  events[retailDate].push('Retail Sales (Est.)')

  return events
}

// Fetch economic events from our API route (server-side proxy to avoid CORS)
async function fetchEconomicEvents(year: number, month: number): Promise<Record<string, string[]>> {
  try {
    const response = await fetch(`/api/fred-calendar?year=${year}&month=${month}`, {
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      throw new Error('Failed to fetch from API')
    }

    const data = await response.json()

    if (data.success && data.hasRealData) {
      return data.events
    } else {
      return getEstimatedReleaseDates(year, month)
    }
  } catch (error) {
    console.error('Error fetching economic events:', error)
    // Fall back to estimates on error
    return getEstimatedReleaseDates(year, month)
  }
}

function getSpecialEvents(year: number, month: number, day: number): string[] {
  const events: string[] = []
  const thirdFriday = getThirdFriday(year, month)

  if (day === thirdFriday) {
    if ([2, 5, 8, 11].includes(month)) {
      events.push('Quad Witching Day')
    } else {
      events.push('Options Expiration')
    }
  }

  if (month === 11 && day === 24) {
    events.push('Santa Claus Rally Begins')
  }

  if (month === 11 && day >= 10 && day <= 12) {
    events.push('Small Cap Strength Period')
  }

  return events
}

// Post-election years to exclude from normal years calculation
const POST_ELECTION_YEARS = [
  1953, 1957, 1961, 1965, 1969, 1973, 1977, 1981, 1985, 1989, 1993, 1997, 2001, 2005, 2009, 2013,
  2017, 2021, 2025,
]

// Fetch real historical daily stats from Polygon API
async function fetchDailyHistoricalStats(
  month: number,
  symbol: string = 'SPY'
): Promise<{ [tradingDay: number]: DailyStats }> {
  const stats: { [tradingDay: number]: DailyStats } = {}

  try {
    const currentYear = new Date().getFullYear()
    const startYear = currentYear - 20 // 20 years of data
    const startDate = `${startYear}-01-01`
    const endDate = `${currentYear}-12-31`

    const response = await fetch(
      `/api/polygon/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc`,
      { signal: AbortSignal.timeout(30000) }
    )

    if (!response.ok) {
      console.error('Failed to fetch historical data from Polygon')
      return stats
    }

    const data = await response.json()

    if (!data.results || data.results.length === 0) {
      return stats
    }

    // Group data by year and month
    const dailyReturns: { [tradingDay: number]: number[] } = {}
    const dataByYearMonth: { [key: string]: { t: number; c: number }[] } = {}

    for (const item of data.results) {
      const date = new Date(item.t)
      const itemMonth = date.getMonth()
      const itemYear = date.getFullYear()

      if (itemMonth === month) {
        const key = `${itemYear}`
        if (!dataByYearMonth[key]) {
          dataByYearMonth[key] = []
        }
        dataByYearMonth[key].push({ t: item.t, c: item.c })
      }
    }

    // Calculate daily returns for each trading day position
    const dailyReturnsByYear: { [tradingDay: number]: { year: number; return: number; date: string }[] } = {}
    for (const key of Object.keys(dataByYearMonth)) {
      const yearData = dataByYearMonth[key].sort((a, b) => a.t - b.t)
      const year = parseInt(key)

      for (let i = 1; i < yearData.length && i <= 23; i++) {
        const dailyReturn = ((yearData[i].c - yearData[i - 1].c) / yearData[i - 1].c) * 100

        if (!dailyReturns[i]) {
          dailyReturns[i] = []
        }
        dailyReturns[i].push(dailyReturn)

        if (!dailyReturnsByYear[i]) {
          dailyReturnsByYear[i] = []
        }
        dailyReturnsByYear[i].push({ year, return: Math.round(dailyReturn * 100) / 100, date: formatDateUTC(new Date(yearData[i].t)) })
      }
    }

    // Calculate stats for each trading day
    for (const tradingDayStr of Object.keys(dailyReturns)) {
      const tradingDay = parseInt(tradingDayStr)
      const returns = dailyReturns[tradingDay]
      const upDays = returns.filter((r) => r > 0).length
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length

      stats[tradingDay] = {
        winRate: Math.round((upDays / returns.length) * 100),
        avgReturn: Math.round(avgReturn * 100) / 100,
        upYears: upDays,
        totalYears: returns.length,
        yearlyBreakdown: (dailyReturnsByYear[tradingDay] || []).sort((a, b) => a.year - b.year),
      }
    }
  } catch (error) {
    console.error('Error fetching daily historical stats:', error)
  }

  return stats
}

const AlmanacCalendar: React.FC<AlmanacCalendarProps> = ({
  month: propMonth = new Date().getMonth(),
  year: propYear = new Date().getFullYear(),
  symbol = 'SPY',
  onBack,
  onMonthChange,
}) => {
  const [month, setMonth] = useState(propMonth)
  const [year, setYear] = useState(propYear)
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null)
  // Keep in sync if the parent changes the month/year (e.g. via its own dropdown)
  useEffect(() => {
    setMonth(propMonth)
    setYear(propYear)
  }, [propMonth, propYear])

  const goToMonth = (delta: number) => {
    let newMonth = month + delta
    let newYear = year
    if (newMonth < 0) { newMonth = 11; newYear -= 1 }
    if (newMonth > 11) { newMonth = 0; newYear += 1 }
    setMonth(newMonth)
    setYear(newYear)
    onMonthChange?.(newMonth, newYear)
  }
  const { isMobile } = useAlmanacCalendarMobile()
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([])
  const [loading, setLoading] = useState(true)
  const [dailyStats, setDailyStats] = useState<{ [tradingDay: number]: DailyStats }>({})
  const [economicEvents, setEconomicEvents] = useState<Record<string, string[]>>({})

  // Fetch real historical stats and economic events when month changes
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const [stats, events] = await Promise.all([
        fetchDailyHistoricalStats(month, symbol),
        fetchEconomicEvents(year, month),
      ])
      setDailyStats(stats)
      setEconomicEvents(events)
      setLoading(false)
    }
    loadData()
  }, [month, year, symbol])

  useEffect(() => {
    if (!loading) {
      buildCalendar()
    }
  }, [month, year, dailyStats, economicEvents, loading])

  const buildCalendar = () => {
    const days: CalendarDay[] = []

    // Get dynamic holidays for this year
    const marketHolidays = getMarketHolidays(year)
    const earlyCloseDates = getEarlyCloseDates(year)
    const fomcDates = getFOMCDates(year)
    const fomcMinutesDates = getFOMCMinutesDates(year)

    const firstOfMonth = new Date(year, month, 1)
    const lastOfMonth = new Date(year, month + 1, 0)
    const daysInMonth = lastOfMonth.getDate()
    const firstDow = firstOfMonth.getDay() // 0=Sun, 1=Mon...

    // Mon=0, Tue=1, Wed=2, Thu=3, Fri=4 for our grid
    const startCol = firstDow === 0 ? 0 : firstDow === 6 ? 0 : firstDow - 1

    // Pad with previous month days
    if (startCol > 0) {
      const prevLast = new Date(year, month, 0).getDate()
      for (let i = startCol - 1; i >= 0; i--) {
        days.push({
          date: new Date(year, month - 1, prevLast - i),
          dayOfMonth: prevLast - i,
          isCurrentMonth: false,
          isHoliday: false,
          events: [],
          tradingDayOfMonth: 0,
        })
      }
    }

    // Current month weekdays
    let tradingDayCount = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      const dow = date.getDay()
      if (dow === 0 || dow === 6) continue // Skip weekends

      const dateStr = formatDate(date)
      const isHoliday = !!marketHolidays[dateStr]
      const holidayName = marketHolidays[dateStr]
      const earlyClose = earlyCloseDates[dateStr]

      if (!isHoliday) {
        tradingDayCount++
      }

      // Build events from FRED API data + FOMC + special events
      const allEvents: string[] = []

      // Special events (options expiration, santa rally, etc)
      const special = getSpecialEvents(year, month, d)
      allEvents.push(...special)

      // Early close
      if (earlyClose) allEvents.push(`Early Close: ${earlyClose}`)

      // FOMC Decision
      if (fomcDates.includes(dateStr)) allEvents.push('FOMC Decision')

      // FOMC Minutes
      if (fomcMinutesDates.includes(dateStr)) allEvents.push('FOMC Minutes')

      // Economic events from FRED API
      if (economicEvents[dateStr]) {
        allEvents.push(...economicEvents[dateStr])
      }

      // Get real stats for this trading day
      const stats = !isHoliday ? dailyStats[tradingDayCount] : undefined

      days.push({
        date,
        dayOfMonth: d,
        isCurrentMonth: true,
        isHoliday,
        holidayName,
        events: allEvents,
        tradingDayOfMonth: isHoliday ? 0 : tradingDayCount,
        stats,
      })
    }

    // Pad end to fill row
    let nextD = 1
    while (days.length % 5 !== 0) {
      const date = new Date(year, month + 1, nextD)
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        days.push({
          date,
          dayOfMonth: nextD,
          isCurrentMonth: false,
          isHoliday: false,
          events: [],
          tradingDayOfMonth: 0,
        })
      }
      nextD++
    }

    setCalendarDays(days)
  }

  if (loading) {
    return (
      <div className="almanac-calendar loading">
        <div className="loading-spinner"></div>
        <p>Loading data...</p>
      </div>
    )
  }

  return (
    <div className="almanac-calendar">
      <div className="calendar-nav-bar">
        {onBack && (
          <button onClick={onBack} className="calendar-nav-back" title="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          </button>
        )}
        <div className="calendar-nav-month">
          <button onClick={() => goToMonth(-1)} className="calendar-nav-arrow" title="Previous month">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className="calendar-nav-label">{MONTH_NAMES[month]} {year}</span>
          <button onClick={() => goToMonth(1)} className="calendar-nav-arrow" title="Next month">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        <div className="calendar-header-row">
          {(isMobile ? DAY_NAMES_SHORT : DAY_NAMES).map((d, i) => (
            <div key={i} className="day-header">
              {d}
            </div>
          ))}
        </div>

        <div className="calendar-days">
          {calendarDays.map((day, idx) => {
            const isBullish = day.stats && day.stats.winRate >= 55
            const isBearish = day.stats && day.stats.winRate <= 45
            const isClickable = day.isCurrentMonth && !day.isHoliday && !!day.stats

            return (
              <div
                key={idx}
                className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${day.isHoliday ? 'holiday' : ''} ${day.isCurrentMonth && !day.isHoliday && isBullish ? 'bullish-day' : ''} ${day.isCurrentMonth && !day.isHoliday && isBearish ? 'bearish-day' : ''}`}
                style={isClickable ? { cursor: 'pointer' } : undefined}
                onClick={isClickable ? () => setSelectedDay(day) : undefined}
              >
                <div className="day-number-row">
                  {day.isCurrentMonth &&
                    !day.isHoliday &&
                    day.stats &&
                    (isBullish || isBearish) && (
                      <span className={`day-indicator ${isBullish ? 'bullish' : 'bearish'}`}>
                        {isBullish ? '▲' : '▼'}
                      </span>
                    )}
                  <span className="day-number">{day.dayOfMonth}</span>
                </div>

                {day.isCurrentMonth && day.isHoliday && (
                  <div className="holiday-label">
                    Market Closed: {day.holidayName}
                    <div className="holiday-name">{day.holidayName?.toUpperCase()}</div>
                  </div>
                )}

                {day.isCurrentMonth && !day.isHoliday && day.events.length > 0 && (
                  <div className="day-events">
                    {day.events.map((ev, i) => (
                      <div key={i} className="event">
                        {ev}
                      </div>
                    ))}
                  </div>
                )}

                {day.isCurrentMonth && !day.isHoliday && day.stats && (
                  <div
                    className={`win-rate ${isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral'}`}
                  >
                    {isMobile
                      ? `Up ${day.stats.upYears} of ${day.stats.totalYears} (${day.stats.winRate}%)`
                      : `${symbol} Up ${day.stats.upYears} of Last ${day.stats.totalYears} (${day.stats.winRate}%)`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {selectedDay && (
        <DayDetailModal day={selectedDay} symbol={symbol} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  )
}

// ── Mini intraday candlestick chart (market open → close, or prior close → close) ─
interface Candle { t: number; o: number; h: number; l: number; c: number }
type Timeframe = '5min' | '30min'

const getPSTDateString = (timestamp: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp))

const getPrevDateString = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

const IntradayCandleChart: React.FC<{ year: number; date: string; symbol: string; timeframe: Timeframe; onData?: (year: number, candles: Candle[] | null) => void }> = ({ year, date, symbol, timeframe, onData }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    setCandles(null)

    const getPSTMinutes = (timestamp: number): number => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: false,
      }).formatToParts(new Date(timestamp))
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
      return (hour === 24 ? 0 : hour) * 60 + minute
    }
    const marketOpen = 6 * 60 + 30
    const marketClose = 13 * 60

    // 5min: regular market hours 6:30 AM – 1:00 PM PST (same logic as EFICharting)
    const isMarketHoursPST = (timestamp: number): boolean => {
      const totalMinutes = getPSTMinutes(timestamp)
      return totalMinutes >= marketOpen && totalMinutes < marketClose
    }

    const prevDate = getPrevDateString(date)
    // 30min: previous day's 1 PM PST close through current day's 1 PM PST close
    const isCloseToCloseWindow = (timestamp: number): boolean => {
      const dayStr = getPSTDateString(timestamp)
      const totalMinutes = getPSTMinutes(timestamp)
      if (dayStr === prevDate) return totalMinutes >= marketClose
      if (dayStr === date) return totalMinutes < marketClose
      return false
    }

    type Bar = { t: number; o: number; h: number; l: number; c: number }

    // Polygon paginates aggs (~50 bars/page) via next_url — follow it through our proxy
    // until the whole range is retrieved, otherwise most of the session gets silently dropped.
    const fetchAllPages = async (initialUrl: string): Promise<Bar[]> => {
      let url = initialUrl
      const all: Bar[] = []
      let page = 0
      while (url && page < 20) {
        page++
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
        const data = await r.json()
        const results = (data.results || []) as Bar[]
        all.push(...results)
        if (data.next_url) {
          const tail = (data.next_url as string).split('/v2/')[1]
          url = tail ? `/api/polygon/v2/${tail}` : ''
        } else {
          url = ''
        }
      }
      return all
    }

    const url = timeframe === '30min'
      ? `/api/polygon/v2/aggs/ticker/${symbol}/range/30/minute/${prevDate}/${date}?adjusted=true&sort=asc&limit=50000`
      : `/api/polygon/v2/aggs/ticker/${symbol}/range/5/minute/${date}/${date}?adjusted=true&sort=asc&limit=50000`

    fetchAllPages(url)
      .then((results) => {
        if (cancelled) return
        if (!results.length) {
          setState('empty')
          onData?.(year, null)
          return
        }
        const filtered = results.filter((r) => (timeframe === '30min' ? isCloseToCloseWindow(r.t) : isMarketHoursPST(r.t)))
        const finalData = filtered.length ? filtered : results
        const mapped = finalData.map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c }))
        setCandles(mapped)
        setState('ok')
        onData?.(year, mapped)
      })
      .catch(() => {
        if (!cancelled) {
          setState('error')
          onData?.(year, null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [symbol, date, year, timeframe])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !candles || candles.length === 0) return
    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const padLeft = 36
    const padRight = 4
    const padTop = 8
    const padBottom = 18
    const chartW = width - padLeft - padRight
    const chartH = height - padTop - padBottom

    let min = Infinity
    let max = -Infinity
    for (const c of candles) {
      if (c.l < min) min = c.l
      if (c.h > max) max = c.h
    }
    if (min === max) {
      min -= 1
      max += 1
    }
    const pricePad = (max - min) * 0.06
    min -= pricePad
    max += pricePad

    const yFor = (price: number) => padTop + chartH - ((price - min) / (max - min)) * chartH
    const n = candles.length
    const slot = chartW / n
    const candleW = Math.max(1, Math.min(6, slot * 0.7))

    // Pre/after-hours shading — same bands + colors as EFICharting
    const getSession = (timestamp: number): 'premarket' | 'regular' | 'afterhours' => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: false,
      }).formatToParts(new Date(timestamp))
      const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
      const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
      const mins = (h === 24 ? 0 : h) * 60 + m
      if (mins >= 60 && mins < 390) return 'premarket'    // 1:00 AM – 6:30 AM PST
      if (mins >= 780 && mins < 1020) return 'afterhours' // 1:00 PM – 5:00 PM PST
      return 'regular'
    }
    let bandSession: 'premarket' | 'afterhours' | null = null
    let bandStartIdx = 0
    const flushBand = (endIdx: number) => {
      if (bandSession === null) return
      const x = padLeft + bandStartIdx * slot
      const w = (endIdx - bandStartIdx) * slot
      if (w <= 0) return
      ctx.fillStyle = bandSession === 'premarket'
        ? 'rgba(255, 140, 60, 0.08)'
        : 'rgba(100, 150, 200, 0.08)'
      ctx.fillRect(x, padTop, w, chartH)
    }
    candles.forEach((c, idx) => {
      const session = getSession(c.t)
      const incoming = session !== 'regular' ? session : null
      if (incoming !== bandSession) {
        flushBand(idx)
        bandSession = incoming
        bandStartIdx = idx
      }
    })
    flushBand(n)

    // Grid + Y axis labels
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.fillStyle = '#ffffff'
    ctx.font = '12px "JetBrains Mono", monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const gridLines = 4
    // Cap axis labels to 4 significant digits (e.g. 1234, 123.4, 12.34)
    const formatAxisPrice = (price: number): string => {
      const abs = Math.abs(price)
      const decimals = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 10 ? 2 : 3
      return price.toFixed(decimals)
    }
    for (let i = 0; i <= gridLines; i++) {
      const price = min + ((max - min) * i) / gridLines
      const y = yFor(price)
      ctx.beginPath()
      ctx.moveTo(padLeft, y)
      ctx.lineTo(width - padRight, y)
      ctx.stroke()
      ctx.fillText(formatAxisPrice(price), padLeft - 4, y)
    }

    // X axis labels (open / midday / close) — shown in PST
    ctx.font = '13px "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const xLabelIdxs = [0, Math.floor(n / 2), n - 1]
    xLabelIdxs.forEach((idx) => {
      const c = candles[idx]
      const x = padLeft + idx * slot + slot / 2
      const d = new Date(c.t)
      const label = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
      ctx.fillText(label, x, height - padBottom + 8)
    })

    // Candles
    for (let i = 0; i < n; i++) {
      const c = candles[i]
      const x = padLeft + i * slot + slot / 2
      const up = c.c >= c.o
      ctx.strokeStyle = up ? '#00ff00' : '#ff3333'
      ctx.fillStyle = up ? '#00ff00' : '#ff3333'
      ctx.beginPath()
      ctx.moveTo(x, yFor(c.h))
      ctx.lineTo(x, yFor(c.l))
      ctx.stroke()
      const yOpen = yFor(c.o)
      const yClose = yFor(c.c)
      const bodyTop = Math.min(yOpen, yClose)
      const bodyH = Math.max(1, Math.abs(yClose - yOpen))
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH)
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.strokeRect(padLeft, padTop, chartW, chartH)
  }, [candles])

  const dayReturn =
    candles && candles.length > 1 ? ((candles[candles.length - 1].c - candles[0].o) / candles[0].o) * 100 : null

  return (
    <div className="intraday-candle-card">
      <div className="intraday-candle-header">
        <span className="intraday-candle-year">{year}</span>
        {dayReturn !== null && (
          <span className={`intraday-candle-return ${dayReturn >= 0 ? 'up' : 'down'}`}>
            {dayReturn >= 0 ? '+' : ''}
            {dayReturn.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="intraday-candle-canvas-wrap">
        {state === 'loading' && <div className="intraday-candle-status">Loading…</div>}
        {state === 'empty' && <div className="intraday-candle-status">No intraday data</div>}
        {state === 'error' && <div className="intraday-candle-status">Failed to load</div>}
        <canvas ref={canvasRef} style={{ display: state === 'ok' ? 'block' : 'none' }} />
      </div>
    </div>
  )
}

// ── Cross-year pattern analysis for the Summary panel ───────────────────────
type Bias = 'bullish' | 'bearish' | 'choppy'

const classifyMove = (pct: number): Bias => (pct > 0.1 ? 'bullish' : pct < -0.1 ? 'bearish' : 'choppy')

const majorityLabel = (counts: Record<string, number>, total: number): { label: string; pct: number } => {
  if (total === 0) return { label: 'no data', pct: 0 }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const [topKey, topCount] = entries[0]
  const pct = Math.round((topCount / total) * 100)
  const second = entries[1]?.[1] ?? 0
  if (pct >= 60) return { label: topKey, pct }
  if (topCount - second <= Math.ceil(total * 0.15)) return { label: 'diverge', pct }
  return { label: 'no-pattern', pct }
}

interface SegmentBias { open: Bias; mid: Bias; power: Bias; gap: 'gap up' | 'gap down' | 'flat' | null }

const analyzeYearCandles = (candles: Candle[], date: string, prevDate: string): SegmentBias | null => {
  const regular = candles.filter((c) => {
    const dayStr = getPSTDateString(c.t)
    if (dayStr !== date) return false
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(c.t))
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
    const mins = (h === 24 ? 0 : h) * 60 + m
    return mins >= 390 && mins < 780
  })
  if (regular.length < 6) return null

  const third = Math.max(1, Math.floor(regular.length / 3))
  const openSeg = regular.slice(0, third)
  const midSeg = regular.slice(third, regular.length - third)
  const powerSeg = regular.slice(regular.length - third)
  const pctOf = (seg: Candle[]) => (seg.length ? ((seg[seg.length - 1].c - seg[0].o) / seg[0].o) * 100 : 0)

  let gap: SegmentBias['gap'] = null
  const prevBars = candles.filter((c) => getPSTDateString(c.t) === prevDate)
  if (prevBars.length && regular.length) {
    const priorClose = prevBars[prevBars.length - 1].c
    const gapPct = ((regular[0].o - priorClose) / priorClose) * 100
    gap = gapPct > 0.15 ? 'gap up' : gapPct < -0.15 ? 'gap down' : 'flat'
  }

  return { open: classifyMove(pctOf(openSeg)), mid: classifyMove(pctOf(midSeg)), power: classifyMove(pctOf(powerSeg)), gap }
}

const buildSummary = (
  yearData: Record<number, Candle[] | null>,
  dateByYear: Record<number, string>,
  timeframe: Timeframe,
  dateObj: Date,
): string[] => {
  const results = Object.entries(yearData)
    .filter((entry): entry is [string, Candle[]] => !!entry[1] && entry[1].length > 0)
    .map(([yearStr, candles]) => {
      const yearDate = dateByYear[Number(yearStr)]
      if (!yearDate) return null
      return analyzeYearCandles(candles, yearDate, getPrevDateString(yearDate))
    })
    .filter((r): r is SegmentBias => r !== null)

  if (!results.length) return ['Not enough intraday data across these years to build a summary.']

  const total = results.length
  const lines: string[] = []

  const countOf = (key: keyof SegmentBias) => {
    const counts: Record<string, number> = {}
    for (const r of results) {
      const v = r[key]
      if (v === null) continue
      counts[v] = (counts[v] || 0) + 1
    }
    return counts
  }
  const describe = (name: string, key: keyof SegmentBias) => {
    const counts = countOf(key)
    const n = Object.values(counts).reduce((a, b) => a + b, 0)
    if (!n) return `• ${name}: no data`
    const { label, pct } = majorityLabel(counts, n)
    if (label === 'diverge') return `• ${name}: years diverge aggressively — no consistent edge`
    if (label === 'no-pattern') return `• ${name}: no clear pattern detected`
    return `• ${name}: ${n} of ${total} years agree, ${pct}% ${label.toUpperCase()}`
  }

  if (timeframe === '30min') {
    lines.push(describe('Gap from prior close', 'gap'))
  }
  lines.push(describe('Opening hours', 'open'))
  lines.push(describe('Midday', 'mid'))
  lines.push(describe('Power hour (last stretch into close)', 'power'))

  // Actionable recommendation — only for a strong gap-direction majority in 30min mode
  if (timeframe === '30min') {
    const gapCounts = countOf('gap')
    const n = Object.values(gapCounts).reduce((a, b) => a + b, 0)
    const { label, pct } = majorityLabel(gapCounts, n)
    if ((label === 'gap up' || label === 'gap down') && pct >= 60) {
      const prior = new Date(dateObj)
      prior.setDate(prior.getDate() - 1)
      while (prior.getDay() === 0 || prior.getDay() === 6) prior.setDate(prior.getDate() - 1)
      const priorLabel = prior.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      const side = label === 'gap up' ? 'calls' : 'puts'
      lines.push(
        `💡 Recommendation: ${pct}% of years show a historical ${label} into ${dateLabel}. Consider buying ${side} before market close on ${priorLabel} ahead of the tendency.`
      )
    } else {
      lines.push('💡 No strong actionable gap bias — sizing a directional bet here is not well supported by history.')
    }
  }

  return lines
}

// ── Detail popup shown when clicking a trading day ──────────────────────────
const DayDetailModal: React.FC<{ day: CalendarDay; symbol: string; onClose: () => void }> = ({
  day,
  symbol,
  onClose,
}) => {
  const breakdown = day.stats?.yearlyBreakdown || []
  const sortedDesc = [...breakdown].sort((a, b) => b.year - a.year)
  const availableYears = sortedDesc.length
  const dateLabel = day.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const [timeframe, setTimeframe] = useState<Timeframe>('5min')
  const [yearData, setYearData] = useState<Record<number, Candle[] | null>>({})
  const [showSummary, setShowSummary] = useState(false)
  const [yearsBack, setYearsBack] = useState<number>(999)
  const [cycleFilter, setCycleFilter] = useState<'all' | 'election' | 'midterm' | 'pre-election' | 'post-election'>('all')

  const cycleMatches = React.useCallback((year: number) => {
    const mod = ((year % 4) + 4) % 4
    if (cycleFilter === 'election') return mod === 0
    if (cycleFilter === 'midterm') return mod === 2
    if (cycleFilter === 'pre-election') return mod === 3
    if (cycleFilter === 'post-election') return mod === 1
    return true
  }, [cycleFilter])

  const filteredYears = React.useMemo(
    () => sortedDesc.filter((y) => cycleMatches(y.year)).slice(0, yearsBack),
    [sortedDesc, cycleMatches, yearsBack]
  )

  const handleData = React.useCallback((year: number, candles: Candle[] | null) => {
    setYearData((prev) => ({ ...prev, [year]: candles }))
  }, [])

  const allLoaded = filteredYears.length > 0 && filteredYears.every((y) => yearData[y.year] !== undefined)
  const dateByYear = React.useMemo(
    () => Object.fromEntries(filteredYears.map((y) => [y.year, y.date])),
    [filteredYears]
  )
  const summaryLines = React.useMemo(() => {
    if (!showSummary || !allLoaded) return []
    return buildSummary(yearData, dateByYear, timeframe, day.date)
  }, [showSummary, allLoaded, yearData, dateByYear, timeframe, day.date])

  return (
    <div className="day-detail-overlay" onClick={onClose}>
      <div className="day-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="day-detail-header">
          <div className="day-detail-title-row">
            <span className="day-detail-title">{symbol} {'\u2022'} {dateLabel}</span>
            <span className="day-detail-subtitle">
              {'\u2022'} Up {day.stats?.upYears} of Last {day.stats?.totalYears} years ({day.stats?.winRate}% win rate) {'\u2022'} Avg {day.stats?.avgReturn}%
            </span>
          </div>
          <select
            className="day-detail-filter-select"
            value={yearsBack}
            onChange={(e) => setYearsBack(Number(e.target.value))}
          >
            {[5, 10, 15, 20].filter((n) => n < availableYears).map((n) => (
              <option key={n} value={n}>Last {n} years</option>
            ))}
            <option value={999}>All {availableYears} years</option>
          </select>
          <select
            className="day-detail-filter-select"
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value as typeof cycleFilter)}
          >
            <option value="all">All cycle years</option>
            <option value="election">Election years</option>
            <option value="midterm">Midterm years</option>
            <option value="pre-election">Pre-election years</option>
            <option value="post-election">Post-election years</option>
          </select>
          <div className="day-detail-timeframe-toggle">
            <button
              className={timeframe === '5min' ? 'active' : ''}
              onClick={() => setTimeframe('5min')}
            >
              5min
            </button>
            <button
              className={timeframe === '30min' ? 'active' : ''}
              onClick={() => setTimeframe('30min')}
            >
              30min
            </button>
          </div>
          <button
            className={`day-detail-summary-btn ${showSummary ? 'active' : ''}`}
            onClick={() => setShowSummary((s) => !s)}
            disabled={!allLoaded}
            title={allLoaded ? 'Analyze patterns across years' : 'Loading data…'}
          >
            {allLoaded ? 'Summary' : 'Loading…'}
          </button>
          <button className="day-detail-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {showSummary && (
          <div className="day-detail-summary-panel">
            {summaryLines.length === 0 ? (
              <div className="day-detail-summary-line">No years match the selected filters.</div>
            ) : (
              summaryLines.map((line, i) => (
                <div key={i} className="day-detail-summary-line">{line}</div>
              ))
            )}
          </div>
        )}

        <div className="intraday-candle-grid">
          {filteredYears.map((y) => (
            <IntradayCandleChart key={y.year} year={y.year} date={y.date} symbol={symbol} timeframe={timeframe} onData={handleData} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default AlmanacCalendar

