'use client';

import React from 'react';

interface MonthlyReturn {
 month: number;
 monthName: string;
 avgReturn: number;
 successRate: number;
 bestYear: number;
 worstYear: number;
 standardDev: number;
 occurrences: number;
}

interface SeasonalStatistics {
 bestMonth: { month: string; return: number };
 worstMonth: { month: string; return: number };
 mostConsistent: { month: string; stdDev: number };
 overallReturn: number;
 sharpeRatio: number;
 maxDrawdown: number;
 yearsOfData: number;
 // New statistics
 bestQuarter: { quarter: string; return: number };
 worstQuarter: { quarter: string; return: number };
 best30DayPeriod: { period: string; return: number; startDate: string; endDate: string };
 worst30DayPeriod: { period: string; return: number; startDate: string; endDate: string };
 monthlyVsSPY: { month: string; outperformance: number }[];
}

interface StatisticsPanelProps {
 statistics: SeasonalStatistics;
 monthlyData: MonthlyReturn[];
 symbol: string;
}

const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ 
 statistics, 
 monthlyData, 
 symbol 
}) => {
 const formatPercentage = (value: number): string => {
 return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
 };

 const formatNumber = (value: number, decimals: number = 2): string => {
 return value.toFixed(decimals);
 };

 const getPerformanceColor = (value: number): string => {
 if (value > 2) return '#00ff88';
 if (value > 0) return '#90EE90';
 if (value > -2) return '#FFD700';
 return '#ff6b6b';
 };

 const getSuccessRateColor = (rate: number): string => {
 if (rate >= 70) return '#00ff88';
 if (rate >= 60) return '#90EE90';
 if (rate >= 50) return '#FFD700';
 return '#ff6b6b';
 };

 const sortedMonthsByReturn = [...monthlyData].sort((a, b) => b.avgReturn - a.avgReturn);
 const sortedMonthsBySuccessRate = [...monthlyData].sort((a, b) => b.successRate - a.successRate);
 const sortedMonthsByConsistency = [...monthlyData].sort((a, b) => a.standardDev - b.standardDev);

 return (
 <div className="statistics-panel">
 <div className="panel-header">
 <h2>Seasonal Analysis - {symbol}</h2>
 <div className="data-period">
 Based on {statistics.yearsOfData} years of historical data (Max: 20 years)
 </div>
 </div>

 <div className="stats-grid">
 {/* Key Performance Metrics */}
 <div className="stats-section">
 <h3>Key Performance Metrics</h3>
 <div className="metrics-grid">
 <div className="metric-card">
 <div className="metric-label">Best Performing Month</div>
 <div className="metric-value" style={{ color: getPerformanceColor(statistics.bestMonth.return) }}>
 {statistics.bestMonth.month}
 </div>
 <div className="metric-detail">
 {formatPercentage(statistics.bestMonth.return)} avg return
 </div>
 </div>

 <div className="metric-card">
 <div className="metric-label">Worst Performing Month</div>
 <div className="metric-value" style={{ color: getPerformanceColor(statistics.worstMonth.return) }}>
 {statistics.worstMonth.month}
 </div>
 <div className="metric-detail">
 {formatPercentage(statistics.worstMonth.return)} avg return
 </div>
 </div>

 <div className="metric-card">
 <div className="metric-label">Most Consistent Month</div>
 <div className="metric-value" style={{ color: '#00ff88' }}>
 {statistics.mostConsistent.month}
 </div>
 <div className="metric-detail">
 {formatNumber(statistics.mostConsistent.stdDev)}% std deviation
 </div>
 </div>

 <div className="metric-card">
 <div className="metric-label">Overall Annual Return</div>
 <div className="metric-value" style={{ color: getPerformanceColor(statistics.overallReturn) }}>
 {formatPercentage(statistics.overallReturn)}
 </div>
 <div className="metric-detail">
 Average across all months
 </div>
 </div>

 <div className="metric-card">
 <div className="metric-label">Risk-Adjusted Return</div>
 <div className="metric-value" style={{ color: statistics.sharpeRatio > 1 ? '#00ff88' : '#FFD700' }}>
 {formatNumber(statistics.sharpeRatio)}
 </div>
 <div className="metric-detail">
 Sharpe Ratio
 </div>
 </div>

 <div className="metric-card">
 <div className="metric-label">Maximum Drawdown</div>
 <div className="metric-value" style={{ color: '#ff6b6b' }}>
 {formatPercentage(statistics.maxDrawdown)}
 </div>
 <div className="metric-detail">
 Worst single month
 </div>
 </div>
 </div>
 </div>

 {/* Monthly Performance Table */}
 <div className="stats-section">
 <h3>Monthly Performance Breakdown</h3>
 <div className="monthly-table">
 <div className="table-header">
 <div>Month</div>
 <div>Avg Return</div>
 <div>Success Rate</div>
 <div>Best Year</div>
 <div>Worst Year</div>
 <div>Volatility</div>
 <div>Occurrences</div>
 </div>
 {monthlyData.map((month) => (
 <div key={month.month} className="table-row">
 <div className="month-name">{month.monthName}</div>
 <div 
 className="return-value"
 style={{ color: getPerformanceColor(month.avgReturn) }}
 >
 {formatPercentage(month.avgReturn)}
 </div>
 <div 
 className="success-rate"
 style={{ color: getSuccessRateColor(month.successRate) }}
 >
 {formatNumber(month.successRate, 1)}%
 </div>
 <div 
 className="best-year"
 style={{ color: '#00ff88' }}
 >
 {formatPercentage(month.bestYear)}
 </div>
 <div 
 className="worst-year"
 style={{ color: '#ff6b6b' }}
 >
 {formatPercentage(month.worstYear)}
 </div>
 <div className="volatility">
 {formatNumber(month.standardDev)}%
 </div>
 <div className="occurrences">
 {month.occurrences}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Rankings */}
 <div className="stats-section">
 <h3>Month Rankings</h3>
 <div className="rankings-grid">
 <div className="ranking-column">
 <h4>By Average Return</h4>
 {sortedMonthsByReturn.slice(0, 6).map((month, index) => (
 <div key={month.month} className="ranking-item">
 <span className="rank">#{index + 1}</span>
 <span className="month">{month.monthName}</span>
 <span 
 className="value"
 style={{ color: getPerformanceColor(month.avgReturn) }}
 >
 {formatPercentage(month.avgReturn)}
 </span>
 </div>
 ))}
 </div>

 <div className="ranking-column">
 <h4>By Success Rate</h4>
 {sortedMonthsBySuccessRate.slice(0, 6).map((month, index) => (
 <div key={month.month} className="ranking-item">
 <span className="rank">#{index + 1}</span>
 <span className="month">{month.monthName}</span>
 <span 
 className="value"
 style={{ color: getSuccessRateColor(month.successRate) }}
 >
 {formatNumber(month.successRate, 1)}%
 </span>
 </div>
 ))}
 </div>

 <div className="ranking-column">
 <h4>By Consistency</h4>
 {sortedMonthsByConsistency.slice(0, 6).map((month, index) => (
 <div key={month.month} className="ranking-item">
 <span className="rank">#{index + 1}</span>
 <span className="month">{month.monthName}</span>
 <span className="value">
 {formatNumber(month.standardDev)}% volatility
 </span>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Risk Analysis */}
 <div className="stats-section">
 <h3>Risk Analysis</h3>
 <div className="risk-metrics">
 <div className="risk-item">
 <div className="risk-label">Average Monthly Volatility</div>
 <div className="risk-value">
 {formatNumber(monthlyData.reduce((sum, m) => sum + m.standardDev, 0) / monthlyData.length)}%
 </div>
 </div>
 
 <div className="risk-item">
 <div className="risk-label">Months with Positive Returns</div>
 <div className="risk-value">
 {monthlyData.filter(m => m.avgReturn > 0).length} of 12
 </div>
 </div>
 
 <div className="risk-item">
 <div className="risk-label">Highest Success Rate</div>
 <div className="risk-value">
 {formatNumber(Math.max(...monthlyData.map(m => m.successRate)), 1)}%
 </div>
 </div>
 
 <div className="risk-item">
 <div className="risk-label">Lowest Success Rate</div>
 <div className="risk-value">
 {formatNumber(Math.min(...monthlyData.map(m => m.successRate)), 1)}%
 </div>
 </div>
 </div>
 </div>

 {/* Pattern Validation */}
 <div className="stats-section">
 <h3>Pattern Validation</h3>
 <div className="validation-metrics">
 <div className="validation-item">
 <div className="validation-label">Years of Data</div>
 <div className="validation-value">{statistics.yearsOfData} years</div>
 <div className="validation-status">
 {statistics.yearsOfData >= 10 ? ' Statistically Significant' : ' Limited Data'}
 </div>
 </div>
 
 <div className="validation-item">
 <div className="validation-label">Total Data Points</div>
 <div className="validation-value">{statistics.yearsOfData * 12} months</div>
 <div className="validation-status">
 {statistics.yearsOfData * 12 >= 120 ? ' Robust Sample' : ' Small Sample'}
 </div>
 </div>
 
 <div className="validation-item">
 <div className="validation-label">Pattern Strength</div>
 <div className="validation-value">
 {Math.abs(statistics.sharpeRatio) > 0.5 ? 'Strong' : 'Moderate'}
 </div>
 <div className="validation-status">
 {Math.abs(statistics.sharpeRatio) > 0.5 ? ' Reliable Pattern' : ' Weak Signal'}
 </div>
 </div>
 </div>
 </div>

 {/* Best/Worst Quarters */}
 <div className="stats-section">
 <h3>Quarterly Performance Analysis</h3>
 <div className="quarterly-analysis">
 <div className="quarter-metric">
 <div className="metric-card">
 <div className="metric-label">Best Performing Quarter</div>
 <div className="metric-value" style={{ color: getPerformanceColor(statistics.bestQuarter?.return || 0) }}>
 {statistics.bestQuarter?.quarter || 'Q1'}
 </div>
 <div className="metric-detail">
 {formatPercentage(statistics.bestQuarter?.return || 0)} avg return
 </div>
 </div>
 </div>
 
 <div className="quarter-metric">
 <div className="metric-card">
 <div className="metric-label">Worst Performing Quarter</div>
 <div className="metric-value" style={{ color: getPerformanceColor(statistics.worstQuarter?.return || 0) }}>
 {statistics.worstQuarter?.quarter || 'Q3'}
 </div>
 <div className="metric-detail">
 {formatPercentage(statistics.worstQuarter?.return || 0)} avg return
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Best/Worst 30+ Day Periods */}
 <div className="stats-section">
 <h3>Extended Seasonal Periods (30+ Days)</h3>
 <div className="period-analysis">
 <div className="period-metric">
 <div className="metric-card">
 <div className="metric-label">Best 30+ Day Period</div>
 <div className="metric-value" style={{ color: getPerformanceColor(statistics.best30DayPeriod?.return || 0) }}>
 {statistics.best30DayPeriod?.period || 'Oct 15 - Nov 15'}
 </div>
 <div className="metric-detail">
 {formatPercentage(statistics.best30DayPeriod?.return || 0)} avg return
 </div>
 <div className="metric-dates">
 {statistics.best30DayPeriod?.startDate || 'Oct 15'} to {statistics.best30DayPeriod?.endDate || 'Nov 15'}
 </div>
 </div>
 </div>
 
 <div className="period-metric">
 <div className="metric-card">
 <div className="metric-label">Worst 30+ Day Period</div>
 <div className="metric-value" style={{ color: getPerformanceColor(statistics.worst30DayPeriod?.return || 0) }}>
 {statistics.worst30DayPeriod?.period || 'Sep 1 - Oct 1'}
 </div>
 <div className="metric-detail">
 {formatPercentage(statistics.worst30DayPeriod?.return || 0)} avg return
 </div>
 <div className="metric-dates">
 {statistics.worst30DayPeriod?.startDate || 'Sep 1'} to {statistics.worst30DayPeriod?.endDate || 'Oct 1'}
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Monthly Returns vs SPY */}
 <div className="stats-section">
 <h3>Monthly Performance vs S&P 500</h3>
 <div className="spy-comparison">
 <div className="spy-table">
 <div className="table-header">
 <div>Month</div>
 <div>Stock Return</div>
 <div>SPY Return</div>
 <div>Outperformance</div>
 <div>Status</div>
 </div>
 {monthlyData.map((month, index) => {
 const spyComparison = statistics.monthlyVsSPY?.[index] || { month: month.monthName, outperformance: 0 };
 const spyReturn = month.avgReturn - spyComparison.outperformance;
 const outperformanceColor = spyComparison.outperformance > 0 ? '#00ff88' : '#ff6b6b';
 
 return (
 <div key={month.month} className="table-row">
 <div className="month-name">{month.monthName}</div>
 <div 
 className="stock-return"
 style={{ color: getPerformanceColor(month.avgReturn) }}
 >
 {formatPercentage(month.avgReturn)}
 </div>
 <div 
 className="spy-return"
 style={{ color: getPerformanceColor(spyReturn) }}
 >
 {formatPercentage(spyReturn)}
 </div>
 <div 
 className="outperformance"
 style={{ color: outperformanceColor }}
 >
 {formatPercentage(spyComparison.outperformance)}
 </div>
 <div className="outperformance-status">
 {spyComparison.outperformance > 0 ? ' Outperform' : ' Underperform'}
 </div>
 </div>
 );
 })}
 </div>
 
 <div className="spy-summary">
 <div className="summary-metric">
 <div className="summary-label">Months Outperforming SPY</div>
 <div className="summary-value">
 {(statistics.monthlyVsSPY || []).filter(m => m.outperformance > 0).length} of 12
 </div>
 </div>
 
 <div className="summary-metric">
 <div className="summary-label">Average Outperformance</div>
 <div className="summary-value" style={{ 
 color: (statistics.monthlyVsSPY || []).reduce((sum, m) => sum + m.outperformance, 0) / 12 > 0 ? '#00ff88' : '#ff6b6b' 
 }}>
 {formatPercentage((statistics.monthlyVsSPY || []).reduce((sum, m) => sum + m.outperformance, 0) / 12)}
 </div>
 </div>
 
 <div className="summary-metric">
 <div className="summary-label">Best Outperformance Month</div>
 <div className="summary-value">
 {(statistics.monthlyVsSPY || []).reduce((best, current) => 
 current.outperformance > best.outperformance ? current : best, 
 { month: 'Jan', outperformance: -999 }
 ).month}
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
};

export default StatisticsPanel;
