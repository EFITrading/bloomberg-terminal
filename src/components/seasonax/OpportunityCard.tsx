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
}

const OpportunityCard: React.FC<OpportunityCardProps> = ({ pattern, rank }) => {
  // Determine sentiment from the pattern type or sentiment field
  const patternType = pattern.patternType || '';
  const sentiment = (pattern as any).sentiment || 
    (patternType.toLowerCase().includes('bullish') ? 'Bullish' : 
     patternType.toLowerCase().includes('bearish') ? 'Bearish' : 
     (pattern.averageReturn || pattern.avgReturn || 0) >= 0 ? 'Bullish' : 'Bearish');
  
  const isPositive = sentiment === 'Bullish';
  const daysUntilStart = (pattern as any).daysUntilStart || 0;
  
  // Format the timing information
  const getTimingText = () => {
    if (daysUntilStart === 0) return 'Starts Today';
    if (daysUntilStart === 1) return 'Starts Tomorrow';
    if (daysUntilStart > 0) return `Starts in ${daysUntilStart} days`;
    if (daysUntilStart === -1) return 'Started Yesterday';
    return `Started ${Math.abs(daysUntilStart)} days ago`;
  };
  
  return (
    <div className="opportunity-card seasonal-card">
      <div className="card-header">
        {rank && (
          <div className={`card-rank ${isPositive ? 'bullish' : 'bearish'}`}>
            #{rank}
          </div>
        )}
        <div className={`sentiment-badge ${isPositive ? 'bullish' : 'bearish'}`}>
          {sentiment.toUpperCase()}
        </div>
      </div>
      
      <div className="card-symbol-section">
        <div className="card-symbol">{pattern.symbol}</div>
        <div className="card-company">{pattern.company}</div>
      </div>
      
      <div className="card-timing">
        <div className="timing-text">{getTimingText()}</div>
        <div className="card-period">{pattern.period}</div>
      </div>
      
      <div className="card-chart">
        <SeasonalChart data={pattern.chartData} />
      </div>
      
      <div className="card-dates">
        <span className="start-date">{pattern.startDate}</span>
        <span className="date-separator">→</span>
        <span className="end-date">{pattern.endDate}</span>
      </div>
      
      <div className="card-metrics">
        <div className="metric primary">
          <div className={`metric-value ${(pattern.averageReturn || pattern.avgReturn || 0) >= 0 ? 'positive' : 'negative'}`}>
            {(pattern.averageReturn || pattern.avgReturn || 0) >= 0 ? '+' : ''}{(pattern.averageReturn || pattern.avgReturn || 0).toFixed(1)}%
          </div>
          <div className="metric-label">Expected Return</div>
        </div>
        
        <div className="metric">
          <div className={`metric-value ${pattern.winRate >= 50 ? 'positive' : 'negative'}`}>
            {pattern.winRate.toFixed(0)}%
          </div>
          <div className="metric-label">Win Rate</div>
        </div>
        
        <div className="metric">
          <div className="metric-value neutral">
            {pattern.years}Y
          </div>
          <div className="metric-label">Historical Data</div>
        </div>
      </div>
      
      <div className="card-details">
        {pattern.exchange} | {pattern.currency} | 30-day pattern
      </div>
    </div>
  );
};

export default OpportunityCard;
export { SeasonalChart };
