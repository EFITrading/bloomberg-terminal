'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { polygonService } from '../lib/polygonService';

interface LeadershipStock {
 symbol: string;
 sector: string;
 currentPrice: number;
 priceChange: number;
 priceChangePercent: number;
 volume: number;
 avgVolume: number;
 volumeRatio: number;
 weekHigh52: number;
 highDistance: number;
 daysSinceLastHigh: number;
 isNewBreakout: boolean;
 breakoutType: 'Fresh 52W High' | 'All-Time High' | 'Near High';
 leadershipScore: number;
 trend: 'Strong Uptrend' | 'Moderate Uptrend' | 'Consolidating' | 'Weakening';
 trendStrength: number;
 ma20: number;
 ma50: number;
 ma200: number;
 rsi: number;
 classification: 'Market Leader' | 'Sector Leader' | 'Emerging Leader' | 'Momentum Play';
}

interface ScanProgress {
 current: number;
 total: number;
}

export default function LeadershipScan() {
 const [leaders, setLeaders] = useState<LeadershipStock[]>([]);
 const [loading, setLoading] = useState(false);
 const [progress, setProgress] = useState<ScanProgress>({ current: 0, total: 0 });
 const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
 const [timeframe, setTimeframe] = useState(1.0); // 1 year
 const [minDaysBelow, setMinDaysBelow] = useState(45);

 // Comprehensive top 850 largest stocks by market cap
 const ALL_STOCKS = [
 // Mega Cap Technology (Top 50)
 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL',
 'CRM', 'ADBE', 'NFLX', 'AMD', 'INTC', 'CSCO', 'TXN', 'QCOM', 'NOW', 'INTU',
 'PYPL', 'IBM', 'AMAT', 'MU', 'ADI', 'LRCX', 'KLAC', 'MRVL', 'CRWD', 'PANW',
 'SNPS', 'CDNS', 'FTNT', 'TEAM', 'WDAY', 'DDOG', 'NET', 'OKTA', 'ZS', 'SNOW',
 'PLTR', 'U', 'RBLX', 'UBER', 'LYFT', 'ABNB', 'DOCU', 'ZM', 'ROKU', 'SQ',
 
 // Mega Cap Financials (Top 40)
 'BRK.B', 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'SPGI',
 'AXP', 'V', 'MA', 'COF', 'USB', 'TFC', 'PNC', 'BK', 'STT', 'SIVB',
 'CME', 'ICE', 'MCO', 'MSCI', 'AON', 'MMC', 'AJG', 'BRO', 'AFL', 'ALL',
 'TRV', 'PGR', 'CB', 'AIG', 'MET', 'PRU', 'WRB', 'CINF', 'L', 'RGA',
 
 // Healthcare & Pharmaceuticals (Top 60)
 'UNH', 'JNJ', 'PFE', 'ABBV', 'LLY', 'TMO', 'ABT', 'MRK', 'DHR', 'BMY',
 'AMGN', 'GILD', 'VRTX', 'REGN', 'ISRG', 'ZTS', 'CVS', 'CI', 'HUM', 'ANTM',
 'CNC', 'MOH', 'ELV', 'BIIB', 'ILMN', 'MRNA', 'NVAX', 'BNTX', 'PFE', 'TEVA',
 'CAH', 'MCK', 'ABC', 'COR', 'VTRS', 'AGN', 'BMY', 'LLY', 'NVO', 'RHHBY',
 'SYK', 'BSX', 'MDT', 'EW', 'HOLX', 'BAX', 'BDX', 'DXCM', 'RMD', 'ALGN',
 'IDXX', 'IQV', 'A', 'WAT', 'MTD', 'DGX', 'LH', 'PKI', 'TMO', 'DHR',
 
 // Consumer Discretionary (Top 50)
 'AMZN', 'HD', 'MCD', 'DIS', 'NKE', 'SBUX', 'LOW', 'TJX', 'BKNG', 'ABNB',
 'GM', 'F', 'TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'PTON', 'NFLX',
 'CMCSA', 'T', 'VZ', 'TMUS', 'CHTR', 'DISH', 'SIRI', 'LUMN', 'FOXA', 'FOX',
 'PARA', 'WBD', 'NWSA', 'NWS', 'NYT', 'TRIP', 'EXPE', 'EBAY', 'ETSY', 'W',
 'WAYFAIR', 'CHWY', 'PETS', 'CHEWY', 'BBBY', 'BBY', 'TGT', 'WMT', 'COST', 'KR',
 
 // Consumer Staples (Top 30)
 'WMT', 'PG', 'KO', 'PEP', 'COST', 'MDLZ', 'GIS', 'K', 'CPB', 'CAG',
 'HSY', 'MKC', 'SJM', 'HRL', 'TSN', 'TYSON', 'ADM', 'BG', 'CF', 'MOS',
 'KMB', 'CL', 'CHD', 'CLX', 'EL', 'COTY', 'REV', 'IFF', 'FMC', 'LW',
 
 // Energy (Top 40)
 'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'DVN',
 'PXD', 'FANG', 'MRO', 'APA', 'HES', 'BKR', 'HAL', 'WMB', 'KMI', 'OKE',
 'EPD', 'ET', 'MPLX', 'PAA', 'TRGP', 'ENB', 'TRP', 'PPL', 'SO', 'NEE',
 'DUK', 'EXC', 'XEL', 'WEC', 'ES', 'AEP', 'D', 'PCG', 'EIX', 'SRE',
 
 // Industrials (Top 60)
 'BA', 'GE', 'CAT', 'HON', 'UPS', 'FDX', 'RTX', 'LMT', 'NOC', 'GD',
 'MMM', 'ITW', 'EMR', 'ETN', 'PH', 'ROK', 'DOV', 'XYL', 'CMI', 'IR',
 'CARR', 'OTIS', 'PCAR', 'FAST', 'PAYX', 'VRSK', 'IEX', 'LDOS', 'TDG', 'CTAS',
 'RSG', 'WM', 'WCN', 'TTEK', 'J', 'JBHT', 'CHRW', 'EXPD', 'LSTR', 'ODFL',
 'CSX', 'UNP', 'NSC', 'KSU', 'CP', 'CNI', 'RAIL', 'GWR', 'GATX', 'TRN',
 'AAL', 'DAL', 'UAL', 'LUV', 'ALK', 'JBLU', 'SAVE', 'HA', 'MESA', 'SKYW',
 
 // Materials (Top 30)
 'LIN', 'APD', 'ECL', 'SHW', 'FCX', 'NEM', 'GOLD', 'AEM', 'KGC', 'AU',
 'CF', 'MOS', 'FMC', 'LYB', 'DOW', 'DD', 'PPG', 'RPM', 'VMC', 'MLM',
 'NUE', 'STLD', 'RS', 'CMC', 'X', 'CLF', 'MT', 'PKG', 'IP', 'WRK',
 
 // Real Estate (Top 30)
 'PLD', 'AMT', 'CCI', 'EQIX', 'WELL', 'DLR', 'SPG', 'O', 'VICI', 'AVB',
 'EQR', 'MAA', 'ESS', 'CPT', 'UDR', 'EXR', 'PSA', 'ARE', 'VTR', 'PEAK',
 'BXP', 'KIM', 'REG', 'FRT', 'MAC', 'SLG', 'VNO', 'HPP', 'BDN', 'ESRT',
 
 // Utilities (Top 30)
 'NEE', 'SO', 'DUK', 'AEP', 'EXC', 'XEL', 'WEC', 'ES', 'AWK', 'ATO',
 'CMS', 'DTE', 'ETR', 'FE', 'NI', 'LNT', 'EVRG', 'PNW', 'IDA', 'SWX',
 'NJR', 'NWE', 'OGE', 'POR', 'SR', 'UGI', 'UTL', 'AVA', 'BKH', 'CNP',
 
 // Communication Services (Top 25)
 'GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'ATVI',
 'EA', 'TTWO', 'RBLX', 'U', 'SNAP', 'PINS', 'TWTR', 'SPOT', 'MTCH', 'BMBL',
 'ZM', 'DOCU', 'WORK', 'TEAM', 'FIVN',
 
 // Mid Cap Growth & Value (Top 100)
 'SHOP', 'CRM', 'WDAY', 'VEEV', 'ZS', 'OKTA', 'DDOG', 'NET', 'CRWD', 'PANW',
 'FTNT', 'CYBR', 'TENB', 'S', 'ESTC', 'SPLK', 'NOW', 'SNOW', 'PLTR', 'AI',
 'NVEI', 'BILL', 'PYPL', 'SQ', 'AFRM', 'SOFI', 'LC', 'UPST', 'HOOD', 'COIN',
 'RKLB', 'SPCE', 'ASTR', 'VORB', 'MAXR', 'IRDM', 'GSAT', 'VSAT', 'SATS', 'GILT',
 'OPEN', 'RDFN', 'Z', 'ZG', 'EXPI', 'COMP', 'PCTY', 'MOVE', 'RLGY', 'ANGI',
 'IAC', 'MTCH', 'BMBL', 'GRUB', 'DASH', 'UBER', 'LYFT', 'GDRX', 'HIMS', 'TDOC',
 'AMWL', 'VEEV', 'DXCM', 'ISRG', 'ALGN', 'NVTA', 'PACB', 'ILMN', 'TWST', 'ARKG',
 'EDIT', 'CRSP', 'NTLA', 'BEAM', 'PRIME', 'DRNA', 'SGMO', 'FATE', 'BLUE', 'GILD',
 'VRTX', 'REGN', 'BIIB', 'AMGN', 'GENZ', 'CELG', 'MYL', 'PRGO', 'ENDP', 'TEVA',
 'JAZZ', 'HALO', 'INCY', 'EXEL', 'BMRN', 'RARE', 'SRPT', 'FOLD', 'IONS', 'IOVA',
 
 // Small Cap Growth & Value (Top 85)
 'ROKU', 'PINS', 'SNAP', 'TWTR', 'SPOT', 'WORK', 'TEAM', 'FIVN', 'BOX', 'DBX',
 'MDB', 'ELASTIC', 'CFLT', 'GTLB', 'PATH', 'ASAN', 'MNDY', 'NCNO', 'DOCN', 'FSLY',
 'AKAM', 'LLNW', 'EGHT', 'SMCI', 'PURE', 'PSTG', 'WDC', 'STX', 'NVME', 'MX',
 'SWKS', 'QRVO', 'MPWR', 'MXIM', 'XLNX', 'ALTR', 'LSCC', 'SLAB', 'CRUS', 'CEVA',
 'RMBS', 'ACLS', 'FORM', 'CGNX', 'ISNS', 'VIAV', 'LITE', 'AAOI', 'OPTN', 'NPTN',
 'ADTN', 'COMM', 'CALX', 'EXTR', 'CSGS', 'NTGR', 'ECOM', 'PRGS', 'PLUS', 'ALRM',
 'GOGO', 'SHEN', 'ATUS', 'CABO', 'CARS', 'CVNA', 'VROOM', 'SFT', 'CPRT', 'COPART',
 'IAA', 'KAR', 'ADESA', 'BRZE', 'ARVL', 'NKLA', 'RIDE', 'WKHS', 'HYLN', 'BLNK',
 'CHPT', 'EVGO', 'VLTA', 'QS', 'SES'
 ];

 const getSectorForStock = (symbol: string): string => {
 const sectorMap: Record<string, string> = {
 'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'AMZN': 'Consumer Disc.',
 'NVDA': 'Technology', 'META': 'Technology', 'TSLA': 'Consumer Disc.', 'AVGO': 'Technology',
 'JPM': 'Financials', 'BAC': 'Financials', 'WFC': 'Financials', 'GS': 'Financials',
 'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'PFE': 'Healthcare', 'ABBV': 'Healthcare',
 'HD': 'Consumer Disc.', 'MCD': 'Consumer Disc.', 'COST': 'Consumer Staples',
 'BA': 'Industrials', 'GE': 'Industrials', 'MMM': 'Industrials', 'CAT': 'Industrials',
 'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'EOG': 'Energy'
 };
 return sectorMap[symbol] || 'Technology';
 };

 const calculateMovingAverage = (prices: number[], period: number): number => {
 if (prices.length < period) return prices[prices.length - 1] || 0;
 const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
 return sum / period;
 };

 const calculateRSI = (prices: number[], period: number = 14): number => {
 if (prices.length < period + 1) return 50;
 
 const gains: number[] = [];
 const losses: number[] = [];
 
 for (let i = 1; i < prices.length; i++) {
 const change = prices[i] - prices[i - 1];
 gains.push(change > 0 ? change : 0);
 losses.push(change < 0 ? Math.abs(change) : 0);
 }
 
 const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
 const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
 
 if (avgLoss === 0) return 100;
 const rs = avgGain / avgLoss;
 return 100 - (100 / (1 + rs));
 };

 const calculateLeadershipMetrics = async (symbol: string): Promise<LeadershipStock | null> => {
 try {
 const endDate = new Date().toISOString().split('T')[0];
 const startDate = new Date(Date.now() - timeframe * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
 
 const data = await polygonService.getHistoricalData(symbol, startDate, endDate);
 
 if (!data?.results || data.results.length < 50) return null;
 
 const prices = data.results.map(r => r.c);
 const volumes = data.results.map(r => r.v);
 const highs = data.results.map(r => r.h);
 
 const currentPrice = prices[prices.length - 1];
 const previousPrice = prices[prices.length - 2];
 const priceChange = currentPrice - previousPrice;
 const priceChangePercent = (priceChange / previousPrice) * 100;
 
 // Calculate 52-week high and ALL-TIME high
 const weekHigh52 = Math.max(...highs);
 const allTimeHigh = Math.max(...highs); // In our data window
 const highDistance = ((currentPrice - weekHigh52) / weekHigh52) * 100;
 
 // FRESH BREAKOUT DETECTION: Stock breaking OUT to reach ATH/52W high for first time in 45+ days
 let isNewBreakout = false;
 let breakoutType: LeadershipStock['breakoutType'] = 'Near High';
 let daysSinceLastHigh = 0;
 
 // Find the actual 52-week high and all-time high in our data
 const allTimeHighInData = Math.max(...highs);
 
 // Check if current price is NOW reaching the 52W/ATH level (within 1% to account for breakout)
 const isReachingATH = currentPrice >= allTimeHighInData * 0.99;
 const isReaching52WHigh = currentPrice >= weekHigh52 * 0.99;
 
 if (isReachingATH || isReaching52WHigh) {
 // Check that stock was BELOW this level for the past minDaysBelow days
 let wasBelow = true;
 let daysSinceBelow = 0;
 
 // Look back to ensure stock was consistently BELOW the high level
 for (let i = highs.length - 2; i >= Math.max(0, highs.length - 90); i--) {
 const pastHigh = highs[i];
 const daysAgo = highs.length - 1 - i;
 
 // If we were AT the high level recently, it's not a fresh breakout
 if (pastHigh >= weekHigh52 * 0.99) {
 if (daysAgo <= minDaysBelow) {
 wasBelow = false; // We were at high level too recently
 break;
 } else {
 daysSinceLastHigh = daysAgo;
 break; // Found when we were last at this level
 }
 }
 }
 
 // If we haven't found when we were last at this level, set to max days
 if (daysSinceLastHigh === 0) {
 daysSinceLastHigh = 90; // Default to 90+ days
 }
 
 // TRUE FRESH BREAKOUT: Was below for required period and now breaking out
 if (wasBelow && daysSinceLastHigh >= minDaysBelow) {
 isNewBreakout = true;
 
 // Determine breakout type
 if (currentPrice >= allTimeHighInData * 0.99) {
 breakoutType = 'All-Time High';
 } else {
 breakoutType = 'Fresh 52W High';
 }
 }
 }
 
 // Only process stocks that are fresh breakouts
 if (!isNewBreakout) {
 return null;
 }
 
 // Volume analysis
 const currentVolume = volumes[volumes.length - 1];
 const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
 const volumeRatio = currentVolume / avgVolume;
 
 // Moving averages
 const ma20 = calculateMovingAverage(prices, 20);
 const ma50 = calculateMovingAverage(prices, 50);
 const ma200 = calculateMovingAverage(prices, 200);
 
 // RSI
 const rsi = calculateRSI(prices);
 
 // Trend Analysis
 const shortTermTrend = currentPrice > ma20 && ma20 > ma50;
 const longTermTrend = ma50 > ma200;
 const priceAboveMA = currentPrice > ma20 && currentPrice > ma50 && currentPrice > ma200;
 
 let trend: LeadershipStock['trend'];
 let trendStrength = 0;
 
 if (priceAboveMA && shortTermTrend && longTermTrend) {
 trend = 'Strong Uptrend';
 trendStrength = 90;
 } else if (priceAboveMA && shortTermTrend) {
 trend = 'Moderate Uptrend';
 trendStrength = 70;
 } else if (currentPrice > ma20) {
 trend = 'Consolidating';
 trendStrength = 50;
 } else {
 trend = 'Weakening';
 trendStrength = 30;
 }
 
 // Enhanced Leadership Score for Fresh Breakouts
 const breakoutScore = breakoutType === 'All-Time High' ? 40 : 35; // Higher weight for fresh breakouts
 const volumeScore = volumeRatio >= 2.0 ? 30 : volumeRatio >= 1.5 ? 20 : 10; // Higher volume requirements
 const maScore = priceAboveMA ? 20 : currentPrice > ma20 ? 10 : 0;
 const momentumScore = priceChangePercent >= 3 ? 15 : priceChangePercent >= 1 ? 10 : 5;
 
 const leadershipScore = breakoutScore + volumeScore + maScore + momentumScore;
 
 // Classification for Breakout Stocks
 let classification: LeadershipStock['classification'];
 if (leadershipScore >= 90 && breakoutType === 'All-Time High') {
 classification = 'Market Leader';
 } else if (leadershipScore >= 80) {
 classification = 'Sector Leader';
 } else if (leadershipScore >= 70) {
 classification = 'Emerging Leader';
 } else {
 classification = 'Momentum Play';
 }
 
 // Higher threshold for fresh breakouts - we want quality
 if (leadershipScore >= 70 && volumeRatio >= 1.2) {
 return {
 symbol,
 sector: getSectorForStock(symbol),
 currentPrice,
 priceChange,
 priceChangePercent,
 volume: currentVolume,
 avgVolume,
 volumeRatio,
 weekHigh52,
 highDistance,
 daysSinceLastHigh,
 isNewBreakout,
 breakoutType,
 leadershipScore,
 trend,
 trendStrength,
 ma20,
 ma50,
 ma200,
 rsi,
 classification
 };
 }
 
 return null;
 } catch (error) {
 console.error(`Error calculating leadership metrics for ${symbol}:`, error);
 return null;
 }
 };

 const runLeadershipScan = useCallback(async () => {
 setLoading(true);
 setLeaders([]);
 setProgress({ current: 0, total: ALL_STOCKS.length });

 try {
 // Process stocks in batches with real-time updates
 for (let i = 0; i < ALL_STOCKS.length; i += 5) {
 const batch = ALL_STOCKS.slice(i, i + 5);
 
 await Promise.all(batch.map(async (symbol) => {
 try {
 const metrics = await calculateLeadershipMetrics(symbol);
 if (metrics) {
 // Update leaders state immediately as data comes in
 setLeaders(prevLeaders => {
 const newLeaders = [...prevLeaders, metrics]
 .sort((a, b) => b.leadershipScore - a.leadershipScore)
 .slice(0, 25); // Keep top 25 leaders
 return newLeaders;
 });
 }
 } catch (error) {
 // Silent error handling for individual stocks
 }
 
 setProgress(prev => ({ ...prev, current: prev.current + 1 }));
 }));

 // Small delay between batches
 if (i + 5 < ALL_STOCKS.length) {
 await new Promise(resolve => setTimeout(resolve, 500));
 }
 }

 setLastUpdate(new Date());

 } catch (error) {
 console.error('Error running leadership scan:', error);
 } finally {
 setLoading(false);
 setProgress({ current: 0, total: 0 });
 }
 }, [timeframe, minDaysBelow]); // Include dependencies that affect the calculation

 const formatPrice = (price: number) => {
 return new Intl.NumberFormat('en-US', {
 style: 'currency',
 currency: 'USD',
 minimumFractionDigits: 2,
 maximumFractionDigits: 2
 }).format(price);
 };

 const formatVolume = (volume: number) => {
 if (volume >= 1000000) {
 return `${(volume / 1000000).toFixed(1)}M`;
 } else if (volume >= 1000) {
 return `${(volume / 1000).toFixed(1)}K`;
 }
 return volume.toString();
 };

 const getClassificationColor = (classification: string) => {
 switch (classification) {
 case 'Market Leader': return '#00ff41';
 case 'Sector Leader': return '#ffff00';
 case 'Emerging Leader': return '#ff8c00';
 case 'Momentum Play': return '#00d4ff';
 default: return '#888888';
 }
 };

 const getTrendColor = (trend: string) => {
 switch (trend) {
 case 'Strong Uptrend': return '#00ff41';
 case 'Moderate Uptrend': return '#ffff00';
 case 'Consolidating': return '#ff8c00';
 case 'Weakening': return '#ff073a';
 default: return '#888888';
 }
 };

 const getBreakoutColor = (breakoutType: string) => {
 switch (breakoutType) {
 case 'All-Time High': return '#00ff41';
 case 'Fresh 52W High': return '#ffff00';
 case 'Near High': return '#ff8c00';
 default: return '#888888';
 }
 };

 const renderLeaderCard = (leader: LeadershipStock, index: number) => (
 <div key={`${leader.symbol}-${index}`} style={{
 background: 'linear-gradient(135deg, #1a1a1a 0%, #262626 50%, #1a1a1a 100%)',
 border: '1px solid #333333',
 borderRadius: '8px',
 padding: '16px',
 margin: '8px 0',
 boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
 animation: `slideIn 0.6s ease-out ${index * 0.1}s both`,
 transition: 'all 0.3s ease',
 position: 'relative',
 overflow: 'hidden'
 }}
 onMouseEnter={(e) => {
 e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
 e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.4), 0 0 20px rgba(255, 140, 0, 0.3)';
 }}
 onMouseLeave={(e) => {
 e.currentTarget.style.transform = 'translateY(0) scale(1)';
 e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
 }}
 >
 {/* Header */}
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
 <div>
 <div style={{
 color: '#ff8c00',
 fontSize: '16px',
 fontWeight: '900',
 fontFamily: 'JetBrains Mono, monospace',
 letterSpacing: '1px',
 textShadow: '0 0 10px rgba(255, 140, 0, 0.4)'
 }}>
 {leader.symbol}
 </div>
 <div style={{
 color: '#888888',
 fontSize: '10px',
 fontFamily: 'JetBrains Mono, monospace',
 textTransform: 'uppercase',
 letterSpacing: '0.5px'
 }}>
 {leader.sector}
 </div>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
 <div style={{
 background: `linear-gradient(135deg, ${getBreakoutColor(leader.breakoutType)}20, ${getBreakoutColor(leader.breakoutType)}40)`,
 border: `1px solid ${getBreakoutColor(leader.breakoutType)}`,
 borderRadius: '4px',
 padding: '4px 8px',
 color: getBreakoutColor(leader.breakoutType),
 fontSize: '9px',
 fontWeight: '700',
 fontFamily: 'JetBrains Mono, monospace',
 textShadow: `0 0 8px ${getBreakoutColor(leader.breakoutType)}40`
 }}>
 {leader.breakoutType}
 </div>
 <div style={{
 background: `linear-gradient(135deg, ${getClassificationColor(leader.classification)}20, ${getClassificationColor(leader.classification)}40)`,
 border: `1px solid ${getClassificationColor(leader.classification)}`,
 borderRadius: '4px',
 padding: '4px 8px',
 color: getClassificationColor(leader.classification),
 fontSize: '9px',
 fontWeight: '700',
 fontFamily: 'JetBrains Mono, monospace',
 textShadow: `0 0 8px ${getClassificationColor(leader.classification)}40`
 }}>
 {leader.classification}
 </div>
 </div>
 </div>

 {/* Price Info */}
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
 <div>
 <div style={{ 
 color: '#888888', 
 marginBottom: '2px',
 fontSize: '9px',
 fontWeight: '600',
 textTransform: 'uppercase',
 letterSpacing: '0.5px'
 }}>
 CURRENT PRICE
 </div>
 <div style={{ 
 color: '#ffffff', 
 fontWeight: '800',
 fontSize: '14px',
 fontFamily: 'JetBrains Mono, monospace'
 }}>
 {formatPrice(leader.currentPrice)}
 </div>
 </div>
 <div>
 <div style={{ 
 color: '#888888', 
 marginBottom: '2px',
 fontSize: '9px',
 fontWeight: '600',
 textTransform: 'uppercase',
 letterSpacing: '0.5px'
 }}>
 DAILY CHANGE
 </div>
 <div style={{ 
 color: leader.priceChangePercent >= 0 ? '#00ff41' : '#ff073a',
 fontWeight: '800',
 fontSize: '12px',
 fontFamily: 'JetBrains Mono, monospace'
 }}>
 {leader.priceChangePercent >= 0 ? '+' : ''}{leader.priceChangePercent.toFixed(2)}%
 </div>
 </div>
 <div>
 <div style={{ 
 color: '#888888', 
 marginBottom: '2px',
 fontSize: '9px',
 fontWeight: '600',
 textTransform: 'uppercase',
 letterSpacing: '0.5px'
 }}>
 DAYS SINCE HIGH
 </div>
 <div style={{ 
 color: leader.daysSinceLastHigh >= 60 ? '#00ff41' : leader.daysSinceLastHigh >= 30 ? '#ffff00' : '#ff8c00',
 fontWeight: '800',
 fontSize: '12px',
 fontFamily: 'JetBrains Mono, monospace'
 }}>
 {leader.daysSinceLastHigh}+ DAYS
 </div>
 </div>
 </div>

 {/* Leadership Metrics */}
 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
 <div>
 <div style={{ 
 color: '#888888', 
 marginBottom: '2px',
 fontSize: '9px',
 fontWeight: '600',
 textTransform: 'uppercase',
 letterSpacing: '0.5px'
 }}>
 LEADERSHIP SCORE
 </div>
 <div style={{ 
 color: '#ff8c00', 
 fontWeight: '800',
 fontSize: '14px',
 fontFamily: 'JetBrains Mono, monospace',
 textShadow: '0 0 8px rgba(255, 140, 0, 0.4)'
 }}>
 {leader.leadershipScore}/100
 </div>
 </div>
 <div>
 <div style={{ 
 color: '#888888', 
 marginBottom: '2px',
 fontSize: '9px',
 fontWeight: '600',
 textTransform: 'uppercase',
 letterSpacing: '0.5px'
 }}>
 TREND
 </div>
 <div style={{ 
 color: getTrendColor(leader.trend),
 fontWeight: '800',
 fontSize: '11px',
 fontFamily: 'JetBrains Mono, monospace',
 textShadow: `0 0 8px ${getTrendColor(leader.trend)}40`
 }}>
 {leader.trend}
 </div>
 </div>
 </div>

 {/* Volume Info */}
 <div style={{
 borderTop: '1px solid #333333',
 paddingTop: '8px',
 color: '#999999',
 fontSize: '10px',
 fontFamily: 'JetBrains Mono, monospace',
 display: 'flex',
 justifyContent: 'space-between'
 }}>
 <span>VOL: {formatVolume(leader.volume)}</span>
 <span>AVG: {formatVolume(leader.avgVolume)}</span>
 <span>RATIO: {leader.volumeRatio.toFixed(1)}x</span>
 </div>
 </div>
 );

 return (
 <div className="terminal-panel" style={{ 
 margin: '20px', 
 height: '85vh',
 maxHeight: '85vh',
 overflow: 'hidden',
 display: 'flex',
 flexDirection: 'column',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace'
 }}>
 {/* CSS Animations */}
 <style jsx>{`
 @keyframes slideIn {
 from {
 opacity: 0;
 transform: translateY(20px) scale(0.95);
 }
 to {
 opacity: 1;
 transform: translateY(0) scale(1);
 }
 }
 
 @keyframes pulse {
 0%, 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.7;
 }
 }
 
 @keyframes glow {
 0%, 100% {
 box-shadow: 0 0 15px rgba(255, 140, 0, 0.3);
 }
 50% {
 box-shadow: 0 0 25px rgba(255, 140, 0, 0.6);
 }
 }
 
 @keyframes scanLine {
 0% {
 transform: translateX(-100%);
 }
 100% {
 transform: translateX(100%);
 }
 }
 
 /* Custom Scrollbar Styling */
 .custom-scrollbar::-webkit-scrollbar {
 width: 12px;
 }
 
 .custom-scrollbar::-webkit-scrollbar-track {
 background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
 border-radius: 6px;
 border: 2px solid #333333;
 box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3);
 }
 
 .custom-scrollbar::-webkit-scrollbar-thumb {
 background: linear-gradient(135deg, #ff8c00 0%, #e67c00 100%);
 border-radius: 6px;
 border: 2px solid #cc7700;
 box-shadow: 0 0 12px rgba(255, 140, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2);
 }
 
 .custom-scrollbar::-webkit-scrollbar-thumb:hover {
 background: linear-gradient(135deg, #ffaa33 0%, #ff8c00 100%);
 box-shadow: 0 0 16px rgba(255, 140, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.3);
 transform: scale(1.1);
 }
 
 .custom-scrollbar::-webkit-scrollbar-thumb:active {
 background: linear-gradient(135deg, #ffcc66 0%, #ffaa33 100%);
 box-shadow: 0 0 20px rgba(255, 140, 0, 0.9);
 }
 
 .custom-scrollbar::-webkit-scrollbar-corner {
 background: #1a1a1a;
 }
 `}</style>

 {/* Terminal Header */}
 <div className="panel-header" style={{
 background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #111111 100%)',
 borderBottom: '3px solid #ff8c00',
 padding: '20px 24px',
 position: 'relative',
 overflow: 'hidden',
 boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
 }}>
 {/* Animated scan line */}
 <div style={{
 position: 'absolute',
 top: 0,
 left: 0,
 right: 0,
 height: '2px',
 background: 'linear-gradient(90deg, transparent 0%, #ff8c00 50%, transparent 100%)',
 animation: 'scanLine 3s ease-in-out infinite'
 }} />
 
 <div style={{
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 position: 'relative',
 zIndex: 1
 }}>
 <div>
 <h1 style={{
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '20px',
 fontWeight: '900',
 color: '#ff8c00',
 textTransform: 'uppercase',
 letterSpacing: '2.5px',
 textShadow: '0 0 20px rgba(255, 140, 0, 0.4), 0 2px 0 rgba(0, 0, 0, 0.8), 0 0 40px rgba(255, 140, 0, 0.2)',
 margin: 0,
 WebkitTextStroke: '0.5px rgba(255, 140, 0, 0.2)',
 textRendering: 'optimizeLegibility',
 WebkitFontSmoothing: 'antialiased',
 MozOsxFontSmoothing: 'grayscale',
 animation: 'glow 2s ease-in-out infinite alternate'
 }}>
 LEADERSHIP SCAN
 </h1>
 <div style={{
 color: '#e0e0e0',
 fontSize: '13px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 marginTop: '6px',
 fontWeight: '600',
 letterSpacing: '0.8px',
 textShadow: '0 1px 0 rgba(0, 0, 0, 0.8), 0 0 10px rgba(224, 224, 224, 0.2)',
 WebkitFontSmoothing: 'antialiased'
 }}>
 Stocks breaking OUT to ATH/52W high after being below for {minDaysBelow}+ days
 {lastUpdate && (
 <span style={{ 
 marginLeft: '20px', 
 color: '#999999',
 fontSize: '12px',
 fontWeight: '500'
 }}>
 Last Update: {lastUpdate.toLocaleTimeString()}
 </span>
 )}
 </div>
 </div>
 
 <button
 onClick={runLeadershipScan}
 disabled={loading}
 style={{
 background: loading ? 'linear-gradient(135deg, #666666 0%, #555555 100%)' : 'linear-gradient(135deg, #ff8c00 0%, #ffa500 100%)',
 color: loading ? '#999999' : '#000000',
 border: 'none',
 padding: '12px 24px',
 borderRadius: '6px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '12px',
 fontWeight: '800',
 textTransform: 'uppercase',
 letterSpacing: '1px',
 cursor: loading ? 'not-allowed' : 'pointer',
 boxShadow: loading ? 'none' : '0 4px 15px rgba(255, 140, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
 transition: 'all 0.3s',
 animation: loading ? 'pulse 1s ease-in-out infinite' : 'none'
 }}
 >
 {loading ? 'SCANNING...' : 'RUN LEADERSHIP SCAN'}
 </button>
 </div>
 </div>

 {/* Controls */}
 <div style={{
 background: 'linear-gradient(135deg, #1a1a1a 0%, #111111 100%)',
 borderBottom: '1px solid #333333',
 padding: '16px 24px',
 display: 'flex',
 alignItems: 'center',
 gap: '20px'
 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
 <label style={{
 color: '#e0e0e0',
 fontSize: '12px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontWeight: '600',
 letterSpacing: '0.5px'
 }}>
 TIMEFRAME:
 </label>
 <select
 value={timeframe}
 onChange={(e) => setTimeframe(parseFloat(e.target.value))}
 style={{
 background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)',
 color: '#ffffff',
 border: '1px solid #333333',
 borderRadius: '4px',
 padding: '8px 12px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '11px',
 fontWeight: '600',
 letterSpacing: '0.5px'
 }}
 >
 <option value={0.5}>6 MONTHS</option>
 <option value={1.0}>1 YEAR</option>
 <option value={2.0}>2 YEARS</option>
 </select>
 </div>
 
 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
 <label style={{
 color: '#e0e0e0',
 fontSize: '12px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontWeight: '600',
 letterSpacing: '0.5px'
 }}>
 MIN DAYS BELOW HIGH:
 </label>
 <select
 value={minDaysBelow}
 onChange={(e) => setMinDaysBelow(parseInt(e.target.value))}
 style={{
 background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)',
 color: '#ffffff',
 border: '1px solid #333333',
 borderRadius: '4px',
 padding: '8px 12px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '11px',
 fontWeight: '600',
 letterSpacing: '0.5px'
 }}
 >
 <option value={30}>30 DAYS - FREQUENT</option>
 <option value={45}>45 DAYS - TRUE BREAKOUTS</option>
 <option value={60}>60 DAYS - MAJOR MOVES</option>
 <option value={90}>90 DAYS - RARE EVENTS</option>
 </select>
 </div>
 
 {loading && (
 <div style={{
 display: 'flex',
 alignItems: 'center',
 gap: '20px',
 animation: 'slideIn 0.5s ease-out'
 }}>
 <div style={{
 color: '#ff8c00',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '12px',
 fontWeight: '700',
 letterSpacing: '0.8px',
 textShadow: '0 0 10px rgba(255, 140, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.8)',
 WebkitFontSmoothing: 'antialiased'
 }}>
 PROCESSING: {progress.current} / {progress.total}
 </div>
 <div style={{
 width: '240px',
 height: '8px',
 background: 'linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%)',
 borderRadius: '4px',
 overflow: 'hidden',
 border: '1px solid #333333',
 boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
 }}>
 <div style={{
 width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
 height: '100%',
 background: 'linear-gradient(135deg, #ff8c00 0%, #ffa500 50%, #ffcc00 100%)',
 transition: 'width 0.3s ease',
 boxShadow: '0 0 10px rgba(255, 140, 0, 0.5)',
 position: 'relative'
 }}>
 <div style={{
 position: 'absolute',
 top: 0,
 left: '-100%',
 width: '100%',
 height: '100%',
 background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)',
 animation: 'scanLine 2s ease-in-out infinite'
 }} />
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Results */}
 <div style={{
 flex: 1,
 padding: '20px',
 overflowY: 'auto',
 overflowX: 'hidden'
 }} className="custom-scrollbar">
 {leaders.length > 0 ? (
 <div>
 <div style={{
 color: '#ff8c00',
 fontSize: '14px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontWeight: '700',
 marginBottom: '20px',
 textTransform: 'uppercase',
 letterSpacing: '1px',
 textShadow: '0 0 10px rgba(255, 140, 0, 0.4)'
 }}>
 {leaders.length} FRESH BREAKOUT{leaders.length !== 1 ? 'S' : ''} DETECTED
 </div>
 <div style={{
 display: 'grid',
 gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
 gap: '16px'
 }}>
 {leaders.map((leader, index) => renderLeaderCard(leader, index))}
 </div>
 </div>
 ) : !loading ? (
 <div style={{
 textAlign: 'center',
 color: '#666666',
 fontFamily: 'JetBrains Mono, monospace',
 marginTop: '80px'
 }}>
 <div style={{ fontSize: '48px', marginBottom: '24px' }}>�</div>
 <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>FRESH BREAKOUT SCANNER READY</div>
 <div style={{ fontSize: '12px' }}>Find stocks breaking OUT to reach ATH/52W high after {minDaysBelow}+ days below</div>
 </div>
 ) : null}
 </div>
 </div>
 );
}