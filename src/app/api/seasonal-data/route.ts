import { NextRequest, NextResponse } from 'next/server';
import ElectionCycleService from '@/lib/electionCycleService';

interface PolygonDataPoint {
  v: number;
  vw: number;
  o: number;
  c: number;
  h: number;
  l: number;
  t: number;
  n: number;
}

// Direct Polygon API calls for server-side
async function fetchPolygonHistoricalData(symbol: string, from: string, to: string) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error('POLYGON_API_KEY not configured');
  
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${apiKey}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Polygon API error: ${response.status}`);
  }
  
  return response.json();
}

async function fetchPolygonTickerDetails(symbol: string) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error('POLYGON_API_KEY not configured');
  
  const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    return { results: { name: symbol } }; // Fallback
  }
  
  return response.json();
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const years = parseInt(searchParams.get('years') || '20');
    const electionMode = searchParams.get('electionMode');
    
    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    // If election mode is requested
    if (electionMode) {
      const electionService = new ElectionCycleService();
      const electionType = electionMode as 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election';
      const data = await electionService.analyzeElectionCycleSeasonality(symbol, electionType, 20);
      return NextResponse.json(data);
    }

    // Regular seasonal analysis
    const yearsToFetch = Math.min(years, 20);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - yearsToFetch);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Fetch data
    let historicalResponse, spyResponse, tickerDetails;
    
    if (symbol.toUpperCase() === 'SPY') {
      historicalResponse = await fetchPolygonHistoricalData(symbol, startDateStr, endDateStr);
      spyResponse = historicalResponse;
    } else {
      [historicalResponse, spyResponse] = await Promise.all([
        fetchPolygonHistoricalData(symbol, startDateStr, endDateStr),
        fetchPolygonHistoricalData('SPY', startDateStr, endDateStr)
      ]);
    }

    tickerDetails = await fetchPolygonTickerDetails(symbol);

    if (!historicalResponse || !historicalResponse.results) {
      return NextResponse.json({ error: 'No data available for this symbol' }, { status: 404 });
    }

    // Process into seasonal format
    const seasonalData = processDailySeasonalData(
      historicalResponse.results,
      spyResponse?.results || null,
      symbol,
      tickerDetails?.results?.name || symbol,
      yearsToFetch
    );

    return NextResponse.json(seasonalData);
  } catch (error) {
    console.error('Seasonal data error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch seasonal data' },
      { status: 500 }
    );
  }
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function processDailySeasonalData(
  data: PolygonDataPoint[],
  spyData: PolygonDataPoint[] | null,
  symbol: string,
  companyName: string,
  years: number
) {
  const dailyGroups: { [dayOfYear: number]: { date: Date; return: number; year: number }[] } = {};
  const yearlyReturns: { [year: number]: number } = {};
  
  const spyLookup: { [timestamp: number]: PolygonDataPoint } = {};
  if (spyData) {
    spyData.forEach(item => {
      spyLookup[item.t] = item;
    });
  }

  // Process historical data
  for (let i = 1; i < data.length; i++) {
    const currentItem = data[i];
    const previousItem = data[i - 1];
    const date = new Date(currentItem.t);
    const year = date.getFullYear();
    const dayOfYear = getDayOfYear(date);
    
    const stockReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100;
    let finalReturn = stockReturn;
    
    if (spyData && spyData.length > 0 && symbol.toUpperCase() !== 'SPY') {
      const currentSpy = spyLookup[currentItem.t];
      const previousSpy = spyLookup[previousItem.t];
      
      if (currentSpy && previousSpy) {
        const spyReturn = ((currentSpy.c - previousSpy.c) / previousSpy.c) * 100;
        finalReturn = stockReturn - spyReturn;
      } else {
        continue;
      }
    }
    
    if (!dailyGroups[dayOfYear]) {
      dailyGroups[dayOfYear] = [];
    }
    
    dailyGroups[dayOfYear].push({ date, return: finalReturn, year });
    
    if (!yearlyReturns[year]) {
      yearlyReturns[year] = 0;
    }
    yearlyReturns[year] += finalReturn;
  }

  // Calculate daily data
  const dailyData = [];
  let cumulativeReturn = 0;
  
  for (let dayOfYear = 1; dayOfYear <= 365; dayOfYear++) {
    const dayData = dailyGroups[dayOfYear] || [];
    if (dayData.length === 0) continue;
    
    const returns = dayData.map(d => d.return);
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const positiveReturns = returns.filter(ret => ret > 0).length;
    
    cumulativeReturn += avgReturn;
    
    const representativeDate = new Date(2024, 0, dayOfYear);
    const yearlyReturnsByDay: { [year: number]: number } = {};
    dayData.forEach(d => {
      yearlyReturnsByDay[d.year] = d.return;
    });
    
    dailyData.push({
      dayOfYear,
      month: representativeDate.getMonth() + 1,
      day: representativeDate.getDate(),
      monthName: representativeDate.toLocaleDateString('en-US', { month: 'short' }),
      avgReturn,
      cumulativeReturn,
      occurrences: dayData.length,
      positiveYears: positiveReturns,
      winningTrades: positiveReturns,
      pattern: (positiveReturns / dayData.length) * 100,
      yearlyReturns: yearlyReturnsByDay
    });
  }

  // Calculate monthly returns (for comparison)
  const monthlyReturns: { [monthYear: string]: { ticker: number[], spy: number[] } } = {};
  
  for (let i = 1; i < data.length; i++) {
    const currentItem = data[i];
    const previousItem = data[i - 1];
    const date = new Date(currentItem.t);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthYear = `${year}-${month}`;
    
    const currentSpy = spyLookup[currentItem.t];
    const previousSpy = spyLookup[previousItem.t];
    
    if (currentSpy && previousSpy) {
      if (!monthlyReturns[monthYear]) {
        monthlyReturns[monthYear] = { ticker: [], spy: [] };
      }
      
      const tickerReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100;
      const spyReturn = ((currentSpy.c - previousSpy.c) / previousSpy.c) * 100;
      
      monthlyReturns[monthYear].ticker.push(tickerReturn);
      monthlyReturns[monthYear].spy.push(spyReturn);
    }
  }

  // Aggregate monthly performance
  const monthlyAggregates: { [month: number]: { outperformance: number[], count: number } } = {};
  
  Object.keys(monthlyReturns).forEach(monthYear => {
    const [year, month] = monthYear.split('-').map(Number);
    const monthData = monthlyReturns[monthYear];
    
    const tickerMonthReturn = monthData.ticker.reduce((a, b) => a + b, 0);
    const spyMonthReturn = monthData.spy.reduce((a, b) => a + b, 0);
    const outperformance = tickerMonthReturn - spyMonthReturn;
    
    if (!monthlyAggregates[month]) {
      monthlyAggregates[month] = { outperformance: [], count: 0 };
    }
    
    monthlyAggregates[month].outperformance.push(outperformance);
    monthlyAggregates[month].count++;
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyData = monthNames.map((name, idx) => {
    const month = idx + 1;
    const data = monthlyAggregates[month];
    const avgOutperformance = data ? data.outperformance.reduce((a, b) => a + b, 0) / data.count : 0;
    return { month: name, outperformance: avgOutperformance };
  });

  const sortedMonths = [...monthlyData].sort((a, b) => b.outperformance - a.outperformance);
  const bestMonths = sortedMonths.slice(0, 3);
  const worstMonths = sortedMonths.slice(-3).reverse();

  // Calculate 30-day periods
  const best30Day = find30DayPeriods(dailyData, 'best');
  const worst30Day = find30DayPeriods(dailyData, 'worst');

  // Statistics
  const allReturns = Object.values(yearlyReturns);
  const totalReturn = cumulativeReturn;
  const annualizedReturn = totalReturn / years;
  const averageReturn = allReturns.reduce((sum, ret) => sum + ret, 0) / allReturns.length;
  const winningYears = allReturns.filter(ret => ret > 0).length;
  const totalTrades = allReturns.length;
  const winRate = (winningYears / totalTrades) * 100;
  const positiveReturns = allReturns.filter(ret => ret > 0);
  const negativeReturns = allReturns.filter(ret => ret < 0);
  
  return {
    symbol,
    companyName,
    currency: 'USD',
    period: `${years}Y`,
    dailyData,
    yearsOfData: years,
    statistics: {
      totalReturn,
      annualizedReturn,
      averageReturn,
      medianReturn: allReturns.sort((a, b) => a - b)[Math.floor(allReturns.length / 2)],
      winningTrades: winningYears,
      totalTrades,
      winRate,
      profit: positiveReturns.reduce((sum, ret) => sum + ret, 0),
      averageProfit: positiveReturns.length > 0 ? positiveReturns.reduce((sum, ret) => sum + ret, 0) / positiveReturns.length : 0,
      maxProfit: Math.max(...positiveReturns, 0),
      gains: positiveReturns.length,
      losses: negativeReturns.length,
      profitPercentage: (positiveReturns.length / totalTrades) * 100,
      lossPercentage: (negativeReturns.length / totalTrades) * 100,
      yearsOfData: years,
      volatility: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      avgWin: positiveReturns.length > 0 ? positiveReturns.reduce((sum, ret) => sum + ret, 0) / positiveReturns.length : 0,
      avgLoss: negativeReturns.length > 0 ? negativeReturns.reduce((sum, ret) => sum + ret, 0) / negativeReturns.length : 0,
      bestTrade: Math.max(...allReturns),
      worstTrade: Math.min(...allReturns)
    },
    patternReturns: yearlyReturns,
    spyComparison: {
      bestMonths,
      worstMonths,
      bestQuarters: [],
      worstQuarters: [],
      monthlyData,
      best30DayPeriod: best30Day,
      worst30DayPeriod: worst30Day
    }
  };
}

function find30DayPeriods(dailyData: any[], type: 'best' | 'worst') {
  let extremeReturn = type === 'best' ? -Infinity : Infinity;
  let extremePeriod = null;
  const windowSize = 30;
  
  for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
    const endDay = startDay + windowSize - 1;
    const windowData = dailyData.filter((d: any) => d.dayOfYear >= startDay && d.dayOfYear <= endDay);
    
    if (windowData.length >= 25) {
      const windowReturn = windowData.reduce((sum: number, day: any) => sum + day.avgReturn, 0);
      
      if ((type === 'best' && windowReturn > extremeReturn) || 
          (type === 'worst' && windowReturn < extremeReturn)) {
        extremeReturn = windowReturn;
        const startDataPoint = dailyData.find((d: any) => d.dayOfYear === startDay);
        const endDataPoint = dailyData.find((d: any) => d.dayOfYear === endDay);
        
        if (startDataPoint && endDataPoint) {
          extremePeriod = {
            return: windowReturn,
            period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day}`,
            startDate: `${startDataPoint.monthName} ${startDataPoint.day}`,
            endDate: `${endDataPoint.monthName} ${endDataPoint.day}`
          };
        }
      }
    }
  }
  
  return extremePeriod;
}
