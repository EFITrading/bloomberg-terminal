'use client';

import { useState } from 'react';
import {
  SeasonalityVisualization,
  DataFlowVisualization,
  ChartVisualization,
  MarketRegimeVisualization,
  ScreenerVisualization,
  NeuralAlertVisualization
} from './ToolVisualizations';

export default function ToolsSection() {
  const [hoveredTool, setHoveredTool] = useState<number | null>(null);

  const tools = [
    {
      name: '20-Year Seasonality Engine',
      shortName: 'Seasonality',
      description: 'Historical pattern recognition across two decades of market data. Identify recurring cycles, seasonal trends, and statistical edges with our proprietary backtesting framework.',
      features: ['Pattern Recognition', 'Statistical Backtesting', 'Cycle Analysis'],
      accuracy: '94.7%',
      coverage: '20 Years',
      visualization: <SeasonalityVisualization />
    },
    {
      name: 'Derivative Flow Scanner',
      shortName: 'Options Flow',
      description: 'Real-time options and futures flow analysis. Track institutional positioning, unusual activity, and smart money movements across all major exchanges.',
      features: ['Real-time Scanning', 'Institutional Tracking', 'Flow Analysis'],
      accuracy: '<50ms',
      coverage: 'All Exchanges',
      visualization: <DataFlowVisualization />
    },
    {
      name: 'Advanced Charting Suite',
      shortName: 'Charts',
      description: 'Professional-grade charting with custom indicators, multi-timeframe analysis, and proprietary overlays. No watermarks, no limitations.',
      features: ['Custom Indicators', 'Multi-timeframe', 'No Watermarks'],
      accuracy: 'HD Quality',
      coverage: '200+ Indicators',
      visualization: <ChartVisualization />
    },
    {
      name: 'Market Regime Detection',
      shortName: 'AI Detection',
      description: 'AI-powered identification of bull/bear transitions using machine learning algorithms trained on decades of market microstructure data.',
      features: ['AI-Powered', 'Regime Detection', 'ML Algorithms'],
      accuracy: '91.3%',
      coverage: 'Global Markets',
      visualization: <MarketRegimeVisualization />
    },
    {
      name: 'Institutional Screeners',
      shortName: 'Screeners',
      description: 'Filter 10,000+ securities using 200+ proprietary metrics. Find high-probability setups before the crowd with our advanced screening algorithms.',
      features: ['Advanced Filtering', 'Custom Metrics', 'Real-time Scanning'],
      accuracy: '10,000+',
      coverage: 'Securities',
      visualization: <ScreenerVisualization />
    },
    {
      name: 'Real-time Alerts',
      shortName: 'Alerts',
      description: 'Customizable alerts for options flow, seasonality triggers, technical breakouts, and regime changes. Never miss a critical market move.',
      features: ['Customizable', 'Multi-channel', 'Smart Triggers'],
      accuracy: 'Instant',
      coverage: 'All Events',
      visualization: <NeuralAlertVisualization />
    }
  ];

  return (
    <section className="tools enhanced">
      <div className="section-header">
        <div className="header-badge">
          <div className="badge-dot"></div>
          <span>Professional Suite</span>
        </div>
        <h2 className="section-title">Bloomberg-Grade Trading Arsenal</h2>
        <p className="section-subtitle">
          Enterprise-level analytics platform trusted by hedge funds, investment banks, and institutional traders worldwide
        </p>
      </div>

      <div className="tools-grid enhanced">
        {tools.map((tool, index) => (
          <div 
            key={index} 
            className={`tool-card enhanced ${hoveredTool === index ? 'hovered' : ''}`}
            onMouseEnter={() => setHoveredTool(index)}
            onMouseLeave={() => setHoveredTool(null)}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="tool-header">
              <div className="tool-badge">
                <span className="tool-number">0{index + 1}</span>
              </div>
              <div className="tool-metrics">
                <div className="metric">
                  <span className="metric-value">{tool.accuracy}</span>
                  <span className="metric-label">Accuracy</span>
                </div>
                <div className="metric">
                  <span className="metric-value">{tool.coverage}</span>
                  <span className="metric-label">Coverage</span>
                </div>
              </div>
            </div>

            <div className="tool-visualization enhanced">
              {tool.visualization}
              <div className="viz-overlay">
                <div className="viz-status">
                  <div className="status-indicator"></div>
                  <span>ACTIVE</span>
                </div>
              </div>
            </div>

            <div className="tool-content">
              <h3 className="tool-name">
                <span className="tool-title">{tool.name}</span>
                <svg className="tool-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </h3>
              <p className="tool-description">{tool.description}</p>
              
              <div className="tool-features">
                {tool.features.map((feature, featureIndex) => (
                  <span key={featureIndex} className="feature-tag">
                    {feature}
                  </span>
                ))}
              </div>
            </div>

            <div className="tool-footer">
              <button className="tool-access">
                Access Tool
                <div className="button-glow"></div>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
