'use client';

import React, { useState, useEffect } from 'react';
import PolygonService from '@/lib/polygonService';
import GlobalDataCache from '@/lib/GlobalDataCache';
import HoldingsModal from '@/components/seasonax/HoldingsModal';

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

const WeeklyScanTable: React.FC = () => {
  const [sectorsData, setSectorsData] = useState<WeeklyData[]>([]);
  const [industriesData, setIndustriesData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekRanges, setWeekRanges] = useState<WeekRange[]>([]);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'sectors' | 'industries'>('sectors');
  const [holdingsModalOpen, setHoldingsModalOpen] = useState(false);
  const [selectedETF, setSelectedETF] = useState<{ symbol: string; name: string }>({ symbol: '', name: '' });

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
    calculateWeekRanges();
    loadRealSeasonalData();
  }, []);

  const calculateWeekRanges = () => {
    const today = new Date();
    const weeks: WeekRange[] = [];

    for (let i = 0; i < 4; i++) {
      const weekStart = getWeekStart(today, i);
      const weekEnd = getWeekEnd(weekStart);
      const label = formatWeekLabel(weekStart, weekEnd);
      weeks.push({ start: weekStart, end: weekEnd, label });
    }

    setWeekRanges(weeks);
  };

  const getWeekStart = (referenceDate: Date, weekOffset: number): Date => {
    const date = new Date(referenceDate);
    const currentDay = date.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    date.setDate(date.getDate() - daysToMonday);
    date.setDate(date.getDate() + (weekOffset * 7));
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const getWeekEnd = (weekStart: Date): Date => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 4);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  };

  const formatWeekLabel = (start: Date, end: Date): string => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startMonth = monthNames[start.getMonth()];
    const startDay = start.getDate();
    const endMonth = monthNames[end.getMonth()];
    const endDay = end.getDate();
    
    if (start.getMonth() === end.getMonth()) {
      return `${startMonth} ${startDay} - ${endDay}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  };

  const initializeData = () => {
    const initialSectorsData = sectors.map(sector => ({
      symbol: sector.symbol,
      name: sector.name,
      week1: null, week2: null, week3: null, week4: null
    }));

    const initialIndustriesData = industries.map(industry => ({
      symbol: industry.symbol,
      name: industry.name,
      week1: null, week2: null, week3: null, week4: null
    }));

    setSectorsData(initialSectorsData);
    setIndustriesData(initialIndustriesData);
  };

  const loadRealSeasonalData = async () => {
    setLoading(true);
    setLoadingStatus('Initializing seasonal analysis...');
    
    const today = new Date();
    const weeks: WeekRange[] = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = getWeekStart(today, i);
      const weekEnd = getWeekEnd(weekStart);
      weeks.push({ start: weekStart, end: weekEnd, label: formatWeekLabel(weekStart, weekEnd) });
    }

    try {
      initializeData();

      setLoadingStatus('Loading SPY benchmark data (10 years)...');
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      
      const spyStartDate = tenYearsAgo.toISOString().split('T')[0];
      const spyEndDate = new Date().toISOString().split('T')[0];
      
      const spyData = await polygonService.getHistoricalData('SPY', spyStartDate, spyEndDate);
      
      if (!spyData || !spyData.results || spyData.results.length === 0) {
        throw new Error('Failed to load SPY benchmark data');
      }

      setLoadingStatus('Analyzing sector seasonal patterns...');
      const sectorsPromises = sectors.map(sector => 
        calculateSeasonalPerformance(sector.symbol, sector.name, weeks, spyData.results)
      );
      const sectorsResults = await Promise.all(sectorsPromises);
      setSectorsData(sectorsResults);

      setLoadingStatus('Analyzing industry seasonal patterns...');
      const industriesPromises = industries.map(industry => 
        calculateSeasonalPerformance(industry.symbol, industry.name, weeks, spyData.results)
      );
      const industriesResults = await Promise.all(industriesPromises);
      setIndustriesData(industriesResults);

      setLoadingStatus('Analysis complete!');
    } catch (error) {
      console.error('Error loading seasonal data:', error);
      setLoadingStatus('Error loading data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculateSeasonalPerformance = async (
    symbol: string,
    name: string,
    weeks: WeekRange[],
    spyResults: PolygonDataPoint[]
  ): Promise<WeeklyData> => {
    try {
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
        return { symbol, name, week1: null, week2: null, week3: null, week4: null };
      }

      const weeklyReturns = weeks.map((week) => {
        return calculateWeeklySeasonalReturn(symbol, symbolData.results, spyResults, week.start, week.end);
      });

      const [week1, week2, week3, week4] = weeklyReturns;
      return { symbol, name, week1, week2, week3, week4 };
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
      return { symbol, name, week1: null, week2: null, week3: null, week4: null };
    }
  };

  const calculateWeeklySeasonalReturn = (
    symbol: string,
    symbolData: PolygonDataPoint[],
    spyData: PolygonDataPoint[],
    weekStart: Date,
    weekEnd: Date
  ): number | null => {
    try {
      const startMonth = weekStart.getMonth();
      const startDay = weekStart.getDate();
      const endMonth = weekEnd.getMonth();
      const endDay = weekEnd.getDate();

      const historicalWeekReturns: number[] = [];
      
      for (let yearOffset = 1; yearOffset <= 10; yearOffset++) {
        const historicalYear = new Date().getFullYear() - yearOffset;
        const historicalWeekStart = new Date(historicalYear, startMonth, startDay);
        const historicalWeekEnd = new Date(historicalYear, endMonth, endDay);
        
        const symbolWeekData = findWeekData(symbolData, historicalWeekStart, historicalWeekEnd);
        
        if (symbolWeekData.start && symbolWeekData.end) {
          // Absolute return - no SPY benchmarking
          const symbolWeekReturn = ((symbolWeekData.end.c - symbolWeekData.start.c) / symbolWeekData.start.c) * 100;
          historicalWeekReturns.push(symbolWeekReturn);
        }
      }

      if (historicalWeekReturns.length === 0) return null;
      return historicalWeekReturns.reduce((sum, ret) => sum + ret, 0) / historicalWeekReturns.length;
    } catch (error) {
      return null;
    }
  };

  const findWeekData = (
    data: PolygonDataPoint[],
    weekStart: Date,
    weekEnd: Date
  ): { start: PolygonDataPoint | null; end: PolygonDataPoint | null } => {
    let startPoint: PolygonDataPoint | null = null;
    let endPoint: PolygonDataPoint | null = null;

    const weekStartTime = weekStart.getTime();
    const weekEndTime = weekEnd.getTime();

    for (let i = 0; i < data.length; i++) {
      const dataPoint = data[i];
      const dataTime = dataPoint.t;
      
      if (dataTime >= weekStartTime && !startPoint) {
        startPoint = dataPoint;
      }
      
      if (dataTime >= weekStartTime && dataTime <= weekEndTime) {
        endPoint = dataPoint;
      }
      
      if (dataTime > weekEndTime) break;
    }

    return { start: startPoint, end: endPoint };
  };

  const getTickerGlowStyle = () => {
    // Crisp orange text - 100% opacity, no glow
    return { color: '#ff6600', textShadow: 'none', fontWeight: '900' as const, opacity: 1 };
  };

  const renderTableCell = (value: number | null) => {
    if (value === null) {
      return <td style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', padding: '12px 10px', fontSize: '18px' }}>...</td>;
    }
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    let cellStyle: React.CSSProperties = { textAlign: 'center', padding: '12px 10px', fontSize: '18px' };
    
    if (numValue >= 0.60) {
      cellStyle = { ...cellStyle, backgroundColor: 'rgba(0, 255, 0, 0.15)', color: '#00ff00', fontWeight: 700 };
    } else if (numValue > 0) {
      cellStyle = { ...cellStyle, color: '#00ff00', fontWeight: 600 };
    } else if (numValue <= -0.60) {
      cellStyle = { ...cellStyle, backgroundColor: 'rgba(255, 68, 68, 0.15)', color: '#ff4444', fontWeight: 700 };
    } else {
      cellStyle = { ...cellStyle, color: '#ff4444', fontWeight: 600 };
    }
    
    const displayValue = numValue >= 0 ? `+${numValue.toFixed(2)}%` : `${numValue.toFixed(2)}%`;
    return <td style={cellStyle}>{displayValue}</td>;
  };

  return (
    <div className="weekly-scan-table-container">
      <div className="weekly-scan-tabs">
        <button 
          className={`weekly-tab ${activeTab === 'sectors' ? 'active' : ''}`}
          onClick={() => setActiveTab('sectors')}
        >
          SECTORS ({sectors.length})
        </button>
        <button 
          className={`weekly-tab ${activeTab === 'industries' ? 'active' : ''}`}
          onClick={() => setActiveTab('industries')}
        >
          INDUSTRIES ({industries.length})
        </button>
      </div>

      {loading ? (
        <div className="weekly-loading">
          <div className="loading-spinner-small"></div>
          <p>{loadingStatus}</p>
        </div>
      ) : (
        <div className="weekly-table-wrapper">
          <table className="weekly-scan-table-inline">
            <thead>
              <tr>
                <th>SYMBOL</th>
                <th>{activeTab === 'sectors' ? 'SECTOR' : 'INDUSTRY'}</th>
                <th>{weekRanges[0]?.label || 'Week 1'}</th>
                <th>{weekRanges[1]?.label || 'Week 2'}</th>
                <th>{weekRanges[2]?.label || 'Week 3'}</th>
                <th>{weekRanges[3]?.label || 'Week 4'}</th>
              </tr>
            </thead>
            <tbody>
              {(activeTab === 'sectors' ? sectorsData : industriesData).map((item, index) => (
                <tr 
                  key={item.symbol} 
                  className={index % 2 === 0 ? 'even-row' : 'odd-row'}
                  onClick={() => {
                    setSelectedETF({ symbol: item.symbol, name: item.name });
                    setHoldingsModalOpen(true);
                  }}
                  style={{ cursor: 'pointer' }}
                  title={`Click to view ${item.symbol} holdings`}
                >
                  <td className="symbol-cell" style={getTickerGlowStyle()}>{item.symbol}</td>
                  <td className="name-cell">{item.name}</td>
                  {renderTableCell(item.week1)}
                  {renderTableCell(item.week2)}
                  {renderTableCell(item.week3)}
                  {renderTableCell(item.week4)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .weekly-scan-table-container {
          background: #000;
          border: 1px solid #333;
          border-radius: 6px;
          padding: 16px;
          margin-top: 20px;
        }

        .weekly-scan-tabs {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .weekly-tab {
          padding: 14px 32px;
          background: linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 50%, #000000 100%);
          border: 1px solid #2a2a2a;
          border-radius: 4px;
          color: #555555;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          position: relative;
          overflow: hidden;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 4px 12px rgba(0, 0, 0, 0.5),
            0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .weekly-tab::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
        }

        .weekly-tab:hover {
          color: #888888;
          background: linear-gradient(180deg, #222222 0%, #111111 50%, #050505 100%);
          border-color: #3a3a3a;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 6px 16px rgba(0, 0, 0, 0.6),
            0 2px 4px rgba(0, 0, 0, 0.4);
          transform: translateY(-1px);
        }

        .weekly-tab.active {
          color: #ff6600 !important;
          background: linear-gradient(180deg, #0d0d0d 0%, #000000 50%, #000000 100%);
          border-color: #ff6600;
          box-shadow: 
            inset 0 0 30px rgba(255, 102, 0, 0.08),
            0 0 20px rgba(255, 102, 0, 0.15),
            0 4px 12px rgba(0, 0, 0, 0.5);
        }

        .weekly-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 15%;
          right: 15%;
          height: 2px;
          background: #ff6600;
          box-shadow: 0 0 10px rgba(255, 102, 0, 0.8);
        }

        .weekly-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px;
          color: #888;
        }

        .loading-spinner-small {
          width: 30px;
          height: 30px;
          border: 2px solid #333;
          border-top: 2px solid #ff6600;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 12px;
        }

        .weekly-table-wrapper {
          overflow-x: auto;
        }

        .weekly-scan-table-inline {
          width: 100%;
          border-collapse: collapse;
          font-family: 'JetBrains Mono', monospace;
          font-size: 18px;
        }

        .weekly-scan-table-inline thead {
          background: #000;
          border-bottom: 2px solid #ff6600;
        }

        .weekly-scan-table-inline th {
          padding: 14px 12px;
          text-align: left;
          font-size: 20px;
          font-weight: 700;
          color: #ff6600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .weekly-scan-table-inline th:nth-child(n+3) {
          text-align: center;
        }

        .weekly-scan-table-inline tbody tr {
          border-bottom: 1px solid #1a1a1a;
          transition: background 0.2s ease;
        }

        .weekly-scan-table-inline tbody tr:hover {
          background: rgba(255, 102, 0, 0.08);
        }

        .even-row {
          background: #000;
        }

        .odd-row {
          background: #000;
        }

        .symbol-cell {
          font-weight: 900;
          text-align: center;
          padding: 14px 12px;
          font-size: 18px;
          color: #ff6600 !important;
        }

        .name-cell {
          color: #aaa;
          padding: 14px 12px;
          font-size: 18px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <HoldingsModal
        isOpen={holdingsModalOpen}
        onClose={() => setHoldingsModalOpen(false)}
        etfSymbol={selectedETF.symbol}
        etfName={selectedETF.name}
        weekRanges={weekRanges}
      />
    </div>
  );
};

export default WeeklyScanTable;
