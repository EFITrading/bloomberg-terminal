'use client';

import React, { useState, useEffect } from 'react';
import PolygonService from '../../lib/polygonService';
import SeasonaxSymbolSearch from './SeasonaxSymbolSearch';
import SeasonaxMainChart from './SeasonaxMainChart';
import SeasonaxStatistics from './SeasonaxStatistics';
import SeasonaxControls from './SeasonaxControls';

// Create polygon service instance
const polygonService = new PolygonService();

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
}

const SeasonalityChart: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('MSFT');
  const [seasonalData, setSeasonalData] = useState<SeasonalAnalysis | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chartSettings, setChartSettings] = useState<ChartSettings>({
    startDate: '11 Oct',
    endDate: '6 Nov',
    yearsOfData: 10,
    showCumulative: true,
    showPatternReturns: true,
    selectedYears: [],
    smoothing: false,
    detrend: false,
    showCurrentDate: false
  });

  useEffect(() => {
    if (selectedSymbol) {
      loadSeasonalAnalysis(selectedSymbol);
    }
  }, [selectedSymbol]);

  const loadSeasonalAnalysis = async (symbol: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Calculate date range (max 20 years due to API limit)
      const yearsToFetch = Math.min(chartSettings.yearsOfData, 20);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - yearsToFetch);

      console.log(`Loading ${yearsToFetch} years of data for ${symbol}`);

      // Fetch historical data
      const historicalResponse = await polygonService.getHistoricalData(
        symbol,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      if (!historicalResponse || !historicalResponse.results || historicalResponse.results.length === 0) {
        throw new Error(`No historical data available for ${symbol}`);
      }

      // Get company details
      const tickerDetails = await polygonService.getTickerDetails(symbol);

      // Process data into daily seasonal format
      const processedData = processDailySeasonalData(
        historicalResponse.results, 
        symbol,
        tickerDetails?.name || symbol,
        yearsToFetch
      );
      
      setSeasonalData(processedData);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load seasonal data';
      setError(errorMessage);
      console.error('Error loading seasonal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const processDailySeasonalData = (
    data: any[], 
    symbol: string, 
    companyName: string,
    years: number
  ): SeasonalAnalysis => {
    // Group data by day of year
    const dailyGroups: { [dayOfYear: number]: { date: Date; return: number; year: number }[] } = {};
    const yearlyReturns: { [year: number]: number } = {};
    
    // Process historical data into daily returns
    for (let i = 1; i < data.length; i++) {
      const currentItem = data[i];
      const previousItem = data[i - 1];
      const date = new Date(currentItem.t);
      const year = date.getFullYear();
      const dayOfYear = getDayOfYear(date);
      
      const dailyReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100;
      
      if (!dailyGroups[dayOfYear]) {
        dailyGroups[dayOfYear] = [];
      }
      
      dailyGroups[dayOfYear].push({
        date,
        return: dailyReturn,
        year
      });
      
      if (!yearlyReturns[year]) {
        yearlyReturns[year] = 0;
      }
      yearlyReturns[year] += dailyReturn;
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
      patternReturns: yearlyReturns
    };
  };

  const getDayOfYear = (date: Date): number => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const handleSettingsChange = (newSettings: Partial<ChartSettings>) => {
    const updatedSettings = { ...chartSettings, ...newSettings };
    setChartSettings(updatedSettings);
    
    // Reload data if years changed
    if (newSettings.yearsOfData && newSettings.yearsOfData !== chartSettings.yearsOfData) {
      if (selectedSymbol) {
        loadSeasonalAnalysis(selectedSymbol);
      }
    }
  };

  const handleRefresh = () => {
    if (selectedSymbol) {
      console.log('Refreshing data for', selectedSymbol);
      loadSeasonalAnalysis(selectedSymbol);
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
      {/* Header with symbol search and controls */}
      <div className="seasonax-header">
        <SeasonaxSymbolSearch 
          onSymbolSelect={handleSymbolChange} 
          initialSymbol={selectedSymbol}
        />
        <SeasonaxControls 
          settings={chartSettings}
          onSettingsChange={handleSettingsChange}
          onRefresh={handleRefresh}
          onDateRangeChange={handleDateRangeChange}
        />
      </div>

      {error && (
        <div className="seasonax-error">
          <div className="error-content">
            <h3>Error Loading Data</h3>
            <p>{error}</p>
            <button 
              onClick={() => loadSeasonalAnalysis(selectedSymbol)}
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
          <p>Loading seasonal analysis for {selectedSymbol}...</p>
        </div>
      )}

      {seasonalData && !loading && (
        <div className="seasonax-content">
          {/* Main Chart Area */}
          <div className="seasonax-charts">
            <SeasonaxMainChart 
              data={seasonalData}
              settings={chartSettings}
            />
          </div>

          {/* Statistics Panel */}
          <div className="seasonax-sidebar">
            <SeasonaxStatistics 
              data={seasonalData}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SeasonalityChart;
