"use client";

import React, { useState, useEffect } from 'react';

interface OptionsContract {
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  trade_size: number;
  premium_per_contract: number;
  total_premium: number;
  timestamp: number;
  exchange: number;
  conditions: number[];
  flow_type?: 'bullish' | 'bearish' | 'neutral';
  trade_type?: 'block' | 'sweep';
  above_ask?: boolean;
  below_bid?: boolean;
}

export default function OptionsFlowPage() {
  const [trades, setTrades] = useState<OptionsContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTrades = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/options-flow?minPremium=50000');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📊 Options Flow Data:', data);
      
      if (data.success && Array.isArray(data.data)) {
        setTrades(data.data);
        setLastUpdated(new Date());
      } else {
        console.error('❌ Invalid data format:', data);
        setError(data.error || 'Invalid data format received');
      }
    } catch (err) {
      console.error('❌ Failed to fetch options flow:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount: number): string => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const formatTime = (timestamp: number): string => {
    try {
      const date = new Date(timestamp / 1000000);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return '--:--:--';
    }
  };

  const formatExpiry = (expiryString: string): string => {
    try {
      const date = new Date(expiryString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit'
      });
    } catch {
      return expiryString;
    }
  };

  const getTradeTypeColor = (type?: string): string => {
    switch (type) {
      case 'block':
        return 'text-green-500';
      case 'sweep':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };

  const getTradeTypeLabel = (type?: string): string => {
    switch (type) {
      case 'block':
        return '🟢 BLOCK';
      case 'sweep':
        return '🌊 SWEEP';
      default:
        return '⚪ TRADE';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-green-500 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
            <h2 className="text-xl">🔍 Scanning Options Flow...</h2>
            <p className="text-gray-400 mt-2">Analyzing institutional block trades and sweeps</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-500 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">📊 Options Flow</h1>
          <div className="flex items-center justify-between">
            <p className="text-gray-400">
              Real-time institutional block trades and multi-exchange sweeps
            </p>
            <div className="text-right">
              <button
                onClick={fetchTrades}
                className="px-4 py-2 bg-green-800 hover:bg-green-700 rounded text-sm"
                disabled={loading}
              >
                🔄 Refresh
              </button>
              {lastUpdated && (
                <p className="text-xs text-gray-500 mt-1">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <h3 className="text-red-400 font-semibold mb-2">❌ Error</h3>
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-gray-400 text-sm">Total Trades</h3>
            <p className="text-2xl font-bold">{trades.length}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-gray-400 text-sm">Block Trades</h3>
            <p className="text-2xl font-bold text-green-400">
              {trades.filter(t => t.trade_type === 'block').length}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-gray-400 text-sm">Sweep Orders</h3>
            <p className="text-2xl font-bold text-blue-400">
              {trades.filter(t => t.trade_type === 'sweep').length}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-gray-400 text-sm">Total Premium</h3>
            <p className="text-2xl font-bold">
              {formatCurrency(trades.reduce((sum, t) => sum + t.total_premium, 0))}
            </p>
          </div>
        </div>

        {/* Trades Table */}
        {trades.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="text-xl text-gray-400 mb-2">No institutional trades found</h3>
            <p className="text-gray-500">
              Waiting for block trades and sweeps above $50K premium...
            </p>
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Ticker
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Expiry
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Strike
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Size @ Price
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Class
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                      Premium
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {trades.map((trade, index) => (
                    <tr key={index} className="hover:bg-gray-800/50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        {formatTime(trade.timestamp)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-lg font-bold text-white">
                          {trade.ticker}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                        {formatExpiry(trade.expiry)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <span className={trade.type === 'call' ? 'text-green-400' : 'text-red-400'}>
                          ${trade.strike}
                          {trade.type === 'call' ? 'C' : 'P'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <span className={getTradeTypeColor(trade.trade_type)}>
                          {getTradeTypeLabel(trade.trade_type)}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                        <div>
                          <span className="font-semibold">{trade.trade_size.toLocaleString()}</span>
                          <span className="text-gray-400"> @ </span>
                          <span className="font-semibold">${trade.premium_per_contract.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getTradeTypeColor(trade.trade_type)}`}>
                          {trade.trade_type?.toUpperCase() || 'TRADE'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-semibold">
                        {formatCurrency(trade.total_premium)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 p-4 bg-gray-900 rounded-lg">
          <h3 className="text-sm font-semibold mb-2">Legend</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-400">
            <div>
              <span className="text-green-400">🟢 BLOCK:</span> Single large trade above $80K
            </div>
            <div>
              <span className="text-blue-400">🌊 SWEEP:</span> Multi-exchange consolidated order
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}