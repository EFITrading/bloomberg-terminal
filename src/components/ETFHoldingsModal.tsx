'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { INDUSTRY_ETFS } from '../lib/industryAnalysisService';
import { EnhancedWatchlistService } from '../lib/enhancedWatchlistService';
import { PerformanceCategory, AISignal } from '../types/watchlist';

interface ETFHoldingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  etfSymbol: string;
  etfName: string;
}

interface HoldingData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  change1d: number;
  change5d: number;
  change13d: number;
  change21d: number;
  changeYTD: number;
  volume: number;
  perf1d: { status: string; color: string };
  perf5d: { status: string; color: string };
  perf13d: { status: string; color: string };
  perf21d: { status: string; color: string };
  perfYTD: { status: string; color: string };
}

const ETFHoldingsModal: React.FC<ETFHoldingsModalProps> = ({ isOpen, onClose, etfSymbol, etfName }) => {
  const [holdings, setHoldings] = useState<HoldingData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enhancedService = EnhancedWatchlistService.getInstance();

  useEffect(() => {
    if (isOpen && etfSymbol) {
      loadHoldingsData();
    }
  }, [isOpen, etfSymbol]);

  const loadHoldingsData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Find ETF in INDUSTRY_ETFS
      const etfData = INDUSTRY_ETFS.find(etf => etf.symbol === etfSymbol);
      
      if (!etfData || !etfData.holdings || etfData.holdings.length === 0) {
        // Try to find holdings from other sources (sector ETFs)
        const sectorHoldings = getSectorETFHoldings(etfSymbol);
        if (!sectorHoldings || sectorHoldings.length === 0) {
          setError(`No holdings data available for ${etfSymbol}`);
          setLoading(false);
          return;
        }
        await fetchHoldingsPerformance(sectorHoldings);
      } else {
        console.log('Using INDUSTRY_ETFS holdings:', etfData.holdings);
        await fetchHoldingsPerformance(etfData.holdings);
      }
    } catch (err) {
      console.error('Error loading holdings data:', err);
      setError('Failed to load holdings data');
    } finally {
      setLoading(false);
    }
  };

  const getSectorETFHoldings = (symbol: string): string[] => {
    // Map of sector ETFs to their top holdings
    const sectorHoldings: Record<string, string[]> = {
      'XLK': ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'ORCL', 'ADBE', 'ACN', 'CSCO', 'AMD', 'IBM', 'INTC', 'QCOM', 'TXN', 'NOW'],
      'XLF': ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'AXP', 'BLK', 'C', 'SCHW', 'CME', 'USB'],
      'XLV': ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'ELV', 'LLY', 'AMGN', 'GILD', 'ISRG', 'CVS'],
      'XLI': ['CAT', 'RTX', 'HON', 'UPS', 'LMT', 'BA', 'UNP', 'ADP', 'DE', 'MMM', 'GE', 'EMR', 'ETN', 'ITW', 'CSX'],
      'XLY': ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'NKE', 'LOW', 'SBUX', 'TJX', 'ORLY', 'CMG', 'MAR', 'GM', 'F', 'ROST'],
      'XLP': ['PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'CL', 'KMB', 'GIS', 'K', 'MO', 'PM', 'EL', 'STZ', 'HSY'],
      'XLE': ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'BKR', 'HAL', 'DVN', 'HES', 'KMI', 'WMB'],
      'XLU': ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'VST', 'D', 'PCG', 'PEG', 'EXC', 'XEL', 'ED', 'WEC', 'ES'],
      'XLB': ['LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'CTVA', 'DD', 'NUE', 'PPG', 'DOW', 'ALB', 'VMC', 'MLM', 'AMCR'],
      'XLRE': ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WY', 'DLR', 'O', 'SBAC', 'EXR', 'WELL', 'AVB', 'VTR', 'ARE', 'SPG'],
      'XLC': ['GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'EA', 'ATVI', 'TTWO', 'FOXA', 'OMC'],
      'VTI': ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'AVGO', 'JPM'],
      'GLD': [], // Gold ETF has no stock holdings
    };

    return sectorHoldings[symbol] || [];
  };

  const fetchHoldingsPerformance = async (holdingSymbols: string[]) => {
    try {
      // First get SPY data for comparison
      const spyResponse = await fetch(
        `/api/historical-data?symbol=SPY&startDate=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&endDate=${new Date().toISOString().split('T')[0]}`
      );
      const spyData = await spyResponse.json();
      const spyPriceData = spyData.results || [];
      
      // Calculate SPY performance for comparison
      const spyLatest = spyPriceData[spyPriceData.length - 1]?.c;
      const spyPrev = spyPriceData[spyPriceData.length - 2]?.c;
      const spy1d = spyLatest && spyPrev ? ((spyLatest - spyPrev) / spyPrev) * 100 : 0;
      const spy5d = spyLatest && spyPriceData[spyPriceData.length - 6]?.c ? ((spyLatest - spyPriceData[spyPriceData.length - 6].c) / spyPriceData[spyPriceData.length - 6].c) * 100 : 0;
      const spy13d = spyLatest && spyPriceData[spyPriceData.length - 14]?.c ? ((spyLatest - spyPriceData[spyPriceData.length - 14].c) / spyPriceData[spyPriceData.length - 14].c) * 100 : 0;
      const spy21d = spyLatest && spyPriceData[spyPriceData.length - 22]?.c ? ((spyLatest - spyPriceData[spyPriceData.length - 22].c) / spyPriceData[spyPriceData.length - 22].c) * 100 : 0;
      
      const ytdStart = new Date(new Date().getFullYear(), 0, 1);
      const spyYtdData = spyPriceData.find((d: any) => new Date(d.t) >= ytdStart);
      const spyYTD = spyLatest && spyYtdData?.c ? ((spyLatest - spyYtdData.c) / spyYtdData.c) * 100 : 0;

      const getPerformanceStatus = (stockChange: number, spyChange: number, period: string) => {
        const relativePerformance = stockChange - spyChange;
        
        if (period === '21d') {
          if (relativePerformance > 0) {
            return { status: 'KING', color: '#ffff00' };
          } else {
            return { status: 'FALLEN', color: '#ff0000' };
          }
        } else if (period === '13d') {
          if (relativePerformance > 0) {
            return { status: 'LEADER', color: '#00ff00' };
          } else {
            return { status: 'LAGGARD', color: '#ff0000' };
          }
        } else if (period === '5d') {
          if (relativePerformance > 0) {
            return { status: 'STRONG', color: '#00ff00' };
          } else {
            return { status: 'WEAK', color: '#ff0000' };
          }
        } else if (period === '1d') {
          if (relativePerformance > 0) {
            return { status: 'RISING', color: '#7fff00' };
          } else {
            return { status: 'FALLING', color: '#ff4444' };
          }
        } else if (period === 'ytd') {
          if (relativePerformance > 0) {
            return { status: 'WINNER', color: '#00ff00' };
          } else {
            return { status: 'LOSER', color: '#ff0000' };
          }
        }
        
        return { status: 'NEUTRAL', color: '#888888' };
      };

      const holdingsData = await Promise.all(
        holdingSymbols.slice(0, 15).map(async (symbol) => { // Top 15 holdings
          try {
            // Fetch historical data for performance calculation
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30); // Get 30 days of data
            
            const url = `/api/historical-data?symbol=${symbol}&startDate=${startDate.toISOString().split('T')[0]}&endDate=${new Date().toISOString().split('T')[0]}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
              return null;
            }

            const data = await response.json();
            const priceData = data.results || [];
            
            if (!priceData || priceData.length === 0) {
              return null;
            }

            // Calculate performance for different time periods
            const latestPrice = priceData[priceData.length - 1].c || priceData[priceData.length - 1].close;
            const calculateChange = (daysAgo: number) => {
              const targetIndex = Math.max(0, priceData.length - 1 - daysAgo);
              if (targetIndex >= priceData.length) return 0;
              const oldPrice = priceData[targetIndex].c || priceData[targetIndex].close;
              return ((latestPrice - oldPrice) / oldPrice) * 100;
            };

            // Get YTD performance
            const ytdStart = new Date(new Date().getFullYear(), 0, 1);
            const ytdData = priceData.find((d: any) => new Date(d.t || d.timestamp) >= ytdStart);
            const changeYTD = ytdData ? ((latestPrice - (ytdData.c || ytdData.close)) / (ytdData.c || ytdData.close)) * 100 : 0;

            const currentPrice = latestPrice;
            const previousPrice = priceData.length > 1 ? (priceData[priceData.length - 2].c || priceData[priceData.length - 2].close) : latestPrice;
            const dailyChange = currentPrice - previousPrice;
            const dailyChangePercent = ((dailyChange / previousPrice) * 100);

            return {
              symbol,
              name: symbol,
              price: currentPrice,
              change: dailyChange,
              changePercent: dailyChangePercent,
              change1d: dailyChangePercent,
              change5d: calculateChange(5),
              change13d: calculateChange(13),
              change21d: calculateChange(21),
              changeYTD: changeYTD,
              volume: priceData[priceData.length - 1].v || priceData[priceData.length - 1].volume || 0,
              perf1d: getPerformanceStatus(dailyChangePercent, spy1d, '1d'),
              perf5d: getPerformanceStatus(calculateChange(5), spy5d, '5d'),
              perf13d: getPerformanceStatus(calculateChange(13), spy13d, '13d'),
              perf21d: getPerformanceStatus(calculateChange(21), spy21d, '21d'),
              perfYTD: getPerformanceStatus(changeYTD, spyYTD, 'ytd')
            };
          } catch (error) {
            console.error(`Error fetching data for ${symbol}:`, error);
            return null;
          }
        })
      );

      const validHoldings = holdingsData.filter((h): h is HoldingData => h !== null);
      setHoldings(validHoldings);
    } catch (err) {
      console.error('Error fetching holdings performance:', err);
      throw err;
    }
  };

  const formatPrice = (price: number): string => {
    if (price >= 1000) {
      return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${price.toFixed(2)}`;
  };

  const formatChange = (change: number, changePercent: number): string => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '20px'
      }}
      onClick={(e) => {
        // Only close if clicking directly on the overlay (not on children)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        style={{
          background: '#000000',
          border: '1px solid #FF6600',
          borderRadius: '0',
          boxShadow: 'none',
          maxWidth: '1000px',
          width: '90%',
          height: '75vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          borderBottom: '1px solid #FF6600',
          background: '#000000'
        }}>
          <div style={{ flex: 1 }}></div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: '#ffffff',
              margin: 0,
              fontFamily: 'monospace',
              letterSpacing: '3px',
              textTransform: 'uppercase'
            }}>{etfSymbol} HOLDINGS</h2>
            <p style={{
              fontSize: '12px',
              color: '#888',
              margin: '6px 0 0 0',
              fontFamily: 'monospace',
              letterSpacing: '1px'
            }}>{etfName}</p>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              style={{
                background: '#000000',
                border: '1px solid #FF6600',
                color: '#FF6600',
                fontSize: '20px',
                fontWeight: '700',
                cursor: 'pointer',
                padding: 0,
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '0',
                transition: 'all 0.15s',
                fontFamily: 'monospace'
              }}
              onClick={onClose}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FF6600';
                e.currentTarget.style.color = '#000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#000000';
                e.currentTarget.style.color = '#FF6600';
              }}
            >
              ×
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            background: '#000000'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #111',
              borderTopColor: '#FF6600',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <div style={{
              marginTop: '16px',
              color: '#FF6600',
              fontSize: '14px',
              fontFamily: 'monospace',
              letterSpacing: '2px'
            }}>LOADING HOLDINGS...</div>
          </div>
        ) : error ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            background: '#000000'
          }}>
            <div style={{
              color: '#ff0000',
              fontSize: '14px',
              fontFamily: 'monospace',
              letterSpacing: '2px'
            }}>ERROR: {error}</div>
          </div>
        ) : (
          <div style={{
            flex: 1,
            overflowY: 'auto',
            background: '#000000'
          }}>
            <div style={{
              background: '#000000',
              overflow: 'hidden'
            }}>
              {/* Column Headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',
                gap: '0',
                borderBottom: '1px solid #FF6600',
                background: 'linear-gradient(to bottom, rgba(20, 20, 20, 0.8) 0%, rgba(0, 0, 0, 1) 50%, rgba(10, 10, 10, 0.8) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 3px rgba(0, 0, 0, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5)',
                padding: '10px 20px',
                fontSize: '20px',
                fontWeight: '700',
                color: '#ffffff',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                fontFamily: 'monospace'
              }}>
                <div style={{ borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>SYMBOL</div>
                <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>PRICE</div>
                <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>CHANGE</div>
                <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>1D</div>
                <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>5D</div>
                <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>13D</div>
                <div style={{ textAlign: 'center', borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>21D</div>
                <div style={{ textAlign: 'center' }}>YTD</div>
              </div>
              
              {/* Holdings Rows */}
              <div style={{ flex: 1, overflowY: 'auto', background: '#000000' }}>
                {holdings.map((holding, index) => {
                  return (
                    <div key={holding.symbol} style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr',
                      gap: '0',
                      padding: '10px 20px',
                      borderBottom: '1px solid #111',
                      borderRight: '1px solid rgba(255, 102, 0, 0.15)',
                      background: index % 2 === 0 
                        ? 'linear-gradient(to bottom, rgba(20, 20, 20, 0.4) 0%, rgba(0, 0, 0, 0.8) 50%, rgba(10, 10, 10, 0.6) 100%)' 
                        : 'linear-gradient(to bottom, rgba(15, 15, 15, 0.4) 0%, rgba(5, 5, 5, 0.8) 50%, rgba(8, 8, 8, 0.6) 100%)',
                      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -1px 3px rgba(0, 0, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.3)',
                      transition: 'all 0.15s',
                      fontSize: '12px',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, rgba(255, 102, 0, 0.15) 0%, rgba(255, 102, 0, 0.08) 50%, rgba(255, 102, 0, 0.12) 100%)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 3px rgba(0, 0, 0, 0.8), 0 4px 8px rgba(255, 102, 0, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = index % 2 === 0 
                        ? 'linear-gradient(to bottom, rgba(20, 20, 20, 0.4) 0%, rgba(0, 0, 0, 0.8) 50%, rgba(10, 10, 10, 0.6) 100%)' 
                        : 'linear-gradient(to bottom, rgba(15, 15, 15, 0.4) 0%, rgba(5, 5, 5, 0.8) 50%, rgba(8, 8, 8, 0.6) 100%)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -1px 3px rgba(0, 0, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.3)';
                    }}
                    >
                      {/* Symbol */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>
                        <span style={{ fontWeight: '700', color: '#FF6600', fontSize: '20px', fontFamily: 'monospace', letterSpacing: '1px' }}>{holding.symbol}</span>
                        <span style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace' }}>{holding.name}</span>
                      </div>
                      
                      {/* Price */}
                      <div style={{ fontWeight: '700', color: '#fff', fontFamily: 'monospace', textAlign: 'center', fontSize: '18px', borderRight: '1px solid rgba(255, 102, 0, 0.15)', paddingRight: '10px' }}>
                        {formatPrice(holding.price)}
                      </div>
                      
                      {/* Daily Change */}
                      <div style={{ 
                        fontWeight: '700',
                        color: holding.change >= 0 ? '#00ff00' : '#ff0000',
                        fontFamily: 'monospace',
                        textAlign: 'center',
                        fontSize: '18px',
                        borderRight: '1px solid rgba(255, 102, 0, 0.15)',
                        paddingRight: '10px'
                      }}>
                        {formatChange(holding.change, holding.changePercent)}
                      </div>
                      
                      {/* 1D Performance */}
                      <div style={{ 
                        fontWeight: '800',
                        color: holding.perf1d.color,
                        textAlign: 'center',
                        fontSize: '17px',
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                        borderRight: '1px solid rgba(255, 102, 0, 0.15)',
                        paddingRight: '10px'
                      }}>
                        {holding.perf1d.status}
                      </div>
                      
                      {/* 5D Performance */}
                      <div style={{ 
                        fontWeight: '800',
                        color: holding.perf5d.color,
                        textAlign: 'center',
                        fontSize: '17px',
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                        borderRight: '1px solid rgba(255, 102, 0, 0.15)',
                        paddingRight: '10px'
                      }}>
                        {holding.perf5d.status}
                      </div>
                      
                      {/* 13D Performance */}
                      <div style={{ 
                        fontWeight: '800',
                        color: holding.perf13d.color,
                        textAlign: 'center',
                        fontSize: '17px',
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                        borderRight: '1px solid rgba(255, 102, 0, 0.15)',
                        paddingRight: '10px'
                      }}>
                        {holding.perf13d.status}
                      </div>
                      
                      {/* 21D Performance */}
                      <div style={{ 
                        fontWeight: '800',
                        color: holding.perf21d.color,
                        textAlign: 'center',
                        fontSize: '17px',
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px',
                        borderRight: '1px solid rgba(255, 102, 0, 0.15)',
                        paddingRight: '10px'
                      }}>
                        {holding.perf21d.status}
                      </div>
                      
                      {/* YTD Performance */}
                      <div style={{ 
                        fontWeight: '800',
                        color: holding.perfYTD.color,
                        textAlign: 'center',
                        fontSize: '17px',
                        fontFamily: 'monospace',
                        letterSpacing: '0.5px'
                      }}>
                        {holding.perfYTD.status}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>

        <style jsx>{`
          .etf-holdings-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            padding: 20px;
          }

          .etf-holdings-modal-content {
            background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
            border: 1px solid #333;
            border-radius: 12px;
            max-width: 1200px;
            width: 100%;
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #333;
            background: rgba(255, 165, 0, 0.05);
          }

          .modal-title {
            font-size: 24px;
            font-weight: 700;
            color: #ff8800;
            margin: 0;
          }

          .modal-subtitle {
            font-size: 14px;
            color: #888;
            margin: 4px 0 0 0;
          }

          .modal-close-button {
            background: none;
            border: none;
            color: #888;
            font-size: 28px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s;
          }

          .modal-close-button:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
          }

          .modal-loading,
          .modal-error {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
          }

          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #333;
            border-top-color: #ff8800;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .loading-text {
            margin-top: 16px;
            color: #888;
            font-size: 14px;
          }

          .error-message {
            color: #ff4444;
            font-size: 14px;
          }

          .modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
          }

          .holdings-table {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid #222;
            border-radius: 8px;
            overflow: hidden;
          }

          .modal-footer {
            padding: 16px 24px;
            border-top: 1px solid #333;
            background: rgba(0, 0, 0, 0.3);
          }

          .footer-info {
            display: flex;
            gap: 12px;
            font-size: 12px;
            color: #888;
            align-items: center;
            justify-content: center;
          }

          /* Reuse watchlist table styles */
          .watchlist-header {
            display: grid;
            grid-template-columns: 2fr 1fr 1.5fr 1.5fr 1.5fr 1fr;
            gap: 8px;
            padding: 12px 16px;
            background: rgba(255, 165, 0, 0.1);
            border-bottom: 1px solid #333;
          }

          .header-cell {
            font-size: 11px;
            font-weight: 700;
            color: #ff8800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .watchlist-rows {
            max-height: 500px;
            overflow-y: auto;
          }

          .watchlist-row {
            display: grid;
            grid-template-columns: 2fr 1fr 1.5fr 1.5fr 1.5fr 1fr;
            gap: 8px;
            padding: 12px 16px;
            border-bottom: 1px solid #222;
            transition: background 0.2s;
          }

          .watchlist-row:hover {
            background: rgba(255, 165, 0, 0.05);
          }

          .cell {
            display: flex;
            align-items: center;
            font-size: 13px;
          }

          .symbol-name {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .symbol-ticker {
            font-weight: 700;
            color: #fff;
            font-size: 14px;
          }

          .symbol-full-name {
            font-size: 11px;
            color: #666;
          }

          .price {
            font-weight: 600;
            color: #fff;
            font-family: 'Courier New', monospace;
          }

          .performance,
          .signal {
            font-weight: 600;
            font-size: 12px;
          }

          .volume {
            color: #888;
            font-size: 12px;
          }
        `}</style>
      </div>
    </div>
  );

  // Render modal using portal to document body
  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  
  return null;
};

export default ETFHoldingsModal;
