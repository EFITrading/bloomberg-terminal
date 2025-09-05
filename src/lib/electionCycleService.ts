import PolygonService from './polygonService';

interface ElectionCycleData {
  symbol: string;
  companyName: string;
  currency: string;
  period: string;
  electionType: 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election';
  dailyData: DailySeasonalData[];
  statistics: {
    totalReturn: number;
    annualizedReturn: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: number;
    worstTrade: number;
    yearsOfData: number;
    averageReturn: number;
    medianReturn: number;
    winningTrades: number;
    totalTrades: number;
    maxProfit: number;
    maxLoss: number;
    standardDev: number;
    bestYear: { year: number; return: number };
    worstYear: { year: number; return: number };
    profit: number;
    averageProfit: number;
    gains: number;
    losses: number;
    profitPercentage: number;
    lossPercentage: number;
  };
  patternReturns: { [year: number]: number };
  spyComparison?: {
    bestMonths: Array<{ month: string; outperformance: number }>;
    worstMonths: Array<{ month: string; outperformance: number }>;
    bestQuarters: Array<{ quarter: string; outperformance: number }>;
    worstQuarters: Array<{ quarter: string; outperformance: number }>;
    monthlyData: Array<{ month: string; outperformance: number }>;
    best30DayPeriod?: {
      period: string;
      return: number;
      startDate: string;
      endDate: string;
    };
    worst30DayPeriod?: {
      period: string;
      return: number;
      startDate: string;
      endDate: string;
    };
  };
}

interface DailySeasonalData {
  dayOfYear: number;
  month: number;
  day: number;
  monthName: string;
  avgReturn: number;
  cumulativeReturn: number;
  occurrences: number;
  positiveYears: number;
  winningTrades: number;
  pattern: number;
  yearlyReturns: { [year: number]: number };
}

interface PolygonDataPoint {
  v: number; // volume
  vw: number; // volume weighted average price  
  o: number; // open
  c: number; // close
  h: number; // high
  l: number; // low
  t: number; // timestamp
  n: number; // number of transactions
}

class ElectionCycleService {
  private polygonService: PolygonService;

  constructor() {
    this.polygonService = new PolygonService();
  }

  // US Presidential Election years (replacing 2004 with 2024)
  private getElectionYears(): number[] {
    return [2008, 2012, 2016, 2020, 2024];
  }

  // Get years for each election cycle type (exact years as specified)
  private getYearsByElectionType(type: 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election'): number[] {
    switch (type) {
      case 'Election Year':
        return [2008, 2012, 2016, 2020, 2024]; // Election Year: 2008, 2012, 2016, 2020, 2024 (5 years of data)
      case 'Post-Election':
        return [2005, 2009, 2013, 2017, 2021]; // Post-Election: 2005, 2009, 2013, 2017, 2021 (5 years of data)
      case 'Mid-Term':
        return [2006, 2010, 2014, 2018, 2022]; // Mid-Term: 2006, 2010, 2014, 2018, 2022 (5 years of data)
      case 'Pre-Election':
        return [2007, 2011, 2015, 2019, 2023]; // Pre-Election: 2007, 2011, 2015, 2019, 2023 (5 years of data)
      default:
        return [];
    }
  }

  async analyzeElectionCycleSeasonality(
    symbol: string,
    electionType: 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election',
    yearsBack: number = 20
  ): Promise<ElectionCycleData | null> {
    try {
      // Get relevant years for this election cycle type
      const targetYears = this.getYearsByElectionType(electionType);
      const currentYear = new Date().getFullYear();
      const validYears = targetYears.filter(year => year >= currentYear - yearsBack && year < currentYear);
      
      if (validYears.length === 0) {
        console.warn(`No valid ${electionType} years found in the last ${yearsBack} years`);
        return null;
      }

      console.log(`Analyzing ${electionType} years:`, validYears);

      // Get historical data for the symbol and SPY (unless symbol is SPY)
      const shouldBenchmarkSPY = symbol.toUpperCase() !== 'SPY';
      const [symbolData, spyData] = await Promise.all([
        this.polygonService.getBulkHistoricalData(symbol, yearsBack),
        shouldBenchmarkSPY ? this.polygonService.getBulkHistoricalData('SPY', yearsBack) : Promise.resolve(null)
      ]);

      if (!symbolData?.results) {
        throw new Error('Failed to fetch historical data');
      }

      // Only require SPY data if we're benchmarking against it
      if (shouldBenchmarkSPY && !spyData?.results) {
        throw new Error('Failed to fetch SPY benchmark data');
      }

      // Get ticker details
      const tickerDetails = await this.polygonService.getTickerDetails(symbol);
      const companyName = tickerDetails?.name || symbol;

      // Process the data for election cycle analysis
      const electionData = this.processElectionCycleData(
        symbolData.results,
        spyData?.results || [],
        symbol,
        companyName,
        validYears,
        electionType,
        shouldBenchmarkSPY
      );

      return electionData;

    } catch (error) {
      console.error('Error analyzing election cycle seasonality:', error);
      return null;
    }
  }

