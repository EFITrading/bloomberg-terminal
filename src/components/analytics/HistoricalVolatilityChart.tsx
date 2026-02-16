'use client';

import React, { useState } from 'react';
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
import { TrendingUp } from 'lucide-react';

export default function HistoricalVolatilityChart() {
  const [ticker, setTicker] = useState('SPY');
  const [hvPeriod, setHvPeriod] = useState<10 | 20 | 30 | 60>(30);
  const [hvData, setHvData] = useState<Array<{ date: string; hv: number; price: number }>>([]);
  const [hvTimeframe, setHvTimeframe] = useState<'1M' | '3M' | '6M' | '1Y' | '5Y' | 'YTD' | 'ALL'>('1Y');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setError('');
    setLoading(true);
    setHvData([]);

    try {
      console.log(`🔍 Fetching HV for ${ticker} - ${hvPeriod} days`);

      const hvResponse = await fetch(`/api/historical-volatility?ticker=${ticker}&days=${hvPeriod}`);
      const hvResult = await hvResponse.json();

      console.log(`📊 HV API Result:`, hvResult);

      if (hvResult.data && Array.isArray(hvResult.data) && hvResult.data.length > 0) {
        setHvData(hvResult.data);
        console.log(`✅ HV Data - ${hvPeriod}-day HV: ${hvResult.data[hvResult.data.length - 1].hv}%, ${hvResult.data.length} data points`);
      } else {
        throw new Error('No HV data available');
      }

    } catch (err: any) {
      setError(err.message || 'Error fetching HV data.');
      console.error('❌ HV Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter HV data based on selected timeframe
  const filteredHvData = React.useMemo(() => {
    if (hvData.length === 0) return [];

    const now = new Date();
    const cutoffDate = new Date();

    switch (hvTimeframe) {
      case '1M':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case '3M':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
      case '6M':
        cutoffDate.setMonth(now.getMonth() - 6);
        break;
      case '1Y':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case '5Y':
        cutoffDate.setFullYear(now.getFullYear() - 5);
        break;
      case 'YTD':
        cutoffDate.setMonth(0);
        cutoffDate.setDate(1);
        break;
      case 'ALL':
        return hvData;
    }

    return hvData.filter(d => new Date(d.date) >= cutoffDate);
  }, [hvData, hvTimeframe]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="text-orange-400 w-6 h-6" />
        <h2 className="text-xl font-semibold tracking-wide text-white">
          Historical Volatility — 10 Year Analysis
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-sm text-gray-400 mb-2 block">Ticker</label>
          <input
            className="w-full bg-black border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:border-orange-400"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter ticker (e.g., SPY, AAPL, TSLA)"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 mb-2 block">HV Period</label>
          <select
            className="w-full bg-black border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:border-orange-400"
            value={hvPeriod}
            onChange={(e) => setHvPeriod(Number(e.target.value) as 10 | 20 | 30 | 60)}
          >
            <option value={10}>10-Day HV</option>
            <option value={20}>20-Day HV</option>
            <option value={30}>30-Day HV</option>
            <option value={60}>60-Day HV</option>
          </select>
        </div>
      </div>

      <button
        onClick={fetchData}
        disabled={loading}
        className="w-full bg-orange-400/20 hover:bg-orange-400/30 text-orange-400 py-3 rounded-md font-semibold transition border border-orange-400/30"
      >
        {loading ? 'Fetching HV Data...' : 'Fetch Historical Volatility'}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-md">
          {error}
        </div>
      )}

      {hvData.length > 0 && (
        <div className="mt-8 border border-gray-600 rounded-lg bg-black p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">
              {hvPeriod}-Day Historical Volatility — 10 Year History ({filteredHvData.length} Days)
            </h3>
            <div className="flex gap-2">
              {(['1M', '3M', '6M', '1Y', '5Y', 'YTD', 'ALL'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setHvTimeframe(tf)}
                  className={`px-3 py-1 rounded text-sm font-medium transition ${hvTimeframe === tf
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={filteredHvData}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                stroke="#666"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
                }}
                angle={-45}
                textAnchor="end"
                height={80}
                interval="preserveStartEnd"
                minTickGap={150}
                tickCount={10}
              />
              <YAxis
                stroke="#666"
                label={{ value: 'Historical Volatility (%)', angle: -90, position: 'insideLeft', fill: '#999' }}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }}
                formatter={(value: any, name: string) => {
                  if (name === 'hv') return [`${value.toFixed(2)}%`, 'HV'];
                  if (name === 'price') return [`$${value.toFixed(2)}`, 'Price'];
                  return [value, name];
                }}
                labelFormatter={(label) => {
                  const date = new Date(label);
                  return date.toLocaleDateString();
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="hv"
                name={`${hvPeriod}D HV`}
                stroke="#ff9900"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div className="border border-gray-700 rounded p-3">
              <div className="text-gray-400 mb-1">Current HV</div>
              <div className="text-xl font-bold text-orange-400">
                {filteredHvData[filteredHvData.length - 1]?.hv.toFixed(2)}%
              </div>
            </div>
            <div className="border border-gray-700 rounded p-3">
              <div className="text-gray-400 mb-1">Avg HV</div>
              <div className="text-xl font-bold text-white">
                {(filteredHvData.reduce((sum, d) => sum + d.hv, 0) / filteredHvData.length).toFixed(2)}%
              </div>
            </div>
            <div className="border border-gray-700 rounded p-3">
              <div className="text-gray-400 mb-1">HV Range</div>
              <div className="text-xl font-bold text-gray-300">
                {Math.min(...filteredHvData.map(d => d.hv)).toFixed(1)}% - {Math.max(...filteredHvData.map(d => d.hv)).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
