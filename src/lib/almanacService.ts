// Stock Trader's Almanac Service
// Fetches real historical data and calculates seasonal patterns
// Uses Polygon.io API for real market data and FRED API for economic releases

import PolygonService from './polygonService';
import { getMonthlyEconomicReleases, EconomicRelease } from './fredService';

const polygonService = new PolygonService();
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export interface DailySeasonalPoint {
  tradingDay: number;
  date: string;
  avgReturn: number;
  cumulativeReturn: number;
  postElectionReturn: number;
  postElectionCumulative: number;
  // Multi-period data
  cumulativeReturn10Y: number;
  cumulativeReturn15Y: number;
  postElectionCumulative10Y: number;
  postElectionCumulative15Y: number;
}

export interface IndexSeasonalData {
  symbol: string;
  name: string;
  color: string;
  dashColor: string;
  dailyData: DailySeasonalPoint[];
}

export interface MonthlyVitalStats {
  symbol: string;
  name: string;
  rank: number;
  upYears: number;
  downYears: number;
  winRate: number;
  avgChange: number;
  bestYear: { year: number; change: number };
  worstYear: { year: number; change: number };
  postElectionRank: number;
  postElectionAvg: number;
}

export interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isBullish: boolean | null;
  isBearish: boolean | null;
  winRate: number;
  avgReturn: number;
  events: string[];
  economicReleases: string[]; // Real data from FRED API
  specialNotes: string[];
  isMarketClosed: boolean;
  isWeekend: boolean;
  holidayName?: string;
}

export interface MarketGlanceData {
  asOfDate: string;
  indices: {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
  }[];
  seasonal: {
    outlook: 'Bullish' | 'Bearish' | 'Neutral';
    winRate: number;
    avgReturn: number;
  };
}

// Cache for market holidays from Polygon API
let marketHolidaysCache: { data: MarketHoliday[]; expiry: number } | null = null;

interface MarketHoliday {
  date: string;
  name: string;
  exchange: string;
  status: 'closed' | 'early-close';
  open?: string;
  close?: string;
}

// Fetch real market holidays from Polygon API
async function fetchMarketHolidays(): Promise<MarketHoliday[]> {
  // Check cache (valid for 24 hours)
  if (marketHolidaysCache && marketHolidaysCache.expiry > Date.now()) {
    return marketHolidaysCache.data;
  }
  
  try {
    const response = await fetch(
      `https://api.polygon.io/v1/marketstatus/upcoming?apikey=${POLYGON_API_KEY}`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      }
    );
    
    if (!response.ok) {
      console.warn('Failed to fetch market holidays from Polygon');
      return [];
    }
    
    const holidays: MarketHoliday[] = await response.json();
    
    // Filter to only NYSE holidays (most relevant for stocks)
    const nyseHolidays = holidays.filter(h => h.exchange === 'NYSE');
    
    // Cache for 24 hours
    marketHolidaysCache = {
      data: nyseHolidays,
      expiry: Date.now() + 24 * 60 * 60 * 1000
    };
    
    return nyseHolidays;
  } catch (error) {
    console.error('Error fetching market holidays:', error);
    return [];
  }
}

// Check if a date is a market holiday using real Polygon data
async function isMarketHolidayAsync(date: Date): Promise<{ isClosed: boolean; holidayName?: string }> {
  const holidays = await fetchMarketHolidays();
  const dateStr = date.toISOString().split('T')[0];
  
  const holiday = holidays.find(h => h.date === dateStr);
  
  if (holiday) {
    return {
      isClosed: holiday.status === 'closed',
      holidayName: holiday.name
    };
  }
  
  return { isClosed: false };
}

// Post-election years for filtering
const POST_ELECTION_YEARS = [1953, 1957, 1961, 1965, 1969, 1973, 1977, 1981, 1985, 1989, 1993, 1997, 2001, 2005, 2009, 2013, 2017, 2021, 2025];

// Index configurations
const INDICES = [
  { symbol: 'DIA', name: 'DJIA', color: '#000000', dashColor: '#000000' },
  { symbol: 'SPY', name: 'S&P 500', color: '#00C853', dashColor: '#00C853' },
  { symbol: 'QQQ', name: 'NASDAQ', color: '#2196F3', dashColor: '#2196F3' },
  { symbol: 'IWM', name: 'Russell 2000', color: '#FF5722', dashColor: '#FF5722' },
];

