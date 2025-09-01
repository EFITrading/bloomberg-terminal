'use client';

import React, { useState, useEffect, useRef } from 'react';

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
}

interface SeasonaxControlsProps {
  settings: ChartSettings;
  onSettingsChange: (settings: Partial<ChartSettings>) => void;
  onRefresh?: () => void;
  onDateRangeChange?: (direction: 'prev' | 'next') => void;
}

const SeasonaxControls: React.FC<SeasonaxControlsProps> = ({ 
  settings, 
  onSettingsChange,
  onRefresh,
  onDateRangeChange
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [chartType, setChartType] = useState<'line' | 'bar' | 'candle'>('line');
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);

  // Navigation functions
  const handlePrevious = () => {
    onDateRangeChange?.('prev');
  };

  const handleNext = () => {
    onDateRangeChange?.('next');
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

  // More menu actions
  const handleMoreMenu = () => {
    setShowMoreMenu(!showMoreMenu);
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
      {/* Navigation arrows */}
      <div className="nav-controls">
        <button 
          className="nav-btn" 
          onClick={handlePrevious}
          title="Previous date range"
        >
          ←
        </button>
        <button 
          className="nav-btn" 
          onClick={handleNext}
          title="Next date range"
        >
          →
        </button>
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

      {/* More controls */}
      <div className="more-controls">
        <div className="more-dropdown" ref={moreMenuRef}>
          <button 
            className={`control-btn ${showMoreMenu ? 'active' : ''}`}
            onClick={handleMoreMenu}
            title="More options"
          >
            More ▼
          </button>
          
          {showMoreMenu && (
            <div className="more-menu">
              <button 
                className="menu-item"
                onClick={toggleCumulative}
              >
                {settings.showCumulative ? '✓' : '○'} Cumulative Profit
              </button>
              <button 
                className="menu-item"
                onClick={togglePatternReturns}
              >
                {settings.showPatternReturns ? '✓' : '○'} Pattern Returns
              </button>
              <div className="menu-divider"></div>
              <button 
                className="menu-item"
                onClick={handleExport}
              >
                📥 Export Data
              </button>
              <button 
                className="menu-item"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  console.log('Link copied to clipboard');
                }}
              >
                🔗 Copy Link
              </button>
            </div>
          )}
        </div>
        
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
