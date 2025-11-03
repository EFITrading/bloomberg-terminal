'use client';

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Calendar, Activity } from 'lucide-react';

export default function ImpliedVolatilityChart() {
  const [ticker, setTicker] = useState('SPY');
  const [expirationWeeks, setExpirationWeeks] = useState<3 | 21>(3);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentCallIV, setCurrentCallIV] = useState<number | null>(null);
  const [currentPutIV, setCurrentPutIV] = useState<number | null>(null);

  // Clear data when volatility range changes
  useEffect(() => {
    setCurrentPrice(null);
    setCurrentCallIV(null);
    setCurrentPutIV(null);
    setData([]);
    setError('');
  }, [expirationWeeks]);

  const fetchData = async () => {
    setError('');
    setLoading(true);
    
    // Clear previous data first
    setCurrentPrice(null);
    setCurrentCallIV(null);
    setCurrentPutIV(null);
    setData([]);
    
    try {
      console.log(`🔍 Fetching IV for ${ticker} - ${expirationWeeks} weeks`);
      const response = await fetch(`/api/implied-volatility?ticker=${ticker}&weeks=${expirationWeeks}`);
      const result = await response.json();
      
      console.log(`📊 IV API Result:`, result);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch IV data');
      }

      const { currentPrice, callIV, putIV, date, expiration, weeksTarget } = result.data;
      
      console.log(`✅ IV Data - Price: $${currentPrice}, Call IV: ${callIV}%, Put IV: ${putIV}%, Expiration: ${expiration}, Weeks: ${weeksTarget}`);
      
      setCurrentPrice(currentPrice);
      setCurrentCallIV(callIV);
      setCurrentPutIV(putIV);
      setData([{ date, callIV, putIV, expiration, weeksTarget }]);
      
    } catch (err: any) {
      setError(err.message || 'Error fetching data.');
      console.error('❌ IV Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="text-cyan-400 w-6 h-6" />
        <h2 className="text-xl font-semibold tracking-wide text-white">
          IV Tracker — 10 OTM Strikes
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-sm text-gray-400 mb-2 block">Ticker</label>
          <input
            className="w-full bg-black border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter ticker (e.g., SPY, AAPL, TSLA)"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-2 block">Volatility Range</label>
          <select
            className="w-full bg-black border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
            value={expirationWeeks}
            onChange={(e) => setExpirationWeeks(Number(e.target.value) as 3 | 21)}
          >
            <option value={3}>Monthly Expiration</option>
            <option value={21}>Quad Witching</option>
          </select>
        </div>
      </div>

      <button
        onClick={fetchData}
        disabled={loading}
        className="w-full bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-400 py-3 rounded-md font-semibold transition border border-cyan-400/30"
      >
        {loading ? 'Fetching IV Data...' : 'Fetch IV Data'}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-md">
          {error}
        </div>
      )}

      {currentPrice && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <MetricCard
            title="Current Price"
            value={`$${currentPrice.toFixed(2)}`}
            icon={<TrendingUp className="text-cyan-400" />}
          />
          <MetricCard
            title={`Call IV (${expirationWeeks === 3 ? 'Monthly' : 'Quad Witching'})`}
            value={currentCallIV ? `${currentCallIV.toFixed(2)}%` : 'N/A'}
            icon={<Calendar className="text-green-400" />}
          />
          <MetricCard
            title={`Put IV (${expirationWeeks === 3 ? 'Monthly' : 'Quad Witching'})`}
            value={currentPutIV ? `${currentPutIV.toFixed(2)}%` : 'N/A'}
            icon={<Calendar className="text-red-400" />}
          />
        </div>
      )}

      {data.length > 0 && (
        <div className="mt-8 border border-gray-600 rounded-lg bg-black p-6">
          <h3 className="text-lg font-semibold mb-4 text-white">
            Implied Volatility History
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="#666" />
              <YAxis stroke="#666" label={{ value: 'IV (%)', angle: -90, position: 'insideLeft', fill: '#999' }} />
              <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
              <Legend />
              <Line type="monotone" dataKey="callIV" stroke="#00ff99" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="putIV" stroke="#ff3b3b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="border border-gray-600 bg-black rounded-lg p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}