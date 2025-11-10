'use client';

import React, { useState, useEffect } from 'react';

interface LiquidationData {
  ticker: string;
  mli: number; // Macro Liquidation Index
  structureScore: number;
  volInefficiencyScore: number;
  volDivergenceScore: number;
  relWeaknessScore: number;
  corrShift: number;
  momentumScore: number;
  currentPrice: number;
  priceChange20d: number;
  volumeRatio: number;
  interpretation: string;
}

const TOP_1000_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM', 'JNJ',
  'V', 'WMT', 'PG', 'MA', 'HD', 'UNH', 'DIS', 'BAC', 'ADBE', 'CRM',
  'NFLX', 'XOM', 'CVX', 'KO', 'PEP', 'ABBV', 'COST', 'TMO', 'MRK', 'ACN',
  // Add more tickers as needed - this is a sample
];

const LiquidationScreener: React.FC = () => {
  const [liquidationData, setLiquidationData] = useState<LiquidationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'mli' | 'structure' | 'volume'>('mli');
  const [filterThreshold, setFilterThreshold] = useState(0.6);
  const [scanning, setScanning] = useState(false);

  const calculateATR = (prices: number[], highs: number[], lows: number[], period: number = 20): number => {
    if (prices.length < period + 1) return 0;
    
    let atrSum = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - prices[i - 1]),
        Math.abs(lows[i] - prices[i - 1])
      );
      atrSum += tr;
    }
    return atrSum / period;
  };

  const calculateSMA = (values: number[], period: number): number => {
    if (values.length < period) return 0;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const scanTicker = async (ticker: string): Promise<LiquidationData | null> => {
    try {
      // Fetch 90 days of data
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const response = await fetch(`/api/historical-data?symbol=${ticker}&startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) return null;
      
      const result = await response.json();
      if (!result?.results || result.results.length < 60) return null;
      
      const data = result.results;
      const prices = data.map((d: any) => d.c);
      const volumes = data.map((d: any) => d.v);
      const highs = data.map((d: any) => d.h);
      const lows = data.map((d: any) => d.l);
      
      const currentPrice = prices[prices.length - 1];
      const price20d = prices[prices.length - 21];
      const price60d = prices[prices.length - 61];
      
      // COMPONENT 1: STRUCTURE BREAKDOWN
      const range3M = {
        high: Math.max(...prices.slice(-60)),
        low: Math.min(...prices.slice(-60))
      };
      const atr20 = calculateATR(prices, highs, lows, 20);
      const structureBreak = currentPrice < range3M.low && currentPrice < price20d ? 1 : 0;
      const structureScore = structureBreak ? (range3M.low - currentPrice) / Math.max(atr20, 0.01) : 0;
      
      // COMPONENT 2: VOLUME INEFFICIENCY
      const volSMA10 = calculateSMA(volumes, 10);
      const volSMA50 = calculateSMA(volumes, 50);
      const volRatio = volSMA10 / Math.max(volSMA50, 1);
      const priceChange = Math.abs(currentPrice - price20d) / price20d;
      const efficiency = priceChange / Math.max(volRatio, 0.1);
      const volInefficiencyScore = Math.min(5, volRatio / Math.max(efficiency, 0.001));
      
      // COMPONENT 3: VOLATILITY DIVERGENCE (simplified - using realized vol only)
      const returns20 = [];
      for (let i = prices.length - 20; i < prices.length; i++) {
        returns20.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      const rv20 = Math.sqrt(returns20.reduce((sum, r) => sum + r * r, 0) / 20) * Math.sqrt(252);
      
      const returns60 = [];
      for (let i = prices.length - 60; i < prices.length - 40; i++) {
        returns60.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      const rv60 = Math.sqrt(returns60.reduce((sum, r) => sum + r * r, 0) / 20) * Math.sqrt(252);
      
      const volExpansion = rv20 / Math.max(rv60, 0.01);
      const volDivergenceScore = volExpansion > 1.4 ? volExpansion : 0;
      
      // COMPONENT 4: RELATIVE WEAKNESS (vs simple market proxy)
      const perfStock = (currentPrice / price20d) - 1;
      const relWeaknessScore = perfStock < -0.05 ? Math.abs(perfStock) * 10 : 0;
      
      // COMPONENT 5: CORRELATION SHIFT (simplified)
      const corrShift = volExpansion > 1.5 ? 0.3 : 0.1;
      
      // COMPONENT 6: MOMENTUM DECAY
      const ema20 = calculateSMA(prices.slice(-20), 20);
      const ema40 = calculateSMA(prices.slice(-40, -20), 20);
      const momentumSlope = (ema20 - ema40) / Math.max(atr20, 0.01);
      const range20 = Math.max(...prices.slice(-20)) - Math.min(...prices.slice(-20));
      const range5 = Math.max(...prices.slice(-5)) - Math.min(...prices.slice(-5));
      const rangeExpansion = range5 / Math.max(range20, 0.01);
      const momentumScore = momentumSlope < 0 ? rangeExpansion * Math.abs(momentumSlope) : 0;
      
      // NORMALIZE SCORES (0-1 scale)
      const normalize = (score: number, max: number) => Math.min(1, score / max);
      
      // COMPOSITE MLI
      const mli = (
        0.25 * normalize(structureScore, 3) +
        0.25 * normalize(volInefficiencyScore, 5) +
        0.20 * normalize(volDivergenceScore, 2) +
        0.15 * normalize(relWeaknessScore, 2) +
        0.10 * normalize(corrShift, 0.5) +
        0.05 * normalize(momentumScore, 2)
      );
      
      let interpretation = 'Normal';
      if (mli > 0.8) interpretation = 'Institutional Capitulation';
      else if (mli > 0.6) interpretation = 'Controlled Liquidation';
      else if (mli > 0.4) interpretation = 'Distribution Phase';
      
      return {
        ticker,
        mli,
        structureScore: normalize(structureScore, 3),
        volInefficiencyScore: normalize(volInefficiencyScore, 5),
        volDivergenceScore: normalize(volDivergenceScore, 2),
        relWeaknessScore: normalize(relWeaknessScore, 2),
        corrShift: normalize(corrShift, 0.5),
        momentumScore: normalize(momentumScore, 2),
        currentPrice,
        priceChange20d: ((currentPrice - price20d) / price20d) * 100,
        volumeRatio: volRatio,
        interpretation
      };
    } catch (error) {
      return null;
    }
  };

  const runScan = async () => {
    setScanning(true);
    setLoading(true);
    setLiquidationData([]);
    
    try {
      // Scan in parallel batches of 20 to avoid overwhelming API
      const batchSize = 20;
      const results: LiquidationData[] = [];
      
      for (let i = 0; i < TOP_1000_TICKERS.length; i += batchSize) {
        const batch = TOP_1000_TICKERS.slice(i, i + batchSize);
        const batchPromises = batch.map(ticker => scanTicker(ticker));
        const batchResults = await Promise.all(batchPromises);
        
        const validResults = batchResults.filter((r): r is LiquidationData => 
          r !== null && r.mli >= filterThreshold
        );
        
        results.push(...validResults);
        setLiquidationData([...results]);
      }
      
      console.log(`✅ Scan complete: ${results.length} tickers meet liquidation criteria (MLI >= ${filterThreshold})`);
    } catch (error) {
      console.error('Scan error:', error);
    } finally {
      setLoading(false);
      setScanning(false);
    }
  };

  const sortedData = [...liquidationData].sort((a, b) => {
    switch (sortBy) {
      case 'mli':
        return b.mli - a.mli;
      case 'structure':
        return b.structureScore - a.structureScore;
      case 'volume':
        return b.volInefficiencyScore - a.volInefficiencyScore;
      default:
        return b.mli - a.mli;
    }
  });

  return (
    <div style={{
      background: '#000000',
      border: '1px solid #ff9900',
      borderRadius: '0px',
      padding: '20px',
      marginTop: '20px'
    }}>
      {/* Header */}
      <div style={{
        borderBottom: '2px solid #ff9900',
        paddingBottom: '15px',
        marginBottom: '20px'
      }}>
        <h2 style={{
          margin: 0,
          color: '#ff9900',
          fontSize: '18px',
          fontWeight: 'bold',
          fontFamily: '"Roboto Mono", monospace',
          letterSpacing: '2px'
        }}>
          LIQUIDATION SCREENER
        </h2>
        <p style={{
          margin: '10px 0 0 0',
          color: '#888',
          fontSize: '11px',
          fontFamily: '"Roboto Mono", monospace'
        }}>
          Institutional-grade macro liquidation detection | Multi-week deleveraging phases
        </p>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex',
        gap: '20px',
        marginBottom: '20px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={runScan}
          disabled={scanning}
          style={{
            padding: '10px 20px',
            background: scanning ? '#333' : '#ff9900',
            color: '#000',
            border: 'none',
            borderRadius: '3px',
            fontSize: '12px',
            fontWeight: 'bold',
            fontFamily: '"Roboto Mono", monospace',
            cursor: scanning ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {scanning ? 'SCANNING...' : 'RUN SCAN'}
        </button>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ color: '#ff9900', fontSize: '11px', fontWeight: 'bold' }}>
            MLI THRESHOLD:
          </label>
          <select
            value={filterThreshold}
            onChange={(e) => setFilterThreshold(parseFloat(e.target.value))}
            style={{
              padding: '8px',
              background: '#1a1a1a',
              color: '#fff',
              border: '1px solid #ff9900',
              borderRadius: '3px',
              fontSize: '11px',
              fontFamily: '"Roboto Mono", monospace'
            }}
          >
            <option value="0.4">0.4 - Distribution Phase</option>
            <option value="0.6">0.6 - Controlled Liquidation</option>
            <option value="0.8">0.8 - Institutional Capitulation</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ color: '#ff9900', fontSize: '11px', fontWeight: 'bold' }}>
            SORT BY:
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              padding: '8px',
              background: '#1a1a1a',
              color: '#fff',
              border: '1px solid #ff9900',
              borderRadius: '3px',
              fontSize: '11px',
              fontFamily: '"Roboto Mono", monospace'
            }}
          >
            <option value="mli">MLI Score</option>
            <option value="structure">Structure Break</option>
            <option value="volume">Volume Inefficiency</option>
          </select>
        </div>

        <div style={{ color: '#00ff88', fontSize: '11px', fontWeight: 'bold', marginLeft: 'auto' }}>
          RESULTS: {liquidationData.length}
        </div>
      </div>

      {/* Results Table */}
      {loading && liquidationData.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#ff9900',
          fontSize: '14px'
        }}>
          <div style={{ marginBottom: '10px' }}>⏳ SCANNING TOP 1000 TICKERS...</div>
          <div style={{ color: '#888', fontSize: '11px' }}>
            This may take a few minutes
          </div>
        </div>
      ) : liquidationData.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#888',
          fontSize: '12px'
        }}>
          Click "RUN SCAN" to detect liquidation signals
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          maxHeight: '600px',
          overflowY: 'auto'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '11px',
            fontFamily: '"Roboto Mono", monospace'
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ff9900', background: '#0a0a0a' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>TICKER</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>MLI</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>STRUCTURE</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>VOL INEFF</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>VOL DIV</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>REL WEAK</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>PRICE</th>
                <th style={{ padding: '12px', textAlign: 'right', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>20D CHG</th>
                <th style={{ padding: '12px', textAlign: 'left', color: '#ff9900', position: 'sticky', top: 0, background: '#0a0a0a' }}>INTERPRETATION</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((item, index) => {
                const mliColor = item.mli > 0.8 ? '#ff3333' : item.mli > 0.6 ? '#ff9900' : '#ffaa00';
                const priceColor = item.priceChange20d >= 0 ? '#00ff88' : '#ff3333';
                
                return (
                  <tr 
                    key={item.ticker}
                    style={{
                      borderBottom: '1px solid #333',
                      background: index % 2 === 0 ? '#000' : '#0a0a0a',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#1a1a1a'}
                    onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? '#000' : '#0a0a0a'}
                  >
                    <td style={{ padding: '12px', color: '#00ff88', fontWeight: 'bold' }}>{item.ticker}</td>
                    <td style={{ padding: '12px', textAlign: 'right', color: mliColor, fontWeight: 'bold' }}>
                      {item.mli.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>
                      {item.structureScore.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>
                      {item.volInefficiencyScore.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>
                      {item.volDivergenceScore.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>
                      {item.relWeaknessScore.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#fff' }}>
                      ${item.currentPrice.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: priceColor, fontWeight: 'bold' }}>
                      {item.priceChange20d >= 0 ? '+' : ''}{item.priceChange20d.toFixed(2)}%
                    </td>
                    <td style={{ padding: '12px', color: mliColor }}>
                      {item.interpretation}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {liquidationData.length > 0 && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          background: '#0a0a0a',
          border: '1px solid #333',
          borderRadius: '3px'
        }}>
          <div style={{ color: '#ff9900', fontSize: '11px', fontWeight: 'bold', marginBottom: '10px' }}>
            MLI INTERPRETATION
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '10px' }}>
            <div><span style={{ color: '#ffaa00' }}>0.4-0.6:</span> <span style={{ color: '#888' }}>Distribution Phase Beginning</span></div>
            <div><span style={{ color: '#ff9900' }}>0.6-0.8:</span> <span style={{ color: '#888' }}>Controlled Liquidation</span></div>
            <div><span style={{ color: '#ff3333' }}>&gt;0.8:</span> <span style={{ color: '#888' }}>Institutional Capitulation</span></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiquidationScreener;