// Special market dates generator
function getSpecialDates(year: number, month: number): Map<number, string[]> {
  const specialDates = new Map<number, string[]>();
  
  // Calculate special dates for the month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  // Santa Claus Rally (starts Dec 24, ends Jan 5)
  if (month === 11) { // December
    specialDates.set(24, ['Watch for the Santa Claus Rally to Begin on December 24']);
  }
  
  // Triple/Quad Witching (third Friday of March, June, September, December)
  if ([2, 5, 8, 11].includes(month)) {
    const thirdFriday = getThirdFriday(year, month);
    const existingNotes = specialDates.get(thirdFriday) || [];
    existingNotes.push('Quad Witching Day');
    specialDates.set(thirdFriday, existingNotes);
  }
  
  // Options Expiration (third Friday of each month)
  const thirdFriday = getThirdFriday(year, month);
  const existingNotes = specialDates.get(thirdFriday) || [];
  if (!existingNotes.some(n => n.includes('Witching'))) {
    existingNotes.push('Options Expiration');
  }
  specialDates.set(thirdFriday, existingNotes);
  
  // Small Cap Strength period (mid-December)
  if (month === 11) {
    for (let d = 10; d <= 15; d++) {
      const date = new Date(year, month, d);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        const notes = specialDates.get(d) || [];
        notes.push('Small Cap Strength Starts in Mid-December');
        specialDates.set(d, notes);
        break;
      }
    }
  }
  
  return specialDates;
}

function getThirdFriday(year: number, month: number): number {
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay();
  const firstFriday = dayOfWeek <= 5 ? (5 - dayOfWeek + 1) : (12 - dayOfWeek + 1);
  return firstFriday + 14;
}

// Market holidays
function isMarketHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  
  // Fixed holidays
  // New Year's Day (Jan 1)
  if (month === 0 && day === 1) return true;
  
  // Christmas (Dec 25)
  if (month === 11 && day === 25) return true;
  
  // Independence Day (Jul 4)
  if (month === 6 && day === 4) return true;
  
  // Variable holidays
  // MLK Day (third Monday of January)
  if (month === 0 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
  
  // Presidents Day (third Monday of February)
  if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
  
  // Memorial Day (last Monday of May)
  if (month === 4 && dayOfWeek === 1 && day >= 25) return true;
  
  // Juneteenth (June 19)
  if (month === 5 && day === 19) return true;
  
  // Labor Day (first Monday of September)
  if (month === 8 && dayOfWeek === 1 && day <= 7) return true;
  
  // Thanksgiving (fourth Thursday of November)
  if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;
  
  return false;
}

// Historical daily returns cache
const dailyReturnsCache = new Map<string, number[][]>();

export class AlmanacService {
  
  // Fetch real historical data and calculate daily seasonal patterns for a specific month
  async getMonthlySeasonalData(month: number, yearsBack: number = 25): Promise<IndexSeasonalData[]> {
    const results: IndexSeasonalData[] = [];
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - yearsBack;
    
    for (const index of INDICES) {
      try {
        const dailyData = await this.calculateDailySeasonalPattern(index.symbol, month, startYear, currentYear);
        
        results.push({
          symbol: index.symbol,
          name: index.name,
          color: index.color,
          dashColor: index.dashColor,
          dailyData
        });
      } catch (error) {
        console.error(`Error fetching data for ${index.symbol}:`, error);
      }
    }
    
    return results;
  }
  
  async getSingleStockMonthlyData(symbol: string, month: number, yearsBack: number = 25): Promise<IndexSeasonalData[]> {
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - yearsBack;
    
    try {
      const dailyData = await this.calculateDailySeasonalPattern(symbol, month, startYear, currentYear);
      
      return [{
        symbol: symbol,
        name: symbol,
        color: '#00C853',
        dashColor: '#00C853',
        dailyData
      }];
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      return [];
    }
  }
  
