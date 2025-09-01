import React from 'react';
import { SeasonalPattern } from '@/lib/polygonService';

interface SeasonalChartProps {
  data: Array<{ period: string; return: number }>;
  height?: number;
}

const SeasonalChart: React.FC<SeasonalChartProps> = ({ data, height = 40 }) => {
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
              backgroundColor: isPositive ? '#00BCD4' : '#FF5252',
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
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ pattern }) => {
  return (
    <div className="opportunity-card">
      <div className="card-chart">
        <SeasonalChart data={pattern.chartData} />
      </div>
      
      <div className="card-period">
        {pattern.period}
      </div>
      
      <div className="card-company">
        {pattern.company}
      </div>
      
      <div className="card-details">
        {pattern.years}y | {pattern.exchange} | {pattern.currency} | {pattern.sector} | {pattern.marketCap}
      </div>
      
      <div className="card-metrics">
        <div className="metric">
          <div className="metric-value positive">
            +{pattern.annualizedReturn.toFixed(1)}%
          </div>
          <div className="metric-label">Annualized return</div>
        </div>
        
        <div className="metric">
          <div className="metric-value positive">
            +{pattern.winRate.toFixed(1)}%
          </div>
          <div className="metric-label">Winning trades</div>
        </div>
      </div>
    </div>
  );
};

export default OpportunityCard;
export { SeasonalChart };
