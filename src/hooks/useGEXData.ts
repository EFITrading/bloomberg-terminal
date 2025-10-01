import { useEffect, useState } from 'react';

interface GEXData {
  symbol: string;
  spot_price: number;
  timestamp: string;
  gex_by_strike: any[];
  totals: any;
  key_levels: any;
  metadata: any;
}

export function useGEXData(symbol: string, autoRefresh: boolean = true) {
  const [data, setData] = useState<GEXData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/gex?symbol=${symbol}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch GEX data');
      }
      
      const json = await response.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchData, 5 * 60 * 1000); // 5 minutes
      return () => clearInterval(interval);
    }
  }, [symbol, autoRefresh]);

  return { data, loading, error, refetch: fetchData };
}