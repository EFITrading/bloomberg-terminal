'use client';

import React, { useState, useEffect } from 'react';
import PolygonService from '../../lib/polygonService';
import ElectionCycleService, { ElectionCycleData } from '../../lib/electionCycleService';
import GlobalDataCache from '../../lib/GlobalDataCache';
import SeasonaxSymbolSearch from './SeasonaxSymbolSearch';
import SeasonaxMainChart from './SeasonaxMainChart';
import SeasonaxStatistics from './SeasonaxStatistics';
import SeasonaxControls from './SeasonaxControls';
import HorizontalMonthlyReturns from './HorizontalMonthlyReturns';

// Types for Polygon API data
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

// Create polygon service instance
const polygonService = new PolygonService();
const electionCycleService = new ElectionCycleService();

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

interface SeasonalAnalysis {
  symbol: string;
  companyName: string;
  currency: string;
  period: string;
  dailyData: DailySeasonalData[];
  statistics: {
    annualizedReturn: number;
    averageReturn: number;
    medianReturn: number;
    totalReturn: number;
    winningTrades: number;
    totalTrades: number;
    winRate: number;
    profit: number;
    averageProfit: number;
    maxProfit: number;
    gains: number;
    losses: number;
    profitPercentage: number;
    lossPercentage: number;
    yearsOfData: number;
    bestYear: { year: number; return: number };
    worstYear: { year: number; return: number };
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

interface ChartSettings {
  startDate: string;
  endDate: string;
  yearsOfData: number;
  showCumulative: boolean;
  showPatternReturns: boolean;
  selectedYears: number[];
  smoothing: boolean;
  detrend: boolean;
  showCurrentDate: boolean;
  comparisonSymbols: string[];
}

interface SeasonalityChartProps {
  onBackToTabs?: () => void;
  autoStart?: boolean;
}

const SeasonalityChart: React.FC<SeasonalityChartProps> = ({ onBackToTabs, autoStart = false }) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('SPY');
  const [seasonalData, setSeasonalData] = useState<SeasonalAnalysis | null>(null);
  const [electionData, setElectionData] = useState<ElectionCycleData | null>(null);
  const [isElectionMode, setIsElectionMode] = useState<boolean>(false);
  const [selectedElectionPeriod, setSelectedElectionPeriod] = useState<string>('Election Year');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chartSettings, setChartSettings] = useState<ChartSettings>({
    startDate: '11 Oct',
    endDate: '6 Nov',
    yearsOfData: 20,
    showCumulative: true,
    showPatternReturns: true,
    selectedYears: [],
    smoothing: true,
    detrend: true,
    showCurrentDate: true,
    comparisonSymbols: []
  });

  useEffect(() => {
    console.log('SeasonalityChart useEffect triggered with selectedSymbol:', selectedSymbol);
    if (selectedSymbol) {
      loadSeasonalAnalysis(selectedSymbol);
    }
  }, [selectedSymbol]);

  // Auto-start data loading when autoStart prop is true
  useEffect(() => {
    if (autoStart && selectedSymbol) {
      console.log('🚀 Auto-starting seasonal analysis for:', selectedSymbol);
      loadSeasonalAnalysis(selectedSymbol);
    }
  }, [autoStart, selectedSymbol]);

  const handleElectionModeToggle = async (isEnabled: boolean) => {
    console.log('Election mode toggled:', isEnabled);
    if (!isEnabled) {
      // Switch back to normal seasonal mode
      setIsElectionMode(false);
      setElectionData(null);
      // Reload regular seasonal data if we don't have it or need to refresh
      if (!seasonalData) {
        await loadSeasonalAnalysis(selectedSymbol);
      }
    } else {
      setIsElectionMode(true);
    }
  };

