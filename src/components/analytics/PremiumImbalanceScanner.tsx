import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Activity, Zap } from 'lucide-react';
import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols';

interface PremiumImbalance {
  symbol: string;
  stockPrice: number;
  atmStrike: number;     // Midpoint between call and put strikes
  callMid: number;
  callBid: number;
  callAsk: number;
  callSpreadPercent: number;
  putMid: number;
  putBid: number;
  putAsk: number;
  putSpreadPercent: number;
  premiumDifference: number;
  imbalancePercent: number;
  expensiveSide: 'CALLS' | 'PUTS';
  imbalanceSeverity: 'EXTREME' | 'HIGH' | 'MODERATE';
  strikeSpacing: number;
  putStrike: number;     // First OTM put (below stock price)
  callStrike: number;    // First OTM call (above stock price)
}

const PremiumImbalanceScanner = () => {
  const [results, setResults] = useState<PremiumImbalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [symbols] = useState(TOP_1000_SYMBOLS.join(','));
  const [expiry, setExpiry] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [scanningSymbol, setScanningSymbol] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  // Calculate next monthly expiration
  const getNextMonthlyExpiry = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const nextMonth = new Date(year, month + 1, 1);
    
    let firstFriday = 1;
    while (new Date(nextMonth.getFullYear(), nextMonth.getMonth(), firstFriday).getDay() !== 5) {
      firstFriday++;
    }
    
    const thirdFriday = firstFriday + 14;
    const expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), thirdFriday);
    
    const yyyy = expiryDate.getFullYear();
    const mm = String(expiryDate.getMonth() + 1).padStart(2, '0');
    const dd = String(expiryDate.getDate()).padStart(2, '0');
    
    return `${yyyy}-${mm}-${dd}`;
  };

  useEffect(() => {
    const monthlyExpiry = getNextMonthlyExpiry();
    setExpiry(monthlyExpiry);
  }, []);

  const scanMarket = async () => {
    setLoading(true);
    setResults([]);
    setScanProgress({ current: 0, total: symbols.split(',').length });
    
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      // Use Server-Sent Events for real-time streaming
      const eventSource = new EventSource(`/api/scan-premium-stream?symbols=${encodeURIComponent(symbols)}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress') {
          setScanProgress(data.progress);
          setScanningSymbol(data.symbol);
        } else if (data.type === 'result') {
          // Add result immediately as it's found
          setResults(prev => {
            const newResults = [...prev, data.result];
            // Sort by imbalance severity
            return newResults.sort((a, b) => 
              Math.abs(b.imbalancePercent) - Math.abs(a.imbalancePercent)
            );
          });
        } else if (data.type === 'complete') {
          setLoading(false);
          setLastUpdate(new Date());
          setScanningSymbol('');
          eventSource.close();
        } else if (data.type === 'error') {
          console.error('Scan error:', data.error);
        }
      };

      eventSource.onerror = () => {
        setLoading(false);
        setScanningSymbol('');
        eventSource.close();
      };

    } catch (error) {
      console.error('Scan error:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expiry) {
      scanMarket();
    }
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [expiry]);

  const formatExpiryDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const progressPercent = scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Bar - Solid Black with 3D Effects */}
      <div className="h-20 bg-black border-b-4 border-gray-600/50 shadow-2xl shadow-black/80 relative">
        {/* 3D Depth Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-black/30 pointer-events-none"></div>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-600/40 to-transparent"></div>
        {/* Side highlights for 3D depth */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
        
        {/* Title Section - Centered */}
        <div className="flex items-center justify-center pt-4 pb-2 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent drop-shadow-lg">
              OTM PREMIUM SCANNER
            </h1>
            <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center shadow-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
          </div>
        </div>
        
        {/* Subtitle & Info */}
        <div className="flex items-center justify-end px-6 pb-2 relative z-10">
          <div className="text-xs text-gray-300 font-medium">
            UPDATE: <span className="text-white font-bold drop-shadow">{lastUpdate ? lastUpdate.toLocaleTimeString() : '--:--:--'}</span>
          </div>
        </div>
      </div>

      {/* Control Panel - Premium Candy Black Design */}
      <div className="h-16 bg-black border-b border-gray-800/40 flex items-center px-6 gap-6 shadow-2xl relative backdrop-blur-sm">
        {/* Premium candy black depth effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-black/30 pointer-events-none"></div>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-600/50 to-transparent"></div>
        {/* Side highlights for premium candy effect */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent"></div>
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent"></div>
        
        {/* Premium Scan Button */}
        <button
          onClick={scanMarket}
          disabled={loading}
          className="relative h-12 px-8 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-sm transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-3 shadow-xl rounded-lg border border-blue-500/30 overflow-hidden group"
        >
          {/* Button premium effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20 group-hover:from-white/30"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>
          <RefreshCw className={`w-5 h-5 relative z-10 ${loading ? 'animate-spin' : ''}`} />
          <span className="relative z-10 font-black tracking-wide">{loading ? 'SCANNING' : 'SCAN'}</span>
        </button>
        
        {/* Premium Candy Black Expiry Info Box */}
        <div className="relative flex items-center gap-3 bg-gradient-to-br from-gray-900 via-black to-gray-900 px-4 py-3 rounded-lg border border-gray-700/50 shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-black/20"></div>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          <span className="relative z-10 text-gray-300 font-medium text-sm">EXPIRY:</span>
          <span className="relative z-10 text-white font-bold text-sm drop-shadow">{formatExpiryDate(expiry)}</span>
        </div>
        
        {loading && (
          <div className="flex-1 max-w-md relative">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-white font-bold drop-shadow">
                {scanningSymbol && <span className="text-blue-400 font-black">{scanningSymbol}</span>}
                {!scanningSymbol && <span className="text-gray-300">Processing...</span>}
              </span>
              <span className="text-white font-bold drop-shadow">{scanProgress.current} / {scanProgress.total}</span>
            </div>
            <div className="relative h-3 bg-gradient-to-r from-gray-900 via-black to-gray-900 overflow-hidden rounded-full border border-gray-700/50 shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-black/20"></div>
              <div 
                className="h-full bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 transition-all duration-500 shadow-lg relative z-10 rounded-full"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-full"></div>
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full"></div>
              </div>
            </div>
          </div>
        )}
        
        {!loading && (
          <>
            {/* Premium Candy Black Universe Box */}
            <div className="relative h-10 px-4 bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-gray-700/50 flex items-center text-sm shadow-xl rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-black/20"></div>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <span className="relative z-10 text-gray-300 font-medium mr-2">Universe:</span>
              <span className="relative z-10 text-white font-bold drop-shadow">{symbols.split(',').length} stocks</span>
            </div>
            
            {/* Premium Candy Black Qualified Box */}
            <div className="relative h-10 px-4 bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-gray-700/50 flex items-center text-sm shadow-xl rounded-lg overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-black/20"></div>
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <span className="relative z-10 text-gray-300 font-medium mr-2">Qualified:</span>
              <span className="relative z-10 text-white font-bold text-lg drop-shadow">{results.length}</span>
            </div>
          </>
        )}
        
        <div className="ml-auto flex gap-4 text-xs relative z-10">
          {/* Premium Candy Black Extreme Indicator */}
          <div className="relative flex items-center gap-2 bg-gradient-to-br from-gray-900 via-black to-gray-900 px-3 py-2 rounded-lg border border-red-500/30 shadow-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-black/20"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-400/30 to-transparent"></div>
            <div className="relative z-10 w-2 h-2 bg-red-400 rounded-full animate-pulse shadow-sm"></div>
            <span className="relative z-10 text-red-200 font-bold">EXTREME</span>
            <span className="relative z-10 text-white font-bold text-sm drop-shadow">{results.filter(r => r.imbalanceSeverity === 'EXTREME').length}</span>
          </div>
          
          {/* Premium Candy Black High Indicator */}
          <div className="relative flex items-center gap-2 bg-gradient-to-br from-gray-900 via-black to-gray-900 px-3 py-2 rounded-lg border border-yellow-500/30 shadow-xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-black/20"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-400/30 to-transparent"></div>
            <div className="relative z-10 w-2 h-2 bg-yellow-400 rounded-full shadow-sm"></div>
            <span className="relative z-10 text-yellow-200 font-bold">HIGH</span>
            <span className="relative z-10 text-white font-bold text-sm drop-shadow">{results.filter(r => r.imbalanceSeverity === 'HIGH').length}</span>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="p-6">
        {results.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-xl font-bold text-white mb-3">OTM Premium Scanner</div>
            <div className="text-sm mb-4 max-w-md text-gray-300">
              Scanning <span className="text-white font-bold">TOP 1000 STOCKS</span> for OTM premium imbalances.<br/>
              Compares first OTM calls (above) vs OTM puts (below) stock price.
            </div>
            <div className="text-xs text-gray-500">
              Example: Stock at $53.60 → Compare $54 calls vs $53 puts
            </div>
          </div>
        )}
        
        {results.length === 0 && loading && (
          <div className="flex flex-col items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 text-white animate-spin mb-4" />
            <div className="text-white text-sm font-medium">Scanning TOP 1000 stocks for OTM premium imbalances...</div>
            <div className="text-gray-400 text-xs mt-2">
              Finding calls above stock vs puts below stock imbalances
            </div>
          </div>
        )}
        
        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((result, idx) => (
              <div
                key={`${result.symbol}-${idx}`}
                className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border border-gray-600/30 hover:border-gray-500/60 hover:shadow-2xl hover:shadow-black/50 transition-all duration-500 animate-fadeIn backdrop-blur-sm shadow-xl"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="grid grid-cols-12 gap-4 p-4 items-center">
                  {/* Symbol & Price */}
                  <div className="col-span-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-black text-orange-500">{result.symbol}</span>
                      {result.imbalanceSeverity === 'EXTREME' && (
                        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                    <div className="text-sm text-white font-medium mt-0.5">${result.stockPrice.toFixed(2)}</div>
                  </div>

                  {/* OTM Strikes */}
                  <div className="col-span-1 text-center">
                    <div className="text-xs text-gray-300 font-bold mb-2 tracking-wider">STRIKES</div>
                    <div className="text-white font-bold text-sm">
                      ${result.putStrike} / ${result.callStrike}
                    </div>
                    <div className="text-xs text-gray-400 font-medium mt-1">({result.strikeSpacing} spacing)</div>
                  </div>

                  {/* OTM Calls (Above Stock) */}
                  <div className="col-span-2 bg-gradient-to-br from-green-900/30 via-green-800/20 to-black/60 border border-green-500/30 p-4 shadow-inner backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-300 font-bold tracking-wider">OTM CALLS</span>
                    </div>
                    <div className="text-xl font-black text-white">${result.callMid.toFixed(2)}</div>
                    <div className="text-xs text-gray-300 font-medium mt-2">${result.callStrike} | {result.callBid.toFixed(2)} × {result.callAsk.toFixed(2)}</div>
                  </div>

                  {/* OTM Puts (Below Stock) */}
                  <div className="col-span-2 bg-gradient-to-br from-red-900/30 via-red-800/20 to-black/60 border border-red-500/30 p-4 shadow-inner backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-red-400" />
                      <span className="text-xs text-red-300 font-bold tracking-wider">OTM PUTS</span>
                    </div>
                    <div className="text-xl font-black text-white">${result.putMid.toFixed(2)}</div>
                    <div className="text-xs text-gray-300 font-medium mt-2">${result.putStrike} | {result.putBid.toFixed(2)} × {result.putAsk.toFixed(2)}</div>
                  </div>

                  {/* Difference */}
                  <div className="col-span-2 text-center">
                    <div className="text-xs text-gray-300 font-bold mb-2 tracking-wider">DIFFERENCE</div>
                    <div className={`text-xl font-black ${result.premiumDifference > 0 ? 'text-green-300' : 'text-red-300'}`}>
                      ${Math.abs(result.premiumDifference).toFixed(2)}
                    </div>
                  </div>

                  {/* Imbalance */}
                  <div className="col-span-2 text-center">
                    <div className="text-xs text-gray-300 font-bold mb-2 tracking-wider">IMBALANCE</div>
                    <div className={`text-3xl font-black ${
                      result.imbalanceSeverity === 'EXTREME' ? 'text-red-500' :
                      result.imbalanceSeverity === 'HIGH' ? 'text-red-400' :
                      'text-yellow-400'
                    }`}>
                      {Math.abs(result.imbalancePercent).toFixed(1)}%
                    </div>
                  </div>

                  {/* Signal */}
                  <div className="col-span-1 flex justify-end">
                    <div className={`px-4 py-2 text-xs font-black tracking-wider ${
                      result.imbalanceSeverity === 'EXTREME' 
                        ? 'bg-gradient-to-r from-red-500 to-red-400 text-white shadow-2xl shadow-red-500/30' 
                        : result.imbalanceSeverity === 'HIGH'
                        ? 'bg-gradient-to-r from-red-400 to-red-300 text-white shadow-lg shadow-red-400/20'
                        : 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-black shadow-lg shadow-yellow-400/20'
                    }`}>
                      {result.imbalanceSeverity}
                    </div>
                  </div>
                </div>

                {/* Detailed Info Bar */}
                <div className="border-t border-gray-600/30 px-4 py-3 bg-gradient-to-r from-gray-900 via-black to-gray-900 flex items-center justify-between text-xs shadow-inner">
                  <div className="flex gap-8">
                    <span className="text-gray-300 font-medium">Call ${result.callStrike} Spread: <span className="text-white font-bold">{result.callSpreadPercent.toFixed(1)}%</span></span>
                    <span className="text-gray-300 font-medium">Put ${result.putStrike} Spread: <span className="text-white font-bold">{result.putSpreadPercent.toFixed(1)}%</span></span>
                  </div>
                  <div className="text-white font-bold tracking-wide">
                    {result.expensiveSide === 'CALLS' 
                      ? `→ OTM Calls ($${result.callStrike}) more expensive - BULLISH FLOW` 
                      : `→ OTM Puts ($${result.putStrike}) more expensive - BEARISH FLOW`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default PremiumImbalanceScanner;