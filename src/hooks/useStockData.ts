import { useState, useEffect, useCallback, useRef } from 'react';

interface StockDataPoint {
 timestamp: number;
 open: number;
 high: number;
 low: number;
 close: number;
 volume: number;
 date: string;
 time: string;
}

interface StockMeta {
 count: number;
 currentPrice: number;
 priceChange: number;
 priceChangePercent: number;
 high24h: number;
 low24h: number;
 volume24h: number;
 latestQuote: {
 price: number;
 timestamp: number;
 volume: number;
 } | null;
 dataRange: {
 start: string;
 end: string;
 };
 lastUpdated: string;
}

interface StockData {
 symbol: string;
 timeframe: string;
 range: string;
 data: StockDataPoint[];
 meta: StockMeta;
}

interface RealTimeQuote {
 symbol: string;
 price: number;
 timestamp: number;
 volume: number;
 conditions?: string[];
 exchange?: string | null;
}

interface UseStockDataOptions {
 symbol: string;
 timeframe: string;
 range: string;
 enableRealTime?: boolean;
 refreshInterval?: number;
}

interface UseStockDataReturn {
 data: StockDataPoint[];
 meta: StockMeta | null;
 loading: boolean;
 error: string | null;
 refreshData: () => Promise<void>;
 realTimePrice: number | null;
 isConnected: boolean;
}

export function useStockData({
 symbol,
 timeframe,
 range,
 enableRealTime = true,
 refreshInterval = 60000 // 1 minute default
}: UseStockDataOptions): UseStockDataReturn {
 const [data, setData] = useState<StockDataPoint[]>([]);
 const [meta, setMeta] = useState<StockMeta | null>(null);
 const [loading, setLoading] = useState<boolean>(true);
 const [error, setError] = useState<string | null>(null);
 const [realTimePrice, setRealTimePrice] = useState<number | null>(null);
 const [isConnected, setIsConnected] = useState<boolean>(false);
 
 const eventSourceRef = useRef<EventSource | null>(null);
 const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
 const lastFetchRef = useRef<number>(0);
 
 // Fetch historical data
 const fetchStockData = useCallback(async () => {
 try {
 setLoading(true);
 setError(null);
 
 const params = new URLSearchParams({
 symbol,
 timeframe,
 range
 });
 
 const response = await fetch(`/api/stock-data?${params}`);
 
 if (!response.ok) {
 throw new Error(`Failed to fetch data: ${response.status}`);
 }
 
 const stockData: StockData = await response.json();
 
 setData(stockData.data);
 setMeta(stockData.meta);
 setRealTimePrice(stockData.meta.currentPrice);
 lastFetchRef.current = Date.now();
 
 } catch (err) {
 const errorMessage = err instanceof Error ? err.message : 'Unknown error';
 console.error('Error fetching stock data:', errorMessage);
 setError(errorMessage);
 } finally {
 setLoading(false);
 }
 }, [symbol, timeframe, range]);
 
 // Set up real-time price updates
 useEffect(() => {
 if (!enableRealTime || !symbol) return;
 
 // Clean up existing connection
 if (eventSourceRef.current) {
 eventSourceRef.current.close();
 }
 
 const eventSource = new EventSource(`/api/realtime-quotes?symbols=${symbol}`);
 eventSourceRef.current = eventSource;
 
 eventSource.onopen = () => {
 console.log(`Real-time connection opened for ${symbol}`);
 setIsConnected(true);
 };
 
 eventSource.onmessage = (event) => {
 try {
 const update = JSON.parse(event.data);
 
 if (update.type === 'price_update' && update.quotes) {
 const quote = update.quotes.find((q: RealTimeQuote) => q.symbol === symbol);
 if (quote) {
 setRealTimePrice(quote.price);
 
 // Update the last data point with real-time price
 setData(prevData => {
 if (prevData.length === 0) return prevData;
 
 const updatedData = [...prevData];
 const lastIndex = updatedData.length - 1;
 updatedData[lastIndex] = {
 ...updatedData[lastIndex],
 close: quote.price,
 high: Math.max(updatedData[lastIndex].high, quote.price),
 low: Math.min(updatedData[lastIndex].low, quote.price)
 };
 
 return updatedData;
 });
 
 // Update meta with real-time price
 setMeta(prevMeta => {
 if (!prevMeta) return prevMeta;
 
 const priceChange = quote.price - (data[data.length - 2]?.close || quote.price);
 const priceChangePercent = data[data.length - 2]?.close 
 ? ((priceChange / data[data.length - 2].close) * 100)
 : 0;
 
 return {
 ...prevMeta,
 currentPrice: quote.price,
 priceChange,
 priceChangePercent,
 latestQuote: {
 price: quote.price,
 timestamp: quote.timestamp,
 volume: quote.volume
 },
 lastUpdated: new Date().toISOString()
 };
 });
 }
 } else if (update.type === 'heartbeat') {
 // Keep connection alive
 console.log('Heartbeat received');
 } else if (update.type === 'error') {
 console.error('Real-time error:', update.message);
 setError(update.message);
 }
 } catch (err) {
 console.error('Error parsing real-time update:', err);
 }
 };
 
 eventSource.onerror = (event) => {
 console.error('Real-time connection error:', event);
 setIsConnected(false);
 
 // Attempt to reconnect after 5 seconds
 setTimeout(() => {
 if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
 console.log('Attempting to reconnect...');
 // The useEffect will handle reconnection when symbol changes
 }
 }, 5000);
 };
 
 return () => {
 eventSource.close();
 setIsConnected(false);
 };
 }, [symbol, enableRealTime, data]);
 
 // Set up periodic data refresh
 useEffect(() => {
 if (refreshIntervalRef.current) {
 clearInterval(refreshIntervalRef.current);
 }
 
 if (refreshInterval > 0) {
 refreshIntervalRef.current = setInterval(() => {
 // Only refresh if it's been more than the refresh interval since last fetch
 if (Date.now() - lastFetchRef.current > refreshInterval) {
 fetchStockData();
 }
 }, refreshInterval);
 }
 
 return () => {
 if (refreshIntervalRef.current) {
 clearInterval(refreshIntervalRef.current);
 }
 };
 }, [refreshInterval, fetchStockData]);
 
 // Initial data fetch
 useEffect(() => {
 fetchStockData();
 }, [fetchStockData]);
 
 // Cleanup on unmount
 useEffect(() => {
 return () => {
 if (eventSourceRef.current) {
 eventSourceRef.current.close();
 }
 if (refreshIntervalRef.current) {
 clearInterval(refreshIntervalRef.current);
 }
 };
 }, []);
 
 return {
 data,
 meta,
 loading,
 error,
 refreshData: fetchStockData,
 realTimePrice,
 isConnected
 };
}
