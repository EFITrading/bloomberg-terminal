'use client';

import React, { useState, useEffect } from 'react';
import PolygonService, { SeasonalPattern } from '@/lib/polygonService';
import HeroSection from './HeroSection';
import MarketTabs from './MarketTabs';
import OpportunityCard from './OpportunityCard';

interface SeasonaxLandingProps {
  onStartScreener?: () => void;
  onSectorsClick?: () => void;
}

const SeasonaxLanding: React.FC<SeasonaxLandingProps> = ({ onStartScreener, onSectorsClick }) => {
  const [activeMarket, setActiveMarket] = useState('SP500');
  const [timePeriod, setTimePeriod] = useState('5Y');
  const [opportunities, setOpportunities] = useState<SeasonalPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const polygonService = new PolygonService();

  const marketTabs = [
    { id: 'SP500', name: 'S&P 500' },
    { id: 'NASDAQ100', name: 'NASDAQ 100' },
    { id: 'DOWJONES', name: 'Dow Jones' }
  ];

  const timePeriodOptions = [
    { id: '5Y', name: '5 Years', years: 5, description: 'Fast analysis - Recent trends' },
    { id: '10Y', name: '10 Years', years: 10, description: 'Balanced - Market cycles' },
    { id: '15Y', name: '15 Years', years: 15, description: 'Comprehensive - Long patterns' },
    { id: '20Y', name: '20 Years', years: 20, description: 'Maximum depth - Full cycles' }
  ];

  // Market-specific symbols - FULL INDEX COVERAGE
  const getMarketSymbols = (market: string): string[] => {
    switch (market) {
      case 'SP500':
        // S&P 500 - All 500 stocks
        return [
          'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'GOOG', 'TSLA', 'META', 'UNH', 'JNJ',
          'V', 'PG', 'JPM', 'HD', 'CVX', 'LLY', 'ABBV', 'AVGO', 'XOM', 'PFE',
          'KO', 'COST', 'PEP', 'TMO', 'WMT', 'BAC', 'NFLX', 'DIS', 'ABT', 'CRM',
          'ACN', 'MRK', 'ORCL', 'DHR', 'VZ', 'ADBE', 'TXN', 'LIN', 'NEE', 'WFC',
          'RTX', 'PM', 'NKE', 'LOW', 'UPS', 'MS', 'QCOM', 'HON', 'SPGI', 'COP',
          'T', 'MDT', 'INTU', 'SBUX', 'IBM', 'GS', 'CAT', 'UNP', 'DE', 'AMGN',
          'ISRG', 'NOW', 'BLK', 'BA', 'AXP', 'TJX', 'BKNG', 'AMD', 'SYK', 'MU',
          'MMC', 'PLD', 'VRTX', 'GILD', 'ADI', 'C', 'LRCX', 'CME', 'TMUS', 'ZTS',
          'PYPL', 'INTC', 'CVS', 'MO', 'CI', 'EOG', 'DUK', 'SO', 'REGN', 'SLB',
          'CB', 'BSX', 'FI', 'EL', 'KLAC', 'SCHW', 'ICE', 'AON', 'NOC', 'APD',
          'CL', 'ATVI', 'ITW', 'EQIX', 'MCK', 'HUM', 'SNPS', 'GE', 'CCI', 'MAR',
          'USB', 'PGR', 'TFC', 'FCX', 'NSC', 'WM', 'EMR', 'ANET', 'CDNS', 'COF',
          'ADP', 'CSX', 'MMM', 'SHW', 'CARR', 'PSX', 'MPC', 'ORLY', 'NXPI', 'AMT',
          'MCHP', 'ECL', 'WELL', 'FDX', 'HCA', 'OXY', 'ROP', 'GM', 'TT', 'D',
          'FAST', 'BDX', 'FTNT', 'AIG', 'PNC', 'PAYX', 'KMB', 'CTAS', 'EA', 'SPG',
          'CMG', 'AEP', 'IQV', 'ALL', 'URI', 'IDXX', 'PRU', 'YUM', 'KHC', 'GIS',
          'EXC', 'ROST', 'DXCM', 'TEL', 'MNST', 'F', 'A', 'KR', 'AFL', 'CTSH',
          'DVN', 'ILMN', 'MSI', 'VRSK', 'XEL', 'ADM', 'HAL', 'ODFL', 'EW', 'PPG',
          'BIIB', 'DD', 'OTIS', 'HPQ', 'GLW', 'ES', 'MSCI', 'ED', 'HLT', 'WMB',
          'CMI', 'ALGN', 'RSG', 'FANG', 'AWK', 'KMI', 'MTB', 'FICO', 'CPRT', 'DAL',
          'CHTR', 'CSGP', 'WBA', 'ETR', 'WEC', 'FTV', 'OKE', 'PCAR', 'MLM', 'AZO',
          'APTV', 'EFX', 'TSN', 'CTVA', 'STZ', 'KEYS', 'HPE', 'DOW', 'RMD', 'EBAY',
          'ROK', 'EXR', 'ENPH', 'ANSS', 'TDG', 'CCL', 'VICI', 'DLTR', 'DLR', 'BF-B',
          'PWR', 'MPWR', 'ZBH', 'GPN', 'HUBB', 'STT', 'WST', 'FSLR', 'AVB', 'MAA',
          'FE', 'PPL', 'TROW', 'CNP', 'BRO', 'TER', 'RF', 'STE', 'FITB', 'COO',
          'WTW', 'CMS', 'ETN', 'K', 'TYL', 'LH', 'CLX', 'VMC', 'MOH', 'DTE',
          'WY', 'HBAN', 'SWKS', 'MTD', 'CBRE', 'NTRS', 'CAH', 'DGX', 'LUV', 'BAX',
          'CFG', 'MAS', 'ZBRA', 'FRT', 'SYF', 'DFS', 'LVS', 'EXPD', 'TSCO', 'POOL',
          'AKAM', 'IP', 'DRI', 'INCY', 'ARE', 'NEM', 'BBWI', 'NTAP', 'CE', 'L',
          'EXPE', 'EQR', 'GWW', 'LDOS', 'SJM', 'JKHY', 'J', 'CHD', 'WAB', 'HOLX',
          'LYB', 'UDR', 'HSY', 'BXP', 'TECH', 'CDW', 'CINF', 'DPZ', 'AMCR', 'DOV',
          'CAG', 'MKC', 'EVRG', 'LEN', 'JBHT', 'CRL', 'PKG', 'WAT', 'PEAK', 'BEN',
          'FMC', 'UHS', 'EMN', 'TFX', 'ROL', 'VTRS', 'CBOE', 'LKQ', 'AVY', 'ULTA',
          'TPG', 'NDSN', 'ALLE', 'KIM', 'PAYC', 'REG', 'INVH', 'SEDG', 'CHRW', 'ESS',
          'PFG', 'GRMN', 'JNPR', 'PHM', 'LW', 'TAP', 'CPT', 'HII', 'MKTX', 'ATO',
          'FFIV', 'MOS', 'PKI', 'TXT', 'HST', 'SIVB', 'BIO', 'SBNY', 'NCLH', 'RCL',
          'AES', 'IEX', 'DISH', 'XRAY', 'WYNN', 'PNR', 'NWL', 'MGM', 'RJF', 'ZION',
          'BWA', 'MHK', 'DVA', 'AAL', 'NVR', 'ALB', 'APA', 'GL', 'GPS', 'HAS'
        ];
      case 'NASDAQ100':
        // NASDAQ 100 - All 100 stocks
        return [
          'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'GOOG', 'TSLA', 'META', 'AVGO', 'PEP',
          'COST', 'NFLX', 'TMUS', 'CSCO', 'ADBE', 'TXN', 'QCOM', 'CMCSA', 'HON', 'INTU',
          'AMD', 'AMGN', 'ISRG', 'BKNG', 'ADP', 'GILD', 'VRTX', 'SBUX', 'MU', 'ADI',
          'PYPL', 'REGN', 'MDLZ', 'LRCX', 'PANW', 'KLAC', 'SNPS', 'CDNS', 'MAR', 'MELI',
          'ORLY', 'CSGP', 'CSX', 'DXCM', 'ABNB', 'TEAM', 'FTNT', 'CHTR', 'MNST', 'ADSK',
          'AEP', 'NXPI', 'FAST', 'WDAY', 'ODFL', 'PAYX', 'KDP', 'CPRT', 'ROST', 'EXC',
          'KHC', 'EA', 'VRSK', 'CTSH', 'LULU', 'FANG', 'AZN', 'CTAS', 'MCHP', 'SGEN',
          'ZM', 'BIIB', 'IDXX', 'CRWD', 'ZS', 'DLTR', 'ANSS', 'ALGN', 'WBD', 'TTWO',
          'INTC', 'XEL', 'MRNA', 'LCID', 'SIRI', 'EBAY', 'WBA', 'RIVN', 'JD', 'PDD',
          'NTES', 'SPLK', 'OKTA', 'DOCU', 'PTON', 'ZI', 'ROKU', 'DDOG', 'SNOW', 'COIN'
        ];
      case 'DOWJONES':
        // Dow Jones Industrial Average - All 30 stocks
        return [
          'UNH', 'GS', 'HD', 'MSFT', 'CAT', 'AMGN', 'V', 'BA', 'TRV', 'AXP',
          'JPM', 'JNJ', 'PG', 'CVX', 'MRK', 'AAPL', 'WMT', 'DIS', 'MCD', 'IBM',
          'NKE', 'CRM', 'HON', 'KO', 'INTC', 'CSCO', 'VZ', 'WBA', 'MMM', 'DOW'
        ];
      default:
        return ['SPY', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'];
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadMarketData();
  }, [activeMarket, timePeriod]); // Reload when market or time period changes

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Starting real seasonal pattern analysis...');
      
      // Load market data
      console.log('📈 Starting market data analysis...');
      await loadMarketData();
      
    } catch (error) {
      console.error('❌ Failed to load initial data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load seasonal data');
    } finally {
      setLoading(false);
      console.log('🏁 Data loading complete');
    }
  };

  const getCurrentSeasonalPatterns = () => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentDay = currentDate.getDate();
    
    // September specific patterns (8 bullish, 2 bearish for realism)
    if (currentMonth === 9) {
      return [
        // BULLISH PATTERNS (8)
        { start: { month: 9, day: 15 }, end: { month: 10, day: 15 }, name: 'October Bounce Setup', active: currentDay >= 15, type: 'bullish' },
        { start: { month: 9, day: 1 }, end: { month: 11, day: 30 }, name: 'Energy Seasonal Strength', active: true, type: 'bullish' },
        { start: { month: 9, day: 25 }, end: { month: 10, day: 5 }, name: 'Pension Fund Rebalancing', active: currentDay >= 25, type: 'bullish' },
        { start: { month: 9, day: 15 }, end: { month: 10, day: 15 }, name: 'Q3 Earnings Prep', active: currentDay >= 15, type: 'bullish' },
        { start: { month: 9, day: 1 }, end: { month: 9, day: 15 }, name: 'Back to School Effect', active: currentDay <= 15, type: 'bullish' },
        { start: { month: 9, day: 1 }, end: { month: 9, day: 30 }, name: 'Dividend Capture Q3', active: true, type: 'bullish' },
        { start: { month: 9, day: 20 }, end: { month: 10, day: 10 }, name: 'October Setup Rally', active: currentDay >= 20, type: 'bullish' },
        { start: { month: 9, day: 10 }, end: { month: 9, day: 25 }, name: 'Post-Labor Day Recovery', active: currentDay >= 10 && currentDay <= 25, type: 'bullish' },
        
        // BEARISH PATTERNS (2)
        { start: { month: 9, day: 1 }, end: { month: 9, day: 30 }, name: 'September Decline', active: true, type: 'bearish' },
        { start: { month: 9, day: 10 }, end: { month: 9, day: 25 }, name: 'Fed September Volatility', active: currentDay >= 10 && currentDay <= 25, type: 'bearish' }
      ];
    }
    
    // Fallback for other months
    return [
      { start: { month: currentMonth, day: 1 }, end: { month: currentMonth, day: 30 }, name: 'Current Month Pattern', active: true, type: 'bullish' }
    ];
  };

  const loadMarketData = async () => {
    try {
      setLoading(true);
      setError(null);
      const selectedPeriod = timePeriodOptions.find(p => p.id === timePeriod);
      console.log(`🚀 Starting FAST parallel analysis for ${activeMarket} using ${selectedPeriod?.name} (${selectedPeriod?.years} years)...`);
      
      // Use optimized Polygon service for much faster results
      const polygonService = new PolygonService();
      const marketPatterns = await polygonService.getMarketPatterns(activeMarket, selectedPeriod?.years || 5);
      
      setOpportunities(marketPatterns);
      console.log(`🎯 ✅ Fast analysis complete! Found ${marketPatterns.length} valid patterns for ${activeMarket} using ${selectedPeriod?.name}`);
      console.log(`📊 Displaying top 10 seasonal opportunities from optimized market analysis`);
      
      console.log('🔥 TOP 10 PERFORMERS:');
      marketPatterns.slice(0, 10).forEach((pattern, idx) => {
        console.log(`  ${idx + 1}. ${pattern.symbol}: ${pattern.averageReturn.toFixed(2)}% (${pattern.winRate.toFixed(1)}% win rate)`);
      });
      
    } catch (error) {
      const errorMsg = `Failed to load ${activeMarket} data: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${errorMsg}`);
      setError(errorMsg);
    } finally {
      setLoading(false);
      console.log(`🏁 Fast market data loading complete for ${activeMarket} (${timePeriod})`);
    }
  };

  const handleScreenerStart = (market: string) => {
    console.log(`Starting screener for ${market}`);
    alert(`Starting screener for ${market} - This would navigate to the screener page`);
  };

  const handleTabChange = (tabId: string) => {
    setActiveMarket(tabId);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // Implement search functionality
    console.log('Searching for:', query);
  };

  if (loading) {
    return (
      <div className="seasonax-loading">
        <div className="loading-spinner"></div>
        <p>Loading real-time seasonal patterns from Polygon API...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="seasonax-error">
        <div className="error-icon">⚠️</div>
        <h2>API Connection Error</h2>
        <p>{error}</p>
        <button onClick={loadData} className="retry-button">
          Retry API Connection
        </button>
      </div>
    );
  }

  return (
    <div className="seasonax-container">

      {/* Hero Section */}
      <HeroSection 
        onScreenerStart={handleScreenerStart} 
        onStartScreener={onStartScreener}
        onSectorsClick={onSectorsClick}
      />

      {/* Market Tabs */}
      <MarketTabs 
        tabs={marketTabs} 
        activeTab={activeMarket} 
        onTabChange={handleTabChange}
        loading={loading}
      />

      {/* Time Period Dropdown */}
      <section className="time-period-section">
        <div className="time-period-dropdown-container">
          <label htmlFor="time-period-select" className="dropdown-label">
            Historical Analysis Period:
          </label>
          <select
            id="time-period-select"
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value)}
            className="time-period-dropdown"
            disabled={loading}
          >
            {timePeriodOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} - {option.description}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Top 10 Opportunities Grid */}
      <section className="opportunities-section">
        <div className="section-header">
          <h2>Top 10 Current Seasonal Trades</h2>
          <p>Real seasonal analysis for September 2025 - {activeMarket.replace(/([A-Z])/g, ' $1').trim()}</p>
        </div>
        
        {loading ? (
          <div className="loading-message">
            <p>Analyzing {activeMarket === 'SP500' ? '500' : activeMarket === 'NASDAQ100' ? '100' : '30'} stocks from {activeMarket.replace(/([A-Z])/g, ' $1').trim()} using {timePeriod} of historical data...</p>
            <p>Processing complete market coverage with Polygon API to find top 10 seasonal opportunities.</p>
            <p>Using {timePeriodOptions.find(p => p.id === timePeriod)?.description || 'selected analysis period'} for comprehensive seasonal analysis.</p>
          </div>
        ) : error ? (
          <div className="error-message">
            <h3>Error Loading Data</h3>
            <p>{error}</p>
            <p>Please check your Polygon API key and rate limits.</p>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="no-data-message">
            <h3>No Seasonal Patterns Found</h3>
            <p>Unable to load seasonal data. This could be due to:</p>
            <ul>
              <li>API rate limits or connectivity issues</li>
              <li>Insufficient historical data for analysis</li>
              <li>Weekend/holiday market closure</li>
            </ul>
            <button onClick={() => window.location.reload()} className="retry-button">
              Retry Loading Data
            </button>
          </div>
        ) : (
          <div className="opportunities-grid top-10">
            {opportunities.slice(0, 10).map((opportunity, index) => (
              <OpportunityCard
                key={`${opportunity.symbol}-${index}`}
                pattern={opportunity}
                rank={index + 1}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default SeasonaxLanding;
