'use client';

import React, { useState, useEffect } from 'react';
import { OptionsFlowTable } from '@/components/OptionsFlowTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  trade_type: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'SPLIT';
  trade_timestamp: string;
  moneyness: 'ATM' | 'ITM' | 'OTM';
  days_to_expiry: number;
}

interface OptionsFlowSummary {
  total_trades: number;
  total_premium: number;
  unique_symbols: number;
  trade_types: {
    BLOCK: number;
    SWEEP: number;
    'MULTI-LEG': number;
    SPLIT: number;
  };
  call_put_ratio: {
    calls: number;
    puts: number;
  };
  processing_time_ms: number;
}

export default function OptionsFlowPage() {
  const [data, setData] = useState<OptionsFlowData[]>([]);
  const [summary, setSummary] = useState<OptionsFlowSummary>({
    total_trades: 0,
    total_premium: 0,
    unique_symbols: 0,
    trade_types: { BLOCK: 0, SWEEP: 0, 'MULTI-LEG': 0, SPLIT: 0 },
    call_put_ratio: { calls: 0, puts: 0 },
    processing_time_ms: 0
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedDate, setSelectedDate] = useState('2025-10-02');
  const [selectedTicker, setSelectedTicker] = useState('LMT');

  const fetchOptionsFlow = async (saveToDb: boolean = true) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/live-options-flow?date=${selectedDate}&ticker=${selectedTicker}&saveToDb=${saveToDb}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setData(result.trades);
        setSummary(result.summary);
        setLastUpdate(new Date().toLocaleString());
        
        console.log(`📊 Options Flow Update: ${result.trades.length} trades, ${result.summary.total_premium} total premium`);
      } else {
        console.error('Failed to fetch options flow:', result.error);
        // Set empty data on error to prevent stale data display
        setData([]);
        setSummary({
          total_trades: 0,
          total_premium: 0,
          unique_symbols: 0,
          trade_types: { BLOCK: 0, SWEEP: 0, 'MULTI-LEG': 0, SPLIT: 0 },
          call_put_ratio: { calls: 0, puts: 0 },
          processing_time_ms: 0
        });
      }
    } catch (error) {
      console.error('Error fetching options flow:', error);
      // Set empty data on network error
      setData([]);
      setSummary({
        total_trades: 0,
        total_premium: 0,
        unique_symbols: 0,
        trade_types: { BLOCK: 0, SWEEP: 0, 'MULTI-LEG': 0, SPLIT: 0 },
        call_put_ratio: { calls: 0, puts: 0 },
        processing_time_ms: 0
      });
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchOptionsFlow();
  }, [selectedDate, selectedTicker]);

  // Auto-refresh functionality
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchOptionsFlow();
      }, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [autoRefresh, selectedDate, selectedTicker]);

  const handleRefresh = () => {
    fetchOptionsFlow();
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  return (
    <div className="h-screen bg-black text-white font-mono flex flex-col">
      
      {/* Add space at top */}
      <div className="h-16"></div>

      <div className="flex-1 flex flex-col px-4 py-2 space-y-2">




        {/* Full-Height Options Flow Table */}
        <div className="flex-1 min-h-0 bg-gray-900/30 border border-gray-700/50 backdrop-blur-sm">
          <OptionsFlowTable
            data={data}
            summary={summary}
            loading={loading}
            onRefresh={handleRefresh}
            selectedTicker={selectedTicker}
            selectedDate={selectedDate}
            onTickerChange={setSelectedTicker}
            onDateChange={handleDateChange}
          />
        </div>

        {/* Compact Footer */}
        <div className="bg-black/50 border border-gray-800 backdrop-blur-sm shrink-0">
          <div className="px-4 py-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  <span className="text-gray-400">Polygon.io</span>
                </div>
                <div className="text-gray-600">•</div>
                <div className="text-gray-400">30s refresh</div>
              </div>
              
              <div className="flex items-center space-x-3">
                <div className="text-gray-400">Min: <span className="text-white">$65K</span></div>
                <div className="text-gray-600">•</div>
                <div className="text-gray-400">Range: <span className="text-white">ATM ±5%</span></div>
                <div className="text-gray-600">•</div>
                <div className="text-orange-400 font-mono">{new Date().toISOString().split('T')[0]}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}