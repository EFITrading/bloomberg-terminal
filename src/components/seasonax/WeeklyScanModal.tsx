'use client';

import React, { useState, useEffect } from 'react';
import PolygonService from '@/lib/polygonService';
import GlobalDataCache from '@/lib/GlobalDataCache';
import HoldingsModal from './HoldingsModal';

interface WeeklyScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WeeklyData {
  symbol: string;
  name: string;
  week1: number | null;
  week2: number | null;
  week3: number | null;
  week4: number | null;
}

interface WeekRange {
  start: Date;
  end: Date;
  label: string;
}

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

const polygonService = new PolygonService();

const WeeklyScanModal: React.FC<WeeklyScanModalProps> = ({ isOpen, onClose }) => {
  const [sectorsData, setSectorsData] = useState<WeeklyData[]>([]);
  const [industriesData, setIndustriesData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekRanges, setWeekRanges] = useState<WeekRange[]>([]);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [holdingsModalOpen, setHoldingsModalOpen] = useState(false);
  const [selectedETF, setSelectedETF] = useState<{ symbol: string; name: string }>({ symbol: '', name: '' });
  const [activeTab, setActiveTab] = useState<'sectors' | 'industries'>('sectors');

  // Sector ETFs mapping
  const sectors = [
    { symbol: 'XLK', name: 'Technology' },
    { symbol: 'XLF', name: 'Financials' },
    { symbol: 'XLV', name: 'Healthcare' },
    { symbol: 'XLE', name: 'Energy' },
    { symbol: 'XLY', name: 'Consumer Discretionary' },
    { symbol: 'XLP', name: 'Consumer Staples' },
    { symbol: 'XLI', name: 'Industrials' },
    { symbol: 'XLB', name: 'Materials' },
    { symbol: 'XLRE', name: 'Real Estate' },
    { symbol: 'XLC', name: 'Communications' },
    { symbol: 'XLU', name: 'Utilities' }
  ];

  // Industry ETFs mapping
  const industries = [
    { symbol: 'SMH', name: 'Semiconductors' },
    { symbol: 'IGV', name: 'Software' },
    { symbol: 'XOP', name: 'Oil & Gas Exploration' },
    { symbol: 'OIH', name: 'Oil Services' },
    { symbol: 'FDN', name: 'Internet' },
    { symbol: 'XRT', name: 'Retail' },
    { symbol: 'KIE', name: 'Insurance' },
    { symbol: 'KRE', name: 'Regional Banks' },
    { symbol: 'JETS', name: 'Airlines' },
    { symbol: 'GDX', name: 'Gold Miners' },
    { symbol: 'ITA', name: 'Aerospace & Defense' },
    { symbol: 'TAN', name: 'Solar Energy' },
    { symbol: 'XHB', name: 'Homebuilders' },
    { symbol: 'XME', name: 'Metals & Mining' }
  ];

  useEffect(() => {
    if (isOpen) {
      calculateWeekRanges();
      loadRealSeasonalData();
    }
  }, [isOpen]);

  // Calculate dynamic week ranges based on current date
  const calculateWeekRanges = () => {
    const today = new Date();
    const weeks: WeekRange[] = [];

    for (let i = 0; i < 4; i++) {
      const weekStart = getWeekStart(today, i);
      const weekEnd = getWeekEnd(weekStart);
      
      const label = formatWeekLabel(weekStart, weekEnd);
      
      weeks.push({
        start: weekStart,
        end: weekEnd,
        label
      });
    }

    setWeekRanges(weeks);
    console.log('📅 Dynamic week ranges calculated:', weeks);
  };

  // Get the start of the trading week (Monday) for a given week offset
  const getWeekStart = (referenceDate: Date, weekOffset: number): Date => {
    const date = new Date(referenceDate);
    
    // Get current day of week (0 = Sunday, 1 = Monday, etc.)
    const currentDay = date.getDay();
    
    // Calculate days to subtract to get to Monday of current week
    // If it's Sunday (0), go back 6 days, otherwise go back (currentDay - 1) days
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    // Set to Monday of current week
    date.setDate(date.getDate() - daysToMonday);
    
    // Add weeks offset
    date.setDate(date.getDate() + (weekOffset * 7));
    
    // Reset time to start of day
    date.setHours(0, 0, 0, 0);
    
    return date;
  };

  // Get the end of the trading week (Friday)
  const getWeekEnd = (weekStart: Date): Date => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 4); // Monday + 4 days = Friday
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  };

  // Format week label as "Oct 26 - Oct 31"
  const formatWeekLabel = (start: Date, end: Date): string => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const startMonth = monthNames[start.getMonth()];
    const startDay = start.getDate();
    const endMonth = monthNames[end.getMonth()];
    const endDay = end.getDate();
    
    if (start.getMonth() === end.getMonth()) {
      return `${startMonth} ${startDay} - ${endDay}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
  };

  const initializeData = () => {
    // Initialize sectors with null data (ready for real API data)
    const initialSectorsData = sectors.map(sector => ({
      symbol: sector.symbol,
      name: sector.name,
      week1: null,
      week2: null,
      week3: null,
      week4: null
    }));

    // Initialize industries with null data (ready for real API data)
    const initialIndustriesData = industries.map(industry => ({
      symbol: industry.symbol,
      name: industry.name,
      week1: null,
      week2: null,
      week3: null,
      week4: null
    }));

    setSectorsData(initialSectorsData);
    setIndustriesData(initialIndustriesData);
  };

  // Load real seasonal data for all sectors and industries
  const loadRealSeasonalData = async () => {
    setLoading(true);
    setLoadingStatus('Initializing seasonal analysis...');
    
    // Calculate week ranges first
    const today = new Date();
    const weeks: WeekRange[] = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = getWeekStart(today, i);
      const weekEnd = getWeekEnd(weekStart);
      weeks.push({ start: weekStart, end: weekEnd, label: formatWeekLabel(weekStart, weekEnd) });
    }

    try {
      // Initialize empty data first
      initializeData();

      // Fetch SPY data once for all comparisons (10 years of historical data)
      setLoadingStatus('Loading SPY benchmark data (10 years)...');
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      
      const spyStartDate = tenYearsAgo.toISOString().split('T')[0];
      const spyEndDate = new Date().toISOString().split('T')[0];
      
      console.log('📊 Fetching SPY data from', spyStartDate, 'to', spyEndDate);
      const spyData = await polygonService.getHistoricalData('SPY', spyStartDate, spyEndDate);
      
      if (!spyData || !spyData.results || spyData.results.length === 0) {
        throw new Error('Failed to load SPY benchmark data');
      }

      console.log('✅ SPY data loaded:', spyData.results.length, 'data points');

      // Process sectors
      setLoadingStatus('Analyzing sector seasonal patterns...');
      const sectorsPromises = sectors.map(sector => 
        calculateSeasonalPerformance(sector.symbol, sector.name, weeks, spyData.results)
      );
      const sectorsResults = await Promise.all(sectorsPromises);
      setSectorsData(sectorsResults);
      console.log('✅ Sectors analysis complete');

      // Process industries
      setLoadingStatus('Analyzing industry seasonal patterns...');
      const industriesPromises = industries.map(industry => 
        calculateSeasonalPerformance(industry.symbol, industry.name, weeks, spyData.results)
      );
      const industriesResults = await Promise.all(industriesPromises);
      setIndustriesData(industriesResults);
      console.log('✅ Industries analysis complete');

      setLoadingStatus('Analysis complete!');
    } catch (error) {
      console.error('❌ Error loading seasonal data:', error);
      setLoadingStatus('Error loading data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Calculate seasonal performance for a symbol relative to SPY
  const calculateSeasonalPerformance = async (
    symbol: string,
    name: string,
    weeks: WeekRange[],
    spyResults: PolygonDataPoint[]
  ): Promise<WeeklyData> => {
    try {
      console.log(`📈 Analyzing ${symbol} (${name})...`);
      
      // Fetch 10 years of historical data for the symbol
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      
      const startDate = tenYearsAgo.toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];
      
      const cache = GlobalDataCache.getInstance();
      const cacheKey = GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDate, endDate);
      
      let symbolData = cache.get(cacheKey);
      if (!symbolData) {
        symbolData = await polygonService.getHistoricalData(symbol, startDate, endDate);
        if (symbolData) {
          cache.set(cacheKey, symbolData);
        }
      }

      if (!symbolData || !symbolData.results || symbolData.results.length === 0) {
        console.warn(`⚠️ No data available for ${symbol}`);
        return { symbol, name, week1: null, week2: null, week3: null, week4: null };
      }

      // Calculate weekly returns for each of the 4 weeks
      const weeklyReturns = weeks.map((week, weekIndex) => {
        return calculateWeeklySeasonalReturn(
          symbol,
          symbolData.results,
          spyResults,
          week.start,
          week.end
        );
      });

      const [week1, week2, week3, week4] = weeklyReturns;

      console.log(`✅ ${symbol}: Week1=${week1?.toFixed(2)}%, Week2=${week2?.toFixed(2)}%, Week3=${week3?.toFixed(2)}%, Week4=${week4?.toFixed(2)}%`);

      return {
        symbol,
        name,
        week1,
        week2,
        week3,
        week4
      };
    } catch (error) {
      console.error(`❌ Error analyzing ${symbol}:`, error);
      return { symbol, name, week1: null, week2: null, week3: null, week4: null };
    }
  };

  // Calculate weekly seasonal return relative to SPY for a specific week
  const calculateWeeklySeasonalReturn = (
    symbol: string,
    symbolData: PolygonDataPoint[],
    spyData: PolygonDataPoint[],
    weekStart: Date,
    weekEnd: Date
  ): number | null => {
    try {
      // Get month and day of the week range (ignore year for historical matching)
      const startMonth = weekStart.getMonth();
      const startDay = weekStart.getDate();
      const endMonth = weekEnd.getMonth();
      const endDay = weekEnd.getDate();

      // Find all historical occurrences of this week over the past 10 years
      const historicalWeekReturns: number[] = [];
      
      // Go through each year in the past 10 years
      for (let yearOffset = 1; yearOffset <= 10; yearOffset++) {
        const historicalYear = new Date().getFullYear() - yearOffset;
        
        // Create the historical week dates
        const historicalWeekStart = new Date(historicalYear, startMonth, startDay);
        const historicalWeekEnd = new Date(historicalYear, endMonth, endDay);
        
        // Find data points for this historical week
        const symbolWeekData = findWeekData(symbolData, historicalWeekStart, historicalWeekEnd);
        const spyWeekData = findWeekData(spyData, historicalWeekStart, historicalWeekEnd);
        
        if (symbolWeekData.start && symbolWeekData.end && spyWeekData.start && spyWeekData.end) {
          // Calculate returns for the week
          const symbolWeekReturn = ((symbolWeekData.end.c - symbolWeekData.start.c) / symbolWeekData.start.c) * 100;
          const spyWeekReturn = ((spyWeekData.end.c - spyWeekData.start.c) / spyWeekData.start.c) * 100;
          
          // Calculate relative performance (outperformance vs SPY)
          const relativeReturn = symbolWeekReturn - spyWeekReturn;
          historicalWeekReturns.push(relativeReturn);
          
          console.log(`  ${symbol} ${historicalYear}: Symbol=${symbolWeekReturn.toFixed(2)}%, SPY=${spyWeekReturn.toFixed(2)}%, Relative=${relativeReturn.toFixed(2)}%`);
        }
      }

      // Calculate average relative return over all years
      if (historicalWeekReturns.length === 0) {
        return null;
      }

      const avgRelativeReturn = historicalWeekReturns.reduce((sum, ret) => sum + ret, 0) / historicalWeekReturns.length;
      return avgRelativeReturn;
      
    } catch (error) {
      console.error(`Error calculating weekly return for ${symbol}:`, error);
      return null;
    }
  };

  // Find the start and end data points for a given week
  const findWeekData = (
    data: PolygonDataPoint[],
    weekStart: Date,
    weekEnd: Date
  ): { start: PolygonDataPoint | null; end: PolygonDataPoint | null } => {
    let startPoint: PolygonDataPoint | null = null;
    let endPoint: PolygonDataPoint | null = null;

    const weekStartTime = weekStart.getTime();
    const weekEndTime = weekEnd.getTime();

    // Find the first data point on or after week start
    for (let i = 0; i < data.length; i++) {
      const dataPoint = data[i];
      const dataTime = dataPoint.t;
      
      if (dataTime >= weekStartTime && !startPoint) {
        startPoint = dataPoint;
      }
      
      if (dataTime >= weekStartTime && dataTime <= weekEndTime) {
        endPoint = dataPoint; // Keep updating to get the last point in the week
      }
      
      if (dataTime > weekEndTime) {
        break;
      }
    }

    return { start: startPoint, end: endPoint };
  };

  // Check if row has 3+ strong positive or negative cells
  const getTickerGlowStyle = (data: WeeklyData) => {
    const values = [data.week1, data.week2, data.week3, data.week4].filter(v => v !== null) as number[];
    const strongPositive = values.filter(v => v >= 0.60).length;
    const strongNegative = values.filter(v => v <= -0.60).length;

    if (strongPositive >= 3) {
      return {
        color: '#00ff00',
        textShadow: '0 0 20px rgba(0, 255, 0, 0.8), 0 0 10px rgba(0, 255, 0, 1)',
        fontWeight: '900'
      };
    } else if (strongNegative >= 3) {
      return {
        color: '#ff4444',
        textShadow: '0 0 20px rgba(255, 68, 68, 0.8), 0 0 10px rgba(255, 68, 68, 1)',
        fontWeight: '900'
      };
    }
    return {
      color: '#ff6600',
      textShadow: '0 0 12px rgba(255, 102, 0, 0.6), 0 0 4px rgba(255, 102, 0, 0.8)',
      fontWeight: '900'
    };
  };

  const renderTableCell = (value: number | null) => {
    if (value === null) {
      return (
        <td className="loading-cell" style={{ textAlign: 'center', color: '#666', fontStyle: 'italic' }}>
          <span className="loading-dots">...</span>
        </td>
      );
    }
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    // Determine cell class and highlight based on value
    let cellClass = '';
    let cellStyle: React.CSSProperties = {
      textAlign: 'center',
      padding: '14px 12px',
      fontSize: '13px'
    };
    
    if (numValue >= 0.60) {
      cellClass = 'positive-cell strong-positive';
      cellStyle = {
        ...cellStyle,
        backgroundColor: 'rgba(0, 255, 0, 0.15)',
        color: '#00ff00',
        fontWeight: 700,
        textShadow: '0 0 8px rgba(0, 255, 0, 0.5)',
        borderLeft: '2px solid rgba(0, 255, 0, 0.4)',
        borderRight: '2px solid rgba(0, 255, 0, 0.4)'
      };
    } else if (numValue > 0) {
      cellClass = 'positive-cell';
      cellStyle = {
        ...cellStyle,
        color: '#00ff00',
        fontWeight: 600,
        textShadow: '0 0 5px rgba(0, 255, 0, 0.3)'
      };
    } else if (numValue <= -0.60) {
      cellClass = 'negative-cell strong-negative';
      cellStyle = {
        ...cellStyle,
        backgroundColor: 'rgba(255, 68, 68, 0.15)',
        color: '#ff4444',
        fontWeight: 700,
        textShadow: '0 0 8px rgba(255, 68, 68, 0.5)',
        borderLeft: '2px solid rgba(255, 68, 68, 0.4)',
        borderRight: '2px solid rgba(255, 68, 68, 0.4)'
      };
    } else {
      cellClass = 'negative-cell';
      cellStyle = {
        ...cellStyle,
        color: '#ff4444',
        fontWeight: 600,
        textShadow: '0 0 5px rgba(255, 68, 68, 0.3)'
      };
    }
    
    const displayValue = numValue >= 0 ? `+${numValue.toFixed(2)}%` : `${numValue.toFixed(2)}%`;
    
    return (
      <td className={cellClass} style={cellStyle}>
        {displayValue}
      </td>
    );
  };

  const handleRowDoubleClick = (symbol: string, name: string) => {
    console.log(`🔍 Double-clicked ${symbol} - ${name}, opening holdings modal...`);
    setSelectedETF({ symbol, name });
    setHoldingsModalOpen(true);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="weekly-scan-overlay" onClick={onClose} />
      <div className="weekly-scan-modal">
        <div className="weekly-scan-header">
          <div className="header-content">
            <h2 className="modal-title">WEEKLY PERFORMANCE ANALYSIS</h2>
            <p className="modal-subtitle">Historical Seasonal Patterns | 10-Year SPY-Benchmarked Data</p>
          </div>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-button tab-sectors ${activeTab === 'sectors' ? 'active' : ''}`}
            onClick={() => setActiveTab('sectors')}
          >
            <span className="tab-label">SECTOR ANALYSIS</span>
            <span className="tab-count">{sectors.length} ETFs • 110 Stocks</span>
          </button>
          <button 
            className={`tab-button tab-industries ${activeTab === 'industries' ? 'active' : ''}`}
            onClick={() => setActiveTab('industries')}
          >
            <span className="tab-label">INDUSTRY ANALYSIS</span>
            <span className="tab-count">{industries.length} ETFs • 140 Stocks</span>
          </button>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>{loadingStatus}</p>
            <p className="loading-subtext">Calculating 10-year seasonal patterns relative to SPY benchmark...</p>
          </div>
        ) : (
          <div className="weekly-scan-content">
            {/* Sectors Table */}
            {activeTab === 'sectors' && (
              <div className="table-section">
                <div className="table-container">
                  <table className="weekly-scan-table">
                    <thead>
                      <tr>
                        <th className="symbol-col">SYMBOL</th>
                        <th className="sector-col">SECTOR</th>
                        <th className="week-col">{weekRanges[0]?.label || 'Week 1'}</th>
                        <th className="week-col">{weekRanges[1]?.label || 'Week 2'}</th>
                        <th className="week-col">{weekRanges[2]?.label || 'Week 3'}</th>
                        <th className="week-col">{weekRanges[3]?.label || 'Week 4'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectorsData.map((sector, index) => (
                        <tr 
                          key={sector.symbol} 
                          className={index % 2 === 0 ? 'even-row' : 'odd-row'}
                          onDoubleClick={() => handleRowDoubleClick(sector.symbol, sector.name)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="symbol-cell" style={{ 
                            ...getTickerGlowStyle(sector),
                            fontSize: '15px',
                            letterSpacing: '1px',
                            fontFamily: 'Arial, Helvetica, sans-serif',
                            background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.8) 100%)'
                          }}>
                            <span style={getTickerGlowStyle(sector)}>{sector.symbol}</span>
                          </td>
                          <td className="sector-cell">{sector.name}</td>
                          {renderTableCell(sector.week1)}
                          {renderTableCell(sector.week2)}
                        {renderTableCell(sector.week3)}
                        {renderTableCell(sector.week4)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* Industries Table */}
            {activeTab === 'industries' && (
              <div className="table-section">
                <div className="table-container">
                  <table className="weekly-scan-table">
                    <thead>
                      <tr>
                        <th className="symbol-col">SYMBOL</th>
                        <th className="sector-col">INDUSTRY</th>
                        <th className="week-col">{weekRanges[0]?.label || 'Week 1'}</th>
                        <th className="week-col">{weekRanges[1]?.label || 'Week 2'}</th>
                        <th className="week-col">{weekRanges[2]?.label || 'Week 3'}</th>
                        <th className="week-col">{weekRanges[3]?.label || 'Week 4'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {industriesData.map((industry, index) => (
                        <tr 
                          key={industry.symbol} 
                          className={index % 2 === 0 ? 'even-row' : 'odd-row'}
                          onDoubleClick={() => handleRowDoubleClick(industry.symbol, industry.name)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="symbol-cell" style={{ 
                            ...getTickerGlowStyle(industry),
                            fontSize: '15px',
                            letterSpacing: '1px',
                            fontFamily: 'Arial, Helvetica, sans-serif',
                            background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.8) 100%)'
                          }}>
                            <span style={getTickerGlowStyle(industry)}>{industry.symbol}</span>
                          </td>
                          <td className="sector-cell">{industry.name}</td>
                          {renderTableCell(industry.week1)}
                          {renderTableCell(industry.week2)}
                          {renderTableCell(industry.week3)}
                          {renderTableCell(industry.week4)}
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      <HoldingsModal
        isOpen={holdingsModalOpen}
        onClose={() => setHoldingsModalOpen(false)}
        etfSymbol={selectedETF.symbol}
        etfName={selectedETF.name}
        weekRanges={weekRanges}
      />

      <style jsx>{`
        .weekly-scan-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(4px);
          z-index: 9998;
          animation: fadeIn 0.3s ease-in-out;
        }

        .weekly-scan-modal {
          position: fixed;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 95%;
          max-width: 1400px;
          max-height: 90vh;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          border: 2px solid #ff6600;
          border-radius: 8px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
          z-index: 9999;
          overflow: hidden;
          animation: slideIn 0.4s ease-out;
        }

        .weekly-scan-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 28px 36px;
          background: linear-gradient(135deg, #000000 0%, #0a0a0a 50%, #000000 100%);
          border-bottom: 1px solid #ff6600;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
        }

        .header-content {
          flex: 1;
        }

        .modal-title {
          font-size: 26px;
          font-weight: 800;
          color: #ff6600;
          margin: 0 0 10px 0;
          letter-spacing: 2px;
          text-shadow: 0 0 15px rgba(255, 102, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.8);
          text-transform: uppercase;
          font-family: 'Arial', 'Helvetica', sans-serif;
        }

        .modal-subtitle {
          font-size: 12px;
          color: #888;
          margin: 0;
          letter-spacing: 1px;
          font-weight: 500;
          text-transform: uppercase;
        }

        .tab-navigation {
          display: flex;
          background: linear-gradient(180deg, #0a0a0a 0%, #000 100%);
          border-bottom: 2px solid #1a1a1a;
          padding: 0;
        }

        .tab-button {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px 24px;
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .tab-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .tab-sectors::before {
          background: linear-gradient(180deg, rgba(59, 130, 246, 0) 0%, rgba(59, 130, 246, 0.1) 100%);
        }

        .tab-industries::before {
          background: linear-gradient(180deg, rgba(34, 197, 94, 0) 0%, rgba(34, 197, 94, 0.1) 100%);
        }

        .tab-button:hover::before {
          opacity: 1;
        }

        .tab-sectors:hover {
          background: linear-gradient(180deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
        }

        .tab-industries:hover {
          background: linear-gradient(180deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%);
        }

        .tab-sectors.active {
          border-bottom-color: #60a5fa;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.4) 0%, rgba(96, 165, 250, 0.5) 50%, rgba(59, 130, 246, 0.4) 100%);
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -3px 12px rgba(59, 130, 246, 0.3), 
            0 4px 16px rgba(59, 130, 246, 0.3),
            0 0 20px rgba(96, 165, 250, 0.2);
          position: relative;
          overflow: hidden;
        }

        .tab-sectors.active::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, 
            transparent 0%, 
            rgba(255, 255, 255, 0.2) 50%, 
            transparent 100%);
          animation: glossyShine 3s infinite;
        }

        .tab-industries.active {
          border-bottom-color: #4ade80;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.4) 0%, rgba(74, 222, 128, 0.5) 50%, rgba(34, 197, 94, 0.4) 100%);
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.2),
            inset 0 -3px 12px rgba(34, 197, 94, 0.3), 
            0 4px 16px rgba(34, 197, 94, 0.3),
            0 0 20px rgba(74, 222, 128, 0.2);
          position: relative;
          overflow: hidden;
        }

        .tab-industries.active::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, 
            transparent 0%, 
            rgba(255, 255, 255, 0.2) 50%, 
            transparent 100%);
          animation: glossyShine 3s infinite;
        }

        @keyframes glossyShine {
          0% {
            left: -100%;
          }
          50%, 100% {
            left: 200%;
          }
        }

        .tab-label {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: #666;
          margin-bottom: 6px;
          transition: color 0.3s ease;
          text-transform: uppercase;
        }

        .tab-sectors:hover .tab-label {
          color: #3b82f6;
        }

        .tab-industries:hover .tab-label {
          color: #22c55e;
        }

        .tab-sectors.active .tab-label {
          color: #60a5fa;
          text-shadow: 0 0 10px rgba(96, 165, 250, 0.6);
          font-weight: 900;
        }

        .tab-industries.active .tab-label {
          color: #4ade80;
          text-shadow: 0 0 10px rgba(74, 222, 128, 0.6);
          font-weight: 900;
        }

        .tab-count {
          font-size: 11px;
          font-weight: 600;
          color: #444;
          letter-spacing: 0.5px;
          transition: color 0.3s ease;
        }

        .tab-sectors:hover .tab-count {
          color: #60a5fa;
        }

        .tab-industries:hover .tab-count {
          color: #4ade80;
        }

        .tab-sectors.active .tab-count {
          color: #93c5fd;
          font-weight: 700;
        }

        .tab-industries.active .tab-count {
          color: #86efac;
          font-weight: 700;
        }

        .close-button {
          width: 40px;
          height: 40px;
          background: transparent;
          border: 2px solid #ff6600;
          border-radius: 4px;
          color: #ff6600;
          font-size: 24px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }

        .close-button:hover {
          background: #ff6600;
          color: #000;
          transform: rotate(90deg);
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px;
          color: #ff6600;
        }

        .loading-subtext {
          font-size: 12px;
          color: #999;
          margin-top: 8px;
          max-width: 400px;
          text-align: center;
        }

        .loading-spinner {
          width: 50px;
          height: 50px;
          border: 3px solid #333;
          border-top: 3px solid #ff6600;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }

        .weekly-scan-content {
          padding: 32px;
          overflow-y: auto;
          max-height: calc(90vh - 120px);
        }

        .table-section {
          margin-bottom: 48px;
        }

        .table-section:last-child {
          margin-bottom: 0;
        }

        .table-header-section {
          margin-bottom: 24px;
          padding-bottom: 18px;
          border-bottom: 2px solid #222;
          background: linear-gradient(90deg, rgba(255, 102, 0, 0.03) 0%, transparent 100%);
          padding: 16px 20px;
          border-radius: 4px;
        }

        .table-title {
          font-size: 16px;
          font-weight: 800;
          color: #ff6600;
          margin-bottom: 8px;
          letter-spacing: 2px;
          text-transform: uppercase;
          text-shadow: 0 0 10px rgba(255, 102, 0, 0.4);
        }

        .table-subtitle {
          font-size: 11px;
          color: #666;
          letter-spacing: 1px;
          font-weight: 500;
          text-transform: uppercase;
        }

        .table-container {
          background: #000;
          border: 1px solid #333;
          border-radius: 6px;
          overflow: hidden;
          box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.8);
        }

        .weekly-scan-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'Courier New', monospace;
        }

        .weekly-scan-table thead {
          background: linear-gradient(180deg, #000 0%, #0a0a0a 100%);
          border-bottom: 2px solid #ff6600;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        }

        .weekly-scan-table th {
          padding: 16px 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 700;
          color: #ff6600;
          letter-spacing: 1px;
          text-transform: uppercase;
          border-right: 1px solid #0a0a0a;
          background: linear-gradient(180deg, #000 0%, #050505 100%);
          box-shadow: inset 0 1px 2px rgba(255, 102, 0, 0.1);
        }

        .weekly-scan-table th:last-child {
          border-right: none;
        }

        .symbol-col {
          width: 10%;
          text-align: center !important;
        }

        .sector-col {
          width: 30%;
        }

        .week-col {
          width: 15%;
          text-align: center !important;
        }

        .weekly-scan-table tbody tr {
          border-bottom: 1px solid #0a0a0a;
          transition: all 0.2s ease;
        }

        .even-row {
          background: linear-gradient(90deg, #000 0%, #020202 100%);
        }

        .odd-row {
          background: linear-gradient(90deg, #000 0%, #000 100%);
        }

        .weekly-scan-table tbody tr:hover {
          background: linear-gradient(90deg, rgba(255, 102, 0, 0.08) 0%, rgba(255, 102, 0, 0.05) 100%);
          border-left: 3px solid #ff6600;
          box-shadow: inset 0 0 10px rgba(255, 102, 0, 0.1);
        }

        .weekly-scan-table td {
          padding: 14px 12px;
          font-size: 13px;
          border-right: 1px solid #0a0a0a;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.8) 100%);
          box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.5);
        }

        .weekly-scan-table td:last-child {
          border-right: none;
        }

        .symbol-cell {
          color: #ff6600 !important;
          font-weight: 900;
          text-align: center;
          font-size: 15px;
          letter-spacing: 1px;
          text-shadow: 0 0 12px rgba(255, 102, 0, 0.6), 0 0 4px rgba(255, 102, 0, 0.8);
          font-family: 'Arial', 'Helvetica', sans-serif;
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .symbol-cell span {
          color: #ff6600 !important;
        }

        .sector-cell {
          color: #ccc;
          font-weight: 500;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
        }

        .positive-cell {
          color: #00ff00;
          font-weight: 600;
          text-align: center;
          text-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
        }

        .strong-positive {
          background: rgba(0, 255, 0, 0.15);
          color: #00ff00;
          font-weight: 700;
          text-shadow: 0 0 8px rgba(0, 255, 0, 0.5);
          border-left: 2px solid rgba(0, 255, 0, 0.4);
          border-right: 2px solid rgba(0, 255, 0, 0.4);
        }

        .negative-cell {
          color: #ff4444;
          font-weight: 600;
          text-align: center;
          text-shadow: 0 0 5px rgba(255, 68, 68, 0.3);
        }

        .strong-negative {
          background: rgba(255, 68, 68, 0.15);
          color: #ff4444;
          font-weight: 700;
          text-shadow: 0 0 8px rgba(255, 68, 68, 0.5);
          border-left: 2px solid rgba(255, 68, 68, 0.4);
          border-right: 2px solid rgba(255, 68, 68, 0.4);
        }

        .loading-cell {
          text-align: center;
          color: #666;
          font-style: italic;
        }

        .loading-dots {
          animation: loadingDots 1.5s infinite;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideIn {
          from {
            transform: translate(-50%, -60%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, -50%);
            opacity: 1;
          }
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes loadingDots {
          0%, 20% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.3;
          }
        }

        /* Scrollbar styling */
        .weekly-scan-content::-webkit-scrollbar {
          width: 8px;
        }

        .weekly-scan-content::-webkit-scrollbar-track {
          background: #0a0a0a;
        }

        .weekly-scan-content::-webkit-scrollbar-thumb {
          background: #ff6600;
          border-radius: 4px;
        }

        .weekly-scan-content::-webkit-scrollbar-thumb:hover {
          background: #ff8833;
        }
      `}</style>
    </>
  );
};

export default WeeklyScanModal;
