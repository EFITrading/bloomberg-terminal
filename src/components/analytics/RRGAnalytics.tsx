'use client';

import React, { useState, useEffect } from 'react';
import RRGChart from './RRGChart';
import RRGService, { RRGCalculationResult } from '@/lib/rrgService';
import './RRGAnalytics.css';

interface RRGAnalyticsProps {
  defaultTimeframe?: string;
  defaultBenchmark?: string;
}

const RRGAnalytics: React.FC<RRGAnalyticsProps> = ({
  defaultTimeframe = '14 weeks',
  defaultBenchmark = 'SPY'
}) => {
  const [rrgData, setRrgData] = useState<RRGCalculationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTails, setShowTails] = useState(true);
  const [tailLength, setTailLength] = useState(() => {
    // Load from localStorage or default to 10
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rrg-tail-length');
      return saved ? parseInt(saved, 10) : 10;
    }
    return 10;
  });
  const [timeframe, setTimeframe] = useState(defaultTimeframe);
  const [benchmark, setBenchmark] = useState(defaultBenchmark);
  const [selectedMode, setSelectedMode] = useState<'sectors' | 'custom'>('sectors');
  const [selectedSectorETF, setSelectedSectorETF] = useState<string | null>(null);
  const [customSymbols, setCustomSymbols] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const rrgService = new RRGService();

  // Handle tail length change with persistence
  const handleTailLengthChange = (newLength: number) => {
    setTailLength(newLength);
    if (typeof window !== 'undefined') {
      localStorage.setItem('rrg-tail-length', newLength.toString());
    }
  };

  const timeframeOptions = [
    { label: '4 weeks', value: '4 weeks', weeks: 8, rsPeriod: 4, momentumPeriod: 4 },
    { label: '8 weeks', value: '8 weeks', weeks: 12, rsPeriod: 8, momentumPeriod: 8 },
    { label: '14 weeks', value: '14 weeks', weeks: 18, rsPeriod: 14, momentumPeriod: 14 },
    { label: '26 weeks', value: '26 weeks', weeks: 30, rsPeriod: 26, momentumPeriod: 26 },
    { label: '52 weeks', value: '52 weeks', weeks: 56, rsPeriod: 52, momentumPeriod: 52 }
  ];

  const benchmarkOptions = [
    { label: 'S&P 500 (SPY)', value: 'SPY' },
    { label: 'NASDAQ 100 (QQQ)', value: 'QQQ' },
    { label: 'Russell 2000 (IWM)', value: 'IWM' },
    { label: 'Total Stock Market (VTI)', value: 'VTI' },
    { label: 'World Stock Index (VT)', value: 'VT' }
  ];

  const sectorETFs = {
    'XLK': {
      name: 'Technology Select Sector SPDR Fund',
      holdings: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'ORCL', 'ADBE', 'ACN', 'CSCO', 'AMD', 'INTC', 'IBM', 'TXN', 'QCOM', 'AMAT', 'MU', 'ADI', 'KLAC', 'LRCX', 'MCHP']
    },
    'XLF': {
      name: 'Financial Select Sector SPDR Fund',
      holdings: ['BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'AXP', 'PGR', 'BLK', 'C', 'SCHW', 'CB', 'MMC', 'ICE', 'CME', 'PNC', 'AON']
    },
    'XLV': {
      name: 'Health Care Select Sector SPDR Fund',
      holdings: ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'ELV', 'CVS', 'MDT', 'ISRG', 'VRTX', 'GILD', 'REGN', 'CI', 'HUM', 'AMGN', 'SYK']
    },
    'XLI': {
      name: 'Industrial Select Sector SPDR Fund',
      holdings: ['CAT', 'RTX', 'HON', 'UPS', 'LMT', 'BA', 'UNP', 'ADP', 'DE', 'MMM', 'GE', 'FDX', 'NOC', 'WM', 'EMR', 'ETN', 'ITW', 'CSX', 'CARR', 'NSC']
    },
    'XLY': {
      name: 'Consumer Discretionary Select Sector SPDR Fund',
      holdings: ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'NKE', 'LOW', 'SBUX', 'TJX', 'ORLY', 'GM', 'F', 'CMG', 'MAR', 'HLT', 'ABNB', 'RCL', 'CCL', 'NCLH', 'YUM']
    },
    'XLP': {
      name: 'Consumer Staples Select Sector SPDR Fund',
      holdings: ['PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'CL', 'KMB', 'GIS', 'K', 'HSY', 'CHD', 'CLX', 'SJM', 'CAG', 'CPB', 'MKC', 'TSN', 'HRL', 'LW']
    },
    'XLE': {
      name: 'Energy Select Sector SPDR Fund',
      holdings: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'BKR', 'HAL', 'DVN', 'FANG', 'APA', 'EQT', 'TPG', 'CTRA', 'MRO', 'OVV', 'HES']
    },
    'XLU': {
      name: 'Utilities Select Sector SPDR Fund',
      holdings: ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'VST', 'D', 'PCG', 'PEG', 'EXC', 'XEL', 'EIX', 'WEC', 'AWK', 'DTE', 'PPL', 'ES', 'AEE', 'CMS']
    },
    'XLRE': {
      name: 'Real Estate Select Sector SPDR Fund',
      holdings: ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WELL', 'DLR', 'O', 'SBAC', 'EQR', 'BXP', 'VTR', 'ESS', 'MAA', 'KIM', 'DOC', 'UDR', 'CPT', 'HST', 'REG']
    },
    'XLB': {
      name: 'Materials Select Sector SPDR Fund',
      holdings: ['LIN', 'SHW', 'APD', 'FCX', 'ECL', 'CTVA', 'VMC', 'MLM', 'NUE', 'DD', 'PPG', 'IFF', 'PKG', 'IP', 'CF', 'ALB', 'AMCR', 'EMN', 'CE', 'FMC']
    },
    'XLC': {
      name: 'Communication Services Select Sector SPDR Fund',
      holdings: ['GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'EA', 'TTWO', 'MTCH', 'ROKU', 'PINS', 'SNAP', 'TWTR', 'DISH', 'FOXA', 'FOX']
    }
  };

  const loadRRGData = async () => {
    setLoading(true);
    setError(null);

    try {
      const selectedTimeframe = timeframeOptions.find(tf => tf.value === timeframe);
      if (!selectedTimeframe) {
        throw new Error('Invalid timeframe selected');
      }

      let data: RRGCalculationResult[];

      if (selectedMode === 'sectors') {
        if (selectedSectorETF && sectorETFs[selectedSectorETF as keyof typeof sectorETFs]) {
          // Load holdings of selected sector ETF
          const etfInfo = sectorETFs[selectedSectorETF as keyof typeof sectorETFs];
          console.log(`🔄 Loading ${selectedSectorETF} holdings RRG data...`);
          data = await rrgService.calculateCustomRRG(
            etfInfo.holdings,
            selectedSectorETF,
            selectedTimeframe.weeks,
            selectedTimeframe.rsPeriod,
            selectedTimeframe.momentumPeriod,
            10
          );
        } else {
          // Load standard sector analysis
          console.log('🔄 Loading Sector RRG data...');
          data = await rrgService.calculateSectorRRG(
            selectedTimeframe.weeks,
            selectedTimeframe.rsPeriod,
            selectedTimeframe.momentumPeriod,
            10 // tail length
          );
        }
      } else {
        const symbols = customSymbols
          .split(',')
          .map(s => s && s.trim() ? s.trim().toUpperCase() : '')
          .filter(s => s.length > 0);

        if (symbols.length === 0) {
          throw new Error('Please enter at least one symbol for custom analysis');
        }

        console.log('🔄 Loading Custom RRG data...');
        data = await rrgService.calculateCustomRRG(
          symbols,
          benchmark,
          selectedTimeframe.weeks,
          selectedTimeframe.rsPeriod,
          selectedTimeframe.momentumPeriod,
          10
        );
      }

      setRrgData(data);
      console.log('✅ RRG data loaded successfully:', data.length, 'items');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load RRG data';
      setError(errorMessage);
      console.error('❌ RRG data loading failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadRRGData();
    setRefreshing(false);
  };

  // Load data on component mount and when settings change
  useEffect(() => {
    loadRRGData();
  }, [timeframe, benchmark, selectedMode, selectedSectorETF]);

  const getQuadrantSummary = () => {
    const summary = {
      leading: rrgData.filter(d => d.rsRatio >= 100 && d.rsMomentum >= 100),
      weakening: rrgData.filter(d => d.rsRatio >= 100 && d.rsMomentum < 100),
      lagging: rrgData.filter(d => d.rsRatio < 100 && d.rsMomentum < 100),
      improving: rrgData.filter(d => d.rsRatio < 100 && d.rsMomentum >= 100)
    };

    return summary;
  };

  const quadrantSummary = getQuadrantSummary();

  return (
    <div className="rrg-analytics-container">
      <div className="rrg-analytics-header">
        <div className="header-title">
          <h2>🎯 Relative Rotation Graph (RRG) Analytics</h2>
          <p>
            Professional-grade sector rotation analysis powered by real-time data
            {selectedSectorETF && (
              <span className="analysis-mode-indicator">
                • Analyzing {selectedSectorETF} Holdings
              </span>
            )}
          </p>
        </div>
        
      </div>

      {loading && (
        <div className="rrg-loading">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <h3>Loading RRG Data...</h3>
            <p>Fetching historical price data and calculating relative rotation metrics</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rrg-error">
          <div className="error-content">
            <h3>❌ Error Loading Data</h3>
            <p>{error}</p>
            <button onClick={loadRRGData} className="retry-btn">
              🔄 Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && rrgData.length > 0 && (
        <>
          <RRGChart
            data={rrgData}
            benchmark={benchmark}
            width={1500}
            height={950}
            showTails={showTails}
            tailLength={tailLength}
            timeframe={timeframe}
            onShowTailsChange={setShowTails}
            onTailLengthChange={handleTailLengthChange}
            onLookbackChange={(index) => {
              console.log(`Lookback changed to ${index} weeks ago`);
            }}
            onRefresh={refreshData}
            // Pass control props
            selectedMode={selectedMode}
            selectedSectorETF={selectedSectorETF}
            customSymbols={customSymbols}
            timeframeOptions={timeframeOptions}
            benchmarkOptions={benchmarkOptions}
            sectorETFs={sectorETFs}
            onModeChange={setSelectedMode}
            onSectorETFChange={setSelectedSectorETF}
            onCustomSymbolsChange={setCustomSymbols}
            onBenchmarkChange={setBenchmark}
            onTimeframeChange={setTimeframe}
            loading={loading}
          />

          <div className="rrg-summary">
            <div className="summary-header">
              <h3>📈 Quadrant Analysis Summary</h3>
              <p>
                Current positioning of {
                  selectedSectorETF 
                    ? `${selectedSectorETF} holdings` 
                    : selectedMode === 'sectors' 
                      ? 'sectors' 
                      : 'securities'
                } relative to {selectedSectorETF || benchmark}
              </p>
              {selectedSectorETF && (
                <div className="etf-analysis-note">
                  <span className="etf-name">
                    📊 Analyzing {sectorETFs[selectedSectorETF as keyof typeof sectorETFs].name}
                  </span>
                  <span className="holdings-count">
                    {sectorETFs[selectedSectorETF as keyof typeof sectorETFs].holdings.length} holdings
                  </span>
                </div>
              )}
            </div>

            <div className="quadrant-cards">
              <div className="quadrant-card leading">
                <div className="card-header">
                  <h4>🚀 Leading ({quadrantSummary.leading.length})</h4>
                  <span>Strong RS, Improving Momentum</span>
                </div>
                <div className="card-content">
                  {quadrantSummary.leading.map(item => (
                    <div key={item.symbol} className="security-item">
                      <span className="symbol">{item.symbol}</span>
                      <span className="metrics">
                        RS: {item.rsRatio.toFixed(1)} | Mom: {item.rsMomentum.toFixed(1)}
                      </span>
                    </div>
                  ))}
                  {quadrantSummary.leading.length === 0 && (
                    <span className="no-items">No items in this quadrant</span>
                  )}
                </div>
              </div>

              <div className="quadrant-card weakening">
                <div className="card-header">
                  <h4>⚠️ Weakening ({quadrantSummary.weakening.length})</h4>
                  <span>Strong RS, Declining Momentum</span>
                </div>
                <div className="card-content">
                  {quadrantSummary.weakening.map(item => (
                    <div key={item.symbol} className="security-item">
                      <span className="symbol">{item.symbol}</span>
                      <span className="metrics">
                        RS: {item.rsRatio.toFixed(1)} | Mom: {item.rsMomentum.toFixed(1)}
                      </span>
                    </div>
                  ))}
                  {quadrantSummary.weakening.length === 0 && (
                    <span className="no-items">No items in this quadrant</span>
                  )}
                </div>
              </div>

              <div className="quadrant-card lagging">
                <div className="card-header">
                  <h4>📉 Lagging ({quadrantSummary.lagging.length})</h4>
                  <span>Weak RS, Declining Momentum</span>
                </div>
                <div className="card-content">
                  {quadrantSummary.lagging.map(item => (
                    <div key={item.symbol} className="security-item">
                      <span className="symbol">{item.symbol}</span>
                      <span className="metrics">
                        RS: {item.rsRatio.toFixed(1)} | Mom: {item.rsMomentum.toFixed(1)}
                      </span>
                    </div>
                  ))}
                  {quadrantSummary.lagging.length === 0 && (
                    <span className="no-items">No items in this quadrant</span>
                  )}
                </div>
              </div>

              <div className="quadrant-card improving">
                <div className="card-header">
                  <h4>📈 Improving ({quadrantSummary.improving.length})</h4>
                  <span>Weak RS, Improving Momentum</span>
                </div>
                <div className="card-content">
                  {quadrantSummary.improving.map(item => (
                    <div key={item.symbol} className="security-item">
                      <span className="symbol">{item.symbol}</span>
                      <span className="metrics">
                        RS: {item.rsRatio.toFixed(1)} | Mom: {item.rsMomentum.toFixed(1)}
                      </span>
                    </div>
                  ))}
                  {quadrantSummary.improving.length === 0 && (
                    <span className="no-items">No items in this quadrant</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default RRGAnalytics;