  private async calculateDailySeasonalPattern(
    symbol: string, 
    month: number, 
    startYear: number, 
    endYear: number
  ): Promise<DailySeasonalPoint[]> {
    const monthlyReturns: { 
      [tradingDay: number]: { 
        all: number[], 
        postElection: number[],
        last10Y: number[],
        last15Y: number[],
        postElection10Y: number[],
        postElection15Y: number[]
      } 
    } = {};
    
    // Initialize trading days (max ~23 trading days in a month)
    for (let i = 1; i <= 23; i++) {
      monthlyReturns[i] = { 
        all: [], 
        postElection: [],
        last10Y: [],
        last15Y: [],
        postElection10Y: [],
        postElection15Y: []
      };
    }
    
    // Fetch historical data for the symbol
    const startDate = `${startYear}-01-01`;
    const endDate = `${endYear}-12-31`;
    
    try {
      const response = await polygonService.getHistoricalData(symbol, startDate, endDate, 'day', 1);
      
      if (!response?.results || response.results.length === 0) {
        console.warn(`No data returned for ${symbol}`);
        return this.getEmptyDailyData();
      }
      
      // Group data by year and month
      const dataByYearMonth: { [key: string]: { t: number; c: number }[] } = {};
      
      for (const item of response.results) {
        const date = new Date(item.t);
        const itemMonth = date.getMonth();
        const itemYear = date.getFullYear();
        
        if (itemMonth === month) {
          const key = `${itemYear}-${month}`;
          if (!dataByYearMonth[key]) {
            dataByYearMonth[key] = [];
          }
          dataByYearMonth[key].push({ t: item.t, c: item.c });
        }
      }
      
      // Calculate cutoff years
      const cutoff10Y = endYear - 10;
      const cutoff15Y = endYear - 15;
      
      // Calculate daily returns for each year
      for (const key of Object.keys(dataByYearMonth)) {
        const yearData = dataByYearMonth[key].sort((a, b) => a.t - b.t);
        const year = parseInt(key.split('-')[0]);
        const isPostElection = POST_ELECTION_YEARS.includes(year);
        const isIn10Y = year >= cutoff10Y;
        const isIn15Y = year >= cutoff15Y;
        
        // Get the first price of the month for calculating cumulative
        if (yearData.length < 2) continue;
        
        const firstPrice = yearData[0].c;
        
        // Start from index 0 and map to trading days 1-23
        for (let i = 0; i < yearData.length && i < 23; i++) {
          const tradingDay = i + 1; // Trading day is 1-indexed
          const currentPrice = yearData[i].c;
          
          // Cumulative return from start of month
          const cumulativeReturn = ((currentPrice - firstPrice) / firstPrice) * 100;
          
          monthlyReturns[tradingDay].all.push(cumulativeReturn);
          
          if (isPostElection) {
            monthlyReturns[tradingDay].postElection.push(cumulativeReturn);
          }
          
          if (isIn10Y) {
            monthlyReturns[tradingDay].last10Y.push(cumulativeReturn);
            if (isPostElection) {
              monthlyReturns[tradingDay].postElection10Y.push(cumulativeReturn);
            }
          }
          
          if (isIn15Y) {
            monthlyReturns[tradingDay].last15Y.push(cumulativeReturn);
            if (isPostElection) {
              monthlyReturns[tradingDay].postElection15Y.push(cumulativeReturn);
            }
          }
        }
      }
      
      // Calculate averages
      const dailyData: DailySeasonalPoint[] = [];
      let prevAllCum = 0;
      let prevPostCum = 0;
      
      // Minimum sample size to ensure statistical reliability
      const MIN_SAMPLE_SIZE = 10;
      
      // Find the maximum trading day with sufficient data
      let maxTradingDay = 0;
      for (let day = 1; day <= 23; day++) {
        if (monthlyReturns[day].all.length >= MIN_SAMPLE_SIZE) {
          maxTradingDay = day;
        } else {
          break; // Stop at first day with insufficient data
        }
      }
      
      for (let tradingDay = 1; tradingDay <= maxTradingDay; tradingDay++) {
        const allReturns = monthlyReturns[tradingDay].all;
        const postElectionReturns = monthlyReturns[tradingDay].postElection;
        const last10YReturns = monthlyReturns[tradingDay].last10Y;
        const last15YReturns = monthlyReturns[tradingDay].last15Y;
        const postElection10YReturns = monthlyReturns[tradingDay].postElection10Y;
        const postElection15YReturns = monthlyReturns[tradingDay].postElection15Y;
        
        if (allReturns.length === 0) continue;
        
        const avgCumulative = allReturns.reduce((a, b) => a + b, 0) / allReturns.length;
        const avgReturn = avgCumulative - prevAllCum;
        
        const postElectionCumulative = postElectionReturns.length > 0 
          ? postElectionReturns.reduce((a, b) => a + b, 0) / postElectionReturns.length
          : avgCumulative;
        const postElectionReturn = postElectionCumulative - prevPostCum;
        
        // Calculate 10Y and 15Y averages
        const cumulative10Y = last10YReturns.length > 0
          ? last10YReturns.reduce((a, b) => a + b, 0) / last10YReturns.length
          : avgCumulative;
        
        const cumulative15Y = last15YReturns.length > 0
          ? last15YReturns.reduce((a, b) => a + b, 0) / last15YReturns.length
          : avgCumulative;
        
        const postElectionCumulative10Y = postElection10YReturns.length > 0
          ? postElection10YReturns.reduce((a, b) => a + b, 0) / postElection10YReturns.length
          : cumulative10Y;
        
        const postElectionCumulative15Y = postElection15YReturns.length > 0
          ? postElection15YReturns.reduce((a, b) => a + b, 0) / postElection15YReturns.length
          : cumulative15Y;
        
        // Get approximate date for this trading day
        const year = new Date().getFullYear();
        const approximateDate = this.getApproximateDateForTradingDay(year, month, tradingDay);
        
        dailyData.push({
          tradingDay,
          date: approximateDate,
          avgReturn,
          cumulativeReturn: avgCumulative,
          postElectionReturn,
          postElectionCumulative,
          cumulativeReturn10Y: cumulative10Y,
          cumulativeReturn15Y: cumulative15Y,
          postElectionCumulative10Y,
          postElectionCumulative15Y
        });
        
        prevAllCum = avgCumulative;
        prevPostCum = postElectionCumulative;
      }
      
      return dailyData;
      
    } catch (error) {
      console.error(`Error calculating seasonal pattern for ${symbol}:`, error);
      return this.getEmptyDailyData();
    }
  }
  
