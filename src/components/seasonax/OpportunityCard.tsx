import React from 'react';
import { SeasonalPattern } from '@/lib/polygonService';

interface SeasonalChartProps {
 data: Array<{ period: string; return: number }>;
 height?: number;
}

const SeasonalChart: React.FC<SeasonalChartProps> = ({ data, height = 40 }) => {
 // Add null/undefined check for data
 if (!data || !Array.isArray(data) || data.length === 0) {
 return null; // Don't render anything if no data
 }

 const maxReturn = Math.max(...data.map(d => Math.abs(d.return)));
 const barWidth = 100 / data.length;

 return (
 <div className="seasonal-chart" style={{ height: `${height}px` }}>
 {data.map((item, index) => {
 const barHeight = Math.abs(item.return / maxReturn) * height * 0.8;
 const isPositive = item.return >= 0;
 
 return (
 <div
 key={index}
 className={`chart-bar ${isPositive ? 'positive' : 'negative'}`}
 style={{
 width: `${barWidth}%`,
 height: `${barHeight}px`,
 backgroundColor: isPositive ? '#00FF00' : '#FF0000',
 marginTop: isPositive ? `${height - barHeight}px` : `${height * 0.5}px`
 }}
 />
 );
 })}
 </div>
 );
};

interface OpportunityCardProps {
 pattern: SeasonalPattern;
 rank?: number;
 isTopBullish?: boolean;
 isTopBearish?: boolean;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ pattern, rank, isTopBullish, isTopBearish }) => {
 const isPositive = (pattern.averageReturn || pattern.avgReturn || 0) >= 0;
 const expectedReturn = (pattern.averageReturn || pattern.avgReturn || 0);
 const correlation = (pattern as any).correlation || 0;
 const daysUntilStart = (pattern as any).daysUntilStart || 0;
 
 // Calculate timing message
 const getTimingMessage = () => {
 if (daysUntilStart === 0) return 'STARTS TODAY';
 if (daysUntilStart === 1) return 'STARTS TOMORROW';
 if (daysUntilStart > 1) return `STARTS IN ${daysUntilStart} DAYS`;
 if (daysUntilStart === -1) return 'STARTED YESTERDAY';
 if (daysUntilStart < -1) return `STARTED ${Math.abs(daysUntilStart)} DAYS AGO`;
 return 'ACTIVE PERIOD';
 };
 
 return (
 <div 
 className={`pro-opportunity-card ${isPositive ? 'bullish-card' : 'bearish-card'}`}
 >
 {/* Header with Company */}
 <div className="card-header-pro">
 <div className="company-section">
 <div className="company-text">{pattern.company}</div>
 </div>
 </div>
 
 {/* Chart Section with Symbol */}
 <div className={`chart-section ${isTopBullish ? 'top-bullish' : ''} ${isTopBearish ? 'top-bearish' : ''}`}>
 {isTopBullish && (
 <div className="fire-animation">
 <div className="flame flame-1"></div>
 <div className="flame flame-2"></div>
 <div className="flame flame-3"></div>
 <div className="flame flame-4"></div>
 <div className="flame flame-5"></div>
 <div className="flame flame-6"></div>
 <div className="flame flame-7"></div>
 <div className="flame flame-8"></div>
 <div className="flame flame-9"></div>
 <div className="flame flame-10"></div>
 <div className="flame flame-11"></div>
 <div className="flame flame-12"></div>
 <div className="flame flame-13"></div>
 <div className="flame flame-14"></div>
 <div className="flame flame-15"></div>
 </div>
 )}
 {isTopBearish && (
 <div className="blood-animation">
 <div className="blood-drop drop-1"></div>
 <div className="blood-drop drop-2"></div>
 <div className="blood-drop drop-3"></div>
 <div className="blood-drop drop-4"></div>
 <div className="blood-drop drop-5"></div>
 <div className="blood-drop drop-6"></div>
 <div className="blood-drop drop-7"></div>
 <div className="blood-drop drop-8"></div>
 <div className="blood-drop drop-9"></div>
 <div className="blood-drop drop-10"></div>
 </div>
 )}
 <div className="chart-symbol-overlay">
 <div className="symbol-text">{pattern.symbol}</div>
 </div>
 <SeasonalChart data={pattern.chartData} height={50} />
 </div>
 
 {/* Period Display */}
 <div className="period-section">
 <span className="period-text">{pattern.period}</span>
 </div>
 
 {/* Key Metrics */}
 <div className="metrics-grid">
 <div className="metric-card primary">
 <div className={`metric-value-large ${isPositive ? 'positive' : 'negative'}`}>
 {expectedReturn >= 0 ? '+' : ''}{expectedReturn.toFixed(1)}%
 </div>
 <div className="metric-label-small" style={{ fontSize: '12px' }}>Expected</div>
 </div>
 
 <div className="metric-card">
 <div className={`metric-value ${pattern.winRate >= 50 ? 'positive' : 'negative'}`}>
 {pattern.winRate.toFixed(0)}%
 </div>
 <div className="metric-label-small" style={{ fontSize: '12px' }}>Win Rate</div>
 </div>
 
 <div className="metric-card">
 <div className={`metric-value ${correlation >= 50 ? 'positive' : correlation >= 35 ? 'neutral' : 'negative'}`}>
 {correlation}%
 </div>
 <div className="metric-label-small correlation-label" style={{ fontSize: '12px' }}>Correlation</div>
 </div>
 
 <div className="metric-card">
 <div className="metric-value neutral">
 {pattern.years}Y
 </div>
 <div className="metric-label-small" style={{ fontSize: '12px' }}>History</div>
 </div>
 </div>
 
 {/* Timing Information */}
 <div className="timing-info">
 {getTimingMessage()}
 </div>
 </div>
 );
};

export default OpportunityCard;
export { SeasonalChart };
