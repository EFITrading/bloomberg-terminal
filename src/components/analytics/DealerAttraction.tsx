import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, Activity, Target, BarChart3, Gauge } from 'lucide-react';
import OpenInterestChart from './OpenInterestChart';
import GEXScreener from './GEXScreener';

interface GEXData {
  strike: number;
  [key: string]: number | {call: number, put: number, net: number, callOI: number, putOI: number, callPremium?: number, putPremium?: number, callVex?: number, putVex?: number, callDelta?: number, putDelta?: number, flowCall?: number, flowPut?: number, flowNet?: number};
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
  // Enhanced Greeks data
  netDelta: number;
  netGamma: number;
  netTheta: number;
  netVega: number;
  callDelta: number;
  putDelta: number;
  callGamma: number;
  putGamma: number;
  callTheta: number;
  putTheta: number;
  callVega: number;
  putVega: number;
}

interface MMDashboardProps {
  selectedTicker: string;
  currentPrice: number;
  gexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callTheta?: number, putTheta?: number, callVega?: number, putVega?: number}}};
  vexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number}}};
  expirations: string[];
}

interface SIDashboardProps {
  selectedTicker: string;
  currentPrice: number;
  gexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number}}};
  vexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number}}};
  expirations: string[];
}

interface MaxPainDashboardProps {
  selectedTicker: string;
  currentPrice: number;
  gexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVega?: number, putVega?: number, callTheta?: number, putTheta?: number}}};
  vexByStrikeByExpiration: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number}}};
  expirations: string[];
}

