'use client';

import React, { useState, useEffect, useMemo } from 'react';
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

interface OptionsFlowTableProps {
  data: OptionsFlowData[];
  summary: OptionsFlowSummary;
  loading?: boolean;
  onRefresh?: () => void;
  selectedTicker: string;
  selectedDate: string;
  onTickerChange: (ticker: string) => void;
  onDateChange: (date: string) => void;
}

export const OptionsFlowTable: React.FC<OptionsFlowTableProps> = ({
  data,
  summary,
  loading = false,
  onRefresh,
  selectedTicker,
  selectedDate,
  onTickerChange,
  onDateChange
}) => {
  const [sortField, setSortField] = useState<keyof OptionsFlowData>('trade_timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterTradeType, setFilterTradeType] = useState<string>('all');
  const [inputTicker, setInputTicker] = useState<string>(selectedTicker);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);

  // Only sync input field with selectedTicker when not actively typing
  useEffect(() => {
    if (!isInputFocused) {
      setInputTicker(selectedTicker);
    }
  }, [selectedTicker, isInputFocused]);

  const handleSort = (field: keyof OptionsFlowData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedData = useMemo(() => {
    let filtered = [...data];
    
    // Apply filters
    if (filterType !== 'all') {
      filtered = filtered.filter(trade => trade.type === filterType);
    }
    
    if (filterTradeType !== 'all') {
      filtered = filtered.filter(trade => trade.trade_type === filterTradeType);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      const numA = Number(aValue);
      const numB = Number(bValue);
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    });

    return filtered;
  }, [data, sortField, sortDirection, filterType, filterTradeType]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (dateString: string) => {
    // Parse date string manually to avoid timezone issues
    // Expected format: YYYY-MM-DD
    const [year, month, day] = dateString.split('-');
    return `${month}/${day}/${year.slice(-2)}`;
  };

  const getTradeTypeColor = (tradeType: string) => {
    const colors = {
      'BLOCK': 'bg-blue-100 text-blue-800',
      'SWEEP': 'bg-red-100 text-red-800',
      'MULTI-LEG': 'bg-purple-100 text-purple-800',
      'SPLIT': 'bg-orange-100 text-orange-800'
    };
    return colors[tradeType as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getCallPutColor = (type: string) => {
    return type === 'call' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold';
  };

  return (
    <div className="space-y-6">



      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-6 items-center">
            <div>
              <label className="text-lg font-medium">Symbol:</label>
              <input
                type="text"
                value={inputTicker}
                onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
                onFocus={() => setIsInputFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onTickerChange(inputTicker);
                    setIsInputFocused(false);
                  }
                }}
                onBlur={() => {
                  setIsInputFocused(false);
                  // If user clicks away without pressing Enter, sync with current value
                  if (inputTicker && inputTicker !== selectedTicker) {
                    onTickerChange(inputTicker);
                  }
                }}
                placeholder="TICKER (Press Enter)"
                className="ml-3 border border-gray-300 rounded px-3 py-2 w-32 font-mono text-lg"
                maxLength={10}
              />
            </div>
            <div>
              <label className="text-lg font-medium">Option Type:</label>
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="ml-3 border border-gray-600 rounded px-3 py-2 text-lg bg-gray-800 text-white focus:border-orange-500 focus:outline-none"
              >
                <option value="all" className="bg-gray-800 text-white">All</option>
                <option value="call" className="bg-gray-800 text-white">Calls</option>
                <option value="put" className="bg-gray-800 text-white">Puts</option>
              </select>
            </div>
            <div>
              <label className="text-lg font-medium">Trade Type:</label>
              <select 
                value={filterTradeType} 
                onChange={(e) => setFilterTradeType(e.target.value)}
                className="ml-3 border border-gray-600 rounded px-3 py-2 text-lg bg-gray-800 text-white focus:border-orange-500 focus:outline-none"
              >
                <option value="all" className="bg-gray-800 text-white">All</option>
                <option value="BLOCK" className="bg-gray-800 text-white">Block</option>
                <option value="SWEEP" className="bg-gray-800 text-white">Sweep</option>
                <option value="MULTI-LEG" className="bg-gray-800 text-white">Multi-Leg</option>
                <option value="SPLIT" className="bg-gray-800 text-white">Split</option>
              </select>
            </div>
            <div>
              <label className="text-lg font-medium">Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="ml-3 border border-gray-300 rounded px-3 py-2 text-lg"
              />
            </div>
            <div className="text-lg text-gray-600">
              Showing {filteredAndSortedData.length} of {data.length} trades
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card>
        <CardContent>
          <div className="h-[80vh] overflow-auto">
            <table className="w-full text-lg">
              <thead className="sticky top-0 bg-black z-10">
                <tr className="border-b bg-black">
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('trade_timestamp')}
                  >
                    Time {sortField === 'trade_timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('underlying_ticker')}
                  >
                    Symbol {sortField === 'underlying_ticker' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('type')}
                  >
                    Call/Put {sortField === 'type' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('strike')}
                  >
                    Strike {sortField === 'strike' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('trade_size')}
                  >
                    Size {sortField === 'trade_size' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('spot_price')}
                  >
                    Spot Price {sortField === 'spot_price' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('total_premium')}
                  >
                    Premium {sortField === 'total_premium' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('expiry')}
                  >
                    Expiration {sortField === 'expiry' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="text-left p-4 cursor-pointer hover:bg-gray-800/10 text-orange-500 font-bold text-xl bg-black"
                    onClick={() => handleSort('trade_type')}
                  >
                    Type {sortField === 'trade_type' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedData.map((trade, index) => (
                  <tr key={index} className="border-b hover:bg-gray-800/20">
                    <td className="p-4 text-gray-600 text-lg">{formatTime(trade.trade_timestamp)}</td>
                    <td className="p-4 font-semibold text-lg">{trade.underlying_ticker}</td>
                    <td className={`p-4 text-lg ${getCallPutColor(trade.type)}`}>
                      {trade.type.toUpperCase()}
                    </td>
                    <td className="p-4 text-lg">${trade.strike}</td>
                    <td className="p-4 font-medium text-lg">{trade.trade_size.toLocaleString()} @ {trade.premium_per_contract.toFixed(2)}</td>
                    <td className="p-4 text-lg">${trade.spot_price.toFixed(2)}</td>
                    <td className="p-4 font-semibold text-lg">{formatCurrency(trade.total_premium)}</td>
                    <td className="p-4 text-lg">{formatDate(trade.expiry)}</td>
                    <td className="p-4">
                      <span className={`inline-block px-3 py-2 rounded-full text-sm font-medium ${getTradeTypeColor(trade.trade_type)}`}>
                        {trade.trade_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredAndSortedData.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-xl">
                {loading ? 'Loading options flow data...' : 'No trades found matching the current filters.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};