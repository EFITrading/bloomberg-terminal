'use client';

import React, { useState, useEffect } from 'react';
import PolygonService from '@/lib/polygonService';
import GlobalDataCache from '@/lib/GlobalDataCache';

interface HoldingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  etfSymbol: string;
  etfName: string;
  weekRanges: WeekRange[];
}

interface WeekRange {
  start: Date;
  end: Date;
  label: string;
}

interface HoldingData {
  symbol: string;
  name: string;
  weight: number;
  week1: number | null;
  week2: number | null;
  week3: number | null;
  week4: number | null;
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

// Top 10 holdings for each ETF
const ETF_HOLDINGS: { [key: string]: Array<{ symbol: string; name: string; weight: number }> } = {
  // Technology Sector
  'XLK': [
    { symbol: 'AAPL', name: 'Apple Inc', weight: 22.5 },
    { symbol: 'MSFT', name: 'Microsoft Corp', weight: 21.8 },
    { symbol: 'NVDA', name: 'NVIDIA Corp', weight: 15.2 },
    { symbol: 'AVGO', name: 'Broadcom Inc', weight: 4.8 },
    { symbol: 'CRM', name: 'Salesforce Inc', weight: 3.2 },
    { symbol: 'ORCL', name: 'Oracle Corp', weight: 2.9 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', weight: 2.7 },
    { symbol: 'ADBE', name: 'Adobe Inc', weight: 2.5 },
    { symbol: 'CSCO', name: 'Cisco Systems', weight: 2.3 },
    { symbol: 'ACN', name: 'Accenture PLC', weight: 2.1 }
  ],
  // Financials Sector
  'XLF': [
    { symbol: 'BRK.B', name: 'Berkshire Hathaway', weight: 12.8 },
    { symbol: 'JPM', name: 'JPMorgan Chase', weight: 10.2 },
    { symbol: 'V', name: 'Visa Inc', weight: 7.8 },
    { symbol: 'MA', name: 'Mastercard Inc', weight: 6.5 },
    { symbol: 'BAC', name: 'Bank of America', weight: 4.9 },
    { symbol: 'WFC', name: 'Wells Fargo', weight: 3.8 },
    { symbol: 'GS', name: 'Goldman Sachs', weight: 2.9 },
    { symbol: 'MS', name: 'Morgan Stanley', weight: 2.7 },
    { symbol: 'SPGI', name: 'S&P Global', weight: 2.5 },
    { symbol: 'AXP', name: 'American Express', weight: 2.3 }
  ],
  // Healthcare Sector
  'XLV': [
    { symbol: 'UNH', name: 'UnitedHealth Group', weight: 10.5 },
    { symbol: 'LLY', name: 'Eli Lilly', weight: 9.8 },
    { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 7.2 },
    { symbol: 'ABBV', name: 'AbbVie Inc', weight: 5.5 },
    { symbol: 'MRK', name: 'Merck & Co', weight: 4.8 },
    { symbol: 'TMO', name: 'Thermo Fisher', weight: 3.9 },
    { symbol: 'ABT', name: 'Abbott Labs', weight: 3.5 },
    { symbol: 'PFE', name: 'Pfizer Inc', weight: 3.2 },
    { symbol: 'DHR', name: 'Danaher Corp', weight: 3.0 },
    { symbol: 'BMY', name: 'Bristol Myers Squibb', weight: 2.8 }
  ],
  // Energy Sector
  'XLE': [
    { symbol: 'XOM', name: 'Exxon Mobil', weight: 22.5 },
    { symbol: 'CVX', name: 'Chevron Corp', weight: 16.8 },
    { symbol: 'COP', name: 'ConocoPhillips', weight: 7.2 },
    { symbol: 'SLB', name: 'Schlumberger', weight: 5.5 },
    { symbol: 'EOG', name: 'EOG Resources', weight: 4.8 },
    { symbol: 'MPC', name: 'Marathon Petroleum', weight: 4.2 },
    { symbol: 'PSX', name: 'Phillips 66', weight: 3.9 },
    { symbol: 'VLO', name: 'Valero Energy', weight: 3.5 },
    { symbol: 'OXY', name: 'Occidental Petroleum', weight: 3.2 },
    { symbol: 'HES', name: 'Hess Corp', weight: 2.8 }
  ],
  // Consumer Discretionary
  'XLY': [
    { symbol: 'AMZN', name: 'Amazon.com', weight: 23.5 },
    { symbol: 'TSLA', name: 'Tesla Inc', weight: 16.2 },
    { symbol: 'HD', name: 'Home Depot', weight: 8.5 },
    { symbol: 'MCD', name: 'McDonalds', weight: 4.2 },
    { symbol: 'NKE', name: 'Nike Inc', weight: 3.8 },
    { symbol: 'LOW', name: 'Lowes Companies', weight: 3.5 },
    { symbol: 'SBUX', name: 'Starbucks', weight: 3.2 },
    { symbol: 'TJX', name: 'TJX Companies', weight: 2.9 },
    { symbol: 'BKNG', name: 'Booking Holdings', weight: 2.7 },
    { symbol: 'CMG', name: 'Chipotle Mexican Grill', weight: 2.5 }
  ],
  // Consumer Staples
  'XLP': [
    { symbol: 'PG', name: 'Procter & Gamble', weight: 14.2 },
    { symbol: 'COST', name: 'Costco Wholesale', weight: 12.5 },
    { symbol: 'WMT', name: 'Walmart Inc', weight: 11.8 },
    { symbol: 'KO', name: 'Coca-Cola', weight: 7.5 },
    { symbol: 'PEP', name: 'PepsiCo Inc', weight: 7.2 },
    { symbol: 'PM', name: 'Philip Morris', weight: 5.8 },
    { symbol: 'MO', name: 'Altria Group', weight: 4.5 },
    { symbol: 'MDLZ', name: 'Mondelez Intl', weight: 4.2 },
    { symbol: 'CL', name: 'Colgate-Palmolive', weight: 3.9 },
    { symbol: 'KMB', name: 'Kimberly-Clark', weight: 3.5 }
  ],
  // Industrials
  'XLI': [
    { symbol: 'GE', name: 'General Electric', weight: 5.5 },
    { symbol: 'CAT', name: 'Caterpillar Inc', weight: 5.2 },
    { symbol: 'RTX', name: 'Raytheon Technologies', weight: 4.8 },
    { symbol: 'UNP', name: 'Union Pacific', weight: 4.5 },
    { symbol: 'BA', name: 'Boeing Co', weight: 4.2 },
    { symbol: 'HON', name: 'Honeywell Intl', weight: 4.0 },
    { symbol: 'UPS', name: 'United Parcel Service', weight: 3.8 },
    { symbol: 'LMT', name: 'Lockheed Martin', weight: 3.5 },
    { symbol: 'DE', name: 'Deere & Co', weight: 3.2 },
    { symbol: 'MMM', name: '3M Company', weight: 3.0 }
  ],
  // Materials
  'XLB': [
    { symbol: 'LIN', name: 'Linde PLC', weight: 18.5 },
    { symbol: 'APD', name: 'Air Products', weight: 8.2 },
    { symbol: 'SHW', name: 'Sherwin-Williams', weight: 7.5 },
    { symbol: 'ECL', name: 'Ecolab Inc', weight: 6.8 },
    { symbol: 'FCX', name: 'Freeport-McMoRan', weight: 5.5 },
    { symbol: 'NEM', name: 'Newmont Corp', weight: 5.2 },
    { symbol: 'DD', name: 'DuPont de Nemours', weight: 4.8 },
    { symbol: 'DOW', name: 'Dow Inc', weight: 4.5 },
    { symbol: 'VMC', name: 'Vulcan Materials', weight: 4.2 },
    { symbol: 'MLM', name: 'Martin Marietta', weight: 3.9 }
  ],
  // Real Estate
  'XLRE': [
    { symbol: 'PLD', name: 'Prologis Inc', weight: 12.5 },
    { symbol: 'AMT', name: 'American Tower', weight: 10.2 },
    { symbol: 'EQIX', name: 'Equinix Inc', weight: 8.5 },
    { symbol: 'PSA', name: 'Public Storage', weight: 6.8 },
    { symbol: 'SPG', name: 'Simon Property', weight: 5.5 },
    { symbol: 'WELL', name: 'Welltower Inc', weight: 5.2 },
    { symbol: 'DLR', name: 'Digital Realty', weight: 4.8 },
    { symbol: 'O', name: 'Realty Income', weight: 4.5 },
    { symbol: 'AVB', name: 'AvalonBay Communities', weight: 4.2 },
    { symbol: 'EQR', name: 'Equity Residential', weight: 3.9 }
  ],
  // Communications
  'XLC': [
    { symbol: 'META', name: 'Meta Platforms', weight: 22.5 },
    { symbol: 'GOOGL', name: 'Alphabet Class A', weight: 11.8 },
    { symbol: 'GOOG', name: 'Alphabet Class C', weight: 11.2 },
    { symbol: 'NFLX', name: 'Netflix Inc', weight: 8.5 },
    { symbol: 'DIS', name: 'Walt Disney', weight: 7.2 },
    { symbol: 'CMCSA', name: 'Comcast Corp', weight: 6.5 },
    { symbol: 'VZ', name: 'Verizon Communications', weight: 5.8 },
    { symbol: 'T', name: 'AT&T Inc', weight: 5.2 },
    { symbol: 'TMUS', name: 'T-Mobile US', weight: 4.8 },
    { symbol: 'EA', name: 'Electronic Arts', weight: 3.5 }
  ],
  // Utilities
  'XLU': [
    { symbol: 'NEE', name: 'NextEra Energy', weight: 15.2 },
    { symbol: 'DUK', name: 'Duke Energy', weight: 8.5 },
    { symbol: 'SO', name: 'Southern Company', weight: 7.8 },
    { symbol: 'D', name: 'Dominion Energy', weight: 6.5 },
    { symbol: 'AEP', name: 'American Electric Power', weight: 5.8 },
    { symbol: 'EXC', name: 'Exelon Corp', weight: 5.2 },
    { symbol: 'SRE', name: 'Sempra Energy', weight: 4.8 },
    { symbol: 'XEL', name: 'Xcel Energy', weight: 4.5 },
    { symbol: 'PCG', name: 'PG&E Corp', weight: 4.2 },
    { symbol: 'ED', name: 'Consolidated Edison', weight: 3.9 }
  ],
  // Industry ETFs
  'SMH': [
    { symbol: 'NVDA', name: 'NVIDIA Corp', weight: 21.5 },
    { symbol: 'TSM', name: 'Taiwan Semiconductor', weight: 12.8 },
    { symbol: 'AVGO', name: 'Broadcom Inc', weight: 8.5 },
    { symbol: 'ASML', name: 'ASML Holding', weight: 7.2 },
    { symbol: 'AMD', name: 'Advanced Micro Devices', weight: 6.5 },
    { symbol: 'QCOM', name: 'Qualcomm Inc', weight: 5.8 },
    { symbol: 'INTC', name: 'Intel Corp', weight: 5.2 },
    { symbol: 'MU', name: 'Micron Technology', weight: 4.8 },
    { symbol: 'TXN', name: 'Texas Instruments', weight: 4.5 },
    { symbol: 'AMAT', name: 'Applied Materials', weight: 4.2 }
  ],
  'IGV': [
    { symbol: 'MSFT', name: 'Microsoft Corp', weight: 18.5 },
    { symbol: 'CRM', name: 'Salesforce Inc', weight: 9.2 },
    { symbol: 'ORCL', name: 'Oracle Corp', weight: 8.5 },
    { symbol: 'ADBE', name: 'Adobe Inc', weight: 7.8 },
    { symbol: 'NOW', name: 'ServiceNow Inc', weight: 6.5 },
    { symbol: 'INTU', name: 'Intuit Inc', weight: 5.8 },
    { symbol: 'SNOW', name: 'Snowflake Inc', weight: 4.5 },
    { symbol: 'WDAY', name: 'Workday Inc', weight: 4.2 },
    { symbol: 'TEAM', name: 'Atlassian Corp', weight: 3.9 },
    { symbol: 'ZM', name: 'Zoom Video', weight: 3.5 }
  ],
  'XOP': [
    { symbol: 'COP', name: 'ConocoPhillips', weight: 12.5 },
    { symbol: 'EOG', name: 'EOG Resources', weight: 10.2 },
    { symbol: 'OXY', name: 'Occidental Petroleum', weight: 8.5 },
    { symbol: 'HES', name: 'Hess Corp', weight: 7.2 },
    { symbol: 'DVN', name: 'Devon Energy', weight: 6.5 },
    { symbol: 'FANG', name: 'Diamondback Energy', weight: 5.8 },
    { symbol: 'MRO', name: 'Marathon Oil', weight: 5.2 },
    { symbol: 'APA', name: 'APA Corp', weight: 4.8 },
    { symbol: 'CTRA', name: 'Coterra Energy', weight: 4.5 },
    { symbol: 'EQT', name: 'EQT Corp', weight: 4.2 }
  ],
  'OIH': [
    { symbol: 'SLB', name: 'Schlumberger', weight: 18.5 },
    { symbol: 'HAL', name: 'Halliburton', weight: 12.8 },
    { symbol: 'BKR', name: 'Baker Hughes', weight: 10.2 },
    { symbol: 'NOV', name: 'NOV Inc', weight: 8.5 },
    { symbol: 'FTI', name: 'TechnipFMC', weight: 6.8 },
    { symbol: 'HP', name: 'Helmerich & Payne', weight: 5.5 },
    { symbol: 'CHX', name: 'ChampionX Corp', weight: 4.8 },
    { symbol: 'WTTR', name: 'Select Water Solutions', weight: 4.2 },
    { symbol: 'PTEN', name: 'Patterson-UTI Energy', weight: 3.9 },
    { symbol: 'LBRT', name: 'Liberty Energy', weight: 3.5 }
  ],
  'FDN': [
    { symbol: 'AMZN', name: 'Amazon.com', weight: 15.5 },
    { symbol: 'META', name: 'Meta Platforms', weight: 12.8 },
    { symbol: 'GOOGL', name: 'Alphabet Class A', weight: 10.2 },
    { symbol: 'NFLX', name: 'Netflix Inc', weight: 8.5 },
    { symbol: 'BKNG', name: 'Booking Holdings', weight: 6.8 },
    { symbol: 'ABNB', name: 'Airbnb Inc', weight: 5.5 },
    { symbol: 'UBER', name: 'Uber Technologies', weight: 5.2 },
    { symbol: 'DASH', name: 'DoorDash Inc', weight: 4.8 },
    { symbol: 'SPOT', name: 'Spotify Technology', weight: 4.2 },
    { symbol: 'EBAY', name: 'eBay Inc', weight: 3.9 }
  ],
  'XRT': [
    { symbol: 'AMZN', name: 'Amazon.com', weight: 8.5 },
    { symbol: 'HD', name: 'Home Depot', weight: 7.2 },
    { symbol: 'LOW', name: 'Lowes Companies', weight: 6.5 },
    { symbol: 'TJX', name: 'TJX Companies', weight: 5.8 },
    { symbol: 'COST', name: 'Costco Wholesale', weight: 5.5 },
    { symbol: 'WMT', name: 'Walmart Inc', weight: 5.2 },
    { symbol: 'TGT', name: 'Target Corp', weight: 4.8 },
    { symbol: 'DG', name: 'Dollar General', weight: 4.5 },
    { symbol: 'ROST', name: 'Ross Stores', weight: 4.2 },
    { symbol: 'BBY', name: 'Best Buy', weight: 3.9 }
  ],
  'KIE': [
    { symbol: 'BRK.B', name: 'Berkshire Hathaway', weight: 10.5 },
    { symbol: 'PGR', name: 'Progressive Corp', weight: 8.2 },
    { symbol: 'CB', name: 'Chubb Ltd', weight: 7.5 },
    { symbol: 'TRV', name: 'Travelers Companies', weight: 6.8 },
    { symbol: 'ALL', name: 'Allstate Corp', weight: 6.2 },
    { symbol: 'AIG', name: 'American Intl Group', weight: 5.8 },
    { symbol: 'MMC', name: 'Marsh & McLennan', weight: 5.5 },
    { symbol: 'AON', name: 'Aon PLC', weight: 5.2 },
    { symbol: 'AJG', name: 'Arthur J Gallagher', weight: 4.8 },
    { symbol: 'MET', name: 'MetLife Inc', weight: 4.5 }
  ],
  'KRE': [
    { symbol: 'JPM', name: 'JPMorgan Chase', weight: 9.5 },
    { symbol: 'BAC', name: 'Bank of America', weight: 8.2 },
    { symbol: 'WFC', name: 'Wells Fargo', weight: 7.5 },
    { symbol: 'USB', name: 'US Bancorp', weight: 6.8 },
    { symbol: 'PNC', name: 'PNC Financial', weight: 6.2 },
    { symbol: 'TFC', name: 'Truist Financial', weight: 5.8 },
    { symbol: 'CFG', name: 'Citizens Financial', weight: 5.2 },
    { symbol: 'KEY', name: 'KeyCorp', weight: 4.8 },
    { symbol: 'FITB', name: 'Fifth Third Bancorp', weight: 4.5 },
    { symbol: 'RF', name: 'Regions Financial', weight: 4.2 }
  ],
  'JETS': [
    { symbol: 'AAL', name: 'American Airlines', weight: 12.5 },
    { symbol: 'DAL', name: 'Delta Air Lines', weight: 11.8 },
    { symbol: 'UAL', name: 'United Airlines', weight: 11.2 },
    { symbol: 'LUV', name: 'Southwest Airlines', weight: 10.5 },
    { symbol: 'ALK', name: 'Alaska Air Group', weight: 8.5 },
    { symbol: 'JBLU', name: 'JetBlue Airways', weight: 7.2 },
    { symbol: 'HA', name: 'Hawaiian Holdings', weight: 6.5 },
    { symbol: 'SAVE', name: 'Spirit Airlines', weight: 5.8 },
    { symbol: 'ULCC', name: 'Frontier Group', weight: 5.2 },
    { symbol: 'SKYW', name: 'SkyWest Inc', weight: 4.8 }
  ],
  'GDX': [
    { symbol: 'NEM', name: 'Newmont Corp', weight: 15.5 },
    { symbol: 'GOLD', name: 'Barrick Gold', weight: 12.8 },
    { symbol: 'FNV', name: 'Franco-Nevada', weight: 8.5 },
    { symbol: 'AEM', name: 'Agnico Eagle Mines', weight: 7.2 },
    { symbol: 'WPM', name: 'Wheaton Precious Metals', weight: 6.5 },
    { symbol: 'KGC', name: 'Kinross Gold', weight: 5.8 },
    { symbol: 'AU', name: 'AngloGold Ashanti', weight: 5.2 },
    { symbol: 'RGLD', name: 'Royal Gold', weight: 4.8 },
    { symbol: 'HMY', name: 'Harmony Gold Mining', weight: 4.2 },
    { symbol: 'GFI', name: 'Gold Fields Ltd', weight: 3.9 }
  ],
  'ITA': [
    { symbol: 'RTX', name: 'Raytheon Technologies', weight: 18.5 },
    { symbol: 'BA', name: 'Boeing Co', weight: 16.2 },
    { symbol: 'LMT', name: 'Lockheed Martin', weight: 14.8 },
    { symbol: 'GD', name: 'General Dynamics', weight: 10.5 },
    { symbol: 'NOC', name: 'Northrop Grumman', weight: 9.2 },
    { symbol: 'HWM', name: 'Howmet Aerospace', weight: 5.8 },
    { symbol: 'TDG', name: 'TransDigm Group', weight: 5.2 },
    { symbol: 'HII', name: 'Huntington Ingalls', weight: 4.5 },
    { symbol: 'LHX', name: 'L3Harris Technologies', weight: 4.2 },
    { symbol: 'AXON', name: 'Axon Enterprise', weight: 3.9 }
  ],
  'TAN': [
    { symbol: 'ENPH', name: 'Enphase Energy', weight: 12.5 },
    { symbol: 'FSLR', name: 'First Solar', weight: 11.8 },
    { symbol: 'SEDG', name: 'SolarEdge Technologies', weight: 9.5 },
    { symbol: 'RUN', name: 'Sunrun Inc', weight: 8.2 },
    { symbol: 'NEE', name: 'NextEra Energy', weight: 7.5 },
    { symbol: 'NOVA', name: 'Sunnova Energy', weight: 6.8 },
    { symbol: 'CSIQ', name: 'Canadian Solar', weight: 6.2 },
    { symbol: 'JKS', name: 'JinkoSolar Holding', weight: 5.8 },
    { symbol: 'DQ', name: 'Daqo New Energy', weight: 5.2 },
    { symbol: 'ARRY', name: 'Array Technologies', weight: 4.8 }
  ],
  'XHB': [
    { symbol: 'DHI', name: 'DR Horton', weight: 14.5 },
    { symbol: 'LEN', name: 'Lennar Corp', weight: 12.8 },
    { symbol: 'NVR', name: 'NVR Inc', weight: 10.2 },
    { symbol: 'PHM', name: 'PulteGroup', weight: 9.5 },
    { symbol: 'TOL', name: 'Toll Brothers', weight: 8.2 },
    { symbol: 'BLD', name: 'TopBuild Corp', weight: 7.5 },
    { symbol: 'TMHC', name: 'Taylor Morrison', weight: 6.8 },
    { symbol: 'KBH', name: 'KB Home', weight: 6.2 },
    { symbol: 'MTH', name: 'Meritage Homes', weight: 5.8 },
    { symbol: 'MHO', name: 'M/I Homes', weight: 5.2 }
  ],
  'XME': [
    { symbol: 'FCX', name: 'Freeport-McMoRan', weight: 15.5 },
    { symbol: 'NEM', name: 'Newmont Corp', weight: 12.8 },
    { symbol: 'GOLD', name: 'Barrick Gold', weight: 9.5 },
    { symbol: 'SCCO', name: 'Southern Copper', weight: 8.2 },
    { symbol: 'VALE', name: 'Vale SA', weight: 7.5 },
    { symbol: 'NUE', name: 'Nucor Corp', weight: 6.8 },
    { symbol: 'STLD', name: 'Steel Dynamics', weight: 6.2 },
    { symbol: 'X', name: 'United States Steel', weight: 5.8 },
    { symbol: 'CLF', name: 'Cleveland-Cliffs', weight: 5.2 },
    { symbol: 'MP', name: 'MP Materials', weight: 4.8 }
  ]
};

const HoldingsModal: React.FC<HoldingsModalProps> = ({ isOpen, onClose, etfSymbol, etfName, weekRanges }) => {
  const [holdingsData, setHoldingsData] = useState<HoldingData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');

  useEffect(() => {
    if (isOpen && etfSymbol) {
      loadHoldingsData();
    }
  }, [isOpen, etfSymbol]);

  const loadHoldingsData = async () => {
    setLoading(true);
    setLoadingStatus(`Loading holdings for ${etfSymbol}...`);

    try {
      const holdings = ETF_HOLDINGS[etfSymbol];
      
      if (!holdings || holdings.length === 0) {
        setLoadingStatus('No holdings data available for this ETF');
        setLoading(false);
        return;
      }

      // Initialize with null data
      const initialHoldings = holdings.map(h => ({
        symbol: h.symbol,
        name: h.name,
        weight: h.weight,
        week1: null,
        week2: null,
        week3: null,
        week4: null
      }));
      setHoldingsData(initialHoldings);

      // Fetch SPY data for benchmark
      setLoadingStatus('Loading SPY benchmark data...');
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      
      const spyStartDate = tenYearsAgo.toISOString().split('T')[0];
      const spyEndDate = new Date().toISOString().split('T')[0];
      
      const spyData = await polygonService.getHistoricalData('SPY', spyStartDate, spyEndDate);
      
      if (!spyData || !spyData.results) {
        throw new Error('Failed to load SPY data');
      }

      // Process each holding
      setLoadingStatus('Analyzing holdings performance...');
      const holdingsPromises = holdings.map(holding =>
        calculateHoldingPerformance(holding, weekRanges, spyData.results)
      );
      
      const results = await Promise.all(holdingsPromises);
      setHoldingsData(results);
      
      setLoadingStatus('Analysis complete!');
    } catch (error) {
      console.error('Error loading holdings data:', error);
      setLoadingStatus('Error loading holdings data');
    } finally {
      setLoading(false);
    }
  };

  const calculateHoldingPerformance = async (
    holding: { symbol: string; name: string; weight: number },
    weeks: WeekRange[],
    spyResults: PolygonDataPoint[]
  ): Promise<HoldingData> => {
    try {
      console.log(`📈 Analyzing ${holding.symbol}...`);
      
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      
      const startDate = tenYearsAgo.toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];
      
      const cache = GlobalDataCache.getInstance();
      const cacheKey = GlobalDataCache.keys.HISTORICAL_DATA(holding.symbol, startDate, endDate);
      
      let symbolData = cache.get(cacheKey);
      if (!symbolData) {
        symbolData = await polygonService.getHistoricalData(holding.symbol, startDate, endDate);
        if (symbolData) {
          cache.set(cacheKey, symbolData);
        }
      }

      if (!symbolData || !symbolData.results || symbolData.results.length === 0) {
        console.warn(`⚠️ No data for ${holding.symbol}`);
        return { ...holding, week1: null, week2: null, week3: null, week4: null };
      }

      const weeklyReturns = weeks.map(week =>
        calculateWeeklySeasonalReturn(holding.symbol, symbolData.results, spyResults, week.start, week.end)
      );

      const [week1, week2, week3, week4] = weeklyReturns;

      return {
        symbol: holding.symbol,
        name: holding.name,
        weight: holding.weight,
        week1,
        week2,
        week3,
        week4
      };
    } catch (error) {
      console.error(`Error analyzing ${holding.symbol}:`, error);
      return { ...holding, week1: null, week2: null, week3: null, week4: null };
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
        const spyWeekData = findWeekData(spyData, historicalWeekStart, historicalWeekEnd);
        
        if (symbolWeekData.start && symbolWeekData.end && spyWeekData.start && spyWeekData.end) {
          const symbolWeekReturn = ((symbolWeekData.end.c - symbolWeekData.start.c) / symbolWeekData.start.c) * 100;
          const spyWeekReturn = ((spyWeekData.end.c - spyWeekData.start.c) / spyWeekData.start.c) * 100;
          const relativeReturn = symbolWeekReturn - spyWeekReturn;
          historicalWeekReturns.push(relativeReturn);
        }
      }

      if (historicalWeekReturns.length === 0) {
        return null;
      }

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
      
      if (dataTime > weekEndTime) {
        break;
      }
    }

    return { start: startPoint, end: endPoint };
  };

