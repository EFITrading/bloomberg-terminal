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

interface MarketInfo {
  status: 'LIVE' | 'LAST_TRADING_DAY';
  is_live: boolean;
  data_date: string;
  market_open: boolean;
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
  const [marketInfo, setMarketInfo] = useState<MarketInfo>({
    status: 'LIVE',
    is_live: true,
    data_date: new Date().toISOString().split('T')[0],
    market_open: true
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [selectedTicker, setSelectedTicker] = useState('ALL');
  const [streamingStatus, setStreamingStatus] = useState<string>('');
  const [streamingProgress, setStreamingProgress] = useState<{current: number, total: number} | null>(null);

  // Live options flow fetch
  const fetchOptionsFlowStreaming = async () => {
    setLoading(true);
    
    try {
      console.log(`� Fetching live streaming options flow data...`);
      setData([]); // Clear existing data before streaming fresh data
      
    } catch (dbError) {
      console.warn('Error checking database, proceeding with streaming:', dbError);
      setData([]); // Clear existing data
    }
    
    try {
      const eventSource = new EventSource(`/api/stream-options-flow?ticker=${selectedTicker}`);
      
      eventSource.onmessage = (event) => {
        try {
          const streamData = JSON.parse(event.data);
          
          switch (streamData.type) {
            case 'status':
              setStreamingStatus(streamData.message);
              console.log(`📡 Stream Status: ${streamData.message}`);
              break;
              
            case 'trades':
              // Update data progressively as trades come in
              setData(streamData.trades);
              setStreamingStatus(streamData.status);
              if (streamData.progress) {
                setStreamingProgress({
                  current: streamData.progress.current,
                  total: streamData.progress.total
                });
              }
              console.log(`📊 Stream Update: ${streamData.trades.length} trades - ${streamData.status}`);
              break;
              
            case 'complete':
              // Final update with summary
              setData(streamData.trades);
              setSummary(streamData.summary);
              if (streamData.market_info) {
                setMarketInfo(streamData.market_info);
              }
              setLastUpdate(new Date().toLocaleString());
              setLoading(false);
              setStreamingStatus('');
              setStreamingProgress(null);
              
              console.log(`✅ Stream Complete: ${streamData.trades.length} trades, $${streamData.summary.total_premium.toLocaleString()} total premium`);
              eventSource.close();
              break;
              
            case 'error':
              console.error('Stream error:', streamData.error);
              setLoading(false);
              eventSource.close();
              break;
          }
        } catch (parseError) {
          console.error('Error parsing stream data:', parseError);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        setLoading(false);
        eventSource.close();
      };
      
    } catch (error) {
      console.error('Error starting stream:', error);
      setLoading(false);
      // Fallback to regular API
      fetchOptionsFlow();
    }
  };



  const fetchOptionsFlow = async () => {
    setLoading(true);
    try {
      console.log(`� Fetching live options flow data...`);
      
      // Fetch fresh live data only
      const response = await fetch(`/api/live-options-flow?ticker=${selectedTicker}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        setData(result.trades);
        setSummary(result.summary);
        if (result.market_info) {
          setMarketInfo(result.market_info);
        }
        setLastUpdate(new Date().toLocaleString());
        
        console.log(`📊 Options Flow Update: ${result.trades.length} trades, ${result.summary.total_premium} total premium`);
        console.log(`📈 Market Status: ${result.market_info?.status} (${result.market_info?.data_date})`);
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

  // Initial load - fetch current date live data by default
  useEffect(() => {
    // Always fetch live streaming data
    fetchOptionsFlowStreaming();
  }, [selectedTicker]);



  const handleRefresh = () => {
    // Always refresh with live streaming data
    fetchOptionsFlowStreaming();
  };

  const handleDateChange = (newDate: string) => {
    // For live data only, we ignore date changes and always fetch current data
    console.log('Date change ignored - only showing live data');
    fetchOptionsFlowStreaming();
  };



  return (
    <div className="min-h-screen bg-black text-white pt-12">
      {/* Main Content */}
      <div className="p-6">
        <OptionsFlowTable
          data={data}
          summary={summary}
          marketInfo={marketInfo}
          loading={loading}
          onRefresh={handleRefresh}
          selectedTicker={selectedTicker}
          onTickerChange={setSelectedTicker}
          streamingStatus={streamingStatus}
          streamingProgress={streamingProgress}
        />
      </div>


    </div>
  );
}