'use client';

import React from 'react';

interface MonthlyData {
  month: string;
  avgReturn?: number;
  outperformance: number;
}

interface HorizontalMonthlyReturnsProps {
  monthlyData: MonthlyData[];
}

const HorizontalMonthlyReturns: React.FC<HorizontalMonthlyReturnsProps> = ({ monthlyData }) => {
  const formatPercentage = (value: number): string => {
    return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
  };

  if (!monthlyData || monthlyData.length === 0) {
    return null;
  }

  return (
    <div className="horizontal-monthly-returns">
      <div className="monthly-returns-grid">
        {monthlyData.map((month, index) => (
          <div key={index} className="monthly-return-item">
            <div className="month-label">{month.month}</div>
            <div className={`return-value ${month.outperformance > 0 ? 'positive' : 'negative'}`}>
              {formatPercentage(month.outperformance)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HorizontalMonthlyReturns;