  private getApproximateDateForTradingDay(year: number, month: number, tradingDay: number): string {
    // Approximate the calendar date for a trading day
    let currentTradingDay = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay();
      
      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      currentTradingDay++;
      
      if (currentTradingDay === tradingDay) {
        return `${month + 1}/${day}`;
      }
    }
    
    return `${month + 1}/${tradingDay}`;
  }
  
  private getEmptyDailyData(): DailySeasonalPoint[] {
    return Array.from({ length: 22 }, (_, i) => ({
      tradingDay: i + 1,
      date: `${i + 1}`,
      avgReturn: 0,
      cumulativeReturn: 0,
      postElectionReturn: 0,
      postElectionCumulative: 0,
      cumulativeReturn10Y: 0,
      cumulativeReturn15Y: 0,
      postElectionCumulative10Y: 0,
      postElectionCumulative15Y: 0
    }));
  }
  
  // Get monthly vital statistics
  async getMonthlyVitalStats(month: number): Promise<MonthlyVitalStats[]> {
    const stats: MonthlyVitalStats[] = [];
    const currentYear = new Date().getFullYear();
    const yearsBack = 25;
    
    for (const index of INDICES) {
      try {
        const stat = await this.calculateMonthlyStats(index.symbol, index.name, month, currentYear - yearsBack, currentYear);
        stats.push(stat);
      } catch (error) {
        console.error(`Error calculating stats for ${index.symbol}:`, error);
      }
    }
    
    return stats;
  }
  
  private async calculateMonthlyStats(
    symbol: string, 
    name: string,
    month: number, 
    startYear: number, 
    endYear: number
  ): Promise<MonthlyVitalStats> {
    const monthlyReturns: { year: number; return: number; isPostElection: boolean }[] = [];
    
    const startDate = `${startYear}-01-01`;
    const endDate = `${endYear}-12-31`;
    
    try {
      const response = await polygonService.getHistoricalData(symbol, startDate, endDate, 'day', 1);
      
      if (!response?.results) {
        return this.getEmptyStats(symbol, name);
      }
      
      // Group by year and month, get first and last prices
      const dataByYearMonth: { [key: string]: { first: number; last: number } } = {};
      
      for (const item of response.results) {
        const date = new Date(item.t);
        const itemMonth = date.getMonth();
        const itemYear = date.getFullYear();
        
        if (itemMonth === month) {
          const key = `${itemYear}`;
          if (!dataByYearMonth[key]) {
            dataByYearMonth[key] = { first: item.c, last: item.c };
          } else {
            dataByYearMonth[key].last = item.c;
          }
        }
      }
      
      // Calculate returns for each year
      for (const yearStr of Object.keys(dataByYearMonth)) {
        const year = parseInt(yearStr);
        const data = dataByYearMonth[yearStr];
        const monthReturn = ((data.last - data.first) / data.first) * 100;
        
        monthlyReturns.push({
          year,
          return: monthReturn,
          isPostElection: POST_ELECTION_YEARS.includes(year)
        });
      }
      
      // Calculate statistics
      const allReturns = monthlyReturns.map(r => r.return);
      const postElectionReturns = monthlyReturns.filter(r => r.isPostElection).map(r => r.return);
      
      const upYears = allReturns.filter(r => r > 0).length;
      const downYears = allReturns.filter(r => r <= 0).length;
      const avgChange = allReturns.length > 0 ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0;
      
      const postElectionAvg = postElectionReturns.length > 0 
        ? postElectionReturns.reduce((a, b) => a + b, 0) / postElectionReturns.length 
        : avgChange;
      
      const bestYearData = monthlyReturns.reduce((best, curr) => curr.return > best.return ? curr : best, { year: 0, return: -Infinity });
      const worstYearData = monthlyReturns.reduce((worst, curr) => curr.return < worst.return ? curr : worst, { year: 0, return: Infinity });
      
      return {
        symbol,
        name,
        rank: 0, // Will be calculated after all stats are gathered
        upYears,
        downYears,
        winRate: allReturns.length > 0 ? (upYears / allReturns.length) * 100 : 0,
        avgChange,
        bestYear: { year: bestYearData.year, change: bestYearData.return },
        worstYear: { year: worstYearData.year, change: worstYearData.return },
        postElectionRank: 0,
        postElectionAvg
      };
      
    } catch (error) {
      console.error(`Error calculating monthly stats for ${symbol}:`, error);
      return this.getEmptyStats(symbol, name);
    }
  }
  
  private getEmptyStats(symbol: string, name: string): MonthlyVitalStats {
    return {
      symbol,
      name,
      rank: 0,
      upYears: 0,
      downYears: 0,
      winRate: 0,
      avgChange: 0,
      bestYear: { year: 0, change: 0 },
      worstYear: { year: 0, change: 0 },
      postElectionRank: 0,
      postElectionAvg: 0
    };
  }
  
  // Generate calendar data for a specific month (WEEKDAYS ONLY - 5-day grid)
  async getMonthlyCalendar(year: number, month: number): Promise<{
    days: CalendarDay[];
    monthStats: { avgReturn: number; rank: number };
  }> {
    const days: CalendarDay[] = [];
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    
    // Get special dates for this month
    const specialDates = getSpecialDates(year, month);
    
    // Calculate historical daily performance
    const dailyStats = await this.getDailyHistoricalStats(month);
    
    // Fetch real market holidays from Polygon
    const holidays = await fetchMarketHolidays();
    
    // Fetch real economic releases from FRED API
    const economicReleasesByDay = await getMonthlyEconomicReleases(year, month);
    
    // JavaScript getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    // We want weekday position: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4
    const firstDayJS = firstDayOfMonth.getDay();
    
    // Calculate which weekday column the 1st falls on (Mon=0, Tue=1, etc)
    // If Sunday (0), week starts on Monday so no empty cells needed at start
    // If Saturday (6), week starts on Monday so no empty cells needed at start
    // Otherwise, subtract 1 from JS day (Mon=1 becomes 0, Tue=2 becomes 1, etc)
    let startColumn = 0;
    if (firstDayJS >= 1 && firstDayJS <= 5) {
      startColumn = firstDayJS - 1; // Mon(1)->0, Tue(2)->1, Wed(3)->2, Thu(4)->3, Fri(5)->4
    }
    // If Saturday(6) or Sunday(0), the first weekday will be the next Monday, so startColumn=0
    
    // Fill in empty cells at the start from previous month (if needed)
    for (let i = 0; i < startColumn; i++) {
      // Find the correct previous month date for this cell
      // Go backwards from the last weekday before the 1st
      const daysBack = startColumn - i;
      let prevDate = new Date(year, month, 1);
      prevDate.setDate(prevDate.getDate() - daysBack);
      
      // Make sure we land on a weekday
      while (prevDate.getDay() === 0 || prevDate.getDay() === 6) {
        prevDate.setDate(prevDate.getDate() - 1);
      }
      
      days.push({
        date: prevDate,
        day: prevDate.getDate(),
        isCurrentMonth: false,
        isBullish: null,
        isBearish: null,
        winRate: 0,
        avgReturn: 0,
        events: [],
        economicReleases: [],
        specialNotes: [],
        isMarketClosed: true,
        isWeekend: false
      });
    }
    
    // Current month days (WEEKDAYS ONLY)
    let tradingDayCount = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay();
      
      // Skip weekends entirely
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      // Check for real holidays from Polygon API
      const dateStr = date.toISOString().split('T')[0];
      const holiday = holidays.find(h => h.date === dateStr);
      const isHoliday = holiday?.status === 'closed';
      const holidayName = holiday?.name;
      
      const isMarketClosed = isHoliday;
      
      if (!isMarketClosed) {
        tradingDayCount++;
      }
      
      // Get special notes (Options Expiration, Quad Witching, etc.)
      const specialNotes = specialDates.get(day) || [];
      
      // Add holiday name to special notes if it's a holiday
      if (holidayName && isHoliday) {
        specialNotes.push(`Market Closed: ${holidayName}`);
      } else if (holiday?.status === 'early-close') {
        specialNotes.push(`Early Close: ${holidayName}`);
      }
      
      // Get REAL economic releases from FRED API for this day
      const dayReleases = economicReleasesByDay.get(day) || [];
      const economicReleases = dayReleases.map(r => r.releaseName);
      
      // Get historical stats for this trading day
      const stats = !isMarketClosed && dailyStats[tradingDayCount] 
        ? dailyStats[tradingDayCount] 
        : { winRate: 50, avgReturn: 0 };
      
      days.push({
        date,
        day,
        isCurrentMonth: true,
        isBullish: !isMarketClosed && stats.winRate >= 60,
        isBearish: !isMarketClosed && stats.winRate <= 40,
        winRate: stats.winRate,
        avgReturn: stats.avgReturn,
        events: [],
        economicReleases,
        specialNotes,
        isMarketClosed,
        isWeekend: false,
        holidayName: isHoliday ? holidayName : undefined
      });
    }
    
    // Fill remaining cells to complete the last row (if needed)
    const remainder = days.length % 5;
    if (remainder !== 0) {
      const cellsToAdd = 5 - remainder;
      let nextDay = 1;
      let added = 0;
      
      while (added < cellsToAdd) {
        const nextDate = new Date(year, month + 1, nextDay);
        const dow = nextDate.getDay();
        
        if (dow !== 0 && dow !== 6) {
          days.push({
            date: nextDate,
            day: nextDay,
            isCurrentMonth: false,
            isBullish: null,
            isBearish: null,
            winRate: 0,
            avgReturn: 0,
            events: [],
            specialNotes: [],
            isMarketClosed: true,
            isWeekend: false,
            economicReleases: []
          });
          added++;
        }
        nextDay++;
      }
    }
    
    // Calculate actual month stats from the daily stats
    const avgMonthReturn = Object.values(dailyStats).reduce((sum, s) => sum + s.avgReturn, 0);
    
    return {
      days,
      monthStats: {
        avgReturn: avgMonthReturn,
        rank: 0 // Rank not calculated here
      }
    };
  }
  
  private async getDailyHistoricalStats(month: number): Promise<{ [tradingDay: number]: { winRate: number; avgReturn: number } }> {
    const stats: { [tradingDay: number]: { winRate: number; avgReturn: number } } = {};
    
    try {
      // Use SPY as the benchmark for daily stats
      const currentYear = new Date().getFullYear();
      const startDate = `${currentYear - 21}-01-01`;
      const endDate = `${currentYear}-12-31`;
      
      const response = await polygonService.getHistoricalData('SPY', startDate, endDate, 'day', 1);
      
      if (!response?.results) return stats;
      
      // Group data by year and month
      const dailyReturns: { [tradingDay: number]: number[] } = {};
      
      const dataByYearMonth: { [key: string]: { t: number; c: number }[] } = {};
      
      for (const item of response.results) {
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
      
      // Calculate daily returns
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
      for (const tradingDay of Object.keys(dailyReturns)) {
        const returns = dailyReturns[parseInt(tradingDay)];
        const upDays = returns.filter(r => r > 0).length;
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        
        stats[parseInt(tradingDay)] = {
          winRate: (upDays / returns.length) * 100,
          avgReturn
        };
      }
      
    } catch (error) {
      console.error('Error calculating daily historical stats:', error);
    }
    
    return stats;
  }
  
  // Get Market at a Glance data - using REAL data from Polygon API
  async getMarketAtAGlance(): Promise<MarketGlanceData> {
    const today = new Date();
    const indices = [
      { symbol: 'DIA', name: 'Dow' },
      { symbol: 'SPY', name: 'S&P' },
      { symbol: 'QQQ', name: 'NASDAQ' },
      { symbol: 'IWM', name: 'Russell 2K' },
    ];
    
    const indexData: MarketGlanceData['indices'] = [];
    
    for (const index of indices) {
      try {
        // Use getRealtimeQuote for current prices
        const quote = await polygonService.getRealtimeQuote(index.symbol);
        if (quote) {
          indexData.push({
            symbol: index.symbol,
            name: index.name,
            price: quote.price || quote.lastTrade || 0,
            change: quote.change || 0,
            changePercent: quote.changePercent || 0
          });
        } else {
          // Fallback: try to get from historical data
          const endDate = today.toISOString().split('T')[0];
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 5);
          const historical = await polygonService.getHistoricalData(
            index.symbol, 
            startDate.toISOString().split('T')[0], 
            endDate
          );
          
          if (historical?.results && historical.results.length > 0) {
            const latest = historical.results[historical.results.length - 1];
            const previous = historical.results.length > 1 
              ? historical.results[historical.results.length - 2] 
              : latest;
            
            indexData.push({
              symbol: index.symbol,
              name: index.name,
              price: latest.c,
              change: latest.c - previous.c,
              changePercent: ((latest.c - previous.c) / previous.c) * 100
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching quote for ${index.symbol}:`, error);
      }
    }
    
    // Calculate seasonal outlook from REAL historical data for current month
    const month = today.getMonth();
    const seasonalData = await this.calculateMonthlySeasonalStats(month);
    
    return {
      asOfDate: today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      indices: indexData,
      seasonal: {
        outlook: seasonalData.winRate >= 60 ? 'Bullish' : seasonalData.winRate <= 40 ? 'Bearish' : 'Neutral',
        winRate: seasonalData.winRate,
        avgReturn: seasonalData.avgReturn
      }
    };
  }
  
  // Calculate actual seasonal stats for a month from real historical data
  private async calculateMonthlySeasonalStats(month: number): Promise<{ winRate: number; avgReturn: number }> {
    try {
      const currentYear = new Date().getFullYear();
      const startDate = `${currentYear - 21}-01-01`;
      const endDate = `${currentYear}-12-31`;
      
      const response = await polygonService.getHistoricalData('SPY', startDate, endDate, 'day', 1);
      
      if (!response?.results || response.results.length === 0) {
        return { winRate: 50, avgReturn: 0 };
      }
      
      // Group by year and calculate monthly returns
      const monthlyReturns: number[] = [];
      const dataByYear: { [year: number]: { t: number; c: number }[] } = {};
      
      for (const item of response.results) {
        const date = new Date(item.t);
        const itemMonth = date.getMonth();
        const itemYear = date.getFullYear();
        
        if (itemMonth === month) {
          if (!dataByYear[itemYear]) {
            dataByYear[itemYear] = [];
          }
          dataByYear[itemYear].push({ t: item.t, c: item.c });
        }
      }
      
      // Calculate monthly return for each year
      for (const year of Object.keys(dataByYear)) {
        const yearData = dataByYear[parseInt(year)].sort((a, b) => a.t - b.t);
        if (yearData.length >= 2) {
          const firstPrice = yearData[0].c;
          const lastPrice = yearData[yearData.length - 1].c;
          const monthReturn = ((lastPrice - firstPrice) / firstPrice) * 100;
          monthlyReturns.push(monthReturn);
        }
      }
      
      if (monthlyReturns.length === 0) {
        return { winRate: 50, avgReturn: 0 };
      }
      
      const upMonths = monthlyReturns.filter(r => r > 0).length;
      const avgReturn = monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
      const winRate = (upMonths / monthlyReturns.length) * 100;
      
      return { winRate, avgReturn };
    } catch (error) {
      console.error('Error calculating monthly seasonal stats:', error);
      return { winRate: 50, avgReturn: 0 };
    }
  }
}

export default AlmanacService;
