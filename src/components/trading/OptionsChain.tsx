'use client';



import React, { useState, useEffect, useCallback } from 'react';

import { TbRefresh, TbStar, TbStarFilled, TbInfoCircle, TbChartLine, TbEye, TbCalculator } from 'react-icons/tb';

import ChainCalculator from './ChainCalculator';

import { polygonRateLimiter } from '@/lib/polygonRateLimiter';



interface OptionContract {

  ticker: string;

  strike_price: number;

  contract_type: 'call' | 'put';

  expiration_date: string;

  bid?: number;

  ask?: number;

  last_price?: number;

  volume?: number;

  open_interest?: number;

  implied_volatility?: number;

  delta?: number;

  gamma?: number;

  theta?: number;

  vega?: number;

  change_percent?: number;

  previous_close?: number;

}



interface OptionsChainProps {

  symbol: string;

  currentPrice?: number;

  onClose?: () => void;

}



interface WatchlistOption {

  id: string;

  ticker: string;

  symbol: string;

  strike: number;

  type: 'call' | 'put';

  expiration: string;

  bid: number;

  ask: number;

  lastPrice: number;

  delta: number;

  theta: number;

  implied_volatility: number;

  addedAt: Date;

  entryPrice: number; // Mid price when added

  stockPrice: number; // Stock price when added

}



const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';



