'use client';

import React, { useState, useEffect } from 'react';

interface DailyStats {
  winRate: number;
  avgReturn: number;
  upYears: number;
  totalYears: number;
}

interface EconomicEvent {
  date: string;
  name: string;
}

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isHoliday: boolean;
  holidayName?: string;
  events: string[];
  tradingDayOfMonth: number;
  stats?: DailyStats;
}

interface AlmanacCalendarProps {
  month?: number;
  year?: number;
  symbol?: string;
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];

const DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Market Holidays - dynamically generate for any year
function getMarketHolidays(year: number): Record<string, string> {
  const holidays: Record<string, string> = {};

  // New Year's Day - Jan 1 (or observed)
  let newYears = new Date(year, 0, 1);
  if (newYears.getDay() === 0) newYears = new Date(year, 0, 2);
  if (newYears.getDay() === 6) newYears = new Date(year - 1, 11, 31);
  holidays[formatDate(newYears)] = "New Year's Day";

  // MLK Day - 3rd Monday of January
  holidays[formatDate(getNthWeekday(year, 0, 1, 3))] = 'MLK Day';

  // Presidents Day - 3rd Monday of February
  holidays[formatDate(getNthWeekday(year, 1, 1, 3))] = "Presidents' Day";

  // Good Friday - Friday before Easter
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  holidays[formatDate(goodFriday)] = 'Good Friday';

  // Memorial Day - Last Monday of May
  holidays[formatDate(getLastWeekday(year, 4, 1))] = 'Memorial Day';

  // Juneteenth - June 19 (or observed)
  let juneteenth = new Date(year, 5, 19);
  if (juneteenth.getDay() === 0) juneteenth = new Date(year, 5, 20);
  if (juneteenth.getDay() === 6) juneteenth = new Date(year, 5, 18);
  holidays[formatDate(juneteenth)] = 'Juneteenth';

  // Independence Day - July 4 (or observed)
  let july4 = new Date(year, 6, 4);
  if (july4.getDay() === 0) july4 = new Date(year, 6, 5);
  if (july4.getDay() === 6) july4 = new Date(year, 6, 3);
  holidays[formatDate(july4)] = 'Independence Day';

  // Labor Day - 1st Monday of September
  holidays[formatDate(getNthWeekday(year, 8, 1, 1))] = 'Labor Day';

  // Thanksgiving - 4th Thursday of November
  holidays[formatDate(getNthWeekday(year, 10, 4, 4))] = 'Thanksgiving';

  // Christmas - Dec 25 (or observed)
  let christmas = new Date(year, 11, 25);
  if (christmas.getDay() === 0) christmas = new Date(year, 11, 26);
  if (christmas.getDay() === 6) christmas = new Date(year, 11, 24);
  holidays[formatDate(christmas)] = 'Christmas';

  return holidays;
}

// Early close dates
function getEarlyCloseDates(year: number): Record<string, string> {
  const dates: Record<string, string> = {};

  // Day before Independence Day (if weekday)
  const july3 = new Date(year, 6, 3);
  if (july3.getDay() >= 1 && july3.getDay() <= 5) {
    dates[formatDate(july3)] = 'Independence Day Eve';
  }

  // Day after Thanksgiving
  const thanksgiving = getNthWeekday(year, 10, 4, 4);
  const dayAfter = new Date(thanksgiving);
  dayAfter.setDate(thanksgiving.getDate() + 1);
  dates[formatDate(dayAfter)] = 'Day After Thanksgiving';

  // Christmas Eve (if weekday)
  const dec24 = new Date(year, 11, 24);
  if (dec24.getDay() >= 1 && dec24.getDay() <= 5) {
    dates[formatDate(dec24)] = 'Christmas Eve';
  }

  return dates;
}

// FOMC Meeting dates - dynamically calculate (8 meetings per year)
// Fed typically meets every ~6 weeks, 2-day meetings ending on Wed
function getFOMCDates(year: number): string[] {
  // These are officially published by the Fed - we cache the known years
  const fomcSchedule: Record<number, string[]> = {
    2024: ['2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18'],
    2025: ['2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-11-06', '2025-12-10'],
    2026: ['2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17', '2026-07-29', '2026-09-16', '2026-11-05', '2026-12-16'],
  };
  return fomcSchedule[year] || [];
}

