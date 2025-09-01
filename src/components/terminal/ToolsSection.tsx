'use client';

import {
  SeasonalityVisualization,
  OptionsFlowVisualization,
  ChartVisualization,
  MarketRegimeVisualization,
  ScreenerVisualization,
  NeuralAlertVisualization
} from './ToolVisualizations';

export default function ToolsSection() {
  const tools = [
    {
      name: '20-Year Seasonality Engine',
      description: 'Historical pattern recognition across two decades of market data. Identify recurring cycles, seasonal trends, and statistical edges with our proprietary backtesting framework.',
      visualization: <SeasonalityVisualization />
    },
    {
      name: 'Derivative Flow Scanner',
      description: 'Real-time options and futures flow analysis. Track institutional positioning, unusual activity, and smart money movements across all major exchanges.',
      visualization: <OptionsFlowVisualization />
    },
    {
      name: 'Advanced Charting Suite',
      description: 'Professional-grade charting with custom indicators, multi-timeframe analysis, and proprietary overlays. No watermarks, no limitations.',
      visualization: <ChartVisualization />
    },
    {
      name: 'Market Regime Detection',
      description: 'AI-powered identification of bull/bear transitions using machine learning algorithms trained on decades of market microstructure data.',
      visualization: <MarketRegimeVisualization />
    },
    {
      name: 'Institutional Screeners',
      description: 'Filter 10,000+ securities using 200+ proprietary metrics. Find high-probability setups before the crowd with our advanced screening algorithms.',
      visualization: <ScreenerVisualization />
    },
    {
      name: 'Real-time Alerts',
      description: 'Customizable alerts for options flow, seasonality triggers, technical breakouts, and regime changes. Never miss a critical market move.',
      visualization: <NeuralAlertVisualization />
    }
  ];

  return (
    <section className="tools">
      <div className="section-header">
        <h2 className="section-title">Professional Trading Arsenal</h2>
        <p className="section-subtitle">Advanced tools designed for institutional-level analysis</p>
      </div>

      <div className="tools-grid">
        {tools.map((tool, index) => (
          <div key={index} className="tool-card">
            <div className="tool-visualization">
              {tool.visualization}
            </div>
            <h3 className="tool-name">{tool.name}</h3>
            <p className="tool-description">{tool.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
