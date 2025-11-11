import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, Activity, Target, BarChart3, Gauge } from 'lucide-react';

interface GEXData {
  strike: number;
  [key: string]: number | {call: number, put: number, net: number, callOI: number, putOI: number, callPremium?: number, putPremium?: number, callVex?: number, putVex?: number, callDelta?: number, putDelta?: number};
}

interface ServerGEXData {
  ticker: string;
  attractionLevel: number;
  dealerSweat: number;
  currentPrice: number;
  netGex: number;
  marketCap?: number;
  gexImpactScore?: number;
  largestWall?: {
    strike: number;
    gex: number;
    type: 'call' | 'put';
    pressure: number;
    cluster?: {
      strikes: number[];
      centralStrike: number;
      totalGEX: number;
      contributions: number[];
      type: 'call' | 'put';
    };
  };
}

interface OptionContract {
  ticker: string;
  expiration_date: string;
  strike_price: number;
  contract_type: 'call' | 'put';
}

interface MMData {
  strike: number;
  netMM: number;
  callMM: number;
  putMM: number;
  totalOI: number;
  daysToExpiry: number;
  impact: number;
}

interface MMDashboardProps {
  selectedTicker: string;
  currentPrice: number;
  gexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number}}};
  expirations: string[];
}

interface PPData {
  strike: number;
  totalOI: number;
  pinForce: number;
  distance: number;
  pullDirection: 'up' | 'down' | 'neutral';
  pinProbability: number;
  daysToExpiry: number;
}

interface MPDashboardProps {
  selectedTicker: string;
  currentPrice: number;
  gexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number}}};
  expirations: string[];
}

interface SIDashboardProps {
  selectedTicker: string;
  currentPrice: number;
  gexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number}}};
  vexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number}}};
  expirations: string[];
}

