'use client';

import React from 'react';

interface ChartSettings {
  timeframe: string;
  chartType: 'seasonal' | 'probability' | 'distribution';
  showConfidenceBands: boolean;
  benchmarkSymbol: string;
  selectedYears: number[];
}

interface ChartControlsProps {
  settings: ChartSettings;
  onSettingsChange: (settings: Partial<ChartSettings>) => void;
  availableYears: number[];
}

const ChartControls: React.FC<ChartControlsProps> = ({ 
  settings, 
  onSettingsChange, 
  availableYears 
}) => {
  const timeframes = [
    { value: '1Y', label: '1 Year' },
    { value: '3Y', label: '3 Years' },
    { value: '5Y', label: '5 Years' },
    { value: '10Y', label: '10 Years' },
    { value: '15Y', label: '15 Years' },
    { value: '20Y', label: '20 Years' },
    { value: 'Max', label: 'Max (20Y)' }
  ];

  const benchmarkOptions = [
    { value: 'SPY', label: 'S&P 500 (SPY)' },
    { value: 'QQQ', label: 'NASDAQ 100 (QQQ)' },
    { value: 'DIA', label: 'Dow Jones (DIA)' },
    { value: 'IWM', label: 'Russell 2000 (IWM)' },
    { value: 'VTI', label: 'Total Market (VTI)' }
  ];

  const handleYearToggle = (year: number) => {
    const newSelectedYears = settings.selectedYears.includes(year)
      ? settings.selectedYears.filter(y => y !== year)
      : [...settings.selectedYears, year];
    
    onSettingsChange({ selectedYears: newSelectedYears });
  };

  const handleSelectAllYears = () => {
    onSettingsChange({ selectedYears: availableYears });
  };

  const handleClearAllYears = () => {
    onSettingsChange({ selectedYears: [] });
  };

  return (
    <div className="chart-controls">
      <div className="controls-section">
        <h3>Time Period</h3>
        <div className="timeframe-selector">
          {timeframes.map((tf) => (
            <button
              key={tf.value}
              className={settings.timeframe === tf.value ? 'active' : ''}
              onClick={() => onSettingsChange({ timeframe: tf.value })}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="controls-section">
        <h3>Display Options</h3>
        <div className="display-options">
          <label className="control-item">
            <input
              type="checkbox"
              checked={settings.showConfidenceBands}
              onChange={(e) => onSettingsChange({ showConfidenceBands: e.target.checked })}
            />
            <span>Confidence Bands</span>
          </label>
        </div>
      </div>

      <div className="controls-section">
        <h3>Benchmark Comparison</h3>
        <select
          value={settings.benchmarkSymbol}
          onChange={(e) => onSettingsChange({ benchmarkSymbol: e.target.value })}
          className="benchmark-selector"
        >
          <option value="">No Benchmark</option>
          {benchmarkOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {availableYears.length > 0 && (
        <div className="controls-section">
          <h3>Year Selection</h3>
          <div className="year-controls">
            <div className="year-buttons">
              <button
                onClick={handleSelectAllYears}
                className="year-action-btn"
              >
                Select All
              </button>
              <button
                onClick={handleClearAllYears}
                className="year-action-btn"
              >
                Clear All
              </button>
            </div>
            
            <div className="year-grid">
              {availableYears.slice().reverse().map((year) => (
                <label key={year} className="year-item">
                  <input
                    type="checkbox"
                    checked={settings.selectedYears.includes(year)}
                    onChange={() => handleYearToggle(year)}
                  />
                  <span>{year}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="controls-section">
        <h3>Analysis Tools</h3>
        <div className="analysis-tools">
          <button className="tool-button">
            📈 Add Trend Line
          </button>
          <button className="tool-button">
            📊 Pattern Recognition
          </button>
          <button className="tool-button">
            💾 Export Chart
          </button>
          <button className="tool-button">
            📋 Save Analysis
          </button>
        </div>
      </div>

      <div className="controls-section">
        <h3>Chart Statistics</h3>
        <div className="chart-stats">
          <div className="stat-item">
            <span className="stat-label">Data Points:</span>
            <span className="stat-value">{availableYears.length * 12}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Years Analyzed:</span>
            <span className="stat-value">{availableYears.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Chart Type:</span>
            <span className="stat-value">{settings.chartType}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartControls;
