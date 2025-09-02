'use client';

import React, { useState, useEffect } from 'react';
import PolygonService from '@/lib/polygonService';

interface SectorData {
  symbol: string;
  name: string;
  type: 'sector' | 'industry';
}

interface WeeklyData {
  week: string;
  dates: string;
  sentiment: 'bullish' | 'bearish' | 'mixed';
  percentage: number;
}

interface SectorWeeklyData {
  sector: SectorData;
  weeks: WeeklyData[];
}

const SectorsTable: React.FC = () => {
  const [sectorsData, setSectorsData] = useState<SectorWeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const polygonService = new PolygonService();

  // S&P 500 Sectors and specified industries
  const sectorsAndIndustries: SectorData[] = [
    // S&P 500 Sectors (11 sectors)
    { symbol: 'XLK', name: 'Technology', type: 'sector' },
    { symbol: 'XLF', name: 'Financials', type: 'sector' },
    { symbol: 'XLV', name: 'Healthcare', type: 'sector' },
    { symbol: 'XLI', name: 'Industrials', type: 'sector' },
    { symbol: 'XLY', name: 'Consumer Discretionary', type: 'sector' },
    { symbol: 'XLP', name: 'Consumer Staples', type: 'sector' },
    { symbol: 'XLE', name: 'Energy', type: 'sector' },
    { symbol: 'XLU', name: 'Utilities', type: 'sector' },
    { symbol: 'XLB', name: 'Materials', type: 'sector' },
    { symbol: 'XLRE', name: 'Real Estate', type: 'sector' },
    { symbol: 'XLC', name: 'Communication Services', type: 'sector' },
    
    // Specified Industries
    { symbol: 'SMH', name: 'Semiconductors', type: 'industry' },
    { symbol: 'ARKK', name: 'Innovation', type: 'industry' },
    { symbol: 'IGV', name: 'Software', type: 'industry' },
    { symbol: 'JETS', name: 'Airlines', type: 'industry' },
    { symbol: 'TAN', name: 'Solar Energy', type: 'industry' },
    { symbol: 'KIE', name: 'Insurance', type: 'industry' },
    { symbol: 'ITA', name: 'Aerospace & Defense', type: 'industry' },
    { symbol: 'XHB', name: 'Homebuilders', type: 'industry' },
    { symbol: 'FDN', name: 'Internet', type: 'industry' },
    { symbol: 'GDX', name: 'Gold Miners', type: 'industry' },
    { symbol: 'CIBR', name: 'Cybersecurity', type: 'industry' },
    { symbol: 'VNQ', name: 'REITs', type: 'industry' },
    { symbol: 'XBI', name: 'Biotech', type: 'industry' },
    { symbol: 'XOP', name: 'Oil & Gas', type: 'industry' },
    { symbol: 'XME', name: 'Metals & Mining', type: 'industry' }
  ];

  // Generate weekly date ranges for current month
  const generateWeeklyRanges = (month: number, year: number) => {
    const weeks = [];
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    
    const currentWeekStart = new Date(firstDay);
    
    // Find first Monday of the month or first trading day
    while (currentWeekStart.getDay() !== 1 && currentWeekStart <= lastDay) {
      currentWeekStart.setDate(currentWeekStart.getDate() + 1);
    }
    
    let weekNumber = 1;
    
    while (currentWeekStart <= lastDay && weekNumber <= 4) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 4); // Monday to Friday
      
      if (weekEnd > lastDay) {
        weekEnd.setTime(lastDay.getTime());
      }
      
      weeks.push({
        week: `Week ${weekNumber}`,
        dates: `${(currentWeekStart.getMonth() + 1)}/${currentWeekStart.getDate()}-${(weekEnd.getMonth() + 1)}/${weekEnd.getDate()}`,
        startDate: new Date(currentWeekStart),
        endDate: new Date(weekEnd)
      });
      
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      weekNumber++;
    }
    
    return weeks;
  };

  // Calculate seasonal sentiment based on historical data
  const calculateSeasonalSentiment = async (symbol: string, startDate: Date, endDate: Date): Promise<WeeklyData> => {
    try {
      console.log(`📊 Analyzing ${symbol} for period ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
      
      let totalReturn10Y = 0;
      let totalReturn15Y = 0;
      let validYears10Y = 0;
      let validYears15Y = 0;
      
      const currentYear = new Date().getFullYear();
      
      // Analyze last 15 years for comprehensive data
      for (let yearOffset = 1; yearOffset <= 15; yearOffset++) {
        const analysisYear = currentYear - yearOffset;
        const yearStartDate = new Date(startDate);
        yearStartDate.setFullYear(analysisYear);
        const yearEndDate = new Date(endDate);
        yearEndDate.setFullYear(analysisYear);
        
        try {
          const yearData = await polygonService.getHistoricalData(
            symbol,
            yearStartDate.toISOString().split('T')[0],
            yearEndDate.toISOString().split('T')[0]
          );
          
          if (yearData && yearData.results && yearData.results.length >= 2) {
            const startPrice = yearData.results[0].c; // close price
            const endPrice = yearData.results[yearData.results.length - 1].c; // close price
            const weeklyReturn = ((endPrice - startPrice) / startPrice) * 100;
            
            // Add to 15Y analysis
            totalReturn15Y += weeklyReturn;
            validYears15Y++;
            
            // Add to 10Y analysis if within 10 years
            if (yearOffset <= 10) {
              totalReturn10Y += weeklyReturn;
              validYears10Y++;
            }
          }
        } catch (error) {
          console.warn(`⚠️ No data for ${symbol} in ${analysisYear}`);
        }
      }
      
      // Calculate weighted average (10Y: 60%, 15Y: 40%)
      const avg10Y = validYears10Y > 0 ? totalReturn10Y / validYears10Y : 0;
      const avg15Y = validYears15Y > 0 ? totalReturn15Y / validYears15Y : 0;
      const weightedAverage = (avg10Y * 0.6) + (avg15Y * 0.4);
      
      let sentiment: 'bullish' | 'bearish' | 'mixed';
      if (weightedAverage > 1.0) {
        sentiment = 'bullish';
      } else if (weightedAverage < -1.0) {
        sentiment = 'bearish';
      } else {
        sentiment = 'mixed';
      }
      
      return {
        week: '',
        dates: '',
        sentiment,
        percentage: weightedAverage
      };
      
    } catch (error) {
      console.error(`❌ Error analyzing ${symbol}:`, error);
      return {
        week: '',
        dates: '',
        sentiment: 'mixed',
        percentage: 0
      };
    }
  };

  // Load all sector data
  const loadSectorData = async () => {
    try {
      setLoading(true);
      const weeklyRanges = generateWeeklyRanges(currentMonth, currentYear);
      console.log(`📅 Generated ${weeklyRanges.length} weekly ranges for ${currentMonth}/${currentYear}`);
      
      const sectorDataPromises = sectorsAndIndustries.map(async (sector) => {
        console.log(`🔍 Processing ${sector.symbol} - ${sector.name}`);
        
        const weeklyDataPromises = weeklyRanges.map(async (range) => {
          const sentimentData = await calculateSeasonalSentiment(
            sector.symbol, 
            range.startDate, 
            range.endDate
          );
          
          return {
            week: range.week,
            dates: range.dates,
            sentiment: sentimentData.sentiment,
            percentage: sentimentData.percentage
          };
        });
        
        const weeks = await Promise.all(weeklyDataPromises);
        
        return {
          sector,
          weeks
        };
      });
      
      const results = await Promise.all(sectorDataPromises);
      setSectorsData(results);
      
    } catch (error) {
      console.error('❌ Error loading sector data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSectorData();
  }, [currentMonth, currentYear]);

  const getSentimentIcon = (sentiment: 'bullish' | 'bearish' | 'mixed') => {
    switch (sentiment) {
      case 'bullish': return '▲';
      case 'bearish': return '▼';
      case 'mixed': return '◆';
    }
  };

  const getSentimentClass = (sentiment: 'bullish' | 'bearish' | 'mixed') => {
    switch (sentiment) {
      case 'bullish': return 'sentiment-bullish';
      case 'bearish': return 'sentiment-bearish';
      case 'mixed': return 'sentiment-mixed';
    }
  };

  const weeklyRanges = generateWeeklyRanges(currentMonth, currentYear);

  return (
    <div className="sectors-table-container">
      <div className="sectors-table-header">
        <h2>Sector & Industry Seasonal Analysis</h2>
        <p>
          {new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })} 
          - 10Y & 15Y Historical Seasonal Patterns
        </p>
        <div className="legend">
          <span className="legend-item bullish">▲ Bullish (&gt;1%)</span>
          <span className="legend-item bearish">▼ Bearish (&lt;-1%)</span>
          <span className="legend-item mixed">◆ Mixed (-1% to 1%)</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-sectors">
          <p>🔄 Analyzing {sectorsAndIndustries.length} sectors and industries...</p>
          <p>📊 Processing 10Y and 15Y historical seasonal data...</p>
          <p>⏳ This may take a few moments for comprehensive analysis...</p>
        </div>
      ) : (
        <div className="sectors-table-wrapper">
          <table className="sectors-table">
            <thead>
              <tr>
                <th className="sector-header">Sector/Industry</th>
                {weeklyRanges.map((range, index) => (
                  <th key={index} className="week-header">
                    {range.week}
                    <br />
                    <span className="week-dates">{range.dates}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sectorsData.map((sectorData, sectorIndex) => (
                <tr key={sectorData.sector.symbol} className={sectorData.sector.type}>
                  <td className="sector-name">
                    <div className="sector-info">
                      <span className="sector-symbol">{sectorData.sector.symbol}</span>
                      <span className="sector-full-name">{sectorData.sector.name}</span>
                    </div>
                  </td>
                  {sectorData.weeks.map((week, weekIndex) => (
                    <td key={weekIndex} className={`sentiment-cell ${getSentimentClass(week.sentiment)}`}>
                      <div className="sentiment-content">
                        <span className="sentiment-icon">
                          {getSentimentIcon(week.sentiment)}
                        </span>
                        <span className="sentiment-text">
                          {week.sentiment.charAt(0).toUpperCase() + week.sentiment.slice(1)}
                        </span>
                        <span className="sentiment-percentage">
                          {week.percentage > 0 ? '+' : ''}{week.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SectorsTable;
