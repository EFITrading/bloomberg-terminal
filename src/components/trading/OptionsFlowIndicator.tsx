'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface OptionsContract {
  ticker: string;
  strike_price: number;
  expiration_date: string;
  contract_type: 'call' | 'put';
}

interface OptionsSnapshot {
  details: {
    strike_price: number;
    contract_type: 'call' | 'put';
    expiration_date: string;
  };
  open_interest: number;
  day: {
    volume: number;
  };
  implied_volatility: number;
}

interface StrikeAnalysis {
  strike: number;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
  callGamma: number;
  putGamma: number;
  netGamma: number;
  dealerGamma: number;
}

interface GammaZone {
  strike: number;
  totalGamma: number;
  type: 'positive' | 'negative';
}

interface RebalanceZone {
  strike: number;
  intensity: number;
  direction: 'hedgeBuy' | 'hedgeSell';
}

interface TradingSignal {
  type: 'BOUNCE' | 'REVERSAL' | 'VOLATILITY' | 'REBALANCE';
  level: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  direction?: 'hedgeBuy' | 'hedgeSell';
}

interface OptionsFlowAnalysis {
  currentPrice: number;
  putWall: number | null;
  callWall: number | null;
  gexFlip: number | null;
  gammaZones: GammaZone[];
  rebalanceZones: RebalanceZone[];
  strikes: StrikeAnalysis[];
}

interface ChartRef {
  drawHorizontalLine?: (params: {
    y: number;
    color: string;
    lineWidth: number;
    lineStyle: string;
    label: string;
    labelPosition: string;
    group: string;
  }) => void;
  drawRectangle?: (params: {
    y1: number;
    y2: number;
    fillColor: string;
    opacity: number;
    label: string;
    group: string;
  }) => void;
  drawZone?: (params: {
    y1: number;
    y2: number;
    fillColor: string;
    opacity: number;
    borderColor: string;
    borderWidth: number;
    label: string;
    group: string;
  }) => void;
  drawTextBox?: (params: {
    x: number;
    y: number;
    text: string;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    padding: number;
    group: string;
  }) => void;
  clearDrawings?: (group: string) => void;
}

interface OptionsFlowIndicatorProps {
  ticker?: string;
  onLevelsUpdate?: (levels: OptionsFlowAnalysis) => void;
  chartRef?: React.RefObject<ChartRef>;
}

