import React from 'react';
import { SeasonalPattern } from '@/lib/polygonService';
import { SeasonalChart } from './OpportunityCard';

interface FeaturedPatternsProps {
  patterns: SeasonalPattern[];
}

const FeaturedPatterns: React.FC<FeaturedPatternsProps> = ({ patterns }) => {
  return (
    <div className="featured-patterns-section">
      <div className="featured-background">
        <div className="featured-waves"></div>
      </div>
      
      <div className="featured-content">
        <h2 className="featured-title">Featured patterns</h2>
        <p className="featured-subtitle">
          Explore our hand-picked patterns of the month!
        </p>
        
        <div className="featured-grid">
          {patterns.map((pattern, index) => (
            <div key={index} className="featured-card">
              <div className="featured-chart">
                <SeasonalChart data={pattern.chartData} height={50} />
              </div>
              
              <div className="featured-period">
                {pattern.period}
              </div>
              
              <div className="featured-symbol">
                {pattern.symbol}
              </div>
              
              <div className="featured-company">
                {pattern.company}
              </div>
              
              <div className="featured-metrics">
                <div className="featured-metric">
                  <span className="metric-value positive">
                    +{pattern.annualizedReturn.toFixed(1)}%
                  </span>
                  <span className="metric-label">Return</span>
                </div>
                
                <div className="featured-metric">
                  <span className="metric-value positive">
                    {pattern.winRate.toFixed(0)}%
                  </span>
                  <span className="metric-label">Win Rate</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FeaturedPatterns;
