'use client';

import React from 'react';

interface SeasonalAnalysis {
  symbol: string;
  companyName: string;
  currency: string;
  period: string;
  dailyData: any[];
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

      {/* Main Statistics */}
      <div className="main-stats">
        <div className="stat-group">
          <div className="stat-large positive">
            <div className="stat-value">{formatPercentage(data.statistics.annualizedReturn)}</div>
            <div className="stat-label">Annualized return</div>
          </div>
          <div className="stat-large positive">
            <div className="stat-value">100.00%</div>
            <div className="stat-label">Winning trades</div>
          </div>
        </div>

        <div className="stat-section">
          <div className="section-title">Return</div>
          <div className="stat-row">
            <div className="stat-item">
              <div className="stat-label">Annualized return</div>
              <div className="stat-value positive">{formatPercentage(data.statistics.annualizedReturn)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Annualized return</div>
              <div className="stat-value positive">{formatPercentage(data.statistics.averageReturn)}</div>
            </div>
          </div>
          <div className="stat-row">
            <div className="stat-item">
              <div className="stat-label">Average return</div>
              <div className="stat-value positive">{formatPercentage(data.statistics.averageReturn)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Median return</div>
              <div className="stat-value">{formatPercentage(data.statistics.medianReturn)}</div>
            </div>
          </div>
        </div>

        <div className="stat-section">
          <div className="section-title">Profit</div>
          <div className="stat-row">
            <div className="stat-item">
              <div className="stat-label">Total profit</div>
              <div className="stat-value positive">{formatPoints(data.statistics.profit)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Average profit</div>
              <div className="stat-value positive">{formatPoints(data.statistics.averageProfit)}</div>
            </div>
          </div>
        </div>

        <div className="gains-losses">
          <div className="gains-section">
            <div className="section-title">Gains</div>
            <div className="gain-loss-stat">
              <div className="gain-loss-number">{data.statistics.gains}</div>
              <div className="gain-loss-label">Gains</div>
              <div className="gain-loss-percentage positive">
                {formatPercentage(data.statistics.profitPercentage)}
              </div>
              <div className="gain-loss-sublabel">Profit</div>
            </div>
          </div>

          <div className="losses-section">
            <div className="section-title">Losses</div>
            <div className="gain-loss-stat">
              <div className="gain-loss-number">{data.statistics.losses}</div>
              <div className="gain-loss-label">Losses</div>
              <div className="gain-loss-percentage negative">
                0.00%
              </div>
              <div className="gain-loss-sublabel">Profit</div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Period Info */}
      <div className="data-period">
        <div className="period-title">Data Period</div>
        <div className="period-info">
          <div className="period-range">{data.period}</div>
          <div className="period-years">{data.statistics.yearsOfData} years ({new Date().getFullYear() - data.statistics.yearsOfData} - {new Date().getFullYear()})</div>
        </div>
      </div>

      {/* Events Section */}
      <div className="events-section">
        <div className="events-header">
          <span>Events</span>
          <div className="events-toggle">
            <button className="events-btn active">Events</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeasonaxStatistics;
