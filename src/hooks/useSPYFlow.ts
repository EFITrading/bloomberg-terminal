import { useState, useEffect } from 'react';

export interface SPYFlowData {
  symbol: string;
  totalTrades: number;
  sweeps: number;
  blocks: number;
  calls: number;
  puts: number;
  totalPremium: number;
  avgPremium: number;
  timeRange: {
    start: string;
    end: string;
  };
  topTrades: Array<{
    strike: number;
    expiry: string;
    type: 'call' | 'put';
    trade_type: string;
    total_premium: number;
    trade_size: number;
    premium_per_contract: number;
    timestamp: string;
    exchange: string;
  }>;
  flowAnalysis: {
    bullishFlow: number;
    bearishFlow: number;
    institutionalActivity: number;
    unusualActivity: number;
  };
  rawData: any[];
  generatedAt: string;
  processingTime: number;
}

export interface UseSPYFlowResult {
  data: SPYFlowData | null;
  loading: boolean;
  error: string | null;
  isFromCache: boolean;
  cacheAge: number;
  lastUpdated: string | null;
  refresh: () => Promise<void>;
}

export function useSPYFlow(): UseSPYFlowResult {
  const [data, setData] = useState<SPYFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cacheAge, setCacheAge] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchSPYFlow = async (forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);
    
    try {
      // First try to get cached data
      if (!forceRefresh) {
        const cacheResponse = await fetch('/api/cache/screener-data?screenerId=spy-algoflow');
        if (cacheResponse.ok) {
          const cacheResult = await cacheResponse.json();
          if (cacheResult.success && cacheResult.data) {
            console.log('📊 SPY Flow: Using cached data');
            setData(cacheResult.data);
            setIsFromCache(true);
            setLastUpdated(cacheResult.data.generatedAt);
            
            // Calculate cache age
            const cacheTime = new Date(cacheResult.data.generatedAt).getTime();
            const now = Date.now();
            setCacheAge(Math.floor((now - cacheTime) / 1000 / 60)); // Age in minutes
            
            setLoading(false);
            return;
          }
        }
      }
      
      // If no cache or force refresh, get fresh data
      console.log('🔄 SPY Flow: Fetching fresh data');
      const response = await fetch('/api/options-flow?ticker=SPY&limit=500');
      if (!response.ok) {
        throw new Error(`Failed to fetch SPY flow data: ${response.status} ${response.statusText}`);
      }
      
      const apiResponse = await response.json();
      console.log('📊 API Response structure:', {
        success: apiResponse.success,
        hasData: !!apiResponse.data,
        dataLength: apiResponse.data?.length || 0,
        keys: Object.keys(apiResponse)
      });
      
      // Handle API response format - should have apiResponse.data array
      let flowData: any[] = [];
      if (apiResponse.success && apiResponse.data && Array.isArray(apiResponse.data)) {
        flowData = apiResponse.data;
      } else if (Array.isArray(apiResponse)) {
        flowData = apiResponse;
      } else {
        console.warn('⚠️ Unexpected API response format:', apiResponse);
        flowData = [];
      }
      
      // Process the data similar to the background job
      const processedData: SPYFlowData = {
        symbol: 'SPY',
        totalTrades: flowData.length,
        sweeps: flowData.filter((trade: any) => trade.trade_type === 'SWEEP').length,
        blocks: flowData.filter((trade: any) => trade.trade_type === 'BLOCK').length,
        calls: flowData.filter((trade: any) => trade.type === 'call').length,
        puts: flowData.filter((trade: any) => trade.type === 'put').length,
        totalPremium: flowData.reduce((sum: number, trade: any) => sum + (trade.total_premium || 0), 0),
        avgPremium: flowData.length > 0 ? flowData.reduce((sum: number, trade: any) => sum + (trade.total_premium || 0), 0) / flowData.length : 0,
        timeRange: {
          start: new Date(Date.now() - (4 * 60 * 60 * 1000)).toISOString(),
          end: new Date().toISOString()
        },
        topTrades: flowData
          .sort((a: any, b: any) => (b.total_premium || 0) - (a.total_premium || 0))
          .slice(0, 10)
          .map((trade: any) => ({
            strike: trade.strike || 0,
            expiry: trade.expiry || '',
            type: trade.type || 'call',
            trade_type: trade.trade_type || 'UNKNOWN',
            total_premium: trade.total_premium || 0,
            trade_size: trade.trade_size || 0,
            premium_per_contract: trade.premium_per_contract || 0,
            timestamp: trade.trade_timestamp || new Date().toISOString(),
            exchange: trade.exchange_name || 'UNKNOWN'
          })),
        flowAnalysis: {
          bullishFlow: flowData.filter((trade: any) => 
            (trade.type === 'call' && (trade.moneyness || 1) >= 0.95) || 
            (trade.type === 'put' && (trade.moneyness || 1) <= 1.05)
          ).reduce((sum: number, trade: any) => sum + (trade.total_premium || 0), 0),
          bearishFlow: flowData.filter((trade: any) => 
            (trade.type === 'put' && (trade.moneyness || 1) >= 0.95) || 
            (trade.type === 'call' && (trade.moneyness || 1) <= 1.05)
          ).reduce((sum: number, trade: any) => sum + (trade.total_premium || 0), 0),
          institutionalActivity: flowData.filter((trade: any) => 
            (trade.total_premium || 0) >= 50000
          ).length,
          unusualActivity: flowData.filter((trade: any) => 
            trade.trade_type === 'SWEEP' || (trade.total_premium || 0) >= 100000
          ).length
        },
        rawData: flowData,
        generatedAt: new Date().toISOString(),
        processingTime: 0
      };
      
      setData(processedData);
      setIsFromCache(false);
      setLastUpdated(processedData.generatedAt);
      setCacheAge(0);
      
    } catch (err) {
      console.error('❌ SPY Flow fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch SPY flow data');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    await fetchSPYFlow(true);
  };

  useEffect(() => {
    fetchSPYFlow();
    
    // Auto-refresh every 5 minutes to sync with background job
    const interval = setInterval(() => {
      fetchSPYFlow();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    data,
    loading,
    error,
    isFromCache,
    cacheAge,
    lastUpdated,
    refresh
  };
}