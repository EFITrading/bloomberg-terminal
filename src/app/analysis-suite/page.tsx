'use client';

import React from 'react';
import OpenInterestChart from '../../components/analytics/OpenInterestChart';

export default function AnalysisSuite() {
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
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: '30px',
          paddingBottom: '20px',
          borderBottom: '2px solid #ff9900',
          background: 'rgba(0, 0, 0, 0.9)',
          padding: '20px',
          borderRadius: '0px'
        }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 'bold',
            color: '#ff9900',
            margin: 0,
            textShadow: 'none'
          }}>
            ANALYSIS SUITE
          </h1>
        </div>

        {/* Content */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.95)',
          borderRadius: '0px',
          padding: '20px',
          border: '1px solid #333'
        }}>
          <OpenInterestChart />
        </div>
      </div>
    </div>
  );
}
