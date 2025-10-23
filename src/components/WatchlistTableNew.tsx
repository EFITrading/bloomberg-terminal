"use client";

import React from 'react';
import { useWatchlist } from '../hooks/useWatchlist';
import { WatchlistItem, PerformanceCategory, AISignal } from '../types/watchlist';

const WatchlistTable: React.FC = () => {
 const { watchlistData, loading, error, refreshData, getPerformanceColor, getSignalColor } = useWatchlist();

 const formatPrice = (price: number, symbol: string): string => {
 if (price >= 1000) {
 return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
 }
 return `$${price.toFixed(2)}`;
 };

 const formatChange = (change: number, changePercent: number): string => {
 const sign = change >= 0 ? '+' : '';
 return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
 };

 const getChangeColor = (change: number): string => {
 if (change > 0) return 'text-green-400';
 if (change < 0) return 'text-red-400';
 return 'text-gray-400';
 };

 const getPerformanceLabel = (category: PerformanceCategory): string => {
 const labels: Record<PerformanceCategory, string> = {
 'KING': ' KING',
 'LEADING': ' LEADING', 
 'STRONG': ' STRONG',
 'IMPROVING': ' IMPROVING',
 'NEUTRAL': ' NEUTRAL',
 'LAGGING': ' LAGGING',
 'WEAK': ' WEAK',
 'BLEEDING': '🩸 BLEEDING',
 'FALLEN': ' FALLEN'
 };
 return labels[category];
 };

 const getAISignalLabel = (signal: AISignal): string => {
 const labels: Record<AISignal, string> = {
 'STRONG_BUY': ' STRONG BUY',
 'BUY': ' BUY',
 'NEUTRAL': ' NEUTRAL',
 'SELL': ' SELL',
 'STRONG_SELL': ' STRONG SELL'
 };
 return labels[signal];
 };

 if (loading) {
 return (
 <div className="watchlist-loading">
 <div className="loading-spinner"></div>
 <div className="loading-text">Loading enhanced watchlist analysis...</div>
 </div>
 );
 }

 if (error) {
 return (
 <div className="watchlist-error">
 <div className="error-icon"></div>
 <div className="error-message">
 <div className="empty-text">Error loading watchlist data</div>
 <div className="error-details">{error}</div>
 <button onClick={refreshData} className="retry-button">
 Retry
 </button>
 </div>
 </div>
 );
 }

 return (
 <div className="watchlist-content">
 <div className="watchlist-table">
 <div className="watchlist-header">
 <div className="header-cell symbol">Symbol</div>
 <div className="header-cell price">Price</div>
 <div className="header-cell change">Change</div>
 <div className="header-cell performance">Performance vs SPY</div>
 <div className="header-cell signal">AI Signal</div>
 <div className="header-cell volume">Volume</div>
 </div>
 
 {watchlistData.length > 0 ? (
 <div className="watchlist-rows">
 {watchlistData.map((item) => (
 <div key={item.symbol} className="watchlist-row">
 <div className="cell symbol">
 <div className="symbol-name">
 <span className="symbol-ticker">{item.symbol}</span>
 <span className="symbol-full-name">{item.name}</span>
 </div>
 </div>
 
 <div className="cell price">
 {formatPrice(item.price, item.symbol)}
 </div>
 
 <div className={`cell change ${getChangeColor(item.change)}`}>
 {formatChange(item.change, item.changePercent)}
 </div>
 
 <div 
 className="cell performance"
 style={{ color: getPerformanceColor(item.performance) }}
 >
 {getPerformanceLabel(item.performance)}
 </div>
 
 <div 
 className="cell signal"
 style={{ color: getSignalColor(item.signal) }}
 >
 {getAISignalLabel(item.signal)}
 </div>
 
 <div className="cell volume">
 {item.volume.toLocaleString()}
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="watchlist-empty">
 <div className="empty-icon"></div>
 <div className="empty-text">No watchlist data available</div>
 </div>
 )}
 </div>

 {watchlistData.length > 0 && (
 <div className="watchlist-footer">
 <div className="footer-info">
 <span>Last updated: {new Date().toLocaleTimeString()}</span>
 <span>•</span>
 <span>{watchlistData.length} symbols tracked</span>
 </div>
 
 <div className="footer-legend">
 <div className="legend-item">
 <span className="legend-label">Performance:</span>
 <span style={{ color: '#00ff00' }}>KING (21D) {'>'} </span>
 <span style={{ color: '#32ff32' }}>LEADING (13D) {'>'} </span>
 <span style={{ color: '#7fff00' }}>STRONG (5D) {'>'} </span>
 <span style={{ color: '#4169e1' }}>IMPROVING (1D)</span>
 </div>
 </div>
 
 <button onClick={refreshData} className="refresh-button">
 Refresh Data
 </button>
 </div>
 )}
 </div>
 );
};

export default WatchlistTable;
