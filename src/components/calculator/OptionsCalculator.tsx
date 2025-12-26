'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getExpirationDates, getDaysUntilExpiration } from '../../lib/optionsExpirationUtils';
import { calculateBlackScholesPrice as calculateBSPrice, calculateProfitLoss as calculatePnL } from '../../lib/blackScholesCalculator';

interface OptionData {
 strike: number;
 expiration: string;
 daysToExpiration: number;
 type: 'call' | 'put';
 bid: number;
 ask: number;
 lastPrice: number; // Last traded price - key for P&L baseline
 volume: number;
 openInterest: number;
 impliedVolatility: number;
}

interface RealOptionsData {
 [key: string]: {
 strike: number;
 expiration: string;
 daysToExpiration: number;
 type: 'call' | 'put';
 bid: number;
 ask: number;
 lastPrice: number;
 volume: number;
 openInterest: number;
 impliedVolatility: number;
 ticker?: string; // Option ticker for pricing lookup
 fetchingPrice?: boolean; // Flag to prevent multiple simultaneous fetches
 // Real Greeks from Polygon API
 delta?: number;
 gamma?: number;
 theta?: number;
 vega?: number;
 };
}

// Black-Scholes and Greeks calculations
const normalCDF = (x: number): number => {
 const a1 = 0.254829592;
 const a2 = -0.284496736;
 const a3 = 1.421413741;
 const a4 = -1.453152027;
 const a5 = 1.061405429;
 const p = 0.3275911;
 
 const sign = x < 0 ? -1 : 1;
 x = Math.abs(x) / Math.sqrt(2.0);
 
 const t = 1.0 / (1.0 + p * x);
 const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
 
 return 0.5 * (1.0 + sign * y);
};

const calculateBlackScholesPrice = (S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number => {
 if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S);
 
 const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
 const d2 = d1 - sigma * Math.sqrt(T);
 
 if (isCall) {
 return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
 } else {
 return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
 }
};

const calculateDelta = (S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number => {
 if (T <= 0) return isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
 
 const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
 
 if (isCall) {
 return normalCDF(d1);
 } else {
 return normalCDF(d1) - 1;
 }
};

const calculateGamma = (S: number, K: number, r: number, sigma: number, T: number): number => {
 if (T <= 0) return 0;
 
 const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
 return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1) / (S * sigma * Math.sqrt(T));
};

