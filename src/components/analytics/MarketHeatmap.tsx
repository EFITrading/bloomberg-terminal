'use client';

import React, { useState, useEffect, useRef } from 'react';
import './MarketHeatmap.css';
import * as d3Hierarchy from 'd3-hierarchy';
import * as d3 from 'd3';

interface HeatmapStock {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  logoUrl?: string;
  weight?: number; // For sizing based on market cap
}

interface SectorData {
  name: string;
  stocks: HeatmapStock[];
  avgChange: number;
}

interface BreadthHistoryPoint {
  timestamp: number;
  advancing: number;
  declining: number;
  ratio: number;
}

interface SectorBreadthPoint {
  timestamp: number;
  sectorRatios: { [key: string]: number };
}

const MarketHeatmap: React.FC = () => {
  const [heatmapData, setHeatmapData] = useState<SectorData[]>([]);
  const [fullHeatmapData, setFullHeatmapData] = useState<SectorData[]>([]);
  const [filteredSector, setFilteredSector] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedView, setSelectedView] = useState<'sectors' | 'industries' | 'indices' | 'breadth'>('sectors');
  const [selectedETF, setSelectedETF] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState<'symbol' | 'price' | 'change' | 'volume'>('change');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [hoveredStock, setHoveredStock] = useState<HeatmapStock | null>(null);
  const [showStats, setShowStats] = useState(true);
  const [timePeriod, setTimePeriod] = useState<'today' | 'week' | 'mtd' | 'ytd' | '1y'>('today');
  const [breadthHistory, setBreadthHistory] = useState<BreadthHistoryPoint[]>([]);
  const [sectorBreadthHistory, setSectorBreadthHistory] = useState<SectorBreadthPoint[]>([]);
  const [zoomTransform, setZoomTransform] = useState<any>(null);
  const [sectorZoomTransform, setSectorZoomTransform] = useState<any>(null);
  const breadthChartRef = useRef<SVGSVGElement>(null);
  const sectorBreadthChartRef = useRef<SVGSVGElement>(null);

  const industryETFs = {
    'IGV': {
      name: 'Software',
      holdings: ['MSFT', 'AAPL', 'NVDA', 'CRM', 'ORCL', 'ADBE', 'NOW', 'INTU', 'PANW', 'WDAY']
    },
    'SMH': {
      name: 'Semiconductors',
      holdings: ['TSM', 'NVDA', 'AVGO', 'AMD', 'QCOM', 'MU', 'INTC', 'AMAT', 'ADI', 'MRVL']
    },
    'XRT': {
      name: 'Retail',
      holdings: ['AMZN', 'HD', 'LOW', 'TJX', 'TGT', 'COST', 'WMT', 'DG', 'DLTR', 'BBY']
    },
    'KIE': {
      name: 'Insurance',
      holdings: ['BRK-B', 'PGR', 'TRV', 'AIG', 'MET', 'PRU', 'ALL', 'CB', 'AFL', 'L']
    },
    'KRE': {
      name: 'Regional Banks',
      holdings: ['WFC', 'USB', 'PNC', 'TFC', 'COF', 'MTB', 'FITB', 'HBAN', 'RF', 'KEY']
    },
    'GDX': {
      name: 'Gold Miners',
      holdings: ['NEM', 'GOLD', 'AEM', 'FNV', 'WPM', 'AU', 'KGC', 'PAAS', 'EGO', 'AUY']
    },
    'ITA': {
      name: 'Aerospace & Defense',
      holdings: ['BA', 'RTX', 'LMT', 'NOC', 'GD', 'LHX', 'TXT', 'HWM', 'CW', 'TDG']
    },
    'TAN': {
      name: 'Solar Energy',
      holdings: ['ENPH', 'FSLR', 'SEDG', 'NOVA', 'ARRY', 'RUN', 'SOL', 'CSIQ', 'JKS', 'DQ']
    },
    'XBI': {
      name: 'Biotechnology',
      holdings: ['GILD', 'AMGN', 'BIIB', 'MRNA', 'VRTX', 'REGN', 'ILMN', 'BMRN', 'ALNY', 'TECH']
    },
    'ITB': {
      name: 'Homebuilders',
      holdings: ['LEN', 'NVR', 'DHI', 'PHM', 'KBH', 'TOL', 'TPG', 'BZH', 'MTH', 'GRBK']
    },
    'XHB': {
      name: 'Homebuilders ETF',
      holdings: ['HD', 'LOW', 'LEN', 'DHI', 'PHM', 'AMZN', 'SHW', 'BLD', 'FND', 'BLDR']
    },
    'XOP': {
      name: 'Oil & Gas Exploration',
      holdings: ['FANG', 'OVV', 'EQT', 'MTDR', 'MGY', 'MRO', 'AR', 'SM', 'PR', 'CIVI']
    },
    'OIH': {
      name: 'Oil Services',
      holdings: ['SLB', 'HAL', 'BKR', 'FTI', 'NOV', 'WFRD', 'HP', 'CHX', 'LBRT', 'PTEN']
    },
    'XME': {
      name: 'Metals & Mining',
      holdings: ['FCX', 'NEM', 'STLD', 'NUE', 'CLF', 'X', 'MP', 'AA', 'CRS', 'RS']
    },
    'ARKK': {
      name: 'Innovation',
      holdings: ['TSLA', 'ROKU', 'COIN', 'SHOP', 'ZM', 'SQ', 'HOOD', 'PATH', 'GBTC', 'RBLX']
    },
    'IPO': {
      name: 'IPOs',
      holdings: ['RBLX', 'COIN', 'DDOG', 'ZM', 'SNOW', 'U', 'ABNB', 'PLTR', 'DASH', 'CPNG']
    },
    'VNQ': {
      name: 'Real Estate (REITs)',
      holdings: ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WY', 'DLR', 'O', 'SBAC', 'EXR']
    },
    'JETS': {
      name: 'Airlines',
      holdings: ['DAL', 'UAL', 'AAL', 'LUV', 'SAVE', 'ALK', 'JBLU', 'HA', 'SKYW', 'MESA']
    },
    'KWEB': {
      name: 'China Internet',
      holdings: ['BABA', 'TCEHY', 'PDD', 'JD', 'NTES', 'BIDU', 'TME', 'BILI', 'IQ', 'VIPS']
    }
  };

  const sectorETFs = {
    'XLK': {
      name: 'Technology',
      holdings: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'ORCL', 'ADBE', 'ACN', 'CSCO', 'AMD', 'INTC', 'IBM', 'TXN', 'QCOM', 'AMAT', 'MU', 'ADI', 'KLAC', 'LRCX', 'MCHP']
    },
    'XLF': {
      name: 'Financials',
      holdings: ['BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'AXP', 'PGR', 'BLK', 'C', 'SCHW', 'CB', 'MMC', 'ICE', 'CME', 'PNC', 'AON']
    },
    'XLV': {
      name: 'Healthcare',
      holdings: ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'ELV', 'CVS', 'MDT', 'ISRG', 'VRTX', 'GILD', 'REGN', 'CI', 'HUM', 'AMGN', 'SYK']
    },
    'XLI': {
      name: 'Industrials',
      holdings: ['CAT', 'RTX', 'HON', 'UPS', 'LMT', 'BA', 'UNP', 'ADP', 'DE', 'MMM', 'GE', 'FDX', 'NOC', 'WM', 'EMR', 'ETN', 'ITW', 'CSX', 'CARR', 'NSC']
    },
    'XLY': {
      name: 'Consumer Discretionary',
      holdings: ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'NKE', 'LOW', 'SBUX', 'TJX', 'ORLY', 'GM', 'F', 'CMG', 'MAR', 'HLT', 'ABNB', 'RCL', 'CCL', 'NCLH', 'YUM']
    },
    'XLP': {
      name: 'Consumer Staples',
      holdings: ['PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'CL', 'KMB', 'GIS', 'K', 'HSY', 'CHD', 'CLX', 'SJM', 'CAG', 'CPB', 'MKC', 'TSN', 'HRL', 'LW']
    },
    'XLE': {
      name: 'Energy',
      holdings: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'BKR', 'HAL', 'DVN', 'FANG', 'APA', 'EQT', 'TPG', 'CTRA', 'MRO', 'OVV', 'HES']
    },
    'XLU': {
      name: 'Utilities',
      holdings: ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'VST', 'D', 'PCG', 'PEG', 'EXC', 'XEL', 'EIX', 'WEC', 'AWK', 'DTE', 'PPL', 'ES', 'AEE', 'CMS']
    },
    'XLRE': {
      name: 'Real Estate',
      holdings: ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WELL', 'DLR', 'O', 'SBAC', 'EQR', 'BXP', 'VTR', 'ESS', 'MAA', 'KIM', 'DOC', 'UDR', 'CPT', 'HST', 'REG']
    },
    'XLB': {
      name: 'Materials',
      holdings: ['LIN', 'SHW', 'APD', 'FCX', 'ECL', 'CTVA', 'VMC', 'MLM', 'NUE', 'DD', 'PPG', 'IFF', 'PKG', 'IP', 'CF', 'ALB', 'AMCR', 'EMN', 'CE', 'FMC']
    },
    'XLC': {
      name: 'Communication Services',
      holdings: ['GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'EA', 'TTWO', 'MTCH', 'ROKU', 'PINS', 'SNAP', 'TWTR', 'DISH', 'FOXA', 'FOX']
    }
  };

  const majorIndices = {
    'SPY': {
      name: 'S&P 500',
      holdings: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'UNH', 'XOM', 'JNJ', 'JPM', 'V', 'PG', 'MA', 'AVGO', 'HD', 'CVX', 'MRK', 'ABBV', 'LLY', 'COST', 'PEP', 'KO', 'ADBE', 'WMT', 'CRM', 'MCD', 'CSCO', 'TMO', 'ACN', 'DHR', 'VZ', 'INTC', 'ABT', 'NKE', 'DIS', 'PFE', 'ORCL', 'CMCSA', 'TXN', 'PM', 'BMY', 'UPS', 'RTX', 'NEE', 'HON', 'QCOM', 'T', 'COP', 'LOW', 'AMD', 'UNP', 'SPGI', 'INTU', 'CAT', 'BA', 'GE', 'DE', 'IBM', 'SBUX', 'LMT', 'AXP', 'BLK', 'GILD', 'AMGN', 'PLD', 'ISRG', 'ELV', 'MS', 'MDT', 'ADI', 'TJX', 'BKNG', 'MMC', 'VRTX', 'GS', 'SYK', 'ADP', 'SCHW', 'CVS', 'CI', 'C', 'REGN', 'AMT', 'NOW', 'TMUS', 'ZTS', 'MO', 'LRCX', 'SO', 'CB', 'PGR', 'ETN', 'EOG', 'DUK', 'BDX', 'BSX', 'AMAT', 'PYPL', 'SLB', 'MMM', 'FIS', 'MDLZ', 'ITW', 'NOC', 'PNC', 'USB', 'AON', 'EMR', 'MU', 'EL', 'SRE', 'TGT', 'CSX', 'ICE', 'GM', 'PSA', 'AIG', 'BK', 'WM', 'MRNA', 'KLAC', 'CL', 'APD', 'COF', 'NSC', 'SNPS', 'HCA', 'FCX', 'MET', 'EQIX', 'NFLX', 'CDNS', 'PANW', 'MCK', 'CCI', 'ADSK', 'F', 'TFC', 'MCO', 'MAR', 'DG', 'ORLY', 'AZO', 'APH', 'O', 'CME', 'GD', 'BIIB', 'SHW', 'AJG', 'TT', 'PSX', 'PH', 'ROST', 'MNST', 'AEP', 'ECL', 'MSI', 'LHX', 'AFL', 'ROP', 'KMB', 'EW', 'TEL', 'ADM', 'PEG', 'MSCI', 'PAYX', 'A', 'WELL', 'NEM', 'DLR', 'D', 'KMI', 'CTVA', 'YUM', 'TRV', 'SPG', 'CARR', 'PCAR', 'PRU', 'NXPI', 'OTIS', 'CHTR', 'HUM', 'GIS', 'DXCM', 'DD', 'SYY', 'KHC', 'AMP', 'HSY', 'CTAS', 'CTSH', 'CMG', 'HES', 'CNC', 'ALL', 'FTNT', 'IDXX', 'STZ', 'EA', 'FAST', 'KR', 'CPRT', 'SBAC', 'PPG', 'MRVL', 'IQV', 'RSG', 'BKR', 'ODFL', 'EXC', 'DOW', 'VRSK', 'AEE', 'ZBH', 'ES', 'EXR', 'GLW', 'ANSS', 'ROK', 'FITB', 'AVB', 'XEL', 'WEC', 'MLM', 'DHI', 'KEYS', 'ED', 'MTB', 'LEN', 'ETR', 'CBRE', 'VLO', 'GEHC', 'RMD', 'WBA', 'TSCO', 'VMC', 'AWK', 'WY', 'TROW', 'CDW', 'TTWO', 'DLTR', 'HAL', 'FTV', 'ALGN', 'ON', 'FE', 'IR', 'CAH', 'EFX', 'HPQ', 'LH', 'MPWR', 'IFF', 'LUV', 'APTV', 'DTE', 'TSN', 'MTD', 'PPL', 'EIX', 'GPN', 'CINF', 'WAB', 'AES', 'EXPE', 'NUE', 'DFS', 'TDY', 'NTRS', 'VTR', 'CTLT', 'TYL', 'AKAM', 'STE', 'SWKS', 'EPAM', 'COO', 'K', 'RF', 'BBY', 'LVS', 'CFG', 'MOH', 'UAL', 'CLX', 'ZBRA', 'DRI', 'ARE', 'HOLX', 'J', 'GWW', 'WDC', 'TER', 'MKC', 'NTAP', 'STT', 'EBAY', 'DGX', 'MAA', 'SYF', 'CBOE', 'LDOS', 'ULTA', 'CMS', 'RJF', 'ESS', 'CE', 'JBHT', 'SWK', 'LYB', 'PAYC', 'HPE', 'DOV', 'TRMB', 'INVH', 'AMCR', 'TXT', 'CCL', 'HIG', 'IEX', 'EQR', 'POOL', 'WAT', 'GRMN', 'CAG', 'EXPD', 'PWR', 'ALB', 'KIM', 'JKHY', 'BRO', 'AVY', 'VICI', 'DAL', 'CHRW', 'EQT', 'UDR', 'KEY', 'CPT', 'CNP', 'PKG', 'VTRS', 'IP', 'MGM', 'ATO', 'OMC', 'TECH', 'INCY', 'HST', 'EMN', 'NDSN', 'BXP', 'LKQ', 'AAL', 'BBWI', 'TPR', 'BF.B', 'RE', 'NI', 'MTCH', 'L', 'NVR', 'WYNN', 'REG', 'TAP', 'MOS', 'IPG', 'JNPR', 'AIZ', 'PNW', 'CRL', 'LNT', 'HII', 'AAP', 'NRG', 'FFIV', 'DXC', 'AOS', 'PHM', 'HSIC', 'NWSA', 'NWS', 'DISH', 'HAS', 'FMC', 'ALLE', 'GL', 'ALK', 'PNR', 'MHK', 'VFC', 'ZION', 'SEE', 'WHR', 'CZR', 'IVZ', 'CF', 'PARA', 'UHS', 'OGN', 'FOX', 'FOXA', 'ROL', 'PENN', 'CPB', 'XRAY', 'UAA', 'UA', 'HRL', 'SJM', 'DVA', 'RL']
    },
    'QQQ': {
      name: 'NASDAQ-100',
      holdings: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'COST', 'ADBE', 'PEP', 'CSCO', 'NFLX', 'INTC', 'CMCSA', 'AMD', 'TMUS', 'INTU', 'QCOM', 'TXN', 'HON', 'SBUX', 'AMGN', 'AMAT', 'BKNG', 'ADI', 'ISRG', 'GILD', 'ADP', 'VRTX', 'LRCX', 'REGN', 'MU', 'KLAC', 'PANW', 'MELI', 'MDLZ', 'SNPS', 'PYPL', 'CDNS', 'CHTR', 'ASML', 'MAR', 'CRWD', 'ABNB', 'AZN', 'MRVL', 'FTNT', 'ORLY', 'WDAY', 'ADSK', 'NXPI', 'MNST', 'TEAM', 'DXCM', 'PCAR', 'DASH', 'CPRT', 'ROST', 'LULU', 'KDP', 'PAYX', 'IDXX', 'ODFL', 'CTAS', 'MCHP', 'TTD', 'AEP', 'VRSK', 'EA', 'CTSH', 'ON', 'FAST', 'KHC', 'BIIB', 'EXC', 'CCEP', 'ZS', 'GEHC', 'CDW', 'DDOG', 'XEL', 'BKR', 'ANSS', 'CEG', 'TTWO', 'WBD', 'CSGP', 'FANG', 'ILMN', 'GFS', 'MDB', 'WBA', 'DLTR']
    },
    'DIA': {
      name: 'DOW 30',
      holdings: ['UNH', 'GS', 'MSFT', 'HD', 'CAT', 'CRM', 'MCD', 'V', 'AMGN', 'BA', 'TRV', 'HON', 'AXP', 'JPM', 'IBM', 'AAPL', 'JNJ', 'PG', 'CVX', 'AMZN', 'WMT', 'MMM', 'DIS', 'NKE', 'MRK', 'KO', 'DOW', 'CSCO', 'VZ', 'INTC']
    }
  };

  // Sector categorization for stocks
  const stockSectorMap: { [key: string]: string } = {
    // Technology
    'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'NVDA': 'Technology',
    'META': 'Technology', 'AVGO': 'Technology', 'ADBE': 'Technology', 'CRM': 'Technology', 'CSCO': 'Technology',
    'ORCL': 'Technology', 'ACN': 'Technology', 'AMD': 'Technology', 'INTC': 'Technology', 'IBM': 'Technology',
    'TXN': 'Technology', 'QCOM': 'Technology', 'AMAT': 'Technology', 'ADI': 'Technology', 'KLAC': 'Technology',
    'LRCX': 'Technology', 'MCHP': 'Technology', 'NOW': 'Technology', 'INTU': 'Technology', 'SNPS': 'Technology',
    'CDNS': 'Technology', 'PANW': 'Technology', 'CRWD': 'Technology', 'FTNT': 'Technology', 'MU': 'Technology',
    'MRVL': 'Technology', 'NXPI': 'Technology', 'ON': 'Technology', 'WDAY': 'Technology', 'TEAM': 'Technology',
    'ADSK': 'Technology', 'ANSS': 'Technology', 'ZS': 'Technology', 'DDOG': 'Technology', 'MDB': 'Technology',

    // Financials
    'BRK-B': 'Financials', 'JPM': 'Financials', 'V': 'Financials', 'MA': 'Financials', 'BAC': 'Financials', 'WFC': 'Financials',
    'GS': 'Financials', 'MS': 'Financials', 'SPGI': 'Financials', 'AXP': 'Financials', 'BLK': 'Financials', 'C': 'Financials',
    'SCHW': 'Financials', 'CB': 'Financials', 'MMC': 'Financials', 'PGR': 'Financials', 'TRV': 'Financials', 'AIG': 'Financials',
    'MET': 'Financials', 'PRU': 'Financials', 'ALL': 'Financials', 'AFL': 'Financials', 'AMP': 'Financials', 'COF': 'Financials',
    'USB': 'Financials', 'PNC': 'Financials', 'TFC': 'Financials', 'MTB': 'Financials', 'FITB': 'Financials', 'HBAN': 'Financials',
    'RF': 'Financials', 'KEY': 'Financials', 'ICE': 'Financials', 'CME': 'Financials', 'AON': 'Financials',

    // Healthcare
    'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'LLY': 'Healthcare', 'ABBV': 'Healthcare',
    'MRK': 'Healthcare', 'PFE': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare',
    'DHR': 'Healthcare', 'BMY': 'Healthcare', 'AMGN': 'Healthcare', 'GILD': 'Healthcare',
    'VRTX': 'Healthcare', 'REGN': 'Healthcare', 'ISRG': 'Healthcare', 'ELV': 'Healthcare',
    'CVS': 'Healthcare', 'CI': 'Healthcare', 'HUM': 'Healthcare', 'MDT': 'Healthcare',
    'SYK': 'Healthcare', 'BDX': 'Healthcare', 'ZTS': 'Healthcare', 'BIIB': 'Healthcare',
    'IDXX': 'Healthcare', 'DXCM': 'Healthcare', 'GEHC': 'Healthcare', 'IQV': 'Healthcare',
    'ILMN': 'Healthcare', 'AZN': 'Healthcare', 'WBA': 'Healthcare',

    // Consumer Discretionary
    'AMZN': 'Consumer Discretionary', 'TSLA': 'Consumer Discretionary', 'HD': 'Consumer Discretionary', 'MCD': 'Consumer Discretionary',
    'NKE': 'Consumer Discretionary', 'SBUX': 'Consumer Discretionary', 'LOW': 'Consumer Discretionary', 'TJX': 'Consumer Discretionary',
    'BKNG': 'Consumer Discretionary', 'ABNB': 'Consumer Discretionary', 'MAR': 'Consumer Discretionary', 'HLT': 'Consumer Discretionary',
    'GM': 'Consumer Discretionary', 'F': 'Consumer Discretionary', 'ORLY': 'Consumer Discretionary', 'CMG': 'Consumer Discretionary',
    'ROST': 'Consumer Discretionary', 'LULU': 'Consumer Discretionary', 'YUM': 'Consumer Discretionary', 'DIS': 'Consumer Discretionary',
    'DLTR': 'Consumer Discretionary', 'DASH': 'Consumer Discretionary', 'MELI': 'Consumer Discretionary',

    // Consumer Staples
    'PG': 'Consumer Staples', 'KO': 'Consumer Staples', 'PEP': 'Consumer Staples',
    'WMT': 'Consumer Staples', 'COST': 'Consumer Staples', 'PM': 'Consumer Staples', 'MO': 'Consumer Staples',
    'MDLZ': 'Consumer Staples', 'CL': 'Consumer Staples', 'KMB': 'Consumer Staples',
    'GIS': 'Consumer Staples', 'K': 'Consumer Staples', 'HSY': 'Consumer Staples',
    'CHD': 'Consumer Staples', 'CLX': 'Consumer Staples', 'SJM': 'Consumer Staples',
    'CAG': 'Consumer Staples', 'CPB': 'Consumer Staples', 'MKC': 'Consumer Staples',
    'TSN': 'Consumer Staples', 'HRL': 'Consumer Staples', 'MNST': 'Consumer Staples',
    'KDP': 'Consumer Staples', 'KHC': 'Consumer Staples',

    // Energy
    'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'EOG': 'Energy',
    'SLB': 'Energy', 'PSX': 'Energy', 'VLO': 'Energy', 'MPC': 'Energy',
    'OXY': 'Energy', 'BKR': 'Energy', 'HAL': 'Energy', 'DVN': 'Energy',
    'FANG': 'Energy', 'APA': 'Energy', 'EQT': 'Energy', 'CTRA': 'Energy',
    'MRO': 'Energy', 'OVV': 'Energy', 'HES': 'Energy',

    // Industrials
    'CAT': 'Industrials', 'RTX': 'Industrials', 'HON': 'Industrials',
    'UPS': 'Industrials', 'LMT': 'Industrials', 'BA': 'Industrials', 'UNP': 'Industrials',
    'GE': 'Industrials', 'MMM': 'Industrials', 'DE': 'Industrials',
    'FDX': 'Industrials', 'NOC': 'Industrials', 'WM': 'Industrials', 'EMR': 'Industrials',
    'ETN': 'Industrials', 'ITW': 'Industrials', 'CSX': 'Industrials', 'NSC': 'Industrials',
    'CARR': 'Industrials', 'PCAR': 'Industrials', 'CPRT': 'Industrials',
    'FAST': 'Industrials', 'ODFL': 'Industrials', 'CTAS': 'Industrials', 'VRSK': 'Industrials',
    'PAYX': 'Industrials', 'ADP': 'Industrials', 'DOW': 'Industrials',

    // Communication Services
    'NFLX': 'Communication Services', 'CMCSA': 'Communication Services', 'VZ': 'Communication Services', 'T': 'Communication Services',
    'TMUS': 'Communication Services', 'CHTR': 'Communication Services', 'EA': 'Communication Services', 'TTWO': 'Communication Services',
    'MTCH': 'Communication Services', 'ROKU': 'Communication Services', 'PINS': 'Communication Services', 'SNAP': 'Communication Services',
    'TWTR': 'Communication Services', 'WBD': 'Communication Services', 'FOXA': 'Communication Services', 'FOX': 'Communication Services',

    // Utilities
    'NEE': 'Utilities', 'SO': 'Utilities', 'DUK': 'Utilities', 'CEG': 'Utilities', 'SRE': 'Utilities',
    'AEP': 'Utilities', 'VST': 'Utilities', 'D': 'Utilities', 'PCG': 'Utilities', 'PEG': 'Utilities',
    'EXC': 'Utilities', 'XEL': 'Utilities', 'EIX': 'Utilities', 'WEC': 'Utilities', 'AWK': 'Utilities',
    'DTE': 'Utilities', 'PPL': 'Utilities', 'ES': 'Utilities', 'AEE': 'Utilities', 'CMS': 'Utilities',

    // Real Estate
    'PLD': 'Real Estate', 'AMT': 'Real Estate', 'CCI': 'Real Estate', 'EQIX': 'Real Estate', 'PSA': 'Real Estate',
    'WY': 'Real Estate', 'DLR': 'Real Estate', 'O': 'Real Estate', 'SBAC': 'Real Estate', 'EXR': 'Real Estate',
    'WELL': 'Real Estate', 'VTR': 'Real Estate', 'BXP': 'Real Estate', 'EQR': 'Real Estate', 'ESS': 'Real Estate',

    // Materials
    'LIN': 'Materials', 'SHW': 'Materials', 'APD': 'Materials', 'FCX': 'Materials',
    'ECL': 'Materials', 'CTVA': 'Materials', 'VMC': 'Materials', 'MLM': 'Materials',
    'NUE': 'Materials', 'DD': 'Materials', 'PPG': 'Materials', 'IFF': 'Materials',
    'PKG': 'Materials', 'IP': 'Materials', 'CF': 'Materials', 'ALB': 'Materials',
    'NEM': 'Materials', 'GOLD': 'Materials', 'STLD': 'Materials', 'CLF': 'Materials',
    'X': 'Non-Energy Minerals', 'MP': 'Non-Energy Minerals', 'AA': 'Non-Energy Minerals',
  };

  const stockIndustryMap: { [key: string]: string } = {
    // Technology Industries
    'AAPL': 'Consumer Electronics', 'MSFT': 'Software - Infrastructure', 'GOOGL': 'Internet Content & Information',
    'NVDA': 'Semiconductors', 'META': 'Internet Content & Information', 'AVGO': 'Semiconductors', 'ADBE': 'Software - Application',
    'CRM': 'Software - Application', 'CSCO': 'Communication Equipment', 'ORCL': 'Software - Infrastructure', 'ACN': 'Information Technology',
    'AMD': 'Semiconductors', 'INTC': 'Semiconductors', 'IBM': 'Information Technology', 'TXN': 'Semiconductors',
    'QCOM': 'Semiconductors', 'AMAT': 'Semiconductor Equipment', 'ADI': 'Semiconductors', 'KLAC': 'Semiconductor Equipment',
    'LRCX': 'Semiconductor Equipment', 'MCHP': 'Semiconductors', 'NOW': 'Software - Application', 'INTU': 'Software - Application',
    'SNPS': 'Software - Application', 'CDNS': 'Software - Application', 'PANW': 'Software - Infrastructure', 'CRWD': 'Software - Infrastructure',
    'FTNT': 'Software - Infrastructure', 'MU': 'Semiconductors', 'MRVL': 'Semiconductors', 'NXPI': 'Semiconductors',
    'ON': 'Semiconductors', 'WDAY': 'Software - Application', 'TEAM': 'Software - Application', 'ADSK': 'Software - Application',
    'ANSS': 'Software - Application', 'ZS': 'Software - Infrastructure', 'DDOG': 'Software - Application', 'MDB': 'Software - Application',

    // Financials Industries
    'BRK-B': 'Insurance - Diversified', 'JPM': 'Banks - Diversified', 'V': 'Credit Services', 'MA': 'Credit Services',
    'BAC': 'Banks - Diversified', 'WFC': 'Banks - Diversified', 'GS': 'Capital Markets', 'MS': 'Capital Markets',
    'SPGI': 'Financial Data', 'AXP': 'Credit Services', 'BLK': 'Asset Management', 'C': 'Banks - Diversified',
    'SCHW': 'Capital Markets', 'CB': 'Insurance', 'MMC': 'Insurance', 'PGR': 'Insurance',
    'TRV': 'Insurance', 'AIG': 'Insurance', 'MET': 'Insurance', 'PRU': 'Insurance',
    'ALL': 'Insurance', 'AFL': 'Insurance', 'AMP': 'Insurance', 'COF': 'Credit Services',
    'USB': 'Banks - Regional', 'PNC': 'Banks - Regional', 'TFC': 'Banks - Regional', 'MTB': 'Banks - Regional',
    'FITB': 'Banks - Regional', 'HBAN': 'Banks - Regional', 'RF': 'Banks - Regional', 'KEY': 'Banks - Regional',
    'ICE': 'Financial Data', 'CME': 'Financial Data', 'AON': 'Insurance', 'PYPL': 'Credit Services',

    // Healthcare Industries
    'UNH': 'Healthcare Plans', 'JNJ': 'Drug Manufacturers - General', 'LLY': 'Drug Manufacturers - General', 'ABBV': 'Drug Manufacturers - General',
    'MRK': 'Drug Manufacturers - General', 'PFE': 'Drug Manufacturers - General', 'TMO': 'Diagnostics', 'ABT': 'Medical Devices',
    'DHR': 'Diagnostics', 'BMY': 'Drug Manufacturers - General', 'AMGN': 'Biotech', 'GILD': 'Biotech',
    'VRTX': 'Biotech', 'REGN': 'Biotech', 'ISRG': 'Medical Devices', 'ELV': 'Healthcare Plans',
    'CVS': 'Medical Distribution', 'CI': 'Healthcare Plans', 'HUM': 'Healthcare Plans', 'MDT': 'Medical Devices',
    'SYK': 'Medical Devices', 'BDX': 'Medical Devices', 'ZTS': 'Drug Manufacturers - General', 'BIIB': 'Biotech',
    'IDXX': 'Diagnostics', 'DXCM': 'Medical Devices', 'GEHC': 'Medical Devices', 'IQV': 'Diagnostics',
    'ILMN': 'Diagnostics', 'AZN': 'Drug Manufacturers - General', 'WBA': 'Medical Distribution',

    // Consumer Discretionary Industries
    'AMZN': 'Internet Retail', 'TSLA': 'Auto Manufacturers', 'HD': 'Home Improvement', 'MCD': 'Restaurants',
    'NKE': 'Apparel - Retail', 'SBUX': 'Restaurants', 'LOW': 'Home Improvement', 'TJX': 'Apparel - Retail',
    'BKNG': 'Travel Services', 'ABNB': 'Travel Services', 'MAR': 'Travel Services', 'HLT': 'Travel Services',
    'GM': 'Auto Manufacturers', 'F': 'Auto Manufacturers', 'ORLY': 'Auto Parts', 'CMG': 'Restaurants',
    'ROST': 'Apparel - Retail', 'LULU': 'Apparel - Retail', 'YUM': 'Restaurants', 'DIS': 'Entertainment',
    'DLTR': 'Discount Stores', 'DASH': 'Internet Retail', 'MELI': 'Internet Retail',

    // Consumer Staples Industries
    'PG': 'Household', 'KO': 'Beverages - Household', 'PEP': 'Beverages - Household',
    'WMT': 'Discount Stores', 'COST': 'Discount Stores', 'PM': 'Tobacco', 'MO': 'Tobacco',
    'MDLZ': 'Confections', 'CL': 'Household', 'KMB': 'Household',
    'GIS': 'Packaged Foods', 'K': 'Packaged Foods', 'HSY': 'Confections',
    'CHD': 'Household', 'CLX': 'Household', 'SJM': 'Packaged Foods',
    'CAG': 'Packaged Foods', 'CPB': 'Packaged Foods', 'MKC': 'Packaged Foods',
    'TSN': 'Farm & Heavy', 'HRL': 'Packaged Foods', 'MNST': 'Beverages',
    'KDP': 'Beverages', 'KHC': 'Packaged Foods',

    // Energy Industries
    'XOM': 'Oil & Gas Integrated', 'CVX': 'Oil & Gas Integrated', 'COP': 'Oil & Gas E&P', 'EOG': 'Oil & Gas E&P',
    'SLB': 'Oil & Gas E&P', 'PSX': 'Oil & Gas Refining', 'VLO': 'Oil & Gas Refining', 'MPC': 'Oil & Gas Refining',
    'OXY': 'Oil & Gas E&P', 'BKR': 'Oil & Gas E&P', 'HAL': 'Oil & Gas E&P', 'DVN': 'Oil & Gas E&P',
    'FANG': 'Oil & Gas E&P', 'APA': 'Oil & Gas E&P', 'EQT': 'Oil & Gas E&P', 'CTRA': 'Oil & Gas E&P',
    'MRO': 'Oil & Gas E&P', 'OVV': 'Oil & Gas E&P', 'HES': 'Oil & Gas E&P',

    // Industrials Industries
    'CAT': 'Farm & Heavy', 'RTX': 'Aerospace & Defense', 'HON': 'Conglom', 'UPS': 'Integrated Freight',
    'LMT': 'Aerospace & Defense', 'BA': 'Aerospace & Defense', 'UNP': 'Railroads', 'GE': 'Conglom',
    'MMM': 'Conglom', 'DE': 'Farm & Heavy', 'FDX': 'Integrated Freight', 'NOC': 'Aerospace & Defense',
    'WM': 'Waste Management', 'EMR': 'Specialty Industrial', 'ETN': 'Specialty Industrial', 'ITW': 'Specialty Industrial',
    'CSX': 'Railroads', 'NSC': 'Railroads', 'CARR': 'Building', 'PCAR': 'Farm & Heavy',
    'CPRT': 'Specialty', 'FAST': 'Industrial Distribution', 'ODFL': 'Integrated Freight', 'CTAS': 'Specialty',
    'VRSK': 'Consulting', 'PAYX': 'Staffing', 'ADP': 'Staffing', 'DOW': 'Chemicals',

    // Communication Services Industries
    'NFLX': 'Entertainment', 'CMCSA': 'Entertainment', 'VZ': 'Telecom Services', 'T': 'Telecom Services',
    'TMUS': 'Telecom Services', 'CHTR': 'Entertainment', 'EA': 'Consumer Cyclical', 'TTWO': 'Consumer Cyclical',
    'MTCH': 'Internet Content', 'ROKU': 'Consumer Cyclical', 'PINS': 'Internet Content', 'SNAP': 'Internet Content',
    'TWTR': 'Internet Content', 'WBD': 'Entertainment', 'FOXA': 'Entertainment', 'FOX': 'Entertainment',

    // Utilities Industries
    'NEE': 'Utilities - Regulated', 'SO': 'Utilities - Regulated', 'DUK': 'Utilities - Regulated', 'CEG': 'Utilities - Independent',
    'SRE': 'Utilities - Regulated', 'AEP': 'Utilities - Regulated', 'VST': 'Utilities - Independent', 'D': 'Utilities - Regulated',
    'PCG': 'Utilities - Regulated', 'PEG': 'Utilities - Regulated', 'EXC': 'Utilities - Regulated', 'XEL': 'Utilities - Regulated',
    'EIX': 'Utilities - Regulated', 'WEC': 'Utilities - Regulated', 'AWK': 'Utilities - Regulated', 'DTE': 'Utilities - Regulated',
    'PPL': 'Utilities - Regulated', 'ES': 'Utilities - Regulated', 'AEE': 'Utilities - Regulated', 'CMS': 'Utilities - Regulated',

    // Real Estate Industries
    'PLD': 'REIT - Industrial', 'AMT': 'REIT - Specialty', 'CCI': 'REIT - Specialty', 'EQIX': 'REIT - Specialty',
    'PSA': 'REIT - Specialty', 'WY': 'REIT - Specialty', 'DLR': 'REIT - Specialty', 'O': 'REIT - Specialty',
    'SBAC': 'REIT - Specialty', 'EXR': 'REIT - Specialty', 'WELL': 'REIT - Healthcare', 'VTR': 'REIT - Healthcare',
    'BXP': 'REIT - Office', 'EQR': 'REIT - Residential', 'ESS': 'REIT - Residential',

    // Materials Industries
    'LIN': 'Specialty Chemicals', 'SHW': 'Specialty Chemicals', 'APD': 'Specialty Chemicals', 'FCX': 'Copper',
    'ECL': 'Specialty Chemicals', 'CTVA': 'Agricultural', 'VMC': 'Building', 'MLM': 'Building',
    'NUE': 'Steel', 'DD': 'Specialty Chemicals', 'PPG': 'Specialty Chemicals', 'IFF': 'Specialty Chemicals',
    'PKG': 'Packaging', 'IP': 'Paper', 'CF': 'Agricultural', 'ALB': 'Specialty Chemicals',
    'NEM': 'Gold', 'GOLD': 'Gold', 'STLD': 'Steel', 'CLF': 'Steel',
  };

  useEffect(() => {
    // Load historical breadth data once on mount - independent of ETF selection
    loadHistoricalBreadth();
  }, []);

  useEffect(() => {
    if (selectedETF) {
      loadHeatmapData();
    }
  }, [selectedETF, timePeriod]);

  const loadHistoricalBreadth = async () => {
    try {
      console.log('📊 Loading 1 year of S&P 500 historical breadth data with parallel workers...');

      const spyStocks = majorIndices.SPY.holdings;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);

      // Get all trading days
      const tradingDays: string[] = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          tradingDays.push(currentDate.toISOString().split('T')[0]);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      console.log(`📅 Processing ${tradingDays.length} trading days with ${Math.min(6, tradingDays.length)} parallel workers...`);

      const historicalPoints: BreadthHistoryPoint[] = [];

      // Split days across workers (each worker handles a batch of days)
      const WORKER_COUNT = Math.min(6, tradingDays.length); // Use 6 workers max
      const daysPerWorker = Math.ceil(tradingDays.length / WORKER_COUNT);

      const workers: Worker[] = [];
      const workerPromises: Promise<void>[] = [];

      for (let i = 0; i < WORKER_COUNT; i++) {
        const startIdx = i * daysPerWorker;
        const endIdx = Math.min(startIdx + daysPerWorker, tradingDays.length);
        const workerDays = tradingDays.slice(startIdx, endIdx);

        if (workerDays.length === 0) continue;

        const worker = new Worker('/workers/breadthHistoryWorker.js');
        workers.push(worker);

        console.log(`🚀 Worker ${i}: Processing ${workerDays.length} days (${workerDays[0]} to ${workerDays[workerDays.length - 1]})`);

        const workerPromise = new Promise<void>((resolve) => {
          worker.addEventListener('message', (e: MessageEvent) => {
            const { type, payload } = e.data;

            if (type === 'PROGRESS') {
              console.log(`📊 Worker ${payload.batchIndex}: ${payload.daysCompleted}/${payload.totalDays} days | Current: ${payload.currentDate}`);
            } else if (type === 'BATCH_COMPLETE') {
              console.log(`✅ Worker ${payload.batchIndex}: Completed ${payload.daysProcessed} days, found ${payload.results.length} with data`);

              // Add results to main array
              historicalPoints.push(...payload.results);

              worker.terminate();
              resolve();
            }
          });

          worker.addEventListener('error', (error) => {
            console.error(`❌ Worker ${i} error:`, error);
            worker.terminate();
            resolve();
          });

          // Send work to this worker
          worker.postMessage({
            type: 'LOAD_DAYS_BATCH',
            payload: {
              dates: workerDays,
              spyStocks,
              apiKey: 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf',
              batchIndex: i,
              totalBatches: WORKER_COUNT
            }
          });
        });

        workerPromises.push(workerPromise);
      }

      // Wait for all workers to complete
      await Promise.all(workerPromises);

      // Sort by timestamp
      historicalPoints.sort((a, b) => a.timestamp - b.timestamp);

      console.log(`✅ COMPLETE: Loaded ${historicalPoints.length} days of historical breadth data`);
      console.log(`📈 Date range: ${new Date(historicalPoints[0]?.timestamp).toLocaleDateString()} to ${new Date(historicalPoints[historicalPoints.length - 1]?.timestamp).toLocaleDateString()}`);

      setBreadthHistory(historicalPoints);

      // Now load sector-specific breadth data
      loadSectorBreadthData(historicalPoints);

    } catch (error) {
      console.error('❌ Error loading historical breadth:', error);
    }
  };

  const loadSectorBreadthData = async (breadthPoints: BreadthHistoryPoint[]) => {
    try {
      console.log('📊 Calculating sector breadth from historical data...');

      const sectorData: SectorBreadthPoint[] = [];

      // Only use last 45 days for sector breadth
      const last45Days = breadthPoints.slice(-45);
      console.log(`📅 Processing last ${last45Days.length} days for sector breadth`);

      // Use the same dates as overall breadth
      for (const point of last45Days) {
        const dateStr = new Date(point.timestamp).toISOString().split('T')[0];

        try {
          // Fetch grouped data for this date
          const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
          const response = await fetch(url);

          if (!response.ok) continue;

          const data = await response.json();
          if (!data.results) continue;

          // Calculate breadth for each sector
          const sectorRatios: { [key: string]: number } = {};

          Object.keys(sectorETFs).forEach((sectorKey) => {
            const sector = sectorETFs[sectorKey as keyof typeof sectorETFs];
            const sectorStocks = new Set(sector.holdings);

            let advancing = 0;
            let declining = 0;

            data.results.forEach((stock: any) => {
              const ticker = stock.T.split(':')[0];
              if (sectorStocks.has(ticker) && stock.o && stock.c) {
                const percentChange = (stock.c - stock.o) / stock.o;
                const THRESHOLD = 0.001; // 0.1%

                if (percentChange >= THRESHOLD) advancing++;
                else if (percentChange <= -THRESHOLD) declining++;
              }
            });

            if (advancing + declining > 0) {
              sectorRatios[sectorKey] = declining > 0 ? advancing / declining : advancing;
            }
          });

          sectorData.push({
            timestamp: point.timestamp,
            sectorRatios
          });

        } catch (error) {
          console.error(`Error processing sector data for ${dateStr}`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      console.log(`✅ Loaded sector breadth for ${sectorData.length} days`);
      setSectorBreadthHistory(sectorData);

    } catch (error) {
      console.error('❌ Error loading sector breadth:', error);
    }
  };

  // Setup zoom for breadth chart
  useEffect(() => {
    if (!breadthChartRef.current || breadthHistory.length === 0) return;

    const svg = d3.select(breadthChartRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10]) // Allow 10x zoom
      .translateExtent([[50, 0], [1500, 500]]) // Constrain panning to chart bounds
      .extent([[50, 0], [1500, 500]]) // Set viewport
      .filter((event) => {
        // Allow wheel and drag, block right-click and ctrl+wheel
        return !event.ctrlKey && !event.button;
      })
      .on('zoom', (event) => {
        const { transform } = event;
        setZoomTransform(transform);
        console.log('🔍 Breadth Chart Zoom:', { k: transform.k, x: transform.x });
      });

    svg.call(zoom as any);

    // Cleanup
    return () => {
      svg.on('.zoom', null);
    };
  }, [breadthHistory.length]);

  // Sector chart zoom setup
  useEffect(() => {
    if (!sectorBreadthChartRef.current || sectorBreadthHistory.length === 0) return;

    console.log('🔧 Setting up sector chart zoom. Data length:', sectorBreadthHistory.length);

    const svg = d3.select(sectorBreadthChartRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10]) // Allow 10x zoom
      .translateExtent([[0, 0], [1500, 500]]) // Constrain panning to chart bounds
      .extent([[0, 0], [1500, 500]]) // Set viewport
      .filter((event) => {
        // Allow wheel and drag, block right-click and ctrl+wheel
        const allowed = !event.ctrlKey && !event.button;
        if (allowed) console.log('🖱️ Sector zoom event allowed:', event.type);
        return allowed;
      })
      .on('zoom', (event) => {
        const { transform } = event;
        setSectorZoomTransform(transform);
        console.log('🔍 Sector Chart Zoom Applied:', { k: transform.k, x: transform.x, y: transform.y });
      });

    svg.call(zoom as any);
    console.log('✅ Sector zoom behavior attached to SVG');

    // Cleanup
    return () => {
      svg.on('.zoom', null);
      console.log('🧹 Sector zoom cleanup');
    };
  }, [sectorBreadthHistory.length]);

  const loadHeatmapData = async () => {
    if (!selectedETF) return;

    setLoading(true);
    try {
      // Determine which dataset to use based on view
      const etfData = selectedView === 'sectors'
        ? sectorETFs[selectedETF as keyof typeof sectorETFs]
        : selectedView === 'industries'
          ? industryETFs[selectedETF as keyof typeof industryETFs]
          : majorIndices[selectedETF as keyof typeof majorIndices];

      if (!etfData) return;

      console.log(`📊 Loading heatmap for ${selectedETF} (${etfData.name})`);
      console.log(`📊 Fetching ${etfData.holdings.length} symbols...`);

      // Smart batching: fetch all market caps first, then all snapshots
      const BATCH_SIZE = 30;
      const BATCH_DELAY = 800;
      const stocks: HeatmapStock[] = [];

      // Step 1: Batch fetch all market caps and logos
      console.log('📈 Phase 1: Fetching market caps & logos...');
      const marketCapMap = new Map<string, { marketCap: number; logoUrl?: string }>();

      for (let i = 0; i < etfData.holdings.length; i += BATCH_SIZE) {
        const batch = etfData.holdings.slice(i, i + BATCH_SIZE);

        const marketCapPromises = batch.map(async (symbol) => {
          try {
            const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
            const response = await fetch(url);
            if (response.ok) {
              const data = await response.json();
              const marketCap = data?.results?.market_cap || 0;
              const logoUrl = data?.results?.branding?.icon_url || data?.results?.branding?.logo_url;
              if (marketCap > 0) {
                marketCapMap.set(symbol, { marketCap, logoUrl });
              }
            }
          } catch (error) {
            // Skip on error
          }
        });

        await Promise.all(marketCapPromises);

        if (i + BATCH_SIZE < etfData.holdings.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }

      console.log(`✅ Got ${marketCapMap.size} market caps`);

      // Step 2: Batch fetch snapshots for symbols with market cap
      console.log('💹 Phase 2: Fetching price & change data...');
      const symbolsWithMarketCap = Array.from(marketCapMap.keys());

      for (let i = 0; i < symbolsWithMarketCap.length; i += BATCH_SIZE) {
        const batch = symbolsWithMarketCap.slice(i, i + BATCH_SIZE);

        const snapshotPromises = batch.map(async (symbol) => {
          try {
            const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
            const response = await fetch(url);
            if (!response.ok) return null;

            const data = await response.json();
            if (data && data.ticker) {
              const ticker = data.ticker;
              const currentPrice = ticker.day?.c || 0;
              const prevClose = ticker.prevDay?.c || 0;
              const volume = ticker.day?.v || 0;

              if (currentPrice === 0 || prevClose === 0) return null;

              // Calculate change percent
              let changePercent = 0;

              if (timePeriod === 'today') {
                // Calculate from previous 4PM close to current price
                changePercent = ((currentPrice - prevClose) / prevClose) * 100;
              } else if (timePeriod === 'week') {
                const weekAgoPrice = ticker.prevDay?.c || currentPrice;
                changePercent = weekAgoPrice !== 0 ? ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100 : 0;
              } else if (timePeriod === 'mtd') {
                const monthAgoPrice = ticker.prevDay?.c || currentPrice;
                changePercent = monthAgoPrice !== 0 ? ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100 : 0;
              } else if (timePeriod === 'ytd') {
                const yearStartPrice = ticker.prevDay?.c || currentPrice;
                changePercent = yearStartPrice !== 0 ? ((currentPrice - yearStartPrice) / yearStartPrice) * 100 : 0;
              } else if (timePeriod === '1y') {
                const yearAgoPrice = ticker.prevDay?.c || currentPrice;
                changePercent = yearAgoPrice !== 0 ? ((currentPrice - yearAgoPrice) / yearAgoPrice) * 100 : 0;
              }

              const sector = stockSectorMap[symbol];
              const industry = stockIndustryMap[symbol];
              if (!sector || !industry) return null;

              const stockData = marketCapMap.get(symbol)!;

              return {
                symbol: symbol,
                name: symbol,
                sector: sector,
                industry: industry,
                marketCap: stockData.marketCap,
                logoUrl: stockData.logoUrl,
                price: currentPrice,
                change: (currentPrice * changePercent) / 100,
                changePercent: changePercent,
                volume: volume
              };
            }
            return null;
          } catch (error) {
            return null;
          }
        });

        const batchResults = await Promise.all(snapshotPromises);
        const validStocks = batchResults.filter((stock): stock is HeatmapStock => stock !== null);
        stocks.push(...validStocks);

        if (i + BATCH_SIZE < symbolsWithMarketCap.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }

      console.log(`✅ Loaded ${stocks.length}/${etfData.holdings.length} stocks`);

      if (stocks.length > 0) {
        // Group stocks by sector
        const sectorGroups: { [key: string]: HeatmapStock[] } = {};
        stocks.forEach(stock => {
          if (!sectorGroups[stock.sector]) {
            sectorGroups[stock.sector] = [];
          }
          sectorGroups[stock.sector].push(stock);
        });

        // Create sector data with average changes
        const sectorsData: SectorData[] = Object.entries(sectorGroups).map(([sectorName, sectorStocks]) => {
          const avgChange = sectorStocks.reduce((sum, s) => sum + s.changePercent, 0) / sectorStocks.length || 0;
          return {
            name: sectorName,
            stocks: sectorStocks,
            avgChange: avgChange
          };
        });

        // Sort sectors by average performance (highest absolute change first)
        sectorsData.sort((a, b) => Math.abs(b.avgChange) - Math.abs(a.avgChange));

        setHeatmapData(sectorsData);

        // Update breadth history - append new live data point to historical data
        const allStocks = stocks;
        const advancing = allStocks.filter(s => s.changePercent > 0).length;
        const declining = allStocks.filter(s => s.changePercent < 0).length;
        const ratio = declining > 0 ? advancing / declining : advancing;

        setBreadthHistory(prev => {
          const newPoint: BreadthHistoryPoint = {
            timestamp: Date.now(),
            advancing,
            declining,
            ratio
          };
          // Only add if this is a new scan (not initial load)
          // Keep historical data and append new point
          if (prev.length > 0) {
            return [...prev, newPoint];
          }
          return prev;
        });
      } else {
        console.warn('⚠️ No stock data loaded');
        setHeatmapData([]);
      }
    } catch (error) {
      console.error('❌ Error loading heatmap data:', error);
      setHeatmapData([]);
    } finally {
      setLoading(false);
    }
  };

  const getColor = (changePercent: number): { bg: string; shadow: string; border: string } => {
    // Clean solid colors like Finviz
    if (changePercent >= 5) return { bg: '#16a34a', shadow: '#16a34a', border: '#15803d' };
    if (changePercent >= 3) return { bg: '#22c55e', shadow: '#22c55e', border: '#16a34a' };
    if (changePercent >= 1) return { bg: '#4ade80', shadow: '#4ade80', border: '#22c55e' };
    if (changePercent >= 0.5) return { bg: '#86efac', shadow: '#86efac', border: '#4ade80' };
    if (changePercent > 0) return { bg: '#bbf7d0', shadow: '#bbf7d0', border: '#86efac' };
    if (changePercent === 0) return { bg: '#6b7280', shadow: '#6b7280', border: '#4b5563' };
    if (changePercent > -0.5) return { bg: '#fca5a5', shadow: '#fca5a5', border: '#f87171' };
    if (changePercent > -1) return { bg: '#f87171', shadow: '#f87171', border: '#ef4444' };
    if (changePercent > -3) return { bg: '#ef4444', shadow: '#ef4444', border: '#dc2626' };
    if (changePercent > -5) return { bg: '#dc2626', shadow: '#dc2626', border: '#b91c1c' };
    return { bg: '#b91c1c', shadow: '#b91c1c', border: '#991b1b' };
  };

  const getBoxSize = (stock: HeatmapStock, allStocks: HeatmapStock[]): { width: number; height: number } => {
    // Calculate relative size based on market cap
    const maxMarketCap = Math.max(...allStocks.map(s => s.marketCap));
    const minMarketCap = Math.min(...allStocks.filter(s => s.marketCap > 0).map(s => s.marketCap));

    const relativeSize = maxMarketCap > 0 && stock.marketCap > 0
      ? (stock.marketCap - minMarketCap) / (maxMarketCap - minMarketCap)
      : 0.5;

    // Map to pixel dimensions (min 80px, max 400px)
    const baseSize = Math.sqrt(relativeSize * 100000);
    const width = Math.max(80, Math.min(400, baseSize));
    const height = Math.max(80, Math.min(300, baseSize * 0.75));

    return { width, height };
  };

  const getFilteredAndSortedStocks = () => {
    let stocks = heatmapData.flatMap(sector => sector.stocks);

    // Apply search filter
    if (searchFilter) {
      stocks = stocks.filter(stock =>
        stock.symbol.toLowerCase().includes(searchFilter.toLowerCase())
      );
    }

    // Apply sorting
    stocks.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'change':
          comparison = a.changePercent - b.changePercent;
          break;
        case 'volume':
          comparison = a.volume - b.volume;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return stocks;
  };

  const getMarketStats = () => {
    const stocks = heatmapData.flatMap(sector => sector.stocks);
    if (stocks.length === 0) return null;

    const gainers = stocks.filter(s => s.changePercent > 0).length;
    const losers = stocks.filter(s => s.changePercent < 0).length;
    const unchanged = stocks.filter(s => s.changePercent === 0).length;
    const avgChange = stocks.reduce((sum, s) => sum + s.changePercent, 0) / stocks.length;
    const totalVolume = stocks.reduce((sum, s) => sum + s.volume, 0);
    const maxGainer = stocks.reduce((max, s) => s.changePercent > max.changePercent ? s : max, stocks[0]);
    const maxLoser = stocks.reduce((min, s) => s.changePercent < min.changePercent ? s : min, stocks[0]);

    return { gainers, losers, unchanged, avgChange, totalVolume, maxGainer, maxLoser };
  };

  // Squarified treemap algorithm for Finviz-style layout
  const layoutTreemap = (items: any[], x: number, y: number, width: number, height: number) => {
    if (items.length === 0) return [];

    const totalValue = items.reduce((sum, item) => sum + item.value, 0);
    const layouts: any[] = [];

    let currentX = x;
    let currentY = y;
    let remainingWidth = width;
    let remainingHeight = height;

    items.forEach((item, index) => {
      const ratio = item.value / totalValue;
      const area = width * height * ratio;

      let itemWidth, itemHeight;

      if (width > height) {
        itemWidth = area / height;
        itemHeight = height;

        layouts.push({
          ...item,
          x: currentX,
          y: currentY,
          width: itemWidth,
          height: itemHeight
        });

        currentX += itemWidth;
      } else {
        itemWidth = width;
        itemHeight = area / width;

        layouts.push({
          ...item,
          x: currentX,
          y: currentY,
          width: itemWidth,
          height: itemHeight
        });

        currentY += itemHeight;
      }
    });

    return layouts;
  };

  const renderHeatmapGrid = () => {
    if (viewMode === 'list') {
      const allStocks = getFilteredAndSortedStocks();
      return (
        <div className="heatmap-list">
          <div className="list-header">
            <div>SYMBOL</div>
            <div>PRICE</div>
            <div>CHANGE</div>
            <div>CHANGE %</div>
            <div>VOLUME</div>
          </div>
          {allStocks.map((stock, index) => {
            const colorScheme = getColor(stock.changePercent);
            return (
              <div
                key={`${stock.symbol}-${index}`}
                className="list-row"
                onMouseEnter={() => setHoveredStock(stock)}
                onMouseLeave={() => setHoveredStock(null)}
                style={{
                  borderLeft: `4px solid ${colorScheme.border}`
                }}
              >
                <div className="list-symbol">{stock.symbol}</div>
                <div className="list-price">${stock.price.toFixed(2)}</div>
                <div className="list-change" style={{ color: stock.change >= 0 ? '#00ff00' : '#ff0000' }}>
                  ${Math.abs(stock.change).toFixed(2)}
                </div>
                <div className="list-percent" style={{ color: stock.changePercent >= 0 ? '#00ff00' : '#ff0000' }}>
                  {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                </div>
                <div className="list-volume">{(stock.volume / 1000000).toFixed(2)}M</div>
              </div>
            );
          })}
        </div>
      );
    }

    // Use D3 treemap for proper Finviz-style layout
    const width = 1700;
    const height = 1200;

    // Define sector order for Finviz-style layout matching image exactly
    // Technology top-left (largest), Financials bottom-left
    const sectorOrder: { [key: string]: number } = {
      'Technology': 1,
      'Healthcare': 2,
      'Consumer Discretionary': 3,
      'Communication Services': 4,
      'Consumer Staples': 5,
      'Materials': 6,
      'Industrials': 7,
      'Financials': 8,
      'Energy': 9,
      'Real Estate': 10,
      'Utilities': 11
    };

    // Sort heatmap data by sector order
    const sortedHeatmapData = [...heatmapData].sort((a, b) => {
      const orderA = sectorOrder[a.name] || 999;
      const orderB = sectorOrder[b.name] || 999;
      return orderA - orderB;
    });

    // Prepare hierarchical data with industry grouping: Sector -> Industry -> Stocks
    const root = {
      name: 'root',
      children: sortedHeatmapData.map(sector => {
        // Group stocks by industry within this sector
        const industriesMap = new Map<string, { stocks: HeatmapStock[], avgChange: number }>();
        sector.stocks.forEach(stock => {
          const industry = stock.industry || 'Other';
          if (!industriesMap.has(industry)) {
            industriesMap.set(industry, { stocks: [], avgChange: 0 });
          }
          industriesMap.get(industry)!.stocks.push(stock);
        });

        // Calculate average change for each industry
        industriesMap.forEach((value, key) => {
          const totalChange = value.stocks.reduce((sum, s) => sum + s.changePercent, 0);
          value.avgChange = totalChange / value.stocks.length;
        });

        return {
          name: sector.name,
          avgChange: sector.avgChange,
          children: Array.from(industriesMap.entries()).map(([industryName, data]) => ({
            name: industryName,
            isIndustry: true,
            avgChange: data.avgChange,
            children: data.stocks.map(stock => ({
              name: stock.symbol,
              value: stock.marketCap,
              changePercent: stock.changePercent,
              price: stock.price,
              sector: sector.name,
              industry: industryName,
              logoUrl: stock.logoUrl
            }))
          }))
        };
      })
    };

    // Create D3 hierarchy
    const hierarchyRoot = d3Hierarchy.hierarchy(root)
      .sum((d: any) => d.value || 0)
      .sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

    // Create treemap layout with padding for sector boundaries
    const treemapLayout = d3Hierarchy.treemap()
      .size([width, height])
      .paddingOuter(2)
      .paddingTop(12)
      .paddingInner(2)
      .tile(d3Hierarchy.treemapBinary);

    treemapLayout(hierarchyRoot as any);

    return (
      <div className="heatmap-treemap-container" style={{ width, height, position: 'relative', background: '#000' }}>
        {filteredSector && (
          <div
            onClick={() => {
              setHeatmapData(fullHeatmapData);
              setFilteredSector(null);
            }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '48px',
              fontWeight: 'bold',
              color: '#00ff00',
              cursor: 'pointer',
              zIndex: 2000,
              padding: '20px 30px',
              backgroundColor: 'rgba(0,0,0,0.85)',
              border: '3px solid #00ff00',
              borderRadius: '8px',
              textShadow: '0 0 10px rgba(0,255,0,0.8)',
              userSelect: 'none'
            }}
          >
            ←
          </div>
        )}
        {hierarchyRoot.children?.map((sectorNode: any, sectorIdx: number) => {
          const sectorWidth = sectorNode.x1 - sectorNode.x0;
          const sectorHeight = sectorNode.y1 - sectorNode.y0;

          return (
            <div key={sectorIdx}>
              {/* Sector border with title */}
              <div
                style={{
                  position: 'absolute',
                  left: `${sectorNode.x0}px`,
                  top: `${sectorNode.y0}px`,
                  width: `${sectorWidth}px`,
                  height: `${sectorHeight}px`,
                  border: '3px solid #000',
                  pointerEvents: 'none',
                  boxSizing: 'border-box'
                }}
              >
                {/* Sector title on black border line */}
                <div
                  onDoubleClick={() => {
                    if (!filteredSector) {
                      const sectorStocks = heatmapData.find(s => s.name === sectorNode.data.name)?.stocks || [];
                      if (sectorStocks.length > 0) {
                        setFullHeatmapData(heatmapData);
                        setFilteredSector(sectorNode.data.name);
                        setHeatmapData([{
                          name: sectorNode.data.name,
                          stocks: sectorStocks,
                          avgChange: sectorNode.data.avgChange
                        }]);
                      }
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: '-11px',
                    left: '5px',
                    fontFamily: 'Bloomberg Terminal, monospace',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000',
                    letterSpacing: '1px',
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    zIndex: 1000,
                    padding: '2px 5px'
                  }}
                >
                  {sectorNode.data.name}
                </div>
              </div>

              {/* Industry groups within sector */}
              {sectorNode.children?.map((industryNode: any, industryIdx: number) => {
                const industryWidth = industryNode.x1 - industryNode.x0;
                const industryHeight = industryNode.y1 - industryNode.y0;

                return (
                  <div key={`${sectorIdx}-${industryIdx}`}>
                    {/* Industry title bar with colored background */}
                    {industryWidth > 80 && industryHeight > 25 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${industryNode.x0}px`,
                          top: `${industryNode.y0}px`,
                          width: `${industryWidth}px`,
                          height: '14px',
                          backgroundColor: industryNode.data.avgChange >= 0 ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)',
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: '4px',
                          pointerEvents: 'none',
                          zIndex: 500,
                          borderBottom: '1px solid rgba(0,0,0,0.3)'
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'Bloomberg Terminal, monospace',
                            fontSize: Math.max(7, Math.min(10, industryWidth * 0.055)) + 'px',
                            fontWeight: 'bold',
                            color: '#ffffff',
                            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                            maxWidth: `${industryWidth - 8}px`,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px'
                          }}
                        >
                          {industryNode.data.name}
                        </div>
                      </div>
                    )}

                    {/* Stock tiles within industry */}
                    {industryNode.children?.map((stockNode: any, stockIdx: number) => {
                      const colorScheme = getColor(stockNode.data.changePercent);
                      const stockWidth = stockNode.x1 - stockNode.x0;
                      const stockHeight = stockNode.y1 - stockNode.y0;

                      // Dynamic font sizing based on box area for better scaling
                      const boxArea = stockWidth * stockHeight;
                      const symbolFontSize = Math.max(8, Math.min(32, Math.sqrt(boxArea) * 0.18));
                      const changeFontSize = Math.max(7, Math.min(24, Math.sqrt(boxArea) * 0.14));

                      const showSymbol = stockWidth > 25 && stockHeight > 15;
                      const showChange = stockHeight > 35 && stockWidth > 40;

                      return (
                        <div
                          key={`${sectorIdx}-${industryIdx}-${stockIdx}`}
                          className="treemap-stock-box"
                          style={{
                            position: 'absolute',
                            left: `${stockNode.x0}px`,
                            top: `${stockNode.y0}px`,
                            width: `${stockWidth}px`,
                            height: `${stockHeight}px`,
                            backgroundColor: colorScheme.bg,
                            border: '1px solid #000',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2px',
                            boxSizing: 'border-box',
                            overflow: 'hidden'
                          }}
                          onMouseEnter={() => setHoveredStock(stockNode.data)}
                          onMouseLeave={() => setHoveredStock(null)}
                        >
                          {stockNode.data.logoUrl && stockWidth > 50 && stockHeight > 50 && (
                            <img
                              src={`${stockNode.data.logoUrl}?apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`}
                              alt={stockNode.data.name}
                              style={{
                                width: Math.min(stockWidth * 0.4, 32) + 'px',
                                height: Math.min(stockHeight * 0.4, 32) + 'px',
                                objectFit: 'contain',
                                marginBottom: '2px',
                                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))'
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          {showSymbol && (
                            <div style={{
                              fontFamily: 'Bloomberg Terminal, monospace',
                              fontSize: `${symbolFontSize}px`,
                              fontWeight: 'bold',
                              color: '#ffffff',
                              textAlign: 'center',
                              lineHeight: 1.1,
                              textShadow: '0 0 3px rgba(0,0,0,0.8)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              width: '100%'
                            }}>
                              {stockNode.data.name}
                            </div>
                          )}
                          {showChange && (
                            <div style={{
                              fontFamily: 'Bloomberg Terminal, monospace',
                              fontSize: `${changeFontSize}px`,
                              fontWeight: 'bold',
                              color: '#ffffff',
                              textAlign: 'center',
                              lineHeight: 1.1,
                              textShadow: '0 0 3px rgba(0,0,0,0.8)',
                              marginTop: '2px',
                              whiteSpace: 'nowrap'
                            }}>
                              {stockNode.data.changePercent >= 0 && '+'}{stockNode.data.changePercent.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const stats = getMarketStats();

  return (
    <div className="market-heatmap-container">
      <div className="heatmap-controls" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        background: 'linear-gradient(135deg, #050914 0%, #0d1428 100%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        gap: '24px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Left: View Selection */}
        <div style={{
          display: 'flex',
          gap: '8px',
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '4px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button
            style={{
              padding: '12px 24px',
              background: selectedView === 'sectors' ? '#000000' : 'transparent',
              color: selectedView === 'sectors' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => {
              setSelectedView('sectors');
              setSelectedETF(null);
              setHeatmapData([]);
            }}
          >
            SECTORS
          </button>
          <button
            style={{
              padding: '12px 24px',
              background: selectedView === 'industries' ? '#000000' : 'transparent',
              color: selectedView === 'industries' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => {
              setSelectedView('industries');
              setSelectedETF(null);
              setHeatmapData([]);
            }}
          >
            INDUSTRIES
          </button>
          <button
            style={{
              padding: '12px 24px',
              background: selectedView === 'indices' ? '#000000' : 'transparent',
              color: selectedView === 'indices' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => {
              setSelectedView('indices');
              setSelectedETF(null);
              setHeatmapData([]);
            }}
          >
            INDICES
          </button>
          <button
            style={{
              padding: '12px 24px',
              background: selectedView === 'breadth' ? '#000000' : 'transparent',
              color: selectedView === 'breadth' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => {
              setSelectedView('breadth');
              setSelectedETF(null);
              setHeatmapData([]);
              if (breadthHistory.length === 0) {
                loadHistoricalBreadth();
              }
            }}
          >
            BREADTH
          </button>
        </div>

        {/* Center: Time Period Selection */}
        <div style={{
          display: 'flex',
          gap: '6px',
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '4px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button
            style={{
              padding: '10px 18px',
              background: timePeriod === 'today' ? '#000000' : 'transparent',
              color: timePeriod === 'today' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => setTimePeriod('today')}
          >
            TODAY
          </button>
          <button
            style={{
              padding: '10px 18px',
              background: timePeriod === 'week' ? '#000000' : 'transparent',
              color: timePeriod === 'week' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => setTimePeriod('week')}
          >
            WEEK
          </button>
          <button
            style={{
              padding: '10px 18px',
              background: timePeriod === 'mtd' ? '#000000' : 'transparent',
              color: timePeriod === 'mtd' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => setTimePeriod('mtd')}
          >
            MTD
          </button>
          <button
            style={{
              padding: '10px 18px',
              background: timePeriod === 'ytd' ? '#000000' : 'transparent',
              color: timePeriod === 'ytd' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => setTimePeriod('ytd')}
          >
            YTD
          </button>
          <button
            style={{
              padding: '10px 18px',
              background: timePeriod === '1y' ? '#000000' : 'transparent',
              color: timePeriod === '1y' ? '#ff8500' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.5px'
            }}
            onClick={() => setTimePeriod('1y')}
          >
            1Y
          </button>
        </div>

        {/* Right: ETF Selector & Scan Button */}
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          <select
            value={selectedETF || ''}
            onChange={(e) => setSelectedETF(e.target.value || null)}
            style={{
              padding: '10px 16px',
              background: 'rgba(0, 0, 0, 0.4)',
              color: '#ffffff',
              border: '1px solid rgba(255, 133, 0, 0.5)',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '15px',
              fontWeight: '500',
              cursor: 'pointer',
              letterSpacing: '0.5px',
              minWidth: '200px',
              outline: 'none'
            }}
          >
            <option value="">Select {selectedView === 'sectors' ? 'Sector' : selectedView === 'industries' ? 'Industry' : 'Index'}</option>
            {selectedView === 'sectors'
              ? Object.entries(sectorETFs).map(([symbol, info]) => (
                <option key={symbol} value={symbol}>
                  {symbol} - {info.name}
                </option>
              ))
              : selectedView === 'industries'
                ? Object.entries(industryETFs).map(([symbol, info]) => (
                  <option key={symbol} value={symbol}>
                    {symbol} - {info.name}
                  </option>
                ))
                : Object.entries(majorIndices).map(([symbol, info]) => (
                  <option key={symbol} value={symbol}>
                    {symbol} - {info.name}
                  </option>
                ))}?
          </select>

          <button
            onClick={loadHeatmapData}
            disabled={!selectedETF}
            style={{
              padding: '10px 24px',
              background: selectedETF ? '#16a34a' : 'rgba(100, 100, 100, 0.3)',
              color: selectedETF ? '#ffffff' : '#6b7280',
              border: 'none',
              borderRadius: '6px',
              fontFamily: 'Bloomberg Terminal, monospace',
              fontSize: '15px',
              fontWeight: '600',
              cursor: selectedETF ? 'pointer' : 'not-allowed',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <span style={{ fontSize: '16px' }}>⟳</span>
            SCAN
          </button>
        </div>
      </div>

      {!selectedETF && !loading && selectedView !== 'breadth' && (
        <div className="heatmap-placeholder">
          <div style={{
            fontSize: '24px',
            color: '#ff8500',
            fontFamily: 'Bloomberg Terminal, monospace',
            marginBottom: '20px'
          }}>
            📊 MARKET HEATMAP
          </div>
          <div style={{
            fontSize: '14px',
            color: '#888',
            fontFamily: 'Bloomberg Terminal, monospace'
          }}>
            Select a {selectedView === 'sectors' ? 'Sector' : selectedView === 'industries' ? 'Industry' : 'Index'} and click SCAN to load heatmap
          </div>
        </div>
      )}

      {loading ? (
        <div className="heatmap-loading">
          <div className="loading-spinner"></div>
          <div>Loading Market Heatmap...</div>
        </div>
      ) : selectedView === 'breadth' ? (
        /* Market Breadth Chart - Show instead of heatmap when breadth is selected */
        breadthHistory.length > 0 ? (
          <div className="breadth-indicator-panel">
            {/* Historical Breadth Chart */}
            <div className="breadth-history-container">
              <svg ref={breadthChartRef} className="breadth-history-chart" viewBox="0 0 1500 500" style={{ width: '100%', height: '500px', display: 'block', cursor: 'grab' }}>
                {/* Clip path to constrain zoom area */}
                <defs>
                  <clipPath id="chart-clip">
                    <rect x="50" y="100" width="1450" height="280" />
                  </clipPath>
                </defs>

                {/* Background rect to capture zoom events */}
                <rect x="0" y="0" width="1500" height="500" fill="transparent" pointerEvents="all" />

                {/* Chart title inside SVG */}
                <text x="750" y="30" fill="#ffffff" fontSize="20" fontFamily="monospace" fontWeight="bold" opacity="1" textAnchor="middle">S&P 500 MARKET BREADTH</text>

                {(() => {
                  // Calculate dynamic Y-axis range based on visible data when zoomed
                  let visibleData = breadthHistory;

                  if (zoomTransform) {
                    const chartWidth = 1450;
                    const newXScale = zoomTransform.rescaleX(
                      d3.scaleLinear()
                        .domain([0, breadthHistory.length - 1])
                        .range([50, 50 + chartWidth])
                    );

                    const startIndex = Math.max(0, Math.floor(newXScale.invert(50)));
                    const endIndex = Math.min(breadthHistory.length - 1, Math.ceil(newXScale.invert(50 + chartWidth)));

                    visibleData = breadthHistory.slice(startIndex, endIndex + 1);
                  }

                  const ratios = visibleData.map(p => p.ratio);
                  const maxRatio = Math.max(...ratios, 2);
                  const minRatio = Math.min(...ratios, 0.5);
                  const range = maxRatio - minRatio;
                  const padding = range * 0.1;
                  const yMax = maxRatio + padding;
                  const yMin = Math.max(0, minRatio - padding);
                  const yMid = (yMax + yMin) / 2;

                  return (
                    <>
                      {/* Grid lines - static, not affected by zoom */}
                      <line x1="50" y1="112.5" x2="1500" y2="112.5" stroke="#333" strokeWidth="2" strokeDasharray="5,5" />
                      <line x1="50" y1="225" x2="1500" y2="225" stroke="#555" strokeWidth="2" />
                      <line x1="50" y1="337.5" x2="1500" y2="337.5" stroke="#333" strokeWidth="2" strokeDasharray="5,5" />

                      {/* Y-axis labels - static, update based on visible data */}
                      <text x="40" y="115" fill="#ffffff" fontSize="18" fontFamily="monospace" fontWeight="bold" opacity="1" textAnchor="end">{yMax.toFixed(1)}</text>
                      <text x="40" y="228" fill="#ffffff" fontSize="18" fontFamily="monospace" fontWeight="bold" opacity="1" textAnchor="end">{yMid.toFixed(1)}</text>
                      <text x="40" y="340" fill="#ffffff" fontSize="18" fontFamily="monospace" fontWeight="bold" opacity="1" textAnchor="end">{yMin.toFixed(1)}</text>
                    </>
                  );
                })()}

                {/* Zoomable content group with clip path */}
                <g clipPath="url(#chart-clip)">

                  {/* Ratio line */}
                  <polyline
                    points={(() => {
                      // Apply zoom transform to get visible data range
                      let visibleData = breadthHistory;

                      if (zoomTransform) {
                        const chartWidth = 1450;
                        const newXScale = zoomTransform.rescaleX(
                          d3.scaleLinear()
                            .domain([0, breadthHistory.length - 1])
                            .range([50, 50 + chartWidth])
                        );

                        const startIndex = Math.max(0, Math.floor(newXScale.invert(50)));
                        const endIndex = Math.min(breadthHistory.length - 1, Math.ceil(newXScale.invert(50 + chartWidth)));

                        visibleData = breadthHistory.slice(startIndex, endIndex + 1);
                      }

                      // Calculate Y-axis range based on VISIBLE data only
                      const ratios = visibleData.map(p => p.ratio);
                      const maxRatio = Math.max(...ratios, 2);
                      const minRatio = Math.min(...ratios, 0.5);
                      const range = maxRatio - minRatio;
                      const padding = range * 0.1;
                      const yMax = maxRatio + padding;
                      const yMin = Math.max(0, minRatio - padding);
                      const yRange = yMax - yMin;

                      // Apply zoom transform if available
                      const chartWidth = 1450;
                      const getX = (idx: number) => {
                        const baseX = 50 + ((idx / (breadthHistory.length - 1)) * chartWidth);
                        if (zoomTransform) {
                          return zoomTransform.applyX(baseX);
                        }
                        return baseX;
                      };

                      return breadthHistory.map((point, idx) => {
                        const x = getX(idx);
                        // Map ratio to Y coordinate (112.5 to 337.5)
                        const normalizedRatio = (point.ratio - yMin) / yRange;
                        const y = 337.5 - (normalizedRatio * 225); // Inverted: high ratio = low Y
                        return `${x},${y}`;
                      }).join(' ');
                    })()}
                    fill="none"
                    stroke="#00aaff"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Data points */}
                  {(() => {
                    // Apply zoom transform to get visible data range
                    let visibleData = breadthHistory;

                    if (zoomTransform) {
                      const chartWidth = 1450;
                      const newXScale = zoomTransform.rescaleX(
                        d3.scaleLinear()
                          .domain([0, breadthHistory.length - 1])
                          .range([50, 50 + chartWidth])
                      );

                      const startIndex = Math.max(0, Math.floor(newXScale.invert(50)));
                      const endIndex = Math.min(breadthHistory.length - 1, Math.ceil(newXScale.invert(50 + chartWidth)));

                      visibleData = breadthHistory.slice(startIndex, endIndex + 1);
                    }

                    // Calculate Y-axis range based on VISIBLE data only
                    const ratios = visibleData.map(p => p.ratio);
                    const maxRatio = Math.max(...ratios, 2);
                    const minRatio = Math.min(...ratios, 0.5);
                    const range = maxRatio - minRatio;
                    const padding = range * 0.1;
                    const yMax = maxRatio + padding;
                    const yMin = Math.max(0, minRatio - padding);
                    const yRange = yMax - yMin;

                    // Apply zoom transform if available
                    const chartWidth = 1450;
                    const getX = (idx: number) => {
                      const baseX = 50 + ((idx / (breadthHistory.length - 1)) * chartWidth);
                      if (zoomTransform) {
                        return zoomTransform.applyX(baseX);
                      }
                      return baseX;
                    };

                    return breadthHistory.map((point, idx) => {
                      const x = getX(idx);
                      const normalizedRatio = (point.ratio - yMin) / yRange;
                      const y = 337.5 - (normalizedRatio * 225);
                      const ratio = point.ratio;
                      const color = ratio > 2 ? '#00ff00' : ratio > 1 ? '#ffaa00' : '#ff0000';
                      return (
                        <circle
                          key={idx}
                          cx={x}
                          cy={y}
                          r="6"
                          fill={color}
                          stroke="#000"
                          strokeWidth="3"
                        />
                      );
                    });
                  })()}
                </g>

                {/* X-axis time labels - outside clip path, static position */}
                {breadthHistory.length > 1 && (() => {
                  // Calculate visible range based on zoom
                  let visibleIndices = breadthHistory.map((_, idx) => idx);

                  if (zoomTransform) {
                    const chartWidth = 1450;
                    const newXScale = zoomTransform.rescaleX(
                      d3.scaleLinear()
                        .domain([0, breadthHistory.length - 1])
                        .range([50, 50 + chartWidth])
                    );

                    const startIndex = Math.max(0, Math.floor(newXScale.invert(50)));
                    const endIndex = Math.min(breadthHistory.length - 1, Math.ceil(newXScale.invert(50 + chartWidth)));

                    visibleIndices = visibleIndices.slice(startIndex, endIndex + 1);
                  }

                  // Show max 8-10 labels evenly distributed across visible range
                  const maxLabels = 8;
                  const step = Math.max(1, Math.floor(visibleIndices.length / maxLabels));

                  return visibleIndices.filter((_, i) => i % step === 0 || i === visibleIndices.length - 1).map((idx) => {
                    const point = breadthHistory[idx];
                    const chartWidth = 1450;
                    const baseX = 50 + ((idx / (breadthHistory.length - 1)) * chartWidth);
                    const x = zoomTransform ? zoomTransform.applyX(baseX) : baseX;

                    // Only show if within viewport
                    if (x < 50 || x > 1500) return null;

                    const date = new Date(point.timestamp);
                    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                      <g key={`time-${idx}`}>
                        <line x1={x} y1="370" x2={x} y2="380" stroke="#ffffff" strokeWidth="2" opacity="1" />
                        <text
                          x={x}
                          y="400"
                          fill="#ffffff"
                          fontSize="14"
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                          opacity="1"
                        >
                          {dateStr}
                        </text>
                      </g>
                    );
                  });
                })()}
              </svg>
            </div>

            {/* Sector Breadth Lines */}
            {sectorBreadthHistory.length > 0 && (
              <div className="breadth-history-container">
                <svg ref={sectorBreadthChartRef} className="breadth-history-chart" viewBox="0 0 1500 500" style={{ width: '100%', height: '600px', display: 'block', cursor: 'grab' }}>
                  <defs>
                    <clipPath id="sector-chart-clip">
                      <rect x="50" y="100" width="1450" height="380" />
                    </clipPath>
                  </defs>

                  {/* Background rect to capture zoom events */}
                  <rect x="0" y="0" width="1500" height="500" fill="transparent" pointerEvents="all" />

                  {/* Chart title inside SVG */}
                  <text x="750" y="20" fill="#ffffff" fontSize="20" fontFamily="monospace" fontWeight="bold" opacity="1" textAnchor="middle">Sector Advanced Decline Ratio</text>

                  {(() => {
                    const sectorKeys = Object.keys(sectorETFs);
                    const sectorColors: { [key: string]: string } = {
                      'XLK': '#00aaff', // Technology - Blue
                      'XLF': '#00ff00', // Financials - Green
                      'XLV': '#ff00ff', // Healthcare - Magenta
                      'XLI': '#ffaa00', // Industrials - Orange
                      'XLY': '#ff0066', // Consumer Disc - Pink
                      'XLP': '#00ffaa', // Consumer Staples - Cyan
                      'XLE': '#ffff00', // Energy - Yellow
                      'XLU': '#ff6600', // Utilities - Orange-Red
                      'XLRE': '#aa00ff', // Real Estate - Purple
                      'XLB': '#66ff00', // Materials - Lime
                      'XLC': '#ff0000'  // Communication - Red
                    };

                    // Calculate Y-axis range across all sectors
                    let allRatios: number[] = [];
                    sectorBreadthHistory.forEach(point => {
                      Object.values(point.sectorRatios).forEach(ratio => {
                        if (ratio) allRatios.push(ratio);
                      });
                    });

                    const maxRatio = Math.max(...allRatios, 2);
                    const minRatio = Math.min(...allRatios, 0.5);
                    const range = maxRatio - minRatio;
                    const padding = range * 0.1;
                    const yMax = maxRatio + padding;
                    const yMin = Math.max(0, minRatio - padding);
                    const yMid = (yMax + yMin) / 2;
                    const yRange = yMax - yMin;

                    // Calculate dynamic Y-axis range based on zoom
                    let displayYMin = yMin;
                    let displayYMax = yMax;
                    let displayYMid = yMid;

                    if (sectorZoomTransform) {
                      const chartWidth = 1450;
                      const newXScale = sectorZoomTransform.rescaleX(
                        d3.scaleLinear()
                          .domain([0, sectorBreadthHistory.length - 1])
                          .range([50, 50 + chartWidth])
                      );

                      const startIndex = Math.max(0, Math.floor(newXScale.invert(50)));
                      const endIndex = Math.min(sectorBreadthHistory.length - 1, Math.ceil(newXScale.invert(50 + chartWidth)));

                      const visibleData = sectorBreadthHistory.slice(startIndex, endIndex + 1);
                      const visibleRatios: number[] = [];

                      visibleData.forEach(point => {
                        Object.keys(sectorColors).forEach(sectorKey => {
                          const ratio = point.sectorRatios[sectorKey];
                          if (ratio) visibleRatios.push(ratio);
                        });
                      });

                      if (visibleRatios.length > 0) {
                        displayYMin = Math.min(...visibleRatios);
                        displayYMax = Math.max(...visibleRatios);
                        const visibleRange = displayYMax - displayYMin;
                        const visiblePadding = visibleRange * 0.1;
                        displayYMax = displayYMax + visiblePadding;
                        displayYMin = Math.max(0, displayYMin - visiblePadding);
                        displayYMid = (displayYMax + displayYMin) / 2;
                      }
                    }

                    return (
                      <>
                        {/* Grid lines */}
                        <line x1="50" y1="100" x2="1500" y2="100" stroke="#333" strokeWidth="2" strokeDasharray="5,5" />
                        <line x1="50" y1="226.67" x2="1500" y2="226.67" stroke="#555" strokeWidth="2" />
                        <line x1="50" y1="353.33" x2="1500" y2="353.33" stroke="#555" strokeWidth="2" />
                        <line x1="50" y1="480" x2="1500" y2="480" stroke="#333" strokeWidth="2" strokeDasharray="5,5" />

                        {/* Y-axis labels on left - dynamic based on zoom */}
                        <text x="40" y="103" fill="#ffffff" fontSize="18" fontFamily="monospace" fontWeight="bold" opacity="1" textAnchor="end" alignmentBaseline="middle">{displayYMax.toFixed(1)}</text>
                        <text x="40" y="229.67" fill="#ffffff" fontSize="18" fontFamily="monospace" fontWeight="bold" opacity="1" textAnchor="end" alignmentBaseline="middle">{displayYMid.toFixed(1)}</text>
                        <text x="40" y="483" fill="#ffffff" fontSize="18" fontFamily="monospace" fontWeight="bold" opacity="1" textAnchor="end" alignmentBaseline="middle">{displayYMin.toFixed(1)}</text>

                        {/* Sector legend at top - horizontal row */}
                        {sectorKeys.map((key, idx) => {
                          const xPos = 100 + (idx * 125); // Space sectors horizontally
                          return (
                            <g key={`legend-${key}`}>
                              <line
                                x1={xPos}
                                y1={45}
                                x2={xPos + 30}
                                y2={45}
                                stroke={sectorColors[key]}
                                strokeWidth="3"
                              />
                              <text
                                x={xPos + 35}
                                y={45}
                                fill={sectorColors[key]}
                                fontSize="12"
                                fontFamily="monospace"
                                fontWeight="bold"
                                alignmentBaseline="middle"
                              >
                                {key}
                              </text>
                            </g>
                          );
                        })}

                        {/* Sector lines */}
                        <g clipPath="url(#sector-chart-clip)">
                          {sectorKeys.map(sectorKey => {
                            const chartWidth = 1450;
                            const chartHeight = 380;

                            // Calculate visible data range using rescaleX
                            let visibleData = sectorBreadthHistory;
                            let visibleMin = yMin;
                            let visibleMax = yMax;

                            if (sectorZoomTransform) {
                              const newXScale = sectorZoomTransform.rescaleX(
                                d3.scaleLinear()
                                  .domain([0, sectorBreadthHistory.length - 1])
                                  .range([50, 50 + chartWidth])
                              );

                              const startIndex = Math.max(0, Math.floor(newXScale.invert(50)));
                              const endIndex = Math.min(sectorBreadthHistory.length - 1, Math.ceil(newXScale.invert(50 + chartWidth)));

                              visibleData = sectorBreadthHistory.slice(startIndex, endIndex + 1);

                              // Recalculate Y range for visible data
                              const visibleRatios: number[] = [];
                              visibleData.forEach(point => {
                                const ratio = point.sectorRatios[sectorKey];
                                if (ratio) visibleRatios.push(ratio);
                              });

                              if (visibleRatios.length > 0) {
                                visibleMin = Math.min(...visibleRatios);
                                visibleMax = Math.max(...visibleRatios);
                                const range = visibleMax - visibleMin;
                                const padding = range * 0.1;
                                visibleMax = visibleMax + padding;
                                visibleMin = Math.max(0, visibleMin - padding);
                              }
                            }

                            const visibleRange = visibleMax - visibleMin;

                            // Apply zoom transform to X coordinates
                            const getX = (idx: number) => {
                              const baseX = 50 + ((idx / (sectorBreadthHistory.length - 1)) * chartWidth);
                              if (sectorZoomTransform) {
                                return sectorZoomTransform.applyX(baseX);
                              }
                              return baseX;
                            };

                            const points = sectorBreadthHistory.map((point, idx) => {
                              const ratio = point.sectorRatios[sectorKey];
                              if (!ratio) return null;

                              const x = getX(idx);
                              const normalizedRatio = (ratio - visibleMin) / visibleRange;
                              const y = 480 - (normalizedRatio * chartHeight);
                              return `${x},${y}`;
                            }).filter(Boolean).join(' ');

                            return (
                              <polyline
                                key={sectorKey}
                                points={points}
                                fill="none"
                                stroke={sectorColors[sectorKey]}
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity="1"
                                shapeRendering="geometricPrecision"
                              />
                            );
                          })}
                        </g>

                        {/* X-axis labels - dynamic based on zoom */}
                        {sectorBreadthHistory.length > 1 && (() => {
                          const chartWidth = 1450;
                          let visibleIndices = sectorBreadthHistory.map((_, idx) => idx);

                          if (sectorZoomTransform) {
                            const newXScale = sectorZoomTransform.rescaleX(
                              d3.scaleLinear()
                                .domain([0, sectorBreadthHistory.length - 1])
                                .range([50, 50 + chartWidth])
                            );

                            const startIndex = Math.max(0, Math.floor(newXScale.invert(50)));
                            const endIndex = Math.min(sectorBreadthHistory.length - 1, Math.ceil(newXScale.invert(50 + chartWidth)));

                            visibleIndices = visibleIndices.slice(startIndex, endIndex + 1);
                          }

                          const maxLabels = 8;
                          const step = Math.max(1, Math.floor(visibleIndices.length / maxLabels));

                          return visibleIndices.filter((_, i) => i % step === 0 || i === visibleIndices.length - 1).map((idx) => {
                            const point = sectorBreadthHistory[idx];
                            const baseX = 50 + ((idx / (sectorBreadthHistory.length - 1)) * chartWidth);
                            const x = sectorZoomTransform ? sectorZoomTransform.applyX(baseX) : baseX;

                            if (x < 50 || x > 1500) return null;

                            const date = new Date(point.timestamp);
                            return (
                              <text
                                key={`x-label-${idx}`}
                                x={x}
                                y="495"
                                fill="#ffffff"
                                fontSize="14"
                                fontFamily="monospace"
                                fontWeight="bold"
                                opacity="1"
                                textAnchor="middle"
                              >
                                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </text>
                            );
                          });
                        })()}
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}
          </div>
        ) : (
          <div className="heatmap-loading">
            <div className="loading-spinner"></div>
            <div>Loading Historical Breadth Data...</div>
          </div>
        )
      ) : selectedETF && heatmapData.length > 0 ? (
        <div className="heatmap-content">
          {renderHeatmapGrid()}
        </div>
      ) : null}
    </div>
  );
};

export default MarketHeatmap;
