'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  TbChartLine, 
  TbNews, 
  TbBellRinging, 
  TbMessageCircle, 
  TbTrendingUp,
  TbX,
  TbSend,
  TbPhoto,
  TbUser,
  TbLock
} from 'react-icons/tb';
import { IndustryAnalysisService, MarketRegimeData, IndustryPerformance, TimeframeAnalysis } from '../../lib/industryAnalysisService';

// Add custom styles for 3D carved effect
const carvedTextStyles = `
  .text-shadow-carved {
    text-shadow: 
      1px 1px 0px rgba(0, 0, 0, 0.9),
      -1px -1px 0px rgba(255, 255, 255, 0.1),
      0px -1px 0px rgba(255, 255, 255, 0.05),
      0px 1px 0px rgba(0, 0, 0, 0.8);
  }
  
  .glow-yellow {
    text-shadow: 0 0 5px rgba(255, 255, 0, 0.5), 0 0 10px rgba(255, 255, 0, 0.3);
  }
  
  .glow-green {
    text-shadow: 0 0 5px rgba(0, 255, 0, 0.5), 0 0 10px rgba(0, 255, 0, 0.3);
  }
  
  .glow-red {
    text-shadow: 0 0 5px rgba(255, 0, 0, 0.5), 0 0 10px rgba(255, 0, 0, 0.3);
  }
`;

// TradingView-style Chart Data Interface
interface ChartDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: string;
  time: string;
}

// Drawing types for proper TypeScript support
interface DrawingPoint {
  x: number;
  y: number;
  // TradingView-style time+price coordinates for absolute positioning
  timestamp?: number;   // Actual timestamp for precise anchoring
  price?: number;       // Actual price for precise anchoring
}

// Data coordinates for persistent drawings
interface DataPoint {
  candleIndex: number;
  price: number;
}

interface DrawingMetadata {
  [key: string]: unknown;
}

// Specific metadata interfaces for different drawing types
interface MeasureDrawingMetadata extends DrawingMetadata {
  distance: number;
  angle: number;
  priceDistance: number;
}

interface PolygonDataItem {
  c: number;
  h: number;
  l: number;
  o: number;
  t: number;
  v: number;
  vw: number;
  n: number;
}

// TradingView-style Chart Configuration
interface ChartConfig {
  symbol: string;
  timeframe: string;
  chartType: 'candlestick' | 'line';
  theme: 'dark' | 'light';
  indicators: string[];
  drawings: Drawing[];
  volume: boolean;
  crosshair: boolean;
  timezone: string;
  showGrid: boolean;
  axisStyle: {
    xAxis: {
      textSize: number;
      textColor: string;
    };
    yAxis: {
      textSize: number;
      textColor: string;
    };
  };
  colors: {
    bullish: {
      body: string;
      wick: string;
      border: string;
    };
    bearish: {
      body: string;
      wick: string;
      border: string;
    };
    volume: {
      bullish: string;
      bearish: string;
    };
  };
}

// Drawing Style Interface
interface DrawingStyle {
  color?: string;
  lineWidth?: number;
  lineDash?: number[];
  fillOpacity?: number;
  textSize?: number;
  showLabels?: boolean;
  showLevels?: boolean;
}

// Enhanced TradingView-style Drawing interface with all professional features
interface Drawing {
  id: string | number;
  type: string;
  name?: string;
  
  // Time/Price Coordinates (TradingView standard)
  startTimestamp?: number;
  startPrice?: number;
  endTimestamp?: number;
  endPrice?: number;
  timestamp?: number;  // For single-point drawings
  price?: number;      // For single-point drawings
  
  // Multi-point drawings (patterns, etc.)
  points?: DrawingPoint[];
  
  // Text and annotations
  text?: string;
  richText?: {
    content: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    textAlign: 'left' | 'center' | 'right';
    verticalAlign: 'top' | 'middle' | 'bottom';
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    padding?: number;
  };
  
  // Enhanced styling with full TradingView feature set
  style?: {
    color: string;
    lineWidth: number;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    fillColor?: string;
    fillOpacity?: number;
    transparency?: number;
    
    // Line specific
    extendLeft?: boolean;
    extendRight?: boolean;
    showPriceLabels?: boolean;
    showTimeLabels?: boolean;
    
    // Text specific
    textColor?: string;
    fontSize?: number;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
    
    // Shape specific
    borderColor?: string;
    borderWidth?: number;
    cornerRadius?: number;
    
    // Legacy compatibility
    lineDash?: number[];
    textSize?: number;
    showLabels?: boolean;
    showLevels?: boolean;
    
    // Advanced
    zIndex?: number;
    locked?: boolean;
    visible?: boolean;
    selected?: boolean;
  };
  
  // Drawing state and metadata
  metadata?: DrawingMetadata & {
    createdAt?: number;
    updatedAt?: number;
    version?: number;
    creator?: string;
    description?: string;
    tags?: string[];
  };
  
  // Interaction state
  isSelected?: boolean;
  isHovered?: boolean;
  isEditing?: boolean;
  isLocked?: boolean;
  isDragging?: boolean;
  
  // Drawing-specific properties
  channelWidth?: number;
  arrowHead?: 'none' | 'start' | 'end' | 'both';
  patternType?: string;
  
  // Legacy compatibility
  startPoint?: DrawingPoint;
  endPoint?: DrawingPoint;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  time?: number;
  price1?: number;
  time1?: number;
  price2?: number;
  time2?: number;
  startDataPoint?: DataPoint;
  endDataPoint?: DataPoint;
  dataPoints?: DataPoint[];
  absoluteScreenY?: number;
  clickX?: number;
  clickY?: number;
}

// TradingView Professional Timeframes with extensive historical data
const TRADINGVIEW_TIMEFRAMES = [
  { label: '1m', value: '1m', lookback: 7 }, // 7 days for 1-minute data
  { label: '5m', value: '5m', lookback: 30 }, // 30 days for 5-minute data
  { label: '15m', value: '15m', lookback: 90 }, // 90 days for 15-minute data  
  { label: '30m', value: '30m', lookback: 180 }, // 180 days for 30-minute data
  { label: '1H', value: '1h', lookback: 365 }, // 1 year for hourly data
  { label: '4H', value: '4h', lookback: 1095 }, // 3 years for 4-hour data
  { label: '1D', value: '1d', lookback: 5475 }, // 15 years for daily data (like TradingView Pro)
  { label: '1W', value: '1w', lookback: 7300 }, // 20 years for weekly data
  { label: '1M', value: '1mo', lookback: 10950 }, // 30 years for monthly data
  { label: '1M', value: '1mo', lookback: 3650 } // 10 years for monthly data
];

// Chart Types
const MAIN_CHART_TYPES = [
  { 
    label: 'Candles', 
    value: 'candlestick', 
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        {/* Candlestick 1 */}
        <line x1="3" y1="2" x2="3" y2="14" stroke="currentColor" strokeWidth="1"/>
        <rect x="2" y="4" width="2" height="4" fill="currentColor"/>
        
        {/* Candlestick 2 */}
        <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1"/>
        <rect x="6" y="3" width="2" height="6" fill="none" stroke="currentColor" strokeWidth="1"/>
        
        {/* Candlestick 3 */}
        <line x1="11" y1="3" x2="11" y2="15" stroke="currentColor" strokeWidth="1"/>
        <rect x="10" y="5" width="2" height="3" fill="currentColor"/>
      </svg>
    )
  },
  { 
    label: 'Line', 
    value: 'line', 
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path 
          d="M1 13 L4 9 L7 11 L10 6 L13 8 L15 4" 
          stroke="currentColor" 
          strokeWidth="2" 
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Add small dots at connection points */}
        <circle cx="1" cy="13" r="1.5" fill="currentColor"/>
        <circle cx="4" cy="9" r="1.5" fill="currentColor"/>
        <circle cx="7" cy="11" r="1.5" fill="currentColor"/>
        <circle cx="10" cy="6" r="1.5" fill="currentColor"/>
        <circle cx="13" cy="8" r="1.5" fill="currentColor"/>
        <circle cx="15" cy="4" r="1.5" fill="currentColor"/>
      </svg>
    )
  }
];

const DROPDOWN_CHART_TYPES: { label: string; value: string; icon: string }[] = [
  // Only Candlestick and Line chart types are now supported
];

const CHART_TYPES = [...MAIN_CHART_TYPES, ...DROPDOWN_CHART_TYPES];

// Technical Indicators
const INDICATORS = [
  { label: 'Flow Algo', value: 'flowalgo', category: 'flow' },
  { label: 'GEX', value: 'gex', category: 'gamma' }
];

// ✨ TradingView-Style Drawing Properties Panel Component
interface DrawingPropertiesPanelProps {
  selectedDrawing: Drawing | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedDrawing: Partial<Drawing>) => void;
  position: { x: number; y: number };
}

const DrawingPropertiesPanel: React.FC<DrawingPropertiesPanelProps> = ({
  selectedDrawing,
  isOpen,
  onClose,
  onUpdate,
  position
}) => {
  const [activeTab, setActiveTab] = useState<'style' | 'text' | 'coordinates'>('style');
  
  if (!isOpen || !selectedDrawing) return null;

  const updateStyle = (styleUpdates: Partial<Drawing['style']>) => {
    const currentStyle = selectedDrawing.style || {
      color: '#FFFF00',
      lineWidth: 2,
      lineStyle: 'solid' as const
    };
    onUpdate({
      style: {
        ...currentStyle,
        color: currentStyle.color || '#FFFF00',
        lineWidth: currentStyle.lineWidth || 2,
        lineStyle: currentStyle.lineStyle || 'solid',
        ...styleUpdates
      } as Drawing['style']
    });
  };

  const updateText = (textUpdates: Partial<Drawing['richText']>) => {
    onUpdate({
      richText: {
        ...selectedDrawing.richText,
        ...textUpdates
      } as Drawing['richText']
    });
  };

  return (
    <div 
      className="fixed z-[9999] bg-[#131722] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[300px] max-w-[400px]"
      style={{ 
        left: Math.min(position.x, window.innerWidth - 320), 
        top: Math.min(position.y, window.innerHeight - 400),
        maxHeight: '400px'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[#2a2e39]">
        <h3 className="text-white text-sm font-medium">Drawing Properties</h3>
        <button 
          onClick={onClose}
          className="text-[#868993] hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a2e39]">
        {[
          { id: 'style', label: 'Style', icon: '🎨' },
          { id: 'text', label: 'Text', icon: 'T' },
          { id: 'coordinates', label: 'Position', icon: '📍' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id 
                ? 'text-[#2962ff] border-b-2 border-[#2962ff] bg-[#1e222d]' 
                : 'text-[#868993] hover:text-white'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3 max-h-[300px] overflow-y-auto">
        {activeTab === 'style' && (
          <div className="space-y-4">
            {/* Color Picker */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Line Color</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={selectedDrawing.style?.color || '#00ff88'}
                  onChange={(e) => updateStyle({ color: e.target.value })}
                  className="w-8 h-8 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={selectedDrawing.style?.color || '#00ff88'}
                  onChange={(e) => updateStyle({ color: e.target.value })}
                  className="flex-1 px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
                  placeholder="#00ff88"
                />
              </div>
            </div>

            {/* Line Width */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Line Width</label>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={selectedDrawing.style?.lineWidth || 2}
                  onChange={(e) => updateStyle({ lineWidth: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-white w-6 text-center">
                  {selectedDrawing.style?.lineWidth || 2}
                </span>
              </div>
            </div>

            {/* Line Style */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Line Style</label>
              <select
                value={selectedDrawing.style?.lineStyle || 'solid'}
                onChange={(e) => updateStyle({ lineStyle: e.target.value as any })}
                className="w-full px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>

            {/* Fill Options */}
            {['rectangle', 'circle', 'ellipse'].includes(selectedDrawing.type) && (
              <>
                <div>
                  <label className="block text-xs text-[#868993] mb-2">Fill Color</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={selectedDrawing.style?.fillColor || '#00ff8844'}
                      onChange={(e) => updateStyle({ fillColor: e.target.value })}
                      className="w-8 h-8 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={selectedDrawing.style?.fillColor || '#00ff8844'}
                      onChange={(e) => updateStyle({ fillColor: e.target.value })}
                      className="flex-1 px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
                      placeholder="#00ff8844"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#868993] mb-2">Fill Opacity</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={selectedDrawing.style?.fillOpacity || 0.1}
                      onChange={(e) => updateStyle({ fillOpacity: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-xs text-white w-8 text-center">
                      {Math.round((selectedDrawing.style?.fillOpacity || 0.1) * 100)}%
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Extensions for lines */}
            {['trend_line', 'horizontal_line'].includes(selectedDrawing.type) && (
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedDrawing.style?.extendLeft || false}
                    onChange={(e) => updateStyle({ extendLeft: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-xs text-white">Extend Left</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedDrawing.style?.extendRight || false}
                    onChange={(e) => updateStyle({ extendRight: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-xs text-white">Extend Right</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedDrawing.style?.showPriceLabels || false}
                    onChange={(e) => updateStyle({ showPriceLabels: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-xs text-white">Show Price Labels</span>
                </label>
              </div>
            )}
          </div>
        )}

        {activeTab === 'text' && (
          <div className="space-y-4">
            {/* Text Content */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Text</label>
              <textarea
                value={selectedDrawing.text || selectedDrawing.richText?.content || ''}
                onChange={(e) => {
                  onUpdate({ text: e.target.value });
                  updateText({ content: e.target.value });
                }}
                className="w-full px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white resize-none"
                rows={3}
                placeholder="Enter text..."
              />
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Font Size</label>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="8"
                  max="32"
                  value={selectedDrawing.richText?.fontSize || selectedDrawing.style?.fontSize || 12}
                  onChange={(e) => {
                    const size = parseInt(e.target.value);
                    updateText({ fontSize: size });
                    updateStyle({ fontSize: size });
                  }}
                  className="flex-1"
                />
                <span className="text-xs text-white w-6 text-center">
                  {selectedDrawing.richText?.fontSize || selectedDrawing.style?.fontSize || 12}
                </span>
              </div>
            </div>

            {/* Font Family */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Font</label>
              <select
                value={selectedDrawing.richText?.fontFamily || selectedDrawing.style?.fontFamily || 'Arial'}
                onChange={(e) => {
                  updateText({ fontFamily: e.target.value });
                  updateStyle({ fontFamily: e.target.value });
                }}
                className="w-full px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
              >
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Georgia">Georgia</option>
              </select>
            </div>

            {/* Font Style */}
            <div className="flex space-x-2">
              <label className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedDrawing.richText?.fontWeight === 'bold' || selectedDrawing.style?.bold || false}
                  onChange={(e) => {
                    updateText({ fontWeight: e.target.checked ? 'bold' : 'normal' });
                    updateStyle({ bold: e.target.checked });
                  }}
                  className="rounded"
                />
                <span className="text-xs text-white font-bold">B</span>
              </label>
              <label className="flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={selectedDrawing.richText?.fontStyle === 'italic' || selectedDrawing.style?.italic || false}
                  onChange={(e) => {
                    updateText({ fontStyle: e.target.checked ? 'italic' : 'normal' });
                    updateStyle({ italic: e.target.checked });
                  }}
                  className="rounded"
                />
                <span className="text-xs text-white italic">I</span>
              </label>
            </div>

            {/* Text Color */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Text Color</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={selectedDrawing.richText?.backgroundColor || selectedDrawing.style?.textColor || '#ffffff'}
                  onChange={(e) => {
                    updateText({ backgroundColor: e.target.value });
                    updateStyle({ textColor: e.target.value });
                  }}
                  className="w-8 h-8 rounded border border-[#2a2e39] bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={selectedDrawing.richText?.backgroundColor || selectedDrawing.style?.textColor || '#ffffff'}
                  onChange={(e) => {
                    updateText({ backgroundColor: e.target.value });
                    updateStyle({ textColor: e.target.value });
                  }}
                  className="flex-1 px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
                  placeholder="#ffffff"
                />
              </div>
            </div>

            {/* Text Alignment */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Text Alignment</label>
              <div className="flex space-x-1">
                {[
                  { value: 'left', icon: '⬅️' },
                  { value: 'center', icon: '↔️' },
                  { value: 'right', icon: '➡️' }
                ].map(align => (
                  <button
                    key={align.value}
                    onClick={() => updateText({ textAlign: align.value as any })}
                    className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                      (selectedDrawing.richText?.textAlign || 'left') === align.value
                        ? 'bg-[#2962ff] text-white'
                        : 'bg-[#1e222d] text-[#868993] hover:text-white'
                    }`}
                  >
                    {align.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'coordinates' && (
          <div className="space-y-4">
            {/* Time/Price Coordinates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[#868993] mb-1">Start Time</label>
                <input
                  type="datetime-local"
                  value={selectedDrawing.startTimestamp ? new Date(selectedDrawing.startTimestamp).toISOString().slice(0, 16) : ''}
                  onChange={(e) => onUpdate({ startTimestamp: new Date(e.target.value).getTime() })}
                  className="w-full px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-[#868993] mb-1">Start Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={selectedDrawing.startPrice || ''}
                  onChange={(e) => onUpdate({ startPrice: parseFloat(e.target.value) })}
                  className="w-full px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
                />
              </div>
              {selectedDrawing.endTimestamp !== undefined && (
                <>
                  <div>
                    <label className="block text-xs text-[#868993] mb-1">End Time</label>
                    <input
                      type="datetime-local"
                      value={selectedDrawing.endTimestamp ? new Date(selectedDrawing.endTimestamp).toISOString().slice(0, 16) : ''}
                      onChange={(e) => onUpdate({ endTimestamp: new Date(e.target.value).getTime() })}
                      className="w-full px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#868993] mb-1">End Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedDrawing.endPrice || ''}
                      onChange={(e) => onUpdate({ endPrice: parseFloat(e.target.value) })}
                      className="w-full px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Lock/Unlock Drawing */}
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedDrawing.isLocked || false}
                  onChange={(e) => onUpdate({ isLocked: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs text-white">🔒 Lock Drawing</span>
              </label>
              <p className="text-xs text-[#868993] mt-1">
                Locked drawings cannot be moved or edited
              </p>
            </div>

            {/* Layer Management */}
            <div>
              <label className="block text-xs text-[#868993] mb-2">Layer Order</label>
              <div className="flex space-x-1">
                <button
                  onClick={() => updateStyle({ zIndex: (selectedDrawing.style?.zIndex || 0) + 1 })}
                  className="flex-1 px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white hover:bg-[#2a2e39] transition-colors"
                >
                  Bring Forward
                </button>
                <button
                  onClick={() => updateStyle({ zIndex: Math.max(0, (selectedDrawing.style?.zIndex || 0) - 1) })}
                  className="flex-1 px-2 py-1 text-xs bg-[#1e222d] border border-[#2a2e39] rounded text-white hover:bg-[#2a2e39] transition-colors"
                >
                  Send Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex space-x-2 p-3 border-t border-[#2a2e39]">
        <button
          onClick={() => {
            // Duplicate drawing
            const duplicated = {
              ...selectedDrawing,
              id: `drawing_${Date.now()}`,
              startTimestamp: (selectedDrawing.startTimestamp || 0) + 86400000, // +1 day
              endTimestamp: selectedDrawing.endTimestamp ? selectedDrawing.endTimestamp + 86400000 : undefined
            };
            onUpdate(duplicated);
          }}
          className="flex-1 px-3 py-1.5 text-xs bg-[#2962ff] text-white rounded hover:bg-[#1e53e5] transition-colors"
        >
          Duplicate
        </button>
        <button
          onClick={() => {
            // Delete drawing - this would need to be handled by parent
            onUpdate({ isDeleted: true } as any);
          }}
          className="flex-1 px-3 py-1.5 text-xs bg-[#f23645] text-white rounded hover:bg-[#cc2c3b] transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

// Black-Scholes Mathematical Functions for Expected Range Calculations
// Normal cumulative distribution function
const normalCDF = (x: number): number => {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
};

// Error function approximation (Abramowitz and Stegun)
const erf = (x: number): number => {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
};

// Calculate d2 parameter for Black-Scholes model
const calculateD2 = (currentPrice: number, strikePrice: number, riskFreeRate: number, volatility: number, timeToExpiry: number): number => {
  const d1 = (Math.log(currentPrice / strikePrice) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / (volatility * Math.sqrt(timeToExpiry));
  return d1 - volatility * Math.sqrt(timeToExpiry);
};

// Calculate chance of profit for selling a call option
const chanceOfProfitSellCall = (currentPrice: number, strikePrice: number, riskFreeRate: number, volatility: number, timeToExpiry: number): number => {
  const d2 = calculateD2(currentPrice, strikePrice, riskFreeRate, volatility, timeToExpiry);
  return (1 - normalCDF(d2)) * 100; // Probability stock stays BELOW strike for call sellers to profit
};

// Calculate chance of profit for selling a put option - FIXED AI Suite logic
const chanceOfProfitSellPut = (currentPrice: number, strikePrice: number, riskFreeRate: number, volatility: number, timeToExpiry: number): number => {
  const d2 = calculateD2(currentPrice, strikePrice, riskFreeRate, volatility, timeToExpiry);
  return normalCDF(d2) * 100; // FIXED: Should be d2 for chance stock stays ABOVE strike
};

// Find strike price for target probability using binary search - EXACT AI Suite logic
const findStrikeForProbability = (S: number, r: number, sigma: number, T: number, targetProb: number, isCall: boolean): number => {
  console.log(`Finding strike for ${targetProb}% ${isCall ? 'call' : 'put'} - Stock: $${S}, IV: ${(sigma*100).toFixed(1)}%, T: ${T.toFixed(4)}`);
  
  if (isCall) {
    // For selling calls: Use binary search for efficiency
    let low = S + 0.01; // Start just above stock price
    let high = S * 1.50; // Search up to 50% above stock price
    
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      const prob = chanceOfProfitSellCall(S, mid, r, sigma, T);
      console.log(`Iteration ${i}: Strike $${mid.toFixed(2)} -> ${prob.toFixed(2)}% (target: ${targetProb}%)`);
      
      if (Math.abs(prob - targetProb) < 0.1) {
        console.log(`Found call strike: $${mid.toFixed(2)} gives ${prob.toFixed(2)}% probability`);
        return mid; // Return exact strike
      }
      
      if (prob < targetProb) {
        low = mid; // Need higher strike
      } else {
        high = mid; // Need lower strike
      }
    }
    const result = (low + high) / 2;
    console.log(`Call search converged: $${result.toFixed(2)}`);
    return result;
  } else {
    // For puts: Use binary search for efficiency
    let low = S * 0.50; // Search down to 50% below stock price
    let high = S - 0.01; // Start just below stock price
    
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      const prob = chanceOfProfitSellPut(S, mid, r, sigma, T);
      console.log(`Iteration ${i}: Strike $${mid.toFixed(2)} -> ${prob.toFixed(2)}% (target: ${targetProb}%)`);
      
      if (Math.abs(prob - targetProb) < 0.1) {
        console.log(`Found put strike: $${mid.toFixed(2)} gives ${prob.toFixed(2)}% probability`);
        return mid; // Return exact strike
      }
      
      if (prob < targetProb) {
        high = mid; // Need lower strike
      } else {
        low = mid; // Need higher strike
      }
    }
    const result = (low + high) / 2;
    console.log(`Put search converged: $${result.toFixed(2)}`);
    return result;
  }
};

// Polygon API Integration for Expected Range Calculations
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const riskFreeRate = 0.0408; // 4.08% risk-free rate

// Black-Scholes price calculation
const calculateBlackScholesPrice = (S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number => {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  if (isCall) {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
};

// Vega calculation for IV estimation
const calculateVega = (S: number, K: number, r: number, sigma: number, T: number): number => {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return S * Math.sqrt(T) * (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
};

// Simple IV estimation function using Newton-Raphson method
const estimateIVFromPrice = (S: number, K: number, optionPrice: number, r: number, T: number, isCall: boolean): number => {
  let iv = 0.20; // starting guess
  
  for (let i = 0; i < 50; i++) {
    const theoreticalPrice = calculateBlackScholesPrice(S, K, r, iv, T, isCall);
    const vega = calculateVega(S, K, r, iv, T);
    
    if (Math.abs(vega) < 0.0001) break;
    
    const diff = theoreticalPrice - optionPrice;
    iv = iv - diff / vega;
    
    if (Math.abs(diff) < 0.01) break;
    if (iv <= 0) iv = 0.01;
    if (iv >= 3) iv = 3;
  }
  
  return Math.max(0.05, Math.min(2.0, iv)); // Clamp between 5% and 200%
};

// Calculate IV from options chain using real bid/ask data
const calculateIVFromOptionsChain = async (optionsResults: any[], price: number, timeToExpiry: number, label: string): Promise<number> => {
  console.log(`${label} - Total options found:`, optionsResults.length);
  console.log(`${label} - Current stock price:`, price);
  
  // Get ATM options for IV calculation - within 5% of current price
  const atmOptions = optionsResults.filter((opt: any) => {
    const strike = parseFloat(opt.strike_price);
    const percentDiff = Math.abs(strike - price) / price;
    return percentDiff < 0.05;
  });

  if (atmOptions.length === 0) {
    throw new Error(`No ATM options found for ${label} within 5% range`);
  }

  // Find the CLOSEST strike to current price
  const closestOption = atmOptions.reduce((closest, current) => {
    const closestDiff = Math.abs(parseFloat(closest.strike_price) - price);
    const currentDiff = Math.abs(parseFloat(current.strike_price) - price);
    return currentDiff < closestDiff ? current : closest;
  });

  // Get real bid/ask quotes
  const contractTicker = closestOption.ticker;
  const quotesResponse = await fetch(
    `https://api.polygon.io/v3/quotes/${contractTicker}?limit=1&apikey=${POLYGON_API_KEY}`
  );

  if (!quotesResponse.ok) {
    throw new Error(`Failed to fetch ${label} options quotes: ${quotesResponse.status}`);
  }

  const quotesData = await quotesResponse.json();
  
  if (!quotesData.results || quotesData.results.length === 0) {
    throw new Error(`No ${label} options quotes available for ${contractTicker}`);
  }

  const quote = quotesData.results[0];
  
  if (!quote.bid_price || !quote.ask_price || quote.bid_price <= 0 || quote.ask_price <= 0) {
    throw new Error(`Invalid ${label} options quote data for ${contractTicker}`);
  }

  const midPrice = (quote.bid_price + quote.ask_price) / 2;
  
  if (midPrice <= 0) {
    throw new Error(`Invalid ${label} mid price for ${contractTicker}`);
  }

  // Calculate IV from real market price
  const calculatedIV = estimateIVFromPrice(price, parseFloat(closestOption.strike_price), midPrice, riskFreeRate, timeToExpiry, closestOption.contract_type === 'call');
  
  if (!calculatedIV || calculatedIV <= 0) {
    throw new Error(`Failed to calculate valid IV from ${label} market data`);
  }

  return calculatedIV;
};

// Fetch market data for Expected Range calculations
const fetchMarketDataForExpectedRange = async (symbol: string) => {
  try {
    // Get current stock price
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`
    );

    if (!stockResponse.ok) {
      throw new Error(`Failed to fetch stock data: ${stockResponse.status}`);
    }

    const stockData = await stockResponse.json();
    const currentPrice = stockData.results.p; // Correct property is 'p' not 'price'
    
    console.log(`Current ${symbol} price: $${currentPrice}`);

    // Calculate 5% range for API filtering - EXACT same logic as AI Suite
    const lowerBound = currentPrice * 0.95;
    const upperBound = currentPrice * 1.05;
    console.log(`Looking for strikes between $${lowerBound.toFixed(2)} and $${upperBound.toFixed(2)}`);

    // Use correct weekly expiration (Sept 26th) and monthly (October 17th)
    const weeklyExpiryDate = '2025-09-26'; // September 26, 2025 (this Friday)
    const monthlyExpiryDate = '2025-10-17'; // October 17, 2025

    // Calculate days to expiry
    const today = new Date();
    const weeklyExpiry = new Date(weeklyExpiryDate);
    const monthlyExpiry = new Date(monthlyExpiryDate);
    
    const weeklyDTE = Math.max(1, Math.ceil((weeklyExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const monthlyDTE = Math.max(1, Math.ceil((monthlyExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // Fetch options chains with API-level strike filtering (EXACT same as AI Suite)
    const weeklyOptionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${weeklyExpiryDate}&strike_price.gte=${Math.floor(lowerBound)}&strike_price.lte=${Math.ceil(upperBound)}&limit=200&apikey=${POLYGON_API_KEY}`
    );
    
    const monthlyOptionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${monthlyExpiryDate}&strike_price.gte=${Math.floor(lowerBound)}&strike_price.lte=${Math.ceil(upperBound)}&limit=200&apikey=${POLYGON_API_KEY}`
    );

    if (!weeklyOptionsResponse.ok || !monthlyOptionsResponse.ok) {
      throw new Error('Failed to fetch options chains');
    }

    const [weeklyOptionsData, monthlyOptionsData] = await Promise.all([
      weeklyOptionsResponse.json(),
      monthlyOptionsResponse.json()
    ]);

    if (!weeklyOptionsData.results || weeklyOptionsData.results.length === 0) {
      throw new Error(`No weekly options data available for ${symbol} on ${weeklyExpiryDate}`);
    }
    
    if (!monthlyOptionsData.results || monthlyOptionsData.results.length === 0) {
      throw new Error(`No monthly options data available for ${symbol} on ${monthlyExpiryDate}`);
    }

    // Calculate IVs from real market data
    const weeklyTimeToExpiry = weeklyDTE / 365;
    const monthlyTimeToExpiry = monthlyDTE / 365;

    const weeklyIV = await calculateIVFromOptionsChain(weeklyOptionsData.results, currentPrice, weeklyTimeToExpiry, 'Weekly');
    const monthlyIV = await calculateIVFromOptionsChain(monthlyOptionsData.results, currentPrice, monthlyTimeToExpiry, 'Monthly');

    return {
      currentPrice,
      weeklyIV,
      monthlyIV,
      weeklyDTE,
      monthlyDTE,
      weeklyTimeToExpiry,
      monthlyTimeToExpiry
    };
  } catch (error) {
    console.error('Error fetching market data for Expected Range:', error);
    throw error;
  }
};

// Calculate Expected Range Levels (8 horizontal lines) - EXACT AI Suite logic
const calculateExpectedRangeLevels = async (symbol: string) => {
  try {
    const marketData = await fetchMarketDataForExpectedRange(symbol);
    const { currentPrice, weeklyIV, monthlyIV, weeklyTimeToExpiry, monthlyTimeToExpiry } = marketData;

    console.log(`🎯 Expected Range Calculation for ${symbol}:`);
    console.log(`Current Price: $${currentPrice}`);
    console.log(`Weekly IV: ${(weeklyIV * 100).toFixed(2)}%, Time: ${weeklyTimeToExpiry.toFixed(4)} years`);
    console.log(`Monthly IV: ${(monthlyIV * 100).toFixed(2)}%, Time: ${monthlyTimeToExpiry.toFixed(4)} years`);

    // Calculate the 8 strike prices for chart lines - EXACT same function calls as AI Suite
    const levels = {
      weekly80Call: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 80, true),
      weekly90Call: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 90, true),
      weekly80Put: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 80, false),
      weekly90Put: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 90, false),
      monthly80Call: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 80, true),
      monthly90Call: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 90, true),
      monthly80Put: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 80, false),
      monthly90Put: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 90, false)
    };

    console.log(`📊 Expected Range Results:`);
    console.log(`Weekly 80% Call: $${levels.weekly80Call.toFixed(2)}`);
    console.log(`Weekly 90% Call: $${levels.weekly90Call.toFixed(2)}`);
    console.log(`Weekly 80% Put: $${levels.weekly80Put.toFixed(2)}`);
    console.log(`Weekly 90% Put: $${levels.weekly90Put.toFixed(2)}`);
    console.log(`Monthly 80% Call: $${levels.monthly80Call.toFixed(2)}`);
    console.log(`Monthly 90% Call: $${levels.monthly90Call.toFixed(2)}`);
    console.log(`Monthly 80% Put: $${levels.monthly80Put.toFixed(2)}`);
    console.log(`Monthly 90% Put: $${levels.monthly90Put.toFixed(2)}`);

    return {
      levels,
      marketData
    };
  } catch (error) {
    console.error('Error calculating Expected Range levels:', error);
    return null;
  }
};

// Render Expected Range Lines on Chart
const renderExpectedRangeLines = (
  ctx: CanvasRenderingContext2D,
  chartWidth: number,
  chartHeight: number,
  minPrice: number,
  maxPrice: number,
  levels: any,
  visibleData?: any[],
  visibleCandleCount?: number
) => {
  console.log('🎨 Rendering Expected Range Lines...');
  console.log(`Chart price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);
  console.log('Expected Range levels:', levels);
  
  const priceRange = maxPrice - minPrice;
  
  // Calculate where the last candle is positioned
  let lastCandleX = chartWidth - 100; // Default fallback
  if (visibleData && visibleCandleCount) {
    const candleSpacing = chartWidth / visibleCandleCount;
    const candleWidth = Math.max(2, chartWidth / visibleCandleCount * 0.8);
    const lastVisibleIndex = Math.min(visibleData.length - 1, visibleCandleCount - 1);
    lastCandleX = 40 + (lastVisibleIndex * candleSpacing) + (candleSpacing - candleWidth) / 2 + candleWidth;
  }
  
  console.log(`Last candle position: x=${lastCandleX.toFixed(1)}`);
  
  // Define colors for the 8 lines
  const colors = {
    weekly80Call: '#00FF00',   // Green for weekly 80% call
    weekly90Call: '#32CD32',   // Light green for weekly 90% call
    weekly80Put: '#FF0000',    // Red for weekly 80% put
    weekly90Put: '#FF6347',    // Light red for weekly 90% put
    monthly80Call: '#0000FF',  // Blue for monthly 80% call
    monthly90Call: '#4169E1',  // Light blue for monthly 90% call
    monthly80Put: '#800080',   // Purple for monthly 80% put
    monthly90Put: '#9370DB'    // Light purple for monthly 90% put
  };

  // Function to convert price to Y coordinate
  const priceToY = (price: number): number => {
    return chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  };

  // Draw horizontal lines for each level
  const linesToDraw = [
    { price: levels.weekly80Call, color: colors.weekly80Call, label: 'W80C' },
    { price: levels.weekly90Call, color: colors.weekly90Call, label: 'W90C' },
    { price: levels.weekly80Put, color: colors.weekly80Put, label: 'W80P' },
    { price: levels.weekly90Put, color: colors.weekly90Put, label: 'W90P' },
    { price: levels.monthly80Call, color: colors.monthly80Call, label: 'M80C' },
    { price: levels.monthly90Call, color: colors.monthly90Call, label: 'M90C' },
    { price: levels.monthly80Put, color: colors.monthly80Put, label: 'M80P' },
    { price: levels.monthly90Put, color: colors.monthly90Put, label: 'M90P' }
  ];

  ctx.lineWidth = 3; // Make lines thicker and more visible
  ctx.font = 'bold 12px Arial';
  
  let linesDrawn = 0;
  
  linesToDraw.forEach(line => {
    console.log(`Drawing line: ${line.label} at $${line.price.toFixed(2)} (range: $${minPrice.toFixed(2)}-$${maxPrice.toFixed(2)})`);
    
    // Draw lines even if slightly outside range, but extend the range if needed
    const y = priceToY(line.price);
    
    // Only skip if way outside the chart bounds
    if (y >= -50 && y <= chartHeight + 50) {
      // Draw horizontal line from last candle extending to the right
      // First draw a shadow line for better visibility
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(lastCandleX, y + 1); // Slightly offset shadow
      ctx.lineTo(chartWidth - 100, y + 1);
      ctx.stroke();
      
      // Then draw the main colored line
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 4; // Make lines even thicker
      ctx.globalAlpha = 1.0; // Ensure full opacity
      ctx.setLineDash([]); // Solid line for maximum visibility
      ctx.beginPath();
      ctx.moveTo(lastCandleX, y); // Start from last candle position
      ctx.lineTo(chartWidth - 100, y); // Extend to right edge (before price axis)
      ctx.stroke();
      
      // Draw price label on the right with background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; // Darker background for text
      ctx.fillRect(chartWidth - 95, y - 15, 90, 20);
      
      ctx.fillStyle = line.color;
      ctx.font = 'bold 14px Arial'; // Larger font
      ctx.fillText(`${line.label}: $${line.price.toFixed(2)}`, chartWidth - 90, y - 2);
      
      linesDrawn++;
      console.log(`✅ Drew line: ${line.label} at Y=${y.toFixed(1)}`);
    } else {
      console.log(`❌ Skipped line: ${line.label} - Y=${y.toFixed(1)} outside bounds`);
    }
  });
  
  console.log(`📊 Drew ${linesDrawn} out of ${linesToDraw.length} Expected Range lines`);
};

interface TradingViewChartProps {
  symbol: string;
  initialTimeframe?: string;
  height?: number;
  onSymbolChange?: (symbol: string) => void;
  onTimeframeChange?: (timeframe: string) => void;
  onAIButtonClick?: () => void;
}

export default function TradingViewChart({
  symbol,
  initialTimeframe = '1d',
  height = 600,
  onSymbolChange,
  onTimeframeChange,
  onAIButtonClick
}: TradingViewChartProps) {
  // Canvas refs
  const containerRef = useRef<HTMLDivElement>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Dropdown button refs for positioning
  const indicatorsButtonRef = useRef<HTMLButtonElement>(null);
  const timeframeButtonRef = useRef<HTMLButtonElement>(null);
  const volumeButtonRef = useRef<HTMLButtonElement>(null);

  // Chart state
  const [config, setConfig] = useState<ChartConfig>({
    symbol,
    timeframe: initialTimeframe,
    chartType: 'candlestick',
    theme: 'dark',
    indicators: [],
    drawings: [],
    volume: true,
    crosshair: true,
    timezone: 'UTC',
    showGrid: false, // Start with grid disabled
    axisStyle: {
      xAxis: {
        textSize: 20,
        textColor: '#ffffff'
      },
      yAxis: {
        textSize: 20,
        textColor: '#ffffff'
      }
    },
    colors: {
      bullish: {
        body: '#00ff00',      // Pure green for bullish body
        wick: '#00ff00',      // Pure green for bullish wick  
        border: '#00ff00'     // Pure green for bullish border
      },
      bearish: {
        body: '#ff0000',      // Pure red for bearish body
        wick: '#ff0000',      // Pure red for bearish wick
        border: '#ff0000'     // Pure red for bearish border
      },
      volume: {
        bullish: '#00ffff80', // Cyan/teal for bullish volume (semi-transparent)
        bearish: '#ff000080'  // Red for bearish volume (semi-transparent)
      }
    }
  });

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
  const [showIndicatorsDropdown, setShowIndicatorsDropdown] = useState(false);
  
  // Dropdown positioning state
  const [dropdownPositions, setDropdownPositions] = useState({
    indicators: { x: 0, y: 0, width: 0 },
    timeframe: { x: 0, y: 0, width: 0 },
    volume: { x: 0, y: 0, width: 0 }
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Lock state for drawing tools - when locked, tools stay active after placing a drawing
  const [isDrawingLocked, setIsDrawingLocked] = useState<boolean>(false);

  // Professional crosshair information state
  const [crosshairInfo, setCrosshairInfo] = useState<{
    price: string;
    date: string;
    time: string;
    visible: boolean;
    volume?: number;
    ohlc?: {
      open: number;
      high: number;
      low: number;
      close: number;
      change?: number;
      changePercent?: number;
    };
  }>({
    price: '',
    date: '',
    time: '',
    visible: false,
    volume: 0,
    ohlc: undefined
  });

  // Sidebar panel state
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<string | null>(null);
  const [watchlistTab, setWatchlistTab] = useState('Markets');
  const [regimesTab, setRegimesTab] = useState('Life');
  const [chatTab, setChatTab] = useState('admin');

  // Market Regime Analysis state with caching and progress tracking
  const [marketRegimeData, setMarketRegimeData] = useState<MarketRegimeData | null>(null);
  const [isLoadingRegimes, setIsLoadingRegimes] = useState(false);
  const [regimeDataCache, setRegimeDataCache] = useState<{ [key: string]: MarketRegimeData }>({});
  const [lastRegimeUpdate, setLastRegimeUpdate] = useState<number>(0);
  const [regimeUpdateProgress, setRegimeUpdateProgress] = useState<number>(0);
  const [regimeLoadingStage, setRegimeLoadingStage] = useState<string>('');
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryPerformance | null>(null);

  // Expected Range state for probability levels
  const [expectedRangeLevels, setExpectedRangeLevels] = useState<any>(null);
  const [isLoadingExpectedRange, setIsLoadingExpectedRange] = useState(false);
  const [isExpectedRangeActive, setIsExpectedRangeActive] = useState(false);

  // Watchlist data state
  const [watchlistData, setWatchlistData] = useState<{[key: string]: {
    price: number;
    change1d: number;
    change5d: number;
    change13d: number;
    change21d: number;
    performance: string;
    performanceColor: string;
  }}>({});

  // Market data for major indices and sectors
  const marketSymbols = {
    Markets: ['SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLY', 'XLC', 'XLRE', 'XLV', 'XLU', 'XLP', 'XLB', 'XLF', 'XLI', 'XLE'],
    Industries: ['IGV', 'SMH', 'XRT', 'KIE', 'KRE', 'GDX', 'ITA', 'TAN', 'XBI', 'ITB', 'XHB', 'XOP', 'OIH', 'XME', 'ARKK', 'IPO', 'VNQ', 'JETS', 'KWEB'],
    Special: []
  };

  // Fetch real market data from Polygon API
  useEffect(() => {
    const fetchRealMarketData = async () => {
      const symbols = [
        // Markets
        'SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLY', 'XLC', 'XLRE', 'XLV', 'XLU', 'XLP', 'XLB', 'XLF', 'XLI', 'XLE',
        // Industries
        'IGV', 'SMH', 'XRT', 'KIE', 'KRE', 'GDX', 'ITA', 'TAN', 'XBI', 'ITB', 'XHB', 'XOP', 'OIH', 'XME', 'ARKK', 'IPO', 'VNQ', 'JETS', 'KWEB'
      ];
      const processedData: {[symbol: string]: {
        price: number;
        change1d: number;
        change5d: number;
        change13d: number;
        change21d: number;
        performance: string;
        performanceColor: string;
      }} = {};

      try {
        console.log('🔄 Fetching watchlist data for symbols:', symbols);
        
        // For each symbol, fetch historical data and calculate metrics
        for (const symbol of symbols) {
          try {
            console.log(`📊 Fetching data for ${symbol}...`);
            
            // Get recent historical data (expand to 90 days to ensure we get 21 trading days)
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const response = await fetch(`/api/historical-data?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}`);
            
            if (response.ok) {
              const result = await response.json();
              
              // Use original 21 trading days requirement
              if (result?.results && Array.isArray(result.results) && result.results.length >= 21) {
                const data = result.results;
                const latest = data[data.length - 1];
                const currentPrice = latest.c; // close price
                
                console.log(`📊 ${symbol} - Data length: ${data.length}, Current price: ${currentPrice}`);
                
                // Calculate percentage changes safely - accounting for potential data gaps
                // Get actual trading days, not just array positions
                const price1DayAgo = data[data.length - 2]?.c || currentPrice;
                const price5DaysAgo = data[data.length - Math.min(6, data.length - 1)]?.c || currentPrice;
                const price13DaysAgo = data[data.length - Math.min(14, data.length - 1)]?.c || currentPrice;
                const price21DaysAgo = data[data.length - Math.min(22, data.length - 1)]?.c || currentPrice;

                console.log(`📈 ${symbol} Prices - Current: ${currentPrice}, 1D: ${price1DayAgo}, 5D: ${price5DaysAgo}, 13D: ${price13DaysAgo}, 21D: ${price21DaysAgo}`);

                const change1d = price1DayAgo ? ((currentPrice - price1DayAgo) / price1DayAgo) * 100 : 0;
                const change5d = price5DaysAgo ? ((currentPrice - price5DaysAgo) / price5DaysAgo) * 100 : 0;
                const change13d = price13DaysAgo ? ((currentPrice - price13DaysAgo) / price13DaysAgo) * 100 : 0;
                const change21d = price21DaysAgo ? ((currentPrice - price21DaysAgo) / price21DaysAgo) * 100 : 0;

                console.log(`📊 ${symbol} Changes - 1D: ${change1d.toFixed(2)}%, 5D: ${change5d.toFixed(2)}%, 13D: ${change13d.toFixed(2)}%, 21D: ${change21d.toFixed(2)}%`);

                let performance = 'Neutral';
                let performanceColor = 'text-white';

                // Store data first, then calculate relative performance after we have SPY data
                const tempData = {
                  price: currentPrice || 0,
                  change1d,
                  change5d,
                  change13d,
                  change21d,
                  performance: 'Neutral',
                  performanceColor: 'text-white'
                };
                
                processedData[symbol] = tempData;

                processedData[symbol] = {
                  price: currentPrice || 0,
                  change1d,
                  change5d,
                  change13d,
                  change21d,
                  performance,
                  performanceColor
                };
                
                console.log(`✅ ${symbol}: $${currentPrice?.toFixed(2)} (${change1d?.toFixed(2)}%) - ${performance}`);
              } else {
                console.warn(`⚠️ No sufficient data for ${symbol}`);
              }
            } else {
              console.warn(`❌ Failed to fetch data for ${symbol}:`, response.status);
            }
          } catch (symbolError) {
            console.warn(`❌ Error fetching data for ${symbol}:`, symbolError);
            // Continue with next symbol instead of breaking the entire loop
          }
        }

        // After collecting all data, calculate relative performance to SPY
        if (Object.keys(processedData).length > 0 && processedData['SPY']) {
          const spyData = processedData['SPY'];
          
          // Calculate relative performance for each symbol vs SPY
          Object.keys(processedData).forEach(symbol => {
            if (symbol !== 'SPY') {
              const symbolData = processedData[symbol];
              
              // Calculate relative performance vs SPY
              const relative1d = symbolData.change1d - spyData.change1d;
              const relative5d = symbolData.change5d - spyData.change5d;
              const relative13d = symbolData.change13d - spyData.change13d;
              const relative21d = symbolData.change21d - spyData.change21d;
              
              console.log(`🔍 ${symbol} vs SPY Relative Performance:`);
              console.log(`   1D: ${symbol}=${symbolData.change1d.toFixed(2)}% - SPY=${spyData.change1d.toFixed(2)}% = ${relative1d.toFixed(2)}%`);
              console.log(`   5D: ${symbol}=${symbolData.change5d.toFixed(2)}% - SPY=${spyData.change5d.toFixed(2)}% = ${relative5d.toFixed(2)}%`);
              console.log(`   13D: ${symbol}=${symbolData.change13d.toFixed(2)}% - SPY=${spyData.change13d.toFixed(2)}% = ${relative13d.toFixed(2)}%`);
              console.log(`   21D: ${symbol}=${symbolData.change21d.toFixed(2)}% - SPY=${spyData.change21d.toFixed(2)}% = ${relative21d.toFixed(2)}%`);
              
              let performance = 'Neutral';
              let performanceColor = 'text-white';
              
              // Performance based on relative strength to SPY (green = outperforming, red = underperforming)
              if (relative21d > 0) {
                performance = 'KING';
                performanceColor = 'text-yellow-400 drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]';
              } else if (relative21d < 0) {
                performance = 'Fallen';
                performanceColor = 'text-orange-600 drop-shadow-[0_0_8px_rgba(255,165,0,0.8)]';
              } else if (relative13d > 0) {
                performance = 'Leader';
                performanceColor = 'text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]';
              } else if (relative13d < 0) {
                performance = 'Laggard';
                performanceColor = 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]';
              } else if (relative5d > 0) {
                performance = 'Strong';
                performanceColor = 'text-green-400';
              } else if (relative5d < 0) {
                performance = 'Weak';
                performanceColor = 'text-red-400';
              } else if (relative1d > 0) {
                performance = 'Rising';
                performanceColor = 'text-blue-400';
              } else if (relative1d < 0) {
                performance = 'Falling';
                performanceColor = 'text-purple-400';
              }
              
              // Update the symbol's performance
              processedData[symbol].performance = performance;
              processedData[symbol].performanceColor = performanceColor;
              
              console.log(`✅ ${symbol}: $${symbolData.price?.toFixed(2)} vs SPY: 21d(${relative21d?.toFixed(2)}%) 13d(${relative13d?.toFixed(2)}%) 5d(${relative5d?.toFixed(2)}%) 1d(${relative1d?.toFixed(2)}%) - ${performance}`);
            } else {
              // SPY gets neutral since it's the benchmark
              processedData[symbol].performance = 'Benchmark';
              processedData[symbol].performanceColor = 'text-blue-300';
              console.log(`✅ SPY (Benchmark): $${processedData[symbol].price?.toFixed(2)} - Base comparison`);
            }
          });
        }

        // Update state only if we have some data
        if (Object.keys(processedData).length > 0) {
          console.log(`✅ Successfully processed ${Object.keys(processedData).length} symbols for watchlist`);
          setWatchlistData(processedData);
        } else {
          console.warn('❌ No watchlist data processed - using fallback data');
          // Provide fallback data to prevent empty loading states
          const fallbackData = {
            'SPY': { price: 560.00, change1d: 0.5, change5d: 1.2, change13d: 2.1, change21d: 3.5, performance: 'Benchmark', performanceColor: 'text-blue-300' },
            'QQQ': { price: 485.00, change1d: 0.8, change5d: 2.1, change13d: 3.2, change21d: 4.8, performance: 'Leader', performanceColor: 'text-green-400' },
            'IWM': { price: 225.00, change1d: -0.2, change5d: 0.5, change13d: 1.8, change21d: 2.9, performance: 'Strong', performanceColor: 'text-green-400' }
          };
          setWatchlistData(fallbackData);
        }

      } catch (error) {
        console.error('❌ Error in market data fetching:', error);
        // Provide fallback data in case of complete failure
        const fallbackData = {
          'SPY': { price: 560.00, change1d: 0.5, change5d: 1.2, change13d: 2.1, change21d: 3.5, performance: 'Benchmark', performanceColor: 'text-blue-300' },
          'QQQ': { price: 485.00, change1d: 0.8, change5d: 2.1, change13d: 3.2, change21d: 4.8, performance: 'Leader', performanceColor: 'text-green-400' },
          'IWM': { price: 225.00, change1d: -0.2, change5d: 0.5, change13d: 1.8, change21d: 2.9, performance: 'Strong', performanceColor: 'text-green-400' }
        };
        setWatchlistData(fallbackData);
      }
    };

    // Initial fetch
    fetchRealMarketData();
    
    // Set up interval for regular updates
    const interval = setInterval(fetchRealMarketData, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []); // Empty dependency array to run only once

  // Expected Range data loading - reset when symbol changes
  useEffect(() => {
    // Reset Expected Range levels when symbol changes
    if (expectedRangeLevels) {
      setExpectedRangeLevels(null);
    }
  }, [symbol]);

  // Enhanced Market Regime Data Loading with immediate start and streaming results
  useEffect(() => {
    const loadMarketRegimeData = async () => {
      // Start loading immediately on component mount, not waiting for panel click
      if (!isLoadingRegimes && !marketRegimeData) {
        const cacheKey = new Date().toDateString(); // Cache by day
        const now = Date.now();
        
        // Check if we have recent cached data (within 15 minutes)
        if (regimeDataCache[cacheKey] && (now - lastRegimeUpdate) < 15 * 60 * 1000) {
          setMarketRegimeData(regimeDataCache[cacheKey]);
          return;
        }

        setIsLoadingRegimes(true);
        setRegimeUpdateProgress(0);
        setRegimeLoadingStage('Starting immediate analysis...');
        
        try {
          console.log('� Auto-starting Market Regime Analysis on component mount...');
          
          // Create a progress tracker
          const progressCallback = (stage: string, progress: number) => {
            setRegimeLoadingStage(stage);
            setRegimeUpdateProgress(progress);
          };

          // Create a streaming callback to update results as they come in
          const streamCallback = (timeframe: string, data: TimeframeAnalysis) => {
            console.log(`📊 Streaming ${timeframe} timeframe results...`);
            setMarketRegimeData(prev => ({
              ...prev,
              [timeframe.toLowerCase()]: data
            } as MarketRegimeData));
          };

          const regimeData = await IndustryAnalysisService.getMarketRegimeDataStreaming(progressCallback, streamCallback);
          
          // Cache the complete data
          setRegimeDataCache(prev => ({
            ...prev,
            [cacheKey]: regimeData
          }));
          
          setMarketRegimeData(regimeData);
          setLastRegimeUpdate(now);
          console.log('✅ Market Regime Analysis Auto-loaded and Cached');
        } catch (error) {
          console.error('❌ Error loading market regime data:', error);
          setRegimeLoadingStage('Error loading data');
        } finally {
          setIsLoadingRegimes(false);
          setRegimeUpdateProgress(100);
          setTimeout(() => {
            setRegimeLoadingStage('');
            setRegimeUpdateProgress(0);
          }, 1000);
        }
      }
    };

    // Start market regime loading immediately
    console.log('🔄 Starting immediate market regime analysis...');
    loadMarketRegimeData();
  }, []); // Empty dependency array to run only once on mount

  // Essential drawing state (keep minimal set for existing functionality)
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<any | null>(null);
  
  // Drawing persistence
  const drawingsRef = useRef<Drawing[]>([]);
  const [drawings, setDrawingsState] = useState<Drawing[]>([]);
  
  // Multi-point drawing state
  const [multiPointDrawing, setMultiPointDrawing] = useState<{ x: number; y: number }[]>([]);
  const [currentDrawingPhase, setCurrentDrawingPhase] = useState(0);
  
  // Drawing interaction state
  const [drawingStartPoint, setDrawingStartPoint] = useState<{ x: number; y: number; timestamp?: number; price?: number } | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Drawing editor and selection state
  const [isDraggingDrawing, setIsDraggingDrawing] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragStartPosition, setDragStartPosition] = useState<{ x: number; y: number } | null>(null);
  const [originalDrawing, setOriginalDrawing] = useState<any | null>(null);
  // Drawing editor removed - drawing tools were removed as requested
  
  // Properties panel state
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  const [propertiesPanelPosition, setPropertiesPanelPosition] = useState({ x: 0, y: 0 });
  
  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [contextMenuDrawing, setContextMenuDrawing] = useState<Drawing | null>(null);
  
  // Multi-selection support
  const [selectedDrawings, setSelectedDrawings] = useState<Drawing[]>([]);
  
  // Advanced drawing features
  const [magnetMode, setMagnetMode] = useState(false);
  const [showDrawingHandles, setShowDrawingHandles] = useState(true);
  
  // Click detection
  const [lastClickTime, setLastClickTime] = useState(0);
  const [lastClickDrawing, setLastClickDrawing] = useState<any | null>(null);
  
  // Additional drawing state
  const [drawingText, setDrawingText] = useState('');
  const [dragPreviewOffset, setDragPreviewOffset] = useState<{ x: number; y: number } | null>(null);
  const [hoveredDrawing, setHoveredDrawing] = useState<any | null>(null);
  const [drawingClipboard, setDrawingClipboard] = useState<Drawing[]>([]);
  
  // Drawing style
  const [drawingStyle, setDrawingStyle] = useState({
    color: '#00ff88',
    lineWidth: 2,
    lineStyle: 'solid' as const,
    lineDash: [],
    fillOpacity: 0.1,
    textSize: 12,
    showLabels: true,
    showLevels: true
  });

  // setDrawings function
  const setDrawings = useCallback((updater: Drawing[] | ((prev: Drawing[]) => Drawing[])) => {
    const newValue = typeof updater === 'function' ? updater(drawingsRef.current) : updater;
    drawingsRef.current = newValue;
    setDrawingsState(newValue);
  }, []);

  // Essential drawing functions
  const handleDrawingSelection = useCallback((drawing: Drawing, multiSelect = false) => {
    setSelectedDrawing(drawing);
    setSelectedDrawings([drawing]);
  }, []);

  const updateDrawing = useCallback((drawingId: string | number, updates: Partial<Drawing>) => {
    setDrawings(prevDrawings => 
      prevDrawings.map(drawing => 
        drawing.id === drawingId ? { ...drawing, ...updates } : drawing
      )
    );
  }, []);

  const handleDrawingPropertiesUpdate = useCallback((updates: Partial<Drawing & { isDeleted?: boolean }>) => {
    if (!selectedDrawing) return;
    if (updates.isDeleted) {
      setDrawings(prev => prev.filter(d => d.id !== selectedDrawing.id));
      setSelectedDrawing(null);
      setShowPropertiesPanel(false);
      return;
    }
    updateDrawing(selectedDrawing.id, updates);
  }, [selectedDrawing, updateDrawing]);

  const handleCopyDrawing = useCallback((drawing?: Drawing) => {
    const targetDrawing = drawing || selectedDrawing;
    if (!targetDrawing) return;
    setDrawingClipboard([{ ...targetDrawing, id: `copy_${Date.now()}` }]);
  }, [selectedDrawing]);

  const handlePasteDrawing = useCallback(() => {
    if (drawingClipboard.length === 0) return;
    drawingClipboard.forEach(drawingTemplate => {
      const newDrawing: Drawing = {
        ...drawingTemplate,
        id: `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
      setDrawings(prev => [...prev, newDrawing]);
    });
  }, [drawingClipboard]);

  const handleDuplicateDrawing = useCallback((drawing?: Drawing) => {
    const targetDrawing = drawing || selectedDrawing;
    if (!targetDrawing) return;
    const duplicated: Drawing = {
      ...targetDrawing,
      id: `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    setDrawings(prev => [...prev, duplicated]);
    setSelectedDrawing(duplicated);
  }, [selectedDrawing]);

  const handleDeleteDrawing = useCallback((drawing?: Drawing) => {
    const targetDrawing = drawing || selectedDrawing;
    if (!targetDrawing) return;
    setDrawings(prev => prev.filter(d => d.id !== targetDrawing.id));
    if (selectedDrawing && selectedDrawing.id === targetDrawing.id) {
      setSelectedDrawing(null);
      setShowPropertiesPanel(false);
    }
  }, [selectedDrawing]);

  const bringDrawingToFront = useCallback((drawing?: Drawing) => {
    const targetDrawing = drawing || selectedDrawing;
    if (!targetDrawing) return;
    const maxZIndex = Math.max(...drawings.map(d => d.style?.zIndex || 0));
    updateDrawing(targetDrawing.id, {
      style: { ...targetDrawing.style, zIndex: maxZIndex + 1 }
    });
  }, [selectedDrawing, drawings, updateDrawing]);

  const sendDrawingToBack = useCallback((drawing?: Drawing) => {
    const targetDrawing = drawing || selectedDrawing;
    if (!targetDrawing) return;
    const minZIndex = Math.min(...drawings.map(d => d.style?.zIndex || 0));
    updateDrawing(targetDrawing.id, {
      style: { ...targetDrawing.style, zIndex: Math.max(0, minZIndex - 1) }
    });
  }, [selectedDrawing, drawings, updateDrawing]);

  // Data state - SIMPLE
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chart interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [crosshairPosition, setCrosshairPosition] = useState({ x: 0, y: 0 });
  const [priceRange, setPriceRange] = useState({ min: 0, max: 0 });
  
  // Y-Axis Dynamic Scaling State
  const [isAutoScale, setIsAutoScale] = useState(true);
  const [manualPriceRange, setManualPriceRange] = useState<{ min: number; max: number } | null>(null);
  const [isDraggingYAxis, setIsDraggingYAxis] = useState(false);
  const [yAxisDragStart, setYAxisDragStart] = useState<{ y: number; priceRange: { min: number; max: number } } | null>(null);
  const [boxZoomStart, setBoxZoomStart] = useState<{ x: number; y: number } | null>(null);
  const [boxZoomEnd, setBoxZoomEnd] = useState<{ x: number; y: number } | null>(null);
  const [isBoxZooming, setIsBoxZooming] = useState(false);
  
  // Momentum Scrolling State
  const [lastMouseTimestamp, setLastMouseTimestamp] = useState(0);
  const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const [momentumAnimationId, setMomentumAnimationId] = useState<number | null>(null);
  
  // TradingView-style navigation state
  const [scrollOffset, setScrollOffset] = useState(0); // Index of first visible candle
  const [visibleCandleCount, setVisibleCandleCount] = useState(100); // Number of visible candles

  // Price info state
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [priceChangePercent, setPriceChangePercent] = useState(0);

  // Chart dimensions
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const chartHeight = dimensions.height; // Use full height since volume is now integrated
  const volumeAreaHeight = 60; // Reduced height for volume area above X-axis

  // Dedicated overlay rendering for drawings
  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return;

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    console.log('🎨 [OVERLAY-EFFECT] Rendering drawings on overlay canvas:', drawings.length);
    
    // Clear overlay first
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // Draw all stored drawings
    if (drawings.length > 0) {
      drawStoredDrawings(ctx);
    }
  }, [drawings, dimensions, scrollOffset, visibleCandleCount]);

  // TradingView-style color scheme (dynamic based on theme)
  const colors = {
    background: config.theme === 'dark' ? '#000000' : '#ffffff',
    grid: config.theme === 'dark' ? '#1a1a1a' : '#e1e4e8',
    text: config.theme === 'dark' ? '#ffffff' : '#000000',
    textSecondary: config.theme === 'dark' ? '#999999' : '#6a737d',
    bullish: config.colors.bullish.body,
    bearish: config.colors.bearish.body,
    volume: config.theme === 'dark' ? '#333333' : '#f0f3fa',
    crosshair: config.theme === 'dark' ? '#666666' : '#6a737d',
    selection: '#2962ff',
    border: config.theme === 'dark' ? '#333333' : '#e1e4e8',
    header: config.theme === 'dark' ? '#111111' : '#f8f9fa'
  };

  // Y-Axis Dynamic Scaling Utility Functions
  const calculateAutoPriceRange = useCallback((visibleData: ChartDataPoint[]) => {
    if (visibleData.length === 0) return { min: 0, max: 100 };
    
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;
    
    return {
      min: minPrice - padding,
      max: maxPrice + padding
    };
  }, []);

  const getCurrentPriceRange = useCallback((visibleData: ChartDataPoint[]) => {
    if (!isAutoScale && manualPriceRange) {
      return manualPriceRange;
    }
    return calculateAutoPriceRange(visibleData);
  }, [isAutoScale, manualPriceRange, calculateAutoPriceRange]);

  const setManualPriceRangeAndDisableAuto = useCallback((newRange: { min: number; max: number }) => {
    setManualPriceRange(newRange);
    setIsAutoScale(false);
  }, []);

  const resetToAutoScale = useCallback(() => {
    setIsAutoScale(true);
    setManualPriceRange(null);
  }, []);

  const isInYAxisArea = useCallback((x: number, canvasWidth: number) => {
    return x > canvasWidth - 80; // Y-axis area is rightmost 80px
  }, []);

  // Momentum Scrolling Utility Functions
  const startMomentumAnimation = useCallback(() => {
    if (momentumAnimationId) {
      cancelAnimationFrame(momentumAnimationId);
    }
    
    const animate = () => {
      setVelocity(prevVelocity => {
        const friction = 0.95; // Damping factor
        const threshold = 0.1; // Stop when velocity is very low
        
        const newVelocityX = Math.abs(prevVelocity.x) > threshold ? prevVelocity.x * friction : 0;
        const newVelocityY = Math.abs(prevVelocity.y) > threshold ? prevVelocity.y * friction : 0;
        
        // Apply velocity to scroll offset (horizontal momentum)
        if (Math.abs(newVelocityX) > threshold) {
          setScrollOffset(prevOffset => {
            const futurePeriods = getFuturePeriods(config.timeframe);
            const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
            const maxScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
            const deltaOffset = -newVelocityX / 20; // Convert pixel velocity to candle offset
            return Math.max(0, Math.min(maxScrollOffset, prevOffset + deltaOffset));
          });
        }
        
        // Continue animation if there's still velocity
        if (Math.abs(newVelocityX) > threshold || Math.abs(newVelocityY) > threshold) {
          const id = requestAnimationFrame(animate);
          setMomentumAnimationId(id);
          return { x: newVelocityX, y: newVelocityY };
        } else {
          setMomentumAnimationId(null);
          return { x: 0, y: 0 };
        }
      });
    };
    
    const id = requestAnimationFrame(animate);
    setMomentumAnimationId(id);
  }, [momentumAnimationId, visibleCandleCount, data.length, config.timeframe]);

  const stopMomentumAnimation = useCallback(() => {
    if (momentumAnimationId) {
      cancelAnimationFrame(momentumAnimationId);
      setMomentumAnimationId(null);
    }
    setVelocity({ x: 0, y: 0 });
  }, [momentumAnimationId]);

  // Fetch real-time price for current price display
  const fetchRealTimePrice = useCallback(async (sym: string) => {
    try {
      console.log(`🔴 LIVE: Fetching real-time price for ${sym}`);
      
      // Use the dedicated real-time price endpoint
      const response = await fetch(`/api/realtime-price?symbol=${sym}&_t=${Date.now()}`);
      const result = await response.json();
      
      if (response.ok && result.price) {
        console.log(`💰 LIVE PRICE: ${sym} = $${result.price} (${result.source}: ${result.date})`);
        setCurrentPrice(result.price);
        
        // For price change calculation, use current dates - NOT HARDCODED
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const histResponse = await fetch(`/api/historical-data?symbol=${sym}&startDate=${yesterdayStr}&endDate=${todayStr}&timeframe=1d&_t=${Date.now()}`);
        if (histResponse.ok) {
          const histResult = await histResponse.json();
          if (histResult?.results && histResult.results.length >= 2) {
            const current = result.price;
            const previous = histResult.results[histResult.results.length - 2]?.c || current;
            const change = current - previous;
            const changePercent = ((change) / previous) * 100;
            setPriceChange(change);
            setPriceChangePercent(changePercent);
            console.log(`📈 CHANGE: ${sym} ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`);
          }
        }
      } else {
        console.error(`❌ Failed to get real-time price for ${sym}:`, result);
      }
    } catch (error) {
      console.log('Real-time price fetch failed:', error);
    }
  }, []);

  // Search handler
  const handleSearch = (symbol: string) => {
    if (symbol && symbol.length > 0) {
      const upperSymbol = symbol.toUpperCase();
      if (onSymbolChange) {
        onSymbolChange(upperSymbol);
      }
      setSearchQuery('');
      setShowSearchResults(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(searchQuery);
    }
  };

  // High-performance bulk data fetch with parallel requests
  const fetchData = useCallback(async (sym: string, timeframe: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Professional-grade date range calculation like TradingView/Bloomberg
      const now = new Date();
      
      // ALWAYS request data up to current date - no weekend restrictions
      // Force to current date: September 14, 2025
      let endDate = now.toISOString().split('T')[0];
      
      // Double-check we're using the actual current date
      console.log(`📅 Current date: ${now.toString()}`);
      console.log(`📅 Forcing end date to: ${endDate} (should be 2025-09-14)`);
      
      let startDate: string;
      let daysBack: number;
      
      // Professional timeframe ranges that prioritize recent data
      switch (timeframe) {
        case '1m':
          daysBack = 2; // 2 days of 1-minute data (focus on very recent)
          break;
        case '5m':
          daysBack = 7; // 1 week of 5-minute data (focus on recent activity)
          break;
        case '15m':
          daysBack = 21; // 3 weeks of 15-minute data
          break;
        case '30m':
          daysBack = 60; // 2 months of 30-minute data (was 6 months, too much)
          break;
        case '1h':
          daysBack = 120; // 4 months of hourly data (was 1 year, too much)
          break;
        case '4h':
          daysBack = 365; // 1 year of 4-hour data (was 3 years)
          break;
        case '1d':
          daysBack = 7124; // 19.5 years of daily data (19.5 * 365.25 days)
          break;
        case '1w':
          daysBack = 2190; // 6 years of weekly data (was 20 years)
          break;
        case '1mo':
          daysBack = 3650; // 10 years of monthly data (was 30 years)
          break;
        default:
          daysBack = 120; // Default to 4 months
      }
      
      startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
      
      console.log(`📊 PROFESSIONAL FETCH: ${sym} ${timeframe} from ${startDate} to ${endDate} (${daysBack} days)`);
      console.log(`📅 Current time: ${now.toISOString()}`);
      console.log(`📅 Start date: ${startDate}`);
      console.log(`📅 End date: ${endDate}`);
      
      // High-performance parallel requests with cache busting for real-time data
      const cacheBuster = Date.now();
      console.log(`🚀 API Request: symbol=${sym}, start=${startDate}, end=${endDate}, timeframe=${timeframe}`);
      const [historicalResponse] = await Promise.allSettled([
        fetch(`/api/historical-data?symbol=${sym}&startDate=${startDate}&endDate=${endDate}&timeframe=${timeframe}&nocache=true&force=current&_t=${cacheBuster}`)
      ]);
      
      // Fetch real-time price separately for immediate feedback
      fetchRealTimePrice(sym).catch(() => {}); // Non-blocking
      
      if (historicalResponse.status === 'rejected' || !historicalResponse.value?.ok) {
        const errorStatus = historicalResponse.status === 'rejected' ? 'Network error' : historicalResponse.value?.status;
        console.error(`❌ Failed to fetch ${timeframe} data for ${sym}:`, errorStatus);
        throw new Error(`Failed to fetch historical data: ${errorStatus}`);
      }
      
      // ULTRA-FAST JSON PARSING optimized for large datasets
      const result = await historicalResponse.value.json();
      console.log(`🔍 API Response for ${sym} ${timeframe}:`, result);
      
      if (result && result.results && Array.isArray(result.results)) {
        console.log(`📈 Processing ${result.results.length} data points for ${sym} ${timeframe}`);
        
        // HIGH-PERFORMANCE BULK TRANSFORM - optimized for large datasets (up to 15 years of data)
        const rawData = result.results;
        const dataLength = rawData.length;
        
        // Pre-allocate arrays for maximum performance
        const transformedData = new Array(dataLength);
        const prices = new Float32Array(dataLength * 2);
        let priceIndex = 0;
        
        // Single-pass processing for maximum efficiency
        for (let i = 0; i < dataLength; i++) {
          const item = rawData[i];
          
          // Transform data
          transformedData[i] = {
            timestamp: item.t,
            open: item.o,
            high: item.h,
            low: item.l,
            close: item.c,
            volume: item.v || 0,
            date: new Date(item.t).toISOString().split('T')[0],
            time: new Date(item.t).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit', 
              hour12: false 
            })
          };
          
          // Collect price data for range calculation
          prices[priceIndex++] = item.h;
          prices[priceIndex++] = item.l;
        }
        
        // PROFESSIONAL CHART SETUP - like TradingView
        if (dataLength > 0) {
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);
          const padding = (maxPrice - minPrice) * 0.05; // Smaller padding for professional look
          
          // Intelligent visible candle count based on timeframe
          let visibleCandles: number;
          switch (timeframe) {
            case '1m':
            case '5m':
              visibleCandles = Math.min(200, dataLength); // Show more for intraday
              break;
            case '15m':
            case '30m':
              visibleCandles = Math.min(300, dataLength);
              break;
            case '1h':
            case '4h':
              visibleCandles = Math.min(500, dataLength);
              break;
            case '1d':
              visibleCandles = Math.min(1000, dataLength); // Show many years
              break;
            case '1w':
            case '1mo':
              visibleCandles = Math.min(2000, dataLength); // Show decades
              break;
            default:
              visibleCandles = Math.min(300, dataLength);
          }
          
          // FORCE SCROLL TO ABSOLUTE END TO SHOW LATEST DATA (September 12, 2025)
          const scrollOffset = Math.max(0, dataLength - visibleCandles);
          
          console.log(`📊 Scroll calculation: dataLength=${dataLength}, visibleCandles=${visibleCandles}, scrollOffset=${scrollOffset}`);
          console.log(`📊 This should show data from index ${scrollOffset} to ${scrollOffset + visibleCandles - 1}`);
          
          // ATOMIC STATE UPDATE - all at once for best performance
          setData(transformedData);
          setPriceRange({ min: minPrice - padding, max: maxPrice + padding });
          setScrollOffset(scrollOffset);
          setVisibleCandleCount(visibleCandles);
          
          console.log(`✅ Data successfully set for ${sym} ${timeframe}:`, {
            dataLength: transformedData.length,
            priceRange: { min: minPrice - padding, max: maxPrice + padding },
            scrollOffset,
            visibleCandles,
            firstDataPoint: transformedData[0] ? new Date(transformedData[0].timestamp).toISOString() : 'none',
            lastDataPoint: transformedData[transformedData.length - 1] ? new Date(transformedData[transformedData.length - 1].timestamp).toISOString() : 'none'
          });
          
          // Update current price from historical data (real-time fetched separately)
          const latest = transformedData[dataLength - 1];
          setCurrentPrice(latest.close);
          
          // Calculate price change and percentage change
          if (dataLength >= 2) {
            const previous = transformedData[dataLength - 2];
            const change = latest.close - previous.close;
            const changePercent = (change / previous.close) * 100;
            setPriceChange(change);
            setPriceChangePercent(changePercent);
            console.log(`💰 ${symbol} Price Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`);
          }
        } else {
          console.warn(`⚠️ No data returned for ${symbol} ${timeframe}`);
          setData([]);
          setError(`No historical data available for ${symbol} in the ${timeframe} timeframe. This may be due to market holidays, weekends, or symbol trading status.`);
        }
      } else {
        throw new Error('Invalid data format - missing results array');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      console.error(`❌ Error fetching data for ${symbol} ${timeframe}:`, errorMessage);
      
      // INTELLIGENT ERROR HANDLING - provide helpful suggestions
      if (errorMessage.includes('404')) {
        setError(`Symbol ${symbol} not found. Please verify the ticker symbol.`);
      } else if (errorMessage.includes('rate limit')) {
        setError(`Rate limit exceeded. Please wait a moment and try again.`);
      } else if (errorMessage.includes('network')) {
        setError(`Network error. Please check your connection and try again.`);
      } else {
        setError(`Unable to load ${timeframe} data for ${symbol}: ${errorMessage}`);
      }
      
      setData([]);
    } finally {
      setLoading(false);
      
      // PERFORMANCE METRICS for optimization
      console.log(`⏱️ Data load completed for ${symbol} ${config.timeframe}`);
    }
  }, [symbol, config.timeframe, setError, setLoading, setData, setPriceRange, setScrollOffset, setVisibleCandleCount, setCurrentPrice]);

  // ENHANCED DATA FETCHING WITH PROFESSIONAL CACHING
  useEffect(() => {
    if (!symbol || !config.timeframe) return;
    
    console.log(`🔄 Fetching data for ${symbol} ${config.timeframe}`);
    fetchData(symbol, config.timeframe);
  }, [symbol, config.timeframe, fetchData]);

  // Auto-fit chart to data
  const fitChart = useCallback(() => {
    if (data.length === 0) return;
    
    const prices = data.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;
    
    setPriceRange({
      min: minPrice - padding,
      max: maxPrice + padding
    });
  }, [data]);

  // Handle container resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Initialize chart - SIMPLE
  useEffect(() => {
    fetchData(symbol, config.timeframe);
  }, [symbol, config.timeframe, fetchData]);

  // Fetch current price independently when symbol changes
  useEffect(() => {
    fetchRealTimePrice(symbol);
  }, [symbol, fetchRealTimePrice]);

  // Set up REAL-TIME price updates every 5 seconds for live data
  useEffect(() => {
    const interval = setInterval(() => {
      console.log(`🔄 REAL-TIME refresh for ${symbol}...`);
      fetchRealTimePrice(symbol);
    }, 5000); // Update every 5 seconds for REAL-TIME

    return () => clearInterval(interval);
  }, [symbol, fetchRealTimePrice]);

  // Initialize scroll position with FULL DATA - DISABLED to prevent override
  // This was overriding the timeframe-specific scroll positioning
  /*
  useEffect(() => {
    if (data.length > 0) {
      const defaultVisible = Math.min(500, data.length); // SHOW UP TO 500 CANDLES
      setVisibleCandleCount(defaultVisible);
      setScrollOffset(Math.max(0, data.length - defaultVisible));
    }
  }, [data.length]);
  */

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      if (showTimeframeDropdown && !target.closest('.timeframe-dropdown')) {
        setShowTimeframeDropdown(false);
      }
      
      if (showIndicatorsDropdown && !target.closest('.indicators-dropdown')) {
        setShowIndicatorsDropdown(false);
      }
      
      if (showToolsDropdown && !target.closest('.tools-dropdown')) {
        setShowToolsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTimeframeDropdown, showIndicatorsDropdown, showToolsDropdown]);

  // Render overlay (crosshair, zoom feedback)
  const renderOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Enable crisp rendering for sharp lines and shapes
    ctx.imageSmoothingEnabled = false;
    (ctx as any).webkitImageSmoothingEnabled = false;
    (ctx as any).mozImageSmoothingEnabled = false;
    (ctx as any).msImageSmoothingEnabled = false;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw crosshair if enabled and mouse is over chart
    if (config.crosshair && crosshairPosition.x > 0 && crosshairPosition.y > 0) {
      ctx.strokeStyle = config.theme === 'dark' ? '#555555' : '#cccccc';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);

      // Vertical crosshair line
      ctx.beginPath();
      ctx.moveTo(crosshairPosition.x, 0);
      ctx.lineTo(crosshairPosition.x, height);
      ctx.stroke();

      // Horizontal crosshair line  
      ctx.beginPath();
      ctx.moveTo(0, crosshairPosition.y);
      ctx.lineTo(width, crosshairPosition.y);
      ctx.stroke();

      ctx.setLineDash([]);

      // PROFESSIONAL CROSSHAIR LABELS - Display price and date/time on axes
      if (crosshairInfo.visible) {
        // CRISP HIGH-QUALITY TEXT RENDERING - Larger and crisper
        ctx.font = 'bold 18px "Segoe UI", system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.imageSmoothingEnabled = false; // Disable for crisper text
        ctx.imageSmoothingQuality = 'high';

        // Y-AXIS PRICE LABEL (right side)
        const priceText = crosshairInfo.price;
        const priceTextWidth = ctx.measureText(priceText).width + 24; // Increased padding for larger text
        const priceY = crosshairPosition.y;
        
        // Price label background (right side of chart) - darker for contrast
        ctx.fillStyle = config.theme === 'dark' ? '#1a202c' : '#2d3748';
        ctx.strokeStyle = config.theme === 'dark' ? '#2d3748' : '#4a5568';
        ctx.lineWidth = 1;
        ctx.fillRect(width - priceTextWidth - 5, priceY - 16, priceTextWidth, 32); // Larger background
        ctx.strokeRect(width - priceTextWidth - 5, priceY - 16, priceTextWidth, 32);
        
        // CRISP WHITE PRICE TEXT with enhanced shadow for maximum clarity
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(priceText, width - priceTextWidth/2 - 5, priceY);
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // X-AXIS DATE/TIME LABEL (bottom)
        const dateText = crosshairInfo.date; // Only show date, no time
        const dateTextWidth = ctx.measureText(dateText).width + 24; // Increased padding
        const dateX = crosshairPosition.x;
        
        // Ensure date label doesn't go off screen
        const labelX = Math.max(dateTextWidth/2, Math.min(width - dateTextWidth/2, dateX));
        
        // Date label background (bottom of chart) - darker for contrast
        ctx.fillStyle = config.theme === 'dark' ? '#1a202c' : '#2d3748';
        ctx.strokeStyle = config.theme === 'dark' ? '#2d3748' : '#4a5568';
        ctx.lineWidth = 1;
        ctx.fillRect(labelX - dateTextWidth/2, height - 35, dateTextWidth, 28); // Reduced background size
        ctx.strokeRect(labelX - dateTextWidth/2, height - 35, dateTextWidth, 28);
        
        // CRISP WHITE DATE TEXT with enhanced shadow for maximum clarity
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(dateText, labelX, height - 21); // Moved up to match reduced background
        
        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Enhanced OHLC Info Panel (top-left corner)
        if (crosshairInfo.ohlc) {
          const ohlc = crosshairInfo.ohlc;
          const panelX = 20;
          const panelY = 20;
          const panelWidth = 220;
          const panelHeight = 100;
          
          // Panel background - solid black with border
          ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
          ctx.strokeStyle = '#333333';
          ctx.lineWidth = 1;
          ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
          ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
          
          // Panel content with larger text
          ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          
          const lineHeight = 20;
          let currentY = panelY + 12;
          
          // OHLC values in a clean grid layout
          // First row: Open and High
          ctx.fillStyle = '#888888';
          ctx.fillText('O:', panelX + 12, currentY);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(`$${ohlc.open.toFixed(2)}`, panelX + 35, currentY);
          
          ctx.fillStyle = '#888888';
          ctx.fillText('H:', panelX + 120, currentY);
          ctx.fillStyle = '#00ff88'; // Bright green for high
          ctx.fillText(`$${ohlc.high.toFixed(2)}`, panelX + 143, currentY);
          currentY += lineHeight;
          
          // Second row: Low and Close
          ctx.fillStyle = '#888888';
          ctx.fillText('L:', panelX + 12, currentY);
          ctx.fillStyle = '#ff4444'; // Bright red for low
          ctx.fillText(`$${ohlc.low.toFixed(2)}`, panelX + 35, currentY);
          
          ctx.fillStyle = '#888888';
          ctx.fillText('C:', panelX + 120, currentY);
          const closeColor = (ohlc.change !== undefined && ohlc.change >= 0) ? '#00ff88' : '#ff4444';
          ctx.fillStyle = closeColor;
          ctx.fillText(`$${ohlc.close.toFixed(2)}`, panelX + 143, currentY);
          currentY += lineHeight;
          
          // Change and percentage in one line
          if (ohlc.change !== undefined && ohlc.changePercent !== undefined) {
            const changeText = ohlc.change >= 0 ? `+$${ohlc.change.toFixed(2)}` : `-$${Math.abs(ohlc.change).toFixed(2)}`;
            const percentText = ohlc.changePercent >= 0 ? `+${ohlc.changePercent.toFixed(2)}%` : `${ohlc.changePercent.toFixed(2)}%`;
            
            ctx.fillStyle = closeColor;
            ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
            ctx.fillText(`${changeText} (${percentText})`, panelX + 12, currentY);
            currentY += lineHeight - 2;
          }
          
          // Volume
          if (crosshairInfo.volume) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px "Segoe UI", system-ui, sans-serif';
            const volumeText = crosshairInfo.volume >= 1000000 
              ? `${(crosshairInfo.volume / 1000000).toFixed(1)}M`
              : crosshairInfo.volume >= 1000
              ? `${(crosshairInfo.volume / 1000).toFixed(1)}K`
              : crosshairInfo.volume.toString();
            ctx.fillText(`Vol: ${volumeText}`, panelX + 12, currentY);
          }
        }
      }
    }
    
    // Draw box zoom selection
    if (isBoxZooming && boxZoomStart && boxZoomEnd) {
      const startX = Math.min(boxZoomStart.x, boxZoomEnd.x);
      const endX = Math.max(boxZoomStart.x, boxZoomEnd.x);
      const startY = Math.min(boxZoomStart.y, boxZoomEnd.y);
      const endY = Math.max(boxZoomStart.y, boxZoomEnd.y);
      
      // Box zoom selection overlay
      ctx.fillStyle = 'rgba(41, 98, 255, 0.1)'; // Blue with transparency
      ctx.strokeStyle = '#2962ff'; // Blue border
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      // Fill the selection area
      ctx.fillRect(startX, startY, endX - startX, endY - startY);
      
      // Stroke the border
      ctx.strokeRect(startX, startY, endX - startX, endY - startY);
      
      // Reset line dash
      ctx.setLineDash([]);
      
      // Add corner handles
      const handleSize = 6;
      ctx.fillStyle = '#2962ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      
      // Four corner handles
      const corners = [
        { x: startX, y: startY },
        { x: endX, y: startY },
        { x: startX, y: endY },
        { x: endX, y: endY }
      ];
      
      corners.forEach(corner => {
        ctx.fillRect(corner.x - handleSize/2, corner.y - handleSize/2, handleSize, handleSize);
        ctx.strokeRect(corner.x - handleSize/2, corner.y - handleSize/2, handleSize, handleSize);
      });
      
      // Add text instruction
      ctx.font = '12px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#2962ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const centerX = (startX + endX) / 2;
      const centerY = (startY + endY) / 2;
      ctx.fillText('Release to zoom', centerX, centerY);
    }
  }, [dimensions, config.crosshair, config.theme, crosshairPosition, crosshairInfo, isBoxZooming, boxZoomStart, boxZoomEnd]);

  // Update overlay when interactions change
  useEffect(() => {
    renderOverlay();
  }, [renderOverlay]);

  // Debug: Monitor drawings state changes
  useEffect(() => {
    console.log('🔍 Debug: drawings state changed, count:', drawingsRef.current.length);
    console.log('🔍 Debug: current drawings:', drawingsRef.current);
  }, [drawings]);

  // Keyboard shortcuts for TradingView-like functionality
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return; // Don't interfere with inputs
      
      switch (e.key) {
        case 'Home':
          e.preventDefault();
          // Go to beginning of data
          setScrollOffset(0);
          break;
        case 'End':
          e.preventDefault(); 
          // Go to end of data
          setScrollOffset(Math.max(0, data.length - visibleCandleCount));
          break;
        case '+':
        case '=':
          e.preventDefault();
          // Zoom in (show fewer candles)
          const newCountIn = Math.max(20, Math.round(visibleCandleCount * 0.8));
          const centerRatio = (scrollOffset + visibleCandleCount / 2) / data.length;
          const newOffsetIn = Math.max(0, Math.min(
            data.length - newCountIn,
            Math.round(centerRatio * data.length - newCountIn / 2)
          ));
          setVisibleCandleCount(newCountIn);
          setScrollOffset(newOffsetIn);
          break;
        case '-':
          e.preventDefault();
          // Zoom out (show more candles)
          const newCountOut = Math.min(500, Math.round(visibleCandleCount * 1.25));
          const centerRatioOut = (scrollOffset + visibleCandleCount / 2) / data.length;
          const newOffsetOut = Math.max(0, Math.min(
            data.length - newCountOut,
            Math.round(centerRatioOut * data.length - newCountOut / 2)
          ));
          setVisibleCandleCount(newCountOut);
          setScrollOffset(newOffsetOut);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          // Pan left (go back in time)
          const panLeft = Math.max(1, Math.round(visibleCandleCount * 0.1));
          setScrollOffset(Math.max(0, scrollOffset - panLeft));
          break;
        case 'ArrowRight':
          e.preventDefault();
          // Pan right (go forward in time) - allow extending beyond data for future view
          const panRight = Math.max(1, Math.round(visibleCandleCount * 0.1));
          const futurePeriods = getFuturePeriods(config.timeframe);
          const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
          const maxScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
          setScrollOffset(Math.min(maxScrollOffset, scrollOffset + panRight));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data.length, scrollOffset, visibleCandleCount]);

  // Wheel event handler for zoom and scroll - with Y-axis scaling support
  useEffect(() => {
    const handleWheelEvent = (e: WheelEvent) => {
      // Check if the event is on our canvas elements
      const overlayCanvas = overlayCanvasRef.current;
      const chartCanvas = chartCanvasRef.current;
      
      if (!overlayCanvas || !chartCanvas || data.length === 0) return;
      
      // Check if the wheel event is over one of our canvas elements
      const target = e.target as Element;
      if (!overlayCanvas.contains(target) && !chartCanvas.contains(target) && target !== overlayCanvas && target !== chartCanvas) {
        return;
      }
      
      e.preventDefault();
      
      // Get mouse position relative to canvas
      const rect = overlayCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const canvasWidth = overlayCanvas.width / window.devicePixelRatio;
      
      // Check if mouse is over Y-axis area (right side)
      const isOverYAxis = isInYAxisArea(mouseX, canvasWidth);
      
      if (isOverYAxis) {
        // Y-axis scaling when wheel over Y-axis area
        const delta = e.deltaY;
        const scaleFactor = delta > 0 ? 1.1 : 0.9; // Scale up or down
        
        // Get current visible data for price range calculation
        const startIndex = Math.max(0, Math.floor(scrollOffset));
        const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
        const visibleData = data.slice(startIndex, endIndex);
        
        if (visibleData.length > 0) {
          const currentRange = getCurrentPriceRange(visibleData);
          const center = (currentRange.min + currentRange.max) / 2;
          const currentHeight = currentRange.max - currentRange.min;
          const newHeight = currentHeight * scaleFactor;
          
          const newRange = {
            min: center - newHeight / 2,
            max: center + newHeight / 2
          };
          
          setManualPriceRangeAndDisableAuto(newRange);
        }
      } else {
        // Regular zoom/pan when not over Y-axis
        const delta = e.deltaY;
        const scrollSensitivity = 1.5; // Reduced from 3 to 1.5 for slower horizontal scrolling
        
        if (Math.abs(delta) > Math.abs(e.deltaX)) {
          // Vertical scroll - zoom in/out
          const zoomDirection = delta > 0 ? 1 : -1; // 1 = zoom out, -1 = zoom in
          const zoomFactor = 0.1;
          
          // Calculate new candle count
          const currentCount = visibleCandleCount;
          const maxCandles = Math.min(data.length, 300);
          const minCandles = 20;
          
          let newCount;
          if (zoomDirection === 1) {
            // Zoom out - show more candles
            newCount = Math.min(maxCandles, Math.round(currentCount * (1 + zoomFactor)));
          } else {
            // Zoom in - show fewer candles
            newCount = Math.max(minCandles, Math.round(currentCount * (1 - zoomFactor)));
          }
          
          // Adjust scroll offset to keep the center of the view relatively stable
          const centerRatio = 0.5;
          const oldCenterIndex = scrollOffset + (currentCount * centerRatio);
          const futurePeriods = getFuturePeriods(config.timeframe);
          const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(newCount * 0.2));
          const newOffset = Math.max(0, Math.min(
            data.length - newCount + maxFuturePeriods,
            Math.round(oldCenterIndex - (newCount * centerRatio))
          ));
          
          setVisibleCandleCount(newCount);
          setScrollOffset(newOffset);
        } else {
          // Horizontal scroll - pan left/right - allow extending beyond data for future view
          const scrollDirection = delta > 0 ? 1 : -1;
          const futurePeriods = getFuturePeriods(config.timeframe);
          const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
          const maxScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
          const newOffset = Math.max(0, Math.min(
            maxScrollOffset,
            scrollOffset + (scrollDirection * scrollSensitivity)
          ));
          setScrollOffset(newOffset);
        }
      }
    };

    // Add wheel event listener with passive: false to allow preventDefault
    const overlayCanvas = overlayCanvasRef.current;
    const chartCanvas = chartCanvasRef.current;
    
    if (overlayCanvas) {
      overlayCanvas.addEventListener('wheel', handleWheelEvent, { passive: false });
    }
    if (chartCanvas) {
      chartCanvas.addEventListener('wheel', handleWheelEvent, { passive: false });
    }
    
    return () => {
      if (overlayCanvas) {
        overlayCanvas.removeEventListener('wheel', handleWheelEvent);
      }
      if (chartCanvas) {
        chartCanvas.removeEventListener('wheel', handleWheelEvent);
      }
    };
  }, [data.length, scrollOffset, visibleCandleCount, isInYAxisArea, getCurrentPriceRange, setManualPriceRangeAndDisableAuto]);

  // Helper function to determine if a timestamp is during market hours
  const isMarketHours = (timestamp: number): boolean => {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const minute = date.getMinutes();
    const totalMinutes = hour * 60 + minute;
    
    // Regular market hours: 9:30 AM - 4:00 PM ET (570 - 960 minutes)
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    return totalMinutes >= marketOpen && totalMinutes < marketClose;
  };

  // Draw market hours background shading
  const drawMarketHoursBackground = (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number, 
    visibleData: ChartDataPoint[], 
    chartWidth: number,
    visibleCandleCount: number
  ) => {
    // Only show market hours shading for intraday timeframes
    if (!config.timeframe.includes('m') && !config.timeframe.includes('h')) {
      return; // Skip for daily and longer timeframes
    }

    const candleSpacing = chartWidth / visibleCandleCount;
    
    visibleData.forEach((candle, index) => {
      const x = 40 + (index * candleSpacing);
      const isMarket = isMarketHours(candle.timestamp);
      
      if (!isMarket) {
        // Draw gray background for pre-market and after-hours
        ctx.fillStyle = colors.grid + '20'; // Semi-transparent gray
        ctx.fillRect(x, 0, candleSpacing, height);
      }
    });
  };

  // Render main price chart with integrated volume
  const renderChart = useCallback(() => {
    const canvas = chartCanvasRef.current;
    console.log(`🎨 renderChart called - data.length: ${data.length}, dimensions: ${dimensions.width}x${dimensions.height}`);
    
    if (!canvas || !data.length || dimensions.width === 0 || dimensions.height === 0) {
      console.log(`🚫 renderChart early return - canvas: ${!!canvas}, data.length: ${data.length}, dimensions: ${dimensions.width}x${dimensions.height}`);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log(`🚫 renderChart - no canvas context`);
      return;
    }

    console.log(`✅ renderChart proceeding with rendering...`);
    const { width } = dimensions;
    const height = chartHeight;

    // Set canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Enable crisp rendering for sharp lines and shapes
    ctx.imageSmoothingEnabled = false;
    (ctx as any).webkitImageSmoothingEnabled = false;
    (ctx as any).mozImageSmoothingEnabled = false;
    (ctx as any).msImageSmoothingEnabled = false;

    console.log(`🎨 Rendering integrated chart: ${width}x${height}, theme: ${config.theme}, background: ${colors.background}`);

    // Clear canvas with theme-appropriate background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);

    // Calculate chart areas - reserve space for volume, indicators, and time axis
    const timeAxisHeight = 25;
    const oscillatorIndicators = config.indicators.filter(ind => ['gex'].includes(ind));
    const indicatorPanelHeight = oscillatorIndicators.length > 0 ? 120 * oscillatorIndicators.length : 0;
    
    const priceChartHeight = height - volumeAreaHeight - indicatorPanelHeight - timeAxisHeight;
    const volumeStartY = priceChartHeight;
    const volumeEndY = priceChartHeight + volumeAreaHeight;
    const indicatorStartY = volumeEndY;
    const indicatorEndY = indicatorStartY + indicatorPanelHeight;

    // Draw grid first for price chart area (only if enabled)
    if (config.showGrid) {
      drawGrid(ctx, width, priceChartHeight);
    }

    // Calculate visible data range using scrollOffset and visibleCandleCount
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length === 0) return;

    // Debug logging
    console.log('Scroll Debug:', {
      scrollOffset,
      startIndex,
      endIndex,
      dataLength: data.length,
      visibleCandleCount,
      visibleDataLength: visibleData.length,
      beyondData: (startIndex + visibleCandleCount) > data.length
    });

    // Calculate chart dimensions - only extend when scrolled near the end
    const chartWidth = width - 120; // Leave more space for price scale to prevent overlap
    
    // Check if we're showing future area (scrolled beyond data)
    const actualDataEnd = startIndex + visibleData.length;
    const requestedEnd = startIndex + visibleCandleCount;
    const showingFutureArea = requestedEnd > data.length;
    
    let totalPeriods = visibleCandleCount; // Always use full visible candle count for consistent spacing
    let limitedFuturePeriods = 0;
    
    if (showingFutureArea) {
      // We're in the future area, calculate how much
      limitedFuturePeriods = requestedEnd - data.length;
      console.log('Future area detected:', {
        requestedEnd,
        dataLength: data.length,
        futurePeriodsShown: limitedFuturePeriods
      });
    }
    
    // Draw market hours background shading
    drawMarketHoursBackground(ctx, width, priceChartHeight, visibleData, chartWidth, visibleCandleCount);

    // Calculate price range for visible data using shared function
    const currentPriceRange = getCurrentChartPriceRange();
    let adjustedMin = currentPriceRange.min;
    let adjustedMax = currentPriceRange.max;

    // Expand price range to include Expected Range levels if active
    if (isExpectedRangeActive && expectedRangeLevels) {
      const allLevels = [
        expectedRangeLevels.weekly80Call,
        expectedRangeLevels.weekly90Call,
        expectedRangeLevels.weekly80Put,
        expectedRangeLevels.weekly90Put,
        expectedRangeLevels.monthly80Call,
        expectedRangeLevels.monthly90Call,
        expectedRangeLevels.monthly80Put,
        expectedRangeLevels.monthly90Put
      ];
      
      const minLevel = Math.min(...allLevels);
      const maxLevel = Math.max(...allLevels);
      
      // Expand the range to include all Expected Range levels with some padding
      const originalRange = adjustedMax - adjustedMin;
      const padding = originalRange * 0.05; // 5% padding
      
      adjustedMin = Math.min(adjustedMin, minLevel - padding);
      adjustedMax = Math.max(adjustedMax, maxLevel + padding);
      
      console.log(`📊 Expanded price range for Expected Range: $${adjustedMin.toFixed(2)} - $${adjustedMax.toFixed(2)}`);
      console.log(`📊 Expected Range levels: $${minLevel.toFixed(2)} - $${maxLevel.toFixed(2)}`);
    }

    console.log(`💰 Final price range: $${adjustedMin.toFixed(2)} - $${adjustedMax.toFixed(2)}`);

    // Draw chart in price chart area - use consistent spacing regardless of future area
    const candleWidth = Math.max(2, chartWidth / visibleCandleCount * 0.8);
    const candleSpacing = chartWidth / visibleCandleCount;

    if (config.chartType === 'line') {
      // Draw line chart connecting close prices
      if (visibleData.length > 1) {
        ctx.strokeStyle = colors.bullish;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        visibleData.forEach((candle, index) => {
          const x = 40 + (index * candleSpacing) + candleSpacing / 2;
          const closeY = priceChartHeight - ((candle.close - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
          
          if (index === 0) {
            ctx.moveTo(x, closeY);
          } else {
            ctx.lineTo(x, closeY);
          }
        });
        
        ctx.stroke();

        // Draw dots at each price point
        ctx.fillStyle = colors.bullish;
        visibleData.forEach((candle, index) => {
          const x = 40 + (index * candleSpacing) + candleSpacing / 2;
          const closeY = priceChartHeight - ((candle.close - adjustedMin) / (adjustedMax - adjustedMin)) * priceChartHeight;
          
          ctx.beginPath();
          ctx.arc(x, closeY, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    } else {
      // Draw candlesticks/bars/area/hollow candles
      visibleData.forEach((candle, index) => {
        const x = Math.round(40 + (index * candleSpacing) + (candleSpacing - candleWidth) / 2);
        drawCandle(ctx, candle, x, Math.round(candleWidth), priceChartHeight, adjustedMin, adjustedMax);
      });
    }

    // Draw volume bars above the X-axis
    if (config.volume) {
      const maxVolume = Math.max(...visibleData.map(d => d.volume));
      const barWidth = Math.max(1, chartWidth / visibleData.length * 0.8);
      const barSpacing = chartWidth / visibleData.length;

      visibleData.forEach((candle, index) => {
        const x = Math.round(40 + (index * barSpacing) + (barSpacing - barWidth) / 2);
        const barHeight = Math.round((candle.volume / maxVolume) * (volumeAreaHeight - 10));
        const isGreen = candle.close > candle.open;
        
        ctx.fillStyle = isGreen ? config.colors.volume.bullish : config.colors.volume.bearish;
        ctx.fillRect(x, volumeEndY - barHeight, Math.round(barWidth), barHeight);
      });

      // Draw volume scale on the right side
      ctx.fillStyle = colors.textSecondary;
      ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      
      const volumeSteps = 2;
      for (let i = 0; i <= volumeSteps; i++) {
        const volume = (maxVolume / volumeSteps) * (volumeSteps - i);
        const y = volumeStartY + 5 + ((volumeAreaHeight - 10) / volumeSteps) * i;
        
        // Format volume (K, M, B)
        let volumeText = '';
        if (volume >= 1000000000) {
          volumeText = (volume / 1000000000).toFixed(1) + 'B';
        } else if (volume >= 1000000) {
          volumeText = (volume / 1000000).toFixed(1) + 'M';
        } else if (volume >= 1000) {
          volumeText = (volume / 1000).toFixed(1) + 'K';
        } else {
          volumeText = volume.toFixed(0);
        }
        
        ctx.fillText(volumeText, width - 75, y + 3);
      }
    }

    // Draw price scale on the right for price chart area
    drawPriceScale(ctx, width, priceChartHeight, adjustedMin, adjustedMax);

    // Draw Expected Range lines on top of candlesticks (standalone button)
    if (isExpectedRangeActive && expectedRangeLevels) {
      console.log('🎨 Rendering Expected Range lines on top of chart');
      renderExpectedRangeLines(
        ctx,
        chartWidth,
        priceChartHeight,
        adjustedMin,
        adjustedMax,
        expectedRangeLevels,
        visibleData,
        visibleCandleCount
      );
      console.log('📊 Expected Range lines rendered on top');
    }

    // Draw time axis at the bottom
    drawTimeAxis(ctx, width, height, visibleData, chartWidth, visibleCandleCount, scrollOffset, data);

    // Draw indicators if enabled
    if (config.indicators && config.indicators.length > 0) {
      console.log(`🔍 Drawing ${config.indicators.length} indicators:`, config.indicators);
      drawIndicators(ctx, visibleData, chartWidth, priceChartHeight, adjustedMin, adjustedMax, candleSpacing, indicatorStartY, indicatorEndY, oscillatorIndicators);
    } else {
      console.log(`🔍 No indicators to draw. config.indicators:`, config.indicators);
    }

    // Draw stored drawings on overlay canvas (not main chart)
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) {
      const overlayCtx = overlayCanvas.getContext('2d');
      if (overlayCtx) {
        console.log('🎨 [OVERLAY] Drawing on overlay canvas');
        drawStoredDrawings(overlayCtx);
      }
    }

    console.log(`✅ Integrated chart rendered successfully with ${config.theme} theme`);

  }, [data, dimensions, chartHeight, config.chartType, config.theme, config.volume, config.showGrid, config.axisStyle, config.indicators, colors, scrollOffset, visibleCandleCount, volumeAreaHeight, drawings]);

  // Draw grid lines for price chart area only
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, priceHeight: number) => {
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;

    // Horizontal grid lines (price levels) - only in price chart area
    for (let i = 0; i <= 10; i++) {
      const y = (priceHeight / 10) * i;
      ctx.beginPath();
      ctx.moveTo(50, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    // Vertical grid lines (time)
    const gridSpacing = Math.max(50, (width - 70) / 20);
    for (let x = 50; x < width - 20; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, priceHeight);
      ctx.stroke();
    }
  };

  // Helper function to calculate future periods for 4 weeks
  const getFuturePeriods = (timeframe: string): number => {
    switch (timeframe) {
      case '1m': return 4 * 7 * 24 * 60; // 4 weeks * 7 days * 24 hours * 60 minutes
      case '5m': return 4 * 7 * 24 * 12; // 4 weeks * 7 days * 24 hours * 12 (5-min periods per hour)
      case '15m': return 4 * 7 * 24 * 4; // 4 weeks * 7 days * 24 hours * 4 (15-min periods per hour)
      case '30m': return 4 * 7 * 24 * 2; // 4 weeks * 7 days * 24 hours * 2 (30-min periods per hour)
      case '1h': return 4 * 7 * 24; // 4 weeks * 7 days * 24 hours
      case '4h': return 4 * 7 * 6; // 4 weeks * 7 days * 6 (4-hour periods per day)
      case '1d': return 4 * 7; // 4 weeks * 7 days
      case '1w': return 4; // 4 weeks
      case '1mo': return 1; // Approximately 1 month for 4 weeks
      default: return 4 * 7; // Default to 4 weeks in days
    }
  };

  // Technical Indicator Calculations
  const calculateRSI = (data: ChartDataPoint[], period = 14): number[] => {
    if (data.length < period + 1) return [];
    
    const rsi: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    for (let i = period - 1; i < gains.length; i++) {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
      
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
    
    return rsi;
  };

  const calculateSMA = (data: ChartDataPoint[], period: number): number[] => {
    const sma: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, candle) => acc + candle.close, 0);
      sma.push(sum / period);
    }
    return sma;
  };

  const calculateEMA = (data: ChartDataPoint[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    // Start with SMA for first value
    const firstSMA = data.slice(0, period).reduce((acc, candle) => acc + candle.close, 0) / period;
    ema.push(firstSMA);
    
    for (let i = period; i < data.length; i++) {
      const currentEMA: number = (data[i].close * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
      ema.push(currentEMA);
    }
    
    return ema;
  };

  const calculateMACD = (data: ChartDataPoint[]): { macdLine: number[], signalLine: number[] } => {
    const ema12 = calculateEMA(data, 12);
    const ema26 = calculateEMA(data, 26);
    
    const macdLine: number[] = [];
    const startIndex = Math.max(0, ema26.length - ema12.length);
    
    for (let i = startIndex; i < ema12.length; i++) {
      macdLine.push(ema12[i] - ema26[i - startIndex]);
    }
    
    // Signal line (9-period EMA of MACD)
    const signalLine = calculateEMA(macdLine.map((value, index) => ({ close: value })) as ChartDataPoint[], 9);
    
    return { macdLine, signalLine };
  };

  const calculateBollingerBands = (data: ChartDataPoint[], period = 20, stdDev = 2): Array<{upper: number, middle: number, lower: number}> => {
    const sma = calculateSMA(data, period);
    const bands: Array<{upper: number, middle: number, lower: number}> = [];
    
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = sma[i - period + 1];
      const variance = slice.reduce((acc, candle) => acc + Math.pow(candle.close - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      bands.push({
        upper: mean + (standardDeviation * stdDev),
        middle: mean,
        lower: mean - (standardDeviation * stdDev)
      });
    }
    
    return bands;
  };

  // Draw indicators on the chart
  const drawIndicators = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    chartHeight: number,
    minPrice: number,
    maxPrice: number,
    candleSpacing: number,
    indicatorStartY: number,
    indicatorEndY: number,
    oscillatorIndicators: string[]
  ) => {
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;

    console.log(`🎯 drawIndicators called with ${config.indicators.length} indicators:`, config.indicators);
    console.log(`🎯 Chart dimensions: ${chartWidth}x${chartHeight}, price range: ${adjustedMin}-${adjustedMax}`);
    console.log(`🎯 Oscillator indicators:`, oscillatorIndicators);
    console.log(`🎯 Indicator panel: Y ${indicatorStartY} to ${indicatorEndY}`);

    // Calculate panel dimensions for oscillators
    const panelHeight = oscillatorIndicators.length > 0 ? (indicatorEndY - indicatorStartY) / oscillatorIndicators.length : 0;
    let oscillatorIndex = 0;

    config.indicators.forEach(indicator => {
      console.log(`🎨 Rendering indicator: ${indicator}`);
      switch (indicator) {
        case 'flowalgo':
          // TODO: Implement Flow Algo indicator  
          console.log('📊 Flow Algo indicator - to be implemented');
          break;
        case 'gex':
          const gexPanelStart = indicatorStartY + (oscillatorIndex * panelHeight);
          const gexPanelEnd = gexPanelStart + panelHeight;
          // TODO: Implement GEX indicator
          console.log('📊 GEX indicator - to be implemented');
          oscillatorIndex++;
          break;
        default:
          console.log(`⚠️ Unknown indicator: ${indicator}`);
      }
    });
  };

  const drawSMA = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    chartHeight: number,
    minPrice: number,
    maxPrice: number,
    candleSpacing: number,
    period: number,
    color: string
  ) => {
    console.log(`📈 Drawing SMA${period} with ${visibleData.length} data points, color: ${color}`);
    const sma = calculateSMA(visibleData, period);
    console.log(`📈 Calculated SMA${period}: ${sma.length} values, first few:`, sma.slice(0, 3));
    
    if (sma.length < 2) {
      console.log(`❌ Not enough SMA data: ${sma.length} values`);
      return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const startOffset = period - 1;
    sma.forEach((value, index) => {
      const x = 40 + ((index + startOffset) * candleSpacing) + candleSpacing / 2;
      const y = chartHeight - ((value - minPrice) / (maxPrice - minPrice)) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    console.log(`✅ SMA${period} drawn successfully`);
  };

  const drawEMA = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    chartHeight: number,
    minPrice: number,
    maxPrice: number,
    candleSpacing: number,
    period: number,
    color: string
  ) => {
    const ema = calculateEMA(visibleData, period);
    if (ema.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const startOffset = period - 1;
    ema.forEach((value, index) => {
      const x = 40 + ((index + startOffset) * candleSpacing) + candleSpacing / 2;
      const y = chartHeight - ((value - minPrice) / (maxPrice - minPrice)) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  };

  const drawBollingerBands = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    chartHeight: number,
    minPrice: number,
    maxPrice: number,
    candleSpacing: number
  ) => {
    const bands = calculateBollingerBands(visibleData);
    if (bands.length < 2) return;

    const bandColors = ['#e91e63', '#4caf50', '#e91e63']; // Upper, Middle, Lower
    const lines = ['upper', 'middle', 'lower'];

    lines.forEach((line, lineIndex) => {
      ctx.strokeStyle = bandColors[lineIndex];
      ctx.lineWidth = 1.5;
      ctx.setLineDash(line === 'middle' ? [] : [5, 5]);
      ctx.beginPath();

      bands.forEach((band, index) => {
        const value = band[line as keyof typeof band];
        const x = 40 + ((index + 19) * candleSpacing) + candleSpacing / 2;
        const y = chartHeight - ((value - minPrice) / (maxPrice - minPrice)) * chartHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      ctx.setLineDash([]);
    });
  };

  const drawRSI = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    candleSpacing: number,
    panelStartY: number,
    panelEndY: number
  ) => {
    const rsi = calculateRSI(visibleData);
    if (rsi.length < 2) return;

    // Calculate RSI panel dimensions with proper margins
    const margin = 5;
    const rsiStartY = panelStartY + margin;
    const rsiHeight = panelEndY - panelStartY - (margin * 2);

    // Draw RSI panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(40, rsiStartY, chartWidth - 80, rsiHeight);

    // Draw RSI panel border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, rsiStartY, chartWidth - 80, rsiHeight);

    // RSI reference lines (30, 50, 70) with proper scaling
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    
    [30, 50, 70].forEach(level => {
      const y = rsiStartY + rsiHeight - (level / 100) * rsiHeight;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(chartWidth - 40, y);
      ctx.stroke();
      
      // Draw level labels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(level.toString(), chartWidth - 45, y + 3);
    });

    // Calculate visible data range
    const dataStartIndex = 14; // RSI needs 14 periods to calculate
    
    if (rsi.length === 0) return;

    // RSI line - start from the beginning of visible area
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Map RSI values to the visible chart area
    rsi.forEach((value, index) => {
      // Calculate x position to align with the candlestick data
      // RSI index 0 corresponds to candlestick at dataStartIndex (14th candle)
      const candlestickIndex = index + dataStartIndex;
      const x = 40 + (candlestickIndex * candleSpacing) + candleSpacing / 2;
      const y = rsiStartY + rsiHeight - (value / 100) * rsiHeight;
      
      // Only draw if within chart bounds and we have valid data
      if (x >= 40 && x <= chartWidth - 40 && candlestickIndex < visibleData.length) {
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    
    ctx.stroke();

    // Draw RSI label and current value
    ctx.fillStyle = '#ff9800';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('RSI', 45, rsiStartY + 18);
    
    // Show current RSI value
    if (rsi.length > 0) {
      const currentRSI = rsi[rsi.length - 1];
      ctx.fillStyle = currentRSI > 70 ? '#f44336' : currentRSI < 30 ? '#4caf50' : '#ff9800';
      ctx.fillText(currentRSI.toFixed(1), 80, rsiStartY + 18);
    }
  };

  const drawMACD = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    candleSpacing: number,
    panelStartY: number,
    panelEndY: number
  ) => {
    const { macdLine, signalLine } = calculateMACD(visibleData);
    if (macdLine.length < 2) return;

    // Calculate MACD panel dimensions with proper margins
    const margin = 5;
    const macdStartY = panelStartY + margin;
    const macdHeight = panelEndY - panelStartY - (margin * 2);

    // Draw MACD panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(40, macdStartY, chartWidth - 80, macdHeight);

    // Draw MACD panel border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, macdStartY, chartWidth - 80, macdHeight);

    // Find MACD range for scaling
    const allValues = [...macdLine, ...signalLine];
    const macdMin = Math.min(...allValues);
    const macdMax = Math.max(...allValues);
    const macdRange = macdMax - macdMin || 1; // Prevent division by zero

    // Draw zero line
    const zeroY = macdStartY + macdHeight - ((0 - macdMin) / macdRange) * macdHeight;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(40, zeroY);
    ctx.lineTo(chartWidth - 40, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw MACD histogram (bars)
    ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
    macdLine.forEach((macdValue, index) => {
      if (index < signalLine.length) {
        const histogram = macdValue - signalLine[index];
        const dataIndex = index + 26; // MACD calculation offset
        const x = 40 + (dataIndex * candleSpacing) + candleSpacing / 2;
        
        // Only draw if within chart bounds and we have valid data
        if (x >= 40 && x <= chartWidth - 40 && dataIndex < visibleData.length) {
          const barHeight = Math.abs((histogram / macdRange) * macdHeight);
          const barY = histogram >= 0 
            ? zeroY - barHeight 
            : zeroY;
          
          ctx.fillStyle = histogram >= 0 ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)';
          ctx.fillRect(x - candleSpacing / 4, barY, candleSpacing / 2, barHeight);
        }
      }
    });

    // MACD line (blue)
    ctx.strokeStyle = '#2196f3';
    ctx.lineWidth = 2;
    ctx.beginPath();

    macdLine.forEach((value, index) => {
      const dataIndex = index + 26; // MACD calculation offset
      const x = 40 + (dataIndex * candleSpacing) + candleSpacing / 2;
      const y = macdStartY + macdHeight - ((value - macdMin) / macdRange) * macdHeight;
      
      // Only draw if within chart bounds and we have valid data
      if (x >= 40 && x <= chartWidth - 40 && dataIndex < visibleData.length) {
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    
    ctx.stroke();

    // Signal line (red)
    ctx.strokeStyle = '#f44336';
    ctx.lineWidth = 2;
    ctx.beginPath();

    signalLine.forEach((value, index) => {
      const dataIndex = index + 35; // Signal line calculation offset (26 + 9)
      const x = 40 + (dataIndex * candleSpacing) + candleSpacing / 2;
      const y = macdStartY + macdHeight - ((value - macdMin) / macdRange) * macdHeight;
      
      // Only draw if within chart bounds and we have valid data
      if (x >= 40 && x <= chartWidth - 40 && dataIndex < visibleData.length) {
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    
    ctx.stroke();

    // Draw MACD labels and current values
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    
    ctx.fillStyle = '#2196f3';
    ctx.fillText('MACD', 45, macdStartY + 18);
    
    ctx.fillStyle = '#f44336';
    ctx.fillText('Signal', 90, macdStartY + 18);

    // Show current values
    if (macdLine.length > 0 && signalLine.length > 0) {
      const currentMACD = macdLine[macdLine.length - 1];
      const currentSignal = signalLine[signalLine.length - 1];
      const currentHistogram = currentMACD - currentSignal;
      
      ctx.fillStyle = '#2196f3';
      ctx.fillText(currentMACD.toFixed(3), 140, macdStartY + 18);
      
      ctx.fillStyle = '#f44336';
      ctx.fillText(currentSignal.toFixed(3), 200, macdStartY + 18);
      
      ctx.fillStyle = currentHistogram >= 0 ? '#4caf50' : '#f44336';
      ctx.fillText(currentHistogram.toFixed(3), 260, macdStartY + 18);
    }
  };

  // Draw individual candle
  const drawCandle = (
    ctx: CanvasRenderingContext2D,
    candle: ChartDataPoint,
    x: number,
    width: number,
    height: number,
    minPrice: number,
    maxPrice: number
  ) => {
    const { open, high, low, close } = candle;
    const isGreen = close > open;
    
    // Get custom colors
    const candleColors = isGreen ? config.colors.bullish : config.colors.bearish;
    
    // Convert prices to canvas coordinates
    const priceToY = (price: number) => {
      const ratio = (price - minPrice) / (maxPrice - minPrice);
      const chartArea = height - 25; // Reserve 25px at bottom for time labels
      return Math.round(chartArea - (ratio * (chartArea - 20)) - 10); // Round to crisp pixels
    };

    const openY = priceToY(open);
    const closeY = priceToY(close);
    const highY = priceToY(high);
    const lowY = priceToY(low);

    // Round x position for crisp rendering
    const crispX = Math.round(x);
    const crispWidth = Math.max(1, Math.round(width));

    // Draw wick (high-low line)
    ctx.strokeStyle = candleColors.wick;
    ctx.lineWidth = Math.max(1, Math.round(width * 0.05)); // Reduced from 0.1 to 0.05 for thinner wicks
    ctx.beginPath();
    ctx.moveTo(crispX + crispWidth / 2, highY);
    ctx.lineTo(crispX + crispWidth / 2, lowY);
    ctx.stroke();

    // Draw body (open-close rectangle)
    if (config.chartType === 'candlestick') {
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      const bodyY = Math.min(openY, closeY);
      const bodyWidth = Math.max(2, crispWidth - 2);
      
      // Fill the body
      ctx.fillStyle = candleColors.body;
      ctx.fillRect(crispX + 1, bodyY, bodyWidth, bodyHeight);
      
      // Draw body border
      ctx.strokeStyle = candleColors.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(crispX + 1, bodyY, bodyWidth, bodyHeight);
    }
  };

  // Draw price scale on the right
  const drawPriceScale = (
    ctx: CanvasRenderingContext2D, 
    width: number, 
    height: number,
    minPrice: number,
    maxPrice: number
  ) => {
    ctx.fillStyle = config.axisStyle.yAxis.textColor;
    ctx.font = `${config.axisStyle.yAxis.textSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';

    const chartArea = height - 25; // Reserve 25px at bottom for time labels
    const steps = 10;
    
    // DEBUG LOG
    console.log(`🐛 Y-AXIS DEBUG: chartArea=${chartArea}, minPrice=${minPrice.toFixed(2)}, maxPrice=${maxPrice.toFixed(2)}`);
    
    for (let i = 0; i <= steps; i++) {
      const ratio = i / steps;
      const price = minPrice + (maxPrice - minPrice) * (1 - ratio);
      const y = 20 + ((chartArea - 40) / steps) * i;
      
      // DEBUG LOG for first few
      if (i <= 2 || i >= 8) {
        console.log(`🐛 Y-AXIS step ${i}: ratio=${ratio.toFixed(3)}, price=$${price.toFixed(2)}, y=${y}`);
      }
      
      // Draw price label
      ctx.fillText(`$${price.toFixed(2)}`, width - 70, y + 4);
      
      // Draw tick mark
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width - 75, y);
      ctx.lineTo(width - 70, y);
      ctx.stroke();
    }

    // Reset styles after drawing Y-axis
    ctx.fillStyle = config.axisStyle.yAxis.textColor;
    ctx.font = `${config.axisStyle.yAxis.textSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'left';
  };

  // Draw time axis at the bottom
  const drawTimeAxis = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    visibleCandleCount: number,
    scrollOffset: number,
    allData: ChartDataPoint[]
  ) => {
    if (visibleData.length === 0) return;

    ctx.fillStyle = config.axisStyle.xAxis.textColor;
    ctx.font = `${config.axisStyle.xAxis.textSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';

    // TradingView-style adaptive labeling based on zoom level
    const getOptimalLabelFormat = (timeframe: string, visibleCandleCount: number, timeSpan: number) => {
      const isIntraday = timeframe.includes('m') || timeframe.includes('h');
      const hoursSpan = timeSpan / (1000 * 60 * 60);
      const daysSpan = timeSpan / (1000 * 60 * 60 * 24);
      const monthsSpan = daysSpan / 30;
      const yearsSpan = daysSpan / 365;

      // Very zoomed in (intraday with small time span)
      if (isIntraday && hoursSpan <= 24) {
        return { 
          format: 'time', 
          spacing: Math.max(1, Math.floor(visibleCandleCount / 6))
        };
      }
      // Intraday but longer span
      else if (isIntraday && hoursSpan <= 168) { // 1 week
        return { 
          format: 'datetime', 
          spacing: Math.max(1, Math.floor(visibleCandleCount / 8))
        };
      }
      // Daily view, short term
      else if (daysSpan <= 30) {
        return { 
          format: 'date', 
          spacing: Math.max(1, Math.floor(visibleCandleCount / 6))
        };
      }
      // Medium term (months)
      else if (monthsSpan <= 12) {
        return { 
          format: 'monthday', 
          spacing: Math.max(1, Math.floor(visibleCandleCount / 8))
        };
      }
      // Long term (years)
      else if (yearsSpan <= 5) {
        return { 
          format: 'monthyear', 
          spacing: Math.max(1, Math.floor(visibleCandleCount / 10))
        };
      }
      // Very long term
      else {
        return { 
          format: 'year', 
          spacing: Math.max(1, Math.floor(visibleCandleCount / 12))
        };
      }
    };

    // Calculate time span of visible data
    const timeSpan = visibleData.length > 1 ? 
      visibleData[visibleData.length - 1].timestamp - visibleData[0].timestamp : 
      24 * 60 * 60 * 1000; // 1 day fallback

    const labelConfig = getOptimalLabelFormat(config.timeframe, visibleCandleCount, timeSpan);

    // Format date based on adaptive format
    const formatDateLabel = (timestamp: number, format: string): string => {
      const date = new Date(timestamp);
      
      switch (format) {
        case 'time':
          return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
          });
        case 'datetime':
          return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
          }) + ' ' + date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
          });
        case 'date':
          return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
          });
        case 'monthday':
          return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
          });
        case 'monthyear':
          return date.toLocaleDateString('en-US', { 
            month: 'short', 
            year: 'numeric'
          });
        case 'year':
          return date.getFullYear().toString();
        default:
          return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric'
          });
      }
    };

    // Calculate how many labels we can fit - enhanced with overlap prevention

    // Track label positions to prevent overlap
    const labelPositions: { x: number; width: number; text: string }[] = [];
    
    const canPlaceLabel = (x: number, text: string): boolean => {
      const textWidth = ctx.measureText(text).width;
      const labelLeft = x - textWidth / 2;
      const labelRight = x + textWidth / 2;
      
      // Check if this label would overlap with any existing labels
      for (const existing of labelPositions) {
        const existingLeft = existing.x - existing.width / 2;
        const existingRight = existing.x + existing.width / 2;
        
        if (!(labelRight < existingLeft - 10 || labelLeft > existingRight + 10)) {
          return false; // Overlap detected
        }
      }
      
      // Check if label is too close to chart edges
      if (labelLeft < 45 || labelRight > width - 10) {
        return false;
      }
      
      return true;
    };

    const addLabel = (x: number, text: string, isFuture: boolean = false) => {
      if (canPlaceLabel(x, text)) {
        const textWidth = ctx.measureText(text).width;
        labelPositions.push({ x, width: textWidth, text });
        
        // Set appropriate color
        ctx.fillStyle = isFuture ? 'rgba(255, 255, 255, 0.6)' : config.axisStyle.xAxis.textColor;
        
        // Draw the label
        ctx.fillText(text, x, height - 5);
        
        // Draw tick mark
        ctx.strokeStyle = isFuture ? 'rgba(255, 255, 255, 0.3)' : colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, height - 17);
        ctx.lineTo(x, height - 12);
        ctx.stroke();
      }
    };

    // Calculate how many labels we can fit (old method as fallback)
    const maxLabels = Math.floor(chartWidth / 80); // One label every 80px
    const labelStep = labelConfig.spacing;
    
    const candleSpacing = chartWidth / visibleCandleCount;
    
    // Calculate if we're showing future area
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const actualDataEnd = Math.min(allData.length, startIndex + visibleCandleCount);
    const showingFutureArea = (startIndex + visibleCandleCount) > allData.length;
    const futurePeriodsShown = showingFutureArea ? (startIndex + visibleCandleCount) - allData.length : 0;

    // Helper function to calculate future timestamp
    const getFutureTimestamp = (baseTimestamp: number, periodsAhead: number): number => {
      const timeframe = config.timeframe;
      let milliseconds = 0;
      
      switch (timeframe) {
        case '1m': milliseconds = 60 * 1000; break;
        case '5m': milliseconds = 5 * 60 * 1000; break;
        case '15m': milliseconds = 15 * 60 * 1000; break;
        case '30m': milliseconds = 30 * 60 * 1000; break;
        case '1h': milliseconds = 60 * 60 * 1000; break;
        case '4h': milliseconds = 4 * 60 * 60 * 1000; break;
        case '1d': milliseconds = 24 * 60 * 60 * 1000; break;
        case '1w': milliseconds = 7 * 24 * 60 * 60 * 1000; break;
        case '1mo': milliseconds = 30 * 24 * 60 * 60 * 1000; break;
        default: milliseconds = 24 * 60 * 60 * 1000; break;
      }
      
      return baseTimestamp + (periodsAhead * milliseconds);
    };

    // Draw labels for actual data with overlap prevention
    visibleData.forEach((candle, index) => {
      if (index % labelStep === 0) {
        const x = 40 + (index * candleSpacing) + candleSpacing / 2;
        const timeLabel = formatDateLabel(candle.timestamp, labelConfig.format);
        addLabel(x, timeLabel, false);
      }
    });

    // Always try to add the last visible data point if not already added
    if (visibleData.length > 0) {
      const lastIndex = visibleData.length - 1;
      const x = 40 + (lastIndex * candleSpacing) + candleSpacing / 2;
      const timeLabel = formatDateLabel(visibleData[lastIndex].timestamp, labelConfig.format);
      addLabel(x, timeLabel, false);
    }

    // Draw future labels if we're showing future area
    if (showingFutureArea && futurePeriodsShown > 0 && allData.length > 0) {
      const lastDataTimestamp = allData[allData.length - 1].timestamp;
      
      for (let i = 1; i <= futurePeriodsShown; i++) {
        if (i % labelStep === 0) {
          const futureIndex = visibleData.length + i - 1;
          const x = 40 + (futureIndex * candleSpacing) + candleSpacing / 2;
          const futureTimestamp = getFutureTimestamp(lastDataTimestamp, i);
          const timeLabel = formatDateLabel(futureTimestamp, labelConfig.format);
          addLabel(x, timeLabel, true);
        }
      }
    }
  };

  // Re-render when data or settings change
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      console.log(`🎨 Rendering chart with ${data.length} data points`);
      renderChart();
    }
  }, [renderChart, config.theme, config.colors, dimensions, data, priceRange, scrollOffset, visibleCandleCount]);

  // TradingView-style interaction handlers
  const [lastMouseX, setLastMouseX] = useState(0);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);

  // Unified mouse handler that prioritizes drawing interaction over chart panning
  const handleUnifiedMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('🖱️ Mouse down at:', { x, y });

    // Drawing tools have been removed as requested
    // Only core chart functionality remains - enable chart panning
    setIsDragging(true);
    setLastMouseX(x);
    setDragStartX(x);
    setDragStartOffset(scrollOffset);
  }, [scrollOffset]);

  // ✨ NEW: Advanced Hit Detection System
  const getDrawingHandles = useCallback((drawing: Drawing): Array<{x: number, y: number, type: string, cursor: string}> => {
    if (!drawing.startTimestamp || !drawing.startPrice) return [];
    
    const startCoords = timePriceToScreenCoordinates(drawing.startTimestamp, drawing.startPrice);
    const handles = [
      { x: startCoords.x, y: startCoords.y, type: 'start', cursor: 'grab' }
    ];
    
    if (drawing.endTimestamp && drawing.endPrice) {
      const endCoords = timePriceToScreenCoordinates(drawing.endTimestamp, drawing.endPrice);
      handles.push({ x: endCoords.x, y: endCoords.y, type: 'end', cursor: 'grab' });
      
      // Add corner handles for rectangles
      if (['rectangle', 'ellipse'].includes(drawing.type)) {
        handles.push(
          { x: startCoords.x, y: endCoords.y, type: 'corner1', cursor: 'nw-resize' },
          { x: endCoords.x, y: startCoords.y, type: 'corner2', cursor: 'ne-resize' }
        );
      }
      
      // Add midpoint handles for lines
      if (['trend_line', 'extended_line', 'arrow'].includes(drawing.type)) {
        const midX = (startCoords.x + endCoords.x) / 2;
        const midY = (startCoords.y + endCoords.y) / 2;
        handles.push({ x: midX, y: midY, type: 'midpoint', cursor: 'grab' });
      }
    }
    
    return handles;
  }, []);

  const detectDrawingHit = useCallback((x: number, y: number, drawing: Drawing): {hit: boolean, type: string, handle?: any} => {
    const HANDLE_SIZE = 8;
    const LINE_TOLERANCE = 10;
    
    // Check handles first
    if (showDrawingHandles && drawing.isSelected) {
      const handles = getDrawingHandles(drawing);
      for (const handle of handles) {
        const distance = Math.sqrt(Math.pow(x - handle.x, 2) + Math.pow(y - handle.y, 2));
        if (distance <= HANDLE_SIZE) {
          return { hit: true, type: 'handle', handle };
        }
      }
    }
    
    // Check drawing body
    if (!drawing.startTimestamp || !drawing.startPrice) return { hit: false, type: 'none' };
    
    const startCoords = timePriceToScreenCoordinates(drawing.startTimestamp, drawing.startPrice);
    
    switch (drawing.type) {
      case 'trend_line':
      case 'extended_line':
      case 'arrow':
        if (drawing.endTimestamp && drawing.endPrice) {
          const endCoords = timePriceToScreenCoordinates(drawing.endTimestamp, drawing.endPrice);
          const distance = distanceToLine(x, y, startCoords.x, startCoords.y, endCoords.x, endCoords.y);
          if (distance <= LINE_TOLERANCE) {
            return { hit: true, type: 'body' };
          }
        }
        break;
        
      case 'horizontal_line':
        if (Math.abs(y - startCoords.y) <= LINE_TOLERANCE) {
          return { hit: true, type: 'body' };
        }
        break;
        
      case 'vertical_line':
        if (Math.abs(x - startCoords.x) <= LINE_TOLERANCE) {
          return { hit: true, type: 'body' };
        }
        break;
        
      case 'rectangle':
      case 'ellipse':
        if (drawing.endTimestamp && drawing.endPrice) {
          const endCoords = timePriceToScreenCoordinates(drawing.endTimestamp, drawing.endPrice);
          const minX = Math.min(startCoords.x, endCoords.x);
          const maxX = Math.max(startCoords.x, endCoords.x);
          const minY = Math.min(startCoords.y, endCoords.y);
          const maxY = Math.max(startCoords.y, endCoords.y);
          
          if (drawing.type === 'rectangle') {
            // Rectangle border hit test
            const onBorder = (
              (x >= minX && x <= maxX && (Math.abs(y - minY) <= LINE_TOLERANCE || Math.abs(y - maxY) <= LINE_TOLERANCE)) ||
              (y >= minY && y <= maxY && (Math.abs(x - minX) <= LINE_TOLERANCE || Math.abs(x - maxX) <= LINE_TOLERANCE))
            );
            
            // Interior hit test (if filled)
            const interior = x >= minX && x <= maxX && y >= minY && y <= maxY;
            
            if (onBorder || (interior && drawing.style?.fillOpacity && drawing.style.fillOpacity > 0)) {
              return { hit: true, type: 'body' };
            }
          } else if (drawing.type === 'ellipse') {
            // Ellipse hit test
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const radiusX = (maxX - minX) / 2;
            const radiusY = (maxY - minY) / 2;
            
            const normalizedX = (x - centerX) / radiusX;
            const normalizedY = (y - centerY) / radiusY;
            const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
            
            if (distance <= 1.1 && distance >= 0.9) { // Border tolerance
              return { hit: true, type: 'body' };
            }
          }
        }
        break;
        
      case 'text':
      case 'note':
        // Text hit test (approximate)
        const textWidth = (drawing.text?.length || 0) * 8;
        const textHeight = drawing.style?.fontSize || 12;
        if (x >= startCoords.x && x <= startCoords.x + textWidth && 
            y >= startCoords.y - textHeight && y <= startCoords.y) {
          return { hit: true, type: 'body' };
        }
        break;
    }
    
    return { hit: false, type: 'none' };
  }, [showDrawingHandles, getDrawingHandles]);

  // Helper function for line distance calculation
  const distanceToLine = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return Math.sqrt(A * A + B * B);
    
    let param = dot / lenSq;
    param = Math.max(0, Math.min(1, param));
    
    const xx = x1 + param * C;
    const yy = y1 + param * D;
    
    const dx = px - xx;
    const dy = py - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ✨ NEW: Magnet Mode for OHLC Snapping
  const snapToOHLC = useCallback((timestamp: number, price: number): {timestamp: number, price: number} => {
    if (!magnetMode || !data.length) return { timestamp, price };
    
    // Find nearest candle
    const candleIndex = data.findIndex(candle => candle.timestamp >= timestamp);
    if (candleIndex === -1) return { timestamp, price };
    
    const candle = data[candleIndex];
    const ohlcValues = [candle.open, candle.high, candle.low, candle.close];
    
    // Find closest OHLC value
    let closestPrice = price;
    let minDistance = Infinity;
    
    ohlcValues.forEach(ohlcPrice => {
      const distance = Math.abs(price - ohlcPrice);
      if (distance < minDistance) {
        minDistance = distance;
        closestPrice = ohlcPrice;
      }
    });
    
    // Only snap if within reasonable distance
    const priceRange = Math.abs(candle.high - candle.low);
    if (minDistance < priceRange * 0.1) { // Within 10% of candle range
      return { timestamp: candle.timestamp, price: closestPrice };
    }
    
    return { timestamp, price };
  }, [magnetMode, data]);

  // ✨ NEW: Enhanced Drawing Handle Rendering
  const renderDrawingHandles = useCallback((ctx: CanvasRenderingContext2D, drawing: Drawing) => {
    if (!drawing.isSelected || !showDrawingHandles) return;
    
    const handles = getDrawingHandles(drawing);
    
    handles.forEach(handle => {
      // Handle appearance
      ctx.fillStyle = '#2962ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      
      // Draw handle based on type
      if (handle.type === 'start' || handle.type === 'end') {
        // Circle handles for start/end points
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else if (handle.type.startsWith('corner')) {
        // Square handles for corners
        ctx.fillRect(handle.x - 4, handle.y - 4, 8, 8);
        ctx.strokeRect(handle.x - 4, handle.y - 4, 8, 8);
      } else if (handle.type === 'midpoint') {
        // Diamond handle for midpoint
        ctx.save();
        ctx.translate(handle.x, handle.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-4, -4, 8, 8);
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.restore();
      }
    });
  }, [showDrawingHandles, getDrawingHandles]);

  // ✨ ENHANCED: Mouse handlers with advanced hit detection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) { // Right click
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Check if right-clicking on a drawing
      const hitDrawing = drawings.find(drawing => {
        const hitResult = detectDrawingHit(x, y, drawing);
        return hitResult.hit;
      });
      
      if (hitDrawing) {
        setContextMenuDrawing(hitDrawing);
        setSelectedDrawing(hitDrawing);
        setContextMenuPosition({ x: e.clientX, y: e.clientY });
        setShowContextMenu(true);
      } else {
        setShowContextMenu(false);
      }
      return;
    }
    
    if (e.button !== 0) return; // Only left mouse button for other actions
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Close any open menus
    setShowContextMenu(false);
    setShowPropertiesPanel(false);
    
    // Check for box zoom mode (Shift key held)
    if (e.shiftKey && !activeTool) {
      setIsBoxZooming(true);
      setBoxZoomStart({ x, y });
      setBoxZoomEnd({ x, y });
      return;
    }
    
    // Check for drawing interaction first
    let hitDrawing: Drawing | null = null;
    let hitResult: {hit: boolean, type: string, handle?: any} = { hit: false, type: 'none' };
    
    // Check drawings in reverse order (front to back)
    for (let i = drawings.length - 1; i >= 0; i--) {
      const drawing = drawings[i];
      if (drawing.isLocked) continue; // Skip locked drawings
      
      const result = detectDrawingHit(x, y, drawing);
      if (result.hit) {
        hitDrawing = drawing;
        hitResult = result;
        break;
      }
    }
    
    if (hitDrawing) {
      // Multi-select with Ctrl/Cmd
      const isMultiSelect = e.ctrlKey || e.metaKey;
      handleDrawingSelection(hitDrawing, isMultiSelect);
      
      if (hitResult.type === 'handle' && hitResult.handle) {
        // Start handle dragging
        setIsDraggingDrawing(true);
        setSelectedDrawing(hitDrawing);
        setOriginalDrawing({ ...hitDrawing });
        // Store which handle is being dragged
        setDragOffset({ x: hitResult.handle.x - x, y: hitResult.handle.y - y });
      } else if (hitResult.type === 'body') {
        // Start drawing dragging
        setIsDraggingDrawing(true);
        setSelectedDrawing(hitDrawing);
        setOriginalDrawing({ ...hitDrawing });
        
        // Calculate offset from drawing start point to click point
        if (hitDrawing.startTimestamp && hitDrawing.startPrice) {
          const startCoords = timePriceToScreenCoordinates(hitDrawing.startTimestamp, hitDrawing.startPrice);
          setDragOffset({ x: startCoords.x - x, y: startCoords.y - y });
        }
      }
      
      // Double-click detection for properties panel
      const now = Date.now();
      if (lastClickDrawing?.id === hitDrawing.id && now - lastClickTime < 500) {
        setShowPropertiesPanel(true);
        setPropertiesPanelPosition({ x: e.clientX, y: e.clientY });
      }
      setLastClickDrawing(hitDrawing);
      setLastClickTime(now);
      
      return; // Don't proceed with chart dragging
    }
    
    // No drawing hit, proceed with chart navigation
    setSelectedDrawing(null);
    setSelectedDrawings([]);
    
    // Check if mouse is over Y-axis area for Y-axis dragging
    const canvas = e.currentTarget as HTMLCanvasElement;
    const canvasWidth = canvas.width / window.devicePixelRatio;
    const isOverYAxis = isInYAxisArea(x, canvasWidth);
    
    // Stop any ongoing momentum animation when starting new interaction
    stopMomentumAnimation();
    
    // Initialize velocity tracking
    const now = Date.now();
    setLastMouseTimestamp(now);
    setLastMousePosition({ x, y });
    
    // Start full chart panning (both X and Y axes) - Tradytics style
    setIsDragging(true);
    setIsDraggingYAxis(true); // Enable Y-axis dragging for all chart areas
    setLastMouseX(x);
    setDragStartX(x);
    setDragStartOffset(scrollOffset);
    
    // Get current visible data for price range calculation
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length > 0) {
      // Use current displayed price range for dragging (no auto-scale switching)
      let currentRange;
      if (manualPriceRange) {
        currentRange = manualPriceRange;
      } else {
        currentRange = getCurrentPriceRange(visibleData);
      }
      setYAxisDragStart({ y, priceRange: currentRange });
    }
    
  }, [drawings, detectDrawingHit, handleDrawingSelection, lastClickDrawing, lastClickTime, scrollOffset, data, visibleCandleCount, getCurrentPriceRange, manualPriceRange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // ALWAYS update crosshair position first
    setCrosshairPosition({ x, y });

    // Track velocity for momentum scrolling (only when dragging)
    if (isDragging || isDraggingYAxis) {
      const now = Date.now();
      const deltaTime = now - lastMouseTimestamp;
      
      if (deltaTime > 0) {
        const deltaX = x - lastMousePosition.x;
        const deltaY = y - lastMousePosition.y;
        
        // Calculate velocity (pixels per millisecond)
        const velocityX = deltaX / deltaTime * 16; // Convert to 60fps frame rate
        const velocityY = deltaY / deltaTime * 16;
        
        setVelocity({ x: velocityX, y: velocityY });
        setLastMouseTimestamp(now);
        setLastMousePosition({ x, y });
      }
    }

    // Handle box zoom dragging
    if (isBoxZooming && boxZoomStart) {
      setBoxZoomEnd({ x, y });
      return;
    }

    // Handle drawing dragging
    if (isDraggingDrawing && selectedDrawing) {
      // Convert Y to price using the same calculation as chart rendering
      const volumeAreaHeight = 60;
      const timeAxisHeight = 25;
      const oscillatorIndicators = config.indicators.filter(ind => ['rsi', 'macd', 'stoch'].includes(ind));
      const indicatorPanelHeight = oscillatorIndicators.length > 0 ? 120 * oscillatorIndicators.length : 0;
      const priceChartHeight = dimensions.height - volumeAreaHeight - indicatorPanelHeight - timeAxisHeight;
      
      // Calculate visible data range for accurate price conversion
      const startIndex = Math.max(0, Math.floor(scrollOffset));
      const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
      const visibleData = data.slice(startIndex, endIndex);
      
      if (visibleData.length > 0) {
        const prices = visibleData.flatMap(d => [d.high, d.low]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const padding = (maxPrice - minPrice) * 0.1;
        const adjustedMin = minPrice - padding;
        const adjustedMax = maxPrice + padding;
        
        const newPrice = adjustedMax - ((y / priceChartHeight) * (adjustedMax - adjustedMin));
        
        setDrawings(prev => prev.map((d: any) => 
          d.id === selectedDrawing.id 
            ? { ...d, price: newPrice, y }
            : d
        ));
      }
      return;
    }

    // Handle full chart panning (both X and Y axes simultaneously)
    if ((isDragging || isDraggingYAxis) && yAxisDragStart) {
      // Handle Y-axis dragging (vertical movement)
      const deltaY = y - yAxisDragStart.y;
      const volumeAreaHeight = 60;
      const timeAxisHeight = 25;
      const oscillatorIndicators = config.indicators.filter(ind => ['gex'].includes(ind));
      const indicatorPanelHeight = oscillatorIndicators.length > 0 ? 120 * oscillatorIndicators.length : 0;
      const priceChartHeight = dimensions.height - volumeAreaHeight - indicatorPanelHeight - timeAxisHeight;
      
      // Calculate price change based on drag distance
      const originalRange = yAxisDragStart.priceRange;
      const priceHeight = originalRange.max - originalRange.min;
      const pricePerPixel = priceHeight / priceChartHeight;
      const priceShift = deltaY * pricePerPixel;
      
      // Apply the shift to create new price range
      const newRange = {
        min: originalRange.min + priceShift,
        max: originalRange.max + priceShift
      };
      
      setManualPriceRangeAndDisableAuto(newRange);
      
      // Handle X-axis dragging (horizontal movement)
      const deltaX = x - lastMouseX;
      const currentOffset = scrollOffset;
      
      // Allow extending beyond data for future view
      const futurePeriods = getFuturePeriods(config.timeframe);
      const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
      const maxScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
      const newOffset = Math.max(0, Math.min(maxScrollOffset, currentOffset - Math.floor(deltaX / 5)));
      
      if (newOffset !== currentOffset) {
        setScrollOffset(newOffset);
      }
      
      setLastMouseX(x);
      return;
    }

    // Alternative Y-axis dragging when yAxisDragStart is not set but we're in manual mode
    if ((isDragging || isDraggingYAxis) && !isAutoScale) {
      // Handle Y-axis dragging using current manual price range
      const deltaY = y - (lastMousePosition.y || y);
      const volumeAreaHeight = 60;
      const timeAxisHeight = 25;
      const oscillatorIndicators = config.indicators.filter(ind => ['gex'].includes(ind));
      const indicatorPanelHeight = oscillatorIndicators.length > 0 ? 120 * oscillatorIndicators.length : 0;
      const priceChartHeight = dimensions.height - volumeAreaHeight - indicatorPanelHeight - timeAxisHeight;
      
      // Get current manual price range
      if (manualPriceRange) {
        const priceHeight = manualPriceRange.max - manualPriceRange.min;
        const pricePerPixel = priceHeight / priceChartHeight;
        const priceShift = deltaY * pricePerPixel;
        
        // Apply the shift to create new price range
        const newRange = {
          min: manualPriceRange.min + priceShift,
          max: manualPriceRange.max + priceShift
        };
        
        setManualPriceRangeAndDisableAuto(newRange);
      }
      
      // Handle X-axis dragging (horizontal movement)
      const deltaX = x - lastMouseX;
      const currentOffset = scrollOffset;
      
      // Allow extending beyond data for future view
      const futurePeriods = getFuturePeriods(config.timeframe);
      const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
      const maxScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
      const newOffset = Math.max(0, Math.min(maxScrollOffset, currentOffset - Math.floor(deltaX / 5)));
      
      if (newOffset !== currentOffset) {
        setScrollOffset(newOffset);
      }
      
      setLastMouseX(x);
      return;
    }

    // Fallback: Handle horizontal dragging only (if Y-axis drag start wasn't set)
    if (isDragging) {
      const deltaX = x - lastMouseX;
      const currentOffset = scrollOffset;
      
      // Allow extending beyond data for future view
      const futurePeriods = getFuturePeriods(config.timeframe);
      const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
      const maxScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
      const newOffset = Math.max(0, Math.min(maxScrollOffset, currentOffset - Math.floor(deltaX / 5)));
      
      if (newOffset !== currentOffset) {
        setScrollOffset(newOffset);
      }
      
      setLastMouseX(x);
      return;
    }

    // Update crosshair info
    if (data.length > 0 && config.crosshair) {
      // Calculate correct chart dimensions (matching renderChart function)
      const volumeAreaHeight = 60;
      const timeAxisHeight = 25;
      const oscillatorIndicators = config.indicators.filter(ind => ['gex'].includes(ind));
      const indicatorPanelHeight = oscillatorIndicators.length > 0 ? 120 * oscillatorIndicators.length : 0;
      const priceChartHeight = dimensions.height - volumeAreaHeight - indicatorPanelHeight - timeAxisHeight;
      
      // Calculate visible data range (matching renderChart function)
      const startIndex = Math.max(0, Math.floor(scrollOffset));
      const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
      const visibleData = data.slice(startIndex, endIndex);
      
      if (visibleData.length > 0) {
        // Calculate price range for visible data (matching renderChart function)
        const prices = visibleData.flatMap(d => [d.high, d.low]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const padding = (maxPrice - minPrice) * 0.1;
        const adjustedMin = minPrice - padding;
        const adjustedMax = maxPrice + padding;
        
        // Convert Y coordinate to price (EXACT same formula as renderChart)
        // Only consider mouse position within the price chart area
        if (y <= priceChartHeight) {
          const price = adjustedMax - ((y / priceChartHeight) * (adjustedMax - adjustedMin));
          
          // Calculate candle index
          const chartWidth = dimensions.width - 100;
          const candleWidth = chartWidth / visibleCandleCount;
          const relativeX = Math.max(0, x - 40);
          const visibleCandleIndex = Math.floor(relativeX / candleWidth);
          const candleIndex = scrollOffset + visibleCandleIndex;
          
          if (candleIndex >= 0 && candleIndex < data.length) {
            const candle = data[candleIndex];
            
            // Check if candle exists and has required properties
            if (candle && typeof candle.open !== 'undefined') {
              const candleDate = new Date(candle?.timestamp || Date.now());
              
              // Calculate change from previous candle
              const prevCandle = candleIndex > 0 ? data[candleIndex - 1] : null;
              const change = prevCandle ? candle.close - prevCandle.close : 0;
              const changePercent = prevCandle ? ((change / prevCandle.close) * 100) : 0;
              
              setCrosshairInfo({
                visible: true,
                price: `$${price.toFixed(2)}`,
                date: candleDate.toLocaleDateString(),
                time: candleDate.toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: false 
                }),
                volume: candle?.volume || 0,
                ohlc: {
                  open: candle.open,
                  high: candle.high,
                  low: candle.low,
                  close: candle.close,
                  change: change,
                  changePercent: changePercent
                }
              });
            }
          }
        } else {
          // Mouse is outside price chart area, hide crosshair info
          setCrosshairInfo({
            visible: false,
            price: '',
            date: '',
            time: '',
            volume: 0
          });
        }
      }
    }
  }, [isDragging, isDraggingDrawing, selectedDrawing, lastMouseX, scrollOffset, visibleCandleCount, data, dimensions, priceRange, config.crosshair, isDraggingYAxis, yAxisDragStart, lastMousePosition, isAutoScale, manualPriceRange, setManualPriceRangeAndDisableAuto, getFuturePeriods, config.timeframe, config.indicators]);

  const handleMouseUp = useCallback(() => {
    // Handle box zoom completion
    if (isBoxZooming && boxZoomStart && boxZoomEnd) {
      const startX = Math.min(boxZoomStart.x, boxZoomEnd.x);
      const endX = Math.max(boxZoomStart.x, boxZoomEnd.x);
      const startY = Math.min(boxZoomStart.y, boxZoomEnd.y);
      const endY = Math.max(boxZoomStart.y, boxZoomEnd.y);
      
      // Only proceed if the box is large enough (minimum 20x20 pixels)
      if (Math.abs(endX - startX) > 20 && Math.abs(endY - startY) > 20) {
        // Convert screen coordinates to chart data coordinates
        const chartWidth = dimensions.width - 100; // Account for margins
        const candleWidth = chartWidth / visibleCandleCount;
        
        // Calculate new time range (X-axis)
        const startCandleIndex = Math.floor((startX - 40) / candleWidth);
        const endCandleIndex = Math.floor((endX - 40) / candleWidth);
        const newVisibleCount = Math.max(20, Math.min(300, endCandleIndex - startCandleIndex));
        const newScrollOffset = Math.max(0, Math.min(
          data.length - newVisibleCount,
          scrollOffset + startCandleIndex
        ));
        
        // Calculate new price range (Y-axis)
        const volumeAreaHeight = 60;
        const timeAxisHeight = 25;
        const oscillatorIndicators = config.indicators.filter(ind => ['gex'].includes(ind));
        const indicatorPanelHeight = oscillatorIndicators.length > 0 ? 120 * oscillatorIndicators.length : 0;
        const priceChartHeight = dimensions.height - volumeAreaHeight - indicatorPanelHeight - timeAxisHeight;
        
        // Get current price range for conversion
        const startIndex = Math.max(0, Math.floor(scrollOffset));
        const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
        const visibleData = data.slice(startIndex, endIndex);
        const currentRange = getCurrentPriceRange(visibleData);
        
        // Convert Y coordinates to prices
        const maxPrice = currentRange.max - ((startY / priceChartHeight) * (currentRange.max - currentRange.min));
        const minPrice = currentRange.max - ((endY / priceChartHeight) * (currentRange.max - currentRange.min));
        
        // Apply zoom
        setVisibleCandleCount(newVisibleCount);
        setScrollOffset(newScrollOffset);
        setManualPriceRangeAndDisableAuto({ min: minPrice, max: maxPrice });
      }
      
      // Reset box zoom state
      setIsBoxZooming(false);
      setBoxZoomStart(null);
      setBoxZoomEnd(null);
      return;
    }
    
    // If we were dragging and have significant velocity, start momentum animation
    if ((isDragging || isDraggingYAxis) && (Math.abs(velocity.x) > 1 || Math.abs(velocity.y) > 1)) {
      startMomentumAnimation();
    }
    
    setIsDragging(false);
    setIsDraggingDrawing(false);
    setIsDraggingYAxis(false);
    setYAxisDragStart(null);
    setIsBoxZooming(false);
    setBoxZoomStart(null);
    setBoxZoomEnd(null);
    // DON'T clear selectedDrawing here - it closes the Property Editor!
    // setSelectedDrawing(null);
  }, [isBoxZooming, boxZoomStart, boxZoomEnd, dimensions, visibleCandleCount, scrollOffset, data.length, config.indicators, getCurrentPriceRange, setManualPriceRangeAndDisableAuto, isDragging, isDraggingYAxis, velocity, startMomentumAnimation]);

  // Simple drawing rendering effect - COMPLETELY DISABLED to prevent conflicts with main TradingView drawing system
  useEffect(() => {
    console.log('🔄 [CONFLICT] Simple drawing effect triggered - COMPLETELY DISABLED to avoid conflicts');
    // This system is completely disabled because it conflicts with the main comprehensive drawing system
    // The main drawing system is in the drawStoredDrawings function
    return;
  }, [drawings]);

  const handleMouseLeave = useCallback(() => {
    // Hide crosshair info when mouse leaves chart area
    setCrosshairInfo(prev => ({ ...prev, visible: false }));
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    console.log('🚀 DOUBLE CLICK EVENT FIRED!');
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if double-clicking on Y-axis area for auto-fit
    const canvasWidth = canvas.width / window.devicePixelRatio;
    const isOverYAxis = isInYAxisArea(x, canvasWidth);
    
    if (isOverYAxis) {
      // Double-click on Y-axis: reset to auto-scale
      resetToAutoScale();
      console.log('🔧 Y-axis double-click: Reset to auto-scale');
      return;
    }
    
    // Check if we're double-clicking on a drawing
    if (!activeTool) {
      const clickedDrawing = findDrawingAtPoint({ x, y });
      console.log('🔧 Double-click found drawing:', clickedDrawing);
      
      if (clickedDrawing) {
        // Open property editor on double-click on drawing
        setSelectedDrawing(clickedDrawing);
        
        // Property editor removed - drawing tools were removed as requested
        
        console.log('🔧 Property editor removed - drawing tools were removed');
        
        // PREVENT the editor from being closed immediately
        // Add a flag to prevent auto-closing for a few seconds
        setTimeout(() => {
          console.log('✅ Property editor protection timeout ended');
        }, 3000);
        
        return;
      }
    }
    
    // If no drawing was clicked, reset chart view
    setVisibleCandleCount(Math.min(200, data.length));
    setScrollOffset(Math.max(0, data.length - Math.min(200, data.length)));
  }, [data.length, activeTool, isInYAxisArea, resetToAutoScale]);

  // Handle timeframe change - SIMPLE DIRECT FETCH (no broken cache)
  const handleTimeframeChange = (timeframe: string) => {
    console.log(`🔄 TIMEFRAME CHANGE: ${symbol} -> ${timeframe}`);
    console.log(`🔄 Current data length before change: ${data.length}`);
    console.log(`🔄 Current loading state: ${loading}`);
    
    // ALWAYS fetch fresh data - no cache bullshit that shows wrong prices
    console.log(`🚀 FRESH FETCH: Getting live ${timeframe} data for ${symbol}`);
    fetchData(symbol, timeframe);
    
    // Update config
    setConfig(prev => ({ ...prev, timeframe }));
    onTimeframeChange?.(timeframe);
  };

  // Handle chart type change
  const handleChartTypeChange = (chartType: ChartConfig['chartType']) => {
    setConfig(prev => ({ ...prev, chartType }));
  };

  // Handle symbol change
  const handleSymbolChange = (newSymbol: string) => {
    setConfig(prev => ({ ...prev, symbol: newSymbol }));
    onSymbolChange?.(newSymbol);
  };

  // Update dropdown positions based on button positions
  const updateDropdownPosition = (type: 'indicators' | 'timeframe' | 'volume') => {
    const buttonRef = type === 'indicators' ? indicatorsButtonRef : 
                     type === 'timeframe' ? timeframeButtonRef : 
                     volumeButtonRef;
    
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPositions(prev => ({
        ...prev,
        [type]: {
          x: rect.left,
          y: rect.bottom + 8, // 8px gap below button
          width: rect.width
        }
      }));
    }
  };

  // Drawing Tools Functions
  const selectDrawingTool = (toolValue: string) => {
    console.log(`🎨 Activating drawing tool: ${toolValue}`);
    console.log(`🔧 Previous activeTool: ${activeTool}`);
    setActiveTool(toolValue);
    console.log(`🔧 Set activeTool to: ${toolValue}`);
    setShowToolsDropdown(false);
    
    // Reset any ongoing drawing
    setIsDrawing(false);
    setDrawingStartPoint(null);
  };

  const clearActiveTool = () => {
    console.log(`🎨 Deactivating drawing tool: ${activeTool}`);
    setActiveTool(null);
    setIsDrawing(false);
    setDrawingStartPoint(null);
  };

  const clearAllDrawings = () => {
    setDrawings([]);
    setConfig(prev => ({ ...prev, drawings: [] }));
  };

  // Helper functions for coordinate conversion
  const canvasToPrice = (canvasY: number, minPrice: number, maxPrice: number, chartHeight: number): number => {
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;
    const priceRange = adjustedMax - adjustedMin;
    return adjustedMax - (canvasY / chartHeight) * priceRange;
  };

  const priceToCanvas = (price: number, minPrice: number, maxPrice: number, chartHeight: number): number => {
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;
    const priceRange = adjustedMax - adjustedMin;
    return ((adjustedMax - price) / priceRange) * chartHeight;
  };

  const canvasToTime = (canvasX: number, chartWidth: number, visibleDataLength: number, startIndex: number): number => {
    const index = Math.floor((canvasX / chartWidth) * visibleDataLength) + startIndex;
    return Math.max(0, Math.min(data.length - 1, index));
  };

  const timeToCanvas = (timeIndex: number, chartWidth: number, visibleDataLength: number, startIndex: number): number => {
    const relativeIndex = timeIndex - startIndex;
    return (relativeIndex / visibleDataLength) * chartWidth;
  };

  // Enhanced Canvas Drawing Interaction Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    console.log('🔥 handleCanvasMouseDown called');
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('🖱️ Mouse down at:', { x, y });

    // Drawing tools have been removed as requested
    // Only core chart functionality remains
    return;
  };

  // Helper functions to convert between screen and data coordinates
  // TradingView-style coordinate conversion: Screen → Time/Price
  const screenToTimePriceCoordinates = (screenX: number, screenY: number): { timestamp: number; price: number } => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !data.length) return { timestamp: Date.now(), price: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const chartWidth = rect.width - 80; // Account for margins
    const candleWidth = chartWidth / visibleCandleCount;
    
    // Convert screen X to actual timestamp
    const relativeX = Math.max(0, screenX - 40); // Account for left margin
    const visibleCandleIndex = Math.floor(relativeX / candleWidth);
    const absoluteCandleIndex = scrollOffset + visibleCandleIndex;
    const boundedIndex = Math.max(0, Math.min(absoluteCandleIndex, data.length - 1));
    const timestamp = data[boundedIndex]?.timestamp || Date.now();
    
    // Convert screen Y to actual price using STABLE price range (for drawing creation)
    const priceChartHeight = rect.height * 0.7;
    const relativeY = screenY / priceChartHeight;
    const stablePriceRange = getStablePriceRange();
    const price = stablePriceRange.max - ((stablePriceRange.max - stablePriceRange.min) * relativeY);
    
    console.log('🎯 FIXED Screen to Time/Price:', { 
      screenX, 
      screenY, 
      timestamp, 
      price, 
      candleIndex: boundedIndex,
      visibleIndex: visibleCandleIndex,
      priceRange: priceRange
    });
    
    return { timestamp, price };
  };

  // Helper function to get STABLE chart price range (for drawings - doesn't change with scrolling)
  const getStablePriceRange = (): { min: number; max: number } => {
    if (!data || data.length === 0) return { min: 0, max: 100 };
    
    // Use ALL data to create a stable price range, not just visible data
    const allPrices = data.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const padding = (maxPrice - minPrice) * 0.2; // More padding for stability
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;
    
    return { min: adjustedMin, max: adjustedMax };
  };

  // Helper function to get current chart price range (for chart rendering - changes with scrolling)
  const getCurrentChartPriceRange = (): { min: number; max: number } => {
    if (!data || data.length === 0) return { min: 0, max: 100 };
    
    // Get visible data range
    const startIndex = Math.max(0, scrollOffset);
    const endIndex = Math.min(data.length, scrollOffset + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length === 0) return { min: 0, max: 100 };
    
    // Use the new Y-axis scaling logic
    return getCurrentPriceRange(visibleData);
  };

  // TradingView-style coordinate conversion: Time/Price → Screen
  const timePriceToScreenCoordinates = (timestamp: number, price: number, useStableRange: boolean = false): { x: number; y: number } => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !data.length) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const chartWidth = rect.width - 80; // Account for margins
    
    // Find the candle index for this timestamp
    let candleIndex = data.findIndex(candle => candle.timestamp >= timestamp);
    if (candleIndex === -1) candleIndex = data.length - 1; // If not found, use last candle
    
    // MATCH the timeToScreenX logic exactly for consistency
    const candleWidth = chartWidth / visibleCandleCount;
    const visibleStartIndex = scrollOffset;
    const visibleEndIndex = scrollOffset + visibleCandleCount;
    
    let x: number;
    if (candleIndex < visibleStartIndex || candleIndex >= visibleEndIndex) {
      // Drawing is outside visible range - position it off-screen but proportionally
      const relativePosition = candleIndex - scrollOffset;
      x = relativePosition * candleWidth + candleWidth / 2 + 40;
    } else {
      // Drawing is in visible range - position it correctly
      const positionInVisibleRange = candleIndex - visibleStartIndex;
      x = positionInVisibleRange * candleWidth + candleWidth / 2 + 40;
    }
    
    // Convert price to screen Y - use current range for all drawings to match chart
    // For horizontal rays, we'll handle absolute positioning differently
    const priceChartHeight = rect.height * 0.7;
    const currentPriceRange = getCurrentChartPriceRange();
    const relativePrice = (price - currentPriceRange.min) / (currentPriceRange.max - currentPriceRange.min);
    const y = priceChartHeight - (relativePrice * priceChartHeight);
    
    console.log('🎯 TimePriceToScreen (CURRENT RANGE):', { 
      timestamp, 
      price, 
      useStableRange,
      candleIndex, 
      scrollOffset, 
      visibleRange: `${visibleStartIndex} to ${visibleEndIndex}`,
      x, 
      y,
      currentPriceRange,
      rangeType: 'CURRENT'
    });
    
    return { x, y };
  };

  // Legacy helper functions for backward compatibility
  const getPriceAtY = (y: number): number => {
    return screenToTimePriceCoordinates(0, y).price;
  };

  const screenToDataCoordinates = (screenX: number, screenY: number): { candleIndex: number; price: number } => {
    const timePrice = screenToTimePriceCoordinates(screenX, screenY);
    // Find candle index for the timestamp
    const candleIndex = data.findIndex(candle => candle.timestamp >= timePrice.timestamp);
    return { 
      candleIndex: candleIndex === -1 ? data.length - 1 : candleIndex, 
      price: timePrice.price 
    };
  };

  const dataToScreenCoordinates = (candleIndex: number, price: number): { x: number; y: number } => {
    if (candleIndex >= data.length) return { x: 0, y: 0 };
    const timestamp = data[candleIndex]?.timestamp || Date.now();
    return timePriceToScreenCoordinates(timestamp, price);
  };

  // Helper function to calculate drawing metadata
  const calculateDrawingMetadata = (toolType: string, start: {x: number, y: number}, end: {x: number, y: number}) => {
    const metadata: DrawingMetadata = {};
    
    switch (toolType) {
      case 'ruler':
        metadata.distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
        metadata.angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
        metadata.priceDistance = Math.abs(getPriceAtY(end.y) - getPriceAtY(start.y));
        break;
      case 'regression':
        metadata.slope = (end.y - start.y) / (end.x - start.x);
        break;
    }
    
    return metadata;
  };

  // Helper function to get tool-specific metadata
  const getToolMetadata = (toolType: string, points: {x: number, y: number}[]) => {
    const metadata: DrawingMetadata = {};
    
    switch (toolType) {
      // Pattern-specific metadata removed
    }
    
    return metadata;
  };

  // Handle text input submission
  const handleTextSubmit = () => {
    if (textInputPosition && drawingText) {
      const newDrawing = {
        id: Date.now(),
        type: activeTool || 'unknown',
        startPoint: textInputPosition,
        endPoint: textInputPosition,
        timestamp: Date.now(),
        style: drawingStyle,
        text: drawingText
      };
      
      setDrawings(prev => [...prev, newDrawing]);
      setShowTextInput(false);
      setDrawingText('');
      setTextInputPosition(null);
      setActiveTool(null);
    }
  };

  // Helper function to test if a point is near a drawing (hit testing)
  const isPointNearDrawing = (point: { x: number; y: number }, drawing: Drawing, tolerance = 8): boolean => {
    const { x, y } = point;
    
    // Get current screen coordinates for the drawing
    let startPoint = drawing.startPoint;
    let endPoint = drawing.endPoint;
    let points = drawing.points;

    // If data coordinates exist, convert them to current screen coordinates
    if (drawing.startDataPoint) {
      const screenCoords = dataToScreenCoordinates(drawing.startDataPoint.candleIndex, drawing.startDataPoint.price);
      startPoint = screenCoords;
    }
    if (drawing.endDataPoint) {
      const screenCoords = dataToScreenCoordinates(drawing.endDataPoint.candleIndex, drawing.endDataPoint.price);
      endPoint = screenCoords;
    }
    if (drawing.dataPoints && drawing.dataPoints.length > 0) {
      points = drawing.dataPoints.map(dataPoint => 
        dataToScreenCoordinates(dataPoint.candleIndex, dataPoint.price)
      );
    }
    
    switch (drawing.type) {
      case 'trend_line':
      case 'extended_line':
        return startPoint && endPoint ? 
          isPointNearLine(x, y, startPoint, endPoint, tolerance) : false;
      
      case 'horizontal_line':
        return startPoint ? Math.abs(y - startPoint.y) <= tolerance : false;
      
      case 'vertical_line':
        return startPoint ? Math.abs(x - startPoint.x) <= tolerance : false;
      
      case 'rectangle':
        return startPoint && endPoint ? 
          isPointInRectangle(x, y, startPoint, endPoint, tolerance) : false;
      
      case 'ellipse':
      case 'circle':
        return startPoint && endPoint ? 
          isPointNearEllipse(x, y, startPoint, endPoint, tolerance) : false;
      
      case 'text':
      case 'note':
      case 'callout':
        return startPoint ? 
          isPointInTextBox(x, y, startPoint, drawing.text || '', tolerance) : false;
      
      default:
        return startPoint && endPoint ? 
          isPointNearLine(x, y, startPoint, endPoint, tolerance) : false;
    }
  };

  // Utility functions for hit testing
  const isPointNearLine = (x: number, y: number, start: { x: number; y: number }, end: { x: number; y: number }, tolerance: number): boolean => {
    const A = x - start.x;
    const B = y - start.y;
    const C = end.x - start.x;
    const D = end.y - start.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) return Math.sqrt(A * A + B * B) <= tolerance;
    
    const param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = start.x;
      yy = start.y;
    } else if (param > 1) {
      xx = end.x;
      yy = end.y;
    } else {
      xx = start.x + param * C;
      yy = start.y + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy) <= tolerance;
  };

  const isPointInRectangle = (x: number, y: number, start: { x: number; y: number }, end: { x: number; y: number }, tolerance: number): boolean => {
    const minX = Math.min(start.x, end.x) - tolerance;
    const maxX = Math.max(start.x, end.x) + tolerance;
    const minY = Math.min(start.y, end.y) - tolerance;
    const maxY = Math.max(start.y, end.y) + tolerance;
    
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  };

  const isPointNearEllipse = (x: number, y: number, start: { x: number; y: number }, end: { x: number; y: number }, tolerance: number): boolean => {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const radiusX = Math.abs(end.x - start.x) / 2;
    const radiusY = Math.abs(end.y - start.y) / 2;
    
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));
    
    return Math.abs(distance - 1) <= tolerance / Math.min(radiusX, radiusY);
  };

  const isPointInTextBox = (x: number, y: number, position: { x: number; y: number }, text: string, tolerance: number): boolean => {
    const textWidth = text.length * 8; // Approximate
    const textHeight = 16;
    
    return x >= position.x - tolerance && 
           x <= position.x + textWidth + tolerance && 
           y >= position.y - textHeight - tolerance && 
           y <= position.y + tolerance;
  };

  // Function to find drawing at point
  const findDrawingAtPoint = (point: { x: number; y: number }): Drawing | null => {
    for (let i = drawings.length - 1; i >= 0; i--) {
      if (isPointNearDrawing(point, drawings[i])) {
        return drawings[i];
      }
    }
    return null;
  };

  // Function to move a drawing to absolute position based on original drawing
  const moveDrawingToPosition = (drawingId: number, deltaX: number, deltaY: number, originalDrawing: any) => {
    setDrawings(prev => prev.map(drawing => {
      if (drawing.id === drawingId) {
        const updatedDrawing = { ...originalDrawing }; // Start with the original drawing
        
        // Move data coordinates (TradingView-style absolute coordinates)
        if (originalDrawing.startDataPoint) {
          const originalScreenCoords = dataToScreenCoordinates(originalDrawing.startDataPoint.candleIndex, originalDrawing.startDataPoint.price);
          const newScreenCoords = { x: originalScreenCoords.x + deltaX, y: originalScreenCoords.y + deltaY };
          const newDataCoords = screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          updatedDrawing.startDataPoint = newDataCoords;
        }
        
        if (originalDrawing.endDataPoint) {
          const originalScreenCoords = dataToScreenCoordinates(originalDrawing.endDataPoint.candleIndex, originalDrawing.endDataPoint.price);
          const newScreenCoords = { x: originalScreenCoords.x + deltaX, y: originalScreenCoords.y + deltaY };
          const newDataCoords = screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          updatedDrawing.endDataPoint = newDataCoords;
        }
        
        if (originalDrawing.dataPoints && originalDrawing.dataPoints.length > 0) {
          updatedDrawing.dataPoints = originalDrawing.dataPoints.map((dataPoint: any) => {
            const originalScreenCoords = dataToScreenCoordinates(dataPoint.candleIndex, dataPoint.price);
            const newScreenCoords = { x: originalScreenCoords.x + deltaX, y: originalScreenCoords.y + deltaY };
            return screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          });
        }
        
        // Also update screen coordinates for immediate visual feedback (these get recalculated on render anyway)
        if (originalDrawing.startPoint) {
          updatedDrawing.startPoint = {
            x: originalDrawing.startPoint.x + deltaX,
            y: originalDrawing.startPoint.y + deltaY
          };
        }
        
        if (originalDrawing.endPoint) {
          updatedDrawing.endPoint = {
            x: originalDrawing.endPoint.x + deltaX,
            y: originalDrawing.endPoint.y + deltaY
          };
        }
        
        if (originalDrawing.points) {
          updatedDrawing.points = originalDrawing.points.map((point: { x: number; y: number }) => ({
            x: point.x + deltaX,
            y: point.y + deltaY
          }));
        }
        
        return updatedDrawing;
      }
      return drawing;
    }));
  };

  // Function to move a drawing
  const moveDrawing = (drawingId: number, deltaX: number, deltaY: number) => {
    setDrawings(prev => prev.map(drawing => {
      if (drawing.id === drawingId) {
        const updatedDrawing = { ...drawing };
        
        // Move data coordinates (TradingView-style absolute coordinates)
        if (drawing.startDataPoint) {
          const currentScreenCoords = dataToScreenCoordinates(drawing.startDataPoint.candleIndex, drawing.startDataPoint.price);
          const newScreenCoords = { x: currentScreenCoords.x + deltaX, y: currentScreenCoords.y + deltaY };
          const newDataCoords = screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          updatedDrawing.startDataPoint = newDataCoords;
        }
        
        if (drawing.endDataPoint) {
          const currentScreenCoords = dataToScreenCoordinates(drawing.endDataPoint.candleIndex, drawing.endDataPoint.price);
          const newScreenCoords = { x: currentScreenCoords.x + deltaX, y: currentScreenCoords.y + deltaY };
          const newDataCoords = screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          updatedDrawing.endDataPoint = newDataCoords;
        }
        
        if (drawing.dataPoints && drawing.dataPoints.length > 0) {
          updatedDrawing.dataPoints = drawing.dataPoints.map(dataPoint => {
            const currentScreenCoords = dataToScreenCoordinates(dataPoint.candleIndex, dataPoint.price);
            const newScreenCoords = { x: currentScreenCoords.x + deltaX, y: currentScreenCoords.y + deltaY };
            return screenToDataCoordinates(newScreenCoords.x, newScreenCoords.y);
          });
        }
        
        // Also update screen coordinates for immediate visual feedback (these get recalculated on render anyway)
        if (drawing.startPoint) {
          updatedDrawing.startPoint = {
            x: drawing.startPoint.x + deltaX,
            y: drawing.startPoint.y + deltaY
          };
        }
        
        if (drawing.endPoint) {
          updatedDrawing.endPoint = {
            x: drawing.endPoint.x + deltaX,
            y: drawing.endPoint.y + deltaY
          };
        }
        
        if (drawing.points) {
          updatedDrawing.points = drawing.points.map((point: { x: number; y: number }) => ({
            x: point.x + deltaX,
            y: point.y + deltaY
          }));
        }
        
        return updatedDrawing;
      }
      return drawing;
    }));
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Just update crosshair position - don't clear overlay canvas
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCrosshairPosition({ x, y });
  };

  // Helper function to draw arrow heads
  const drawArrowHead = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headlen = 15; // length of head in pixels
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
  };

  // TradingView-style drawing renderer: converts time+price coordinates to screen position
  const drawStoredDrawings = (ctx: CanvasRenderingContext2D) => {
    const currentDrawings = drawingsRef.current;
    console.log('🎨 [RENDER] Starting render cycle, total drawings:', currentDrawings.length);
    console.log('🎨 [RENDER] Drawings to render:', currentDrawings.map(d => ({ id: d.id, type: d.type })));
    
    if (currentDrawings.length === 0) {
      console.log('❌ [RENDER] No drawings to render');
      return;
    }

    // TradingView coordinate conversion: time+price → screen coordinates
    const timeToScreenX = (timestamp: number): number => {
      if (!data || data.length === 0) return 0;
      
      // Find the candle index for this timestamp
      const candleIndex = data.findIndex((candle: any) => candle.timestamp >= timestamp);
      if (candleIndex === -1) return ctx.canvas.width; // Future timestamp, draw at right edge
      
      // CRITICAL INSIGHT: The drawing should stay at the SAME TIMESTAMP position
      // When we scroll, we see different timestamps, so the drawing should move accordingly
      const canvas = overlayCanvasRef.current;
      if (!canvas) return 0;
      
      const rect = canvas.getBoundingClientRect();
      const chartWidth = rect.width - 80; // Account for margins
      const candleWidth = chartWidth / visibleCandleCount;
      
      // Calculate where this timestamp appears on the current screen
      // If the timestamp is outside the visible range, it should be off-screen
      const visibleStartIndex = scrollOffset;
      const visibleEndIndex = scrollOffset + visibleCandleCount;
      
      if (candleIndex < visibleStartIndex || candleIndex >= visibleEndIndex) {
        // Drawing is outside visible range - position it off-screen but proportionally
        const relativePosition = candleIndex - scrollOffset;
        return relativePosition * candleWidth + candleWidth / 2 + 40;
      }
      
      // Drawing is in visible range - position it correctly
      const positionInVisibleRange = candleIndex - visibleStartIndex;
      const x = positionInVisibleRange * candleWidth + candleWidth / 2 + 40;
      
      console.log('🎯 FINAL FIX timeToScreenX:', { 
        timestamp, 
        candleIndex, 
        scrollOffset, 
        visibleRange: `${visibleStartIndex} to ${visibleEndIndex}`,
        positionInVisibleRange,
        x
      });
      
      return x;
    };

    const priceToScreenY = (price: number): number => {
      // Use STABLE price range for drawing positioning (doesn't change with scrolling)
      const stablePriceRange = getStablePriceRange();
      const { min: low, max: high } = stablePriceRange;
      const priceHeight = high - low;
      if (priceHeight === 0) return ctx.canvas.height / 2;
      
      // Convert price to screen Y coordinate (inverted: high price = low Y)
      const canvas = overlayCanvasRef.current;
      if (!canvas) return ctx.canvas.height / 2;
      
      const rect = canvas.getBoundingClientRect();
      const priceChartHeight = rect.height * 0.7; // 70% for price chart
      const normalizedPrice = (price - low) / priceHeight;
      return priceChartHeight - (normalizedPrice * priceChartHeight);
    };

    // Helper function to convert TradingView coordinates to screen coordinates
    const getScreenCoordinates = (drawing: Drawing) => {
      let startPoint: DrawingPoint | null = null;
      let endPoint: DrawingPoint | null = null;
      let points: DrawingPoint[] | null = null;

      console.log('🔄 Converting TradingView coordinates to screen:', drawing);

      // PRIORITY 1: New TradingView time/price coordinate system
      // Single point drawings (ray, vertical_line, horizontal_line)
      if (drawing.time && drawing.price !== undefined) {
        console.log('🎯 Converting single TIME/PRICE coordinates:', { time: drawing.time, price: drawing.price });
        console.log('🔍 DEBUGGING - Drawing object:', { 
          type: drawing.type, 
          id: drawing.id, 
          hasAbsoluteScreenY: drawing.absoluteScreenY !== undefined,
          absoluteScreenY: drawing.absoluteScreenY,
          price: drawing.price
        });
        
        // For rays: use the exact stored pixel coordinates - NO CALCULATIONS
        if ((drawing.type === 'ray' || drawing.type === 'horizontal_line') && drawing.absoluteScreenY !== undefined) {
          // SIMPLE: Use exact stored click coordinates
          const xCoord = drawing.clickX || 40; // Use stored X or default
          const yCoord = drawing.absoluteScreenY; // Use exact stored Y pixel
          
          startPoint = {
            x: xCoord,
            y: yCoord
          };
          
          console.log('🎯 RAY USING EXACT STORED PIXELS:', { 
            storedX: drawing.clickX,
            storedY: drawing.absoluteScreenY,
            finalPoint: startPoint,
            drawingId: drawing.id 
          });
        } else {
          // Normal coordinate conversion for other drawings
          startPoint = timePriceToScreenCoordinates(drawing.time, drawing.price);
          console.log('📍 USING CALCULATED COORDINATES:', startPoint);
        }
      }
      
      // Two point drawings (trend_line, etc.)
      if (drawing.time1 && drawing.price1 !== undefined) {
        console.log('🎯 Converting START TIME/PRICE coordinates:', { time: drawing.time1, price: drawing.price1 });
        // Use current range for trend lines to match chart scaling
        const useStableRange = false; // Trend lines should follow chart scaling
        startPoint = timePriceToScreenCoordinates(drawing.time1, drawing.price1, useStableRange);
        console.log('📍 Start point screen coordinates:', startPoint);
      }
      
      if (drawing.time2 && drawing.price2 !== undefined) {
        console.log('🎯 Converting END TIME/PRICE coordinates:', { time: drawing.time2, price: drawing.price2 });
        // Use current range for trend lines to match chart scaling
        const useStableRange = false; // Trend lines should follow chart scaling
        endPoint = timePriceToScreenCoordinates(drawing.time2, drawing.price2, useStableRange);
        console.log('📍 End point screen coordinates:', endPoint);
      }

      // Multi-point drawings (general patterns, etc.)
      if (drawing.points && drawing.points.length > 0 && drawing.points[0].timestamp && drawing.points[0].price !== undefined) {
        console.log('🎯 Converting MULTI TIME/PRICE coordinates:', drawing.points.length, 'points');
        points = drawing.points.map((point, index) => {
          const screenCoords = timePriceToScreenCoordinates(point.timestamp!, point.price!);
          console.log(`📍 Point ${index + 1} screen coordinates:`, screenCoords);
          return screenCoords;
        });
      }

      // FALLBACK 1: Legacy coordinate handling - already in correct format above

      // FALLBACK 2: Legacy TradingView coordinate system (no changes needed - handled above)

      // FALLBACK 2: Data coordinate system (legacy)
      if (!startPoint && drawing.startDataPoint) {
        console.log('🔄 Fallback to data coordinates for start point');
        const screenCoords = dataToScreenCoordinates(drawing.startDataPoint.candleIndex, drawing.startDataPoint.price);
        startPoint = screenCoords;
      }
      if (!endPoint && drawing.endDataPoint) {
        console.log('🔄 Fallback to data coordinates for end point');
        const screenCoords = dataToScreenCoordinates(drawing.endDataPoint.candleIndex, drawing.endDataPoint.price);
        endPoint = screenCoords;
      }
      if (!points && drawing.dataPoints && drawing.dataPoints.length > 0) {
        console.log('🔄 Fallback to data coordinates for multi points');
        points = drawing.dataPoints.map(dataPoint => 
          dataToScreenCoordinates(dataPoint.candleIndex, dataPoint.price)
        );
      }

      // FALLBACK 3: Raw screen coordinates (legacy - will move with chart!)
      if (!startPoint && drawing.startPoint) {
        console.log('⚠️ Using raw screen coordinates for start point (WILL MOVE WITH CHART!)');
        startPoint = drawing.startPoint;
      }
      if (!endPoint && drawing.endPoint) {
        console.log('⚠️ Using raw screen coordinates for end point (WILL MOVE WITH CHART!)');
        endPoint = drawing.endPoint;
      }
      if (!points && drawing.points) {
        console.log('⚠️ Using raw screen coordinates for multi points (WILL MOVE WITH CHART!)');
        points = drawing.points;
      }

      console.log('✅ Final screen coordinates:', { startPoint, endPoint, points });
      return { startPoint, endPoint, points };
    };
    
    // Drawing rendering has been removed as requested
    // Only core chart functionality remains
  };

  // Property Editor has been removed - drawing tools were removed as requested

  // Handle sidebar button clicks
  const handleSidebarClick = (id: string) => {
    setActiveSidebarPanel(activeSidebarPanel === id ? null : id);
  };

  // Watchlist Panel Component - Bloomberg Terminal Style with 4-Column Performance
  const WatchlistPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
    const currentSymbols = marketSymbols[activeTab as keyof typeof marketSymbols] || [];
    
    // Helper function to get performance status for a specific time period
    const getPerformanceStatus = (symbolChange: number, spyChange: number, symbol: string, period: string) => {
      if (symbol === 'SPY') return { status: 'NEUTRAL', color: 'text-yellow-400' };
      
      // Calculate relative performance: ticker vs SPY from period start to today
      const relativePerformance = symbolChange - spyChange;
      
      // Determine status based on relative performance vs SPY
      if (period === '21d') {
        if (relativePerformance > 0) {
          return { status: 'KING', color: 'text-yellow-400 font-bold glow-yellow' }; // Outperformed SPY over 21 days
        } else {
          return { status: 'FALLEN', color: 'text-red-400 font-bold glow-red' }; // Underperformed SPY over 21 days
        }
      } else if (period === '13d') {
        if (relativePerformance > 0) {
          return { status: 'LEADER', color: 'text-green-400 font-bold glow-green' }; // Outperformed SPY over 13 days
        } else {
          return { status: 'LAGGARD', color: 'text-red-400 font-bold glow-red' }; // Underperformed SPY over 13 days
        }
      } else if (period === '5d') {
        if (relativePerformance > 0) {
          return { status: 'STRONG', color: 'text-green-400 font-bold' }; // Outperformed SPY over 5 days
        } else {
          return { status: 'WEAK', color: 'text-red-400 font-bold' }; // Underperformed SPY over 5 days
        }
      } else if (period === '1d') {
        if (relativePerformance > 0) {
          return { status: 'RISING', color: 'text-lime-400 font-bold' }; // Outperformed SPY today
        } else {
          return { status: 'FALLING', color: 'text-red-300 font-bold' }; // Underperformed SPY today
        }
      }
      
      return { status: 'NEUTRAL', color: 'text-gray-400' };
    };

    // Helper function to calculate market regime for column headers only
    const getMarketRegimeForHeader = (period: string) => {
      // Growth sectors: XLY (Consumer Discretionary), XLK (Technology), XLC (Communication)
      const growthSectors = ['XLY', 'XLK', 'XLC'];
      // Defensive sectors: XLP (Consumer Staples), XLU (Utilities), XLRE (Real Estate), XLV (Healthcare)
      const defensiveSectors = ['XLP', 'XLU', 'XLRE', 'XLV'];
      
      // Get performance data for each sector vs SPY
      const growthPerformance = growthSectors.map(symbol => {
        const data = watchlistData[symbol];
        const spyData = watchlistData['SPY'];
        if (!data || !spyData) return null;
        
        let change = 0;
        let spyChange = 0;
        
        if (period === '1d') {
          change = data.change1d;
          spyChange = spyData.change1d;
        } else if (period === '5d') {
          change = data.change5d;
          spyChange = spyData.change5d;
        } else if (period === '13d') {
          change = data.change13d;
          spyChange = spyData.change13d;
        } else if (period === '21d') {
          change = data.change21d;
          spyChange = spyData.change21d;
        }
        
        return (change - spyChange) > 0; // true if outperforming SPY (rising relative to SPY)
      }).filter(result => result !== null);
      
      const defensivePerformance = defensiveSectors.map(symbol => {
        const data = watchlistData[symbol];
        const spyData = watchlistData['SPY'];
        if (!data || !spyData) return null;
        
        let change = 0;
        let spyChange = 0;
        
        if (period === '1d') {
          change = data.change1d;
          spyChange = spyData.change1d;
        } else if (period === '5d') {
          change = data.change5d;
          spyChange = spyData.change5d;
        } else if (period === '13d') {
          change = data.change13d;
          spyChange = spyData.change13d;
        } else if (period === '21d') {
          change = data.change21d;
          spyChange = spyData.change21d;
        }
        
        return (change - spyChange) > 0; // true if outperforming SPY (rising relative to SPY)
      }).filter(result => result !== null);
      
      // Count how many are rising
      const growthRising = growthPerformance.filter(Boolean).length;
      const defensiveFalling = defensivePerformance.filter(perf => !perf).length; // Count falling (underperforming)
      
      // RISK ON: All growth sectors rising AND most defensives falling
      if (growthRising === growthPerformance.length && defensiveFalling >= 3) {
        return 'RISK ON';
      }
      
      // DEFENSIVE: Growth sectors falling AND most defensives rising  
      const growthFalling = growthPerformance.filter(perf => !perf).length;
      const defensiveRising = defensivePerformance.filter(Boolean).length;
      
      if (growthFalling === growthPerformance.length && defensiveRising >= 3) {
        return 'DEFENSIVE';
      }
      
      // MIXED: Everything else
      return 'MIXED';
    };

    // Helper function to get group border styling
    const getGroupBorderStyle = (symbols: string[], startIndex: number, endIndex: number) => {
      if (startIndex === 0) {
        // Main indices group
        return 'border border-gray-300 rounded-md mb-2 p-1';
      } else if (startIndex === 4) {
        // Growth sectors group  
        return 'border border-green-600 rounded-md mb-2 p-1';
      } else if (startIndex === 7) {
        // Defensive sectors group
        return 'border border-red-600 rounded-md mb-2 p-1';
      } else if (startIndex === 11) {
        // Other sectors group
        return 'border border-blue-600 rounded-md mb-2 p-1';
      }
      return '';
    };
    
    return (
      <div className="h-full flex flex-col bg-black text-white">
        {/* Bloomberg-style Header */}
        <div className="p-3 border-b border-yellow-500 bg-black">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-yellow-400 uppercase tracking-wider">
              Watchlist
            </h2>
            <div className="text-xs bg-yellow-500 text-black px-2 py-1 font-bold">
              Live • {currentSymbols.length}
            </div>
          </div>
          
          {/* Bloomberg-style Tabs */}
          <div className="flex border border-gray-700">
            {['Markets', 'Industries', 'Special'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-3 py-1 text-xs font-bold uppercase tracking-wide border-r border-gray-700 last:border-r-0 ${
                  activeTab === tab 
                    ? 'bg-yellow-500 text-black' 
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        
        {/* Bloomberg-style Column Headers - 7 Columns */}
        <div className="grid grid-cols-7 gap-0 border-b border-gray-700 bg-gradient-to-b from-gray-800 via-gray-900 to-black text-sm font-bold text-yellow-400 uppercase shadow-inner">
          <div className="p-3 border-r border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-l-2 border-l-gray-600 border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">Symbol</span>
          </div>
          <div className="p-3 border-r border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">Price</span>
          </div>
          <div className="p-3 border-r border-gray-700 bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">Change</span>
          </div>
          <div className="p-3 border-r border-gray-700 text-center bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">{getMarketRegimeForHeader('1d')}</span>
          </div>
          <div className="p-3 border-r border-gray-700 text-center bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">{getMarketRegimeForHeader('5d')}</span>
          </div>
          <div className="p-3 border-r border-gray-700 text-center bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">{getMarketRegimeForHeader('13d')}</span>
          </div>
          <div className="p-3 text-center bg-gradient-to-b from-gray-800 to-gray-900 shadow-inner border-t-2 border-t-gray-600 border-r-2 border-r-gray-600">
            <span className="drop-shadow-lg text-shadow-carved">{getMarketRegimeForHeader('21d')}</span>
          </div>
        </div>
        
        {/* Bloomberg-style Content */}
        <div className="flex-1 overflow-y-auto bg-black">
          {currentSymbols.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-lg font-bold mb-2">NO DATA</div>
              <div className="text-sm">No symbols in {activeTab.toUpperCase()}</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {currentSymbols.map((symbol, index) => {
                const data = watchlistData[symbol];
                const spyData = watchlistData['SPY'];
                const isLoading = !data;
                
                // Add separator rows between categories
                const separatorRows = [];
                
                // Add green separator after DIA (before XLK)
                if (symbol === 'XLK') {
                  separatorRows.push(
                    <div key="growth-separator" className="h-3 bg-green-500 my-2 rounded opacity-60"></div>
                  );
                }
                
                // Add red separator after XLC (before XLRE) 
                if (symbol === 'XLRE') {
                  separatorRows.push(
                    <div key="defensive-separator" className="h-3 bg-red-500 my-2 rounded opacity-60"></div>
                  );
                }
                
                // Add blue separator after XLP (before XLB)
                if (symbol === 'XLB') {
                  separatorRows.push(
                    <div key="other-separator" className="h-3 bg-blue-500 my-2 rounded opacity-60"></div>
                  );
                }
                
                if (isLoading) {
                  return (
                    <div key={symbol}>
                      {separatorRows}
                      <div className="grid grid-cols-7 gap-0 hover:bg-gradient-to-r hover:from-gray-800 hover:to-gray-900 transition-all duration-300 mb-1 bg-gradient-to-r from-black via-gray-900 to-black shadow-lg border border-gray-800">
                        <div className="p-3 border-r border-gray-800 font-mono font-bold text-white text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">{symbol}</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">Loading...</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-center text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-center text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                        <div className="p-3 border-r border-gray-800 text-gray-500 text-center text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                        <div className="p-3 text-gray-500 text-center text-sm bg-gradient-to-b from-gray-900 to-black shadow-inner">
                          <span className="drop-shadow-md">--</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                const changeColor = data.change1d >= 0 ? 'text-green-400' : 'text-red-400';
                const changeSign = data.change1d >= 0 ? '+' : '';
                
                // Get performance status for each time period vs SPY
                const perf1d = spyData ? getPerformanceStatus(data.change1d, spyData.change1d, symbol, '1d') : { status: '--', color: 'text-gray-400' };
                const perf5d = spyData ? getPerformanceStatus(data.change5d, spyData.change5d, symbol, '5d') : { status: '--', color: 'text-gray-400' };
                const perf13d = spyData ? getPerformanceStatus(data.change13d, spyData.change13d, symbol, '13d') : { status: '--', color: 'text-gray-400' };
                const perf21d = spyData ? getPerformanceStatus(data.change21d, spyData.change21d, symbol, '21d') : { status: '--', color: 'text-gray-400' };
                
                return (
                  <div key={symbol}>
                    {separatorRows}
                    <div 
                      className="grid grid-cols-7 gap-0 hover:bg-gradient-to-r hover:from-gray-700 hover:via-gray-800 hover:to-gray-900 hover:shadow-xl transition-all duration-300 cursor-pointer mb-1 bg-gradient-to-r from-black via-gray-900 to-black shadow-lg border border-gray-800 hover:border-gray-600"
                      onClick={() => {
                        console.log(`📊 Switching chart to ${symbol}`);
                        if (onSymbolChange) {
                          onSymbolChange(symbol);
                        }
                        // Update the config state as well
                        setConfig(prev => ({ ...prev, symbol }));
                      }}
                    >
                      {/* Symbol */}
                      <div className="p-3 border-r border-gray-800 bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className="font-mono font-bold text-white text-sm drop-shadow-md hover:drop-shadow-lg transition-all duration-300">{symbol}</span>
                      </div>
                      
                      {/* Price */}
                      <div className="p-3 border-r border-gray-800 bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <div className="font-mono text-white font-bold text-sm drop-shadow-md hover:drop-shadow-lg transition-all duration-300">
                          {data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      
                      {/* Change */}
                      <div className="p-3 border-r border-gray-800 bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <div className={`font-mono font-bold text-sm drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${changeColor}`}>
                          {changeSign}{data.change1d.toFixed(2)}%
                        </div>
                      </div>
                      
                      {/* 1D Performance */}
                      <div className="p-3 border-r border-gray-800 text-center bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className={`font-bold text-sm uppercase tracking-wider drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${perf1d.color}`}>
                          {perf1d.status}
                        </span>
                      </div>
                      
                      {/* 5D Performance */}
                      <div className="p-3 border-r border-gray-800 text-center bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className={`font-bold text-sm uppercase tracking-wider drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${perf5d.color}`}>
                          {perf5d.status}
                        </span>
                      </div>
                      
                      {/* 13D Performance */}
                      <div className="p-3 border-r border-gray-800 text-center bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className={`font-bold text-sm uppercase tracking-wider drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${perf13d.color}`}>
                          {perf13d.status}
                        </span>
                      </div>
                      
                      {/* 21D Performance */}
                      <div className="p-3 text-center bg-gradient-to-b from-gray-900 to-black shadow-inner hover:shadow-none transition-shadow duration-300">
                        <span className={`font-bold text-sm uppercase tracking-wider drop-shadow-md hover:drop-shadow-lg transition-all duration-300 ${perf21d.color}`}>
                          {perf21d.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Bloomberg-style Footer */}
        <div className="p-2 border-t border-yellow-500 bg-gray-900">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3 text-gray-300">
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                REAL-TIME
              </span>
              <span>{new Date().toLocaleTimeString()}</span>
            </div>
            <div className="text-yellow-400 font-bold">
              VS SPY
            </div>
          </div>
        </div>
      </div>
    );
  };

  // RegimesPanel component removed for reconstruction
  // RegimesPanel component removed for reconstruction

  // RegimesPanel component removed for reconstruction

  // RegimesPanel component removed for reconstruction
  // RegimesPanel component removed for reconstruction
  // RegimesPanel component removed for reconstruction
  // Enhanced Market Regimes Panel Component with advanced analytics
  const RegimesPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
    // Remove empty tabs - only keep the functional content
    // const [viewMode, setViewMode] = React.useState<'overview'>('overview');
    
    const getCurrentTimeframeData = () => {
      if (!marketRegimeData) return null;
      
      switch (activeTab) {
        case 'Life':
          return marketRegimeData.life;
        case 'Developing':
          return marketRegimeData.developing;
        case 'Momentum':
          return marketRegimeData.momentum;
        default:
          return marketRegimeData.life;
      }
    };

    const timeframeData = getCurrentTimeframeData();
    const bullishIndustries = timeframeData?.industries.filter(industry => industry.trend === 'bullish').slice(0, 20) || [];
    const bearishIndustries = timeframeData?.industries.filter(industry => industry.trend === 'bearish').slice(0, 20) || [];

    return (
      <div className="h-full flex flex-col" style={{
        background: 'linear-gradient(145deg, #000000 0%, #0a0a0a 25%, #000000 50%, #0a0a0a 75%, #000000 100%)',
        boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        borderRadius: '0',
        overflow: 'hidden'
      }}>
        {/* Professional Glossy Header */}
        <div style={{
          background: 'linear-gradient(145deg, #000000 0%, #1a1a1a 50%, #000000 100%)',
          borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}>
          {/* Enhanced Centered Title */}
          <div className="px-8 py-8 text-center relative" style={{
            background: 'linear-gradient(145deg, #000000 0%, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%, #000000 100%)',
            borderBottom: '2px solid rgba(255, 255, 255, 0.15)',
            boxShadow: 'inset 0 4px 12px rgba(0, 0, 0, 0.8), inset 0 -2px 8px rgba(255, 255, 255, 0.05), 0 8px 20px rgba(0, 0, 0, 0.6)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Background enhancement elements */}
            <div className="absolute inset-0" style={{
              background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.03) 0%, transparent 70%)',
              pointerEvents: 'none'
            }}/>
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.02) 50%, transparent 100%)',
              pointerEvents: 'none'
            }}/>
            
            <h1 className="font-mono font-bold tracking-[0.25em] uppercase relative z-10" style={{
              fontSize: '32px',
              background: 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 25%, #ffffff 50%, #f0f0f0 75%, #ffffff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 4px 15px rgba(255, 255, 255, 0.4), 0 0 40px rgba(255, 255, 255, 0.15), 0 2px 0 rgba(0, 0, 0, 0.8)',
              letterSpacing: '0.2em',
              lineHeight: '1.2',
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))'
            }}>
              Market Regimes
            </h1>
            
            {/* Subtle decorative elements */}
            <div className="absolute left-1/2 bottom-2 transform -translate-x-1/2" style={{
              width: '60px',
              height: '2px',
              background: 'linear-gradient(90deg, transparent 0%, #ffffff 50%, transparent 100%)',
              opacity: 0.3
            }}/>
          </div>
          
          {/* Professional 3D Tabs */}
          <div className="px-6 py-8 flex justify-center">
            <div className="flex" style={{
              background: 'linear-gradient(145deg, #000000 0%, #0a0a0a 50%, #000000 100%)',
              borderRadius: '12px',
              padding: '6px',
              boxShadow: 'inset 0 4px 8px rgba(0, 0, 0, 0.8), inset 0 -4px 8px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 0, 0, 0.9)',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              {['Life', 'Developing', 'Momentum'].map((tab, index) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="relative px-8 py-4 text-lg font-bold transition-all duration-300 font-mono uppercase tracking-wider"
                  style={{
                    background: activeTab === tab 
                      ? 'linear-gradient(145deg, #1a1a1a 0%, #000000 25%, #2a2a2a 50%, #000000 75%, #1a1a1a 100%)'
                      : 'linear-gradient(145deg, #000000 0%, #0a0a0a 50%, #000000 100%)',
                    color: activeTab === tab ? '#ffffff' : '#666666',
                    borderRadius: '8px',
                    margin: '0 2px',
                    minWidth: '140px',
                    textShadow: activeTab === tab 
                      ? '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(255, 255, 255, 0.2)' 
                      : '0 1px 2px rgba(0, 0, 0, 0.8)',
                    boxShadow: activeTab === tab
                      ? 'inset 0 2px 4px rgba(0, 0, 0, 0.8), inset 0 -2px 4px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.7)'
                      : 'inset 0 1px 2px rgba(0, 0, 0, 0.6), inset 0 -1px 2px rgba(255, 255, 255, 0.02), 0 2px 6px rgba(0, 0, 0, 0.5)',
                    border: activeTab === tab 
                      ? '1px solid rgba(255, 255, 255, 0.1)' 
                      : '1px solid rgba(255, 255, 255, 0.02)',
                    transform: activeTab === tab ? 'translateY(-1px)' : 'translateY(0)',
                    letterSpacing: '0.1em'
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                    if (activeTab !== tab) {
                      e.currentTarget.style.background = 'linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)';
                      e.currentTarget.style.color = '#cccccc';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.7), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 10px rgba(0, 0, 0, 0.6)';
                    }
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                    if (activeTab !== tab) {
                      e.currentTarget.style.background = 'linear-gradient(145deg, #000000 0%, #0a0a0a 50%, #000000 100%)';
                      e.currentTarget.style.color = '#666666';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.6), inset 0 -1px 2px rgba(255, 255, 255, 0.02), 0 2px 6px rgba(0, 0, 0, 0.5)';
                    }
                  }}
                >
                  {tab}
                  {activeTab === tab && (
                    <div 
                      className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 rounded-full"
                      style={{
                        width: '30px',
                        height: '3px',
                        background: 'linear-gradient(90deg, transparent 0%, #ffffff 50%, transparent 100%)',
                        boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)'
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Progress bar */}
        {isLoadingRegimes && (
          <div className="w-full bg-[#1a1a1a]">
            <div 
              className="bg-emerald-500 h-1 transition-all duration-300 ease-out"
              style={{ width: `${regimeUpdateProgress}%` }}
            />
          </div>
        )}
        
        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoadingRegimes && !marketRegimeData ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-white text-opacity-60 text-sm text-center">
                <div>{regimeLoadingStage}</div>
                <div className="text-xs text-white text-opacity-40 mt-1">{regimeUpdateProgress}% complete</div>
                <div className="text-xs text-emerald-400 mt-2">📊 Auto-loading on startup...</div>
              </div>
            </div>
          ) : !marketRegimeData ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="text-white text-opacity-60 text-center">
                <div className="text-lg mb-2">📊</div>
                <div>Market Regime Analysis</div>
                <div className="text-xs text-white text-opacity-40 mt-1">Analysis loading automatically...</div>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              {/* Show streaming indicator while still loading */}
              {isLoadingRegimes && (
                <div className="mx-4 mt-3 px-3 py-2 bg-emerald-900 bg-opacity-20 border border-emerald-500 border-opacity-30 rounded text-xs text-emerald-400">
                  🔄 {regimeLoadingStage} ({regimeUpdateProgress}% complete)
                </div>
              )}
              
              {/* Content - Industry Lists */}
              <div className="p-4">
                {/* Industry Lists */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Bullish Industries */}
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-green-400 uppercase tracking-wider mb-4">Bullish Industries</h3>
                    <div className="grid grid-cols-2 gap-3">
                    {bullishIndustries.length > 0 ? bullishIndustries.map((industry, index) => (
                      <div 
                        key={industry.symbol} 
                        className="group p-4 rounded-lg bg-black border border-green-400 border-opacity-20 hover:border-green-400 hover:border-opacity-40 transition-all duration-200 shadow-lg"
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center">
                            <span className="text-base text-gray-500 mr-3 font-mono">#{index + 1}</span>
                            <span className="text-green-400 font-bold text-xl tracking-wide">{industry.symbol}</span>
                          </div>
                          <div className="text-green-300 text-base font-mono bg-green-400 bg-opacity-10 px-2 py-1 rounded">
                            +{industry.relativePerformance.toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-white text-lg mb-1 font-medium">{industry.name}</div>
                        
                        {/* Top Performing Stocks within this Industry */}
                        {industry.topPerformers && industry.topPerformers.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-green-400 border-opacity-20">
                            <div className="space-y-2">
                              {industry.topPerformers.slice(0, 3).map((stock, stockIndex) => (
                                <div 
                                  key={stock.symbol} 
                                  className="flex justify-between items-center bg-gray-900 bg-opacity-50 px-3 py-2 rounded cursor-pointer hover:bg-gray-800 hover:bg-opacity-60 transition-all duration-200"
                                  onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                    e.stopPropagation();
                                    console.log(`📊 Switching chart to ${stock.symbol} from bullish industry`);
                                    if (onSymbolChange) {
                                      onSymbolChange(stock.symbol);
                                    }
                                    setConfig(prev => ({ ...prev, symbol: stock.symbol }));
                                  }}
                                >
                                  <span className="text-white font-mono font-medium text-base">{stock.symbol}</span>
                                  <span className="text-green-400 font-mono font-bold text-base">
                                    +{stock.relativePerformance.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="p-4 rounded-lg bg-black border border-gray-500 border-opacity-30 text-center">
                        <div className="text-gray-400 text-base">No bullish industries</div>
                        <div className="text-gray-500 text-sm mt-1">in this timeframe</div>
                      </div>
                    )}
                    </div>
                  </div>
                  
                  {/* Bearish Industries */}
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-red-400 uppercase tracking-wider mb-4">Bearish Industries</h3>
                    <div className="grid grid-cols-2 gap-3">
                    {bearishIndustries.length > 0 ? bearishIndustries.map((industry, index) => (
                      <div 
                        key={industry.symbol} 
                        className="group p-4 rounded-lg bg-black border border-red-400 border-opacity-20 hover:border-red-400 hover:border-opacity-40 transition-all duration-200 shadow-lg"
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex items-center">
                            <span className="text-base text-gray-500 mr-3 font-mono">#{index + 1}</span>
                            <span className="text-red-400 font-bold text-xl tracking-wide">{industry.symbol}</span>
                          </div>
                          <div className="text-red-300 text-base font-mono bg-red-400 bg-opacity-10 px-2 py-1 rounded">
                            {industry.relativePerformance.toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-white text-lg mb-1 font-medium">{industry.name}</div>
                        
                        {/* Worst Performing Stocks within this Industry */}
                        {industry.worstPerformers && industry.worstPerformers.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-red-400 border-opacity-20">
                            <div className="space-y-2">
                              {industry.worstPerformers.slice(0, 3).map((stock, stockIndex) => (
                                <div 
                                  key={stock.symbol} 
                                  className="flex justify-between items-center bg-gray-900 bg-opacity-50 px-3 py-2 rounded cursor-pointer hover:bg-gray-800 hover:bg-opacity-60 transition-all duration-200"
                                  onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                    e.stopPropagation();
                                    console.log(`📊 Switching chart to ${stock.symbol} from bearish industry`);
                                    if (onSymbolChange) {
                                      onSymbolChange(stock.symbol);
                                    }
                                    setConfig(prev => ({ ...prev, symbol: stock.symbol }));
                                  }}
                                >
                                  <span className="text-white font-mono font-medium text-base">{stock.symbol}</span>
                                  <span className="text-red-400 font-mono font-bold text-base">
                                    {stock.relativePerformance.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="p-4 rounded-lg bg-black border border-gray-500 border-opacity-30 text-center">
                        <div className="text-gray-400 text-base">No bearish industries</div>
                        <div className="text-gray-500 text-sm mt-1">in this timeframe</div>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };
  const ChatPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[#1a1a1a]">
        {['admin', 'classic'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium transition-colors capitalize ${
              activeTab === tab 
                ? 'text-violet-400 border-b-2 border-violet-400' 
                : 'text-white text-opacity-60 hover:text-white hover:text-opacity-80'
            }`}
          >
            {tab} chats
          </button>
        ))}
      </div>
      
      {/* Chat Messages */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 bg-opacity-20 flex items-center justify-center">
              <span className="text-blue-400 text-sm font-medium">U</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-white text-opacity-80 font-medium">User {i + 1}</span>
                <span className="text-white text-opacity-40 text-xs">2m ago</span>
              </div>
              <div className="text-white text-opacity-70 text-sm mt-1">
                Sample message content for chat {i + 1}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Chat Input */}
      <div className="border-t border-[#1a1a1a] p-4">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Type a message..."
            className="flex-1 bg-[#1a1a1a] text-white px-3 py-2 rounded border border-[#2a2a2a] focus:border-violet-400 focus:outline-none"
          />
          <button className="p-2 text-white text-opacity-60 hover:text-violet-400 transition-colors">
            <TbPhoto size={20} />
          </button>
          <button className="p-2 bg-violet-500 text-white rounded hover:bg-violet-600 transition-colors">
            <TbSend size={20} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Advanced CSS for Premium Navigation and 3D Effects */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .text-shadow-carved {
            text-shadow: 
              1px 1px 0px rgba(0, 0, 0, 0.9),
              -1px -1px 0px rgba(255, 255, 255, 0.1),
              0px -1px 0px rgba(255, 255, 255, 0.05),
              0px 1px 0px rgba(0, 0, 0, 0.8) !important;
          }
          
          .glow-yellow {
            text-shadow: 0 0 5px rgba(255, 255, 0, 0.5), 0 0 10px rgba(255, 255, 0, 0.3) !important;
          }
          
          .glow-green {
            text-shadow: 0 0 5px rgba(0, 255, 0, 0.5), 0 0 10px rgba(0, 255, 0, 0.3) !important;
          }
          
          .glow-red {
            text-shadow: 0 0 5px rgba(255, 0, 0, 0.5), 0 0 10px rgba(255, 0, 0, 0.3) !important;
          }
          
          /* Premium Navigation Animations */
          @keyframes premiumGlow {
            0% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(128, 128, 128, 0.1), 0 0 15px rgba(64, 64, 64, 0.05); }
            50% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(128, 128, 128, 0.2), 0 0 20px rgba(64, 64, 64, 0.1); }
            100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(128, 128, 128, 0.1), 0 0 15px rgba(64, 64, 64, 0.05); }
          }
          
          @keyframes grayBorderSweep {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          
          @keyframes subtleShimmer {
            0% { opacity: 0.7; transform: translateX(-100%); }
            50% { opacity: 0.9; transform: translateX(0%); }
            100% { opacity: 0.7; transform: translateX(100%); }
          }
          
          /* 3D Carved Button Effects */
          .btn-3d-carved {
            background: linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%) !important;
            border: 1px solid rgba(128, 128, 128, 0.2) !important;
            box-shadow: 
              inset 2px 2px 4px rgba(128, 128, 128, 0.05),
              inset -2px -2px 4px rgba(0, 0, 0, 0.8),
              0 4px 8px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(64, 64, 64, 0.1) !important;
            text-shadow: 
              1px 1px 0px rgba(0, 0, 0, 0.9),
              -1px -1px 0px rgba(128, 128, 128, 0.1),
              0 0 5px rgba(128, 128, 128, 0.1) !important;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
            border-radius: 2px !important;
          }
          
          /* Active State - Crispy Orange */
          .btn-3d-carved.active {
            background: linear-gradient(145deg, #2a1a0a 0%, #1a1000 50%, #2a1a0a 100%) !important;
            border: 1px solid rgba(255, 140, 0, 0.4) !important;
            color: #ff8c00 !important;
            box-shadow: 
              inset 2px 2px 4px rgba(255, 140, 0, 0.1),
              inset -2px -2px 4px rgba(0, 0, 0, 0.8),
              0 4px 8px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(255, 140, 0, 0.3),
              0 0 10px rgba(255, 140, 0, 0.2) !important;
            text-shadow: 
              1px 1px 0px rgba(0, 0, 0, 0.9),
              -1px -1px 0px rgba(255, 140, 0, 0.2),
              0 0 8px rgba(255, 140, 0, 0.4) !important;
          }
          
          .btn-3d-carved:hover {
            background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%) !important;
            box-shadow: 
              inset 2px 2px 6px rgba(128, 128, 128, 0.1),
              inset -2px -2px 6px rgba(0, 0, 0, 0.9),
              0 6px 12px rgba(0, 0, 0, 0.7),
              0 0 0 1px rgba(96, 96, 96, 0.2) !important;
            transform: translateY(-1px) !important;
          }
          
          .btn-3d-carved.active:hover {
            background: linear-gradient(145deg, #3a2a1a 0%, #2a1a0a 50%, #3a2a1a 100%) !important;
            box-shadow: 
              inset 2px 2px 6px rgba(255, 140, 0, 0.15),
              inset -2px -2px 6px rgba(0, 0, 0, 0.9),
              0 6px 12px rgba(0, 0, 0, 0.7),
              0 0 0 1px rgba(255, 140, 0, 0.4),
              0 0 15px rgba(255, 140, 0, 0.3) !important;
            transform: translateY(-1px) !important;
          }
          
          .btn-3d-carved:active {
            background: linear-gradient(145deg, #0a0a0a 0%, #000000 50%, #0a0a0a 100%) !important;
            box-shadow: 
              inset 3px 3px 6px rgba(0, 0, 0, 0.9),
              inset -1px -1px 3px rgba(128, 128, 128, 0.05),
              0 2px 4px rgba(0, 0, 0, 0.5) !important;
            transform: translateY(1px) !important;
          }
          
          /* Professional Search Bar */
          .search-bar-premium {
            background: linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 100%) !important;
            border: 2px solid rgba(128, 128, 128, 0.3) !important;
            box-shadow: 
              inset 0 2px 4px rgba(0, 0, 0, 0.8),
              inset 0 -2px 4px rgba(128, 128, 128, 0.05),
              0 4px 12px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(96, 96, 96, 0.2) !important;
            border-radius: 3px !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          
          .search-bar-premium:focus-within {
            border: 2px solid rgba(160, 160, 160, 0.6) !important;
            box-shadow: 
              inset 0 2px 4px rgba(0, 0, 0, 0.8),
              inset 0 -2px 4px rgba(128, 128, 128, 0.1),
              0 4px 12px rgba(0, 0, 0, 0.6),
              0 0 15px rgba(128, 128, 128, 0.2),
              0 0 0 2px rgba(96, 96, 96, 0.1) !important;
          }
          
          /* Premium Navigation Container */
          .navigation-bar-premium {
            position: relative;
            overflow: hidden;
          }
          
          .navigation-bar-premium::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(128, 128, 128, 0.05), transparent);
            animation: subtleSweep 6s ease-in-out infinite;
            pointer-events: none;
          }
          
          @keyframes subtleSweep {
            0% { left: -100%; }
            50% { left: 100%; }
            100% { left: -100%; }
          }
          
          /* Sharp Corner Enhancements */
          .sharp-corners {
            border-radius: 0 !important;
            clip-path: polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px));
          }
        `
      }} />
      
      <div className="w-full h-full rounded-lg overflow-hidden" style={{ backgroundColor: colors.background }}>
      {/* Premium Bloomberg Terminal Top Bar with Solid Black & Gold */}
      <div 
        className="h-14 border-b flex items-center justify-between px-6 relative navigation-bar-premium"
        style={{ 
          background: '#000000',
          backgroundSize: '400% 400%',
          borderColor: '#333333',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(128, 128, 128, 0.1), 0 0 15px rgba(64, 64, 64, 0.05)',
          backdropFilter: 'blur(10px)',
          zIndex: 10000,
          animation: 'premiumGlow 8s ease infinite alternate'
        }}
      >
        {/* Premium Gray Border Animation */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(128, 128, 128, 0.3), transparent)',
            backgroundSize: '200% 100%',
            animation: 'grayBorderSweep 5s linear infinite',
            borderRadius: 'inherit',
            opacity: 0.6
          }}
        />
        
        {/* Premium Metallic Overlay */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(128, 128, 128, 0.05) 0%, transparent 30%, transparent 70%, rgba(96, 96, 96, 0.02) 100%)',
            borderRadius: 'inherit',
            animation: 'subtleShimmer 10s ease-in-out infinite'
          }}
        />
        
        {/* Drawing Tools Status Badge */}
        <div className="absolute top-2 left-4 z-20">
          <div
            className="flex items-center space-x-2 px-3 py-1 rounded-full bg-black bg-opacity-60 backdrop-blur border border-gray-600 border-opacity-50"
            style={{
              background: 'linear-gradient(135deg, rgba(18, 18, 18, 0.9) 0%, rgba(12, 12, 12, 0.95) 100%)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              fontSize: '11px',
              display: 'none'
            }}
          >
          </div>
        </div>
        
        {/* Symbol and Price Info */}
        <div className="flex items-center w-full relative z-10">
          {/* Left side: Symbol Search + Price + Controls */}
          <div className="flex items-center space-x-8 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center">
              <div className="search-bar-premium flex items-center space-x-2 px-3 py-2 rounded-md">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'rgba(128, 128, 128, 0.5)' }}>
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <input
                  type="text"
                  value={searchQuery || symbol}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  className="bg-transparent border-0 outline-none w-28 text-lg font-bold"
                  style={{
                    color: '#ffffff',
                    textShadow: '0 0 5px rgba(128, 128, 128, 0.2), 0 1px 2px rgba(0, 0, 0, 0.8)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    letterSpacing: '0.8px'
                  }}
                  placeholder="Search..."
                />
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: '#666' }}>
                  <path d="M12 5v14l7-7-7-7z" fill="currentColor"/>
                </svg>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-start space-y-1">
            <span 
              className="font-mono text-xl font-bold leading-tight"
              style={{
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(255, 255, 255, 0.2)',
                letterSpacing: '0.3px'
              }}
            >
              ${currentPrice.toFixed(2)}
            </span>
            <span 
              className="font-mono text-xs font-semibold px-2 py-0.5 rounded"
              style={{
                color: priceChangePercent >= 0 ? '#10b981' : '#ef4444',
                background: priceChangePercent >= 0 
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)',
                textShadow: `0 1px 1px rgba(0, 0, 0, 0.8), 0 0 6px ${priceChangePercent >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                border: `1px solid ${priceChangePercent >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                letterSpacing: '0.2px'
              }}
            >
              {priceChangePercent >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </span>
          </div>

          {/* Timeframes - Moved closer to symbol/price */}
          <div 
            className="flex items-center timeframe-dropdown"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            }}
          >
            {/* Main Timeframes */}
            {[
              { label: '5M', value: '5m' },
              { label: '30M', value: '30m' },
              { label: '1H', value: '1h' },
              { label: '24H', value: '4h' },
              { label: 'D', value: '1d' }
            ].map((tf, index) => (
              <button
                key={tf.label}
                onClick={() => handleTimeframeChange(tf.value)}
                className={`btn-3d-carved relative group ${config.timeframe === tf.value ? 'active' : 'text-white'}`}
                style={{
                  padding: '10px 20px',
                  fontWeight: '700',
                  fontSize: '15px',
                  letterSpacing: '0.8px',
                  borderRadius: '4px'
                }}
              >
                {tf.label}
              </button>
            ))}
            
            {/* Dropdown Toggle Button - Integrated */}
            <div className="relative">
              <button
                ref={timeframeButtonRef}
                onClick={() => {
                  setShowTimeframeDropdown(!showTimeframeDropdown);
                  if (!showTimeframeDropdown) {
                    updateDropdownPosition('timeframe');
                  }
                }}
                className={`btn-3d-carved relative group flex items-center space-x-1 ${['1m', '15m', '1w', '1mo'].includes(config.timeframe) ? 'active' : 'text-white'}`}
                style={{
                  padding: '8px 12px',
                  fontWeight: '600',
                  fontSize: '13px',
                  letterSpacing: '0.5px',
                  borderRadius: '4px'
                }}
              >
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="currentColor"
                  style={{
                    transform: showTimeframeDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                  }}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
              </button>
              
            </div>
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-8" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Chart Type Selector - Moved to left side */}
          <div 
            className="flex items-center chart-type-dropdown"
            style={{
              background: 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(255, 255, 255, 0.05), 0 4px 8px rgba(0, 0, 0, 0.4)'
            }}
          >
            {/* Main Chart Type Buttons */}
            {MAIN_CHART_TYPES.map((type, index) => (
              <button
                key={type.value}
                onClick={() => handleChartTypeChange(type.value as ChartConfig['chartType'])}
                className={`btn-3d-carved relative group ${config.chartType === type.value ? 'active' : 'text-white'}`}
                style={{
                  padding: '10px 14px',
                  fontSize: '16px',
                  fontWeight: '700',
                  borderRadius: '4px'
                }}
                title={type.label}
              >
                {type.icon}
              </button>
            ))}
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-8" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Indicators Button - Moved to left side */}
          <div className="relative indicators-dropdown search-bar-premium">
            <button 
              ref={indicatorsButtonRef}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (!showIndicatorsDropdown) {
                  updateDropdownPosition('indicators');
                  setShowIndicatorsDropdown(true);
                } else {
                  setShowIndicatorsDropdown(false);
                }
              }}
              className={`btn-3d-carved relative group flex items-center space-x-2 ${showIndicatorsDropdown || config.indicators.length > 0 ? 'active' : 'text-white'}`}
              style={{
                padding: '10px 14px',
                fontWeight: '700',
                fontSize: '13px',
                borderRadius: '4px'
              }}
            >
              <span>INDICATORS</span>
              <svg 
                width="12" 
                height="12" 
                viewBox="0 0 12 12" 
                fill="currentColor"
                style={{
                  transform: showIndicatorsDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s'
                }}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
            </button>
          </div>

          {/* Expected Range Button - Standalone */}
          <div className="ml-4">
            <button
              onClick={() => {
                const newActiveState = !isExpectedRangeActive;
                setIsExpectedRangeActive(newActiveState);
                
                if (newActiveState) {
                  // Load Expected Range levels when activated
                  if (!expectedRangeLevels && !isLoadingExpectedRange) {
                    setIsLoadingExpectedRange(true);
                    calculateExpectedRangeLevels(symbol).then(result => {
                      if (result) {
                        setExpectedRangeLevels(result.levels);
                        console.log('📊 Expected Range levels loaded:', result.levels);
                      } else {
                        console.error('📊 Failed to load Expected Range levels');
                      }
                      setIsLoadingExpectedRange(false);
                    });
                  }
                } else {
                  // Clear levels when deactivated
                  setExpectedRangeLevels(null);
                }
                
                console.log(`📊 Expected Range ${newActiveState ? 'activated' : 'deactivated'}`);
              }}
              className={`btn-3d-carved relative group flex items-center space-x-2 ${isExpectedRangeActive ? 'active' : 'text-white'}`}
              style={{
                padding: '10px 14px',
                fontWeight: '700',
                fontSize: '13px',
                borderRadius: '4px'
              }}
            >
              <span>EXPECTED RANGE</span>
              {isLoadingExpectedRange && (
                <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full"></div>
              )}
              {isExpectedRangeActive && !isLoadingExpectedRange && (
                <span className="text-green-400 text-sm">✓</span>
              )}
            </button>
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-8" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>
          </div>

          {/* Spacer to push remaining items to the right */}
          <div className="flex-1"></div>

          {/* Remaining Controls on the Right */}
          <div className="flex items-center flex-shrink-0">

          {/* Glowing Orange Separator */}
          <div className="mx-6" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Volume Toggle */}
          <button
            onClick={() => setConfig(prev => ({ ...prev, volume: !prev.volume }))}
            className={`btn-3d-carved relative group ${config.volume ? 'active' : 'text-gray-400'}`}
            style={{
              padding: '10px 14px',
              fontWeight: '700',
              fontSize: '13px',
              letterSpacing: '0.5px'
            }}
          >
            VOLUME
          </button>

          {/* Glowing Orange Separator */}
          <div className="mx-6" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Test Future Scroll Button */}
          <button
            onClick={() => {
              const futurePeriods = getFuturePeriods(config.timeframe);
              const maxFuturePeriods = Math.min(futurePeriods, Math.ceil(visibleCandleCount * 0.2));
              const futureScrollOffset = data.length - visibleCandleCount + maxFuturePeriods;
              setScrollOffset(futureScrollOffset);
              console.log('Scrolling to future:', { futureScrollOffset, dataLength: data.length, visibleCandleCount, maxFuturePeriods });
            }}
            className="btn-3d-carved relative group text-gray-300"
            style={{
              padding: '10px 14px',
              fontWeight: '700',
              fontSize: '13px',
              letterSpacing: '0.5px'
            }}
          >
            FUTURE
          </button>

          {/* Glowing Orange Separator */}
          <div className="mx-6" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Enhanced Action Buttons */}
          <div className="flex items-center space-x-4">

            {/* Glowing Orange Separator */}
            <div className="mx-6" style={{
              width: '4px',
              height: '50px',
              background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
              borderRadius: '2px'
            }}></div>

            {/* ADMIN Button - Premium Gold Design */}
            <button 
              className="relative group overflow-hidden"
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%)',
                border: '2px solid transparent',
                backgroundImage: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%), linear-gradient(90deg, #FFD700, #FFA500, #FFD700)',
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                color: '#FFD700',
                fontWeight: '800',
                fontSize: '13px',
                letterSpacing: '1.2px',
                textShadow: `
                  0 0 5px rgba(255, 215, 0, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(255, 215, 0, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `,
                boxShadow: `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(255, 215, 0, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(255, 215, 0, 0.2),
                  0 0 25px rgba(255, 215, 0, 0.1)
                `,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative'
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                e.currentTarget.style.textShadow = `
                  0 0 8px rgba(255, 215, 0, 1),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 15px rgba(255, 215, 0, 0.6),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 4px 8px rgba(0, 0, 0, 0.5),
                  inset 0 -4px 8px rgba(255, 215, 0, 0.15),
                  0 8px 25px rgba(0, 0, 0, 0.7),
                  0 4px 12px rgba(255, 215, 0, 0.3),
                  0 0 35px rgba(255, 215, 0, 0.2)
                `;
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.textShadow = `
                  0 0 5px rgba(255, 215, 0, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(255, 215, 0, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(255, 215, 0, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(255, 215, 0, 0.2),
                  0 0 25px rgba(255, 215, 0, 0.1)
                `;
              }}
            >
              {/* Gold shine effect */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'linear-gradient(45deg, transparent 30%, rgba(255, 215, 0, 0.1) 50%, transparent 70%)',
                  animation: 'shimmer 2s infinite',
                  borderRadius: '8px'
                }}
              ></div>
              <span className="relative z-10">ADMIN</span>
            </button>

            {/* Glowing Orange Separator */}
            <div className="mx-6" style={{
              width: '4px',
              height: '50px',
              background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
              borderRadius: '2px'
            }}></div>

            {/* AI Button - Futuristic Silver/Chrome Design */}
            <button 
              className="relative group overflow-hidden"
              onClick={() => {
                console.log('AI button clicked in TradingViewChart!');
                console.log('onAIButtonClick prop:', onAIButtonClick);
                if (onAIButtonClick) {
                  onAIButtonClick();
                } else {
                  console.log('onAIButtonClick prop is undefined!');
                }
              }}
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                background: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%)',
                border: '2px solid transparent',
                backgroundImage: 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #1a1a1a 70%, #2a2a2a 100%), linear-gradient(90deg, #C0C0C0, #E8E8E8, #C0C0C0)',
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                color: '#E8E8E8',
                fontWeight: '800',
                fontSize: '13px',
                letterSpacing: '1.2px',
                textShadow: `
                  0 0 5px rgba(232, 232, 232, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(192, 192, 192, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `,
                boxShadow: `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(232, 232, 232, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(192, 192, 192, 0.2),
                  0 0 25px rgba(192, 192, 192, 0.1)
                `,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative'
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                e.currentTarget.style.color = '#FFFFFF';
                e.currentTarget.style.textShadow = `
                  0 0 8px rgba(255, 255, 255, 1),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 15px rgba(232, 232, 232, 0.6),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 4px 8px rgba(0, 0, 0, 0.5),
                  inset 0 -4px 8px rgba(232, 232, 232, 0.15),
                  0 8px 25px rgba(0, 0, 0, 0.7),
                  0 4px 12px rgba(192, 192, 192, 0.3),
                  0 0 35px rgba(192, 192, 192, 0.2)
                `;
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.color = '#E8E8E8';
                e.currentTarget.style.textShadow = `
                  0 0 5px rgba(232, 232, 232, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(192, 192, 192, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(232, 232, 232, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(192, 192, 192, 0.2),
                  0 0 25px rgba(192, 192, 192, 0.1)
                `;
              }}
            >
              {/* Chrome shine effect */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%)',
                  animation: 'shimmer 1.5s infinite',
                  borderRadius: '8px'
                }}
              ></div>
              <span className="relative z-10">AI</span>
            </button>

            {/* Glowing Orange Separator */}
            <div className="mx-6" style={{
              width: '4px',
              height: '50px',
              background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
              boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
              borderRadius: '2px'
            }}></div>

          </div>

          {/* SETTINGS Button - Professional Orange Design */}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="relative group overflow-hidden"
            style={{
              padding: '12px 20px',
              borderRadius: '10px',
              background: showSettings
                ? 'linear-gradient(145deg, #2d1a00 0%, #1a1100 30%, #3d2400 70%, #2d1a00 100%)'
                : 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #2d1a00 70%, #1a1a1a 100%)',
              border: '2px solid transparent',
              backgroundImage: showSettings
                ? 'linear-gradient(145deg, #2d1a00 0%, #1a1100 30%, #3d2400 70%, #2d1a00 100%), linear-gradient(90deg, #FF8C00, #FFA500, #FF8C00)'
                : 'linear-gradient(145deg, #1a1a1a 0%, #000000 30%, #2d1a00 70%, #1a1a1a 100%), linear-gradient(90deg, #FF8C00, #FFA500, #FF8C00)',
              backgroundOrigin: 'border-box',
              backgroundClip: 'padding-box, border-box',
              color: showSettings ? '#FFB84D' : '#FFA500',
              fontWeight: '800',
              fontSize: '13px',
              letterSpacing: '1.2px',
              textShadow: showSettings
                ? `
                  0 0 8px rgba(255, 184, 77, 1),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 15px rgba(255, 165, 0, 0.6),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `
                : `
                  0 0 5px rgba(255, 165, 0, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(255, 140, 0, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `,
              boxShadow: showSettings
                ? `
                  inset 0 4px 8px rgba(0, 0, 0, 0.5),
                  inset 0 -4px 8px rgba(255, 165, 0, 0.15),
                  0 8px 25px rgba(0, 0, 0, 0.7),
                  0 4px 12px rgba(255, 140, 0, 0.3),
                  0 0 35px rgba(255, 140, 0, 0.2)
                `
                : `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(255, 165, 0, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(255, 140, 0, 0.2),
                  0 0 25px rgba(255, 140, 0, 0.1)
                `,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative'
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
              if (!showSettings) {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                e.currentTarget.style.color = '#FFB84D';
                e.currentTarget.style.textShadow = `
                  0 0 8px rgba(255, 184, 77, 1),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 15px rgba(255, 165, 0, 0.6),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 4px 8px rgba(0, 0, 0, 0.5),
                  inset 0 -4px 8px rgba(255, 165, 0, 0.15),
                  0 8px 25px rgba(0, 0, 0, 0.7),
                  0 4px 12px rgba(255, 140, 0, 0.3),
                  0 0 35px rgba(255, 140, 0, 0.2)
                `;
              }
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
              if (!showSettings) {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.color = '#FFA500';
                e.currentTarget.style.textShadow = `
                  0 0 5px rgba(255, 165, 0, 0.8),
                  0 2px 4px rgba(0, 0, 0, 0.9),
                  0 0 10px rgba(255, 140, 0, 0.4),
                  2px 2px 0px rgba(0, 0, 0, 0.8)
                `;
                e.currentTarget.style.boxShadow = `
                  inset 0 3px 6px rgba(0, 0, 0, 0.4),
                  inset 0 -3px 6px rgba(255, 165, 0, 0.1),
                  0 6px 20px rgba(0, 0, 0, 0.6),
                  0 2px 8px rgba(255, 140, 0, 0.2),
                  0 0 25px rgba(255, 140, 0, 0.1)
                `;
              }
            }}
          >
            {/* Orange glow effect */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background: 'linear-gradient(45deg, transparent 30%, rgba(255, 165, 0, 0.1) 50%, transparent 70%)',
                animation: 'shimmer 1.5s infinite',
                borderRadius: '8px'
              }}
            ></div>
            <span className="relative z-10">SETTINGS</span>
          </button>
          </div>
        </div>
        </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-22 right-4 bg-[#1e222d] border border-[#2a2e39] rounded-lg p-6 w-80 shadow-2xl" style={{ zIndex: 99999 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Chart Settings</h3>
            <button 
              onClick={() => setShowSettings(false)}
              className="text-[#787b86] hover:text-white text-xl"
            >
              ×
            </button>
          </div>

          {/* Grid Toggle */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-2">Grid Lines</label>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setConfig(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                className={`flex items-center justify-center w-12 h-6 rounded-full transition-colors ${
                  config.showGrid
                    ? 'bg-[#2962ff]'
                    : 'bg-[#131722] border border-[#2a2e39]'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    config.showGrid ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-[#787b86] text-sm">
                {config.showGrid ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Y-Axis Settings */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">Y-Axis (Price)</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Text Size</span>
                <input
                  type="range"
                  min="8"
                  max="20"
                  value={config.axisStyle.yAxis.textSize}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    axisStyle: {
                      ...prev.axisStyle,
                      yAxis: { ...prev.axisStyle.yAxis, textSize: parseInt(e.target.value) }
                    }
                  }))}
                  className="w-20 accent-[#2962ff]"
                />
                <span className="text-[#787b86] text-xs w-8">{config.axisStyle.yAxis.textSize}px</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Text Color</span>
                <input
                  type="color"
                  value={config.axisStyle.yAxis.textColor}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    axisStyle: {
                      ...prev.axisStyle,
                      yAxis: { ...prev.axisStyle.yAxis, textColor: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* X-Axis Settings */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">X-Axis (Time)</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Text Size</span>
                <input
                  type="range"
                  min="8"
                  max="20"
                  value={config.axisStyle.xAxis.textSize}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    axisStyle: {
                      ...prev.axisStyle,
                      xAxis: { ...prev.axisStyle.xAxis, textSize: parseInt(e.target.value) }
                    }
                  }))}
                  className="w-20 accent-[#2962ff]"
                />
                <span className="text-[#787b86] text-xs w-8">{config.axisStyle.xAxis.textSize}px</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Text Color</span>
                <input
                  type="color"
                  value={config.axisStyle.xAxis.textColor}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    axisStyle: {
                      ...prev.axisStyle,
                      xAxis: { ...prev.axisStyle.xAxis, textColor: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Theme Selection */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-2">Theme</label>
            <div className="flex space-x-2">
              <button
                onClick={() => setConfig(prev => ({ ...prev, theme: 'dark' }))}
                className={`px-4 py-2 rounded text-sm transition-colors ${
                  config.theme === 'dark'
                    ? 'bg-[#2962ff] text-white'
                    : 'bg-[#131722] text-[#787b86] hover:text-white'
                }`}
              >
                🌙 Dark
              </button>
              <button
                onClick={() => setConfig(prev => ({ ...prev, theme: 'light' }))}
                className={`px-4 py-2 rounded text-sm transition-colors ${
                  config.theme === 'light'
                    ? 'bg-[#2962ff] text-white'
                    : 'bg-[#131722] text-[#787b86] hover:text-white'
                }`}
              >
                ☀️ Light
              </button>
            </div>
          </div>

          {/* Body Colors */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">✅ Body</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish</span>
                <input
                  type="color"
                  value={config.colors.bullish.body}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bullish: { ...prev.colors.bullish, body: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish</span>
                <input
                  type="color"
                  value={config.colors.bearish.body}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bearish: { ...prev.colors.bearish, body: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Border Colors */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">✅ Borders</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish</span>
                <input
                  type="color"
                  value={config.colors.bullish.border}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bullish: { ...prev.colors.bullish, border: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish</span>
                <input
                  type="color"
                  value={config.colors.bearish.border}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bearish: { ...prev.colors.bearish, border: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Wick Colors */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">✅ Wick</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish</span>
                <input
                  type="color"
                  value={config.colors.bullish.wick}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bullish: { ...prev.colors.bullish, wick: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish</span>
                <input
                  type="color"
                  value={config.colors.bearish.wick}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      bearish: { ...prev.colors.bearish, wick: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Volume Colors */}
          <div className="mb-6">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">Volume</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish</span>
                <input
                  type="color"
                  value={config.colors.volume.bullish.replace(/[0-9a-f]{2}$/i, '')} // Remove alpha
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      volume: { ...prev.colors.volume, bullish: e.target.value + '80' } // Add alpha
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish</span>
                <input
                  type="color"
                  value={config.colors.volume.bearish.replace(/[0-9a-f]{2}$/i, '')} // Remove alpha
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      volume: { ...prev.colors.volume, bearish: e.target.value + '80' } // Add alpha
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Preset Themes */}
          <div className="mb-4">
            <label className="block text-[#d1d4dc] text-sm font-medium mb-2">Quick Presets</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  colors: {
                    bullish: { body: '#26a69a', wick: '#26a69a', border: '#26a69a' },
                    bearish: { body: '#ef5350', wick: '#ef5350', border: '#ef5350' },
                    volume: { bullish: '#26a69a80', bearish: '#ef535080' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Classic
              </button>
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  colors: {
                    bullish: { body: '#00d4aa', wick: '#00d4aa', border: '#00d4aa' },
                    bearish: { body: '#fb8c00', wick: '#fb8c00', border: '#fb8c00' },
                    volume: { bullish: '#00d4aa80', bearish: '#fb8c0080' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Neon
              </button>
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  colors: {
                    bullish: { body: '#4caf50', wick: '#4caf50', border: '#2e7d32' },
                    bearish: { body: '#f44336', wick: '#f44336', border: '#c62828' },
                    volume: { bullish: '#4caf5080', bearish: '#f4433680' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Material
              </button>
              <button
                onClick={() => setConfig(prev => ({
                  ...prev,
                  colors: {
                    bullish: { body: '#2196f3', wick: '#2196f3', border: '#2196f3' },
                    bearish: { body: '#9c27b0', wick: '#9c27b0', border: '#9c27b0' },
                    volume: { bullish: '#2196f380', bearish: '#9c27b080' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Blue/Purple
              </button>
            </div>
          </div>

          {/* Apply Button */}
          <button
            onClick={() => setShowSettings(false)}
            className="w-full px-4 py-2 bg-[#2962ff] text-white rounded hover:bg-[#2151cc] transition-colors"
          >
            Apply Settings
          </button>
        </div>
      )}

      {/* Chart Container with Sidebar */}
      <div className="flex flex-1 bg-[#0a0a0a]">
        {/* Animated 3D Sidebar */}
        <div className="sidebar-container w-16 bg-gradient-to-b from-[#000000] via-[#0a0a0a] to-[#000000] border-r border-[#1a1a1a] shadow-2xl relative overflow-hidden">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full" style={{ background: 'linear-gradient(to bottom right, rgba(255,255,255,0.05), transparent, rgba(255,255,255,0.03))' }}></div>
            <div className="absolute w-6 h-6 bg-white bg-opacity-3 rounded-full animate-pulse" style={{ top: '25%', left: '25%' }}></div>
            <div className="absolute w-4 h-4 bg-white bg-opacity-2 rounded-full animate-pulse" style={{ bottom: '33.333%', right: '25%', animationDelay: '2000ms' }}></div>
          </div>
          
          <div className="relative z-10 flex flex-col items-center py-4 h-full">
            {/* Sidebar Buttons */}
            {[
              { id: 'watchlist', icon: TbChartLine, label: 'Watch', color: 'from-gray-800 to-gray-900', accent: 'blue' },
              { id: 'regimes', icon: TbTrendingUp, label: 'Markets', color: 'from-gray-800 to-gray-900', accent: 'emerald' },
              { id: 'news', icon: TbNews, label: 'News', color: 'from-gray-800 to-gray-900', accent: 'amber' },
              { id: 'alerts', icon: TbBellRinging, label: 'Alerts', color: 'from-gray-800 to-gray-900', accent: 'red' },
              { id: 'chat', icon: TbMessageCircle, label: 'Chat', color: 'from-gray-800 to-gray-900', accent: 'violet' }
            ].map((item, index) => {
              const IconComponent = item.icon;
              const accentColors: { [key: string]: string } = {
                blue: 'text-blue-400 group-hover:text-blue-300',
                emerald: 'text-emerald-400 group-hover:text-emerald-300',
                amber: 'text-amber-400 group-hover:text-amber-300',
                red: 'text-red-400 group-hover:text-red-300',
                violet: 'text-violet-400 group-hover:text-violet-300',
                cyan: 'text-cyan-400 group-hover:text-cyan-300'
              };
              return (
              <div key={item.id} className="flex flex-col items-center mb-3">
                {/* Title above button */}
                <span className="text-xs text-white text-opacity-40 font-medium mb-1 tracking-wide text-center">
                  {item.label}
                </span>
                
                <button
                className={`sidebar-btn group relative w-12 h-12 rounded-lg bg-gradient-to-br ${item.color} 
                           shadow-lg hover:shadow-2xl transform transition-all duration-300 
                           hover:scale-105 hover:-translate-y-0.5 active:scale-95
                           border border-gray-700 border-opacity-50 hover:border-gray-600 hover:border-opacity-70
                           relative overflow-hidden
                           backdrop-blur-sm flex items-center justify-center`}
                style={{
                  animationDelay: `${index * 100}ms`,
                  background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.95) 0%, rgba(10, 10, 10, 0.98) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.5)'
                }}
                onClick={() => handleSidebarClick(item.id)}
                title={item.label}
              >
                {/* Subtle inner glow */}
                <div className="absolute inset-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: 'linear-gradient(to bottom right, rgba(255,255,255,0.05), transparent, transparent)' }}></div>
                
                {/* Icon with accent color */}
                <span className={`z-10 text-4xl filter drop-shadow-lg transition-all duration-300 group-hover:scale-110 ${accentColors[item.accent]}`}>
                  <IconComponent />
                </span>
                
                {/* Subtle ripple effect */}
                <div className="absolute inset-0 rounded-lg bg-white bg-opacity-10 scale-0 group-active:scale-100 transition-transform duration-200"></div>
                
                {/* Accent glow effect */}
                <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-30 blur-sm transition-opacity duration-300" style={{ background: `linear-gradient(to right, ${item.accent === 'blue' ? 'rgba(59, 130, 246, 0.2)' : item.accent === 'emerald' ? 'rgba(16, 185, 129, 0.2)' : item.accent === 'purple' ? 'rgba(147, 51, 234, 0.2)' : item.accent === 'amber' ? 'rgba(245, 158, 11, 0.2)' : item.accent === 'rose' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)'}, ${item.accent === 'blue' ? 'rgba(37, 99, 235, 0.2)' : item.accent === 'emerald' ? 'rgba(5, 150, 105, 0.2)' : item.accent === 'purple' ? 'rgba(126, 34, 206, 0.2)' : item.accent === 'amber' ? 'rgba(217, 119, 6, 0.2)' : item.accent === 'rose' ? 'rgba(225, 29, 72, 0.2)' : 'rgba(37, 99, 235, 0.2)'})` }}></div>
              </button>
              </div>
              );
            })}
            
            {/* Decorative elements */}
            <div className="flex-1"></div>
            <div className="w-8 h-px bg-gradient-to-r from-transparent via-white via-opacity-10 to-transparent mb-2"></div>
            <div className="text-xs text-white text-opacity-40 font-mono tracking-wider">EFI</div>
          </div>
          
          {/* Subtle side accent */}
          <div className="absolute top-0 right-0 w-px h-full" style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent)' }}></div>
        </div>

        {/* Main Chart Area */}
        <div 
          ref={containerRef}
          className="relative flex-1"
          style={{ height: height - 150 }} // Reduced height to leave space for X-axis
        >
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center">
            <div className="bg-[#1e222d] border border-[#2a2e39] rounded-lg p-6 flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#2962ff]"></div>
              <span className="text-white text-lg">Loading {config.timeframe} data...</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="absolute inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center">
            <div className="bg-[#1e222d] border border-red-500 rounded-lg p-6">
              <span className="text-red-400">Error: {error}</span>
            </div>
          </div>
        )}

        {/* Y-Axis Auto-Scale Toggle Button */}
        <div className="absolute top-4 right-4 z-30">
          <button
            onClick={() => {
              if (isAutoScale) {
                // When switching from auto to manual, preserve current range
                const startIndex = Math.max(0, Math.floor(scrollOffset));
                const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
                const visibleData = data.slice(startIndex, endIndex);
                const currentRange = calculateAutoPriceRange(visibleData);
                setManualPriceRangeAndDisableAuto(currentRange);
              } else {
                resetToAutoScale();
              }
            }}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all duration-200 ${
              isAutoScale 
                ? 'bg-[#2962ff] text-white shadow-lg' 
                : 'bg-[#1e222d] text-[#868993] border border-[#2a2e39] hover:text-white hover:border-[#868993]'
            }`}
            title={isAutoScale ? "Auto-scale enabled (double-click Y-axis to reset)" : "Manual scale (click to enable auto-scale)"}
          >
            📏 {isAutoScale ? 'AUTO' : 'MANUAL'}
          </button>
        </div>

        {/* Main Chart Canvas with Integrated Volume */}
        <canvas
          ref={chartCanvasRef}
          className="absolute top-0 left-0 z-10"
          style={{ height: chartHeight }}
        />

        {/* Crosshair and Interaction Overlay */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 z-20"
          style={{ 
            cursor: activeTool ? 'crosshair' : isDragging ? 'grabbing' : 'crosshair',
            transition: 'cursor 0.1s ease'
          }}
          onMouseDown={handleUnifiedMouseDown}
        onContextMenu={(e: React.MouseEvent<HTMLCanvasElement>) => {
          e.preventDefault();
          const x = e.nativeEvent.offsetX;
          const y = e.nativeEvent.offsetY;
          
          // Check if right-clicking on a drawing
          for (const drawing of drawings) {
            const startPoint = drawing.startPoint || (drawing.startX !== undefined && drawing.startY !== undefined ? { x: drawing.startX, y: drawing.startY } : null);
            const endPoint = drawing.endPoint || (drawing.endX !== undefined && drawing.endY !== undefined ? { x: drawing.endX, y: drawing.endY } : null);
            
            if (startPoint && endPoint && isPointNearLine(x, y, startPoint, endPoint, 10)) {
              setSelectedDrawing(drawing);
              
              // Drawing editor removed - drawing tools were removed as requested
              console.log('Drawing editor removed - drawing tools were removed');
              break;
            }
          }
        }}
          onMouseMove={activeTool ? handleCanvasMouseMove : handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={(e: React.MouseEvent<HTMLCanvasElement>) => {
            handleMouseUp();
            handleMouseLeave();
          }}
          // Touch Events for Mobile Support
          onTouchStart={(e: React.TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault();
            const touch = e.touches[0];
            if (!touch) return;
            
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseEvent = {
              currentTarget: e.currentTarget,
              button: 0,
              clientX: touch.clientX,
              clientY: touch.clientY,
              ctrlKey: false,
              metaKey: false,
              preventDefault: () => e.preventDefault()
            } as unknown as React.MouseEvent<HTMLCanvasElement>;
            
            handleUnifiedMouseDown(mouseEvent);
          }}
          onTouchMove={(e: React.TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault();
            const touch = e.touches[0];
            if (!touch) return;
            
            const rect = e.currentTarget.getBoundingClientRect();
            const mouseEvent = {
              currentTarget: e.currentTarget,
              clientX: touch.clientX,
              clientY: touch.clientY
            } as unknown as React.MouseEvent<HTMLCanvasElement>;
            
            if (activeTool) {
              handleCanvasMouseMove(mouseEvent);
            } else {
              handleMouseMove(mouseEvent);
            }
          }}
          onTouchEnd={(e: React.TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault();
            handleMouseUp();
          }}
          // Pinch-to-zoom support
          onWheel={(e: React.WheelEvent<HTMLCanvasElement>) => {
            if (e.ctrlKey) {
              // Pinch-to-zoom gesture (Ctrl + wheel)
              e.preventDefault();
              const delta = e.deltaY;
              const scaleFactor = delta > 0 ? 1.1 : 0.9;
              
              const newCount = Math.max(20, Math.min(300, Math.round(visibleCandleCount * scaleFactor)));
              setVisibleCandleCount(newCount);
            }
          }}
          onClick={(e) => console.log('👆 SINGLE CLICK DETECTED on canvas!')}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      {/* Text Input Modal for Drawing Tools */}
      {showTextInput && textInputPosition && (
        <div 
          className="absolute z-[10000] bg-[#1e222d] border border-[#2a2e39] rounded-lg p-4 shadow-xl"
          style={{
            left: (textInputPosition?.x || 0) + 10,
            top: (textInputPosition?.y || 0) - 10,
            minWidth: '200px'
          }}
        >
          <div className="mb-3">
            <label className="block text-white text-sm font-medium mb-2">
              {activeTool === 'text' ? 'Add Text' : 
               activeTool === 'note' ? 'Add Note' : 
               activeTool === 'callout' ? 'Add Callout' : 
               activeTool === 'price_label' ? 'Price Label' : 
               'Add Text'}
            </label>
            <input
              type="text"
              value={drawingText}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDrawingText(e.target.value)}
              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleTextSubmit()}
              className="w-full px-3 py-2 bg-[#131722] border border-[#3a3e47] rounded text-white text-sm focus:outline-none focus:border-[#2962ff]"
              placeholder="Enter text..."
              autoFocus
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleTextSubmit}
              className="px-3 py-1 bg-[#2962ff] text-white rounded text-sm hover:bg-[#1e4db7] transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowTextInput(false);
                setDrawingText('');
                setTextInputPosition(null);
                setActiveTool(null);
              }}
              className="px-3 py-1 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Property Editor removed - drawing tools were removed as requested */}
      </div>

      {/* Sidebar Panels */}
      {activeSidebarPanel && (
        <div className="fixed top-40 bottom-0 left-16 w-[1000px] bg-[#0a0a0a] border-r border-[#1a1a1a] shadow-2xl z-40 transform transition-transform duration-300 ease-out">
          {/* Panel Header */}
          <div className="h-12 border-b border-[#1a1a1a] flex items-center justify-between px-4">
            <h3 className="text-white font-medium capitalize">{activeSidebarPanel}</h3>
            <button 
              onClick={() => setActiveSidebarPanel(null)}
              className="text-white text-opacity-60 hover:text-white transition-colors p-1"
            >
              <TbX size={18} />
            </button>
          </div>

          {/* Panel Content */}
          <div className="h-full overflow-y-auto">
            {activeSidebarPanel === 'watchlist' && (
              <WatchlistPanel 
                activeTab={watchlistTab} 
                setActiveTab={setWatchlistTab} 
              />
            )}
            {activeSidebarPanel === 'regimes' && (
              <RegimesPanel 
                activeTab={regimesTab} 
                setActiveTab={setRegimesTab} 
              />
            )}
            {activeSidebarPanel === 'news' && (
              <div className="p-4 text-center text-white text-opacity-50">
                News section coming soon...
              </div>
            )}
            {activeSidebarPanel === 'alerts' && (
              <div className="p-4 text-center text-white text-opacity-50">
                Alerts section coming soon...
              </div>
            )}
            {activeSidebarPanel === 'chat' && (
              <ChatPanel 
                activeTab={chatTab} 
                setActiveTab={setChatTab} 
              />
            )}
          </div>
        </div>
      )}
      </div>

      {/* Portal Dropdowns - Rendered outside chart container to avoid z-index issues */}
      {showIndicatorsDropdown && createPortal(
        <div
          className="fixed w-48 rounded-lg overflow-hidden"
          style={{
            left: `${dropdownPositions.indicators.x}px`,
            top: `${dropdownPositions.indicators.y}px`,
            background: 'linear-gradient(135deg, rgba(18, 18, 18, 0.95) 0%, rgba(12, 12, 12, 0.98) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(12px)',
            zIndex: 999999
          }}
        >
          {INDICATORS.map((indicator) => (
            <button
              key={indicator.value}
              onClick={() => {
                // Add indicator to chart
                const isCurrentlyActive = config.indicators.includes(indicator.value);
                setConfig(prev => ({
                  ...prev,
                  indicators: isCurrentlyActive
                    ? prev.indicators.filter(ind => ind !== indicator.value)
                    : [...prev.indicators, indicator.value]
                }));
                console.log(`📊 ${isCurrentlyActive ? 'Removed' : 'Added'} indicator: ${indicator.label}`);
                setShowIndicatorsDropdown(false);
              }}
              className={`w-full px-4 py-3 text-left flex items-center justify-between hover:bg-white hover:bg-opacity-10 transition-colors ${
                config.indicators.includes(indicator.value) ? 'bg-blue-600 bg-opacity-20' : ''
              }`}
              style={{
                background: config.indicators.includes(indicator.value) 
                  ? 'rgba(41, 98, 255, 0.2)' 
                  : 'transparent',
                color: config.indicators.includes(indicator.value) 
                  ? '#60a5fa' 
                  : '#d1d5db',
                fontSize: '13px',
                fontWeight: '500',
                letterSpacing: '0.3px',
                textShadow: '0 1px 1px rgba(0, 0, 0, 0.8)'
              }}
            >
              <div className="flex items-center space-x-3">
                <span className="text-sm">📈</span>
                <span>{indicator.label}</span>
              </div>
              {config.indicators.includes(indicator.value) && (
                <span className="text-blue-400 text-sm">✓</span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}

      {showTimeframeDropdown && createPortal(
        <div 
          className="fixed rounded-xl shadow-2xl min-w-[120px] backdrop-blur-lg"
          style={{
            left: `${dropdownPositions.timeframe.x}px`,
            top: `${dropdownPositions.timeframe.y}px`,
            background: 'linear-gradient(135deg, rgba(10, 10, 10, 0.95) 0%, rgba(26, 26, 26, 0.95) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            zIndex: 999999
          }}
        >
          {['1M', '15M', '1W', '1MO'].map((tf, index) => (
            <button
              key={tf}
              onClick={() => {
                handleTimeframeChange(tf.toLowerCase());
                setShowTimeframeDropdown(false);
              }}
              className="w-full text-left transition-all duration-150"
              style={{
                padding: '12px 16px',
                background: config.timeframe === tf.toLowerCase()
                  ? 'linear-gradient(135deg, #2962ff 0%, #1e4db7 100%)'
                  : 'transparent',
                color: config.timeframe === tf.toLowerCase() ? '#ffffff' : '#d1d5db',
                fontWeight: '600',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textShadow: config.timeframe === tf.toLowerCase()
                  ? '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 8px rgba(41, 98, 255, 0.4)'
                  : '0 1px 1px rgba(0, 0, 0, 0.8)',
                borderRadius: index === 0 ? '10px 10px 0 0' : index === 3 ? '0 0 10px 10px' : '0'
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (config.timeframe !== tf.toLowerCase()) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                if (config.timeframe !== tf.toLowerCase()) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#d1d5db';
                }
              }}
            >
              {tf}
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* ✨ NEW: Drawing Properties Panel */}
      <DrawingPropertiesPanel
        selectedDrawing={selectedDrawing}
        isOpen={showPropertiesPanel}
        onClose={() => setShowPropertiesPanel(false)}
        onUpdate={handleDrawingPropertiesUpdate}
        position={propertiesPanelPosition}
      />

      {/* ✨ NEW: Right-Click Context Menu */}
      {showContextMenu && contextMenuDrawing && createPortal(
        <div 
          className="fixed z-[9999] bg-[#131722] border border-[#2a2e39] rounded-lg shadow-2xl min-w-[200px]"
          style={{ 
            left: Math.min(contextMenuPosition.x, window.innerWidth - 220), 
            top: Math.min(contextMenuPosition.y, window.innerHeight - 300)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1">
            {/* Properties */}
            <button
              onClick={() => {
                setShowPropertiesPanel(true);
                setPropertiesPanelPosition(contextMenuPosition);
                setShowContextMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#2a2e39] transition-colors flex items-center"
            >
              <span className="mr-3">⚙️</span>
              Properties...
            </button>
            
            <div className="border-t border-[#2a2e39] my-1"></div>
            
            {/* Copy/Paste/Duplicate */}
            <button
              onClick={() => {
                handleCopyDrawing(contextMenuDrawing);
                setShowContextMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#2a2e39] transition-colors flex items-center"
            >
              <span className="mr-3">📋</span>
              Copy
            </button>
            
            {drawingClipboard.length > 0 && (
              <button
                onClick={() => {
                  handlePasteDrawing();
                  setShowContextMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#2a2e39] transition-colors flex items-center"
              >
                <span className="mr-3">📌</span>
                Paste
              </button>
            )}
            
            <button
              onClick={() => {
                handleDuplicateDrawing(contextMenuDrawing);
                setShowContextMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#2a2e39] transition-colors flex items-center"
            >
              <span className="mr-3">✨</span>
              Duplicate
            </button>
            
            <div className="border-t border-[#2a2e39] my-1"></div>
            
            {/* Layer Management */}
            <button
              onClick={() => {
                bringDrawingToFront(contextMenuDrawing);
                setShowContextMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#2a2e39] transition-colors flex items-center"
            >
              <span className="mr-3">⬆️</span>
              Bring to Front
            </button>
            
            <button
              onClick={() => {
                sendDrawingToBack(contextMenuDrawing);
                setShowContextMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#2a2e39] transition-colors flex items-center"
            >
              <span className="mr-3">⬇️</span>
              Send to Back
            </button>
            
            <div className="border-t border-[#2a2e39] my-1"></div>
            
            {/* Lock/Unlock */}
            <button
              onClick={() => {
                updateDrawing(contextMenuDrawing.id, { isLocked: !contextMenuDrawing.isLocked });
                setShowContextMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-white hover:bg-[#2a2e39] transition-colors flex items-center"
            >
              <span className="mr-3">{contextMenuDrawing.isLocked ? '🔓' : '🔒'}</span>
              {contextMenuDrawing.isLocked ? 'Unlock' : 'Lock'}
            </button>
            
            <div className="border-t border-[#2a2e39] my-1"></div>
            
            {/* Delete */}
            <button
              onClick={() => {
                handleDeleteDrawing(contextMenuDrawing);
                setShowContextMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-[#f23645] hover:bg-[#2a2e39] transition-colors flex items-center"
            >
              <span className="mr-3">🗑️</span>
              Delete
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ✨ NEW: Drawing Toolbar Enhancement with Magnet Mode */}
      {(activeTool || selectedDrawing) && (
        <div className="fixed top-4 right-4 z-[9998] flex items-center space-x-2 bg-[#131722] border border-[#2a2e39] rounded-lg p-2">
          {/* Magnet Mode Toggle */}
          <button
            onClick={() => setMagnetMode(!magnetMode)}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              magnetMode 
                ? 'bg-[#2962ff] text-white' 
                : 'bg-[#1e222d] text-[#868993] hover:text-white'
            }`}
            title="Magnet Mode - Snap to OHLC values"
          >
            🧲 Magnet
          </button>
          
          {/* Show Handles Toggle */}
          <button
            onClick={() => setShowDrawingHandles(!showDrawingHandles)}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              showDrawingHandles 
                ? 'bg-[#2962ff] text-white' 
                : 'bg-[#1e222d] text-[#868993] hover:text-white'
            }`}
            title="Show/Hide Drawing Handles"
          >
            ⚙️ Handles
          </button>
          
          {/* Clear All Drawings */}
          <button
            onClick={() => {
              if (confirm('Delete all drawings?')) {
                setDrawings([]);
                setSelectedDrawing(null);
                setSelectedDrawings([]);
              }
            }}
            className="px-3 py-1.5 text-xs bg-[#f23645] text-white rounded hover:bg-[#cc2c3b] transition-colors"
            title="Clear All Drawings"
          >
            🗑️ Clear
          </button>
        </div>
      )}
    </>
  );
}
