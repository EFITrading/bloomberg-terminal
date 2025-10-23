'use client';

export function SeasonalityVisualization() {
 return (
 <div className="seasonality-3d">
 <div className="season-grid-3d">
 <div className="grid-line-x"></div>
 <div className="grid-line-x"></div>
 <div className="grid-line-x"></div>
 <div className="grid-line-y"></div>
 <div className="grid-line-y"></div>
 <div className="grid-line-y"></div>
 </div>
 <div className="year-labels">
 <span className="year-label">2004</span>
 <span className="year-label">2014</span>
 <span className="year-label">2024</span>
 </div>
 <div className="season-waves">
 <div className="wave wave-1" data-year="APR"></div>
 <div className="wave wave-2" data-year="MAY"></div>
 <div className="wave wave-3" data-year="JUN"></div>
 <div className="wave wave-4" data-year="JUL"></div>
 </div>
 <div className="probability-overlay">
 <div className="prob-bar prob-high">87%</div>
 <div className="prob-bar prob-med">65%</div>
 <div className="prob-bar prob-low">42%</div>
 </div>
 </div>
 );
}

export function DataFlowVisualization() {
 return (
 <div className="flow-3d-container">
 {/* Falling Text Animation */}
 <div className="falling-text-container">
 <div className="falling-text" style={{ left: '8%', animationDelay: '0s' }}>News</div>
 <div className="falling-text" style={{ left: '23%', animationDelay: '2.5s' }}>Earnings</div>
 <div className="falling-text" style={{ left: '42%', animationDelay: '4.8s' }}>Analysts</div>
 <div className="falling-text" style={{ left: '67%', animationDelay: '1.2s' }}>Traders</div>
 <div className="falling-text" style={{ left: '85%', animationDelay: '3.1s' }}>Volume</div>
 <div className="falling-text" style={{ left: '15%', animationDelay: '6.7s' }}>Signals</div>
 <div className="falling-text" style={{ left: '58%', animationDelay: '8.3s' }}>Momentum</div>
 <div className="falling-text" style={{ left: '32%', animationDelay: '10.1s' }}>Trends</div>
 <div className="falling-text" style={{ left: '78%', animationDelay: '5.5s' }}>Patterns</div>
 <div className="falling-text" style={{ left: '12%', animationDelay: '9.8s' }}>Data</div>
 <div className="falling-text" style={{ left: '48%', animationDelay: '7.2s' }}>Flows</div>
 <div className="falling-text" style={{ left: '72%', animationDelay: '11.4s' }}>Alerts</div>
 </div>

 {/* PC Ratio Speedometer */}
 <div className="speedometer-container">
 <svg className="speedometer" viewBox="0 0 200 120" style={{ width: '140px', height: '85px' }}>
 {/* Gauge Background Arc */}
 <path
 d="M 30 90 A 70 70 0 0 1 170 90"
 fill="none"
 stroke="rgba(255,255,255,0.1)"
 strokeWidth="8"
 className="gauge-bg"
 />
 
 {/* Gauge Segments */}
 {/* Green segment (0-40%) */}
 <path
 d="M 30 90 A 70 70 0 0 1 100 30"
 fill="none"
 stroke="#00FF88"
 strokeWidth="6"
 className="gauge-green"
 />
 
 {/* Yellow segment (40-70%) */}
 <path
 d="M 100 30 A 70 70 0 0 1 140 45"
 fill="none"
 stroke="#FFD700"
 strokeWidth="6"
 className="gauge-yellow"
 />
 
 {/* Red segment (70-100%) */}
 <path
 d="M 140 45 A 70 70 0 0 1 170 90"
 fill="none"
 stroke="#FF3366"
 strokeWidth="6"
 className="gauge-red"
 />
 
 {/* Needle */}
 <line
 x1="100"
 y1="90"
 x2="130"
 y2="55"
 stroke="#FFFFFF"
 strokeWidth="2"
 className="gauge-needle"
 />
 <circle cx="100" cy="90" r="4" fill="#FFFFFF" />
 
 {/* PC Label */}
 <text x="100" y="105" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="bold">PC</text>
 </svg>
 
 {/* Gauge Labels */}
 <div className="gauge-label left">Bullish</div>
 <div className="gauge-label right">Bearish</div>
 </div>
 
 <div className="flow-metrics">
 <div className="metric-stream">
 <div className="stream-data">BUY FLOW</div>
 <div className="stream-value">$4.2M</div>
 </div>
 <div className="metric-stream">
 <div className="stream-data">SELL FLOW</div>
 <div className="stream-value">$2.8M</div>
 </div>
 </div>
 </div>
 );
}

export function ChartVisualization() {
 const toolButtons = ['5M', '1H', '1D', 'MM', 'AI'];
 const chartInfo = [
 'O: 452.30',
 'H: 455.80', 
 'L: 451.20',
 'C: 454.65'
 ];

 return (
 <div className="chart-interface">
 <div className="chart-toolbar">
 {toolButtons.map((btn, index) => (
 <div 
 key={btn} 
 className={`tool-btn ${index === 0 ? 'active' : ''}`}
 >
 {btn}
 </div>
 ))}
 </div>
 <div className="chart-display">
 {/* Elliott Wave Line Chart */}
 <svg className="elliott-chart" viewBox="0 0 300 120" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '70%' }}>
 {/* Grid lines */}
 <defs>
 <pattern id="grid" width="30" height="12" patternUnits="userSpaceOnUse">
 <path d="M 30 0 L 0 0 0 12" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"/>
 </pattern>
 </defs>
 <rect width="100%" height="100%" fill="url(#grid)" />
 
 {/* Elliott Wave Pattern - 5 waves */}
 <polyline 
 fill="none" 
 stroke="#00FF88" 
 strokeWidth="2"
 strokeLinecap="round"
 points="20,80 60,30 100,50 140,20 180,40 220,10 260,25"
 className="elliott-line"
 />
 
 {/* Wave Labels */}
 <text x="40" y="25" fill="#FFD700" fontSize="8" textAnchor="middle">1</text>
 <text x="80" y="55" fill="#FFD700" fontSize="8" textAnchor="middle">2</text>
 <text x="120" y="15" fill="#FFD700" fontSize="8" textAnchor="middle">3</text>
 <text x="160" y="45" fill="#FFD700" fontSize="8" textAnchor="middle">4</text>
 <text x="200" y="5" fill="#FFD700" fontSize="8" textAnchor="middle">5</text>
 
 {/* Support/Resistance Lines */}
 <line x1="20" y1="85" x2="280" y2="85" stroke="rgba(255,102,0,0.3)" strokeWidth="1" strokeDasharray="2,2"/>
 <line x1="20" y1="15" x2="280" y2="15" stroke="rgba(255,102,0,0.3)" strokeWidth="1" strokeDasharray="2,2"/>
 </svg>
 
 {/* Momentum Indicator */}
 <div className="momentum-indicator" style={{ position: 'absolute', bottom: '30%', left: 0, right: 0, height: '25%', padding: '5px' }}>
 <svg viewBox="0 0 300 40" style={{ width: '100%', height: '100%' }}>
 {/* Momentum oscillator */}
 <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
 <polyline 
 fill="none" 
 stroke="#FF6600" 
 strokeWidth="1.5"
 points="0,25 30,15 60,30 90,10 120,25 150,5 180,20 210,35 240,15 270,25 300,20"
 className="momentum-line"
 />
 <text x="5" y="8" fill="#666" fontSize="6">+100</text>
 <text x="5" y="38" fill="#666" fontSize="6">-100</text>
 </svg>
 </div>
 
 <div className="chart-crosshair-x"></div>
 <div className="chart-crosshair-y"></div>
 </div>
 <div className="chart-info">
 {chartInfo.map((info, index) => (
 <span key={index} className="info-item">{info}</span>
 ))}
 </div>
 </div>
 );
}

export function MarketRegimeVisualization() {
 const sectors = [
 { name: 'TECH', class: 'tech' },
 { name: 'ENERGY', class: 'energy' },
 { name: 'FIN', class: 'finance' },
 { name: 'HEALTH', class: 'health' }
 ];

 return (
 <div className="regime-container">
 <div className="regime-cube">
 <div className="cube-face-regime face-front">
 <div className="sector-grid">
 {sectors.map((sector, index) => (
 <div key={index} className={`sector ${sector.class}`}>
 {sector.name}
 </div>
 ))}
 </div>
 </div>
 <div className="cube-face-regime face-back"></div>
 <div className="cube-face-regime face-left"></div>
 <div className="cube-face-regime face-right"></div>
 <div className="cube-face-regime face-top"></div>
 <div className="cube-face-regime face-bottom"></div>
 </div>
 <div className="regime-status">
 <div className="status-bar risk-on">RISK ON</div>
 <div className="confidence-meter">
 <div className="confidence-fill"></div>
 </div>
 </div>
 </div>
 );
}

export function ScreenerVisualization() {
 const blips = [
 { ticker: 'NVDA', style: { top: '20%', left: '30%', animationDelay: '0s' } },
 { ticker: 'AAPL', style: { top: '40%', right: '20%', animationDelay: '0.4s' } },
 { ticker: 'TSLA', style: { bottom: '30%', left: '40%', animationDelay: '0.8s' } },
 { ticker: 'META', style: { top: '30%', left: '60%', animationDelay: '1.2s' } },
 { ticker: 'AMD', style: { bottom: '20%', right: '30%', animationDelay: '1.6s' } }
 ];

 return (
 <div className="screener-interface">
 <div className="screener-radar">
 <div className="radar-sweep"></div>
 <div className="radar-ring ring-inner"></div>
 <div className="radar-ring ring-mid"></div>
 <div className="radar-ring ring-outer"></div>
 {blips.map((blip, index) => (
 <div 
 key={index}
 className={`blip blip-${index + 1}`}
 data-ticker={blip.ticker}
 style={blip.style}
 ></div>
 ))}
 </div>
 <div className="screener-stats">
 <div className="stat-line">
 <span className="stat-label">SCANNED</span>
 <span className="stat-value">10,847</span>
 </div>
 <div className="stat-line">
 <span className="stat-label">MATCHED</span>
 <span className="stat-value">23</span>
 </div>
 </div>
 </div>
 );
}

export function NeuralAlertVisualization() {
 const alerts = ['VOLUME SURGE', 'BREAKOUT DETECTED', 'REGIME SHIFT'];

 return (
 <div className="neural-alert">
 <svg className="neural-svg" viewBox="0 0 200 100">
 <g className="neural-group">
 {/* Input Layer */}
 <circle cx="20" cy="25" r="4" className="node input-node" />
 <circle cx="20" cy="50" r="4" className="node input-node" />
 <circle cx="20" cy="75" r="4" className="node input-node" />
 
 {/* Hidden Layer 1 */}
 <circle cx="70" cy="20" r="4" className="node hidden-node" />
 <circle cx="70" cy="40" r="4" className="node hidden-node" />
 <circle cx="70" cy="60" r="4" className="node hidden-node" />
 <circle cx="70" cy="80" r="4" className="node hidden-node" />
 
 {/* Hidden Layer 2 */}
 <circle cx="120" cy="30" r="4" className="node hidden-node" />
 <circle cx="120" cy="50" r="4" className="node hidden-node" />
 <circle cx="120" cy="70" r="4" className="node hidden-node" />
 
 {/* Output Layer */}
 <circle cx="170" cy="50" r="6" className="node output-node" />
 
 {/* Connections */}
 <path className="synapse" d="M24,25 L66,20 M24,25 L66,40 M24,25 L66,60 M24,25 L66,80" />
 <path className="synapse" d="M24,50 L66,20 M24,50 L66,40 M24,50 L66,60 M24,50 L66,80" />
 <path className="synapse" d="M24,75 L66,20 M24,75 L66,40 M24,75 L66,60 M24,75 L66,80" />
 <path className="synapse" d="M74,20 L116,30 M74,20 L116,50 M74,20 L116,70" />
 <path className="synapse" d="M74,40 L116,30 M74,40 L116,50 M74,40 L116,70" />
 <path className="synapse" d="M74,60 L116,30 M74,60 L116,50 M74,60 L116,70" />
 <path className="synapse" d="M74,80 L116,30 M74,80 L116,50 M74,80 L116,70" />
 <path className="synapse" d="M124,30 L164,50 M124,50 L164,50 M124,70 L164,50" />
 </g>
 </svg>
 <div className="alert-output">
 {alerts.map((alert, index) => (
 <div key={index} className="alert-item">{alert}</div>
 ))}
 </div>
 </div>
 );
}
