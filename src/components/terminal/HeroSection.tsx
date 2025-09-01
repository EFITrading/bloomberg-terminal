'use client';

import MatrixRain from './MatrixRain';
import CubeVisualization from './CubeVisualization';

export default function HeroSection() {
  const features = [
    { 
      icon: (
        <svg viewBox="0 0 24 24" className="feature-svg">
          <defs>
            <linearGradient id="seasonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
          </defs>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" 
                fill="url(#seasonGrad)" className="chart-pulse" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="#f59e0b" strokeWidth="0.5" className="orbit-ring" />
        </svg>
      ), 
      text: 'Seasonality Analysis' 
    },
    { 
      icon: (
        <svg viewBox="0 0 24 24" className="feature-svg">
          <defs>
            <linearGradient id="derivGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1e40af" />
            </linearGradient>
          </defs>
          <path d="M3 17l6-6 4 4 8-8V9h-2V7l-6 6-4-4-8 8v1h2v2z" fill="url(#derivGrad)" className="wave-motion" />
          <path d="M21 7h-4v2h2v2l-6 6-4-4-6 6v2l8-8 4 4 6-6V7z" fill="none" stroke="#60a5fa" strokeWidth="0.8" className="delta-trail" />
        </svg>
      ), 
      text: 'Derivative Tracking' 
    },
    { 
      icon: (
        <svg viewBox="0 0 24 24" className="feature-svg">
          <defs>
            <radialGradient id="marketGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="3" fill="url(#marketGrad)" className="pulse-center" />
          <circle cx="12" cy="12" r="6" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" className="scan-ring-1" />
          <circle cx="12" cy="12" r="9" fill="none" stroke="#10b981" strokeWidth="0.5" strokeDasharray="4,4" className="scan-ring-2" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#22c55e" strokeWidth="1" className="crosshair" />
        </svg>
      ), 
      text: 'Market Detection' 
    }
  ];

  const dataPoints = [
    { label: 'VOL', style: { top: '20%', left: '15%', animationDelay: '0s' } },
    { label: 'DELTA', style: { top: '30%', right: '20%', animationDelay: '1s' } },
    { label: 'GAMMA', style: { bottom: '25%', left: '25%', animationDelay: '2s' } },
    { label: 'VEGA', style: { bottom: '35%', right: '15%', animationDelay: '3s' } }
  ];

  return (
    <section className="hero">
      <div className="hero-grid">
        <div className="hero-content">
          <div className="hero-label">
            <div className="label-dot"></div>
            <span className="label-text">Advanced Trading Intelligence</span>
          </div>

          <h1>
            Institutional-Grade<br />
            Market Intelligence
          </h1>

          <p className="hero-description">
            Advanced analytics platform featuring 20-year historical seasonality patterns, 
            real-time derivative flow analysis, and proprietary market regime detection. 
            Professional tools designed for quantitative analysis and systematic trading.
          </p>

          <div className="hero-features">
            {features.map((feature, index) => (
              <div key={index} className="feature-item">
                <div className="feature-icon">{feature.icon}</div>
                <span className="feature-text">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-visual">
          <div className="viz-container">
            {/* Matrix Rain */}
            <MatrixRain />
            
            {/* 3D Cube */}
            <CubeVisualization />

            {/* Floating Data Points */}
            <div className="data-points">
              {dataPoints.map((point, index) => (
                <div 
                  key={index}
                  className="data-point" 
                  style={point.style}
                >
                  {point.label}
                </div>
              ))}
            </div>

            {/* Laser Grid */}
            <div className="laser-grid"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