const calculateTheta = (S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number => {
 if (T <= 0) return 0;
 
 const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
 const d2 = d1 - sigma * Math.sqrt(T);
 
 const term1 = -(S * sigma * (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1)) / (2 * Math.sqrt(T));
 
 if (isCall) {
 const term2 = -r * K * Math.exp(-r * T) * normalCDF(d2);
 return (term1 + term2) / 365; // Per day
 } else {
 const term2 = r * K * Math.exp(-r * T) * normalCDF(-d2);
 return (term1 + term2) / 365; // Per day
 }
};

interface OptionsCalculatorProps {
 initialSymbol?: string;
 onClose?: () => void;
}

const OptionsCalculator: React.FC<OptionsCalculatorProps> = ({ initialSymbol = 'SPY', onClose }) => {
 console.log('?? OPTIONS CALCULATOR COMPONENT RENDERING with symbol:', initialSymbol);
 const [symbol, setSymbol] = useState(initialSymbol);
 const [userManuallyEnteredSymbol, setUserManuallyEnteredSymbol] = useState(false);
 console.log('?? SYMBOL STATE DECLARED:', symbol);
 const [currentPrice, setCurrentPrice] = useState(0); // Will fetch real price from API
 const [selectedExpiration, setSelectedExpiration] = useState('');
 const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
 const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realOptionsData, setRealOptionsData] = useState<RealOptionsData>({});
  const [impliedVolatility, setImpliedVolatility] = useState(0); const [otmPercentage, setOtmPercentage] = useState(10); // Default 10% OTM range
 const [customPremium, setCustomPremium] = useState<number | null>(null); // User-editable premium price
 const [viewMode, setViewMode] = useState<'table' | 'line'>('table'); // Toggle between Table P/L and Line P/L
 const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
 const [isHoveringChart, setIsHoveringChart] = useState(false);
 const [isEditingPrice, setIsEditingPrice] = useState(false);
 const [priceInputValue, setPriceInputValue] = useState('');
 
 // Multi-leg options state
 const [additionalLegs, setAdditionalLegs] = useState<Array<{
 id: number;
 strike: number | null;
 expiration: string;
 optionType: 'call' | 'put';
 premium: number | null;
 position: 'buy' | 'sell';
 }>>([]);
 
 const riskFreeRate = 0.0408; // Current 10-year treasury rate

 // Sync symbol with chart ONLY when user hasn't manually entered a different symbol
 useEffect(() => {
 if (initialSymbol && initialSymbol !== symbol && !userManuallyEnteredSymbol) {
 console.log('?? Syncing symbol with chart:', initialSymbol);
 setSymbol(initialSymbol);
 } else if (userManuallyEnteredSymbol && initialSymbol && initialSymbol !== symbol) {
 console.log('? Chart sync blocked - user manually entered symbol:', symbol);
 }
 }, [initialSymbol]); // Only trigger when chart symbol changes, not when manual symbol changes

 // Force re-render when switching option type, expiration, or strike
 useEffect(() => {
 console.log('?? Chart parameters changed:', { optionType, selectedExpiration, selectedStrike });
 // Reset hover state to ensure clean render
 setIsHoveringChart(false);
 setHoveredPrice(null);
 // Reset custom premium to force using fresh data
 setCustomPremium(null);
 }, [optionType, selectedExpiration, selectedStrike]);

 // Dynamic expiration dates fetched from real options data
 const [availableExpirations, setAvailableExpirations] = useState<{date: string; days: number}[]>([]);

 // Strike prices - simple descending order (high to low) with ATM in center
 const strikes = useMemo(() => {
 if (Object.keys(realOptionsData).length === 0) {
 console.log('?? No real options data available yet for strikes');
 return [];
 }
 
 const allStrikes = new Set<number>();
 
 // If specific expiration is selected, show strikes for that expiration and option type
 if (selectedExpiration) {
 console.log(`?? Getting strikes for selected expiration: ${selectedExpiration} and type: ${optionType}`);
 Object.values(realOptionsData).forEach(option => {
 if (option.expiration === selectedExpiration && option.type === optionType) {
 allStrikes.add(option.strike);
 console.log(`?? Added strike: $${option.strike} for ${selectedExpiration} ${optionType}`);
 }
 });
 console.log(`?? Found ${allStrikes.size} strikes for ${optionType} at expiration ${selectedExpiration}`);
 } else {
 // No expiration selected - show ALL strikes from ALL expirations for current option type
 console.log(`?? Getting ALL available strikes from all expirations for ${optionType}`);
 Object.values(realOptionsData).forEach(option => {
 if (option.type === optionType) {
 allStrikes.add(option.strike);
 }
 });
 console.log(`?? Found ${allStrikes.size} total strikes for ${optionType}`);
 }
 
 // Debug: Show some sample options to verify types
 const sampleOptions = Object.entries(realOptionsData).slice(0, 5);
 console.log(`?? Sample options data:`, sampleOptions.map(([key, opt]) => ({ key, type: opt.type, strike: opt.strike })));
 
 // Simple sort: high to low (natural dropdown order with ATM in center)
 const sortedStrikes = Array.from(allStrikes).sort((a, b) => b - a);
 
 console.log(`?? STRIKES DEBUG:`, {
 totalStrikes: sortedStrikes.length,
 firstFew: sortedStrikes.slice(0, 5),
 lastFew: sortedStrikes.slice(-5),
 range: sortedStrikes.length > 0 ? `$${Math.min(...sortedStrikes)} - $${Math.max(...sortedStrikes)}` : 'N/A',
 currentPrice: currentPrice,
 optionType: optionType
 });
 
 return sortedStrikes;
 }, [selectedExpiration, realOptionsData, currentPrice, optionType]);

 // Filter strikes for heat map based on OTM percentage
 const heatMapStrikes = useMemo(() => {
 if (strikes.length === 0 || currentPrice <= 0) {
 return strikes;
 }
 
 // Calculate the range based on OTM percentage
 const otmDecimal = otmPercentage / 100;
 const lowerBound = currentPrice * (1 - otmDecimal);
 const upperBound = currentPrice * (1 + otmDecimal);
 
 // Filter strikes within the OTM range
 const filteredStrikes = strikes.filter(strike => 
 strike >= lowerBound && strike <= upperBound
 );
 
 console.log(`?? OTM Filter: ${otmPercentage}% range, Price: $${currentPrice.toFixed(2)}, Range: $${lowerBound.toFixed(2)} - $${upperBound.toFixed(2)}, Strikes: ${filteredStrikes.length}/${strikes.length}`);
 
 return filteredStrikes.length > 0 ? filteredStrikes : strikes.slice(0, 15); // Fallback to first 15 if no strikes in range
 }, [strikes, currentPrice, otmPercentage]);

 // Create time series based on selected expiration date
 const heatMapTimeSeries = useMemo(() => {
 if (!selectedExpiration) {
 return [];
 }
 
 // Find the selected expiration
 const selectedExp = availableExpirations.find(exp => exp.date === selectedExpiration);
 if (!selectedExp) {
 return [];
 }
 
 const maxDays = selectedExp.days;
 
 // Create time intervals from now to expiration
 const timePoints = [];
 
 if (maxDays <= 7) {
 // For short expirations (=7 days): show daily from most days to least, with exp at end
 for (let days = maxDays; days >= 1; days--) {
 timePoints.push({
 days,
 label: `${days}d`
 });
 }
 // Add expiration as last column
 timePoints.push({
 days: 0,
 label: 'Exp'
 });
 } else if (maxDays <= 30) {
 // For medium expirations (=30 days): show weekly + final days, from most days to least, with exp at end
 const intervals = [maxDays, Math.floor(maxDays * 0.8), Math.floor(maxDays * 0.6), Math.floor(maxDays * 0.4), Math.floor(maxDays * 0.2), 7, 3, 1];
 const uniqueIntervals = [...new Set(intervals)].filter(d => d > 0).sort((a, b) => b - a); // Sort descending (most days first)
 
 uniqueIntervals.forEach(days => {
 timePoints.push({
 days,
 label: `${days}d`
 });
 });
 // Add expiration as last column
 timePoints.push({
 days: 0,
 label: 'Exp'
 });
 } else {
 // For long expirations (>30 days): show monthly intervals from most days to least, with exp at end
 const intervals = [maxDays, Math.floor(maxDays * 0.75), Math.floor(maxDays * 0.5), Math.floor(maxDays * 0.25), 30, 14, 7, 3, 1];
 const uniqueIntervals = [...new Set(intervals)].filter(d => d > 0).sort((a, b) => b - a); // Sort descending (most days first)
 
 uniqueIntervals.slice(0, 7).forEach(days => { // Limit to 7 columns plus exp
 timePoints.push({
 days,
 label: `${days}d`
 });
 });
 // Add expiration as last column
 timePoints.push({
 days: 0,
 label: 'Exp'
 });
 }
 
 console.log(`? Time Series for ${selectedExpiration}: ${timePoints.map(t => t.label).join(', ')}`);
 
 return timePoints;
 }, [selectedExpiration, availableExpirations]);

 // Find ATM strike for highlighting
 const atmStrike = useMemo(() => {
 if (heatMapStrikes.length === 0 || currentPrice <= 0) {
 return null;
 }
 
 return heatMapStrikes.reduce((prev, curr) => 
 Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
 );
 }, [heatMapStrikes, currentPrice]);

 // Auto-select first expiration when data loads (if none selected)
 useEffect(() => {
 if (availableExpirations.length > 0 && !selectedExpiration) {
 const firstExpiration = availableExpirations[0];
 setSelectedExpiration(firstExpiration.date);
 console.log(`?? Auto-selected first expiration: ${firstExpiration.date} (${firstExpiration.days} days)`);
 
 // Clear selected strike so ATM selection can happen for new expiration
 setSelectedStrike(null);
 }
 }, [availableExpirations, selectedExpiration]);

 // Auto-select ATM strike ONLY when no strike is manually selected
 useEffect(() => {
 if (strikes.length > 0 && currentPrice > 0 && selectedStrike === null) {
 console.log(`?? ATM SELECTION (No manual selection):`, {
 currentPrice,
 availableStrikes: strikes.slice(0, 10), // First 10 strikes
 strikesCount: strikes.length
 });
 
 const atmStrike = strikes.reduce((prev, curr) => {
 const prevDistance = Math.abs(prev - currentPrice);
 const currDistance = Math.abs(curr - currentPrice);
 return currDistance < prevDistance ? curr : prev;
 });
 
 console.log(`?? ATM CALCULATION RESULT: $${atmStrike} selected as closest to $${currentPrice}`);
 
 setSelectedStrike(atmStrike);
 console.log(`?? Auto-selected ATM strike: $${atmStrike} (closest to live price $${currentPrice})`);
 } else if (selectedStrike !== null) {
 console.log(`? MANUAL STRIKE PRESERVED: $${selectedStrike} (user selected, not overriding)`);
 }
 }, [strikes, currentPrice, selectedExpiration, optionType, selectedStrike]); // Added selectedStrike to dependencies

 // Removed redundant useEffect - ATM selection is now handled above

 // Auto-fill premium when strike/expiration selection changes - ALWAYS fetch fresh real-time pricing
 useEffect(() => {
 if (selectedStrike && selectedExpiration && Object.keys(realOptionsData).length > 0 && customPremium === null) {
 const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
 const realOption = realOptionsData[key];
 
 if (realOption && realOption.ticker) {
 console.log(`?? Auto-fill: ALWAYS fetching FRESH real-time pricing for ${realOption.ticker}...`);
 
 // ALWAYS fetch fresh pricing - don't trust old data
 getCurrentOptionPricing(selectedStrike, selectedExpiration, optionType).then(updatedOption => {
 if (updatedOption && updatedOption.ask > 0) {
 console.log(`?? Auto-filled premium with FRESH REAL ASK price: $${updatedOption.ask}`);
 setCustomPremium(updatedOption.ask);
 } else if (updatedOption && updatedOption.lastPrice > 0) {
 console.log(`?? Auto-filled premium with FRESH REAL LAST price: $${updatedOption.lastPrice}`);
 setCustomPremium(updatedOption.lastPrice);
 } else {
 console.log(`?? No fresh pricing data available for ${key}`);
 }
 }).catch(error => {
 console.error('? Failed to fetch fresh real-time pricing for premium auto-fill:', error);
 });
 }
 }
 }, [selectedStrike, selectedExpiration, optionType, customPremium]); // Always fetch fresh when selection changes

 // INSTANT real-time price fetch from Polygon API - NO LOOPS
 const fetchRealOptionsData = useCallback(async (symbolToFetch: string) => {
 if (!symbolToFetch || symbolToFetch.trim() === '') {
 setLoading(false);
 return;
 }
 
 const upperSymbol = symbolToFetch.toUpperCase().trim();
 console.log(`? INSTANT POLYGON API CALL for: ${upperSymbol}`);
 
 setLoading(true);
 setError(null);
 
 try {
 // DIRECT Polygon API call for instant real-time price
 const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
 
 console.log(`? Getting real-time price for ${upperSymbol}...`);
 
 // Get last trade price directly from Polygon
 const priceUrl = `https://api.polygon.io/v2/last/trade/${upperSymbol}?apikey=${POLYGON_API_KEY}`;
 const priceResponse = await fetch(priceUrl);
 
 if (!priceResponse.ok) {
 throw new Error(`Failed to get real-time price for ${upperSymbol}`);
 }
 
 const priceData = await priceResponse.json();
 console.log(`? Polygon price response:`, priceData);
 
 if (priceData.status !== 'OK' || !priceData.results) {
 throw new Error(`No real-time price data available for ${upperSymbol}`);
 }
 
 const currentStockPrice = priceData.results.p; // Last trade price
 
 if (!currentStockPrice || currentStockPrice <= 0) {
 throw new Error(`Invalid price received for ${upperSymbol}: ${currentStockPrice}`);
 }
 
 setCurrentPrice(currentStockPrice);
 console.log(`? INSTANT SUCCESS: ${upperSymbol} = $${currentStockPrice} (REAL-TIME)`);
 
 // ?? NEW APPROACH: Use Polygon's options snapshot API to get REAL pricing data with IV
 console.log(`?? Fetching ALL available options data with pricing and IV for ${upperSymbol}...`);
 
 // Get all available option chains using the snapshot API (no date filtering)
 const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${upperSymbol}?apikey=${POLYGON_API_KEY}`;
 console.log(`? Fetching options snapshot: ${snapshotUrl}`);
 
 const snapshotResponse = await fetch(snapshotUrl);
 
 if (!snapshotResponse.ok) {
 throw new Error(`Failed to get options snapshot for ${upperSymbol}: ${snapshotResponse.status}`);
 }
 
 const snapshotData = await snapshotResponse.json();
 console.log(`?? Snapshot response:`, snapshotData);
 
 if (snapshotData.status !== 'OK' || !snapshotData.results || snapshotData.results.length === 0) {
 console.warn(`?? No options data available for ${upperSymbol} - this stock may not have active options trading`);
 setRealOptionsData({});
 setAvailableExpirations([]);
 setLoading(false);
 return;
 }
 
 // ?? RESTORE PAGINATION: Get ALL options contracts with full strikes and expirations
 console.log(`?? Attempting to get ALL options contracts for ${upperSymbol}...`);
 
 let allContracts: any[] = [];
 const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
 let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${upperSymbol}&active=true&expiration_date.gte=${today}&limit=1000&apikey=${POLYGON_API_KEY}`;
 let pageCount = 0;
 
 console.log(`?? Fetching contracts expiring from ${today} onwards (ALL future dates)`);
 
 // Paginate through ALL available contracts to get complete options chain
 while (nextUrl && pageCount < 50) { // Increased safety limit for full chain
 pageCount++;
 console.log(`?? FETCHING PAGE ${pageCount}: ${nextUrl}`);
 
 const contractsResponse: Response = await fetch(nextUrl);
 console.log(`?? PAGE ${pageCount} STATUS: ${contractsResponse.status} ${contractsResponse.statusText}`);
 
 if (!contractsResponse.ok) {
 const errorText = await contractsResponse.text();
 console.warn(`?? Contracts API failed on page ${pageCount} for ${upperSymbol}:`, errorText);
 break;
 }
 
 const contractsData: any = await contractsResponse.json();
 console.log(`?? PAGE ${pageCount} - Status: ${contractsData.status}, Results: ${contractsData.results?.length || 0}`);
 
 if (contractsData.status !== 'OK' || !contractsData.results) {
 console.warn(`?? Invalid response on page ${pageCount}:`, contractsData);
 break;
 }
 
 // Add contracts from this page
 allContracts.push(...contractsData.results);
 console.log(`?? Total contracts so far: ${allContracts.length}`);
 
 // Check for next page
 nextUrl = contractsData.next_url || null;
 if (nextUrl && !nextUrl.includes('apikey=')) {
 nextUrl += `&apikey=${POLYGON_API_KEY}`;
 }
 
 // Break if no more pages
 if (!nextUrl) {
 console.log(`? Pagination complete - fetched all ${allContracts.length} contracts`);
 break;
 }
 }
 
 if (allContracts.length === 0) {
 console.warn(`?? No contracts found for ${upperSymbol}`);
 setRealOptionsData({});
 setAvailableExpirations([]);
 setLoading(false);
 return;
 }
 
 console.log(`?? FINAL RESULT: ${allContracts.length} total contracts for ${upperSymbol}`);
 
 // Process ALL collected contracts
 const processedOptions: RealOptionsData = {};
 const uniqueExpirations = new Set<string>();
 
 allContracts.forEach((contract: any, index: number) => {
 // Debug first few contracts to see structure
 if (index < 3) {
 console.log(`?? Contract ${index} structure:`, {
 ticker: contract.ticker,
 strike: contract.strike_price,
 expiration: contract.expiration_date,
 type: contract.contract_type,
 allKeys: Object.keys(contract)
 });
 }
 
 const expDate = contract.expiration_date;
 const strike = contract.strike_price;
 const optionType = contract.contract_type?.toLowerCase();
 
 if (!expDate || !strike || !optionType) {
 console.warn(`?? Missing required data for contract:`, { expDate, strike, optionType });
 return;
 }
 
 // Calculate days to expiration 
 const expiry = new Date(expDate);
 const now = new Date();
 const daysToExp = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
 
 // Only filter out expired options (keep all future dates like original code)
 if (daysToExp <= 0) {
 console.log(`? SKIPPING EXPIRED option: ${expDate} (${daysToExp} days ago)`);
 return;
 }
 
 console.log(`? KEEPING option: ${expDate} (${daysToExp} days, ${(daysToExp/365).toFixed(1)} years)`);
 
 uniqueExpirations.add(expDate);
 
 const key = `${strike}-${expDate}-${optionType}`;
 const contractTicker = contract.ticker;
 
 // Store contract structure (pricing will be filled later via separate API calls)
 processedOptions[key] = {
 strike: strike,
 expiration: expDate,
 daysToExpiration: daysToExp,
 type: optionType as 'call' | 'put',
 bid: 0, // Will be filled by pricing API
 ask: 0, // Will be filled by pricing API
 lastPrice: 0, // Will be filled by pricing API
 volume: 0, // Will be filled by pricing API
 openInterest: 0, // Will be filled by pricing API
 impliedVolatility: 0,
 ticker: contractTicker
 };
 
 console.log(`? Added contract: ${key}`);
 });
 
 // Check if we have any valid options after processing
 if (Object.keys(processedOptions).length === 0) {
 console.warn(`?? No valid options found for ${upperSymbol} after filtering`);
 setRealOptionsData({});
 setAvailableExpirations([]);
 setLoading(false);
 return;
 }
 
 // Sort expirations chronologically (earliest first)
 console.log(`?? Raw unique expirations found:`, Array.from(uniqueExpirations));
 const sortedExpirations = Array.from(uniqueExpirations).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
 console.log(`?? Sorted expirations:`, sortedExpirations);
 
 const expirationsWithDays = sortedExpirations.map(date => {
 const expiry = new Date(date);
 const now = new Date();
 const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
 console.log(`?? Processing expiration: ${date} -> ${days} days (expiry: ${expiry}, now: ${now})`);
 return { date, days };
 }).filter(exp => {
 const keep = exp.days > 0;
 console.log(`?? Expiration ${exp.date}: ${exp.days} days - ${keep ? 'KEEPING' : 'FILTERING OUT'}`);
 return keep;
 });
 
 setAvailableExpirations(expirationsWithDays);
 setRealOptionsData(processedOptions);
 
 console.log(`? SUCCESS: Loaded ${Object.keys(processedOptions).length} REAL options with live pricing and IV`);
 console.log(`? Available expirations: ${expirationsWithDays.length}`);
 console.log(`? No more fallback 25% IV - all Greeks will use REAL market implied volatility!`);
 
 // Debug sample of loaded options data
 const sampleOptions = Object.entries(processedOptions).slice(0, 5);
 console.log(`?? SAMPLE OPTIONS DATA:`, sampleOptions.map(([key, option]) => ({
 key,
 strike: option.strike,
 expiration: option.expiration,
 type: option.type,
 iv: `${(option.impliedVolatility * 100).toFixed(1)}%`
 })));
 
 console.log(`?? ATM auto-selection will be handled by useEffect hooks`);
 
 setLoading(false);
 setError(null);
 
 } catch (error) {
 console.error(`? Polygon API error for ${upperSymbol}:`, error);
 setError(`Unable to load real-time data for "${upperSymbol}". ${error instanceof Error ? error.message : 'Please try again.'}`);
 setLoading(false);
 }
 }, []); // NO DEPENDENCIES to prevent infinite loops

 // REMOVED: Old bulk pricing function - we now use on-demand pricing with quotes API

 // Fetch CURRENT real-time ask/bid pricing for a specific option contract
 const fetchSpecificOptionPricing = async (ticker: string): Promise<any> => {
 const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
 
 console.log(`?? Fetching CURRENT REAL-TIME ask price for: ${ticker}`);
 
 try {
 // First try quotes API for current ask/bid prices (most current)
 const quotesUrl = `https://api.polygon.io/v3/quotes/${ticker}?order=desc&limit=1&apikey=${POLYGON_API_KEY}`;
 
 console.log(`?? Quotes API URL: ${quotesUrl}`);
 
 const quotesResponse = await fetch(quotesUrl);
 const quotesData = await quotesResponse.json();
 
 console.log(`?? Quotes response: ${quotesResponse.status}, results: ${quotesData.results?.length || 0}`);
 
 if (quotesResponse.ok && quotesData.status === 'OK' && quotesData.results && quotesData.results.length > 0) {
 const quote = quotesData.results[0];
 const timestamp = new Date(quote.sip_timestamp / 1000000); // Convert nanoseconds to milliseconds
 console.log(`? Got CURRENT REAL ask/bid for ${ticker}: ask=$${quote.ask_price}, bid=$${quote.bid_price}, timestamp=${timestamp.toLocaleString()}`);
 
 return {
 ask: quote.ask_price || 0, // CURRENT ask price - this is what we want!
 bid: quote.bid_price || 0, // CURRENT bid price
 lastPrice: quote.ask_price || 0, // Use current ask as last for now
 volume: quote.ask_size || 0, // Ask size as volume
 };
 } else {
 console.log(`?? No current quotes for ${ticker}, trying last trade...`);
 
 // Fallback to last trade API for most recent trade price
 const tradesUrl = `https://api.polygon.io/v3/trades/${ticker}?order=desc&limit=1&apikey=${POLYGON_API_KEY}`;
 
 const tradesResponse = await fetch(tradesUrl);
 const tradesData = await tradesResponse.json();
 
 if (tradesResponse.ok && tradesData.status === 'OK' && tradesData.results && tradesData.results.length > 0) {
 const trade = tradesData.results[0];
 const timestamp = new Date(trade.participant_timestamp / 1000000); // Convert nanoseconds to milliseconds
 console.log(`? Got CURRENT REAL trade for ${ticker}: price=$${trade.price}, size=${trade.size}, timestamp=${timestamp.toLocaleString()}`);
 
 return {
 ask: trade.price || 0, // Use last trade price as ask estimate
 bid: trade.price ? trade.price * 0.98 : 0, // Estimate bid as 98% of trade
 lastPrice: trade.price || 0, // Last trade price
 volume: trade.size || 0, // Trade size
 };
 } else {
 console.warn(`?? No current trades for ${ticker} either`);
 return null;
 }
 }
 
 } catch (error) {
 console.error(`? Failed to fetch CURRENT pricing for ${ticker}:`, error);
 return null;
 }
 };

 // Enhanced function to get current option pricing when user makes selections 
 const getCurrentOptionPricing = async (strike: number, expiration: string, type: 'call' | 'put') => {
 const key = `${strike}-${expiration}-${type}`;
 const option = realOptionsData[key];
 
 if (!option || !option.ticker) {
 console.warn(`?? No ticker found for option ${key}`);
 return null;
 }
 
 console.log(`?? Getting current pricing for ${option.ticker}...`);
 
 // Fetch real-time pricing for this specific contract
 const pricingData = await fetchSpecificOptionPricing(option.ticker);
 
 if (pricingData) {
 // Update the option data with real pricing (preserve real IV!)
 realOptionsData[key] = {
 ...realOptionsData[key],
 ...pricingData,
 // Keep the REAL implied volatility from contract data!
 };
 
 console.log(`?? Updated ${key} with REAL data: ask=$${pricingData.ask}, last=$${pricingData.lastPrice}`);
 setRealOptionsData({...realOptionsData}); // Trigger re-render
 return realOptionsData[key];
 }
 
 return null;
 };

 console.log('?? ABOUT TO DECLARE USEEFFECT');
 
 // Update symbol when initialSymbol prop changes (unless user manually entered a symbol or cleared it)
 useEffect(() => {
 if (!userManuallyEnteredSymbol && initialSymbol !== symbol && symbol !== '') {
 console.log(`?? Updating symbol from prop: ${initialSymbol}`);
 setSymbol(initialSymbol);
 }
 }, [initialSymbol, userManuallyEnteredSymbol, symbol]);
 
 // Load real data only when user presses Enter (not automatically on every keystroke)
 useEffect(() => {
 console.log('?? USEEFFECT TRIGGERED for symbol:', symbol);
 // Only clear data if symbol is empty, don't auto-fetch
 if (!symbol || symbol.trim().length === 0) {
 setRealOptionsData({});
 setCurrentPrice(0);
 setAvailableExpirations([]);
 setSelectedStrike(null);
 setSelectedExpiration('');
 setError(null);
 }
 }, [symbol]); // REMOVED fetchRealOptionsData dependency to prevent infinite loops

  // Fetch individual option data for additional legs
  const fetchIndividualOptionData = useCallback(async (strike: number, expiration: string, optionType: 'call' | 'put') => {
    if (!symbol || !strike || !expiration || !optionType) return;

    const key = `${strike}-${expiration}-${optionType}`;

    try {
      const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
      const upperSymbol = symbol.toUpperCase().trim();

      const expDate = new Date(expiration);
      const dateStr = expDate.toISOString().substring(2, 10).replace(/-/g, '');
      const strikeStr = (strike * 1000).toString().padStart(8, '0');
      const typeChar = optionType.toUpperCase().charAt(0);
      const optionTicker = `O:${upperSymbol}${dateStr}${typeChar}${strikeStr}`;
      
      const optionUrl = `https://api.polygon.io/v3/snapshot/options/${upperSymbol}/${optionTicker}?apikey=${POLYGON_API_KEY}`;
      const response = await fetch(optionUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch option data: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.status === 'OK' && data.results) {
        const result = data.results;

        // Calculate days to expiration
        const expiry = new Date(expiration);
        const now = new Date();
        const daysToExp = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Store the option data
        const optionData = {
          strike: strike,
          expiration: expiration,
          daysToExpiration: daysToExp,
          type: optionType,
          bid: result.market_status === 'open' ? (result.bid || 0) : 0,
          ask: result.market_status === 'open' ? (result.ask || 0) : 0,
          lastPrice: result.last_quote?.price || result.prev_day?.close || 0,
          volume: result.volume || 0,
          openInterest: result.open_interest || 0,
          impliedVolatility: result.implied_volatility || 0,
          ticker: optionTicker,
          delta: result.greeks?.delta || null,
          gamma: result.greeks?.gamma || null,
          theta: result.greeks?.theta || null,
          vega: result.greeks?.vega || null
        };

        setRealOptionsData(prev => ({
          ...prev,
          [key]: optionData
        }));
      }
    } catch (error) {
      console.error('Error fetching IV:', error);
    }
  }, [symbol]);

  // Auto-fetch IV and Greeks when strike/expiration/type changes
  useEffect(() => {
    if (selectedStrike && selectedExpiration && optionType) {
      const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
      const existing = realOptionsData[key];
      
      // Always fetch if we don't have IV data (0 or missing)
      if (!existing || !existing.impliedVolatility || existing.impliedVolatility === 0) {
        console.log(`🔄 Auto-fetching IV for ${key} (current IV: ${existing?.impliedVolatility || 'none'})`);
        fetchIndividualOptionData(selectedStrike, selectedExpiration, optionType);
      }
    }
  }, [selectedStrike, selectedExpiration, optionType, fetchIndividualOptionData, realOptionsData]);

  // Fetch data for additional legs when they are configured
  useEffect(() => {
    additionalLegs.forEach(leg => {
      if (leg.strike && leg.expiration && leg.optionType) {
        const key = `${leg.strike}-${leg.expiration}-${leg.optionType}`;
        if (!realOptionsData[key]) {
          console.log(`?? Fetching missing data for leg ${leg.id}: ${key}`);
          fetchIndividualOptionData(leg.strike, leg.expiration, leg.optionType);
        }
      }
    });
  }, [additionalLegs, fetchIndividualOptionData, realOptionsData]);

 // Professional Black-Scholes P&L Calculator using REAL Polygon data like OptionsStrat
 const calculateProfessionalPL = (stockPriceAtExpiry: number, daysToExp: number): number => {
 if (!selectedExpiration || !selectedStrike) {
 return 0;
 }
 
 // Get YOUR selected option (what you bought)
 const yourOptionKey = `${selectedStrike}-${selectedExpiration}-${optionType}`;
 const yourOption = realOptionsData[yourOptionKey];
 
 // Get CURRENT market price (what you pay NOW) - this is your foundation
 let purchasePrice = 0;
 if (customPremium && customPremium > 0) {
 purchasePrice = customPremium;
 } else if (yourOption?.ask > 0) {
 purchasePrice = yourOption.ask;
 } else if (yourOption?.lastPrice > 0) {
 purchasePrice = yourOption.lastPrice;
 } else if (yourOption?.bid > 0) {
 purchasePrice = yourOption.bid;
 } else {
 return 0;
 }
 
 // Use REAL implied volatility from Polygon market data only
 if (!yourOption?.impliedVolatility || yourOption.impliedVolatility <= 0) {
 console.log(`?? ? No real IV from Polygon for ${yourOptionKey}, cannot calculate without real data`);
 return 0; // Return 0 instead of using fake fallback data
 }
 
 const impliedVolatility = yourOption.impliedVolatility;
 console.log(`?? ? Using REAL Polygon IV: ${(impliedVolatility * 100).toFixed(1)}% for ${yourOptionKey}`);

 // Time to expiration in years
 const timeToExpiry = daysToExp / 365;
 
 // Calculate theoretical option value at the simulated stock price using Black-Scholes
 const theoreticalValue = calculateBlackScholesPrice(
 stockPriceAtExpiry, // What we're simulating the stock to be
 selectedStrike, // Your option's strike price
 riskFreeRate, // Current 10-year Treasury rate (4.08%)
 impliedVolatility, // Real market implied volatility
 timeToExpiry, // Time remaining
 optionType === 'call'
 );
 
 // Calculate P&L: If you had bought THIS strike instead of yours, what would be the difference?
 const profitLoss = purchasePrice > 0 ? ((theoreticalValue - purchasePrice) / purchasePrice) * 100 : 0;
 
 console.log(`? REAL P&L: Your $${selectedStrike} ${optionType} cost $${purchasePrice.toFixed(2)} Theoretical Value: $${theoreticalValue.toFixed(2)} = ${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(1)}% P&L`);
 
 // Sanity check for option behavior
 if (optionType === 'call') {
 const shouldProfit = stockPriceAtExpiry > selectedStrike;
 const actualProfit = profitLoss > 5; // Account for time decay
 if (shouldProfit && !actualProfit && Math.abs(stockPriceAtExpiry - selectedStrike) > 5) {
 console.warn(`?? CALL CHECK: Stock $${stockPriceAtExpiry} > Strike $${selectedStrike} should profit but shows ${profitLoss.toFixed(1)}% (may be time decay)`);
 }
 } else if (optionType === 'put') {
 const shouldProfit = stockPriceAtExpiry < selectedStrike;
 const actualProfit = profitLoss > 5;
 if (shouldProfit && !actualProfit && Math.abs(stockPriceAtExpiry - selectedStrike) > 5) {
 console.warn(`?? PUT CHECK: Stock $${stockPriceAtExpiry} < Strike $${selectedStrike} should profit but shows ${profitLoss.toFixed(1)}% (may be time decay)`);
 }
 }
 
 return profitLoss;
 };

 // Calculate Greeks for selected option - REAL DATA ONLY
 const calculateGreeks = (strike: number, daysToExp: number) => {
 const key = `${strike}-${availableExpirations.find(exp => exp.days === daysToExp)?.date}-${optionType}`;
 const realOption = realOptionsData[key];

 // Only calculate if options data exists
 if (!realOption) {
 console.log('? NO OPTION DATA - returning null Greeks');
 return {
 delta: null,
 gamma: null,
 theta: null,
 theoreticalPrice: null,
 marketPrice: null,
 lastPrice: null,
 volume: null,
 openInterest: null
 };
 }
 
 const timeToExpiry = daysToExp / 365;
 const iv = realOption.impliedVolatility;
 
 console.log('?? GREEKS CALCULATION INPUTS (REAL DATA):', {
 currentPrice,
 strike,
 timeToExpiry: `${timeToExpiry.toFixed(4)} years`,
 iv: `${(iv * 100).toFixed(1)}%`,
 riskFreeRate: `${(riskFreeRate * 100).toFixed(2)}%`,
 optionType,
 dataSource: 'Polygon Snapshot API'
 });
 
 const calculatedGreeks = {
 delta: calculateDelta(currentPrice, strike, riskFreeRate, iv, timeToExpiry, optionType === 'call'),
 gamma: calculateGamma(currentPrice, strike, riskFreeRate, iv, timeToExpiry),
 theta: calculateTheta(currentPrice, strike, riskFreeRate, iv, timeToExpiry, optionType === 'call'),
 theoreticalPrice: calculateBlackScholesPrice(currentPrice, strike, riskFreeRate, iv, timeToExpiry, optionType === 'call'),
 marketPrice: (realOption.bid + realOption.ask) / 2,
 lastPrice: realOption.lastPrice,
 volume: realOption.volume,
 openInterest: realOption.openInterest
 };
 
 console.log('? CALCULATED GREEKS:', {
 delta: calculatedGreeks.delta?.toFixed(3),
 gamma: calculatedGreeks.gamma?.toFixed(4), 
 theta: calculatedGreeks.theta?.toFixed(2),
 usingFallbackIV: iv === 0.25
 });
 
 return calculatedGreeks;
 };

 // Get color for P&L cell with enhanced progressive gradients for both profits and losses
 const getPLColor = (pl: number): string => {
 // Enhanced GREEN gradient for profits (8 levels)
 if (pl > 200) return 'bg-green-800 text-white'; // Darkest green for huge profits
 if (pl > 150) return 'bg-green-700 text-white'; // Very dark green
 if (pl > 100) return 'bg-green-600 text-white'; // Dark green
 if (pl > 75) return 'bg-green-500 text-white'; // Medium-dark green
 if (pl > 50) return 'bg-green-400 text-black'; // Medium green
 if (pl > 25) return 'bg-green-300 text-black'; // Light-medium green
 if (pl > 10) return 'bg-green-200 text-black'; // Light green
 if (pl > 0) return 'bg-green-100 text-black'; // Very light green
 
 // Neutral zone
 if (pl > -5) return 'bg-yellow-200 text-black';
 if (pl > -10) return 'bg-orange-200 text-black';
 
 // Enhanced RED gradient for losses (8 levels)
 if (pl > -15) return 'bg-red-200 text-black'; // Light red for small losses
 if (pl > -25) return 'bg-red-300 text-white'; // Medium red
 if (pl > -40) return 'bg-red-400 text-white'; // Darker red
 if (pl > -60) return 'bg-red-500 text-white'; // Even darker red
 if (pl > -80) return 'bg-red-600 text-white'; // Deep red
 if (pl > -120) return 'bg-red-700 text-white'; // Very deep red
 return 'bg-red-800 text-white'; // Darkest red for huge losses
 };

 // Handle symbol input changes 
 const handleSymbolChange = (newSymbol: string) => {
 const upperSymbol = newSymbol.toUpperCase().trim();
 
 // If user clears the input completely, re-enable chart sync and clear all selections
 if (upperSymbol === '') {
 setUserManuallyEnteredSymbol(false);
 setSymbol('');
 setSelectedStrike(null);
 setSelectedExpiration('');
 setCustomPremium(null);
 setError(null);
 console.log(`?? Input cleared - chart sync re-enabled, all selections cleared`);
 return;
 }
 
 // Set manual flag first, then update symbol to prevent override
 setUserManuallyEnteredSymbol(true);
 setSymbol(upperSymbol);
 console.log(`?? MANUAL SYMBOL CHANGE: ${upperSymbol} (chart sync disabled)`);
 };

 // Handle Enter key press for manual search trigger
 const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
 if (e.key === 'Enter') {
 const upperSymbol = symbol.toUpperCase().trim();
 if (upperSymbol.length >= 1) {
 console.log(`MANUAL SEARCH TRIGGERED: ${upperSymbol}`);
 fetchRealOptionsData(upperSymbol);
 }
 }
 };

 console.log('OptionsCalculator component is rendering');
 
 return (
 <div className="h-full bg-black text-white overflow-y-auto">
 {/* Mobile Title and X Button */}
 <div className="md:hidden px-6 py-1 border-b border-gray-800 bg-black relative">
 {onClose && (
 <button
 onClick={onClose}
 className="absolute top-1 right-3 text-gray-400 hover:text-white transition-colors z-50"
 aria-label="Close panel"
 >
 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
 <line x1="18" y1="6" x2="6" y2="18"></line>
 <line x1="6" y1="6" x2="18" y2="18"></line>
 </svg>
 </button>
 )}
 <div className="text-center">
 <h1 className="font-black text-white tracking-wider uppercase" 
 style={{
 fontSize: '45px',
 lineHeight: '1',
 marginBottom: '5px',
 textShadow: `
 2px 2px 0px rgba(0, 0, 0, 0.9),
 -1px -1px 0px rgba(255, 255, 255, 0.1),
 0px -2px 0px rgba(255, 255, 255, 0.05),
 0px 2px 0px rgba(0, 0, 0, 0.8),
 inset 0 2px 4px rgba(0, 0, 0, 0.5)
 `,
 background: 'linear-gradient(to bottom, #ffffff 0%, #cccccc 50%, #999999 100%)',
 WebkitBackgroundClip: 'text',
 WebkitTextFillColor: 'transparent',
 fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
 }}>
 Calculator
 </h1>
 </div>
 </div>
 <div className="p-4">

 {/* BLOOMBERG PROFESSIONAL TERMINAL INTERFACE */}
 <div className="relative bg-gradient-to-br from-gray-950 via-black to-gray-900 border-4 border-gray-600 shadow-2xl overflow-hidden mb-6">
 {/* Animated Background Pattern */}
 <div className="absolute inset-0 opacity-5 pointer-events-none">
 <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-orange-600/10 to-transparent animate-pulse"></div>
 <div className="absolute -top-4 -left-4 w-8 h-8 border border-orange-400/20 rotate-45 animate-spin" style={{animationDuration: '8s'}}></div>
 <div className="absolute -bottom-4 -right-4 w-6 h-6 border border-orange-400/20 rotate-45 animate-spin" style={{animationDuration: '6s', animationDelay: '2s'}}></div>
 </div>

 {/* Main Control Panel */}
 <div className="p-6">
 {/* Single Row: All Controls */}
 <div className="grid grid-cols-12 gap-2 mb-4">
 
 {/* STOCK SYMBOL */}
 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[13px] md:text-[18px] font-bold uppercase tracking-wider">SYMBOL</label>
 </div>
 <div className="p-2 bg-black">
 <input
 type="text"
 value={symbol}
 onChange={(e) => handleSymbolChange(e.target.value)}
 onKeyPress={handleKeyPress}
 placeholder="SPY"
 className="w-full bg-black border border-gray-700 px-2 py-1 text-white text-base font-bold uppercase focus:outline-none focus:border-gray-600 focus:shadow-lg focus:shadow-white/10"
 />
 </div>
 </div>
 </div>

 {/* STRIKE PRICE */}
 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[13px] md:text-[18px] font-bold uppercase tracking-wider">STRIKE</label>
 </div>
 <div className="p-2 bg-black">
 <select
 value={selectedStrike || ''}
 onChange={(e) => {
 const newStrike = e.target.value ? Number(e.target.value) : null;
 setSelectedStrike(newStrike);
 setCustomPremium(null);
 if (newStrike && selectedExpiration) {
 fetchIndividualOptionData(newStrike, selectedExpiration, optionType);
 }
 }}
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-sm font-bold focus:outline-none focus:border-gray-600 focus:shadow-lg focus:shadow-white/10"
 >
 <option value="" className="bg-gray-900">Select Strike</option>
 {strikes.map((strike) => (
 <option key={strike} value={strike} className="bg-gray-900">
 ${strike}
 </option>
 ))}
 </select>
 </div>
 </div>
 </div>

 {/* OPTION TYPE */}
 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg relative z-10">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[13px] md:text-[18px] font-bold uppercase tracking-wider">TYPE</label>
 </div>
 <div className="p-2 flex gap-1 bg-black relative z-20">
 <button
 type="button"
 onClick={(e) => {
 e.preventDefault();
 e.stopPropagation();
 console.log('CALL button clicked');
 setOptionType('call');
 setSelectedStrike(null);
 setCustomPremium(null);
 }}
 className={`flex-1 py-1 px-2 text-[12px] md:text-[18px] font-bold uppercase border cursor-pointer transition-all duration-200 relative z-30 ${
 optionType === 'call'
 ? 'bg-gradient-to-r from-gray-800 to-gray-700 border-gray-500 text-green-500 shadow-lg shadow-white/10'
 : 'bg-black border-gray-700 text-gray-400 hover:border-gray-500 hover:shadow-md hover:shadow-white/5'
 }`}
 >
 CALL
 </button>
 <button
 type="button"
 onClick={(e) => {
 e.preventDefault();
 e.stopPropagation();
 console.log('PUT button clicked');
 setOptionType('put');
 setSelectedStrike(null);
 setCustomPremium(null);
 }}
 className={`flex-1 py-1 px-2 text-[12px] md:text-[18px] font-bold uppercase border cursor-pointer transition-all duration-200 relative z-30 ${
 optionType === 'put'
 ? 'bg-gradient-to-r from-gray-800 to-gray-700 border-gray-500 text-red-500 shadow-lg shadow-white/10'
 : 'bg-black border-gray-700 text-gray-400 hover:border-gray-500 hover:shadow-md hover:shadow-white/5'
 }`}
 >
 PUT
 </button>
 </div>
 </div>
 </div>

 {/* EXPIRATION DATE */}
 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[13px] md:text-[18px] font-bold uppercase tracking-wider">EXPIRY</label>
 </div>
 <div className="p-2 bg-black">
 {availableExpirations.length > 0 ? (
 <select 
 value={selectedExpiration}
 onChange={(e) => {
 const newExp = e.target.value;
 setSelectedExpiration(newExp);
 if (selectedStrike && newExp) {
 fetchIndividualOptionData(selectedStrike, newExp, optionType);
 }
 }}
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-[14px] font-semibold focus:outline-none focus:border-gray-600 focus:shadow-lg focus:shadow-white/10"
 >
 <option value="" className="bg-gray-900">Select</option>
 {availableExpirations.map((exp) => (
 <option key={exp.date} value={exp.date} className="bg-gray-900">
 {exp.date}
 </option>
 ))}
 </select>
 ) : (
 <input
 type="date"
 value={selectedExpiration}
 onChange={(e) => setSelectedExpiration(e.target.value)}
 min={new Date().toISOString().split('T')[0]}
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-[11px] focus:outline-none focus:border-gray-600 focus:shadow-lg focus:shadow-white/10"
 />
 )}
 </div>
 </div>
 </div>

 {/* PREMIUM */}
 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[13px] md:text-[18px] font-bold uppercase tracking-wider">PREMIUM</label>
 </div>
 <div className="p-2 bg-black">
 <input
 type="number"
 value={customPremium || ''}
 onChange={(e) => setCustomPremium(e.target.value ? Number(e.target.value) : null)}
 placeholder="6.9"
 step="0.01"
 min="0"
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-base font-bold focus:outline-none focus:border-gray-600 focus:shadow-lg focus:shadow-white/10"
 />
 </div>
 </div>
 </div>

 {/* OTM RANGE */}
 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[13px] md:text-[18px] font-bold uppercase tracking-wider">OTM</label>
 </div>
 <div className="p-2 bg-black">
 <select 
 value={otmPercentage}
 onChange={(e) => setOtmPercentage(Number(e.target.value))}
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-[14px] font-semibold focus:outline-none focus:border-gray-600 focus:shadow-lg focus:shadow-white/10"
 >
 <option value={2} className="bg-gray-900">±2%</option>
 <option value={5} className="bg-gray-900">±5%</option>
 <option value={10} className="bg-gray-900">±10%</option>
 <option value={15} className="bg-gray-900">±15%</option>
 <option value={20} className="bg-gray-900">±20%</option>
 <option value={25} className="bg-gray-900">±25%</option>
 <option value={30} className="bg-gray-900">±30%</option>
 </select>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* ADD LEG SECTION */}
 {additionalLegs.length < 3 && (
 <div className="mb-6 text-center">
 <button
 onClick={() => {
 const newLeg = {
 id: additionalLegs.length + 2, // Start from 2 since first leg is the main one
 strike: null,
 expiration: '',
 optionType: 'call' as const,
 premium: null,
 position: 'buy' as const
 };
 setAdditionalLegs([...additionalLegs, newLeg]);
 }}
 className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105"
 >
 + Add Leg ({additionalLegs.length + 1}/4)
 </button>
 </div>
 )}

 {/* ADDITIONAL LEGS */}
 {additionalLegs.map((leg) => (
 <div key={leg.id} className="relative bg-gradient-to-br from-gray-950 via-black to-gray-900 border-4 border-blue-500 shadow-2xl overflow-hidden mb-6">
 <div className="absolute inset-0 opacity-5">
 <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-blue-600/10 to-transparent animate-pulse"></div>
 </div>
 
 <div className="p-6">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-white text-xl font-bold uppercase tracking-wider">
 LEG {leg.id} - {leg.position.toUpperCase()} {leg.optionType.toUpperCase()}
 </h3>
 <button
 onClick={() => setAdditionalLegs(additionalLegs.filter(l => l.id !== leg.id))}
 className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded transition-colors"
 >
 Remove Leg
 </button>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
 {/* Position Toggle */}
 <div className="relative group">
 <div className="relative bg-black border-2 border-gray-700 hover:border-blue-500 transition-all duration-300">
 <div className="bg-gradient-to-r from-blue-900/30 to-transparent p-2 border-b border-gray-700">
 <label className="text-white text-xs font-bold uppercase tracking-widest">POSITION</label>
 </div>
 <div className="p-4 grid grid-cols-2 gap-2">
 <button
 onClick={() => {
 const updatedLegs = additionalLegs.map(l => 
 l.id === leg.id ? { ...l, position: 'buy' as const } : l
 );
 setAdditionalLegs(updatedLegs);
 }}
 className={`py-3 px-4 text-sm font-bold rounded transition-all ${
 leg.position === 'buy'
 ? 'bg-green-600 text-white'
 : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
 }`}
 >
 BUY
 </button>
 <button
 onClick={() => {
 const updatedLegs = additionalLegs.map(l => 
 l.id === leg.id ? { ...l, position: 'sell' as const } : l
 );
 setAdditionalLegs(updatedLegs);
 }}
 className={`py-3 px-4 text-sm font-bold rounded transition-all ${
 leg.position === 'sell'
 ? 'bg-red-600 text-white'
 : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
 }`}
 >
 SELL
 </button>
 </div>
 </div>
 </div>

 {/* Option Type Toggle */}
 <div className="relative group">
 <div className="relative bg-black border-2 border-gray-700 hover:border-blue-500 transition-all duration-300">
 <div className="bg-gradient-to-r from-blue-900/30 to-transparent p-2 border-b border-gray-700">
 <label className="text-white text-xs font-bold uppercase tracking-widest">TYPE</label>
 </div>
 <div className="p-4 grid grid-cols-2 gap-2">
 <button
 onClick={() => {
 const updatedLegs = additionalLegs.map(l => 
 l.id === leg.id ? { ...l, optionType: 'call' as const } : l
 );
 setAdditionalLegs(updatedLegs);
 }}
 className={`py-3 px-4 text-sm font-bold rounded transition-all ${
 leg.optionType === 'call'
 ? 'bg-green-600 text-white'
 : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
 }`}
 >
 CALL
 </button>
 <button
 onClick={() => {
 const updatedLegs = additionalLegs.map(l => 
 l.id === leg.id ? { ...l, optionType: 'put' as const } : l
 );
 setAdditionalLegs(updatedLegs);
 }}
 className={`py-3 px-4 text-sm font-bold rounded transition-all ${
 leg.optionType === 'put'
 ? 'bg-red-600 text-white'
 : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
 }`}
 >
 PUT
 </button>
 </div>
 </div>
 </div>

 {/* Strike Price */}
 <div className="relative group">
 <div className="relative bg-black border-2 border-gray-700 hover:border-blue-500 transition-all duration-300">
 <div className="bg-gradient-to-r from-blue-900/30 to-transparent p-2 border-b border-gray-700">
 <label className="text-white text-xs font-bold uppercase tracking-widest">STRIKE</label>
 </div>
 <div className="p-4">
 <select
 value={leg.strike || ''}
 onChange={(e) => {
 const newStrike = e.target.value ? Number(e.target.value) : null;
 const updatedLegs = additionalLegs.map(l => 
 l.id === leg.id ? { ...l, strike: newStrike } : l
 );
 setAdditionalLegs(updatedLegs);
 }}
 className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-blue-500 transition-all duration-300"
 >
 <option value="">Select Strike</option>
 {strikes.map((strike) => (
 <option key={strike} value={strike}>${strike}</option>
 ))}
 </select>
 </div>
 </div>
 </div>

 {/* Expiration */}
 <div className="relative group">
 <div className="relative bg-black border-2 border-gray-700 hover:border-blue-500 transition-all duration-300">
 <div className="bg-gradient-to-r from-blue-900/30 to-transparent p-2 border-b border-gray-700">
 <label className="text-white text-xs font-bold uppercase tracking-widest">EXPIRATION</label>
 </div>
 <div className="p-4">
 <select
 value={leg.expiration}
 onChange={(e) => {
 const newExpiration = e.target.value;
 const updatedLegs = additionalLegs.map(l => 
 l.id === leg.id ? { ...l, expiration: newExpiration } : l
 );
 setAdditionalLegs(updatedLegs);
 }}
 className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-blue-500 transition-all duration-300"
 >
 <option value="">Select Date</option>
 {availableExpirations.map(exp => (
 <option key={exp.date} value={exp.date}>
 {exp.date} ({exp.days}d)
 </option>
 ))}
 </select>
 </div>
 </div>
 </div>

 {/* Premium */}
 <div className="relative group">
 <div className="relative bg-black border-2 border-gray-700 hover:border-blue-500 transition-all duration-300 shadow-inner">
 <div className="bg-gradient-to-r from-blue-900/30 to-transparent p-2 border-b border-gray-700">
 <label className="text-white text-xs font-bold uppercase tracking-widest">PREMIUM</label>
 </div>
 <div className="p-4">
 <input
 type="number"
 value={leg.premium || ''}
 onChange={(e) => {
 const updatedLegs = additionalLegs.map(l => 
 l.id === leg.id ? { ...l, premium: e.target.value ? Number(e.target.value) : null } : l
 );
 setAdditionalLegs(updatedLegs);
 }}
 placeholder="6.9"
 step="0.01"
 min="0"
 className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-lg font-bold tabular-nums focus:outline-none focus:border-blue-500 focus:shadow-lg focus:shadow-blue-500/20 transition-all duration-300"
 />
 
 {/* Real Market Data - Same as original */}
 {leg.strike && leg.expiration && (
 <div className="mt-3 bg-gradient-to-r from-gray-900/50 to-black border-l-4 border-cyan-500 p-3">
 <div className="text-white text-xs font-medium uppercase tracking-wide">
 {(() => {
 const key = `${leg.strike}-${leg.expiration}-${leg.optionType}`;
 const realOption = realOptionsData[key];
 if (realOption) {
 const askPrice = realOption.ask > 0 ? realOption.ask : null;
 const lastPrice = realOption.lastPrice > 0 ? realOption.lastPrice : null;
 const bidPrice = realOption.bid > 0 ? realOption.bid : null;
 
 // Auto-fill premium with last price if not already set
 if (lastPrice && !leg.premium) {
 const updatedLegs = additionalLegs.map(l => 
 l.id === leg.id ? { ...l, premium: lastPrice } : l
 );
 setAdditionalLegs(updatedLegs);
 }
 
 if (!askPrice && !lastPrice && !bidPrice) {
 return `?? NO MARKET DATA - Strike $${leg.strike} ${leg.optionType.toUpperCase()} ${leg.expiration}`;
 }
 
 return `Ask $${askPrice?.toFixed(2) || 'N/A'} | Last $${lastPrice?.toFixed(2) || 'N/A'} | Bid $${bidPrice?.toFixed(2) || 'N/A'}`;
 }
 return `?? NO OPTION DATA - Strike $${leg.strike} ${leg.optionType.toUpperCase()} ${leg.expiration}`;
 })()}
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 ))}

 {/* Real Data Status Warnings */}

 {/* Selection Progress Guide - Show when we have options data but selections are incomplete */}

 {/* Greeks Bar - Above Heat Map */}
 {(() => {
 const hasSymbol = !!symbol;
 const hasOptionType = !!optionType;
 const hasExpiration = !!selectedExpiration;
 const hasStrike = !!selectedStrike;
 const hasRealData = Object.keys(realOptionsData).length > 0;
 const hasCustomPremium = !!(customPremium && customPremium > 0);
 const showHeatmap = hasSymbol && hasOptionType && hasExpiration && hasStrike && (hasRealData || hasCustomPremium);
 
 console.log('?? Heatmap Display Check:', {
 hasSymbol, hasOptionType, hasExpiration, hasStrike, hasRealData, hasCustomPremium, showHeatmap,
 symbol, optionType, selectedExpiration, selectedStrike, customPremium,
 realDataCount: Object.keys(realOptionsData).length
 });
 
 return showHeatmap;
 })() && (
 <>
 {(() => {
 const expiration = availableExpirations.find(exp => exp.date === selectedExpiration);
 const greeks = calculateGreeks(selectedStrike || 0, expiration?.days || 0);
 const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
 const realOption = realOptionsData[key];
 
 return (
 <div className="mb-4 bg-gradient-to-r from-gray-900 to-black rounded-xl p-2 md:p-4 border border-gray-600 shadow-lg">
 <div className="grid grid-cols-4 gap-2 md:gap-4">
 <div className="bg-gradient-to-br from-black via-gray-900 to-black rounded-lg p-0 md:p-3 border border-gray-700 shadow-xl h-[20px] md:h-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <div className="flex items-center justify-between w-full px-1" style={{ transform: 'translateY(-10px)' }}>
 <span className="text-green-500 text-[8px] md:text-sm font-bold uppercase tracking-wider leading-none">Delta</span>
 <span className="text-green-500 text-[10px] md:text-xl font-bold leading-none">
 {realOption?.delta !== null && realOption?.delta !== undefined ? realOption.delta.toFixed(3) : '--'}
 </span>
 </div>
 </div>
 <div className="bg-gradient-to-br from-black via-gray-900 to-black rounded-lg p-0 md:p-3 border border-gray-700 shadow-xl h-[20px] md:h-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <div className="flex items-center justify-between w-full px-1" style={{ transform: 'translateY(-10px)' }}>
 <span className="text-yellow-500 text-[8px] md:text-sm font-bold uppercase tracking-wider leading-none">Gamma</span>
 <span className="text-yellow-500 text-[10px] md:text-xl font-bold leading-none">
 {realOption?.gamma !== null && realOption?.gamma !== undefined ? realOption.gamma.toFixed(4) : '--'}
 </span>
 </div>
 </div>
 <div className="bg-gradient-to-br from-black via-gray-900 to-black rounded-lg p-0 md:p-3 border border-gray-700 shadow-xl h-[20px] md:h-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <div className="flex items-center justify-between w-full px-1" style={{ transform: 'translateY(-10px)' }}>
 <span className="text-red-500 text-[8px] md:text-sm font-bold uppercase tracking-wider leading-none">Theta</span>
 <span className="text-red-500 text-[10px] md:text-xl font-bold leading-none">
 {realOption?.theta !== null && realOption?.theta !== undefined ? realOption.theta.toFixed(2) : '--'}
 </span>
 </div>
 </div>
 <div className="bg-gradient-to-br from-black via-gray-900 to-black rounded-lg p-0 md:p-3 border border-gray-700 shadow-xl h-[20px] md:h-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <div className="flex items-center justify-between w-full px-1" style={{ transform: 'translateY(-10px)' }}>
 <span className="text-blue-500 text-[8px] md:text-sm font-bold uppercase tracking-wider leading-none">IV</span>
 <span className="text-blue-500 text-[10px] md:text-xl font-bold leading-none">
 {realOption?.impliedVolatility && realOption.impliedVolatility > 0 ? `${(realOption.impliedVolatility * 100).toFixed(1)}%` : '--'}
 </span>
 </div>
 </div>
 </div>
 </div>
 );
 })()}

 {/* ENHANCED PROFIT & LOSS HEAT MAP - Show when selections are made and we have data or custom premium */}
 <div className="bg-black rounded-2xl p-8 border-2 border-gray-700 shadow-2xl"> {/* Professional Heat Map Container */}
 <div className="overflow-x-auto rounded-xl border-2 border-gray-700">
 <div className="min-w-max bg-black">
 {/* Tabs - Table P/L and Line P/L */}
 <div className="flex border-b border-gray-800 bg-black relative overflow-hidden">
 {/* Abstract background pattern */}
 <div className="absolute inset-0 opacity-20">
 <div className="absolute top-0 left-1/4 w-32 h-32 bg-blue-500 rounded-full blur-3xl"></div>
 <div className="absolute bottom-0 right-1/4 w-24 h-24 bg-purple-500 rounded-full blur-3xl"></div>
 <div className="absolute top-1/2 left-1/2 w-20 h-20 bg-cyan-500 rounded-full blur-2xl"></div>
 </div>
 <button
 type="button"
 onClick={() => setViewMode('table')}
 className={`relative flex-1 py-4 px-8 text-base font-bold uppercase tracking-wider transition-all duration-300 ${
 viewMode === 'table'
 ? 'text-white'
 : 'text-gray-500 hover:text-gray-300'
 }`}
 >
 {viewMode === 'table' && (
 <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/10 to-cyan-600/20 backdrop-blur-sm border-b-2 border-blue-500"></div>
 )}
 <span className="relative z-10">{viewMode === 'table' && '● '}Table P/L</span>
 </button>
 <button
 type="button"
 onClick={() => setViewMode('line')}
 className={`relative flex-1 py-4 px-8 text-base font-bold uppercase tracking-wider transition-all duration-300 ${
 viewMode === 'line'
 ? 'text-white'
 : 'text-gray-500 hover:text-gray-300'
 }`}
 >
 {viewMode === 'line' && (
 <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/10 to-cyan-600/20 backdrop-blur-sm border-b-2 border-blue-500"></div>
 )}
 <span className="relative z-10">{viewMode === 'line' && '● '}Line P/L</span>
 </button>
 </div>
 
 {/* Table P/L View */}
 {viewMode === 'table' && (
 <>
 {/* Enhanced X-Axis Label */}
 <div className="text-center py-4 bg-black border-b border-gray-600">
 <span className="text-lg font-bold text-blue-300 uppercase tracking-wider">Time Till Expiration (Days)</span>
 </div>
 
 {/* Professional Heat Map Table */}
 <div className="relative">
 <table className="w-full border-collapse bg-black">
 {/* Professional Header Row - Time till expiration */}
 <thead>
 <tr>
 <th className="w-20 h-14 bg-gradient-to-b from-gray-900 to-black border-2 border-gray-800 text-sm font-bold text-white shadow-xl">
 <div className="drop-shadow-lg">Stock Price</div>
 </th>
 {heatMapTimeSeries.map((timePoint) => (
 <th
 key={timePoint.days}
 className="w-20 h-14 bg-gradient-to-b from-gray-900 to-black border-2 border-gray-800 text-sm font-bold px-1 text-white shadow-lg"
 >
 <div className="text-sm font-bold drop-shadow-md">{timePoint.label}</div>
 {timePoint.days === 0 && (
 <div className="text-xs text-gray-400 mt-1">
 {selectedExpiration?.slice(5)}
 </div>
 )}
 </th>
 ))}
 </tr>
 </thead>
 
 {/* Data Rows - Strike prices vs Time */}
 <tbody>
 {heatMapStrikes.map((strike) => {
 const isATM = strike === atmStrike;
 
 return (
 <tr key={strike} className={isATM ? 'ring-2 ring-yellow-400' : ''}>
 {/* Y-axis: Simulated Stock Price Level */}
 <td className={`h-12 border border-gray-600 text-center font-medium text-lg ${
 isATM 
 ? 'bg-yellow-900 text-yellow-300 font-bold ring-1 ring-yellow-400' 
 : 'bg-black text-white'
 }`}>
 ${strike} {isATM && '?'}
 </td>
 
 {/* BLACK-SCHOLES P&L CALCULATIONS */}
 {heatMapTimeSeries.map((timePoint) => {
 // Calculate P&L using Black-Scholes formula with live data
 let pnlData = { dollarPnL: 0, percentPnL: 0, optionPrice: 0 };
 let cellColor = 'bg-gray-800 text-gray-500';
 let displayText = '--';
 
 // Only calculate if we have all required data
 if (currentPrice > 0 && selectedStrike && customPremium && customPremium > 0) {
 try {
 // Get implied volatility from real options data only
 const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
 const realOption = realOptionsData[key];
 
 // Skip calculation if no real IV data available
 if (!realOption?.impliedVolatility || realOption.impliedVolatility <= 0) {
 console.log(`?? No real IV data for ${key}, skipping P&L calculation`);
 return null; // Return null for missing IV data
 }
 
 const impliedVol = realOption.impliedVolatility;
 
 // Calculate current DTE for baseline
 const expDate = new Date(selectedExpiration);
 const today = new Date();
 const currentDTE = Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
 const currentTimeToExpiry = currentDTE / 365;
 
 // BASELINE: Calculate current option value at current stock price and current time
 const baselineOptionPrice = calculateBSPrice(
 currentPrice, // Current stock price (baseline)
 selectedStrike, // Strike price of your option
 currentTimeToExpiry, // Current time remaining (baseline)
 0.045, // Risk-free rate 4.5%
 impliedVol, // Implied volatility from market data
 0, // Dividend yield
 optionType === 'call'
 );
 
 // SIMULATION: Calculate what option would be worth if...
 // - Stock price moves to: $${strike} (this table row)
 // - Time passes to: ${timePoint.days} days remaining
 const timeToExpiry = timePoint.days / 365;
 const simulatedOptionPrice = calculateBSPrice(
 strike, // SIMULATED stock price (what if stock moves to this price)
 selectedStrike, // Strike price of your option
 timeToExpiry, // SIMULATED time remaining
 0.045, // Risk-free rate 4.5%
 impliedVol, // Implied volatility from market data
 0, // Dividend yield
 optionType === 'call'
 );
 
 // P&L = (Simulated Option Price - Baseline Option Price)
 // This shows how much the option value changes from current state
 const { dollarPnL, percentPnL } = calculatePnL(simulatedOptionPrice, baselineOptionPrice, 1);
 
 pnlData = { dollarPnL, percentPnL, optionPrice: simulatedOptionPrice };
 
 // Enhanced color coding based on percentage P&L
 const absPercentPnL = Math.abs(percentPnL);
 
 if (percentPnL > 0) {
 // Green gradient for profits
 if (absPercentPnL >= 100) {
 cellColor = 'bg-green-600 text-white font-bold'; // Very bright green for 100%+
 } else if (absPercentPnL >= 50) {
 cellColor = 'bg-green-700 text-green-100 font-semibold'; // Bright green for 50-100%
 } else if (absPercentPnL >= 25) {
 cellColor = 'bg-green-800 text-green-200'; // Medium green for 25-50%
 } else if (absPercentPnL >= 10) {
 cellColor = 'bg-green-900 text-green-300'; // Light green for 10-25%
 } else if (absPercentPnL > 0) {
 cellColor = 'bg-green-950 text-green-400'; // Very light green for 0-10%
 }
 } else if (percentPnL < 0) {
 // Red gradient for losses
 if (absPercentPnL >= 100) {
 cellColor = 'bg-red-600 text-white font-bold'; // Very bright red for 100%+ loss
 } else if (absPercentPnL >= 50) {
 cellColor = 'bg-red-700 text-red-100 font-semibold'; // Bright red for 50-100% loss
 } else if (absPercentPnL >= 25) {
 cellColor = 'bg-red-800 text-red-200'; // Medium red for 25-50% loss
 } else if (absPercentPnL >= 10) {
 cellColor = 'bg-red-900 text-red-300'; // Light red for 10-25% loss
 } else if (absPercentPnL > 0) {
 cellColor = 'bg-red-950 text-red-400'; // Very light red for 0-10% loss
 }
 } else {
 // Neutral for exactly 0%
 cellColor = 'bg-gray-700 text-gray-300 font-medium';
 }
 
 // Format display text
 displayText = `$${dollarPnL.toFixed(0)}`;
 if (Math.abs(percentPnL) < 999) {
 displayText += ` (${percentPnL > 0 ? '+' : ''}${percentPnL.toFixed(0)}%)`;
 }
 
 } catch (error) {
 console.error('Black-Scholes calculation error:', error);
 displayText = 'ERR';
 cellColor = 'bg-yellow-800 text-yellow-400';
 }
 }
 
 return (
 <td
 key={`${strike}-${timePoint.days}`}
 className={`h-12 border text-center text-xs font-bold cursor-pointer hover:opacity-80 transition-all duration-200 ${cellColor} ${
 isATM ? 'border-yellow-400 border-2' : 'border-gray-600'
 }`}
 onClick={() => {
 console.log(`?? Heat map cell clicked: Strike $${strike}, Days ${timePoint.days}`);
 setSelectedStrike(strike);
 setCustomPremium(null);
 }}
 title={`Stock @ $${strike} | Strike $${selectedStrike} | ${timePoint.days}d | P&L: ${displayText} | Option Price: $${pnlData.optionPrice.toFixed(2)}`}
 >
 <div className="text-xs leading-tight">
 {displayText}
 </div>
 </td>
 );
 })}
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </>
 )}
 
 {/* ROBINHOOD-STYLE P&L LINE CHART */}
 {viewMode === 'line' && (() => {
   if (!selectedStrike) return null;
   
   // Calculate P&L line data across time periods
   const expDate = new Date(selectedExpiration);
   const today = new Date();
   const maxDTE = Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
   
   const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
   const realOption = realOptionsData[key];
   
   if (!realOption?.impliedVolatility || realOption.impliedVolatility <= 0) {
     return null;
   }
   
   const impliedVol = realOption.impliedVolatility;
   const strikePrice = selectedStrike;
   
   // Get purchase price (same logic as table)
   let purchasePrice = 0;
   if (customPremium && customPremium > 0) {
     purchasePrice = customPremium;
   } else if (realOption?.ask > 0) {
     purchasePrice = realOption.ask;
   } else if (realOption?.lastPrice > 0) {
     purchasePrice = realOption.lastPrice;
   } else if (realOption?.bid > 0) {
     purchasePrice = realOption.bid;
   } else {
     return null;
   }
   
   // Generate data points across time
   const numTimePoints = 50;
   let chartData: Array<{ daysToExp: number; pnl: number; pnlPercent: number }> = [];
   let maxPnL = -Infinity;
   let minPnL = Infinity;
   
   for (let i = 0; i <= numTimePoints; i++) {
     const daysToExp = maxDTE - (i * maxDTE / numTimePoints);
     const timeToExpiry = Math.max(0, daysToExp / 365);
     
     const priceAtThisPoint = isHoveringChart && hoveredPrice !== null ? hoveredPrice : currentPrice;
     
     const theoreticalValue = calculateBSPrice(
       priceAtThisPoint,
       strikePrice,
       timeToExpiry,
       0.045,
       impliedVol,
       0,
       optionType === 'call'
     );
     
     const dollarPnL = theoreticalValue - purchasePrice;
     let percentPnL = purchasePrice > 0 ? ((theoreticalValue - purchasePrice) / purchasePrice) * 100 : 0;
     percentPnL = Math.max(percentPnL, -100);
     
     chartData.push({ daysToExp, pnl: dollarPnL, pnlPercent: percentPnL });
     maxPnL = Math.max(maxPnL, percentPnL);
     minPnL = Math.min(minPnL, percentPnL);
   }
   
   const simulatedStockPrice = isHoveringChart && hoveredPrice !== null ? hoveredPrice : currentPrice;
   
   const pnlRange = maxPnL - minPnL;
   const paddedMaxPnL = maxPnL + (pnlRange * 0.1);
   const paddedMinPnL = minPnL - (pnlRange * 0.1);
   
   const chartWidth = 1200;
   const chartHeight = 1225;
   const padding = { top: 40, right: 80, bottom: 100, left: 80 };
   const plotWidth = chartWidth - padding.left - padding.right;
   const plotHeight = chartHeight - padding.top - padding.bottom;
   
   const xScale = (days: number) => {
     return padding.left + ((maxDTE - days) / maxDTE) * plotWidth;
   };
   
   const yScale = (pnlPercent: number) => {
     return padding.top + plotHeight - ((pnlPercent - paddedMinPnL) / (paddedMaxPnL - paddedMinPnL)) * plotHeight;
   };
   
   const linePath = chartData.map((d, i) => {
     const x = xScale(d.daysToExp);
     const y = yScale(d.pnlPercent);
     return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
   }).join(' ');
   
   const currentDayData = chartData.find(d => Math.abs(d.daysToExp - maxDTE) < 1) || chartData[0];
   const currentX = xScale(maxDTE);
   const currentY = yScale(currentDayData.pnlPercent);
   
   return (
     <div className="mb-6 bg-gradient-to-br from-gray-950 via-black to-gray-900 rounded-xl p-6 border-2 border-orange-500/50">
       <div className="relative bg-black rounded-lg border border-gray-700 overflow-hidden">
         <svg 
           width={chartWidth} 
           height={chartHeight} 
           className="w-full h-auto"
           style={{ 
             shapeRendering: 'crispEdges',
             imageRendering: 'crisp-edges'
           }}
           preserveAspectRatio="xMidYMid meet"
           onMouseDown={(e) => {
             const svg = e.currentTarget;
             const rect = svg.getBoundingClientRect();
             const mouseX = e.clientX - rect.left;
             const relativeX = mouseX - padding.left;
             const sliderY = chartHeight - padding.bottom + 40;
             const mouseY = e.clientY - rect.top;
             const priceMin = Math.floor(currentPrice * 0.85);
             const priceMax = Math.ceil(currentPrice * 1.15);
             const priceRange = priceMax - priceMin;
             
             if (relativeX >= 0 && relativeX <= plotWidth && Math.abs(mouseY - sliderY) < 30) {
               const priceAtMouse = priceMin + (relativeX / plotWidth) * priceRange;
               setHoveredPrice(priceAtMouse);
               setIsHoveringChart(true);
               
               const handleMouseMove = (e: MouseEvent) => {
                 const mouseX = e.clientX - rect.left;
                 const relativeX = Math.max(0, Math.min(plotWidth, mouseX - padding.left));
                 const priceAtMouse = priceMin + (relativeX / plotWidth) * priceRange;
                 setHoveredPrice(priceAtMouse);
               };
               
               const handleMouseUp = () => {
                 document.removeEventListener('mousemove', handleMouseMove);
                 document.removeEventListener('mouseup', handleMouseUp);
               };
               
               document.addEventListener('mousemove', handleMouseMove);
               document.addEventListener('mouseup', handleMouseUp);
             }
           }}
           onTouchStart={(e) => {
             const svg = e.currentTarget;
             const rect = svg.getBoundingClientRect();
             const touch = e.touches[0];
             const touchX = touch.clientX - rect.left;
             const relativeX = touchX - padding.left;
             const sliderY = chartHeight - padding.bottom + 40;
             const touchY = touch.clientY - rect.top;
             const priceMin = Math.floor(currentPrice * 0.85);
             const priceMax = Math.ceil(currentPrice * 1.15);
             const priceRange = priceMax - priceMin;
             
             if (relativeX >= 0 && relativeX <= plotWidth && Math.abs(touchY - sliderY) < 30) {
               const priceAtTouch = priceMin + (relativeX / plotWidth) * priceRange;
               setHoveredPrice(priceAtTouch);
               setIsHoveringChart(true);
               
               const handleTouchMove = (e: TouchEvent) => {
                 const touch = e.touches[0];
                 const touchX = touch.clientX - rect.left;
                 const relativeX = Math.max(0, Math.min(plotWidth, touchX - padding.left));
                 const priceAtTouch = priceMin + (relativeX / plotWidth) * priceRange;
                 setHoveredPrice(priceAtTouch);
               };
               
               const handleTouchEnd = () => {
                 document.removeEventListener('touchmove', handleTouchMove);
                 document.removeEventListener('touchend', handleTouchEnd);
               };
               
               document.addEventListener('touchmove', handleTouchMove);
               document.addEventListener('touchend', handleTouchEnd);
             }
           }}
         >
           <defs>
             <linearGradient id="profitGradient" x1="0%" y1="0%" x2="0%" y2="100%">
               <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
               <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
             </linearGradient>
             <linearGradient id="lossGradient" x1="0%" y1="0%" x2="0%" y2="100%">
               <stop offset="0%" stopColor="#ef4444" stopOpacity="0.0" />
               <stop offset="100%" stopColor="#ef4444" stopOpacity="0.3" />
             </linearGradient>
           </defs>
           
           <g className="grid">
             {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
               const y = padding.top + plotHeight * ratio;
               return (
                 <line
                   key={`h-${ratio}`}
                   x1={padding.left}
                   y1={y}
                   x2={chartWidth - padding.right}
                   y2={y}
                   stroke="#2a2a2a"
                   strokeWidth="1"
                   shapeRendering="crispEdges"
                 />
               );
             })}
             
             <line
               x1={padding.left}
               y1={yScale(0)}
               x2={chartWidth - padding.right}
               y2={yScale(0)}
               stroke="#666"
               strokeWidth="2"
               shapeRendering="crispEdges"
             />
             
             {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
               const x = padding.left + plotWidth * ratio;
               return (
                 <line
                   key={`v-${ratio}`}
                   x1={x}
                   y1={padding.top}
                   x2={x}
                   y2={chartHeight - padding.bottom}
                   stroke="#2a2a2a"
                   strokeWidth="1"
                   shapeRendering="crispEdges"
                 />
               );
             })}
           </g>
           
           {chartData.map((d, i) => {
             if (i === 0) return null;
             const prevD = chartData[i - 1];
             const x1 = xScale(prevD.daysToExp);
             const y1 = yScale(prevD.pnlPercent);
             const x2 = xScale(d.daysToExp);
             const y2 = yScale(d.pnlPercent);
             const zeroY = yScale(0);
             
             const isProfit = d.pnlPercent >= 0 && prevD.pnlPercent >= 0;
             const isLoss = d.pnlPercent <= 0 && prevD.pnlPercent <= 0;
             
             if (isProfit) {
               return (
                 <path
                   key={`fill-${i}`}
                   d={`M ${x1} ${y1} L ${x2} ${y2} L ${x2} ${zeroY} L ${x1} ${zeroY} Z`}
                   fill="url(#profitGradient)"
                 />
               );
             } else if (isLoss) {
               return (
                 <path
                   key={`fill-${i}`}
                   d={`M ${x1} ${y1} L ${x2} ${y2} L ${x2} ${zeroY} L ${x1} ${zeroY} Z`}
                   fill="url(#lossGradient)"
                 />
               );
             }
             return null;
           })}
           
           <path
             d={linePath}
             fill="none"
             stroke={currentDayData.pnlPercent >= 0 ? "#10b981" : "#ef4444"}
             strokeWidth="4"
             strokeLinecap="round"
             strokeLinejoin="round"
             vectorEffect="non-scaling-stroke"
             style={{ paintOrder: 'stroke' }}
           />
           
           <line
             x1={currentX}
             y1={padding.top}
             x2={currentX}
             y2={chartHeight - padding.bottom}
             stroke="#3b82f6"
             strokeWidth="2"
             shapeRendering="crispEdges"
           />
           
           <circle
             cx={currentX}
             cy={currentY}
             r="6"
             fill={currentDayData.pnl >= 0 ? "#10b981" : "#ef4444"}
             stroke="#fff"
             strokeWidth="2"
           />
           
           <g className="x-axis-labels">
             {(() => {
               // For ODTE (0 days) or 1DTE, show intraday times (market hours 9:30 AM - 4:00 PM)
               const isODTEor1DTE = maxDTE <= 1;
               
               if (isODTEor1DTE) {
                 // Show intraday times for ODTE/1DTE
                 const marketOpen = 9.5; // 9:30 AM
                 const marketClose = 16; // 4:00 PM
                 const totalMarketHours = marketClose - marketOpen; // 6.5 hours
                 
                 return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                   const x = padding.left + plotWidth * ratio;
                   
                   if (ratio === 1) {
                     // Expiration
                     return (
                       <text
                         key={`x-${ratio}`}
                         x={x}
                         y={chartHeight - padding.bottom + 20}
                         fill="#ffffff"
                         fillOpacity="1"
                         fontSize="16"
                         textAnchor="middle"
                         fontWeight="600"
                       >
                         EXP
                       </text>
                     );
                   } else {
                     // Calculate time during market hours
                     const hoursFromOpen = ratio * totalMarketHours;
                     const currentHour = marketOpen + hoursFromOpen;
                     const hour24 = Math.floor(currentHour);
                     const minutes = Math.round((currentHour - hour24) * 60);
                     
                     // Convert to 12-hour format
                     const hour12 = hour24 > 12 ? hour24 - 12 : hour24;
                     const ampm = hour24 >= 12 ? 'PM' : 'AM';
                     const timeLabel = `${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
                     
                     return (
                       <text
                         key={`x-${ratio}`}
                         x={x}
                         y={chartHeight - padding.bottom + 20}
                         fill="#ffffff"
                         fillOpacity="1"
                         fontSize="14"
                         textAnchor="middle"
                         fontWeight="600"
                       >
                         {timeLabel}
                       </text>
                     );
                   }
                 });
               } else {
                 // Show dates for multi-day options
                 return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                   const days = Math.round(maxDTE * (1 - ratio));
                   const x = padding.left + plotWidth * ratio;
                   const date = new Date(today);
                   date.setDate(date.getDate() + (maxDTE - days));
                   const dateLabel = ratio === 1 ? 'EXP' : `${date.getMonth() + 1}/${date.getDate()}`;
                   
                   return (
                     <text
                       key={`x-${ratio}`}
                       x={x}
                       y={chartHeight - padding.bottom + 20}
                       fill="#ffffff"
                       fillOpacity="1"
                       fontSize="16"
                       textAnchor="middle"
                       fontWeight="600"
                     >
                       {dateLabel}
                     </text>
                   );
                 });
               }
             })()}
           </g>
           
           <g className="stock-price-ticks">
             {(() => {
               const priceMin = Math.floor(currentPrice * 0.85);
               const priceMax = Math.ceil(currentPrice * 1.15);
               const priceRange = priceMax - priceMin;
               const tickInterval = priceRange > 50 ? 2 : 1;
               const ticks = [];
               
               for (let price = priceMin; price <= priceMax; price += tickInterval) {
                 const x = padding.left + ((price - priceMin) / priceRange) * plotWidth;
                 const showLabel = (price - priceMin) % (tickInterval * 5) === 0;
                 
                 ticks.push(
                   <g key={`tick-${price}`}>
                     <line
                       x1={x}
                       y1={chartHeight - padding.bottom + 35}
                       x2={x}
                       y2={chartHeight - padding.bottom + 45}
                       stroke="#666"
                       strokeWidth="1"
                     />
                     {showLabel && (
                       <text
                         x={x}
                         y={chartHeight - padding.bottom + 58}
                         fill="#ffffff"
                         fillOpacity="1"
                         fontSize="16"
                         textAnchor="middle"
                         fontWeight="600"
                       >
                         {price}
                       </text>
                     )}
                   </g>
                 );
               }
               return ticks;
             })()}
             
             <line
               x1={padding.left}
               y1={chartHeight - padding.bottom + 40}
               x2={padding.left + plotWidth}
               y2={chartHeight - padding.bottom + 40}
               stroke="#666"
               strokeWidth="2"
             />
             
             <g>
               <circle
                 cx={padding.left + ((simulatedStockPrice - Math.floor(currentPrice * 0.85)) / (Math.ceil(currentPrice * 1.15) - Math.floor(currentPrice * 0.85))) * plotWidth}
                 cy={chartHeight - padding.bottom + 40}
                 r="8"
                 fill="#3b82f6"
                 stroke="#fff"
                 strokeWidth="2"
                 style={{ cursor: 'pointer' }}
                 onClick={(e) => {
                   e.stopPropagation();
                   setIsEditingPrice(true);
                   setPriceInputValue(simulatedStockPrice.toFixed(2));
                 }}
               />
               
               <rect
                 x={padding.left + ((simulatedStockPrice - Math.floor(currentPrice * 0.85)) / (Math.ceil(currentPrice * 1.15) - Math.floor(currentPrice * 0.85))) * plotWidth - 35}
                 y={chartHeight - padding.bottom + 65}
                 width="70"
                 height="22"
                 fill="#3b82f6"
                 rx="4"
                 style={{ cursor: 'pointer' }}
                 onClick={(e) => {
                   e.stopPropagation();
                   setIsEditingPrice(true);
                   setPriceInputValue(simulatedStockPrice.toFixed(2));
                 }}
               />
               <text
                 x={padding.left + ((simulatedStockPrice - Math.floor(currentPrice * 0.85)) / (Math.ceil(currentPrice * 1.15) - Math.floor(currentPrice * 0.85))) * plotWidth}
                 y={chartHeight - padding.bottom + 79}
                 fill="white"
                 fillOpacity="1"
                 fontSize="12"
                 textAnchor="middle"
                 fontWeight="bold"
                 style={{ cursor: 'pointer' }}
                 onClick={(e) => {
                   e.stopPropagation();
                   setIsEditingPrice(true);
                   setPriceInputValue(simulatedStockPrice.toFixed(2));
                 }}
               >
                 ${simulatedStockPrice.toFixed(2)}
               </text>
             </g>
             
             <g>
               <line
                 x1={padding.left + ((strikePrice - Math.floor(currentPrice * 0.85)) / (Math.ceil(currentPrice * 1.15) - Math.floor(currentPrice * 0.85))) * plotWidth}
                 y1={chartHeight - padding.bottom + 35}
                 x2={padding.left + ((strikePrice - Math.floor(currentPrice * 0.85)) / (Math.ceil(currentPrice * 1.15) - Math.floor(currentPrice * 0.85))) * plotWidth}
                 y2={chartHeight - padding.bottom + 45}
                 stroke="#fbbf24"
                 strokeWidth="3"
               />
               <text
                 x={padding.left + ((strikePrice - Math.floor(currentPrice * 0.85)) / (Math.ceil(currentPrice * 1.15) - Math.floor(currentPrice * 0.85))) * plotWidth}
                 y={chartHeight - padding.bottom + 30}
                 fill="#fbbf24"
                 fillOpacity="1"
                 fontSize="11"
                 textAnchor="middle"
                 fontWeight="bold"
               >
                 Strike
               </text>
             </g>
             
             <text
               x={padding.left}
               y={chartHeight - padding.bottom + 100}
               fill="#ffffff"
               fillOpacity="1"
               fontSize="12"
               textAnchor="start"
               fontWeight="bold"
             >
               ${Math.floor(currentPrice * 0.85)}
             </text>
             <text
               x={padding.left + plotWidth}
               y={chartHeight - padding.bottom + 100}
               fill="#ffffff"
               fillOpacity="1"
               fontSize="12"
               textAnchor="end"
               fontWeight="bold"
             >
               ${Math.ceil(currentPrice * 1.15)}
             </text>
           </g>
           
           <g className="y-axis-labels">
             {[0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio) => {
               const pnl = minPnL + (maxPnL - minPnL) * (1 - ratio);
               const y = padding.top + plotHeight * ratio;
               const pnlPercent = pnl;
               return (
                 <text
                   key={`y-${ratio}`}
                   x={chartWidth - padding.right + 10}
                   y={y + 4}
                   fill={pnl >= 0 ? "#10b981" : "#ef4444"}
                   fillOpacity="1"
                   fontSize="12"
                   textAnchor="start"
                   fontWeight="bold"
                 >
                   {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                 </text>
               );
             })}
           </g>
           
           <text
             x={currentX}
             y={padding.top - 5}
             fill="#3b82f6"
             fontSize="11"
             textAnchor="middle"
             fontWeight="bold"
           >
             Now
           </text>
           
           <text
             x={padding.left + plotWidth + 5}
             y={yScale(minPnL)}
             fill="#ef4444"
             fontSize="10"
             fontWeight="bold"
             textAnchor="start"
           >
             MAX LOSS
           </text>
         </svg>
         
         <div className="absolute top-2 right-2 bg-black/80 rounded-lg px-3 py-2 border border-gray-700">
           <div className="text-xs text-gray-400">Now</div>
           <div className={`text-lg font-bold ${currentDayData.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
             {currentDayData.pnlPercent >= 0 ? '+' : ''}{currentDayData.pnlPercent.toFixed(2)}%
           </div>
           <div className="text-xs text-gray-400 mt-1">
             ${currentDayData.pnl >= 0 ? '+' : ''}{currentDayData.pnl.toFixed(2)}
           </div>
         </div>
       </div>
       
       {isEditingPrice && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsEditingPrice(false)}>
           <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
             <h3 className="text-white font-bold text-lg mb-4">Enter Stock Price</h3>
             <input
               type="number"
               value={priceInputValue}
               onChange={(e) => setPriceInputValue(e.target.value)}
               onKeyPress={(e) => {
                 if (e.key === 'Enter') {
                   const newPrice = parseFloat(priceInputValue);
                   if (!isNaN(newPrice) && newPrice > 0) {
                     setHoveredPrice(newPrice);
                     setIsHoveringChart(true);
                     setTimeout(() => {
                       setIsHoveringChart(false);
                       setHoveredPrice(null);
                     }, 100);
                   }
                   setIsEditingPrice(false);
                 }
               }}
               className="w-full px-4 py-2 bg-black border border-gray-600 rounded text-white text-lg font-bold focus:outline-none focus:border-blue-500"
               placeholder="Enter price..."
               autoFocus
             />
             <div className="flex gap-2 mt-4">
               <button
                 onClick={() => {
                   const newPrice = parseFloat(priceInputValue);
                   if (!isNaN(newPrice) && newPrice > 0) {
                     setHoveredPrice(newPrice);
                     setIsHoveringChart(true);
                     setTimeout(() => {
                       setIsHoveringChart(false);
                       setHoveredPrice(null);
                     }, 100);
                   }
                   setIsEditingPrice(false);
                 }}
                 className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors"
               >
                 Apply
               </button>
               <button
                 onClick={() => setIsEditingPrice(false)}
                 className="flex-1 px-4 py-2 bg-gray-700 text-white rounded font-medium hover:bg-gray-600 transition-colors"
               >
                 Cancel
               </button>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 })()}
 </div>
 </div>
 </div>

 </>
 )}

 {/* Professional Loading State */}
 {loading && (
 <div className="mt-6 bg-black rounded-2xl p-8 border-2 border-blue-600 text-center">
 <div className="flex items-center justify-center space-x-4">
 <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
 <div>
 <div className="text-blue-300 text-lg font-bold">Loading Options Data</div>
 <div className="text-sm text-gray-400 mt-1">Real-time options data</div>
 </div>
 </div>
 </div>
 )}

 {/* Professional Error State */}
 {error && (
 <div className="mt-6 bg-black rounded-2xl p-6 border-2 border-red-600">
 <div className="flex items-center space-x-3 mb-4">
 <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
 <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
 <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
 </svg>
 </div>
 <div>
 <div className="text-red-300 font-bold text-lg">Error Loading Data</div>
 <div className="text-red-400 text-sm mt-1">{error}</div>
 </div>
 </div>
 <button 
 onClick={() => fetchRealOptionsData(symbol)}
 className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 rounded-xl text-white font-bold transition-all duration-200 hover:scale-105"
 >
 Retry
 </button>
 </div>
 )}

 </div>
 </div>
 );
};

export default OptionsCalculator;