class OptionsFlowAnalyzer {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = POLYGON_BASE_URL;
  }

  async getOptionsChain(ticker: string, date: string | null = null): Promise<OptionsContract[]> {
    const expDate = date || this.getNextFriday();
    try {
      const response = await axios.get(
        `${this.baseUrl}/v3/reference/options/contracts`,
        {
          params: {
            underlying_ticker: ticker,
            expiration_date: expDate,
            limit: 1000,
            apiKey: this.apiKey
          }
        }
      );
      return response.data.results || [];
    } catch (error) {
      console.error('Error fetching options chain:', error);
      return [];
    }
  }

  async getOptionsSnapshot(optionTicker: string): Promise<OptionsSnapshot | null> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v3/snapshot/options/contract/${optionTicker}`,
        { params: { apiKey: this.apiKey } }
      );
      return response.data.results;
    } catch (error) {
      console.error(`Error fetching snapshot for ${optionTicker}:`, error);
      return null;
    }
  }

  async getStockPrice(ticker: string): Promise<number> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v2/aggs/ticker/${ticker}/prev`,
        { params: { apiKey: this.apiKey } }
      );
      return response.data.results[0]?.c || 0;
    } catch (error) {
      console.error('Error fetching stock price:', error);
      return 0;
    }
  }

  getNextFriday(): string {
    const d = new Date();
    const dayOfWeek = d.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return d.toISOString().split('T')[0];
  }

  calculateGamma(option: { strike_price: number; expiration_date: string }, spotPrice: number, iv: number): number {
    const S = spotPrice;
    const K = option.strike_price;
    const T = this.getTimeToExpiry(option.expiration_date);
    const r = 0.05; // Risk-free rate
    const sigma = iv || 0.25;
    
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const gamma = Math.exp(-d1 * d1 / 2) / (S * sigma * Math.sqrt(2 * Math.PI * T));
    
    return gamma * 100; // Multiply by 100 for shares per contract
  }

  getTimeToExpiry(expirationDate: string): number {
    const exp = new Date(expirationDate);
    const now = new Date();
    return Math.max((exp.getTime() - now.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001);
  }

  async analyzeOptionsFlow(ticker: string): Promise<OptionsFlowAnalysis | null> {
    const [stockPrice, optionsChain] = await Promise.all([
      this.getStockPrice(ticker),
      this.getOptionsChain(ticker)
    ]);

    if (!stockPrice || optionsChain.length === 0) {
      return null;
    }

    // Get snapshots for all options
    const optionSnapshots = await Promise.all(
      optionsChain.slice(0, 100).map(opt => this.getOptionsSnapshot(opt.ticker))
    );

    const validSnapshots = optionSnapshots.filter((s): s is OptionsSnapshot => s !== null);
    
    // Calculate metrics for each strike
    const strikeAnalysis: { [key: number]: StrikeAnalysis } = {};
    
    validSnapshots.forEach(snapshot => {
      const strike = snapshot.details.strike_price;
      const isCall = snapshot.details.contract_type === 'call';
      
      if (!strikeAnalysis[strike]) {
        strikeAnalysis[strike] = {
          strike,
          callOI: 0,
          putOI: 0,
          callVolume: 0,
          putVolume: 0,
          callGamma: 0,
          putGamma: 0,
          netGamma: 0,
          dealerGamma: 0
        };
      }
      
      const oi = snapshot.open_interest || 0;
      const volume = snapshot.day.volume || 0;
      const iv = snapshot.implied_volatility || 0.25;
      
      if (isCall) {
        strikeAnalysis[strike].callOI += oi;
        strikeAnalysis[strike].callVolume += volume;
        const gamma = this.calculateGamma(snapshot.details, stockPrice, iv) * oi;
        strikeAnalysis[strike].callGamma += gamma;
        strikeAnalysis[strike].dealerGamma -= gamma; // Dealers are short calls
      } else {
        strikeAnalysis[strike].putOI += oi;
        strikeAnalysis[strike].putVolume += volume;
        const gamma = this.calculateGamma(snapshot.details, stockPrice, iv) * oi;
        strikeAnalysis[strike].putGamma += gamma;
        strikeAnalysis[strike].dealerGamma += gamma; // Dealers are long puts
      }
      
      strikeAnalysis[strike].netGamma = strikeAnalysis[strike].callGamma - strikeAnalysis[strike].putGamma;
    });

    return this.identifyKeyLevels(strikeAnalysis, stockPrice);
  }

  identifyKeyLevels(strikeAnalysis: { [key: number]: StrikeAnalysis }, currentPrice: number): OptionsFlowAnalysis {
    const strikes = Object.values(strikeAnalysis).sort((a, b) => a.strike - b.strike);
    
    // Find put and call walls
    const putWall = strikes
      .filter(s => s.strike < currentPrice)
      .reduce((max, s) => (s.putOI > (max?.putOI || 0) ? s : max), null as StrikeAnalysis | null);
    
    const callWall = strikes
      .filter(s => s.strike > currentPrice)
      .reduce((max, s) => (s.callOI > (max?.callOI || 0) ? s : max), null as StrikeAnalysis | null);
    
    // Find GEX flip level (where dealer gamma changes sign)
    let gexFlip: number | null = null;
    for (let i = 1; i < strikes.length; i++) {
      if (strikes[i-1].dealerGamma < 0 && strikes[i].dealerGamma > 0) {
        gexFlip = (strikes[i-1].strike + strikes[i].strike) / 2;
        break;
      }
    }
    
    // Identify high gamma zones
    const gammaZones: GammaZone[] = strikes
      .map(s => ({
        strike: s.strike,
        totalGamma: Math.abs(s.dealerGamma),
        type: (s.dealerGamma > 0 ? 'positive' : 'negative') as 'positive' | 'negative'
      }))
      .sort((a, b) => b.totalGamma - a.totalGamma)
      .slice(0, 5);
    
    // Identify rebalancing zones
    const avgGamma = strikes.reduce((sum, x) => sum + Math.abs(x.dealerGamma), 0) / strikes.length;
    const rebalanceZones: RebalanceZone[] = strikes
      .filter(s => Math.abs(s.dealerGamma) > avgGamma * 2)
      .map(s => ({
        strike: s.strike,
        intensity: Math.abs(s.dealerGamma),
        direction: s.dealerGamma > 0 ? 'hedgeBuy' : 'hedgeSell'
      }));
    
    return {
      currentPrice,
      putWall: putWall?.strike || null,
      callWall: callWall?.strike || null,
      gexFlip,
      gammaZones,
      rebalanceZones,
      strikes
    };
  }
}

