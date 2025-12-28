import React, { useState } from 'react';
import { SeasonalPattern } from '@/lib/polygonService';
import SeasonalLineChartModal from './SeasonalLineChartModal';

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
 years?: number;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ pattern, rank, isTopBullish, isTopBearish, years = 15 }) => {
 const [showModal, setShowModal] = useState(false);
 const isPositive = (pattern.averageReturn || pattern.avgReturn || 0) >= 0;
 const expectedReturn = (pattern.averageReturn || pattern.avgReturn || 0);
 const daysUntilStart = (pattern as any).daysUntilStart;
 
 const getTimingMessage = () => {
 if (daysUntilStart === undefined || daysUntilStart === null) return null;
 if (daysUntilStart === 0) return 'STARTS TODAY';
 if (daysUntilStart === 1) return 'STARTS TOMORROW';
 if (daysUntilStart > 1) return `IN ${daysUntilStart}D`;
 if (daysUntilStart === -1) return 'STARTED YESTERDAY';
 if (daysUntilStart < -1) return `${Math.abs(daysUntilStart)}D AGO`;
 return null;
 };

 const timingMessage = getTimingMessage();
 
 // Calculate win rate color with opacity - higher opacity for good win rates, lower for bad
 const getWinRateColor = () => {
 if (pattern.winRate >= 50) {
 // Green with higher opacity for higher win rates (50% = 0.5, 100% = 1.0)
 const opacity = Math.min(0.5 + (pattern.winRate - 50) / 100, 1);
 return `rgba(0, 255, 136, ${opacity})`;
 } else {
 // Red with lower opacity for lower win rates (50% = 0.5, 0% = 0.3)
 const opacity = Math.max(0.3 + (pattern.winRate / 100), 0.5);
 return `rgba(255, 68, 68, ${opacity})`;
 }
 };
 
 const winRateColor = getWinRateColor();
 const winRateGlowColor = pattern.winRate >= 50 
 ? 'rgba(0, 255, 136, 0.5)' 
 : 'rgba(255, 68, 68, 0.5)';
 
 // Generate unique class name for this card instance
 const cardId = `opp-card-${pattern.symbol}-${Date.now()}`;
 
 // Best/Worst highlighting logic
 const isBest = isTopBullish || isTopBearish;
 const isWorst = rank !== undefined && rank > 3;
 
 // Border color based on highlighting
 let borderColor = '#333333';
 let boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
 
 if (isTopBullish) {
 borderColor = '#00FF88';
 boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
 } else if (isTopBearish) {
 borderColor = '#FF4444';
 boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)';
 }
 
 return (
 <>
 {/* Inline style override to defeat global CSS */}
 <style>
 {`
 .${cardId} .opp-symbol {
 color: #FF6600 !important;
 }
 .${cardId} .opp-expected-positive {
 color: #00FF88 !important;
 }
 .${cardId} .opp-expected-negative {
 color: #FF4444 !important;
 }
 .${cardId} .opp-winrate {
 color: ${winRateColor} !important;
 }
 `}
 </style>
 <div 
 className={cardId} 
 onDoubleClick={() => setShowModal(true)}
 style={{
 background: '#000000',
 border: `2px solid ${borderColor}`,
 padding: '12px',
 borderRadius: '8px',
 position: 'relative',
 transition: 'all 0.3s ease',
 boxShadow: `${boxShadow}, inset 0 2px 20px rgba(255, 255, 255, 0.03)`,
 backdropFilter: 'blur(10px)',
 transform: 'translateZ(0)',
 willChange: 'transform',
 cursor: 'pointer'
 }}>
 {/* Best/Worst Badge */}
 {isTopBullish && (
 <div style={{
 position: 'absolute',
 top: '-8px',
 right: '12px',
 background: 'linear-gradient(135deg, #00FF88 0%, #00CC66 100%)',
 color: '#000000',
 padding: '4px 12px',
 borderRadius: '12px',
 fontSize: '10px',
 fontWeight: 'bold',
 fontFamily: 'monospace',
 letterSpacing: '0.5px',
 boxShadow: '0 2px 8px rgba(0, 255, 136, 0.4)',
 textTransform: 'uppercase'
 }}>
 ⭐ BEST
 </div>
 )}
 {isTopBearish && (
 <div style={{
 position: 'absolute',
 top: '-8px',
 right: '12px',
 background: 'linear-gradient(135deg, #FF4444 0%, #CC0000 100%)',
 color: '#FFFFFF',
 padding: '4px 12px',
 borderRadius: '12px',
 fontSize: '10px',
 fontWeight: 'bold',
 fontFamily: 'monospace',
 letterSpacing: '0.5px',
 boxShadow: '0 2px 8px rgba(255, 68, 68, 0.4)',
 textTransform: 'uppercase'
 }}>
 ⭐ BEST
 </div>
 )}

 {/* Top Bar: Symbol and Timing */}
 <div style={{
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 marginBottom: '10px',
 borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
 paddingBottom: '10px'
 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
 <div className="opp-symbol" style={{
 fontSize: '26px',
 fontWeight: 'bold',
 letterSpacing: '1px',
 fontFamily: 'monospace',
 textShadow: '0 0 15px rgba(255, 102, 0, 0.6)',
 filter: 'brightness(1.1)'
 }}>
 {pattern.symbol}
 </div>
 {(pattern as any).fiftyTwoWeekStatus && (
 <div style={{
 fontSize: '8px',
 fontWeight: 'bold',
 fontFamily: 'monospace',
 padding: '4px 8px',
 borderRadius: '4px',
 backgroundColor: (pattern as any).fiftyTwoWeekStatus === '52 High' ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 68, 68, 0.2)',
 color: (pattern as any).fiftyTwoWeekStatus === '52 High' ? '#00FF88' : '#FF4444',
 border: `1px solid ${(pattern as any).fiftyTwoWeekStatus === '52 High' ? '#00FF88' : '#FF4444'}`,
 textShadow: `0 0 10px ${(pattern as any).fiftyTwoWeekStatus === '52 High' ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 68, 68, 0.5)'}`,
 whiteSpace: 'nowrap'
 }}>
 {(pattern as any).fiftyTwoWeekStatus === '52 High' ? '52 High' : '52 Low'}
 </div>
 )}
 </div>
 {timingMessage && (
 <div style={{
 fontSize: '11px',
 color: '#FF6600',
 fontWeight: '700',
 letterSpacing: '0.8px',
 textTransform: 'uppercase',
 fontFamily: 'monospace',
 background: 'rgba(255, 102, 0, 0.1)',
 padding: '4px 8px',
 borderRadius: '4px',
 border: '1px solid rgba(255, 102, 0, 0.3)',
 textShadow: '0 0 10px rgba(255, 102, 0, 0.5)'
 }}>
 {timingMessage}
 </div>
 )}
 </div>

 {/* Period - Centered */}
 <div style={{
 fontSize: '11px',
 color: '#999999',
 marginBottom: '14px',
 fontFamily: 'monospace',
 letterSpacing: '0.5px',
 textAlign: 'center'
 }}>
 {pattern.period}
 </div>

 {/* Metrics Grid */}
 <div style={{
 display: 'grid',
 gridTemplateColumns: '1fr 1fr',
 gap: '4px',
 marginBottom: '10px',
 overflow: 'hidden'
 }}>
 {/* Expected Return */}
 <div style={{
 background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.3) 100%)',
 padding: '6px 4px',
 borderRadius: '6px',
 border: '1px solid rgba(255, 255, 255, 0.15)',
 boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.3)',
 textAlign: 'center',
 overflow: 'hidden'
 }}>
 <div style={{
 fontSize: '9px',
 color: '#888888',
 marginBottom: '4px',
 fontFamily: 'monospace',
 letterSpacing: '0.8px',
 textTransform: 'uppercase'
 }}>
 EXPECTED
 </div>
 <div className={isPositive ? 'opp-expected-positive' : 'opp-expected-negative'} style={{
 fontSize: '14px',
 fontWeight: 'bold',
 fontFamily: 'monospace',
 letterSpacing: '-0.5px',
 textShadow: `0 0 10px ${isPositive ? 'rgba(0, 255, 136, 0.5)' : 'rgba(255, 68, 68, 0.5)'}`
 }}>
 {expectedReturn >= 0 ? '+' : ''}{expectedReturn.toFixed(1)}%
 </div>
 </div>

 {/* Win Rate */}
 <div style={{
 background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.3) 100%)',
 padding: '6px 4px',
 borderRadius: '6px',
 border: '1px solid rgba(255, 255, 255, 0.15)',
 boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.3)',
 textAlign: 'center',
 overflow: 'hidden'
 }}>
 <div style={{
 fontSize: '9px',
 color: '#888888',
 marginBottom: '4px',
 fontFamily: 'monospace',
 letterSpacing: '0.8px',
 textTransform: 'uppercase',
 whiteSpace: 'nowrap'
 }}>
 WIN RATE
 </div>
 <div className="opp-winrate" style={{
 fontSize: '14px',
 fontWeight: 'bold',
 fontFamily: 'monospace',
 letterSpacing: '-0.5px',
 textShadow: `0 0 10px ${winRateGlowColor}`
 }}>
 {pattern.winRate.toFixed(0)}%
 </div>
 </div>
 </div>

 {/* Bottom indicator line with 3D effect */}
 <div style={{
 height: '3px',
 background: isPositive 
 ? 'linear-gradient(90deg, rgba(0, 255, 136, 0.6) 0%, rgba(0, 255, 136, 0.9) 50%, rgba(0, 255, 136, 0.6) 100%)'
 : 'linear-gradient(90deg, rgba(255, 68, 68, 0.6) 0%, rgba(255, 68, 68, 0.9) 50%, rgba(255, 68, 68, 0.6) 100%)',
 marginTop: '10px',
 borderRadius: '2px',
 boxShadow: `0 0 8px ${isPositive ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 68, 68, 0.4)'}`,
 opacity: 0.8
 }} />
 </div>

 {/* Seasonal Line Chart Modal */}
 <SeasonalLineChartModal
 isOpen={showModal}
 onClose={() => setShowModal(false)}
 pattern={pattern}
 years={years}
 />
 </>
 );
};

export default OpportunityCard;
export { SeasonalChart };
