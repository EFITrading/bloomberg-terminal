'use client';

import { useState, useCallback } from 'react';

interface OptionsFlowData {
 ticker: string;
 underlying_ticker: string;
 strike: number;
 expiry: string;
 type: 'call' | 'put';
 trade_size: number;
 premium_per_contract: number;
 total_premium: number;
 spot_price: number;
 exchange_name: string;
 trade_type: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'MINI';
 trade_timestamp: string;
 moneyness: 'ATM' | 'ITM' | 'OTM';
 days_to_expiry: number;
}

interface UseOptionsFlowReturn {
 data: OptionsFlowData[];
 isLoading: boolean;
 refresh: () => void;
 totalTrades: number;
 setData: (data: OptionsFlowData[]) => void;
}

export function useOptionsFlow(): UseOptionsFlowReturn {
 const [data, setData] = useState<OptionsFlowData[]>([]);
 const [isLoading, setIsLoading] = useState(false);

 const refresh = useCallback(() => {
 console.log(' Manual refresh requested');
 setIsLoading(true);
 // Add your refresh logic here if needed
 setTimeout(() => setIsLoading(false), 1000);
 }, []);

 const totalTrades = data.length;

 return {
 data,
 isLoading,
 refresh,
 totalTrades,
 setData
 };
}