'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { polygonService } from '../lib/polygonService';

interface RSMetrics {
 percentile: number;
 isBreakout: boolean;
 isRareLow: boolean;
 isBreakdown: boolean;
 classification: 'LEADING' | 'IMPROVING' | 'WEAKENING' | 'LAGGING';
 currentPrice: number;
 priceChange: number;
 volume: number;
}

interface StockSignal {
 symbol: string;
 percentile: number;
 classification: string;
 signalType: 'breakout' | 'rareLow' | 'breakdown';
 currentPrice: number;
 priceChange: number;
 priceChangePercent: number;
 volume: number;
 sector: string;
}

// Comprehensive sector mapping with all major holdings
const SECTOR_STOCKS = {
 'Technology': [
 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM', 'ORCL', 'INTC', 'AMD', 'AVGO', 
 'CSCO', 'IBM', 'QCOM', 'TXN', 'UBER', 'LYFT', 'SHOP', 'SNOW', 'PLTR', 'NET', 'DDOG', 'ZM', 'DOCU', 'TWLO', 'OKTA', 
 'CRWD', 'ZS', 'PANW', 'FTNT', 'CYBR', 'SPLK', 'NOW', 'WDAY', 'VEEV', 'TEAM', 'ATLASSIAN', 'MDB', 'ESTC', 'GTLB'
 ],
 'Healthcare': [
 'JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY', 'LLY', 'MRK', 'AMGN', 'GILD', 'MDT', 'CI', 'ANTM', 'CVS', 
 'HUM', 'WBA', 'CVS', 'MCK', 'CAH', 'ABC', 'ISRG', 'SYK', 'BSX', 'EW', 'ZBH', 'BAX', 'BDX', 'A', 'ALGN', 'IDXX', 
 'IQV', 'REGN', 'VRTX', 'BIIB', 'MRNA', 'BNTX', 'ZTS', 'ELV', 'CNC', 'MOH', 'HCA', 'UHS', 'DVA', 'FMS'
 ],
 'Financials': [
 'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'SCHW', 'BLK', 'SPGI', 'ICE', 'CME', 'MCO', 'MSCI', 
 'COF', 'USB', 'TFC', 'PNC', 'BK', 'STT', 'NTRS', 'RF', 'CFG', 'HBAN', 'FITB', 'KEY', 'CMA', 'ZION', 'WTFC', 'FRC', 
 'SIVB', 'PACW', 'WAL', 'SBNY', 'OZK', 'EWBC', 'CBSH', 'SNV', 'IBOC', 'FULT', 'ONB', 'UBSI', 'FFIN', 'WSFS'
 ],
 'Consumer Discretionary': [
 'AMZN', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'TJX', 'F', 'GM', 'BKNG', 'ABNB', 'EBAY', 'MAR', 'HLT', 'MGM', 'WYNN', 
 'LVS', 'CZR', 'PENN', 'DKNG', 'NCLH', 'RCL', 'CCL', 'DAL', 'UAL', 'AAL', 'LUV', 'JBLU', 'ALK', 'SAVE', 'EXPE', 
 'TRIP', 'LYFT', 'UBER', 'DIS', 'CMCSA', 'CHTR', 'DISH', 'NFLX', 'ROKU', 'SPOT', 'SIRI', 'WBD', 'PARA', 'FOX', 'FOXA'
 ],
 'Communication Services': [
 'GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'CHTR', 'TMUS', 'DISH', 'SIRI', 'LUMN', 'WBD', 'PARA', 
 'FOX', 'FOXA', 'NYT', 'ROKU', 'PINS', 'SNAP', 'TWTR', 'ZM', 'DOCU', 'TEAM', 'PTON', 'SPOT', 'TTD', 'TRADE', 'IAC', 
 'MTCH', 'BMBL', 'ANGI', 'YELP', 'GRPN', 'QUOT', 'CARS', 'ZIP', 'REZI', 'OPRX', 'EVER', 'OPEN', 'RDFN', 'CARG'
 ],
 'Industrials': [
 'BA', 'HON', 'UPS', 'FDX', 'LMT', 'RTX', 'CAT', 'DE', 'GE', 'MMM', 'UNP', 'CSX', 'NSC', 'CP', 'CNI', 'KSU', 'ODFL', 
 'XPO', 'CHRW', 'EXPD', 'JBHT', 'KNX', 'LSTR', 'ARCB', 'SAIA', 'YELL', 'WERN', 'ALK', 'MATX', 'GNTX', 'JOBY', 'ACHR', 
 'LILM', 'EVTL', 'BLDE', 'PH', 'EMR', 'ETN', 'ITW', 'ROK', 'DOV', 'XYL', 'FTV', 'IEX', 'RRX', 'GNRC', 'IR', 'CARR'
 ],
 'Consumer Staples': [
 'PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'KHC', 'GIS', 'K', 'HSY', 'CPB', 'CAG', 'SJM', 'HRL', 'TSN', 'TYSON', 
 'JM', 'BG', 'ADM', 'CALM', 'SAFM', 'LNDC', 'JJSF', 'USFD', 'SYY', 'PFGC', 'UNFI', 'ACI', 'KR', 'SFM', 'WBA', 'CVS', 
 'RAD', 'RITE', 'DRUG', 'FRED', 'HIMS', 'GDDY', 'VIRT', 'EYE', 'VUZI', 'HEAR', 'KOSS', 'KODK', 'EXPR', 'BBBY'
 ],
 'Energy': [
 'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PXD', 'VLO', 'MPC', 'PSX', 'KMI', 'OKE', 'WMB', 'EPD', 'ET', 'MPLX', 'PAA', 
 'PAGP', 'BKR', 'HAL', 'OIH', 'XLE', 'USO', 'UCO', 'DWT', 'SCO', 'ERX', 'ERY', 'GUSH', 'DRIP', 'NRGU', 'BOIL', 'KOLD', 
 'UNG', 'UGAZ', 'DGAZ', 'AMJ', 'AMLP', 'MLPX', 'EMLP', 'MLPA', 'SMLP', 'NDP', 'OMP', 'NS', 'SRLP', 'USAC', 'DMLP'
 ],
 'Utilities': [
 'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'XEL', 'WEC', 'PEG', 'ED', 'EIX', 'ETR', 'ES', 'PPL', 'FE', 'AWK', 'ATO', 
 'CMS', 'CNP', 'NI', 'LNT', 'EVRG', 'AEE', 'PNW', 'SRE', 'PCG', 'IDA', 'UGI', 'NJR', 'SWX', 'ORA', 'BKH', 'MDU', 
 'UTL', 'MGEE', 'AVA', 'AGR', 'AWR', 'CWT', 'YORW', 'CTWS', 'MSEX', 'SJW', 'GWRS', 'POWI', 'NOVA', 'SPWR', 'FSLR'
 ],
 'Materials': [
 'LIN', 'APD', 'SHW', 'ECL', 'DD', 'DOW', 'NUE', 'FCX', 'NEM', 'GOLD', 'PKG', 'IP', 'CF', 'LYB', 'EMN', 'IFF', 'FMC', 
 'RPM', 'SEE', 'MLM', 'VMC', 'CRH', 'X', 'CLF', 'STLD', 'RS', 'CMC', 'GGB', 'SID', 'TX', 'TERN', 'CLW', 'KWR', 'OLN', 
 'ASH', 'CBT', 'CC', 'CYH', 'FUL', 'GEF', 'HWKN', 'KOP', 'MERC', 'MOS', 'NEU', 'OEC', 'RGLD', 'SCCO', 'SMG', 'SON'
 ],
 'Real Estate': [
 'AMT', 'PLD', 'CCI', 'EQIX', 'WELL', 'SPG', 'DLR', 'O', 'PSA', 'CBRE', 'AVB', 'EQR', 'SBAC', 'VTR', 'ARE', 'MAA', 
 'INVH', 'ESS', 'KIM', 'UDR', 'HST', 'REG', 'FRT', 'BXP', 'VNO', 'SLG', 'HIW', 'ARE', 'BMR', 'CDP', 'CUZ', 'DEI', 
 'ELS', 'EPR', 'EXR', 'FPI', 'FR', 'GNL', 'GTY', 'HR', 'JBGS', 'KRC', 'KRG', 'LTC', 'MAC', 'MPW', 'NNN', 'OHI', 'OLP'
 ]
};

