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
  rank?: number;
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ pattern, rank }) => {
  // Determine sentiment based on seasonal strength/weakness, not annualized return
  const isSeasonalStrength = pattern.period.toLowerCase().includes('seasonal strength');
  const sentiment = isSeasonalStrength ? 'Bullish' : 'Bearish';
  
  return (
    <div className="opportunity-card">
      {rank && (
        <div className={`card-rank ${isSeasonalStrength ? 'bullish' : 'bearish'}`}>
          {sentiment}
        </div>
      )}
      
      <div className="card-chart">
        <SeasonalChart data={pattern.chartData} />
      </div>
      
      <div className="card-period">
        {pattern.period}
      </div>
      
      <div className="card-dates">
        <span className="start-date">{pattern.startDate}</span>
        <span className="date-separator">→</span>
        <span className="end-date">{pattern.endDate}</span>
      </div>
      
      <div className="card-company">
        {pattern.company}
      </div>
      
      <div className="card-details">
        {pattern.years}y | {pattern.exchange} | {pattern.currency} | {pattern.sector} | {pattern.marketCap}
      </div>
      
      <div className="card-metrics">
        <div className="metric">
          <div className={`metric-value ${pattern.averageReturn >= 0 ? 'positive' : 'negative'}`}>
            {pattern.averageReturn >= 0 ? '+' : ''}{pattern.averageReturn.toFixed(1)}%
          </div>
          <div className="metric-label">Average return</div>
        </div>
        
        <div className="metric">
          <div className={`metric-value ${pattern.winRate >= 50 ? 'positive' : 'negative'}`}>
            {pattern.winRate.toFixed(1)}%
          </div>
          <div className="metric-label">Winning trades</div>
        </div>
      </div>
    </div>
  );
};

export default OpportunityCard;
export { SeasonalChart };
