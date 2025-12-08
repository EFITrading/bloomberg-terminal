'use client';

import React, { useState, useEffect } from 'react';
import RRGChart from './RRGChart';
import RRGService, { RRGCalculationResult } from '@/lib/rrgService';
import IVRRGService, { IVRRGCalculationResult } from '@/lib/ivRRGService';
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
 const [ivRRGData, setIvRRGData] = useState<IVRRGCalculationResult[]>([]);
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
 const [selectedMode, setSelectedMode] = useState<'sectors' | 'industries' | 'custom'>('sectors');
 const [selectedSectorETF, setSelectedSectorETF] = useState<string | null>(null);
 const [selectedIndustryETF, setSelectedIndustryETF] = useState<string | null>(null);
 const [customSymbols, setCustomSymbols] = useState<string>('');
 const [refreshing, setRefreshing] = useState(false);
 const [chartMode, setChartMode] = useState<'RS' | 'IV'>('RS'); // New: Chart mode selector
 const [ivDataLoaded, setIvDataLoaded] = useState(false); // Track if IV data has been loaded

 // Update timeframe when switching chart modes
 useEffect(() => {
   if (chartMode === 'IV' && !timeframe.includes('year')) {
     // Switch to IV mode - default to 1 Year if coming from RS mode
     setTimeframe('1 year');
     setIvDataLoaded(false); // Reset IV data loaded state
     setIvRRGData([]); // Clear previous IV data
   } else if (chartMode === 'RS' && timeframe.includes('year')) {
     // Switch to RS mode - default to 14 weeks if coming from IV mode
     setTimeframe('14 weeks');
   }
 }, [chartMode]);

 const rrgService = new RRGService();
 const ivRRGService = new IVRRGService();

 // Handle tail length change with persistence
 const handleTailLengthChange = (newLength: number) => {
 setTailLength(newLength);
 if (typeof window !== 'undefined') {
 localStorage.setItem('rrg-tail-length', newLength.toString());
 }
 };

 // RS mode timeframe options (weeks-based)
 const rsTimeframeOptions = [
  { label: '4 weeks', value: '4 weeks', weeks: 8, rsPeriod: 4, momentumPeriod: 4 },
  { label: '8 weeks', value: '8 weeks', weeks: 12, rsPeriod: 8, momentumPeriod: 8 },
  { label: '14 weeks', value: '14 weeks', weeks: 18, rsPeriod: 14, momentumPeriod: 14 },
  { label: '26 weeks', value: '26 weeks', weeks: 30, rsPeriod: 26, momentumPeriod: 26 },
  { label: '52 weeks', value: '52 weeks', weeks: 56, rsPeriod: 52, momentumPeriod: 52 }
 ];

 // IV mode timeframe options (years-based)
 const ivTimeframeOptions = [
  { label: '1 Year', value: '1 year', weeks: 52, rsPeriod: 52, momentumPeriod: 52 },
  { label: '2 Years', value: '2 years', weeks: 104, rsPeriod: 104, momentumPeriod: 104 },
  { label: '3 Years', value: '3 years', weeks: 156, rsPeriod: 156, momentumPeriod: 156 },
  { label: '4 Years', value: '4 years', weeks: 208, rsPeriod: 208, momentumPeriod: 208 }
 ];

 // Select appropriate timeframe options based on chart mode
 const timeframeOptions = chartMode === 'IV' ? ivTimeframeOptions : rsTimeframeOptions; const benchmarkOptions = [
 { label: 'S&P 500 (SPY)', value: 'SPY' },
 { label: 'NASDAQ 100 (QQQ)', value: 'QQQ' },
 { label: 'Russell 2000 (IWM)', value: 'IWM' },
 { label: 'Total Stock Market (VTI)', value: 'VTI' },
 { label: 'World Stock Index (VT)', value: 'VT' }
 ];

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
 // Get the appropriate timeframe options based on chart mode
 const currentTimeframeOptions = chartMode === 'IV' ? ivTimeframeOptions : rsTimeframeOptions;
 const selectedTimeframe = currentTimeframeOptions.find(tf => tf.value === timeframe);
 
 if (!selectedTimeframe) {
 console.warn(`Invalid timeframe "${timeframe}" for ${chartMode} mode, defaulting...`);
 // Default to first option if current timeframe is invalid
 const defaultTimeframe = currentTimeframeOptions[0];
 setTimeframe(defaultTimeframe.value);
 return; // Let the useEffect re-trigger with valid timeframe
 }

 // Load data based on chart mode (RS or IV)
 if (chartMode === 'IV') {
 // IV mode: Load IV-based RRG data
 console.log('📊 Loading IV-based RRG data...');
 
 let ivData: IVRRGCalculationResult[];
 
 if (selectedMode === 'sectors') {
 if (selectedSectorETF && sectorETFs[selectedSectorETF as keyof typeof sectorETFs]) {
 // Load holdings of selected sector ETF with IV
 const etfInfo = sectorETFs[selectedSectorETF as keyof typeof sectorETFs];
 console.log(` Loading ${selectedSectorETF} holdings IV-RRG data...`);
 ivData = await ivRRGService.calculateIVBasedRRG(
 etfInfo.holdings,
 selectedSectorETF,
 selectedTimeframe.weeks * 7, // Convert weeks to days
 selectedTimeframe.rsPeriod,
 selectedTimeframe.momentumPeriod,
 10
 );
 } else {
 // Load standard sector IV analysis
 console.log(' Loading Sector IV-RRG data...');
 ivData = await ivRRGService.calculateSectorIVRRG(
 selectedTimeframe.weeks * 7, // Convert weeks to days
 selectedTimeframe.rsPeriod,
 selectedTimeframe.momentumPeriod,
 10
 );
 }
 } else if (selectedMode === 'industries') {
 if (selectedIndustryETF && industryETFs[selectedIndustryETF as keyof typeof industryETFs]) {
 const etfInfo = industryETFs[selectedIndustryETF as keyof typeof industryETFs];
 console.log(` Loading ${selectedIndustryETF} holdings IV-RRG data...`);
 ivData = await ivRRGService.calculateIVBasedRRG(
 etfInfo.holdings,
 selectedIndustryETF,
 selectedTimeframe.weeks * 7,
 selectedTimeframe.rsPeriod,
 selectedTimeframe.momentumPeriod,
 10
 );
 } else {
 const industrySymbols = Object.keys(industryETFs);
 ivData = await ivRRGService.calculateIVBasedRRG(
 industrySymbols,
 benchmark,
 selectedTimeframe.weeks * 7,
 selectedTimeframe.rsPeriod,
 selectedTimeframe.momentumPeriod,
 10
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

 console.log(' Loading Custom IV-RRG data...');
 ivData = await ivRRGService.calculateIVBasedRRG(
 symbols,
 benchmark,
 selectedTimeframe.weeks * 7,
 selectedTimeframe.rsPeriod,
 selectedTimeframe.momentumPeriod,
 10
 );
 }
 
 // Transform IV data to match RRG chart expected structure (ivRatio -> rsRatio, ivMomentum -> rsMomentum)
 const transformedIvData = ivData.map(item => ({
 ...item,
 rsRatio: item.ivRatio,
 rsMomentum: item.ivMomentum,
 tail: item.tail.map(t => ({
 ...t,
 rsRatio: t.ivRatio,
 rsMomentum: t.ivMomentum
 }))
 }));
 
 setIvRRGData(transformedIvData as any);
 console.log(' IV-RRG data loaded successfully:', ivData.length, 'items');
 
 } else {
 // RS mode: Load standard RS-based RRG data
 let data: RRGCalculationResult[];

 if (selectedMode === 'sectors') {
 if (selectedSectorETF && sectorETFs[selectedSectorETF as keyof typeof sectorETFs]) {
 // Load holdings of selected sector ETF
 const etfInfo = sectorETFs[selectedSectorETF as keyof typeof sectorETFs];
 console.log(` Loading ${selectedSectorETF} holdings RRG data...`);
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
 console.log(' Loading Sector RRG data...');
 data = await rrgService.calculateSectorRRG(
 selectedTimeframe.weeks,
 selectedTimeframe.rsPeriod,
 selectedTimeframe.momentumPeriod,
 10 // tail length
 );
 }
 } else if (selectedMode === 'industries') {
 if (selectedIndustryETF && industryETFs[selectedIndustryETF as keyof typeof industryETFs]) {
 // Load holdings of selected industry ETF
 const etfInfo = industryETFs[selectedIndustryETF as keyof typeof industryETFs];
 console.log(` Loading ${selectedIndustryETF} holdings RRG data...`);
 data = await rrgService.calculateCustomRRG(
 etfInfo.holdings,
 selectedIndustryETF,
 selectedTimeframe.weeks,
 selectedTimeframe.rsPeriod,
 selectedTimeframe.momentumPeriod,
 10
 );
 } else {
 // Load all industry ETFs for comparison
 console.log(' Loading Industry ETFs RRG data...');
 const industrySymbols = Object.keys(industryETFs);
 data = await rrgService.calculateCustomRRG(
 industrySymbols,
 benchmark,
 selectedTimeframe.weeks,
 selectedTimeframe.rsPeriod,
 selectedTimeframe.momentumPeriod,
 10
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

 console.log(' Loading Custom RRG data...');
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
 console.log(' RRG data loaded successfully:', data.length, 'items');
 }

 } catch (err) {
 const errorMessage = err instanceof Error ? err.message : 'Failed to load RRG data';
 setError(errorMessage);
 console.error(' RRG data loading failed:', err);
 } finally {
 setLoading(false);
 }
 };

 const refreshData = async () => {
 setRefreshing(true);
 await loadRRGData();
 setRefreshing(false);
 };

 // Manual scan trigger for IV mode
 const scanIVData = async () => {
   setIvDataLoaded(true);
   await loadRRGData();
 };

 // Load data on component mount and when settings change
 // For IV mode, only load if manually triggered
 useEffect(() => {
   if (chartMode === 'RS') {
     // Auto-load for RS mode
     loadRRGData();
   }
   // IV mode requires manual scan via scanIVData button
 }, [timeframe, benchmark, selectedMode, selectedSectorETF, selectedIndustryETF, chartMode]);

 const getQuadrantSummary = () => {
 const currentData = chartMode === 'IV' ? ivRRGData : rrgData;
 
 const summary = {
 leading: currentData.filter(d => {
 const ratio = chartMode === 'IV' ? (d as IVRRGCalculationResult).ivRatio : (d as RRGCalculationResult).rsRatio;
 const momentum = chartMode === 'IV' ? (d as IVRRGCalculationResult).ivMomentum : (d as RRGCalculationResult).rsMomentum;
 return ratio >= 100 && momentum >= 100;
 }),
 weakening: currentData.filter(d => {
 const ratio = chartMode === 'IV' ? (d as IVRRGCalculationResult).ivRatio : (d as RRGCalculationResult).rsRatio;
 const momentum = chartMode === 'IV' ? (d as IVRRGCalculationResult).ivMomentum : (d as RRGCalculationResult).rsMomentum;
 return ratio >= 100 && momentum < 100;
 }),
 lagging: currentData.filter(d => {
 const ratio = chartMode === 'IV' ? (d as IVRRGCalculationResult).ivRatio : (d as RRGCalculationResult).rsRatio;
 const momentum = chartMode === 'IV' ? (d as IVRRGCalculationResult).ivMomentum : (d as RRGCalculationResult).rsMomentum;
 return ratio < 100 && momentum < 100;
 }),
 improving: currentData.filter(d => {
 const ratio = chartMode === 'IV' ? (d as IVRRGCalculationResult).ivRatio : (d as RRGCalculationResult).rsRatio;
 const momentum = chartMode === 'IV' ? (d as IVRRGCalculationResult).ivMomentum : (d as RRGCalculationResult).rsMomentum;
 return ratio < 100 && momentum >= 100;
 })
 };

 return summary;
 };

 const quadrantSummary = getQuadrantSummary();

 return (
 <div className="rrg-analytics-container" style={{ position: 'relative' }}>
 {/* Chart Mode Selector - Compass Style (Top-Left, above chart) */}
 {!loading && !error && (
 <div style={{
 position: 'absolute',
 top: '10px',
 left: '10px',
 zIndex: 2000,
 display: 'flex',
 gap: '0px',
 background: 'rgba(26, 26, 26, 0.95)',
 border: '2px solid #00bcd4',
 borderRadius: '6px',
 overflow: 'hidden',
 boxShadow: '0 4px 20px rgba(0, 188, 212, 0.3)'
 }}>
 <button
 onClick={() => setChartMode('RS')}
 style={{
 padding: '10px 20px',
 background: chartMode === 'RS' ? '#00bcd4' : 'transparent',
 color: chartMode === 'RS' ? '#000' : '#00bcd4',
 border: 'none',
 cursor: 'pointer',
 fontFamily: '"Bloomberg Terminal", monospace',
 fontSize: '13px',
 fontWeight: 'bold',
 letterSpacing: '1px',
 transition: 'all 0.2s ease',
 borderRight: chartMode === 'RS' ? 'none' : '1px solid #00bcd4'
 }}
 onMouseEnter={(e) => {
 if (chartMode !== 'RS') {
 e.currentTarget.style.background = 'rgba(0, 188, 212, 0.1)';
 }
 }}
 onMouseLeave={(e) => {
 if (chartMode !== 'RS') {
 e.currentTarget.style.background = 'transparent';
 }
 }}
 >
 Relative Strength
 </button>
 <button
 onClick={() => setChartMode('IV')}
 style={{
 padding: '10px 20px',
 background: chartMode === 'IV' ? '#00bcd4' : 'transparent',
 color: chartMode === 'IV' ? '#000' : '#00bcd4',
 border: 'none',
 cursor: 'pointer',
 fontFamily: '"Bloomberg Terminal", monospace',
 fontSize: '13px',
 fontWeight: 'bold',
 letterSpacing: '1px',
 transition: 'all 0.2s ease'
 }}
 onMouseEnter={(e) => {
 if (chartMode !== 'IV') {
 e.currentTarget.style.background = 'rgba(0, 188, 212, 0.1)';
 }
 }}
 onMouseLeave={(e) => {
 if (chartMode !== 'IV') {
 e.currentTarget.style.background = 'transparent';
 }
 }}
 >
 Implied Volatility
 </button>
 </div>
 )}
 
 
 {loading && (
 <div className="rrg-loading">
 <div className="loading-content">
 <div className="loading-spinner"></div>
 <h3>Loading {chartMode === 'IV' ? 'IV-based' : 'RS-based'} RRG Data...</h3>
 <p>Fetching historical {chartMode === 'IV' ? 'IV' : 'price'} data and calculating relative rotation metrics</p>
 </div>
 </div>
 )}

 {error && (
 <div className="rrg-error">
 <div className="error-content">
 <h3>❌ Error Loading Data</h3>
 <p>{error}</p>
 <button onClick={loadRRGData} className="retry-btn">
 Retry
 </button>
 </div>
 </div>
 )}

 {!loading && !error && (chartMode === 'RS' ? rrgData.length > 0 : true) && (
 <>
 <RRGChart
 data={chartMode === 'IV' ? (ivDataLoaded ? ivRRGData as any : []) : rrgData}
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
 onIndustryETFChange={setSelectedIndustryETF}
 onCustomSymbolsChange={setCustomSymbols}
 onBenchmarkChange={setBenchmark}
 onTimeframeChange={setTimeframe}
 industryETFs={industryETFs}
 selectedIndustryETF={selectedIndustryETF}
 loading={loading}
 chartMode={chartMode} // Pass chart mode to RRGChart
 />
 </>
 )}
 </div>
 );
};

export default RRGAnalytics;
