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
 lastPrice: number;
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
 ticker?: string;
 fetchingPrice?: boolean;
 delta?: number;
 gamma?: number;
 theta?: number;
 vega?: number;
 };
}

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
 return (term1 + term2) / 365;
 } else {
 const term2 = r * K * Math.exp(-r * T) * normalCDF(-d2);
 return (term1 + term2) / 365;
 }
};

interface ChainCalculatorProps {
 initialSymbol?: string;
 onClose?: () => void;
}

const ChainCalculator: React.FC<ChainCalculatorProps> = ({ initialSymbol = 'SPY', onClose }) => {
 const [symbol, setSymbol] = useState(initialSymbol);
 const [userManuallyEnteredSymbol, setUserManuallyEnteredSymbol] = useState(false);
 const [currentPrice, setCurrentPrice] = useState(0);
 const [selectedExpiration, setSelectedExpiration] = useState('');
 const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
 const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realOptionsData, setRealOptionsData] = useState<RealOptionsData>({});
  const [impliedVolatility, setImpliedVolatility] = useState(0);
 const [otmPercentage, setOtmPercentage] = useState(10);
 const [customPremium, setCustomPremium] = useState<number | null>(null);
 const [viewMode, setViewMode] = useState<'table' | 'line'>('table');
 const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
 const [isHoveringChart, setIsHoveringChart] = useState(false);
 const [isEditingPrice, setIsEditingPrice] = useState(false);
 const [priceInputValue, setPriceInputValue] = useState('');
 
 const [additionalLegs, setAdditionalLegs] = useState<Array<{
 id: number;
 strike: number | null;
 expiration: string;
 optionType: 'call' | 'put';
 premium: number | null;
 position: 'buy' | 'sell';
 }>>([]);
 
 const riskFreeRate = 0.0408;

 const [availableExpirations, setAvailableExpirations] = useState<{date: string; days: number}[]>([]);

 const strikes = useMemo(() => {
 if (Object.keys(realOptionsData).length === 0) {
 return [];
 }
 
 const allStrikes = new Set<number>();
 
 if (selectedExpiration) {
 Object.values(realOptionsData).forEach(option => {
 if (option.expiration === selectedExpiration && option.type === optionType) {
 allStrikes.add(option.strike);
 }
 });
 } else {
 Object.values(realOptionsData).forEach(option => {
 if (option.type === optionType) {
 allStrikes.add(option.strike);
 }
 });
 }
 
 const sortedStrikes = Array.from(allStrikes).sort((a, b) => b - a);
 return sortedStrikes;
 }, [selectedExpiration, realOptionsData, optionType]);

 const heatMapStrikes = useMemo(() => {
 if (strikes.length === 0 || currentPrice <= 0) {
 return strikes;
 }
 
 const otmDecimal = otmPercentage / 100;
 const lowerBound = currentPrice * (1 - otmDecimal);
 const upperBound = currentPrice * (1 + otmDecimal);
 
 const filteredStrikes = strikes.filter(strike => 
 strike >= lowerBound && strike <= upperBound
 );
 
 return filteredStrikes.length > 0 ? filteredStrikes : strikes.slice(0, 15);
 }, [strikes, currentPrice, otmPercentage]);

 const heatMapTimeSeries = useMemo(() => {
 if (!selectedExpiration) {
 return [];
 }
 
 const selectedExp = availableExpirations.find(exp => exp.date === selectedExpiration);
 if (!selectedExp) {
 return [];
 }
 
 const maxDays = selectedExp.days;
 const timePoints = [];
 
 if (maxDays <= 7) {
 for (let days = maxDays; days >= 1; days--) {
 timePoints.push({ days, label: `${days}d` });
 }
 timePoints.push({ days: 0, label: 'Exp' });
 } else if (maxDays <= 30) {
 const intervals = [maxDays, Math.floor(maxDays * 0.8), Math.floor(maxDays * 0.6), Math.floor(maxDays * 0.4), Math.floor(maxDays * 0.2), 7, 3, 1];
 const uniqueIntervals = [...new Set(intervals)].filter(d => d > 0).sort((a, b) => b - a);
 
 uniqueIntervals.forEach(days => {
 timePoints.push({ days, label: `${days}d` });
 });
 timePoints.push({ days: 0, label: 'Exp' });
 } else {
 const intervals = [maxDays, Math.floor(maxDays * 0.75), Math.floor(maxDays * 0.5), Math.floor(maxDays * 0.25), 30, 14, 7, 3, 1];
 const uniqueIntervals = [...new Set(intervals)].filter(d => d > 0).sort((a, b) => b - a);
 
 uniqueIntervals.slice(0, 7).forEach(days => {
 timePoints.push({ days, label: `${days}d` });
 });
 timePoints.push({ days: 0, label: 'Exp' });
 }
 
 return timePoints;
 }, [selectedExpiration, availableExpirations]);

 const atmStrike = useMemo(() => {
 if (heatMapStrikes.length === 0 || currentPrice <= 0) {
 return null;
 }
 
 return heatMapStrikes.reduce((prev, curr) => 
 Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
 );
 }, [heatMapStrikes, currentPrice]);

 useEffect(() => {
 if (availableExpirations.length > 0 && !selectedExpiration) {
 const firstExpiration = availableExpirations[0];
 setSelectedExpiration(firstExpiration.date);
 setSelectedStrike(null);
 }
 }, [availableExpirations, selectedExpiration]);

 useEffect(() => {
 if (strikes.length > 0 && currentPrice > 0 && selectedStrike === null) {
 const atmStrike = strikes.reduce((prev, curr) => {
 const prevDistance = Math.abs(prev - currentPrice);
 const currDistance = Math.abs(curr - currentPrice);
 return currDistance < prevDistance ? curr : prev;
 });
 
 setSelectedStrike(atmStrike);
 }
 }, [strikes, currentPrice, selectedExpiration, optionType, selectedStrike]);

 useEffect(() => {
 if (selectedStrike && selectedExpiration && Object.keys(realOptionsData).length > 0 && customPremium === null) {
 const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
 const realOption = realOptionsData[key];
 
 if (realOption && realOption.ticker) {
 getCurrentOptionPricing(selectedStrike, selectedExpiration, optionType).then(updatedOption => {
 if (updatedOption && updatedOption.ask > 0) {
 setCustomPremium(updatedOption.ask);
 } else if (updatedOption && updatedOption.lastPrice > 0) {
 setCustomPremium(updatedOption.lastPrice);
 }
 }).catch(error => {
 console.error('Failed to fetch fresh real-time pricing for premium auto-fill:', error);
 });
 }
 }
 }, [selectedStrike, selectedExpiration, optionType, customPremium]);

 const fetchRealOptionsData = useCallback(async (symbolToFetch: string) => {
 if (!symbolToFetch || symbolToFetch.trim() === '') {
 setLoading(false);
 return;
 }
 
 const upperSymbol = symbolToFetch.toUpperCase().trim();
 setLoading(true);
 setError(null);
 
 try {
 const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
 
 const priceUrl = `https://api.polygon.io/v2/last/trade/${upperSymbol}?apikey=${POLYGON_API_KEY}`;
 const priceResponse = await fetch(priceUrl);
 
 if (!priceResponse.ok) {
 throw new Error(`Failed to get real-time price for ${upperSymbol}`);
 }
 
 const priceData = await priceResponse.json();
 
 if (priceData.status !== 'OK' || !priceData.results) {
 throw new Error(`No real-time price data available for ${upperSymbol}`);
 }
 
 const currentStockPrice = priceData.results.p;
 
 if (!currentStockPrice || currentStockPrice <= 0) {
 throw new Error(`Invalid price received for ${upperSymbol}: ${currentStockPrice}`);
 }
 
 setCurrentPrice(currentStockPrice);
 
 const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${upperSymbol}?apikey=${POLYGON_API_KEY}`;
 const snapshotResponse = await fetch(snapshotUrl);
 
 if (!snapshotResponse.ok) {
 throw new Error(`Failed to get options snapshot for ${upperSymbol}: ${snapshotResponse.status}`);
 }
 
 const snapshotData = await snapshotResponse.json();
 
 if (snapshotData.status !== 'OK' || !snapshotData.results || snapshotData.results.length === 0) {
 setRealOptionsData({});
 setAvailableExpirations([]);
 setLoading(false);
 return;
 }
 
 let allContracts: any[] = [];
 const today = new Date().toISOString().split('T')[0];
 let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${upperSymbol}&active=true&expiration_date.gte=${today}&limit=1000&apikey=${POLYGON_API_KEY}`;
 let pageCount = 0;
 
 while (nextUrl && pageCount < 50) {
 pageCount++;
 
 const contractsResponse: Response = await fetch(nextUrl);
 
 if (!contractsResponse.ok) {
 break;
 }
 
 const contractsData: any = await contractsResponse.json();
 
 if (contractsData.status !== 'OK' || !contractsData.results) {
 break;
 }
 
 allContracts.push(...contractsData.results);
 
 nextUrl = contractsData.next_url || null;
 if (nextUrl && !nextUrl.includes('apikey=')) {
 nextUrl += `&apikey=${POLYGON_API_KEY}`;
 }
 
 if (!nextUrl) {
 break;
 }
 }
 
 if (allContracts.length === 0) {
 setRealOptionsData({});
 setAvailableExpirations([]);
 setLoading(false);
 return;
 }
 
 const processedOptions: RealOptionsData = {};
 const uniqueExpirations = new Set<string>();
 
 allContracts.forEach((contract: any) => {
 const expDate = contract.expiration_date;
 const strike = contract.strike_price;
 const optionType = contract.contract_type?.toLowerCase();
 
 if (!expDate || !strike || !optionType) {
 return;
 }
 
 const expiry = new Date(expDate);
 const now = new Date();
 const daysToExp = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
 
 if (daysToExp <= 0) {
 return;
 }
 
 uniqueExpirations.add(expDate);
 
 const key = `${strike}-${expDate}-${optionType}`;
 const contractTicker = contract.ticker;
 
 processedOptions[key] = {
 strike: strike,
 expiration: expDate,
 daysToExpiration: daysToExp,
 type: optionType as 'call' | 'put',
 bid: 0,
 ask: 0,
 lastPrice: 0,
 volume: 0,
 openInterest: 0,
 impliedVolatility: 0,
 ticker: contractTicker
 };
 });
 
 if (Object.keys(processedOptions).length === 0) {
 setRealOptionsData({});
 setAvailableExpirations([]);
 setLoading(false);
 return;
 }
 
 const sortedExpirations = Array.from(uniqueExpirations).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
 
 const expirationsWithDays = sortedExpirations.map(date => {
 const expiry = new Date(date);
 const now = new Date();
 const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
 return { date, days };
 }).filter(exp => exp.days > 0);
 
 setAvailableExpirations(expirationsWithDays);
 setRealOptionsData(processedOptions);
 setLoading(false);
 setError(null);
 
 } catch (error) {
 setError(`Unable to load real-time data for "${upperSymbol}". ${error instanceof Error ? error.message : 'Please try again.'}`);
 setLoading(false);
 }
 }, []);

 const fetchSpecificOptionPricing = async (ticker: string): Promise<any> => {
 const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
 
 try {
 const quotesUrl = `https://api.polygon.io/v3/quotes/${ticker}?order=desc&limit=1&apikey=${POLYGON_API_KEY}`;
 
 const quotesResponse = await fetch(quotesUrl);
 const quotesData = await quotesResponse.json();
 
 if (quotesResponse.ok && quotesData.status === 'OK' && quotesData.results && quotesData.results.length > 0) {
 const quote = quotesData.results[0];
 
 return {
 ask: quote.ask_price || 0,
 bid: quote.bid_price || 0,
 lastPrice: quote.ask_price || 0,
 volume: quote.ask_size || 0,
 };
 } else {
 const tradesUrl = `https://api.polygon.io/v3/trades/${ticker}?order=desc&limit=1&apikey=${POLYGON_API_KEY}`;
 
 const tradesResponse = await fetch(tradesUrl);
 const tradesData = await tradesResponse.json();
 
 if (tradesResponse.ok && tradesData.status === 'OK' && tradesData.results && tradesData.results.length > 0) {
 const trade = tradesData.results[0];
 
 return {
 ask: trade.price || 0,
 bid: trade.price ? trade.price * 0.98 : 0,
 lastPrice: trade.price || 0,
 volume: trade.size || 0,
 };
 } else {
 return null;
 }
 }
 
 } catch (error) {
 return null;
 }
 };

 const getCurrentOptionPricing = async (strike: number, expiration: string, type: 'call' | 'put') => {
 const key = `${strike}-${expiration}-${type}`;
 const option = realOptionsData[key];
 
 if (!option || !option.ticker) {
 return null;
 }
 
 const pricingData = await fetchSpecificOptionPricing(option.ticker);
 
 if (pricingData) {
 realOptionsData[key] = {
 ...realOptionsData[key],
 ...pricingData,
 };
 
 setRealOptionsData({...realOptionsData});
 return realOptionsData[key];
 }
 
 return null;
 };

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

 const expiry = new Date(expiration);
 const now = new Date();
 const daysToExp = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

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

 useEffect(() => {
 if (selectedStrike && selectedExpiration && optionType) {
 const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
 const existing = realOptionsData[key];
 
 if (!existing || !existing.impliedVolatility || existing.impliedVolatility === 0) {
 fetchIndividualOptionData(selectedStrike, selectedExpiration, optionType);
 }
 }
 }, [selectedStrike, selectedExpiration, optionType, fetchIndividualOptionData, realOptionsData]);

 useEffect(() => {
 if (!userManuallyEnteredSymbol && initialSymbol !== symbol && symbol !== '') {
 setSymbol(initialSymbol);
 }
 }, [initialSymbol, userManuallyEnteredSymbol, symbol]);

 useEffect(() => {
 if (!symbol || symbol.trim().length === 0) {
 setRealOptionsData({});
 setCurrentPrice(0);
 setAvailableExpirations([]);
 setSelectedStrike(null);
 setSelectedExpiration('');
 setError(null);
 }
 }, [symbol]);

 const handleSymbolChange = (newSymbol: string) => {
 const upperSymbol = newSymbol.toUpperCase().trim();
 
 if (upperSymbol === '') {
 setUserManuallyEnteredSymbol(false);
 setSymbol('');
 setSelectedStrike(null);
 setSelectedExpiration('');
 setCustomPremium(null);
 setError(null);
 return;
 }
 
 setUserManuallyEnteredSymbol(true);
 setSymbol(upperSymbol);
 };

 const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
 if (e.key === 'Enter') {
 const upperSymbol = symbol.toUpperCase().trim();
 if (upperSymbol.length >= 1) {
 fetchRealOptionsData(upperSymbol);
 }
 }
 };

 return (
 <div className="h-full bg-black text-white overflow-y-auto">
 <div className="px-6 py-1 border-b border-gray-800 bg-black relative">
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
 <div className="relative bg-gradient-to-br from-gray-950 via-black to-gray-900 border-4 border-gray-600 shadow-2xl overflow-hidden mb-6">
 <div className="absolute inset-0 opacity-5 pointer-events-none">
 <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-orange-600/10 to-transparent animate-pulse"></div>
 </div>

 <div className="p-6 relative z-10">
 <div className="grid grid-cols-12 gap-2 mb-4">
 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[18px] font-bold uppercase tracking-wider">SYMBOL</label>
 </div>
 <div className="p-2 bg-black">
 <input
 type="text"
 value={symbol}
 onChange={(e) => handleSymbolChange(e.target.value)}
 onKeyPress={handleKeyPress}
 placeholder="SPY"
 className="w-full bg-black border border-gray-700 px-2 py-1 text-white text-base font-bold uppercase focus:outline-none focus:border-gray-600"
 />
 </div>
 </div>
 </div>

 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[18px] font-bold uppercase tracking-wider">STRIKE</label>
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
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-sm font-bold focus:outline-none"
 >
 <option value="">Select Strike</option>
 {strikes.map((strike) => (
 <option key={strike} value={strike}>
 ${strike}
 </option>
 ))}
 </select>
 </div>
 </div>
 </div>

 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg relative z-10">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[18px] font-bold uppercase tracking-wider">TYPE</label>
 </div>
 <div className="p-2 flex gap-1 bg-black relative z-20">
 <button
 type="button"
 onClick={() => {
 setOptionType('call');
 setSelectedStrike(null);
 setCustomPremium(null);
 }}
 className={`flex-1 py-1 px-2 text-[18px] font-bold uppercase border cursor-pointer transition-all ${
 optionType === 'call'
 ? 'bg-gradient-to-r from-gray-800 to-gray-700 border-gray-500 text-green-500'
 : 'bg-black border-gray-700 text-gray-400'
 }`}
 >
 CALL
 </button>
 <button
 type="button"
 onClick={() => {
 setOptionType('put');
 setSelectedStrike(null);
 setCustomPremium(null);
 }}
 className={`flex-1 py-1 px-2 text-[18px] font-bold uppercase border cursor-pointer transition-all ${
 optionType === 'put'
 ? 'bg-gradient-to-r from-gray-800 to-gray-700 border-gray-500 text-red-500'
 : 'bg-black border-gray-700 text-gray-400'
 }`}
 >
 PUT
 </button>
 </div>
 </div>
 </div>

 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[18px] font-bold uppercase tracking-wider">EXPIRY</label>
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
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-[14px] font-semibold focus:outline-none"
 >
 <option value="">Select</option>
 {availableExpirations.map((exp) => (
 <option key={exp.date} value={exp.date}>
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
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-[11px] focus:outline-none"
 />
 )}
 </div>
 </div>
 </div>

 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[18px] font-bold uppercase tracking-wider">PREMIUM</label>
 </div>
 <div className="p-2 bg-black">
 <input
 type="number"
 value={customPremium || ''}
 onChange={(e) => setCustomPremium(e.target.value ? Number(e.target.value) : null)}
 placeholder="6.9"
 step="0.01"
 min="0"
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-base font-bold focus:outline-none"
 />
 </div>
 </div>
 </div>

 <div className="col-span-2">
 <div className="bg-black border border-gray-700 shadow-lg">
 <div className="bg-gradient-to-r from-black via-gray-950 to-black px-2 py-1 border-b border-gray-700">
 <label className="text-orange-500 text-[18px] font-bold uppercase tracking-wider">OTM</label>
 </div>
 <div className="p-2 bg-black">
 <select 
 value={otmPercentage}
 onChange={(e) => setOtmPercentage(Number(e.target.value))}
 className="w-full bg-black border border-gray-600 px-2 py-1 text-white text-[14px] font-semibold focus:outline-none"
 >
 <option value={2}>±2%</option>
 <option value={5}>±5%</option>
 <option value={10}>±10%</option>
 <option value={15}>±15%</option>
 <option value={20}>±20%</option>
 </select>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Greeks Bar and Heatmap */}
 {(() => {
 const hasSymbol = !!symbol;
 const hasOptionType = !!optionType;
 const hasExpiration = !!selectedExpiration;
 const hasStrike = !!selectedStrike;
 const hasRealData = Object.keys(realOptionsData).length > 0;
 const hasCustomPremium = !!(customPremium && customPremium > 0);
 const showHeatmap = hasSymbol && hasOptionType && hasExpiration && hasStrike && (hasRealData || hasCustomPremium);
 
 return showHeatmap;
 })() && (
 <>
 {(() => {
 const expiration = availableExpirations.find(exp => exp.date === selectedExpiration);
 const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
 const realOption = realOptionsData[key];
 
 return (
 <div className="mb-4 bg-black border-2 border-orange-500/30 p-0">
 <div className="grid grid-cols-4 gap-0">
 <div className="bg-black border-r-2 border-orange-500/30 px-4 py-3">
 <div className="flex flex-col">
 <span className="text-green-500 text-xs font-bold uppercase tracking-wider mb-1">DELTA</span>
 <span className="text-white text-lg font-bold font-mono">
 {realOption?.delta !== null && realOption?.delta !== undefined ? realOption.delta.toFixed(3) : '--'}
 </span>
 </div>
 </div>
 <div className="bg-black border-r-2 border-orange-500/30 px-4 py-3">
 <div className="flex flex-col">
 <span className="text-yellow-500 text-xs font-bold uppercase tracking-wider mb-1">GAMMA</span>
 <span className="text-white text-lg font-bold font-mono">
 {realOption?.gamma !== null && realOption?.gamma !== undefined ? realOption.gamma.toFixed(4) : '--'}
 </span>
 </div>
 </div>
 <div className="bg-black border-r-2 border-orange-500/30 px-4 py-3">
 <div className="flex flex-col">
 <span className="text-red-500 text-xs font-bold uppercase tracking-wider mb-1">THETA</span>
 <span className="text-white text-lg font-bold font-mono">
 {realOption?.theta !== null && realOption?.theta !== undefined ? realOption.theta.toFixed(2) : '--'}
 </span>
 </div>
 </div>
 <div className="bg-black px-4 py-3">
 <div className="flex flex-col">
 <span className="text-blue-500 text-xs font-bold uppercase tracking-wider mb-1">IV</span>
 <span className="text-white text-lg font-bold font-mono">
 {realOption?.impliedVolatility && realOption.impliedVolatility > 0 ? `${(realOption.impliedVolatility * 100).toFixed(1)}%` : '--'}
 </span>
 </div>
 </div>
 </div>
 </div>
 );
 })()}

 <div className="bg-black rounded-2xl p-8 border-2 border-gray-700 shadow-2xl">
 <div className="overflow-x-auto rounded-xl border-2 border-gray-700">
 <div className="min-w-max bg-black">
 <div className="flex border-b border-gray-800 bg-black relative overflow-hidden">
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
 
 {viewMode === 'table' && (
 <>
 <div className="text-center py-4 bg-black border-b border-gray-600">
 <span className="text-lg font-bold text-blue-300 uppercase tracking-wider">Time Till Expiration (Days)</span>
 </div>
 
 <div className="relative">
 <table className="w-full border-collapse bg-black">
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
 
 <tbody>
 {heatMapStrikes.map((strike) => {
 const isATM = strike === atmStrike;
 
 return (
 <tr key={strike} className={isATM ? 'ring-2 ring-yellow-400' : ''}>
 <td className={`h-12 border border-gray-600 text-center font-medium text-lg ${
 isATM 
 ? 'bg-yellow-900 text-yellow-300 font-bold ring-1 ring-yellow-400' 
 : 'bg-black text-white'
 }`}>
 ${strike} {isATM && '★'}
 </td>
 
 {heatMapTimeSeries.map((timePoint) => {
 let pnlData = { dollarPnL: 0, percentPnL: 0, optionPrice: 0 };
 let cellColor = 'bg-gray-800 text-gray-500';
 let displayText = '--';
 
 if (currentPrice > 0 && selectedStrike && customPremium && customPremium > 0) {
 try {
 const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
 const realOption = realOptionsData[key];
 
 if (!realOption?.impliedVolatility || realOption.impliedVolatility <= 0) {
 return null;
 }
 
 const impliedVol = realOption.impliedVolatility;
 const expDate = new Date(selectedExpiration);
 const today = new Date();
 const currentDTE = Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
 const currentTimeToExpiry = currentDTE / 365;
 
 const baselineOptionPrice = calculateBSPrice(
 currentPrice,
 selectedStrike,
 currentTimeToExpiry,
 0.045,
 impliedVol,
 0,
 optionType === 'call'
 );
 
 const timeToExpiry = timePoint.days / 365;
 const simulatedOptionPrice = calculateBSPrice(
 strike,
 selectedStrike,
 timeToExpiry,
 0.045,
 impliedVol,
 0,
 optionType === 'call'
 );
 
 const { dollarPnL, percentPnL } = calculatePnL(simulatedOptionPrice, baselineOptionPrice, 1);
 
 pnlData = { dollarPnL, percentPnL, optionPrice: simulatedOptionPrice };
 
 const absPercentPnL = Math.abs(percentPnL);
 
 if (percentPnL > 0) {
 if (absPercentPnL >= 100) {
 cellColor = 'bg-green-600 text-white font-bold';
 } else if (absPercentPnL >= 50) {
 cellColor = 'bg-green-700 text-green-100 font-semibold';
 } else if (absPercentPnL >= 25) {
 cellColor = 'bg-green-800 text-green-200';
 } else if (absPercentPnL >= 10) {
 cellColor = 'bg-green-900 text-green-300';
 } else if (absPercentPnL > 0) {
 cellColor = 'bg-green-950 text-green-400';
 }
 } else if (percentPnL < 0) {
 if (absPercentPnL >= 100) {
 cellColor = 'bg-red-600 text-white font-bold';
 } else if (absPercentPnL >= 50) {
 cellColor = 'bg-red-700 text-red-100 font-semibold';
 } else if (absPercentPnL >= 25) {
 cellColor = 'bg-red-800 text-red-200';
 } else if (absPercentPnL >= 10) {
 cellColor = 'bg-red-900 text-red-300';
 } else if (absPercentPnL > 0) {
 cellColor = 'bg-red-950 text-red-400';
 }
 } else {
 cellColor = 'bg-gray-700 text-gray-300 font-medium';
 }
 
 displayText = `$${dollarPnL.toFixed(0)}`;
 if (Math.abs(percentPnL) < 999) {
 displayText += ` (${percentPnL > 0 ? '+' : ''}${percentPnL.toFixed(0)}%)`;
 }
 
 } catch (error) {
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
 setSelectedStrike(strike);
 setCustomPremium(null);
 }}
 title={`Stock @ $${strike} | Strike $${selectedStrike} | ${timePoint.days}d | P/L: ${displayText} | Option Price: $${pnlData.optionPrice.toFixed(2)}`}
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
 
 {viewMode === 'line' && (() => {
   if (!selectedStrike) return null;
   
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
             {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
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
             })}
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
           </g>
           
           <g className="y-axis-labels">
             {[0, 0.2, 0.4, 0.6, 0.8, 1].map((ratio) => {
               const pnl = minPnL + (maxPnL - minPnL) * (1 - ratio);
               const y = padding.top + plotHeight * ratio;
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
                   {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
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

export default ChainCalculator;
