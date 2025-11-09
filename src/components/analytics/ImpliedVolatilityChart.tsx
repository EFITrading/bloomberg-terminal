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
  const [scannerRunning, setScannerRunning] = useState(false);

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
      console.log(`🔍 Fetching IV History for ${ticker} - ${expirationWeeks} weeks`);
      
      // Try to get historical data first
      const historyResponse = await fetch(`/api/iv-history?ticker=${ticker}`);
      const historyResult = await historyResponse.json();
      
      if (historyResult.success && historyResult.data.history && historyResult.data.history.length > 0) {
        // We have historical data!
        const { currentPrice, callIV, putIV, history, expiration, weeksTarget } = historyResult.data;
        
        console.log(`✅ IV History - ${history.length} data points found`);
        
        setCurrentPrice(currentPrice);
        setCurrentCallIV(callIV);
        setCurrentPutIV(putIV);
        
        // Format history for chart
        const chartData = history.map((h: any) => ({
          date: `${h.date} ${h.time}`,
          callIV: h.callIV,
          putIV: h.putIV,
          expiration: h.expiration,
          weeksTarget,
          scanType: h.scanType
        }));
        
        setData(chartData);
      } else {
        // Fall back to single IV fetch
        const ivResponse = await fetch(`/api/implied-volatility?ticker=${ticker}&weeks=${expirationWeeks}`);
        const ivResult = await ivResponse.json();
        
        console.log(`📊 IV API Result:`, ivResult);
        
        if (!ivResult.success) {
          throw new Error(ivResult.error || 'Failed to fetch IV data');
        }

        const { currentPrice, callIV, putIV, date, expiration, weeksTarget } = ivResult.data;
        
        console.log(`✅ IV Data - Price: $${currentPrice}, Call IV: ${callIV}%, Put IV: ${putIV}%, Expiration: ${expiration}, Weeks: ${weeksTarget}`);
        
        setCurrentPrice(currentPrice);
        setCurrentCallIV(callIV);
        setCurrentPutIV(putIV);
        setData([{ date, callIV, putIV, expiration, weeksTarget }]);
      }
      
    } catch (err: any) {
      setError(err.message || 'Error fetching data.');
      console.error('❌ IV Fetch Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runManualScan = async () => {
    setScannerRunning(true);
    try {
      const response = await fetch('/api/iv-scanner?type=OPEN&manual=true');
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ IV Scanner Complete!\n\nScanned: ${result.scanned} stocks\nErrors: ${result.errors}\n\nHistorical data is now being collected.`);
      } else {
        alert(`❌ Scanner Error: ${result.error}`);
      }
    } catch (err: any) {
      alert(`❌ Error running scanner: ${err.message}`);
    } finally {
      setScannerRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="text-cyan-400 w-6 h-6" />
        <h2 className="text-xl font-semibold tracking-wide text-white">
          IV Tracker — 10 OTM Strikes
        </h2>
        <div className="ml-auto">
          <button
            onClick={runManualScan}
            disabled={scannerRunning}
            className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-md text-sm font-medium transition border border-cyan-400/30"
          >
            {scannerRunning ? 'Scanning...' : '⚡ Run IV Scanner'}
          </button>
        </div>
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
          <label className="text-sm text-gray-400 mb-2 block">IV Range</label>
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
            Implied Volatility {data.length > 1 ? 'History' : 'Snapshot'} ({data.length} data point{data.length > 1 ? 's' : ''})
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" />
              <XAxis 
                dataKey="date" 
                stroke="#666"
                angle={data.length > 5 ? -45 : 0}
                textAnchor={data.length > 5 ? "end" : "middle"}
                height={data.length > 5 ? 80 : 30}
              />
              <YAxis stroke="#666" label={{ value: 'Volatility (%)', angle: -90, position: 'insideLeft', fill: '#999' }} />
              <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', color: '#fff' }} />
              <Legend />
              <Line type="monotone" dataKey="callIV" name="Call IV" stroke="#00ff99" strokeWidth={3} dot={data.length <= 20} />
              <Line type="monotone" dataKey="putIV" name="Put IV" stroke="#ff3b3b" strokeWidth={3} dot={data.length <= 20} />
            </LineChart>
          </ResponsiveContainer>
          {data.length > 1 && (
            <div className="mt-4 text-sm text-gray-400 text-center">
              Data collected from automated twice-daily scans (9:49 AM & 3:41 PM ET)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="border border-gray-600 bg-black rounded-lg p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subtitle && (
        <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
      )}
    </div>
  );
}