const OptionsFlowIndicator: React.FC<OptionsFlowIndicatorProps> = ({ 
  ticker = 'SPY', 
  onLevelsUpdate, 
  chartRef 
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [levels, setLevels] = useState<OptionsFlowAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analyzerRef = useRef<OptionsFlowAnalyzer | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    analyzerRef.current = new OptionsFlowAnalyzer(POLYGON_API_KEY);
  }, []);

  const drawLevelsOnChart = useCallback((levelsData: OptionsFlowAnalysis) => {
    console.log('🚀 ADMIN BUTTON: drawLevelsOnChart called with data:', levelsData);
    console.log('🚀 ADMIN BUTTON: chartRef.current exists:', !!chartRef?.current);
    
    if (!chartRef?.current || !levelsData) {
      console.log('❌ ADMIN BUTTON: Missing chartRef or levelsData');
      return;
    }
    
    const chart = chartRef.current;
    
    // Clear existing drawings
    if (chart.clearDrawings) {
      chart.clearDrawings('optionsFlow');
      console.log('🧹 ADMIN BUTTON: Cleared existing drawings');
    }
    
    // FORCE DRAW TEST LINES REGARDLESS OF DATA
    console.log('🎯 ADMIN BUTTON: Drawing test horizontal lines...');
    
    // Test line 1: Current SPY price area
    if (chart.drawHorizontalLine) {
      chart.drawHorizontalLine({
        y: 563.68, // Current SPY price from your screenshot
        color: '#ff0000',
        lineWidth: 4,
        lineStyle: 'solid',
        label: 'TEST LINE 1',
        labelPosition: 'right',
        group: 'optionsFlow'
      });
      console.log('✅ ADMIN BUTTON: Drew test line 1 at 563.68');
    }
    
    // Test line 2: Above current price
    if (chart.drawHorizontalLine) {
      chart.drawHorizontalLine({
        y: 570.00,
        color: '#00ff00',
        lineWidth: 4,
        lineStyle: 'dashed',
        label: 'TEST LINE 2',
        labelPosition: 'right',
        group: 'optionsFlow'
      });
      console.log('✅ ADMIN BUTTON: Drew test line 2 at 570.00');
    }
    
    // Test line 3: Below current price
    if (chart.drawHorizontalLine) {
      chart.drawHorizontalLine({
        y: 555.00,
        color: '#ffff00',
        lineWidth: 4,
        lineStyle: 'solid',
        label: 'TEST LINE 3',
        labelPosition: 'right',
        group: 'optionsFlow'
      });
      console.log('✅ ADMIN BUTTON: Drew test line 3 at 555.00');
    }
    
    // Draw put wall (green support) - if data exists
    if (levelsData.putWall && chart.drawHorizontalLine) {
      console.log('🎯 ADMIN BUTTON: Drawing PUT WALL at', levelsData.putWall);
      chart.drawHorizontalLine({
        y: levelsData.putWall,
        color: '#00ff00',
        lineWidth: 3,
        lineStyle: 'solid',
        label: `PUT WALL ${levelsData.putWall.toFixed(2)}`,
        labelPosition: 'right',
        group: 'optionsFlow'
      });
    }
    
    // Draw call wall (red resistance)
    if (levelsData.callWall && chart.drawHorizontalLine) {
      chart.drawHorizontalLine({
        y: levelsData.callWall,
        color: '#ff0000',
        lineWidth: 3,
        lineStyle: 'solid',
        label: `CALL WALL ${levelsData.callWall.toFixed(2)}`,
        labelPosition: 'right',
        group: 'optionsFlow'
      });
    }
    
    // Draw GEX flip level (yellow critical level)
    if (levelsData.gexFlip && chart.drawHorizontalLine) {
      chart.drawHorizontalLine({
        y: levelsData.gexFlip,
        color: '#ffff00',
        lineWidth: 2,
        lineStyle: 'dashed',
        label: `GEX FLIP ${levelsData.gexFlip.toFixed(2)}`,
        labelPosition: 'right',
        group: 'optionsFlow'
      });
    }
    
    // Draw gamma zones
    levelsData.gammaZones.forEach((zone, idx) => {
      const color = zone.type === 'positive' ? '#00ffff' : '#ff00ff';
      const opacity = 0.3 - (idx * 0.05);
      
      if (chart.drawRectangle) {
        chart.drawRectangle({
          y1: zone.strike - 0.5,
          y2: zone.strike + 0.5,
          fillColor: color,
          opacity: opacity,
          label: `${zone.type.toUpperCase()} Γ`,
          group: 'optionsFlow'
        });
      }
    });
    
    // Draw rebalancing zones
    levelsData.rebalanceZones.forEach(zone => {
      const color = zone.direction === 'hedgeBuy' ? '#90ee90' : '#ffb6c1';
      
      if (chart.drawZone) {
        chart.drawZone({
          y1: zone.strike - 0.25,
          y2: zone.strike + 0.25,
          fillColor: color,
          opacity: 0.4,
          borderColor: color,
          borderWidth: 1,
          label: `REBAL ${zone.direction === 'hedgeBuy' ? '↑' : '↓'}`,
          group: 'optionsFlow'
        });
      }
    });
    
    // Add info panel
    const infoText = `Current: ${levelsData.currentPrice.toFixed(2)}
Put Wall: ${levelsData.putWall?.toFixed(2) || 'N/A'}
Call Wall: ${levelsData.callWall?.toFixed(2) || 'N/A'}
GEX Flip: ${levelsData.gexFlip?.toFixed(2) || 'N/A'}`;
    
    if (chart.drawTextBox) {
      chart.drawTextBox({
        x: 10,
        y: 10,
        text: infoText,
        backgroundColor: 'rgba(0,0,0,0.8)',
        textColor: '#ffffff',
        fontSize: 12,
        padding: 10,
        group: 'optionsFlow'
      });
    }
  }, [chartRef]);

  const analyzeLevels = useCallback(async () => {
    if (!analyzerRef.current || !isActive) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const analysis = await analyzerRef.current.analyzeOptionsFlow(ticker);
      
      if (analysis) {
        setLevels(analysis);
        drawLevelsOnChart(analysis);
        
        if (onLevelsUpdate) {
          onLevelsUpdate(analysis);
        }
        
        // Generate trading signals
        const signals = generateTradingSignals(analysis);
        console.log('Trading Signals:', signals);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [ticker, isActive, drawLevelsOnChart, onLevelsUpdate]);

  const generateTradingSignals = (analysis: OptionsFlowAnalysis): TradingSignal[] => {
    const signals: TradingSignal[] = [];
    const price = analysis.currentPrice;
    
    // Put wall support signal
    if (analysis.putWall && price <= analysis.putWall * 1.01) {
      signals.push({
        type: 'BOUNCE',
        level: analysis.putWall,
        confidence: 'HIGH',
        reason: 'Approaching major put wall support'
      });
    }
    
    // Call wall resistance signal
    if (analysis.callWall && price >= analysis.callWall * 0.99) {
      signals.push({
        type: 'REVERSAL',
        level: analysis.callWall,
        confidence: 'HIGH',
        reason: 'Approaching major call wall resistance'
      });
    }
    
    // GEX flip signal
    if (analysis.gexFlip) {
      const distance = Math.abs(price - analysis.gexFlip) / price;
      if (distance < 0.005) {
        signals.push({
          type: 'VOLATILITY',
          level: analysis.gexFlip,
          confidence: 'MEDIUM',
          reason: 'Near GEX flip - expect volatility change'
        });
      }
    }
    
    // Rebalancing signals
    analysis.rebalanceZones.forEach(zone => {
      if (Math.abs(price - zone.strike) < 1) {
        signals.push({
          type: 'REBALANCE',
          level: zone.strike,
          direction: zone.direction,
          confidence: 'MEDIUM',
          reason: `Dealer ${zone.direction === 'hedgeBuy' ? 'buying' : 'selling'} expected`
        });
      }
    });
    
    return signals;
  };

  const toggleIndicator = useCallback(() => {
    setIsActive(prev => !prev);
    
    if (!isActive) {
      // Start analysis
      analyzeLevels();
      // Set up auto-refresh every 30 seconds
      intervalRef.current = setInterval(analyzeLevels, 30000);
    } else {
      // Stop analysis
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Clear chart drawings
      if (chartRef?.current?.clearDrawings) {
        chartRef.current.clearDrawings('optionsFlow');
      }
      setLevels(null);
    }
  }, [isActive, analyzeLevels, chartRef]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return (
    <div className="options-flow-indicator">
      <button
        onClick={toggleIndicator}
        className={`admin-button ${isActive ? 'active' : ''}`}
        disabled={isLoading}
        style={{
          padding: '12px 20px',
          borderRadius: '10px',
          background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%)',
          border: '2px solid transparent',
          backgroundImage: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%), linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
          backgroundOrigin: 'border-box',
          backgroundClip: 'padding-box, border-box',
          color: isActive ? '#4CAF50' : '#FFD700',
          fontWeight: '800',
          fontSize: '13px',
          letterSpacing: '1.2px',
          textShadow: `
            0 0 5px rgba(255, 215, 0, 0.8),
            0 2px 4px rgba(0, 0, 0, 0.9),
            0 0 10px rgba(255, 215, 0, 0.4),
            2px 2px 0px rgba(0, 0, 0, 0.8)
          `,
          boxShadow: `
            inset 0 3px 6px rgba(0, 0, 0, 0.4),
            inset 0 -3px 6px rgba(255, 215, 0, 0.1),
            0 6px 20px rgba(0, 0, 0, 0.6),
            0 2px 8px rgba(255, 215, 0, 0.2),
            0 0 25px rgba(255, 215, 0, 0.1)
          `,
          cursor: isLoading ? 'wait' : 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative'
        }}
      >
        {isLoading ? 'Analyzing...' : isActive ? 'ACTIVE' : 'ADMIN'}
      </button>
      
      {error && (
        <div style={{ 
          color: 'red', 
          marginTop: '10px',
          fontSize: '12px',
          position: 'absolute',
          top: '100%',
          left: '0',
          zIndex: 1000,
          background: 'rgba(0,0,0,0.8)',
          padding: '5px',
          borderRadius: '4px'
        }}>
          Error: {error}
        </div>
      )}
      
      {levels && isActive && (
        <div className="levels-display" style={{
          position: 'absolute',
          top: '100%',
          left: '0',
          marginTop: '10px',
          padding: '15px',
          backgroundColor: 'rgba(0,0,0,0.9)',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#ffffff',
          lineHeight: '1.6',
          minWidth: '250px',
          zIndex: 1000,
          border: '1px solid rgba(255, 215, 0, 0.3)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.6)'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#FFD700' }}>Key Levels Analysis</h3>
          <div>
            <strong>Put Wall (Support):</strong> {levels.putWall?.toFixed(2) || 'N/A'}
          </div>
          <div>
            <strong>Call Wall (Resistance):</strong> {levels.callWall?.toFixed(2) || 'N/A'}
          </div>
          <div>
            <strong>GEX Flip Level:</strong> {levels.gexFlip?.toFixed(2) || 'N/A'}
          </div>
          <div>
            <strong>Major Gamma Zones:</strong> {levels.gammaZones.length} identified
          </div>
          <div>
            <strong>Rebalance Zones:</strong> {levels.rebalanceZones.length} active
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionsFlowIndicator;