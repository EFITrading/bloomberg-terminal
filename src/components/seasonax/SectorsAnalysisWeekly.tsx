'use client';

import React, { useState, useEffect } from 'react';
import './SectorsAnalysisNew.css';

// Weekly Seasonal Data Interface
interface WeeklySeasonalData {
  symbol: string;
  name: string;
  type: 'SECTOR' | 'ETF';
  currentWeek: SeasonalWeek;
  nextWeek: SeasonalWeek;
  week3: SeasonalWeek;
  week4: SeasonalWeek;
  reliability: number;
}

interface SeasonalWeek {
  dateRange: string;
  pattern: 'Bullish' | 'Bearish' | 'Neutral';
  strength: number; // Percentage outperformance vs SPY
  confidence: number; // 0-100 based on historical consistency
}

const SectorsAnalysisWeekly: React.FC = () => {
  const [weeklyData, setWeeklyData] = useState<WeeklySeasonalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'sectors' | 'etfs'>('all');

  // Major sector and ETF symbols for analysis
  const symbols = [
    { symbol: 'XLK', name: 'Technology Sector', type: 'SECTOR' },
    { symbol: 'XLF', name: 'Financial Sector', type: 'SECTOR' },
    { symbol: 'XLE', name: 'Energy Sector', type: 'SECTOR' },
    { symbol: 'XLV', name: 'Healthcare Sector', type: 'SECTOR' },
    { symbol: 'XLI', name: 'Industrial Sector', type: 'SECTOR' },
    { symbol: 'XLP', name: 'Consumer Staples', type: 'SECTOR' },
    { symbol: 'XLY', name: 'Consumer Discretionary', type: 'SECTOR' },
    { symbol: 'XLU', name: 'Utilities Sector', type: 'SECTOR' },
    { symbol: 'XLB', name: 'Materials Sector', type: 'SECTOR' },
    { symbol: 'XLRE', name: 'Real Estate Sector', type: 'SECTOR' },
    { symbol: 'XME', name: 'Metals & Mining', type: 'ETF' },
    { symbol: 'ITA', name: 'Aerospace & Defense', type: 'ETF' },
    { symbol: 'IBB', name: 'Biotechnology', type: 'ETF' },
    { symbol: 'SMH', name: 'Semiconductors', type: 'ETF' },
    { symbol: 'KRE', name: 'Regional Banks', type: 'ETF' }
  ];

  // Get current week dates and next 3 weeks
  const getWeekRanges = () => {
    const now = new Date();
    const currentDay = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - currentDay + (currentDay === 0 ? -6 : 1));
    
    const weeks = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = new Date(monday);
      weekStart.setDate(monday.getDate() + (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 4);
      
      weeks.push({
        start: weekStart,
        end: weekEnd,
        range: `${(weekStart.getMonth() + 1)}/${weekStart.getDate()}-${(weekEnd.getMonth() + 1)}/${weekEnd.getDate()}`,
        weekNumber: i + 1
      });
    }
    return weeks;
  };

  const calculateWeeklySeasonality = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🚀 Starting real weekly seasonal analysis...');
      
      const weekRanges = getWeekRanges();
      const realWeeklyData: WeeklySeasonalData[] = [];
      
      for (const symbolInfo of symbols) {
        try {
          console.log(`📊 Analyzing ${symbolInfo.symbol} for weekly seasonality...`);
          
          // Call the API route to get weekly seasonal patterns
          const response = await fetch(`/api/weekly-patterns?symbol=${symbolInfo.symbol}&years=15`);
          const data = await response.json();
          
          if (!data.success) {
            console.warn(`⚠️ Failed to get data for ${symbolInfo.symbol}: ${data.error}`);
            continue;
          }
          
          const weeklyPattern = data.weeklyPattern;
          
          realWeeklyData.push({
            symbol: symbolInfo.symbol,
            name: symbolInfo.name,
            type: symbolInfo.type as 'SECTOR' | 'ETF',
            currentWeek: {
              dateRange: weekRanges[0].range,
              pattern: weeklyPattern.currentWeek.pattern,
              strength: weeklyPattern.currentWeek.strength,
              confidence: weeklyPattern.currentWeek.confidence
            },
            nextWeek: {
              dateRange: weekRanges[1].range,
              pattern: weeklyPattern.nextWeek.pattern,
              strength: weeklyPattern.nextWeek.strength,
              confidence: weeklyPattern.nextWeek.confidence
            },
            week3: {
              dateRange: weekRanges[2].range,
              pattern: weeklyPattern.week3.pattern,
              strength: weeklyPattern.week3.strength,
              confidence: weeklyPattern.week3.confidence
            },
            week4: {
              dateRange: weekRanges[3].range,
              pattern: weeklyPattern.week4.pattern,
              strength: weeklyPattern.week4.strength,
              confidence: weeklyPattern.week4.confidence
            },
            reliability: weeklyPattern.reliability
          });
          
          console.log(`✅ ${symbolInfo.symbol}: Weekly patterns calculated`);
          
        } catch (error) {
          console.error(`❌ Error analyzing ${symbolInfo.symbol}:`, error);
        }
      }
      
      setWeeklyData(realWeeklyData);
      console.log(`🎯 ✅ Weekly seasonal analysis complete! Analyzed ${realWeeklyData.length} symbols`);
      
    } catch (error) {
      console.error('❌ Failed to calculate weekly seasonality:', error);
      setError(error instanceof Error ? error.message : 'Failed to load weekly seasonal data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateWeeklySeasonality();
  }, []);

  const filteredData = weeklyData.filter(item => {
    if (viewMode === 'sectors') return item.type === 'SECTOR';
    if (viewMode === 'etfs') return item.type === 'ETF';
    return true;
  });

  const getPatternClass = (pattern: string) => {
    switch (pattern) {
      case 'Bullish': return 'pattern-bullish';
      case 'Bearish': return 'pattern-bearish';
      default: return 'pattern-neutral';
    }
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 80) return 'confidence-high';
    if (confidence >= 70) return 'confidence-medium';
    return 'confidence-low';
  };

  if (loading) {
    return (
      <div className="sectors-analysis-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <h2>Loading Real Weekly Seasonal Patterns...</h2>
          <p>Analyzing 15 years of historical data vs SPY using Polygon API</p>
          <p>Calculating weekly seasonal patterns for {symbols.length} symbols...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sectors-analysis-container">
        <div className="error-message">
          <h3>Error Loading Real Data</h3>
          <p>{error}</p>
          <p>Please check your Polygon API connection and rate limits.</p>
          <button onClick={() => window.location.reload()} className="retry-button">
            Retry Loading Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sectors-analysis-container">
      <div className="analysis-header">
        <div className="header-content">
          <h1>Weekly Seasonal Analysis</h1>
          <p>Bullish/Bearish patterns relative to SPY - Current week + 4 weeks ahead</p>
        </div>
        <div className="header-stats">
          <div className="stat-card">
            <span className="stat-value">{filteredData.length}</span>
            <span className="stat-label">Symbols</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">15Y</span>
            <span className="stat-label">History</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">vs SPY</span>
            <span className="stat-label">Relative</span>
          </div>
        </div>
      </div>

      <div className="controls-section">
        <div className="view-controls">
          <button 
            className={`control-btn ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >
            All Securities
          </button>
          <button 
            className={`control-btn ${viewMode === 'sectors' ? 'active' : ''}`}
            onClick={() => setViewMode('sectors')}
          >
            Sectors Only
          </button>
          <button 
            className={`control-btn ${viewMode === 'etfs' ? 'active' : ''}`}
            onClick={() => setViewMode('etfs')}
          >
            ETFs Only
          </button>
        </div>
      </div>

      <div className="weekly-table-container">
        <div className="weekly-table-header">
          <div className="header-cell symbol-col">Sector/Industry</div>
          <div className="header-cell week-col">Current Week<br/><span className="date-range">9/2-9/6</span></div>
          <div className="header-cell week-col">Next Week<br/><span className="date-range">9/9-9/13</span></div>
          <div className="header-cell week-col">Week 3<br/><span className="date-range">9/16-9/20</span></div>
          <div className="header-cell week-col">Week 4<br/><span className="date-range">9/23-9/27</span></div>
          <div className="header-cell reliability-col">Reliability</div>
        </div>

        <div className="weekly-table-body">
          {filteredData.map((item) => (
            <div key={item.symbol} className="weekly-row">
              <div className="symbol-info">
                <div className="symbol-name">{item.symbol}</div>
                <div className="symbol-desc">{item.name}</div>
                <div className={`symbol-type ${item.type.toLowerCase()}`}>
                  {item.type}
                </div>
              </div>

              <div className={`week-cell ${getPatternClass(item.currentWeek.pattern)}`}>
                <div className="pattern-label">{item.currentWeek.pattern}</div>
                <div className="pattern-strength">
                  {item.currentWeek.strength > 0 ? '+' : ''}{item.currentWeek.strength.toFixed(1)}%
                </div>
                <div className={`confidence ${getConfidenceClass(item.currentWeek.confidence)}`}>
                  {item.currentWeek.confidence}% conf
                </div>
              </div>

              <div className={`week-cell ${getPatternClass(item.nextWeek.pattern)}`}>
                <div className="pattern-label">{item.nextWeek.pattern}</div>
                <div className="pattern-strength">
                  {item.nextWeek.strength > 0 ? '+' : ''}{item.nextWeek.strength.toFixed(1)}%
                </div>
                <div className={`confidence ${getConfidenceClass(item.nextWeek.confidence)}`}>
                  {item.nextWeek.confidence}% conf
                </div>
              </div>

              <div className={`week-cell ${getPatternClass(item.week3.pattern)}`}>
                <div className="pattern-label">{item.week3.pattern}</div>
                <div className="pattern-strength">
                  {item.week3.strength > 0 ? '+' : ''}{item.week3.strength.toFixed(1)}%
                </div>
                <div className={`confidence ${getConfidenceClass(item.week3.confidence)}`}>
                  {item.week3.confidence}% conf
                </div>
              </div>

              <div className={`week-cell ${getPatternClass(item.week4.pattern)}`}>
                <div className="pattern-label">{item.week4.pattern}</div>
                <div className="pattern-strength">
                  {item.week4.strength > 0 ? '+' : ''}{item.week4.strength.toFixed(1)}%
                </div>
                <div className={`confidence ${getConfidenceClass(item.week4.confidence)}`}>
                  {item.week4.confidence}% conf
                </div>
              </div>

              <div className="reliability-cell">
                <div className="reliability-value">{item.reliability}%</div>
                <div className="reliability-bar">
                  <div 
                    className="reliability-fill" 
                    style={{ width: `${item.reliability}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="legend-section">
        <h3>Legend</h3>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color pattern-bullish"></span>
            <span>Bullish vs SPY</span>
          </div>
          <div className="legend-item">
            <span className="legend-color pattern-bearish"></span>
            <span>Bearish vs SPY</span>
          </div>
          <div className="legend-item">
            <span className="legend-color pattern-neutral"></span>
            <span>Neutral vs SPY</span>
          </div>
          <div className="legend-item">
            <span className="legend-text">Strength: Average outperformance vs SPY</span>
          </div>
          <div className="legend-item">
            <span className="legend-text">Confidence: Historical consistency (10-15 years)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SectorsAnalysisWeekly;
