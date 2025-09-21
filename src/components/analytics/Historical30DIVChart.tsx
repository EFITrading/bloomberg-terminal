"use client";

import React, { useState, useEffect } from 'react';

interface IVDataPoint {
  date: string;
  iv30: number;
  timestamp: number;
}

interface Historical30DIVChartProps {
  ticker?: string;
}

const Historical30DIVChart: React.FC<Historical30DIVChartProps> = ({ ticker = "SPY" }) => {
  const [ivData, setIvData] = useState<IVDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistoricalIV = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/historical-iv?ticker=${ticker}&days=250`);
      const result = await response.json();
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch historical IV data');
      }

      setIvData(result.data);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch historical IV data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoricalIV();
  }, [ticker]);

  const currentIV = ivData.length > 0 ? ivData[ivData.length - 1].iv30 : 0;

  return (
    <div className="bg-black border border-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">
            Historical 30-Day Implied Volatility
          </h3>
          <p className="text-gray-400 text-sm">
            {ticker} • 250-Day Historical IV • Real Polygon Data
          </p>
        </div>
        
        <div className="text-right">
          <div className="text-2xl font-bold text-orange-500">
            {currentIV.toFixed(1)}%
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="text-orange-500">Loading...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-4">
          <p className="text-red-400">❌ {error}</p>
        </div>
      )}

      {!loading && !error && ivData.length > 0 && (
        <div className="relative">
          {/* Chart SVG */}
          <svg width="900" height="400" className="w-full bg-gray-900 rounded-lg">
            <defs>
              <linearGradient id="ivGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FF6600" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#FF6600" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            
            {/* Chart area */}
            <g transform="translate(80, 40)">
              {/* Grid lines and labels */}
              {[0, 1, 2, 3, 4, 5].map(i => {
                const minIV = Math.min(...ivData.map(d => d.iv30));
                const maxIV = Math.max(...ivData.map(d => d.iv30));
                const ivValue = minIV + (maxIV - minIV) * i / 5;
                const y = 300 - (i * 60);
                
                return (
                  <g key={i}>
                    <line x1={0} y1={y} x2={740} y2={y} stroke="#333" strokeWidth={0.5} />
                    <text x={-10} y={y + 4} fill="#666" fontSize="12" textAnchor="end">
                      {ivValue.toFixed(1)}%
                    </text>
                  </g>
                );
              })}
              
              {/* Chart line */}
              {ivData.length > 1 && (
                <>
                  {/* Area fill */}
                  <path
                    d={`M 0 300 ${ivData.map((d, i) => {
                      const x = (i / (ivData.length - 1)) * 740;
                      const minIV = Math.min(...ivData.map(d => d.iv30));
                      const maxIV = Math.max(...ivData.map(d => d.iv30));
                      const y = 300 - ((d.iv30 - minIV) / (maxIV - minIV)) * 300;
                      return `L ${x} ${y}`;
                    }).join(' ')} L 740 300 Z`}
                    fill="url(#ivGradient)"
                  />
                  
                  {/* Main line */}
                  <path
                    d={`M ${ivData.map((d, i) => {
                      const x = (i / (ivData.length - 1)) * 740;
                      const minIV = Math.min(...ivData.map(d => d.iv30));
                      const maxIV = Math.max(...ivData.map(d => d.iv30));
                      const y = 300 - ((d.iv30 - minIV) / (maxIV - minIV)) * 300;
                      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                    }).join(' ')}`}
                    fill="none"
                    stroke="#FF6600"
                    strokeWidth={2}
                  />
                  
                  {/* Current point */}
                  {(() => {
                    const lastPoint = ivData[ivData.length - 1];
                    const x = 740;
                    const minIV = Math.min(...ivData.map(d => d.iv30));
                    const maxIV = Math.max(...ivData.map(d => d.iv30));
                    const y = 300 - ((lastPoint.iv30 - minIV) / (maxIV - minIV)) * 300;
                    
                    return (
                      <>
                        <circle cx={x} cy={y} r={4} fill="#FF6600" stroke="#fff" strokeWidth={2} />
                        <text x={x + 10} y={y - 10} fill="#FF6600" fontSize="14" fontWeight="bold">
                          {lastPoint.iv30.toFixed(1)}%
                        </text>
                      </>
                    );
                  })()}
                </>
              )}
              
              {/* Date labels */}
              {[0, 1, 2, 3, 4].map(i => {
                const dataIndex = Math.floor((ivData.length - 1) * i / 4);
                const d = ivData[dataIndex];
                if (!d) return null;
                
                const x = (i / 4) * 740;
                const date = new Date(d.timestamp);
                const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                return (
                  <text key={i} x={x} y={330} fill="#666" fontSize="11" textAnchor="middle">
                    {label}
                  </text>
                );
              })}
            </g>
            
            {/* Title */}
            <text x={450} y={25} fill="#FF6600" fontSize="16" fontWeight="bold" textAnchor="middle">
              SPY Historical 30D Implied Volatility
            </text>
            
            {/* Y-axis label */}
            <text x={25} y={220} fill="#888" fontSize="14" textAnchor="middle" transform="rotate(-90, 25, 220)">
              IV (%)
            </text>
          </svg>
          
          {/* Stats */}
          <div className="mt-4 grid grid-cols-4 gap-4 text-center">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-400 text-xs">CURRENT</div>
              <div className="text-white font-bold">{currentIV.toFixed(1)}%</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-400 text-xs">HIGH</div>
              <div className="text-green-500 font-bold">
                {Math.max(...ivData.map(d => d.iv30)).toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-400 text-xs">LOW</div>
              <div className="text-red-500 font-bold">
                {Math.min(...ivData.map(d => d.iv30)).toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="text-gray-400 text-xs">AVG</div>
              <div className="text-orange-500 font-bold">
                {(ivData.reduce((sum, d) => sum + d.iv30, 0) / ivData.length).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && ivData.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No historical IV data available</p>
        </div>
      )}
    </div>
  );
};

export default Historical30DIVChart;
