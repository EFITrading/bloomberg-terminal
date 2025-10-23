'use client';

import React, { useState, useEffect } from 'react';
import './SectorsAnalysisNew.css';

// Weekly Seasonal Data Interface
interface WeeklySeasonalData {
 symbol: string;
 name: string;
 type: 'SECTOR' | 'ETF';
 currentWeek: SeasonalWeek;
 nextWeek: SeasonalWeek;
 week3: SeasonalWeek;
 week4: SeasonalWeek;
 reliability: number;
}

interface SeasonalWeek {
 dateRange: string;
 pattern: 'Bullish' | 'Bearish' | 'Neutral';
 strength: number; // Percentage outperformance vs SPY
 confidence: number; // 0-100 based on historical consistency
}

interface SeasonalData {
 symbol: string;
 name: string;
 type: 'sector' | 'etf';
 currentSeasonalStrength: number;
 seasonalTrend: 'bullish' | 'bearish' | 'neutral';
 seasonalPattern: string;
 bestMonths: string[];
 worstMonths: string[];
 
 // Monthly data
 jan: number;
 feb: number;
 mar: number;
 apr: number;
 may: number;
 jun: number;
 jul: number;
 aug: number;
 sep: number;
 oct: number;
 nov: number;
 dec: number;
 
 // Seasonal Statistics
 winRate: number; // % of years this pattern worked
 avgSeasonalReturn: number;
 maxSeasonalGain: number;
 maxSeasonalLoss: number;
 
 // Pattern Analysis
 patternType: 'Strong Seasonal' | 'Weak Seasonal' | 'Counter-Seasonal' | 'No Pattern';
 patternReliability: number; // 0-100%
 nextSeasonalWindow: string;
 daysUntilPattern: number;
}

