'use client';

import React, { useState, useMemo } from 'react';
import { 
  generatePnLSimulation, 
  generateTimeDecaySimulation,
  calculateBreakeven,
  calculateMaxProfitLoss
} from '../../lib/blackScholesCalculator';

interface BlackScholesPnLCalculatorProps {
  // Live market data
  currentStockPrice: number;
  strikePrice: number;
  premiumPrice: number; // Purchase price from the premium input
  daysToExpiration: number;
  impliedVolatility: number;
  optionType: 'call' | 'put';
  
  // Optional parameters
  riskFreeRate?: number;
  dividendYield?: number;
  numContracts?: number;
}

const BlackScholesPnLCalculator: React.FC<BlackScholesPnLCalculatorProps> = ({
  currentStockPrice,
  strikePrice,
  premiumPrice,
  daysToExpiration,
  impliedVolatility,
  optionType,
  riskFreeRate = 0.045, // 4.5% default
  dividendYield = 0,
  numContracts = 1
}) => {
  const [simulationType, setSimulationType] = useState<'price' | 'time'>('price');
  const [priceRange, setPriceRange] = useState(0.5); // 50% range
  
  // Calculate time to expiry in years
  const timeToExpiry = daysToExpiration / 365;
  
  // Generate P&L simulation data
  const priceSimulation = useMemo(() => {
    if (!currentStockPrice || !strikePrice || !premiumPrice || timeToExpiry < 0) return [];
    
    return generatePnLSimulation(
      currentStockPrice,
      strikePrice,
      premiumPrice,
      timeToExpiry,
      impliedVolatility,
      optionType === 'call',
      riskFreeRate,
      dividendYield,
      numContracts,
      priceRange
    );
  }, [currentStockPrice, strikePrice, premiumPrice, timeToExpiry, impliedVolatility, optionType, riskFreeRate, dividendYield, numContracts, priceRange]);
  
  // Generate time decay simulation
  const timeSimulation = useMemo(() => {
    if (!currentStockPrice || !strikePrice || !premiumPrice || daysToExpiration < 0) return [];
    
    return generateTimeDecaySimulation(
      currentStockPrice,
      strikePrice,
      premiumPrice,
      daysToExpiration,
      impliedVolatility,
      optionType === 'call',
      riskFreeRate,
      dividendYield,
      numContracts
    );
  }, [currentStockPrice, strikePrice, premiumPrice, daysToExpiration, impliedVolatility, optionType, riskFreeRate, dividendYield, numContracts]);
  
  // Calculate key metrics
  const breakeven = useMemo(() => {
    return calculateBreakeven(strikePrice, premiumPrice, optionType === 'call');
  }, [strikePrice, premiumPrice, optionType]);
  
  const { maxProfit, maxLoss } = useMemo(() => {
    return calculateMaxProfitLoss(strikePrice, premiumPrice, optionType === 'call', numContracts);
  }, [strikePrice, premiumPrice, optionType, numContracts]);
  
  // Find current position P&L
  const currentPnL = useMemo(() => {
    const current = priceSimulation.find(p => Math.abs(p.stockPrice - currentStockPrice) < 0.01);
    return current || { dollarPnL: 0, percentPnL: 0 };
  }, [priceSimulation, currentStockPrice]);
  
  // Chart dimensions
  const chartWidth = 600;
  const chartHeight = 300;
  const padding = 40;
  
  // Render P&L chart
  const renderPnLChart = () => {
    const data = simulationType === 'price' ? priceSimulation : timeSimulation;
    if (data.length === 0) return null;
    
    const xKey = simulationType === 'price' ? 'stockPrice' : 'daysToExpiry';
    const xValues = data.map(d => d[xKey as keyof typeof d] as number);
    const yValues = data.map(d => d.dollarPnL);
    
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues, 0);
    const yMax = Math.max(...yValues, 0);
    
    // Add some padding to the ranges
    const yRange = yMax - yMin || 1000;
    const yPadding = yRange * 0.1;
    const adjustedYMin = yMin - yPadding;
    const adjustedYMax = yMax + yPadding;
    
    const scaleX = (x: number) => ((x - xMin) / (xMax - xMin)) * (chartWidth - 2 * padding) + padding;
    const scaleY = (y: number) => chartHeight - (((y - adjustedYMin) / (adjustedYMax - adjustedYMin)) * (chartHeight - 2 * padding) + padding);
    
    // Generate path
    const pathData = data.map((point, index) => {
      const x = scaleX(point[xKey as keyof typeof point] as number);
      const y = scaleY(point.dollarPnL);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
    
    // Zero line
    const zeroY = scaleY(0);
    
    return (
      <div className="bg-gray-900 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-white font-semibold">
            {simulationType === 'price' ? 'P&L vs Stock Price' : 'P&L vs Time Decay'}
          </h4>
          <div className="flex space-x-2">
            <button
              onClick={() => setSimulationType('price')}
              className={`px-3 py-1 text-xs rounded ${
                simulationType === 'price'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Price
            </button>
            <button
              onClick={() => setSimulationType('time')}
              className={`px-3 py-1 text-xs rounded ${
                simulationType === 'time'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Time
            </button>
          </div>
        </div>
        
        <svg width={chartWidth} height={chartHeight} className="border border-gray-700 rounded">
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 30" fill="none" stroke="#374151" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Zero line */}
          <line 
            x1={padding} 
            y1={zeroY} 
            x2={chartWidth - padding} 
            y2={zeroY} 
            stroke="#6B7280" 
            strokeWidth="2" 
            strokeDasharray="5,5"
          />
          
          {/* P&L curve */}
          <path
            d={pathData}
            fill="none"
            stroke="#10B981"
            strokeWidth="3"
          />
          
          {/* Current position marker */}
          {simulationType === 'price' && (
            <circle
              cx={scaleX(currentStockPrice)}
              cy={scaleY(currentPnL.dollarPnL)}
              r="6"
              fill="#F59E0B"
              stroke="#FFF"
              strokeWidth="2"
            />
          )}
          
          {/* Breakeven line for price simulation */}
          {simulationType === 'price' && (
            <line
              x1={scaleX(breakeven)}
              y1={padding}
              x2={scaleX(breakeven)}
              y2={chartHeight - padding}
              stroke="#EF4444"
              strokeWidth="2"
              strokeDasharray="3,3"
            />
          )}
          
          {/* Axis labels */}
          <text x={chartWidth / 2} y={chartHeight - 5} textAnchor="middle" className="fill-gray-400 text-xs">
            {simulationType === 'price' ? 'Stock Price ($)' : 'Days to Expiration'}
          </text>
          <text 
            x="15" 
            y={chartHeight / 2} 
            textAnchor="middle" 
            transform={`rotate(-90 15 ${chartHeight / 2})`}
            className="fill-gray-400 text-xs"
          >
            Profit/Loss ($)
          </text>
        </svg>
        
        {/* Price range control for price simulation */}
        {simulationType === 'price' && (
          <div className="mt-4 flex items-center space-x-4">
            <label className="text-gray-400 text-sm">Price Range:</label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={priceRange}
              onChange={(e) => setPriceRange(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-white text-sm">±{(priceRange * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-4">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs">Current P&L</div>
          <div className={`text-lg font-bold ${currentPnL.dollarPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${currentPnL.dollarPnL.toFixed(0)}
          </div>
          <div className={`text-xs ${currentPnL.percentPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {currentPnL.percentPnL > 0 ? '+' : ''}{currentPnL.percentPnL.toFixed(1)}%
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs">Breakeven</div>
          <div className="text-lg font-bold text-yellow-400">
            ${breakeven.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400">
            {optionType === 'call' ? 'Above' : 'Below'} for profit
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs">Max Profit</div>
          <div className="text-lg font-bold text-green-400">
            {maxProfit === Infinity ? 'Unlimited' : `$${maxProfit.toFixed(0)}`}
          </div>
          <div className="text-xs text-gray-400">
            {optionType === 'call' ? 'If stock rises' : 'If stock falls to $0'}
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-gray-400 text-xs">Max Loss</div>
          <div className="text-lg font-bold text-red-400">
            ${maxLoss.toFixed(0)}
          </div>
          <div className="text-xs text-gray-400">
            Premium paid
          </div>
        </div>
      </div>
      
      {/* P&L Chart */}
      {renderPnLChart()}
      
      {/* Market Data Summary */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h4 className="text-white font-semibold mb-3">Position Details</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-400">Stock Price</div>
            <div className="text-white font-mono">${currentStockPrice.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-400">Strike Price</div>
            <div className="text-white font-mono">${strikePrice.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-400">Premium Paid</div>
            <div className="text-white font-mono">${premiumPrice.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-400">Days to Exp.</div>
            <div className="text-white font-mono">{daysToExpiration}</div>
          </div>
          <div>
            <div className="text-gray-400">Implied Vol</div>
            <div className="text-white font-mono">{(impliedVolatility * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-gray-400">Option Type</div>
            <div className="text-white font-mono uppercase">{optionType}</div>
          </div>
          <div>
            <div className="text-gray-400">Contracts</div>
            <div className="text-white font-mono">{numContracts}</div>
          </div>
          <div>
            <div className="text-gray-400">Total Premium</div>
            <div className="text-white font-mono">${(premiumPrice * numContracts * 100).toFixed(0)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlackScholesPnLCalculator;