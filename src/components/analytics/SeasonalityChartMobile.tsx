'use client';

import React, { useState, useEffect } from 'react';
import PolygonService from '../../lib/polygonService';
import ElectionCycleService, { ElectionCycleData } from '../../lib/electionCycleService';
import GlobalDataCache from '../../lib/GlobalDataCache';
import SeasonaxSymbolSearch from './SeasonaxSymbolSearch';
import SeasonaxMainChart from './SeasonaxMainChart';
import SeasonaxControls from './SeasonaxControls';
import HorizontalMonthlyReturns from './HorizontalMonthlyReturns';

// Types for Polygon API data
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
  statistics: any;
  patternReturns: { [year: number]: number };
  spyComparison?: {
    monthlyData: Array<{ month: string; outperformance: number }>;
    best30DayPeriod?: any;
    worst30DayPeriod?: any;
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

export default function SeasonalityChartMobile() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('SPY');
  const [seasonalData, setSeasonalData] = useState<SeasonalAnalysis | null>(null);
  const [electionData, setElectionData] = useState<ElectionCycleData | null>(null);
  const [isElectionMode, setIsElectionMode] = useState<boolean>(false);
  const [selectedElectionPeriod, setSelectedElectionPeriod] = useState<string>('Election Year');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sweetSpotPeriod, setSweetSpotPeriod] = useState<any>(null);
  const [painPointPeriod, setPainPointPeriod] = useState<any>(null);
  const [displayElectionPeriod, setDisplayElectionPeriod] = useState<string>('Normal Mode');
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
    if (selectedSymbol) {
      loadSeasonalAnalysis(selectedSymbol);
    }
  }, [selectedSymbol]);

  const loadSeasonalAnalysis = async (symbol: string) => {
    setLoading(true);
    setError(null);
    try {
      const fromDate = new Date(Date.now() - chartSettings.yearsOfData * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];
      const data = await polygonService.getHistoricalData(symbol, fromDate, toDate);
      
      if (data?.results && data.results.length > 0) {
        const analysis = calculateSeasonalPattern(data.results, symbol);
        setSeasonalData(analysis);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const calculateSeasonalPattern = (data: any[], symbol: string): SeasonalAnalysis => {
    // Simplified calculation - you may need to import the full logic
    const dailyData: DailySeasonalData[] = [];
    return {
      symbol,
      companyName: symbol,
      currency: 'USD',
      period: `${chartSettings.yearsOfData} Years`,
      dailyData,
      statistics: {},
      patternReturns: {},
      spyComparison: {
        monthlyData: [
          { month: 'Jan', outperformance: 0 },
          { month: 'Feb', outperformance: 0 },
          { month: 'Mar', outperformance: 0 },
          { month: 'Apr', outperformance: 0 },
          { month: 'May', outperformance: 0 },
          { month: 'Jun', outperformance: 0 },
          { month: 'Jul', outperformance: 0 },
          { month: 'Aug', outperformance: 0 },
          { month: 'Sep', outperformance: 0 },
          { month: 'Oct', outperformance: 0 },
          { month: 'Nov', outperformance: 0 },
          { month: 'Dec', outperformance: 0 }
        ]
      }
    };
  };

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const handleSettingsChange = (newSettings: Partial<ChartSettings>) => {
    setChartSettings(prev => ({ ...prev, ...newSettings }));
  };

  const handleElectionPeriodSelect = (period: string) => {
    setDisplayElectionPeriod(period);
    setSelectedElectionPeriod(period);
  };

  const handleElectionModeToggle = (enabled: boolean) => {
    setIsElectionMode(enabled);
  };

  const handleRefresh = () => {
    loadSeasonalAnalysis(selectedSymbol);
  };

  const handleSweetSpotClick = () => {
    if (seasonalData?.spyComparison?.best30DayPeriod) {
      setSweetSpotPeriod(seasonalData.spyComparison.best30DayPeriod);
    }
  };

  const handlePainPointClick = () => {
    if (seasonalData?.spyComparison?.worst30DayPeriod) {
      setPainPointPeriod(seasonalData.spyComparison.worst30DayPeriod);
    }
  };

  return (
    <div className="seasonax-container">
      <div className="seasonax-header">
        <div className="header-group search-compare-group">
          <SeasonaxSymbolSearch 
            onSymbolSelect={handleSymbolChange} 
            initialSymbol={selectedSymbol}
            onElectionPeriodSelect={handleElectionPeriodSelect}
            onElectionModeToggle={handleElectionModeToggle}
          />
          <button className="compare-btn" onClick={() => {}}>+ COMPARE</button>
        </div>

        <SeasonaxControls 
          settings={{...chartSettings, smoothing: true, detrend: true, showCurrentDate: true}}
          onSettingsChange={handleSettingsChange}
          onRefresh={handleRefresh}
          hideToggleButtons={true}
          selectedElectionPeriod={displayElectionPeriod}
          onElectionPeriodSelect={handleElectionPeriodSelect}
          isElectionMode={isElectionMode}
          onElectionModeToggle={handleElectionModeToggle}
          hideCompareButton={true}
          showOnlyElectionAndYear={true}
        />

        <div className="sweet-pain-buttons">
          <button className="sweet-spot-btn compare-btn" onClick={handleSweetSpotClick}>Sweet Spot</button>
          <button className="pain-point-btn compare-btn" onClick={handlePainPointClick}>Pain Point</button>
        </div>

        {seasonalData?.spyComparison?.monthlyData && (
          <HorizontalMonthlyReturns 
            monthlyData={seasonalData.spyComparison.monthlyData}
            best30DayPeriod={seasonalData?.spyComparison?.best30DayPeriod}
            worst30DayPeriod={seasonalData?.spyComparison?.worst30DayPeriod}
          />
        )}
      </div>

      {loading && (
        <div className="seasonax-loading">
          <div className="loading-spinner"></div>
          <p>Loading seasonal analysis for {selectedSymbol}...</p>
        </div>
      )}

      {error && (
        <div className="seasonax-error">
          <p>{error}</p>
          <button onClick={() => loadSeasonalAnalysis(selectedSymbol)}>Retry</button>
        </div>
      )}

      {seasonalData && !loading && (
        <div style={{ width: '100%', maxHeight: '650px', height: '650px', position: 'relative' }}>
          <SeasonaxMainChart
            data={seasonalData as any}
            settings={chartSettings}
            sweetSpotPeriod={sweetSpotPeriod}
            painPointPeriod={painPointPeriod}
            selectedMonth={null}
          />
        </div>
      )}
    </div>
  );
}
