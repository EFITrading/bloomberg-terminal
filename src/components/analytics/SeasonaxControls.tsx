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
    hideToggleButtons?: boolean;
    selectedElectionPeriod?: string;
    onElectionPeriodSelect?: (period: string) => void;
    isElectionMode?: boolean;
    onElectionModeToggle?: (isElectionMode: boolean) => void;
    hideCompareButton?: boolean;
    showOnlyElectionAndYear?: boolean;
    availableYears?: number[];
}

const SeasonaxControls: React.FC<SeasonaxControlsProps> = ({
    settings,
    onSettingsChange,
    onRefresh,
    onCompareStock,
    hideToggleButtons = false,
    selectedElectionPeriod = 'Normal Mode',
    onElectionPeriodSelect,
    isElectionMode = false,
    onElectionModeToggle,
    hideCompareButton = true,
    showOnlyElectionAndYear = false,
    availableYears = [1, 3, 5, 10, 15, 20]
}) => {
    const [chartType, setChartType] = useState<'line' | 'bar' | 'candle'>('line');
    const [showCompareDialog, setShowCompareDialog] = useState(false);
    const [compareSymbol, setCompareSymbol] = useState('');
    const [isElectionDropdownOpen, setIsElectionDropdownOpen] = useState(false);

    const electionPeriods = [
        'Normal Mode',
        'Election Year',
        'Post-Election',
        'Mid-Term',
        'Pre-Election'
    ];

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

    const handleElectionClick = () => {
        setIsElectionDropdownOpen(!isElectionDropdownOpen);
        setShowCompareDialog(false);
    };

    const handleElectionPeriodSelect = (period: string) => {
        setIsElectionDropdownOpen(false);

        if (period === 'Normal Mode') {
            onElectionModeToggle?.(false);
        } else {
            onElectionModeToggle?.(true);
            onElectionPeriodSelect?.(period);
        }
    };

    // Chart type toggles
    const handleChartTypeChange = (type: 'line' | 'bar' | 'candle') => {
        setChartType(type);
        // Extend to change chart rendering if needed
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

    // If showOnlyElectionAndYear is true, only render election and year selector
    if (showOnlyElectionAndYear) {
        return (
            <div className="seasonax-controls">
                {/* Election dropdown */}
                <div className="election-dropdown-container" style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                        className={`election-btn ${isElectionMode ? 'active' : 'inactive'}`}
                        onClick={handleElectionClick}
                    >
                        <span className="election-text">{selectedElectionPeriod}</span>
                        <span className="dropdown-arrow">▼</span>
                    </button>
                    {isElectionDropdownOpen && (
                        <div className="election-dropdown">
                            {electionPeriods.map((period) => (
                                <div
                                    key={period}
                                    className={`election-option ${selectedElectionPeriod === period ? 'selected' : ''}`}
                                    onClick={() => handleElectionPeriodSelect(period)}
                                >
                                    {period}
                                </div>
                            ))}
                        </div>
                    )}
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
                        {availableYears.map(year => (
                            <option key={year} value={`${year} years`}>
                                {year} {year === 1 ? 'Year' : 'Years'}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        );
    }

    return (
        <div className="seasonax-controls">
            {/* Compare controls */}
            {!hideCompareButton && (
                <div className="compare-controls">
                    <button
                        className="compare-btn"
                        onClick={handleCompare}
                        title="Compare with another stock"
                    >
                        + Compare
                    </button>

                    {/* Election dropdown */}
                    <div className="election-dropdown-container" style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                            className={`election-btn ${isElectionMode ? 'active' : 'inactive'}`}
                            onClick={handleElectionClick}
                        >
                            <span className="election-text">{selectedElectionPeriod}</span>
                            <span className="dropdown-arrow">▼</span>
                        </button>
                        {isElectionDropdownOpen && (
                            <div className="election-dropdown">
                                {electionPeriods.map((period) => (
                                    <div
                                        key={period}
                                        className={`election-option ${selectedElectionPeriod === period ? 'selected' : ''}`}
                                        onClick={() => handleElectionPeriodSelect(period)}
                                    >
                                        {period}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

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
            )}

            {/* Chart controls */}
            {!hideToggleButtons && (
                <div className="chart-controls">
                    <button
                        className={`control-btn smooth-btn ${settings.smoothing ? 'active' : ''}`}
                        onClick={() => onSettingsChange({ ...settings, smoothing: !settings.smoothing })}
                        title="Smooth abnormal pumps/crashes"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12l6-6 4 4 8-8" />
                            <path d="M21 4v4h-4" />
                        </svg>
                    </button>
                    <button
                        className={`control-btn detrend-btn ${settings.detrend ? 'active' : ''}`}
                        onClick={() => onSettingsChange({ ...settings, detrend: !settings.detrend })}
                        title="Detrend seasonality"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 3l18 18" />
                            <path d="M3 21l7-7 4 4 7-7" />
                        </svg>
                    </button>
                    <button
                        className={`control-btn current-date-btn ${settings.showCurrentDate ? 'active' : ''}`}
                        onClick={() => onSettingsChange({ ...settings, showCurrentDate: !settings.showCurrentDate })}
                        title="Show current date line"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                            <circle cx="12" cy="16" r="2" />
                        </svg>
                    </button>
                </div>
            )}

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
                    <option value="20 years">20 years</option>
                </select>
            </div>

            {/* Refresh button */}
            <div className="more-controls">
                <button
                    className="control-btn"
                    onClick={handleRefresh}
                    title="Refresh data"
                >

                </button>
            </div>
        </div>
    );
};

export default SeasonaxControls;