const SectorsAnalysis: React.FC = () => {
 const [seasonalData, setSeasonalData] = useState<SeasonalData[]>([]);
 const [loading, setLoading] = useState(true);
 const [selectedView, setSelectedView] = useState<'heatmap' | 'patterns'>('heatmap');
 const [filterType, setFilterType] = useState<'all' | 'sectors' | 'etfs'>('all');
 const [sortBy, setSortBy] = useState<'strength' | 'reliability' | 'nextPattern'>('strength');

 // Pure Seasonality Data for S&P 500 Sectors and ETFs
 const seasonalDatabase: SeasonalData[] = [
 {
 symbol: 'XLK', name: 'Technology Sector', type: 'sector',
 currentSeasonalStrength: 75, seasonalTrend: 'bullish', 
 seasonalPattern: 'Strong September-December Rally',
 bestMonths: ['Sep', 'Oct', 'Nov', 'Dec'], worstMonths: ['May', 'Jun'],
 jan: 3.2, feb: -1.1, mar: 2.8, apr: 4.1, may: -2.3, jun: -1.8,
 jul: 2.9, aug: 1.7, sep: 5.4, oct: 6.8, nov: 4.2, dec: 3.9,
 winRate: 78, avgSeasonalReturn: 12.4, maxSeasonalGain: 28.7, maxSeasonalLoss: -8.9,
 patternType: 'Strong Seasonal', patternReliability: 85,
 nextSeasonalWindow: 'September Rally Window', daysUntilPattern: 0
 },
 {
 symbol: 'XLF', name: 'Financial Sector', type: 'sector',
 currentSeasonalStrength: -45, seasonalTrend: 'bearish',
 seasonalPattern: 'Summer Weakness Pattern',
 bestMonths: ['Nov', 'Dec', 'Jan'], worstMonths: ['Aug', 'Sep'],
 jan: 4.1, feb: 1.2, mar: 0.8, apr: 1.9, may: -1.2, jun: -2.1,
 jul: -1.8, aug: -3.2, sep: -2.8, oct: 1.4, nov: 3.7, dec: 4.8,
 winRate: 72, avgSeasonalReturn: 8.9, maxSeasonalGain: 22.1, maxSeasonalLoss: -12.4,
 patternType: 'Strong Seasonal', patternReliability: 79,
 nextSeasonalWindow: 'October Recovery', daysUntilPattern: 28
 },
 {
 symbol: 'XLV', name: 'Healthcare Sector', type: 'sector',
 currentSeasonalStrength: 35, seasonalTrend: 'neutral',
 seasonalPattern: 'Defensive Autumn Strength',
 bestMonths: ['Oct', 'Nov', 'Mar'], worstMonths: ['Jun', 'Jul'],
 jan: 2.1, feb: 0.9, mar: 3.4, apr: 1.7, may: 0.8, jun: -1.9,
 jul: -2.1, aug: 0.4, sep: 1.8, oct: 4.2, nov: 3.8, dec: 2.2,
 winRate: 68, avgSeasonalReturn: 9.7, maxSeasonalGain: 18.9, maxSeasonalLoss: -7.3,
 patternType: 'Weak Seasonal', patternReliability: 65,
 nextSeasonalWindow: 'October Defensive Play', daysUntilPattern: 28
 },
 {
 symbol: 'XLE', name: 'Energy Sector', type: 'sector',
 currentSeasonalStrength: 85, seasonalTrend: 'bullish',
 seasonalPattern: 'Summer Driving Season',
 bestMonths: ['Apr', 'May', 'Jun'], worstMonths: ['Sep', 'Oct'],
 jan: 1.8, feb: 2.4, mar: 3.7, apr: 6.2, may: 5.8, jun: 4.9,
 jul: 3.1, aug: 1.2, sep: -3.8, oct: -4.2, nov: 0.7, dec: 1.9,
 winRate: 81, avgSeasonalReturn: 14.2, maxSeasonalGain: 35.7, maxSeasonalLoss: -18.9,
 patternType: 'Strong Seasonal', patternReliability: 88,
 nextSeasonalWindow: 'Current Pattern Active', daysUntilPattern: 0
 },
 {
 symbol: 'XLI', name: 'Industrials Sector', type: 'sector',
 currentSeasonalStrength: 60, seasonalTrend: 'bullish',
 seasonalPattern: 'Q4 Economic Optimism',
 bestMonths: ['Nov', 'Dec', 'Jan'], worstMonths: ['Aug', 'Sep'],
 jan: 3.8, feb: 1.4, mar: 2.1, apr: 2.7, may: 0.9, jun: -0.8,
 jul: 1.2, aug: -2.4, sep: -1.9, oct: 2.8, nov: 4.9, dec: 4.2,
 winRate: 74, avgSeasonalReturn: 11.3, maxSeasonalGain: 24.8, maxSeasonalLoss: -9.7,
 patternType: 'Strong Seasonal', patternReliability: 76,
 nextSeasonalWindow: 'Q4 Rally Setup', daysUntilPattern: 28
 },
 {
 symbol: 'XLY', name: 'Consumer Discretionary', type: 'sector',
 currentSeasonalStrength: 90, seasonalTrend: 'bullish',
 seasonalPattern: 'Holiday Shopping Season',
 bestMonths: ['Oct', 'Nov', 'Dec'], worstMonths: ['Jan', 'Feb'],
 jan: -2.1, feb: -1.8, mar: 1.9, apr: 2.4, may: 1.7, jun: 0.8,
 jul: 2.1, aug: 1.4, sep: 2.8, oct: 5.9, nov: 6.7, dec: 7.2,
 winRate: 83, avgSeasonalReturn: 15.8, maxSeasonalGain: 32.4, maxSeasonalLoss: -11.2,
 patternType: 'Strong Seasonal', patternReliability: 91,
 nextSeasonalWindow: 'Holiday Season Ramp', daysUntilPattern: 28
 },
 {
 symbol: 'XLP', name: 'Consumer Staples', type: 'sector',
 currentSeasonalStrength: -20, seasonalTrend: 'bearish',
 seasonalPattern: 'Risk-On Rotation Away',
 bestMonths: ['Mar', 'Aug', 'Sep'], worstMonths: ['Nov', 'Dec'],
 jan: 1.2, feb: 0.8, mar: 2.4, apr: 0.9, may: 1.1, jun: 0.7,
 jul: 1.8, aug: 2.1, sep: 1.9, oct: -0.8, nov: -2.1, dec: -1.8,
 winRate: 58, avgSeasonalReturn: 4.2, maxSeasonalGain: 12.7, maxSeasonalLoss: -8.9,
 patternType: 'Counter-Seasonal', patternReliability: 45,
 nextSeasonalWindow: 'Defensive Rotation', daysUntilPattern: 60
 },
 
 // ETFs with Strong Seasonal Patterns
 {
 symbol: 'TAN', name: 'Solar Energy ETF', type: 'etf',
 currentSeasonalStrength: 95, seasonalTrend: 'bullish',
 seasonalPattern: 'Summer Solar Strength',
 bestMonths: ['Apr', 'May', 'Jun', 'Jul'], worstMonths: ['Nov', 'Dec'],
 jan: -1.8, feb: 0.4, mar: 4.2, apr: 8.9, may: 9.7, jun: 7.4,
 jul: 6.8, aug: 3.2, sep: 1.9, oct: -2.1, nov: -4.8, dec: -3.9,
 winRate: 89, avgSeasonalReturn: 18.7, maxSeasonalGain: 45.2, maxSeasonalLoss: -22.1,
 patternType: 'Strong Seasonal', patternReliability: 94,
 nextSeasonalWindow: 'Current Peak Season', daysUntilPattern: 0
 },
 {
 symbol: 'JETS', name: 'Airlines ETF', type: 'etf',
 currentSeasonalStrength: 80, seasonalTrend: 'bullish',
 seasonalPattern: 'Summer Travel Season',
 bestMonths: ['Mar', 'Apr', 'May', 'Jun'], worstMonths: ['Sep', 'Oct'],
 jan: -2.4, feb: 1.8, mar: 6.7, apr: 7.2, may: 6.9, jun: 5.4,
 jul: 3.8, aug: 2.1, sep: -4.2, oct: -3.8, nov: 0.7, dec: 1.2,
 winRate: 86, avgSeasonalReturn: 16.4, maxSeasonalGain: 38.9, maxSeasonalLoss: -19.7,
 patternType: 'Strong Seasonal', patternReliability: 87,
 nextSeasonalWindow: 'Summer Travel Peak', daysUntilPattern: 0
 },
 {
 symbol: 'XHB', name: 'Homebuilders ETF', type: 'etf',
 currentSeasonalStrength: 70, seasonalTrend: 'bullish',
 seasonalPattern: 'Spring Building Season',
 bestMonths: ['Feb', 'Mar', 'Apr', 'May'], worstMonths: ['Nov', 'Dec'],
 jan: 0.8, feb: 4.9, mar: 6.2, apr: 5.8, may: 4.7, jun: 2.1,
 jul: 1.4, aug: 0.9, sep: -1.2, oct: -2.8, nov: -3.9, dec: -2.7,
 winRate: 79, avgSeasonalReturn: 13.8, maxSeasonalGain: 29.4, maxSeasonalLoss: -15.2,
 patternType: 'Strong Seasonal', patternReliability: 81,
 nextSeasonalWindow: 'Pre-Spring Setup', daysUntilPattern: 150
 },
 {
 symbol: 'GLD', name: 'Gold ETF', type: 'etf',
 currentSeasonalStrength: 65, seasonalTrend: 'bullish',
 seasonalPattern: 'Wedding & Festival Season',
 bestMonths: ['Aug', 'Sep', 'Oct'], worstMonths: ['Mar', 'Apr'],
 jan: 1.2, feb: 0.8, mar: -2.1, apr: -1.8, may: 0.4, jun: 1.7,
 jul: 2.8, aug: 4.2, sep: 3.9, oct: 3.4, nov: 1.8, dec: 0.9,
 winRate: 71, avgSeasonalReturn: 8.9, maxSeasonalGain: 18.7, maxSeasonalLoss: -9.4,
 patternType: 'Weak Seasonal', patternReliability: 68,
 nextSeasonalWindow: 'Autumn Gold Season', daysUntilPattern: 0
 }
 ];

 useEffect(() => {
 const loadSeasonalData = () => {
 setLoading(true);
 // Simulate data loading
 setTimeout(() => {
 setSeasonalData(seasonalDatabase);
 setLoading(false);
 }, 1000);
 };
 
 loadSeasonalData();
 }, []);

 const getFilteredAndSortedData = () => {
 let filtered = seasonalData;
 
 if (filterType !== 'all') {
 filtered = seasonalData.filter(item => 
 filterType === 'sectors' ? item.type === 'sector' : item.type === 'etf'
 );
 }
 
 filtered.sort((a, b) => {
 switch (sortBy) {
 case 'strength':
 return Math.abs(b.currentSeasonalStrength) - Math.abs(a.currentSeasonalStrength);
 case 'reliability':
 return b.patternReliability - a.patternReliability;
 case 'nextPattern':
 return a.daysUntilPattern - b.daysUntilPattern;
 default:
 return 0;
 }
 });
 
 return filtered;
 };

 const getMonthColor = (value: number) => {
 const intensity = Math.abs(value) / 10; // Normalize to 0-1
 if (value > 0) {
 return `rgba(34, 197, 94, ${Math.min(intensity, 1)})`;
 } else {
 return `rgba(239, 68, 68, ${Math.min(intensity, 1)})`;
 }
 };

 const getSeasonalIcon = (trend: string) => {
 switch (trend) {
 case 'bullish': return '';
 case 'bearish': return '';
 default: return '';
 }
 };

 const getPatternIcon = (pattern: string) => {
 if (pattern.includes('Strong')) return '';
 if (pattern.includes('Weak')) return '';
 if (pattern.includes('Counter')) return '';
 return '';
 };

 if (loading) {
 return (
 <div className="sectors-analysis-container">
 <div className="loading-screen">
 <div className="loading-spinner"></div>
 <h2> Loading Seasonal Patterns</h2>
 <p>Analyzing historical seasonality data...</p>
 </div>
 </div>
 );
 };

 return (
 <div className="sectors-analysis-container">
 <div className="analysis-header">
 <div className="header-content">
 <h1> Sectors & ETFs Seasonality Analysis</h1>
 <p>Historical seasonal patterns and optimal timing windows</p>
 </div>
 <div className="header-stats">
 <div className="stat-card bullish">
 <span className="stat-value">
 {seasonalData.filter(s => s.currentSeasonalStrength > 0).length}
 </span>
 <span className="stat-label">Seasonally Bullish</span>
 </div>
 <div className="stat-card bearish">
 <span className="stat-value">
 {seasonalData.filter(s => s.currentSeasonalStrength < 0).length}
 </span>
 <span className="stat-label">Seasonally Bearish</span>
 </div>
 <div className="stat-card strong">
 <span className="stat-value">
 {seasonalData.filter(s => s.patternType === 'Strong Seasonal').length}
 </span>
 <span className="stat-label">Strong Patterns</span>
 </div>
 </div>
 </div>

 <div className="analysis-controls">
 <div className="view-controls">
 <button 
 className={`control-btn ${selectedView === 'heatmap' ? 'active' : ''}`}
 onClick={() => setSelectedView('heatmap')}
 >
 Monthly Heatmap
 </button>
 <button 
 className={`control-btn ${selectedView === 'patterns' ? 'active' : ''}`}
 onClick={() => setSelectedView('patterns')}
 >
 Pattern Analysis
 </button>
 </div>
 
 <div className="filter-controls">
 <select 
 value={filterType} 
 onChange={(e) => setFilterType(e.target.value as any)}
 className="filter-select"
 >
 <option value="all"> All Securities</option>
 <option value="sectors"> Sectors Only</option>
 <option value="etfs"> ETFs Only</option>
 </select>
 
 <select 
 value={sortBy} 
 onChange={(e) => setSortBy(e.target.value as any)}
 className="sort-select"
 >
 <option value="strength"> Seasonal Strength</option>
 <option value="reliability"> Pattern Reliability</option>
 <option value="nextPattern"> Next Pattern Window</option>
 </select>
 </div>
 </div>

 {selectedView === 'heatmap' ? (
 <div className="seasonality-heatmap">
 {getFilteredAndSortedData().map((item) => (
 <div key={item.symbol} className="seasonal-row">
 <div className="sector-info">
 <h3>{item.symbol}</h3>
 <p>{item.name}</p>
 <span className={`type-badge ${item.type}`}>{item.type}</span>
 </div>
 
 <div className="monthly-heatmap">
 {[
 { month: 'Jan', value: item.jan },
 { month: 'Feb', value: item.feb },
 { month: 'Mar', value: item.mar },
 { month: 'Apr', value: item.apr },
 { month: 'May', value: item.may },
 { month: 'Jun', value: item.jun },
 { month: 'Jul', value: item.jul },
 { month: 'Aug', value: item.aug },
 { month: 'Sep', value: item.sep },
 { month: 'Oct', value: item.oct },
 { month: 'Nov', value: item.nov },
 { month: 'Dec', value: item.dec }
 ].map((monthData, idx) => (
 <div 
 key={idx}
 className="month-cell"
 style={{ backgroundColor: getMonthColor(monthData.value) }}
 title={`${monthData.month}: ${monthData.value > 0 ? '+' : ''}${monthData.value.toFixed(1)}%`}
 >
 <span className="month-label">{monthData.month}</span>
 <span className="month-value">
 {monthData.value > 0 ? '+' : ''}{monthData.value.toFixed(1)}%
 </span>
 </div>
 ))}
 </div>
 
 <div className="seasonal-summary">
 <div className="current-strength">
 <span className="strength-label">Current Seasonal Strength</span>
 <span className={`strength-value ${item.currentSeasonalStrength > 0 ? 'positive' : 'negative'}`}>
 {item.currentSeasonalStrength > 0 ? '+' : ''}{item.currentSeasonalStrength}
 </span>
 </div>
 <div className="pattern-info">
 <span className="pattern-text">{item.seasonalPattern}</span>
 <span className="reliability">Reliability: {item.patternReliability}%</span>
 </div>
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="patterns-grid">
 {getFilteredAndSortedData().map((item) => (
 <div key={item.symbol} className="pattern-card">
 <div className="card-header">
 <h3>{item.symbol} - {item.name}</h3>
 <span className={`seasonal-trend ${item.seasonalTrend}`}>
 {getSeasonalIcon(item.seasonalTrend)} {item.seasonalTrend.toUpperCase()}
 </span>
 </div>
 
 <div className="pattern-details">
 <div className="pattern-type">
 {getPatternIcon(item.patternType)} {item.patternType}
 <span className="reliability-badge">{item.patternReliability}% Reliable</span>
 </div>
 
 <div className="seasonal-pattern">
 <h4> Seasonal Pattern</h4>
 <p>{item.seasonalPattern}</p>
 </div>
 
 <div className="best-worst-months">
 <div className="best-months">
 <h5> Best Months</h5>
 <div className="months-list">
 {item.bestMonths.map((month: string) => (
 <span key={month} className="month-tag best">{month}</span>
 ))}
 </div>
 </div>
 <div className="worst-months">
 <h5> Worst Months</h5>
 <div className="months-list">
 {item.worstMonths.map((month: string) => (
 <span key={month} className="month-tag worst">{month}</span>
 ))}
 </div>
 </div>
 </div>
 
 <div className="seasonal-stats">
 <div className="stat">
 <span className="stat-label">Win Rate</span>
 <span className="stat-value">{item.winRate}%</span>
 </div>
 <div className="stat">
 <span className="stat-label">Avg Seasonal Return</span>
 <span className="stat-value">{item.avgSeasonalReturn}%</span>
 </div>
 <div className="stat">
 <span className="stat-label">Max Gain</span>
 <span className="stat-value positive">+{item.maxSeasonalGain}%</span>
 </div>
 <div className="stat">
 <span className="stat-label">Max Loss</span>
 <span className="stat-value negative">{item.maxSeasonalLoss}%</span>
 </div>
 </div>
 
 <div className="next-window">
 <h5> Next Seasonal Window</h5>
 <p className="window-info">{item.nextSeasonalWindow}</p>
 <p className="days-until">
 {item.daysUntilPattern === 0 ? 
 ' Pattern Active Now!' : 
 `${item.daysUntilPattern} days until pattern`
 }
 </p>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 
 <div className="seasonal-legend">
 <h3> Seasonality Legend</h3>
 <div className="legend-items">
 <div className="legend-item">
 <span className="legend-color positive"></span>
 <span>Historically Strong Months</span>
 </div>
 <div className="legend-item">
 <span className="legend-color negative"></span>
 <span>Historically Weak Months</span>
 </div>
 <div className="legend-item">
 <span className="legend-text"> Pattern Reliability: % of years pattern worked</span>
 </div>
 <div className="legend-item">
 <span className="legend-text"> Seasonal Strength: Current seasonal bias (-100 to +100)</span>
 </div>
 </div>
 </div>
 </div>
 );
};

export default SectorsAnalysis;
