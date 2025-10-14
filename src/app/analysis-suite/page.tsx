'use client';

import React, { useState, useEffect } from 'react';
import OpenInterestChart from '../../components/analytics/OpenInterestChart';
import GEXScreener from '../../components/analytics/GEXScreener';

export default function AnalysisSuite() {
  // Pass ticker and expiration to OpenInterestChart and get them back
  const [selectedTicker, setSelectedTicker] = useState('SPY');
  const [selectedExpiration, setSelectedExpiration] = useState(''); // Start empty, let OpenInterestChart set it
  const [currentPrice, setCurrentPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <div style={{ 
      background: 'transparent', 
      minHeight: '100vh', 
      padding: '20px',
      color: 'white',
      fontFamily: '"Roboto Mono", monospace',
      position: 'relative',
      zIndex: 1
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Gauges Bar */}
        <div style={{
          height: '120px',
          marginBottom: '15px',
          background: 'rgba(0, 0, 0, 0.9)',
          border: '1px solid #ff9900',
          borderRadius: '0px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '20px'
        }}>
          {/* Dealer Drypoweder Gauge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px' }}>
              <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="#333"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="#00ff88"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 35}`}
                  strokeDashoffset={`${2 * Math.PI * 35 * (1 - 0.75)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 'bold'
              }}>
                75
              </div>
            </div>
            <span style={{ color: '#ff9900', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
              DEALER DRYPOWDER
            </span>
          </div>

          {/* Volatility Gauge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px' }}>
              <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="#333"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="35"
                  stroke="#ffaa00"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 35}`}
                  strokeDashoffset={`${2 * Math.PI * 35 * (1 - 0.65)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 'bold'
              }}>
                65
              </div>
            </div>
            <span style={{ color: '#ff9900', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
              VOLATILITY
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.95)',
          borderRadius: '0px',
          padding: '20px',
          border: '1px solid #333'
        }}>
          <OpenInterestChart 
            selectedTicker={selectedTicker}
            onTickerChange={setSelectedTicker}
            onExpirationChange={setSelectedExpiration}
          />
        </div>

        {/* GEX Screener Panel */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.95)',
          borderRadius: '0px',
          marginTop: '20px',
          border: '1px solid #333',
          overflow: 'hidden'
        }}>
          <GEXScreener />
        </div>
      </div>
    </div>
  );
}