  const handleElectionPeriodSelect = async (period: string) => {
    console.log('Election period selected:', period);
    setSelectedElectionPeriod(period);
    setIsElectionMode(true);
    await loadElectionCycleAnalysis(selectedSymbol, period as 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election');
  };

  const loadElectionCycleAnalysis = async (
    symbol: string, 
    electionType: 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election'
  ) => {
    setLoading(true);
    setError(null);

    try {
      console.log(`Loading election cycle analysis for ${symbol} - ${electionType}`);
      
      const electionResult = await electionCycleService.analyzeElectionCycleSeasonality(
        symbol,
        electionType,
        20 // 20 years of data
      );

      if (electionResult) {
        setElectionData(electionResult);
        console.log('Election cycle data loaded successfully:', electionResult.symbol, 'Years:', electionResult.statistics.yearsOfData);
      } else {
        setError('Failed to load election cycle data');
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load election cycle data';
      setError(errorMessage);
      console.error('Error loading election cycle data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSeasonalAnalysis = async (symbol: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const cache = GlobalDataCache.getInstance();
      
      // Calculate date range (max 20 years due to API limit)
      const yearsToFetch = Math.min(chartSettings.yearsOfData, 20);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - yearsToFetch);

      console.log(`Loading ${yearsToFetch} years of data for ${symbol}`);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Check cache first for faster loading
      let historicalResponse, spyResponse, tickerDetails;
      
      const cachedHistorical = cache.get(GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDateStr, endDateStr));
      const cachedTicker = cache.get(GlobalDataCache.keys.TICKER_DETAILS(symbol));
      
      if (cachedHistorical && cachedTicker) {
        console.log(`⚡ Using cached data for ${symbol} - instant load!`);
        historicalResponse = cachedHistorical;
        tickerDetails = cachedTicker;
        
        // For SPY comparison
        if (symbol.toUpperCase() !== 'SPY') {
          const cachedSPY = cache.get(GlobalDataCache.keys.HISTORICAL_DATA('SPY', startDateStr, endDateStr));
          if (cachedSPY) {
            spyResponse = cachedSPY;
            console.log(`⚡ Using cached SPY data for comparison - instant load!`);
          } else {
            spyResponse = await polygonService.getHistoricalData('SPY', startDateStr, endDateStr);
            if (spyResponse) {
              cache.set(GlobalDataCache.keys.HISTORICAL_DATA('SPY', startDateStr, endDateStr), spyResponse);
            }
          }
        } else {
          spyResponse = null;
        }
      } else {
        console.log(`🔄 Fetching new data for ${symbol}...`);
        
        // Fetch historical data - if symbol is SPY, only fetch SPY data once
        if (symbol.toUpperCase() === 'SPY') {
          // For SPY, just fetch once and use for both
          historicalResponse = await polygonService.getHistoricalData(symbol, startDateStr, endDateStr);
          spyResponse = null; // Don't need separate SPY data when analyzing SPY itself
        } else {
          // For other symbols, fetch both symbol and SPY for comparison
          [historicalResponse, spyResponse] = await Promise.all([
            polygonService.getHistoricalData(symbol, startDateStr, endDateStr),
            polygonService.getHistoricalData('SPY', startDateStr, endDateStr)
          ]);
        }
        
        // Get company details
        tickerDetails = await polygonService.getTickerDetails(symbol);
        
        // Cache the results for next time
        if (historicalResponse) {
          cache.set(GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDateStr, endDateStr), historicalResponse);
        }
        if (spyResponse) {
          cache.set(GlobalDataCache.keys.HISTORICAL_DATA('SPY', startDateStr, endDateStr), spyResponse);
        }
        if (tickerDetails) {
          cache.set(GlobalDataCache.keys.TICKER_DETAILS(symbol), tickerDetails);
        }
      }

      // Process data into daily seasonal format with or without SPY comparison
      const processedData = processDailySeasonalData(
        historicalResponse.results, 
        spyResponse?.results || null,
        symbol,
        tickerDetails?.name || symbol,
        yearsToFetch
      );
      
      setSeasonalData(processedData);
      console.log('Seasonal data loaded successfully:', processedData.symbol, 'dailyData count:', processedData.dailyData.length);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load seasonal data';
      setError(errorMessage);
      console.error('Error loading seasonal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const processDailySeasonalData = (
    data: PolygonDataPoint[],
    spyData: PolygonDataPoint[] | null,
    symbol: string, 
    companyName: string,
    years: number
  ): SeasonalAnalysis => {
    // Group data by day of year
    const dailyGroups: { [dayOfYear: number]: { date: Date; return: number; year: number }[] } = {};
    const yearlyReturns: { [year: number]: number } = {};
    
    // Create SPY lookup map for faster access (only if spyData is provided)
    const spyLookup: { [timestamp: number]: PolygonDataPoint } = {};
    if (spyData) {
      spyData.forEach(item => {
        spyLookup[item.t] = item;
      });
    }
    
    // Process historical data into daily returns
    for (let i = 1; i < data.length; i++) {
      const currentItem = data[i];
      const previousItem = data[i - 1];
      const date = new Date(currentItem.t);
      const year = date.getFullYear();
      const dayOfYear = getDayOfYear(date);
      
      // Calculate stock return
      const stockReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100;
      
      let finalReturn = stockReturn;
      
      // If we have SPY data, calculate relative performance vs SPY
      if (spyData && spyData.length > 0) {
        const currentSpy = spyLookup[currentItem.t];
        const previousSpy = spyLookup[previousItem.t];
        
        if (currentSpy && previousSpy) {
          const spyReturn = ((currentSpy.c - previousSpy.c) / previousSpy.c) * 100;
          finalReturn = stockReturn - spyReturn; // Relative to SPY
        } else {
          // Skip this data point if we don't have corresponding SPY data
          continue;
        }
      }
      // If no SPY data (i.e., analyzing SPY itself), use absolute returns
      
      if (!dailyGroups[dayOfYear]) {
        dailyGroups[dayOfYear] = [];
      }
      
      dailyGroups[dayOfYear].push({
        date,
        return: finalReturn,
        year
      });
      
      if (!yearlyReturns[year]) {
        yearlyReturns[year] = 0;
      }
      yearlyReturns[year] += finalReturn;
    }

    // Calculate daily seasonal data
    const dailyData: DailySeasonalData[] = [];
    let cumulativeReturn = 0;
    
    // Process each day of year (1-365)
    for (let dayOfYear = 1; dayOfYear <= 365; dayOfYear++) {
      const dayData = dailyGroups[dayOfYear] || [];
      
      if (dayData.length === 0) continue;
      
      const returns = dayData.map(d => d.return);
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const positiveReturns = returns.filter(ret => ret > 0).length;
      
      cumulativeReturn += avgReturn;
      
      // Get representative date for this day of year
      const representativeDate = new Date(2024, 0, dayOfYear); // Use 2024 as base year
      
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

    // Calculate overall statistics
    const allReturns = Object.values(yearlyReturns);
    const totalReturn = cumulativeReturn;
    const annualizedReturn = (totalReturn / years);
    const averageReturn = allReturns.reduce((sum, ret) => sum + ret, 0) / allReturns.length;
    const winningYears = allReturns.filter(ret => ret > 0).length;
    const totalTrades = allReturns.length;
    const winRate = (winningYears / totalTrades) * 100;
    
    const positiveReturns = allReturns.filter(ret => ret > 0);
    const negativeReturns = allReturns.filter(ret => ret < 0);
    
    const bestYear = {
      year: parseInt(Object.keys(yearlyReturns).find(year => yearlyReturns[parseInt(year)] === Math.max(...allReturns)) || '0'),
      return: Math.max(...allReturns)
    };
    
    const worstYear = {
      year: parseInt(Object.keys(yearlyReturns).find(year => yearlyReturns[parseInt(year)] === Math.min(...allReturns)) || '0'),
      return: Math.min(...allReturns)
    };

    // Calculate monthly aggregates for best/worst months analysis using proper methodology
    // Group data by month and year for proper monthly return calculation
    const monthlyReturns: { [monthYear: string]: { ticker: number[], spy: number[] } } = {};
    
    // First, collect all daily returns by month-year for both ticker and SPY
    for (let i = 1; i < data.length; i++) {
      const currentItem = data[i];
      const previousItem = data[i - 1];
      const date = new Date(currentItem.t);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-12
      const monthYear = `${year}-${month}`;
      
      const currentSpy = spyLookup[currentItem.t];
      const previousSpy = spyLookup[previousItem.t];
      
      if (currentSpy && previousSpy) {
        if (!monthlyReturns[monthYear]) {
          monthlyReturns[monthYear] = { ticker: [], spy: [] };
        }
        
        // Calculate daily returns
        const tickerReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100;
        const spyReturn = ((currentSpy.c - previousSpy.c) / previousSpy.c) * 100;
        
        monthlyReturns[monthYear].ticker.push(tickerReturn);
        monthlyReturns[monthYear].spy.push(spyReturn);
      }
    }
    
    // Calculate monthly return for each month across all years
    const monthlyData: { [month: number]: { tickerReturns: number[], spyReturns: number[] } } = {};
    
    Object.keys(monthlyReturns).forEach(monthYear => {
      const [year, month] = monthYear.split('-').map(Number);
      const monthNum = month;
      
      if (!monthlyData[monthNum]) {
        monthlyData[monthNum] = { tickerReturns: [], spyReturns: [] };
      }
      
      // Calculate monthly return as cumulative of daily returns for that month
      const tickerMonthlyReturn = monthlyReturns[monthYear].ticker.reduce((sum, ret) => sum + ret, 0);
      const spyMonthlyReturn = monthlyReturns[monthYear].spy.reduce((sum, ret) => sum + ret, 0);
      
      monthlyData[monthNum].tickerReturns.push(tickerMonthlyReturn);
      monthlyData[monthNum].spyReturns.push(spyMonthlyReturn);
    });

    const monthlyAverages = Object.keys(monthlyData).map(month => {
      const monthNum = parseInt(month);
      const data = monthlyData[monthNum];
      
      // Calculate average monthly return over 15 years for both ticker and SPY
      const avgTickerReturn = data.tickerReturns.length > 0 ? 
        data.tickerReturns.reduce((sum, ret) => sum + ret, 0) / data.tickerReturns.length : 0;
      const avgSpyReturn = data.spyReturns.length > 0 ? 
        data.spyReturns.reduce((sum, ret) => sum + ret, 0) / data.spyReturns.length : 0;
      
      // Calculate outperformance as ticker average minus SPY average
      const outperformance = avgTickerReturn - avgSpyReturn;
      
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        month: monthNames[monthNum - 1],
        avgReturn: avgTickerReturn,
        outperformance: outperformance
      };
    });

    const sortedMonthsByPerformance = [...monthlyAverages].sort((a, b) => b.avgReturn - a.avgReturn);
    const bestMonths = sortedMonthsByPerformance.slice(0, 3);
    const worstMonths = sortedMonthsByPerformance.slice(-3).reverse();

    // Calculate REAL quarterly data from actual monthly averages
    const quarterlyData = [
      { 
        quarter: 'Q1', 
        return: monthlyAverages.slice(0, 3).reduce((sum, month) => sum + month.avgReturn, 0) / 3
      },
      { 
        quarter: 'Q2', 
        return: monthlyAverages.slice(3, 6).reduce((sum, month) => sum + month.avgReturn, 0) / 3
      },
      { 
        quarter: 'Q3', 
        return: monthlyAverages.slice(6, 9).reduce((sum, month) => sum + month.avgReturn, 0) / 3
      },
      { 
        quarter: 'Q4', 
        return: monthlyAverages.slice(9, 12).reduce((sum, month) => sum + month.avgReturn, 0) / 3
      }
    ];

    const sortedQuarters = [...quarterlyData].sort((a, b) => b.return - a.return);
    
    // Use real quarterly returns (already relative to SPY)
    const bestQuarters = [{ 
      quarter: sortedQuarters[0].quarter, 
      outperformance: sortedQuarters[0].return
    }];
    const worstQuarters = [{ 
      quarter: sortedQuarters[sortedQuarters.length - 1].quarter, 
      outperformance: sortedQuarters[sortedQuarters.length - 1].return
    }];

    // Analyze 30+ day seasonal patterns from actual daily data
    const analyze30DayPatterns = (dailyData: DailySeasonalData[]) => {
      const windowSize = 30;
      let bestPeriod = { startDay: 1, endDay: 30, avgReturn: -999, period: '', startDate: '', endDate: '' };
      let worstPeriod = { startDay: 1, endDay: 30, avgReturn: 999, period: '', startDate: '', endDate: '' };

      // Slide through the year to find 30-day windows
      for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
        const endDay = startDay + windowSize - 1;
        const windowData = dailyData.filter(d => d.dayOfYear >= startDay && d.dayOfYear <= endDay);
        
        if (windowData.length >= 25) { // Ensure we have enough data points
          const windowReturn = windowData.reduce((sum, d) => sum + d.avgReturn, 0);
          const avgWindowReturn = windowReturn / windowData.length;
          
          // Check for best period
          if (avgWindowReturn > bestPeriod.avgReturn) {
            const startDataPoint = dailyData.find(d => d.dayOfYear === startDay);
            const endDataPoint = dailyData.find(d => d.dayOfYear === endDay);
            
            if (startDataPoint && endDataPoint) {
              bestPeriod = {
                startDay,
                endDay,
                avgReturn: avgWindowReturn,
                period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day}`,
                startDate: `${startDataPoint.monthName} ${startDataPoint.day}`,
                endDate: `${endDataPoint.monthName} ${endDataPoint.day}`
              };
            }
          }
          
          // Check for worst period
          if (avgWindowReturn < worstPeriod.avgReturn) {
            const startDataPoint = dailyData.find(d => d.dayOfYear === startDay);
            const endDataPoint = dailyData.find(d => d.dayOfYear === endDay);
            
            if (startDataPoint && endDataPoint) {
              worstPeriod = {
                startDay,
                endDay,
                avgReturn: avgWindowReturn,
                period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day}`,
                startDate: `${startDataPoint.monthName} ${startDataPoint.day}`,
                endDate: `${endDataPoint.monthName} ${endDataPoint.day}`
              };
            }
          }
        }
      }

      return { bestPeriod, worstPeriod };
    };

    const { bestPeriod, worstPeriod } = analyze30DayPatterns(dailyData);

    return {
      symbol,
      companyName,
      currency: 'USD',
      period: `${chartSettings.startDate} - ${chartSettings.endDate}`,
      dailyData,
      statistics: {
        annualizedReturn,
        averageReturn,
        medianReturn: allReturns.sort((a, b) => a - b)[Math.floor(allReturns.length / 2)],
        totalReturn,
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
        bestYear,
        worstYear
      },
      patternReturns: yearlyReturns,
      spyComparison: {
        bestMonths,
        worstMonths,
        bestQuarters,
        worstQuarters,
        monthlyData: monthlyAverages,
        best30DayPeriod: {
          period: bestPeriod.period,
          return: bestPeriod.avgReturn * 30, // Convert daily average to 30-day period return
          startDate: bestPeriod.startDate,
          endDate: bestPeriod.endDate
        },
        worst30DayPeriod: {
          period: worstPeriod.period,
          return: worstPeriod.avgReturn * 30, // Convert daily average to 30-day period return
          startDate: worstPeriod.startDate,
          endDate: worstPeriod.endDate
        }
      }
    };
  };

  const getDayOfYear = (date: Date): number => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    setIsElectionMode(false); // Reset to normal seasonal mode when symbol changes
    setElectionData(null);
  };

  const handleSettingsChange = (newSettings: Partial<ChartSettings>) => {
    const updatedSettings = { ...chartSettings, ...newSettings };
    setChartSettings(updatedSettings);
    
    // Reload data if years changed
    if (newSettings.yearsOfData && newSettings.yearsOfData !== chartSettings.yearsOfData) {
      if (selectedSymbol) {
        if (isElectionMode) {
          loadElectionCycleAnalysis(selectedSymbol, selectedElectionPeriod as 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election');
        } else {
          loadSeasonalAnalysis(selectedSymbol);
        }
      }
    }
  };

  const handleRefresh = () => {
    if (selectedSymbol) {
      console.log('Refreshing data for', selectedSymbol);
      if (isElectionMode) {
        loadElectionCycleAnalysis(selectedSymbol, selectedElectionPeriod as 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election');
      } else {
        loadSeasonalAnalysis(selectedSymbol);
      }
    }
  };

  const handleDateRangeChange = (direction: 'prev' | 'next') => {
    // Calculate new date range based on direction
    const currentStart = new Date(chartSettings.startDate + ', 2024');
    const currentEnd = new Date(chartSettings.endDate + ', 2024');
    
    // Move date range by 30 days
    const daysToMove = direction === 'next' ? 30 : -30;
    
    const newStart = new Date(currentStart);
    const newEnd = new Date(currentEnd);
    newStart.setDate(newStart.getDate() + daysToMove);
    newEnd.setDate(newEnd.getDate() + daysToMove);
    
    const newStartStr = newStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const newEndStr = newEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    
    setChartSettings({
      ...chartSettings,
      startDate: newStartStr,
      endDate: newEndStr
    });
    
    console.log(`Date range changed ${direction}: ${newStartStr} - ${newEndStr}`);
  };

  return (
    <div className="seasonax-container">
      {/* Header with symbol search, monthly returns, and controls */}
      <div className="seasonax-header">
        <SeasonaxSymbolSearch 
          onSymbolSelect={handleSymbolChange} 
          initialSymbol={selectedSymbol}
          onElectionPeriodSelect={handleElectionPeriodSelect}
          onElectionModeToggle={handleElectionModeToggle}
        />
        {/* Show monthly returns based on current mode */}
        {(isElectionMode ? electionData?.spyComparison?.monthlyData : seasonalData?.spyComparison?.monthlyData) && (
          <HorizontalMonthlyReturns 
            monthlyData={isElectionMode ? electionData!.spyComparison!.monthlyData : seasonalData!.spyComparison!.monthlyData}
          />
        )}
        <SeasonaxControls 
          settings={chartSettings}
          onSettingsChange={handleSettingsChange}
          onRefresh={handleRefresh}
          onBackToTabs={onBackToTabs}
        />
      </div>

      {error && (
        <div className="seasonax-error">
          <div className="error-content">
            <h3>Error Loading Data</h3>
            <p>{error}</p>
            <button 
              onClick={() => {
                if (isElectionMode) {
                  loadElectionCycleAnalysis(selectedSymbol, selectedElectionPeriod as 'Election Year' | 'Post-Election' | 'Mid-Term' | 'Pre-Election');
                } else {
                  loadSeasonalAnalysis(selectedSymbol);
                }
              }}
              className="retry-button"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="seasonax-loading">
          <div className="loading-spinner"></div>
          <p>Loading {isElectionMode ? 'election cycle' : 'seasonal'} analysis for {selectedSymbol}...</p>
        </div>
      )}

      {/* Show data based on current mode */}
      {((isElectionMode && electionData) || (!isElectionMode && seasonalData)) && !loading && (
        <div className="seasonax-content">
          {/* Main Chart Area */}
          <div className="seasonax-charts">
            <SeasonaxMainChart
              data={(isElectionMode ? electionData : seasonalData) as unknown as Parameters<typeof SeasonaxMainChart>[0]['data']}
              settings={chartSettings}
            />
          </div>

          {/* Statistics Panel */}
          <div className="seasonax-sidebar">
            <SeasonaxStatistics 
              data={isElectionMode ? (electionData as any) : seasonalData!}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SeasonalityChart;
