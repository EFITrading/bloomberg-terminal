/**
 * Market session utilities using America/Los_Angeles (PST/PDT) timezone.
 *
 * Live data windows confirmed via Polygon.io API testing (7-day scan):
 *   PRE_MARKET:  1:00 AM – 6:29 AM PST  (weekdays, non-holiday)
 *   MARKET:      6:30 AM – 12:59 PM PST  (weekdays, non-holiday)
 *   AFTER_HOURS: 1:00 PM – 4:59 PM PST  (weekdays, non-holiday)
 *   CLOSED:      5:00 PM – 12:59 AM PST + weekends + holidays
 *
 * When CLOSED, the last available price (prev close) should be used instead of a live fetch.
 */

/** US market holidays 2025–2026 in YYYY-MM-DD format (American/New_York calendar). */
export const US_MARKET_HOLIDAYS: string[] = [
    '2025-01-01', // New Year's Day
    '2025-01-20', // MLK Day
    '2025-02-17', // Presidents Day
    '2025-04-18', // Good Friday
    '2025-05-26', // Memorial Day
    '2025-07-04', // Independence Day
    '2025-09-01', // Labor Day
    '2025-11-27', // Thanksgiving
    '2025-12-25', // Christmas
    '2026-01-01', // New Year's Day
    '2026-01-19', // MLK Day
    '2026-02-16', // Presidents Day
    '2026-04-03', // Good Friday
    '2026-05-25', // Memorial Day
    '2026-07-03', // Independence Day (observed)
    '2026-09-07', // Labor Day
    '2026-11-26', // Thanksgiving
    '2026-12-25', // Christmas
]

export type MarketSession = 'PRE_MARKET' | 'MARKET' | 'AFTER_HOURS' | 'CLOSED'

/** Returns true if the given YYYY-MM-DD string is a US market holiday. */
export function isHoliday(dateStr: string): boolean {
    return US_MARKET_HOLIDAYS.includes(dateStr)
}

/**
 * Returns the current market session based on America/Los_Angeles (PST/PDT) time.
 *
 * PRE_MARKET:  1:00 AM – 6:29 AM PST  weekday non-holiday
 * MARKET:      6:30 AM – 12:59 PM PST  weekday non-holiday
 * AFTER_HOURS: 1:00 PM – 4:59 PM PST  weekday non-holiday
 * CLOSED:      5:00 PM – 12:59 AM PST, or weekend, or holiday
 */
export function getMarketSession(): MarketSession {
    const now = new Date()
    const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const dayOfWeek = pst.getDay() // 0 = Sunday, 6 = Saturday

    if (dayOfWeek === 0 || dayOfWeek === 6) return 'CLOSED'

    const year = pst.getFullYear()
    const month = String(pst.getMonth() + 1).padStart(2, '0')
    const day = String(pst.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    if (isHoliday(dateStr)) return 'CLOSED'

    const currentTime = pst.getHours() + pst.getMinutes() / 60

    if (currentTime >= 1.0 && currentTime < 6.5) return 'PRE_MARKET'
    if (currentTime >= 6.5 && currentTime < 13.0) return 'MARKET'
    if (currentTime >= 13.0 && currentTime < 17.0) return 'AFTER_HOURS'
    return 'CLOSED'
}

/**
 * Returns true during PRE_MARKET, MARKET, and AFTER_HOURS on non-holiday weekdays.
 * Returns false during the overnight dead-zone (5:00 PM – 12:59 AM PST), weekends, and holidays.
 * Use prevClose / last available price when this returns false.
 */
export function isLiveDataAvailable(): boolean {
    return getMarketSession() !== 'CLOSED'
}

/**
 * Returns the most recent trading day as a YYYY-MM-DD string using the local holiday list
 * (no API call required).
 *
 * Rules:
 *   - If PST time is 00:00–00:59 (early overnight before pre-market), step back one day.
 *   - Walk backwards to find the nearest weekday that is not a holiday.
 */
export function getLastTradingDayStr(): string {
    const now = new Date()
    const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const currentTime = pst.getHours() + pst.getMinutes() / 60

    const candidate = new Date(pst)

    // Before market open (6:30 AM PST) the current calendar day hasn't started any trading yet
    if (currentTime < 6.5) {
        candidate.setDate(candidate.getDate() - 1)
    }

    for (let i = 0; i < 14; i++) {
        const year = candidate.getFullYear()
        const month = String(candidate.getMonth() + 1).padStart(2, '0')
        const day = String(candidate.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`
        const dayOfWeek = candidate.getDay()

        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday(dateStr)) {
            return dateStr
        }
        candidate.setDate(candidate.getDate() - 1)
    }

    // Fallback (should never happen with 14-day window)
    const year = candidate.getFullYear()
    const month = String(candidate.getMonth() + 1).padStart(2, '0')
    const day = String(candidate.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

/**
 * Returns true if the given date falls within Pacific Daylight Time (PDT, UTC-7).
 * Used to select the correct PST/PDT offset when constructing timestamps.
 */
export function isPacificDST(date: Date): boolean {
    return date
        .toLocaleString('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'short' })
        .includes('PDT')
}

/**
 * Constructs an exact millisecond timestamp for 6:30 AM PST/PDT (market open)
 * on the given YYYY-MM-DD date. Handles DST automatically.
 */
export function marketOpenTimestampForDate(dateStr: string): number {
    const [year, month, day] = dateStr.split('-').map(Number)
    const probe = new Date(year, month - 1, day, 12, 0, 0)
    const pstOffset = isPacificDST(probe) ? '-07:00' : '-08:00'
    return new Date(`${dateStr}T06:30:00${pstOffset}`).getTime()
}

/**
 * Constructs an exact millisecond timestamp for 1:00 PM PST/PDT (market close)
 * on the given YYYY-MM-DD date. Handles DST automatically.
 */
export function marketCloseTimestampForDate(dateStr: string): number {
    const [year, month, day] = dateStr.split('-').map(Number)
    const probe = new Date(year, month - 1, day, 12, 0, 0)
    const pstOffset = isPacificDST(probe) ? '-07:00' : '-08:00'
    return new Date(`${dateStr}T13:00:00${pstOffset}`).getTime()
}
