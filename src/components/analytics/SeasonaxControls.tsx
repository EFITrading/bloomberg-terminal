'use client';

import React, { useState } from 'react';

interface ChartSettings {
  startDate: string;
  endDate: string;
  yearsOfData: number;
  showCumulative: boolean;
  showPatternReturns: boolean;
  selectedYears: number[];
  smoothing: boolean;
  detrend: boolean;
  showCurrentDate: boolean;
  comparisonSymbols: string[];
}

interface SeasonaxControlsProps {
  settings: ChartSettings;
  onSettingsChange: (settings: Partial<ChartSettings>) => void;
  onRefresh?: () => void;
  onCompareStock?: (symbol: string) => void;
}

const SeasonaxControls: React.FC<SeasonaxControlsProps> = ({ 
  settings, 
  onSettingsChange,
  onRefresh,
  onCompareStock
}) => {
  const [chartType, setChartType] = useState<'line' | 'bar' | 'candle'>('line');
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [compareSymbol, setCompareSymbol] = useState('');

  // Compare functions
  const handleCompare = () => {
    setShowCompareDialog(true);
  };

  const handleAddCompareStock = () => {
    if (compareSymbol.trim() && onCompareStock) {
      onCompareStock(compareSymbol.trim().toUpperCase());
      setCompareSymbol('');
      setShowCompareDialog(false);
    }
  };

  const handleRemoveCompareStock = (symbolToRemove: string) => {
    const updatedSymbols = settings.comparisonSymbols.filter(symbol => symbol !== symbolToRemove);
    onSettingsChange({ comparisonSymbols: updatedSymbols });
  };

  // Chart type toggles
  const handleChartTypeChange = (type: 'line' | 'bar' | 'candle') => {
    setChartType(type);
    // You can extend this to actually change chart rendering
    console.log(`Chart type changed to: ${type}`);
  };

  // Toggle chart elements
  const toggleCumulative = () => {
    onSettingsChange({ showCumulative: !settings.showCumulative });
  };

  const togglePatternReturns = () => {
    onSettingsChange({ showPatternReturns: !settings.showPatternReturns });
  };

  const handleRefresh = () => {
    onRefresh?.();
    console.log('Refreshing data...');
  };

  // Export functions
  const handleExport = () => {
    console.log('Exporting chart...');
    // Add export functionality here
  };

  return (
    <div className="seasonax-controls">
      {/* Compare controls */}
      <div className="compare-controls">
        <button 
          className="compare-btn" 
          onClick={handleCompare}
          title="Compare with another stock"
        >
          + Compare
        </button>
        {settings.comparisonSymbols.length > 0 && (
          <div className="comparison-tags">
            {settings.comparisonSymbols.map((symbol, index) => (
              <div key={index} className="comparison-tag">
                <span>{symbol}</span>
                <button 
                  onClick={() => handleRemoveCompareStock(symbol)}
                  className="remove-tag"
                  title={`Remove ${symbol}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        {showCompareDialog && (
          <div className="compare-dialog">
            <div className="dialog-content">
              <input
                type="text"
                value={compareSymbol}
                onChange={(e) => setCompareSymbol(e.target.value.toUpperCase())}
                placeholder="Enter stock symbol (e.g., AAPL)"
                className="compare-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddCompareStock();
                  } else if (e.key === 'Escape') {
                    setShowCompareDialog(false);
                    setCompareSymbol('');
                  }
                }}
                autoFocus
              />
              <div className="dialog-buttons">
                <button onClick={handleAddCompareStock} className="add-btn">Add</button>
                <button onClick={() => setShowCompareDialog(false)} className="cancel-btn">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart controls */}
      <div className="chart-controls">
        <button 
          className={`control-btn ${settings.smoothing ? 'active' : ''}`}
          onClick={() => onSettingsChange({...settings, smoothing: !settings.smoothing})}
          title="Smooth abnormal pumps/crashes"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17l6-6 4 4 8-8v4h2V7h-4v2l-6 6-4-4-6 6z"/>
          </svg>
        </button>
        <button 
          className={`control-btn ${settings.detrend ? 'active' : ''}`}
          onClick={() => onSettingsChange({...settings, detrend: !settings.detrend})}
          title="Detrend seasonality"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm2 4v-2H3c0 1.1.89 2 2 2zM3 9h2V7H3v2zm12 12h2v-2h-2v2zm4-18H9c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H9V5h10v10zm-8-2h6V9h-6v4z"/>
          </svg>
        </button>
        <button 
          className={`control-btn ${settings.showCurrentDate ? 'active' : ''}`}
          onClick={() => onSettingsChange({...settings, showCurrentDate: !settings.showCurrentDate})}
          title="Show current date line"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
          </svg>
        </button>
      </div>

      {/* Date range selector */}
      <div className="date-range">
        <select 
          value={`${settings.yearsOfData} years`}
          onChange={(e) => {
            const years = parseInt(e.target.value.split(' ')[0]);
            onSettingsChange({ yearsOfData: Math.min(years, 20) });
          }}
          className="date-select"
          title="Select data period"
        >
          <option value="1 years">1 year</option>
          <option value="3 years">3 years</option>
          <option value="5 years">5 years</option>
          <option value="10 years">10 years</option>
          <option value="15 years">15 years</option>
          <option value="20 years">20 years (Max)</option>
        </select>
      </div>

      {/* Refresh button */}
      <div className="more-controls">
        <button 
          className="control-btn"
          onClick={handleRefresh}
          title="Refresh data"
        >
          🔄
        </button>
      </div>
    </div>
  );
};

export default SeasonaxControls;
