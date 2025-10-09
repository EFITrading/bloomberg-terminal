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
}

const HorizontalMonthlyReturns: React.FC<HorizontalMonthlyReturnsProps> = ({ monthlyData, best30DayPeriod, worst30DayPeriod }) => {
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

  const getMonthTextColor = (month: string): string => {
    if (bestMonths.includes(month)) return '#00FF00 !important'; // Crispy green for best months
    if (worstMonths.includes(month)) return '#FF0000 !important'; // Crispy red for worst months
    return '#FFFFFF !important'; // White for neutral months
  };

  const getMonthClass = (month: string): string => {
    if (bestMonths.includes(month)) return 'month-label best-month';
    if (worstMonths.includes(month)) return 'month-label worst-month';
    return 'month-label';
  };

  if (!monthlyData || monthlyData.length === 0) {
    return null;
  }

  return (
    <div className="horizontal-monthly-returns">
      <div className="monthly-returns-main-container">
        {/* Left column - BULLISH 30-day period */}
        <div className="period-column left-column">
          {best30DayPeriod && (
            <div className="period-item bullish-period">
                            <div 
                className="period-label bullish-label"
                style={{ 
                  color: '#00FF00',
                  fontWeight: 'bold'
                }}
              >
                BULLISH
              </div>
              <div className="period-date">{formatDateRange(best30DayPeriod.period)}</div>
              <div className="period-return bullish">{formatPercentage(best30DayPeriod.return)}</div>
            </div>
          )}
        </div>

        {/* Center - Monthly data in 2 rows */}
        <div className="monthly-returns-container">
          {/* First row - 6 months (Jan-Jun) */}
          <div className="monthly-returns-row">
            {monthlyData.slice(0, 6).map((month, index) => (
              <div key={index} className="monthly-return-item">
                <div className={getMonthClass(month.month)} style={{ color: getMonthTextColor(month.month).replace(' !important', '') }}>{month.month}</div>
                <div className={`return-value ${month.outperformance > 0 ? 'positive' : 'negative'}`}>
                  {formatPercentage(month.outperformance)}
                </div>
              </div>
            ))}
          </div>
          
          {/* Second row - 6 months (Jul-Dec) */}
          <div className="monthly-returns-row">
            {monthlyData.slice(6, 12).map((month, index) => (
              <div key={index + 6} className="monthly-return-item">
                <div className={getMonthClass(month.month)} style={{ color: getMonthTextColor(month.month).replace(' !important', '') }}>{month.month}</div>
                <div className={`return-value ${month.outperformance > 0 ? 'positive' : 'negative'}`}>
                  {formatPercentage(month.outperformance)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column - BEARISH 30-day period */}
        <div className="period-column right-column">
          {worst30DayPeriod && (
            <div className="period-item bearish-period">
              <div className="side-subtitle bearish-label" style={{ color: '#FF0000', fontWeight: 'bold' }}>BEARISH</div>
              <div className="period-date">{formatDateRange(worst30DayPeriod.period)}</div>
              <div className="period-return bearish">{formatPercentage(worst30DayPeriod.return)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HorizontalMonthlyReturns;