// Flatten all stocks for easy iteration - FULL SECTOR SCAN
const ALL_STOCKS = Object.values(SECTOR_STOCKS).flat();

const RSScreener: React.FC = () => {
 const [lookbackYears, setLookbackYears] = useState(1.0);
 const [loading, setLoading] = useState(false);
 const [progress, setProgress] = useState({ current: 0, total: 0 });
 const [signals, setSignals] = useState<{
 breakouts: StockSignal[];
 rareLows: StockSignal[];
 breakdowns: StockSignal[];
 }>({
 breakouts: [],
 rareLows: [],
 breakdowns: []
 });
 const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

 // Get sector for a stock
 const getSectorForStock = (symbol: string): string => {
 for (const [sector, stocks] of Object.entries(SECTOR_STOCKS)) {
 if (stocks.includes(symbol)) {
 return sector;
 }
 }
 return 'Unknown';
 };

 // Calculate RS metrics for a given symbol
 const calculateRSMetrics = async (symbol: string): Promise<RSMetrics | null> => {
 try {
 const endDate = new Date().toISOString().split('T')[0];
 const startDate = new Date(Date.now() - lookbackYears * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

 // Get price data for both symbol and SPY
 const [symbolData, spyData] = await Promise.all([
 polygonService.getHistoricalData(symbol, startDate, endDate, 'day', 1),
 polygonService.getHistoricalData('SPY', startDate, endDate, 'day', 1)
 ]);

 if (!symbolData || !spyData || !symbolData.results || !spyData.results || symbolData.results.length === 0 || spyData.results.length === 0) {
 return null;
 }

 // Calculate relative strength ratios
 const rsRatios: number[] = [];
 const minLength = Math.min(symbolData.results.length, spyData.results.length);

 for (let i = 0; i < minLength; i++) {
 const symbolPrice = symbolData.results[i].c;
 const spyPrice = spyData.results[i].c;
 if (symbolPrice && spyPrice && spyPrice !== 0) {
 rsRatios.push(symbolPrice / spyPrice);
 }
 }

 if (rsRatios.length < 50) {
 return null;
 }

 // Calculate metrics
 const currentRS = rsRatios[rsRatios.length - 1];
 const rsHigh = Math.max(...rsRatios);
 const rsLow = Math.min(...rsRatios);
 const rsSMA50 = rsRatios.slice(-50).reduce((a, b) => a + b, 0) / 50;

 // Calculate percentile
 const percentile = ((currentRS - rsLow) / (rsHigh - rsLow)) * 100;

 // Signal detection
 const isBreakout = currentRS >= rsHigh * 0.97 && percentile >= 85;
 const isRareLow = percentile <= 25 && currentRS >= rsSMA50;
 const isBreakdown = currentRS <= rsLow * 1.03 && percentile <= 15;

 // Classification
 let classification: 'LEADING' | 'IMPROVING' | 'WEAKENING' | 'LAGGING';
 if (percentile >= 75) classification = 'LEADING';
 else if (percentile >= 50) classification = 'IMPROVING';
 else if (percentile >= 25) classification = 'WEAKENING';
 else classification = 'LAGGING';

 // Get current price data
 const latest = symbolData.results[symbolData.results.length - 1];
 const previous = symbolData.results[symbolData.results.length - 2];
 const currentPrice = latest.c;
 const priceChange = previous ? latest.c - previous.c : 0;
 const volume = latest.v || 0;

 return {
 percentile,
 isBreakout,
 isRareLow,
 isBreakdown,
 classification,
 currentPrice,
 priceChange,
 volume
 };
 } catch (error) {
 return null;
 }
 };

 // Run the screener
 const runScreener = useCallback(async () => {
 setLoading(true);
 setProgress({ current: 0, total: ALL_STOCKS.length });
 
 // Reset signals at start
 setSignals({
 breakouts: [],
 rareLows: [],
 breakdowns: []
 });
 
 try {
 // Process all stocks with progress tracking and real-time updates
 for (let i = 0; i < ALL_STOCKS.length; i += 5) {
 const batch = ALL_STOCKS.slice(i, i + 5);
 
 await Promise.all(batch.map(async (symbol) => {
 try {
 const metrics = await calculateRSMetrics(symbol);
 if (metrics) {
 const sector = getSectorForStock(symbol);
 const priceChangePercent = metrics.currentPrice > 0 ? (metrics.priceChange / (metrics.currentPrice - metrics.priceChange)) * 100 : 0;

 // Create signal object
 const signalData = {
 symbol,
 percentile: metrics.percentile,
 classification: metrics.classification,
 currentPrice: metrics.currentPrice,
 priceChange: metrics.priceChange,
 priceChangePercent,
 volume: metrics.volume,
 sector
 };

 // Update signals state immediately as data comes in
 if (metrics.isBreakout) {
 setSignals(prevSignals => {
 const newBreakouts = [...prevSignals.breakouts, { ...signalData, signalType: 'breakout' as const }]
 .sort((a, b) => b.percentile - a.percentile)
 .slice(0, 15);
 return { ...prevSignals, breakouts: newBreakouts };
 });
 }
 if (metrics.isRareLow) {
 setSignals(prevSignals => {
 const newRareLows = [...prevSignals.rareLows, { ...signalData, signalType: 'rareLow' as const }]
 .sort((a, b) => a.percentile - b.percentile)
 .slice(0, 15);
 return { ...prevSignals, rareLows: newRareLows };
 });
 }
 if (metrics.isBreakdown) {
 setSignals(prevSignals => {
 const newBreakdowns = [...prevSignals.breakdowns, { ...signalData, signalType: 'breakdown' as const }]
 .sort((a, b) => a.percentile - b.percentile)
 .slice(0, 15);
 return { ...prevSignals, breakdowns: newBreakdowns };
 });
 }
 }
 } catch (error) {
 // Silent error handling for individual stocks
 }
 
 setProgress(prev => ({ ...prev, current: prev.current + 1 }));
 }));

 // Small delay between batches to avoid rate limits
 if (i + 5 < ALL_STOCKS.length) {
 await new Promise(resolve => setTimeout(resolve, 500));
 }
 }

 setLastUpdate(new Date());

 } catch (error) {
 console.error('Error running screener:', error);
 } finally {
 setLoading(false);
 setProgress({ current: 0, total: 0 });
 }
 }, [lookbackYears]); // Include lookbackYears as dependency since it affects the calculation

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
 case 'LEADING': return '#00ff41';
 case 'IMPROVING': return '#ffff00';
 case 'WEAKENING': return '#ff8c00';
 case 'LAGGING': return '#ff073a';
 default: return '#c0c0c0';
 }
 };

 const renderSignalCard = (signal: StockSignal, index: number) => (
 <div 
 key={`${signal.symbol}-${index}`} 
 style={{
 background: 'linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 50%, #0a0a0a 100%)',
 border: '1px solid #2a2a2a',
 borderRadius: '8px',
 padding: '16px',
 marginBottom: '12px',
 position: 'relative',
 transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
 cursor: 'pointer',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 overflow: 'hidden',
 backdropFilter: 'blur(10px)',
 animation: `slideIn 0.6s ease-out ${index * 0.1}s both`,
 boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
 }}
 onMouseEnter={(e) => {
 e.currentTarget.style.borderColor = '#ff8c00';
 e.currentTarget.style.boxShadow = '0 8px 32px rgba(255, 140, 0, 0.25), 0 0 0 1px rgba(255, 140, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
 e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
 e.currentTarget.style.background = 'linear-gradient(135deg, #1f1f1f 0%, #141414 50%, #0f0f0f 100%)';
 }}
 onMouseLeave={(e) => {
 e.currentTarget.style.borderColor = '#2a2a2a';
 e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
 e.currentTarget.style.transform = 'translateY(0) scale(1)';
 e.currentTarget.style.background = 'linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 50%, #0a0a0a 100%)';
 }}
 >
 {/* Animated background glow */}
 <div style={{
 position: 'absolute',
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 background: `linear-gradient(45deg, transparent 0%, rgba(255, 140, 0, 0.02) 50%, transparent 100%)`,
 borderRadius: '8px',
 pointerEvents: 'none',
 opacity: 0.6
 }} />
 
 <div style={{
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'flex-start',
 marginBottom: '12px',
 position: 'relative',
 zIndex: 1
 }}>
 <div>
 <div style={{
 color: '#ff8c00',
 fontWeight: '800',
 fontSize: '16px',
 letterSpacing: '1.5px',
 textShadow: '0 0 10px rgba(255, 140, 0, 0.3), 0 1px 0 rgba(0, 0, 0, 0.8)',
 WebkitTextStroke: '0.5px rgba(255, 140, 0, 0.1)',
 textRendering: 'optimizeLegibility',
 WebkitFontSmoothing: 'antialiased',
 MozOsxFontSmoothing: 'grayscale'
 }}>
 {signal.symbol}
 </div>
 <div style={{
 color: '#888888',
 fontSize: '11px',
 textTransform: 'uppercase',
 fontWeight: '600',
 letterSpacing: '0.8px',
 marginTop: '2px',
 textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)'
 }}>
 {signal.sector.split(' ')[0]}
 </div>
 </div>
 <div style={{ textAlign: 'right' }}>
 <div style={{
 color: '#e0e0e0',
 fontWeight: '800',
 fontSize: '14px',
 textShadow: '0 1px 0 rgba(0, 0, 0, 0.8), 0 0 8px rgba(224, 224, 224, 0.2)',
 WebkitFontSmoothing: 'antialiased'
 }}>
 {formatPrice(signal.currentPrice)}
 </div>
 <div style={{
 color: signal.priceChange >= 0 ? '#00ff41' : '#ff073a',
 fontSize: '12px',
 fontWeight: '700',
 textShadow: `0 0 8px ${signal.priceChange >= 0 ? 'rgba(0, 255, 65, 0.4)' : 'rgba(255, 7, 58, 0.4)'}, 0 1px 0 rgba(0, 0, 0, 0.8)`,
 letterSpacing: '0.5px'
 }}>
 {signal.priceChange >= 0 ? '+' : ''}{signal.priceChangePercent.toFixed(2)}%
 </div>
 </div>
 </div>
 
 <div style={{
 display: 'grid',
 gridTemplateColumns: '1fr 1fr',
 gap: '16px',
 fontSize: '11px',
 marginBottom: '12px',
 position: 'relative',
 zIndex: 1
 }}>
 <div>
 <div style={{ 
 color: '#888888', 
 marginBottom: '4px',
 fontSize: '10px',
 fontWeight: '600',
 textTransform: 'uppercase',
 letterSpacing: '0.5px',
 textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)'
 }}>
 RS PERCENTILE
 </div>
 <div style={{ 
 color: '#ff8c00', 
 fontWeight: '800',
 fontSize: '13px',
 textShadow: '0 0 10px rgba(255, 140, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.8)',
 letterSpacing: '0.5px',
 WebkitFontSmoothing: 'antialiased'
 }}>
 {signal.percentile.toFixed(1)}%
 </div>
 </div>
 <div>
 <div style={{ 
 color: '#888888', 
 marginBottom: '4px',
 fontSize: '10px',
 fontWeight: '600',
 textTransform: 'uppercase',
 letterSpacing: '0.5px',
 textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)'
 }}>
 CLASSIFICATION
 </div>
 <div style={{ 
 color: getClassificationColor(signal.classification),
 fontWeight: '800',
 fontSize: '11px',
 textShadow: `0 0 12px ${getClassificationColor(signal.classification)}60, 0 1px 0 rgba(0, 0, 0, 0.8)`,
 letterSpacing: '0.8px',
 textTransform: 'uppercase',
 WebkitFontSmoothing: 'antialiased'
 }}>
 {signal.classification}
 </div>
 </div>
 </div>
 
 <div style={{
 borderTop: '1px solid #333333',
 paddingTop: '8px',
 color: '#999999',
 fontSize: '10px',
 fontWeight: '600',
 letterSpacing: '0.5px',
 textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)',
 position: 'relative',
 zIndex: 1
 }}>
 VOLUME: {formatVolume(signal.volume)}
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
 EFI RELATIVE STRENGTH SCREENER
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
 Scanning {ALL_STOCKS.length} holdings across 11 sectors
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
 onClick={runScreener}
 disabled={loading}
 style={{
 background: loading 
 ? 'linear-gradient(135deg, #333333 0%, #1a1a1a 100%)' 
 : 'linear-gradient(135deg, #ff8c00 0%, #ffa500 50%, #ff8c00 100%)',
 color: loading ? '#666666' : '#000000',
 border: loading ? '2px solid #444444' : '2px solid #ff8c00',
 padding: '14px 28px',
 borderRadius: '8px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '13px',
 fontWeight: '800',
 textTransform: 'uppercase',
 letterSpacing: '1.2px',
 cursor: loading ? 'not-allowed' : 'pointer',
 transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
 boxShadow: loading 
 ? '0 4px 15px rgba(0, 0, 0, 0.3)' 
 : '0 6px 25px rgba(255, 140, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
 textShadow: loading 
 ? 'none' 
 : '0 1px 0 rgba(0, 0, 0, 0.5)',
 position: 'relative',
 overflow: 'hidden',
 WebkitFontSmoothing: 'antialiased'
 }}
 onMouseEnter={(e) => {
 if (!loading) {
 e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
 e.currentTarget.style.boxShadow = '0 8px 35px rgba(255, 140, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
 e.currentTarget.style.background = 'linear-gradient(135deg, #ffaa00 0%, #ff8c00 50%, #ffaa00 100%)';
 }
 }}
 onMouseLeave={(e) => {
 if (!loading) {
 e.currentTarget.style.transform = 'translateY(0) scale(1)';
 e.currentTarget.style.boxShadow = '0 6px 25px rgba(255, 140, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
 e.currentTarget.style.background = 'linear-gradient(135deg, #ff8c00 0%, #ffa500 50%, #ff8c00 100%)';
 }
 }}
 >
 {loading ? (
 <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
 SCANNING...
 </span>
 ) : (
 'RUN SCAN'
 )}
 </button>
 </div>
 </div>

 {/* Controls */}
 <div style={{
 background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #141414 100%)',
 borderBottom: '1px solid #333333',
 padding: '20px 24px',
 boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 10px rgba(0, 0, 0, 0.3)'
 }}>
 <div style={{
 display: 'flex',
 alignItems: 'center',
 gap: '32px'
 }}>
 <div>
 <label style={{
 display: 'block',
 color: '#ff8c00',
 fontSize: '12px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontWeight: '700',
 textTransform: 'uppercase',
 letterSpacing: '1.2px',
 marginBottom: '8px',
 textShadow: '0 0 8px rgba(255, 140, 0, 0.3), 0 1px 0 rgba(0, 0, 0, 0.8)',
 WebkitFontSmoothing: 'antialiased'
 }}>
 LOOKBACK PERIOD
 </label>
 <select
 value={lookbackYears}
 onChange={(e) => setLookbackYears(parseFloat(e.target.value))}
 style={{
 background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
 border: '2px solid #333333',
 color: '#e0e0e0',
 padding: '12px 16px',
 borderRadius: '6px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '12px',
 fontWeight: '600',
 outline: 'none',
 transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
 cursor: 'pointer',
 boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(255, 255, 255, 0.05)',
 letterSpacing: '0.5px',
 textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)',
 WebkitFontSmoothing: 'antialiased'
 }}
 onFocus={(e) => {
 e.currentTarget.style.borderColor = '#ff8c00';
 e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 0 15px rgba(255, 140, 0, 0.3), 0 1px 0 rgba(255, 255, 255, 0.05)';
 e.currentTarget.style.transform = 'translateY(-1px)';
 }}
 onBlur={(e) => {
 e.currentTarget.style.borderColor = '#333333';
 e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(255, 255, 255, 0.05)';
 e.currentTarget.style.transform = 'translateY(0)';
 }}
 >
 <option value={0.5}>6 MONTHS</option>
 <option value={1.0}>1 YEAR</option>
 <option value={1.5}>18 MONTHS</option>
 <option value={2.0}>2 YEARS</option>
 <option value={5.0}>5 YEARS</option>
 <option value={10.0}>10 YEARS</option>
 <option value={15.0}>15 YEARS</option>
 <option value={20.0}>20 YEARS</option>
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
 boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)'
 }}>
 <div 
 style={{
 height: '100%',
 background: 'linear-gradient(90deg, #ff6600, #ff8c00, #ffaa00, #ff8c00)',
 borderRadius: '3px',
 transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
 width: `${(progress.current / progress.total) * 100}%`,
 boxShadow: '0 0 15px rgba(255, 140, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
 position: 'relative',
 overflow: 'hidden'
 }}
 >
 {/* Animated shimmer effect */}
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
 </div>

 {/* Three Main Sections */}
 <div style={{
 display: 'grid',
 gridTemplateColumns: '1fr 1fr 1fr',
 flex: 1,
 height: '100%',
 maxHeight: 'calc(85vh - 160px)',
 minHeight: '600px',
 gap: '1px',
 background: '#212121'
 }}>
 {/* MACRO BREAKOUTS */}
 <div style={{
 background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #141414 100%)',
 display: 'flex',
 flexDirection: 'column',
 boxShadow: 'inset 1px 0 0 rgba(255, 255, 255, 0.03)',
 height: '100%',
 maxHeight: '100%',
 overflow: 'hidden'
 }}>
 <div style={{
 background: 'linear-gradient(135deg, #001a00 0%, #003300 50%, #002200 100%)',
 borderBottom: '3px solid #00ff41',
 padding: '20px 24px',
 position: 'relative',
 overflow: 'hidden',
 boxShadow: '0 4px 15px rgba(0, 255, 65, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
 }}>
 {/* Animated background pattern */}
 <div style={{
 position: 'absolute',
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 background: 'repeating-linear-gradient(45deg, transparent 0px, rgba(0, 255, 65, 0.02) 1px, transparent 2px)',
 pointerEvents: 'none'
 }} />
 
 <h2 style={{
 color: '#00ff41',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '16px',
 fontWeight: '800',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 margin: 0,
 textShadow: '0 0 15px rgba(0, 255, 65, 0.5), 0 2px 0 rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 255, 65, 0.3)',
 position: 'relative',
 zIndex: 1,
 WebkitTextStroke: '0.5px rgba(0, 255, 65, 0.2)',
 WebkitFontSmoothing: 'antialiased'
 }}>
 MACRO BREAKOUTS
 </h2>
 <div style={{
 color: '#ffffff',
 fontSize: '13px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 marginTop: '6px',
 fontWeight: '700',
 letterSpacing: '1.2px',
 textShadow: '0 0 12px rgba(255, 255, 255, 0.6), 0 2px 0 rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 255, 255, 0.3)',
 position: 'relative',
 zIndex: 1,
 WebkitTextStroke: '0.3px rgba(255, 255, 255, 0.2)',
 WebkitFontSmoothing: 'antialiased',
 textRendering: 'optimizeLegibility'
 }}>
 52-Week RS Highs | 85th+ Percentile
 </div>
 <div style={{
 color: '#ff8c00',
 fontSize: '10px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontWeight: '700',
 marginTop: '8px',
 letterSpacing: '0.5px',
 textShadow: '0 0 8px rgba(255, 140, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.8)',
 position: 'relative',
 zIndex: 1
 }}>
 COUNT: {signals.breakouts.length}
 </div>
 </div>
 <div style={{
 flex: 1,
 padding: '16px 12px',
 overflowY: 'auto',
 overflowX: 'hidden'
 }} className="custom-scrollbar">
 {signals.breakouts.length > 0 ? (
 signals.breakouts.map((signal, index) => renderSignalCard(signal, index))
 ) : (
 <div style={{
 textAlign: 'center',
 color: '#666666',
 fontFamily: 'JetBrains Mono, monospace',
 marginTop: '40px'
 }}>
 <div style={{ fontSize: '32px', marginBottom: '16px' }}></div>
 <div style={{ fontSize: '12px', fontWeight: '600' }}>NO BREAKOUTS DETECTED</div>
 <div style={{ fontSize: '10px', marginTop: '4px' }}>Market consolidating</div>
 </div>
 )}
 </div>
 </div>

 {/* RARE LOW BUY SIGNALS */}
 <div style={{
 background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #141414 100%)',
 display: 'flex',
 flexDirection: 'column',
 boxShadow: 'inset 1px 0 0 rgba(255, 255, 255, 0.03)',
 height: '100%',
 maxHeight: '100%',
 overflow: 'hidden'
 }}>
 <div style={{
 background: 'linear-gradient(135deg, #001133 0%, #002266 50%, #001a4d 100%)',
 borderBottom: '3px solid #00d4ff',
 padding: '20px 24px',
 position: 'relative',
 overflow: 'hidden',
 boxShadow: '0 4px 15px rgba(0, 212, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
 }}>
 {/* Animated background pattern */}
 <div style={{
 position: 'absolute',
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 background: 'repeating-linear-gradient(90deg, transparent 0px, rgba(0, 212, 255, 0.02) 1px, transparent 2px)',
 pointerEvents: 'none'
 }} />
 
 <h2 style={{
 color: '#00d4ff',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '16px',
 fontWeight: '800',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 margin: 0,
 textShadow: '0 0 15px rgba(0, 212, 255, 0.5), 0 2px 0 rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 212, 255, 0.3)',
 position: 'relative',
 zIndex: 1,
 WebkitTextStroke: '0.5px rgba(0, 212, 255, 0.2)',
 WebkitFontSmoothing: 'antialiased'
 }}>
 RARE LOW SIGNALS
 </h2>
 <div style={{
 color: '#ffffff',
 fontSize: '13px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 marginTop: '6px',
 fontWeight: '700',
 letterSpacing: '1.2px',
 textShadow: '0 0 12px rgba(255, 255, 255, 0.6), 0 2px 0 rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 255, 255, 0.3)',
 position: 'relative',
 zIndex: 1,
 WebkitTextStroke: '0.3px rgba(255, 255, 255, 0.2)',
 WebkitFontSmoothing: 'antialiased',
 textRendering: 'optimizeLegibility'
 }}>
 Bottom 25% But Strengthening
 </div>
 <div style={{
 color: '#ff8c00',
 fontSize: '10px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontWeight: '700',
 marginTop: '8px',
 letterSpacing: '0.5px',
 textShadow: '0 0 8px rgba(255, 140, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.8)',
 position: 'relative',
 zIndex: 1
 }}>
 COUNT: {signals.rareLows.length}
 </div>
 </div>
 <div style={{
 flex: 1,
 padding: '16px 12px',
 overflowY: 'auto',
 overflowX: 'hidden'
 }} className="custom-scrollbar">
 {signals.rareLows.length > 0 ? (
 signals.rareLows.map((signal, index) => renderSignalCard(signal, index))
 ) : (
 <div style={{
 textAlign: 'center',
 color: '#666666',
 fontFamily: 'JetBrains Mono, monospace',
 marginTop: '40px'
 }}>
 <div style={{ fontSize: '32px', marginBottom: '16px' }}></div>
 <div style={{ fontSize: '12px', fontWeight: '600' }}>NO RARE OPPORTUNITIES</div>
 <div style={{ fontSize: '10px', marginTop: '4px' }}>Market strength broad</div>
 </div>
 )}
 </div>
 </div>

 {/* MACRO BREAKDOWNS */}
 <div style={{
 background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 50%, #141414 100%)',
 display: 'flex',
 flexDirection: 'column',
 boxShadow: 'inset 1px 0 0 rgba(255, 255, 255, 0.03)',
 height: '100%',
 maxHeight: '100%',
 overflow: 'hidden'
 }}>
 <div style={{
 background: 'linear-gradient(135deg, #330000 0%, #660000 50%, #4d0000 100%)',
 borderBottom: '3px solid #ff073a',
 padding: '20px 24px',
 position: 'relative',
 overflow: 'hidden',
 boxShadow: '0 4px 15px rgba(255, 7, 58, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
 }}>
 {/* Animated background pattern */}
 <div style={{
 position: 'absolute',
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 background: 'repeating-linear-gradient(135deg, transparent 0px, rgba(255, 7, 58, 0.02) 1px, transparent 2px)',
 pointerEvents: 'none'
 }} />
 
 <h2 style={{
 color: '#ff073a',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontSize: '16px',
 fontWeight: '800',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 margin: 0,
 textShadow: '0 0 15px rgba(255, 7, 58, 0.5), 0 2px 0 rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 7, 58, 0.3)',
 position: 'relative',
 zIndex: 1,
 WebkitTextStroke: '0.5px rgba(255, 7, 58, 0.2)',
 WebkitFontSmoothing: 'antialiased'
 }}>
 MACRO BREAKDOWNS
 </h2>
 <div style={{
 color: '#ffffff',
 fontSize: '13px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 marginTop: '6px',
 fontWeight: '700',
 letterSpacing: '1.2px',
 textShadow: '0 0 12px rgba(255, 255, 255, 0.6), 0 2px 0 rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 255, 255, 0.3)',
 position: 'relative',
 zIndex: 1,
 WebkitTextStroke: '0.3px rgba(255, 255, 255, 0.2)',
 WebkitFontSmoothing: 'antialiased',
 textRendering: 'optimizeLegibility'
 }}>
 52-Week RS Lows | 15th- Percentile
 </div>
 <div style={{
 color: '#ff8c00',
 fontSize: '10px',
 fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
 fontWeight: '700',
 marginTop: '8px',
 letterSpacing: '0.5px',
 textShadow: '0 0 8px rgba(255, 140, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.8)',
 position: 'relative',
 zIndex: 1
 }}>
 COUNT: {signals.breakdowns.length}
 </div>
 </div>
 <div style={{
 flex: 1,
 padding: '16px 12px',
 overflowY: 'auto',
 overflowX: 'hidden'
 }} className="custom-scrollbar">
 {signals.breakdowns.length > 0 ? (
 signals.breakdowns.map((signal, index) => renderSignalCard(signal, index))
 ) : (
 <div style={{
 textAlign: 'center',
 color: '#666666',
 fontFamily: 'JetBrains Mono, monospace',
 marginTop: '40px'
 }}>
 <div style={{ fontSize: '32px', marginBottom: '16px' }}></div>
 <div style={{ fontSize: '12px', fontWeight: '600' }}>NO BREAKDOWNS DETECTED</div>
 <div style={{ fontSize: '10px', marginTop: '4px' }}>Market showing strength</div>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Loading Overlay */}
 {loading && (
 <div style={{
 position: 'fixed',
 top: 0,
 left: 0,
 right: 0,
 bottom: 0,
 background: 'rgba(0, 0, 0, 0.9)',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 zIndex: 1000,
 backdropFilter: 'blur(10px)'
 }}>
 <div style={{
 background: 'linear-gradient(135deg, #000000 0%, #111111 100%)',
 border: '2px solid #ff8c00',
 borderRadius: '8px',
 padding: '32px',
 textAlign: 'center',
 boxShadow: '0 0 40px rgba(255, 140, 0, 0.3), 0 0 80px rgba(0, 0, 0, 0.8)'
 }}>
 <div style={{
 color: '#ff8c00',
 fontSize: '24px',
 fontFamily: 'JetBrains Mono, monospace',
 fontWeight: '700',
 marginBottom: '16px',
 textShadow: '0 0 20px rgba(255, 140, 0, 0.5)'
 }}>
 SCANNING MARKET
 </div>
 <div style={{
 color: '#c0c0c0',
 fontFamily: 'JetBrains Mono, monospace',
 fontSize: '14px',
 marginBottom: '16px'
 }}>
 {progress.current} / {progress.total} HOLDINGS PROCESSED
 </div>
 <div style={{
 width: '300px',
 height: '8px',
 background: '#212121',
 borderRadius: '4px',
 marginBottom: '16px',
 overflow: 'hidden'
 }}>
 <div 
 style={{
 height: '100%',
 background: 'linear-gradient(90deg, #ff8c00, #ffa500)',
 borderRadius: '4px',
 transition: 'width 0.3s',
 width: `${(progress.current / progress.total) * 100}%`,
 boxShadow: '0 0 15px rgba(255, 140, 0, 0.6)'
 }}
 />
 </div>
 <div style={{
 color: '#666666',
 fontSize: '12px',
 fontFamily: 'JetBrains Mono, monospace'
 }}>
 Analyzing relative strength across all sectors...
 </div>
 </div>
 </div>
 )}
 </div>
 );
};

export default RSScreener;
