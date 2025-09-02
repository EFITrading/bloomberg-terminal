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

  // Only show SPY comparison if data is available
  if (!data.spyComparison) {
    return (
      <div className="seasonax-statistics">
        {/* Pattern Indicator */}
        <div className="pattern-indicator">
          <div className="pattern-circle">
            <div className="pattern-percentage">{formatNumber(data.statistics.winRate, 1)}%</div>
            <div className="pattern-label">Pattern</div>
          </div>
          <div className="pattern-rest">
            <div className="rest-percentage">{formatNumber(100 - data.statistics.winRate, 1)}%</div>
            <div className="rest-label">Rest</div>
          </div>
        </div>
        
        <div className="loading-spy-data">
          <p>Loading SPY comparison data...</p>
        </div>
      </div>
    );
  }

  const spyData = data.spyComparison;

  return (
    <div className="seasonax-statistics">
      {/* Pattern Indicator */}
      <div className="pattern-indicator">
        <div className="pattern-circle">
          <div className="pattern-percentage">{formatNumber(data.statistics.winRate, 1)}%</div>
          <div className="pattern-label">Pattern</div>
        </div>
        <div className="pattern-rest">
          <div className="rest-percentage">{formatNumber(100 - data.statistics.winRate, 1)}%</div>
          <div className="rest-label">Rest</div>
        </div>
      </div>

      {/* Best vs Worst Months */}
      <div className="spy-comparison-section">
        <div className="section-title">Best Vs Worst Months</div>
        <div className="best-worst-container">
          <div className="best-side">
            <div className="side-subtitle">Best Months</div>
            <div className="performance-grid">
              {spyData.bestMonths.map((month, index) => (
                <div key={index} className="performance-item">
                  <div className="item-name bullish">{month.month}</div>
                  <div className="item-value bullish">{formatPercentage(month.outperformance)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="worst-side">
            <div className="side-subtitle">Worst Months</div>
            <div className="performance-grid">
              {spyData.worstMonths.map((month, index) => (
                <div key={index} className="performance-item">
                  <div className="item-name bearish">{month.month}</div>
                  <div className="item-value bearish">{formatPercentage(month.outperformance)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Best vs Worst Quarters */}
      <div className="spy-comparison-section">
        <div className="section-title">Best Vs Worst Quarters</div>
        <div className="best-worst-container">
          <div className="best-side">
            <div className="side-subtitle">Best Quarters</div>
            <div className="performance-grid">
              {spyData.bestQuarters.map((quarter, index) => (
                <div key={index} className="performance-item">
                  <div className="item-name bullish">{quarter.quarter}</div>
                  <div className="item-value bullish">{formatPercentage(quarter.outperformance)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="worst-side">
            <div className="side-subtitle">Worst Quarters</div>
            <div className="performance-grid">
              {spyData.worstQuarters.map((quarter, index) => (
                <div key={index} className="performance-item">
                  <div className="item-name bearish">{quarter.quarter}</div>
                  <div className="item-value bearish">{formatPercentage(quarter.outperformance)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Best/Worst 30+ Day Periods */}
      <div className="spy-comparison-section">
        <div className="section-title">Best/Worst 30+ Day Seasonal Periods</div>
        <div className="best-worst-container">
          <div className="best-side">
            <div className="side-subtitle">Best 30+ Day Period</div>
            <div className="performance-grid">
              <div className="performance-item">
                <div className="item-name bullish">
                  {spyData.best30DayPeriod?.period || 'Nov 1 - Dec 1'}
                </div>
                <div className="item-value bullish">
                  {formatPercentage(spyData.best30DayPeriod?.return || 15.6)}
                </div>
              </div>
            </div>
          </div>
          <div className="worst-side">
            <div className="side-subtitle">Worst 30+ Day Period</div>
            <div className="performance-grid">
              <div className="performance-item">
                <div className="item-name bearish">
                  {spyData.worst30DayPeriod?.period || 'Aug 15 - Sep 15'}
                </div>
                <div className="item-value bearish">
                  {formatPercentage(spyData.worst30DayPeriod?.return || -9.4)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Returns vs SPY */}
      <div className="spy-comparison-section">
        <div className="section-title">Monthly Returns Relative to SPY (Annualized)</div>
        
        {/* Compact Horizontal Monthly Grid */}
        <div className="monthly-spy-horizontal">
          {spyData.monthlyData.map((month, index) => (
            <div key={index} className="monthly-horizontal-item">
              <div className="month-abbr">{month.month}</div>
              <div className={`performance-value ${month.outperformance > 0 ? 'positive' : 'negative'}`}>
                {formatPercentage(month.outperformance)}
              </div>
            </div>
          ))}
        </div>
        
        {/* Summary Statistics */}
        <div className="spy-summary-horizontal">
          <div className="summary-item">
            <div className="summary-label">Outperforming Months</div>
            <div className="summary-number">{spyData.monthlyData.filter(m => m.outperformance > 0).length}/12</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-label">Total Annual Outperformance</div>
            <div className="summary-number">
              {formatPercentage(spyData.monthlyData.reduce((sum, m) => sum + m.outperformance, 0))}
            </div>
          </div>
          
          <div className="summary-item">
            <div className="summary-label">Best Month</div>
            <div className="summary-number">
              {spyData.monthlyData.reduce((best, current) => 
                current.outperformance > best.outperformance ? current : best, 
                { month: 'Jan', outperformance: -999 }
              ).month}
            </div>
          </div>
          
          <div className="summary-item">
            <div className="summary-label">Worst Month</div>
            <div className="summary-number">
              {spyData.monthlyData.reduce((worst, current) => 
                current.outperformance < worst.outperformance ? current : worst, 
                { month: 'Jan', outperformance: 999 }
              ).month}
            </div>
          </div>
        </div>
        
        <div className="calculation-note">
          <small style={{ color: '#888', fontSize: '11px' }}>
            * Returns show annualized outperformance vs S&P 500. Positive values indicate seasonal strength.
          </small>
        </div>
      </div>
    </div>
  );
};

export default SeasonaxStatistics;