// FOMC Minutes - released ~3 weeks after each meeting
function getFOMCMinutesDates(year: number): string[] {
  const minutesSchedule: Record<number, string[]> = {
    2024: ['2024-01-03', '2024-02-21', '2024-04-10', '2024-05-22', '2024-07-03', '2024-08-21', '2024-10-09', '2024-11-26'],
    2025: ['2025-01-08', '2025-02-19', '2025-04-09', '2025-05-28', '2025-07-09', '2025-08-20', '2025-10-08', '2025-11-26'],
    2026: ['2026-01-07', '2026-02-18', '2026-04-08', '2026-05-27', '2026-07-08', '2026-08-19', '2026-10-07', '2026-11-25'],
  };
  return minutesSchedule[year] || [];
}

// Helper functions
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getNthWeekday(year: number, month: number, dayOfWeek: number, n: number): Date {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month, day);
    if (date.getMonth() !== month) break;
    if (date.getDay() === dayOfWeek) {
      count++;
      if (count === n) return date;
    }
  }
  return new Date(year, month, 1);
}

function getLastWeekday(year: number, month: number, dayOfWeek: number): Date {
  let lastDate = new Date(year, month, 1);
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month, day);
    if (date.getMonth() !== month) break;
    if (date.getDay() === dayOfWeek) lastDate = date;
  }
  return lastDate;
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function getThirdFriday(year: number, month: number): number {
  return getNthWeekday(year, month, 5, 3).getDate();
}