export default function OptionsChain({ symbol: initialSymbol, currentPrice = 0, onClose }: OptionsChainProps) {

  const [symbol, setSymbol] = useState(initialSymbol);

  const [searchInput, setSearchInput] = useState(initialSymbol);

  const [showCalculator, setShowCalculator] = useState(false);

  const [expirationDates, setExpirationDates] = useState<string[]>([]);

  const [selectedExpiration, setSelectedExpiration] = useState<string>('');

  const [otmRange, setOtmRange] = useState<number>(20); // OTM percentage range

  const [calculatorModalOtmRange, setCalculatorModalOtmRange] = useState<number>(15); // OTM range for calculator modal

  const [callOptions, setCallOptions] = useState<OptionContract[]>([]);

  const [putOptions, setPutOptions] = useState<OptionContract[]>([]);

  const [loading, setLoading] = useState(true);

  const [stockPrice, setStockPrice] = useState(currentPrice);

  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [watchlist, setWatchlist] = useState<WatchlistOption[]>([]);

  const [showWatchlist, setShowWatchlist] = useState(false);

  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  const [calculatorModalOpen, setCalculatorModalOpen] = useState<string | null>(null); // Stores watchlist item ID

  const [calculatorView, setCalculatorView] = useState<'table' | 'line'>('table'); // Tab state for calculator modal

  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);

  const [isHoveringChart, setIsHoveringChart] = useState(false);

  const [calculatorStockPrices, setCalculatorStockPrices] = useState<{ [symbol: string]: number }>({});

  const [priceChartModal, setPriceChartModal] = useState<{ ticker: string; type: 'call' | 'put' } | null>(null);

  const [priceChartData, setPriceChartData] = useState<{ time: string; price: number; volume: number }[]>([]);

  const [loadingChart, setLoadingChart] = useState(false);

  const [chartTimeframe, setChartTimeframe] = useState<'5m' | '1h' | '1d'>('5m');

  const [showColumnFilter, setShowColumnFilter] = useState(false);

  const [visibleColumns, setVisibleColumns] = useState({

    openInterest: true,

    volume: true,

    delta: true,

    theta: true,

    iv: true,

    change: true,

    breakeven: true,

    bid: true,

    ask: true,

    watchlist: true

  });



  // Sync symbol when initialSymbol changes

  useEffect(() => {

    if (initialSymbol !== symbol) {

      setSymbol(initialSymbol);

      setSearchInput(initialSymbol);

    }

  }, [initialSymbol]);



  // Set default OTM range based on ticker type

  useEffect(() => {

    const ticker = symbol.toUpperCase();

    const etfList = ['SPY', 'QQQ', 'TLT', 'GLD', 'IWM', 'DIA', 'EEM', 'XLF', 'XLE', 'XLK'];



    if (etfList.includes(ticker)) {

      setOtmRange(3); // 3% for ETFs

    } else {

      setOtmRange(10); // 10% for stocks

    }

  }, [symbol]);



  // Fetch stock price for calculator when modal opens

  useEffect(() => {

    if (calculatorModalOpen) {

      const item = watchlist.find(w => w.id === calculatorModalOpen);

      if (item && !calculatorStockPrices[item.symbol]) {

        // Fetch current stock price for this symbol

        polygonRateLimiter.fetch(`https://api.polygon.io/v2/aggs/ticker/${item.symbol}/prev?apikey=${POLYGON_API_KEY}`)

          .then(data => {

            if (data.results && data.results.length > 0) {

              const price = data.results[0].c;

              setCalculatorStockPrices(prev => ({ ...prev, [item.symbol]: price }));

            }

          })

          .catch(err => console.error('Error fetching calculator stock price:', err));

      }

    }

  }, [calculatorModalOpen, watchlist]);



  // Fetch current stock price

  const fetchStockPrice = useCallback(async () => {

    try {

      const data = await polygonRateLimiter.fetch(

        `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apikey=${POLYGON_API_KEY}`

      );

      if (data.results?.[0]?.c) {

        setStockPrice(data.results[0].c);

        return data.results[0].c;

      }

    } catch (error) {

      console.error('Error fetching stock price:', error);

      setError('Failed to fetch stock price');

    }

    return null;

  }, [symbol]);



  // Parse option ticker to readable format

  const parseOptionTicker = (ticker: string) => {

    // Format: O:SPY260116C00690000

    // O: = option, SPY = underlying, 260116 = YYMMDD, C/P = call/put, 00690000 = strike * 1000

    const match = ticker.match(/O:([A-Z]+)(\d{6})([CP])(\d{8})/);

    if (!match) return ticker;



    const [, symbol, dateStr, type, strikeStr] = match;



    // Parse date: YYMMDD

    const year = '20' + dateStr.substring(0, 2);

    const month = dateStr.substring(2, 4);

    const day = dateStr.substring(4, 6);

    const expDate = `${month}/${day}/${year}`;



    // Parse strike: divide by 1000

    const strike = parseInt(strikeStr) / 1000;



    // Type

    const optType = type === 'C' ? 'Calls' : 'Puts';



    return `${symbol} $${strike.toFixed(0)} ${optType} ${expDate}`;

  };



  // Fetch intraday option price data for chart

  const fetchOptionPriceHistory = async (optionTicker: string, timeframe: '5m' | '1h' | '1d' = '5m') => {

    setLoadingChart(true);

    try {

      const today = new Date();

      let fromDate: Date;

      let toDate: Date = today;

      let multiplier: number;

      let timespan: string;

      let formatTime: (timestamp: number) => string;



      // Configure based on timeframe

      if (timeframe === '5m') {

        // 5-minute bars for current day

        fromDate = new Date(today);

        multiplier = 5;

        timespan = 'minute';

        formatTime = (t) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

      } else if (timeframe === '1h') {

        // Hourly bars for last 3 days

        fromDate = new Date(today);

        fromDate.setDate(fromDate.getDate() - 3);

        multiplier = 1;

        timespan = 'hour';

        formatTime = (t) => {

          const date = new Date(t);

          const datePart = date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' });

          const timePart = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });

          return datePart + ' ' + timePart;

        };

      } else { // '1d'

        // Daily bars for last 30 days

        fromDate = new Date(today);

        fromDate.setDate(fromDate.getDate() - 30);

        multiplier = 1;

        timespan = 'day';

        formatTime = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      }



      const fromStr = fromDate.toISOString().split('T')[0];

      const toStr = toDate.toISOString().split('T')[0];





      const url = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${fromStr}/${toStr}?adjusted=true&sort=asc&limit=5000&apikey=${POLYGON_API_KEY}`;



      const data = await polygonRateLimiter.fetch(url);





      if (data.results && data.results.length > 0) {

        const chartData = data.results.map((bar: any) => ({

          time: formatTime(bar.t),

          price: bar.c,

          volume: bar.v,

          open: bar.o,

          high: bar.h,

          low: bar.l,

          close: bar.c

        }));



        const open = data.results[0].o;

        const close = data.results[data.results.length - 1].c;

        const high = Math.max(...data.results.map((b: any) => b.h));

        const low = Math.min(...data.results.map((b: any) => b.l));

        const change = close - open;

        const changePercent = (change / open) * 100;





        setPriceChartData(chartData);

      } else {

        console.warn(`⚠️ No results found. API Status: ${data.status}, Message: ${data.message || 'N/A'}`);



        // For 5m timeframe, try previous trading days

        if (timeframe === '5m') {

          let foundData = false;

          for (let daysBack = 1; daysBack <= 5 && !foundData; daysBack++) {

            const prevDate = new Date(today);

            prevDate.setDate(prevDate.getDate() - daysBack);

            const prevDateStr = prevDate.toISOString().split('T')[0];





            const fallbackUrl = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/5/minute/${prevDateStr}/${prevDateStr}?adjusted=true&sort=asc&limit=5000&apikey=${POLYGON_API_KEY}`;

            const fallbackData = await polygonRateLimiter.fetch(fallbackUrl);



            if (fallbackData.results && fallbackData.results.length > 0) {

              const chartData = fallbackData.results.map((bar: any) => ({

                time: formatTime(bar.t),

                price: bar.c,

                volume: bar.v,

                open: bar.o,

                high: bar.h,

                low: bar.l,

                close: bar.c

              }));



              const open = fallbackData.results[0].o;

              const close = fallbackData.results[fallbackData.results.length - 1].c;

              const high = Math.max(...fallbackData.results.map((b: any) => b.h));

              const low = Math.min(...fallbackData.results.map((b: any) => b.l));





              setPriceChartData(chartData);

              foundData = true;

            }

          }



          if (!foundData) {

            console.error(`❌ No 5m data available for ${optionTicker} in last 5 days`);

            setPriceChartData([]);

          }

        } else {

          setPriceChartData([]);

        }

      }

    } catch (error) {

      console.error('❌ Error fetching option price history:', error);

      setPriceChartData([]);

    } finally {

      setLoadingChart(false);

    }

  };



  // Handle double-click on bid/ask to open price chart

  const handlePriceDoubleClick = (optionContract: OptionContract) => {

    setPriceChartModal({ ticker: optionContract.ticker, type: optionContract.contract_type });

    setChartTimeframe('5m'); // Reset to 5m when opening

    fetchOptionPriceHistory(optionContract.ticker, '5m');

  };



  // Fetch expiration dates

  const fetchExpirationDates = useCallback(async () => {

    try {

      let allResults: any[] = [];

      let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&limit=1000&apikey=${POLYGON_API_KEY}`;



      // Fetch all pages

      while (nextUrl) {

        const response: Response = await fetch(nextUrl);

        const data: any = await response.json();



        if (data.results && data.results.length > 0) {

          allResults = allResults.concat(data.results);

        }



        nextUrl = data.next_url ? `${data.next_url}&apikey=${POLYGON_API_KEY}` : null;



        // Safety limit - stop after 10 pages (10,000 contracts)

        if (allResults.length >= 10000) break;

      }



      if (allResults.length > 0) {

        const dates = [...new Set(allResults.map((opt: any) => opt.expiration_date as string))].sort() as string[];

        setExpirationDates(dates);

        if (dates.length > 0) {

          setSelectedExpiration(dates[0] as string);

          return dates[0];

        }

      } else {

        setError('No options contracts found for ' + symbol);

      }

    } catch (error) {

      console.error('Error fetching expiration dates:', error);

      setError('Failed to fetch expiration dates');

    }

    return null;

  }, [symbol]);



  // Fetch option quotes with bid/ask from quotes endpoint

  const fetchOptionQuote = async (optionSymbol: string): Promise<Partial<OptionContract>> => {

    try {

      // Primary: Get bid/ask from quotes endpoint (this works reliably)

      const quotesUrl = `https://api.polygon.io/v3/quotes/${optionSymbol}?limit=1&order=desc&apikey=${POLYGON_API_KEY}`;

      const quotesResponse = await fetch(quotesUrl);

      const quotesData = await quotesResponse.json();



      const result: Partial<OptionContract> = {

        bid: 0,

        ask: 0,

        last_price: 0,

        volume: 0,

        open_interest: 0,

        delta: 0,

        theta: 0,

        gamma: 0,

        vega: 0,

      };



      // Get bid/ask from quotes

      if (quotesData.status === 'OK' && quotesData.results && quotesData.results.length > 0) {

        const quote = quotesData.results[0];

        result.bid = quote.bid_price || 0;

        result.ask = quote.ask_price || 0;

        result.last_price = (result.bid && result.ask) ? (result.bid + result.ask) / 2 : 0;

        result.volume = 0; // Will get from snapshot only

      }



      // Get greeks and OI from snapshot - FIXED: Include underlying symbol in URL

      const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${symbol}/${optionSymbol}?apikey=${POLYGON_API_KEY}`;

      const snapshotResponse = await fetch(snapshotUrl);

      const snapshotData = await snapshotResponse.json();





      if (snapshotData.status === 'OK' && snapshotData.results) {

        const snap = snapshotData.results;



        result.open_interest = snap.open_interest || 0;

        result.delta = snap.greeks?.delta || 0;

        result.theta = snap.greeks?.theta || 0;

        result.gamma = snap.greeks?.gamma || 0;

        result.vega = snap.greeks?.vega || 0;

        result.implied_volatility = snap.implied_volatility || 0;



        // Use snapshot volume if available (more accurate)

        if (snap.day?.volume) {

          result.volume = snap.day.volume;

        }



        // Get change data from day info

        if (snap.day?.change_percent !== undefined) {

          result.change_percent = snap.day.change_percent;

        }

        if (snap.day?.previous_close !== undefined) {

          result.previous_close = snap.day.previous_close;

        }

      } else {

        console.warn(`No snapshot results for ${optionSymbol}:`, snapshotData);

      }



      return result;

    } catch (error) {

      console.error(`Error fetching quote for ${optionSymbol}:`, error);

      return {};

    }

  };



  // Fetch options chain for selected expiration

  const fetchOptionsChain = useCallback(async () => {

    if (!selectedExpiration || !stockPrice) {

      return;

    }



    setLoading(true);

    setError(null);

    try {

      // Fetch a wide range (100%) so we can filter client-side without refetching

      const lowerBound = Math.floor(stockPrice * 0.0);

      const upperBound = Math.ceil(stockPrice * 2.0);



      const url = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${selectedExpiration}&strike_price.gte=${lowerBound}&strike_price.lte=${upperBound}&limit=1000&apikey=${POLYGON_API_KEY}`;

      const response = await fetch(url);

      const data = await response.json();





      if (data.results && data.results.length > 0) {

        const calls: OptionContract[] = [];

        const puts: OptionContract[] = [];





        // Separate calls and puts

        data.results.forEach((contract: any) => {

          const option: OptionContract = {

            ticker: contract.ticker,

            strike_price: contract.strike_price,

            contract_type: contract.contract_type,

            expiration_date: contract.expiration_date,

          };



          if (contract.contract_type === 'call') {

            calls.push(option);

          } else {

            puts.push(option);

          }

        });



        // Sort by strike price

        calls.sort((a, b) => a.strike_price - b.strike_price);

        puts.sort((a, b) => a.strike_price - b.strike_price);





        // Get unique strikes

        const allStrikes = [...new Set([...calls, ...puts].map(o => o.strike_price))].sort((a, b) => a - b);



        // Find the closest strike to current price (ATM)

        const atmIndex = allStrikes.findIndex(strike => strike >= stockPrice);

        const startIndex = Math.max(0, atmIndex - 10);

        const endIndex = Math.min(allStrikes.length, atmIndex + 40);

        const initialStrikes = allStrikes.slice(startIndex, endIndex);





        // Fetch quotes in small batches to avoid rate limiting

        const callsToFetch = calls.filter(c => initialStrikes.includes(c.strike_price));

        const putsToFetch = puts.filter(p => initialStrikes.includes(p.strike_price));

        const allToFetch = [...callsToFetch, ...putsToFetch];



        const BATCH_SIZE = 5; // Smaller batches to avoid overwhelming API

        const DELAY_MS = 200; // Delay between batches



        for (let i = 0; i < allToFetch.length; i += BATCH_SIZE) {

          const batch = allToFetch.slice(i, i + BATCH_SIZE);



          await Promise.all(

            batch.map(async (option) => {

              const quote = await fetchOptionQuote(option.ticker);

              Object.assign(option, quote);

            })

          );



          // Update UI progressively

          setCallOptions([...calls]);

          setPutOptions([...puts]);

          setLastUpdate(new Date());



          // Delay between batches to avoid rate limiting

          if (i + BATCH_SIZE < allToFetch.length) {

            await new Promise(resolve => setTimeout(resolve, DELAY_MS));

          }

        }



      } else {

        console.warn('No options found in response');

        setError('No options contracts found for selected expiration');

      }

    } catch (error) {

      console.error('Error fetching options chain:', error);

      setError('Failed to load options chain');

    } finally {

      setLoading(false);

    }

  }, [symbol, selectedExpiration, stockPrice, otmRange]);



  // Initialize - load everything on mount

  useEffect(() => {

    const initializeData = async () => {

      setLoading(true);

      setError(null);



      // Step 1: Get stock price

      const price = await fetchStockPrice();

      if (!price) {

        setLoading(false);

        return;

      }



      // Step 2: Get expiration dates

      const firstExpiration = await fetchExpirationDates();

      if (!firstExpiration) {

        setLoading(false);

        return;

      }



      // Step 3: Load options chain (will be triggered by selectedExpiration change)

      setLoading(false);

    };



    initializeData();

  }, [symbol]); // Only depend on symbol



  // Fetch chain when expiration changes (not OTM range - that's client-side filtering)

  useEffect(() => {

    if (selectedExpiration && stockPrice > 0) {

      fetchOptionsChain();

    }

  }, [selectedExpiration, stockPrice]);



  // Get all unique strikes filtered by OTM range (client-side filtering)

  const otmLowerBound = stockPrice * (1 - otmRange / 100);

  const otmUpperBound = stockPrice * (1 + otmRange / 100);

  const allStrikes = [...new Set([...callOptions, ...putOptions]

    .filter(o => o.strike_price >= otmLowerBound && o.strike_price <= otmUpperBound)

    .map(o => o.strike_price))].sort((a, b) => a - b);



  // Find the closest strike to current stock price

  const closestStrike = allStrikes.reduce((prev, curr) => {

    return Math.abs(curr - stockPrice) < Math.abs(prev - stockPrice) ? curr : prev;

  }, allStrikes[0] || 0);



  // Helper to check if strike is ITM

  const isITM = (strike: number, type: 'call' | 'put') => {

    if (type === 'call') return stockPrice > strike;

    return stockPrice < strike;

  };



  // Helper to check if strike is ATM (only the closest strike)

  const isATM = (strike: number) => {

    return strike === closestStrike;

  };



  // Black-Scholes probability calculation methods

  const normalCDF = (x: number): number => {

    const erf = (x: number): number => {

      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;

      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

      const sign = x >= 0 ? 1 : -1;

      x = Math.abs(x);

      const t = 1.0 / (1.0 + p * x);

      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

      return sign * y;

    };

    return 0.5 * (1 + erf(x / Math.sqrt(2)));

  };



  const calculateD2 = (S: number, K: number, r: number, sigma: number, T: number): number => {

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));

    return d1 - sigma * Math.sqrt(T);

  };



  const chanceOfProfitSellCall = (S: number, K: number, r: number, sigma: number, T: number): number => {

    const d2 = calculateD2(S, K, r, sigma, T);

    return (1 - normalCDF(d2)) * 100;

  };



  const chanceOfProfitSellPut = (S: number, K: number, r: number, sigma: number, T: number): number => {

    const d2 = calculateD2(S, K, r, sigma, T);

    return normalCDF(d2) * 100;

  };



  const findStrikeForProbability = (S: number, r: number, sigma: number, T: number, targetProb: number, isCall: boolean): number => {

    if (isCall) {

      let low = S + 0.01, high = S * 1.50;

      for (let i = 0; i < 50; i++) {

        const mid = (low + high) / 2;

        const prob = chanceOfProfitSellCall(S, mid, r, sigma, T);

        if (Math.abs(prob - targetProb) < 0.1) return mid;

        if (prob < targetProb) low = mid; else high = mid;

      }

      return (low + high) / 2;

    } else {

      let low = S * 0.50, high = S - 0.01;

      for (let i = 0; i < 50; i++) {

        const mid = (low + high) / 2;

        const prob = chanceOfProfitSellPut(S, mid, r, sigma, T);

        if (Math.abs(prob - targetProb) < 0.1) return mid;

        if (prob < targetProb) high = mid; else low = mid;

      }

      return (low + high) / 2;

    }

  };



  // Calculate 80% and 90% probability strikes

  const getProbabilityStrikes = () => {

    if (!selectedExpiration || stockPrice <= 0 || callOptions.length === 0 || putOptions.length === 0) {

      return { call80: null, put80: null, call90: null, put90: null };

    }



    try {

      // Calculate average IV from ATM options

      const atmOptions = [...callOptions, ...putOptions].filter(opt => {

        const pctDiff = Math.abs((opt.strike_price - stockPrice) / stockPrice);

        return pctDiff < 0.05 && opt.implied_volatility && opt.implied_volatility > 0;

      });



      if (atmOptions.length === 0) return { call80: null, put80: null, call90: null, put90: null };



      const avgIV = atmOptions.reduce((sum, opt) => sum + (opt.implied_volatility || 0), 0) / atmOptions.length;



      // Calculate time to expiration

      const expiryDate = new Date(selectedExpiration);

      const now = new Date();

      const daysToExpiry = Math.max(1, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      const T = daysToExpiry / 365;



      // Risk-free rate (approximate)

      const r = 0.0387;



      // Find theoretical strikes for 80% and 90% probabilities

      const call80Theoretical = findStrikeForProbability(stockPrice, r, avgIV, T, 80, true);

      const put80Theoretical = findStrikeForProbability(stockPrice, r, avgIV, T, 80, false);

      const call90Theoretical = findStrikeForProbability(stockPrice, r, avgIV, T, 90, true);

      const put90Theoretical = findStrikeForProbability(stockPrice, r, avgIV, T, 90, false);



      // Find closest actual strikes

      const findClosestStrike = (theoretical: number) => {

        return allStrikes.reduce((prev, curr) => {

          return Math.abs(curr - theoretical) < Math.abs(prev - theoretical) ? curr : prev;

        }, allStrikes[0] || 0);

      };



      return {

        call80: findClosestStrike(call80Theoretical),

        put80: findClosestStrike(put80Theoretical),

        call90: findClosestStrike(call90Theoretical),

        put90: findClosestStrike(put90Theoretical)

      };

    } catch (error) {

      console.error('Error calculating probability strikes:', error);

      return { call80: null, put80: null, call90: null, put90: null };

    }

  };



  const probabilityStrikes = getProbabilityStrikes();



  // Helper to check if strike is a probability marker

  const getProbabilityType = (strike: number): { type: '80call' | '80put' | '90call' | '90put' | null } => {

    if (strike === probabilityStrikes.call80) return { type: '80call' };

    if (strike === probabilityStrikes.put80) return { type: '80put' };

    if (strike === probabilityStrikes.call90) return { type: '90call' };

    if (strike === probabilityStrikes.put90) return { type: '90put' };

    return { type: null };

  };



  // Watchlist functions

  const addToWatchlist = (option: OptionContract) => {



    const entryPrice = ((option.bid || 0) + (option.ask || 0)) / 2;



    const watchlistItem: WatchlistOption = {

      id: `${option.ticker}-${Date.now()}`,

      ticker: option.ticker,

      symbol: symbol,

      strike: option.strike_price,

      type: option.contract_type,

      expiration: option.expiration_date,

      bid: option.bid || 0,

      ask: option.ask || 0,

      lastPrice: option.last_price || 0,

      delta: option.delta || 0,

      theta: option.theta || 0,

      implied_volatility: option.implied_volatility || 0,

      addedAt: new Date(),

      entryPrice: entryPrice,

      stockPrice: stockPrice // Store current stock price with watchlist item

    };



    setWatchlist(prev => [...prev, watchlistItem]);



    // Save to localStorage

    const saved = localStorage.getItem('optionsWatchlist');

    const existing = saved ? JSON.parse(saved) : [];

    localStorage.setItem('optionsWatchlist', JSON.stringify([...existing, watchlistItem]));

  };



  const removeFromWatchlist = (id: string) => {

    setWatchlist(prev => prev.filter(item => item.id !== id));



    // Update localStorage

    const saved = localStorage.getItem('optionsWatchlist');

    if (saved) {

      const existing = JSON.parse(saved);

      localStorage.setItem('optionsWatchlist', JSON.stringify(existing.filter((item: WatchlistOption) => item.id !== id)));

    }

  };



  // Drag and drop handlers for reordering watchlist

  const handleDragStart = (e: React.DragEvent, itemId: string) => {

    setDraggedItem(itemId);

    e.dataTransfer.effectAllowed = 'move';

  };



  const handleDragOver = (e: React.DragEvent) => {

    e.preventDefault();

    e.dataTransfer.dropEffect = 'move';

  };



  const handleDrop = (e: React.DragEvent, targetId: string, type: 'call' | 'put') => {

    e.preventDefault();

    if (!draggedItem || draggedItem === targetId) {

      setDraggedItem(null);

      return;

    }



    const draggedIndex = watchlist.findIndex(item => item.id === draggedItem);

    const targetIndex = watchlist.findIndex(item => item.id === targetId);



    if (draggedIndex === -1 || targetIndex === -1) {

      setDraggedItem(null);

      return;

    }



    // Only allow reordering within the same type (calls with calls, puts with puts)

    if (watchlist[draggedIndex].type !== type) {

      setDraggedItem(null);

      return;

    }



    // Create new array with reordered items

    const newWatchlist = [...watchlist];

    const [removed] = newWatchlist.splice(draggedIndex, 1);

    newWatchlist.splice(targetIndex, 0, removed);



    setWatchlist(newWatchlist);

    localStorage.setItem('optionsWatchlist', JSON.stringify(newWatchlist));

    setDraggedItem(null);

  };



  const handleDragEnd = () => {

    setDraggedItem(null);

  };



  // Black-Scholes calculation for P/L table

  const calculateBSPrice = (S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number => {

    if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S);



    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));

    const d2 = d1 - sigma * Math.sqrt(T);



    if (isCall) {

      return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);

    } else {

      return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);

    }

  };



  // Get P/L color for table cells

  const getPLColor = (pl: number): string => {

    if (pl > 200) return 'bg-green-800 text-white';

    if (pl > 150) return 'bg-green-700 text-white';

    if (pl > 100) return 'bg-green-600 text-white';

    if (pl > 75) return 'bg-green-500 text-white';

    if (pl > 50) return 'bg-green-400 text-black';

    if (pl > 25) return 'bg-green-300 text-black';

    if (pl > 10) return 'bg-green-200 text-black';

    if (pl > 0) return 'bg-green-100 text-black';

    if (pl > -5) return 'bg-yellow-200 text-black';

    if (pl > -10) return 'bg-orange-200 text-black';

    if (pl > -15) return 'bg-red-200 text-black';

    if (pl > -25) return 'bg-red-300 text-white';

    if (pl > -40) return 'bg-red-400 text-white';

    if (pl > -60) return 'bg-red-500 text-white';

    if (pl > -80) return 'bg-red-600 text-white';

    if (pl > -120) return 'bg-red-700 text-white';

    return 'bg-red-800 text-white';

  };



  const isInWatchlist = (ticker: string) => {

    return watchlist.some(item => item.ticker === ticker);

  };



  // Load watchlist from localStorage on mount

  useEffect(() => {

    const saved = localStorage.getItem('optionsWatchlist');

    if (saved) {

      try {

        const parsed = JSON.parse(saved);

        // Migrate old items that don't have delta/theta/entryPrice/stockPrice

        const migrated = parsed.map((item: WatchlistOption) => ({

          ...item,

          delta: item.delta || 0,

          theta: item.theta || 0,

          entryPrice: item.entryPrice || ((item.bid + item.ask) / 2),

          stockPrice: item.stockPrice || 0 // Add stockPrice with fallback to 0

        }));

        setWatchlist(migrated);

      } catch (e) {

        console.error('Error loading watchlist:', e);

      }

    }

  }, []);



  return (

    <div className="h-full flex flex-col bg-black text-white">

      {showCalculator ? (

        <ChainCalculator initialSymbol={symbol} onClose={() => setShowCalculator(false)} />

      ) : (

        <>

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

                Options Chain

              </h1>

            </div>

          </div>

          {/* Enhanced Header */}

          <div className="flex-shrink-0 border-b border-orange-900/30 bg-black shadow-lg">

            {/* Top Bar */}

            <div className="px-4 pt-4 pb-3">

              {/* Row 1: Search Bar, Price, Expiration, and Actions */}

              <div className="flex items-center justify-between mb-4">

                {/* Left: Search Bar, Spot Price, and Expiration */}

                <div className="flex items-center gap-4">

                  {/* Liquid-style Search Bar */}

                  <div className="search-bar-premium flex items-center space-x-2 px-3 py-2 rounded-md">

                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(128, 128, 128, 0.5)' }}>

                      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />

                      <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" />

                    </svg>

                    <input

                      type="text"

                      value={searchInput}

                      onChange={(e) => setSearchInput(e.target.value.toUpperCase())}

                      onKeyDown={(e) => {

                        if (e.key === 'Enter' && searchInput.trim()) {

                          setSymbol(searchInput.trim().toUpperCase());

                          setSelectedExpiration('');

                          setCallOptions([]);

                          setPutOptions([]);

                          setError(null);

                        }

                      }}

                      className="bg-transparent border-0 outline-none w-28 text-lg font-bold uppercase"

                      style={{

                        color: '#ffffff',

                        textShadow: '0 0 5px rgba(128, 128, 128, 0.2), 0 1px 2px rgba(0, 0, 0, 0.8)',

                        fontFamily: 'system-ui, -apple-system, sans-serif',

                        letterSpacing: '0.8px'

                      }}

                      placeholder="Search..."

                    />

                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: '#666' }}>

                      <path d="M12 5v14l7-7-7-7z" fill="currentColor" />

                    </svg>

                  </div>



                  {/* Spot Price */}

                  <div className="flex items-center gap-2">

                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgb(249, 115, 22)', textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>SPOT</span>

                    <span className="text-white font-bold text-xl tabular-nums">${stockPrice.toFixed(2)}</span>

                  </div>



                  {/* Expiration Selector */}

                  <div className="relative min-w-[200px]">

                    <select

                      value={selectedExpiration}

                      onChange={(e) => setSelectedExpiration(e.target.value)}

                      className="w-full rounded-lg px-5 py-3 text-base font-bold text-white focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all appearance-none cursor-pointer"

                      style={{

                        background: 'linear-gradient(145deg, #0a0a0a, #000000)',

                        border: '1px solid rgba(249, 115, 22, 0.3)',

                        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5)',

                        backdropFilter: 'blur(10px)'

                      }}

                      disabled={expirationDates.length === 0}

                    >

                      {expirationDates.length === 0 ? (

                        <option>Loading expirations...</option>

                      ) : (

                        expirationDates.map((date) => {

                          const daysUntil = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                          return (

                            <option key={date} value={date} className="bg-gray-900">

                              {date} ({daysUntil}d DTE)

                            </option>

                          );

                        })

                      )}

                    </select>

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">

                      <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />

                      </svg>

                    </div>

                  </div>



                  {/* OTM Range Selector */}

                  <div className="relative w-32">

                    <select

                      value={otmRange}

                      onChange={(e) => setOtmRange(Number(e.target.value))}

                      className="w-32 rounded-lg px-3 py-3 text-base font-bold text-white focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all appearance-none cursor-pointer"

                      style={{

                        background: 'linear-gradient(145deg, #0a0a0a, #000000)',

                        border: '1px solid rgba(249, 115, 22, 0.3)',

                        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5)',

                        backdropFilter: 'blur(10px)'

                      }}

                    >

                      <option value={2} className="bg-gray-900">±2% OTM</option>

                      <option value={3} className="bg-gray-900">±3% OTM</option>

                      <option value={5} className="bg-gray-900">±5% OTM</option>

                      <option value={10} className="bg-gray-900">±10% OTM</option>

                      <option value={15} className="bg-gray-900">±15% OTM</option>

                      <option value={20} className="bg-gray-900">±20% OTM</option>

                      <option value={30} className="bg-gray-900">±30% OTM</option>

                      <option value={50} className="bg-gray-900">±50% OTM</option>

                      <option value={80} className="bg-gray-900">±80% OTM</option>

                      <option value={100} className="bg-gray-900">±100% OTM</option>

                      <option value={200} className="bg-gray-900">±200% OTM</option>

                    </select>

                    <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">

                      <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />

                      </svg>

                    </div>

                  </div>



                  {/* Chain Filter Button */}

                  <div className="relative">

                    <button

                      onClick={() => setShowColumnFilter(!showColumnFilter)}

                      className="rounded-lg px-5 py-3 text-base font-bold text-white focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all cursor-pointer flex items-center gap-2"

                      style={{

                        background: 'linear-gradient(145deg, #0a0a0a, #000000)',

                        border: '1px solid rgba(249, 115, 22, 0.3)',

                        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5)',

                        backdropFilter: 'blur(10px)'

                      }}

                    >

                      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />

                      </svg>

                      Chain Filter

                    </button>



                    {/* Filter Dropdown Menu */}

                    {showColumnFilter && (

                      <div

                        className="absolute top-full right-0 mt-2 w-72 rounded-lg border border-orange-500/30 shadow-2xl z-50"

                        style={{

                          background: 'linear-gradient(145deg, #0f0f0f, #000000)',

                          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.9), 0 0 20px rgba(249, 115, 22, 0.2)'

                        }}

                      >

                        <div className="p-4">

                          <div className="text-orange-400 font-bold text-sm uppercase tracking-wider mb-3 pb-2 border-b border-gray-800">

                            Visible Columns

                          </div>

                          <div className="space-y-2.5">

                            {[

                              { key: 'watchlist', label: 'Watchlist Star' },

                              { key: 'openInterest', label: 'Open Interest (OI)' },

                              { key: 'volume', label: 'Volume (VOL)' },

                              { key: 'delta', label: 'Delta' },

                              { key: 'theta', label: 'Theta' },

                              { key: 'iv', label: 'Implied Volatility (IV)' },

                              { key: 'change', label: 'Change %' },

                              { key: 'breakeven', label: 'Breakeven %' },

                              { key: 'bid', label: 'Bid' },

                              { key: 'ask', label: 'Ask' }

                            ].map(({ key, label }) => (

                              <label

                                key={key}

                                className="flex items-center gap-3 cursor-pointer group hover:bg-gray-900/50 p-2 rounded transition-colors"

                              >

                                <input

                                  type="checkbox"

                                  checked={visibleColumns[key as keyof typeof visibleColumns]}

                                  onChange={(e) => setVisibleColumns(prev => ({ ...prev, [key]: e.target.checked }))}

                                  className="w-4 h-4 rounded border-2 border-gray-600 bg-gray-900 checked:bg-orange-500 checked:border-orange-500 focus:ring-2 focus:ring-orange-500/30 cursor-pointer"

                                />

                                <span className="text-white text-sm group-hover:text-orange-300 transition-colors">{label}</span>

                              </label>

                            ))}

                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-800 flex gap-2">

                            <button

                              onClick={() => setVisibleColumns({

                                openInterest: true,

                                volume: true,

                                delta: true,

                                theta: true,

                                iv: true,

                                change: true,

                                breakeven: true,

                                bid: true,

                                ask: true,

                                watchlist: true

                              })}

                              className="flex-1 px-3 py-2 text-xs font-bold text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"

                            >

                              SELECT ALL

                            </button>

                            <button

                              onClick={() => setShowColumnFilter(false)}

                              className="flex-1 px-3 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 rounded transition-colors"

                            >

                              CLOSE

                            </button>

                          </div>

                        </div>

                      </div>

                    )}

                  </div>



                  {/* Calculator Button */}

                  <button

                    onClick={() => setShowCalculator(!showCalculator)}

                    className="rounded-lg px-5 py-3 text-base font-bold text-white focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all cursor-pointer flex items-center gap-2"

                    style={{

                      background: 'linear-gradient(145deg, #0a0a0a, #000000)',

                      border: '1px solid rgba(249, 115, 22, 0.3)',

                      boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5)',

                      backdropFilter: 'blur(10px)'

                    }}

                  >

                    <TbCalculator className="w-[18px] h-[18px]" />

                    Calculator

                  </button>

                </div>



                {/* Right: Action Buttons */}

                <div className="flex items-center gap-2">

                  <button

                    onClick={() => setShowWatchlist(!showWatchlist)}

                    className={`px-4 py-3 rounded-lg transition-all duration-300 flex items-center gap-2 relative overflow-hidden group ${showWatchlist

                      ? 'scale-105'

                      : 'hover:scale-105'

                      }`}

                    style={{

                      background: 'linear-gradient(145deg, #0c1e3a, #081526)',

                      boxShadow: showWatchlist

                        ? 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -2px 4px rgba(30, 58, 95, 0.5), 0 6px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(249, 115, 22, 0.3)'

                        : 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -2px 4px rgba(30, 58, 95, 0.5), 0 4px 8px rgba(0, 0, 0, 0.4)',

                      border: showWatchlist ? '2px solid rgba(249, 115, 22, 0.6)' : '1px solid rgba(30, 58, 95, 0.5)',

                      backdropFilter: 'blur(10px)'

                    }}

                    title="Toggle Watchlist"

                  >

                    {/* Glossy overlay */}

                    <div

                      className="absolute inset-0 pointer-events-none"

                      style={{

                        background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 50%, rgba(0, 0, 0, 0.2) 100%)'

                      }}

                    />

                    <div className="relative z-10 flex items-center gap-2">

                      <TbEye className="w-[25px] h-[25px] text-orange-500 animate-pulse" style={{ filter: 'drop-shadow(0 0 4px rgba(249, 115, 22, 0.6))' }} />

                      <span className="text-base font-bold" style={{ color: 'rgb(255, 255, 255)', opacity: 1, textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' }}>WATCHLIST</span>

                      {watchlist.length > 0 && (

                        <span className="bg-orange-500 text-black text-sm rounded-full px-2 py-1 font-bold min-w-[24px] text-center" style={{ boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)' }}>

                          {watchlist.length}

                        </span>

                      )}

                    </div>

                  </button>



                  <button

                    onClick={() => {

                      fetchStockPrice();

                      fetchOptionsChain();

                    }}

                    disabled={loading}

                    className="px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-cyan-500/50 hover:bg-gray-800 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"

                    title="Refresh Data"

                  >

                    <TbRefresh className={`w-[25px] h-[25px] text-cyan-400 ${loading ? 'animate-spin' : ''}`} />

                    <span className="text-base font-bold text-white">REFRESH</span>

                  </button>

                </div>

              </div>



              {/* Row 2: Removed - Now Empty */}

              <div className="mb-3 pb-3 border-b border-gray-800/30">

              </div>



            </div>



            {/* Column Headers */}

            {!showWatchlist && (

              <div className="grid grid-cols-[1fr_auto_1fr] gap-0 text-base font-bold border-t border-gray-800/50 bg-gray-950/50 backdrop-blur-sm">

                {/* Calls Header */}

                <div className={`grid gap-2 px-3 py-3 border-r border-gray-800/50 bg-gradient-to-r from-green-900/30 via-green-900/10 to-transparent`}

                  style={{ gridTemplateColumns: `repeat(${Object.values(visibleColumns).filter(Boolean).length}, minmax(0, 1fr))` }}>

                  {visibleColumns.watchlist && <div className="text-center text-green-400/80 text-[10px] uppercase tracking-wider"></div>}

                  {visibleColumns.openInterest && <div className="text-right text-green-400 uppercase tracking-wide">OI</div>}

                  {visibleColumns.volume && <div className="text-right text-green-400 uppercase tracking-wide">VOL</div>}

                  {visibleColumns.delta && <div className="text-right text-green-400 uppercase tracking-wide">DELTA</div>}

                  {visibleColumns.theta && <div className="text-right text-green-400 uppercase tracking-wide">THETA</div>}

                  {visibleColumns.iv && <div className="text-right text-green-400 uppercase tracking-wide">IV</div>}

                  {visibleColumns.change && <div className="text-right text-green-400 uppercase tracking-wide">CHG%</div>}

                  {visibleColumns.breakeven && <div className="text-right text-green-400 uppercase tracking-wide">BRK%</div>}

                  {visibleColumns.bid && <div className="text-right text-green-400 uppercase tracking-wide">BID</div>}

                  {visibleColumns.ask && <div className="text-right text-green-400 uppercase tracking-wide">ASK</div>}

                </div>



                {/* Strike Header */}

                <div className="px-4 py-3 text-center text-orange-400 border-r border-gray-800/50 bg-gray-900/80 min-w-[90px] uppercase tracking-wider">

                  STRIKE

                </div>



                {/* Puts Header */}

                <div className={`grid gap-2 px-3 py-3 bg-gradient-to-l from-red-900/30 via-red-900/10 to-transparent`}

                  style={{ gridTemplateColumns: `repeat(${Object.values(visibleColumns).filter(Boolean).length}, minmax(0, 1fr))` }}>

                  {visibleColumns.ask && <div className="text-left text-red-400 uppercase tracking-wide">ASK</div>}

                  {visibleColumns.bid && <div className="text-left text-red-400 uppercase tracking-wide">BID</div>}

                  {visibleColumns.breakeven && <div className="text-left text-red-400 uppercase tracking-wide">BRK%</div>}

                  {visibleColumns.change && <div className="text-left text-red-400 uppercase tracking-wide">CHG%</div>}

                  {visibleColumns.iv && <div className="text-left text-red-400 uppercase tracking-wide">IV</div>}

                  {visibleColumns.theta && <div className="text-left text-red-400 uppercase tracking-wide">THETA</div>}

                  {visibleColumns.delta && <div className="text-left text-red-400 uppercase tracking-wide">DELTA</div>}

                  {visibleColumns.volume && <div className="text-left text-red-400 uppercase tracking-wide">VOL</div>}

                  {visibleColumns.openInterest && <div className="text-left text-red-400 uppercase tracking-wide">OI</div>}

                  {visibleColumns.watchlist && <div className="text-center text-red-400/80 text-[10px] uppercase tracking-wider"></div>}

                </div>

              </div>

            )}

          </div>



          {/* Options Chain Body */}

          <div className="flex-1 overflow-y-auto custom-scrollbar">

            {error ? (

              <div className="flex items-center justify-center h-full">

                <div className="text-center p-4">

                  <div className="text-red-400 text-sm mb-2">⚠️ {error}</div>

                  <button

                    onClick={() => {

                      setError(null);

                      fetchStockPrice();

                      fetchExpirationDates();

                    }}

                    className="btn-3d-carved px-4 py-2 text-xs"

                  >

                    TRY AGAIN

                  </button>

                </div>

              </div>

            ) : loading && callOptions.length === 0 ? (

              <div className="flex items-center justify-center h-full">

                <div className="text-center">

                  <TbRefresh className="w-8 h-8 animate-spin mx-auto mb-2 text-cyan-400" />

                  <div className="text-sm text-gray-400">Loading options chain...</div>

                </div>

              </div>

            ) : allStrikes.length === 0 ? (

              <div className="flex items-center justify-center h-full">

                <div className="text-center text-gray-400">

                  No options data available

                </div>

              </div>

            ) : showWatchlist ? (

              /* Watchlist View */

              <div className="p-4">

                {watchlist.length === 0 ? (

                  <div className="flex flex-col items-center justify-center h-64 text-center">

                    <TbStar className="w-16 h-16 text-gray-700 mb-4" />

                    <h3 className="text-lg font-bold text-white mb-2">No Options in Watchlist</h3>

                    <p className="text-sm text-white">Click the star icon next to any option to add it to your watchlist</p>

                  </div>

                ) : (

                  <div className="space-y-3">

                    <div className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center justify-end">

                      {watchlist.length > 0 && (

                        <button

                          onClick={() => {

                            if (confirm('Clear all watchlist items?')) {

                              setWatchlist([]);

                              localStorage.removeItem('optionsWatchlist');

                            }

                          }}

                          className="text-red-400 hover:text-red-300 text-xs"

                        >

                          Clear All

                        </button>

                      )}

                    </div>



                    {/* Split Layout: Calls on Left, Puts on Right */}

                    <div className="grid grid-cols-2 gap-3">

                      {/* CALLS Column */}

                      <div className="space-y-2">

                        <div className="text-base font-bold text-green-400 uppercase tracking-wider border-b border-green-900/30 pb-1"

                          style={{

                            textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 0 10px rgba(16, 185, 129, 0.3)',

                            filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))'

                          }}>

                          Calls ({watchlist.filter(w => w.type === 'call').length})

                        </div>

                        {watchlist.filter(item => item.type === 'call').map((item) => {

                          const currentPrice = (item.bid + item.ask) / 2;

                          const plPercent = ((currentPrice - item.entryPrice) / item.entryPrice) * 100;

                          const isProfit = plPercent >= 0;



                          return (

                            <div

                              key={item.id}

                              draggable

                              onDragStart={(e) => handleDragStart(e, item.id)}

                              onDragOver={handleDragOver}

                              onDrop={(e) => handleDrop(e, item.id, 'call')}

                              onDragEnd={handleDragEnd}

                              className={`p-3 rounded-lg relative overflow-hidden transition-all hover:scale-[1.02] mb-4 cursor-move ${draggedItem === item.id ? 'opacity-50 scale-95' : ''

                                }`}

                              style={{

                                background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.25) 0%, rgba(4, 120, 87, 0.2) 50%, rgba(6, 78, 59, 0.25) 100%)',

                                boxShadow: `

                              inset 0 1px 2px rgba(16, 185, 129, 0.2),

                              inset 0 -1px 2px rgba(0, 0, 0, 0.4),

                              0 4px 8px rgba(0, 0, 0, 0.5),

                              0 1px 0 rgba(16, 185, 129, 0.15)

                            `,

                                border: '1px solid rgba(16, 185, 129, 0.2)',

                                backdropFilter: 'blur(10px)',

                                marginBottom: '1rem'

                              }}

                            >

                              {/* Glossy overlay */}

                              <div

                                className="absolute inset-0 pointer-events-none"

                                style={{

                                  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 50%, rgba(0, 0, 0, 0.15) 100%)'

                                }}

                              />

                              {/* Row 1: Ticker, Strike Price, Call/Put Type, Expiration Date, Purchase Price, P/L */}

                              <div className="flex items-center justify-between mb-2 relative z-10">

                                <div className="flex items-center gap-2">

                                  <span className="text-white font-bold text-lg">{item.symbol}</span>

                                  <span className="text-orange-400 font-bold text-lg">${item.strike}</span>

                                  <span className="text-green-400 font-bold text-base">CALL</span>

                                  <span className="text-white text-base">{item.expiration}</span>

                                  <div className="flex items-center gap-1.5 ml-3">

                                    <span className="text-white text-sm uppercase font-bold">Entry</span>

                                    <span className="text-white font-bold font-mono text-lg">

                                      ${item.entryPrice.toFixed(2)}

                                    </span>

                                  </div>

                                  <div className="flex items-center gap-1.5">

                                    <span className="text-white text-sm uppercase font-bold">P/L</span>

                                    <span className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>

                                      {isProfit ? '+' : ''}{plPercent.toFixed(2)}%

                                    </span>

                                  </div>

                                </div>

                                <div className="flex items-center gap-2">

                                  <button

                                    onClick={() => setCalculatorModalOpen(item.id)}

                                    className="text-cyan-400 hover:text-cyan-300 transition-colors"

                                    title="Options Calculator"

                                  >

                                    <TbCalculator className="w-6 h-6" />

                                  </button>

                                  <button

                                    onClick={() => removeFromWatchlist(item.id)}

                                    className="text-orange-400 hover:text-orange-300 transition-colors"

                                    title="Remove from watchlist"

                                  >

                                    <TbStarFilled className="w-5 h-5" />

                                  </button>

                                </div>

                              </div>



                              {/* Row 2: Bid/Ask, Delta, Theta */}

                              <div className="flex items-center gap-4 relative z-10">

                                <div className="flex items-center gap-1.5">

                                  <span className="text-white text-sm uppercase font-bold">Bid/Ask:</span>

                                  <span

                                    className="font-bold font-mono text-base text-green-400 cursor-pointer hover:underline"

                                    onDoubleClick={() => handlePriceDoubleClick(item)}

                                    title="Double-click to view price chart"

                                  >

                                    ${item.bid.toFixed(2)} / ${item.ask.toFixed(2)}

                                  </span>

                                </div>

                                <div className="flex items-center gap-1.5">

                                  <span className="text-purple-400 text-sm uppercase font-bold">Delta:</span>

                                  <span className="text-purple-400 font-bold font-mono text-base">

                                    {typeof item.delta === 'number' ? item.delta.toFixed(4) : '—'}

                                  </span>

                                </div>

                                <div className="flex items-center gap-1.5">

                                  <span className="text-red-400 text-sm uppercase font-bold">Theta:</span>

                                  <span className="text-red-400 font-bold font-mono text-base">

                                    {typeof item.theta === 'number' ? item.theta.toFixed(4) : '—'}

                                  </span>

                                </div>

                                <div className="flex items-center gap-1.5">

                                  <span className="text-blue-400 text-sm uppercase font-bold">IV:</span>

                                  <span className="text-blue-400 font-bold font-mono text-base">

                                    {typeof item.implied_volatility === 'number' && item.implied_volatility > 0 ? (item.implied_volatility * 100).toFixed(0) + '%' : '—'}

                                  </span>

                                </div>

                              </div>

                            </div>

                          );

                        })}

                        {watchlist.filter(w => w.type === 'call').length === 0 && (

                          <div className="text-center text-gray-500 text-sm py-4">No calls in watchlist</div>

                        )}

                      </div>



                      {/* PUTS Column */}

                      <div className="space-y-2">

                        <div className="text-base font-bold text-red-400 uppercase tracking-wider border-b border-red-900/30 pb-1"

                          style={{

                            textShadow: '0 2px 4px rgba(0, 0, 0, 0.8), 0 0 10px rgba(248, 113, 113, 0.3)',

                            filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))'

                          }}>

                          Puts ({watchlist.filter(w => w.type === 'put').length})

                        </div>

                        {watchlist.filter(item => item.type === 'put').map((item) => {

                          const currentPrice = (item.bid + item.ask) / 2;

                          const plPercent = ((currentPrice - item.entryPrice) / item.entryPrice) * 100;

                          const isProfit = plPercent >= 0;



                          return (

                            <div

                              key={item.id}

                              draggable

                              onDragStart={(e) => handleDragStart(e, item.id)}

                              onDragOver={handleDragOver}

                              onDrop={(e) => handleDrop(e, item.id, 'put')}

                              onDragEnd={handleDragEnd}

                              className={`p-3 rounded-lg relative overflow-hidden transition-all hover:scale-[1.02] mb-4 cursor-move ${draggedItem === item.id ? 'opacity-50 scale-95' : ''

                                }`}

                              style={{

                                background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.25) 0%, rgba(185, 28, 28, 0.2) 50%, rgba(127, 29, 29, 0.25) 100%)',

                                boxShadow: `

                              inset 0 1px 2px rgba(248, 113, 113, 0.2),

                              inset 0 -1px 2px rgba(0, 0, 0, 0.4),

                              0 4px 8px rgba(0, 0, 0, 0.5),

                              0 1px 0 rgba(248, 113, 113, 0.15)

                            `,

                                border: '1px solid rgba(248, 113, 113, 0.2)',

                                backdropFilter: 'blur(10px)',

                                marginBottom: '1rem'

                              }}

                            >

                              {/* Glossy overlay */}

                              <div

                                className="absolute inset-0 pointer-events-none"

                                style={{

                                  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 50%, rgba(0, 0, 0, 0.15) 100%)'

                                }}

                              />

                              {/* Row 1: Ticker, Strike Price, Call/Put Type, Expiration Date, Purchase Price, P/L */}

                              <div className="flex items-center justify-between mb-2 relative z-10">

                                <div className="flex items-center gap-2">

                                  <span className="text-white font-bold text-lg">{item.symbol}</span>

                                  <span className="text-orange-400 font-bold text-lg">${item.strike}</span>

                                  <span className="text-red-400 font-bold text-base">PUT</span>

                                  <span className="text-white text-base">{item.expiration}</span>

                                  <div className="flex items-center gap-1.5 ml-3">

                                    <span className="text-white text-sm uppercase font-bold">Entry:</span>

                                    <span className="text-white font-bold font-mono text-lg">

                                      ${item.entryPrice.toFixed(2)}

                                    </span>

                                  </div>

                                  <div className="flex items-center gap-1.5">

                                    <span className="text-white text-sm uppercase font-bold">P/L:</span>

                                    <span className={`text-lg font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>

                                      {isProfit ? '+' : ''}{plPercent.toFixed(2)}%

                                    </span>

                                  </div>

                                </div>

                                <div className="flex items-center gap-2">

                                  <button

                                    onClick={() => setCalculatorModalOpen(item.id)}

                                    className="text-cyan-400 hover:text-cyan-300 transition-colors"

                                    title="Options Calculator"

                                  >

                                    <TbCalculator className="w-6 h-6" />

                                  </button>

                                  <button

                                    onClick={() => removeFromWatchlist(item.id)}

                                    className="text-orange-400 hover:text-orange-300 transition-colors"

                                    title="Remove from watchlist"

                                  >

                                    <TbStarFilled className="w-5 h-5" />

                                  </button>

                                </div>

                              </div>



                              {/* Row 2: Bid/Ask, Delta, Theta */}

                              <div className="flex items-center gap-4 relative z-10">

                                <div className="flex items-center gap-1.5">

                                  <span className="text-white text-sm uppercase font-bold">Bid/Ask:</span>

                                  <span

                                    className="font-bold font-mono text-base text-red-400 cursor-pointer hover:underline"

                                    onDoubleClick={() => handlePriceDoubleClick(item)}

                                    title="Double-click to view price chart"

                                  >

                                    ${item.bid.toFixed(2)} / ${item.ask.toFixed(2)}

                                  </span>

                                </div>

                                <div className="flex items-center gap-1.5">

                                  <span className="text-purple-400 text-sm uppercase font-bold">Delta:</span>

                                  <span className="text-purple-400 font-bold font-mono text-base">

                                    {typeof item.delta === 'number' ? item.delta.toFixed(4) : '—'}

                                  </span>

                                </div>

                                <div className="flex items-center gap-1.5">

                                  <span className="text-red-400 text-sm uppercase font-bold">Theta:</span>

                                  <span className="text-red-400 font-bold font-mono text-base">

                                    {typeof item.theta === 'number' ? item.theta.toFixed(4) : '—'}

                                  </span>

                                </div>

                                <div className="flex items-center gap-1.5">

                                  <span className="text-blue-400 text-sm uppercase font-bold">IV:</span>

                                  <span className="text-blue-400 font-bold font-mono text-base">

                                    {typeof item.implied_volatility === 'number' && item.implied_volatility > 0 ? (item.implied_volatility * 100).toFixed(0) + '%' : '—'}

                                  </span>

                                </div>

                              </div>

                            </div>

                          );

                        })}

                        {watchlist.filter(w => w.type === 'put').length === 0 && (

                          <div className="text-center text-gray-500 text-sm py-4">No puts in watchlist</div>

                        )}

                      </div>

                    </div>

                  </div>

                )}

              </div>

            ) : (

              <div className="divide-y divide-gray-900/50">

                {allStrikes.map((strike) => {

                  const call = callOptions.find(c => c.strike_price === strike);

                  const put = putOptions.find(p => p.strike_price === strike);

                  const callITM = isITM(strike, 'call');

                  const putITM = isITM(strike, 'put');

                  const atm = isATM(strike);



                  return (

                    <div

                      key={strike}

                      className={`grid grid-cols-[1fr_auto_1fr] gap-0 hover:bg-gray-900/30 transition-all ${atm ? 'bg-orange-900/10 border-y border-orange-900/20' : ''

                        }`}

                    >

                      {/* Call Option */}

                      <div className={`grid gap-2 px-3 py-3 text-base border-r border-gray-800/50 ${getProbabilityType(strike).type === '80call' ? 'bg-green-900/30' :

                        getProbabilityType(strike).type === '90call' ? 'bg-lime-900/30' :

                          callITM ? 'bg-green-950/20' : 'bg-transparent'

                        }`}

                        style={{ gridTemplateColumns: `repeat(${Object.values(visibleColumns).filter(Boolean).length}, minmax(0, 1fr))` }}>

                        {visibleColumns.watchlist && (

                          <div className="flex items-center justify-center">

                            {call && (

                              <button

                                onClick={() => isInWatchlist(call.ticker) ? removeFromWatchlist(watchlist.find(w => w.ticker === call.ticker)?.id || '') : addToWatchlist(call)}

                                className="text-white hover:text-orange-400 transition-colors"

                                title={isInWatchlist(call.ticker) ? 'Remove from watchlist' : 'Add to watchlist'}

                              >

                                {isInWatchlist(call.ticker) ? (

                                  <TbStarFilled className="w-4 h-4 text-orange-400" />

                                ) : (

                                  <TbStar className="w-4 h-4" />

                                )}

                              </button>

                            )}

                          </div>

                        )}

                        {visibleColumns.openInterest && (

                          <div className="text-right text-white font-mono">

                            {call?.open_interest ? call.open_interest.toLocaleString() : '—'}

                          </div>

                        )}

                        {visibleColumns.volume && (

                          <div className="text-right text-white font-mono">

                            {call?.volume ? call.volume.toLocaleString() : '—'}

                          </div>

                        )}

                        {visibleColumns.delta && (

                          <div className="text-right text-white font-mono">

                            {call?.delta ? call.delta.toFixed(3) : '—'}

                          </div>

                        )}

                        {visibleColumns.theta && (

                          <div className="text-right text-white font-mono">

                            {call?.theta ? call.theta.toFixed(3) : '—'}

                          </div>

                        )}

                        {visibleColumns.iv && (

                          <div className="text-right text-purple-400 font-mono font-bold">

                            {call?.implied_volatility ? (call.implied_volatility * 100).toFixed(0) + '%' : '—'}

                          </div>

                        )}

                        {visibleColumns.change && (

                          <div className="text-right font-mono">

                            {call?.change_percent !== undefined ? (

                              <span className={call.change_percent >= 0 ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>

                                {call.change_percent >= 0 ? '+' : ''}{call.change_percent.toFixed(0)}%

                              </span>

                            ) : '—'}

                          </div>

                        )}

                        {visibleColumns.breakeven && (

                          <div className="text-right text-white font-mono">

                            {call?.ask && stockPrice > 0 ? (

                              <span className={((strike + call.ask - stockPrice) / stockPrice * 100) > 0 ? 'text-red-400' : 'text-green-400'}>

                                {(((strike + call.ask - stockPrice) / stockPrice) * 100).toFixed(1)}%

                              </span>

                            ) : '—'}

                          </div>

                        )}

                        {visibleColumns.bid && (

                          <div

                            className={`text-right font-mono cursor-pointer hover:bg-green-900/20 transition-colors ${call?.bid ? 'text-green-400 font-bold' : 'text-white'}`}

                            onDoubleClick={() => call && handlePriceDoubleClick(call)}

                            title="Double-click to view price chart"

                          >

                            {call?.bid ? call.bid.toFixed(2) : '—'}

                          </div>

                        )}

                        {visibleColumns.ask && (

                          <div

                            className={`text-right font-mono cursor-pointer hover:bg-green-900/20 transition-colors ${call?.ask ? 'text-green-400 font-bold' : 'text-white'}`}

                            onDoubleClick={() => call && handlePriceDoubleClick(call)}

                            title="Double-click to view price chart"

                          >

                            {call?.ask ? call.ask.toFixed(2) : '—'}

                          </div>

                        )}

                      </div>



                      {/* Strike Price */}

                      <div className={`px-4 py-3 text-center text-lg font-bold border-r border-gray-800/50 min-w-[90px] ${atm ? 'bg-orange-900/30 text-orange-400' :

                        getProbabilityType(strike).type === '80call' ? 'bg-green-900/30 text-green-500' :

                          getProbabilityType(strike).type === '80put' ? 'bg-red-900/30 text-red-500' :

                            getProbabilityType(strike).type === '90call' ? 'bg-lime-900/30 text-lime-400' :

                              getProbabilityType(strike).type === '90put' ? 'bg-red-950/30 text-red-700' :

                                'bg-gray-900/50 text-white'

                        }`}>

                        ${strike.toFixed(2)}

                      </div>



                      {/* Put Option */}

                      <div className={`grid gap-2 px-3 py-3 text-base ${getProbabilityType(strike).type === '80put' ? 'bg-red-900/30' :

                        getProbabilityType(strike).type === '90put' ? 'bg-red-950/30' :

                          putITM ? 'bg-red-950/20' : 'bg-transparent'

                        }`}

                        style={{ gridTemplateColumns: `repeat(${Object.values(visibleColumns).filter(Boolean).length}, minmax(0, 1fr))` }}>

                        {visibleColumns.ask && (

                          <div

                            className={`text-left font-mono cursor-pointer hover:bg-red-900/20 transition-colors ${put?.ask ? 'text-red-400 font-bold' : 'text-white'}`}

                            onDoubleClick={() => put && handlePriceDoubleClick(put)}

                            title="Double-click to view price chart"

                          >

                            {put?.ask ? put.ask.toFixed(2) : '—'}

                          </div>

                        )}

                        {visibleColumns.bid && (

                          <div

                            className={`text-left font-mono cursor-pointer hover:bg-red-900/20 transition-colors ${put?.bid ? 'text-red-400 font-bold' : 'text-white'}`}

                            onDoubleClick={() => put && handlePriceDoubleClick(put)}

                            title="Double-click to view price chart"

                          >

                            {put?.bid ? put.bid.toFixed(2) : '—'}

                          </div>

                        )}

                        {visibleColumns.breakeven && (

                          <div className="text-left text-white font-mono">

                            {put?.ask && stockPrice > 0 ? (

                              <span className={((stockPrice - (strike - put.ask)) / stockPrice * 100) > 0 ? 'text-red-400' : 'text-green-400'}>

                                {(((stockPrice - (strike - put.ask)) / stockPrice) * 100).toFixed(1)}%

                              </span>

                            ) : '—'}

                          </div>

                        )}

                        {visibleColumns.change && (

                          <div className="text-left font-mono">

                            {put?.change_percent !== undefined ? (

                              <span className={put.change_percent >= 0 ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>

                                {put.change_percent >= 0 ? '+' : ''}{put.change_percent.toFixed(0)}%

                              </span>

                            ) : '—'}

                          </div>

                        )}

                        {visibleColumns.iv && (

                          <div className="text-left text-purple-400 font-mono font-bold">

                            {put?.implied_volatility ? (put.implied_volatility * 100).toFixed(0) + '%' : '—'}

                          </div>

                        )}

                        {visibleColumns.theta && (

                          <div className="text-left text-white font-mono">

                            {put?.theta ? put.theta.toFixed(3) : '—'}

                          </div>

                        )}

                        {visibleColumns.delta && (

                          <div className="text-left text-white font-mono">

                            {put?.delta ? put.delta.toFixed(3) : '—'}

                          </div>

                        )}

                        {visibleColumns.volume && (

                          <div className="text-left text-white font-mono">

                            {put?.volume ? put.volume.toLocaleString() : '—'}

                          </div>

                        )}

                        {visibleColumns.openInterest && (

                          <div className="text-left text-white font-mono">

                            {put?.open_interest ? put.open_interest.toLocaleString() : '—'}

                          </div>

                        )}

                        {visibleColumns.watchlist && (

                          <div className="flex items-center justify-center">

                            {put && (

                              <button

                                onClick={() => isInWatchlist(put.ticker) ? removeFromWatchlist(watchlist.find(w => w.ticker === put.ticker)?.id || '') : addToWatchlist(put)}

                                className="text-white hover:text-orange-400 transition-colors"

                                title={isInWatchlist(put.ticker) ? 'Remove from watchlist' : 'Add to watchlist'}

                              >

                                {isInWatchlist(put.ticker) ? (

                                  <TbStarFilled className="w-4 h-4 text-orange-400" />

                                ) : (

                                  <TbStar className="w-4 h-4" />

                                )}

                              </button>

                            )}

                          </div>

                        )}

                      </div>

                    </div>

                  );

                })}

              </div>

            )}

          </div>



          {/* Calculator Modal */}

          {calculatorModalOpen && (() => {

            const item = watchlist.find(w => w.id === calculatorModalOpen);

            if (!item) return null;



            // Calculate days to expiration

            const expDate = new Date(item.expiration);

            const today = new Date();

            const daysToExpiry = Math.max(0, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));



            // Use fetched stock price, fallback to stored price, then to main stockPrice

            const currentStockPrice = calculatorStockPrices[item.symbol] || item.stockPrice || (item.symbol === symbol ? stockPrice : 0);



            if (currentStockPrice <= 0) {

              return (

                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">

                  <div className="bg-black border-2 border-gray-700 rounded-2xl shadow-2xl p-8 text-white">

                    <div className="text-center">

                      <div className="text-red-400 mb-4">Unable to load calculator</div>

                      <div className="text-gray-400 text-sm mb-4">Stock price not available</div>

                      <button

                        onClick={() => setCalculatorModalOpen(null)}

                        className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"

                      >

                        Close

                      </button>

                    </div>

                  </div>

                </div>

              );

            }



            // Create time series

            const maxDays = daysToExpiry;

            const timePoints = [];



            if (maxDays <= 7) {

              for (let days = maxDays; days >= 1; days--) {

                timePoints.push({ days, label: `${days}d` });

              }

              timePoints.push({ days: 0, label: 'Exp' });

            } else if (maxDays <= 30) {

              const intervals = [maxDays, Math.floor(maxDays * 0.8), Math.floor(maxDays * 0.6), Math.floor(maxDays * 0.4), Math.floor(maxDays * 0.2), 7, 3, 1];

              const uniqueIntervals = [...new Set(intervals)].filter(d => d > 0).sort((a, b) => b - a);

              uniqueIntervals.forEach(days => timePoints.push({ days, label: `${days}d` }));

              timePoints.push({ days: 0, label: 'Exp' });

            } else {

              const intervals = [maxDays, Math.floor(maxDays * 0.75), Math.floor(maxDays * 0.5), Math.floor(maxDays * 0.25), 30, 14, 7, 3, 1];

              const uniqueIntervals = [...new Set(intervals)].filter(d => d > 0).sort((a, b) => b - a);

              uniqueIntervals.slice(0, 7).forEach(days => timePoints.push({ days, label: `${days}d` }));

              timePoints.push({ days: 0, label: 'Exp' });

            }



            // Create strike range (±15% from current price)

            const otmPercentage = calculatorModalOtmRange;

            const lowerBound = currentStockPrice * (1 - otmPercentage / 100);

            const upperBound = currentStockPrice * (1 + otmPercentage / 100);

            const strikeStep = (upperBound - lowerBound) / 75; // Increased to 75 for maximum granularity

            const heatMapStrikes = [];



            // Only generate strikes if we have valid bounds

            if (strikeStep > 0 && isFinite(strikeStep)) {

              for (let strike = upperBound; strike >= lowerBound; strike -= strikeStep) {

                heatMapStrikes.push(Math.round(strike * 100) / 100);

              }

            }



            // Find ATM strike (with fallback to current stock price if array is empty)

            const atmStrike = heatMapStrikes.length > 0

              ? heatMapStrikes.reduce((prev, curr) =>

                Math.abs(curr - currentStockPrice) < Math.abs(prev - currentStockPrice) ? curr : prev

              )

              : currentStockPrice;



            const riskFreeRate = 0.0408;



            // Use IV from watchlist item (stored when added)

            let impliedVol = item.implied_volatility && item.implied_volatility > 0

              ? item.implied_volatility

              : 0.30; // Default 30% IV if not stored





            // Calculate baseline: current option value at current stock price and current time

            const baselineValue = calculateBSPrice(

              currentStockPrice,

              item.strike,

              daysToExpiry / 365,

              riskFreeRate,

              impliedVol,

              item.type === 'call'

            );





            return (

              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">

                <div className="bg-black border-2 border-gray-700 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[70vh] overflow-hidden flex flex-col">

                  {/* Header */}

                  <div className="bg-gradient-to-r from-gray-900 to-black p-4 border-b border-gray-700 flex items-center justify-between">

                    <div className="flex items-center gap-4 text-base">

                      <span className="text-white font-bold text-xl">{item.symbol}</span>

                      <span className="text-orange-400 font-bold text-xl">${item.strike}</span>

                      <span className={`font-bold text-lg ${item.type === 'call' ? 'text-green-400' : 'text-red-400'}`}>

                        {item.type.toUpperCase()}

                      </span>

                      <span className="text-white text-lg">{item.expiration}</span>

                      <span className="text-gray-400 text-base">Entry: ${item.entryPrice.toFixed(2)}</span>

                    </div>



                    {/* Tab Controls - Centered with 3D Design */}

                    <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-gradient-to-b from-gray-900 via-black to-gray-950 rounded-xl p-2 border-2 border-gray-700 shadow-[inset_0_2px_8px_rgba(255,255,255,0.1),0_8px_24px_rgba(0,0,0,0.8)]">

                      <button

                        onClick={() => setCalculatorView('table')}

                        className={`px-6 py-3 rounded-lg font-black text-lg uppercase tracking-wider transition-all duration-300 ${calculatorView === 'table'

                          ? 'bg-gradient-to-b from-black via-gray-950 to-black text-transparent bg-clip-text shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_0_16px_rgba(249,115,22,0.4)] border-2 border-orange-500/30'

                          : 'text-white/90 hover:text-white hover:bg-gray-800/30'

                          }`}

                        style={calculatorView === 'table' ? {

                          background: 'linear-gradient(to bottom, #000000, #0a0a0a, #000000)',

                          WebkitBackgroundClip: 'text',

                          WebkitTextFillColor: 'transparent',

                          backgroundImage: 'linear-gradient(to bottom, #f97316, #ea580c, #f97316)',

                          textShadow: 'none'

                        } : {}}

                      >

                        Table P/L

                      </button>

                      <button

                        onClick={() => setCalculatorView('line')}

                        className={`px-6 py-3 rounded-lg font-black text-lg uppercase tracking-wider transition-all duration-300 ${calculatorView === 'line'

                          ? 'bg-gradient-to-b from-black via-gray-950 to-black text-transparent bg-clip-text shadow-[inset_0_2px_8px_rgba(0,0,0,0.8),0_0_16px_rgba(249,115,22,0.4)] border-2 border-orange-500/30'

                          : 'text-white/90 hover:text-white hover:bg-gray-800/30'

                          }`}

                        style={calculatorView === 'line' ? {

                          background: 'linear-gradient(to bottom, #000000, #0a0a0a, #000000)',

                          WebkitBackgroundClip: 'text',

                          WebkitTextFillColor: 'transparent',

                          backgroundImage: 'linear-gradient(to bottom, #f97316, #ea580c, #f97316)',

                          textShadow: 'none'

                        } : {}}

                      >

                        Line P/L

                      </button>

                    </div>



                    <div className="flex-1"></div>



                    {/* OTM Range Controls */}

                    <div className="flex items-center gap-3">

                      <label className="text-orange-500 text-[18px] font-bold uppercase tracking-wider">OTM Range</label>

                      <select

                        value={calculatorModalOtmRange}

                        onChange={(e) => setCalculatorModalOtmRange(Number(e.target.value))}

                        className="bg-black border border-gray-600 px-3 py-1.5 text-white text-[14px] font-semibold focus:outline-none rounded"

                      >

                        <option value={2}>±2%</option>

                        <option value={5}>±5%</option>

                        <option value={10}>±10%</option>

                        <option value={15}>±15%</option>

                        <option value={20}>±20%</option>

                      </select>

                    </div>



                    <button

                      onClick={() => setCalculatorModalOpen(null)}

                      className="text-white hover:text-gray-300 transition-colors text-3xl font-black leading-none ml-4"

                      style={{

                        textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(255,255,255,0.3), 0 0 8px rgba(255,255,255,0.2)'

                      }}

                    >

                      ×

                    </button>

                  </div>



                  {/* Content Area - Fixed height for both views */}

                  <div className="flex-1 overflow-auto p-6">

                    {calculatorView === 'table' ? (

                      <>

                        {heatMapStrikes.length === 0 ? (

                          <div className="flex items-center justify-center h-64">

                            <div className="text-center">

                              <div className="text-red-400 text-lg mb-2">Unable to load table</div>

                              <div className="text-gray-400 text-sm">No strike data available</div>

                              <div className="text-gray-500 text-xs mt-2">Stock Price: ${currentStockPrice?.toFixed(2) || 'N/A'}</div>

                            </div>

                          </div>

                        ) : (

                          <>

                            <div className="text-center py-4 bg-black border-b border-gray-600 mb-4">

                              <span className="text-lg font-bold text-blue-300 uppercase tracking-wider">Time Till Expiration (Days)</span>

                            </div>



                            <div className="overflow-x-auto">

                              <table className="w-full border-collapse bg-black">

                                <thead className="sticky top-0 z-10">

                                  <tr>

                                    <th className="sticky top-0 w-20 h-14 bg-gradient-to-b from-gray-900 to-black border-2 border-gray-800 text-sm font-bold text-white">

                                      Stock Price

                                    </th>

                                    {timePoints.map((timePoint) => (

                                      <th

                                        key={timePoint.days}

                                        className="sticky top-0 w-20 h-14 bg-gradient-to-b from-gray-900 to-black border-2 border-gray-800 text-sm font-bold px-1 text-white"

                                      >

                                        <div className="text-sm font-bold">{timePoint.label}</div>

                                      </th>

                                    ))}

                                  </tr>

                                </thead>

                                <tbody>

                                  {heatMapStrikes.map((strike) => {

                                    const isATM = strike === atmStrike;



                                    return (

                                      <tr key={strike} className={isATM ? 'ring-2 ring-yellow-400' : ''}>

                                        <td className={`h-12 border border-gray-600 text-center font-medium text-lg ${isATM

                                          ? 'bg-yellow-900 text-yellow-300 font-bold ring-1 ring-yellow-400'

                                          : 'bg-black text-white'

                                          }`}>

                                          ${strike.toFixed(2)} {isATM && '🎯'}

                                        </td>



                                        {timePoints.map((timePoint) => {

                                          const timeToExpiry = timePoint.days / 365;



                                          // Calculate theoretical option value

                                          const theoreticalValue = calculateBSPrice(

                                            strike,

                                            item.strike,

                                            timeToExpiry,

                                            riskFreeRate,

                                            impliedVol,

                                            item.type === 'call'

                                          );



                                          // Calculate P/L percentage relative to entry price

                                          const percentPnL = item.entryPrice > 0

                                            ? ((theoreticalValue - item.entryPrice) / item.entryPrice) * 100

                                            : 0;



                                          const cellColor = getPLColor(percentPnL);



                                          return (

                                            <td

                                              key={timePoint.days}

                                              className={`h-12 border border-gray-600 text-center font-bold text-sm ${cellColor}`}

                                            >

                                              {percentPnL >= 0 ? '+' : ''}{percentPnL.toFixed(1)}%

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

                      </>

                    ) : (() => {

                      // Validate stock price before rendering chart

                      if (!currentStockPrice || currentStockPrice <= 0 || !isFinite(currentStockPrice)) {

                        return (

                          <div className="flex items-center justify-center h-64">

                            <div className="text-center">

                              <div className="text-red-400 text-lg mb-2">Unable to load chart</div>

                              <div className="text-gray-400 text-sm">Invalid stock price data</div>

                            </div>

                          </div>

                        );

                      }



                      // Generate line chart data points

                      const numTimePoints = 50;

                      const chartData: Array<{ daysToExp: number; pnl: number; pnlPercent: number }> = [];

                      let maxPnL = -Infinity;

                      let minPnL = Infinity;



                      // Calculate baseline: current option value at current price and current time

                      const baselineValue = calculateBSPrice(

                        currentStockPrice,

                        item.strike,

                        daysToExpiry / 365,

                        0.0408,

                        impliedVol,

                        item.type === 'call'

                      );



                      for (let i = 0; i <= numTimePoints; i++) {

                        const daysToExp = daysToExpiry - (i * daysToExpiry / numTimePoints);

                        const timeToExpiry = Math.max(0, daysToExp / 365);



                        const priceAtThisPoint = isHoveringChart && hoveredPrice !== null ? hoveredPrice : currentStockPrice;



                        const theoreticalValue = calculateBSPrice(

                          priceAtThisPoint,

                          item.strike,

                          timeToExpiry,

                          0.0408,

                          impliedVol,

                          item.type === 'call'

                        );



                        // P/L relative to current baseline value (today's value)

                        const dollarPnL = theoreticalValue - baselineValue;

                        let percentPnL = baselineValue > 0 ? ((theoreticalValue - baselineValue) / baselineValue) * 100 : 0;

                        percentPnL = Math.max(percentPnL, -100);



                        chartData.push({ daysToExp, pnl: dollarPnL, pnlPercent: percentPnL });

                        maxPnL = Math.max(maxPnL, percentPnL);

                        minPnL = Math.min(minPnL, percentPnL);

                      }



                      const simulatedStockPrice = (isHoveringChart && hoveredPrice !== null && isFinite(hoveredPrice))

                        ? hoveredPrice

                        : currentStockPrice || 0;



                      const pnlRange = maxPnL - minPnL;

                      const paddedMaxPnL = maxPnL + (pnlRange * 0.1);

                      const paddedMinPnL = minPnL - (pnlRange * 0.1);



                      const chartWidth = 1200;

                      const chartHeight = 1000;

                      const padding = { top: 40, right: 80, bottom: 120, left: 80 };

                      const plotWidth = chartWidth - padding.left - padding.right;

                      const plotHeight = chartHeight - padding.top - padding.bottom;



                      const xScale = (days: number) => {

                        return padding.left + ((daysToExpiry - days) / daysToExpiry) * plotWidth;

                      };



                      const yScale = (pnlPercent: number) => {

                        return padding.top + plotHeight - ((pnlPercent - paddedMinPnL) / (paddedMaxPnL - paddedMinPnL)) * plotHeight;

                      };



                      const linePath = chartData.map((d, i) => {

                        const x = xScale(d.daysToExp);

                        const y = yScale(d.pnlPercent);

                        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;

                      }).join(' ');



                      const currentDayData = chartData.find(d => Math.abs(d.daysToExp - daysToExpiry) < 1) || chartData[0] || { daysToExp: 0, pnl: 0, pnlPercent: 0 };

                      const currentX = xScale(daysToExpiry);

                      const currentY = yScale(currentDayData?.pnlPercent || 0);



                      return (

                        <>

                          <div className="text-center py-4 bg-black border-b border-gray-600 mb-4">

                            <span className="text-lg font-bold text-blue-300 uppercase tracking-wider">P/L Over Time</span>

                          </div>



                          <div className="flex justify-center items-start h-full">

                            <svg

                              width={chartWidth}

                              height={chartHeight}

                              className="w-full h-auto"

                              style={{ maxWidth: '100%' }}

                              preserveAspectRatio="xMidYMid meet"

                              onMouseDown={(e) => {

                                const svg = e.currentTarget;

                                const rect = svg.getBoundingClientRect();

                                const mouseX = e.clientX - rect.left;

                                const relativeX = mouseX - padding.left;

                                const sliderY = chartHeight - padding.bottom + 40;

                                const mouseY = e.clientY - rect.top;

                                const priceMin = Math.floor(currentStockPrice * 0.85);

                                const priceMax = Math.ceil(currentStockPrice * 1.15);

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



                              {/* Grid lines */}

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

                                    />

                                  );

                                })}



                                {/* Zero line */}

                                <line

                                  x1={padding.left}

                                  y1={yScale(0)}

                                  x2={chartWidth - padding.right}

                                  y2={yScale(0)}

                                  stroke="#666"

                                  strokeWidth="2"

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

                                    />

                                  );

                                })}

                              </g>



                              {/* Fill area */}

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



                              {/* P/L line */}

                              <path

                                d={linePath}

                                fill="none"

                                stroke={currentDayData.pnlPercent >= 0 ? "#10b981" : "#ef4444"}

                                strokeWidth="4"

                                strokeLinecap="round"

                                strokeLinejoin="round"

                              />



                              {/* Current day vertical line */}

                              <line

                                x1={currentX}

                                y1={padding.top}

                                x2={currentX}

                                y2={chartHeight - padding.bottom}

                                stroke="#3b82f6"

                                strokeWidth="2"

                              />



                              {/* Current day dot */}

                              <circle

                                cx={currentX}

                                cy={currentY}

                                r="6"

                                fill={currentDayData.pnl >= 0 ? "#10b981" : "#ef4444"}

                                stroke="#fff"

                                strokeWidth="2"

                              />



                              {/* Y-axis labels (P/L %) */}

                              <g className="y-axis-labels">

                                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {

                                  const pnl = paddedMinPnL + (paddedMaxPnL - paddedMinPnL) * (1 - ratio);

                                  const y = padding.top + plotHeight * ratio;

                                  return (

                                    <text

                                      key={`y-${ratio}`}

                                      x={padding.left - 10}

                                      y={y + 5}

                                      fill="#ffffff"

                                      fontSize="14"

                                      textAnchor="end"

                                      fontWeight="600"

                                    >

                                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}%

                                    </text>

                                  );

                                })}

                              </g>



                              {/* X-axis labels (Days) */}

                              <g className="x-axis-labels">

                                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {

                                  const days = Math.round(daysToExpiry * (1 - ratio));

                                  const x = padding.left + plotWidth * ratio;

                                  const date = new Date();

                                  date.setDate(date.getDate() + (daysToExpiry - days));

                                  const dateLabel = ratio === 1 ? 'EXP' : `${date.getMonth() + 1}/${date.getDate()}`;



                                  return (

                                    <text

                                      key={`x-${ratio}`}

                                      x={x}

                                      y={chartHeight - padding.bottom + 20}

                                      fill="#ffffff"

                                      fontSize="14"

                                      textAnchor="middle"

                                      fontWeight="600"

                                    >

                                      {dateLabel}

                                    </text>

                                  );

                                })}

                              </g>



                              {/* Stock price slider */}

                              <g className="stock-price-slider">

                                {(() => {

                                  const priceMin = Math.floor(currentStockPrice * 0.85);

                                  const priceMax = Math.ceil(currentStockPrice * 1.15);

                                  const priceRange = priceMax - priceMin;



                                  return (

                                    <>

                                      {/* Slider track */}

                                      <line

                                        x1={padding.left}

                                        y1={chartHeight - padding.bottom + 40}

                                        x2={padding.left + plotWidth}

                                        y2={chartHeight - padding.bottom + 40}

                                        stroke="#666"

                                        strokeWidth="2"

                                      />



                                      {/* Price ticks */}

                                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {

                                        const price = priceMin + priceRange * ratio;

                                        const x = padding.left + plotWidth * ratio;

                                        return (

                                          <g key={`tick-${ratio}`}>

                                            <line

                                              x1={x}

                                              y1={chartHeight - padding.bottom + 35}

                                              x2={x}

                                              y2={chartHeight - padding.bottom + 45}

                                              stroke="#666"

                                              strokeWidth="1"

                                            />

                                            <text

                                              x={x}

                                              y={chartHeight - padding.bottom + 58}

                                              fill="#ffffff"

                                              fontSize="12"

                                              textAnchor="middle"

                                              fontWeight="600"

                                            >

                                              ${Math.round(price)}

                                            </text>

                                          </g>

                                        );

                                      })}



                                      {/* Slider handle */}

                                      <circle

                                        cx={padding.left + ((simulatedStockPrice - priceMin) / priceRange) * plotWidth}

                                        cy={chartHeight - padding.bottom + 40}

                                        r="8"

                                        fill="#3b82f6"

                                        stroke="#fff"

                                        strokeWidth="2"

                                        style={{ cursor: 'pointer' }}

                                      />



                                      {/* Price label */}

                                      <rect

                                        x={padding.left + ((simulatedStockPrice - priceMin) / priceRange) * plotWidth - 35}

                                        y={chartHeight - padding.bottom + 50}

                                        width="70"

                                        height="22"

                                        fill="#3b82f6"

                                        rx="4"

                                      />

                                      <text

                                        x={padding.left + ((simulatedStockPrice - priceMin) / priceRange) * plotWidth}

                                        y={chartHeight - padding.bottom + 64}

                                        fill="white"

                                        fontSize="12"

                                        textAnchor="middle"

                                        fontWeight="700"

                                      >

                                        ${simulatedStockPrice.toFixed(2)}

                                      </text>

                                    </>

                                  );

                                })()}

                              </g>



                              {/* P/L info box */}

                              <g>

                                <rect

                                  x={chartWidth - padding.right - 150}

                                  y={padding.top + 10}

                                  width="140"

                                  height="80"

                                  fill="#000"

                                  stroke="#666"

                                  strokeWidth="2"

                                  rx="8"

                                />

                                <text

                                  x={chartWidth - padding.right - 80}

                                  y={padding.top + 35}

                                  fill="#fff"

                                  fontSize="14"

                                  textAnchor="middle"

                                  fontWeight="600"

                                >

                                  Current P/L

                                </text>

                                <text

                                  x={chartWidth - padding.right - 80}

                                  y={padding.top + 60}

                                  fill={currentDayData.pnlPercent >= 0 ? "#10b981" : "#ef4444"}

                                  fontSize="18"

                                  textAnchor="middle"

                                  fontWeight="700"

                                >

                                  {currentDayData.pnlPercent >= 0 ? '+' : ''}{currentDayData.pnlPercent.toFixed(1)}%

                                </text>

                                <text

                                  x={chartWidth - padding.right - 80}

                                  y={padding.top + 78}

                                  fill={currentDayData.pnl >= 0 ? "#10b981" : "#ef4444"}

                                  fontSize="12"

                                  textAnchor="middle"

                                  fontWeight="600"

                                >

                                  ${currentDayData.pnl.toFixed(2)}

                                </text>

                              </g>

                            </svg>

                          </div>

                        </>

                      );

                    })()}

                  </div>

                </div>

              </div>

            );

          })()}



          <style jsx>{`

        .custom-scrollbar::-webkit-scrollbar {

          width: 10px;

        }

        .custom-scrollbar::-webkit-scrollbar-track {

          background: #000;

          border-left: 1px solid #1f2937;

        }

        .custom-scrollbar::-webkit-scrollbar-thumb {

          background: linear-gradient(180deg, #f97316 0%, #ea580c 100%);

          border-radius: 5px;

          border: 2px solid #000;

        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {

          background: linear-gradient(180deg, #fb923c 0%, #f97316 100%);

        }

        

        /* Liquid-style Search Bar */

        .search-bar-premium {

          background: linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 100%) !important;

          border: 2px solid rgba(128, 128, 128, 0.3) !important;

          box-shadow: 

            inset 0 2px 4px rgba(0, 0, 0, 0.8),

            inset 0 -2px 4px rgba(128, 128, 128, 0.05),

            0 4px 12px rgba(0, 0, 0, 0.6),

            0 0 0 1px rgba(96, 96, 96, 0.2) !important;

          border-radius: 3px !important;

          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;

        }

        

        .search-bar-premium:focus-within {

          border: 2px solid rgba(160, 160, 160, 0.6) !important;

          box-shadow: 

            inset 0 2px 4px rgba(0, 0, 0, 0.8),

            inset 0 -2px 4px rgba(128, 128, 128, 0.1),

            0 4px 12px rgba(0, 0, 0, 0.6),

            0 0 15px rgba(128, 128, 128, 0.2),

            0 0 0 2px rgba(96, 96, 96, 0.1) !important;

        }

      `}</style>



          {/* Option Price Chart Modal */}

          {priceChartModal && (

            <div

              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"

              onClick={() => setPriceChartModal(null)}

            >

              <div

                className="bg-black border-2 border-orange-500/30 rounded-lg shadow-2xl w-[90vw] max-w-5xl h-[600px] flex flex-col"

                onClick={(e) => e.stopPropagation()}

              >

                {/* Header */}

                <div className="flex items-center justify-between p-4 border-b border-gray-800">

                  <div className="flex items-center gap-3">

                    <TbChartLine className="w-6 h-6 text-orange-400" />

                    <div>

                      <h3 className="text-xl font-bold text-white" style={{ opacity: 1, filter: 'none' }}>

                        {parseOptionTicker(priceChartModal.ticker)}

                      </h3>

                      <p className="text-sm font-medium text-white" style={{ opacity: 1, filter: 'none' }}>

                        {chartTimeframe === '5m' ? 'Intraday (5-min intervals)' :

                          chartTimeframe === '1h' ? 'Last 3 Days (Hourly)' :

                            'Last 30 Days (Daily)'}

                      </p>

                    </div>

                  </div>



                  {/* Timeframe Selector */}

                  <div className="flex items-center gap-2">

                    <div className="flex gap-2 bg-black/50 rounded-xl p-1.5 border border-gray-800/50">

                      <button

                        onClick={() => {

                          setChartTimeframe('5m');

                          fetchOptionPriceHistory(priceChartModal.ticker, '5m');

                        }}

                        className="relative px-8 py-3.5 rounded-lg font-bold text-base tracking-wider transition-all duration-200"

                        style={{

                          background: '#000000',

                          border: '1px solid rgba(255, 255, 255, 0.1)',

                          color: chartTimeframe === '5m' ? '#f97316' : '#ffffff',

                          opacity: 1

                        }}

                      >

                        <span className="relative z-10">5m</span>

                      </button>

                      <button

                        onClick={() => {

                          setChartTimeframe('1h');

                          fetchOptionPriceHistory(priceChartModal.ticker, '1h');

                        }}

                        className="relative px-8 py-3.5 rounded-lg font-bold text-base tracking-wider transition-all duration-200"

                        style={{

                          background: '#000000',

                          border: '1px solid rgba(255, 255, 255, 0.1)',

                          color: chartTimeframe === '1h' ? '#f97316' : '#ffffff',

                          opacity: 1

                        }}

                      >

                        <span className="relative z-10">1H</span>

                      </button>

                      <button

                        onClick={() => {

                          setChartTimeframe('1d');

                          fetchOptionPriceHistory(priceChartModal.ticker, '1d');

                        }}

                        className="relative px-8 py-3.5 rounded-lg font-bold text-base tracking-wider transition-all duration-200"

                        style={{

                          background: '#000000',

                          border: '1px solid rgba(255, 255, 255, 0.1)',

                          color: chartTimeframe === '1d' ? '#f97316' : '#ffffff',

                          opacity: 1

                        }}

                      >

                        <span className="relative z-10">1D</span>

                      </button>

                    </div>



                    <button

                      onClick={() => setPriceChartModal(null)}

                      className="text-gray-400 hover:text-white transition-colors p-2"

                    >

                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />

                      </svg>

                    </button>

                  </div>

                </div>



                {/* Chart Content */}

                <div className="flex-1 p-6 overflow-hidden">

                  {loadingChart ? (

                    <div className="flex items-center justify-center h-full">

                      <div className="text-center">

                        <TbRefresh className="w-8 h-8 animate-spin mx-auto mb-2 text-orange-400" />

                        <div className="text-sm text-gray-400">Loading price data...</div>

                      </div>

                    </div>

                  ) : priceChartData.length === 0 ? (

                    <div className="flex items-center justify-center h-full">

                      <div className="text-center text-gray-400">

                        <p>No intraday price data available</p>

                        <p className="text-sm mt-2">Data may be available during market hours</p>

                      </div>

                    </div>

                  ) : (

                    <OptionPriceChart data={priceChartData} type={priceChartModal.type} />

                  )}

                </div>

              </div>

            </div>

          )}

        </>

      )}

    </div>

  );

}



// Simple Canvas-based Option Price Chart Component

function OptionPriceChart({ data, type }: { data: { time: string; price: number; volume: number }[], type: 'call' | 'put' }) {

  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  
  // Helper function to format time to 12-hour format
  const formatTime = (timeStr: string, showAMPM: boolean = true): string => {
    // Extract just the time part (e.g., "9:30" or "13:10")
    let timePart = timeStr;
    if (timeStr.includes(' ')) {
      const parts = timeStr.split(' ');
      timePart = parts[parts.length - 1]; // Get last part which should be the time
    }
    
    // Remove existing AM/PM if present
    timePart = timePart.replace(/AM|PM/gi, '').trim();
    
    // Parse hours and minutes
    const [hoursStr, minutesStr] = timePart.split(':');
    let hours = parseInt(hoursStr, 10);
    const minutes = minutesStr || '00';
    
    // Determine AM/PM
    const isAM = hours < 12;
    const ampm = isAM ? 'AM' : 'PM';
    
    // Convert to 12-hour format
    if (hours === 0) hours = 12;
    else if (hours > 12) hours = hours - 12;
    
    // Return formatted time
    if (showAMPM) {
      return `${hours}:${minutes} ${ampm}`;
    } else {
      return `${hours}:${minutes}`;
    }
  };

  React.useEffect(() => {

    const canvas = canvasRef.current;

    if (!canvas || data.length === 0) return;



    const ctx = canvas.getContext('2d');

    if (!ctx) return;



    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();



    canvas.width = rect.width * dpr;

    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);



    const width = rect.width;

    const height = rect.height;

    const padding = { top: 20, right: 80, bottom: 40, left: 40 };

    const chartWidth = width - padding.left - padding.right;

    const chartHeight = height - padding.top - padding.bottom;



    // Clear canvas

    ctx.fillStyle = '#000000';

    ctx.fillRect(0, 0, width, height);



    // Get price range

    const prices = data.map(d => d.price);

    const minPrice = Math.min(...prices);

    const maxPrice = Math.max(...prices);

    const priceRange = maxPrice - minPrice || 1;



    // Draw Y-axis (price) - on the RIGHT side

    ctx.strokeStyle = '#ffffff';

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(width - padding.right, padding.top);

    ctx.lineTo(width - padding.right, height - padding.bottom);

    ctx.stroke();



    // Draw X-axis (time)

    ctx.beginPath();

    ctx.moveTo(padding.left, height - padding.bottom);

    ctx.lineTo(width - padding.right, height - padding.bottom);

    ctx.stroke();



    // Y-axis labels (prices) - on the RIGHT side

    ctx.fillStyle = '#ffffff';

    ctx.font = '14.4px monospace';

    ctx.textAlign = 'left';

    const numYTicks = 8;

    for (let i = 0; i <= numYTicks; i++) {

      const price = minPrice + (priceRange * i / numYTicks);

      const y = height - padding.bottom - (chartHeight * i / numYTicks);

      ctx.fillText('$' + price.toFixed(2), width - padding.right + 10, y + 4);



      // Grid line

      ctx.strokeStyle = '#333333';

      ctx.beginPath();

      ctx.moveTo(padding.left, y);

      ctx.lineTo(width - padding.right, y);

      ctx.stroke();

    }



    // X-axis labels (time) - adaptive spacing to prevent overlap

    ctx.font = '14.4px monospace';

    ctx.textAlign = 'center';

    ctx.fillStyle = '#ffffff';



    // Calculate how many labels can fit without overlapping

    // Average label width is ~80px for time strings

    const labelWidth = 80;

    const maxLabels = Math.floor(chartWidth / labelWidth);

    const timeStep = Math.max(1, Math.floor(data.length / Math.min(maxLabels, 8)));

    

    // Find which indices we'll actually display

    const displayIndices: number[] = [];

    for (let i = 0; i < data.length; i += timeStep) {

      displayIndices.push(i);

    }

    // Always include the last index if not already there

    if (displayIndices[displayIndices.length - 1] !== data.length - 1) {

      displayIndices.push(data.length - 1);

    }



    displayIndices.forEach((i, idx) => {

      const x = padding.left + (chartWidth * i / (data.length - 1));

      const timeStr = data[i].time;

      

      // Show AM/PM only for first and last labels

      const isFirstOrLast = idx === 0 || idx === displayIndices.length - 1;

      const formattedTime = formatTime(timeStr, isFirstOrLast);

      

      ctx.fillText(formattedTime, x, height - padding.bottom + 20);

    });



    // Draw price line

    ctx.strokeStyle = type === 'call' ? '#00ff41' : '#ff0000';

    ctx.lineWidth = 2;

    ctx.beginPath();



    data.forEach((point, i) => {

      const x = padding.left + (chartWidth * i / (data.length - 1));

      const y = height - padding.bottom - ((point.price - minPrice) / priceRange * chartHeight);



      if (i === 0) {

        ctx.moveTo(x, y);

      } else {

        ctx.lineTo(x, y);

      }

    });

    ctx.stroke();



    // Draw data points

    ctx.fillStyle = type === 'call' ? '#00ff41' : '#ff0000';

    data.forEach((point, i) => {

      const x = padding.left + (chartWidth * i / (data.length - 1));

      const y = height - padding.bottom - ((point.price - minPrice) / priceRange * chartHeight);



      ctx.beginPath();

      ctx.arc(x, y, 3, 0, Math.PI * 2);

      ctx.fill();

    });



    // Y-axis label (on the RIGHT side)

    ctx.save();

    ctx.translate(width - 15, height / 2);

    ctx.rotate(-Math.PI / 2);

    ctx.textAlign = 'center';

    ctx.fillStyle = '#ffffff';

    ctx.font = 'bold 16.8px monospace';

    ctx.fillText('Premium ($)', 0, 0);

    ctx.restore();



    // X-axis label

    ctx.textAlign = 'center';

    ctx.font = 'bold 16.8px monospace';

    ctx.fillText('Time', width / 2, height - 5);



  }, [data, type]);



  return (

    <canvas

      ref={canvasRef}

      className="w-full h-full"

      style={{ width: '100%', height: '100%' }}

    />

  );

}