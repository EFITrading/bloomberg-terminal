'use client';

// --- Seasonality Visualization ------------------------------------------------
const MONTHLY_WIN_RATES = [58, 52, 64, 68, 57, 50, 67, 52, 44, 60, 71, 73];
const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function SeasonalityVisualization() {
  const currentMonth = new Date().getMonth();
  const curRate = MONTHLY_WIN_RATES[currentMonth];
  const curName = MONTH_NAMES[currentMonth];

  return (
    <div className="tsv2-viz-seasonal">
      <div className="tsv2-viz-row-top">
        <span className="tsv2-viz-label-sm">SPY - 20YR WIN RATE</span>
        <span className="tsv2-viz-label-live">? LIVE</span>
      </div>

      <svg viewBox="0 0 240 72" width="100%" height="72" style={{ display: 'block', overflow: 'visible' }}>
        <line x1="2" y1={72 - 30} x2="238" y2={72 - 30}
          stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" strokeDasharray="3,2" />

        {MONTHLY_WIN_RATES.map((pct, i) => {
          const x = i * 20 + 2;
          const barH = Math.max(2, (pct / 100) * 60);
          const y = 64 - barH;
          const isCurrent = i === currentMonth;
          const color = pct >= 65 ? '#00FF88' : pct >= 50 ? '#FFD700' : '#FF3366';
          const fill = isCurrent ? '#FF6600' : color;
          return (
            <g key={i}>
              <rect x={x} y={y} width="14" height={barH} fill={`${fill}22`} rx="1" />
              <rect x={x} y={y} width="14" height="2" fill={fill} rx="1" />
              {isCurrent && (
                <rect x={x - 1} y={y - 1} width="16" height={barH + 2}
                  fill="none" stroke="#FF6600" strokeWidth="0.7" rx="1" opacity="0.7" />
              )}
              <text x={x + 7} y="72" textAnchor="middle"
                fill={isCurrent ? '#FF6600' : '#1E4060'} fontSize="5.5" fontFamily="monospace">
                {MONTH_LABELS[i]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="tsv2-viz-row-bot">
        <span className="tsv2-viz-cur-month" style={{ color: curRate >= 60 ? '#00FF88' : curRate >= 50 ? '#FFD700' : '#FF3366' }}>
          {curName} - {curRate}% BULLISH BIAS
        </span>
        <span className="tsv2-viz-weak-month">SEP weakest 44%</span>
      </div>
    </div>
  );
}

// --- Options Flow Visualization -----------------------------------------------
const FLOW_ROWS = [
  { ticker: 'NVDA', contract: '900C 04/18', size: '1.5K', prem: '$2.38', kind: 'SWEEP', side: 'call' },
  { ticker: 'TSLA', contract: '210P 05/16', size: '2.1K', prem: '$0.87', kind: 'BLOCK', side: 'put' },
  { ticker: 'SPY', contract: '500C 04/11', size: '4.0K', prem: '$1.12', kind: 'SWEEP', side: 'call' },
  { ticker: 'META', contract: '570C 04/25', size: '860', prem: '$3.45', kind: 'UNUSUAL', side: 'call' },
  { ticker: 'AAPL', contract: '225P 04/18', size: '1.2K', prem: '$1.09', kind: 'SWEEP', side: 'put' },
  { ticker: 'QQQ', contract: '430C 04/18', size: '2.8K', prem: '$0.95', kind: 'BLOCK', side: 'call' },
  { ticker: 'AMZN', contract: '215C 05/16', size: '600', prem: '$4.21', kind: 'UNUSUAL', side: 'call' },
  { ticker: 'MSFT', contract: '455P 04/18', size: '1.8K', prem: '$1.67', kind: 'SWEEP', side: 'put' },
];

export function OptionsFlowVisualization() {
  return (
    <div className="tsv2-viz-flow">
      <div className="tsv2-viz-flow-hdr">
        <span>TICKER</span><span>CONTRACT</span><span>SIZE</span><span>PREM</span><span>TYPE</span>
      </div>
      <div className="tsv2-viz-flow-scroll">
        <div className="tsv2-viz-flow-inner">
          {[...FLOW_ROWS, ...FLOW_ROWS].map((row, i) => (
            <div key={i} className={`tsv2-frow tsv2-frow--${row.side}`}>
              <span className="tsv2-fr-ticker">{row.ticker}</span>
              <span className="tsv2-fr-contract">{row.contract}</span>
              <span className="tsv2-fr-size">{row.size}</span>
              <span className="tsv2-fr-prem">{row.prem}</span>
              <span className={`tsv2-fr-kind tsv2-fkind--${row.kind.toLowerCase()}`}>{row.kind}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Charting Visualization ---------------------------------------------------
const CANDLES = [
  { o: 5260, h: 5285, l: 5245, c: 5271 },
  { o: 5271, h: 5292, l: 5265, c: 5288 },
  { o: 5288, h: 5308, l: 5282, c: 5301 },
  { o: 5301, h: 5318, l: 5293, c: 5310 },
  { o: 5310, h: 5322, l: 5292, c: 5298 },
  { o: 5298, h: 5305, l: 5278, c: 5283 },
  { o: 5283, h: 5290, l: 5260, c: 5267 },
  { o: 5267, h: 5280, l: 5252, c: 5276 },
  { o: 5276, h: 5298, l: 5270, c: 5293 },
  { o: 5293, h: 5312, l: 5287, c: 5308 },
  { o: 5308, h: 5325, l: 5300, c: 5320 },
  { o: 5320, h: 5336, l: 5314, c: 5330 },
];
const GEX_STRIKES = [5280, 5310, 5330];
const TF_BTNS = ['5M', '1H', '1D', 'W'];

export function ChartingVisualization({ spxPrice }: { spxPrice: number | null }) {
  const allPrices = CANDLES.flatMap(c => [c.h, c.l]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;
  const svgW = 240; const svgH = 80;
  const padX = 6; const padY = 6;
  const chartH = svgH - padY * 2;
  const chartW = svgW - padX * 2;
  const cW = chartW / CANDLES.length;
  const norm = (p: number) => padY + (1 - (p - minP) / range) * chartH;
  const displayPrice = spxPrice ?? CANDLES[CANDLES.length - 1].c;

  return (
    <div className="tsv2-viz-chart">
      <div className="tsv2-viz-chart-hdr">
        <span className="tsv2-vc-sym">I:SPX</span>
        <span className="tsv2-vc-tfs">
          {TF_BTNS.map((t, i) => (
            <span key={t} className={`tsv2-vc-tf${i === 1 ? ' tsv2-vc-tf--active' : ''}`}>{t}</span>
          ))}
        </span>
        <span className="tsv2-vc-price">{displayPrice.toLocaleString()}</span>
      </div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" height={svgH} style={{ display: 'block' }}>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={padX} y1={padY + f * chartH} x2={svgW - padX} y2={padY + f * chartH}
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        ))}
        {GEX_STRIKES.map((lvl, i) => {
          const y = norm(lvl);
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={svgW - padX} y2={y}
                stroke="rgba(255,102,0,0.25)" strokeWidth="0.6" strokeDasharray="3,2" />
              <text x={svgW - padX - 2} y={y - 1.5} fill="rgba(255,102,0,0.45)"
                fontSize="4.5" textAnchor="end" fontFamily="monospace">
                GEX {lvl.toLocaleString()}
              </text>
            </g>
          );
        })}
        {CANDLES.map((c, i) => {
          const x = padX + i * cW + cW * 0.1;
          const bW = cW * 0.72;
          const oY = norm(c.o); const cY = norm(c.c);
          const hY = norm(c.h); const lY = norm(c.l);
          const bull = c.c >= c.o;
          const color = bull ? '#00FF88' : '#FF3366';
          const bodyTop = Math.min(oY, cY);
          const bodyH = Math.max(Math.abs(oY - cY), 1);
          const cx = x + bW / 2;
          return (
            <g key={i}>
              <line x1={cx} y1={hY} x2={cx} y2={lY} stroke={color} strokeWidth="0.7" />
              <rect x={x} y={bodyTop} width={bW} height={bodyH}
                fill={bull ? `${color}30` : color} stroke={color} strokeWidth="0.5" rx="0.5" />
            </g>
          );
        })}
        {spxPrice && (
          <line x1={padX} y1={norm(spxPrice)} x2={svgW - padX} y2={norm(spxPrice)}
            stroke="rgba(0,212,255,0.5)" strokeWidth="0.8" strokeDasharray="2,2" />
        )}
      </svg>
    </div>
  );
}

// --- Regime Visualization -----------------------------------------------------
const SECTORS = [
  { lbl: 'XLK', score: 0.82 },
  { lbl: 'XLF', score: 0.67 },
  { lbl: 'XLI', score: 0.54 },
  { lbl: 'XLE', score: 0.41 },
  { lbl: 'XLV', score: 0.38 },
  { lbl: 'XLU', score: 0.25 },
  { lbl: 'XLP', score: 0.30 },
  { lbl: 'XLRE', score: 0.20 },
];

export function RegimeVisualization({ regimeLabel, regimeScore }: { regimeLabel: string | null; regimeScore: number | null }) {
  const label = regimeLabel ? regimeLabel.split('\u2022')[0].trim() : 'RISK ON';
  const isDefensive = label.toLowerCase().includes('defensive');
  const isNeutral = label.toLowerCase().includes('neutral');
  const regimeColor = isDefensive ? '#FF3366' : isNeutral ? '#FFD700' : '#00FF88';
  const gaugePos = regimeScore !== null
    ? Math.min(100, Math.max(0, ((-regimeScore) + 3) / 6 * 100))
    : 65;

  return (
    <div className="tsv2-viz-regime">
      <div className="tsv2-viz-regime-top">
        <span className="tsv2-viz-regime-lbl" style={{ color: regimeColor }}>{label}</span>
        <div className="tsv2-viz-regime-gauge-wrap">
          <span className="tsv2-rg-pole tsv2-rg-bear">BEAR</span>
          <div className="tsv2-viz-regime-gauge">
            <div className="tsv2-viz-regime-fill" style={{ left: `${Math.max(0, Math.min(97, gaugePos - 3))}%`, background: regimeColor }} />
          </div>
          <span className="tsv2-rg-pole tsv2-rg-bull">BULL</span>
        </div>
      </div>
      <div className="tsv2-viz-sectors">
        {SECTORS.map(s => {
          const barColor = s.score > 0.6 ? '#00FF88' : s.score > 0.4 ? '#FFD700' : '#FF3366';
          return (
            <div key={s.lbl} className="tsv2-viz-sector">
              <span className="tsv2-vs-name">{s.lbl}</span>
              <div className="tsv2-vs-bar-bg">
                <div className="tsv2-vs-bar-fill" style={{ width: `${s.score * 100}%`, background: barColor }} />
              </div>
              <span className="tsv2-vs-pct" style={{ color: barColor }}>{(s.score * 100).toFixed(0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Screener Visualization ---------------------------------------------------
const SCAN_RESULTS = [
  { ticker: 'NVDA', rs: 98, hv: 68, sig: 'LEADER', sigClass: 'leader' },
  { ticker: 'MU', rs: 94, hv: 44, sig: 'BUY', sigClass: 'buy' },
  { ticker: 'AMD', rs: 89, hv: 55, sig: 'BREAKOUT', sigClass: 'buy' },
  { ticker: 'AAPL', rs: 87, hv: 22, sig: 'HOLD', sigClass: 'hold' },
  { ticker: 'TSLA', rs: 71, hv: 81, sig: 'HIGH IV', sigClass: 'watch' },
];

export function ScreenerVisualization() {
  return (
    <div className="tsv2-viz-screener">
      <div className="tsv2-viz-scr-hdr">
        <span>TICKER</span><span>RS</span><span>HV%</span><span>SIGNAL</span>
      </div>
      <div className="tsv2-viz-scr-body">
        {SCAN_RESULTS.map((row, i) => (
          <div key={row.ticker} className="tsv2-viz-scr-row" style={{ animationDelay: `${i * 0.12}s` }}>
            <span className="tsv2-scr-ticker">{row.ticker}</span>
            <span className="tsv2-scr-rs" style={{ color: row.rs >= 90 ? '#00FF88' : row.rs >= 75 ? '#FFD700' : '#FF6600' }}>
              {row.rs}
            </span>
            <span className="tsv2-scr-hv" style={{ color: row.hv >= 70 ? '#FF3366' : '#FFD700' }}>
              {row.hv}th
            </span>
            <span className={`tsv2-scr-sig tsv2-sig--${row.sigClass}`}>{row.sig}</span>
          </div>
        ))}
      </div>
      <div className="tsv2-viz-scr-foot">
        <span className="tsv2-scr-dot" />
        <span>Scanning 10,847 securities...</span>
      </div>
    </div>
  );
}

// --- Alerts Visualization -----------------------------------------------------
const ALERT_FEED = [
  { type: 'FLOW', color: '#FF6600', msg: 'NVDA 900C SWEEP | $2.38 | 1.5K cnts', ago: '0:12' },
  { type: 'SEASONAL', color: '#00FF88', msg: 'APR 68% win rate | SPY bullish bias active', ago: '1:05' },
  { type: 'REGIME', color: '#8B5CF6', msg: 'RISK ON signal | Composite +1.8 sigma', ago: '2:34' },
  { type: 'FLOW', color: '#FF6600', msg: 'SPY 500C BLOCK | $1.12 | 4.0K cnts', ago: '4:17' },
  { type: 'AI', color: '#D4AF37', msg: 'NVDA A+ setup | Flow + Season + Regime', ago: '5:58' },
];

export function AlertsVisualization() {
  return (
    <div className="tsv2-viz-alerts">
      {ALERT_FEED.map((alert, i) => (
        <div key={i} className="tsv2-viz-alert-row" style={{ animationDelay: `${i * 0.1}s` }}>
          <span className="tsv2-al-type" style={{ color: alert.color, borderColor: `${alert.color}40` }}>
            {alert.type}
          </span>
          <span className="tsv2-al-msg">{alert.msg}</span>
          <span className="tsv2-al-ago">{alert.ago}m</span>
        </div>
      ))}
    </div>
  );
}