// Calculate estimated release dates when FRED doesn't have data
// Based on typical release patterns
function getEstimatedReleaseDates(year: number, month: number): Record<string, string[]> {
  const events: Record<string, string[]> = {};

  // Jobs Report - First Friday of month
  const firstFriday = getNthWeekday(year, month, 5, 1);
  const jobsDate = formatDate(firstFriday);
  events[jobsDate] = ['Jobs Report (Est.)'];

  // CPI - Usually 2nd or 3rd week, Wednesday
  // Typically around the 10th-15th
  let cpiDay = 10;
  while (new Date(year, month, cpiDay).getDay() !== 3 && cpiDay <= 15) cpiDay++;
  if (cpiDay <= 15) {
    const cpiDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(cpiDay).padStart(2, '0')}`;
    if (!events[cpiDate]) events[cpiDate] = [];
    events[cpiDate].push('CPI (Est.)');
  }

  // PPI - Usually day after CPI, Thursday
  let ppiDay = 11;
  while (new Date(year, month, ppiDay).getDay() !== 4 && ppiDay <= 16) ppiDay++;
  if (ppiDay <= 16) {
    const ppiDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(ppiDay).padStart(2, '0')}`;
    if (!events[ppiDate]) events[ppiDate] = [];
    events[ppiDate].push('PPI (Est.)');
  }

  // Retail Sales - Around 15th-17th
  let retailDay = 15;
  while (new Date(year, month, retailDay).getDay() === 0 || new Date(year, month, retailDay).getDay() === 6) retailDay++;
  const retailDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(retailDay).padStart(2, '0')}`;
  if (!events[retailDate]) events[retailDate] = [];
  events[retailDate].push('Retail Sales (Est.)');

  return events;
}

// Fetch economic events from our API route (server-side proxy to avoid CORS)
async function fetchEconomicEvents(year: number, month: number): Promise<Record<string, string[]>> {
  try {
    const response = await fetch(`/api/fred-calendar?year=${year}&month=${month}`, {
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error('Failed to fetch from API');
    }

    const data = await response.json();

    if (data.success && data.hasRealData) {
      return data.events;
    } else {
      // Fall back to estimates if no real data
      console.log(`No FRED data for ${year}-${month + 1}, using estimates`);
      return getEstimatedReleaseDates(year, month);
    }
  } catch (error) {
    console.error('Error fetching economic events:', error);
    // Fall back to estimates on error
    return getEstimatedReleaseDates(year, month);
  }
}

function getSpecialEvents(year: number, month: number, day: number): string[] {
  const events: string[] = [];
  const thirdFriday = getThirdFriday(year, month);

  if (day === thirdFriday) {
    if ([2, 5, 8, 11].includes(month)) {
      events.push('Quad Witching Day');
    } else {
      events.push('Options Expiration');
    }
  }

  if (month === 11 && day === 24) {
    events.push('Santa Claus Rally Begins');
  }

  if (month === 11 && day >= 10 && day <= 12) {
    events.push('Small Cap Strength Period');
  }

  return events;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Post-election years to exclude from normal years calculation
const POST_ELECTION_YEARS = [1953, 1957, 1961, 1965, 1969, 1973, 1977, 1981, 1985, 1989, 1993, 1997, 2001, 2005, 2009, 2013, 2017, 2021, 2025];

// Fetch real historical daily stats from Polygon API
async function fetchDailyHistoricalStats(month: number, symbol: string = 'SPY'): Promise<{ [tradingDay: number]: DailyStats }> {
  const stats: { [tradingDay: number]: DailyStats } = {};

  try {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 20; // 20 years of data
    const startDate = `${startYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`,
      { signal: AbortSignal.timeout(30000) }
    );

    if (!response.ok) {
      console.error('Failed to fetch historical data from Polygon');
      return stats;
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return stats;
    }

    // Group data by year and month
    const dailyReturns: { [tradingDay: number]: number[] } = {};
    const dataByYearMonth: { [key: string]: { t: number; c: number }[] } = {};

    for (const item of data.results) {
      const date = new Date(item.t);
      const itemMonth = date.getMonth();
      const itemYear = date.getFullYear();

      if (itemMonth === month) {
        const key = `${itemYear}`;
        if (!dataByYearMonth[key]) {
          dataByYearMonth[key] = [];
        }
        dataByYearMonth[key].push({ t: item.t, c: item.c });
      }
    }

    // Calculate daily returns for each trading day position
    for (const key of Object.keys(dataByYearMonth)) {
      const yearData = dataByYearMonth[key].sort((a, b) => a.t - b.t);

      for (let i = 1; i < yearData.length && i <= 23; i++) {
        const dailyReturn = ((yearData[i].c - yearData[i - 1].c) / yearData[i - 1].c) * 100;

        if (!dailyReturns[i]) {
          dailyReturns[i] = [];
        }
        dailyReturns[i].push(dailyReturn);
      }
    }

    // Calculate stats for each trading day
    for (const tradingDayStr of Object.keys(dailyReturns)) {
      const tradingDay = parseInt(tradingDayStr);
      const returns = dailyReturns[tradingDay];
      const upDays = returns.filter(r => r > 0).length;
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

      stats[tradingDay] = {
        winRate: Math.round((upDays / returns.length) * 100),
        avgReturn: Math.round(avgReturn * 100) / 100,
        upYears: upDays,
        totalYears: returns.length
      };
    }

  } catch (error) {
    console.error('Error fetching daily historical stats:', error);
  }

  return stats;
}

const AlmanacCalendar: React.FC<AlmanacCalendarProps> = ({
  month: propMonth = new Date().getMonth(),
  year: propYear = new Date().getFullYear(),
  symbol = 'SPY'
}) => {
  const month = propMonth;
  const year = propYear;
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState<{ [tradingDay: number]: DailyStats }>({});
  const [economicEvents, setEconomicEvents] = useState<Record<string, string[]>>({});

  // Fetch real historical stats and economic events when month changes
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [stats, events] = await Promise.all([
        fetchDailyHistoricalStats(month, symbol),
        fetchEconomicEvents(year, month)
      ]);
      setDailyStats(stats);
      setEconomicEvents(events);
      setLoading(false);
    };
    loadData();
  }, [month, year, symbol]);

  useEffect(() => {
    if (!loading) {
      buildCalendar();
    }
  }, [month, year, dailyStats, economicEvents, loading]);

  const buildCalendar = () => {
    const days: CalendarDay[] = [];

    // Get dynamic holidays for this year
    const marketHolidays = getMarketHolidays(year);
    const earlyCloseDates = getEarlyCloseDates(year);
    const fomcDates = getFOMCDates(year);
    const fomcMinutesDates = getFOMCMinutesDates(year);

    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastOfMonth.getDate();
    const firstDow = firstOfMonth.getDay(); // 0=Sun, 1=Mon...

    // Mon=0, Tue=1, Wed=2, Thu=3, Fri=4 for our grid
    const startCol = firstDow === 0 ? 0 : (firstDow === 6 ? 0 : firstDow - 1);

    // Pad with previous month days
    if (startCol > 0) {
      const prevLast = new Date(year, month, 0).getDate();
      for (let i = startCol - 1; i >= 0; i--) {
        days.push({
          date: new Date(year, month - 1, prevLast - i),
          dayOfMonth: prevLast - i,
          isCurrentMonth: false,
          isHoliday: false,
          events: [],
          tradingDayOfMonth: 0
        });
      }
    }

    // Current month weekdays
    let tradingDayCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue; // Skip weekends

      const dateStr = formatDate(date);
      const isHoliday = !!marketHolidays[dateStr];
      const holidayName = marketHolidays[dateStr];
      const earlyClose = earlyCloseDates[dateStr];

      if (!isHoliday) {
        tradingDayCount++;
      }

      // Build events from FRED API data + FOMC + special events
      const allEvents: string[] = [];

      // Special events (options expiration, santa rally, etc)
      const special = getSpecialEvents(year, month, d);
      allEvents.push(...special);

      // Early close
      if (earlyClose) allEvents.push(`Early Close: ${earlyClose}`);

      // FOMC Decision
      if (fomcDates.includes(dateStr)) allEvents.push('FOMC Decision');

      // FOMC Minutes
      if (fomcMinutesDates.includes(dateStr)) allEvents.push('FOMC Minutes');

      // Economic events from FRED API
      if (economicEvents[dateStr]) {
        allEvents.push(...economicEvents[dateStr]);
      }

      // Get real stats for this trading day
      const stats = !isHoliday ? dailyStats[tradingDayCount] : undefined;

      days.push({
        date,
        dayOfMonth: d,
        isCurrentMonth: true,
        isHoliday,
        holidayName,
        events: allEvents,
        tradingDayOfMonth: isHoliday ? 0 : tradingDayCount,
        stats
      });
    }

    // Pad end to fill row
    let nextD = 1;
    while (days.length % 5 !== 0) {
      const date = new Date(year, month + 1, nextD);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        days.push({
          date,
          dayOfMonth: nextD,
          isCurrentMonth: false,
          isHoliday: false,
          events: [],
          tradingDayOfMonth: 0
        });
      }
      nextD++;
    }

    setCalendarDays(days);
  };

  if (loading) {
    return (
      <div className="almanac-calendar loading">
        <div className="loading-spinner"></div>
        <p>Loading data...</p>
      </div>
    );
  }

  return (
    <div className="almanac-calendar">
      <div className="calendar-grid">
        <div className="calendar-header-row">
          {(typeof window !== 'undefined' && window.innerWidth <= 768 ? DAY_NAMES_SHORT : DAY_NAMES).map((d, i) => <div key={i} className="day-header">{d}</div>)}
        </div>

        <div className="calendar-days">
          {calendarDays.map((day, idx) => {
            const isBullish = day.stats && day.stats.winRate >= 55;
            const isBearish = day.stats && day.stats.winRate <= 45;

            return (
              <div
                key={idx}
                className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${day.isHoliday ? 'holiday' : ''} ${day.isCurrentMonth && !day.isHoliday && isBullish ? 'bullish-day' : ''} ${day.isCurrentMonth && !day.isHoliday && isBearish ? 'bearish-day' : ''}`}
              >
                <div className="day-number-row">
                  {day.isCurrentMonth && !day.isHoliday && day.stats && (isBullish || isBearish) && (
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
                      <div key={i} className="event">{ev}</div>
                    ))}
                  </div>
                )}

                {day.isCurrentMonth && !day.isHoliday && day.stats && (
                  <div className={`win-rate ${isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral'}`}>
                    {typeof window !== 'undefined' && window.innerWidth <= 768
                      ? `Up ${day.stats.upYears} of ${day.stats.totalYears} (${day.stats.winRate}%)`
                      : `${symbol} Up ${day.stats.upYears} of Last ${day.stats.totalYears} (${day.stats.winRate}%)`
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AlmanacCalendar;