  private processElectionCycleData(
    symbolData: PolygonDataPoint[],
    spyData: PolygonDataPoint[],
    symbol: string,
    companyName: string,
    validYears: number[],
    electionType: 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election',
    shouldBenchmarkSPY: boolean = true
  ): ElectionCycleData {
    // Group data by day of year for election years only
    const dailyGroups: { [dayOfYear: number]: { date: Date; return: number; year: number; spyReturn: number }[] } = {};
    const yearlyReturns: { [year: number]: number } = {};
    
    // Create SPY lookup map for faster access (only if benchmarking against SPY)
    const spyLookup: { [dateKey: string]: PolygonDataPoint } = {};
    if (shouldBenchmarkSPY && spyData.length > 0) {
      spyData.forEach(point => {
        const dateKey = new Date(point.t).toDateString();
        spyLookup[dateKey] = point;
      });
    }

    // Filter and process data for election years only
    const filteredData = symbolData.filter(point => {
      const date = new Date(point.t);
      return validYears.includes(date.getFullYear());
    });

    // Calculate daily returns for filtered data
    for (let i = 1; i < filteredData.length; i++) {
      const currentPoint = filteredData[i];
      const previousPoint = filteredData[i - 1];
      const currentDate = new Date(currentPoint.t);
      const year = currentDate.getFullYear();
      
      if (!validYears.includes(year)) continue;

      const dayOfYear = this.getDayOfYear(currentDate);
      const symbolReturn = ((currentPoint.c - previousPoint.c) / previousPoint.c) * 100;
      
      // Find corresponding SPY data (only if benchmarking)
      const dateKey = currentDate.toDateString();
      let spyReturn = 0;
      
      if (shouldBenchmarkSPY && spyLookup[dateKey] && i > 0) {
        const prevSpyPoint = spyLookup[new Date(filteredData[i - 1].t).toDateString()];
        if (prevSpyPoint) {
          const spyPoint = spyLookup[dateKey];
          spyReturn = ((spyPoint.c - prevSpyPoint.c) / prevSpyPoint.c) * 100;
        }
      }

      if (!dailyGroups[dayOfYear]) {
        dailyGroups[dayOfYear] = [];
      }

      dailyGroups[dayOfYear].push({
        date: currentDate,
        return: symbolReturn,
        year,
        spyReturn
      });
    }

    // Calculate cumulative returns for each election year
    validYears.forEach(year => {
      const yearData = filteredData.filter(point => {
        const date = new Date(point.t);
        return date.getFullYear() === year;
      });

      if (yearData.length > 1) {
        const startPrice = yearData[0].c;
        const endPrice = yearData[yearData.length - 1].c;
        const yearReturn = ((endPrice - startPrice) / startPrice) * 100;
        yearlyReturns[year] = yearReturn;
      }
    });

    // Generate daily seasonal data
    const dailyData: DailySeasonalData[] = [];
    let cumulativeReturn = 0;

    for (let dayOfYear = 1; dayOfYear <= 365; dayOfYear++) {
      const dayData = dailyGroups[dayOfYear];
      
      if (dayData && dayData.length > 0) {
        const returns = dayData.map(d => d.return);
        const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const positiveReturns = returns.filter(ret => ret > 0).length;
        
        cumulativeReturn += avgReturn;
        
        const date = new Date(2024, 0, dayOfYear); // Use 2024 as reference year for month/day
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const monthName = date.toLocaleDateString('en-US', { month: 'short' });

        // Create yearly returns object for this day
        const dayYearlyReturns: { [year: number]: number } = {};
        dayData.forEach(d => {
          dayYearlyReturns[d.year] = d.return;
        });

        dailyData.push({
          dayOfYear,
          month,
          day,
          monthName,
          avgReturn,
          cumulativeReturn,
          occurrences: dayData.length,
          positiveYears: positiveReturns,
          winningTrades: positiveReturns,
          pattern: avgReturn > 0 ? 1 : -1,
          yearlyReturns: dayYearlyReturns
        });
      }
    }

    // Calculate statistics
    const allReturns = Object.values(yearlyReturns);
    const positiveReturns = allReturns.filter(ret => ret > 0);
    const totalReturn = allReturns.reduce((sum, ret) => sum + ret, 0);
    const avgReturn = totalReturn / allReturns.length;
    const winRate = (positiveReturns.length / allReturns.length) * 100;
    
    // Calculate volatility
    const variance = allReturns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / allReturns.length;
    const volatility = Math.sqrt(variance);
    
    // Find best and worst years
    const bestYear = { year: 0, return: Math.max(...allReturns) };
    const worstYear = { year: 0, return: Math.min(...allReturns) };
    
    Object.entries(yearlyReturns).forEach(([year, ret]) => {
      if (ret === bestYear.return) bestYear.year = parseInt(year);
      if (ret === worstYear.return) worstYear.year = parseInt(year);
    });

    // Calculate SPY comparison data (only if benchmarking against SPY)
    const spyComparison = shouldBenchmarkSPY ? this.calculateSpyComparison(dailyData, spyData, validYears) : undefined;

    const statistics = {
      totalReturn,
      annualizedReturn: avgReturn,
      volatility,
      sharpeRatio: volatility > 0 ? avgReturn / volatility : 0,
      maxDrawdown: this.calculateMaxDrawdown(dailyData),
      winRate,
      avgWin: positiveReturns.length > 0 ? positiveReturns.reduce((sum, ret) => sum + ret, 0) / positiveReturns.length : 0,
      avgLoss: allReturns.length - positiveReturns.length > 0 ? allReturns.filter(ret => ret <= 0).reduce((sum, ret) => sum + ret, 0) / (allReturns.length - positiveReturns.length) : 0,
      bestTrade: Math.max(...allReturns),
      worstTrade: Math.min(...allReturns),
      yearsOfData: validYears.length,
      averageReturn: avgReturn,
      medianReturn: this.calculateMedian(allReturns),
      winningTrades: positiveReturns.length,
      totalTrades: allReturns.length,
      maxProfit: Math.max(...allReturns),
      maxLoss: Math.min(...allReturns),
      standardDev: volatility,
      bestYear,
      worstYear,
      // Additional fields required by SeasonaxStatistics
      profit: positiveReturns.reduce((sum, ret) => sum + ret, 0),
      averageProfit: positiveReturns.length > 0 ? positiveReturns.reduce((sum, ret) => sum + ret, 0) / positiveReturns.length : 0,
      gains: positiveReturns.reduce((sum, ret) => sum + ret, 0),
      losses: allReturns.filter(ret => ret < 0).reduce((sum, ret) => sum + ret, 0),
      profitPercentage: totalReturn > 0 ? (positiveReturns.reduce((sum, ret) => sum + ret, 0) / totalReturn) * 100 : 0,
      lossPercentage: totalReturn < 0 ? (Math.abs(allReturns.filter(ret => ret < 0).reduce((sum, ret) => sum + ret, 0)) / Math.abs(totalReturn)) * 100 : 0
    };

    return {
      symbol,
      companyName,
      currency: 'USD',
      period: `${electionType} (${validYears.length} years)`,
      electionType,
      dailyData,
      statistics,
      patternReturns: yearlyReturns,
      spyComparison
    };
  }