// MM Dashboard Component
const MMDashboard: React.FC<MMDashboardProps> = ({ selectedTicker, currentPrice, gexByStrikeByExpiration, expirations }) => {
  
  // Filter to 45-day expirations only
  const mmExpirations = useMemo(() => {
    const today = new Date();
    const maxDate = new Date(today.getTime() + (45 * 24 * 60 * 60 * 1000)); // 45 days from now
    
    return expirations.filter(exp => {
      const expDate = new Date(exp);
      return expDate <= maxDate;
    }).sort();
  }, [expirations]);

  // Calculate MM data with standard ±20% strike range
  const mmData = useMemo(() => {
    if (!currentPrice || Object.keys(gexByStrikeByExpiration).length === 0) return [];
    
    const strikeRange = currentPrice * 0.20; // ±20% standard range
    const minStrike = currentPrice - strikeRange;
    const maxStrike = currentPrice + strikeRange;
    
    const allStrikes = new Set<number>();
    mmExpirations.forEach(exp => {
      if (gexByStrikeByExpiration[exp]) {
        Object.keys(gexByStrikeByExpiration[exp])
          .map(Number)
          .filter(strike => strike >= minStrike && strike <= maxStrike)
          .forEach(strike => allStrikes.add(strike));
      }
    });

    const mmByStrike: MMData[] = Array.from(allStrikes).map(strike => {
      let totalCallMM = 0;
      let totalPutMM = 0;
      let totalOI = 0;
      let avgDaysToExpiry = 0;
      let validExpirations = 0;

      mmExpirations.forEach(exp => {
        const strikeData = gexByStrikeByExpiration[exp]?.[strike];
        if (strikeData) {
          // Convert GEX to MM: MM = GEX / (Stock Price * 0.01) for 1% move
          const callMM = strikeData.call / (currentPrice * 0.01);
          const putMM = strikeData.put / (currentPrice * 0.01);
          
          totalCallMM += callMM;
          totalPutMM += putMM;
          totalOI += (strikeData.callOI || 0) + (strikeData.putOI || 0);
          
          // Calculate days to expiry
          const expDate = new Date(exp);
          const today = new Date();
          const daysToExp = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          avgDaysToExpiry += daysToExp;
          validExpirations++;
        }
      });

      if (validExpirations > 0) {
        avgDaysToExpiry = avgDaysToExpiry / validExpirations;
      }

      const netMM = totalCallMM + totalPutMM;
      
      return {
        strike,
        netMM,
        callMM: totalCallMM,
        putMM: totalPutMM,
        totalOI,
        daysToExpiry: Math.round(avgDaysToExpiry),
        impact: Math.abs(netMM)
      };
    }).sort((a, b) => b.strike - a.strike);

    return mmByStrike;
  }, [currentPrice, gexByStrikeByExpiration, mmExpirations]);

  // Calculate aggregate metrics
  const metrics = useMemo(() => {
    const totalNetMM = mmData.reduce((sum, item) => sum + item.netMM, 0);
    const maxCallWall = mmData.reduce((max, item) => item.callMM > max.callMM ? item : max, mmData[0] || { callMM: 0, strike: 0 });
    const maxPutFloor = mmData.reduce((max, item) => Math.abs(item.putMM) > Math.abs(max.putMM) ? item : max, mmData[0] || { putMM: 0, strike: 0 });
    
    return {
      totalNetMM,
      maxCallWall,
      maxPutFloor,
      isLongGamma: totalNetMM > 0,
      reflexivity: Math.abs(totalNetMM) / 1000000 // Convert to millions for display
    };
  }, [mmData]);

  const formatMM = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '+';
    
    if (absValue >= 1e9) {
      return `${sign}$${(absValue / 1e9).toFixed(2)}B`;
    } else if (absValue >= 1e6) {
      return `${sign}$${(absValue / 1e6).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${sign}$${(absValue / 1000).toFixed(1)}K`;
    }
    return `${sign}$${absValue.toFixed(0)}`;
  };

  const formatOI = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-black border-2 border-orange-500/50 p-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white uppercase tracking-wider">
            MM SWEAT
          </h2>
        </div>
      </div>

      {/* Trading Actions Panel */}
      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-2 border-blue-500/50 p-6 rounded-lg">
        
        <div className="grid grid-cols-1 gap-4">
          {/* Primary Signal */}
          <div className={`p-4 rounded-lg border-2 ${
            metrics.totalNetMM > 500000000 ? 'bg-green-900/30 border-green-400' :
            metrics.totalNetMM < -500000000 ? 'bg-red-900/30 border-red-400' :
            'bg-yellow-900/30 border-yellow-400'
          }`}>
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                metrics.totalNetMM > 500000000 ? 'text-green-400' :
                metrics.totalNetMM < -500000000 ? 'text-red-400' :
                'text-yellow-400'
              }`}>
                {metrics.totalNetMM > 500000000 ? '🔥 BUY SETUP' :
                 metrics.totalNetMM < -500000000 ? '⚡ SELL SETUP' :
                 '⏸️ WAIT'}
              </div>
              <div className="text-sm text-gray-300 mt-1">
                {metrics.totalNetMM > 500000000 ? 'Strong Long Gamma - Dealers will buy dips' :
                 metrics.totalNetMM < -500000000 ? 'Strong Short Gamma - Dealers will sell rallies' :
                 'Neutral Zone - Wait for clearer signal'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Reflexivity Gauge */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="text-orange-400" size={20} />
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Reflexivity Gauge</h3>
          </div>
          
          <div className="relative">
            <div className="w-full h-32 bg-gray-900 rounded-lg overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 via-gray-800/20 to-green-600/20"></div>
              
              {/* Gauge needle */}
              <div className="absolute inset-0 flex items-end justify-center">
                <div 
                  className="w-1 h-16 bg-yellow-400 transform-gpu transition-transform duration-500"
                  style={{
                    transformOrigin: 'bottom center',
                    transform: `rotate(${Math.max(-45, Math.min(45, (metrics.totalNetMM / 1000000) * 10))}deg)`
                  }}
                />
              </div>
              
              {/* Labels */}
              <div className="absolute top-2 left-2 text-xs text-red-400 font-bold">AMPLIFY</div>
              <div className="absolute top-2 right-2 text-xs text-green-400 font-bold">DAMPEN</div>
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 font-bold">NEUTRAL</div>
            </div>
            
            <div className="text-center mt-4">
              <div className="text-lg font-bold text-white">
                {formatMM(metrics.totalNetMM)} / 1%
              </div>
              <div className="text-xs text-orange-400 uppercase">
                {metrics.isLongGamma ? 'LONG GAMMA' : 'SHORT GAMMA'}
              </div>
            </div>
          </div>
        </div>

        {/* Key Levels */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="text-orange-400" size={20} />
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Key Levels</h3>
          </div>
          
          <div className="space-y-4">
            {/* Call Wall */}
            <div className="bg-green-900/20 border border-green-600/30 p-3 rounded">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-green-400 font-bold text-xs uppercase">Call Wall</span>
              </div>
              <div className="text-white font-bold text-lg">${metrics.maxCallWall?.strike?.toFixed(0)}</div>
              <div className="text-green-400 text-sm">{formatMM(metrics.maxCallWall?.callMM || 0)}</div>
            </div>

            {/* Current Price */}
            <div className="bg-yellow-900/20 border border-yellow-600/30 p-3 rounded">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span className="text-yellow-400 font-bold text-xs uppercase">Current</span>
              </div>
              <div className="text-white font-bold text-lg">${currentPrice?.toFixed(2)}</div>
              <div className="text-yellow-400 text-sm">Net: {formatMM(metrics.totalNetMM)}</div>
            </div>

            {/* Put Floor */}
            <div className="bg-red-900/20 border border-red-600/30 p-3 rounded">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                <span className="text-red-400 font-bold text-xs uppercase">Put Floor</span>
              </div>
              <div className="text-white font-bold text-lg">${metrics.maxPutFloor?.strike?.toFixed(0)}</div>
              <div className="text-red-400 text-sm">{formatMM(metrics.maxPutFloor?.putMM || 0)}</div>
            </div>
          </div>
        </div>

        {/* Strike Pressure Map */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-orange-400" size={20} />
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Strike Pressure</h3>
          </div>
          
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {mmData.slice(0, 10).map((item, idx) => {
              const maxImpact = Math.max(...mmData.map(d => d.impact));
              const barWidth = maxImpact > 0 ? (item.impact / maxImpact) * 100 : 0;
              const isCurrentPrice = Math.abs(item.strike - currentPrice) < 1;
              
              return (
                <div key={item.strike} className="flex items-center gap-2 text-xs">
                  <div className={`w-12 text-right font-mono ${isCurrentPrice ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
                    {item.strike.toFixed(0)}
                  </div>
                  <div className="flex-1 bg-gray-800 rounded-sm h-4 relative overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        item.netMM > 0 ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className={`w-16 text-right font-mono ${
                    item.netMM > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatMM(item.netMM)}
                  </div>
                  {isCurrentPrice && <span className="text-yellow-400 text-xs">•</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detailed Strike Table */}
      <div className="bg-black border border-gray-600">
        <div className="bg-black px-6 py-4 border-b border-gray-600">
          <h3 className="text-white font-black uppercase text-lg tracking-widest">MM BY STRIKE</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-4 text-left text-sm font-black text-orange-400 uppercase tracking-widest">Strike</th>
                <th className="px-4 py-4 text-right text-sm font-black text-orange-400 uppercase tracking-widest">Net MM</th>
                <th className="px-4 py-4 text-right text-sm font-black text-green-500 uppercase tracking-widest">Call MM</th>
                <th className="px-4 py-4 text-right text-sm font-black text-red-500 uppercase tracking-widest">Put MM</th>
                <th className="px-4 py-4 text-right text-sm font-black text-orange-400 uppercase tracking-widest">Total OI</th>
                <th className="px-4 py-4 text-right text-sm font-black text-orange-400 uppercase tracking-widest">Days</th>
                <th className="px-4 py-4 text-left text-sm font-black text-orange-400 uppercase tracking-widest">Impact</th>
              </tr>
            </thead>
            <tbody>
              {mmData.map((item, idx) => {
                const isCurrentPrice = Math.abs(item.strike - currentPrice) < 1;
                const maxImpact = Math.max(...mmData.map(d => d.impact));
                const impactBars = maxImpact > 0 ? Math.round((item.impact / maxImpact) * 8) : 0;
                
                return (
                  <tr 
                    key={item.strike} 
                    className={`border-b border-gray-800 hover:bg-gray-900/50 ${
                      isCurrentPrice ? 'bg-yellow-900/20' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className={`font-mono font-bold ${isCurrentPrice ? 'text-yellow-400' : 'text-white'}`}>
                        ${item.strike.toFixed(1)}
                        {isCurrentPrice && <span className="ml-2 text-xs text-yellow-400">CURRENT</span>}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${
                      item.netMM > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatMM(item.netMM)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-400">
                      {formatMM(item.callMM)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-400">
                      {formatMM(item.putMM)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      {formatOI(item.totalOI)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      {item.daysToExpiry}d
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        <div className="text-orange-400 font-mono">
                          {'█'.repeat(Math.max(1, impactBars))}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>


    </div>
  );
};

// MP Dashboard Component
const MPDashboard: React.FC<MPDashboardProps> = ({ selectedTicker, currentPrice, gexByStrikeByExpiration, expirations }) => {
  
  const [selectedExpiration, setSelectedExpiration] = useState<string>('');
  
  // Get available future expirations
  const availableExpirations = useMemo(() => {
    const today = new Date();
    return expirations.filter(exp => new Date(exp) >= today).sort();
  }, [expirations]);

  // Auto-select default expiration (monthly or next available)
  useEffect(() => {
    if (availableExpirations.length > 0 && !selectedExpiration) {
      const today = new Date();
      
      // Find monthly expirations (usually 3rd Friday, between 14th-22nd)
      const monthlyExps = availableExpirations.filter(exp => {
        const expDate = new Date(exp);
        const dayOfMonth = expDate.getDate();
        return dayOfMonth >= 14 && dayOfMonth <= 22;
      });
      
      // Default to monthly if available, otherwise next available
      const defaultExp = monthlyExps.length > 0 ? monthlyExps[0] : availableExpirations[0];
      setSelectedExpiration(defaultExp);
    }
  }, [availableExpirations, selectedExpiration]);

  // Use selected expiration for analysis
  const ppExpirations = useMemo(() => {
    return selectedExpiration ? [selectedExpiration] : [];
  }, [selectedExpiration]);

  // Calculate Max Pain data
  const ppData = useMemo(() => {
    if (!currentPrice || Object.keys(gexByStrikeByExpiration).length === 0) return [];
    
    const strikeRange = currentPrice * 0.20; // ±20% range for pinning analysis
    const minStrike = currentPrice - strikeRange;
    const maxStrike = currentPrice + strikeRange;
    
    const allStrikes = new Set<number>();
    ppExpirations.forEach(exp => {
      if (gexByStrikeByExpiration[exp]) {
        Object.keys(gexByStrikeByExpiration[exp])
          .map(Number)
          .filter(strike => strike >= minStrike && strike <= maxStrike)
          .forEach(strike => allStrikes.add(strike));
      }
    });

    const ppByStrike: PPData[] = Array.from(allStrikes).map(strike => {
      let totalOI = 0;
      let avgDaysToExpiry = 0;
      let validExpirations = 0;

      ppExpirations.forEach(exp => {
        const strikeData = gexByStrikeByExpiration[exp]?.[strike];
        if (strikeData) {
          totalOI += (strikeData.callOI || 0) + (strikeData.putOI || 0);
          
          // Calculate days to expiry
          const expDate = new Date(exp);
          const today = new Date();
          const daysToExp = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          avgDaysToExpiry += daysToExp;
          validExpirations++;
        }
      });

      if (validExpirations > 0) {
        avgDaysToExpiry = avgDaysToExpiry / validExpirations;
      }

      const distance = strike - currentPrice;
      const absDistance = Math.abs(distance);
      
      // Calculate pin force: Higher OI + Closer to current price + Shorter time = Higher pin force
      const distanceFactor = 1 / (1 + absDistance * 0.1); // Inverse distance weighting
      const timeFactor = avgDaysToExpiry > 0 ? (8 - Math.min(7, avgDaysToExpiry)) / 7 : 1; // Time decay factor
      const pinForce = totalOI * distanceFactor * timeFactor;
      
      // Calculate pin probability (0-100%)
      const maxPossibleForce = 200000; // Adjust based on typical max OI
      const pinProbability = Math.min(100, (pinForce / maxPossibleForce) * 100);
      
      // Determine pull direction
      let pullDirection: 'up' | 'down' | 'neutral' = 'neutral';
      if (distance > 0.5) pullDirection = 'down';
      else if (distance < -0.5) pullDirection = 'up';
      
      return {
        strike,
        totalOI,
        pinForce,
        distance,
        pullDirection,
        pinProbability,
        daysToExpiry: Math.round(avgDaysToExpiry)
      };
    }).filter(item => item.totalOI > 100) // Filter out strikes with minimal OI
      .sort((a, b) => b.pinForce - a.pinForce); // Sort by pin force

    return ppByStrike;
  }, [currentPrice, gexByStrikeByExpiration, ppExpirations]);

  // Calculate Max Pain and aggregate metrics
  const metrics = useMemo(() => {
    const maxPainStrike = ppData.reduce((max, current) => 
      current.pinForce > max.pinForce ? current : max, 
      ppData[0] || { pinForce: 0, strike: currentPrice, pinProbability: 0 }
    );
    
    const avgDaysToExpiry = ppData.length > 0 
      ? ppData.reduce((sum, item) => sum + item.daysToExpiry, 0) / ppData.length 
      : 0;
    
    const overallPinStrength = Math.min(100, maxPainStrike.pinProbability || 0);
    
    // Pin strength categories
    let pinStrengthLevel = 'LOW';
    let pinColor = 'text-gray-400';
    if (overallPinStrength >= 80) { pinStrengthLevel = 'VERY HIGH'; pinColor = 'text-red-400'; }
    else if (overallPinStrength >= 60) { pinStrengthLevel = 'HIGH'; pinColor = 'text-orange-400'; }
    else if (overallPinStrength >= 40) { pinStrengthLevel = 'MEDIUM'; pinColor = 'text-yellow-400'; }
    
    return {
      maxPainStrike: maxPainStrike.strike,
      maxPainForce: maxPainStrike.pinForce,
      overallPinStrength,
      pinStrengthLevel,
      pinColor,
      avgDaysToExpiry: Math.round(avgDaysToExpiry),
      distanceFromMaxPain: Math.abs(currentPrice - maxPainStrike.strike)
    };
  }, [ppData, currentPrice]);

  const formatOI = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toLocaleString();
  };

  const formatDistance = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-black border-2 border-green-500/50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-white uppercase tracking-wider text-center">
              PINNING PRESSURE ANALYSIS → MAX PAIN ANALYSIS
            </h2>
          </div>
          
          {/* Expiration Selector */}
          <div className="flex items-center gap-3">
            <span className="text-green-400 font-bold text-sm uppercase tracking-wider">EXPIRY:</span>
            <div className="relative">
              <select
                value={selectedExpiration}
                onChange={(e) => setSelectedExpiration(e.target.value)}
                className="bg-black border-2 border-green-600 focus:border-green-400 focus:outline-none px-4 py-2 pr-10 text-white text-sm font-bold uppercase appearance-none cursor-pointer min-w-[140px] transition-all"
              >
                {availableExpirations.map(exp => {
                  // Parse as local date to avoid timezone conversion issues
                  const [year, month, day] = exp.split('-').map(Number);
                  const expDate = new Date(year, month - 1, day); // month is 0-indexed
                  const dayOfMonth = expDate.getDate();
                  const isMonthly = dayOfMonth >= 14 && dayOfMonth <= 22;
                  
                  // Calculate days to expiry using local dates
                  const today = new Date();
                  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const daysToExp = Math.ceil((expDate.getTime() - todayLocal.getTime()) / (1000 * 60 * 60 * 24));
                  
                  return (
                    <option key={exp} value={exp}>
                      {expDate.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        timeZone: 'America/New_York' // Use ET timezone for options consistency
                      })} {isMonthly ? '(M)' : ''} - {daysToExp}d
                    </option>
                  );
                })}
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Pin Strength Meter */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="text-green-400" size={20} />
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Pin Strength</h3>
          </div>
          
          <div className="text-center">
            <div className="relative w-32 h-32 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-8 border-gray-800"></div>
              <div 
                className={`absolute inset-0 rounded-full border-8 border-transparent`}
                style={{
                  borderTopColor: metrics.overallPinStrength >= 80 ? '#ef4444' :
                                 metrics.overallPinStrength >= 60 ? '#f97316' :
                                 metrics.overallPinStrength >= 40 ? '#eab308' : '#6b7280',
                  transform: `rotate(${(metrics.overallPinStrength / 100) * 360 - 90}deg)`,
                  clipPath: 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 50% 100%)'
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${metrics.pinColor}`}>
                    {metrics.overallPinStrength.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-400">PIN FORCE</div>
                </div>
              </div>
            </div>
            
            <div className={`text-lg font-bold ${metrics.pinColor} mb-2`}>
              {metrics.pinStrengthLevel}
            </div>
            <div className="text-sm text-gray-300">
              {metrics.avgDaysToExpiry} days to expiry
            </div>
          </div>
        </div>

        {/* Max Pain Zone */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="text-green-400" size={20} />
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Max Pain Zone</h3>
          </div>
          
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-400 mb-2">
                ${metrics.maxPainStrike.toFixed(0)}
              </div>
              <div className="text-sm text-gray-300">Maximum Pain Strike</div>
            </div>
            
            <div className="bg-gray-900/50 p-3 rounded">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-300 text-sm">Current Price:</span>
                <span className="text-white font-bold">${currentPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-300 text-sm">Distance:</span>
                <span className={`font-bold ${
                  metrics.distanceFromMaxPain > 2 ? 'text-green-400' : 
                  metrics.distanceFromMaxPain > 1 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  ${metrics.distanceFromMaxPain.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300 text-sm">Pull Direction:</span>
                <span className={`font-bold ${
                  currentPrice > metrics.maxPainStrike ? 'text-red-400' : 'text-green-400'
                }`}>
                  {currentPrice > metrics.maxPainStrike ? 'DOWN ↓' : 'UP ↑'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Time Decay Effect */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-green-400" size={20} />
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Time Decay</h3>
          </div>
          
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400 mb-2">
                {metrics.avgDaysToExpiry} Days
              </div>
              <div className="text-sm text-gray-300">Until Expiration</div>
            </div>
            
            <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  metrics.avgDaysToExpiry <= 1 ? 'bg-red-500' :
                  metrics.avgDaysToExpiry <= 3 ? 'bg-orange-500' :
                  metrics.avgDaysToExpiry <= 5 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.max(10, 100 - (metrics.avgDaysToExpiry / 7) * 100)}%` }}
              />
            </div>
            
            <div className="text-center">
              <div className={`text-sm font-bold ${
                metrics.avgDaysToExpiry <= 1 ? 'text-red-400' :
                metrics.avgDaysToExpiry <= 3 ? 'text-orange-400' :
                metrics.avgDaysToExpiry <= 5 ? 'text-yellow-400' : 'text-green-400'
              }`}>
                {metrics.avgDaysToExpiry <= 1 ? 'EXTREME PINNING' :
                 metrics.avgDaysToExpiry <= 3 ? 'HIGH PINNING' :
                 metrics.avgDaysToExpiry <= 5 ? 'MODERATE PINNING' : 'LOW PINNING'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Strike Pin Map */}
      <div className="bg-black border border-gray-600">
        <div className="bg-black px-6 py-4 border-b border-gray-600">
          <h3 className="text-white font-black uppercase text-lg tracking-widest">PIN PRESSURE BY STRIKE</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-4 text-left text-sm font-black text-green-400 uppercase tracking-widest">Strike</th>
                <th className="px-4 py-4 text-right text-sm font-black text-green-400 uppercase tracking-widest">Total OI</th>
                <th className="px-4 py-4 text-right text-sm font-black text-green-400 uppercase tracking-widest">Pin Force</th>
                <th className="px-4 py-4 text-right text-sm font-black text-green-400 uppercase tracking-widest">Distance</th>
                <th className="px-4 py-4 text-right text-sm font-black text-green-400 uppercase tracking-widest">Pin %</th>
                <th className="px-4 py-4 text-right text-sm font-black text-green-400 uppercase tracking-widest">Days</th>
                <th className="px-4 py-4 text-center text-sm font-black text-green-400 uppercase tracking-widest">Pull</th>
              </tr>
            </thead>
            <tbody>
              {ppData.slice(0, 15).map((item, idx) => {
                const isMaxPain = Math.abs(item.strike - metrics.maxPainStrike) < 0.1;
                const isCurrentPrice = Math.abs(item.strike - currentPrice) < 1;
                
                return (
                  <tr 
                    key={item.strike} 
                    className={`border-b border-gray-800 hover:bg-gray-900/50 ${
                      isMaxPain ? 'bg-red-900/20 border-red-500/30' : 
                      isCurrentPrice ? 'bg-yellow-900/20 border-yellow-500/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className={`font-mono font-bold ${
                        isMaxPain ? 'text-red-400' :
                        isCurrentPrice ? 'text-yellow-400' : 'text-white'
                      }`}>
                        ${item.strike.toFixed(1)}
                        {isMaxPain && <span className="ml-2 text-xs text-red-400">MAX PAIN</span>}
                        {isCurrentPrice && <span className="ml-2 text-xs text-yellow-400">CURRENT</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      {formatOI(item.totalOI)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-400">
                      {item.pinForce.toFixed(0)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${
                      item.distance > 0 ? 'text-red-400' : item.distance < 0 ? 'text-green-400' : 'text-gray-300'
                    }`}>
                      {formatDistance(item.distance)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${
                      item.pinProbability >= 80 ? 'text-red-400' :
                      item.pinProbability >= 60 ? 'text-orange-400' :
                      item.pinProbability >= 40 ? 'text-yellow-400' : 'text-gray-400'
                    }`}>
                      {item.pinProbability.toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-300">
                      {item.daysToExpiry}d
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className={`font-bold ${
                        item.pullDirection === 'up' ? 'text-green-400' :
                        item.pullDirection === 'down' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {item.pullDirection === 'up' ? '↑' :
                         item.pullDirection === 'down' ? '↓' : '–'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Import the Top 1000 symbols
import { PRELOAD_TIERS } from '../../lib/Top1000Symbols';

// SI Dashboard Component
const SIDashboard: React.FC<SIDashboardProps> = ({ selectedTicker, currentPrice, gexByStrikeByExpiration, vexByStrikeByExpiration, expirations }) => {
  
  const [screenerFilter, setScreenerFilter] = useState<string>('all');
  const [screenerData, setScreenerData] = useState<any[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerAbortController, setScreenerAbortController] = useState<AbortController | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  
  // Filter to 45-day expirations for SI analysis
  const siExpirations = useMemo(() => {
    const today = new Date();
    const maxDate = new Date(today.getTime() + (45 * 24 * 60 * 60 * 1000)); // 45 days from now
    
    return expirations.filter(exp => {
      const expDate = new Date(exp);
      return expDate >= today && expDate <= maxDate;
    }).sort();
  }, [expirations]);

  // Calculate SI using real GEX, VEX, and DEX data
  const siMetrics = useMemo(() => {
    if (!currentPrice || Object.keys(gexByStrikeByExpiration).length === 0) {
      return { si: 0, gexTotal: 0, vexTotal: 0, dexTotal: 0, siNorm: 0, stability: 'UNKNOWN', marketBehavior: 'No Data' };
    }
    
    let totalGEX = 0;
    let totalVEX = 0; 
    let totalDEX = 0;
    
    // Sum across 45-day expirations and strikes using real data
    siExpirations.forEach(exp => {
      const gexData = gexByStrikeByExpiration[exp];
      const vexData = vexByStrikeByExpiration[exp];
      
      if (gexData) {
        Object.entries(gexData).forEach(([strike, data]) => {
          const strikePrice = parseFloat(strike);
          
          // Add GEX (already calculated in your existing data)
          totalGEX += data.call + data.put;
          
          // Add VEX (already calculated in your existing data)
          if (vexData && vexData[strikePrice]) {
            totalVEX += vexData[strikePrice].call + vexData[strikePrice].put;
          }
          
          // Calculate DEX (Delta Exposure): Delta × OI × 100 × Stock Price
          // Delta approximation: (Strike - Current Price) sensitivity
          const callOI = data.callOI || 0;
          const putOI = data.putOI || 0;
          
          // Approximate delta for calls and puts
          const moneyness = strikePrice / currentPrice;
          let callDelta = 0;
          let putDelta = 0;
          
          if (moneyness > 1.05) { // OTM calls
            callDelta = Math.max(0, Math.min(1, (moneyness - 1) * 2));
          } else if (moneyness < 0.95) { // ITM calls
            callDelta = Math.max(0, Math.min(1, 0.8 + (1 - moneyness) * 0.4));
          } else { // ATM calls
            callDelta = 0.5;
          }
          
          putDelta = callDelta - 1; // Put-call parity
          
          // Calculate DEX
          const callDEX = callDelta * callOI * 100 * currentPrice;
          const putDEX = putDelta * putOI * 100 * currentPrice;
          
          totalDEX += callDEX + putDEX;
        });
      }
    });
    
    // Calculate SI using the correct formula: SI = GEX_total / (|VEX_total| + |DEX_total|)
    const denominator = Math.abs(totalVEX) + Math.abs(totalDEX);
    const si = denominator !== 0 ? totalGEX / denominator : 0;
    
    // Use the raw SI value without artificial clamping
    // Determine stability level and market behavior based on actual SI ranges
    let stability = '';
    let marketBehavior = '';
    let stabilityColor = '';
    
    if (si >= 2.0) {
      stability = 'EXTREMELY STABLE';
      marketBehavior = 'Strong Mean Reversion';
      stabilityColor = 'text-green-500';
    } else if (si >= 0.5) {
      stability = 'HIGHLY STABLE';
      marketBehavior = 'Mean Reverting';
      stabilityColor = 'text-green-400';
    } else if (si >= 0) {
      stability = 'MILDLY SUPPORTIVE';
      marketBehavior = 'Range-bound';
      stabilityColor = 'text-blue-400';
    } else if (si >= -0.5) {
      stability = 'VOLATILITY BUILDING';
      marketBehavior = 'Breakout Likely';
      stabilityColor = 'text-yellow-400';
    } else if (si >= -2.0) {
      stability = 'REFLEXIVE MARKET';
      marketBehavior = 'Fragile & Explosive';
      stabilityColor = 'text-red-400';
    } else {
      stability = 'EXTREMELY REFLEXIVE';
      marketBehavior = 'Highly Explosive';
      stabilityColor = 'text-red-500';
    }
    
    return {
      si,
      gexTotal: totalGEX,
      vexTotal: totalVEX,
      dexTotal: totalDEX,
      siNorm: si, // Use actual SI value, not normalized
      stability,
      marketBehavior,
      stabilityColor
    };
  }, [currentPrice, gexByStrikeByExpiration, vexByStrikeByExpiration, siExpirations]);

  const formatExposure = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '+';
    
    if (absValue >= 1e9) {
      return `${sign}${(absValue / 1e9).toFixed(2)}B`;
    } else if (absValue >= 1e6) {
      return `${sign}${(absValue / 1e6).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${sign}${(absValue / 1000).toFixed(1)}K`;
    }
    return `${sign}${absValue.toFixed(0)}`;
  };

  // Function to calculate SI for a single ticker - REBUILT FROM SCRATCH using main gauge logic
  const calculateSIForTicker = async (ticker: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`/api/options-chain?ticker=${ticker}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const result = await response.json();
      if (!result.success || !result.data) return null;
      
      const price = result.currentPrice;
      const optionsData = result.data;
      if (!price || price <= 0) return null;
      
      // STEP 1: Filter EXACTLY like main component does (first 3 months, then 45 days)
      const allExps = Object.keys(optionsData).sort();
      const threeMonthsFromNow = new Date();
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
      const expsWithin3Months = allExps.filter(exp => {
        const expDate = new Date(exp);
        return expDate <= threeMonthsFromNow;
      });
      
      // Then filter to 45 days
      const today = new Date();
      const maxDate = new Date(today.getTime() + (45 * 24 * 60 * 60 * 1000));
      const validExps = expsWithin3Months.filter(exp => {
        const expDate = new Date(exp);
        return expDate >= today && expDate <= maxDate;
      }).sort();
      
      if (validExps.length === 0) return null;
      
      // STEP 2: Build GEX and VEX structures - ACCUMULATE across multiple expirations
      const gexByStrikeByExp: {[strike: number]: {call: number, put: number, callOI: number, putOI: number}} = {};
      const vexByStrikeByExp: {[strike: number]: {call: number, put: number}} = {};
      
      validExps.forEach(exp => {
        const expData = optionsData[exp];
        if (!expData?.calls || !expData?.puts) return;
        
        const { calls, puts } = expData;
        
        // Process calls - ACCUMULATE values for same strikes across expirations
        Object.entries(calls).forEach(([strike, data]: [string, any]) => {
          const strikeNum = parseFloat(strike);
          const oi = data.open_interest || 0;
          
          if (oi > 0) {
            if (!gexByStrikeByExp[strikeNum]) {
              gexByStrikeByExp[strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
            }
            if (!vexByStrikeByExp[strikeNum]) {
              vexByStrikeByExp[strikeNum] = { call: 0, put: 0 };
            }
            
            gexByStrikeByExp[strikeNum].callOI += oi; // ACCUMULATE OI
            
            const gamma = data.greeks?.gamma || 0;
            if (gamma) {
              const gex = gamma * oi * (price * price) * 100;
              gexByStrikeByExp[strikeNum].call += gex; // ACCUMULATE GEX
            }
            
            const vega = data.greeks?.vega || 0;
            if (vega) {
              const vex = vega * oi * 100;
              vexByStrikeByExp[strikeNum].call += vex; // ACCUMULATE VEX
            }
          }
        });
        
        // Process puts - ACCUMULATE values for same strikes across expirations
        Object.entries(puts).forEach(([strike, data]: [string, any]) => {
          const strikeNum = parseFloat(strike);
          const oi = data.open_interest || 0;
          
          if (oi > 0) {
            if (!gexByStrikeByExp[strikeNum]) {
              gexByStrikeByExp[strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
            }
            if (!vexByStrikeByExp[strikeNum]) {
              vexByStrikeByExp[strikeNum] = { call: 0, put: 0 };
            }
            
            gexByStrikeByExp[strikeNum].putOI += oi; // ACCUMULATE OI
            
            const gamma = data.greeks?.gamma || 0;
            if (gamma) {
              const gex = -gamma * oi * (price * price) * 100;
              gexByStrikeByExp[strikeNum].put += gex; // ACCUMULATE GEX
            }
            
            const vega = data.greeks?.vega || 0;
            if (vega) {
              const vex = -vega * oi * 100;
              vexByStrikeByExp[strikeNum].put += vex; // ACCUMULATE VEX
            }
          }
        });
      });
      
      // STEP 3: Calculate SI using EXACT logic from main gauge (lines 877-926)
      let totalGEX = 0;
      let totalVEX = 0;
      let totalDEX = 0;
      
      Object.entries(gexByStrikeByExp).forEach(([strike, data]) => {
        const strikePrice = parseFloat(strike);
        
        // Add GEX (EXACT copy from line 891)
        totalGEX += data.call + data.put;
        
        // Add VEX (EXACT copy from lines 894-896)
        if (vexByStrikeByExp[strikePrice]) {
          totalVEX += vexByStrikeByExp[strikePrice].call + vexByStrikeByExp[strikePrice].put;
        }
        
        // Calculate DEX (EXACT copy from lines 899-922)
        const callOI = data.callOI || 0;
        const putOI = data.putOI || 0;
        
        const moneyness = strikePrice / price;
        let callDelta = 0;
        let putDelta = 0;
        
        if (moneyness > 1.05) {
          callDelta = Math.max(0, Math.min(1, (moneyness - 1) * 2));
        } else if (moneyness < 0.95) {
          callDelta = Math.max(0, Math.min(1, 0.8 + (1 - moneyness) * 0.4));
        } else {
          callDelta = 0.5;
        }
        
        putDelta = callDelta - 1;
        
        const callDEX = callDelta * callOI * 100 * price;
        const putDEX = putDelta * putOI * 100 * price;
        
        totalDEX += callDEX + putDEX;
      });
      
      // STEP 4: Calculate SI (EXACT copy from lines 926-927)
      const denominator = Math.abs(totalVEX) + Math.abs(totalDEX);
      const si = denominator !== 0 ? totalGEX / denominator : 0;
      
      if (!isFinite(si)) return null;
      
      // Categorize
      let regime = '';
      let regimeColor = '';
      if (si >= 2.0) { regime = 'EXTREMELY STABLE'; regimeColor = 'text-green-500'; }
      else if (si >= 0.5) { regime = 'STABLE'; regimeColor = 'text-green-400'; }
      else if (si >= 0) { regime = 'SUPPORTIVE'; regimeColor = 'text-blue-400'; }
      else if (si >= -0.5) { regime = 'BUILDING'; regimeColor = 'text-yellow-400'; }
      else if (si >= -2.0) { regime = 'REFLEXIVE'; regimeColor = 'text-red-400'; }
      else { regime = 'EXTREMELY REFLEXIVE'; regimeColor = 'text-red-500'; }
      
      return {
        ticker,
        price,
        si,
        regime,
        regimeColor,
        gex: totalGEX,
        vex: totalVEX,
        dex: totalDEX,
        contractCount: Object.keys(gexByStrikeByExp).length
      };
      
    } catch (error) {
      return null;
    }
  };

  // Cancel screener scan
  const cancelScreenerScan = () => {
    if (screenerAbortController) {
      screenerAbortController.abort();
      setScreenerAbortController(null);
    }
    setScreenerLoading(false);
  };

  // Load screener data for top symbols with advanced parallel processing
  const loadScreenerData = async () => {
    // Cancel any existing scan
    if (screenerAbortController) {
      screenerAbortController.abort();
    }
    
    const newController = new AbortController();
    setScreenerAbortController(newController);
    setScreenerLoading(true);
    setScreenerData([]); // Clear existing data
    
    try {
      // Use your full Top 1000+ symbols - all tiers (deduplicated)
      const allSymbolsWithDupes = [
        ...PRELOAD_TIERS.TIER_1_INSTANT,
        ...PRELOAD_TIERS.TIER_2_FAST,
        ...PRELOAD_TIERS.TIER_3_REGULAR,
        ...PRELOAD_TIERS.TIER_4_BACKGROUND,
        ...PRELOAD_TIERS.TIER_5_EXTENDED,
        ...PRELOAD_TIERS.TIER_6_COMPREHENSIVE
      ];
      const allSymbols = [...new Set(allSymbolsWithDupes)]; // Remove duplicates
      
      // Process in priority batches but use ALL symbols (deduplicated)
      const primarySymbols = [...new Set(PRELOAD_TIERS.TIER_1_INSTANT)];
      const secondarySymbols = [...new Set(PRELOAD_TIERS.TIER_2_FAST)];
      const tertiarySymbols = [...new Set([
        ...PRELOAD_TIERS.TIER_3_REGULAR,
        ...PRELOAD_TIERS.TIER_4_BACKGROUND,
        ...PRELOAD_TIERS.TIER_5_EXTENDED,
        ...PRELOAD_TIERS.TIER_6_COMPREHENSIVE
      ])];
      
      console.log(`Starting parallel SI scan with ${allSymbols.length} symbols from your full universe...`);
      
      const results: any[] = [];
      let successCount = 0;
      let failCount = 0;
      
      // Enhanced SI calculation with multiple fallbacks
      const calculateSIWithFallbacks = async (symbol: string, priority: string = 'normal') => {
        const timeouts = priority === 'high' ? [8000, 15000, 25000] : [10000, 20000, 30000];
        
        for (let attempt = 0; attempt < timeouts.length; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeouts[attempt]);
            
            const response = await fetch(`/api/options-chain?ticker=${symbol}`, {
              signal: controller.signal,
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
              }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            
            if (!result.success || !result.data || !result.currentPrice) {
              throw new Error('Invalid response data');
            }
            
            const optionsData = result.data;
            const validExps = Object.keys(optionsData).filter(exp => {
              const expData = optionsData[exp];
              return expData && expData.calls && expData.puts && Object.keys(expData.calls).length > 0;
            });
            
            if (validExps.length === 0) throw new Error('No valid options data');
            
            return await calculateSIFromData(symbol, result.currentPrice, optionsData);
            
          } catch (error) {
            if (attempt < timeouts.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
          }
        }
        
        throw new Error(`All attempts failed for ${symbol}`);
      };
      
      // Process in priority batches with parallel execution
      const processBatch = async (symbols: string[], priority: string, batchSize = 3) => {
        const batches = [];
        for (let i = 0; i < symbols.length; i += batchSize) {
          batches.push(symbols.slice(i, i + batchSize));
        }
        
        for (const batch of batches) {
          if (newController.signal.aborted) break;
          
          const batchPromises = batch.map(async (symbol: string) => {
            try {
              const result = await calculateSIWithFallbacks(symbol, priority);
              if (result) {
                successCount++;
                results.push(result);
                console.log(`✓ ${symbol}: SI = ${result.si.toFixed(3)} (${result.regime})`);
                
                // Update UI immediately for each result
                const sorted = [...results].sort((a, b) => b.si - a.si);
                setScreenerData(sorted);
                
                return result;
              }
            } catch (error) {
              failCount++;
              console.error(`✗ ${symbol}`);
              return null;
            }
          });
          
          await Promise.allSettled(batchPromises);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      };
      
      // Process in priority order
      await processBatch(primarySymbols, 'high', 2);
      await processBatch(secondarySymbols, 'normal', 3);
      await processBatch(tertiarySymbols, 'low', 4);
      
      console.log(`SI scan complete: ${successCount} successful, ${failCount} failed`);
      
      // Final update
      const finalResults = results.sort((a, b) => b.si - a.si);
      setScreenerData(finalResults);
      
    } catch (error) {
      console.error('Error loading screener data:', error);
      setScreenerData([]);
    } finally {
      setScreenerLoading(false);
      setScreenerAbortController(null);
    }
  };
  
  // Separate SI calculation function - REBUILT FROM SCRATCH using main gauge logic
  const calculateSIFromData = async (ticker: string, price: number, optionsData: any) => {
    // STEP 1: Filter EXACTLY like main component (first 3 months, then 45 days)
    const allExps = Object.keys(optionsData).sort();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    const expsWithin3Months = allExps.filter(exp => {
      const expDate = new Date(exp);
      return expDate <= threeMonthsFromNow;
    });
    
    const today = new Date();
    const maxDate = new Date(today.getTime() + (45 * 24 * 60 * 60 * 1000));
    const validExps = expsWithin3Months.filter(exp => {
      const expDate = new Date(exp);
      return expDate >= today && expDate <= maxDate;
    }).sort();
    
    if (validExps.length === 0) throw new Error('No valid expirations');
    
    // STEP 2: Build GEX and VEX structures EXACTLY like main component
    const gexByStrikeByExp: {[strike: number]: {call: number, put: number, callOI: number, putOI: number}} = {};
    const vexByStrikeByExp: {[strike: number]: {call: number, put: number}} = {};
    
    validExps.forEach(exp => {
      const expData = optionsData[exp];
      if (!expData?.calls || !expData?.puts) return;
      
      const { calls, puts } = expData;
      
      // Process calls - ACCUMULATE values for same strikes across expirations
      Object.entries(calls).forEach(([strike, data]: [string, any]) => {
        const strikeNum = parseFloat(strike);
        const oi = data.open_interest || 0;
        
        if (oi > 0) {
          if (!gexByStrikeByExp[strikeNum]) {
            gexByStrikeByExp[strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
          }
          if (!vexByStrikeByExp[strikeNum]) {
            vexByStrikeByExp[strikeNum] = { call: 0, put: 0 };
          }
          
          gexByStrikeByExp[strikeNum].callOI += oi; // ACCUMULATE
          
          const gamma = data.greeks?.gamma || 0;
          if (gamma) {
            const gex = gamma * oi * (price * price) * 100;
            gexByStrikeByExp[strikeNum].call += gex; // ACCUMULATE
          }
          
          const vega = data.greeks?.vega || 0;
          if (vega) {
            const vex = vega * oi * 100;
            vexByStrikeByExp[strikeNum].call += vex; // ACCUMULATE
          }
        }
      });
      
      // Process puts - ACCUMULATE values for same strikes across expirations
      Object.entries(puts).forEach(([strike, data]: [string, any]) => {
        const strikeNum = parseFloat(strike);
        const oi = data.open_interest || 0;
        
        if (oi > 0) {
          if (!gexByStrikeByExp[strikeNum]) {
            gexByStrikeByExp[strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
          }
          if (!vexByStrikeByExp[strikeNum]) {
            vexByStrikeByExp[strikeNum] = { call: 0, put: 0 };
          }
          
          gexByStrikeByExp[strikeNum].putOI += oi; // ACCUMULATE
          
          const gamma = data.greeks?.gamma || 0;
          if (gamma) {
            const gex = -gamma * oi * (price * price) * 100;
            gexByStrikeByExp[strikeNum].put += gex; // ACCUMULATE
          }
          
          const vega = data.greeks?.vega || 0;
          if (vega) {
            const vex = -vega * oi * 100;
            vexByStrikeByExp[strikeNum].put += vex; // ACCUMULATE
          }
        }
      });
    });
    
    // STEP 3: Calculate SI using EXACT logic from main gauge
    let totalGEX = 0;
    let totalVEX = 0;
    let totalDEX = 0;
    
    Object.entries(gexByStrikeByExp).forEach(([strike, data]) => {
      const strikePrice = parseFloat(strike);
      
      totalGEX += data.call + data.put;
      
      if (vexByStrikeByExp[strikePrice]) {
        totalVEX += vexByStrikeByExp[strikePrice].call + vexByStrikeByExp[strikePrice].put;
      }
      
      const callOI = data.callOI || 0;
      const putOI = data.putOI || 0;
      
      const moneyness = strikePrice / price;
      let callDelta = 0;
      let putDelta = 0;
      
      if (moneyness > 1.05) {
        callDelta = Math.max(0, Math.min(1, (moneyness - 1) * 2));
      } else if (moneyness < 0.95) {
        callDelta = Math.max(0, Math.min(1, 0.8 + (1 - moneyness) * 0.4));
      } else {
        callDelta = 0.5;
      }
      
      putDelta = callDelta - 1;
      
      const callDEX = callDelta * callOI * 100 * price;
      const putDEX = putDelta * putOI * 100 * price;
      
      totalDEX += callDEX + putDEX;
    });
    
    const denominator = Math.abs(totalVEX) + Math.abs(totalDEX);
    if (denominator === 0) throw new Error('Zero denominator');
    
    const si = totalGEX / denominator;
    if (!isFinite(si)) throw new Error('Invalid SI result');
    
    // Categorize
    let regime = '', regimeColor = '';
    if (si >= 2.0) { regime = 'EXTREMELY STABLE'; regimeColor = 'text-green-500'; }
    else if (si >= 0.5) { regime = 'STABLE'; regimeColor = 'text-green-400'; }
    else if (si >= 0) { regime = 'SUPPORTIVE'; regimeColor = 'text-blue-400'; }
    else if (si >= -0.5) { regime = 'BUILDING'; regimeColor = 'text-yellow-400'; }
    else if (si >= -2.0) { regime = 'REFLEXIVE'; regimeColor = 'text-red-400'; }
    else { regime = 'EXTREMELY REFLEXIVE'; regimeColor = 'text-red-500'; }
    
    return {
      ticker,
      price,
      si,
      regime,
      regimeColor,
      gex: totalGEX,
      vex: totalVEX,
      dex: totalDEX,
      contractCount: Object.keys(gexByStrikeByExp).length
    };
  };

  // Filter screener data based on regime
  const filteredScreenerData = useMemo(() => {
    if (screenerFilter === 'all') return screenerData;
    
    return screenerData.filter(item => {
      switch (screenerFilter) {
        case 'highly-stable': return item.si >= 0.5;
        case 'mildly-supportive': return item.si >= 0 && item.si < 0.5;
        case 'volatility-building': return item.si >= -0.5 && item.si < 0;
        case 'reflexive': return item.si < -0.5;
        default: return true;
      }
    });
  }, [screenerData, screenerFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredScreenerData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredScreenerData.slice(startIndex, endIndex);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [screenerFilter]);

  // Load screener data when component mounts
  useEffect(() => {
    if (screenerData.length === 0) {
      loadScreenerData();
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-black border-2 border-purple-500/50 p-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white uppercase tracking-wider">
            STABILITY INTENSITY
          </h2>
        </div>
      </div>

      {/* Main SI Gauge */}
      <div className="bg-black border border-gray-600 p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-6">
          {/* Left side - empty for balance */}
          <div></div>
          
          {/* Center - SI Value */}
          <div className="text-center">
            <div className={`text-6xl font-bold mb-4 ${siMetrics.stabilityColor}`}>
              {siMetrics.siNorm.toFixed(3)}
            </div>
            <div className={`text-2xl font-bold mb-2 ${siMetrics.stabilityColor}`}>
              {siMetrics.stability}
            </div>
            <div className="text-lg text-gray-300">
              {siMetrics.marketBehavior}
            </div>
          </div>
          
          {/* Right side - Interpretation */}
          <div className="flex items-center justify-end">
            <div className="bg-gray-800/80 border border-gray-600/50 rounded-lg p-4 backdrop-blur-sm shadow-lg max-w-xs">
              <div className="text-purple-400 font-bold text-xs uppercase tracking-wider mb-2 border-b border-gray-600/30 pb-1">
                INTERPRETATION
              </div>
              <div className="text-white text-sm font-medium space-y-1 leading-relaxed">
                {siMetrics.siNorm >= 0.5 && (
                  <div className="space-y-1">
                    <div>• Long gamma/short vega environment</div>
                    <div>• Dealers dampen market moves</div>
                    <div>• Expect mean reversion</div>
                  </div>
                )}
                {siMetrics.siNorm >= 0 && siMetrics.siNorm < 0.5 && (
                  <div className="space-y-1">
                    <div>• Mildly supportive dealers</div>
                    <div>• Range-bound conditions</div>
                    <div>• Limited directional momentum</div>
                  </div>
                )}
                {siMetrics.siNorm >= -0.5 && siMetrics.siNorm < 0 && (
                  <div className="space-y-1">
                    <div>• Short gamma or long vega bias</div>
                    <div>• Volatility building up</div>
                    <div>• Potential for breakouts</div>
                  </div>
                )}
                {siMetrics.siNorm < -0.5 && (
                  <div className="space-y-1">
                    <div>• Short gamma + high vega</div>
                    <div>• Reflexive, fragile market</div>
                    <div>• High explosive move potential</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SI Scale Visualization */}
        <div className="relative w-full max-w-2xl mx-auto mb-8">
          <div 
            className="h-6 rounded-full relative"
            style={{
              background: 'linear-gradient(to right, #dc2626 0%, #ef4444 20%, #eab308 40%, #3b82f6 60%, #22c55e 80%, #16a34a 100%)'
            }}
          >
            {/* SI Indicator - position based on actual SI value with extended range */}
            <div 
              className="absolute top-0 w-4 h-6 bg-white border-2 border-black rounded-full transform -translate-x-1/2 transition-all duration-500"
              style={{ 
                left: `${Math.max(0, Math.min(100, ((siMetrics.siNorm + 10) / 20) * 100))}%` 
              }}
            />
          </div>
          
          {/* Scale Labels - Extended range */}
          <div className="flex justify-between mt-2 text-xs font-bold">
            <span className="text-red-500">-10.0</span>
            <span className="text-red-400">-5.0</span>
            <span className="text-red-300">-2.0</span>
            <span className="text-yellow-400">-0.5</span>
            <span className="text-blue-400">0</span>
            <span className="text-blue-400">+0.5</span>
            <span className="text-green-300">+2.0</span>
            <span className="text-green-400">+5.0</span>
            <span className="text-green-500">+10.0</span>
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-400">
            <span>MAX</span>
            <span>EXTREME</span>
            <span>HIGH</span>
            <span>BUILDING</span>
            <span>NEUTRAL</span>
            <span>SUPPORTIVE</span>
            <span>HIGH</span>
            <span>EXTREME</span>
            <span>MAX</span>
          </div>
        </div>
      </div>

      {/* Exposure Breakdown */}
      {/* Hidden: GEX, VEX, DEX Components - functionality preserved */}
      {false && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GEX Component */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 bg-orange-400 rounded-full"></div>
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Gamma Exposure</h3>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-400 mb-2">
              {formatExposure(siMetrics.gexTotal)}
            </div>
            <div className="text-sm text-gray-300">
              {siMetrics.gexTotal > 0 ? 'Stabilizing Force' : 'Destabilizing Force'}
            </div>
          </div>
        </div>

        {/* VEX Component */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 bg-purple-400 rounded-full"></div>
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Vega Exposure</h3>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-400 mb-2">
              {formatExposure(siMetrics.vexTotal)}
            </div>
            <div className="text-sm text-gray-300">
              Volatility Sensitivity
            </div>
          </div>
        </div>

        {/* DEX Component */}
        <div className="bg-black border border-gray-600 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
            <h3 className="text-white font-bold uppercase text-sm tracking-wider">Delta Exposure</h3>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400 mb-2">
              {formatExposure(siMetrics.dexTotal)}
            </div>
            <div className="text-sm text-gray-300">
              Directional Sensitivity
            </div>
          </div>
        </div>
      </div>
      )}



      {/* SI Screener */}
      <div className="bg-black border border-gray-600">
        <div className="bg-black px-6 py-4 border-b border-gray-600">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-black uppercase text-lg tracking-widest">SI SCREENER</h3>
            
            {/* Filter Controls */}
            <div className="flex items-center gap-4">
              <span className="text-purple-400 font-bold text-sm uppercase tracking-wider">FILTER:</span>
              <div className="relative">
                <select
                  value={screenerFilter}
                  onChange={(e) => setScreenerFilter(e.target.value)}
                  className="bg-black border-2 border-purple-600 focus:border-purple-400 focus:outline-none px-4 py-2 pr-10 text-white text-sm font-bold uppercase appearance-none cursor-pointer min-w-[180px] transition-all"
                >
                  <option value="all">ALL REGIMES</option>
                  <option value="highly-stable">HIGHLY STABLE</option>
                  <option value="mildly-supportive">MILDLY SUPPORTIVE</option>
                  <option value="volatility-building">VOLATILITY BUILDING</option>
                  <option value="reflexive">REFLEXIVE MARKET</option>
                </select>
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              
              {screenerLoading ? (
                <button
                  onClick={cancelScreenerScan}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-bold uppercase tracking-wider border-2 border-red-500 transition-all"
                >
                  CANCEL SCAN
                </button>
              ) : (
                <button
                  onClick={loadScreenerData}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-sm font-bold uppercase tracking-wider border-2 border-purple-500 transition-all"
                >
                  START SCAN
                </button>
              )}
            </div>
          </div>
        </div>
        
        <div>
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-4 text-left text-sm font-black text-purple-400 uppercase tracking-widest">Symbol</th>
                <th className="px-4 py-4 text-right text-sm font-black text-purple-400 uppercase tracking-widest">Price</th>
                <th className="px-4 py-4 text-right text-sm font-black text-purple-400 uppercase tracking-widest">SI</th>
                <th className="px-4 py-4 text-center text-sm font-black text-purple-400 uppercase tracking-widest">Regime</th>
                <th className="px-4 py-4 text-center text-sm font-black text-purple-400 uppercase tracking-widest">Action</th>
              </tr>
            </thead>
            <tbody>
              {screenerLoading && screenerData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400"></div>
                        <span className="text-purple-400 font-bold uppercase">SCANNING...</span>
                      </div>
                      <div className="text-sm text-gray-400">
                        Analyzing SI across 1400+ symbols • Results appear as found
                      </div>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length > 0 ? (
                paginatedData.map((item, idx) => {
                  // Determine action based on actual SI ranges
                  let actionText = '';
                  let actionColor = '';
                  
                  if (item.si >= 2.0) {
                    actionText = 'STRONG FADE';
                    actionColor = 'text-green-500';
                  } else if (item.si >= 0.5) {
                    actionText = 'FADE MOVES';
                    actionColor = 'text-green-400';
                  } else if (item.si >= 0) {
                    actionText = 'RANGE TRADE';
                    actionColor = 'text-blue-400';
                  } else if (item.si >= -0.5) {
                    actionText = 'AWAIT BREAKOUT';
                    actionColor = 'text-yellow-400';
                  } else if (item.si >= -2.0) {
                    actionText = 'MOMENTUM TRADE';
                    actionColor = 'text-red-400';
                  } else {
                    actionText = 'HIGH MOMENTUM';
                    actionColor = 'text-red-500';
                  }

                  return (
                    <tr key={item.ticker} className="border-b border-gray-800 hover:bg-gray-900/50 transition-colors duration-200">
                      <td className="px-4 py-3 text-white font-bold text-lg tracking-wider">
                        {item.ticker}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-mono">${item.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-lg ${item.regimeColor}`}>
                          {item.si.toFixed(3)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-black text-sm tracking-wider ${item.regimeColor}`}>
                          {item.regime}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-xs tracking-wider ${actionColor}`}>
                          {actionText}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    <div className="text-sm">
                      <strong className="text-purple-400">SI SCREENER READY</strong><br/>
                      Click START SCAN to begin SI analysis.<br/>
                      Results will appear when scan completes.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {filteredScreenerData.length > 0 && (
          <div className="bg-black border-t border-gray-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredScreenerData.length)} of {filteredScreenerData.length} symbols
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-2 transition-all ${
                    currentPage === 1
                      ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                      : 'bg-purple-600 border-purple-500 text-white hover:bg-purple-700'
                  }`}
                >
                  PREVIOUS
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                    // Show first page, last page, current page, and pages around current
                    const showPage = page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                    const showEllipsis = (page === 2 && currentPage > 3) || (page === totalPages - 1 && currentPage < totalPages - 2);
                    
                    if (showEllipsis) {
                      return <span key={page} className="px-2 text-gray-500">...</span>;
                    }
                    
                    if (!showPage) return null;
                    
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-2 text-sm font-bold border-2 transition-all ${
                          currentPage === page
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'bg-black border-gray-600 text-gray-400 hover:border-purple-500 hover:text-white'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={`px-4 py-2 text-sm font-bold uppercase tracking-wider border-2 transition-all ${
                    currentPage === totalPages
                      ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed'
                      : 'bg-purple-600 border-purple-500 text-white hover:bg-purple-700'
                  }`}
                >
                  NEXT
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to calculate Vanna using Black-Scholes formula
// Vanna = -e^(-rT) × N'(d₁) × d₂/σ
const calculateVanna = (strike: number, spotPrice: number, T: number, impliedVol: number, riskFreeRate: number = 0.0408): number => {
  if (T <= 0 || impliedVol <= 0 || spotPrice <= 0) return 0;
  
  const sigma = impliedVol;
  const r = riskFreeRate;
  const S = spotPrice;
  const K = strike;
  
  // Calculate d1 and d2
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  // Calculate N'(d1) - standard normal probability density function
  const nPrime_d1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
  
  // Vanna = -e^(-rT) × N'(d₁) × d₂/σ
  const vanna = -Math.exp(-r * T) * nPrime_d1 * (d2 / sigma);
  
  return vanna;
};

const DealerAttraction = () => {
  const [data, setData] = useState<GEXData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expirations, setExpirations] = useState<string[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [tickerInput, setTickerInput] = useState('');
  const [gexByStrikeByExpiration, setGexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number}}}>({});
  const [viewMode, setViewMode] = useState<'NET' | 'CP'>('CP'); // C/P by default
  const [analysisType, setAnalysisType] = useState<'GEX'>('GEX'); // Gamma Exposure by default
  const [vexByStrikeByExpiration, setVexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number}}}>({});
  const [showGEX, setShowGEX] = useState(true);
  const [gexMode, setGexMode] = useState<'GEX' | 'Net GEX' | 'Dealer'>('GEX');

  const [showOI, setShowOI] = useState(false);
  const [liveMode, setLiveMode] = useState(false); // Single live mode toggle for all metrics
  const [liveOIData, setLiveOIData] = useState<Map<string, number>>(new Map());
  const [liveOILoading, setLiveOILoading] = useState(false);
  const [liveOIProgress, setLiveOIProgress] = useState(0);
  const [showVEX, setShowVEX] = useState(false);
  const [vexMode, setVexMode] = useState<'VEX' | 'Net VEX'>('VEX');
  const [activeTab, setActiveTab] = useState<'WORKBENCH' | 'ATTRACTION'>('ATTRACTION');
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<'MM' | 'MP' | 'SI'>('MM');

  const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

  // Live OI Update - Separate scan with AlgoFlow's exact logic
  const updateLiveOI = async () => {
    console.log('🚀 Starting Live OI scan for', selectedTicker);
    setLiveOILoading(true);
    setLiveOIProgress(0);
    
    const eventSource = new EventSource(`/api/stream-options-flow?ticker=${selectedTicker.toUpperCase()}`);
    let allTrades: any[] = [];
    
    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'complete' && data.trades?.length > 0) {
          console.log(`📊 Received ${data.trades.length} trades`);
          allTrades = data.trades;
          eventSource.close();
          setLiveOIProgress(20); // 20% - trades received
          
          // Step 1: Fetch volume and OI data for all trades using Polygon API
          const uniqueExpirations = [...new Set(allTrades.map(t => t.expiry))];
          console.log(`📅 Fetching data for ${uniqueExpirations.length} expirations`);
          
          const allContracts = new Map();
          
          // Fetch data for each expiration
          for (let i = 0; i < uniqueExpirations.length; i++) {
            const expiry = uniqueExpirations[i];
            const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry;
            
            try {
              const response = await fetch(
                `https://api.polygon.io/v3/snapshot/options/${selectedTicker.toUpperCase()}?expiration_date=${expiryParam}&limit=250&apiKey=${POLYGON_API_KEY}`
              );
              
              if (response.ok) {
                const chainData = await response.json();
                if (chainData.results) {
                  chainData.results.forEach((contract: any) => {
                    if (contract.details && contract.details.ticker) {
                      allContracts.set(contract.details.ticker, {
                        volume: contract.day?.volume || 0,
                        open_interest: contract.open_interest || 0
                      });
                    }
                  });
                  console.log(`  ✅ Found ${chainData.results.length} contracts for ${expiryParam}`);
                }
              }
              
              // Update progress: 20% to 60% during contract fetching
              setLiveOIProgress(20 + Math.round((i + 1) / uniqueExpirations.length * 40));
            } catch (error) {
              console.error(`  ❌ Error fetching ${expiryParam}:`, error);
            }
          }
          
          console.log(`📊 Total contracts fetched: ${allContracts.size}`);
          setLiveOIProgress(60); // 60% - contracts fetched
          
          // Step 2: Enrich trades with volume/OI
          const enrichedTrades = allTrades.map(trade => {
            const contractData = allContracts.get(trade.ticker);
            return {
              ...trade,
              volume: contractData?.volume || 0,
              open_interest: contractData?.open_interest || 0,
              underlying_ticker: trade.underlying_ticker || selectedTicker.toUpperCase()
            };
          });
          setLiveOIProgress(70); // 70% - trades enriched
          
          // Step 3: Detect fill styles (copied from AlgoFlow)
          const tradesWithFillStyle = enrichedTrades.map(trade => {
            const volume = trade.volume || 0;
            const tradeSize = trade.trade_size || 0;
            const oi = trade.open_interest || 0;
            
            // Fill style logic from AlgoFlow
            let fillStyle = 'N/A';
            
            if (tradeSize > oi * 0.5) {
              fillStyle = 'AA'; // Aggressive opening
            } else if (tradeSize > volume * 0.3) {
              fillStyle = 'A'; // Opening
            } else if (tradeSize > oi * 0.1) {
              fillStyle = 'BB'; // Block opening
            } else {
              fillStyle = 'B'; // Likely closing
            }
            
            return {
              ...trade,
              fill_style: fillStyle
            };
          });
          
          console.log(`✅ Enriched ${tradesWithFillStyle.length} trades with volume/OI and fill_style`);
          setLiveOIProgress(80); // 80% - fill styles calculated
          
          // Step 4: Calculate Live OI for each unique contract
          const liveOIMap = new Map<string, number>();
          const uniqueContracts = new Set<string>();
          
          tradesWithFillStyle.forEach(trade => {
            const contractKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`;
            uniqueContracts.add(contractKey);
          });
          
          uniqueContracts.forEach(contractKey => {
            const matchingTrade = tradesWithFillStyle.find(t => 
              `${t.underlying_ticker}_${t.strike}_${t.type}_${t.expiry}` === contractKey
            );
            
            const originalOI = matchingTrade?.open_interest || 0;
            
            // Calculate Live OI using the trades
            const contractTrades = tradesWithFillStyle.filter(t => 
              `${t.underlying_ticker}_${t.strike}_${t.type}_${t.expiry}` === contractKey
            );
            
            let liveOI = originalOI;
            const processedTradeIds = new Set<string>();
            
            // Sort trades chronologically
            const sortedTrades = [...contractTrades].sort((a, b) => 
              new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
            );
            
            sortedTrades.forEach(trade => {
              const tradeId = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}_${trade.trade_timestamp}_${trade.trade_size}`;
              
              if (processedTradeIds.has(tradeId)) return;
              processedTradeIds.add(tradeId);
              
              const contracts = trade.trade_size || 0;
              const fillStyle = trade.fill_style;
              
              switch (fillStyle) {
                case 'A':
                case 'AA':
                case 'BB':
                  liveOI += contracts;
                  break;
                case 'B':
                  if (contracts > originalOI) {
                    liveOI += contracts;
                  } else {
                    liveOI -= contracts;
                  }
                  break;
              }
            });
            
            liveOI = Math.max(0, liveOI);
            liveOIMap.set(contractKey, liveOI);
            
            console.log(`📊 ${contractKey}: OI ${originalOI} → Live OI ${liveOI}`);
          });
          
          setLiveOIData(liveOIMap);
          setLiveOIProgress(100); // 100% - complete
          console.log(`✅ Live OI update complete: ${liveOIMap.size} contracts`);
          
          // Hide loading after a brief delay to show 100%
          setTimeout(() => {
            setLiveOILoading(false);
          }, 500);
        }
      } catch (error) {
        console.error('❌ Error in Live OI update:', error);
        setLiveOILoading(false);
        setLiveOIProgress(0);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ EventSource error:', error);
      eventSource.close();
    };
  };

  // Helper function to filter expirations to 3 months max
  const filterTo3Months = (expirations: string[]) => {
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    
    return expirations.filter(exp => {
      const expDate = new Date(exp);
      return expDate <= threeMonthsFromNow;
    });
  };



  const [otmFilter, setOtmFilter] = useState<'2%' | '3%' | '5%' | '10%' | '20%' | '40%' | '50%' | '100%'>('2%');
  const [progress, setProgress] = useState(0);


  // Helper function to get strike range based on OTM filter
  const getStrikeRange = (price: number) => {
    const percentage = parseFloat(otmFilter.replace('%', '')) / 100;
    const range = price * percentage;
    return {
      min: price - range,
      max: price + range
    };
  };





  // Fetch detailed GEX data using Web Worker for ultra-fast parallel processing
  const fetchOptionsData = async () => {
    const totalStartTime = performance.now();
    setLoading(true);
    setError(null);
    setProgress(0);
    

    
    try {
      // Get options chain data
      const apiStartTime = performance.now();
      setProgress(10);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      // Use working SPX endpoint for indices, regular endpoint for stocks
      const apiEndpoint = selectedTicker.toUpperCase() === 'SPX' 
        ? `/api/spx-fix?ticker=${selectedTicker}` 
        : `/api/options-chain?ticker=${selectedTicker}`;
      const optionsResponse = await fetch(apiEndpoint);
      const optionsResult = await optionsResponse.json();
      
      setProgress(20);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      if (!optionsResult.success || !optionsResult.data) {
        throw new Error(optionsResult.error || 'Failed to fetch options data');
      }

      // DEBUG: Log what we received from SPX API for Nov 10
      if (selectedTicker === 'SPX' && optionsResult.data['2025-11-10']) {
        const nov10Data = optionsResult.data['2025-11-10'];
        console.log(`🔍 DEALER ATTRACTION RECEIVED NOV 10 DATA:`);
        console.log(`  Calls: ${Object.keys(nov10Data.calls || {}).length}`);
        console.log(`  Puts: ${Object.keys(nov10Data.puts || {}).length}`);
        console.log(`  6700 PUT from API: ${nov10Data.puts?.['6700']?.open_interest || 'NOT FOUND'}`);
        console.log(`  6750 PUT from API: ${nov10Data.puts?.['6750']?.open_interest || 'NOT FOUND'}`);
        console.log(`  6850 PUT from API: ${nov10Data.puts?.['6850']?.open_interest || 'NOT FOUND'}`);
        console.log(`  6900 PUT from API: ${nov10Data.puts?.['6900']?.open_interest || 'NOT FOUND'}`);
      }
      
      const currentPrice = optionsResult.currentPrice;
      setCurrentPrice(currentPrice);
      

      
      // Get all available expiration dates, sorted
      const allExpirations = Object.keys(optionsResult.data).sort();
      
      // Filter to only 3 months max for performance
      const allAvailableExpirations = filterTo3Months(allExpirations);
      

      
      setExpirations(allAvailableExpirations);
      
      // Calculate OI, GEX, VEX for all expiration dates with organized processing order
      console.log(`🚨🚨 DEALER ATTRACTION COMPONENT - Starting organized calculation sequence: OI → GEX → VEX for ${selectedTicker} 🚨🚨🚨`);
      const calcStartTime = performance.now();
      setProgress(25);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      // Initialize all data structures - these will always be calculated regardless of display settings
      const oiByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number}}} = {};
      const gexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number}}} = {};
      const vexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number}}} = {};
      const allStrikes = new Set<number>();
      
      // Smart batching: larger batches for more expirations
      const batchSize = allAvailableExpirations.length <= 10 ? allAvailableExpirations.length : 
                        allAvailableExpirations.length <= 30 ? 10 : 20;
      
      for (let batchStart = 0; batchStart < allAvailableExpirations.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, allAvailableExpirations.length);
        const batch = allAvailableExpirations.slice(batchStart, batchEnd);
        
        // Process this batch - ALWAYS calculate everything in order: OI → GEX → VEX → Premium
        batch.forEach((expDate) => {
          const { calls, puts } = optionsResult.data[expDate];
          
          // Initialize all data structures for this expiration
          oiByStrikeByExp[expDate] = {};
          gexByStrikeByExp[expDate] = {};
          vexByStrikeByExp[expDate] = {};
          
          // STEP 1: Process calls - Calculate OI first, then build other metrics from it
          console.log(`🚨 Processing expiration ${expDate}, found ${Object.keys(calls).length} call strikes`);
          Object.entries(calls).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            const oi = data.open_interest || 0;
            
            if (oi > 0) {
              // STEP 1A: Calculate OI (Open Interest) - Foundation for all other calculations
              console.log(`📊 Step 1A - Call OI: Strike ${strikeNum} = ${oi}`);
              oiByStrikeByExp[expDate][strikeNum] = { call: oi, put: 0, callOI: oi, putOI: 0 };
              
              // STEP 1B: Calculate GEX using the OI we just stored
              const gamma = data.greeks?.gamma || 0;
              const delta = data.greeks?.delta || 0;
              let vanna = data.greeks?.vanna || 0;
              
              // If vanna is 0 or missing, calculate it using Black-Scholes formula
              if (vanna === 0 && gamma !== 0) {
                const expirationDate = new Date(expDate);
                const today = new Date();
                const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
                const iv = data.implied_volatility || 0.3; // Use API IV or default to 30%
                vanna = calculateVanna(strikeNum, currentPrice, T, iv);
                console.log(`🧮 CALCULATED VANNA - Call: Strike ${strikeNum}, T=${T.toFixed(4)}, IV=${iv.toFixed(4)}, vanna=${vanna.toFixed(8)}`);
              }
              
              console.log(`📊 VANNA DEBUG - Call: Strike ${strikeNum}, gamma=${gamma}, delta=${delta}, vanna=${vanna}`);
              gexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: oi, putOI: 0, callGamma: gamma, putGamma: 0, callDelta: delta, putDelta: 0, callVanna: vanna, putVanna: 0 };
              if (gamma) {
                const gex = gamma * oi * (currentPrice * currentPrice) * 100;
                gexByStrikeByExp[expDate][strikeNum].call = gex;
                console.log(`⚡ Step 1B - Call GEX: Strike ${strikeNum} = ${gamma} × ${oi} × ${currentPrice}² × 100 = ${gex}`);
              }
              
              // STEP 1C: Calculate VEX using the OI we already have
              if (!vexByStrikeByExp[expDate][strikeNum]) {
                vexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0, callVega: 0, putVega: 0 };
              }
              const vega = data.greeks?.vega || 0;
              vexByStrikeByExp[expDate][strikeNum].callOI = oi;
              vexByStrikeByExp[expDate][strikeNum].callVega = vega; // Store vega for recalculation
              console.log(`🔍🚨 Call VEX Debug: Strike ${strikeNum}, OI=${oi}, Vega=${vega}, greeks:`, data.greeks);
              if (vega && vega !== 0) {
                const vex = vega * oi * 100; // VEX = Vega × OI × 100 (no price squared)
                vexByStrikeByExp[expDate][strikeNum].call = vex;
                console.log(`🟣 Step 1C - Call VEX: Strike ${strikeNum} = ${vega} × ${oi} × 100 = ${vex}`);
              } else {
                console.log(`❌ Call VEX ZERO: Strike ${strikeNum} - vega is ${vega} (greeks exist: ${!!data.greeks})`);
              }
              

              
              allStrikes.add(strikeNum);
            }
          });
          
          // STEP 2: Process puts - Same order: OI → GEX → VEX → Premium
          console.log(`🔍 PUT PROCESSING DEBUG: Found ${Object.keys(puts).length} put strikes for ${expDate}`);
          
          // Special debugging for Nov 10
          if (expDate === '2025-11-10') {
            console.log(`🚨 NOV 10 PUT PROCESSING DEBUG:`);
            console.log(`  Raw puts object keys: ${Object.keys(puts).slice(0, 10).join(', ')}...`);
            console.log(`  6700 in puts: ${puts.hasOwnProperty('6700')}`);
            console.log(`  6750 in puts: ${puts.hasOwnProperty('6750')}`);
            console.log(`  6850 in puts: ${puts.hasOwnProperty('6850')}`);
            console.log(`  6900 in puts: ${puts.hasOwnProperty('6900')}`);
          }
          
          Object.entries(puts).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            const oi = data.open_interest || 0;
            
            // Log high OI puts for Nov 10
            if (expDate === '2025-11-10' && oi > 100) {
              console.log(`🎯 NOV 10 HIGH OI PUT: Strike ${strikeNum} = OI ${oi}`);
            }
            
            if (oi > 0) {
              // STEP 2A: Update OI with put data (initialize if not exists from calls)
              if (!oiByStrikeByExp[expDate][strikeNum]) {
                oiByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 };
              }
              oiByStrikeByExp[expDate][strikeNum].put = oi;
              oiByStrikeByExp[expDate][strikeNum].putOI = oi;
              console.log(`📊 Step 2A - Put OI: Strike ${strikeNum} = ${oi}`);
              
              // STEP 2B: Update GEX with put data
              if (!gexByStrikeByExp[expDate][strikeNum]) {
                gexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0, callGamma: 0, putGamma: 0, callDelta: 0, putDelta: 0, callVanna: 0, putVanna: 0 };
              }
              const gamma = data.greeks?.gamma || 0;
              const delta = data.greeks?.delta || 0;
              let vanna = data.greeks?.vanna || 0;
              
              // If vanna is 0 or missing, calculate it using Black-Scholes formula
              if (vanna === 0 && gamma !== 0) {
                const expirationDate = new Date(expDate);
                const today = new Date();
                const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
                const iv = data.implied_volatility || 0.3; // Use API IV or default to 30%
                vanna = calculateVanna(strikeNum, currentPrice, T, iv);
                console.log(`🧮 CALCULATED VANNA - Put: Strike ${strikeNum}, T=${T.toFixed(4)}, IV=${iv.toFixed(4)}, vanna=${vanna.toFixed(8)}`);
              }
              
              gexByStrikeByExp[expDate][strikeNum].putOI = oi;
              gexByStrikeByExp[expDate][strikeNum].putGamma = gamma;
              gexByStrikeByExp[expDate][strikeNum].putDelta = delta;
              gexByStrikeByExp[expDate][strikeNum].putVanna = vanna;
              if (gamma) {
                const gex = -gamma * oi * (currentPrice * currentPrice) * 100; // Negative for puts
                gexByStrikeByExp[expDate][strikeNum].put = gex;
                console.log(`⚡ Step 2B - Put GEX: Strike ${strikeNum} = -${gamma} × ${oi} × ${currentPrice}² × 100 = ${gex}`);
              }
              
              // STEP 2C: Update VEX with put data
              if (!vexByStrikeByExp[expDate][strikeNum]) {
                vexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0, callVega: 0, putVega: 0 };
              }
              const vega = data.greeks?.vega || 0;
              vexByStrikeByExp[expDate][strikeNum].putOI = oi;
              vexByStrikeByExp[expDate][strikeNum].putVega = vega; // Store vega for recalculation
              console.log(`🔍 Put VEX Debug: Strike ${strikeNum}, OI=${oi}, Vega=${vega}, greeks:`, data.greeks);
              if (vega) {
                const vex = -vega * oi * 100; // VEX = -Vega × OI × 100 for puts (no price squared)
                vexByStrikeByExp[expDate][strikeNum].put = vex;
                console.log(`🟣 Step 2C - Put VEX: Strike ${strikeNum} = -${vega} × ${oi} × 100 = ${vex}`);
              } else {
                console.log(`❌ Put VEX ZERO: Strike ${strikeNum} - vega is ${vega}`);
              }
              

              
              allStrikes.add(strikeNum);
            }
          });
        });
        
        // Update progress and yield to browser - FORCE UI UPDATE EVERY BATCH
        const prog = 25 + Math.round((batchEnd / allAvailableExpirations.length) * 65);
        setProgress(prog);
        
        // Always yield to UI for progress updates
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      

      
      setProgress(92);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      // Set all calculated data in state (processing order: OI → GEX → VEX → Premium)
      console.log(`✅ Calculation sequence complete for ${selectedTicker}. Setting state variables...`);
      // Note: OI data structure is the same format but represents Open Interest values
      setGexByStrikeByExpiration(gexByStrikeByExp);
      setProgress(87);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      setVexByStrikeByExpiration(vexByStrikeByExp);
      setProgress(90);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      console.log(`🎯 All data structures updated: GEX, VEX calculated from foundational OI data`);
      setProgress(95);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      // Format and display data
      const strikeRange = getStrikeRange(currentPrice);
      const relevantStrikes = Array.from(allStrikes)
        .filter(s => s >= strikeRange.min && s <= strikeRange.max)
        .sort((a, b) => b - a);
      
        const formattedData = relevantStrikes.map(strike => {
          const row: GEXData = { strike };
          allAvailableExpirations.forEach(exp => {
            const data = gexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 };
            row[exp] = { call: data.call, put: data.put, net: data.call + data.put, callOI: data.callOI, putOI: data.putOI };
            
            // Debug put OI specifically for Nov 10
            if (exp === '2025-11-10' && data.putOI > 0) {
              console.log(`🔥 NOV 10 TABLE ROW: Strike ${strike}, Put OI=${data.putOI}`);
            }
            if (exp === '2025-11-10' && (strike === 6700 || strike === 6750 || strike === 6850 || strike === 6900)) {
              console.log(`🔍 NOV 10 KEY STRIKE ${strike}: callOI=${data.callOI}, putOI=${data.putOI}, data:`, data);
            }
          });
          return row;
        });
      setData(formattedData);
      setProgress(100);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTicker) {
      fetchOptionsData();
    }
  }, [selectedTicker]);

  // Memoize ALL calculated data (unfiltered) for getTopValues to use
  const allCalculatedData = useMemo(() => {
    if (!gexByStrikeByExpiration || Object.keys(gexByStrikeByExpiration).length === 0) return [];
    
    const allStrikes = Array.from(new Set([
      ...Object.values(gexByStrikeByExpiration).flatMap(exp => Object.keys(exp).map(Number))
    ])).sort((a, b) => b - a);

    return allStrikes.map(strike => {
      const row: GEXData = { strike };
      expirations.forEach(exp => {
        const gexData: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number} = gexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callGamma: undefined, putGamma: undefined, callDelta: undefined, putDelta: undefined, callVanna: undefined, putVanna: undefined };
        const vexData: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number} = vexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callVega: undefined, putVega: undefined };
        
        let callGEX = gexData.call;
        let putGEX = gexData.put;
        let callOI = gexData.callOI;
        let putOI = gexData.putOI;
        let callVEX = vexData.call;
        let putVEX = vexData.put;
        
        // Apply Dealer mode calculation if selected (base mode)
        if (gexMode === 'Dealer' && !liveMode) {
          const expirationDate = new Date(exp);
          const today = new Date();
          const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
          
          if (T > 0) {
            if (gexData.callGamma !== undefined && gexData.callDelta !== undefined && gexData.callVanna !== undefined && gexData.callOI > 0) {
              const beta = 0.25;
              const rho_S_sigma = -0.7;
              const contractMult = 100;
              const wT = 1 / Math.sqrt(T);
              const gammaEff = gexData.callGamma + beta * gexData.callVanna * rho_S_sigma;
              const liveWeight = Math.abs(gexData.callDelta) * (1 - Math.abs(gexData.callDelta));
              callGEX = gexData.callOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
            }
            
            if (gexData.putGamma !== undefined && gexData.putDelta !== undefined && gexData.putVanna !== undefined && gexData.putOI > 0) {
              const beta = 0.25;
              const rho_S_sigma = -0.7;
              const contractMult = 100;
              const wT = 1 / Math.sqrt(T);
              const gammaEff = gexData.putGamma + beta * gexData.putVanna * rho_S_sigma;
              const liveWeight = Math.abs(gexData.putDelta) * (1 - Math.abs(gexData.putDelta));
              putGEX = -gexData.putOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
            }
          }
        }
        
        // Apply LIVE OI mode calculations if active
        if (liveMode && liveOIData.size > 0) {
          const callKey = `${selectedTicker}_${strike}_call_${exp}`;
          const putKey = `${selectedTicker}_${strike}_put_${exp}`;
          
          const liveCallOI = liveOIData.get(callKey);
          const livePutOI = liveOIData.get(putKey);
          
          const expirationDate = new Date(exp);
          const today = new Date();
          const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
          
          if (liveCallOI !== undefined && gexData.callGamma) {
            callOI = liveCallOI;
            
            if (gexMode === 'Dealer' && gexData.callDelta !== undefined && gexData.callVanna !== undefined && T > 0) {
              const beta = 0.25;
              const rho_S_sigma = -0.7;
              const contractMult = 100;
              const wT = 1 / Math.sqrt(T);
              const gammaEff = gexData.callGamma + beta * gexData.callVanna * rho_S_sigma;
              const liveWeight = Math.abs(gexData.callDelta) * (1 - Math.abs(gexData.callDelta));
              callGEX = liveCallOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
            } else {
              callGEX = gexData.callGamma * liveCallOI * (currentPrice * currentPrice) * 100;
            }
          }
          
          if (livePutOI !== undefined && gexData.putGamma) {
            putOI = livePutOI;
            
            if (gexMode === 'Dealer' && gexData.putDelta !== undefined && gexData.putVanna !== undefined && T > 0) {
              const beta = 0.25;
              const rho_S_sigma = -0.7;
              const contractMult = 100;
              const wT = 1 / Math.sqrt(T);
              const gammaEff = gexData.putGamma + beta * gexData.putVanna * rho_S_sigma;
              const liveWeight = Math.abs(gexData.putDelta) * (1 - Math.abs(gexData.putDelta));
              putGEX = -livePutOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
            } else {
              putGEX = -gexData.putGamma * livePutOI * (currentPrice * currentPrice) * 100;
            }
          }
          
          // Recalculate VEX with Live OI
          if (liveCallOI !== undefined && vexData.callVega) {
            callVEX = vexData.callVega * liveCallOI * 100;
          }
          
          if (livePutOI !== undefined && vexData.putVega) {
            putVEX = -vexData.putVega * livePutOI * 100;
          }
        }
        
        row[exp] = { 
          call: callGEX, 
          put: putGEX, 
          net: callGEX + putGEX, 
          callOI: callOI, 
          putOI: putOI,
          callVex: callVEX,
          putVex: putVEX
        };
      });
      return row;
    });
  }, [gexByStrikeByExpiration, vexByStrikeByExpiration, currentPrice, expirations, gexMode, liveMode, selectedTicker, liveOIData]);

  // Memoize the formatted data to prevent unnecessary recalculations during scrolling
  const formattedData = useMemo(() => {
    if (gexByStrikeByExpiration && Object.keys(gexByStrikeByExpiration).length > 0) {
      const strikeRange = getStrikeRange(currentPrice);
      const relevantStrikes = Array.from(new Set([
        ...Object.values(gexByStrikeByExpiration).flatMap(exp => Object.keys(exp).map(Number))
      ]))
        .filter(s => s >= strikeRange.min && s <= strikeRange.max)
        .sort((a, b) => b - a);

      const data = relevantStrikes.map(strike => {
        const row: GEXData = { strike };
        expirations.forEach(exp => {
          // Get all data types for this strike and expiration
          const gexData: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number} = gexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callGamma: undefined, putGamma: undefined, callDelta: undefined, putDelta: undefined, callVanna: undefined, putVanna: undefined };
          const vexData: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number} = vexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callVega: undefined, putVega: undefined };
          
          let callGEX = gexData.call;
          let putGEX = gexData.put;
          let callOI = gexData.callOI;
          let putOI = gexData.putOI;
          let callVEX = vexData.call;
          let putVEX = vexData.put;
          
          // Apply Dealer mode calculation to initial data if selected
          if (gexMode === 'Dealer' && !liveMode) {
            console.log(`🎯 DEALER MODE CALCULATION - Strike ${strike}, Exp ${exp}`);
            const expirationDate = new Date(exp);
            const today = new Date();
            const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
            
            if (T > 0) {
              // Dealer mode: Enhanced GEX calculation for calls
              if (gexData.callGamma !== undefined && gexData.callDelta !== undefined && gexData.callVanna !== undefined && gexData.callOI > 0) {
                const beta = 0.25;
                const rho_S_sigma = -0.7;
                const contractMult = 100;
                const wT = 1 / Math.sqrt(T);
                const gammaEff = gexData.callGamma + beta * gexData.callVanna * rho_S_sigma;
                const liveWeight = Math.abs(gexData.callDelta) * (1 - Math.abs(gexData.callDelta));
                callGEX = gexData.callOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
                console.log(`🎯 DEALER CALL: Strike ${strike}, OI=${gexData.callOI}, gamma=${gexData.callGamma}, delta=${gexData.callDelta}, vanna=${gexData.callVanna}, T=${T.toFixed(4)}, gammaEff=${gammaEff.toFixed(6)}, liveWeight=${liveWeight.toFixed(4)}, wT=${wT.toFixed(4)}, GEX=${callGEX}`);
              }
              
              // Dealer mode: Enhanced GEX calculation for puts (negative)
              if (gexData.putGamma !== undefined && gexData.putDelta !== undefined && gexData.putVanna !== undefined && gexData.putOI > 0) {
                const beta = 0.25;
                const rho_S_sigma = -0.7;
                const contractMult = 100;
                const wT = 1 / Math.sqrt(T);
                const gammaEff = gexData.putGamma + beta * gexData.putVanna * rho_S_sigma;
                const liveWeight = Math.abs(gexData.putDelta) * (1 - Math.abs(gexData.putDelta));
                putGEX = -gexData.putOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
                console.log(`🎯 DEALER PUT: Strike ${strike}, OI=${gexData.putOI}, gamma=${gexData.putGamma}, delta=${gexData.putDelta}, vanna=${gexData.putVanna}, T=${T.toFixed(4)}, gammaEff=${gammaEff.toFixed(6)}, liveWeight=${liveWeight.toFixed(4)}, wT=${wT.toFixed(4)}, GEX=${putGEX}`);
              }
            }
          }
          
          // Recalculate GEX and VEX using Live OI if available
          if (liveMode && liveOIData.size > 0) {
            const callKey = `${selectedTicker}_${strike}_call_${exp}`;
            const putKey = `${selectedTicker}_${strike}_put_${exp}`;
            
            const liveCallOI = liveOIData.get(callKey);
            const livePutOI = liveOIData.get(putKey);
            
            // Calculate time to expiration in years
            const expirationDate = new Date(exp);
            const today = new Date();
            const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
            
            // If Live OI exists, recalculate GEX with it
            if (liveCallOI !== undefined && gexData.callGamma) {
              callOI = liveCallOI;
              
              if (gexMode === 'Dealer' && gexData.callDelta !== undefined && gexData.callVanna !== undefined && T > 0) {
                // Dealer mode: Enhanced GEX calculation
                const beta = 0.25;
                const rho_S_sigma = -0.7;
                const contractMult = 100;
                const wT = 1 / Math.sqrt(T);
                const gammaEff = gexData.callGamma + beta * gexData.callVanna * rho_S_sigma;
                const liveWeight = Math.abs(gexData.callDelta) * (1 - Math.abs(gexData.callDelta));
                callGEX = liveCallOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
                console.log(`🎯 Dealer Call GEX: Strike ${strike} = OI(${liveCallOI}) × gammaEff(${gammaEff.toFixed(6)}) × liveWeight(${liveWeight.toFixed(4)}) × wT(${wT.toFixed(4)}) × price(${currentPrice}) × 100 = ${callGEX}`);
              } else {
                // Standard GEX = Gamma × OI × Price² × 100
                callGEX = gexData.callGamma * liveCallOI * (currentPrice * currentPrice) * 100;
                console.log(`🔥 Live OI Call GEX: Strike ${strike} = ${gexData.callGamma} × ${liveCallOI} × ${currentPrice}² × 100 = ${callGEX}`);
              }
            }
            
            if (livePutOI !== undefined && gexData.putGamma) {
              putOI = livePutOI;
              
              if (gexMode === 'Dealer' && gexData.putDelta !== undefined && gexData.putVanna !== undefined && T > 0) {
                // Dealer mode: Enhanced GEX calculation (negative for puts)
                const beta = 0.25;
                const rho_S_sigma = -0.7;
                const contractMult = 100;
                const wT = 1 / Math.sqrt(T);
                const gammaEff = gexData.putGamma + beta * gexData.putVanna * rho_S_sigma;
                const liveWeight = Math.abs(gexData.putDelta) * (1 - Math.abs(gexData.putDelta));
                putGEX = -livePutOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
                console.log(`🎯 Dealer Put GEX: Strike ${strike} = -OI(${livePutOI}) × gammaEff(${gammaEff.toFixed(6)}) × liveWeight(${liveWeight.toFixed(4)}) × wT(${wT.toFixed(4)}) × price(${currentPrice}) × 100 = ${putGEX}`);
              } else {
                // Standard GEX = -Gamma × OI × Price² × 100
                putGEX = -gexData.putGamma * livePutOI * (currentPrice * currentPrice) * 100;
                console.log(`🔥 Live OI Put GEX: Strike ${strike} = -${gexData.putGamma} × ${livePutOI} × ${currentPrice}² × 100 = ${putGEX}`);
              }
            }
            
            // Recalculate VEX with Live OI
            if (liveCallOI !== undefined && vexData.callVega) {
              callVEX = vexData.callVega * liveCallOI * 100;
            }
            
            if (livePutOI !== undefined && vexData.putVega) {
              putVEX = -vexData.putVega * livePutOI * 100;
            }
          }
          
          // Store all data types for flexible display
          row[exp] = { 
            call: callGEX, 
            put: putGEX, 
            net: callGEX + putGEX, 
            callOI: callOI, 
            putOI: putOI,
            // Add VEX data as additional properties
            callVex: callVEX,
            putVex: putVEX
          };
          
          // Debug VEX data during formatting
          if (showVEX && (vexData.call !== 0 || vexData.put !== 0)) {
            console.log(`🐛 VEX Data Formatting - Strike ${strike}, Exp ${exp}: callVex=${vexData.call}, putVex=${vexData.put}`);
          }
        });
        return row;
      });
      
      return data;
    }
    return [];
  }, [viewMode, gexByStrikeByExpiration, vexByStrikeByExpiration, currentPrice, expirations, otmFilter, analysisType, showGEX, showOI, showVEX, gexMode, liveMode, vexMode, liveOIData]);

  // Update data state when memoized data changes
  useEffect(() => {
    setData(formattedData);
  }, [formattedData]);

  const handleTickerSubmit = () => {
    const newTicker = tickerInput.trim().toUpperCase();
    if (newTicker && newTicker !== selectedTicker) {
      setSelectedTicker(newTicker);
      setTickerInput(newTicker); // Ensure input stays synchronized
    }
  };

  // Sync tickerInput with selectedTicker when selectedTicker changes
  useEffect(() => {
    setTickerInput(selectedTicker);
  }, [selectedTicker]);



  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : value > 0 ? '+' : '';
    
    // Original GEX formatting (always used for middle line)
    if (absValue >= 1e9) {
      return `${sign}${(absValue / 1e9).toFixed(2)}B`;
    } else if (absValue >= 1e6) {
      return `${sign}${(absValue / 1e6).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${sign}${(absValue / 1000).toFixed(1)}K`;
    } else if (absValue > 0) {
      return `${sign}${absValue.toFixed(0)}`;
    }
    return '0';
  };

  const formatPremium = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : value > 0 ? '+' : '';
    
    // Smart premium formatting with $ prefix
    if (absValue >= 1e9) {
      // Billions: $1B, $4.32B
      const billions = absValue / 1e9;
      if (billions >= 10) {
        return `${sign}$${billions.toFixed(2)}B`;
      } else {
        return `${sign}$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(2)}B`;
      }
    } else if (absValue >= 1e6) {
      // Millions: $1M, $1.34M, $12.32M, $124.42M
      const millions = absValue / 1e6;
      if (millions >= 100) {
        return `${sign}$${millions.toFixed(2)}M`;
      } else if (millions >= 10) {
        return `${sign}$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
      } else {
        return `${sign}$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
      }
    } else if (absValue >= 1000) {
      // Thousands: $1K, $1.2K, $13.4K, $104.4K
      const thousands = absValue / 1000;
      if (thousands >= 100) {
        return `${sign}$${thousands.toFixed(1)}K`;
      } else if (thousands >= 10) {
        return `${sign}$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
      } else {
        return `${sign}$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
      }
    } else if (absValue >= 500) {
      // 500-999: $0.5K
      return `${sign}$${(absValue / 1000).toFixed(1)}K`;
    } else if (absValue > 0) {
      return `${sign}$${absValue.toFixed(0)}`;
    }
    return '$0';
  };

  const formatOI = (value: number) => {
    return value.toLocaleString('en-US');
  };

  // MEMOIZED: Top values calculated from ALL strikes (unfiltered by OTM range)
  // This ensures highlighting is based on absolute highest values across complete chain
  // Dependencies: ONLY allCalculatedData - NOT otmFilter, so changing OTM % doesn't affect which values are "top"
  const topValues = useMemo(() => {
    console.log('🔄 RECALCULATING topValues');
    console.log('📊 allCalculatedData length:', allCalculatedData.length);
    
    if (allCalculatedData.length === 0) {
      return {
        highest: 0,
        second: 0,
        third: 0,
        top10: [],
        top5Positive: [],
        top5Negative: []
      };
    }
    
    // IMPORTANT: Use allCalculatedData which contains Dealer-calculated values for ALL strikes
    const positiveValues: number[] = [];
    const negativeValues: number[] = [];
    
    // Read from allCalculatedData and collect values based on current display mode
    allCalculatedData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key === 'strike') return;
        
        const cellData = row[key];
        if (!cellData || typeof cellData === 'number') return;
        
        // Collect GEX values if GEX is shown
        if (showGEX) {
          if (gexMode === 'Net GEX') {
            // Only collect net values in Net GEX mode
            const netGex = cellData.net || 0;
            if (netGex > 0) positiveValues.push(Math.abs(netGex));
            else if (netGex < 0) negativeValues.push(Math.abs(netGex));
          } else {
            // Collect call and put separately in regular GEX or Dealer mode
            const callGex = cellData.call || 0;
            const putGex = cellData.put || 0;
            
            if (callGex > 0) positiveValues.push(Math.abs(callGex));
            else if (callGex < 0) negativeValues.push(Math.abs(callGex));
            
            if (putGex > 0) positiveValues.push(Math.abs(putGex));
            else if (putGex < 0) negativeValues.push(Math.abs(putGex));
          }
        }
        
        // Collect VEX values if VEX is shown
        if (showVEX) {
          if (vexMode === 'Net VEX') {
            const netVex = (cellData.callVex || 0) + (cellData.putVex || 0);
            if (netVex > 0) positiveValues.push(Math.abs(netVex));
            else if (netVex < 0) negativeValues.push(Math.abs(netVex));
          } else {
            const callVex = cellData.callVex || 0;
            const putVex = cellData.putVex || 0;
            
            if (callVex > 0) positiveValues.push(Math.abs(callVex));
            else if (callVex < 0) negativeValues.push(Math.abs(callVex));
            
            if (putVex > 0) positiveValues.push(Math.abs(putVex));
            else if (putVex < 0) negativeValues.push(Math.abs(putVex));
          }
        }
      });
    });
    
    console.log('📊 Total positive values collected:', positiveValues.length);
    console.log('📊 Total negative values collected:', negativeValues.length);
    
    // Filter out zero values and sort by absolute values (descending)
    const sortedPositive = positiveValues.filter(v => v > 0).sort((a, b) => b - a);
    const sortedNegative = negativeValues.filter(v => v > 0).sort((a, b) => b - a);
    
    console.log('✅ TOP VALUES LOCKED - These should NOT change when OTM filter changes:');
    console.log('   Mode: showGEX=' + showGEX + ', gexMode=' + gexMode + ', showVEX=' + showVEX);
    console.log('   Highest:', sortedPositive[0]);
    console.log('   Second:', sortedPositive[1]);
    console.log('   Third:', sortedPositive[2]);
    console.log('   Top 5 positive:', sortedPositive.slice(0, 5).map(v => `$${(v/1e6).toFixed(1)}M`));
    console.log('   Top 5 negative:', sortedNegative.slice(0, 5).map(v => `$${(v/1e6).toFixed(1)}M`));
    
    // Get top 5 for each category
    const top5Positive = sortedPositive.slice(0, 5);
    const top5Negative = sortedNegative.slice(0, 5);
    
    return {
      // For backward compatibility with existing code
      highest: sortedPositive[0] || sortedNegative[0] || 0,
      second: sortedPositive[1] || sortedNegative[1] || 0,
      third: sortedPositive[2] || sortedNegative[2] || 0,
      top10: [...sortedPositive.slice(3, 10), ...sortedNegative.slice(3, 10)],
      // New separate top 5 arrays
      top5Positive,
      top5Negative
    };
  }, [allCalculatedData, showGEX, showVEX, gexMode, vexMode]);

  const getCellStyle = (value: number, isVexValue: boolean = false) => {
    const absValue = Math.abs(value);
    const tops = topValues;
    
    // Use the same highlighting logic for both regular and Live OI modes
    // Gold/Purple/Green/Blue for top 1st/2nd/3rd/4th-10th values
    if ((showGEX || showVEX)) {
      // Use tolerance-based comparison to handle floating point precision issues
      const tolerance = 1; // $1 tolerance for large values
      
      // 1st - Gold (largest absolute value, positive or negative)
      if (absValue > 0 && Math.abs(absValue - tops.highest) < tolerance) {
        return 'bg-gradient-to-br from-yellow-600/70 to-yellow-800/70 text-yellow-100 font-bold shadow-lg shadow-yellow-500/30';
      }
      // 2nd - Purple (second largest absolute value, positive or negative)
      if (absValue > 0 && Math.abs(absValue - tops.second) < tolerance) {
        return 'bg-gradient-to-br from-purple-600/70 to-purple-800/70 text-purple-100 font-bold shadow-lg shadow-purple-500/30';
      }
      // 3rd - Lime Green (third largest absolute value, positive or negative)
      if (absValue > 0 && Math.abs(absValue - tops.third) < tolerance) {
        return 'bg-gradient-to-br from-lime-600/70 to-lime-800/70 text-lime-100 font-bold shadow-lg shadow-lime-500/30';
      }
      // 4th-10th - Light Blue (4th through 10th largest absolute values, positive or negative)
      if (absValue > 0 && tops.top10.some(topVal => Math.abs(absValue - topVal) < tolerance)) {
        return 'bg-gradient-to-br from-blue-600/70 to-blue-800/70 text-blue-100 font-bold shadow-lg shadow-blue-500/30';
      }
    }
    
    // Everything else - Black
    if (value !== 0) {
      return 'bg-gradient-to-br from-black to-gray-900 text-white border border-gray-700/30';
    }
    return 'bg-gradient-to-br from-gray-950 to-black text-gray-400 border border-gray-800/30';
  };

  const formatDate = (dateStr: string) => {
    // Parse as local date to avoid timezone conversion issues
    // Split the date string and create date in local timezone
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: 'America/New_York' // Use ET timezone for options expiration consistency
    });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-950/50 border border-red-800/50 rounded-xl p-6 backdrop-blur">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle size={24} />
              <div>
                <div className="font-semibold text-lg">Error Loading Data</div>
                <div className="text-sm text-red-300 mt-1">{error}</div>
              </div>
            </div>
            <button 
              onClick={fetchOptionsData}
              className="mt-4 px-6 py-3 bg-red-600 hover:bg-red-700 transition-all rounded-lg font-medium"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white">
      <style>{`
        /* Custom scrollbar styling */
        .overflow-x-auto::-webkit-scrollbar,
        .overflow-y-auto::-webkit-scrollbar {
          width: 12px;
          height: 12px;
          background-color: #000000;
        }
        
        .overflow-x-auto::-webkit-scrollbar-track,
        .overflow-y-auto::-webkit-scrollbar-track {
          background-color: #000000;
        }
        
        .overflow-x-auto::-webkit-scrollbar-thumb,
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background-color: #1f2937;
          border: 2px solid #000000;
        }
        
        .overflow-x-auto::-webkit-scrollbar-thumb:hover,
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background-color: #374151;
        }
        
        @media (max-width: 768px) {
          .dealer-attraction-container {
            padding-top: 30px !important;
          }
        }
      `}</style>
      <div className="p-6 pt-24 md:pt-6 dealer-attraction-container">
        <div className="max-w-[95vw] mx-auto">
          {/* Bloomberg Terminal Header */}
          <div className="mb-6 bg-black border border-gray-600/40">
            {/* Control Panel */}
            <div className="bg-black border-y border-gray-800">
              <div className="px-4 md:px-8 py-3 md:py-6">
                {/* Main Tabs */}
                <div className="flex gap-0 w-full mb-4">
                  <button 
                    onClick={() => setActiveTab('WORKBENCH')}
                    className={`flex-1 font-black uppercase tracking-[0.15em] transition-all ${
                      activeTab === 'WORKBENCH' 
                        ? 'relative text-white border-2 border-orange-500 shadow-[0_0_20px_rgba(255,102,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]' 
                        : 'bg-black text-orange-500 hover:text-white border-2 border-gray-800 hover:border-orange-500 hover:shadow-[0_0_15px_rgba(255,102,0,0.3)]'
                    }`} 
                    style={{ padding: '14px 16px', fontSize: '10px' }}
                  >
                    {activeTab === 'WORKBENCH' && <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent"></div>}
                    <span className="relative" style={activeTab === 'WORKBENCH' ? { textShadow: '0 2px 4px rgba(0,0,0,0.8)' } : {}}>WORKBENCH</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('ATTRACTION')}
                    className={`flex-1 font-black uppercase tracking-[0.15em] transition-all ${
                      activeTab === 'ATTRACTION' 
                        ? 'relative text-white border-2 border-orange-500 shadow-[0_0_20px_rgba(255,102,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]' 
                        : 'bg-black text-orange-500 hover:text-white border-2 border-gray-800 hover:border-orange-500 hover:shadow-[0_0_15px_rgba(255,102,0,0.3)]'
                    }`} 
                    style={{ padding: '14px 16px', fontSize: '10px' }}
                  >
                    {activeTab === 'ATTRACTION' && <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent"></div>}
                    <span className="relative" style={activeTab === 'ATTRACTION' ? { textShadow: '0 2px 4px rgba(0,0,0,0.8)' } : {}}>GREEK SUITE</span>
                  </button>

                </div>

                {/* Only show these controls for GREEK SUITE tab */}
                {activeTab === 'ATTRACTION' && (
                  <div className="flex items-center justify-between">
                    {/* Left Controls */}
                    <div className="flex items-center gap-4 md:gap-8">
                    {/* Ticker Search */}
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
                      <div className="relative flex items-center">
                        <div className="search-bar-premium flex items-center space-x-2 px-3 py-2 rounded-md">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(128, 128, 128, 0.5)' }}>
                            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                          <input
                            type="text"
                            value={tickerInput}
                            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleTickerSubmit();
                              }
                            }}
                            className="bg-transparent border-0 outline-none w-28 text-lg font-bold uppercase"
                            style={{
                              color: '#ffffff',
                              textShadow: '0 0 5px rgba(128, 128, 128, 0.2), 0 1px 2px rgba(0, 0, 0, 0.8)',
                              fontFamily: 'system-ui, -apple-system, sans-serif',
                              letterSpacing: '0.8px'
                            }}
                            placeholder="Search..."
                          />
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: '#666' }}>
                            <path d="M12 5v14l7-7-7-7z" fill="currentColor"/>
                          </svg>
                        </div>
                      </div>
                      

                    </div>
                    
                    {/* Analysis Type & OTM Dropdown */}
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
                      {/* Display Toggle Checkboxes */}
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">DISPLAY</span>
                        <div className="flex items-center gap-6">
                          {/* GEX Dropdown */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={showGEX}
                              onChange={(e) => setShowGEX(e.target.checked)}
                              className="w-4 h-4 text-orange-500 bg-black border-2 border-gray-600 rounded focus:ring-orange-500 focus:ring-2"
                            />
                            <div className="relative">
                              <select
                                value={gexMode}
                                onChange={(e) => setGexMode(e.target.value as 'GEX' | 'Net GEX' | 'Dealer')}
                                className="bg-black border-2 border-gray-800 focus:border-orange-500 focus:outline-none px-3 py-1.5 pr-8 text-white text-xs font-bold uppercase appearance-none cursor-pointer min-w-[80px] transition-all"
                              >
                                <option value="GEX">GEX</option>
                                <option value="Net GEX">Net GEX</option>
                                <option value="Dealer">Dealer</option>
                              </select>
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                <svg className="w-3 h-3 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          

                          
                          {/* OI Dropdown */}
                          {/* OI Checkbox */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={showOI}
                              onChange={(e) => setShowOI(e.target.checked)}
                              className="w-4 h-4 text-blue-500 bg-black border-2 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                            />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">OI</span>
                          </div>
                          
                          {/* VEX Dropdown */}
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={showVEX}
                              onChange={(e) => setShowVEX(e.target.checked)}
                              className="w-4 h-4 text-purple-500 bg-black border-2 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                            />
                            <div className="relative">
                              <select
                                value={vexMode}
                                onChange={(e) => setVexMode(e.target.value as 'VEX' | 'Net VEX')}
                                className="bg-black border-2 border-gray-800 focus:border-purple-500 focus:outline-none px-3 py-1.5 pr-8 text-white text-xs font-bold uppercase appearance-none cursor-pointer min-w-[80px] transition-all"
                              >
                                <option value="VEX">VEX</option>
                                <option value="Net VEX">Net VEX</option>
                              </select>
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                <svg className="w-3 h-3 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          
                          {/* LIVE Button */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (!liveMode) {
                                  setLiveMode(true);
                                  updateLiveOI();
                                } else {
                                  setLiveMode(false);
                                }
                              }}
                              disabled={liveOILoading}
                              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded transition-all ${
                                liveMode 
                                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/50' 
                                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border-2 border-gray-700'
                              } ${liveOILoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {liveOILoading ? 'LOADING...' : liveMode ? 'LIVE ✓' : 'LIVE'}
                            </button>
                            {liveOILoading && (
                              <div className="flex items-center gap-2">
                                <div className="relative w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                                  <div 
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
                                    style={{ width: `${liveOIProgress}%` }}
                                  />
                                </div>
                                <span className="text-xs text-green-400 font-bold">{liveOIProgress}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* OTM Filter Dropdown */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">OTM RANGE</span>
                        <div className="relative">
                          <select
                            value={otmFilter}
                            onChange={(e) => setOtmFilter(e.target.value as '2%' | '3%' | '5%' | '10%' | '20%' | '40%' | '50%' | '100%')}
                            className="bg-black border-2 border-gray-800 focus:border-orange-500 focus:outline-none px-4 py-2.5 pr-10 text-white text-sm font-bold uppercase appearance-none cursor-pointer min-w-[90px] transition-all"
                          >
                            <option value="2%">±2%</option>
                            <option value="3%">±3%</option>
                            <option value="5%">±5%</option>
                            <option value="10%">±10%</option>
                            <option value="20%">±20%</option>
                            <option value="40%">±40%</option>
                            <option value="50%">±50%</option>
                            <option value="100%">±100%</option>
                          </select>
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                            <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      {/* Mobile Refresh Button */}
                      <div className="md:hidden">
                        <button
                          onClick={fetchOptionsData}
                          disabled={loading}
                          className="w-full flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-bold text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 justify-center"
                        >
                          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                          {loading ? 'UPDATING' : 'REFRESH'}
                        </button>
                      </div>
                    </div>


                  </div>
                  
                    {/* Desktop Refresh Button */}
                    <button
                      onClick={fetchOptionsData}
                      disabled={loading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-bold text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                      {loading ? 'UPDATING' : 'REFRESH'}
                    </button>
                  </div>
                )}

                {/* WORKBENCH Content */}
                {activeTab === 'WORKBENCH' && (
                  <div>
                    {/* Ticker Search for WORKBENCH */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="relative flex items-center">
                          <div className="search-bar-premium flex items-center space-x-2 px-3 py-2 rounded-md">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(128, 128, 128, 0.5)' }}>
                              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                              <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                            <input
                              type="text"
                              value={tickerInput}
                              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleTickerSubmit();
                                }
                              }}
                              className="bg-transparent border-0 outline-none w-28 text-lg font-bold uppercase"
                              style={{
                                color: '#ffffff',
                                textShadow: '0 0 5px rgba(128, 128, 128, 0.2), 0 1px 2px rgba(0, 0, 0, 0.8)',
                                fontFamily: 'system-ui, -apple-system, sans-serif',
                                letterSpacing: '0.8px'
                              }}
                              placeholder="Search..."
                            />
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: '#666' }}>
                              <path d="M12 5v14l7-7-7-7z" fill="currentColor"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {/* MM, MP, SI Buttons */}
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setActiveWorkbenchTab('MM')}
                            className={`px-4 py-2 font-bold text-xs uppercase tracking-wider transition-all ${
                              activeWorkbenchTab === 'MM' 
                                ? 'bg-blue-600 text-white border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]' 
                                : 'bg-black text-blue-400 hover:text-white border-2 border-gray-800 hover:border-blue-500 hover:bg-blue-900/20'
                            }`}
                          >
                            MM
                          </button>
                          <button 
                            onClick={() => setActiveWorkbenchTab('MP')}
                            className={`px-4 py-2 font-bold text-xs uppercase tracking-wider transition-all ${
                              activeWorkbenchTab === 'MP' 
                                ? 'bg-green-600 text-white border-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' 
                                : 'bg-black text-green-400 hover:text-white border-2 border-gray-800 hover:border-green-500 hover:bg-green-900/20'
                            }`}
                          >
                            MP
                          </button>
                          <button 
                            onClick={() => setActiveWorkbenchTab('SI')}
                            className={`px-4 py-2 font-bold text-xs uppercase tracking-wider transition-all ${
                              activeWorkbenchTab === 'SI' 
                                ? 'bg-purple-600 text-white border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]' 
                                : 'bg-black text-purple-400 hover:text-white border-2 border-gray-800 hover:border-purple-500 hover:bg-purple-900/20'
                            }`}
                          >
                            SI
                          </button>
                        </div>
                        
                        <button
                          onClick={fetchOptionsData}
                          disabled={loading}
                          className="flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-bold text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                        >
                          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                          {loading ? 'UPDATING' : 'REFRESH'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-center py-8">
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading && data.length === 0 ? (
            <div className="text-center py-32 bg-gradient-to-r from-gray-900/50 to-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50">
              <RefreshCw size={48} className="animate-spin mx-auto mb-6 text-blue-400" />
              <p className="text-xl font-semibold text-gray-300">Loading Real Market Data</p>
              <p className="text-sm text-gray-500 mt-2">Fetching options chains and calculating dealer attraction levels...</p>
              
              {/* Web Worker Progress Bar */}
              {progress > 0 && (
                <div className="mt-6 mx-auto max-w-md">
                  <div className="relative w-full h-3 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                    <div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 ease-out shadow-lg shadow-blue-500/50"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Processing: {progress}%</p>
                </div>
              )}
            </div>
          ) : activeTab === 'ATTRACTION' ? (
            <>
              {/* Dealer Attraction Legend - Only show when Live OI mode is active */}
              {liveMode && showGEX && (
                <div className="mb-4 bg-gradient-to-r from-gray-900 via-black to-gray-900 border-2 border-orange-500/40 rounded-lg p-4 shadow-xl">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="text-orange-400 text-xl">🔥</div>
                      <h3 className="text-sm font-black text-orange-400 uppercase tracking-wider">DEALER ATTRACTION ACTIVE</h3>
                    </div>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      {/* Blue Info */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-400 to-blue-600 shadow-md"></div>
                        <div>
                          <div className="font-bold text-blue-400">BLUE</div>
                          <div className="text-gray-400 text-[10px]">CounterTrend (Top 5)</div>
                        </div>
                      </div>
                      {/* Purple Info */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-800 to-purple-950 shadow-md"></div>
                        <div>
                          <div className="font-bold text-purple-400">PURPLE</div>
                          <div className="text-gray-400 text-[10px]">Squeeze (Top 5)</div>
                        </div>
                      </div>
                      {/* Attraction Node Info */}
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-bold text-white">ATTRACTION</div>
                        </div>
                      </div>
                      {/* Reversal Info */}
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-bold text-white">REVERSAL</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-gray-900 border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700 bg-black">
                        <th className="px-6 py-4 text-left sticky left-0 bg-gradient-to-br from-black via-gray-900 to-black z-10 border-r border-gray-700 shadow-xl">
                          <div className="text-xs font-bold text-white uppercase">Strike</div>
                        </th>
                        {expirations.map(exp => (
                          <th key={exp} className="text-center bg-gradient-to-br from-black via-gray-900 to-black border-l border-r border-gray-800 shadow-lg">
                            <div className="text-xs font-bold text-white uppercase px-2 py-2 bg-gradient-to-br from-black via-gray-900 to-black border border-gray-700/50 mb-2 shadow-inner">
                              {formatDate(exp)}
                            </div>
                            {/* Show CALL/PUT labels only when NOT in Net mode */}
                            {(gexMode !== 'Net GEX' && vexMode !== 'Net VEX') && (
                              <div className="flex">
                                <div className="flex-1 text-xs font-bold text-green-400 uppercase px-2 py-1 bg-gradient-to-br from-black via-gray-900 to-black border-r border-gray-700/50">
                                  CALL
                                </div>
                                <div className="flex-1 text-xs font-bold text-red-400 uppercase px-2 py-1 bg-gradient-to-br from-black via-gray-900 to-black">
                                  PUT
                                </div>
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, idx) => {
                        // Find the single closest strike to current price
                        const closestStrike = currentPrice > 0 ? data.reduce((closest, current) => 
                          Math.abs(current.strike - currentPrice) < Math.abs(closest.strike - currentPrice) ? current : closest
                        ).strike : 0;
                        
                        // Find the strike with the highest GEX value using the same logic as cell highlighting
                        // This ensures purple row highlight is always on the same strike as the gold cell
                        const tolerance = 1;
                        const largestValueStrike = allCalculatedData.length > 0 && topValues.highest > 0 
                          ? (allCalculatedData.find(row => {
                              return expirations.some(exp => {
                                const value = row[exp] as {call: number, put: number, net: number};
                                const callAbs = Math.abs(value?.call || 0);
                                const putAbs = Math.abs(value?.put || 0);
                                return Math.abs(callAbs - topValues.highest) < tolerance || 
                                       Math.abs(putAbs - topValues.highest) < tolerance;
                              });
                            })?.strike ?? 0)
                          : 0;



                        // Find the cell with largest VEX value (only when VEX is enabled)
                        let largestVexCell: { strike: number | null, exp: string | null, type: string | null, value: number } = { strike: null, exp: null, type: null, value: 0 };
                        if (showVEX) {
                          data.forEach(row => {
                            expirations.forEach(exp => {
                              const value = row[exp] as any;
                              if (Math.abs(value?.callVex || 0) > largestVexCell.value) {
                                largestVexCell = { strike: row.strike, exp, type: 'call', value: Math.abs(value?.callVex || 0) };
                              }
                              if (Math.abs(value?.putVex || 0) > largestVexCell.value) {
                                largestVexCell = { strike: row.strike, exp, type: 'put', value: Math.abs(value?.putVex || 0) };
                              }
                            });
                          });
                        }
                        
                        const isCurrentPriceRow = currentPrice > 0 && row.strike === closestStrike;
                        const isLargestValueRow = row.strike === largestValueStrike;
                        
                        return (
                          <tr 
                            key={idx} 
                            className={`border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors ${
                              isCurrentPriceRow ? 'bg-yellow-900/20 border-yellow-500/40' : 
                              isLargestValueRow ? 'bg-purple-900/20 border-purple-500/40' : ''
                            }`}
                          >
                            <td className={`px-6 py-4 font-bold sticky left-0 z-10 border-r border-gray-700/30 ${
                              isCurrentPriceRow ? 'bg-yellow-800/30' : 
                              isLargestValueRow ? 'bg-purple-800/30' : 'bg-black'
                            }`}>
                              <div className={`text-base font-mono font-bold ${
                                isCurrentPriceRow ? 'text-yellow-300' : 
                                isLargestValueRow ? 'text-purple-300' : 'text-white'
                              }`} style={{
                                textShadow: isCurrentPriceRow ? '0 0 12px rgba(234, 179, 8, 0.8)' : 
                                           isLargestValueRow ? '0 0 15px rgba(147, 51, 234, 0.9)' : 
                                           '0 0 8px rgba(255,255,255,0.5)'
                              }}>
                                {row.strike.toFixed(1)}
                                {isCurrentPriceRow && <span className="ml-2 text-xs text-yellow-400">● CURRENT</span>}
                              </div>
                            </td>
                            {expirations.map(exp => {
                              const value = row[exp] as {call: number, put: number, net: number, callOI: number, putOI: number, callPremium?: number, putPremium?: number, callVex?: number, putVex?: number};
                              const callValue = value?.call || 0;
                              const putValue = value?.put || 0;
                              const netValue = value?.net || 0;
                              let callOI = value?.callOI || 0;
                              let putOI = value?.putOI || 0;
                              
                              // Debug put OI rendering values
                              if (putOI > 0) {
                                console.log(`🎯 RENDER PUT OI: Strike ${row.strike}, Exp ${exp}, putOI=${putOI}, value:`, value);
                              }
                              
                              // Use Live OI if mode is selected
                              if (liveMode && liveOIData.size > 0) {
                                const callKey = `${selectedTicker}_${row.strike}_call_${exp}`;
                                const putKey = `${selectedTicker}_${row.strike}_put_${exp}`;
                                
                                const liveCallOI = liveOIData.get(callKey);
                                const livePutOI = liveOIData.get(putKey);
                                
                                if (liveCallOI !== undefined) callOI = liveCallOI;
                                if (livePutOI !== undefined) putOI = livePutOI;
                              }
                              
                              const callPremium = value?.callPremium || 0;
                              const putPremium = value?.putPremium || 0;
                              const callVex = value?.callVex || 0;
                              const putVex = value?.putVex || 0;
                              
                              // Debug VEX rendering values - show both zero and non-zero cases when VEX is enabled
                              if (showVEX) {
                                console.log(`🎨 VEX Rendering - Strike ${row.strike}, Exp ${exp}: callVex=${callVex}, putVex=${putVex}, value:`, value);
                                // Also check if VEX data exists in the original state
                                const originalVexData = vexByStrikeByExpiration[exp]?.[row.strike];
                                if (originalVexData) {
                                  console.log(`📊 Original VEX State - Strike ${row.strike}, Exp ${exp}: call=${originalVexData.call}, put=${originalVexData.put}`);
                                } else {
                                  console.log(`❌ No VEX State Found - Strike ${row.strike}, Exp ${exp}`);
                                }
                              }
                              
                              // Check if this is the largest VEX cell
                              const isLargestVexCall = showVEX && 
                                largestVexCell.strike === row.strike && 
                                largestVexCell.exp === exp && 
                                largestVexCell.type === 'call';
                              const isLargestVexPut = showVEX && 
                                largestVexCell.strike === row.strike && 
                                largestVexCell.exp === exp && 
                                largestVexCell.type === 'put';
                              
                              // Dealer attraction identification (when Live OI is active)
                              const tops = topValues;
                              const absCallValue = Math.abs(callValue);
                              const absPutValue = Math.abs(putValue);
                              const netValueCalculated = callValue + putValue; // Calculate net from actual call+put values
                              const absNetValue = Math.abs(netValueCalculated);
                              
                              // Check if this cell is an Attraction or Reversal level
                              // For split mode (separate call/put cells)
                              const isAttractionCall = liveMode && showGEX && absCallValue === tops.highest && absCallValue > 0;
                              const isAttractionPut = liveMode && showGEX && absPutValue === tops.highest && absPutValue > 0;
                              const isReversalCall = liveMode && showGEX && (absCallValue === tops.second || absCallValue === tops.third) && absCallValue > 0;
                              const isReversalPut = liveMode && showGEX && (absPutValue === tops.second || absPutValue === tops.third) && absPutValue > 0;
                              
                              // For Net GEX mode (single cell with net value)
                              const isAttractionNet = liveMode && showGEX && gexMode === 'Net GEX' && absNetValue === tops.highest && absNetValue > 0;
                              const isReversalNet = liveMode && showGEX && gexMode === 'Net GEX' && (absNetValue === tops.second || absNetValue === tops.third) && absNetValue > 0;
                              
                              return (
                                <td
                                  key={exp}
                                  className={`px-4 py-3 ${
                                    isCurrentPriceRow ? 'bg-yellow-900/15' : 
                                    isLargestValueRow ? 'bg-purple-900/15' : ''
                                  }`}
                                >
                                  {/* Display separate call/put cells OR net value based on mode */}
                                  {(gexMode === 'Net GEX' && showGEX) || (vexMode === 'Net VEX' && showVEX) ? (
                                    // Net mode - single cell with net value
                                    <div className={`${getCellStyle(showVEX ? callVex + putVex : callValue + putValue)} px-3 py-2 rounded-lg text-center font-mono transition-all hover:scale-105 ${
                                      isCurrentPriceRow ? 'ring-1 ring-yellow-500/40' : 
                                      isLargestValueRow ? 'ring-1 ring-purple-500/50' : ''
                                    }`}>
                                      {/* Dealer Attraction badges for Net GEX Live OI mode */}
                                      {isAttractionNet && (
                                        <div className="text-[9px] font-black mb-0.5 tracking-wider text-white" style={{ 
                                          textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,255,255,0.3)'
                                        }}>
                                          ATTRACT
                                        </div>
                                      )}
                                      {isReversalNet && !isAttractionNet && (
                                        <div className="text-[10px] font-bold mb-0.5 tracking-wide text-white" style={{ 
                                          textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,255,255,0.3)'
                                        }}>
                                          REVERSE
                                        </div>
                                      )}
                                      {showGEX && gexMode === 'Net GEX' && (
                                        <div className="text-xs font-bold">{formatCurrency(callValue + putValue)}</div>
                                      )}
                                      {showVEX && vexMode === 'Net VEX' && (
                                        <div className="text-xs font-bold text-purple-400">{formatCurrency(callVex + putVex)}</div>
                                      )}
                                      {showOI && (
                                        <div className="text-xs text-orange-500 font-bold mt-1">{formatOI(callOI + putOI)}</div>
                                      )}
                                    </div>
                                  ) : (
                                    // Split mode - separate call/put cells
                                    <div className="flex gap-1.5">
                                      <div className={`${getCellStyle(showVEX ? callVex : callValue)} px-3 py-2 rounded-lg text-center font-mono flex-1 transition-all hover:scale-105 ${
                                        isCurrentPriceRow ? 'ring-1 ring-yellow-500/40' : 
                                        isLargestValueRow ? 'ring-1 ring-purple-500/50' : 
                                        isLargestVexCall ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-500/50' : ''
                                      }`} style={isLargestVexCall ? {
                                        boxShadow: '0 0 20px rgba(168, 85, 247, 0.8), 0 0 40px rgba(168, 85, 247, 0.4)'
                                      } : {}}>
                                        {/* Dealer Attraction badges for Live OI mode */}
                                        {isAttractionCall && (
                                          <div className="text-[9px] font-black mb-0.5 tracking-wider text-white" style={{ 
                                            textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,255,255,0.3)'
                                          }}>
                                            ATTRACT
                                          </div>
                                        )}
                                        {isReversalCall && !isAttractionCall && (
                                          <div className="text-[10px] font-bold mb-0.5 tracking-wide text-white" style={{ 
                                            textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,255,255,0.3)'
                                          }}>
                                            REVERSE
                                          </div>
                                        )}
                                        {showGEX && (
                                          <div className="text-xs font-bold">{formatCurrency(callValue)}</div>
                                        )}
                                        {showVEX && (
                                          <div className="text-xs font-bold text-purple-400">{formatCurrency(callVex)}</div>
                                        )}
                                        {showOI && (
                                          <div className="text-xs text-orange-500 font-bold mt-1">{formatOI(callOI)}</div>
                                        )}
                                      </div>
                                      <div className={`${getCellStyle(showVEX ? putVex : putValue)} px-3 py-2 rounded-lg text-center font-mono flex-1 transition-all hover:scale-105 ${
                                        isCurrentPriceRow ? 'ring-1 ring-yellow-500/40' : 
                                        isLargestValueRow ? 'ring-1 ring-purple-500/50' : 
                                        isLargestVexPut ? 'ring-2 ring-purple-500 shadow-lg shadow-purple-500/50' : ''
                                      }`} style={isLargestVexPut ? {
                                        boxShadow: '0 0 20px rgba(168, 85, 247, 0.8), 0 0 40px rgba(168, 85, 247, 0.4)'
                                      } : {}}>
                                        {/* Dealer Attraction badges for Live OI mode */}
                                        {isAttractionPut && (
                                          <div className="text-[9px] font-black mb-0.5 tracking-wider text-white" style={{ 
                                            textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,255,255,0.3)'
                                          }}>
                                            ATTRACT
                                          </div>
                                        )}
                                        {isReversalPut && !isAttractionPut && (
                                          <div className="text-[10px] font-bold mb-0.5 tracking-wide text-white" style={{ 
                                            textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,255,255,0.3)'
                                          }}>
                                            REVERSE
                                          </div>
                                        )}
                                        {showGEX && (
                                          <div className="text-xs font-bold">{formatCurrency(putValue)}</div>
                                        )}
                                        {showVEX && (
                                          <div className="text-xs font-bold text-purple-400">{formatCurrency(putVex)}</div>
                                        )}
                                        {showOI && (
                                          <div className="text-xs text-orange-500 font-bold mt-1">{formatOI(putOI)}</div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>


            </>
          ) : activeTab === 'WORKBENCH' ? (
            // WORKBENCH Panel Content
            <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-xl p-8">
              <div className="text-center">
                {/* Render the appropriate workbench component */}
                {activeWorkbenchTab === 'MM' && (
                  <MMDashboard 
                    selectedTicker={selectedTicker}
                    currentPrice={currentPrice}
                    gexByStrikeByExpiration={gexByStrikeByExpiration}
                    expirations={expirations}
                  />
                )}
                {activeWorkbenchTab === 'MP' && (
                  <MPDashboard 
                    selectedTicker={selectedTicker}
                    currentPrice={currentPrice}
                    gexByStrikeByExpiration={gexByStrikeByExpiration}
                    expirations={expirations}
                  />
                )}
                {activeWorkbenchTab === 'SI' && (
                  <SIDashboard 
                    selectedTicker={selectedTicker}
                    currentPrice={currentPrice}
                    gexByStrikeByExpiration={gexByStrikeByExpiration}
                    vexByStrikeByExpiration={vexByStrikeByExpiration}
                    expirations={expirations}
                  />
                )}
                

              </div>
            </div>
          ) : (
            // RIGHTSIDE Panel Content (Empty)
            <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-xl p-8">
              <div className="text-center py-16">
                <h1 className="text-4xl font-bold mb-4">
                  <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                    RightSide
                  </span>
                </h1>
                <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-8">
                  Premium analytics and advanced market data visualization tools
                </p>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DealerAttraction;
