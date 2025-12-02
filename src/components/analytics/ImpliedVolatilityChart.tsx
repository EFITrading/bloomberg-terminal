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
  Area,
  AreaChart,
  ReferenceLine,
  Brush,
} from 'recharts';
import { TrendingUp, Calendar, Activity, BarChart3, AlertCircle } from 'lucide-react';

export default function ImpliedVolatilityChart() {
  const [ticker, setTicker] = useState('SPY');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentCallIV, setCurrentCallIV] = useState<number | null>(null);
  const [currentPutIV, setCurrentPutIV] = useState<number | null>(null);
  const [showNetIV, setShowNetIV] = useState(false);
  const [showCallIV, setShowCallIV] = useState(true);
  const [showPutIV, setShowPutIV] = useState(true);
  const [zoomDomain, setZoomDomain] = useState<{x?: [number, number], y?: [number, number]} | undefined>(undefined);
  const [lookbackPeriod, setLookbackPeriod] = useState<number>(365); // Default 1 year
  const [hvWindow, setHvWindow] = useState<number>(20); // Historical Volatility window (10, 20, 30 days)

  // Recalculate HV only when window changes
  const recalculateHV = (newWindow: number) => {
    if (data.length === 0) return;
    
    const calculateHV = (prices: number[], window: number) => {
      if (prices.length < window + 1) return null;
      
      const returns = [];
      for (let i = 1; i <= window; i++) {
        returns.push(Math.log(prices[prices.length - i] / prices[prices.length - i - 1]));
      }
      
      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      
      return stdDev * Math.sqrt(252) * 100;
    };
    
    const updatedData = data.map((item: any, index: number) => {
      const prices = data.slice(Math.max(0, index - newWindow), index + 1).map((d: any) => d.price);
      const hv = calculateHV(prices, newWindow);
      
      return {
        ...item,
        hv
      };
    });
    
    setData(updatedData);
  };

  const fetchData = async () => {
    setError('');
    setLoading(true);
    
    // Clear previous data first
    setCurrentPrice(null);
    setCurrentCallIV(null);
    setCurrentPutIV(null);
    setData([]);
    
    try {
      const years = lookbackPeriod === 365 ? 1 : lookbackPeriod / 365;
      console.log(`🔍 Calculating Historical IV for ${ticker} - ${years} year lookback`);
      
      // Fetch calculated historical IV data
      const historicalResponse = await fetch(
        `/api/calculate-historical-iv?ticker=${ticker}&days=${lookbackPeriod}`
      );
      const historicalResult = await historicalResponse.json();
      
      if (historicalResult.success && historicalResult.data.history && historicalResult.data.history.length > 0) {
        // We have calculated historical IV data!
        const { currentPrice, callIV, putIV, history } = historicalResult.data;
        
        console.log(`✅ Calculated IV History - ${history.length} data points found`);
        
        setCurrentPrice(currentPrice);
        setCurrentCallIV(callIV);
        setCurrentPutIV(putIV);
        
        // Calculate IV Rank and IV Percentile
        const ivValues = history.map((h: any) => (h.callIV && h.putIV) ? (h.callIV + h.putIV) / 2 : null).filter((v: any) => v !== null);
        const minIV = Math.min(...ivValues);
        const maxIV = Math.max(...ivValues);
        
        // Calculate Historical Volatility (HV) using price data
        const calculateHV = (prices: number[], window: number) => {
          if (prices.length < window + 1) return null;
          
          const returns = [];
          for (let i = 1; i <= window; i++) {
            returns.push(Math.log(prices[prices.length - i] / prices[prices.length - i - 1]));
          }
          
          const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
          const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
          const stdDev = Math.sqrt(variance);
          
          // Annualize (252 trading days) and convert to percentage
          return stdDev * Math.sqrt(252) * 100;
        };
        
        // Format history for chart with IV Rank, IV Percentile, and HV
        const chartData = history.map((h: any, index: number) => {
          const netIV = (h.callIV && h.putIV) ? (h.callIV + h.putIV) / 2 : null;
          
          // IV Rank: (Current - Min) / (Max - Min) * 100
          const ivRank = netIV && maxIV !== minIV ? ((netIV - minIV) / (maxIV - minIV)) * 100 : null;
          
          // IV Percentile: Percentage of values below current value
          const ivPercentile = netIV ? (ivValues.filter((v: number) => v <= netIV).length / ivValues.length) * 100 : null;
          
          // Historical Volatility: Calculate using rolling window
          const prices = history.slice(Math.max(0, index - hvWindow), index + 1).map((item: any) => item.price);
          const hv = calculateHV(prices, hvWindow);
          
          return {
            date: h.date,
            callIV: h.callIV,
            putIV: h.putIV,
            netIV,
            ivRank,
            ivPercentile,
            hv,
            price: h.price,
            expiration: h.expiration
          };
        });
        
        setData(chartData);
      } else {
        // Fall back to single IV fetch if calculation fails
        const ivResponse = await fetch(`/api/implied-volatility?ticker=${ticker}&weeks=6`);
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

  return (
    <div className="bg-black p-6">
      {/* Header Section */}
      <div className="border-b border-[#ff8c00]/30 pb-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 flex justify-center">
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#ff8c00] via-[#00d4ff] to-[#ff8c00] tracking-wider uppercase" style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em' }}>
              IMPLIED VOLATILITY TRACKER
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-2 h-2 bg-[#00ff00] rounded-full animate-pulse"></div>
            <span>LIVE MARKET DATA</span>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="grid grid-cols-12 gap-4 mb-6">
        <div className="col-span-6 bg-[#0a0a0a] border border-gray-800 rounded-lg p-4">
          <label className="text-xs font-semibold text-[#ff8c00] mb-3 block tracking-wider">UNDERLYING SYMBOL</label>
          <input
            className="w-full bg-black border border-gray-700 rounded-md px-4 py-3 text-white text-lg font-bold tracking-widest focus:outline-none focus:border-[#00d4ff] transition-colors uppercase"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="TICKER"
          />
        </div>

        <div className="col-span-3 bg-[#0a0a0a] border border-gray-800 rounded-lg p-4">
          <label className="text-xs font-semibold text-[#ff8c00] mb-3 block tracking-wider">LOOKBACK PERIOD</label>
          <select
            className="w-full bg-black border border-gray-700 rounded-md px-4 py-3 text-white text-lg font-bold tracking-widest focus:outline-none focus:border-[#00d4ff] transition-colors cursor-pointer"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
            value={lookbackPeriod}
            onChange={(e) => setLookbackPeriod(Number(e.target.value))}
          >
            <option value={365}>1 YEAR</option>
            <option value={730}>2 YEARS</option>
            <option value={1095}>3 YEARS</option>
            <option value={1460}>4 YEARS</option>
          </select>
        </div>

        <div className="col-span-3 flex items-end">
          <button
            onClick={fetchData}
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#ff8c00] to-[#ff6b00] hover:from-[#ff9d1a] hover:to-[#ff7c1a] text-black py-3 rounded-md font-bold text-lg tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#ff8c00]/20"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            {loading ? 'COMPUTING IV...' : 'CALCULATE IV'}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 border-l-4 border-red-500 rounded-r-lg flex items-start gap-3">
          <AlertCircle className="text-red-400 w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-red-400 font-semibold text-sm mb-1">CALCULATION ERROR</div>
            <div className="text-red-300 text-sm">{error}</div>
          </div>
        </div>
      )}

      {/* Metrics Dashboard */}
      {currentPrice && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00d4ff]/5 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="text-[#00d4ff] w-5 h-5" />
                <span className="text-xs font-semibold text-gray-400 tracking-wider">SPOT PRICE</span>
              </div>
              <div className="text-4xl font-bold text-white mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                ${currentPrice.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500">CURRENT MARKET</div>
            </div>
          </div>

          <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="text-green-400 w-5 h-5" />
                <span className="text-xs font-semibold text-gray-400 tracking-wider">
                  CALL IV (45-DAY)
                </span>
              </div>
              <div className="text-4xl font-bold text-green-400 mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {currentCallIV ? `${currentCallIV.toFixed(2)}%` : 'N/A'}
              </div>
              <div className="text-xs text-gray-500">AVG 10 OTM STRIKES</div>
            </div>
          </div>

          <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="text-red-400 w-5 h-5" />
                <span className="text-xs font-semibold text-gray-400 tracking-wider">
                  PUT IV (45-DAY)
                </span>
              </div>
              <div className="text-4xl font-bold text-red-400 mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {currentPutIV ? `${currentPutIV.toFixed(2)}%` : 'N/A'}
              </div>
              <div className="text-xs text-gray-500">AVG 10 OTM STRIKES</div>
            </div>
          </div>
        </div>
      )}

      {/* IV Skew Indicator */}
      {currentCallIV && currentPutIV && (
        <div className="mb-6 bg-[#0a0a0a] border border-gray-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[#ff8c00] mb-1 tracking-wider">PUT/CALL IV SKEW</h3>
              <p className="text-xs text-gray-500">Measure of directional volatility bias</p>
            </div>
            <div className="text-2xl font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              <span className={currentPutIV > currentCallIV ? 'text-red-400' : 'text-green-400'}>
                {((currentPutIV / currentCallIV - 1) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="flex gap-2 h-3 bg-black rounded-full overflow-hidden">
            <div 
              className="bg-green-500 transition-all duration-500" 
              style={{ width: `${(currentCallIV / (currentCallIV + currentPutIV)) * 100}%` }}
            ></div>
            <div 
              className="bg-red-500 transition-all duration-500" 
              style={{ width: `${(currentPutIV / (currentCallIV + currentPutIV)) * 100}%` }}
            ></div>
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-green-400 font-semibold">CALL BIAS</span>
            <span className="text-red-400 font-semibold">PUT BIAS</span>
          </div>
        </div>
      )}

      {/* Historical IV Chart */}
      {data.length > 0 && (
        <div className="space-y-1">
          {/* Main IV Chart */}
          <div className="bg-black border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-[#ff8c00] tracking-wider uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                IMPLIED VOLATILITY
              </h3>
              <div className="flex gap-4 text-xs">
                <button
                  onClick={() => setShowCallIV(!showCallIV)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${
                    showCallIV 
                      ? 'bg-green-400/10 border-green-400 text-green-400' 
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <span>CALL IV</span>
                </button>
                <button
                  onClick={() => setShowPutIV(!showPutIV)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${
                    showPutIV 
                      ? 'bg-red-400/10 border-red-400 text-red-400' 
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <span>PUT IV</span>
                </button>
                <button
                  onClick={() => setShowNetIV(!showNetIV)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${
                    showNetIV 
                      ? 'bg-[#ff8c00]/10 border-[#ff8c00] text-[#ff8c00]' 
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <div className="w-3 h-3 bg-[#ff8c00] rounded-full"></div>
                  <span>NET IV</span>
                </button>
              </div>
            </div>
            
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 1 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="date" 
                  stroke="#ffffff"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: '#ffffff', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, opacity: 1 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${months[date.getMonth()]} ${date.getDate()}`;
                  }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis 
                  stroke="#ffffff" 
                  tick={{ fill: '#ffffff', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
                  label={{ 
                    value: 'IV (%)', 
                    angle: -90, 
                    position: 'insideLeft', 
                    fill: '#fff',
                    fontSize: 11,
                    fontWeight: 'bold'
                  }}
                  domain={['auto', 'auto']}
                  width={60}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#000', 
                    border: '1px solid #ff8c00', 
                    borderRadius: '8px',
                    padding: '12px',
                    fontFamily: 'JetBrains Mono, monospace'
                  }}
                  labelStyle={{ color: '#ff8c00', fontWeight: 'bold', marginBottom: '8px' }}
                  itemStyle={{ color: '#fff', fontSize: '13px' }}
                />
                {showCallIV && (
                  <Line 
                    type="monotone" 
                    dataKey="callIV" 
                    name="Call IV" 
                    stroke="#00ff00" 
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {showPutIV && (
                  <Line 
                    type="monotone" 
                    dataKey="putIV" 
                    name="Put IV" 
                    stroke="#ff0000" 
                    strokeWidth={2}
                    dot={false}
                  />
                )}
                {showNetIV && (
                  <Line 
                    type="monotone" 
                    dataKey="netIV" 
                    name="Net IV" 
                    stroke="#ff8c00" 
                    strokeWidth={2.5}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* IV Rank Panel */}
          <div className="bg-black border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-black text-[#ff6b9d] tracking-wider uppercase mb-4" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              IV RANK
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 1 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="date" 
                  stroke="#ffffff"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: '#ffffff', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, opacity: 1 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${months[date.getMonth()]} ${date.getDate()}`;
                  }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis 
                  stroke="#ffffff" 
                  tick={{ fill: '#ffffff', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
                  label={{ 
                    value: 'Rank (%)', 
                    angle: -90, 
                    position: 'insideLeft', 
                    fill: '#fff',
                    fontSize: 11,
                    fontWeight: 'bold'
                  }}
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#000', 
                    border: '1px solid #ff6b9d', 
                    borderRadius: '8px',
                    padding: '12px',
                    fontFamily: 'JetBrains Mono, monospace'
                  }}
                  labelStyle={{ color: '#ff6b9d', fontWeight: 'bold', marginBottom: '8px' }}
                  itemStyle={{ color: '#fff', fontSize: '13px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="ivRank" 
                  name="IV Rank" 
                  stroke="#ff6b9d" 
                  strokeWidth={2.5}
                  dot={false}
                />
                <ReferenceLine y={50} stroke="#666" strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* IV Percentile Panel */}
          <div className="bg-black border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-black text-[#00ff88] tracking-wider uppercase mb-4" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              IV PERCENTILE
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 1 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="date" 
                  stroke="#ffffff"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: '#ffffff', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, opacity: 1 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${months[date.getMonth()]} ${date.getDate()}`;
                  }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis 
                  stroke="#ffffff" 
                  tick={{ fill: '#ffffff', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
                  label={{ 
                    value: 'Percentile (%)', 
                    angle: -90, 
                    position: 'insideLeft', 
                    fill: '#fff',
                    fontSize: 11,
                    fontWeight: 'bold'
                  }}
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#000', 
                    border: '1px solid #00ff88', 
                    borderRadius: '8px',
                    padding: '12px',
                    fontFamily: 'JetBrains Mono, monospace'
                  }}
                  labelStyle={{ color: '#00ff88', fontWeight: 'bold', marginBottom: '8px' }}
                  itemStyle={{ color: '#fff', fontSize: '13px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="ivPercentile" 
                  name="IV Percentile" 
                  stroke="#00ff88" 
                  strokeWidth={2.5}
                  dot={false}
                />
                <ReferenceLine y={50} stroke="#666" strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Historical Volatility Panel */}
          <div className="bg-black border border-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[#00d4ff] tracking-wider uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                HISTORICAL VOLATILITY
              </h3>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => {
                    setHvWindow(10);
                    recalculateHV(10);
                  }}
                  className={`px-3 py-1.5 rounded-md border transition-all ${
                    hvWindow === 10
                      ? 'bg-[#00d4ff]/10 border-[#00d4ff] text-[#00d4ff] font-bold'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  10D
                </button>
                <button
                  onClick={() => {
                    setHvWindow(20);
                    recalculateHV(20);
                  }}
                  className={`px-3 py-1.5 rounded-md border transition-all ${
                    hvWindow === 20
                      ? 'bg-[#00d4ff]/10 border-[#00d4ff] text-[#00d4ff] font-bold'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  20D
                </button>
                <button
                  onClick={() => {
                    setHvWindow(30);
                    recalculateHV(30);
                  }}
                  className={`px-3 py-1.5 rounded-md border transition-all ${
                    hvWindow === 30
                      ? 'bg-[#00d4ff]/10 border-[#00d4ff] text-[#00d4ff] font-bold'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  30D
                </button>
                <button
                  onClick={() => {
                    setHvWindow(60);
                    recalculateHV(60);
                  }}
                  className={`px-3 py-1.5 rounded-md border transition-all ${
                    hvWindow === 60
                      ? 'bg-[#00d4ff]/10 border-[#00d4ff] text-[#00d4ff] font-bold'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  60D
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 1 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis 
                  dataKey="date" 
                  stroke="#ffffff"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fill: '#ffffff', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, opacity: 1 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${months[date.getMonth()]} ${date.getDate()}`;
                  }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis 
                  stroke="#ffffff" 
                  tick={{ fill: '#ffffff', fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
                  label={{ 
                    value: 'HV (%)', 
                    angle: -90, 
                    position: 'insideLeft', 
                    fill: '#fff',
                    fontSize: 11,
                    fontWeight: 'bold'
                  }}
                  domain={['auto', 'auto']}
                  width={60}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#000', 
                    border: '1px solid #00d4ff', 
                    borderRadius: '8px',
                    padding: '12px',
                    fontFamily: 'JetBrains Mono, monospace'
                  }}
                  labelStyle={{ color: '#00d4ff', fontWeight: 'bold', marginBottom: '8px' }}
                  itemStyle={{ color: '#fff', fontSize: '13px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="hv" 
                  name={`HV ${hvWindow}D`}
                  stroke="#00d4ff" 
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}