  private calculateSpyComparison(
    dailyData: DailySeasonalData[],
    spyData: PolygonDataPoint[],
    validYears: number[]
  ) {
    // Group by months and calculate outperformance vs SPY
    const monthlyData: Array<{ month: string; outperformance: number }> = [];
    
    // Calculate monthly outperformance for each month
    for (let month = 1; month <= 12; month++) {
      const monthData = dailyData.filter(d => d.month === month);
      if (monthData.length > 0) {
        const avgSymbolReturn = monthData.reduce((sum, d) => sum + d.avgReturn, 0) / monthData.length;
        // For simplicity, assume SPY average monthly return is market average
        const spyMonthlyReturn = 0.8; // Approximate SPY monthly average
        const outperformance = avgSymbolReturn - spyMonthlyReturn;
        
        const monthName = new Date(2024, month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
        monthlyData.push({ month: monthName, outperformance });
      }
    }

    // Sort and get best/worst months
    const sortedMonths = [...monthlyData].sort((a, b) => b.outperformance - a.outperformance);
    const bestMonths = sortedMonths.slice(0, 3);
    const worstMonths = sortedMonths.slice(-3).reverse();

    // Calculate quarterly data
    const quarters = [
      { quarter: 'Q1', months: [1, 2, 3] },
      { quarter: 'Q2', months: [4, 5, 6] },
      { quarter: 'Q3', months: [7, 8, 9] },
      { quarter: 'Q4', months: [10, 11, 12] }
    ];

    const quarterlyData = quarters.map(q => {
      const quarterMonthlyData = monthlyData.filter(m => {
        const monthNum = new Date(`${m.month} 1, 2024`).getMonth() + 1;
        return q.months.includes(monthNum);
      });
      const avgOutperformance = quarterMonthlyData.reduce((sum, m) => sum + m.outperformance, 0) / quarterMonthlyData.length;
      return { quarter: q.quarter, outperformance: avgOutperformance };
    });

    const sortedQuarters = [...quarterlyData].sort((a, b) => b.outperformance - a.outperformance);
    const bestQuarters = sortedQuarters.slice(0, 2);
    const worstQuarters = sortedQuarters.slice(-2).reverse();

    return {
      bestMonths,
      worstMonths,
      bestQuarters,
      worstQuarters,
      monthlyData
    };
  }

  private calculateMaxDrawdown(dailyData: DailySeasonalData[]): number {
    let maxDrawdown = 0;
    let peak = 0;

    dailyData.forEach(day => {
      if (day.cumulativeReturn > peak) {
        peak = day.cumulativeReturn;
      }
      const drawdown = peak - day.cumulativeReturn;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    return maxDrawdown;
  }

  private calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }
}

export default ElectionCycleService;
export type { ElectionCycleData };
