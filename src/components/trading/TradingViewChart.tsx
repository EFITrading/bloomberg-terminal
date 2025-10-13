'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  TbChartLine, 
  TbNews, 
  TbBellRinging, 
  TbMessageCircle, 
  TbTrendingUp,
  TbTrendingDown,
  TbX,
  TbSend,
  TbPhoto,
  TbUser,
  TbLock,
  TbCalculator,
  TbLink,
  TbPhoneCall
} from 'react-icons/tb';
import { IndustryAnalysisService, MarketRegimeData, IndustryPerformance, TimeframeAnalysis } from '../../lib/industryAnalysisService';

// Global type declarations
declare global {
  interface Window {
    MARKET_REGIMES_DEBUG?: any;
  }
}
import ChartDataCache from '../../lib/chartDataCache';
import OptionsCalculator from '../calculator/OptionsCalculator';
import NewsPanel from '../news/NewsPanel';
import TradingPlan from './TradingPlan';
import { gexService } from '../../lib/gexService';
import { useGEXData } from '../../hooks/useGEXData';
import { GEXChartOverlay } from '../GEXChartOverlay';
import { getExpirationDates, getExpirationDatesFromAPI, getDaysUntilExpiration } from '../../lib/optionsExpirationUtils';
import { createApiUrl } from '../../lib/apiConfig';