  // Check if holding has 3+ strong positive or negative cells
  const getTickerGlowStyle = (data: HoldingData) => {
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
    let cellStyle: React.CSSProperties = {
      textAlign: 'center',
      padding: '12px 10px',
      fontSize: '12px'
    };
    
    if (numValue >= 0.60) {
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
      cellStyle = {
        ...cellStyle,
        color: '#00ff00',
        fontWeight: 600,
        textShadow: '0 0 5px rgba(0, 255, 0, 0.3)'
      };
    } else if (numValue <= -0.60) {
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
      cellStyle = {
        ...cellStyle,
        color: '#ff4444',
        fontWeight: 600,
        textShadow: '0 0 5px rgba(255, 68, 68, 0.3)'
      };
    }
    
    const displayValue = numValue >= 0 ? `+${numValue.toFixed(2)}%` : `${numValue.toFixed(2)}%`;
    
    return (
      <td style={cellStyle}>
        {displayValue}
      </td>
    );
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="holdings-overlay" onClick={onClose} />
      <div className="holdings-modal">
        <div className="holdings-header">
          <div className="header-content">
            <h3 className="modal-title">{etfSymbol} - TOP 10 HOLDINGS</h3>
            <p className="modal-subtitle">{etfName}</p>
          </div>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>{loadingStatus}</p>
          </div>
        ) : (
          <div className="holdings-content">
            <div className="table-container">
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th className="symbol-col">Symbol</th>
                    <th className="name-col">Company</th>
                    <th className="weight-col">Weight</th>
                    <th className="week-col">{weekRanges[0]?.label || 'Week 1'}</th>
                    <th className="week-col">{weekRanges[1]?.label || 'Week 2'}</th>
                    <th className="week-col">{weekRanges[2]?.label || 'Week 3'}</th>
                    <th className="week-col">{weekRanges[3]?.label || 'Week 4'}</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingsData.map((holding, index) => (
                    <tr key={holding.symbol} className={index % 2 === 0 ? 'even-row' : 'odd-row'}>
                      <td className="symbol-cell" style={{ 
                        ...getTickerGlowStyle(holding),
                        fontSize: '14px',
                        letterSpacing: '1px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.8) 100%)'
                      }}>
                        <span style={getTickerGlowStyle(holding)}>{holding.symbol}</span>
                      </td>
                      <td className="name-cell">{holding.name}</td>
                      <td className="weight-cell">{holding.weight.toFixed(1)}%</td>
                      {renderTableCell(holding.week1)}
                      {renderTableCell(holding.week2)}
                      {renderTableCell(holding.week3)}
                      {renderTableCell(holding.week4)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .holdings-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 10000;
        }

        .holdings-modal {
          position: fixed;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 90%;
          max-width: 1100px;
          max-height: 80vh;
          background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
          border: 2px solid #ff6600;
          border-radius: 6px;
          box-shadow: 0 15px 50px rgba(255, 102, 0, 0.4);
          z-index: 10001;
          overflow: hidden;
          animation: modalSlideIn 0.3s ease-out;
        }

        .holdings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 28px;
          background: linear-gradient(90deg, #000 0%, #1a1a1a 100%);
          border-bottom: 2px solid #ff6600;
        }

        .modal-title {
          font-size: 20px;
          font-weight: 700;
          color: #ff6600;
          margin: 0 0 6px 0;
          letter-spacing: 1.2px;
          text-shadow: 0 0 8px rgba(255, 102, 0, 0.5);
        }

        .modal-subtitle {
          font-size: 12px;
          color: #999;
          margin: 0;
        }

        .close-button {
          width: 36px;
          height: 36px;
          background: transparent;
          border: 2px solid #ff6600;
          border-radius: 4px;
          color: #ff6600;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
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
          padding: 50px;
          color: #ff6600;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #333;
          border-top: 3px solid #ff6600;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        .holdings-content {
          padding: 24px;
          overflow-y: auto;
          max-height: calc(80vh - 100px);
        }

        .table-container {
          background: #000;
          border: 1px solid #333;
          border-radius: 4px;
          overflow: hidden;
          box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.8);
        }

        .holdings-table {
          width: 100%;
          border-collapse: collapse;
          font-family: 'Courier New', monospace;
        }

        .holdings-table thead {
          background: linear-gradient(180deg, #000 0%, #0a0a0a 100%);
          border-bottom: 2px solid #ff6600;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        }

        .holdings-table th {
          padding: 14px 10px;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          color: #ff6600;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          border-right: 1px solid #0a0a0a;
          background: linear-gradient(180deg, #000 0%, #050505 100%);
          box-shadow: inset 0 1px 2px rgba(255, 102, 0, 0.1);
        }

        .holdings-table th:last-child {
          border-right: none;
        }

        .symbol-col {
          width: 10%;
          text-align: center !important;
        }

        .name-col {
          width: 25%;
        }

        .weight-col {
          width: 10%;
          text-align: center !important;
        }

        .week-col {
          width: 13.75%;
          text-align: center !important;
        }

        .holdings-table tbody tr {
          border-bottom: 1px solid #0a0a0a;
          transition: all 0.2s ease;
        }

        .even-row {
          background: linear-gradient(90deg, #000 0%, #020202 100%);
        }

        .odd-row {
          background: linear-gradient(90deg, #000 0%, #000 100%);
        }

        .holdings-table tbody tr:hover {
          background: linear-gradient(90deg, rgba(255, 102, 0, 0.08) 0%, rgba(255, 102, 0, 0.05) 100%);
          border-left: 3px solid #ff6600;
          box-shadow: inset 0 0 10px rgba(255, 102, 0, 0.1);
        }

        .holdings-table td {
          padding: 12px 10px;
          font-size: 12px;
          border-right: 1px solid #0a0a0a;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.8) 100%);
          box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.5);
        }

        .holdings-table td:last-child {
          border-right: none;
        }

        .symbol-cell {
          color: #ff6600 !important;
          font-weight: 900;
          text-align: center;
          font-size: 14px;
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

        .name-cell {
          color: #ccc;
          font-weight: 500;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
        }

        .weight-cell {
          color: #999;
          font-weight: 600;
          text-align: center;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
        }

        @keyframes modalSlideIn {
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
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .holdings-content::-webkit-scrollbar {
          width: 6px;
        }

        .holdings-content::-webkit-scrollbar-track {
          background: #0a0a0a;
        }

        .holdings-content::-webkit-scrollbar-thumb {
          background: #ff6600;
          border-radius: 3px;
        }
      `}</style>
    </>
  );
};

export default HoldingsModal;
