import { NextRequest, NextResponse } from 'next/server';

// Economic Calendar - Based on BLS/Fed published schedules
// These are deterministic events that can be calculated

interface EconomicEvent {
  name: string;
  getDate: (year: number, month: number) => number | null; // Returns day of month or null
}

// Helper: Get nth weekday of month (e.g., 1st Friday, 2nd Wednesday)
function getNthWeekday(year: number, month: number, weekday: number, n: number): number {
  const firstDay = new Date(year, month, 1);
  let dayOfWeek = firstDay.getDay();
  let diff = weekday - dayOfWeek;
  if (diff < 0) diff += 7;
  return 1 + diff + (n - 1) * 7;
}

// Helper: Get last weekday of month
function getLastWeekday(year: number, month: number, weekday: number): number {
  const lastDay = new Date(year, month + 1, 0);
  let dayOfWeek = lastDay.getDay();
  let diff = dayOfWeek - weekday;
  if (diff < 0) diff += 7;
  return lastDay.getDate() - diff;
}

// 2025 FOMC Meeting Dates (actual Fed schedule)
const FOMC_DATES_2025 = [
  { month: 0, days: [28, 29] },      // Jan 28-29
  { month: 2, days: [18, 19] },      // Mar 18-19
  { month: 4, days: [6, 7] },        // May 6-7
  { month: 5, days: [17, 18] },      // Jun 17-18
  { month: 6, days: [29, 30] },      // Jul 29-30
  { month: 8, days: [16, 17] },      // Sep 16-17
  { month: 10, days: [4, 5] },       // Nov 4-5
  { month: 11, days: [16, 17] },     // Dec 16-17
];

// Economic events with their typical schedule
const ECONOMIC_EVENTS: EconomicEvent[] = [
  {
    name: 'Jobs Report',
    getDate: (year, month) => getNthWeekday(year, month, 5, 1) // 1st Friday
  },
  {
    name: 'CPI',
    getDate: (year, month) => {
      // CPI typically releases 2nd week, around 10th-15th
      // Usually Wednesday of 2nd full week
      const secondWed = getNthWeekday(year, month, 3, 2);
      return secondWed >= 10 && secondWed <= 15 ? secondWed : getNthWeekday(year, month, 3, 2);
    }
  },
  {
    name: 'PPI',
    getDate: (year, month) => {
      // PPI usually 1-2 days before or after CPI
      const secondThu = getNthWeekday(year, month, 4, 2);
      return secondThu;
    }
  },
  {
    name: 'Retail Sales',
    getDate: (year, month) => {
      // Usually mid-month, around 15th-17th
      return getNthWeekday(year, month, 2, 3); // 3rd Tuesday
    }
  },
  {
    name: 'Industrial Production',
    getDate: (year, month) => {
      // Usually mid-month
      return getNthWeekday(year, month, 2, 3); // 3rd Tuesday (often same as retail)
    }
  },
  {
    name: 'Housing Starts',
    getDate: (year, month) => {
      // Usually 3rd week
      return getNthWeekday(year, month, 3, 3); // 3rd Wednesday
    }
  },
  {
    name: 'Durable Goods',
    getDate: (year, month) => {
      // Usually 4th week
      return getNthWeekday(year, month, 3, 4); // 4th Wednesday
    }
  },
  {
    name: 'Consumer Sentiment',
    getDate: (year, month) => {
      // Preliminary mid-month, final end of month
      return getLastWeekday(year, month, 5); // Last Friday
    }
  },
  {
    name: 'GDP',
    getDate: (year, month) => {
      // GDP releases end of month following quarter (Jan, Apr, Jul, Oct for Q4, Q1, Q2, Q3)
      if (month === 0 || month === 3 || month === 6 || month === 9) {
        return getLastWeekday(year, month, 4); // Last Thursday
      }
      return null;
    }
  },
  {
    name: 'Personal Income',
    getDate: (year, month) => {
      // Usually last week of month
      return getLastWeekday(year, month, 5) - 7; // Friday before last Friday
    }
  },
  {
    name: 'Trade Balance',
    getDate: (year, month) => {
      // Usually first week
      return getNthWeekday(year, month, 3, 1); // 1st Wednesday
    }
  }
];

// Get Jobless Claims dates (every Thursday)
function getJoblessClaimsDates(year: number, month: number): number[] {
  const dates: number[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (date.getDay() === 4) { // Thursday
      dates.push(day);
    }
  }
  return dates;
}

// Get FOMC dates for a specific month
function getFOMCDates(year: number, month: number): number[] {
  if (year !== 2025) return [];
  const meeting = FOMC_DATES_2025.find(m => m.month === month);
  return meeting ? meeting.days : [];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'Missing start or end date parameters' },
      { status: 400 }
    );
  }

  try {
    const start = new Date(startDate);
    const year = start.getFullYear();
    const month = start.getMonth();
    
    const releases: { release_id: number; release_name: string; date: string }[] = [];
    
    // Add regular economic events
    ECONOMIC_EVENTS.forEach((event, idx) => {
      const day = event.getDate(year, month);
      if (day && day >= 1 && day <= 31) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        releases.push({
          release_id: idx + 1,
          release_name: event.name,
          date: dateStr
        });
      }
    });
    
    // Add Jobless Claims (every Thursday)
    const joblessClaimsDates = getJoblessClaimsDates(year, month);
    joblessClaimsDates.forEach(day => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      releases.push({
        release_id: 100,
        release_name: 'Jobless Claims',
        date: dateStr
      });
    });
    
    // Add FOMC dates
    const fomcDates = getFOMCDates(year, month);
    fomcDates.forEach(day => {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      releases.push({
        release_id: 101,
        release_name: 'FOMC Meeting',
        date: dateStr
      });
    });

    return NextResponse.json({ releases });
  } catch (error) {
    console.error('Error generating economic calendar:', error);
    return NextResponse.json(
      { error: 'Failed to generate economic calendar', releases: [] },
      { status: 500 }
    );
  }
}