// Add custom styles for 3D carved effect and holographic animations
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
  
  /* Holographic Channel Animations */
  @keyframes shimmer {
    0% { transform: translateX(-100%) skewX(-12deg); }
    100% { transform: translateX(200%) skewX(-12deg); }
  }
  
  @keyframes spin-slow {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
  
  .animate-spin-slow {
    animation: spin-slow 8s linear infinite;
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

// Horizontal Ray interface for drawing horizontal lines
interface HorizontalRay {
  id: string;
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  extendLeft: boolean;
  extendRight: boolean;
  label: string;
  startX?: number; // For backward compatibility
  isSelected?: boolean; // For selection state
}

// Parallel Channels interface for drawing parallel channel lines (3-point system)
interface ParallelChannel {
  id: string;
  point1: { timestamp: number; price: number }; // Start of main trend line
  point2: { timestamp: number; price: number }; // End of main trend line  
  point3: { timestamp: number; price: number }; // Point to define channel width
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillOpacity: number;
  fillColor?: string; // Fill color for the channel area
  showFill?: boolean; // Whether to show the fill
  label: string;
  isSelected?: boolean;
}

// Drawing Brush interface for freehand drawing
interface DrawingBrush {
  id: string;
  strokes: Array<{ timestamp: number; price: number }>;
  color: string;
  lineWidth: number;
  opacity: number;
  label: string;
  isSelected?: boolean;
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
  drawings: Drawing[];
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

// Get option quotes with improved reliability
const getOptionQuotes = async (optionSymbol: string) => {
  try {
    // Try snapshot first for more reliable data
    const snapshotResponse = await fetch(
      `https://api.polygon.io/v3/snapshot/options/${optionSymbol}?apikey=${POLYGON_API_KEY}`
    );
    const snapshotData = await snapshotResponse.json();
    
    if (snapshotData.results && snapshotData.results.last_quote) {
      const bid = snapshotData.results.last_quote.bid || 0;
      const ask = snapshotData.results.last_quote.ask || 0;
      if (bid > 0 && ask > 0 && ask > bid) {
        return { price: (bid + ask) / 2, bid, ask, spread: ask - bid };
      }
    }
    
    // Fallback to last trade
    const response = await fetch(
      `https://api.polygon.io/v2/last/trade/${optionSymbol}?apikey=${POLYGON_API_KEY}`
    );
    const data = await response.json();
    
    if (data.results && data.results.p) {
      return { price: data.results.p, bid: 0, ask: 0, spread: 0 };
    }
    
    return null;
  } catch (error) {
    console.log(`⚠️ Error getting quotes for ${optionSymbol}:`, (error as Error).message);
    return null;
  }
};

// Calculate IV from options chain using improved methodology - LIVE DATA ONLY
const calculateIVFromOptionsChain = async (optionsResults: any[], price: number, timeToExpiry: number, label: string): Promise<number> => {
  console.log(`${label} - Total options found:`, optionsResults.length);
  console.log(`${label} - Current stock price: $${price.toFixed(2)}`);
  
  if (optionsResults.length === 0) {
    throw new Error(`No options found for ${label}`);
  }

  // Find multiple ATM strikes for better accuracy (within 2% tolerance)
  const atmStrikes = [];
  const tolerance = price * 0.02; // 2% tolerance for "ATM"
  
  for (const option of optionsResults) {
    if (Math.abs(option.strike_price - price) <= tolerance) {
      atmStrikes.push(option.strike_price);
    }
  }
  
  const uniqueStrikes = [...new Set(atmStrikes)].sort((a, b) => 
    Math.abs(a - price) - Math.abs(b - price)
  );
  
  console.log(`${label} - ATM strikes within 2%: ${uniqueStrikes.slice(0, 5).join(', ')}`);
  
  if (uniqueStrikes.length === 0) {
    throw new Error(`No ATM options found for ${label} within 2% range. Current price: $${price.toFixed(2)}`);
  }

  // Test multiple strikes for reliability
  const validIVs = [];
  
  for (const strike of uniqueStrikes.slice(0, 3)) { // Test top 3 closest strikes
    const optionAtStrike = optionsResults.find(opt => opt.strike_price === strike);
    
    if (optionAtStrike) {
      console.log(`${label} - Testing strike $${strike}...`);
      
      const quote = await getOptionQuotes(optionAtStrike.ticker);
      
      if (quote && quote.price > 0) {
        console.log(`${label} - Strike $${strike}: $${quote.price.toFixed(2)} (bid/ask: ${quote.bid}/${quote.ask})`);
        
        const calculatedIV = estimateIVFromPrice(
          price, 
          strike, 
          quote.price, 
          riskFreeRate, 
          timeToExpiry, 
          optionAtStrike.contract_type === 'call'
        );
        
        // Only include reasonable IV values (5% to 100%)
        if (calculatedIV >= 0.05 && calculatedIV <= 1.0) {
          validIVs.push(calculatedIV);
          console.log(`${label} - ✅ Strike $${strike} IV: ${(calculatedIV * 100).toFixed(2)}%`);
        } else {
          console.log(`${label} - ❌ Strike $${strike} IV out of range: ${(calculatedIV * 100).toFixed(2)}%`);
        }
      } else {
        console.log(`${label} - ❌ Invalid quotes for strike $${strike}`);
      }
    }
  }
  
  // Calculate average from valid IVs
  if (validIVs.length > 0) {
    const avgIV = validIVs.reduce((a, b) => a + b) / validIVs.length;
    console.log(`✅ ${label} Average IV: ${(avgIV * 100).toFixed(2)}% (from ${validIVs.length} strikes)`);
    return avgIV;
  } else {
    throw new Error(`No valid IV calculations found for ${label}`);
  }
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

    // Get dynamic expiration dates from Polygon API
    const { weeklyExpiry, monthlyExpiry, weeklyDate, monthlyDate } = await getExpirationDatesFromAPI(symbol);
    const weeklyExpiryDate = weeklyExpiry;
    const monthlyExpiryDate = monthlyExpiry;

    // Calculate days to expiry
    const weeklyDTE = Math.max(1, getDaysUntilExpiration(weeklyDate));
    const monthlyDTE = Math.max(1, getDaysUntilExpiration(monthlyDate));
    
    console.log(`Using dynamic expiration dates: Weekly ${weeklyExpiryDate} (${weeklyDTE}d), Monthly ${monthlyExpiryDate} (${monthlyDTE}d)`);

    // Fetch options chains with API-level strike filtering - increased limit for better IV accuracy
    const weeklyOptionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${weeklyExpiryDate}&strike_price.gte=${Math.floor(lowerBound)}&strike_price.lte=${Math.ceil(upperBound)}&limit=300&apikey=${POLYGON_API_KEY}`
    );
    
    const monthlyOptionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${monthlyExpiryDate}&strike_price.gte=${Math.floor(lowerBound)}&strike_price.lte=${Math.ceil(upperBound)}&limit=300&apikey=${POLYGON_API_KEY}`
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

    // Calculate IVs using both calls and puts for better accuracy, then average them
    let weeklyIV, monthlyIV;
    
    try {
      console.log('🔄 Calculating Weekly IV from live market data...');
      const weeklyCallIV = await calculateIVFromOptionsChain(
        weeklyOptionsData.results.filter((opt: any) => opt.contract_type === 'call'), 
        currentPrice, weeklyTimeToExpiry, 'Weekly Call'
      );
      
      const weeklyPutIV = await calculateIVFromOptionsChain(
        weeklyOptionsData.results.filter((opt: any) => opt.contract_type === 'put'), 
        currentPrice, weeklyTimeToExpiry, 'Weekly Put'
      );
      
      // Average call and put IV for more stability
      weeklyIV = (weeklyCallIV + weeklyPutIV) / 2;
      console.log(`📊 Weekly IV: Call ${(weeklyCallIV * 100).toFixed(2)}%, Put ${(weeklyPutIV * 100).toFixed(2)}%, Average ${(weeklyIV * 100).toFixed(2)}%`);
      
    } catch (error) {
      console.error('❌ Failed to calculate weekly IV from live data:', error);
      throw new Error(`Failed to calculate weekly IV: ${error}`);
    }
    
    try {
      console.log('🔄 Calculating Monthly IV from live market data...');
      const monthlyCallIV = await calculateIVFromOptionsChain(
        monthlyOptionsData.results.filter((opt: any) => opt.contract_type === 'call'), 
        currentPrice, monthlyTimeToExpiry, 'Monthly Call'
      );
      
      const monthlyPutIV = await calculateIVFromOptionsChain(
        monthlyOptionsData.results.filter((opt: any) => opt.contract_type === 'put'), 
        currentPrice, monthlyTimeToExpiry, 'Monthly Put'
      );
      
      // Average call and put IV for more stability
      monthlyIV = (monthlyCallIV + monthlyPutIV) / 2;
      console.log(`📊 Monthly IV: Call ${(monthlyCallIV * 100).toFixed(2)}%, Put ${(monthlyPutIV * 100).toFixed(2)}%, Average ${(monthlyIV * 100).toFixed(2)}%`);
      
    } catch (error) {
      console.error('❌ Failed to calculate monthly IV from live data:', error);
      throw new Error(`Failed to calculate monthly IV: ${error}`);
    }

    // Final validation of IV data
    if (!weeklyIV || !monthlyIV || weeklyIV <= 0 || monthlyIV <= 0) {
      throw new Error('Invalid IV data calculated from live market prices');
    }
    
    console.log('✅ Successfully calculated all IVs from live Polygon.io market data:');
    console.log(`📈 Weekly IV: ${(weeklyIV * 100).toFixed(2)}% (${weeklyDTE} DTE)`);
    console.log(`📈 Monthly IV: ${(monthlyIV * 100).toFixed(2)}% (${monthlyDTE} DTE)`);
    console.log(`💰 Current Price: $${currentPrice.toFixed(2)}`);

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

// Render GEX levels on chart
const renderGEXLevels = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  minPrice: number,
  maxPrice: number,
  gexData: any
) => {
  if (!gexData || !gexData.gexData) return;

  console.log('📊 Rendering GEX levels on chart with new data structure...', gexData);

  const priceToY = (price: number) => {
    return height - ((price - minPrice) / (maxPrice - minPrice)) * height;
  };

  // Zero Gamma Level
  if (gexData.gexData.zeroGammaLevel) {
    const y = priceToY(gexData.gexData.zeroGammaLevel);
    
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.globalAlpha = 0.9;
    
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width - 80, y);
    ctx.stroke();
    
    // Label with 100% bright visibility
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.strokeText(`Zero Γ: $${gexData.gexData.zeroGammaLevel.toFixed(0)}`, width - 10, y - 5);
    ctx.fillStyle = '#ffff00';
    ctx.fillText(`Zero Γ: $${gexData.gexData.zeroGammaLevel.toFixed(0)}`, width - 10, y - 5);
    
    console.log(`🟡 Zero Gamma Level rendered at $${gexData.gexData.zeroGammaLevel}`);
  }

  // GEX Flip Level - Critical dealer behavior change level
  if (gexData.gexData.gexFlipLevel) {
    const y = priceToY(gexData.gexData.gexFlipLevel);
    
    // Color based on gamma environment
    const flipColor = gexData.gexData.isPositiveGamma ? '#8b5cf6' : '#f97316'; // Purple for positive, Orange for negative
    
    ctx.strokeStyle = flipColor;
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 6, 4, 6]); // Distinctive dash pattern
    ctx.globalAlpha = 0.95;
    
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width - 80, y);
    ctx.stroke();
    
    // Label with 100% bright visibility
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.strokeText(`ATTRACTION: $${gexData.gexData.gexFlipLevel.toFixed(0)} [${gexData.gexData.gammaEnvironment}]`, width - 10, y + 15);
    ctx.fillStyle = gexData.gexData.isPositiveGamma ? '#ff00ff' : '#ff8800';
    ctx.fillText(`ATTRACTION: $${gexData.gexData.gexFlipLevel.toFixed(0)} [${gexData.gexData.gammaEnvironment}]`, width - 10, y + 15);
    
    console.log(`🎯 Attraction Level rendered at $${gexData.gexData.gexFlipLevel} (${gexData.gexData.gammaEnvironment} Gamma)`);
  }

  // Process all walls to show NET GEX (calls and puts combined)
  const wallsByStrike = new Map();
  
  // Add call walls
  if (gexData.gexData.callWalls && gexData.gexData.callWalls.length > 0) {
    gexData.gexData.callWalls.forEach((wall: any) => {
      wallsByStrike.set(wall.strike, {
        strike: wall.strike,
        callGEX: wall.gex,
        putGEX: 0
      });
    });
  }
  
  // Add put walls (merge with existing strikes or create new)
  if (gexData.gexData.putWalls && gexData.gexData.putWalls.length > 0) {
    gexData.gexData.putWalls.forEach((wall: any) => {
      const existing = wallsByStrike.get(wall.strike);
      if (existing) {
        existing.putGEX = wall.gex;
      } else {
        wallsByStrike.set(wall.strike, {
          strike: wall.strike,
          callGEX: 0,
          putGEX: wall.gex
        });
      }
    });
  }
  
  // Calculate net GEX for each strike and find the highest
  const wallDataArray = Array.from(wallsByStrike.values()).map(wallData => ({
    ...wallData,
    netGEX: wallData.callGEX - wallData.putGEX,
    absNetGEX: Math.abs(wallData.callGEX - wallData.putGEX)
  }));
  
  // Find the strike with highest absolute NET GEX
  const highestGEXWall = wallDataArray.reduce((max, current) => 
    current.absNetGEX > max.absNetGEX ? current : max
  );
  
  // Render each wall
  wallDataArray.forEach((wallData) => {
    const isCallDominated = wallData.netGEX > 0;
    const isHighestGEX = wallData.strike === highestGEXWall.strike;
    
    const y = priceToY(wallData.strike);
    
    // Line thickness based on NET GEX strength
    const thickness = Math.max(1, Math.min(4, wallData.absNetGEX / 10000000000));
    
    // Color based on which side dominates
    const lineColor = isCallDominated ? '#22c55e' : '#ef4444';
    const textColor = isCallDominated ? '#00ff00' : '#ff0000';
    
    const wallType = isCallDominated ? 'Call Wall' : 'Put Wall';
    const sign = isCallDominated ? '+' : '-';
    
    // Special glow effect for highest GEX line - glow in appropriate color
    if (isHighestGEX) {
      // Draw glow effect with multiple passes in the appropriate color
      const glowColor = isCallDominated ? [34, 197, 94] : [239, 68, 68]; // RGB values
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(${glowColor[0]}, ${glowColor[1]}, ${glowColor[2]}, ${0.4 - i * 0.1})`;
        ctx.lineWidth = thickness + (3 - i) * 2;
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.5;
        
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width - 80, y);
        ctx.stroke();
      }
    }
    
    // Main line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = thickness;
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.8;
    
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width - 80, y);
    ctx.stroke();
    
    // Label with NET GEX value
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right';
    const yOffset = isCallDominated ? -5 : 15;
    const label = `${wallType}: $${wallData.strike.toFixed(0)} (${sign}${(wallData.absNetGEX / 1000000000).toFixed(1)}B)`;
    ctx.strokeText(label, width - 90, y + yOffset);
    ctx.fillStyle = textColor;
    ctx.fillText(label, width - 90, y + yOffset);
    
    console.log(`${isCallDominated ? '🟢' : '🔴'} ${wallType} rendered: $${wallData.strike} with NET ${wallData.netGEX.toFixed(0)} GEX ${isHighestGEX ? 'HIGHEST' : ''}`);
  });

  // Reset canvas state
  ctx.setLineDash([]);
  ctx.globalAlpha = 1.0;
  
  console.log(`📊 GEX levels rendered: ${gexData.gexData.callWalls?.length || 0} call walls, ${gexData.gexData.putWalls?.length || 0} put walls, zero gamma at $${gexData.gexData.zeroGammaLevel}`);
};

// Expansion/Liquidation Detection Algorithm
interface ExpansionLiquidationZone {
  type: 'expansion' | 'liquidation';
  rangeHigh: number; // High of the choppy range
  rangeLow: number; // Low of the choppy range
  candleOpen: number; // Open price of the breakout candle
  candleClose: number; // Close price of the breakout candle
  breakoutIndex: number;
  breakoutCandle: ChartDataPoint;
  isValid: boolean; // false if zone has been touched
  startIndex: number; // start of the choppy range
  endIndex: number; // end of the choppy range (before breakout)
}

// Detect choppy ranges (5-9+ days of tight trading)
const detectChoppyRanges = (data: ChartDataPoint[], minDays: number = 5, maxStdDev: number = 0.02): any[] => {
  const choppyRanges: any[] = [];
  
  for (let i = minDays; i < data.length - 1; i++) {
    // Look back for potential choppy period
    for (let lookback = minDays; lookback <= Math.min(9, i); lookback++) {
      const rangeData = data.slice(i - lookback + 1, i + 1);
      
      // Calculate range stats using CANDLE BODIES (open/close) not high/low
      const bodyHighs = rangeData.map(d => Math.max(d.open, d.close));
      const bodyLows = rangeData.map(d => Math.min(d.open, d.close));
      const closes = rangeData.map(d => d.close);
      
      const rangeHigh = Math.max(...bodyHighs);
      const rangeLow = Math.min(...bodyLows);
      const avgClose = closes.reduce((sum, close) => sum + close, 0) / closes.length;
      const rangePercent = (rangeHigh - rangeLow) / avgClose;
      
      // Check if this is a tight range (low volatility in candle bodies)
      if (rangePercent <= maxStdDev) {
        choppyRanges.push({
          startIndex: i - lookback + 1,
          endIndex: i,
          rangeHigh,
          rangeLow,
          avgClose,
          rangePercent,
          days: lookback
        });
        break; // Found a choppy range, move to next candle
      }
    }
  }
  
  return choppyRanges;
};

// Detect expansion/liquidation breakouts from choppy ranges
const detectExpansionLiquidation = (data: ChartDataPoint[]): ExpansionLiquidationZone[] => {
  const zones: ExpansionLiquidationZone[] = [];
  const choppyRanges = detectChoppyRanges(data);
  let lastZoneIndex = -1; // Track the last zone created to enforce cooldown
  
  console.log(`🔍 Found ${choppyRanges.length} choppy ranges to analyze`);
  
  choppyRanges.forEach((range, idx) => {
    const { startIndex, endIndex, rangeHigh, rangeLow } = range;
    
    // Check the candle immediately after the choppy range
    if (endIndex + 1 < data.length) {
      // COOLDOWN RULE: Must be at least 5 candles after the last zone
      if (lastZoneIndex !== -1 && (endIndex + 1) - lastZoneIndex < 5) {
        console.log(`❌ Skipping potential zone at index ${endIndex + 1} - too close to last zone at ${lastZoneIndex} (need 5+ candles gap)`);
        return;
      }
      
      const breakoutCandle = data[endIndex + 1];
      const { high, low, close, open } = breakoutCandle;
      
      // Check for breakout above range
      if (high > rangeHigh) {
        const type = close > rangeHigh ? 'expansion' : 'liquidation';
        zones.push({
          type,
          rangeHigh,
          rangeLow,
          candleOpen: open,
          candleClose: close,
          breakoutIndex: endIndex + 1,
          breakoutCandle,
          isValid: true,
          startIndex,
          endIndex
        });
        lastZoneIndex = endIndex + 1; // Update last zone position
        console.log(`📈 ${type.toUpperCase()} detected: Range $${rangeLow.toFixed(2)}-$${rangeHigh.toFixed(2)}, Candle: $${open.toFixed(2)} -> $${close.toFixed(2)}`);
      }
      // Check for breakdown below range
      else if (low < rangeLow) {
        const type = close < rangeLow ? 'expansion' : 'liquidation';
        zones.push({
          type,
          rangeHigh,
          rangeLow,
          candleOpen: open,
          candleClose: close,
          breakoutIndex: endIndex + 1,
          breakoutCandle,
          isValid: true,
          startIndex,
          endIndex
        });
        lastZoneIndex = endIndex + 1; // Update last zone position
        console.log(`📉 ${type.toUpperCase()} detected: Range $${rangeLow.toFixed(2)}-$${rangeHigh.toFixed(2)}, Candle: $${open.toFixed(2)} -> $${close.toFixed(2)}`);
      }
    }
  });
  
  return zones;
};

// Invalidate zones that have been touched by future price action
const invalidateTouchedZones = (zones: ExpansionLiquidationZone[], data: ChartDataPoint[]): ExpansionLiquidationZone[] => {
  return zones.map(zone => {
    if (!zone.isValid) return zone;
    
    // Check all candles after the breakout for touches
    for (let i = zone.breakoutIndex + 1; i < data.length; i++) {
      const candle = data[i];
      
      // Check if price touched the zone range
      if (candle.low <= zone.rangeHigh && candle.high >= zone.rangeLow) {
        console.log(`❌ Zone invalidated: ${zone.type} at index ${zone.breakoutIndex} touched by candle at index ${i}`);
        return { ...zone, isValid: false };
      }
    }
    
    return zone;
  });
};

// Render Expansion/Liquidation zone on chart
const renderExpansionLiquidationZone = (
  ctx: CanvasRenderingContext2D,
  zone: ExpansionLiquidationZone,
  allData: ChartDataPoint[],
  chartWidth: number,
  chartHeight: number,
  minPrice: number,
  maxPrice: number,
  startIndex: number,
  visibleCandleCount: number
) => {
  const candleSpacing = chartWidth / visibleCandleCount;
  
  // Calculate X positions - need to find the relative position within visible data
  const relativeBreakoutIndex = zone.breakoutIndex - startIndex;
  const zoneStartX = 40 + (relativeBreakoutIndex * candleSpacing);
  
  // Calculate the last candle position in the visible data
  const lastCandleIndex = allData.length - 1;
  const relativeLastCandleIndex = lastCandleIndex - startIndex;
  const lastCandleX = 40 + (relativeLastCandleIndex * candleSpacing);
  
  // Extend exactly 5 trading days from the last candlestick
  const fiveDaysExtension = 5 * candleSpacing;
  const zoneEndX = lastCandleX + fiveDaysExtension;
  
  // Calculate Y positions for the candle body (open and close)
  const priceToY = (price: number) => {
    return chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;
  };
  
  const openY = priceToY(zone.candleOpen);
  const closeY = priceToY(zone.candleClose);
  
  // Ensure we draw from top to bottom (higher price to lower price)
  const topY = Math.min(openY, closeY);
  const bottomY = Math.max(openY, closeY);
  
  // Color scheme based on zone type
  const isExpansion = zone.type === 'expansion';
  const lineColor = isExpansion ? '#00ff00' : '#ff0000'; // Green for expansion, red for liquidation
  const fillColor = isExpansion ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)'; // Semi-transparent fill
  
  // Draw the filled rectangle (channel background) - only the height of the candle body
  ctx.fillStyle = fillColor;
  ctx.fillRect(zoneStartX, topY, zoneEndX - zoneStartX, bottomY - topY);
  
  // Draw the top and bottom parallel lines at candle open and close
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  
  // Top line (higher price - either open or close)
  ctx.beginPath();
  ctx.moveTo(zoneStartX, topY);
  ctx.lineTo(zoneEndX, topY);
  ctx.stroke();
  
  // Bottom line (lower price - either open or close)
  ctx.beginPath();
  ctx.moveTo(zoneStartX, bottomY);
  ctx.lineTo(zoneEndX, bottomY);
  ctx.stroke();
  
  // Add price labels on the Y-axis (right side of chart)
  ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  
  // Get crispy text rendering
  ctx.textBaseline = 'middle';
  
  // Draw price label for top line with background
  const topPrice = Math.max(zone.candleOpen, zone.candleClose);
  const topPriceText = topPrice.toFixed(2);
  const topTextMetrics = ctx.measureText(topPriceText);
  const topTextWidth = topTextMetrics.width;
  const topTextHeight = 24; // Slightly larger than font size for padding
  
  // Draw background rectangle for top price
  ctx.fillStyle = lineColor;
  ctx.fillRect(chartWidth + 43, topY - topTextHeight/2, topTextWidth + 8, topTextHeight);
  
  // Draw white text on colored background
  ctx.fillStyle = '#ffffff';
  ctx.fillText(topPriceText, chartWidth + 47, topY);
  
  // Draw price label for bottom line with background
  const bottomPrice = Math.min(zone.candleOpen, zone.candleClose);
  const bottomPriceText = bottomPrice.toFixed(2);
  const bottomTextMetrics = ctx.measureText(bottomPriceText);
  const bottomTextWidth = bottomTextMetrics.width;
  const bottomTextHeight = 24; // Slightly larger than font size for padding
  
  // Draw background rectangle for bottom price
  ctx.fillStyle = lineColor;
  ctx.fillRect(chartWidth + 43, bottomY - bottomTextHeight/2, bottomTextWidth + 8, bottomTextHeight);
  
  // Draw white text on colored background
  ctx.fillStyle = '#ffffff';
  ctx.fillText(bottomPriceText, chartWidth + 47, bottomY);
  
  console.log(`📊 Drew ${zone.type} zone: Candle $${zone.candleOpen.toFixed(2)}-$${zone.candleClose.toFixed(2)} at X: ${zoneStartX.toFixed(1)}-${zoneEndX.toFixed(1)}`);
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
  const drawingsButtonRef = useRef<HTMLButtonElement>(null);



  // Chart state
  const [config, setConfig] = useState<ChartConfig>({
    symbol,
    timeframe: initialTimeframe,
    chartType: 'candlestick',
    theme: 'dark',
    drawings: [],
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
        bullish: '#00bfff',   // Bright blue for bullish volume
        bearish: '#ff0000'    // Bright red for bearish volume
      }
    }
  });

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);


  
  // Dropdown positioning state
  const [dropdownPositions, setDropdownPositions] = useState({
    indicators: { x: 0, y: 0, width: 0 }
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Lock state for drawing tools - when locked, tools stay active after placing a drawing
  const [isDrawingLocked, setIsDrawingLocked] = useState<boolean>(false);

  // Horizontal Ray Drawing Tool State
  const [isHorizontalRayMode, setIsHorizontalRayMode] = useState<boolean>(false);
  const [horizontalRays, setHorizontalRays] = useState<HorizontalRay[]>([]);
  const [selectedRay, setSelectedRay] = useState<string | null>(null);
  const [isDrawingsDropdownOpen, setIsDrawingsDropdownOpen] = useState<boolean>(false);
  const [isEditingRay, setIsEditingRay] = useState<boolean>(false);
  const [rayDragStart, setRayDragStart] = useState<{x: number, y: number, originalPrice: number} | null>(null);

  // Parallel Channel Dragging State
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [isEditingChannel, setIsEditingChannel] = useState<boolean>(false);
  const [channelDragStart, setChannelDragStart] = useState<{x: number, y: number, originalChannel: ParallelChannel} | null>(null);

  // Parallel Channels Drawing Tool State
  const [isParallelChannelMode, setIsParallelChannelMode] = useState<boolean>(false);
  const [parallelChannels, setParallelChannels] = useState<ParallelChannel[]>([]);
  const [currentChannelPoints, setCurrentChannelPoints] = useState<Array<{ timestamp: number; price: number }>>([]);
  const [channelDrawingStep, setChannelDrawingStep] = useState<number>(0); // 0: not started, 1: first line, 2: second line
  const [channelPreviewPoint, setChannelPreviewPoint] = useState<{ timestamp: number; price: number } | null>(null);
  const [lastPreviewUpdate, setLastPreviewUpdate] = useState<number>(0);
  const [clickDebugCount, setClickDebugCount] = useState<number>(0); // Debug: count clicks when in channel mode

  // Drawing Brush Tool State
  const [isDrawingBrushMode, setIsDrawingBrushMode] = useState<boolean>(false);
  const [drawingBrushes, setDrawingBrushes] = useState<DrawingBrush[]>([]);
  const drawingBrushesRef = useRef<DrawingBrush[]>([]);
  const [currentBrushStroke, setCurrentBrushStroke] = useState<Array<{ timestamp: number; price: number }>>([]);
  const [isBrushing, setIsBrushing] = useState<boolean>(false);
  const [lastBrushTime, setLastBrushTime] = useState<number>(0);
  const [isMousePressed, setIsMousePressed] = useState<boolean>(false);

  // Keep ref in sync with state for reliable access
  useEffect(() => {
    drawingBrushesRef.current = drawingBrushes;
  }, [drawingBrushes]);

  const [rayProperties, setRayProperties] = useState({
    color: '#FFD700',
    lineWidth: 2,
    lineStyle: 'solid' as const,
    extendLeft: true,
    extendRight: true,
    label: ''
  });

  // Parallel Channel Properties
  const [channelProperties, setChannelProperties] = useState({
    lineColor: '#00BFFF',
    lineWidth: 2,
    lineStyle: 'solid' as const,
    fillColor: '#00BFFF33', // Semi-transparent fill
    showFill: true,
    label: ''
  });

  // Tool management function to prevent multiple tools being active
  const clearAllDrawingTools = useCallback(() => {
    setIsHorizontalRayMode(false);
    setIsParallelChannelMode(false);
    setIsDrawingBrushMode(false);
    
    // Clear any in-progress drawings
    setCurrentChannelPoints([]);
    setCurrentBrushStroke([]);
    setIsBrushing(false);
    setLastBrushTime(0);
    setIsMousePressed(false);
    setChannelDrawingStep(0);
    setChannelPreviewPoint(null);
  }, []);

  const activateToolExclusively = useCallback((toolName: 'horizontal' | 'channel' | 'brush' | 'none') => {
    clearAllDrawingTools();
    
    switch (toolName) {
      case 'horizontal':
        setIsHorizontalRayMode(true);
        break;
      case 'channel':
        setIsParallelChannelMode(true);
        setClickDebugCount(0);
        break;
      case 'brush':
        setIsDrawingBrushMode(true);
        break;
      case 'none':
        // Already cleared all tools above
        break;
    }
  }, [clearAllDrawingTools]);

  // Professional crosshair information state
  const [crosshairInfo, setCrosshairInfo] = useState<{
    price: string;
    date: string;
    time: string;
    visible: boolean;
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
    ohlc: undefined
  });

  // Sidebar panel state
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<string | null>(null);
  const [watchlistTab, setWatchlistTab] = useState('Markets');
  const [regimesTab, setRegimesTab] = useState('Life');
  const [chatTab, setChatTab] = useState('announcements');
  const [chatView, setChatView] = useState('channels'); // 'channels' or 'hub'
  
  // Chat messages state for each channel
  const [chatMessages, setChatMessages] = useState<{[channel: string]: Array<{id: string, user: string, message: string, timestamp: Date, userType: string}>}>({
    // Start Here channels
    announcements: [
      {id: '1', user: 'SYSTEM ADMIN', message: '📢 Welcome to EFI Trading! New Volume Bars Feature Released - customize colors in chart settings.', timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), userType: 'admin'},
      {id: '2', user: 'MARKET ALERT', message: '🔔 Extended trading session tonight due to FOMC announcement. Adjust strategies accordingly.', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), userType: 'system'}
    ],
    testimonials: [
      {id: '1', user: 'TraderMike', message: '✅ Made $2,400 profit this week following the GEX levels! Thank you team!', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), userType: 'user'}
    ],
    'rules-disclaimers': [
      {id: '1', user: 'COMPLIANCE', message: '🔴 Please read all trading disclaimers before participating. Risk management is key!', timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), userType: 'admin'}
    ],
    'contact-us': [],
    'start-here-channel': [
      {id: '1', user: 'WELCOME BOT', message: '💎 New members start here! Check out our education materials first.', timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), userType: 'system'}
    ],
    // Education channels
    'live-recordings': [],
    lesson: [],
    application: [],
    'result-upload': [],
    'traders-code': [
      {id: '1', user: 'ZakTrades', message: '💚 Remember: Risk management > profit chasing. Stick to your plan!', timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), userType: 'admin'}
    ],
    'zaks-market-moves': [
      {id: '1', user: 'ZakTrades', message: '🎯 Watching SPY 650 resistance level closely. Volume confirmation needed for breakout.', timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), userType: 'admin'}
    ],
    // Market Insights channels
    cyclical: [],
    monthly: [],
    'chart-track-trade': [],
    'gex-ideas': [
      {id: '1', user: 'GEX_ANALYST', message: '🟢 Heavy call wall at SPY 655. Expecting resistance here.', timestamp: new Date(Date.now() - 30 * 60 * 1000), userType: 'admin'}
    ],
    'insiders-congress': [],
    'notable-flow': [
      {id: '1', user: 'FLOW_SCANNER', message: '⚡ Large SPY call sweep detected: 10,000 contracts at 650 strike!', timestamp: new Date(Date.now() - 15 * 60 * 1000), userType: 'system'}
    ],
    // Trade Center channels
    'dividend-portfolio': [],
    '100k-portfolio': [],
    '25k-portfolio': [],
    '5k-portfolio': [],
    'weekly-snapshot': [],
    'swing-trades': [
      {id: '1', user: 'SwingMaster', message: '✨ NVDA looking good for a bounce from 200 support level.', timestamp: new Date(Date.now() - 45 * 60 * 1000), userType: 'user'}
    ],
    'stock-chat': [],
    'flow-analyst': [],
    // Traders Den channels
    'feedback-hub': [],
    'all-flow': [],
    calendar: [],
    motiversity: [
      {id: '1', user: 'MotivationBot', message: '✨ "Success is not final, failure is not fatal: it is the courage to continue that counts." - Winston Churchill', timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), userType: 'system'}
    ],
    mentorship: [],
    'chill-chat': [
      {id: '1', user: 'CommunityMember', message: '📺 Anyone else excited for the weekend? Time to analyze this week\'s trades!', timestamp: new Date(Date.now() - 20 * 60 * 1000), userType: 'user'}
    ]
  });
  
  const [currentMessage, setCurrentMessage] = useState('');
  const [screenshots, setScreenshots] = useState<Array<{id: string, url: string, timestamp: Date, notes: string}>>([]);
  const [notes, setNotes] = useState<Array<{id: string, title: string, content: string, timestamp: Date, color: string}>>([]);
  const [reminders, setReminders] = useState<Array<{id: string, title: string, datetime: Date, completed: boolean}>>([]);
  
  // Chat functionality states
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{id: string, name: string, type: string, url: string, size: number}>>([]);

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

  // GEX state for gamma exposure levels
  const [isGexActive, setIsGexActive] = useState(false);
  
  // GEX data hook - fetch GEX data when active
  const { data: gexData, loading: isLoadingGex, error: gexError } = useGEXData(
    symbol, 
    isGexActive // Only auto-refresh when GEX is active
  );

  // Expansion/Liquidation indicator state
  const [isExpansionLiquidationActive, setIsExpansionLiquidationActive] = useState(false);
  const [expansionLiquidationZones, setExpansionLiquidationZones] = useState<any[]>([]);

  // C/P Flow indicator state
  const [isCPFlowActive, setIsCPFlowActive] = useState(false);
  const [cpFlowData, setCPFlowData] = useState<{
    timestamp: Date;
    callFlow: number;
    putFlow: number;
  }[]>([]);

  // Fetch real-time C/P Flow data from the SAME source as options flow page
  const fetchRealCPFlowData = useCallback(async () => {
    try {
      console.log(`🔄 DEBUG: Starting C/P Flow data fetch for ${symbol}...`);
      console.log(`🔄 DEBUG: Current timeframe is ${config.timeframe}`);
      console.log(`🔄 DEBUG: Using historical options flow API to get saved database data`);
      
      // Use the historical API to get the saved database data (same as what you see in the table)
      const todayStr = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/historical-options-flow?date=${todayStr}&ticker=ALL`);
      
      console.log(`🔄 DEBUG: API Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ DEBUG: API Error Response: ${errorText}`);
        throw new Error(`Failed to fetch options flow data: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`🔄 DEBUG: API Result:`, result);
      
      if (!result.success) {
        console.warn(`❌ DEBUG: API returned success=false. Error: ${result.error || 'Unknown error'}`);
        return [];
      }
      
      if (!result.trades || result.trades.length === 0) {
        console.warn('❌ DEBUG: No trades found in API response - NO FAKE DATA, returning empty array');
        return [];
      }
      
      console.log(`📊 DEBUG: Processing ${result.trades.length} real options flow trades for C/P Flow aggregation`);
      
      // Process trades into time-based C/P Flow data
      const trades = result.trades;
      
      // Filter trades by the current symbol (e.g., SPY, IWM, etc.)
      console.log(`📊 DEBUG: Raw API response contains ${trades.length} total trades`);
      console.log(`📊 DEBUG: Looking for symbol: "${symbol}"`);
      console.log(`📊 DEBUG: Sample trade structure:`, trades.slice(0, 2));
      
      // Get all unique underlying tickers to see what we have
      const uniqueTickers = [...new Set(trades.map((trade: any) => trade.underlying_ticker))];
      console.log(`📊 DEBUG: Available underlying tickers:`, uniqueTickers.slice(0, 10));
      
      const symbolTrades = trades.filter((trade: any) => {
        const match = trade.underlying_ticker === symbol || 
                     trade.ticker === symbol ||
                     trade.ticker?.startsWith(symbol) ||
                     trade.underlying_ticker?.toUpperCase() === symbol.toUpperCase();
        
        if (match) {
          console.log(`✅ DEBUG: Found matching trade:`, trade);
        }
        return match;
      });
      
      console.log(`📊 DEBUG: Filtered to ${symbolTrades.length} trades for ${symbol} out of ${trades.length} total trades`);
      
      if (symbolTrades.length === 0) {
        console.log(`🚨 DEBUG: No matches found. First few trades:`, trades.slice(0, 5).map((t: any) => ({
          underlying_ticker: t.underlying_ticker,
          ticker: t.ticker,
          type: t.type,
          total_premium: t.total_premium
        })));
      }
      
      if (symbolTrades.length === 0) {
        console.warn(`❌ DEBUG: No ${symbol} trades found in ${trades.length} total trades - returning empty array`);
        return [];
      }
      
      const todayDate = new Date();
      
      // STRICT market hours - 9:30 AM to 4:00 PM Eastern Time
      const marketOpen = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate(), 9, 30, 0, 0);
      const marketClose = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate(), 16, 0, 0, 0);
      
      // Create time intervals based on timeframe
      const intervalMinutes = config.timeframe === '5m' ? 1 : 3; // 1min for 5m chart, 3min for 30m chart
      const timeSlots = new Map<number, { callFlow: number; putFlow: number; timestamp: Date }>();
      
      // Initialize all time slots
      for (let time = new Date(marketOpen); time <= marketClose; time.setMinutes(time.getMinutes() + intervalMinutes)) {
        const slotKey = Math.floor(time.getTime() / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);
        timeSlots.set(slotKey, {
          callFlow: 0,
          putFlow: 0,
          timestamp: new Date(slotKey)
        });
      }
      
      // Aggregate SYMBOL-SPECIFIC trades into time slots
      symbolTrades.forEach((trade: any) => {
        const tradeTime = new Date(trade.trade_timestamp);
        
        // Only include trades within market hours
        if (tradeTime < marketOpen || tradeTime > marketClose) {
          return;
        }
        
        // Find the appropriate time slot
        const slotKey = Math.floor(tradeTime.getTime() / (intervalMinutes * 60 * 1000)) * (intervalMinutes * 60 * 1000);
        const slot = timeSlots.get(slotKey);
        
        if (slot) {
          const premium = trade.total_premium || 0;
          
          if (trade.type === 'call') {
            slot.callFlow += premium;
          } else if (trade.type === 'put') {
            slot.putFlow += premium;
          }
        }
      });
      
      // Convert to array and sort by timestamp
      const aggregatedData = Array.from(timeSlots.values())
        .filter(slot => slot.timestamp >= marketOpen && slot.timestamp <= marketClose)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      console.log(`✅ Generated ${aggregatedData.length} real C/P Flow data points from ${marketOpen.toLocaleTimeString()} to ${marketClose.toLocaleTimeString()}`);
      console.log(`📊 Sample data: Calls=${aggregatedData[0]?.callFlow.toLocaleString()}, Puts=${aggregatedData[0]?.putFlow.toLocaleString()}`);
      
      return aggregatedData;
      
    } catch (error) {
      console.error('❌ Error fetching real C/P Flow data:', error);
      
      // Fallback to empty data or show error
      return [];
    }
  }, [symbol, config.timeframe]);

  // Initialize real C/P Flow data when component mounts
  useEffect(() => {
    const loadInitialCPFlowData = async () => {
      const realData = await fetchRealCPFlowData();
      setCPFlowData(realData);
    };
    
    loadInitialCPFlowData();
  }, [fetchRealCPFlowData]);

  // Auto-deactivate C/P Flow if user switches to unsupported timeframe
  useEffect(() => {
    if (isCPFlowActive && config.timeframe !== '30m' && config.timeframe !== '5m') {
      setIsCPFlowActive(false);
      console.log('⚠️ C/P Flow indicator deactivated - unsupported timeframe');
    }
  }, [config.timeframe, isCPFlowActive]);

  // Auto-refresh C/P Flow data when active (every 30 seconds)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isCPFlowActive) {
      console.log('🔄 Starting C/P Flow auto-refresh (30s intervals)');
      intervalId = setInterval(async () => {
        const refreshedData = await fetchRealCPFlowData();
        setCPFlowData(refreshedData);
        console.log(`🔄 Auto-refreshed C/P Flow data: ${refreshedData.length} points`);
      }, 30000); // Refresh every 30 seconds
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        console.log('⏹️ Stopped C/P Flow auto-refresh');
      }
    };
  }, [isCPFlowActive, fetchRealCPFlowData]);

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
            
            const url = createApiUrl('/api/historical-data', {
              symbol,
              startDate,
              endDate
            });
            const response = await fetch(url);
            
            if (response.ok) {
              const result = await response.json();
              
              // Use any available data instead of requiring 21 points
              if (result?.results && Array.isArray(result.results) && result.results.length >= 1) {
                const data = result.results;
                const latest = data[data.length - 1];
                const currentPrice = latest.c; // close price
                
                console.log(`📊 ${symbol} - Data length: ${data.length}, Current price: ${currentPrice}`);
                
                // Calculate percentage changes safely - use available data points
                // Fallback to current price if insufficient historical data
                const dataLength = data.length;
                const price1DayAgo = dataLength >= 2 ? data[dataLength - 2]?.c : currentPrice;
                const price5DaysAgo = dataLength >= 6 ? data[dataLength - 6]?.c : (dataLength >= 2 ? data[0]?.c : currentPrice);
                const price13DaysAgo = dataLength >= 14 ? data[dataLength - 14]?.c : (dataLength >= 2 ? data[0]?.c : currentPrice);
                const price21DaysAgo = dataLength >= 22 ? data[dataLength - 22]?.c : (dataLength >= 2 ? data[0]?.c : currentPrice);

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
                console.warn(`⚠️ No sufficient data for ${symbol} - got ${result?.results?.length || 0} data points`);
              }
            } else {
              console.warn(`❌ Failed to fetch data for ${symbol}: HTTP ${response.status} ${response.statusText}`);
              if (response.status >= 500) {
                console.warn(`🔧 Server error for ${symbol} - this may be an API configuration issue`);
              } else if (response.status === 408) {
                console.warn(`⏱️ Timeout for ${symbol} - API response too slow`);
              }
            }
          } catch (symbolError) {
            console.warn(`❌ Error fetching data for ${symbol}:`, symbolError);
            if (symbolError instanceof Error && symbolError.message.includes('fetch')) {
              console.warn(`🌐 Network connection issue for ${symbol} - check if server is running on correct port`);
            }
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

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEmojiPicker) {
        const target = event.target as Element;
        if (!target.closest('.emoji-picker-container')) {
          setShowEmojiPicker(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  // Expected Range data loading - reset when symbol changes
  useEffect(() => {
    // Reset Expected Range levels when symbol changes
    if (expectedRangeLevels) {
      setExpectedRangeLevels(null);
    }
  }, [symbol]);

  // Initialize searchQuery with symbol when component loads or symbol changes
  useEffect(() => {
    setSearchQuery(symbol);
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
          console.log('🚀 CHART COMPONENT: Auto-starting Market Regime Analysis on component mount...');
          
          // Add explicit debugging in browser console
          window.MARKET_REGIMES_DEBUG = {
            status: 'starting',
            timestamp: new Date().toISOString()
          };
          
          // Create a progress tracker
          const progressCallback = (stage: string, progress: number) => {
            console.log(`📈 MARKET REGIMES PROGRESS: ${stage} (${progress}%)`);
            setRegimeLoadingStage(stage);
            setRegimeUpdateProgress(progress);
          };

          // Create a streaming callback to update results as they come in
          const streamCallback = (timeframe: string, data: TimeframeAnalysis) => {
            console.log(`📊 CHART: Streaming ${timeframe} timeframe results - ${data.industries.length} industries found`);
            setMarketRegimeData(prev => {
              const newData = {
                ...prev,
                [timeframe.toLowerCase()]: data
              } as MarketRegimeData;
              console.log(`💾 CHART: Updated Market Regime data state:`, newData);
              return newData;
            });
          };

          console.log('🔄 CHART: Calling IndustryAnalysisService.getMarketRegimeDataStreaming...');
          
          // Add timeout to prevent infinite loading - increased for full dataset
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Market regime analysis timeout after 3 minutes'));
            }, 180000); // 3 minute timeout for full dataset
          });
          
          const regimeData = await Promise.race([
            IndustryAnalysisService.getMarketRegimeDataStreaming(progressCallback, streamCallback),
            timeoutPromise
          ]);
          console.log('📦 CHART: Received final regime data:', regimeData);
          
          // Add explicit debugging in browser console
          window.MARKET_REGIMES_DEBUG = {
            status: 'completed',
            timestamp: new Date().toISOString(),
            data: regimeData,
            lifeIndustries: regimeData?.life?.industries?.length || 0,
            developingIndustries: regimeData?.developing?.industries?.length || 0,
            momentumIndustries: regimeData?.momentum?.industries?.length || 0
          };
          
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
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          
          if (errorMessage.includes('Failed to fetch') || errorMessage.includes('CONNECTION_REFUSED')) {
            setRegimeLoadingStage('Server connection failed - ensure dev server is running');
          } else if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
            setRegimeLoadingStage('Analysis timeout - server may be overloaded');
          } else {
            setRegimeLoadingStage('Error loading data - check console for details');
          }
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
  const chartHeight = dimensions.height;

  // Overlay effect for other drawings only (not rays - they're now on main canvas)
  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return;

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    // Clear overlay 
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // Draw other drawings (but NOT horizontal rays - they're on main canvas now)
    if (drawings.length > 0) {
      drawStoredDrawings(ctx);
    }
  }, [drawings]);

  // TradingView-style color scheme (dynamic based on theme)
  const colors = {
    background: config.theme === 'dark' ? '#000000' : '#ffffff',
    grid: config.theme === 'dark' ? '#1a1a1a' : '#e1e4e8',
    text: config.theme === 'dark' ? '#ffffff' : '#000000',
    textSecondary: config.theme === 'dark' ? '#999999' : '#6a737d',
    bullish: config.colors.bullish.body,
    bearish: config.colors.bearish.body,
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
            // REMOVED RESTRICTION: Allow full future periods instead of limiting to 20% of visible candles
            const maxFuturePeriods = futurePeriods; // Use full future periods for TradingView-like scrolling
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
      
      // Use Polygon API directly for real-time price instead of custom endpoint
      const polygonUrl = `https://api.polygon.io/v2/last/trade/${sym}?apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
      const response = await fetch(polygonUrl);
      const result = await response.json();
      
      console.log(`🔵 LIVE: Polygon API response for ${sym}:`, result);
      
      if (response.ok && result.status === 'OK' && result.results?.p) {
        const livePrice = result.results.p; // Polygon's last trade price
        console.log(`💰 LIVE PRICE: ${sym} = $${livePrice}`);
        setCurrentPrice(livePrice);
        
        // For price change calculation, use current dates - NOT HARDCODED
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const histUrl = createApiUrl('/api/historical-data', {
          symbol: sym,
          startDate: yesterdayStr,
          endDate: todayStr,
          timeframe: '1d',
          _t: Date.now().toString()
        });
        const histResponse = await fetch(histUrl);
        if (histResponse.ok) {
          const histResult = await histResponse.json();
          if (histResult?.results && histResult.results.length >= 2) {
            const current = livePrice;
            const previous = histResult.results[histResult.results.length - 2]?.c || current;
            const change = current - previous;
            const changePercent = ((change) / previous) * 100;
            setPriceChange(change);
            setPriceChangePercent(changePercent);
            console.log(`📈 CHANGE: ${sym} ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`);
          }
        }
      } else {
        console.log(`⚠️ No live trade data for ${sym}, trying last close price...`);
        
        // Fallback: Try to get the most recent close price from daily data
        const fallbackUrl = `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
        try {
          const fallbackResponse = await fetch(fallbackUrl);
          const fallbackResult = await fallbackResponse.json();
          
          if (fallbackResult.status === 'OK' && fallbackResult.results?.[0]?.c) {
            const closePrice = fallbackResult.results[0].c;
            console.log(`📊 FALLBACK: Using previous close price for ${sym}: $${closePrice}`);
            setCurrentPrice(closePrice);
          } else {
            console.error(`❌ Failed to get fallback price for ${sym}:`, fallbackResult);
          }
        } catch (fallbackError) {
          console.error(`❌ Fallback price fetch failed for ${sym}:`, fallbackError);
        }
      }
    } catch (error) {
      console.error('❌ Real-time price fetch failed:', error);
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          console.error('🌐 Network connection issue - check if server is running on correct port');
        } else if (error.message.includes('timeout')) {
          console.error('⏱️ Request timeout - API response too slow');
        }
      }
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

  // ULTRA-FAST data fetching with advanced caching and optimization
  const fetchData = useCallback(async (sym: string, timeframe: string) => {
    console.log(`🚀 ULTRA-FAST FETCH: ${sym} ${timeframe}`);
    const startTime = performance.now();
    
    setLoading(true);
    setError(null);
    
    try {
      // FORCE FRESH DATA: Clear cache for volume data
      const cache = ChartDataCache.getInstance();
      
      // Clear cache for this symbol to force fresh data with volume
      console.log('🔄 FORCING FRESH DATA: Clearing cache for volume support');
      if (cache.clear) {
        cache.clear();
      }
      
      // Skip cache check - always fetch fresh data for volume
      console.log('� BYPASSING CACHE: Fetching fresh data with volume support');
      
      // Not in cache - use optimized API fetch with smart batching
      const data = await cache.getOrFetch(sym, timeframe, async () => {
        console.log(`📡 API FETCH: ${sym} ${timeframe}`);
        
        // Calculate optimized date range for ultra-fast loading
        const now = new Date();
        const endDate = now.toISOString().split('T')[0];
        
        // Use proper TradingView timeframe lookback periods for full historical data
        const timeframeConfig = TRADINGVIEW_TIMEFRAMES.find(tf => tf.value === timeframe);
        const daysBack = timeframeConfig?.lookback || 365; // Default to 1 year if not found
        const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000))
          .toISOString().split('T')[0];
        
        console.log(`📈 FULL HISTORICAL RANGE: ${sym} ${timeframe} - ${daysBack} days (${startDate} to ${endDate})`);
        
        // Ultra-fast API call with aggressive cache busting (force fresh data for volume)
        const response = await fetch(
          `/api/historical-data?symbol=${sym}&startDate=${startDate}&endDate=${endDate}&timeframe=${timeframe}&ultrafast=true&forceRefresh=true&_t=${Date.now()}`
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Debug: Check what data we're actually getting from API in main fetch
        console.log('🔍 MAIN API DATA DEBUG:', {
          symbol: sym,
          timeframe,
          totalResults: result.results?.length || 0,
          firstResult: result.results?.[0],
          firstResultKeys: Object.keys(result.results?.[0] || {}),
          hasVolumeField: result.results?.[0]?.v !== undefined,
          volumeValue: result.results?.[0]?.v,
          volumeType: typeof result.results?.[0]?.v,
          allVolumeValues: result.results?.slice(0, 10).map((item: any, i: number) => ({ index: i, v: item.v, type: typeof item.v })) || []
        });
        
        // Check if ALL volume values are 0 or undefined
        const allVolumes = result.results?.map((item: any) => item.v).filter((v: any) => v !== undefined && v !== null) || [];
        const nonZeroVolumes = allVolumes.filter((v: any) => v > 0);
        console.log('🔍 VOLUME ANALYSIS:', {
          totalItems: result.results?.length || 0,
          itemsWithVolumeField: allVolumes.length,
          itemsWithNonZeroVolume: nonZeroVolumes.length,
          maxVolume: nonZeroVolumes.length > 0 ? Math.max(...nonZeroVolumes) : 'NONE',
          minVolume: nonZeroVolumes.length > 0 ? Math.min(...nonZeroVolumes) : 'NONE',
          avgVolume: nonZeroVolumes.length > 0 ? (nonZeroVolumes.reduce((a: any, b: any) => a + b, 0) / nonZeroVolumes.length).toFixed(0) : 'NONE'
        });
        
        if (!result?.results?.length) {
          throw new Error(`No data available for ${sym}`);
        }
        
        // BLAZING FAST data transformation with pre-allocated arrays
        const rawData = result.results;
        const dataLength = rawData.length;
        const transformedData = new Array(dataLength);
        
        // Single-pass transformation for maximum speed
        for (let i = 0; i < dataLength; i++) {
          const item = rawData[i];
          transformedData[i] = {
            timestamp: item.t,
            open: item.o,
            high: item.h,
            low: item.l,
            close: item.c,
            volume: item.v || 0, // ADD VOLUME FIELD!
            date: new Date(item.t).toISOString().split('T')[0],
            time: new Date(item.t).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit', 
              hour12: false 
            })
          };
          
          // Debug first few items
          if (i < 3) {
            console.log(`🔍 MAIN MAPPING ITEM ${i}:`, {
              rawVolume: item.v,
              mappedVolume: transformedData[i].volume,
              mappedKeys: Object.keys(transformedData[i])
            });
          }
        }
        
        return transformedData;
      });
      
      // Set data and complete loading
      setData(data);
      
      // Initialize scroll position to show most recent candles (not 2016!)
      const defaultVisible = Math.min(200, data.length); // Show up to 200 candles initially
      setScrollOffset(Math.max(0, data.length - defaultVisible));
      
      setLoading(false);
      
      const loadTime = performance.now() - startTime;
      console.log(`🏁 ULTRA-FAST COMPLETE: ${sym} ${timeframe} - ${loadTime.toFixed(2)}ms (${data.length} points)`);
      
      // SMART PREFETCHING for related symbols and timeframes
      setTimeout(() => {
        const relatedSymbols = getRelatedSymbols(sym);
        const otherTimeframes = ['1d', '1h', '5m'].filter(tf => tf !== timeframe);
        
        // Prefetch other timeframes for current symbol
        otherTimeframes.forEach(tf => {
          cache.getOrFetch(sym, tf, () => fetchSymbolData(sym, tf)).catch(() => {});
        });
        
        // Prefetch current timeframe for related symbols
        relatedSymbols.slice(0, 2).forEach(relSym => {
          cache.getOrFetch(relSym, timeframe, () => fetchSymbolData(relSym, timeframe)).catch(() => {});
        });
      }, 100);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ ULTRA-FAST FETCH FAILED: ${sym} ${timeframe}:`, errorMessage);
      setError(`Failed to load ${timeframe} data for ${sym}: ${errorMessage}`);
      setData([]);
      setLoading(false);
    }
  }, []);

  // Helper function to get related symbols for smart prefetching
  const getRelatedSymbols = (symbol: string): string[] => {
    const symbolGroups: Record<string, string[]> = {
      'SPY': ['QQQ', 'IWM'],
      'QQQ': ['SPY', 'TQQQ'],
      'IWM': ['SPY', 'QQQ'],
      'AAPL': ['MSFT', 'GOOGL'],
      'MSFT': ['AAPL', 'NVDA'],
      'NVDA': ['AMD', 'MSFT'],
      'TSLA': ['AAPL', 'NVDA'],
      'GOOGL': ['AAPL', 'MSFT'],
      'AMZN': ['AAPL', 'MSFT'],
      'META': ['GOOGL', 'AAPL'],
      'GM': ['F', 'TSLA'],
      'F': ['GM', 'TSLA']
    };
    
    return symbolGroups[symbol.toUpperCase()] || [];
  };

  // Helper function for individual symbol data fetching
  const fetchSymbolData = async (symbol: string, timeframe: string) => {
    const now = new Date();
    const endDate = now.toISOString().split('T')[0];
    
    // Use proper TradingView timeframe lookback periods for full historical data
    const timeframeConfig = TRADINGVIEW_TIMEFRAMES.find(tf => tf.value === timeframe);
    const daysBack = timeframeConfig?.lookback || 365; // Default to 1 year if not found
    const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000))
      .toISOString().split('T')[0];
    
    const response = await fetch(
      `/api/historical-data?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}&timeframe=${timeframe}&prefetch=true`
    );
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const result = await response.json();
    if (!result?.results?.length) throw new Error(`No data for ${symbol}`);
    
    // Debug: Check what data we're actually getting from API
    console.log('🔍 API DATA DEBUG:', {
      symbol,
      timeframe,
      totalResults: result.results.length,
      firstResult: result.results[0],
      firstResultKeys: Object.keys(result.results[0] || {}),
      hasVolumeField: result.results[0]?.v !== undefined,
      volumeValue: result.results[0]?.v,
      allVolumeValues: result.results.slice(0, 5).map((item: any) => item.v)
    });
    
    const mappedData = result.results.map((item: any, index: number) => {
      const mapped = {
        timestamp: item.t,
        open: item.o,
        high: item.h,
        low: item.l,
        close: item.c,
        volume: item.v || 0,
        date: new Date(item.t).toISOString().split('T')[0],
        time: new Date(item.t).toLocaleTimeString('en-US', { 
          hour: '2-digit', minute: '2-digit', hour12: false 
        })
      };
      
      // Debug first few items
      if (index < 3) {
        console.log(`🔍 MAPPING ITEM ${index}:`, {
          rawItem: item,
          rawKeys: Object.keys(item),
          rawVolume: item.v,
          mappedVolume: mapped.volume,
          mappedKeys: Object.keys(mapped)
        });
      }
      
      return mapped;
    });
    
    // Debug: Check mapped data
    console.log('🔍 MAPPED DATA DEBUG:', {
      firstMappedItem: mappedData[0],
      hasVolumeAfterMapping: mappedData[0]?.volume !== undefined,
      volumeAfterMapping: mappedData[0]?.volume
    });
    
    return mappedData;
  };

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
      

      
      if (showToolsDropdown && !target.closest('.tools-dropdown')) {
        setShowToolsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showToolsDropdown]);

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
      // Enhanced crosshair for parallel channel mode with more precision
      if (isParallelChannelMode) {
        // More visible crosshair lines for drawing mode
        ctx.strokeStyle = config.theme === 'dark' ? '#00BFFF' : '#0066CC';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
      } else {
        ctx.strokeStyle = config.theme === 'dark' ? '#555555' : '#cccccc';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
      }

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

      // Add precision center dot for parallel channel mode
      if (isParallelChannelMode) {
        ctx.fillStyle = config.theme === 'dark' ? '#00BFFF' : '#0066CC';
        ctx.beginPath();
        ctx.arc(crosshairPosition.x, crosshairPosition.y, 3, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add small ring around the dot for better visibility
        ctx.strokeStyle = config.theme === 'dark' ? '#FFFFFF' : '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(crosshairPosition.x, crosshairPosition.y, 4, 0, 2 * Math.PI);
        ctx.stroke();
      }

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
  }, [dimensions, config.crosshair, config.theme, crosshairPosition, crosshairInfo, isBoxZooming, boxZoomStart, boxZoomEnd, isParallelChannelMode]);

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
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          // Delete selected ray or channel
          if (selectedRay) {
            setHorizontalRays(prev => prev.filter(ray => ray.id !== selectedRay));
            setSelectedRay(null);
            setIsEditingRay(false);
            setRayDragStart(null);
          } else if (selectedChannel) {
            setParallelChannels(prev => prev.filter(channel => channel.id !== selectedChannel));
            setSelectedChannel(null);
            setIsEditingChannel(false);
            setChannelDragStart(null);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data.length, scrollOffset, visibleCandleCount, selectedRay, selectedChannel]);

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
          // REMOVED RESTRICTION: Allow full future periods for TradingView-like zoom scrolling
          const maxFuturePeriods = futurePeriods; // Use full future periods
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
          // REMOVED RESTRICTION: Allow full future periods for extensive right scrolling
          const maxFuturePeriods = futurePeriods; // Use full future periods
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

  // Render main price chart
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

    // Calculate chart areas - reserve space for volume and time axis
    const timeAxisHeight = 25;
    const volumeAreaHeight = 80; // Reserve space for volume bars
    const cpFlowPaneHeight = 320; // Reserve space for C/P Flow indicator (quadrupled height for better visibility)
    
    // Adjust price chart height based on active indicators
    const totalBottomSpace = volumeAreaHeight + timeAxisHeight + (isCPFlowActive ? cpFlowPaneHeight : 0);
    const priceChartHeight = height - totalBottomSpace;

    // Draw grid first for price chart area (only if enabled)
    if (config.showGrid) {
      drawGrid(ctx, width, priceChartHeight);
    }

    // Calculate visible data range using scrollOffset and visibleCandleCount
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    
    // 🚨 CRITICAL DEBUG: Check actual data before slicing
    console.log('🚨 PRE-SLICE DEBUG:', {
      actualDataLength: data.length,
      startIndex,
      endIndex,
      scrollOffset,
      visibleCandleCount,
      wouldSliceFromIndex: startIndex,
      wouldSliceToIndex: endIndex,
      isStartBeyondData: startIndex >= data.length,
      isEndBeyondData: endIndex > data.length,
      lastRealDataIndex: data.length - 1
    });
    
    const visibleData = data.slice(startIndex, endIndex);
    
    // 🚨 CRITICAL DEBUG: Check what we actually got
    console.log('🚨 POST-SLICE DEBUG:', {
      visibleDataLength: visibleData.length,
      firstCandle: visibleData[0] ? {
        timestamp: new Date(visibleData[0].timestamp).toISOString(),
        ohlc: `${visibleData[0].open}/${visibleData[0].high}/${visibleData[0].low}/${visibleData[0].close}`
      } : 'undefined',
      lastCandle: visibleData[visibleData.length - 1] ? {
        timestamp: new Date(visibleData[visibleData.length - 1].timestamp).toISOString(),
        ohlc: `${visibleData[visibleData.length - 1].open}/${visibleData[visibleData.length - 1].high}/${visibleData[visibleData.length - 1].low}/${visibleData[visibleData.length - 1].close}`
      } : 'undefined'
    });
    
    // ENHANCED: Handle future scrolling beyond actual data
    const beyondDataOffset = Math.max(0, scrollOffset + visibleCandleCount - data.length);
    const showingFutureSpace = beyondDataOffset > 0;
    
    if (visibleData.length === 0 && !showingFutureSpace) return;

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
      
      // ENHANCED: Draw future space grid when scrolled beyond actual data
      if (showingFutureSpace && beyondDataOffset > 0) {
        const futureStartX = Math.round(40 + (visibleData.length * candleSpacing));
        const futureWidth = width - futureStartX - 80; // Leave space for Y-axis
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

    // Draw GEX levels on top of candlesticks (standalone button)
    if (isGexActive && gexData) {
      console.log('📊 Rendering GEX levels on top of chart');
      renderGEXLevels(
        ctx,
        chartWidth,
        priceChartHeight,
        adjustedMin,
        adjustedMax,
        gexData
      );
      console.log('📊 GEX levels rendered on top');
    }

    // Draw Expansion/Liquidation zones (standalone button)
    if (isExpansionLiquidationActive) {
      console.log('🎯 Detecting and rendering Expansion/Liquidation zones');
      
      // Get all data for zone detection (not just visible data)
      const allZones = detectExpansionLiquidation(data);
      const validZones = invalidateTouchedZones(allZones, data);
      
      // Update state with current zones
      setExpansionLiquidationZones(validZones);
      
      // Render zones that are in the visible range (using the same startIndex and endIndex as candlesticks)
      validZones.forEach(zone => {
        if (!zone.isValid) return;
        
        // Check if zone breakout is in visible range
        if (zone.breakoutIndex >= startIndex && zone.breakoutIndex <= endIndex + 50) {
          renderExpansionLiquidationZone(
            ctx,
            zone,
            data,
            chartWidth,
            priceChartHeight,
            adjustedMin,
            adjustedMax,
            startIndex,
            visibleCandleCount
          );
        }
      });
      
      console.log(`🎯 Rendered ${validZones.filter(z => z.isValid).length} valid zones`);
    }





    // Draw C/P Flow indicator above volume (if active)
    console.log(`🔄 DEBUG: Chart render - isCPFlowActive=${isCPFlowActive}, cpFlowData.length=${cpFlowData.length}`);
    
    if (isCPFlowActive && cpFlowData.length > 0) {
      console.log(`📊 DEBUG: Drawing C/P Flow indicator with ${cpFlowData.length} data points`);
      const cpFlowPaneHeight = 320; // Much taller indicator pane
      drawCPFlowIndicator(ctx, cpFlowData, chartWidth, priceChartHeight, cpFlowPaneHeight, config);
      // Adjust volume position down to make room for C/P Flow pane
      drawVolumeProfile(ctx, visibleData, chartWidth, priceChartHeight + cpFlowPaneHeight, visibleCandleCount, volumeAreaHeight, timeAxisHeight, config);
      console.log(`✅ DEBUG: C/P Flow indicator drawn successfully`);
    } else {
      if (isCPFlowActive) {
        console.log(`⚠️ DEBUG: C/P Flow is active but no data available (${cpFlowData.length} points)`);
      }
      // Draw volume bars above the time axis (TradingView style)
      drawVolumeProfile(ctx, visibleData, chartWidth, priceChartHeight, visibleCandleCount, volumeAreaHeight, timeAxisHeight, config);
    }

    // Draw time axis at the bottom
    drawTimeAxis(ctx, width, height, visibleData, chartWidth, visibleCandleCount, scrollOffset, data);



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

  }, [data, dimensions, chartHeight, config.chartType, config.theme, config.showGrid, config.axisStyle, colors, scrollOffset, visibleCandleCount, drawings]);

  // Draw volume bars above the x-axis (TradingView style)
  const drawVolumeProfile = (
    ctx: CanvasRenderingContext2D,
    visibleData: ChartDataPoint[],
    chartWidth: number,
    priceChartHeight: number,
    visibleCandleCount: number,
    volumeAreaHeight: number = 80,
    timeAxisHeight: number = 25,
    config: ChartConfig
  ) => {
    // Early return if no data or no volume data
    if (!visibleData.length) return;

    // Calculate volume profile area - dedicated space between price chart and time axis
    const volumeStartY = priceChartHeight;
    const volumeEndY = priceChartHeight + volumeAreaHeight;
    
    // Draw subtle volume background area
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(40, volumeStartY, chartWidth - 80, volumeAreaHeight);

    // Find max volume for scaling
    const volumes = visibleData.map(d => d.volume || 0).filter(v => v > 0);
    
    // ALWAYS log volume data check for debugging
    console.log('🎵 VOLUME DATA CHECK:', {
      totalCandles: visibleData.length,
      volumesFound: volumes.length,
      firstCandleFullData: visibleData[0],
      dataKeys: visibleData[0] ? Object.keys(visibleData[0]) : 'NO_DATA',
      maxVolume: volumes.length > 0 ? Math.max(...volumes) : 'NO_VOLUMES',
      firstFewCandlesWithVolume: visibleData.slice(0, 3).map(d => ({ 
        timestamp: new Date(d.timestamp).toISOString().slice(11, 19),
        volume: d.volume,
        hasVolume: d.hasOwnProperty('volume'),
        volumeType: typeof d.volume
      }))
    });
    
    // Check for real volume data first
    let maxVolume;
    let useTestData = false;
    
    if (volumes.length === 0) {
      console.log('🚨 NO VOLUME DATA DETECTED - Check API response above');
      console.log('🎵 Falling back to test data for now');
      maxVolume = 2000000; // 2M test max for more realistic scaling
      useTestData = true;
    } else {
      console.log('✅ REAL VOLUME DATA FOUND!', { volumeCount: volumes.length, maxVolume: Math.max(...volumes) });
      maxVolume = Math.max(...volumes);
    }
    
    const candleSpacing = chartWidth / visibleCandleCount;
    const candleWidth = Math.max(1, candleSpacing * 0.8);

    // Draw subtle volume border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, volumeStartY, chartWidth - 80, volumeAreaHeight);

    // Draw volume bars
    visibleData.forEach((candle, index) => {
      const x = Math.round(40 + (index * candleSpacing) + (candleSpacing - candleWidth) / 2);
      
      // Use real volume or generate test volume
      let volumeValue;
      if (useTestData) {
        // Generate realistic volume based on price movement and candle type
        const priceRange = Math.abs(candle.high - candle.low);
        const avgPrice = (candle.high + candle.low) / 2;
        const bodySize = Math.abs(candle.close - candle.open);
        
        // Base volume with some randomness
        let baseVolume = (Math.random() * 0.4 + 0.3) * maxVolume; // 30-70% of max
        
        // Increase volume for larger price movements
        const volatilityMultiplier = 1 + (priceRange / avgPrice) * 2;
        
        // Increase volume for larger candle bodies (more decisive moves)
        const bodyMultiplier = 1 + (bodySize / priceRange) * 0.5;
        
        volumeValue = baseVolume * volatilityMultiplier * bodyMultiplier;
        
        // Add some random spikes for realism (10% chance of high volume)
        if (Math.random() < 0.1) {
          volumeValue *= (Math.random() * 1.5 + 1.5); // 1.5x to 3x spike
        }
        
        volumeValue = Math.min(volumeValue, maxVolume); // Cap at max
      } else {
        volumeValue = candle.volume;
        if (!volumeValue || volumeValue <= 0) return; // Skip if no real volume
      }
      
      const volumeHeight = (volumeValue / maxVolume) * volumeAreaHeight;
      const barY = volumeEndY - volumeHeight;

      // Color volume bars based on price movement and user settings
      const isGreen = candle.close > candle.open;
      const volumeColor = isGreen ? config.colors.volume.bullish : config.colors.volume.bearish;
      
      // Convert hex to rgba with transparency
      const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };
      
      ctx.fillStyle = hexToRgba(volumeColor, 0.7);

      // Draw volume bar
      ctx.fillRect(x, barY, Math.round(candleWidth), volumeHeight);

      // Add subtle border to volume bars for better definition
      ctx.strokeStyle = hexToRgba(volumeColor, 0.9);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, barY, Math.round(candleWidth), volumeHeight);
    });

    // Draw volume scale labels on the right
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';

    // Draw volume labels (3 levels: 0, 50%, 100%)
    for (let i = 0; i <= 2; i++) {
      const volumeLevel = (maxVolume / 2) * i;
      const y = volumeEndY - (i * volumeAreaHeight / 2);
      
      // Format volume for display
      let volumeText = '';
      if (volumeLevel >= 1000000) {
        volumeText = `${(volumeLevel / 1000000).toFixed(1)}M`;
      } else if (volumeLevel >= 1000) {
        volumeText = `${(volumeLevel / 1000).toFixed(1)}K`;
      } else {
        volumeText = volumeLevel.toFixed(0);
      }

      ctx.fillText(volumeText, chartWidth - 35, y + 3);
      
      // Draw tick mark
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(chartWidth - 40, y);
      ctx.lineTo(chartWidth - 35, y);
      ctx.stroke();
    }

    // Add volume label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Volume', 45, volumeStartY + 15);
  };

  // Draw C/P Flow indicator pane
  const drawCPFlowIndicator = (
    ctx: CanvasRenderingContext2D,
    flowData: { timestamp: Date; callFlow: number; putFlow: number }[],
    chartWidth: number,
    priceChartHeight: number,
    paneHeight: number,
    config: ChartConfig
  ) => {
    console.log(`🎨 DEBUG: drawCPFlowIndicator called with ${flowData.length} data points`);
    console.log(`🎨 DEBUG: Chart dimensions - width: ${chartWidth}, priceHeight: ${priceChartHeight}, paneHeight: ${paneHeight}`);
    
    const startY = priceChartHeight;
    const endY = priceChartHeight + paneHeight;
    const leftMargin = 70; // Increased from 40 to 70 to accommodate Y-axis labels
    const rightMargin = 40;
    const plotWidth = chartWidth - leftMargin - rightMargin;
    
    console.log(`🎨 DEBUG: Pane area - startY: ${startY}, endY: ${endY}, plotWidth: ${plotWidth}`);
    
    // Draw pane background - pure black
    ctx.fillStyle = '#000000';
    ctx.fillRect(leftMargin, startY, plotWidth, paneHeight);
    
    // Draw pane border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(leftMargin, startY, plotWidth, paneHeight);
    
    console.log(`🎨 DEBUG: Background and border drawn`);
    
    if (flowData.length === 0) {
      console.log(`⚠️ DEBUG: No flow data to draw, exiting`);
      return;
    }
    
    // Find min/max values for Y-axis scaling
    const allFlows = flowData.flatMap(d => [d.callFlow, d.putFlow]);
    const minFlow = Math.min(...allFlows);
    const maxFlow = Math.max(...allFlows);
    const flowRange = maxFlow - minFlow;
    
    // Create Y-axis scale function with more padding for taller pane
    const scaleY = (value: number) => {
      const normalized = (value - minFlow) / flowRange;
      return startY + paneHeight - (normalized * (paneHeight - 60)); // 30px margin top/bottom for taller pane
    };
    
    // Draw Y-axis labels (dollar amounts) - Enhanced white crispy text
    ctx.fillStyle = '#ffffff'; // Pure white for maximum contrast
    ctx.font = 'bold 12px Arial'; // Bigger, bolder font
    ctx.textAlign = 'right';
    
    // Draw 6 Y-axis labels for better granularity
    for (let i = 0; i <= 5; i++) {
      const value = minFlow + (flowRange * i / 5);
      const y = scaleY(value);
      const label = value >= 1000000000 ? `$${(value / 1000000000).toFixed(1)}B` : `$${(value / 1000000).toFixed(0)}M`;
      
      // Add text shadow for crispness
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.shadowBlur = 2;
      
      ctx.fillText(label, leftMargin - 10, y + 4); // More space from the edge
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
      
      // Draw tick mark - brighter and thicker
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(leftMargin - 10, y);
      ctx.lineTo(leftMargin, y);
      ctx.stroke();
    }
    
    // Create time scale - STRICT market hours only (9:30 AM - 4:00 PM)
    const today = new Date();
    const marketOpen = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 30, 0, 0);
    const marketClose = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 0, 0, 0);
    
    const timeRange = marketClose.getTime() - marketOpen.getTime(); // Exactly 6.5 hours
    const scaleX = (timestamp: Date) => {
      const timeFromOpen = timestamp.getTime() - marketOpen.getTime();
      // Clamp to market hours only - no pre/post market data
      const normalized = Math.max(0, Math.min(1, timeFromOpen / timeRange));
      return Math.round(leftMargin + (normalized * plotWidth)); // Round for crispy positioning
    };
    
    // Enable anti-aliasing for crispy lines
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Draw Call Flow line (green) - 100% opacity, crispy
    ctx.strokeStyle = '#00ff00'; // Pure green, 100% opacity
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    flowData.forEach((point, index) => {
      const x = Math.round(scaleX(point.timestamp)); // Round for crispy pixels
      const y = Math.round(scaleY(point.callFlow));
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    // Draw Put Flow line (red) - 100% opacity, crispy
    ctx.strokeStyle = '#ff0000'; // Pure red, 100% opacity
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    flowData.forEach((point, index) => {
      const x = Math.round(scaleX(point.timestamp)); // Round for crispy pixels
      const y = Math.round(scaleY(point.putFlow));
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    // Add title in center - Enhanced white crispy text
    ctx.fillStyle = '#ffffff'; // Pure white
    ctx.font = 'bold 14px Arial'; // Bigger title
    ctx.textAlign = 'center'; // Center alignment
    
    // Add text shadow for title
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 2;
    
    // Center the title in the middle of the plot area
    const centerX = leftMargin + (plotWidth / 2);
    ctx.fillText('C/P FLOW', centerX, startY + 20);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
    
    // Position legend on top right - moved left to fit within box
    const legendStartX = leftMargin + plotWidth - 140; // Start 140px from right edge (moved 20px left)
    
    // Call legend (top right)
    ctx.fillStyle = '#00ff00'; // Pure green
    ctx.fillRect(legendStartX, startY + 10, 18, 5);
    ctx.fillStyle = '#ffffff'; // Pure white
    ctx.font = 'bold 12px Arial'; // Bigger legend text
    ctx.textAlign = 'left'; // Left align for legend text
    
    // Add text shadow for legend
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 2;
    
    ctx.fillText('CALLS', legendStartX + 25, startY + 17);
    
    // Put legend (to the right of calls)
    ctx.fillStyle = '#ff0000'; // Pure red
    ctx.fillRect(legendStartX + 70, startY + 10, 18, 5);
    ctx.fillStyle = '#ffffff'; // Pure white
    ctx.fillText('PUTS', legendStartX + 95, startY + 17);
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
    
    // Draw time markers (9:30 AM, 10:30, 12:00 PM, 2:00, 4:00 PM) - Enhanced
    const timeMarkers = [
      { time: new Date(marketOpen), label: '9:30 AM' },
      { time: new Date(marketOpen.getTime() + 1 * 60 * 60 * 1000), label: '10:30' },
      { time: new Date(marketOpen.getTime() + 2.5 * 60 * 60 * 1000), label: '12:00 PM' },
      { time: new Date(marketOpen.getTime() + 4.5 * 60 * 60 * 1000), label: '2:00' },
      { time: new Date(marketClose), label: '4:00 PM' }
    ];
    
    ctx.fillStyle = '#ffffff'; // Pure white
    ctx.font = 'bold 11px Arial'; // Bigger, bolder font
    ctx.textAlign = 'center';
    
    timeMarkers.forEach(marker => {
      const x = scaleX(marker.time);
      
      // Add text shadow for crispness
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.shadowBlur = 2;
      
      ctx.fillText(marker.label, x, endY - 8);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
      
      // Draw vertical line - brighter and thicker
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY - 20);
      ctx.stroke();
    });
  };

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
    // EXPANDED: Allow much more future scrolling like TradingView
    switch (timeframe) {
      case '1m': return 52 * 7 * 24 * 60; // 1 year of minute data for future scrolling
      case '5m': return 52 * 7 * 24 * 12; // 1 year of 5-minute data
      case '15m': return 52 * 7 * 24 * 4; // 1 year of 15-minute data
      case '30m': return 52 * 7 * 24 * 2; // 1 year of 30-minute data
      case '1h': return 52 * 7 * 24; // 1 year of hourly data
      case '4h': return 52 * 7 * 6; // 1 year of 4-hour data
      case '1d': return 365 * 5; // 5 YEARS of daily future scrolling (MUCH more space)
      case '1w': return 52 * 5; // 5 years of weekly data
      case '1mo': return 12 * 5; // 5 years of monthly data
      default: return 365 * 2; // Default to 2 years in days
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

    // Draw horizontal rays on the main chart canvas - they will NEVER disappear
    if (horizontalRays.length > 0) {
      horizontalRays.forEach(ray => {
        const y = priceToScreenForDrawings(ray.price);
        
        if (y >= 0 && y <= dimensions.height) {
          // Draw the horizontal line
          ctx.strokeStyle = ray.color || '#00ff00';
          ctx.lineWidth = ray.lineWidth || 2;
          
          // Set line style based on ray properties
          const lineStyle = ray.lineStyle || 'solid';
          switch (lineStyle) {
            case 'dashed':
              ctx.setLineDash([10, 5]);
              break;
            case 'dotted':
              ctx.setLineDash([2, 3]);
              break;
            default:
              ctx.setLineDash([]);
              break;
          }
          
          ctx.beginPath();
          ctx.moveTo(40, y);
          ctx.lineTo(dimensions.width - 80, y); // Stop before Y-axis
          ctx.stroke();

          // Draw price label on Y-axis (like in your image)
          const priceText = ray.price.toFixed(2);
          ctx.font = '20px Arial';
          const textWidth = ctx.measureText(priceText).width;
          const textHeight = 24;
          
          // Background box on Y-axis
          ctx.fillStyle = ray.color || '#00ff00';
          ctx.fillRect(dimensions.width - 80, y - textHeight/2, textWidth + 8, textHeight);
          
          // Price text in white
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.fillText(priceText, dimensions.width - 76, y + 4);
        }
      });
    }

    // Draw current channel being created (visual feedback with live preview)
    if (isParallelChannelMode && (currentChannelPoints.length > 0 || channelPreviewPoint)) {
      // Save current context state
      ctx.save();
      
      // Draw placed points with precise alignment markers (use independent styling)
      currentChannelPoints.forEach((point, index) => {
        const x = timeToScreen(point.timestamp);
        const y = priceToScreenForDrawings(point.price);
        
        // Draw larger, more visible point marker with proper context isolation
        ctx.save(); // Save state before drawing each point
        
        // Main point circle
        ctx.fillStyle = '#00BFFF';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add white border for better visibility
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Add precision center dot to show exact placement
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw point label with black text 
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText((index + 1).toString(), x, y + 20); // Move label below point
        ctx.restore(); // Restore state after each point
      });
      
      // Show progress indicator in top-left corner (save context first)
      ctx.save();
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      const stepText = currentChannelPoints.length === 0 ? 'STEP 1: Click first point' : 
                      currentChannelPoints.length === 1 ? 'STEP 2: Click second point' : 'STEP 3: Click third point';
      ctx.fillText(stepText, 20, 40);
      
      // Show current crosshair coordinates for precision
      if (channelPreviewPoint && crosshairInfo.visible) {
        ctx.fillStyle = '#00BFFF';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`Crosshair: ${crosshairInfo.price} @ ${crosshairInfo.time}`, 20, 85);
      }
      
      // Show click debug counter to track responsiveness
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`Clicks detected: ${clickDebugCount}`, 20, 65);
      ctx.restore();
      
      // Preview logic based on current step (with proper context management)
      if (channelPreviewPoint) {
        const previewX = timeToScreen(channelPreviewPoint.timestamp);
        const previewY = priceToScreenForDrawings(channelPreviewPoint.price);
        
        if (currentChannelPoints.length === 1) {
          // Show preview line from point 1 to mouse position
          const point1X = timeToScreen(currentChannelPoints[0].timestamp);
          const point1Y = priceToScreenForDrawings(currentChannelPoints[0].price);
          
          ctx.save(); // Save context for line drawing
          ctx.strokeStyle = '#00BFFF';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(point1X, point1Y);
          ctx.lineTo(previewX, previewY);
          ctx.stroke();
          ctx.restore(); // Restore after line
          
          // Draw preview point
          ctx.save(); // Save context for preview point
          ctx.fillStyle = 'rgba(0, 191, 255, 0.5)';
          ctx.beginPath();
          ctx.arc(previewX, previewY, 4, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore(); // Restore after preview point
          
          // Show instruction text
          ctx.save();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 12px Arial';
          ctx.fillText('Click to set trend line end', previewX + 10, previewY + 20);
          ctx.restore();
          
        } else if (currentChannelPoints.length === 2) {
          // Show preview of complete channel with mouse position as width point
          const point1X = timeToScreen(currentChannelPoints[0].timestamp);
          const point1Y = priceToScreenForDrawings(currentChannelPoints[0].price);
          const point2X = timeToScreen(currentChannelPoints[1].timestamp);
          const point2Y = priceToScreenForDrawings(currentChannelPoints[1].price);
          
          // Draw main trend line (solid) with proper context
          ctx.save();
          ctx.strokeStyle = '#00BFFF';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(point1X, point1Y);
          ctx.lineTo(point2X, point2Y);
          ctx.stroke();
          ctx.restore();
          
          // Calculate and draw preview parallel line
          const A = point2Y - point1Y;
          const B = point1X - point2X;
          const C = (point2X - point1X) * point1Y - (point2Y - point1Y) * point1X;
          const distance = Math.abs(A * previewX + B * previewY + C) / Math.sqrt(A * A + B * B);
          
          const crossProduct = (point2X - point1X) * (previewY - point1Y) - (point2Y - point1Y) * (previewX - point1X);
          const isAbove = crossProduct > 0;
          
          const lineLength = Math.sqrt(A * A + B * B);
          const normalX = A / lineLength;
          const normalY = -B / lineLength;
          
          const finalNormalX = isAbove ? normalX : -normalX;
          const finalNormalY = isAbove ? normalY : -normalY;
          
          const parallelStartX = point1X + finalNormalX * distance;
          const parallelStartY = point1Y + finalNormalY * distance;
          const parallelEndX = point2X + finalNormalX * distance;
          const parallelEndY = point2Y + finalNormalY * distance;
          
          // Draw preview parallel line (dashed) with context
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 191, 255, 0.7)';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(parallelStartX, parallelStartY);
          ctx.lineTo(parallelEndX, parallelEndY);
          ctx.stroke();
          ctx.restore();
          
          // Draw preview fill with context
          ctx.save();
          ctx.fillStyle = 'rgba(0, 191, 255, 0.1)';
          ctx.beginPath();
          ctx.moveTo(point1X, point1Y);
          ctx.lineTo(point2X, point2Y);
          ctx.lineTo(parallelEndX, parallelEndY);
          ctx.lineTo(parallelStartX, parallelStartY);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          
          // Draw preview point with context
          ctx.save();
          ctx.fillStyle = 'rgba(0, 191, 255, 0.5)';
          ctx.beginPath();
          ctx.arc(previewX, previewY, 4, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore();
          
          // Show instruction text with context
          ctx.save();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 12px Arial';
          ctx.fillText('Click to set channel width', previewX + 10, previewY + 20);
          ctx.restore();
        }
      }
      
      // Restore the main context state after all channel preview drawing
      ctx.restore();
    }

    // Draw parallel channels (3-point system)
    if (parallelChannels.length > 0) {
      parallelChannels.forEach(channel => {
        const isSelected = selectedChannel === channel.id;
        ctx.strokeStyle = isSelected ? '#FFFF00' : (channel.color || '#00BFFF'); // Yellow when selected
        ctx.lineWidth = isSelected ? 3 : (channel.lineWidth || 2); // Thicker when selected
        
        // Set line style
        const lineStyle = channel.lineStyle || 'solid';
        switch (lineStyle) {
          case 'dashed':
            ctx.setLineDash([10, 5]);
            break;
          case 'dotted':
            ctx.setLineDash([2, 3]);
            break;
          default:
            ctx.setLineDash([]);
            break;
        }
        
        // Convert points to screen coordinates using the drawing-specific function
        const point1X = timeToScreen(channel.point1.timestamp);
        const point1Y = priceToScreenForDrawings(channel.point1.price);
        const point2X = timeToScreen(channel.point2.timestamp);
        const point2Y = priceToScreenForDrawings(channel.point2.price);
        const point3X = timeToScreen(channel.point3.timestamp);
        const point3Y = priceToScreenForDrawings(channel.point3.price);
        
        // Calculate the main trend line (point1 to point2)
        const mainLineStartX = point1X;
        const mainLineStartY = point1Y;
        const mainLineEndX = point2X;
        const mainLineEndY = point2Y;
        
        // Calculate perpendicular distance from point3 to the main line
        // Formula for distance from point to line: |ax + by + c| / sqrt(a² + b²)
        const A = point2Y - point1Y;
        const B = point1X - point2X;
        const C = (point2X - point1X) * point1Y - (point2Y - point1Y) * point1X;
        const distance = Math.abs(A * point3X + B * point3Y + C) / Math.sqrt(A * A + B * B);
        
        // Determine if point3 is above or below the main line
        const crossProduct = (point2X - point1X) * (point3Y - point1Y) - (point2Y - point1Y) * (point3X - point1X);
        const isAbove = crossProduct > 0;
        
        // Calculate unit normal vector (perpendicular to main line)
        const lineLength = Math.sqrt(A * A + B * B);
        const normalX = A / lineLength;
        const normalY = -B / lineLength;
        
        // Adjust normal direction based on which side point3 is on
        const finalNormalX = isAbove ? normalX : -normalX;
        const finalNormalY = isAbove ? normalY : -normalY;
        
        // Calculate parallel line points
        const parallelStartX = point1X + finalNormalX * distance;
        const parallelStartY = point1Y + finalNormalY * distance;
        const parallelEndX = point2X + finalNormalX * distance;
        const parallelEndY = point2Y + finalNormalY * distance;
        
        // Draw main trend line (point1 to point2)
        ctx.beginPath();
        ctx.moveTo(mainLineStartX, mainLineStartY);
        ctx.lineTo(mainLineEndX, mainLineEndY);
        ctx.stroke();
        
        // Draw parallel line
        ctx.beginPath();
        ctx.moveTo(parallelStartX, parallelStartY);
        ctx.lineTo(parallelEndX, parallelEndY);
        ctx.stroke();
        
        // Fill the channel with semi-transparent color (if enabled)
        if (channel.showFill !== false) {
          ctx.fillStyle = channel.fillColor || `${channel.color || '#00BFFF'}33`; // Use fillColor or add transparency to line color
          ctx.beginPath();
          ctx.moveTo(mainLineStartX, mainLineStartY);
          ctx.lineTo(mainLineEndX, mainLineEndY);
          ctx.lineTo(parallelEndX, parallelEndY);
          ctx.lineTo(parallelStartX, parallelStartY);
          ctx.closePath();
          ctx.fill();
        }
        
        // Draw point markers for visual feedback (optional)
        if (channel.isSelected) {
          ctx.fillStyle = channel.color || '#00BFFF';
          ctx.beginPath();
          ctx.arc(point1X, point1Y, 4, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(point2X, point2Y, 4, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(point3X, point3Y, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    }

    // Draw drawing brushes
    if (drawingBrushes.length > 0) {
      console.log('🖌️ Rendering', drawingBrushes.length, 'brush strokes:', drawingBrushes.map(b => `${b.label}(${b.strokes.length}pts)`));
      drawingBrushes.forEach((brush, index) => {
        if (brush.strokes.length >= 2) {
          console.log(`🖌️ Rendering brush ${index + 1}: ${brush.label} with ${brush.strokes.length} points`);
          ctx.strokeStyle = brush.color || '#FF69B4';
          ctx.lineWidth = brush.lineWidth || 3;
          ctx.globalAlpha = brush.opacity || 0.8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.setLineDash([]);
          
          ctx.beginPath();
          for (let i = 0; i < brush.strokes.length; i++) {
            const stroke = brush.strokes[i];
            const x = timeToScreen(stroke.timestamp);
            const y = priceToScreenForDrawings(stroke.price);
            
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
          ctx.globalAlpha = 1.0; // Reset alpha
        }
      });
    }

    // Draw current brush stroke being drawn
    if (isBrushing && currentBrushStroke.length > 0) {
      ctx.strokeStyle = '#FF69B4';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
      
      ctx.beginPath();
      for (let i = 0; i < currentBrushStroke.length; i++) {
        const stroke = currentBrushStroke[i];
        const x = timeToScreen(stroke.timestamp);
        const y = priceToScreenForDrawings(stroke.price);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0; // Reset alpha
    }
  };

  // Re-render when data or settings change
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      console.log(`🎨 Rendering chart with ${data.length} data points`);
      renderChart();
    }
  }, [renderChart, config.theme, config.colors, dimensions, data, priceRange, scrollOffset, visibleCandleCount, gexData, isGexActive, expectedRangeLevels, isExpectedRangeActive, horizontalRays, parallelChannels, currentChannelPoints, channelPreviewPoint, isParallelChannelMode, drawingBrushes, currentBrushStroke, isBrushing]);

  // 🚨 NUCLEAR BACKUP: Raw DOM event listener for parallel channel clicks
  useEffect(() => {
    if (!isParallelChannelMode) return;
    
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    
    console.log('🔥 ACTIVATING NUCLEAR BACKUP EVENT LISTENER FOR PARALLEL CHANNELS');
    
    const forceClickHandler = (e: MouseEvent) => {
      if (!isParallelChannelMode) return;
      
      console.log('💥 RAW DOM CLICK DETECTED - FORCING PARALLEL CHANNEL LOGIC');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Force increment click counter
      setClickDebugCount(prev => {
        console.log('💥 FORCE CLICK COUNT:', prev + 1);
        return prev + 1;
      });
      
      // Use EXACT same coordinate conversion as main click handler
      const newPoint = screenToTimePriceCoordinates(x, y);
      console.log('💥 FORCE CREATING POINT WITH RAW DOM:', newPoint);
      
      // FORCE the state update regardless of React lifecycle
      setCurrentChannelPoints(currentPoints => {
        const currentCount = currentPoints.length;
        console.log('💥 RAW DOM - FORCING STATE UPDATE FROM:', currentCount);
        
        if (currentCount === 0) {
          console.log('💥 RAW DOM - FORCE POINT 1');
          setChannelDrawingStep(1);
          return [newPoint];
        } else if (currentCount === 1) {
          console.log('💥 RAW DOM - FORCE POINT 2');
          setChannelDrawingStep(2);
          return [...currentPoints, newPoint];
        } else if (currentCount === 2) {
          console.log('💥 RAW DOM - FORCE POINT 3 - CREATING CHANNEL');
          const allPoints = [...currentPoints, newPoint];
          
          const newChannel: ParallelChannel = {
            id: Date.now().toString(),
            point1: allPoints[0],
            point2: allPoints[1], 
            point3: allPoints[2],
            color: '#00BFFF',
            lineWidth: 2,
            lineStyle: 'solid',
            fillOpacity: 0.1,
            fillColor: '#00BFFF33',
            showFill: true,
            label: `Channel ${parallelChannels.length + 1}`
          };
          
          setParallelChannels(prev => [...prev, newChannel]);
          setChannelDrawingStep(0);
          setChannelPreviewPoint(null);
          
          if (!isDrawingLocked) {
            activateToolExclusively('none'); // Clear all tools instead of just this one
          }
          
          return [];
        }
        
        return currentPoints;
      });
    };
    
    // Add the raw DOM listener with capture=true to intercept before React
    canvas.addEventListener('mousedown', forceClickHandler, true);
    
    // Cleanup
    return () => {
      canvas.removeEventListener('mousedown', forceClickHandler, true);
    };
  }, [isParallelChannelMode, dimensions, scrollOffset, data, parallelChannels.length, isDrawingLocked]);

  // TradingView-style interaction handlers
  const [lastMouseX, setLastMouseX] = useState(0);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartOffset, setDragStartOffset] = useState(0);

  // Stable helper function to get EXACT same priceChartHeight as renderChart function
  const actualPriceChartHeight = useMemo((): number => {
    const timeAxisHeight = 25;
    const volumeAreaHeight = 80;
    const cpFlowPaneHeight = 320;
    const totalBottomSpace = volumeAreaHeight + timeAxisHeight + (isCPFlowActive ? cpFlowPaneHeight : 0);
    return dimensions.height - totalBottomSpace;
  }, [dimensions.height, isCPFlowActive]);

  // Coordinate conversion functions (optimized to avoid recreating helper functions)
  const screenToPrice = useCallback((y: number): number => {
    const priceChartHeight = actualPriceChartHeight;
    
    // Get current price range - EXACT same logic as crosshair
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length === 0) return 0;
    
    // EXACT same price calculation as crosshair
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;
    
    // Use EXACT same formula as crosshair: adjustedMax - ((y / priceChartHeight) * (adjustedMax - adjustedMin))
    return adjustedMax - ((y / priceChartHeight) * (adjustedMax - adjustedMin));
  }, [actualPriceChartHeight, scrollOffset, visibleCandleCount, data]);

  // Helper function to get STABLE chart price range (for drawings - doesn't change with scrolling)
  const getStablePriceRange = (): { min: number; max: number } => {
    if (!data || data.length === 0) return { min: 0, max: 100 };
    
    const allPrices = data.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const padding = (maxPrice - minPrice) * 0.1;
    return {
      min: minPrice - padding,
      max: maxPrice + padding
    };
  };

  const priceToScreen = useCallback((price: number): number => {
    const priceChartHeight = actualPriceChartHeight;
    
    // Get current price range - EXACT same logic as crosshair
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length === 0) return priceChartHeight / 2;
    
    // EXACT same price calculation as crosshair
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;
    
    // Inverse of crosshair formula: adjustedMax - ((y / priceChartHeight) * (adjustedMax - adjustedMin))
    // Solving for y: y = ((adjustedMax - price) / (adjustedMax - adjustedMin)) * priceChartHeight
    return ((adjustedMax - price) / (adjustedMax - adjustedMin)) * priceChartHeight;
  }, [actualPriceChartHeight, scrollOffset, visibleCandleCount, data]);

  const timeToScreen = useCallback((timestamp: number): number => {
    const candleWidth = (dimensions.width - 100) / visibleCandleCount;
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const visibleData = data.slice(startIndex, startIndex + visibleCandleCount);
    
    // Find the index of the timestamp in visible data
    const dataIndex = visibleData.findIndex(d => d.timestamp >= timestamp);
    const relativeIndex = dataIndex >= 0 ? dataIndex : visibleData.length - 1;
    
    return 40 + (relativeIndex * candleWidth);
  }, [dimensions.width, visibleCandleCount, scrollOffset, data]);

  // Specialized coordinate functions for drawings that use STABLE price range (not viewport dependent)
  const priceToScreenForDrawings = useCallback((price: number): number => {
    const priceChartHeight = actualPriceChartHeight;
    
    // Get visible data for current price range calculation
    const startIndex = Math.max(0, scrollOffset);
    const endIndex = Math.min(data.length, scrollOffset + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length === 0) {
      return priceChartHeight / 2;
    }
    
    // Use the EXACT same price range calculation that the chart rendering uses
    const currentRange = getCurrentPriceRange(visibleData);
    
    if (currentRange.min === currentRange.max) {
      // Fallback if range is invalid
      return priceChartHeight / 2;
    }
    
    const adjustedMin = currentRange.min;
    const adjustedMax = currentRange.max;
    
    // Convert price to Y coordinate using the current chart range
    return ((adjustedMax - price) / (adjustedMax - adjustedMin)) * priceChartHeight;
  }, [actualPriceChartHeight, scrollOffset, data.length, visibleCandleCount, data, getCurrentPriceRange]);

  // Memoized coordinate conversion with performance optimization
  const screenToTimePriceCoordinates = useCallback((screenX: number, screenY: number): { timestamp: number; price: number } => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !data.length) return { timestamp: Date.now(), price: 0 };
    
    // Use EXACT same coordinate system as crosshair calculation for perfect alignment
    const priceChartHeight = actualPriceChartHeight;
    
    // Convert screen X to actual timestamp - using same logic as crosshair
    const chartWidth = dimensions.width - 100; // Match crosshair calculation
    const candleWidth = chartWidth / visibleCandleCount;
    const relativeX = Math.max(0, screenX - 40); // Account for left margin (match crosshair)
    const visibleCandleIndex = Math.floor(relativeX / candleWidth);
    const absoluteCandleIndex = scrollOffset + visibleCandleIndex;
    const boundedIndex = Math.max(0, Math.min(absoluteCandleIndex, data.length - 1));
    const timestamp = data[boundedIndex]?.timestamp || Date.now();
    
    // Convert screen Y to actual price using EXACT same logic as crosshair calculation
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const visibleData = data.slice(startIndex, endIndex);
    
    if (visibleData.length === 0) return { timestamp, price: 0 };
    
    // Use EXACT same price calculation as crosshair (from handleMouseMove)
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.1;
    const adjustedMin = minPrice - padding;
    const adjustedMax = maxPrice + padding;
    
    // Use EXACT same formula as crosshair: adjustedMax - ((y / priceChartHeight) * (adjustedMax - adjustedMin))
    // Only consider mouse position within the price chart area (match crosshair behavior)
    const price = screenY <= priceChartHeight ? 
      adjustedMax - ((screenY / priceChartHeight) * (adjustedMax - adjustedMin)) : 
      adjustedMax - ((screenY / priceChartHeight) * (adjustedMax - adjustedMin));
    
    return { timestamp, price };
  }, [actualPriceChartHeight, dimensions.width, visibleCandleCount, scrollOffset, data]);

  // Unified mouse handler that prioritizes drawing interaction over chart panning
  const handleUnifiedMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Only left mouse button
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('🖱️ CLICK DETECTED at:', { x, y, isParallelChannelMode, currentChannelPoints: currentChannelPoints.length, button: e.button });
    
    // Increment click counter for debugging when in channel mode
    if (isParallelChannelMode) {
      setClickDebugCount(prev => prev + 1);
    }
    
    // Visual click feedback - briefly flash the click location
    if (isParallelChannelMode) {
      const canvas = overlayCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FF0000';
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, 2 * Math.PI);
          ctx.fill();
          setTimeout(() => {
            // This will be cleared on next render
          }, 100);
        }
      }
    }

    // 🚨🚨🚨 NUCLEAR OPTION: PARALLEL CHANNEL MODE - NOTHING ELSE MATTERS! 🚨🚨🚨
    if (isParallelChannelMode) {
      console.log('�🔥🔥 PARALLEL CHANNEL CLICK - FORCE PROCESSING NOW!', { 
        x, y, 
        currentCount: currentChannelPoints.length,
        clickNumber: clickDebugCount + 1 
      });
      
      // NUCLEAR STOP - BLOCK EVERYTHING
      e.preventDefault();
      e.stopPropagation();
      (e.nativeEvent as Event).stopImmediatePropagation?.();
      
      // Use EXACT same coordinate system as crosshair
      const newPoint = screenToTimePriceCoordinates(x, y);
      
      // FORCE IMMEDIATE UPDATE - USE FUNCTIONAL STATE TO AVOID STALE CLOSURES
      setCurrentChannelPoints(currentPoints => {
        console.log('🎯 FORCE UPDATE - Current points before:', currentPoints.length);
        
        if (currentPoints.length === 0) {
          console.log('🟢 POINT 1 FORCE PLACED!', newPoint);
          setChannelDrawingStep(1);
          return [newPoint];
        } else if (currentPoints.length === 1) {
          console.log('🟢 POINT 2 FORCE PLACED!', newPoint);
          setChannelDrawingStep(2);
          return [...currentPoints, newPoint];
        } else if (currentPoints.length === 2) {
          console.log('🟢 POINT 3 FORCE PLACED - CREATING CHANNEL!', newPoint);
          const allPoints = [...currentPoints, newPoint];
          
          // IMMEDIATE CHANNEL CREATION
          const newChannel: ParallelChannel = {
            id: Date.now().toString(),
            point1: allPoints[0],
            point2: allPoints[1], 
            point3: allPoints[2],
            color: '#00BFFF',
            lineWidth: 2,
            lineStyle: 'solid',
            fillOpacity: 0.1,
            fillColor: '#00BFFF33',
            showFill: true,
            label: `Channel ${parallelChannels.length + 1}`
          };
          
          // FORCE ADD CHANNEL
          setParallelChannels(prev => [...prev, newChannel]);
          setChannelDrawingStep(0);
          setChannelPreviewPoint(null);
          console.log('🏁 CHANNEL COMPLETE!', newChannel);
          
          if (!isDrawingLocked) {
            activateToolExclusively('none'); // Clear all tools instead of just this one
          }
          
          return []; // Clear points
        }
        
        return currentPoints; // Fallback
      });
      
      // NUCLEAR STOP - RETURN IMMEDIATELY
      return;
    }

    // Check if we're in horizontal ray drawing mode
    if (isHorizontalRayMode) {
      // Use EXACT same coordinate system as crosshair
      const price = screenToPrice(y);
      
      const newRay: HorizontalRay = {
        id: Date.now().toString(),
        price: price,
        startX: x,
        color: '#00ff00', // Simple green color
        lineWidth: 2,
        lineStyle: 'solid',
        extendLeft: true,
        extendRight: true,
        label: `Ray ${horizontalRays.length + 1}`
      };
      
      console.log('Creating ray at price:', price, 'y:', y);
      setHorizontalRays(prev => [...prev, newRay]);
      
      if (!isDrawingLocked) {
        activateToolExclusively('none'); // Clear all tools instead of just this one
      }
      
      return;
    }




    // Drawing Brush mode - CLICK AND HOLD to draw (prepare for drawing)
    if (isDrawingBrushMode) {
      // Track that mouse is pressed and prepare for drawing
      setIsMousePressed(true);
      setIsBrushing(true);
      setCurrentBrushStroke([]); // Start with empty stroke
      setLastBrushTime(Date.now());
      
      console.log('🖌️ Brush prepared for drawing - mouse button pressed, waiting for movement');
      console.log('🖌️ Current saved brushes count:', drawingBrushes.length);
      console.log('🖌️ Current saved brushes:', drawingBrushes.map(b => b.label));
      return;
    }

    // Check for horizontal ray hits (for editing/selecting)
    for (const ray of horizontalRays) {
      const rayY = priceToScreenForDrawings(ray.price);
      if (Math.abs(y - rayY) <= 5) { // 5px tolerance
        setSelectedRay(ray.id);
        setIsEditingRay(true);
        setRayDragStart({ x, y, originalPrice: ray.price });
        return;
      }
    }

    // Check for parallel channel hits (for editing/selecting)
    for (const channel of parallelChannels) {
      // Check if click is near any of the channel lines
      const point1Y = priceToScreenForDrawings(channel.point1.price);
      const point2Y = priceToScreenForDrawings(channel.point2.price);
      const point3Y = priceToScreenForDrawings(channel.point3.price);
      
      // Calculate the parallel line (point4) coordinates
      const deltaY = point2Y - point1Y;
      const point4Y = point3Y + deltaY;
      
      // Check if click is near either channel line (5px tolerance)
      const nearFirstLine = Math.abs(y - point1Y) <= 5 || Math.abs(y - point2Y) <= 5;
      const nearSecondLine = Math.abs(y - point3Y) <= 5 || Math.abs(y - point4Y) <= 5;
      
      if (nearFirstLine || nearSecondLine) {
        setSelectedChannel(channel.id);
        setIsEditingChannel(true);
        setChannelDragStart({ x, y, originalChannel: { ...channel } });
        return;
      }
    }

    // Clear selections if clicking on empty area
    if (selectedRay) {
      setSelectedRay(null);
      setIsEditingRay(false);
      setRayDragStart(null);
    }
    if (selectedChannel) {
      setSelectedChannel(null);
      setIsEditingChannel(false);
      setChannelDragStart(null);
    }

    // Default chart panning behavior
    setIsDragging(true);
    setLastMouseX(x);
    setDragStartX(x);
    setDragStartOffset(scrollOffset);
  }, [
    isHorizontalRayMode, horizontalRays, rayProperties, scrollOffset, 
    isParallelChannelMode, isDrawingBrushMode,
    parallelChannels, isBrushing, isMousePressed,
    drawingBrushes, dimensions, data, visibleCandleCount, isDrawingLocked,
    screenToTimePriceCoordinates, screenToPrice, priceToScreenForDrawings, activateToolExclusively,
    selectedRay, selectedChannel
  ]);

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

    // Handle horizontal ray dragging
    if (isEditingRay && selectedRay && rayDragStart) {
      const newPrice = screenToPrice(y);
      setHorizontalRays(prev => 
        prev.map(ray => 
          ray.id === selectedRay 
            ? { ...ray, price: newPrice }
            : ray
        )
      );
      return;
    }

    // Handle parallel channel dragging
    if (isEditingChannel && selectedChannel && channelDragStart) {
      // Calculate price change for vertical dragging
      const newPrice = screenToPrice(y);
      const originalPrice = screenToPrice(channelDragStart.y);
      const deltaPrice = newPrice - originalPrice;
      
      // Calculate time change for horizontal dragging
      const newTimestamp = screenToTimePriceCoordinates(x, y).timestamp;
      const originalTimestamp = screenToTimePriceCoordinates(channelDragStart.x, channelDragStart.y).timestamp;
      const deltaTime = newTimestamp - originalTimestamp;
      
      setParallelChannels(prev => 
        prev.map(channel => 
          channel.id === selectedChannel 
            ? { 
                ...channel,
                point1: { 
                  timestamp: channelDragStart.originalChannel.point1.timestamp + deltaTime,
                  price: channelDragStart.originalChannel.point1.price + deltaPrice 
                },
                point2: { 
                  timestamp: channelDragStart.originalChannel.point2.timestamp + deltaTime,
                  price: channelDragStart.originalChannel.point2.price + deltaPrice 
                },
                point3: { 
                  timestamp: channelDragStart.originalChannel.point3.timestamp + deltaTime,
                  price: channelDragStart.originalChannel.point3.price + deltaPrice 
                }
              }
            : channel
        )
      );
      return;
    }

    // Handle drawing brush stroke - CLICK AND HOLD behavior
    if (isBrushing && isDrawingBrushMode && isMousePressed) {
      const now = Date.now();
      
      // Throttle brush points to prevent too many updates (max 60 FPS)
      if (now - lastBrushTime < 16) {
        return; // Skip this update
      }
      
      // Use EXACT same coordinate system as crosshair for perfect alignment
      const coords = screenToTimePriceCoordinates(x, y);
      
      // Add point to current brush stroke with smooth interpolation
      setCurrentBrushStroke(prev => {
        // If this is the first point (empty array), always add it to start drawing
        if (prev.length === 0) {
          console.log('🖌️ Brush stroke STARTED at:', coords);
          return [coords];
        }
        
        // For subsequent points, avoid duplicates that are too close together (less than 2 pixels distance)
        const lastPoint = prev[prev.length - 1];
        const lastX = timeToScreen(lastPoint.timestamp);
        const lastY = priceToScreenForDrawings(lastPoint.price);
        const distance = Math.sqrt(Math.pow(x - lastX, 2) + Math.pow(y - lastY, 2));
        
        // Only add point if it's far enough from the last point for smoother drawing
        if (distance < 2) {
          return prev;
        }
        
        return [...prev, coords];
      });
      
      setLastBrushTime(now);
      console.log('🖌️ Brush stroke point added:', coords, 'Total points:', currentBrushStroke.length + 1);
      // Note: Don't return here so crosshair continues to update
    }

    // Handle channel preview (show live preview as mouse moves) - use EXACT same coordinate system as crosshair
    if (isParallelChannelMode && currentChannelPoints.length > 0) {
      // Throttle preview updates to improve performance
      const now = Date.now();
      if (!lastPreviewUpdate || now - lastPreviewUpdate > 16) { // ~60fps throttling
        const previewCoords = screenToTimePriceCoordinates(x, y);
        setChannelPreviewPoint(previewCoords);
        setLastPreviewUpdate(now);
      }
      // Note: Don't return here so crosshair continues to update
    }

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
      const timeAxisHeight = 25;
      const priceChartHeight = dimensions.height - timeAxisHeight;
      
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
      const timeAxisHeight = 25;
      const priceChartHeight = dimensions.height - timeAxisHeight;
      
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
      const timeAxisHeight = 25;
      const priceChartHeight = dimensions.height - timeAxisHeight;
      
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
      // REMOVED RESTRICTION: Allow full future periods for extensive drag scrolling
      const maxFuturePeriods = futurePeriods; // Use full future periods
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
      // Calculate correct chart dimensions (matching renderChart function EXACTLY)
      const priceChartHeight = actualPriceChartHeight;
      
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
            time: ''
          });
        }
      }
    }
  }, [isDragging, isDraggingDrawing, selectedDrawing, lastMouseX, scrollOffset, visibleCandleCount, data, dimensions, priceRange, config.crosshair, isDraggingYAxis, yAxisDragStart, lastMousePosition, isAutoScale, manualPriceRange, setManualPriceRangeAndDisableAuto, getFuturePeriods, config.timeframe, isBrushing, isDrawingBrushMode, isMousePressed, currentBrushStroke, lastBrushTime, actualPriceChartHeight]);

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
        const timeAxisHeight = 25;
        const priceChartHeight = dimensions.height - timeAxisHeight;
        
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
    
    // Handle drawing brush stroke completion - CLICK AND HOLD behavior
    if (isBrushing && currentBrushStroke.length > 0) {
      console.log('🖌️ Brush stroke completed with', currentBrushStroke.length, 'points');
      
      // Only save if we have enough points for a meaningful stroke
      if (currentBrushStroke.length >= 2) {
        const newBrush: DrawingBrush = {
          id: Date.now().toString(),
          strokes: currentBrushStroke,
          color: '#FF69B4',
          lineWidth: 3,
          opacity: 0.8,
          label: `Brush ${drawingBrushes.length + 1}`
        };
        console.log('🖌️ Creating new brush:', newBrush.label);
        setDrawingBrushes(prev => {
          
          const updated = [...prev, newBrush];
          console.log('🖌️ Brush stroke saved:', newBrush.label, 'Total brushes:', updated.length);

          
          // Verify all brushes have valid stroke data
          const validBrushes = updated.filter(b => b.strokes && b.strokes.length >= 2);
          if (validBrushes.length !== updated.length) {
            console.warn('� Some brushes have invalid stroke data!');
          }
          
          return updated;
        });
      } else {
        console.log('🖌️ Brush stroke too short, discarding');
      }
      
      // Always clear current stroke and stop brushing
      setCurrentBrushStroke([]);
      setIsBrushing(false);
      
      // Keep brush tool active for multiple drawings unless drawing lock is disabled
      if (!isDrawingLocked) {
        // Don't clear the brush tool - keep it active for multiple drawings
        // Only clear the current drawing state
        console.log('🖌️ Brush stroke completed - tool remains active for next drawing');
      }
    }

    // Always clear mouse pressed state on mouse up (critical for brush tool)
    setIsMousePressed(false);

    // Handle horizontal ray editing cleanup
    setIsEditingRay(false);
    setRayDragStart(null);

    // Handle parallel channel editing cleanup
    setIsEditingChannel(false);
    setChannelDragStart(null);
    
    // DON'T clear selectedDrawing here - it closes the Property Editor!
    // setSelectedDrawing(null);
  }, [isBoxZooming, boxZoomStart, boxZoomEnd, dimensions, visibleCandleCount, scrollOffset, data.length, getCurrentPriceRange, setManualPriceRangeAndDisableAuto, isDragging, isDraggingYAxis, velocity, startMomentumAnimation]);

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
    
    // Clear mouse pressed state when leaving canvas (important for brush tool)
    setIsMousePressed(false);
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

  // Handle symbol change with instant preloading
  const handleSymbolChange = (newSymbol: string) => {
    setConfig(prev => ({ ...prev, symbol: newSymbol }));
    onSymbolChange?.(newSymbol);
    
    // Trigger instant preload for new symbol to speed up loading
    if (newSymbol && newSymbol.trim().length > 0) {
      triggerInstantPreload(newSymbol.trim().toUpperCase());
    }
  };

  // Trigger instant preload for symbol (non-blocking)
  const triggerInstantPreload = async (symbol: string) => {
    try {
      console.log(`🚀 Triggering instant preload for ${symbol}...`);
      
      const response = await fetch('/api/instant-preload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`⚡ Instant preload response for ${symbol}:`, result.message);
      } else {
        console.warn(`⚠️ Instant preload failed for ${symbol}:`, result.error);
      }
    } catch (error) {
      console.warn(`⚠️ Instant preload request failed for ${symbol}:`, error);
      // Don't throw - this is a background optimization
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



  // Horizontal Ray Drawing Functions
  const addHorizontalRay = (price: number, startX: number) => {
    const newRay: HorizontalRay = {
      id: `ray_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      price,
      color: '#2196F3',
      lineWidth: 2,
      lineStyle: 'solid',
      extendLeft: true,
      extendRight: true,
      label: '',
      startX,
      isSelected: false
    };
    
    setHorizontalRays(prev => [...prev, newRay]);
    console.log(`🎯 Added horizontal ray at price: $${price.toFixed(2)}`);
  };

  const selectHorizontalRay = (rayId: string) => {
    setHorizontalRays(prev => prev.map(ray => ({
      ...ray,
      isSelected: ray.id === rayId
    })));
    setSelectedRay(rayId);
  };

  const updateHorizontalRayPrice = (rayId: string, newPrice: number) => {
    setHorizontalRays(prev => prev.map(ray => 
      ray.id === rayId ? { ...ray, price: newPrice } : ray
    ));
  };

  const updateHorizontalRayStyle = (rayId: string, newStyle: Partial<HorizontalRay>) => {
    setHorizontalRays(prev => prev.map(ray => 
      ray.id === rayId ? { ...ray, ...newStyle } : ray
    ));
  };

  const deleteHorizontalRay = (rayId: string) => {
    setHorizontalRays(prev => prev.filter(ray => ray.id !== rayId));
    if (selectedRay === rayId) {
      setSelectedRay(null);
      setIsEditingRay(false);
    }
  };

  // Enhanced Canvas Drawing Interaction Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    console.log('🔥 handleCanvasMouseDown called');
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('🖱️ Mouse down at:', { x, y });

    // Handle horizontal ray mode
    if (isHorizontalRayMode) {
      // Calculate visible data range
      const startIndex = Math.max(0, Math.floor(scrollOffset));
      const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
      const currentVisibleData = data.slice(startIndex, endIndex);
      
      if (!currentVisibleData.length) return;
      
      const timeAxisHeight = 25;
      const volumeAreaHeight = isCPFlowActive ? 80 : 0;
      const chartHeight = dimensions.height - timeAxisHeight - volumeAreaHeight - (isCPFlowActive ? 320 : 0);
      const minPrice = Math.min(...currentVisibleData.map(d => d.low));
      const maxPrice = Math.max(...currentVisibleData.map(d => d.high));
      
      // Convert canvas Y to price
      const price = canvasToPrice(y, minPrice, maxPrice, chartHeight);
      
      // Add horizontal ray
      addHorizontalRay(price, x);
      
      // If not locked, exit ray mode after placing one ray
      if (!isDrawingLocked) {
        setIsHorizontalRayMode(false);
      }
      
      return;
    }

    // Check if clicking on existing horizontal ray
    // Calculate visible data range
    const startIndex = Math.max(0, Math.floor(scrollOffset));
    const endIndex = Math.min(data.length, startIndex + visibleCandleCount);
    const currentVisibleData = data.slice(startIndex, endIndex);
    
    if (!currentVisibleData.length) return;
    
    const timeAxisHeight = 25;
    const volumeAreaHeight = isCPFlowActive ? 80 : 0;
    const chartHeight = dimensions.height - timeAxisHeight - volumeAreaHeight - (isCPFlowActive ? 320 : 0);
    const minPrice = Math.min(...currentVisibleData.map(d => d.low));
    const maxPrice = Math.max(...currentVisibleData.map(d => d.high));
    
    for (const ray of horizontalRays) {
      const rayY = priceToCanvas(ray.price, minPrice, maxPrice, chartHeight);
      
      // Check if click is near the ray line (within 5 pixels)
      if (Math.abs(y - rayY) <= 5 && x >= (ray.startX || 0)) {
        selectHorizontalRay(ray.id);
        setIsEditingRay(true);
        return;
      }
    }

    // If clicking elsewhere, deselect rays
    setSelectedRay(null);
    setIsEditingRay(false);
    setHorizontalRays(prev => prev.map(ray => ({ ...ray, isSelected: false })));

    return;
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
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update crosshair position - these coordinates should match exactly with drawing coordinates
    setCrosshairPosition({ x, y });

    // Handle horizontal ray dragging
    if (isEditingRay && selectedRay) {
      // Use the exact same coordinate system as everything else
      const newPrice = screenToPrice(y);
      updateHorizontalRayPrice(selectedRay, newPrice);
    }

    // Change cursor when hovering over rays
    let isOverRay = false;
    for (const ray of horizontalRays) {
      const rayY = priceToScreenForDrawings(ray.price);
      if (Math.abs(y - rayY) <= 5 && x >= (ray.startX || 0)) {
        isOverRay = true;
        break;
      }
    }
    
    // Set cursor for parallel channel mode to precise crosshair for better alignment
    canvas.style.cursor = isOverRay || isEditingRay ? 'ns-resize' : 
                          (isHorizontalRayMode || isParallelChannelMode) ? 'crosshair' : 
                          isDrawingBrushMode ? 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTMgMTdIMjFMMTMgOUwzIDE3WiIgZmlsbD0iIzAwMCIgc3Ryb2tlPSIjRkZGIiBzdHJva2Utd2lkdGg9IjIiLz4KPHN2Zz4K) 8 20, auto' :
                          'default';
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsEditingRay(false);
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

  // Fixed horizontal rays function - uses proper coordinate system
  const drawHorizontalRays = (ctx: CanvasRenderingContext2D) => {
    if (!horizontalRays.length) return;
    
    // Use the existing priceToScreen function for consistent coordinates
    const chartWidth = dimensions.width - 80;
    
    horizontalRays.forEach(ray => {
      // Use the same coordinate conversion as the main chart
      const y = priceToScreen(ray.price);
      
      // Only draw if within visible area
      if (y < 0 || y > dimensions.height) return;
      
      // Draw horizontal line across entire chart width
      ctx.strokeStyle = ray.color || '#00ff00';
      ctx.lineWidth = ray.lineWidth || 2;
      
      // Set line style based on ray properties
      const lineStyle = ray.lineStyle || 'solid';
      switch (lineStyle) {
        case 'dashed':
          ctx.setLineDash([10, 5]);
          break;
        case 'dotted':
          ctx.setLineDash([2, 3]);
          break;
        default:
          ctx.setLineDash([]);
          break;
      }
      
      ctx.beginPath();
      ctx.moveTo(80, y); // Start from left margin
      ctx.lineTo(dimensions.width - 80, y); // End at right margin
      ctx.stroke();

      // Price label on the right
      const priceText = `$${ray.price.toFixed(2)}`;
      ctx.font = '12px Arial';
      ctx.fillStyle = ray.color || '#00ff00';
      ctx.fillText(priceText, dimensions.width - 75, y - 5);
    });
    
    ctx.setLineDash([]);
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
    console.log('Sidebar button clicked:', id, 'Current panel:', activeSidebarPanel);
    setActiveSidebarPanel(activeSidebarPanel === id ? null : id);
  };

  // Watchlist Panel Component - Bloomberg Terminal Style with 4-Column Performance
  const WatchlistPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
    const currentSymbols = marketSymbols[activeTab as keyof typeof marketSymbols] || [];
    
    // Use a simplified fallback data approach for now
    const hasWatchlistData = Object.keys(watchlistData).length > 0;
    console.log('� Watchlist Panel - hasWatchlistData:', hasWatchlistData);
    
    if (!hasWatchlistData) {
      // Show loading or use fallback
      const fallbackData = {
        'SPY': { price: 663.47, change1d: -0.03, change5d: 1.2, change13d: 2.1, change21d: 3.5, performance: 'Benchmark', performanceColor: 'text-blue-300' },
        'QQQ': { price: 599.69, change1d: 0.04, change5d: 2.1, change13d: 3.2, change21d: 4.8, performance: 'Leader', performanceColor: 'text-green-400' },
        'IWM': { price: 243.21, change1d: 0.02, change5d: 0.5, change13d: 1.8, change21d: 2.9, performance: 'Strong', performanceColor: 'text-green-400' },
        'DIA': { price: 462.94, change1d: 0.09, change5d: 1.1, change13d: 2.0, change21d: 3.2, performance: 'Strong', performanceColor: 'text-green-400' },
        'XLK': { price: 278.99, change1d: 0.11, change5d: 1.8, change13d: 2.9, change21d: 4.1, performance: 'Leader', performanceColor: 'text-green-400' }
      };
      
      // Temporarily assign fallback data to show something
      Object.assign(watchlistData, fallbackData);
    }
    
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
    console.log('🎭 REGIMES PANEL: Rendering with activeTab:', activeTab);
    console.log('🎭 REGIMES PANEL: Market regime data available:', !!marketRegimeData);
    console.log('🎭 REGIMES PANEL: Full market regime data:', marketRegimeData);
    
    // Add to global debug object
    window.MARKET_REGIMES_DEBUG = {
      ...window.MARKET_REGIMES_DEBUG,
      panelRender: {
        activeTab,
        hasData: !!marketRegimeData,
        data: marketRegimeData
      }
    };
    
    const getCurrentTimeframeData = () => {
      if (!marketRegimeData) {
        console.log('🎭 REGIMES PANEL: No market regime data available');
        return null;
      }
      
      let data;
      switch (activeTab) {
        case 'Life':
          data = marketRegimeData.life;
          break;
        case 'Developing':
          data = marketRegimeData.developing;
          break;
        case 'Momentum':
          data = marketRegimeData.momentum;
          break;
        default:
          data = marketRegimeData.life;
      }
      
      console.log(`🎭 REGIMES PANEL: ${activeTab} data:`, data);
      return data;
    };

    const timeframeData = getCurrentTimeframeData();
    const bullishIndustries = timeframeData?.industries.filter(industry => industry.trend === 'bullish').slice(0, 20) || [];
    const bearishIndustries = timeframeData?.industries.filter(industry => industry.trend === 'bearish').slice(0, 20) || [];
    
    console.log(`🎭 REGIMES PANEL: ${activeTab} - Bullish: ${bullishIndustries.length}, Bearish: ${bearishIndustries.length}`);

    return (
      <div className="h-full flex flex-col" style={{
        background: 'linear-gradient(135deg, #000000 0%, #0a0a0a 25%, #111111 50%, #0a0a0a 75%, #000000 100%)',
        borderLeft: '1px solid rgba(255, 102, 0, 0.3)'
      }}>
        {/* Premium Bloomberg-Style Header */}
        <div style={{
          background: '#000000',
          borderBottom: '2px solid rgba(255, 102, 0, 0.4)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
        }}>
          {/* Premium Title Section */}
          <div className="px-6 py-6 relative overflow-hidden">
            {/* Background Ambient Glow */}
            <div className="absolute inset-0 opacity-30" style={{
              background: 'radial-gradient(ellipse at top, rgba(255, 102, 0, 0.1) 0%, transparent 70%)'
            }}/>
            <div className="absolute inset-0 opacity-20" style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255, 102, 0, 0.05) 50%, transparent 100%)'
            }}/>
            
            <div className="relative z-10 flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold tracking-wider uppercase mb-1" style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  background: 'linear-gradient(135deg, #ffffff 0%, #ffcc80 25%, #ff9800 50%, #ffcc80 75%, #ffffff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: '0 2px 10px rgba(255, 152, 0, 0.3)',
                  filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8))'
                }}>
                  Market Regimes
                </h1>
              </div>
              
              {/* Status Indicator - positioned absolute top right */}
              <div className="absolute top-6 right-6 flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{
                    boxShadow: '0 0 8px rgba(76, 175, 80, 0.6)'
                  }}/>
                  <span className="text-xs text-green-400 font-mono font-medium">LIVE</span>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
          
          {/* Premium Tab Navigation */}
          <div className="px-6 pb-4">
            <div className="flex rounded-lg p-2" style={{
              background: '#000000',
              border: '1px solid rgba(255, 102, 0, 0.2)',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8)'
            }}>
              {['Life', 'Developing', 'Momentum'].map((tab, index) => {
                const tabColors = {
                  'Life': { bg: 'rgba(76, 175, 80, 0.15)', border: 'rgba(76, 175, 80, 0.4)', color: '#4caf50', hoverBg: 'rgba(76, 175, 80, 0.25)' },
                  'Developing': { bg: 'rgba(33, 150, 243, 0.15)', border: 'rgba(33, 150, 243, 0.4)', color: '#2196f3', hoverBg: 'rgba(33, 150, 243, 0.25)' },
                  'Momentum': { bg: 'rgba(156, 39, 176, 0.15)', border: 'rgba(156, 39, 176, 0.4)', color: '#9c27b0', hoverBg: 'rgba(156, 39, 176, 0.25)' }
                };
                const tabStyle = tabColors[tab as keyof typeof tabColors];
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="relative flex-1 px-8 py-4 text-lg font-mono font-bold uppercase tracking-wider transition-all duration-300"
                    style={{
                      background: activeTab === tab ? tabStyle.bg : 'transparent',
                      color: activeTab === tab ? tabStyle.color : '#666666',
                      borderRadius: '8px',
                      border: activeTab === tab ? `2px solid ${tabStyle.border}` : '2px solid transparent',
                      textShadow: activeTab === tab 
                        ? `0 1px 3px ${tabStyle.color}80` 
                        : '0 1px 2px rgba(0, 0, 0, 0.8)',
                      boxShadow: activeTab === tab
                        ? `0 4px 12px ${tabStyle.color}40, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
                        : 'inset 0 1px 0 rgba(255, 255, 255, 0.02)',
                      transform: activeTab === tab ? 'translateY(-2px) scale(1.02)' : 'translateY(0) scale(1)'
                    }}
                    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                      if (activeTab !== tab) {
                        e.currentTarget.style.background = tabStyle.hoverBg;
                        e.currentTarget.style.color = tabStyle.color;
                        e.currentTarget.style.border = `2px solid ${tabStyle.border}60`;
                        e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)';
                      }
                    }}
                    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                      if (activeTab !== tab) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#666666';
                        e.currentTarget.style.border = '2px solid transparent';
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      }
                    }}
                  >
                    {tab}
                    {activeTab === tab && (
                      <div 
                        className="absolute -bottom-1 left-1/2 transform -translate-x-1/2"
                        style={{
                          width: '60%',
                          height: '3px',
                          background: `linear-gradient(90deg, transparent 0%, ${tabStyle.color} 50%, transparent 100%)`,
                          borderRadius: '2px',
                          boxShadow: `0 0 8px ${tabStyle.color}`
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Premium Progress Bar */}
        {isLoadingRegimes && (
          <div className="w-full h-1 relative overflow-hidden" style={{
            background: 'linear-gradient(90deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)'
          }}>
            <div 
              className="h-full transition-all duration-500 ease-out relative"
              style={{ 
                width: `${regimeUpdateProgress}%`,
                background: 'linear-gradient(90deg, #ff6600 0%, #ff9800 50%, #ffcc80 100%)',
                boxShadow: '0 0 10px rgba(255, 102, 0, 0.6)'
              }}
            >
              <div className="absolute inset-0 animate-pulse" style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)'
              }}/>
            </div>
          </div>
        )}
        
        {/* Premium Content Area */}
        <div className="flex-1 overflow-hidden">
          {isLoadingRegimes && !marketRegimeData ? (
            <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" style={{
                  boxShadow: '0 0 20px rgba(255, 152, 0, 0.3)'
                }}></div>
                <div className="absolute inset-0 w-12 h-12 border border-orange-300 border-opacity-20 rounded-full animate-ping"></div>
              </div>
              <div className="text-center font-mono">
                <div className="text-white text-lg font-bold mb-2">{regimeLoadingStage}</div>
                <div className="text-orange-400 text-sm mb-1">{regimeUpdateProgress}% complete</div>
                <div className="text-gray-500 text-xs">Analyzing market momentum...</div>
              </div>
            </div>
          ) : !marketRegimeData ? (
            <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
              <div className="text-4xl mb-4">📊</div>
              <div className="text-center font-mono">
                <div className="text-white text-xl font-bold mb-2">Market Regime Analysis</div>
                <div className="text-orange-400 text-sm">Initializing premium analytics...</div>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto" style={{
              background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 50%, #000000 100%)'
            }}>
              {/* Premium Streaming Indicator */}
              {isLoadingRegimes && (
                <div className="mx-6 mt-4 p-3 rounded-lg" style={{
                  background: 'linear-gradient(135deg, rgba(255, 102, 0, 0.1) 0%, rgba(255, 152, 0, 0.05) 100%)',
                  border: '1px solid rgba(255, 102, 0, 0.3)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                }}>
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse" style={{
                      boxShadow: '0 0 8px rgba(255, 152, 0, 0.8)'
                    }}/>
                    <span className="text-orange-300 font-mono text-sm font-medium">
                      {regimeLoadingStage} ({regimeUpdateProgress}%)
                    </span>
                  </div>
                </div>
              )}
              
              {/* Premium Industry Analysis Grid */}
              <div className="px-6 pb-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Premium Bullish Industries Section */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" style={{
                            boxShadow: '0 0 8px rgba(76, 175, 80, 0.8)'
                          }}/>
                          <span className="text-green-400 font-mono font-bold text-sm uppercase tracking-wider">
                            Bullish Momentum
                          </span>
                        </div>
                      </h3>
                      <div className="text-green-400 font-mono text-xs bg-green-400 bg-opacity-10 px-2 py-1 rounded">
                        {bullishIndustries.length} sectors
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                    {bullishIndustries.length > 0 ? bullishIndustries.map((industry, index) => (
                      <div 
                        key={industry.symbol} 
                        className="group relative p-4 rounded-lg transition-all duration-300 cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)',
                          border: '1px solid rgba(76, 175, 80, 0.2)',
                          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.3)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.15) 0%, rgba(0, 0, 0, 0.2) 100%)';
                          e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.4)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 8px 25px rgba(76, 175, 80, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)';
                          e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.2)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.3)';
                        }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <span className="text-green-400 font-mono font-bold text-2xl tracking-wide">
                                {industry.symbol}
                              </span>
                              <div className="flex items-center space-x-1">
                                <div className="w-1 h-1 bg-green-400 rounded-full"/>
                                <div className="w-1 h-1 bg-green-400 rounded-full opacity-75"/>
                                <div className="w-1 h-1 bg-green-400 rounded-full opacity-50"/>
                              </div>
                            </div>
                            <div className="text-gray-300 text-base mt-1 font-medium leading-relaxed">
                              {industry.name}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-green-400 font-mono text-xl font-bold">
                              +{industry.relativePerformance.toFixed(2)}%
                            </div>
                            <div className="w-16 h-1 bg-gray-700 rounded-full mt-1 overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-green-500 to-green-300 rounded-full transition-all duration-1000"
                                style={{ width: `${Math.min(100, (industry.relativePerformance / 5) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Top Performers */}
                        {industry.topPerformers && industry.topPerformers.length > 0 && (
                          <div className="border-t border-green-400 border-opacity-20 pt-3 mt-3">
                            <div className="text-xs text-gray-500 font-mono mb-2 uppercase tracking-wide">
                              Top 3 Performers
                            </div>
                            <div className="space-y-1">
                              {industry.topPerformers.slice(0, 3).map((stock) => (
                                <div 
                                  key={stock.symbol} 
                                  className="flex justify-between items-center py-2 px-3 rounded transition-all duration-200"
                                  style={{
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(76, 175, 80, 0.1)'
                                  }}
                                  onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                    e.stopPropagation();
                                    console.log(`📊 Switching chart to ${stock.symbol} from bullish industry`);
                                    if (onSymbolChange) {
                                      onSymbolChange(stock.symbol);
                                    }
                                    setConfig(prev => ({ ...prev, symbol: stock.symbol }));
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(76, 175, 80, 0.1)';
                                    e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.3)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)';
                                    e.currentTarget.style.borderColor = 'rgba(76, 175, 80, 0.1)';
                                  }}
                                >
                                  <span className="text-white font-mono font-medium text-lg">
                                    {stock.symbol}
                                  </span>
                                  <span className="text-green-400 font-mono font-bold text-lg">
                                    +{stock.relativePerformance.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="text-center py-8">
                        <div className="text-gray-500 font-mono text-sm">
                          No bullish sectors detected
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                  
                  {/* Premium Bearish Industries Section */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-red-400 rounded-full animate-pulse" style={{
                            boxShadow: '0 0 8px rgba(244, 67, 54, 0.8)'
                          }}/>
                          <span className="text-red-400 font-mono font-bold text-sm uppercase tracking-wider">
                            Bearish Pressure
                          </span>
                        </div>
                      </h3>
                      <div className="text-red-400 font-mono text-xs bg-red-400 bg-opacity-10 px-2 py-1 rounded">
                        {bearishIndustries.length} sectors
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                    {bearishIndustries.length > 0 ? bearishIndustries.map((industry, index) => (
                      <div 
                        key={industry.symbol} 
                        className="group relative p-4 rounded-lg transition-all duration-300 cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, rgba(244, 67, 54, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)',
                          border: '1px solid rgba(244, 67, 54, 0.2)',
                          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.3)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(244, 67, 54, 0.15) 0%, rgba(0, 0, 0, 0.2) 100%)';
                          e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.4)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 8px 25px rgba(244, 67, 54, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(244, 67, 54, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)';
                          e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.2)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.3)';
                        }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <span className="text-red-400 font-mono font-bold text-2xl tracking-wide">
                                {industry.symbol}
                              </span>
                              <div className="flex items-center space-x-1">
                                <div className="w-1 h-1 bg-red-400 rounded-full"/>
                                <div className="w-1 h-1 bg-red-400 rounded-full opacity-75"/>
                                <div className="w-1 h-1 bg-red-400 rounded-full opacity-50"/>
                              </div>
                            </div>
                            <div className="text-gray-300 text-base mt-1 font-medium leading-relaxed">
                              {industry.name}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-red-400 font-mono text-xl font-bold">
                              {industry.relativePerformance.toFixed(2)}%
                            </div>
                            <div className="w-16 h-1 bg-gray-700 rounded-full mt-1 overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-red-500 to-red-300 rounded-full transition-all duration-1000"
                                style={{ width: `${Math.min(100, Math.abs(industry.relativePerformance / 5) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Worst Performers */}
                        {industry.worstPerformers && industry.worstPerformers.length > 0 && (
                          <div className="border-t border-red-400 border-opacity-20 pt-3 mt-3">
                            <div className="text-xs text-gray-500 font-mono mb-2 uppercase tracking-wide">
                              Worst 3 Performers
                            </div>
                            <div className="space-y-1">
                              {industry.worstPerformers.slice(0, 3).map((stock) => (
                                <div 
                                  key={stock.symbol} 
                                  className="flex justify-between items-center py-2 px-3 rounded transition-all duration-200"
                                  style={{
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: '1px solid rgba(244, 67, 54, 0.1)'
                                  }}
                                  onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                    e.stopPropagation();
                                    console.log(`📊 Switching chart to ${stock.symbol} from bearish industry`);
                                    if (onSymbolChange) {
                                      onSymbolChange(stock.symbol);
                                    }
                                    setConfig(prev => ({ ...prev, symbol: stock.symbol }));
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(244, 67, 54, 0.1)';
                                    e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.3)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)';
                                    e.currentTarget.style.borderColor = 'rgba(244, 67, 54, 0.1)';
                                  }}
                                >
                                  <span className="text-white font-mono font-medium text-lg">
                                    {stock.symbol}
                                  </span>
                                  <span className="text-red-400 font-mono font-bold text-lg">
                                    {stock.relativePerformance.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="text-center py-8">
                        <div className="text-gray-500 font-mono text-sm">
                          No bearish sectors detected
                        </div>
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
  const ChatPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
    // Add state for chat visibility and category collapse/expand
    const [showChat, setShowChat] = useState(true);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [currentMessage, setCurrentMessage] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<{[key: string]: boolean}>({
      'start-here': true,
      'education': true, 
      'market-insights': true,
      'trade-center': true,
      'traders-den': true
    });

    const toggleCategory = (categoryId: string) => {
      setExpandedCategories(prev => ({
        ...prev,
        [categoryId]: !prev[categoryId]
      }));
    };

    // Structured categories matching Discord layout
    const channelCategories = [
      {
        id: 'start-here',
        name: 'START HERE',
        channels: [
          { id: 'announcements', name: 'Announcement', emoji: '�', adminOnly: true },
          { id: 'testimonials', name: 'Testimonials', emoji: '⭐', adminOnly: false },
          { id: 'rules-disclaimers', name: 'Rules-Disclaimers', emoji: '�', adminOnly: false },
          { id: 'contact-us', name: 'Contact-Us', emoji: '📞', adminOnly: false },
          { id: 'start-here-channel', name: 'Start-Here', emoji: '�', adminOnly: false }
        ]
      },
      {
        id: 'education', 
        name: 'Education',
        emoji: '🎓',
        channels: [
          { id: 'live-recordings', name: 'Live-Recordings', emoji: '🎥', adminOnly: false },
          { id: 'lesson', name: 'Lesson', emoji: '�', adminOnly: false },
          { id: 'application', name: 'Application', emoji: '�', adminOnly: false },
          { id: 'result-upload', name: 'Result-Upload', emoji: '�', adminOnly: false },
          { id: 'traders-code', name: 'The-Traders-Code', emoji: '⚡', adminOnly: false },
          { id: 'zaks-market-moves', name: 'Zak\'s-Market-Moves', emoji: '🎯', adminOnly: false }
        ]
      },
      {
        id: 'market-insights',
        name: 'Market Insights', 
        emoji: '📊',
        channels: [
          { id: 'cyclical', name: 'Cyclical', emoji: '�', adminOnly: false },
          { id: 'monthly', name: 'Monthly', emoji: '📅', adminOnly: false },
          { id: 'chart-track-trade', name: 'Chart-Track-Trade', emoji: '�', adminOnly: false },
          { id: 'gex-ideas', name: 'GEX-Ideas', emoji: '�', adminOnly: false },
          { id: 'insiders-congress', name: 'Insiders-Congress', emoji: '🏛️', adminOnly: false },
          { id: 'notable-flow', name: 'Notable-Flow', emoji: '🔥', adminOnly: false }
        ]
      },
      {
        id: 'trade-center',
        name: 'Trade Center',
        emoji: '💼',
        channels: [
          { id: 'dividend-portfolio', name: 'Dividend-Portfolio', emoji: '💰', adminOnly: false },
          { id: '100k-portfolio', name: '100K-Portfolio', emoji: '�', adminOnly: false },
          { id: '25k-portfolio', name: '25K-Portfolio', emoji: '🏆', adminOnly: false },
          { id: '5k-portfolio', name: '5K-Portfolio', emoji: '🎯', adminOnly: false },
          { id: 'weekly-snapshot', name: 'Weekly-Snapshot', emoji: '�', adminOnly: false },
          { id: 'swing-trades', name: 'Swing-Trades', emoji: '🎭', adminOnly: false },
          { id: 'stock-chat', name: 'Stock-Chat', emoji: '�', adminOnly: false },
          { id: 'flow-analyst', name: 'Flow-Analyst', emoji: '🌊', adminOnly: false }
        ]
      },
      {
        id: 'traders-den',
        name: 'Trader\'s Den',
        emoji: '�',
        channels: [
          { id: 'feedback-hub', name: 'Feedback-Hub', emoji: '�', adminOnly: false },
          { id: 'all-flow', name: 'ALL-FLOW', emoji: '🌊', adminOnly: false },
          { id: 'calendar', name: 'Calendar', emoji: '🗓️', adminOnly: false },
          { id: 'motiversity', name: 'Motiversity', emoji: '🚀', adminOnly: false },
          { id: 'mentorship', name: 'Mentorship', emoji: '👨‍�', adminOnly: false },
          { id: 'chill-chat', name: 'Chill-Chat', emoji: '�', adminOnly: false }
        ]
      }
    ];

    const takeScreenshot = async () => {
      try {
        const canvas = chartCanvasRef.current;
        if (canvas) {
          const dataURL = canvas.toDataURL('image/png');
          const newScreenshot = {
            id: Date.now().toString(),
            url: dataURL,
            timestamp: new Date(),
            notes: ''
          };
          setScreenshots(prev => [newScreenshot, ...prev]);
        }
      } catch (error) {
        console.error('Failed to capture screenshot:', error);
      }
    };

    const addNote = () => {
      const newNote = {
        id: Date.now().toString(),
        title: 'New Note',
        content: '',
        timestamp: new Date(),
        color: '#3b82f6'
      };
      setNotes(prev => [newNote, ...prev]);
    };

    const addReminder = () => {
      const newReminder = {
        id: Date.now().toString(),
        title: 'New Reminder',
        datetime: new Date(Date.now() + 3600000), // 1 hour from now
        completed: false
      };
      setReminders(prev => [newReminder, ...prev]);
    };

    // File upload handler
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files) return;
      
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const fileData = {
            id: Date.now().toString() + Math.random().toString(36),
            name: file.name,
            type: file.type,
            url: e.target?.result as string,
            size: file.size
          };
          
          setUploadedFiles(prev => [...prev, fileData]);
          
          // Send file as message
          const fileMessage = {
            id: Date.now().toString(),
            user: 'You',
            message: `📎 **${file.name}** (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
            timestamp: new Date(),
            userType: 'user',
            fileData: fileData
          };
          
          setChatMessages(prev => ({
            ...prev,
            [activeTab]: [...(prev[activeTab] || []), fileMessage]
          }));
        };
        
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      });
      
      // Reset file input
      event.target.value = '';
    };

    // Enhanced Stock Market Emoji Collection
    const emojis = [
      // Bullish Emojis (Green/Up Movement)
      '�', '�', '�', '�', '�', '⬆️', '�', '💎', '�', '⚡',
      '🎯', '�', '�', '🌟', '✨', '🎉', '🏆', '�', '🤑', '�',
      
      // Bearish Emojis (Red/Down Movement)  
      '�', '�', '�', '�', '⬇️', '📊', '💔', '😰', '�', '�',
      '⚠️', '�', '�', '�', '�', '�', '�', '⛔', '🛑', '🆘',
      
      // Market Sentiment & Trading
      '�', '�', '�', '💹', '🏦', '�', '�', '�', '�', '�',
      '⏰', '�', '🔔', '📢', '💡', '�', '🎲', '🎰', '🃏', '♠️',
      
      // General Reactions
      '�', '�', '�', '�', '�', '�', '�', '🤣', '😊', '😇',
      '🙂', '😉', '😌', '😍', '🥰', '😘', '😎', '🤩', '🥳', '�',
      
      // Action & Confirmation
      '✅', '❌', '👍', '👎', '👌', '🤝', '🙏', '💯', '🔥', '💥'
    ];

    // Add emoji to message
    const addEmoji = (emoji: string) => {
      setCurrentMessage(prev => prev + emoji);
      setShowEmojiPicker(false);
    };

    const sendMessage = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!currentMessage.trim()) return;
      
      const newMessage = {
        id: Date.now().toString(),
        user: 'You',
        message: currentMessage.trim(),
        timestamp: new Date(),
        userType: 'user'
      };
      
      setChatMessages(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), newMessage]
      }));
      
      setCurrentMessage('');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    };

    return (
      <div className="h-full bg-black overflow-hidden">
        {/* Chat Content */}
        {true ? (
          <div className="flex flex-1 h-full max-h-full overflow-hidden">
            {/* Left Sidebar - Discord Style Navigation */}
            <div className="w-80 bg-gradient-to-b from-gray-900 via-gray-800 to-black border-r border-gray-700/50 flex flex-col shadow-2xl backdrop-blur-md min-h-0">
              {/* Server Header */}
              <div className="p-3 border-b border-gray-700/50 bg-gradient-to-r from-gray-800 to-gray-700 flex-shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <span className="text-white font-black text-xl">EFI</span>
                  </div>
                  <div>
                    <div className="text-white font-black text-lg tracking-wide">EFI Trading</div>
                    <div className="text-green-400 text-sm font-semibold flex items-center">
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                      Live Market Session
                    </div>
                  </div>
                </div>
              </div>

              {/* Categories and Channels */}
              <div className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-4 min-h-0">
                {channelCategories.map((category) => (
                  <div key={category.id} className="space-y-3">
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className="w-full flex items-center space-x-3 px-3 py-2 text-left hover:bg-black/40 rounded-xl transition-all duration-300 group"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-white font-bold text-lg">
                          {expandedCategories[category.id] ? '▼' : '▶'}
                        </span>
                        <span className="font-bold text-xl uppercase tracking-wider text-orange-500">
                          {category.name}
                        </span>
                      </div>
                    </button>

                    {/* Channels in Category */}
                    {expandedCategories[category.id] && (
                      <div className="ml-2 mt-3 space-y-2">
                        {category.channels.map((channel) => (
                          <button
                            key={channel.id}
                            onClick={() => setActiveTab(channel.id)}
                            className={`w-full flex items-center space-x-4 px-4 py-3 rounded-lg text-left transition-all duration-300 group shadow-sm ${
                              activeTab === channel.id
                                ? 'bg-gradient-to-r from-gray-700 to-gray-600 text-white shadow-lg scale-105 border border-blue-400/50'
                                : 'bg-black/60 text-gray-300 hover:bg-black/80 hover:text-white hover:scale-102 border border-gray-700/50'
                            }`}
                          >
                            <span className="text-lg font-semibold text-white">
                              {channel.name}
                            </span>
                            {channel.adminOnly && (
                              <div className="ml-auto">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg"></div>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Voice Call Section */}
              <div className="p-4 border-t border-gray-700">
                <button className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200">
                  <TbPhoneCall size={20} />
                  <span className="font-medium">Live Trading Call</span>
                </button>
              </div>
            </div>

            {/* Main Chat Area - Right Side */}
            <div className="flex-1 flex flex-col bg-black relative min-h-0 overflow-hidden">
              {/* Channel Header */}
              <div className="flex-shrink-0 p-6 border-b border-gray-700 bg-gradient-to-r from-gray-900 to-gray-800">
                <div className="flex items-center space-x-4">
                  <h3 className="text-white font-bold text-2xl">
                    {channelCategories.flatMap(cat => cat.channels).find(c => c.id === activeTab)?.name || 'Channel'}
                  </h3>
                  {channelCategories.flatMap(cat => cat.channels).find(c => c.id === activeTab)?.adminOnly && (
                    <div className="px-3 py-2 bg-red-500/20 text-red-300 text-sm rounded-full font-bold border border-red-500/30 animate-pulse">
                      ADMIN ONLY
                    </div>
                  )}
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 p-4 space-y-4 overflow-y-auto custom-scrollbar min-h-0">
                {chatMessages[activeTab]?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <p className="text-lg">No messages yet in this channel</p>
                    <p className="text-sm">Start the conversation!</p>
                  </div>
                ) : (
                  chatMessages[activeTab]?.map((message) => {
                    const formatTime = (date: Date) => {
                      const now = new Date();
                      const diff = now.getTime() - date.getTime();
                      const minutes = Math.floor(diff / 60000);
                      const hours = Math.floor(diff / 3600000);
                      const days = Math.floor(diff / 86400000);
                      
                      if (minutes < 1) return 'just now';
                      if (minutes < 60) return `${minutes}m ago`;
                      if (hours < 24) return `${hours}h ago`;
                      return `${days}d ago`;
                    };

                    return (
                      <div key={message.id} className="flex space-x-3 group hover:bg-gray-900/20 p-3 rounded-lg transition-colors duration-200">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-semibold text-sm">
                            {message.user.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline space-x-2 mb-1">
                            <span className="font-semibold text-white text-sm">{message.user}</span>
                            {(message as any).userType === 'admin' && (
                              <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-medium">
                                ADMIN
                              </span>
                            )}
                            <span className="text-gray-400 text-xs">{formatTime(message.timestamp)}</span>
                          </div>
                          <div className="text-gray-300 text-sm leading-relaxed break-words">
                            {message.message}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Input Area */}
              <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-t border-gray-700/50 backdrop-blur-sm">
                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-8 right-8 mb-2 bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl backdrop-blur-lg z-50">
                    <div className="grid grid-cols-10 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                      {[
                        // Enhanced Stock Market Emoji Collection - Bullish Emojis (Green/Up Movement)
                        '📈', '🚀', '💚', '⬆️', '🔥', '💎', '🎯', '⚡', '🌟', '✨',
                        '🎉', '🏆', '🤑', '💰', '📊', '💹', '🏦', '💡', '🔔', '📢',
                        
                        // Bearish Emojis (Red/Down Movement)  
                        '📉', '❤️', '⬇️', '⚠️', '🛑', '🆘', '😰', '💔', '⛔',
                        
                        // General Reactions & Trading
                        '👍', '👎', '👌', '🤝', '🙏', '💯', '💥', '✅', '❌', '🤣',
                        '😊', '😍', '🥰', '😎', '🤩', '🥳', '😌', '😉', '🙂', '😇'
                      ].map((emoji, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setCurrentMessage(prev => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="text-2xl hover:bg-gray-800 p-2 rounded-lg transition-all duration-200 hover:scale-110"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input Container */}
                <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700">
                  <form onSubmit={sendMessage} className="flex items-center p-6 space-x-4">
                  <input
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={`Message ${channelCategories.flatMap(cat => cat.channels).find(c => c.id === activeTab)?.name || 'channel'}...`}
                    className="flex-1 bg-gray-800/80 text-white px-6 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 font-medium text-lg backdrop-blur-sm border border-gray-600 focus:border-blue-500 transition-all duration-200 shadow-lg"
                    autoFocus
                  />

                  {/* Emoji Button */}
                  <div className="relative emoji-picker-container">
                    <button 
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="group p-3 bg-gray-800 border border-gray-600 text-gray-400 hover:text-orange-400 hover:border-orange-400 transition-all duration-200 hover:bg-orange-500/10 rounded-xl"
                      title="Add emoji"
                    >
                      <span className="text-2xl group-hover:scale-110 transition-transform inline-block">😊</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={!currentMessage.trim()}
                    className={`group p-3 rounded-2xl transition-all duration-200 relative overflow-hidden ${
                      currentMessage.trim()
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white shadow-lg hover:shadow-blue-500/25 transform hover:scale-105'
                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                    title="Send message"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="group-hover:scale-110 transition-transform relative z-10">
                      <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/>
                    </svg>
                  </button>
                </form>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-black">
            {/* Personal Hub Content */}
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <TbUser className="text-white" size={18} />
                </div>
                <h4 className="text-white font-bold text-lg">Personal Hub</h4>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={takeScreenshot}
                  className="bg-gradient-to-br from-blue-600 to-cyan-600 text-white p-4 rounded-2xl hover:shadow-lg transition-all text-sm font-semibold group transform hover:scale-105"
                >
                  <TbPhoto size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                  <div>Screenshot</div>
                </button>
                <button
                  onClick={addNote}
                  className="bg-gradient-to-br from-emerald-600 to-green-600 text-white p-4 rounded-2xl hover:shadow-lg transition-all text-sm font-semibold group transform hover:scale-105"
                >
                  <TbNews size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                  <div>Note</div>
                </button>
                <button
                  onClick={addReminder}
                  className="bg-gradient-to-br from-violet-600 to-purple-600 text-white p-4 rounded-2xl hover:shadow-lg transition-all text-sm font-semibold group transform hover:scale-105"
                >
                  <TbBellRinging size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                  <div>Reminder</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

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
          
          /* Custom Scrollbar for Chat */
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #0a0a0a;
            border-radius: 3px;
          }
          
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, #3b82f6, #8b5cf6);
            border-radius: 3px;
          }
          
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, #2563eb, #7c3aed);
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
            background: linear-gradient(145deg, #1a1a1a 0%, #000000 50%, #1a1a1a 100%) !important;
            border: 1px solid rgba(128, 128, 128, 0.2) !important;
            color: #ff6600 !important;
            box-shadow: 
              inset 2px 2px 4px rgba(128, 128, 128, 0.05),
              inset -2px -2px 4px rgba(0, 0, 0, 0.8),
              0 4px 8px rgba(0, 0, 0, 0.6),
              0 0 0 1px rgba(64, 64, 64, 0.1) !important;
            text-shadow: 
              1px 1px 0px rgba(0, 0, 0, 0.9),
              -1px -1px 0px rgba(128, 128, 128, 0.1) !important;
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
            background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%) !important;
            color: #ff6600 !important;
            box-shadow: 
              inset 2px 2px 6px rgba(128, 128, 128, 0.1),
              inset -2px -2px 6px rgba(0, 0, 0, 0.9),
              0 6px 12px rgba(0, 0, 0, 0.7),
              0 0 0 1px rgba(96, 96, 96, 0.2) !important;
            text-shadow: 
              1px 1px 0px rgba(0, 0, 0, 0.9),
              -1px -1px 0px rgba(128, 128, 128, 0.1) !important;
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
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  onKeyPress={handleSearchKeyPress}
                  className="bg-transparent border-0 outline-none w-28 text-lg font-bold"
                  style={{
                    color: '#ffffff',
                    textShadow: '0 0 5px rgba(128, 128, 128, 0.2), 0 1px 2px rgba(0, 0, 0, 0.8)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    letterSpacing: '0.8px'
                  }}
                  placeholder={symbol || "Search..."}
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
          <div className="mx-4" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* GEX Button - Next to Expected Range */}
          <div className="ml-4">
            <button
              onClick={() => {
                const newActiveState = !isGexActive;
                setIsGexActive(newActiveState);
                console.log(`📊 GEX ${newActiveState ? 'activated' : 'deactivated'}`);
              }}
              className={`btn-3d-carved relative group flex items-center space-x-2 ${isGexActive ? 'active' : 'text-white'}`}
              style={{
                padding: '10px 14px',
                fontWeight: '700',
                fontSize: '13px',
                borderRadius: '4px'
              }}
            >
              <span>GEX</span>
              {isGexActive && (
                <span className="text-green-400 text-sm">✓</span>
              )}
            </button>
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-4" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Expansion/Liquidation Button */}
          <div className="ml-4">
            <button
              onClick={() => {
                const newActiveState = !isExpansionLiquidationActive;
                setIsExpansionLiquidationActive(newActiveState);
                
                if (newActiveState) {
                  // Calculate expansion/liquidation zones when activated
                  console.log('🎯 Expansion/Liquidation indicator activated');
                  // This will trigger the detection algorithm in the canvas rendering
                } else {
                  // Clear zones when deactivated
                  setExpansionLiquidationZones([]);
                  console.log('🎯 Expansion/Liquidation indicator deactivated');
                }
              }}
              className={`btn-3d-carved relative group flex items-center space-x-2 ${isExpansionLiquidationActive ? 'active' : 'text-white'}`}
              style={{
                padding: '10px 14px',
                fontWeight: '700',
                fontSize: '13px',
                borderRadius: '4px'
              }}
            >
              <span>EXPANSION/LIQUIDATION</span>
              {isExpansionLiquidationActive && (
                <span className="text-green-400 text-sm">✓</span>
              )}
            </button>
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-4" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Live C/P Flow Button */}
          <div className="ml-4">
            <button
              onClick={async () => {
                console.log(`🔄 DEBUG: C/P Flow button clicked! Current timeframe: ${config.timeframe}, Current active state: ${isCPFlowActive}`);
                
                // Only allow C/P Flow on 30m or 5m timeframes for detail
                if (config.timeframe !== '30m' && config.timeframe !== '5m') {
                  console.log(`⚠️ DEBUG: C/P Flow blocked - current timeframe is ${config.timeframe}, need 30m or 5m`);
                  alert(`C/P Flow only available on 30m or 5m timeframes. Current: ${config.timeframe}`);
                  return;
                }
                
                console.log(`✅ DEBUG: Timeframe check passed, toggling C/P Flow state...`);
                
                const newActiveState = !isCPFlowActive;
                setIsCPFlowActive(newActiveState);
                
                if (newActiveState) {
                  console.log('📊 DEBUG: C/P Flow indicator ACTIVATED - fetching real-time data');
                  
                  try {
                    console.log(`🔄 DEBUG: About to call fetchRealCPFlowData for symbol: ${symbol}`);
                    const realData = await fetchRealCPFlowData();
                    console.log(`📊 DEBUG: Received ${realData.length} data points:`, realData.slice(0, 3));
                    
                    if (realData.length > 0) {
                      console.log(`✅ DEBUG: Setting ${realData.length} C/P Flow data points to state`);
                      setCPFlowData(realData);
                      console.log(`✅ DEBUG: C/P Flow data set successfully! Force re-render...`);
                      
                      // Force chart re-render
                      setTimeout(() => {
                        console.log(`🔄 DEBUG: Triggering chart re-render after C/P Flow data set`);
                        const canvas = chartCanvasRef.current;
                        if (canvas) {
                          const rect = canvas.getBoundingClientRect();
                          // Trigger a resize event to force re-render
                          canvas.dispatchEvent(new Event('resize'));
                        }
                      }, 100);
                    } else {
                      console.warn(`⚠️ DEBUG: No C/P Flow data received for ${symbol}`);
                      alert(`No C/P Flow data found for ${symbol}. Make sure there are options trades for this symbol.`);
                    }
                  } catch (error) {
                    console.error('❌ DEBUG: Error fetching C/P Flow data:', error);
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    alert(`Error fetching C/P Flow data: ${errorMessage}`);
                  }
                } else {
                  console.log('📊 DEBUG: C/P Flow indicator DEACTIVATED');
                  setCPFlowData([]); // Clear data when deactivated
                }
              }}
              className={`btn-3d-carved relative group flex items-center space-x-2 text-white ${isCPFlowActive ? 'active' : ''} ${config.timeframe !== '30m' && config.timeframe !== '5m' ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{
                padding: '10px 14px',
                fontWeight: '700',
                fontSize: '13px',
                borderRadius: '4px'
              }}
              title={config.timeframe !== '30m' && config.timeframe !== '5m' ? 'C/P Flow only available on 30m or 5m timeframes' : 'Toggle C/P Flow indicator'}
            >
              <span>LIVE C/P FLOW</span>
              {isCPFlowActive && (
                <div 
                  className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full"
                  style={{
                    boxShadow: '0 0 6px rgba(34, 197, 94, 0.8)',
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                  }}
                />
              )}
            </button>
          </div>

          {/* Glowing Orange Separator */}
          <div className="mx-4" style={{
            width: '4px',
            height: '50px',
            background: 'linear-gradient(180deg, transparent 0%, #ff6600 15%, #ff8833 50%, #ff6600 85%, transparent 100%)',
            boxShadow: '0 0 12px rgba(255, 102, 0, 0.8), 0 0 24px rgba(255, 102, 0, 0.4), 0 0 32px rgba(255, 102, 0, 0.2)',
            borderRadius: '2px'
          }}></div>

          {/* Drawing Tools Button */}
          <div className="ml-4 relative">
            <button
              ref={drawingsButtonRef}
              onClick={() => setIsDrawingsDropdownOpen(!isDrawingsDropdownOpen)}
              className={`btn-3d-carved relative group flex items-center space-x-2 text-white ${(isHorizontalRayMode || isParallelChannelMode || isDrawingBrushMode) ? 'active' : ''}`}
              style={{
                padding: '10px 14px',
                fontWeight: '700',
                fontSize: '13px',
                borderRadius: '4px'
              }}
              title="Drawing Tools"
            >
              <span>🎨 DRAWINGS</span>
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {(isHorizontalRayMode || isParallelChannelMode || isDrawingBrushMode) && (
                <div 
                  className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full"
                  style={{
                    boxShadow: '0 0 6px rgba(33, 150, 243, 0.8)',
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                  }}
                />
              )}
            </button>

            {/* Dropdown Menu */}
            {isDrawingsDropdownOpen && createPortal(
              <div 
                className="absolute w-48 bg-gray-800 border border-gray-600 rounded-md shadow-lg" 
                style={{ 
                  top: drawingsButtonRef.current ? drawingsButtonRef.current.getBoundingClientRect().bottom + 4 : 100,
                  left: drawingsButtonRef.current ? drawingsButtonRef.current.getBoundingClientRect().left : 400,
                  zIndex: 99999,
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                  background: 'rgba(40, 40, 40, 0.98)',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <div className="py-1">
                  <button
                    onClick={() => {
                      activateToolExclusively(isHorizontalRayMode ? 'none' : 'horizontal');
                      setIsDrawingsDropdownOpen(false);
                      console.log('🎨 Horizontal Ray mode:', !isHorizontalRayMode);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center space-x-2 ${isHorizontalRayMode ? 'bg-gray-700' : ''}`}
                  >
                    <span>📏</span>
                    <span>Horizontal Ray</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      activateToolExclusively(isParallelChannelMode ? 'none' : 'channel');
                      setIsDrawingsDropdownOpen(false);
                      console.log('🎨 Parallel Channel mode:', !isParallelChannelMode);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center space-x-2 ${isParallelChannelMode ? 'bg-gray-700' : ''}`}
                    title="Click 3 points: 1) Start trend line 2) End trend line 3) Define channel width"
                  >
                    <span>📊</span>
                    <span>Parallel Channels</span>
                  </button>

                  <button
                    onClick={() => {
                      activateToolExclusively(isDrawingBrushMode ? 'none' : 'brush');
                      setIsDrawingsDropdownOpen(false);
                      console.log('🎨 Drawing Brush mode:', !isDrawingBrushMode);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 flex items-center space-x-2 ${isDrawingBrushMode ? 'bg-gray-700' : ''}`}
                    title="Hold and drag to draw freehand on the chart"
                  >
                    <span>🖌️</span>
                    <span>Drawing Brush</span>
                  </button>
                </div>
              </div>, 
              document.body
            )}

            {/* Click outside to close dropdown */}
            {isDrawingsDropdownOpen && createPortal(
              <div 
                className="fixed inset-0" 
                style={{ zIndex: 99998 }}
                onClick={() => setIsDrawingsDropdownOpen(false)}
              />, 
              document.body
            )}
            
            {/* Drawing Lock Toggle */}
            {(isHorizontalRayMode || isParallelChannelMode || isDrawingBrushMode) && (
              <button
                onClick={() => setIsDrawingLocked(!isDrawingLocked)}
                className={`btn-3d-carved absolute top-0 -right-8 w-6 h-6 flex items-center justify-center text-xs ${isDrawingLocked ? 'active' : ''}`}
                title={`Drawing Lock: ${isDrawingLocked ? 'ON - Tool stays active' : 'OFF - Tool deactivates after use'}`}
                style={{
                  backgroundColor: isDrawingLocked ? '#2196F3' : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '3px'
                }}
              >
                🔒
              </button>
            )}
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
            <label className="block text-[#d1d4dc] text-sm font-medium mb-3">📊 Volume Bars</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bullish Volume</span>
                <input
                  type="color"
                  value={config.colors.volume.bullish}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      volume: { ...prev.colors.volume, bullish: e.target.value }
                    }
                  }))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-[#787b86] text-sm">Bearish Volume</span>
                <input
                  type="color"
                  value={config.colors.volume.bearish}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig(prev => ({
                    ...prev,
                    colors: {
                      ...prev.colors,
                      volume: { ...prev.colors.volume, bearish: e.target.value }
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
                    volume: { bullish: '#26a69a', bearish: '#ef5350' }
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
                    volume: { bullish: '#00d4aa', bearish: '#fb8c00' }
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
                    volume: { bullish: '#4caf50', bearish: '#f44336' }
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
                    volume: { bullish: '#2196f3', bearish: '#9c27b0' }
                  }
                }))}
                className="px-3 py-2 bg-[#131722] text-[#787b86] rounded text-sm hover:text-white hover:bg-[#2a2e39] transition-colors"
              >
                Ocean
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
              { id: 'calc', icon: TbCalculator, label: 'Calc', color: 'from-gray-800 to-gray-900', accent: 'cyan' },
              { id: 'chain', icon: TbLink, label: 'Chain', color: 'from-gray-800 to-gray-900', accent: 'cyan' },
              { id: 'plan', icon: TbChartLine, label: 'Plan', color: 'from-gray-800 to-gray-900', accent: 'purple' },
              { id: 'chat', icon: TbMessageCircle, label: 'Chat', color: 'from-gray-800 to-gray-900', accent: 'violet' }
            ].map((item, index) => {
              const IconComponent = item.icon;
              const accentColors: { [key: string]: string } = {
                blue: 'text-blue-400 group-hover:text-blue-300',
                emerald: 'text-emerald-400 group-hover:text-emerald-300',
                amber: 'text-amber-400 group-hover:text-amber-300',
                red: 'text-red-400 group-hover:text-red-300',
                violet: 'text-violet-400 group-hover:text-violet-300',
                cyan: 'text-cyan-400 group-hover:text-cyan-300',
                purple: 'text-purple-400 group-hover:text-purple-300'
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
              <span className="text-white text-lg">Loading {config.timeframe} data for {symbol}...</span>
              <div className="mt-2 text-sm text-gray-400">
                Optimized for fast loading • Reduced dataset for speed
              </div>
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

        {/* Y-Axis Auto-Scale Toggle Button - Removed as auto-scale is always enabled by default */}

        {/* Main Chart Canvas */}
        <canvas
          ref={chartCanvasRef}
          className="absolute top-0 left-0 z-10"
          style={{ height: chartHeight }}
        />

        {/* Crosshair and Interaction Overlay */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 z-20"
          tabIndex={0}
          style={{ 
            cursor: isParallelChannelMode ? 'copy' : 
                   isDrawingBrushMode ? 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjMiIGZpbGw9IiNGRjY5QjQiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIxIi8+Cjwvc3ZnPgo=) 8 8, crosshair' :
                   activeTool ? 'crosshair' : 
                   isDragging ? 'grabbing' : 'crosshair',
            transition: 'cursor 0.1s ease',
            outline: 'none'
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
        <div className="fixed top-32 bottom-4 left-16 w-[1000px] bg-[#0a0a0a] border-r border-[#1a1a1a] shadow-2xl z-40 transform transition-transform duration-300 ease-out rounded-lg overflow-hidden">
{/* Sidebar panel debugging */}
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
          <div className="h-[calc(100%-3rem)] overflow-y-auto">
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
              <NewsPanel symbol={config.symbol} />
            )}
            {activeSidebarPanel === 'alerts' && (
              <div className="p-4 text-center text-white text-opacity-50">
                Alerts section coming soon...
              </div>
            )}
            {activeSidebarPanel === 'calc' && (
              <OptionsCalculator initialSymbol={config.symbol} />
            )}
            {activeSidebarPanel === 'chain' && (
              <div className="p-4 text-center text-white text-opacity-50">
                Options Chain coming soon...
              </div>
            )}
            {activeSidebarPanel === 'plan' && (
              <TradingPlan />
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

      {/* Horizontal Ray Property Editor */}
      {selectedRay && (
        <div 
          className="absolute top-32 right-6 bg-black border border-gray-700 rounded-xl shadow-2xl z-50 min-w-[300px] max-w-[350px]"
          style={{ 
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)'
          }}
        >
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <h3 className="text-white font-semibold text-base">Horizontal Ray</h3>
            </div>
            <button
              onClick={() => {
                setIsEditingRay(false);
                setSelectedRay(null);
              }}
              className="text-gray-400 hover:text-white text-lg font-semibold w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-700 transition-all"
            >
              ×
            </button>
          </div>

          {(() => {
            const ray = horizontalRays.find(r => r.id === selectedRay);
            if (!ray) return null;

            return (
              <div className="p-4 space-y-5">
                {/* Price Configuration Section */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-4 h-0.5 bg-yellow-500"></div>
                    <span className="text-white font-medium text-sm">Price Level</span>
                  </div>
                  
                  {/* Price Input */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2 font-medium">Price Value</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={ray.price.toFixed(2)}
                        onChange={(e) => {
                          const newPrice = parseFloat(e.target.value);
                          if (!isNaN(newPrice)) {
                            updateHorizontalRayPrice(selectedRay, newPrice);
                          }
                        }}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm font-mono focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-20 transition-all"
                        step="0.01"
                        placeholder="0.00"
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs font-medium">
                        USD
                      </div>
                    </div>
                  </div>
                </div>

                {/* Line Styling Section */}
                <div className="space-y-3 border-t border-gray-700 pt-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-4 h-0.5 bg-blue-500"></div>
                    <span className="text-white font-medium text-sm">Line Styling</span>
                  </div>
                  
                  {/* Color Picker */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2 font-medium">Color</label>
                    <div className="grid grid-cols-6 gap-2">
                      {['#FFD700', '#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0'].map(color => (
                        <button
                          key={color}
                          onClick={() => updateHorizontalRayStyle(selectedRay, { color })}
                          className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-105 ${
                            ray.color === color 
                              ? 'border-white shadow-lg ring-2 ring-white ring-opacity-50' 
                              : 'border-gray-600 hover:border-gray-400'
                          }`}
                          style={{ backgroundColor: color }}
                          title={`Select ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Line Style */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2 font-medium">Style</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { type: 'solid', label: '━━━━━', title: 'Solid Line' },
                        { type: 'dashed', label: '┅ ┅ ┅ ┅', title: 'Dashed Line' },
                        { type: 'dotted', label: '⋯ ⋯ ⋯ ⋯', title: 'Dotted Line' }
                      ].map(({ type, label, title }) => (
                        <button
                          key={type}
                          onClick={() => updateHorizontalRayStyle(selectedRay, { lineStyle: type as any })}
                          className={`px-3 py-3 text-sm rounded-lg font-mono transition-all ${
                            ray.lineStyle === type 
                              ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400 ring-opacity-50' 
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                          }`}
                          title={title}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Thickness */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2 font-medium">Thickness</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map(thickness => (
                        <button
                          key={thickness}
                          onClick={() => updateHorizontalRayStyle(selectedRay, { lineWidth: thickness })}
                          className={`px-4 py-3 text-sm rounded-lg font-semibold transition-all ${
                            ray.lineWidth === thickness 
                              ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400 ring-opacity-50' 
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                          }`}
                          title={`${thickness}px thickness`}
                        >
                          {thickness}px
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions Section */}
                <div className="border-t border-gray-700 pt-4">
                  <button
                    onClick={() => {
                      if (confirm('🗑️ Delete this horizontal ray?\n\nThis action cannot be undone.')) {
                        deleteHorizontalRay(selectedRay);
                      }
                    }}
                    className="w-full px-4 py-3 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-red-500/25"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <span>🗑️</span>
                      <span>Delete Ray</span>
                    </div>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Parallel Channel Property Editor */}
      {selectedChannel && (
        <div 
          className="absolute top-32 right-6 bg-black border border-gray-700 rounded-xl shadow-2xl z-50 min-w-[300px] max-w-[350px]"
          style={{ 
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)'
          }}
        >
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <h3 className="text-white font-semibold text-base">Parallel Channel</h3>
            </div>
            <button
              onClick={() => {
                setIsEditingChannel(false);
                setSelectedChannel(null);
              }}
              className="text-gray-400 hover:text-white text-lg font-semibold w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-700 transition-all"
            >
              ×
            </button>
          </div>

          {(() => {
            const channel = parallelChannels.find(c => c.id === selectedChannel);
            if (!channel) return null;

            return (
              <div className="p-4 space-y-5">
                {/* Line Styling Section */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-4 h-0.5 bg-blue-500"></div>
                    <span className="text-white font-medium text-sm">Line Styling</span>
                  </div>
                  
                  {/* Line Color */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2 font-medium">Color</label>
                    <div className="grid grid-cols-6 gap-2">
                      {['#00BFFF', '#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0'].map(color => (
                        <button
                          key={color}
                          onClick={() => {
                            setParallelChannels(prev => 
                              prev.map(ch => 
                                ch.id === selectedChannel 
                                  ? { ...ch, color }
                                  : ch
                              )
                            );
                          }}
                          className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-105 ${
                            channel.color === color 
                              ? 'border-white shadow-lg ring-2 ring-white ring-opacity-50' 
                              : 'border-gray-600 hover:border-gray-400'
                          }`}
                          style={{ backgroundColor: color }}
                          title={`Select ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Line Style */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2 font-medium">Style</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { type: 'solid', label: '━━━━━', title: 'Solid Line' },
                        { type: 'dashed', label: '┅ ┅ ┅ ┅', title: 'Dashed Line' },
                        { type: 'dotted', label: '⋯ ⋯ ⋯ ⋯', title: 'Dotted Line' }
                      ].map(({ type, label, title }) => (
                        <button
                          key={type}
                          onClick={() => {
                            setParallelChannels(prev => 
                              prev.map(ch => 
                                ch.id === selectedChannel 
                                  ? { ...ch, lineStyle: type as any }
                                  : ch
                              )
                            );
                          }}
                          className={`px-3 py-3 text-sm rounded-lg font-mono transition-all ${
                            channel.lineStyle === type 
                              ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400 ring-opacity-50' 
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                          }`}
                          title={title}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Line Thickness */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-2 font-medium">Thickness</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map(thickness => (
                        <button
                          key={thickness}
                          onClick={() => {
                            setParallelChannels(prev => 
                              prev.map(ch => 
                                ch.id === selectedChannel 
                                  ? { ...ch, lineWidth: thickness }
                                  : ch
                              )
                            );
                          }}
                          className={`px-4 py-3 text-sm rounded-lg font-semibold transition-all ${
                            channel.lineWidth === thickness 
                              ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400 ring-opacity-50' 
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                          }`}
                          title={`${thickness}px thickness`}
                        >
                          {thickness}px
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Fill Section */}
                <div className="space-y-3 border-t border-gray-700 pt-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-4 h-0.5 bg-purple-500"></div>
                    <span className="text-white font-medium text-sm">Fill Styling</span>
                  </div>

                  {/* Show Fill Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300 text-sm font-medium">Enable Fill</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={channel.showFill !== false}
                        onChange={(e) => {
                          setParallelChannels(prev => 
                            prev.map(ch => 
                              ch.id === selectedChannel 
                                ? { ...ch, showFill: e.target.checked }
                                : ch
                            )
                          );
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {/* Fill Color */}
                  {channel.showFill !== false && (
                    <div>
                      <label className="block text-gray-300 text-sm mb-2 font-medium">Fill Color</label>
                      <div className="grid grid-cols-6 gap-2">
                        {['#00BFFF33', '#2196F333', '#4CAF5033', '#FF980033', '#F4433633', '#9C27B033'].map((color, idx) => {
                          const baseColors = ['#00BFFF', '#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0'];
                          return (
                            <button
                              key={color}
                              onClick={() => {
                                setParallelChannels(prev => 
                                  prev.map(ch => 
                                    ch.id === selectedChannel 
                                      ? { ...ch, fillColor: color }
                                      : ch
                                  )
                                );
                              }}
                              className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-105 relative overflow-hidden ${
                                channel.fillColor === color 
                                  ? 'border-white shadow-lg ring-2 ring-white ring-opacity-50' 
                                  : 'border-gray-600 hover:border-gray-400'
                              }`}
                              style={{ backgroundColor: baseColors[idx] }}
                              title={`Fill with ${baseColors[idx]}`}
                            >
                              <div className="absolute inset-0 bg-current opacity-20"></div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions Section */}
                <div className="border-t border-gray-700 pt-4">
                  <button
                    onClick={() => {
                      if (confirm('🗑️ Delete this parallel channel?\n\nThis action cannot be undone.')) {
                        setParallelChannels(prev => prev.filter(ch => ch.id !== selectedChannel));
                        setSelectedChannel(null);
                        setIsEditingChannel(false);
                        setChannelDragStart(null);
                      }
                    }}
                    className="w-full px-4 py-3 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-red-500/25"
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <span>🗑️</span>
                      <span>Delete Channel</span>
                    </div>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
