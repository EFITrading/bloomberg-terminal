'use client';

import React from 'react';

interface SeasonalAnalysis {
  symbol: string;
  companyName: string;
  currency: string;
  period: string;
  dailyData: Array<{
    dayOfYear: number;
    month: number;
    day: number;
    monthName: string;
    avgReturn: number;
    cumulativeReturn: number;
    occurrences: number;
  }>;
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

interface SeasonaxStatisticsProps {
  data: SeasonalAnalysis;
}

const SeasonaxStatistics: React.FC<SeasonaxStatisticsProps> = ({ data }) => {
  const formatPercentage = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number, decimals: number = 2): string => {
    return value.toFixed(decimals);
  };

  const formatPoints = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)} pts`;
  };

  const formatDateRange = (dateRange: string): string => {
    // Convert "Apr 19 - May 18" to "APR 19 - MAY 18"
    return dateRange.toUpperCase().replace(/\s*-\s*/, ' - ');
  };

  // Only show SPY comparison if data is available
  if (!data.spyComparison) {
    return (
      <div className="seasonax-statistics">
        <div className="loading-spy-data">
          <p>Loading SPY comparison data...</p>
        </div>
      </div>
    );
  }

  const spyData = data.spyComparison;

  return (
    <div className="seasonax-statistics">
      {/* Combined Best vs Worst Analysis */}
      <div className="spy-comparison-section unified-section">
        <div className="section-title">Best Vs Worst</div>
        
        {/* Months Section */}
        <div className="analysis-subsection">
          <div className="best-worst-container">
            <div className="best-side">
              <div className="side-subtitle">Bullish</div>
              <div className="performance-grid">
                {spyData.bestMonths.map((month, index) => (
                  <div key={index} className="performance-item stacked">
                    <div className="item-name bullish">{month.month}</div>
                    <div className="item-value bullish">{formatPercentage(month.outperformance)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="worst-side">
              <div className="side-subtitle">Bearish</div>
              <div className="performance-grid">
                {spyData.worstMonths.map((month, index) => (
                  <div key={index} className="performance-item stacked">
                    <div className="item-name bearish">{month.month}</div>
                    <div className="item-value bearish">{formatPercentage(month.outperformance)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quarters Section */}
        <div className="analysis-subsection">
          <div className="best-worst-container">
            <div className="best-side">
              <div className="side-subtitle">Bullish</div>
              <div className="performance-grid">
                {spyData.bestQuarters.map((quarter, index) => (
                  <div key={index} className="performance-item stacked">
                    <div className="item-name bullish">{quarter.quarter}</div>
                    <div className="item-value bullish">{formatPercentage(quarter.outperformance)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="worst-side">
              <div className="side-subtitle">Bearish</div>
              <div className="performance-grid">
                {spyData.worstQuarters.map((quarter, index) => (
                  <div key={index} className="performance-item stacked">
                    <div className="item-name bearish">{quarter.quarter}</div>
                    <div className="item-value bearish">{formatPercentage(quarter.outperformance)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 30 Day Periods Section */}
        <div className="analysis-subsection periods-section">
          {spyData.best30DayPeriod && (
            <div className="period-side">
              <div className="side-subtitle">Bullish</div>
              <div className="period-item bullish-period">
                <div className="period-date">{formatDateRange(spyData.best30DayPeriod.period)}</div>
                <div className="period-return bullish">{formatPercentage(spyData.best30DayPeriod.return)}</div>
              </div>
            </div>
          )}
          {spyData.worst30DayPeriod && (
            <div className="period-side">
              <div className="side-subtitle">Bearish</div>
              <div className="period-item bearish-period">
                <div className="period-date">{formatDateRange(spyData.worst30DayPeriod.period)}</div>
                <div className="period-return bearish">{formatPercentage(spyData.worst30DayPeriod.return)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SeasonaxStatistics;
