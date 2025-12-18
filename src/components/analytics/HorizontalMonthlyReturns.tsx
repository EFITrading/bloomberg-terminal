'use client';

import React from 'react';

interface MonthlyData {
 month: string;
 avgReturn?: number;
 outperformance: number;
}

interface Period30Day {
 period: string;
 return: number;
 startDate: string;
 endDate: string;
}

interface HorizontalMonthlyReturnsProps {
 monthlyData: MonthlyData[];
 best30DayPeriod?: Period30Day;
 worst30DayPeriod?: Period30Day;
 yearsOfData?: number;
 onYearsChange?: (years: number) => void;
 selectedElectionPeriod?: string;
 onElectionPeriodChange?: (period: string) => void;
 onSweetSpotClick?: () => void;
 onPainPointClick?: () => void;
 onMonthClick?: (monthIndex: number, monthName: string) => void;
}

const HorizontalMonthlyReturns: React.FC<HorizontalMonthlyReturnsProps> = ({ 
 monthlyData, 
 best30DayPeriod, 
 worst30DayPeriod,
 yearsOfData = 20,
 onYearsChange,
 selectedElectionPeriod = 'Normal Mode',
 onElectionPeriodChange,
 onSweetSpotClick,
 onPainPointClick,
 onMonthClick
}) => {
 const formatPercentage = (value: number): string => {
 return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
 };

 const formatDateRange = (period: string): string => {
 // Format the period string for display
 return period.replace(' - Best Month', '').replace(' - Worst Month', '');
 };

 // Identify the best 3 and worst 3 months by outperformance
 const sortedMonths = [...monthlyData].sort((a, b) => b.outperformance - a.outperformance);
 const bestMonths = sortedMonths.slice(0, 3).map(m => m.month);
 const worstMonths = sortedMonths.slice(-3).map(m => m.month);

 const getMonthClass = (month: string): string => {
 if (bestMonths.includes(month)) return 'month-label best-month';
 if (worstMonths.includes(month)) return 'month-label worst-month';
 return 'month-label';
 };

 if (!monthlyData || monthlyData.length === 0) {
 return null;
 }

 const electionPeriods = ['Normal Mode', 'Election Year', 'Post-Election', 'Mid-Term', 'Pre-Election'];
 
 // Only show controls if callback functions are provided
 const showControls = onYearsChange && onElectionPeriodChange && onSweetSpotClick && onPainPointClick;

 return (
 <div className="horizontal-monthly-returns" style={{ 
   display: 'flex', 
   flexDirection: 'row', 
   width: 'fit-content', 
   padding: '10px 80px 10px 20px',
   alignItems: 'center',
   marginLeft: '1px'
 }}>
 {/* Left side - Dropdowns (only show if controls are enabled) */}
 {showControls && (
 <div style={{ 
   display: 'flex', 
   flexDirection: 'column', 
   gap: '15px',
   marginRight: '30px',
   minWidth: '180px'
 }}>
 {/* Year selector */}
 <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'center' }}>
 <label style={{ 
   fontSize: '13px', 
   color: '#FF6600', 
   fontWeight: '700',
   letterSpacing: '0.5px',
   textTransform: 'uppercase',
   whiteSpace: 'nowrap'
 }}>YEARS</label>
 <select 
 value={yearsOfData}
 onChange={(e) => onYearsChange?.(parseInt(e.target.value))}
 style={{
   padding: '10px 12px',
   borderRadius: '8px',
   border: '1px solid rgba(255, 255, 255, 0.2)',
   background: '#0a0a0a',
   color: '#fff',
   fontSize: '14px',
   fontWeight: '600',
   cursor: 'pointer',
   outline: 'none'
 }}
 >
 <option value="1">1 year</option>
 <option value="3">3 years</option>
 <option value="5">5 years</option>
 <option value="10">10 years</option>
 <option value="15">15 years</option>
 <option value="20">20 years (Max)</option>
 </select>
 <button
 onClick={onSweetSpotClick}
 style={{
 padding: '10px 20px',
 borderRadius: '8px',
 border: '1px solid #00FF00',
 background: 'rgba(0, 255, 0, 0.1)',
 color: '#00FF00',
 fontSize: '13px',
 fontWeight: '700',
 cursor: 'pointer',
 whiteSpace: 'nowrap',
 transition: 'all 0.2s'
 }}
 onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0, 255, 0, 0.2)'}
 onMouseOut={(e) => e.currentTarget.style.background = 'rgba(0, 255, 0, 0.1)'}
 >
 Sweet Spot
 </button>
 </div>

 {/* Election mode selector */}
 <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'center' }}>
 <label style={{ 
   fontSize: '13px', 
   color: '#FF6600', 
   fontWeight: '700',
   letterSpacing: '0.5px',
   textTransform: 'uppercase',
   whiteSpace: 'nowrap'
 }}>MODE</label>
 <select 
 value={selectedElectionPeriod}
 onChange={(e) => onElectionPeriodChange?.(e.target.value)}
 style={{
   padding: '10px 12px',
   borderRadius: '8px',
   border: '1px solid rgba(255, 255, 255, 0.2)',
   background: '#0a0a0a',
   color: selectedElectionPeriod === 'Normal Mode' ? '#fff' : '#FF6600',
   fontSize: '14px',
   fontWeight: '600',
   cursor: 'pointer',
   outline: 'none'
 }}
 >
 {electionPeriods.map(period => (
 <option key={period} value={period}>{period}</option>
 ))}
 </select>
 <button
 onClick={onPainPointClick}
 style={{
 padding: '10px 20px',
 borderRadius: '8px',
 border: '1px solid #FF0000',
 background: 'rgba(255, 0, 0, 0.1)',
 color: '#FF0000',
 fontSize: '13px',
 fontWeight: '700',
 cursor: 'pointer',
 whiteSpace: 'nowrap',
 transition: 'all 0.2s'
 }}
 onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 0, 0, 0.2)'}
 onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 0, 0, 0.1)'}
 >
 Pain Point
 </button>
 </div>
 </div>
 )}
 <div className="monthly-returns-main-container" style={{ 
   display: 'flex', 
   flexDirection: 'row', 
   width: 'fit-content', 
   gap: '15px',
   alignItems: 'center',
   justifyContent: 'center'
 }}>
 {/* Left column - BULLISH 30-day period */}
 <div className="period-column left-column" style={{ flexShrink: 0 }}>
 {best30DayPeriod && (
 <div className="period-item bullish-period" style={{
   minWidth: '140px',
   maxWidth: '140px',
   padding: '10px 8px',
   borderRadius: '12px',
   border: '2px solid #00FF00',
   background: '#000',
   textAlign: 'center'
 }}>
 <div className="period-label bullish-label" style={{ 
   fontSize: '11px', 
   fontWeight: '800',
   color: '#00FF00',
   marginBottom: '6px',
   letterSpacing: '0.8px'
 }}>BULLISH</div>
 <div className="period-date" style={{ 
   fontSize: '11px',
   color: '#fff',
   marginBottom: '6px',
   lineHeight: '1.2'
 }}>{formatDateRange(best30DayPeriod.period)}</div>
 <div className="period-return bullish" style={{
   fontSize: '16px',
   fontWeight: '900',
   color: '#00FF00',
   padding: '6px 8px',
   borderRadius: '6px',
   background: 'rgba(0, 255, 0, 0.1)'
 }}>{formatPercentage(best30DayPeriod.return)}</div>
 </div>
 )}
 </div>

 {/* Center - Monthly data in 2 rows */}
 <div className="monthly-returns-container" style={{ 
   display: 'flex', 
   flexDirection: 'column', 
   gap: '10px',
   flex: 1
 }}>
 {/* First row - 6 months (Jan-Jun) */}
 <div className="monthly-returns-row" style={{ 
   display: 'flex', 
   flexDirection: 'row', 
   gap: '12px',
   justifyContent: 'center',
   flexWrap: 'nowrap'
 }}>
 {monthlyData.slice(0, 6).map((month, index) => (
 <div 
   key={index} 
   className="monthly-return-item" 
   onClick={() => onMonthClick?.(index, month.month)}
   style={{
   minWidth: '80px',
   maxWidth: '80px',
   padding: '10px 14px',
   borderRadius: '10px',
   border: '1px solid rgba(255, 255, 255, 0.2)',
   background: '#0a0a0a',
   display: 'flex',
   flexDirection: 'column',
   alignItems: 'center',
   cursor: onMonthClick ? 'pointer' : 'default',
   transition: 'all 0.2s'
 }}
   onMouseEnter={(e) => onMonthClick && (e.currentTarget.style.transform = 'scale(1.05)')}
   onMouseLeave={(e) => onMonthClick && (e.currentTarget.style.transform = 'scale(1)')}>
 <div className={getMonthClass(month.month)} style={{ 
   fontSize: '15px',
   fontWeight: '800',
   marginBottom: '8px',
   letterSpacing: '0.5px',
   color: bestMonths.includes(month.month) ? '#00FF00' : worstMonths.includes(month.month) ? '#FF0000' : '#FFFFFF'
 }}>{month.month.toUpperCase()}</div>
 <div className={`return-value ${month.outperformance > 0 ? 'positive' : 'negative'}`} style={{
   fontSize: '17px',
   fontWeight: '800',
   padding: '6px 10px',
   borderRadius: '5px',
   color: month.outperformance > 0 ? '#00FF00' : '#FF0000',
   background: month.outperformance > 0 ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)'
 }}>
 {formatPercentage(month.outperformance)}
 </div>
 </div>
 ))}
 </div>
 
 {/* Second row - 6 months (Jul-Dec) */}
 <div className="monthly-returns-row" style={{ 
   display: 'flex', 
   flexDirection: 'row', 
   gap: '12px',
   justifyContent: 'center',
   flexWrap: 'nowrap'
 }}>
 {monthlyData.slice(6, 12).map((month, index) => (
 <div 
   key={index + 6} 
   className="monthly-return-item"
   onClick={() => onMonthClick?.(index + 6, month.month)}
   style={{
   minWidth: '80px',
   maxWidth: '80px',
   padding: '10px 14px',
   borderRadius: '10px',
   border: '1px solid rgba(255, 255, 255, 0.2)',
   background: '#0a0a0a',
   display: 'flex',
   flexDirection: 'column',
   alignItems: 'center',
   cursor: onMonthClick ? 'pointer' : 'default',
   transition: 'all 0.2s'
 }}
   onMouseEnter={(e) => onMonthClick && (e.currentTarget.style.transform = 'scale(1.05)')}
   onMouseLeave={(e) => onMonthClick && (e.currentTarget.style.transform = 'scale(1)')}>
 <div className={getMonthClass(month.month)} style={{ 
   fontSize: '15px',
   fontWeight: '800',
   marginBottom: '8px',
   letterSpacing: '0.5px',
   color: bestMonths.includes(month.month) ? '#00FF00' : worstMonths.includes(month.month) ? '#FF0000' : '#FFFFFF'
 }}>{month.month.toUpperCase()}</div>
 <div className={`return-value ${month.outperformance > 0 ? 'positive' : 'negative'}`} style={{
   fontSize: '17px',
   fontWeight: '800',
   padding: '6px 10px',
   borderRadius: '5px',
   color: month.outperformance > 0 ? '#00FF00' : '#FF0000',
   background: month.outperformance > 0 ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)'
 }}>
 {formatPercentage(month.outperformance)}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Right column - BEARISH 30-day period */}
 <div className="period-column right-column" style={{ flexShrink: 0 }}>
 {worst30DayPeriod && (
 <div className="period-item bearish-period" style={{
   minWidth: '140px',
   maxWidth: '140px',
   padding: '10px 8px',
   borderRadius: '12px',
   border: '2px solid #FF0000',
   background: '#000',
   textAlign: 'center'
 }}>
 <div className="side-subtitle bearish-label" style={{ 
   fontSize: '11px', 
   fontWeight: '800',
   color: '#FF0000',
   marginBottom: '6px',
   letterSpacing: '0.8px'
 }}>BEARISH</div>
 <div className="period-date" style={{ 
   fontSize: '11px',
   color: '#fff',
   marginBottom: '6px',
   lineHeight: '1.2'
 }}>{formatDateRange(worst30DayPeriod.period)}</div>
 <div className="period-return bearish" style={{
   fontSize: '16px',
   fontWeight: '900',
   color: '#FF0000',
   padding: '6px 8px',
   borderRadius: '6px',
   background: 'rgba(255, 0, 0, 0.1)'
 }}>{formatPercentage(worst30DayPeriod.return)}</div>
 </div>
 )}
 </div>
 </div>
 </div>
 );
};

export default HorizontalMonthlyReturns;