// MM Dashboard Component - Enhanced with Full Greeks
const MMDashboard: React.FC<MMDashboardProps> = ({ selectedTicker, currentPrice, gexByStrikeByExpiration, vexByStrikeByExpiration, expirations }) => {
  
  // Filter to 45-day expirations only
  const mmExpirations = useMemo(() => {
    const today = new Date();
    const maxDate = new Date(today.getTime() + (45 * 24 * 60 * 60 * 1000)); // 45 days from now
    
    return expirations.filter(exp => {
      const expDate = new Date(exp + 'T00:00:00Z');
      return expDate >= today && expDate <= maxDate; // FIX: Added >= today check
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
      
      // Enhanced Greeks aggregation
      let totalCallDelta = 0, totalPutDelta = 0;
      let totalCallGamma = 0, totalPutGamma = 0;
      let totalCallTheta = 0, totalPutTheta = 0;
      let totalCallVega = 0, totalPutVega = 0;

      mmExpirations.forEach(exp => {
        const strikeData = gexByStrikeByExpiration[exp]?.[strike];
        const vexData = vexByStrikeByExpiration[exp]?.[strike];
        if (strikeData) {
          // Calculate days to expiry first for weighting
          const expDate = new Date(exp + 'T00:00:00Z');
          const today = new Date();
          const daysToExp = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          // Apply time decay weighting formula: (8 - Math.min(7, daysToExp)) / 7
          const dteWeight = daysToExp >= 0 ? (8 - Math.min(7, daysToExp)) / 7 : 1;
          
          // Convert GEX to MM: MM = GEX / (Stock Price * 0.01) for 1% move
          const callMM = (strikeData.call / (currentPrice * 0.01)) * dteWeight;
          const putMM = (strikeData.put / (currentPrice * 0.01)) * dteWeight;
          
          totalCallMM += callMM;
          totalPutMM += putMM;
          totalOI += (strikeData.callOI || 0) + (strikeData.putOI || 0);
          
          // Aggregate Greeks with DTE weighting
          const callOI = strikeData.callOI || 0;
          const putOI = strikeData.putOI || 0;
          
          // Delta: Approximate based on moneyness
          const moneyness = strike / currentPrice;
          let callDelta = 0, putDelta = 0;
          if (moneyness > 1.1) { callDelta = 0.1; putDelta = -0.9; }
          else if (moneyness > 1.05) { callDelta = 0.3; putDelta = -0.7; }
          else if (moneyness > 1.0) { callDelta = 0.4; putDelta = -0.6; }
          else if (moneyness > 0.95) { callDelta = 0.6; putDelta = -0.4; }
          else if (moneyness > 0.9) { callDelta = 0.7; putDelta = -0.3; }
          else { callDelta = 0.9; putDelta = -0.1; }
          
          totalCallDelta += (callDelta * callOI * 100) * dteWeight;
          totalPutDelta += (putDelta * putOI * 100) * dteWeight;
          
          // Gamma from GEX data
          totalCallGamma += ((strikeData.callGamma || 0) * callOI) * dteWeight;
          totalPutGamma += ((strikeData.putGamma || 0) * putOI) * dteWeight;
          
          // Theta from GEX data
          totalCallTheta += ((strikeData.callTheta || 0) * callOI) * dteWeight;
          totalPutTheta += ((strikeData.putTheta || 0) * putOI) * dteWeight;
          
          // Vega from GEX data (stored there during calculation)
          totalCallVega += ((strikeData.callVega || 0) * callOI) * dteWeight;
          totalPutVega += ((strikeData.putVega || 0) * putOI) * dteWeight;
          
          avgDaysToExpiry += daysToExp;
          validExpirations++;
        }
      });

      if (validExpirations > 0) {
        avgDaysToExpiry = avgDaysToExpiry / validExpirations;
      }

      const netMM = totalCallMM + totalPutMM;
      const netDelta = totalCallDelta + totalPutDelta;
      const netGamma = totalCallGamma + totalPutGamma;
      const netTheta = totalCallTheta + totalPutTheta;
      const netVega = totalCallVega + totalPutVega;
      
      return {
        strike,
        netMM,
        callMM: totalCallMM,
        putMM: totalPutMM,
        totalOI,
        daysToExpiry: Math.round(avgDaysToExpiry),
        impact: Math.abs(netMM),
        netDelta,
        netGamma,
        netTheta,
        netVega,
        callDelta: totalCallDelta,
        putDelta: totalPutDelta,
        callGamma: totalCallGamma,
        putGamma: totalPutGamma,
        callTheta: totalCallTheta,
        putTheta: totalPutTheta,
        callVega: totalCallVega,
        putVega: totalPutVega
      };
    }).sort((a, b) => b.strike - a.strike);

    return mmByStrike;
  }, [currentPrice, gexByStrikeByExpiration, mmExpirations]);

  // Calculate aggregate metrics with Enhanced Greeks
  const metrics = useMemo(() => {
    const totalNetMM = mmData.reduce((sum, item) => sum + item.netMM, 0);
    const maxCallWall = mmData.reduce((max, item) => item.callMM > max.callMM ? item : max, mmData[0] || { callMM: 0, strike: 0 });
    const maxPutFloor = mmData.reduce((max, item) => Math.abs(item.putMM) > Math.abs(max.putMM) ? item : max, mmData[0] || { putMM: 0, strike: 0 });
    
    // Aggregate Greek exposures
    const totalNetDelta = mmData.reduce((sum, item) => sum + item.netDelta, 0);
    const totalNetGamma = mmData.reduce((sum, item) => sum + item.netGamma, 0);
    const totalNetTheta = mmData.reduce((sum, item) => sum + item.netTheta, 0);
    const totalNetVega = mmData.reduce((sum, item) => sum + item.netVega, 0);
    
    // DEBUG: Log actual Greek totals before normalization
    console.log('🎯 GREEK TOTALS BEFORE NORMALIZATION:', {
      totalNetDelta,
      totalNetGamma,
      totalNetTheta,
      totalNetVega,
      mmDataCount: mmData.length
    });
    
    // Calculate absolute exposure (total notional risk)
    const totalCallDelta = mmData.reduce((sum, item) => sum + Math.abs(item.callDelta), 0);
    const totalPutDelta = mmData.reduce((sum, item) => sum + Math.abs(item.putDelta), 0);
    
    // Hedging pressure: How much dealers need to hedge
    const hedgingPressure = Math.abs(totalNetDelta) * currentPrice; // Dollar value of delta hedge
    
    // Volatility risk: How sensitive to IV changes
    const volRisk = Math.abs(totalNetVega);
    
    // === ADVANCED GREEK-BASED SIGNAL CALCULATION ===
    // Use ALL Greeks to determine true dealer positioning and market setup
    
    // 1. DELTA SCORE: Directional bias (-100 to +100)
    // Greeks from API are PER CONTRACT, multiplied by OI already, need different normalization
    const deltaScore = Math.max(-100, Math.min(100, totalNetDelta / 100000)); // Adjusted normalization
    
    // 2. GAMMA SCORE: Reflexivity (-100 to +100)
    const gammaScore = Math.max(-100, Math.min(100, totalNetGamma / 1000)); // Adjusted normalization
    
    // 3. THETA SCORE: Time decay pressure (-100 to +100)
    // Theta values are typically in thousands, normalize accordingly
    const thetaScore = Math.max(-100, Math.min(100, totalNetTheta / 1000)); // Changed from 10000 to 1000
    
    // 4. VEGA SCORE: Volatility positioning (-100 to +100)
    // Vega values are typically in thousands, normalize accordingly
    const vegaScore = Math.max(-100, Math.min(100, totalNetVega / 1000)); // Changed from 10000 to 1000
    
    console.log('🎯 GREEK SCORES AFTER NORMALIZATION:', {
      deltaScore,
      gammaScore,
      thetaScore,
      vegaScore
    });
    
    // === COMPOSITE SIGNAL ALGORITHM ===
    // Weight the Greeks based on their importance for trading decisions
    const DELTA_WEIGHT = 0.30;  // 30% - Direction matters most
    const GAMMA_WEIGHT = 0.35;  // 35% - Reflexivity is key for dealer behavior
    const THETA_WEIGHT = 0.20;  // 20% - Time decay creates urgency
    const VEGA_WEIGHT = 0.15;   // 15% - Vol exposure secondary
    
    const compositeScore = (
      deltaScore * DELTA_WEIGHT +
      gammaScore * GAMMA_WEIGHT +
      thetaScore * THETA_WEIGHT +
      vegaScore * VEGA_WEIGHT
    );
    
    console.log('🎯 COMPOSITE SCORE:', {
      compositeScore,
      breakdown: {
        deltaContribution: deltaScore * DELTA_WEIGHT,
        gammaContribution: gammaScore * GAMMA_WEIGHT,
        thetaContribution: thetaScore * THETA_WEIGHT,
        vegaContribution: vegaScore * VEGA_WEIGHT
      }
    });
    
    // === SIGNAL CLASSIFICATION ===
    let signal = 'WAIT';
    let signalColor = 'yellow';
    let signalExplanation = 'Mixed signals - no clear edge';
    
    // STRONG BUY: Much more realistic thresholds
    if (compositeScore > 3) {
      signal = 'BUY SETUP';
      signalColor = 'green';
      if (gammaScore > 5 && deltaScore > 3) {
        signalExplanation = 'Strong long gamma + bullish delta - dealers will buy dips & stabilize';
      } else if (thetaScore < -5 && Math.abs(deltaScore) > 5) {
        signalExplanation = 'Large theta bleed + directional position - dealers need price movement';
      } else {
        signalExplanation = 'Net bullish positioning across all Greeks - favorable setup';
      }
    }
    // STRONG SELL: Much more realistic thresholds
    else if (compositeScore < -3) {
      signal = 'SELL SETUP';
      signalColor = 'red';
      if (gammaScore < -5 && deltaScore < -3) {
        signalExplanation = 'Strong short gamma + bearish delta - dealers will sell rallies & amplify';
      } else if (thetaScore > 5 && vegaScore < -3) {
        signalExplanation = 'Collecting premium + short vol - dealers want compression & decay';
      } else {
        signalExplanation = 'Net bearish positioning across all Greeks - favorable short setup';
      }
    }
    // MODERATE BUY: Lowered threshold
    else if (compositeScore > 1) {
      signal = 'LEAN BUY';
      signalColor = 'green';
      signalExplanation = 'Moderate bullish bias - consider smaller long positions';
    }
    // MODERATE SELL: Lowered threshold
    else if (compositeScore < -1) {
      signal = 'LEAN SELL';
      signalColor = 'red';
      signalExplanation = 'Moderate bearish bias - consider smaller short positions';
    }
    // NEUTRAL: Stay flat
    else {
      signal = 'WAIT';
      signalColor = 'yellow';
      if (Math.abs(gammaScore) < 2 && Math.abs(deltaScore) < 2) {
        signalExplanation = 'Low conviction across all Greeks - wait for clearer setup';
      } else {
        signalExplanation = 'Conflicting signals - Greeks not aligned for directional trade';
      }
    }
    
    return {
      totalNetMM,
      maxCallWall,
      maxPutFloor,
      isLongGamma: totalNetMM > 0,
      reflexivity: Math.abs(totalNetMM) / 1000000,
      totalNetDelta,
      totalNetGamma,
      totalNetTheta,
      totalNetVega,
      hedgingPressure,
      volRisk,
      callDeltaExposure: totalCallDelta,
      putDeltaExposure: totalPutDelta,
      netDirectionalBias: totalNetDelta > 0 ? 'BULLISH' : totalNetDelta < 0 ? 'BEARISH' : 'NEUTRAL',
      // New Greek-based signal metrics
      deltaScore,
      gammaScore,
      thetaScore,
      vegaScore,
      compositeScore,
      signal,
      signalColor,
      signalExplanation
    };
  }, [mmData, currentPrice]);

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

  // Calculate SI metrics for the gauge
  const siMetrics = useMemo(() => {
    if (!currentPrice || Object.keys(gexByStrikeByExpiration).length === 0) {
      return { si: 0, gexTotal: 0, vexTotal: 0, dexTotal: 0, siNorm: 0, stability: 'UNKNOWN', marketBehavior: 'No Data', stabilityColor: 'text-gray-400' };
    }
    
    let totalGEX = 0;
    let totalVEX = 0; 
    let totalDEX = 0;
    
    // Sum across 45-day expirations and strikes using real data
    mmExpirations.forEach(exp => {
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
  }, [currentPrice, gexByStrikeByExpiration, vexByStrikeByExpiration, mmExpirations]);

  return (
    <div className="space-y-6">
      {/* Stability Index Gauge - Now hidden, moved to Trading Signal section */}

      {/* Trading Signal Gauge */}
      <div className="bg-black border border-gray-600 p-8">
        
        {/* Two Gauges Side by Side */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {/* Intensity Gauge (Left) */}
          <div className="relative w-full h-96">
            {/* SVG Gauge */}
            <svg className="w-full h-full" viewBox="0 0 400 250">
            {/* Gradient Definition */}
            <defs>
              <linearGradient id="glossyBlackGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1a1a1a" />
                <stop offset="50%" stopColor="#000000" />
                <stop offset="100%" stopColor="#0a0a0a" />
              </linearGradient>
              <linearGradient id="gaugeSellGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EAB308" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#F97316" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#DC2626" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="gaugeBuyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#EAB308" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#22C55E" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            
            {/* Title */}
            <text x="200" y="15" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle" letterSpacing="2">INTENSITY</text>
            
            {/* Background Arc */}
            <path
              d="M 40 200 A 160 160 0 0 1 360 200"
              fill="none"
              stroke="url(#glossyBlackGradient)"
              strokeWidth="35"
            />
            
            {/* Colored Progress Arc - Fills from center top */}
            {metrics.compositeScore < 0 ? (
              // Sell side - fill left from center
              <path
                d="M 200 40 A 160 160 0 0 0 40 200"
                fill="none"
                stroke="url(#gaugeSellGradient)"
                strokeWidth="35"
                strokeDasharray={`${(Math.PI * 160) / 2} ${(Math.PI * 160) / 2}`}
                strokeDashoffset={(Math.PI * 160) / 2 * (1 - Math.min(Math.abs(metrics.compositeScore), 20) / 20)}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            ) : (
              // Buy side - fill right from center
              <path
                d="M 200 40 A 160 160 0 0 1 360 200"
                fill="none"
                stroke="url(#gaugeBuyGradient)"
                strokeWidth="35"
                strokeDasharray={`${(Math.PI * 160) / 2} ${(Math.PI * 160) / 2}`}
                strokeDashoffset={(Math.PI * 160) / 2 * (1 - Math.min(metrics.compositeScore, 20) / 20)}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            )}
            
            {/* White Outline - Inner Edge */}
            <path
              d="M 57.5 200 A 142.5 142.5 0 0 1 342.5 200"
              fill="none"
              stroke="#CD7F32"
              strokeWidth="2"
            />
            
            {/* White Outline - Outer Edge */}
            <path
              d="M 22.5 200 A 177.5 177.5 0 0 1 377.5 200"
              fill="none"
              stroke="#CD7F32"
              strokeWidth="2"
            />
            
            {/* Scale Labels - Positioned INSIDE the gauge arc stroke */}
            {/* SELL SETUP (far left) */}
            <text fill="#FF0000" fontSize="9" fontWeight="bold" textAnchor="middle">
              <tspan x="55" y="135" transform="rotate(-55 55 135)">BREAK</tspan>
              <tspan x="55" y="144" transform="rotate(-55 55 144)">DOWN</tspan>
            </text>
            
            {/* STRONG SELL */}
            <text fill="#FFA500" fontSize="9" fontWeight="bold" textAnchor="middle">
              <tspan x="87" y="90" transform="rotate(-40 87 90)">STRONG</tspan>
              <tspan x="87" y="99" transform="rotate(-40 87 99)">SELL</tspan>
            </text>
            
            {/* SELL SETUP */}
            <text fill="#FFFF00" fontSize="9" fontWeight="bold" textAnchor="middle">
              <tspan x="128" y="55" transform="rotate(-22 128 55)">SELL</tspan>
              <tspan x="128" y="64" transform="rotate(-22 128 64)">SETUP</tspan>
            </text>
            
            {/* LEAN SELL */}
            <text fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">
              <tspan x="165" y="43" transform="rotate(-10 165 43)">LEAN</tspan>
              <tspan x="165" y="52" transform="rotate(-10 165 52)">SELL</tspan>
            </text>
            
            {/* LEAN BUY */}
            <text fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">
              <tspan x="235" y="43" transform="rotate(10 235 43)">LEAN</tspan>
              <tspan x="235" y="52" transform="rotate(10 235 52)">BUY</tspan>
            </text>
            
            {/* BUY SETUP */}
            <text fill="#00FFFF" fontSize="9" fontWeight="bold" textAnchor="middle">
              <tspan x="272" y="55" transform="rotate(22 272 55)">BUY</tspan>
              <tspan x="272" y="64" transform="rotate(22 272 64)">SETUP</tspan>
            </text>
            
            {/* STRONG BUY */}
            <text fill="#00FF00" fontSize="9" fontWeight="bold" textAnchor="middle">
              <tspan x="313" y="90" transform="rotate(40 313 90)">STRONG</tspan>
              <tspan x="313" y="99" transform="rotate(40 313 99)">BUY</tspan>
            </text>
            
            {/* BUY SETUP (far right) */}
            <text fill="#00FF00" fontSize="9" fontWeight="bold" textAnchor="middle">
              <tspan x="345" y="135" transform="rotate(55 345 135)">BREAK</tspan>
              <tspan x="345" y="144" transform="rotate(55 345 144)">OUT</tspan>
            </text>
            
            {/* Needle */}
            <line
              x1="200"
              y1="200"
              x2="200"
              y2="70"
              stroke="white"
              strokeWidth="5"
              strokeLinecap="round"
              className="transition-all duration-500"
              style={{
                transformOrigin: '200px 200px',
                transform: `rotate(${-90 + ((Math.max(-20, Math.min(20, metrics.compositeScore)) + 20) / 40) * 180}deg)`
              }}
            />
            
            {/* Center Dot */}
            <circle cx="200" cy="200" r="10" fill="white" />
          </svg>
          
          {/* Center Value Display */}
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center">
            <div className={`text-3xl font-bold ${
              metrics.signal.includes('BUY') ? 'text-green-400' :
              metrics.signal.includes('SELL') ? 'text-red-400' :
              'text-yellow-400'
            }`}>
              {metrics.compositeScore > 0 ? '+' : ''}{metrics.compositeScore.toFixed(1)}
            </div>
          </div>
          
          {/* Side Labels */}
          <div className="absolute bottom-8 left-4 text-lg text-red-400 font-bold">SELL</div>
          <div className="absolute bottom-8 right-4 text-lg text-green-400 font-bold">BUY</div>
          </div>
          
          {/* Stability Gauge (Right) */}
          <div className="relative w-full h-96">
            {/* SVG Gauge */}
            <svg className="w-full h-full" viewBox="0 0 400 250">
              {/* Gradient Definition */}
              <defs>
                <linearGradient id="siGlossyBlackGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#1a1a1a" />
                  <stop offset="50%" stopColor="#000000" />
                  <stop offset="100%" stopColor="#0a0a0a" />
                </linearGradient>
                <linearGradient id="siSellGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EAB308" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#F97316" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#DC2626" stopOpacity="0.4" />
                </linearGradient>
                <linearGradient id="siBuyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#EAB308" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              
              {/* Title */}
              <text x="200" y="15" fill="white" fontSize="16" fontWeight="bold" textAnchor="middle" letterSpacing="2">STABILITY</text>
              
              {/* Background Arc */}
              <path
                d="M 40 200 A 160 160 0 0 1 360 200"
                fill="none"
                stroke="url(#siGlossyBlackGradient)"
                strokeWidth="35"
              />
              
              {/* Colored Progress Arc - Fills from center top */}
              {siMetrics.siNorm < 0 ? (
                // Negative side - fill left from center
                <path
                  d="M 200 40 A 160 160 0 0 0 40 200"
                  fill="none"
                  stroke="url(#siSellGradient)"
                  strokeWidth="35"
                  strokeDasharray={`${(Math.PI * 160) / 2} ${(Math.PI * 160) / 2}`}
                  strokeDashoffset={(Math.PI * 160) / 2 * (1 - Math.min(Math.abs(siMetrics.siNorm), 10) / 10)}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              ) : (
                // Positive side - fill right from center
                <path
                  d="M 200 40 A 160 160 0 0 1 360 200"
                  fill="none"
                  stroke="url(#siBuyGradient)"
                  strokeWidth="35"
                  strokeDasharray={`${(Math.PI * 160) / 2} ${(Math.PI * 160) / 2}`}
                  strokeDashoffset={(Math.PI * 160) / 2 * (1 - Math.min(siMetrics.siNorm, 10) / 10)}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              )}
              
              {/* White Outline - Inner Edge */}
              <path
                d="M 57.5 200 A 142.5 142.5 0 0 1 342.5 200"
                fill="none"
                stroke="#E8E8E8"
                strokeWidth="2"
              />
              
              {/* White Outline - Outer Edge */}
              <path
                d="M 22.5 200 A 177.5 177.5 0 0 1 377.5 200"
                fill="none"
                stroke="#E8E8E8"
                strokeWidth="2"
              />
              
              {/* Scale Labels - Positioned INSIDE the gauge arc stroke */}
              {/* AMPLIFIED (far left) */}
              <text fill="#FF0000" fontSize="9" fontWeight="bold" textAnchor="middle">
                <tspan x="55" y="135" transform="rotate(-55 55 135)">AMPL-</tspan>
                <tspan x="55" y="144" transform="rotate(-55 55 144)">IFIED</tspan>
              </text>
              
              {/* VOLATILE */}
              <text fill="#FFA500" fontSize="9" fontWeight="bold" textAnchor="middle">
                <tspan x="87" y="90" transform="rotate(-40 87 90)">VOL-</tspan>
                <tspan x="87" y="99" transform="rotate(-40 87 99)">ATILE</tspan>
              </text>
              
              {/* TRENDING */}
              <text fill="#FFFF00" fontSize="9" fontWeight="bold" textAnchor="middle">
                <tspan x="128" y="55" transform="rotate(-22 128 55)">TREND-</tspan>
                <tspan x="128" y="64" transform="rotate(-22 128 64)">ING</tspan>
              </text>
              
              {/* NEUTRAL (left) */}
              <text fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">
                <tspan x="165" y="43" transform="rotate(-10 165 43)">NEUT-</tspan>
                <tspan x="165" y="52" transform="rotate(-10 165 52)">RAL</tspan>
              </text>
              
              {/* NEUTRAL (right) */}
              <text fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">
                <tspan x="235" y="43" transform="rotate(10 235 43)">NEUT-</tspan>
                <tspan x="235" y="52" transform="rotate(10 235 52)">RAL</tspan>
              </text>
              
              {/* DAMPENED */}
              <text fill="#00FFFF" fontSize="9" fontWeight="bold" textAnchor="middle">
                <tspan x="272" y="55" transform="rotate(22 272 55)">DAMP-</tspan>
                <tspan x="272" y="64" transform="rotate(22 272 64)">ENED</tspan>
              </text>
              
              {/* REVERSION */}
              <text fill="#00FF00" fontSize="9" fontWeight="bold" textAnchor="middle">
                <tspan x="313" y="90" transform="rotate(40 313 90)">REVER-</tspan>
                <tspan x="313" y="99" transform="rotate(40 313 99)">SION</tspan>
              </text>
              
              {/* STABLE/PINNED (far right) */}
              <text fill="#00FF00" fontSize="9" fontWeight="bold" textAnchor="middle">
                <tspan x="345" y="135" transform="rotate(55 345 135)">STABLE</tspan>
                <tspan x="345" y="144" transform="rotate(55 345 144)">PINNED</tspan>
              </text>
              
              {/* Needle */}
              <line
                x1="200"
                y1="200"
                x2="200"
                y2="70"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                className="transition-all duration-500"
                style={{
                  transformOrigin: '200px 200px',
                  transform: `rotate(${-90 + ((Math.max(-10, Math.min(10, siMetrics.siNorm)) + 10) / 20) * 180}deg)`
                }}
              />
              
              {/* Center Dot */}
              <circle cx="200" cy="200" r="10" fill="white" />
            </svg>
            
            {/* Center Value Display */}
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-center">
              <div className={`text-3xl font-bold ${
                siMetrics.siNorm > 2 ? 'text-green-400' :
                siMetrics.siNorm < -2 ? 'text-red-400' :
                'text-yellow-400'
              }`}>
                {siMetrics.siNorm > 0 ? '+' : ''}{siMetrics.siNorm.toFixed(1)}
              </div>
            </div>
            
            {/* Side Labels */}
            <div className="absolute bottom-8 left-4 text-lg text-red-400 font-bold">VOLATILE</div>
            <div className="absolute bottom-8 right-4 text-lg text-green-400 font-bold">STABLE</div>
          </div>
        </div>
        
        {/* Market Interpretation */}
        <div className="bg-black border border-gray-700 p-5 rounded-lg mb-8 text-sm shadow-lg">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-blue-400 font-bold text-base mb-2">Dealer Behavior</div>
              <div className="text-white">
                {siMetrics.siNorm >= 2.0
                  ? "Dealers are pinning the price near strike levels with concentrated gamma positions. Strong mean reversion expected."
                  : siMetrics.siNorm >= 0.5
                  ? "Dealers are dampening volatility through hedging activity. Moderate mean reversion in effect."
                  : siMetrics.siNorm >= -0.5
                  ? "Dealers in neutral positioning mode. Mixed hedging activity without clear directional bias."
                  : siMetrics.siNorm >= -2.0
                  ? "Dealers creating market trending conditions through directional positioning. Reduced mean reversion."
                  : "Dealers are amplifying market moves through concentrated directional exposure. Minimal mean reversion, high volatility regime."}
              </div>
            </div>
            <div>
              <div className="text-purple-400 font-bold text-base mb-2">Market Behavior</div>
              <div className="text-white">
                {siMetrics.siNorm >= 2.0
                  ? "Price shows strong tendency to revert to key levels. Low volatility, high stability environment."
                  : siMetrics.siNorm >= 0.5
                  ? "Price exhibits mean reverting characteristics with reduced volatility. Moderate stability."
                  : siMetrics.siNorm >= -0.5
                  ? "Market in balanced state with normal volatility patterns. No strong directional or reverting bias."
                  : siMetrics.siNorm >= -2.0
                  ? "Market showing trending behavior with elevated volatility. Reduced mean reversion tendencies."
                  : "Market in high volatility, low stability regime. Price moves are amplified with minimal reversion to mean."}
              </div>
            </div>
            {metrics.signalExplanation && (
              <div>
                <div className="text-green-400 font-bold text-base mb-2">Trading Signal</div>
                <div className="text-white">{metrics.signalExplanation}</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Signal explanation - Removed as it's now in Market Interpretation */}

        {/* Greek Score Breakdown */}
        <div className="grid grid-cols-4 gap-4 pt-6 border-t border-gray-700">
          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase mb-2">Δ Delta</div>
            <div className={`text-xl font-bold ${
              metrics.deltaScore > 0 ? 'text-green-400' : metrics.deltaScore < 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {metrics.deltaScore > 0 ? '+' : ''}{metrics.deltaScore.toFixed(0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase mb-2">Γ Gamma</div>
            <div className={`text-xl font-bold ${
              metrics.gammaScore > 0 ? 'text-green-400' : metrics.gammaScore < 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {metrics.gammaScore > 0 ? '+' : ''}{metrics.gammaScore.toFixed(0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase mb-2">Θ Theta</div>
            <div className={`text-xl font-bold ${
              metrics.thetaScore > 0 ? 'text-green-400' : metrics.thetaScore < 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {metrics.thetaScore > 0 ? '+' : ''}{metrics.thetaScore.toFixed(0)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 uppercase mb-2">ν Vega</div>
            <div className={`text-xl font-bold ${
              metrics.vegaScore > 0 ? 'text-green-400' : metrics.vegaScore < 0 ? 'text-red-400' : 'text-gray-400'
            }`}>
              {metrics.vegaScore > 0 ? '+' : ''}{metrics.vegaScore.toFixed(0)}
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
            <div className="bg-black border border-gray-600/30 p-3 rounded">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-white font-bold text-xs uppercase">Current</span>
              </div>
              <div className="text-white font-bold text-lg">${currentPrice?.toFixed(2)}</div>
              <div className="text-white text-sm">Net: {formatMM(metrics.totalNetMM)}</div>
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
                  <div className="w-12 text-right font-mono text-gray-300">
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
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Enhanced Greek Exposure Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
        
        {/* Delta Exposure */}
        <div className="bg-black border-2 border-blue-500/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="text-blue-400" size={20} />
            <h3 className="text-white font-bold uppercase text-xs tracking-wider">Delta Exposure</h3>
          </div>
          
          <div className="space-y-3">
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                metrics.netDirectionalBias === 'BULLISH' ? 'text-green-400' :
                metrics.netDirectionalBias === 'BEARISH' ? 'text-red-400' : 'text-gray-400'
              }`}>
                {metrics.netDirectionalBias}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">Net Bias</div>
            </div>
            
            <div className="border-t border-gray-700 pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Net Delta:</span>
                <span className={`font-bold font-mono ${
                  metrics.totalNetDelta > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {(metrics.totalNetDelta / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Hedging:</span>
                <span className="font-bold font-mono text-yellow-400">
                  ${(metrics.hedgingPressure / 1000000).toFixed(1)}M
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Gamma Exposure */}
        <div className="bg-black border-2 border-purple-500/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-purple-400" size={20} />
            <h3 className="text-white font-bold uppercase text-xs tracking-wider">Gamma Exposure</h3>
          </div>
          
          <div className="space-y-3">
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                metrics.totalNetGamma > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {metrics.totalNetGamma > 0 ? 'LONG' : 'SHORT'}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">Position</div>
            </div>
            
            <div className="border-t border-gray-700 pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Net Γ:</span>
                <span className={`font-bold font-mono ${
                  metrics.totalNetGamma > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {(metrics.totalNetGamma / 1000).toFixed(1)}K
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Reflexivity:</span>
                <span className="font-bold font-mono text-purple-400">
                  {metrics.reflexivity.toFixed(1)}M
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Theta Exposure */}
        <div className="bg-black border-2 border-orange-500/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="text-orange-400" size={20} />
            <h3 className="text-white font-bold uppercase text-xs tracking-wider">Theta Exposure</h3>
          </div>
          
          <div className="space-y-3">
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                metrics.totalNetTheta < 0 ? 'text-red-400' : 'text-green-400'
              }`}>
                {metrics.totalNetTheta < 0 ? 'DECAY' : 'GAIN'}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">Time Value</div>
            </div>
            
            <div className="border-t border-gray-700 pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Daily θ:</span>
                <span className={`font-bold font-mono ${
                  metrics.totalNetTheta < 0 ? 'text-red-400' : 'text-green-400'
                }`}>
                  ${(metrics.totalNetTheta / 1000).toFixed(1)}K
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Weekly:</span>
                <span className="font-bold font-mono text-orange-400">
                  ${(metrics.totalNetTheta * 5 / 1000).toFixed(1)}K
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Vega Exposure */}
        <div className="bg-black border-2 border-cyan-500/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="text-cyan-400" size={20} />
            <h3 className="text-white font-bold uppercase text-xs tracking-wider">Vega Exposure</h3>
          </div>
          
          <div className="space-y-3">
            <div className="text-center">
              <div className={`text-2xl font-bold ${
                metrics.totalNetVega > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {metrics.totalNetVega > 0 ? 'LONG VOL' : 'SHORT VOL'}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">IV Sensitivity</div>
            </div>
            
            <div className="border-t border-gray-700 pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Net ν:</span>
                <span className={`font-bold font-mono ${
                  metrics.totalNetVega > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {(metrics.totalNetVega / 1000).toFixed(1)}K
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Vol Risk:</span>
                <span className="font-bold font-mono text-cyan-400">
                  ${(metrics.volRisk / 1000).toFixed(1)}K
                </span>
              </div>
            </div>
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
                    className="border-b border-gray-800 hover:bg-gray-900/50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-white">
                        ${item.strike.toFixed(1)}
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
      const expDate = new Date(exp + 'T00:00:00Z');
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
        const expDate = new Date(exp + 'T00:00:00Z');
        return expDate <= threeMonthsFromNow;
      });
      
      // Then filter to 45 days
      const today = new Date();
      const maxDate = new Date(today.getTime() + (45 * 24 * 60 * 60 * 1000));
      const validExps = expsWithin3Months.filter(exp => {
        const expDate = new Date(exp + 'T00:00:00Z');
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
              // Less noisy error logging - only log first few failures
              if (failCount <= 5) {
                console.warn(`Failed to fetch ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
              } else if (failCount === 6) {
                console.warn(`... suppressing further error logs (${failCount}+ failures)`);
              }
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
      const expDate = new Date(exp + 'T00:00:00Z');
      return expDate <= threeMonthsFromNow;
    });
    
    const today = new Date();
    const maxDate = new Date(today.getTime() + (45 * 24 * 60 * 60 * 1000));
    const validExps = expsWithin3Months.filter(exp => {
      const expDate = new Date(exp + 'T00:00:00Z');
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

  // Don't auto-load screener data on mount - let user trigger it manually
  // This prevents 1000+ API calls on page load
  // useEffect(() => {
  //   if (screenerData.length === 0) {
  //     loadScreenerData();
  //   }
  // }, []);

  return (
    <div>
      {/* Header */}
      <div className="bg-black border-2 border-purple-500/50 p-6 mb-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white uppercase tracking-wider">
            STABILITY INTENSITY
          </h2>
        </div>
      </div>

      {/* Main SI Gauge */}
      <div className="bg-black border border-gray-600 p-8 mb-6">
        <div className="relative">
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
          {selectedTicker && currentPrice > 0 && (
          <div className="absolute top-4 right-4">
            <div className="bg-black border-2 border-orange-500/60 rounded-lg p-6 shadow-2xl max-w-md">
              <div className="text-orange-400 font-bold text-sm uppercase tracking-wider mb-3 border-b-2 border-orange-500/40 pb-2">
                MARKET INTERPRETATION
              </div>
              <div className="text-white text-sm font-medium space-y-3 leading-relaxed">
                {siMetrics.siNorm >= 0.5 && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-orange-400 font-semibold mb-1">Dealer Behavior:</div>
                      <div className="space-y-1">
                        <div>• Dealers are long gamma and short vega</div>
                        <div>• Their hedging absorbs volatility</div>
                        <div>• They actively dampen directional moves</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-blue-400 font-semibold mb-1">Market Behavior:</div>
                      <div className="space-y-1">
                        <div>• Low volatility, slow price action</div>
                        <div>• Strong mean reversion</div>
                        <div>• Breakouts tend to fail and revert back into range</div>
                      </div>
                    </div>
                  </div>
                )}
                {siMetrics.siNorm >= 0 && siMetrics.siNorm < 0.5 && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-purple-400 font-semibold mb-1">Dealer Behavior:</div>
                      <div className="space-y-1">
                        <div>• Dealers slightly supportive to price</div>
                        <div>• Light positive gamma influence</div>
                        <div>• Small dips get cushioned</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-blue-400 font-semibold mb-1">Market Behavior:</div>
                      <div className="space-y-1">
                        <div>• Range-bound with mild upward drift</div>
                        <div>• Limited directional momentum</div>
                        <div>• Clean intraday scalps but weak trend conviction</div>
                      </div>
                    </div>
                  </div>
                )}
                {siMetrics.siNorm >= -0.5 && siMetrics.siNorm < 0 && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-purple-400 font-semibold mb-1">Dealer Behavior:</div>
                      <div className="space-y-1">
                        <div>• Dealers shifting toward short gamma</div>
                        <div>• Hedging starts to amplify moves</div>
                        <div>• Sensitivity to price changes increases</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-blue-400 font-semibold mb-1">Market Behavior:</div>
                      <div className="space-y-1">
                        <div>• Volatility beginning to rise</div>
                        <div>• Breakouts become more likely</div>
                        <div>• Early trend days appear, ranges get wider</div>
                      </div>
                    </div>
                  </div>
                )}
                {siMetrics.siNorm < -0.5 && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-purple-400 font-semibold mb-1">Dealer Behavior:</div>
                      <div className="space-y-1">
                        <div>• Dealers are short gamma and high vega</div>
                        <div>• Their hedging accelerates moves</div>
                        <div>• Reflexive flows create runaway momentum</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-blue-400 font-semibold mb-1">Market Behavior:</div>
                      <div className="space-y-1">
                        <div>• Fast, explosive price action</div>
                        <div>• Strong trend continuation</div>
                        <div>• Breakouts rarely revert — they extend hard</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </div>

        {/* SI Scale Visualization - UPDATED HEIGHT */}
        <div className="relative w-full max-w-2xl mx-auto mb-4">
          <div 
            className="rounded-full relative"
            style={{
              height: '75px !important',
              minHeight: '75px',
              maxHeight: '75px',
              background: 'linear-gradient(to right, #dc2626 0%, #ef4444 20%, #eab308 40%, #3b82f6 60%, #22c55e 80%, #16a34a 100%)'
            }}
          >
            {/* Red border for left half */}
            <div 
              className="absolute top-0 left-0 rounded-full"
              style={{
                width: '50%',
                height: '75px',
                border: '6px solid #ff0000',
                borderRight: 'none',
                borderRadius: '75px 0 0 75px',
                clipPath: 'inset(0 50% 0 0)'
              }}
            />
            {/* Green border for right half */}
            <div 
              className="absolute top-0 right-0 rounded-full"
              style={{
                width: '50%',
                height: '75px',
                border: '6px solid #00ff00',
                borderLeft: 'none',
                borderRadius: '0 75px 75px 0',
                clipPath: 'inset(0 0 0 50%)'
              }}
            />
            {/* SI Indicator - position based on actual SI value with extended range */}
            <div 
              className="absolute top-0 bg-white border-2 border-black rounded-full transform -translate-x-1/2 transition-all duration-500"
              style={{ 
                width: '30px',
                height: '75px',
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
                      <div className="text-xs text-yellow-500/70 italic">
                        Note: Some symbols may fail due to rate limits or missing data
                      </div>
                    </div>
                  </td>
                </tr>
              ) : screenerData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <div className="space-y-3">
                      <div className="text-gray-400">No data loaded</div>
                      <div className="text-sm text-gray-500">
                        Click <span className="text-purple-400 font-bold">START SCAN</span> to analyze market stability
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

// Max Pain Dashboard Component - True MM-Optimal Expiry Target
const MaxPainDashboard: React.FC<MaxPainDashboardProps> = ({ selectedTicker, currentPrice, gexByStrikeByExpiration, vexByStrikeByExpiration, expirations }) => {
  
  const [selectedExpiration, setSelectedExpiration] = useState<string>('');

  // Get available future expirations
  const availableExpirations = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return expirations.filter(exp => {
      const expDate = new Date(exp + 'T00:00:00Z');
      return expDate >= today;
    }).sort();
  }, [expirations]);
  // Auto-select default expiration
  useEffect(() => {
    if (availableExpirations.length > 0 && !selectedExpiration) {
      const today = new Date();
      const monthlyExps = availableExpirations.filter(exp => {
        const expDate = new Date(exp + 'T00:00:00Z');
        const dayOfMonth = expDate.getUTCDate();
        return dayOfMonth >= 14 && dayOfMonth <= 22;
      });
      setSelectedExpiration(monthlyExps.length > 0 ? monthlyExps[0] : availableExpirations[0]);
    }
  }, [availableExpirations, selectedExpiration]);

  // Calculate MM Risk for each strike using the TRUE formula
  const maxPainAnalysis = useMemo(() => {
    if (!currentPrice || !selectedExpiration || Object.keys(gexByStrikeByExpiration).length === 0) {
      return {
        optimalStrike: currentPrice,
        minRisk: 0,
        riskByStrike: [],
        totalOI: 0,
        avgDTE: 0
      };
    }

    const strikeData = gexByStrikeByExpiration[selectedExpiration];
    const vexData = vexByStrikeByExpiration[selectedExpiration];
    if (!strikeData) {
      return {
        optimalStrike: currentPrice,
        minRisk: 0,
        riskByStrike: [],
        totalOI: 0,
        avgDTE: 0
      };
    }

    // Calculate DTE
    const expDate = new Date(selectedExpiration + 'T00:00:00Z');
    const today = new Date();
    const daysToExp = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Get all strikes and determine range dynamically based on actual options data
    const allStrikes = Object.keys(strikeData).map(Number).sort((a, b) => a - b);
    
    // Find where significant OI exists (filter out strikes with < 100 total OI)
    const significantStrikes = allStrikes.filter(strike => {
      const data = strikeData[strike];
      const totalOI = (data?.callOI || 0) + (data?.putOI || 0);
      return totalOI >= 100; // Only consider strikes with meaningful OI
    });

    if (significantStrikes.length === 0) {
      return {
        optimalStrike: currentPrice,
        minRisk: 0,
        riskByStrike: [],
        totalOI: 0,
        avgDTE: daysToExp
      };
    }

    // Use actual data range (where OI exists) instead of arbitrary ±15%
    const lowestStrike = significantStrikes[0];
    const highestStrike = significantStrikes[significantStrikes.length - 1];
    
    // Expand slightly beyond actual strikes (±5% buffer) to catch edge cases
    const bufferPct = 0.05;
    const strikeSpan = highestStrike - lowestStrike;
    const minStrike = lowestStrike - (strikeSpan * bufferPct);
    const maxStrike = highestStrike + (strikeSpan * bufferPct);
    
    const relevantStrikes = allStrikes.filter(s => s >= minStrike && s <= maxStrike);

    // Test price points across the actual data range
    const testPrices: number[] = [];
    const testMin = Math.max(minStrike, currentPrice * 0.70); // Safety floor at -30%
    const testMax = Math.min(maxStrike, currentPrice * 1.30); // Safety ceiling at +30%
    const testStep = (testMax - testMin) / 100; // 100 test points
    
    for (let price = testMin; price <= testMax; price += testStep) {
      testPrices.push(price);
    }

    let totalOI = 0;
    const strikeRiskData: Array<{strike: number; risk: number; oi: number; callOI: number; putOI: number; distance: number}> = [];

    // Calculate MM Risk for each test price
    const riskResults = testPrices.map(testPrice => {
      let totalRisk = 0;

      relevantStrikes.forEach(strike => {
        const data = strikeData[strike];
        if (!data) return;

        const callOI = data.callOI || 0;
        const putOI = data.putOI || 0;
        const callGamma = data.callGamma || 0;
        const putGamma = data.putGamma || 0;
        const callTheta = data.callTheta || 0;
        const putTheta = data.putTheta || 0;
        
        // Get vega if available
        const callVega = vexData?.[strike]?.callVega || 0;
        const putVega = vexData?.[strike]?.putVega || 0;

        // Calculate delta based on moneyness (simplified BSM approximation)
        const moneyness = strike / testPrice;
        let callDelta = 0;
        let putDelta = 0;

        if (moneyness > 1.1) {
          callDelta = 0.1;
          putDelta = -0.9;
        } else if (moneyness > 1.05) {
          callDelta = 0.3;
          putDelta = -0.7;
        } else if (moneyness > 1.0) {
          callDelta = 0.4;
          putDelta = -0.6;
        } else if (moneyness > 0.95) {
          callDelta = 0.6;
          putDelta = -0.4;
        } else if (moneyness > 0.9) {
          callDelta = 0.7;
          putDelta = -0.3;
        } else {
          callDelta = 0.9;
          putDelta = -0.1;
        }

        const priceDiff = testPrice - strike;
        const priceDiffSq = priceDiff * priceDiff;

        // TRUE MM RISK FORMULA:
        // MM_Risk = OI * M * [|Delta| * |S-K| + 0.5 * Gamma * (S-K)^2 + |Theta| + |Vega * ΔV|]
        
        const M = 100; // Contract multiplier
        const deltaV = 0.02; // Assumed 2% IV shift (conservative)

        // Call option risk
        if (callOI > 0) {
          const deltaRisk = Math.abs(callDelta) * Math.abs(priceDiff);
          const gammaRisk = 0.5 * Math.abs(callGamma) * priceDiffSq;
          const thetaRisk = Math.abs(callTheta);
          const vegaRisk = Math.abs(callVega * deltaV);
          
          totalRisk += callOI * M * (deltaRisk + gammaRisk + thetaRisk + vegaRisk);
        }

        // Put option risk
        if (putOI > 0) {
          const deltaRisk = Math.abs(putDelta) * Math.abs(priceDiff);
          const gammaRisk = 0.5 * Math.abs(putGamma) * priceDiffSq;
          const thetaRisk = Math.abs(putTheta);
          const vegaRisk = Math.abs(putVega * deltaV);
          
          totalRisk += putOI * M * (deltaRisk + gammaRisk + thetaRisk + vegaRisk);
        }
      });

      return { testPrice, risk: totalRisk };
    });

    // Find the price with MINIMUM risk (MM optimal expiry level)
    if (riskResults.length === 0) {
      return {
        optimalStrike: currentPrice,
        minRisk: 0,
        riskByStrike: [],
        totalOI: 0,
        avgDTE: daysToExp
      };
    }

    const optimalResult = riskResults.reduce((min, current) => 
      current.risk < min.risk ? current : min
    );

    // Find the actual strike closest to optimal price (this is the MAX PAIN strike)
    let closestStrike = relevantStrikes[0] || currentPrice;
    let minDistance = Math.abs(closestStrike - optimalResult.testPrice);
    
    relevantStrikes.forEach(strike => {
      const distance = Math.abs(strike - optimalResult.testPrice);
      if (distance < minDistance) {
        minDistance = distance;
        closestStrike = strike;
      }
    });

    // Calculate risk profile for each actual strike
    relevantStrikes.forEach(strike => {
      const data = strikeData[strike];
      if (!data) return;

      const callOI = data.callOI || 0;
      const putOI = data.putOI || 0;
      totalOI += callOI + putOI;

      // Calculate risk at this strike
      let strikeRisk = 0;
      const callGamma = data.callGamma || 0;
      const putGamma = data.putGamma || 0;
      const priceDiff = strike - currentPrice;
      const priceDiffSq = priceDiff * priceDiff;

      // Simplified risk calculation for strike display
      strikeRisk = (callOI + putOI) * (Math.abs(callGamma) + Math.abs(putGamma)) * (1 + priceDiffSq * 0.001);

      strikeRiskData.push({
        strike,
        risk: strikeRisk,
        oi: callOI + putOI,
        callOI,
        putOI,
        distance: strike - currentPrice
      });
    });

    strikeRiskData.sort((a, b) => b.risk - a.risk);

    return {
      optimalStrike: closestStrike, // Return the actual strike, not test price
      minRisk: optimalResult.risk,
      riskByStrike: strikeRiskData,
      totalOI,
      avgDTE: daysToExp
    };
  }, [currentPrice, selectedExpiration, gexByStrikeByExpiration, vexByStrikeByExpiration]);

  const formatOI = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const formatRisk = (value: number) => {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  const priceDistance = currentPrice - maxPainAnalysis.optimalStrike;
  const priceDistancePercent = (priceDistance / currentPrice) * 100;

  return (
    <div className="space-y-4">
      {/* Professional Header Row */}
      <div className="bg-gradient-to-r from-black via-gray-950 to-black border border-gray-800 rounded">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
          
          {/* Left: Key Metrics */}
          <div className="lg:col-span-8 grid grid-cols-3 gap-4">
            
            {/* Max Pain Strike */}
            <div className="bg-black/50 border-l-4 border-red-500 px-4 py-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Max Pain</div>
              <div className="text-3xl font-bold text-red-400 leading-none mb-1">
                ${maxPainAnalysis.optimalStrike.toFixed(2)}
              </div>
              <div className={`text-[10px] font-semibold ${priceDistance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {priceDistance > 0 ? '↓' : '↑'} {Math.abs(priceDistancePercent).toFixed(2)}%
              </div>
            </div>

            {/* Current Spot */}
            <div className="bg-black/50 border-l-4 border-gray-600 px-4 py-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Current</div>
              <div className="text-3xl font-bold text-white leading-none mb-1">
                ${currentPrice.toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-500">
                Δ ${Math.abs(priceDistance).toFixed(2)}
              </div>
            </div>

            {/* MM Risk - Liquidity Pivot */}
            <div className="bg-black/50 border-l-4 border-purple-500 px-4 py-3">
              <div className="text-[10px] text-purple-400 uppercase tracking-wider font-bold mb-1">Liquidity Pivot</div>
              <div className="text-3xl font-bold text-purple-400 leading-none mb-1">
                {formatRisk(maxPainAnalysis.minRisk)}
              </div>
              <div className="text-[10px] text-gray-500">
                at optimal
              </div>
            </div>
          </div>

          {/* Right: Dealer Pressure + Expiration */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            
            {/* Dealer Pressure */}
            <div className={`flex-1 border-l-4 px-4 py-2 rounded ${
              priceDistance > 0 ? 'bg-red-950/30 border-red-500' :
              'bg-green-950/30 border-green-500'
            }`}>
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Dealer Pressure</div>
              <div className={`text-sm font-bold leading-tight ${
                Math.abs(priceDistance) < currentPrice * 0.01 ? 'text-yellow-400' :
                priceDistance > 0 ? 'text-red-400' : 'text-green-400'
              }`}>
                {Math.abs(priceDistance) < currentPrice * 0.01 
                  ? '● PINNED'
                  : priceDistance > 0 
                    ? '↓ DOWNWARD'
                    : '↑ UPWARD'}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {Math.abs(priceDistancePercent) > 2 ? 'Strong' : 'Moderate'} pressure
              </div>
            </div>

            {/* Expiration Selector */}
            <div className="bg-black/50 border border-gray-700 rounded px-3 py-2">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Expiration</div>
              <select
                value={selectedExpiration}
                onChange={(e) => setSelectedExpiration(e.target.value)}
                className="w-full bg-gray-900 border-none text-white text-sm font-bold focus:outline-none cursor-pointer"
                style={{ backgroundColor: '#111827' }}
              >
                {availableExpirations.map(exp => {
                  const expDate = new Date(exp + 'T00:00:00Z');
                  const today = new Date();
                  const daysToExp = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <option key={exp} value={exp} style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                      {expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} ({daysToExp}d)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Strike Risk Table */}
      <div className="bg-black border border-gray-800 rounded">
        <div className="border-b border-gray-800 px-4 py-3 bg-gray-950">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Strike-Level Risk Analysis</h3>
        </div>
        
        <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
          <table className="w-full">
            <thead className="bg-gray-950 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">Strike</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">MM Risk</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">Total OI</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">Call OI</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">Put OI</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">Distance</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">Bias</th>
              </tr>
            </thead>
            <tbody>
              {maxPainAnalysis.riskByStrike.slice(0, 30).map((item, idx) => {
                const isMaxPain = item.strike === maxPainAnalysis.optimalStrike;
                const isATM = Math.abs(item.strike - currentPrice) < 1;
                const maxRisk = Math.max(...maxPainAnalysis.riskByStrike.map(s => s.risk));
                const isHighestRisk = item.risk === maxRisk; // Highest risk = Liquidity Pivot
                const riskPercent = (item.risk / maxRisk) * 100;

                return (
                  <tr 
                    key={item.strike}
                    className={`border-b border-gray-900/50 hover:bg-gray-900/30 transition-colors ${
                      isMaxPain ? 'bg-red-950/20' :
                      isHighestRisk ? 'bg-purple-950/20' :
                      isATM ? 'bg-orange-950/10' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm font-semibold ${
                          isMaxPain ? 'text-red-400' :
                          isHighestRisk ? 'text-purple-400' :
                          isATM ? 'text-orange-400' : 'text-white'
                        }`}>
                          ${item.strike.toFixed(1)}
                        </span>
                        {isMaxPain && <span className="text-xs text-red-400 font-bold">● MAX PAIN</span>}
                        {isHighestRisk && !isMaxPain && <span className="text-xs text-purple-400 font-bold">● LIQUIDITY PIVOT</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-gray-900 rounded-sm h-2">
                          <div 
                            className={isHighestRisk ? 'bg-purple-500 h-full rounded-sm' : 'bg-red-500 h-full rounded-sm'}
                            style={{ width: `${riskPercent}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-gray-300 w-16 text-right">
                          {formatRisk(item.risk)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-xs text-white">
                        {formatOI(item.oi)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-xs text-green-500">
                        {formatOI(item.callOI)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-xs text-red-500">
                        {formatOI(item.putOI)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-mono text-xs ${
                        Math.abs(item.distance) < 1 ? 'text-yellow-400 font-bold' :
                        item.distance > 0 ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {item.distance >= 0 ? '+' : ''}{item.distance.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-xs font-bold ${
                        item.callOI > item.putOI * 1.5 ? 'text-green-400' :
                        item.putOI > item.callOI * 1.5 ? 'text-red-400' :
                        'text-gray-500'
                      }`}>
                        {item.callOI > item.putOI * 1.5 ? 'CALL' :
                         item.putOI > item.callOI * 1.5 ? 'PUT' : 'MIXED'}
                      </span>
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
  const [gexByStrikeByExpiration, setGexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number, callTheta?: number, putTheta?: number}}}>({});
  const [dealerByStrikeByExpiration, setDealerByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number, callVega?: number, putVega?: number, callTheta?: number, putTheta?: number}}}>({});
  
  // Backup original base data before live mode modifies it
  const [baseGexByStrikeByExpiration, setBaseGexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number, callTheta?: number, putTheta?: number}}}>({});
  const [baseDealerByStrikeByExpiration, setBaseDealerByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number, callVega?: number, putVega?: number, callTheta?: number, putTheta?: number}}}>({});
  
  const [viewMode, setViewMode] = useState<'NET' | 'CP'>('CP'); // C/P by default
  const [analysisType, setAnalysisType] = useState<'GEX'>('GEX'); // Gamma Exposure by default
  const [vexByStrikeByExpiration, setVexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number}}}>({});
  const [flowGexByStrikeByExpiration, setFlowGexByStrikeByExpiration] = useState<{[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVolume: number, putVolume: number}}}>({});
  const [showGEX, setShowGEX] = useState(false);
  const [showDealer, setShowDealer] = useState(false);
  const [gexMode, setGexMode] = useState<'Net GEX' | 'Net Dealer'>('Net GEX');
  const [showFlowGEX, setShowFlowGEX] = useState(false);

  const [showOI, setShowOI] = useState(false);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);
  const [liveMode, setLiveMode] = useState(false); // Single live mode toggle for all metrics
  const [liveOIData, setLiveOIData] = useState<Map<string, number>>(new Map());
  const [flowTradesData, setFlowTradesData] = useState<any[]>([]); // Store all trades with premiums
  const [liveOILoading, setLiveOILoading] = useState(false);
  const [liveOIProgress, setLiveOIProgress] = useState(0);
  const [showVEX, setShowVEX] = useState(false);
  const [vexMode, setVexMode] = useState<'VEX' | 'Net VEX'>('VEX');
  const [activeTab, setActiveTab] = useState<'WORKBENCH' | 'ATTRACTION'>('ATTRACTION');
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<'MM' | 'MP' | 'SI' | 'MAXPAIN' | 'OIGEX' | 'GEXSCREENER'>('MM');

  const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

  // Calculate number of active tables and update parent container width
  const activeTableCount = [showGEX, showDealer, showFlowGEX].filter(Boolean).length;
  
  React.useEffect(() => {
    // Find the parent sidebar panel and update its width
    const sidebarPanel = document.querySelector('.fixed.top-32.bottom-4.left-16') as HTMLElement;
    if (sidebarPanel) {
      if (activeTableCount === 3) {
        // All 3 tables - full width
        sidebarPanel.style.width = 'calc(100vw - 4.0625rem)';
      } else if (activeTableCount === 2) {
        // 2 tables - slightly wider
        sidebarPanel.style.width = '1775px';
      } else {
        // 1 table - normal width
        sidebarPanel.style.width = '1200px';
      }
    }
  }, [activeTableCount]);

  // Live OI Update - Separate scan with AlgoFlow's exact logic
  const updateLiveOI = async () => {
    // Use whatever ticker is typed in the search bar
    const tickerToScan = (tickerInput.trim() || selectedTicker).toUpperCase();
    console.log('🚀 Starting Live OI scan for', tickerToScan);
    setLiveOILoading(true);
    setLiveOIProgress(0);
    
    const eventSource = new EventSource(`/api/stream-options-flow?ticker=${tickerToScan}`);
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
                `https://api.polygon.io/v3/snapshot/options/${tickerToScan}?expiration_date=${expiryParam}&limit=250&apiKey=${POLYGON_API_KEY}`
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
              underlying_ticker: trade.underlying_ticker || tickerToScan
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
          
          // Store trades data for Flow Map
          setFlowTradesData(tradesWithFillStyle);
          console.log(`💰 Storing ${tradesWithFillStyle.length} trades for Flow Map calculation`);
          
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
          
          // Step 5: Calculate simple premium-based flow (no GEX, no Greeks)
          console.log(`💰 Flow Map: Simple premium tracking for new trades (AA, A, BB fill styles)`);
          
          console.log(`📊 Live OI calculated for ${liveOIMap.size} contracts`);
          
          // Check if base options data exists, if not fetch it first
          if (Object.keys(gexByStrikeByExpiration).length === 0) {
            console.log(`⚠️ Base options data not loaded yet. Fetching now...`);
            setLiveOILoading(false);
            setLiveOIProgress(100);
            // Fetch base data with the live OI and trades
            await fetchOptionsData(liveOIMap, tradesWithFillStyle);
          } else {
            // Base data exists, just trigger recalculation
            console.log(`🔄 Live OI scan complete - ${liveOIMap.size} contracts updated. Triggering recalculation...`);
            setLiveOILoading(false);
            setLiveOIProgress(100);
            // Force a recalculation by calling fetchOptionsData with the live data
            await fetchOptionsData(liveOIMap, tradesWithFillStyle);
          }
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
      const expDate = new Date(exp + 'T00:00:00Z');
      return expDate <= threeMonthsFromNow;
    });
  };



  const [otmFilter, setOtmFilter] = useState<'1%' | '2%' | '3%' | '5%' | '8%' | '10%' | '15%' | '20%' | '25%' | '40%' | '50%' | '100%'>('2%');
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





  // Fetch detailed GEX data using Web Worker for parallel processing
  const fetchOptionsData = async (liveOIMapOverride?: Map<string, number>, tradesDataOverride?: any[]) => {
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
      
      // Initialize data structures - CALCULATE BOTH Net GEX and Net Dealer
      const oiByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number}}} = {};
      const gexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number, callVega?: number, putVega?: number, callTheta?: number, putTheta?: number}}} = {};
      const dealerByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number, callVega?: number, putVega?: number, callTheta?: number, putTheta?: number}}} = {};
      const vexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number}}} = {};
      const flowGexByStrikeByExp: {[expiration: string]: {[strike: number]: {call: number, put: number, callOI: number, putOI: number, callVolume: number, putVolume: number}}} = {};
      const allStrikes = new Set<number>();
      
      // Get Live OI data from parameter (if passed) or React state
      const liveOIDataFromState = liveOIMapOverride || liveOIData;
      const tradesData = tradesDataOverride || flowTradesData;
      console.log(`💰 Flow Map: Calculating simple premium values for new trades (${tradesData.length} trades available)`);
      
      // Calculate premium values by strike from flow trades (AA, A, BB only)
      const flowPremiumByStrike: {[expiration: string]: {[strike: number]: {callPremium: number, putPremium: number, callContracts: number, putContracts: number}}} = {};
      
      // DEBUG: Log first few trades to see what data we have
      if (tradesData.length > 0) {
        console.log(`🔍 FLOW MAP DEBUG - First trade sample:`, {
          ticker: tradesData[0].ticker,
          strike: tradesData[0].strike,
          expiry: tradesData[0].expiry,
          type: tradesData[0].type,
          trade_size: tradesData[0].trade_size,
          premium_per_contract: tradesData[0].premium_per_contract,
          total_premium: tradesData[0].total_premium,
          fill_style: tradesData[0].fill_style,
          all_keys: Object.keys(tradesData[0])
        });
      }
      
      let openingTradesCount = 0;
      let totalPremiumSum = 0;
      
      tradesData.forEach(trade => {
        // Only count opening trades (AA, A, BB)
        if (['AA', 'A', 'BB'].includes(trade.fill_style)) {
          openingTradesCount++;
          
          const expiry = trade.expiry;
          const strike = trade.strike;
          const contracts = trade.trade_size || 0;
          
          // Calculate premium - the total_premium should already be the full notional value
          const premiumPerContract = trade.premium_per_contract || 0;
          const totalCost = trade.total_premium || (premiumPerContract * contracts * 100);
          
          totalPremiumSum += totalCost;
          
          // DEBUG: Log if premium is zero
          if (totalCost === 0) {
            console.warn(`⚠️ ZERO PREMIUM: ${trade.type} ${strike} ${expiry} - premium_per_contract=${premiumPerContract}, total_premium=${trade.total_premium}, contracts=${contracts}`);
          }
          
          if (!flowPremiumByStrike[expiry]) flowPremiumByStrike[expiry] = {};
          if (!flowPremiumByStrike[expiry][strike]) {
            flowPremiumByStrike[expiry][strike] = { callPremium: 0, putPremium: 0, callContracts: 0, putContracts: 0 };
          }
          
          if (trade.type === 'call') {
            flowPremiumByStrike[expiry][strike].callPremium += totalCost;
            flowPremiumByStrike[expiry][strike].callContracts += contracts;
            if (totalCost > 0) {
              console.log(`💰 Call: ${strike} ${expiry} = $${totalCost.toFixed(0)} (${contracts} contracts @ $${premiumPerContract.toFixed(2)})`);
            }
          } else {
            flowPremiumByStrike[expiry][strike].putPremium += totalCost;
            flowPremiumByStrike[expiry][strike].putContracts += contracts;
            if (totalCost > 0) {
              console.log(`💰 Put: ${strike} ${expiry} = $${totalCost.toFixed(0)} (${contracts} contracts @ $${premiumPerContract.toFixed(2)})`);
            }
          }
        }
      });
      
      console.log(`💰 FLOW MAP SUMMARY: ${openingTradesCount} opening trades (AA/A/BB), Total Premium: $${totalPremiumSum.toLocaleString()}`);
      console.log(`💰 Calculated premiums for ${Object.keys(flowPremiumByStrike).length} expirations`);
      
      // DEBUG: Show sample of premiums by expiration
      Object.keys(flowPremiumByStrike).slice(0, 2).forEach(exp => {
        const strikes = Object.keys(flowPremiumByStrike[exp]).slice(0, 3);
        console.log(`  📅 ${exp}: ${strikes.length} strikes with flow`);
        strikes.forEach(strike => {
          const data = flowPremiumByStrike[exp][parseFloat(strike)];
          if (data.callPremium > 0 || data.putPremium > 0) {
            console.log(`    Strike ${strike}: Calls $${data.callPremium.toFixed(0)}, Puts $${data.putPremium.toFixed(0)}`);
          }
        });
      });
      
      // Smart batching: larger batches for more expirations
      const batchSize = allAvailableExpirations.length <= 10 ? allAvailableExpirations.length : 
                        allAvailableExpirations.length <= 30 ? 10 : 20;
      
      for (let batchStart = 0; batchStart < allAvailableExpirations.length; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, allAvailableExpirations.length);
        const batch = allAvailableExpirations.slice(batchStart, batchEnd);
        
        // Process this batch - calculate BOTH Net GEX and Net Dealer simultaneously
        batch.forEach((expDate) => {
          const { calls, puts } = optionsResult.data[expDate];
          
          // Initialize all data structures for this expiration
          oiByStrikeByExp[expDate] = {};
          gexByStrikeByExp[expDate] = {};
          dealerByStrikeByExp[expDate] = {}; // Initialize dealer data structure
          vexByStrikeByExp[expDate] = {};
          
          // STEP 1: Process calls - Calculate OI first, then build other metrics from it
          console.log(`🚨 Processing expiration ${expDate}, found ${Object.keys(calls).length} call strikes`);
          Object.entries(calls).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            let oi = data.open_interest || 0;
            
            // 🔥 USE LIVE OI IF AVAILABLE
            const contractKey = `${selectedTicker}_${strikeNum}_call_${expDate}`;
            if (liveOIDataFromState && liveOIDataFromState.has(contractKey)) {
              const liveOI = liveOIDataFromState.get(contractKey) || 0;
              console.log(`🔥 USING LIVE OI for ${contractKey}: Original=${oi}, Live=${liveOI}`);
              oi = liveOI;
            }
            
            if (oi > 0) {
              // STEP 1A: Calculate OI (Open Interest) - Foundation for all other calculations
              console.log(`📊 Step 1A - Call OI: Strike ${strikeNum} = ${oi}`);
              oiByStrikeByExp[expDate][strikeNum] = { call: oi, put: 0, callOI: oi, putOI: 0 };
              
              // STEP 1B: Calculate GEX and get all Greeks from API
              const gamma = data.greeks?.gamma || 0;
              const delta = data.greeks?.delta || 0;
              const vega = data.greeks?.vega || 0;
              const theta = data.greeks?.theta || 0; // Use Polygon's theta directly
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
              
              console.log(`📊 GREEKS DEBUG - Call: Strike ${strikeNum}, gamma=${gamma}, delta=${delta}, vanna=${vanna}, theta=${theta} (from API), vega=${vega}`);
              gexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: oi, putOI: 0, callGamma: gamma, putGamma: 0, callDelta: delta, putDelta: 0, callVanna: vanna, putVanna: 0, callTheta: theta, putTheta: 0, callVega: vega, putVega: 0 };
              dealerByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: oi, putOI: 0, callGamma: gamma, putGamma: 0, callDelta: delta, putDelta: 0, callVanna: vanna, putVanna: 0 };
              
              // Flow Map: Simple premium-based calculation (no GEX, no Greeks)
              if (!flowGexByStrikeByExp[expDate]) flowGexByStrikeByExp[expDate] = {};
              
              const flowData = flowPremiumByStrike[expDate]?.[strikeNum];
              const callPremium = flowData?.callPremium || 0;
              const callContracts = flowData?.callContracts || 0;
              
              flowGexByStrikeByExp[expDate][strikeNum] = { 
                call: callPremium,  // Store premium directly
                put: 0, 
                callOI: oi, 
                putOI: 0, 
                callVolume: callContracts,  // Store contract count
                putVolume: 0 
              };
              
              if (callPremium > 0) {
                console.log(`💰 FLOW MAP Call: Strike ${strikeNum} = $${callPremium.toFixed(0)} (${callContracts} contracts)`);
              }
              
              // ALWAYS calculate BOTH formulas
              // 1. NET GEX - Standard formula
              console.log(`📊 Calculating NET GEX (standard) for call`);
              if (gamma) {
                const gex = gamma * oi * (currentPrice * currentPrice) * 100;
                gexByStrikeByExp[expDate][strikeNum].call = gex;
                console.log(`⚡ GEX Call: Strike ${strikeNum} = ${gamma} × ${oi} × ${currentPrice}² × 100 = ${gex}`);
              }
              
              // 2. NET DEALER - Enhanced formula
              console.log(`🔧 Calculating NET DEALER (enhanced) for call`);
              if (gamma && delta !== undefined && vanna !== undefined) {
                const expirationDate = new Date(expDate);
                const today = new Date();
                const T = Math.max((expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001); // Min 0.001 to avoid division by zero
                
                if (T >= 0) {
                  const beta = 0.25;
                  const rho_S_sigma = -0.7;
                  const contractMult = 100;
                  const wT = 1 / Math.sqrt(T);
                  const gammaEff = gamma + beta * vanna * rho_S_sigma;
                  const liveWeight = Math.abs(delta) * (1 - Math.abs(delta));
                  const dealerValue = oi * gammaEff * liveWeight * wT * currentPrice * contractMult;
                  dealerByStrikeByExp[expDate][strikeNum].call = dealerValue;
                  console.log(`🎯 DEALER Call: Strike ${strikeNum} = ${oi} × ${gammaEff.toFixed(6)} × ${liveWeight.toFixed(4)} × ${wT.toFixed(4)} × ${currentPrice} × 100 = ${dealerValue}`);
                }
              }
              
              // STEP 1C: Calculate VEX using the OI we already have
              if (!vexByStrikeByExp[expDate][strikeNum]) {
                vexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0, callVega: 0, putVega: 0 };
              }
              vexByStrikeByExp[expDate][strikeNum].callOI = oi;
              vexByStrikeByExp[expDate][strikeNum].callVega = vega; // Store vega for recalculation
              console.log(`🔍🚨 Call VEX Debug: Strike ${strikeNum}, OI=${oi}, Vega=${vega}, greeks:`, data.greeks);
              if (vega && vega !== 0) {
                // Professional VEX Formula (Goldman Sachs style):
                // VEX = Vega × OI × Spot × 100 × Moneyness_Weight × Time_Weight
                
                const expirationDate = new Date(expDate);
                const today = new Date();
                const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
                
                // Moneyness weight: ATM options have highest vega sensitivity
                // Weight peaks at ATM and decays for OTM/ITM
                const moneyness = strikeNum / currentPrice;
                const moneynessWeight = Math.exp(-Math.pow(Math.log(moneyness), 2) / 0.5); // Gaussian centered at ATM
                
                // Time weight: Vega is highest for longer-dated options
                // But also weight by near-term expiration impact (dealers more sensitive)
                const timeWeight = T > 0 ? Math.sqrt(T) * (1 + 0.5 / Math.max(T, 0.01)) : 0;
                
                // Professional VEX with proper notional scaling
                const vex = vega * oi * currentPrice * 100 * moneynessWeight * timeWeight;
                
                vexByStrikeByExp[expDate][strikeNum].call = vex;
                console.log(`🟣 Step 1C - Call VEX (Pro): Strike ${strikeNum} = ${vega} × ${oi} × ${currentPrice} × 100 × ${moneynessWeight.toFixed(3)} × ${timeWeight.toFixed(3)} = ${vex}`);
              } else {
                console.log(`❌ Call VEX ZERO: Strike ${strikeNum} - vega is ${vega} (greeks exist: ${!!data.greeks})`);
              }
              

              
              allStrikes.add(strikeNum);
            }
          });
          
          // STEP 2: Process puts - Same order: OI → GEX → VEX → Premium with Theta calculation
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
            let oi = data.open_interest || 0;
            
            // 🔥 USE LIVE OI IF AVAILABLE
            const contractKey = `${selectedTicker}_${strikeNum}_put_${expDate}`;
            if (liveOIDataFromState && liveOIDataFromState.has(contractKey)) {
              const liveOI = liveOIDataFromState.get(contractKey) || 0;
              console.log(`🔥 USING LIVE OI for ${contractKey}: Original=${oi}, Live=${liveOI}`);
              oi = liveOI;
            }
            
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
              
              // STEP 2B: Update GEX with put data and get all Greeks from API
              if (!gexByStrikeByExp[expDate][strikeNum]) {
                gexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0, callGamma: 0, putGamma: 0, callDelta: 0, putDelta: 0, callVanna: 0, putVanna: 0, callTheta: 0, putTheta: 0, callVega: 0, putVega: 0 };
              }
              // Initialize dealer data if not exists
              if (!dealerByStrikeByExp[expDate][strikeNum]) {
                dealerByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0, callGamma: 0, putGamma: 0, callDelta: 0, putDelta: 0, callVanna: 0, putVanna: 0 };
              }
              
              const gamma = data.greeks?.gamma || 0;
              const delta = data.greeks?.delta || 0;
              const vega = data.greeks?.vega || 0;
              const theta = data.greeks?.theta || 0; // Use Polygon's theta directly
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
              gexByStrikeByExp[expDate][strikeNum].putTheta = theta;
              gexByStrikeByExp[expDate][strikeNum].putVega = vega;
              
              console.log(`📊 GREEKS DEBUG - Put: Strike ${strikeNum}, gamma=${gamma}, delta=${delta}, vanna=${vanna}, theta=${theta} (from API), vega=${vega}`);
              
              dealerByStrikeByExp[expDate][strikeNum].putOI = oi;
              dealerByStrikeByExp[expDate][strikeNum].putGamma = gamma;
              dealerByStrikeByExp[expDate][strikeNum].putDelta = delta;
              dealerByStrikeByExp[expDate][strikeNum].putVanna = vanna;
              
              // Flow Map: Simple premium-based calculation for puts (no GEX, no Greeks)
              if (!flowGexByStrikeByExp[expDate][strikeNum]) {
                flowGexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: oi, callVolume: 0, putVolume: 0 };
              }
              
              const putFlowData = flowPremiumByStrike[expDate]?.[strikeNum];
              const putPremium = putFlowData?.putPremium || 0;
              const putContracts = putFlowData?.putContracts || 0;
              
              flowGexByStrikeByExp[expDate][strikeNum].put = putPremium;  // Store premium directly
              flowGexByStrikeByExp[expDate][strikeNum].putOI = oi;
              flowGexByStrikeByExp[expDate][strikeNum].putVolume = putContracts;  // Store contract count
              
              if (putPremium > 0) {
                console.log(`💰 FLOW MAP Put: Strike ${strikeNum} = $${putPremium.toFixed(0)} (${putContracts} contracts)`);
              }
              
              // ALWAYS calculate BOTH formulas
              // 1. NET GEX - Standard formula
              console.log(`📊 Calculating NET GEX (standard) for put`);
              if (gamma) {
                const gex = -gamma * oi * (currentPrice * currentPrice) * 100; // Negative for puts
                gexByStrikeByExp[expDate][strikeNum].put = gex;
                console.log(`⚡ GEX Put: Strike ${strikeNum} = -${gamma} × ${oi} × ${currentPrice}² × 100 = ${gex}`);
              }
              
              // 2. NET DEALER - Enhanced formula
              console.log(`🔧 Calculating NET DEALER (enhanced) for put`);
              if (gamma && delta !== undefined && vanna !== undefined) {
                const expirationDate = new Date(expDate);
                const today = new Date();
                const T = Math.max((expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001); // Min 0.001 to avoid division by zero
                
                if (T >= 0) {
                  const beta = 0.25;
                  const rho_S_sigma = -0.7;
                  const contractMult = 100;
                  const wT = 1 / Math.sqrt(T);
                  const gammaEff = gamma + beta * vanna * rho_S_sigma;
                  const liveWeight = Math.abs(delta) * (1 - Math.abs(delta));
                  const dealerValue = -oi * gammaEff * liveWeight * wT * currentPrice * contractMult;
                  dealerByStrikeByExp[expDate][strikeNum].put = dealerValue;
                  console.log(`🎯 DEALER Put: Strike ${strikeNum} = -${oi} × ${gammaEff.toFixed(6)} × ${liveWeight.toFixed(4)} × ${wT.toFixed(4)} × ${currentPrice} × 100 = ${dealerValue}`);
                }
              }
              

              
              // STEP 2C: Update VEX with put data
              if (!vexByStrikeByExp[expDate][strikeNum]) {
                vexByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0, callVega: 0, putVega: 0 };
              }
              vexByStrikeByExp[expDate][strikeNum].putOI = oi;
              vexByStrikeByExp[expDate][strikeNum].putVega = vega; // Store vega for recalculation
              console.log(`🔍 Put VEX Debug: Strike ${strikeNum}, OI=${oi}, Vega=${vega}, greeks:`, data.greeks);
              if (vega) {
                // Professional VEX Formula (Goldman Sachs style):
                // VEX = -Vega × OI × Spot × 100 × Moneyness_Weight × Time_Weight
                
                const expirationDate = new Date(expDate);
                const today = new Date();
                const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
                
                // Moneyness weight: ATM options have highest vega sensitivity
                const moneyness = strikeNum / currentPrice;
                const moneynessWeight = Math.exp(-Math.pow(Math.log(moneyness), 2) / 0.5); // Gaussian centered at ATM
                
                // Time weight: Vega is highest for longer-dated options
                const timeWeight = T > 0 ? Math.sqrt(T) * (1 + 0.5 / Math.max(T, 0.01)) : 0;
                
                // Professional VEX with proper notional scaling (negative for puts)
                const vex = -vega * oi * currentPrice * 100 * moneynessWeight * timeWeight;
                
                vexByStrikeByExp[expDate][strikeNum].put = vex;
                console.log(`🟣 Step 2C - Put VEX (Pro): Strike ${strikeNum} = -${vega} × ${oi} × ${currentPrice} × 100 × ${moneynessWeight.toFixed(3)} × ${timeWeight.toFixed(3)} = ${vex}`);
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
      
      // ALWAYS store ALL calculations - we calculated both formulas simultaneously
      console.log(`✅ Calculation sequence complete for ${selectedTicker}. Storing ALL formulas...`);
      console.log(`📊 STORING NET GEX (Standard Formula) - ${Object.keys(gexByStrikeByExp).length} expirations`);
      console.log(`📊 STORING NET DEALER (Enhanced Formula) - ${Object.keys(dealerByStrikeByExp).length} expirations`);
      
      // Store both calculations - they were computed in parallel
      setGexByStrikeByExpiration(gexByStrikeByExp);
      setDealerByStrikeByExpiration(dealerByStrikeByExp);
      
      // If NOT in live mode, also save as base (original) data
      if (!liveOIMapOverride) {
        console.log(`💾 SAVING BASE DATA (not live mode)`);
        setBaseGexByStrikeByExpiration(gexByStrikeByExp);
        setBaseDealerByStrikeByExpiration(dealerByStrikeByExp);
      } else {
        console.log(`🔴 LIVE MODE: Not overwriting base data backup`);
      }
      
      setFlowGexByStrikeByExpiration(flowGexByStrikeByExp);
      console.log(`🔥 STATE UPDATED: GEX=${Object.keys(gexByStrikeByExp).length}, DEALER=${Object.keys(dealerByStrikeByExp).length}, FLOW GEX=${Object.keys(flowGexByStrikeByExp).length} expirations`);
      setProgress(87);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      setVexByStrikeByExpiration(vexByStrikeByExp);
      setProgress(90);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      console.log(`🎯 All data structures updated: GEX, VEX calculated from foundational OI data`);
      setProgress(95);
      await new Promise(resolve => setTimeout(resolve, 0)); // Force UI update
      
      // Format and display data - store ALL strikes, filter at render time
      const relevantStrikes = Array.from(allStrikes)
        .sort((a, b) => b - a);
      
        const formattedData = relevantStrikes.map(strike => {
          const row: GEXData = { strike };
          allAvailableExpirations.forEach(exp => {
            const data = gexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 };
            const flowData = flowGexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callVolume: 0, putVolume: 0 };
            const vexData = vexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 };
            
            // DEBUG: Log flow data for first few strikes
            if (relevantStrikes.indexOf(strike) < 3 && (flowData.call !== 0 || flowData.put !== 0)) {
              console.log(`🔍 FLOW DATA for Strike ${strike} ${exp}:`, {
                call: flowData.call,
                put: flowData.put,
                callVolume: flowData.callVolume,
                putVolume: flowData.putVolume,
                flowNet: flowData.call - flowData.put
              });
            }
            
            row[exp] = { 
              call: data.call, 
              put: data.put, 
              net: data.call + data.put, 
              callOI: data.callOI, 
              putOI: data.putOI,
              flowCall: flowData.call,
              flowPut: flowData.put,
              flowNet: flowData.call - flowData.put,  // Net = Calls premium - Puts premium (positive = bullish)
              callVex: vexData.call,
              putVex: vexData.put
            };
          });
          return row;
        });
      
      console.log(`📊 FINAL FORMATTED DATA SAMPLE (first 3 rows):`, formattedData.slice(0, 3));
      setData(formattedData);
      setProgress(100);
      setLoading(false);
      
      // If this was triggered by Live OI, hide that loading state too
      if (liveOIMapOverride) {
        console.log(`✅ Live OI recalculation complete`);
        setLiveOILoading(false);
        setLiveOIProgress(100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
      
      // Also hide Live OI loading on error
      if (liveOIMapOverride) {
        setLiveOILoading(false);
        setLiveOIProgress(0);
      }
    }
  };

  // Auto-trigger Live OI scan when Flow GEX is enabled
  useEffect(() => {
    if (selectedTicker && showFlowGEX) {
      console.log(`🔥🔥🔥 AUTO-TRIGGERING LIVE OI SCAN: ${selectedTicker}`);
      setLiveMode(true);
      // Start the scan - it will auto-call fetchOptionsData when complete
      updateLiveOI();
    } else if (selectedTicker && !showFlowGEX) {
      // Flow GEX disabled - fetch normally
      fetchOptionsData();
    }
  }, [selectedTicker, showFlowGEX]);

  // Memoize GEX calculated data (always uses Net GEX formula)
  const allGEXCalculatedData = useMemo(() => {
    const gexData = gexByStrikeByExpiration;
    const willUseLiveData = liveMode && liveOIData.size > 0;
    
    console.log(`🔄 RECALCULATING allGEXCalculatedData - LIVE: ${liveMode}, liveOIData.size: ${liveOIData.size}`);
    console.log(`  ${willUseLiveData ? '✅ WILL USE LIVE OI DATA' : '❌ WILL USE BASE DATA ONLY'}`);
    
    if (!gexData || Object.keys(gexData).length === 0) {
      return [];
    }
    
    const allStrikes = Array.from(new Set([
      ...Object.values(gexData).flatMap(exp => Object.keys(exp).map(Number))
    ])).sort((a, b) => b - a);

    return allStrikes.map(strike => {
      const row: GEXData = { strike };
      expirations.forEach(exp => {
        const greeksData = gexData[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callGamma: undefined, putGamma: undefined };
        
        let callGEX = greeksData.call;
        let putGEX = greeksData.put;
        let callOI = greeksData.callOI;
        let putOI = greeksData.putOI;
        
        // Apply Live OI recalculations if active (Net GEX formula)
        if (liveMode && liveOIData.size > 0) {
          const callKey = `${selectedTicker}_${strike}_call_${exp}`;
          const putKey = `${selectedTicker}_${strike}_put_${exp}`;
          
          const liveCallOI = liveOIData.get(callKey);
          const livePutOI = liveOIData.get(putKey);
          
          if (liveCallOI !== undefined && greeksData.callGamma) {
            callOI = liveCallOI;
            callGEX = greeksData.callGamma * liveCallOI * (currentPrice * currentPrice) * 100;
          }
          
          if (livePutOI !== undefined && greeksData.putGamma) {
            putOI = livePutOI;
            putGEX = -greeksData.putGamma * livePutOI * (currentPrice * currentPrice) * 100;
          }
        }
        
        row[exp] = { 
          call: callGEX, 
          put: putGEX, 
          net: callGEX + putGEX, 
          callOI: callOI, 
          putOI: putOI
        };
      });
      return row;
    });
  }, [gexByStrikeByExpiration, currentPrice, expirations, liveMode, selectedTicker, liveOIData]);

  // Memoize Dealer calculated data (always uses Net Dealer formula)
  const allDealerCalculatedData = useMemo(() => {
    const dealerData = dealerByStrikeByExpiration;
    const willUseLiveData = liveMode && liveOIData.size > 0;
    
    console.log(`🔄 RECALCULATING allDealerCalculatedData - LIVE: ${liveMode}, liveOIData.size: ${liveOIData.size}`);
    console.log(`  ${willUseLiveData ? '✅ WILL USE LIVE OI DATA' : '❌ WILL USE BASE DATA ONLY'}`);
    
    if (!dealerData || Object.keys(dealerData).length === 0) {
      return [];
    }
    
    const allStrikes = Array.from(new Set([
      ...Object.values(dealerData).flatMap(exp => Object.keys(exp).map(Number))
    ])).sort((a, b) => b - a);

    return allStrikes.map(strike => {
      const row: GEXData = { strike };
      expirations.forEach(exp => {
        const greeksData = dealerData[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callGamma: undefined, putGamma: undefined, callDelta: undefined, putDelta: undefined, callVanna: undefined, putVanna: undefined };
        
        let callDealer = greeksData.call;
        let putDealer = greeksData.put;
        let callOI = greeksData.callOI;
        let putOI = greeksData.putOI;
        
        // Apply Live OI recalculations if active (Net Dealer formula)
        if (liveMode && liveOIData.size > 0) {
          const callKey = `${selectedTicker}_${strike}_call_${exp}`;
          const putKey = `${selectedTicker}_${strike}_put_${exp}`;
          
          const liveCallOI = liveOIData.get(callKey);
          const livePutOI = liveOIData.get(putKey);
          
          const expirationDate = new Date(exp + 'T00:00:00Z');
          const today = new Date();
          const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
          
          if (liveCallOI !== undefined && greeksData.callGamma && greeksData.callDelta !== undefined && greeksData.callVanna !== undefined && T > 0) {
            callOI = liveCallOI;
            const beta = 0.25;
            const rho_S_sigma = -0.7;
            const contractMult = 100;
            const wT = 1 / Math.sqrt(T);
            const gammaEff = greeksData.callGamma + beta * greeksData.callVanna * rho_S_sigma;
            const liveWeight = Math.abs(greeksData.callDelta) * (1 - Math.abs(greeksData.callDelta));
            callDealer = liveCallOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
          }
          
          if (livePutOI !== undefined && greeksData.putGamma && greeksData.putDelta !== undefined && greeksData.putVanna !== undefined && T > 0) {
            putOI = livePutOI;
            const beta = 0.25;
            const rho_S_sigma = -0.7;
            const contractMult = 100;
            const wT = 1 / Math.sqrt(T);
            const gammaEff = greeksData.putGamma + beta * greeksData.putVanna * rho_S_sigma;
            const liveWeight = Math.abs(greeksData.putDelta) * (1 - Math.abs(greeksData.putDelta));
            putDealer = -livePutOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
          }
        }
        
        row[exp] = { 
          call: callDealer, 
          put: putDealer, 
          net: callDealer + putDealer, 
          callOI: callOI, 
          putOI: putOI
        };
      });
      return row;
    });
  }, [dealerByStrikeByExpiration, currentPrice, expirations, liveMode, selectedTicker, liveOIData]);

  // Keep original allCalculatedData for backwards compatibility (uses gexMode to switch)
  const allCalculatedData = useMemo(() => {
    // Choose data source based on current mode
    const dealerData = dealerByStrikeByExpiration;
    const gexData = gexByStrikeByExpiration;
    
    // Use the correct data source based on gexMode
    const baseDataSource = (gexMode === 'Net Dealer') ? dealerData : gexData;
    
    const willUseLiveData = liveMode && liveOIData.size > 0;
    console.log(`🔄 RECALCULATING allCalculatedData - MODE: ${gexMode}, LIVE: ${liveMode}, liveOIData.size: ${liveOIData.size}`);
    console.log(`  ${willUseLiveData ? '✅ WILL USE LIVE OI DATA' : '❌ WILL USE BASE DATA ONLY'}`);
    
    if (!baseDataSource || Object.keys(baseDataSource).length === 0) {
      console.log(`⚠️ WARNING: baseDataSource is empty!`);
      return [];
    }
    
    const allStrikes = Array.from(new Set([
      ...Object.values(baseDataSource).flatMap(exp => Object.keys(exp).map(Number))
    ])).sort((a, b) => b - a);

    return allStrikes.map(strike => {
      const row: GEXData = { strike };
      expirations.forEach(exp => {
        const greeksData: {call: number, put: number, callOI: number, putOI: number, callGamma?: number, putGamma?: number, callDelta?: number, putDelta?: number, callVanna?: number, putVanna?: number, callVega?: number, putVega?: number, callTheta?: number, putTheta?: number} = baseDataSource[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callGamma: undefined, putGamma: undefined, callDelta: undefined, putDelta: undefined, callVanna: undefined, putVanna: undefined, callVega: undefined, putVega: undefined, callTheta: undefined, putTheta: undefined };
        const vexData: {call: number, put: number, callOI: number, putOI: number, callVega?: number, putVega?: number} = vexByStrikeByExpiration[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0, callVega: undefined, putVega: undefined };
        
        // Start with base calculated values
        let callGEX = greeksData.call;
        let putGEX = greeksData.put;
        let callOI = greeksData.callOI;
        let putOI = greeksData.putOI;
        let callVEX = vexData.call;
        let putVEX = vexData.put;
        
        // Apply Live OI recalculations if active
        if (liveMode && liveOIData.size > 0) {
          const callKey = `${selectedTicker}_${strike}_call_${exp}`;
          const putKey = `${selectedTicker}_${strike}_put_${exp}`;
          
          const liveCallOI = liveOIData.get(callKey);
          const livePutOI = liveOIData.get(putKey);
          
          const expirationDate = new Date(exp + 'T00:00:00Z');
          const today = new Date();
          const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000);
          
          // Recalculate based on the current mode
          if (gexMode === 'Net Dealer') {
            // Use dealer formula for live recalc
            console.log(`🔄 LIVE OI RECALC - NET DEALER MODE: Strike ${strike}, Exp ${exp}`);
            if (liveCallOI !== undefined && greeksData.callGamma && greeksData.callDelta !== undefined && greeksData.callVanna !== undefined && T > 0) {
              callOI = liveCallOI;
              const beta = 0.25;
              const rho_S_sigma = -0.7;
              const contractMult = 100;
              const wT = 1 / Math.sqrt(T);
              const gammaEff = greeksData.callGamma + beta * greeksData.callVanna * rho_S_sigma;
              const liveWeight = Math.abs(greeksData.callDelta) * (1 - Math.abs(greeksData.callDelta));
              callGEX = liveCallOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
              console.log(`  📈 Call: LiveOI ${liveCallOI} × gammaEff ${gammaEff.toFixed(6)} × liveWeight ${liveWeight.toFixed(4)} = ${callGEX.toFixed(2)}`);
            }
            
            if (livePutOI !== undefined && greeksData.putGamma && greeksData.putDelta !== undefined && greeksData.putVanna !== undefined && T > 0) {
              putOI = livePutOI;
              const beta = 0.25;
              const rho_S_sigma = -0.7;
              const contractMult = 100;
              const wT = 1 / Math.sqrt(T);
              const gammaEff = greeksData.putGamma + beta * greeksData.putVanna * rho_S_sigma;
              const liveWeight = Math.abs(greeksData.putDelta) * (1 - Math.abs(greeksData.putDelta));
              putGEX = -livePutOI * gammaEff * liveWeight * wT * currentPrice * contractMult;
              console.log(`  📉 Put: LiveOI ${livePutOI} × gammaEff ${gammaEff.toFixed(6)} × liveWeight ${liveWeight.toFixed(4)} = ${putGEX.toFixed(2)}`);
            }
          } else {
            // Use standard GEX formula for live recalc
            console.log(`🔄 LIVE OI RECALC - NET GEX MODE: Strike ${strike}, Exp ${exp}`);
            if (liveCallOI !== undefined && greeksData.callGamma) {
              callOI = liveCallOI;
              callGEX = greeksData.callGamma * liveCallOI * (currentPrice * currentPrice) * 100;
              console.log(`  📈 Call: ${greeksData.callGamma} × ${liveCallOI} × ${currentPrice}² × 100 = ${callGEX.toFixed(2)}`);
            }
            
            if (livePutOI !== undefined && greeksData.putGamma) {
              putOI = livePutOI;
              putGEX = -greeksData.putGamma * livePutOI * (currentPrice * currentPrice) * 100;
              console.log(`  📉 Put: -${greeksData.putGamma} × ${livePutOI} × ${currentPrice}² × 100 = ${putGEX.toFixed(2)}`);
            }
          }
          
          // Recalculate VEX with Live OI (same for both modes)
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
  }, [gexByStrikeByExpiration, dealerByStrikeByExpiration, vexByStrikeByExpiration, currentPrice, expirations, gexMode, liveMode, selectedTicker, liveOIData]);

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
  // Helper function to calculate top values from strike/expiration map
  const calculateTopValuesFromMap = (dataMap: {[exp: string]: {[strike: number]: {call: number, put: number}}}) => {
    const positiveValues: number[] = [];
    const negativeValues: number[] = [];
    
    Object.keys(dataMap).forEach(exp => {
      Object.keys(dataMap[exp]).forEach(strikeStr => {
        const strikeData = dataMap[exp][parseFloat(strikeStr)];
        if (strikeData) {
          const displayValue = (strikeData.call || 0) + (strikeData.put || 0);
          if (displayValue > 0) {
            positiveValues.push(displayValue);
          } else if (displayValue < 0) {
            negativeValues.push(Math.abs(displayValue));
          }
        }
      });
    });
    
    const sortedPositive = positiveValues.sort((a, b) => b - a);
    const sortedNegative = negativeValues.sort((a, b) => b - a);
    
    return {
      highestPositive: sortedPositive[0] || 0,
      highestNegative: sortedNegative[0] || 0,
      highest: sortedPositive[0] || 0,
      second: sortedPositive[1] || 0,
      third: sortedPositive[2] || 0,
      fourth: sortedPositive[3] || 0,
      top10: sortedPositive.slice(0, 10),
      top5Positive: sortedPositive.slice(0, 10),
      top5Negative: sortedNegative.slice(0, 5)
    };
  };

  // Helper function to calculate top values for a specific data set
  const calculateTopValues = (sourceData: any[], mode: 'gex' | 'dealer' | 'flow' | 'vex', currentGexMode?: string, currentVexMode?: string) => {
    if (sourceData.length === 0) {
      return {
        highestPositive: 0,
        highestNegative: 0,
        highest: 0,
        second: 0,
        third: 0,
        fourth: 0,
        top10: [],
        top5Positive: [],
        top5Negative: []
      };
    }
    
    const positiveValues: number[] = [];
    const negativeValues: number[] = [];
    
    // Read from sourceData and collect positive and negative values separately
    sourceData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key === 'strike') return;
        
        const cellData = row[key];
        if (!cellData || typeof cellData === 'number') return;
        
        // Collect Flow GEX values
        if (mode === 'flow') {
          const flowNet = cellData.flowNet || 0;
          if (flowNet > 0) positiveValues.push(flowNet);
          else if (flowNet < 0) negativeValues.push(Math.abs(flowNet));
        }
        // Collect GEX/Dealer values
        else if (mode === 'gex' || mode === 'dealer') {
          if (currentGexMode === 'Net GEX' || currentGexMode === 'Net Dealer') {
            const netGex = cellData.net || 0;
            if (netGex > 0) positiveValues.push(netGex);
            else if (netGex < 0) negativeValues.push(Math.abs(netGex));
          } else {
            const callGex = cellData.call || 0;
            const putGex = cellData.put || 0;
            if (callGex > 0) positiveValues.push(callGex);
            else if (callGex < 0) negativeValues.push(Math.abs(callGex));
            if (putGex > 0) positiveValues.push(putGex);
            else if (putGex < 0) negativeValues.push(Math.abs(putGex));
          }
        }
        // Collect VEX values
        else if (mode === 'vex') {
          if (currentVexMode === 'Net VEX') {
            const netVex = (cellData.callVex || 0) + (cellData.putVex || 0);
            if (netVex > 0) positiveValues.push(netVex);
            else if (netVex < 0) negativeValues.push(Math.abs(netVex));
          } else {
            const callVex = cellData.callVex || 0;
            const putVex = cellData.putVex || 0;
            if (callVex > 0) positiveValues.push(callVex);
            else if (callVex < 0) negativeValues.push(Math.abs(callVex));
            if (putVex > 0) positiveValues.push(putVex);
            else if (putVex < 0) negativeValues.push(Math.abs(putVex));
          }
        }
      });
    });
    
    // Sort positive and negative values separately (highest to lowest)
    const sortedPositive = positiveValues.sort((a, b) => b - a);
    const sortedNegative = negativeValues.sort((a, b) => b - a);
    
    return {
      highestPositive: sortedPositive[0] || 0,
      highestNegative: sortedNegative[0] || 0,
      highest: sortedPositive[0] || 0,
      second: sortedPositive[1] || 0,
      third: sortedPositive[2] || 0,
      fourth: sortedPositive[3] || 0,
      top10: sortedPositive.slice(0, 10),
      top5Positive: sortedPositive.slice(0, 10),
      top5Negative: sortedNegative.slice(0, 5)
    };
  };

  // Calculate separate top values for each mode
  // In live mode, use allCalculatedData which has live OI applied
  // In normal mode, use the base data maps
  const gexTopValues = useMemo(() => {
    const isLive = liveMode && liveOIData.size > 0;
    let topVals;
    if (isLive) {
      topVals = calculateTopValues(allGEXCalculatedData, 'gex', 'Net GEX');
      console.log('🎯 GEX TOP VALUES (LIVE MODE):', topVals);
    } else {
      topVals = calculateTopValuesFromMap(gexByStrikeByExpiration);
      console.log('🎯 GEX TOP VALUES (NORMAL MODE):', topVals);
    }
    console.log(`  Mode: ${isLive ? 'LIVE' : 'NORMAL'}, liveMode=${liveMode}, liveOIData.size=${liveOIData.size}`);
    return topVals;
  }, [gexByStrikeByExpiration, allGEXCalculatedData, liveMode, liveOIData]);
  
  const dealerTopValues = useMemo(() => {
    const isLive = liveMode && liveOIData.size > 0;
    let topVals;
    if (isLive) {
      topVals = calculateTopValues(allDealerCalculatedData, 'dealer', 'Net Dealer');
      console.log('🎯 DEALER TOP VALUES (LIVE MODE):', topVals);
    } else {
      topVals = calculateTopValuesFromMap(dealerByStrikeByExpiration);
      console.log('🎯 DEALER TOP VALUES (NORMAL MODE):', topVals);
    }
    console.log(`  Mode: ${isLive ? 'LIVE' : 'NORMAL'}, liveMode=${liveMode}, liveOIData.size=${liveOIData.size}`);
    return topVals;
  }, [dealerByStrikeByExpiration, allDealerCalculatedData, liveMode, liveOIData]);
  
  const flowTopValues = useMemo(() => calculateTopValues(data, 'flow'), [data]);
  const vexTopValues = useMemo(() => calculateTopValues(allCalculatedData, 'vex', gexMode, vexMode), [allCalculatedData, gexMode, vexMode]);
  
  // Legacy topValues for backward compatibility (uses first active mode)
  const topValues = useMemo(() => {
    if (showFlowGEX) return flowTopValues;
    if (showDealer) return dealerTopValues;
    if (showGEX) return gexTopValues;
    if (showVEX) return vexTopValues;
    return gexTopValues;
  }, [showFlowGEX, showDealer, showGEX, showVEX, flowTopValues, dealerTopValues, gexTopValues, vexTopValues]);

  const getCellStyle = (value: number, isVexValue: boolean = false, strike?: number, exp?: string, customTopValues?: any): { bg: string; ring: string; label?: string } => {
    let bgColor = '';
    let ringColor = '';
    let label = '';
    
    // Determine which top values to use
    const topVals = customTopValues || topValues;
    
    // Check if this is the highest positive or highest negative value
    // Use epsilon for floating point comparison to handle precision issues
    const isHighestPositive = value > 0 && Math.abs(value - topVals.highestPositive) < 0.01;
    const isHighestNegative = value < 0 && Math.abs(Math.abs(value) - topVals.highestNegative) < 0.01;
    
    if (isHighestPositive) {
      // 100% opacity purple background with white text for highest positive
      bgColor = 'text-white border border-purple-500/50';
      bgColor += ' bg-purple-600';
      label = 'MAGNET';
    } else if (isHighestNegative) {
      // 100% opacity blue background with white text for highest negative
      bgColor = 'text-white border border-blue-500/50';
      bgColor += ' bg-blue-600';
      label = 'PIVOT';
    } else if (value !== 0) {
      bgColor = 'bg-gradient-to-br from-black to-gray-900 text-white border border-gray-700/30';
    } else {
      bgColor = 'bg-gradient-to-br from-gray-950 to-black text-gray-400 border border-gray-800/30';
    }
    
    return { bg: bgColor, ring: ringColor, label };
  };

  const formatDate = (dateStr: string) => {
    // Parse as local date to avoid timezone conversion issues
    // Split the date string and create date in local timezone
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed in Date constructor
    
    // Format for mobile: "Nov 28, 25" instead of "Nov 28, 2025"
    const fullDate = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      timeZone: 'America/New_York'
    });
    
    // Shorten year for mobile (2025 -> 25)
    return fullDate.replace(/, (\d{4})$/, (match, year) => `, ${year.slice(-2)}`);
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
              onClick={() => fetchOptionsData()}
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
        /* Custom scrollbar styling - Hidden */
        .overflow-x-auto::-webkit-scrollbar,
        .overflow-y-auto::-webkit-scrollbar,
        .overflow-auto::-webkit-scrollbar {
          display: none;
        }
        
        .overflow-x-auto,
        .overflow-y-auto,
        .overflow-auto {
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none; /* IE and Edge */
        }
        
        /* Custom scrollbar for tables */
        .table-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: #ff4500 #000000;
        }
        
        .table-scroll-container::-webkit-scrollbar {
          height: 12px;
        }
        
        .table-scroll-container::-webkit-scrollbar-track {
          background: #000000;
          border-radius: 6px;
        }
        
        .table-scroll-container::-webkit-scrollbar-thumb {
          background: #ff4500;
          border-radius: 6px;
        }
        
        .table-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #ff6347;
        }
        
        @media (max-width: 768px) {
          .dealer-attraction-container {
            padding-top: 30px !important;
          }
        }
      `}</style>
      <div className="p-6 pt-24 md:pt-6 dealer-attraction-container">
        <div className={`${activeTableCount === 3 ? 'w-full' : 'max-w-[95vw]'} px-4 mx-auto`}>
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
                        ? 'relative text-orange-500 border-2 border-orange-500 shadow-[0_0_20px_rgba(255,102,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]' 
                        : 'bg-black text-white hover:text-orange-500 border-2 border-gray-800 hover:border-orange-500 hover:shadow-[0_0_15px_rgba(255,102,0,0.3)]'
                    }`} 
                    style={{ padding: '14px 16px', fontSize: '14px' }}
                  >
                    {activeTab === 'WORKBENCH' && <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent"></div>}
                    <span className="relative" style={activeTab === 'WORKBENCH' ? { textShadow: '0 2px 4px rgba(0,0,0,0.8)' } : {}}>WORKBENCH</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('ATTRACTION')}
                    className={`flex-1 font-black uppercase tracking-[0.15em] transition-all ${
                      activeTab === 'ATTRACTION' 
                        ? 'relative text-orange-500 border-2 border-orange-500 shadow-[0_0_20px_rgba(255,102,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]' 
                        : 'bg-black text-white hover:text-orange-500 border-2 border-gray-800 hover:border-orange-500 hover:shadow-[0_0_15px_rgba(255,102,0,0.3)]'
                    }`} 
                    style={{ padding: '14px 16px', fontSize: '14px' }}
                  >
                    {activeTab === 'ATTRACTION' && <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent"></div>}
                    <span className="relative" style={activeTab === 'ATTRACTION' ? { textShadow: '0 2px 4px rgba(0,0,0,0.8)' } : {}}>GREEK SUITE</span>
                  </button>

                </div>

                {/* Only show these controls for GREEK SUITE tab */}
                {activeTab === 'ATTRACTION' && (
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Mobile Layout - Two Rows */}
                    <div className="md:hidden w-full space-y-2">
                      {/* Row 1: Search + LIVE + Range + REFRESH */}
                      <div className="flex items-center gap-2">
                        {/* Search Bar */}
                        <div className="search-bar-premium flex items-center space-x-2 px-3 rounded-md flex-shrink-0" style={{ width: '20%', minWidth: '100px', height: '46px' }}>
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
                            className="bg-transparent border-0 outline-none flex-1 text-lg font-bold uppercase"
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
                        
                        {/* LIVE Button */}
                        <button
                          onClick={() => {
                            const currentTicker = tickerInput.trim() || selectedTicker;
                            if (!currentTicker || currentTicker.trim() === '') {
                              alert('Please type a ticker in the search bar first before enabling Live OI');
                              return;
                            }
                            if (tickerInput.trim() && tickerInput.trim() !== selectedTicker) {
                              const newTicker = tickerInput.trim().toUpperCase();
                              setSelectedTicker(newTicker);
                              setTickerInput(newTicker);
                            }
                            if (!liveMode) {
                              setLiveMode(true);
                              updateLiveOI();
                            } else {
                              console.log('🔴 TURNING OFF LIVE MODE');
                              setLiveMode(false);
                              setLiveOIData(new Map());
                              console.log('🔴 LIVE MODE OFF - liveMode now false, liveOIData cleared to empty Map');
                              console.log('🔴 Restoring base (original) data...');
                              
                              // Restore original base data
                              setGexByStrikeByExpiration(baseGexByStrikeByExpiration);
                              setDealerByStrikeByExpiration(baseDealerByStrikeByExpiration);
                              console.log('✅ Base data restored from backup');
                            }
                          }}
                          disabled={liveOILoading}
                          className="flex items-center justify-center gap-2 px-6 border-2 border-gray-800 hover:border-orange-500 text-black font-black text-sm uppercase tracking-wider transition-all rounded whitespace-nowrap"
                          style={{
                            background: liveMode ? '#22c55e' : '#ef4444',
                            boxShadow: liveMode 
                              ? 'inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 3px rgba(0,0,0,0.4), 0 4px 8px rgba(34,197,94,0.4)' 
                              : 'inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 3px rgba(0,0,0,0.4), 0 4px 8px rgba(239,68,68,0.4)',
                            height: '46px',
                            minWidth: '100px',
                            opacity: liveOILoading ? 0.5 : 1,
                            cursor: liveOILoading ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                            {liveOILoading ? `${liveOIProgress}%` : 'LIVE'}
                          </span>
                        </button>
                        
                        {/* Range Selector */}
                        <div className="flex items-center gap-2 flex-1" style={{ height: '46px' }}>
                          <span className="text-white font-black text-sm uppercase tracking-wider whitespace-nowrap">RANGE</span>
                          <select
                            value={otmFilter}
                            onChange={(e) => setOtmFilter(e.target.value as '1%' | '2%' | '3%' | '5%' | '8%' | '10%' | '15%' | '20%' | '25%' | '40%' | '50%' | '100%')}
                            className="bg-black border-2 border-gray-800 focus:border-orange-500 focus:outline-none px-4 text-white text-sm font-black uppercase appearance-none cursor-pointer rounded whitespace-nowrap flex-1"
                            style={{
                              background: '#000000',
                              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1), inset 0 -1px 3px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.4)',
                              height: '46px'
                            }}
                          >
                            <option value="1%">±1% OTM</option>
                            <option value="2%">±2% OTM</option>
                          <option value="3%">±3% OTM</option>
                          <option value="5%">±5% OTM</option>
                          <option value="8%">±8% OTM</option>
                          <option value="10%">±10% OTM</option>
                          <option value="15%">±15% OTM</option>
                          <option value="20%">±20% OTM</option>
                          <option value="25%">±25% OTM</option>
                          <option value="40%">±40% OTM</option>
                          <option value="50%">±50% OTM</option>
                          <option value="100%">±100% OTM</option>
                          </select>
                        </div>
                        
                        {/* REFRESH Button */}
                        <button
                          onClick={() => fetchOptionsData()}
                          disabled={loading}
                          className="flex items-center justify-center px-4 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-black text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all rounded"
                          style={{
                            background: '#000000',
                            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1), inset 0 -1px 3px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.4)',
                            height: '46px'
                          }}
                        >
                          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                      </div>
                      
                      {/* Row 2: All Mode Checkboxes */}
                      <div className="flex items-center gap-2 overflow-x-auto">
                        {/* NORMAL */}
                        <div 
                          className="flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-lg transition-all cursor-pointer"
                          style={{ 
                            height: '46px',
                            backgroundColor: 'transparent'
                          }}
                          onClick={() => {
                            const newValue = !showGEX;
                            setShowGEX(newValue);
                            if (newValue) setGexMode('Net GEX');
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={showGEX}
                            onChange={() => {}}
                            className="w-4 h-4 text-green-500 bg-black border-2 border-gray-600 rounded pointer-events-none"
                          />
                          <span className="text-xs font-black uppercase tracking-wider whitespace-nowrap" style={{ color: showGEX ? '#22c55e' : '#ffffff' }}>
                            NORMAL
                          </span>
                        </div>
                        
                        {/* MM ACTIVITY */}
                        <div 
                          className="flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-lg transition-all cursor-pointer"
                          style={{ 
                            height: '46px',
                            backgroundColor: 'transparent'
                          }}
                          onClick={() => {
                            const newValue = !showDealer;
                            setShowDealer(newValue);
                            if (newValue) setGexMode('Net Dealer');
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={showDealer}
                            onChange={() => {}}
                            className="w-4 h-4 text-purple-500 bg-black border-2 border-gray-600 rounded pointer-events-none"
                          />
                          <span className="text-xs font-black uppercase tracking-wider whitespace-nowrap" style={{ color: showDealer ? '#a855f7' : '#ffffff' }}>
                            DEALER
                          </span>
                        </div>
                        
                        {/* FLOW MAP */}
                        <div 
                          className="flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-lg transition-all cursor-pointer"
                          style={{ 
                            height: '46px',
                            backgroundColor: 'transparent'
                          }}
                          onClick={() => setShowFlowGEX(!showFlowGEX)}
                        >
                          <input
                            type="checkbox"
                            checked={showFlowGEX}
                            onChange={() => {}}
                            className="w-4 h-4 text-orange-500 bg-black border-2 border-gray-600 rounded pointer-events-none"
                          />
                          <span className="text-xs font-black uppercase tracking-wider whitespace-nowrap" style={{ color: showFlowGEX ? '#f97316' : '#ffffff' }}>
                            FLOW MAP
                          </span>
                        </div>
                        
                        {/* VOLATILITY */}
                        <div 
                          className="flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-lg transition-all cursor-pointer"
                          style={{ 
                            height: '46px',
                            backgroundColor: 'transparent'
                          }}
                          onClick={() => {
                            const newValue = !showVEX;
                            setShowVEX(newValue);
                            if (newValue) setVexMode('Net VEX');
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={showVEX}
                            onChange={() => {}}
                            className="w-4 h-4 text-yellow-500 bg-black border-2 border-gray-600 rounded pointer-events-none"
                          />
                          <span className="text-xs font-black uppercase tracking-wider whitespace-nowrap" style={{ color: showVEX ? '#eab308' : '#ffffff' }}>
                            VOLATILITY
                          </span>
                        </div>
                        
                        {/* OPEN INTEREST */}
                        <div 
                          className="flex items-center gap-2 flex-shrink-0 px-4 py-2 rounded-lg transition-all cursor-pointer"
                          style={{ 
                            height: '46px',
                            backgroundColor: 'transparent'
                          }}
                          onClick={() => setShowOI(!showOI)}
                        >
                          <input
                            type="checkbox"
                            checked={showOI}
                            onChange={() => {}}
                            className="w-4 h-4 text-blue-500 bg-black border-2 border-gray-600 rounded pointer-events-none"
                          />
                          <span className="text-xs font-black uppercase tracking-wider whitespace-nowrap" style={{ color: showOI ? '#3b82f6' : '#ffffff' }}>
                            OPEN INTEREST
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Desktop Layout - Original Horizontal */}
                    <div className="hidden md:flex md:items-center md:justify-between w-full">
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
                                className="bg-transparent border-0 outline-none w-20 text-lg font-bold uppercase"
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
                            <div className="flex items-center gap-6">
                              {/* NORMAL (GEX) Checkbox */}
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={showGEX}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setShowGEX(isChecked);
                                    if (isChecked) {
                                      setGexMode('Net GEX');
                                    }
                                  }}
                                  className="w-4 h-4 text-orange-500 bg-black border-2 border-gray-600 rounded focus:ring-orange-500 focus:ring-2"
                                />
                                <span className="text-xs font-bold text-white uppercase tracking-wider">NORMAL</span>
                              </div>
                              
                              {/* MM ACTIVITY (Dealer) Checkbox */}
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={showDealer}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked;
                                    setShowDealer(isChecked);
                                    if (isChecked) {
                                      setGexMode('Net Dealer');
                                    }
                                  }}
                                  className="w-4 h-4 text-orange-500 bg-black border-2 border-gray-600 rounded focus:ring-orange-500 focus:ring-2"
                                />
                                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">DEALER</span>
                              </div>
                              
                              {/* FLOW MAP Checkbox */}
                              <div className="flex items-center gap-2">
                                <input
                                  id="flowgex-checkbox-desktop"
                                  type="checkbox"
                                  checked={showFlowGEX}
                                  onClick={(e) => {
                                    console.log(`🔥 FLOW GEX CHECKBOX CLICKED (desktop) - Current: ${showFlowGEX}, Will be: ${!showFlowGEX}`);
                                  }}
                                  onChange={(e) => {
                                    console.log(`🔥 FLOW GEX CHECKBOX CHANGED (desktop) - New value: ${e.target.checked}`);
                                    setShowFlowGEX(e.target.checked);
                                  }}
                                  className="w-4 h-4 text-orange-500 bg-black border-2 border-gray-600 rounded focus:ring-orange-500 focus:ring-2"
                                />
                                <label htmlFor="flowgex-checkbox-desktop" className="text-xs font-bold text-orange-400 uppercase tracking-wider cursor-pointer">FLOW MAP</label>
                              </div>
                              
                              {/* VOLATILITY (VEX) Checkbox */}
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={showVEX}
                                  onChange={(e) => {
                                    setShowVEX(e.target.checked);
                                    if (e.target.checked) {
                                      setVexMode('Net VEX');
                                    }
                                  }}
                                  className="w-4 h-4 text-purple-500 bg-black border-2 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                                />
                                <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">VOLATILITY</span>
                              </div>
                              
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
                              
                              {/* LIVE Button */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    // Check if ticker is typed in search bar (even without clicking enter)
                                    const currentTicker = tickerInput.trim() || selectedTicker;
                                    if (!currentTicker || currentTicker.trim() === '') {
                                      alert('Please type a ticker in the search bar first before enabling Live OI');
                                      return;
                                    }
                                    
                                    // If ticker is typed but not searched yet, trigger search first
                                    if (tickerInput.trim() && tickerInput.trim() !== selectedTicker) {
                                      const newTicker = tickerInput.trim().toUpperCase();
                                      setSelectedTicker(newTicker);
                                      setTickerInput(newTicker);
                                    }
                                    
                                    if (!liveMode) {
                                      setLiveMode(true);
                                      updateLiveOI();
                                    } else {
                                      console.log('🔴 TURNING OFF LIVE MODE (second button)');
                                      setLiveMode(false);
                                      setLiveOIData(new Map());
                                      
                                      // Restore original base data
                                      setGexByStrikeByExpiration(baseGexByStrikeByExpiration);
                                      setDealerByStrikeByExpiration(baseDealerByStrikeByExpiration);
                                      console.log('✅ Base data restored from backup');
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
                            <span className="text-xs font-bold text-white uppercase tracking-wider">RANGE</span>
                            <div className="relative">
                              <select
                                value={otmFilter}
                                onChange={(e) => setOtmFilter(e.target.value as '1%' | '2%' | '3%' | '5%' | '8%' | '10%' | '15%' | '20%' | '25%' | '40%' | '50%' | '100%')}
                                className="bg-black border-2 border-gray-800 focus:border-orange-500 focus:outline-none px-4 py-2.5 pr-10 text-white text-sm font-bold uppercase appearance-none cursor-pointer min-w-[90px] transition-all"
                              >
                                <option value="1%">±1%</option>
                                <option value="2%">±2%</option>
                                <option value="3%">±3%</option>
                                <option value="5%">±5%</option>
                                <option value="8%">±8%</option>
                                <option value="10%">±10%</option>
                                <option value="15%">±15%</option>
                                <option value="20%">±20%</option>
                                <option value="25%">±25%</option>
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
                        </div>
                      </div>
                      
                      {/* Desktop Refresh Button */}
                      <button
                        onClick={() => fetchOptionsData()}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-900 border-2 border-gray-800 hover:border-orange-500 text-white hover:text-orange-500 font-bold text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        {loading ? 'UPDATING' : 'REFRESH'}
                      </button>
                    </div>
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
                              className="bg-transparent border-0 outline-none w-20 text-lg font-bold uppercase"
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
                        {/* MM, MP, SI, OI/GEX Buttons */}
                        <div className="flex gap-4">
                          <button 
                            onClick={() => setActiveWorkbenchTab('MM')}
                            className={`px-5 py-2.5 font-bold text-sm uppercase tracking-wider transition-all rounded-lg ${
                              activeWorkbenchTab === 'MM' 
                                ? 'bg-blue-600 text-white border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]' 
                                : 'bg-gradient-to-b from-black via-gray-900 to-black text-blue-400 hover:text-white border-2 border-gray-800 hover:border-blue-500 hover:bg-blue-900/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.8)]'
                            }`}
                          >
                            Market Maker
                          </button>
                          <button 
                            onClick={() => setActiveWorkbenchTab('SI')}
                            className={`px-5 py-2.5 font-bold text-sm uppercase tracking-wider transition-all rounded-lg ${
                              activeWorkbenchTab === 'SI' 
                                ? 'bg-purple-600 text-white border-2 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]' 
                                : 'bg-gradient-to-b from-black via-gray-900 to-black text-purple-400 hover:text-white border-2 border-gray-800 hover:border-purple-500 hover:bg-purple-900/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.8)]'
                            }`}
                          >
                            Stability Index
                          </button>
                          <button 
                            onClick={() => setActiveWorkbenchTab('MAXPAIN')}
                            className={`px-5 py-2.5 font-bold text-sm uppercase tracking-wider transition-all rounded-lg ${
                              activeWorkbenchTab === 'MAXPAIN' 
                                ? 'bg-red-600 text-white border-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' 
                                : 'bg-gradient-to-b from-black via-gray-900 to-black text-red-400 hover:text-white border-2 border-gray-800 hover:border-red-500 hover:bg-red-900/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.8)]'
                            }`}
                          >
                            Max Pain
                          </button>
                          <button 
                            onClick={() => setActiveWorkbenchTab('OIGEX')}
                            className={`px-5 py-2.5 font-bold text-sm uppercase tracking-wider transition-all rounded-lg ${
                              activeWorkbenchTab === 'OIGEX' 
                                ? 'bg-orange-600 text-white border-2 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]' 
                                : 'bg-gradient-to-b from-black via-gray-900 to-black text-orange-400 hover:text-white border-2 border-gray-800 hover:border-orange-500 hover:bg-orange-900/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.8)]'
                            }`}
                          >
                            Open Interest and GEX
                          </button>
                          <button 
                            onClick={() => setActiveWorkbenchTab('GEXSCREENER')}
                            className={`px-5 py-2.5 font-bold text-sm uppercase tracking-wider transition-all rounded-lg ${
                              activeWorkbenchTab === 'GEXSCREENER' 
                                ? 'bg-cyan-600 text-white border-2 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.4)]' 
                                : 'bg-gradient-to-b from-black via-gray-900 to-black text-cyan-400 hover:text-white border-2 border-gray-800 hover:border-cyan-500 hover:bg-cyan-900/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.8)]'
                            }`}
                          >
                            GEX Screener
                          </button>
                        </div>
                        
                        <button
                          onClick={() => fetchOptionsData()}
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
          ) : liveOILoading && data.length > 0 ? (
            <div className="relative">
              {/* Show existing data in background with overlay */}
              <div className="opacity-30 pointer-events-none">
                {/* Render existing data here (will be shown dimmed) */}
              </div>
              
              {/* Live OI Recalculation Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50" style={{ marginTop: '80px' }}>
                <div className="text-center py-16 px-8">
                  <RefreshCw size={64} className="animate-spin mx-auto mb-6" style={{ color: '#FFD700' }} />
                  <p className="text-2xl font-bold text-orange-500 mb-2">LIVE MODE ACTIVE</p>
                  <p className="text-xl font-semibold text-white">Recalculating with Live Data</p>
                  <p className="text-sm text-gray-400 mt-2">
                    {liveOIProgress < 20 ? 'Scanning options flow...' :
                     liveOIProgress < 60 ? 'Fetching contract data...' :
                     liveOIProgress < 80 ? 'Enriching trades...' :
                     liveOIProgress < 90 ? 'Calculating Live OI...' :
                     'Recalculating all metrics...'}
                  </p>
                  
                  {/* Live OI Progress Bar */}
                  <div className="mt-6 mx-auto max-w-md">
                    <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden border border-orange-700">
                      <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300 ease-out shadow-lg shadow-orange-500/50"
                        style={{ width: `${liveOIProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-orange-400 mt-2 font-bold">{liveOIProgress}%</p>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'ATTRACTION' ? (
            <>
              {/* Dealer Attraction Legend - Only show when Live OI mode is active */}
              
              {/* Show multiple tables side by side when multiple modes are enabled */}
              {(showGEX && showDealer) || (showGEX && showFlowGEX) || (showDealer && showFlowGEX) || (showGEX && showDealer && showFlowGEX) ? (
                <div className="flex gap-4 overflow-x-auto">
                  {(() => {
                    const activeCount = [showGEX, showDealer, showFlowGEX].filter(Boolean).length;
                    const tableWidth = activeCount === 3 ? 'calc(33.333% - 11px)' : 'calc(50% - 8px)';
                    return (
                      <>
                  {/* NORMAL (Net GEX) Table - conditionally rendered */}
                  {showGEX && (
                    <div key={`normal-${liveMode}-${liveOIData.size}`} className="flex-shrink-0" style={{ width: tableWidth, maxWidth: tableWidth }}>
                      <div className="bg-black border border-gray-700 border-b-0 px-4 py-3">
                        <h3 className="text-lg font-extrabold text-white uppercase tracking-wider text-center" style={{ letterSpacing: '0.15em', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>NORMAL</h3>
                      </div>
                      <div className="bg-gray-900 border border-gray-700 overflow-x-auto table-scroll-container" style={{ maxHeight: 'calc(100vh - 400px)', overflowX: 'auto' }}>
                        <table style={{ minWidth: `${80 + (expirations.length * 90)}px`, width: '100%' }}>
                      <thead className="sticky top-0 z-20 bg-black backdrop-blur-sm" style={{ top: '0', backgroundColor: '#000000' }}>
                        <tr className="border-b border-gray-700 bg-black">
                          <th className="px-3 py-5 text-left sticky left-0 bg-black z-30 border-r border-gray-700 shadow-xl" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                            <div className="text-xs font-bold text-white uppercase">Strike</div>
                          </th>
                          {expirations.map(exp => (
                            <th key={exp} className="text-center bg-black border-l border-r border-gray-800 shadow-lg px-1 py-5" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                              <div className="text-xs font-bold text-white uppercase whitespace-nowrap">
                                {formatDate(exp)}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allCalculatedData.filter(row => {
                          const strikeRange = getStrikeRange(currentPrice);
                          return row.strike >= strikeRange.min && row.strike <= strikeRange.max;
                        }).map((row, idx) => {
                          const closestStrike = currentPrice > 0 ? data.reduce((closest, current) => 
                            Math.abs(current.strike - currentPrice) < Math.abs(closest.strike - currentPrice) ? current : closest
                          ).strike : 0;
                          
                          const isCurrentPriceRow = currentPrice > 0 && row.strike === closestStrike;
                          
                          // Check if this row contains MAGNET (highest positive) or PIVOT (highest negative)
                          let hasMagnetCell = false;
                          let hasPivotCell = false;
                          expirations.forEach(exp => {
                            const gexValue = gexByStrikeByExpiration[exp]?.[row.strike];
                            const displayValue = (gexValue?.call || 0) + (gexValue?.put || 0);
                            if (displayValue > 0 && Math.abs(displayValue - gexTopValues.highestPositive) < 0.01) {
                              hasMagnetCell = true;
                            }
                            if (displayValue < 0 && Math.abs(Math.abs(displayValue) - gexTopValues.highestNegative) < 0.01) {
                              hasPivotCell = true;
                            }
                          });
                          
                          return (
                            <tr 
                              key={idx} 
                              className={`hover:bg-gray-800/20 transition-colors ${
                                isCurrentPriceRow ? 'border-2 border-orange-500' : 'border-b border-gray-800/30'
                              }`}
                            >
                              <td className="px-3 py-4 font-bold sticky left-0 z-10 border-r border-gray-700/30 bg-black" style={{
                                width: '80px',
                                minWidth: '80px',
                                maxWidth: '80px'
                              }}>
                                <div className={`text-base font-mono font-bold ${
                                  hasMagnetCell ? 'text-purple-600' :
                                  hasPivotCell ? 'text-blue-600' :
                                  isCurrentPriceRow ? 'text-orange-500' : 'text-white'
                                }`}>
                                  {row.strike.toFixed(1)}
                                </div>
                              </td>
                              {expirations.map(exp => {
                                // Use allGEXCalculatedData for NORMAL table (Net GEX formula)
                                const calculatedRow = allGEXCalculatedData.find(r => r.strike === row.strike);
                                const gexValue = calculatedRow?.[exp] as any;
                                const displayValue = (gexValue?.call || 0) + (gexValue?.put || 0);
                                const cellStyle = getCellStyle(displayValue, false, row.strike, exp, gexTopValues);
                                
                                // DEBUG: Log first few cells for NORMAL mode
                                if (idx < 2 && expirations.indexOf(exp) < 2) {
                                  console.log(`🔍 NORMAL Cell [${row.strike}, ${exp}]:`, {
                                    displayValue,
                                    callValue: gexValue?.call,
                                    putValue: gexValue?.put,
                                    highest: gexTopValues.highest,
                                    isHighest: Math.abs(displayValue - gexTopValues.highest) < 0.01,
                                    cellStyle,
                                    liveMode,
                                    liveOIDataSize: liveOIData.size
                                  });
                                }
                                
                                return (
                                  <td
                                    key={exp}
                                    className="px-1 py-3"
                                    style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}
                                  >
                                    <div className={`${cellStyle.bg} ${cellStyle.ring} px-1 py-3 rounded-lg text-center font-mono transition-all`}>
                                      {cellStyle.label && <div className="text-xs font-black mb-1 tracking-wider">{cellStyle.label}</div>}
                                      <div className="text-sm font-bold mb-1">{formatCurrency(displayValue)}</div>
                                    </div>
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
                  )}
                  
                  {/* MM ACTIVITY (Net Dealer) Table - conditionally rendered */}
                  {showDealer && (
                    <div key={`dealer-${liveMode}-${liveOIData.size}`} className="flex-shrink-0" style={{ width: tableWidth, maxWidth: tableWidth }}>
                      <div className="bg-black border border-gray-700 border-b-0 px-4 py-3">
                        <h3 className="text-lg font-extrabold text-yellow-400 uppercase tracking-wider text-center" style={{ letterSpacing: '0.15em', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>DEALER</h3>
                      </div>
                      <div className="bg-gray-900 border border-gray-700 overflow-x-auto table-scroll-container" style={{ maxHeight: 'calc(100vh - 400px)', overflowX: 'auto' }}>
                        <table style={{ minWidth: `${80 + (expirations.length * 90)}px`, width: '100%' }}>
                      <thead className="sticky top-0 z-20 bg-black backdrop-blur-sm" style={{ top: '0', backgroundColor: '#000000' }}>
                        <tr className="border-b border-gray-700 bg-black">
                          <th className="px-3 py-5 text-left sticky left-0 bg-black z-30 border-r border-gray-700 shadow-xl" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                            <div className="text-xs font-bold text-white uppercase">Strike</div>
                          </th>
                          {expirations.map(exp => (
                            <th key={exp} className="text-center bg-black border-l border-r border-gray-800 shadow-lg px-1 py-5" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                              <div className="text-xs font-bold text-white uppercase whitespace-nowrap">
                                {formatDate(exp)}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allCalculatedData.filter(row => {
                          const strikeRange = getStrikeRange(currentPrice);
                          return row.strike >= strikeRange.min && row.strike <= strikeRange.max;
                        }).map((row, idx) => {
                          const closestStrike = currentPrice > 0 ? data.reduce((closest, current) => 
                            Math.abs(current.strike - currentPrice) < Math.abs(closest.strike - currentPrice) ? current : closest
                          ).strike : 0;
                          
                          const isCurrentPriceRow = currentPrice > 0 && row.strike === closestStrike;
                          
                          // Check if this row contains MAGNET (highest positive) or PIVOT (highest negative)
                          let hasMagnetCell = false;
                          let hasPivotCell = false;
                          expirations.forEach(exp => {
                            const dealerValue = dealerByStrikeByExpiration[exp]?.[row.strike];
                            const displayValue = (dealerValue?.call || 0) + (dealerValue?.put || 0);
                            if (displayValue > 0 && Math.abs(displayValue - dealerTopValues.highestPositive) < 0.01) {
                              hasMagnetCell = true;
                            }
                            if (displayValue < 0 && Math.abs(Math.abs(displayValue) - dealerTopValues.highestNegative) < 0.01) {
                              hasPivotCell = true;
                            }
                          });
                          
                          return (
                            <tr 
                              key={idx} 
                              className={`hover:bg-gray-800/20 transition-colors ${
                                isCurrentPriceRow ? 'border-2 border-orange-500' : 'border-b border-gray-800/30'
                              }`}
                            >
                              <td className="px-3 py-4 font-bold sticky left-0 z-10 border-r border-gray-700/30 bg-black" style={{
                                width: '80px',
                                minWidth: '80px',
                                maxWidth: '80px'
                              }}>
                                <div className={`text-base font-mono font-bold ${
                                  hasMagnetCell ? 'text-purple-600' :
                                  hasPivotCell ? 'text-blue-600' :
                                  isCurrentPriceRow ? 'text-orange-500' : 'text-white'
                                }`}>
                                  {row.strike.toFixed(1)}
                                </div>
                              </td>
                              {expirations.map(exp => {
                                // Use allDealerCalculatedData for MM ACTIVITY table (Net Dealer formula)
                                const calculatedRow = allDealerCalculatedData.find(r => r.strike === row.strike);
                                const dealerValue = calculatedRow?.[exp] as any;
                                const displayValue = (dealerValue?.call || 0) + (dealerValue?.put || 0);
                                const cellStyle = getCellStyle(displayValue, false, row.strike, exp, dealerTopValues);
                                
                                // DEBUG: Log first few cells
                                if (idx < 2 && expirations.indexOf(exp) < 2) {
                                  console.log(`🔍 MM ACTIVITY Cell [${row.strike}, ${exp}]:`, {
                                    displayValue,
                                    highest: dealerTopValues.highest,
                                    isHighest: displayValue === dealerTopValues.highest,
                                    cellStyle
                                  });
                                }
                                
                                return (
                                  <td
                                    key={exp}
                                    className="px-1 py-3"
                                    style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}
                                  >
                                    <div className={`${cellStyle.bg} ${cellStyle.ring} px-1 py-3 rounded-lg text-center font-mono transition-all`}>
                                      {cellStyle.label && <div className="text-xs font-black mb-1 tracking-wider">{cellStyle.label}</div>}
                                      <div className="text-sm font-bold mb-1">{formatCurrency(displayValue)}</div>
                                    </div>
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
                  )}
                  
                  {/* FLOW MAP Table - conditionally rendered */}
                  {showFlowGEX && (
                    <div key={`flowmap-${liveMode}-${liveOIData.size}`} className="flex-shrink-0" style={{ width: tableWidth, maxWidth: tableWidth }}>
                      <div className="bg-black border border-gray-700 border-b-0 px-4 py-3">
                        <h3 className="text-lg font-extrabold text-orange-400 uppercase tracking-wider text-center" style={{ letterSpacing: '0.15em', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>FLOW MAP</h3>
                      </div>
                      <div className="bg-gray-900 border border-gray-700 overflow-x-auto table-scroll-container" style={{ maxHeight: 'calc(100vh - 400px)', overflowX: 'auto' }}>
                        <table style={{ minWidth: `${80 + (expirations.length * 90)}px`, width: '100%' }}>
                        <thead className="sticky top-0 z-20 bg-black backdrop-blur-sm" style={{ top: '0', backgroundColor: '#000000' }}>
                          <tr className="border-b border-gray-700 bg-black">
                            <th className="px-3 py-5 text-left sticky left-0 bg-black z-30 border-r border-gray-700 shadow-xl" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                              <div className="text-xs font-bold text-white uppercase">Strike</div>
                            </th>
                            {expirations.map(exp => (
                              <th key={exp} className="text-center bg-black border-l border-r border-gray-800 shadow-lg px-1 py-5" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                                <div className="text-xs font-bold text-white uppercase whitespace-nowrap">
                                  {formatDate(exp)}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.filter(row => {
                            const strikeRange = getStrikeRange(currentPrice);
                            return row.strike >= strikeRange.min && row.strike <= strikeRange.max;
                          }).map((row, idx) => {
                            const closestStrike = currentPrice > 0 ? data.reduce((closest, current) => 
                              Math.abs(current.strike - currentPrice) < Math.abs(closest.strike - currentPrice) ? current : closest
                            ).strike : 0;
                            
                            const isCurrentPriceRow = currentPrice > 0 && row.strike === closestStrike;
                            
                            // Check if this row contains MAGNET (highest positive) or PIVOT (highest negative)
                            let hasMagnetCell = false;
                            let hasPivotCell = false;
                            expirations.forEach(exp => {
                              const value = row[exp] as any;
                              const displayValue = value?.flowNet || 0;
                              if (displayValue > 0 && Math.abs(displayValue - flowTopValues.highestPositive) < 0.01) {
                                hasMagnetCell = true;
                              }
                              if (displayValue < 0 && Math.abs(Math.abs(displayValue) - flowTopValues.highestNegative) < 0.01) {
                                hasPivotCell = true;
                              }
                            });
                            
                            return (
                              <tr 
                                key={idx} 
                                className={`hover:bg-gray-800/20 transition-colors ${
                                  isCurrentPriceRow ? 'border-2 border-orange-500' : 'border-b border-gray-800/30'
                                }`}
                              >
                                <td className="px-3 py-4 font-bold sticky left-0 z-10 border-r border-gray-700/30 bg-black" style={{
                                  width: '80px',
                                  minWidth: '80px',
                                  maxWidth: '80px'
                                }}>
                                  <div className={`text-base font-mono font-bold ${
                                    hasMagnetCell ? 'text-purple-600' :
                                    hasPivotCell ? 'text-blue-600' :
                                    isCurrentPriceRow ? 'text-orange-500' : 'text-white'
                                  }`}>
                                    {row.strike.toFixed(1)}
                                  </div>
                                </td>
                                {expirations.map(exp => {
                                  const value = row[exp] as any;
                                  const displayValue = (value?.flowNet || 0);
                                  const cellStyle = getCellStyle(displayValue, false, row.strike, exp, flowTopValues);
                                  
                                  return (
                                    <td
                                      key={exp}
                                      className="px-1 py-3"
                                      style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}
                                    >
                                      <div className={`${cellStyle.bg} ${cellStyle.ring} px-1 py-3 rounded-lg text-center font-mono transition-all`}>
                                        {cellStyle.label && <div className="text-xs font-black mb-1 tracking-wider">{cellStyle.label}</div>}
                                        <div className="text-sm font-bold mb-1">{formatCurrency(displayValue)}</div>
                                      </div>
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
                  )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                /* Original single table when only one mode is active */
                <div className="bg-gray-900 border border-gray-700 overflow-x-auto table-scroll-container" style={{ maxHeight: 'calc(100vh - 400px)', overflowX: 'auto' }}>
                  <table style={{ minWidth: `${80 + (expirations.length * 90)}px`, width: '100%' }}>
                    <thead className="sticky top-0 z-20 bg-black">
                      <tr className="border-b border-gray-700 bg-black">
                        <th className="px-3 py-4 text-left sticky left-0 bg-gradient-to-br from-black via-gray-900 to-black z-30 border-r border-gray-700 shadow-xl" style={{ width: '80px', minWidth: '80px', maxWidth: '80px' }}>
                          <div className="text-xs font-bold text-white uppercase">Strike</div>
                        </th>
                        {expirations.map(exp => (
                          <th key={exp} className="text-center bg-gradient-to-br from-black via-gray-900 to-black border-l border-r border-gray-800 shadow-lg px-1 py-3" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                            <div className="text-xs font-bold text-white uppercase whitespace-nowrap">
                              {formatDate(exp)}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(showFlowGEX ? data : (showGEX || showDealer || showVEX ? allCalculatedData : data)).filter(row => {
                        const strikeRange = getStrikeRange(currentPrice);
                        return row.strike >= strikeRange.min && row.strike <= strikeRange.max;
                      }).map((row, idx) => {
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
                                
                                // For Net modes, check the net value
                                if (gexMode === 'Net GEX' || gexMode === 'Net Dealer') {
                                  const netAbs = Math.abs(value?.net || 0);
                                  return Math.abs(netAbs - topValues.highest) < tolerance;
                                }
                                
                                // For split modes, check call and put separately
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
                        
                        // Check if this row contains MAGNET (highest positive) or PIVOT (highest negative)
                        let hasMagnetCell = false;
                        let hasPivotCell = false;
                        expirations.forEach(exp => {
                          const value = row[exp] as any;
                          let displayValue = 0;
                          
                          if (showFlowGEX) {
                            displayValue = value?.flowNet || 0;
                          } else if (showVEX) {
                            displayValue = (value?.callVex || 0) + (value?.putVex || 0);
                          } else if (showGEX || showDealer) {
                            displayValue = (value?.call || 0) + (value?.put || 0);
                          }
                          
                          // Determine which top values to use for this mode
                          const modeTopValues = showFlowGEX ? flowTopValues : 
                                               showVEX ? vexTopValues : 
                                               showDealer ? dealerTopValues : 
                                               gexTopValues;
                          
                          if (displayValue > 0 && Math.abs(displayValue - modeTopValues.highestPositive) < 0.01) {
                            hasMagnetCell = true;
                          }
                          if (displayValue < 0 && Math.abs(Math.abs(displayValue) - modeTopValues.highestNegative) < 0.01) {
                            hasPivotCell = true;
                          }
                        });
                        
                        return (
                          <tr 
                            key={idx} 
                            className={`hover:bg-gray-800/20 transition-colors ${
                              isCurrentPriceRow ? 'border-2 border-orange-500' : 'border-b border-gray-800/30'
                            }`}
                          >
                            <td className="px-3 py-4 font-bold sticky left-0 z-10 border-r border-gray-700/30 bg-black" style={{
                              width: '80px',
                              minWidth: '80px',
                              maxWidth: '80px'
                            }}>
                              <div className={`text-base font-mono font-bold ${
                                hasMagnetCell ? 'text-purple-600' :
                                hasPivotCell ? 'text-blue-600' :
                                isCurrentPriceRow ? 'text-orange-500' : 'text-white'
                              }`}>
                                {row.strike.toFixed(1)}
                              </div>
                            </td>
                            {expirations.map(exp => {
                              const value = row[exp] as {call: number, put: number, net: number, callOI: number, putOI: number, callPremium?: number, putPremium?: number, callVex?: number, putVex?: number};
                              const callValue = value?.call || 0;
                              const putValue = value?.put || 0;
                              const netValue = value?.net || 0;
                              let callOI = value?.callOI || 0;
                              let putOI = value?.putOI || 0;
                              
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
                              const isAttractionCall = liveMode && (showGEX || showDealer) && absCallValue === tops.highest && absCallValue > 0;
                              const isAttractionPut = liveMode && (showGEX || showDealer) && absPutValue === tops.highest && absPutValue > 0;
                              const isReversalCall = liveMode && (showGEX || showDealer) && (absCallValue === tops.second || absCallValue === tops.third) && absCallValue > 0;
                              const isReversalPut = liveMode && (showGEX || showDealer) && (absPutValue === tops.second || absPutValue === tops.third) && absPutValue > 0;
                              
                              // For Net GEX/Net Dealer mode (single cell with net value)
                              const isAttractionNet = liveMode && (showGEX || showDealer) && (gexMode === 'Net GEX' || gexMode === 'Net Dealer') && absNetValue === tops.highest && absNetValue > 0;
                              const isReversalNet = liveMode && (showGEX || showDealer) && (gexMode === 'Net GEX' || gexMode === 'Net Dealer') && (absNetValue === tops.second || absNetValue === tops.third) && absNetValue > 0;
                              
                              // VEX Action Labels - Determine what to display in VEX cells
                              const getVexActionLabel = (vexValue: number, strike: number): string | null => {
                                return null;
                              };
                              
                              const netVexAction = getVexActionLabel(callVex + putVex, row.strike);
                              const callVexAction = getVexActionLabel(callVex, row.strike);
                              const putVexAction = getVexActionLabel(putVex, row.strike);
                              
                              return (
                                <td
                                  key={exp}
                                  className="px-1 py-3"
                                  style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}
                                >
                                  {/* Always display net value in a single cell */}
                                  {(() => {
                                    // Calculate net value based on active mode
                                    let displayValue = 0;
                                    if (showFlowGEX) {
                                      displayValue = (value as any)?.flowNet || 0;
                                    } else if (showVEX) {
                                      displayValue = callVex + putVex;
                                    } else if (showGEX || showDealer) {
                                      displayValue = callValue + putValue;
                                    }
                                    
                                    // Determine which top values to use for this mode
                                    const modeTopValues = showFlowGEX ? flowTopValues : 
                                                         showVEX ? vexTopValues : 
                                                         showDealer ? dealerTopValues : 
                                                         gexTopValues;
                                    
                                    const cellStyle = getCellStyle(displayValue, showVEX, row.strike, exp, modeTopValues);
                                    return (
                                      <div className={`${cellStyle.bg} ${cellStyle.ring} px-1 py-3 rounded-lg text-center font-mono transition-all hover:scale-105`}>
                                      
                                    {/* Display label if present (MAGNET/PIVOT) */}
                                    {cellStyle.label && <div className="text-xs font-black mb-1 tracking-wider">{cellStyle.label}</div>}
                                      
                                    {/* Display the net value */}
                                    <div className="text-sm font-bold mb-1">{formatCurrency(displayValue)}</div>
                                    
                                    {/* Show VEX action label if applicable */}
                                    {showVEX && netVexAction && (
                                      <div className="text-[9px] font-black tracking-wider text-white/90" style={{ 
                                        textShadow: '0 1px 2px rgba(0,0,0,0.9)'
                                      }}>
                                        {netVexAction}
                                      </div>
                                    )}
                                    
                                    {/* Show OI if enabled */}
                                    {showOI && (
                                      <div className="text-xs text-orange-400 font-bold mt-1">
                                        OI: {formatOI(callOI + putOI)}
                                      </div>
                                    )}
                                  </div>
                                    );
                                  })()}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}


            </>
          ) : activeTab === 'WORKBENCH' ? (
            // WORKBENCH Panel Content
            <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-700 rounded-xl p-8">
              <div className="text-center">
                {/* Render the appropriate workbench component */}
                <div style={{ display: activeWorkbenchTab === 'MM' ? 'block' : 'none' }}>
                  <MMDashboard 
                    selectedTicker={selectedTicker}
                    currentPrice={currentPrice}
                    gexByStrikeByExpiration={gexByStrikeByExpiration}
                    vexByStrikeByExpiration={vexByStrikeByExpiration}
                    expirations={expirations}
                  />
                </div>
                <div style={{ display: activeWorkbenchTab === 'SI' ? 'block' : 'none' }}>
                  <SIDashboard 
                    selectedTicker={selectedTicker}
                    currentPrice={currentPrice}
                    gexByStrikeByExpiration={gexByStrikeByExpiration}
                    vexByStrikeByExpiration={vexByStrikeByExpiration}
                    expirations={expirations}
                  />
                </div>
                <div style={{ display: activeWorkbenchTab === 'MAXPAIN' ? 'block' : 'none' }}>
                  <MaxPainDashboard 
                    selectedTicker={selectedTicker}
                    currentPrice={currentPrice}
                    gexByStrikeByExpiration={gexByStrikeByExpiration}
                    vexByStrikeByExpiration={vexByStrikeByExpiration}
                    expirations={expirations}
                  />
                </div>
                <div className="space-y-0" style={{ display: activeWorkbenchTab === 'OIGEX' ? 'block' : 'none' }}>
                  <OpenInterestChart selectedTicker={selectedTicker} hideTickerInput={true} compactMode={true} />
                </div>
                <div style={{ display: activeWorkbenchTab === 'GEXSCREENER' ? 'block' : 'none' }}>
                  <GEXScreener compactMode={true} />
                </div>
                

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
