'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { loader } from '@monaco-editor/react';

// monaco-editor accesses `window` on import - must never run during SSR
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  loader.config({ monaco: require('monaco-editor') });
  (window as any).MonacoEnvironment = {
    getWorker(_moduleId: string, _label: string) {
      const blob = new Blob(['self.onmessage = function() {};'], { type: 'application/javascript' });
      return new Worker(URL.createObjectURL(blob));
    },
  };
}

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(m => m.default),
  { ssr: false }
);

// -- Types ---------------------------------------------------------------------
interface SavedScript {
  id: string;
  name: string;
  code: string;
  savedAt: number;
  tags?: string[];
  description?: string;
}
interface LogEntry {
  id: number;
  type: 'log' | 'error' | 'warn' | 'success' | 'table' | 'html';
  message: string;
  tableData?: Record<string, unknown>[];
  timestamp: number;
}
interface CommunityScript {
  id: string;
  name: string;
  author: string;
  stars: number;
  desc: string;
  code: string;
  category: string;
}
interface Toast {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

// -- Icons ---------------------------------------------------------------------
const Icon = {
  play: (
    <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor"><polygon points="0,0.5 11,6.5 0,12.5" /></svg>
  ),
  stop: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><rect x="1" y="1" width="9" height="9" rx="1.5" /></svg>
  ),
  save: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 1h9l3 3v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1z" strokeLinejoin="round" />
      <rect x="4" y="1" width="5" height="4" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="3" y="9" width="9" height="4" rx="0.5" strokeLinejoin="round" />
    </svg>
  ),
  trash: (
    <svg width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1 4h11" strokeLinecap="round" />
      <path d="M5 4V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5V4" />
      <path d="M2 4l.9 7.7a1 1 0 001 .8h5.2a1 1 0 001-.8L11 4" strokeLinecap="round" />
      <path d="M5.5 6.5v4M7.5 6.5v4" strokeLinecap="round" />
    </svg>
  ),
  plus: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.5 1v11M1 6.5h11" strokeLinecap="round" /></svg>
  ),
  send: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2L1 7.5l5 1.5 1.5 5L13 2z" strokeLinejoin="round" /></svg>
  ),
  close: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l9 9M10 1L1 10" strokeLinecap="round" /></svg>
  ),
  file: (
    <svg width="13" height="15" viewBox="0 0 13 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 1h7l3 3v10a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1z" />
      <path d="M8 1v4h4" strokeLinejoin="round" />
    </svg>
  ),
  terminal: (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="14" height="12" rx="2" />
      <path d="M4 5l4 2.5L4 10M9 10h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bot: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="6" width="12" height="8" rx="2" />
      <path d="M5.5 6V4a1 1 0 011-1h3a1 1 0 011 1v2" strokeLinecap="round" />
      <circle cx="5.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M6 14h4M8 1v2" strokeLinecap="round" />
    </svg>
  ),
  download: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6.5 1v8M3 6.5l3.5 3 3.5-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1 11h11" strokeLinecap="round" />
    </svg>
  ),
  star: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="6,1 7.5,4.5 11.5,5 8.5,7.5 9.5,11.5 6,9.5 2.5,11.5 3.5,7.5 0.5,5 4.5,4.5" /></svg>
  ),
  code: (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 2L1 6.5l3.5 4.5M10.5 2L14 6.5l-3.5 4.5M8.5 1l-2 11" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  copy: (
    <svg width="13" height="14" viewBox="0 0 13 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="4" y="4" width="8" height="9" rx="1.5" />
      <path d="M9 4V2.5A1.5 1.5 0 007.5 1h-6A1.5 1.5 0 000 2.5v7A1.5 1.5 0 001.5 11H3" strokeLinecap="round" />
    </svg>
  ),
  csv: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1" y="1" width="12" height="12" rx="2" />
      <path d="M1 5h12M5 5v8M1 9h12" strokeLinecap="round" />
    </svg>
  ),
  search: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5.5" cy="5.5" r="4.5" />
      <path d="M9 9l3 3" strokeLinecap="round" />
    </svg>
  ),
  wrap: (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1 2h12M1 6h9a2 2 0 010 4H7" strokeLinecap="round" />
      <path d="M9 8l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  minimap: (
    <svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="8" height="10" rx="1" />
      <rect x="11" y="1" width="2" height="5" rx="0.5" fill="currentColor" stroke="none" opacity="0.5" />
      <path d="M3 4h4M3 6h3M3 8h4" strokeLinecap="round" />
    </svg>
  ),
  keyboard: (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="14" height="10" rx="2" />
      <path d="M4 4h1M7 4h1M10 4h1M4 7h1M7 7h1M10 7h1M5.5 9.5h5" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  ),
  format: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 3h10M2 7h6M2 11h8" strokeLinecap="round" />
      <path d="M10 9l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg width="13" height="10" viewBox="0 0 13 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1.5 5L5.5 9L11.5 1" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  expand: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" /></svg>
  ),
  compress: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" /></svg>
  ),
  chevronRight: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 2l4 3-4 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  tag: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M1 1h4.5l5.5 5.5-4.5 4.5L1 5.5V1z" strokeLinejoin="round" />
      <circle cx="3.5" cy="3.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  ),
  clock: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="6.5" cy="6.5" r="5.5" />
      <path d="M6.5 3.5V6.5l2.5 2" strokeLinecap="round" />
    </svg>
  ),
  lightning: (
    <svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor"><path d="M6.5 1L1 8h4.5L4.5 13 10 6H5.5L6.5 1z" /></svg>
  ),
  panel: (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1" y="1" width="14" height="12" rx="2" />
      <path d="M6 1v12" />
    </svg>
  ),
  aiSparkle: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.5 1.5M9.5 9.5L11 11M11 3L9.5 4.5M4.5 9.5L3 11" strokeLinecap="round" />
      <circle cx="7" cy="7" r="2.5" />
    </svg>
  ),
};

// -- Templates -----------------------------------------------------------------

const TPL_G1 = `// === GUIDE 1: PRICE & OHLCV DATA =============================================
// Every way to fetch price data - from real-time quotes to multi-year bars.
// =============================================================================

async function run() {

  // --- 1. SINGLE LIVE PRICE -- api.price(symbol) -------------------------------
  //    Returns { symbol, price, source }
  const q = await api.price('AAPL');
  log('AAPL live: $' + q.price.toFixed(2) + '  (' + q.source + ')');

  // --- 2. SPX INDEX PRICE -- api.spxPrice() ------------------------------------
  //    Returns a number (the index level)
  const spx = await api.spxPrice();
  log('SPX index: ' + spx.toFixed(2));

  // --- 3. BATCH LIVE PRICES -- api.prices(symbolsArray) ------------------------
  //    Returns { AAPL: 182.5, MSFT: 415.2, ... }
  const batch = await api.prices(['AAPL', 'MSFT', 'SPY', 'QQQ', 'IWM']);
  table(Object.entries(batch).map(([sym, px]) => ({
    Symbol: sym,
    Price:  '$' + Number(px).toFixed(2),
  })));

  // --- 4. DAILY BARS -- api.historical(symbol, days) ---------------------------
  //    Returns [{t: ms, o, h, l, c, v}, ...]
  const daily = await api.historical('SPY', 10);
  const last  = daily[daily.length - 1];
  log('SPY 10-day sample -- latest close: $' + last.c.toFixed(2) + '  vol: ' + last.v.toLocaleString());
  table(daily.slice(-5).map(b => ({
    Date:   new Date(b.t).toLocaleDateString(),
    Open:   '$' + b.o.toFixed(2),
    High:   '$' + b.h.toFixed(2),
    Low:    '$' + b.l.toFixed(2),
    Close:  '$' + b.c.toFixed(2),
    Volume: b.v.toLocaleString(),
  })));

  // --- 5. INTRADAY / CUSTOM TIMEFRAME BARS -- api.bars(symbol, tf, days) -------
  //    timeframe options: '1m' '5m' '15m' '30m' '1h' '4h' '1d' '1w'
  //    Returns [{timestamp, open, high, low, close, volume, date}, ...]
  const h1 = await api.bars('QQQ', '1h', 3);
  log('QQQ 1h bars (3 days): ' + h1.length + ' candles  last close: $' + h1[h1.length-1]?.close.toFixed(2));

  // --- 6. BULK HISTORICAL -- api.bulkHistorical(symbolsArray, days) ------------
  //    Returns { NVDA: [{t,o,h,l,c,v},...], AMD: [...], ... }
  const bulk = await api.bulkHistorical(['NVDA', 'AMD', 'INTC', 'QCOM', 'MU'], 30);
  table(Object.entries(bulk).map(([sym, bars]) => {
    const first = bars[0], lst = bars[bars.length - 1];
    if (!first || !lst) return { Symbol: sym, Error: 'No data' };
    const ret = ((lst.c - first.c) / first.c * 100).toFixed(2);
    return {
      Symbol:       sym,
      '30D Return': (Number(ret) >= 0 ? '+' : '') + ret + '%',
      'Last Close': '$' + lst.c.toFixed(2),
      Bars:         bars.length,
    };
  }));

}

return run();`;

const TPL_G2 = `// === GUIDE 2: OPTIONS CHAIN & GREEKS =========================================
// Fetch the full options chain and work with greeks, OI, and IV per strike.
// =============================================================================

async function run() {
  const SYMBOL = 'AAPL';

  // --- 1. FULL OPTIONS CHAIN -- api.optionsChain(symbol, expiry?) --------------
  //    Returns { 'YYYY-MM-DD': { calls: { '150': { strike_price, bid, ask,
  //             open_interest, implied_volatility, greeks: {delta,gamma,theta,vega} } },
  //             puts: {...} } }
  //    Pass a date string as 2nd arg to get one specific expiry only.
  const chain   = await api.optionsChain(SYMBOL);
  const expiries = Object.keys(chain).sort();
  log(SYMBOL + ': ' + expiries.length + ' expiry dates  first 4: ' + expiries.slice(0, 4).join(', '));

  // --- 2. READ NEAREST EXPIRY --------------------------------------------------
  const nearExpiry         = expiries[0];
  const { calls, puts }    = chain[nearExpiry] as any;
  const callStrikes        = Object.keys(calls || {}).map(Number).sort((a, b) => a - b);
  const putStrikes         = Object.keys(puts  || {}).map(Number).sort((a, b) => a - b);
  log(nearExpiry + ':  ' + callStrikes.length + ' call strikes  ' + putStrikes.length + ' put strikes');

  // --- 3. GREEKS TABLE (10 strikes around ATM) ---------------------------------
  const allStrikes = [...new Set([...callStrikes, ...putStrikes])].sort((a, b) => a - b);
  const mid        = allStrikes[Math.floor(allStrikes.length / 2)];
  const idx        = callStrikes.indexOf(mid);
  const window     = callStrikes.slice(Math.max(0, idx - 4), idx + 6);

  table(window.map(k => {
    const c = (calls || {})[k] as any;
    if (!c) return { Strike: '$' + k, Error: 'no data' };
    return {
      Strike: '$' + k,
      Bid:    c.bid ?? '-',
      Ask:    c.ask ?? '-',
      OI:     (c.open_interest || 0).toLocaleString(),
      IV:     c.implied_volatility ? (c.implied_volatility * 100).toFixed(1) + '%' : '-',
      Delta:  c.greeks?.delta  ?? '-',
      Gamma:  c.greeks?.gamma  ?? '-',
      Theta:  c.greeks?.theta  ?? '-',
      Vega:   c.greeks?.vega   ?? '-',
    };
  }));

  // --- 4. MAX PAIN (strike with highest total open interest) -------------------
  const oiByStrike: Record<number, number> = {};
  for (const [k, c] of Object.entries(calls || {}))
    oiByStrike[Number(k)] = (oiByStrike[Number(k)] || 0) + ((c as any).open_interest || 0);
  for (const [k, p] of Object.entries(puts || {}))
    oiByStrike[Number(k)] = (oiByStrike[Number(k)] || 0) + ((p as any).open_interest || 0);
  const [maxPainStrike, maxPainOI] = Object.entries(oiByStrike)
    .sort((a, b) => b[1] - a[1])[0] ?? [];
  log('Max pain (highest OI) strike: $' + maxPainStrike + '  OI: ' + Number(maxPainOI).toLocaleString());

  // --- 5. CALL vs PUT OI SKEW --------------------------------------------------
  let totalCallOI = 0, totalPutOI = 0;
  for (const c of Object.values(calls || {})) totalCallOI += ((c as any).open_interest || 0);
  for (const p of Object.values(puts  || {})) totalPutOI  += ((p as any).open_interest || 0);
  const cpRatio = totalCallOI / (totalPutOI || 1);
  log('Call OI: ' + totalCallOI.toLocaleString() + '  Put OI: ' + totalPutOI.toLocaleString()
    + '  C/P ratio: ' + cpRatio.toFixed(2) + (cpRatio > 1 ? '  (call-heavy)' : '  (put-heavy)'));

}

return run();`;

const TPL_G3 = `// === GUIDE 3: OPTIONS FLOW & SWEEPS ==========================================
// Detect unusual and institutional options activity - flow, sweeps, C/P bias.
// =============================================================================

async function run() {

  // --- 1. LIVE OPTIONS FLOW -- api.optionsFlow(ticker?, limit?) ----------------
  //    Omit ticker for a market-wide scan.
  //    Each trade: { underlying_ticker, type, strike_price, expiration_date,
  //                  total_premium, trade_size, spot_price, trade_type, sentiment }
  //    trade_type: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'MINI'
  const flow = await api.optionsFlow('NVDA', 20);
  log('NVDA flow trades: ' + flow.length);
  if (flow.length) {
    table(flow.slice(0, 10).map((t: any) => ({
      Ticker:    t.underlying_ticker,
      Type:      String(t.type || '').toUpperCase(),
      Strike:    '$' + t.strike_price,
      Expiry:    t.expiration_date,
      Size:      Number(t.trade_size    || 0).toLocaleString(),
      Premium:   '$' + Number(t.total_premium || 0).toLocaleString(),
      Side:      t.trade_type,
      Sentiment: t.sentiment || '-',
    })));
  }

  // --- 2. MARKET-WIDE FLOW (no ticker) -----------------------------------------
  //    Great for finding where money is moving across all symbols.
  const mktFlow = await api.optionsFlow(undefined, 50);
  const byTicker: Record<string, number> = {};
  for (const t of mktFlow as any[])
    byTicker[t.underlying_ticker] = (byTicker[t.underlying_ticker] || 0) + (t.total_premium || 0);
  log('Top 10 symbols by premium (market-wide, last 50 trades):');
  table(
    Object.entries(byTicker)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([sym, prem]) => ({ Symbol: sym, 'Total Premium': '$' + Number(prem).toLocaleString() }))
  );

  // --- 3. SWEEP DETECTION -- api.sweepFlow(ticker?) ----------------------------
  //    Sweeps hit multiple exchanges rapidly - signals institutional urgency.
  //    Returns [{ symbol, type, strike, size, stockPrice, premium, tradeType,
  //              timestamp, exchanges, expiration }, ...]
  const sweeps = await api.sweepFlow('AAPL');
  log('AAPL sweeps: ' + sweeps.length);
  if (sweeps.length) {
    table(sweeps.slice(0, 8).map((s: any) => ({
      Symbol:    s.symbol,
      Type:      s.type,
      Strike:    s.strike,
      Premium:   s.premium,
      TradeType: s.tradeType,
      Exchanges: s.exchanges,
      Time:      s.timestamp,
    })));
  }

  // --- 4. CALL / PUT FLOW BREAKDOWN --------------------------------------------
  const calls = (flow as any[]).filter(t => String(t.type).toLowerCase() === 'call').length;
  const puts  = (flow as any[]).filter(t => String(t.type).toLowerCase() === 'put').length;
  const total = calls + puts;
  if (total > 0) {
    const ratio = (calls / (puts || 1)).toFixed(2);
    log('NVDA C/P ratio: ' + ratio + '  (' + calls + ' calls / ' + puts + ' puts)');
    log('Flow bias: ' + (calls > puts * 1.5 ? 'STRONG BULLISH' : puts > calls * 1.5 ? 'STRONG BEARISH' : calls > puts ? 'MILDLY BULLISH' : puts > calls ? 'MILDLY BEARISH' : 'NEUTRAL'));
  }

}

return run();`;

const TPL_G4 = `// === GUIDE 4: MARKET INTELLIGENCE ============================================
// Snapshot, news, economic calendar, sector cycles, ticker search.
// =============================================================================

async function run() {

  // --- 1. MARKET SNAPSHOT -- api.marketSnapshot() ------------------------------
  //    Returns { sectors: {XLK: 1.2, XLF: -0.3, ...},
  //              movers: [{ticker, pct, price},...],
  //              headlines: [{title, tickers},...] }
  const snap = await api.marketSnapshot();

  log('--- Sector Performance ---');
  table(
    Object.entries(snap.sectors || {})
      .sort((a, b) => b[1] - a[1])
      .map(([sym, pct]) => ({
        Sector: sym,
        Change: (Number(pct) >= 0 ? '+' : '') + Number(pct).toFixed(2) + '%',
        Bias:   Number(pct) > 0.5 ? 'BULLISH' : Number(pct) < -0.5 ? 'BEARISH' : 'FLAT',
      }))
  );

  log('--- Top Movers ---');
  table(
    (snap.movers || []).slice(0, 8).map(m => ({
      Ticker: m.ticker,
      Change: (m.pct >= 0 ? '+' : '') + m.pct.toFixed(2) + '%',
      Price:  '$' + m.price.toFixed(2),
    }))
  );

  log('--- Recent Headlines ---');
  (snap.headlines || []).slice(0, 4).forEach(h => log(h.title));

  // --- 2. NEWS -- api.news(ticker?, limit?) ------------------------------------
  //    Omit ticker for all market news.
  //    Each: { title, description, article_url, published_utc, tickers }
  const news = await api.news('NVDA', 5);
  log('--- NVDA News ---');
  news.forEach(a => log('[' + (a.published_utc || '').slice(0, 10) + '] ' + a.title));

  // --- 3. FRED ECONOMIC CALENDAR -- api.fredCalendar(year?, month?) ------------
  //    month is 0-indexed: 0=Jan, 1=Feb ... 11=Dec
  //    Returns { events: { 'YYYY-MM-DD': ['CPI', 'PPI', 'EMPLOYMENT', ...] } }
  const now = new Date();
  const cal = await api.fredCalendar(now.getFullYear(), now.getMonth());
  const evDates = Object.keys(cal.events || {}).sort();
  log('--- Economic Calendar (' + evDates.length + ' release dates this month) ---');
  if (evDates.length) {
    table(evDates.map(d => ({ Date: d, Releases: (cal.events[d] || []).join(', ') })));
  } else {
    warn('No events returned (FRED_API_KEY may not be set in environment).');
  }

  // --- 4. MARKET CYCLE HISTORY -- api.marketCycle(timeframe?) ------------------
  //    timeframe: '1Y' | '5Y' | '20Y'
  //    Returns composite risk-on / risk-off score history with events
  const cycle = await api.marketCycle('1Y');
  log('--- Market Cycle Keys: ' + Object.keys(cycle).join(', ') + ' ---');

  // --- 5. TICKER SEARCH -- api.search(query) -----------------------------------
  //    Returns [{ ticker, name }, ...]
  const found = await api.search('artificial intelligence');
  log('--- Ticker Search: "artificial intelligence" ---');
  table(found.slice(0, 8));

}

return run();`;

const TPL_G5 = `// === GUIDE 5: VOLATILITY & RISK ==============================================
// Historical vol, implied vol history, IV vs HV spread, manual HV calculation.
// =============================================================================

async function run() {
  const SYMBOL = 'SPY';

  // --- 1. ROLLING HISTORICAL VOLATILITY -- api.historicalVolatility(sym, days) -
  //    days must be one of: 10 | 20 | 30 | 60
  //    Returns { data: [{ date, hv, price }, ...] }  hv is annualized %
  const hvResult = await api.historicalVolatility(SYMBOL, 30);
  const hvSeries = hvResult.data || [];
  if (hvSeries.length) {
    log('30-day rolling HV for ' + SYMBOL + ' (last 10 points):');
    table(hvSeries.slice(-10).map((d: any) => ({
      Date:  d.date,
      HV30:  d.hv.toFixed(2) + '%',
      Price: '$' + d.price.toFixed(2),
    })));
    log('Current 30d HV: ' + hvSeries[hvSeries.length - 1]?.hv?.toFixed(2) + '%');
  } else {
    warn('No HV data returned for ' + SYMBOL);
  }

  // --- 2. HISTORICAL IV TIME SERIES -- api.ivHistory(ticker, days?) ------------
  //    Computes 45-day ATM IV per trading day using Black-Scholes.
  //    Returns { data: [{ date, iv, price }, ...] }  iv is decimal (0.25 = 25%)
  //    NOTE: This is a slow endpoint. Use 30 days for quick tests; 252 for a year.
  log('Fetching 30-day IV history for ' + SYMBOL + ' (Black-Scholes 45d ATM)...');
  const ivResult = await api.ivHistory(SYMBOL, 30);
  const ivSeries = (ivResult as any).data || [];
  if (ivSeries.length) {
    log('45-day IV history (last 10 points):');
    table(ivSeries.slice(-10).map((d: any) => ({
      Date:  d.date,
      IV45:  (d.iv * 100).toFixed(2) + '%',
      Price: '$' + d.price.toFixed(2),
    })));

    // --- 3. IV vs HV SPREAD (option premium indicator) -----------------------
    if (hvSeries.length) {
      const latestHV = hvSeries[hvSeries.length - 1]?.hv;
      const latestIV = ivSeries[ivSeries.length - 1]?.iv * 100;
      const spread   = latestIV - latestHV;
      log('IV vs HV: IV=' + latestIV?.toFixed(2) + '%  HV=' + latestHV?.toFixed(2) + '%  spread=' + spread.toFixed(2) + '%');
      log('Signal: ' + (
        spread > 5  ? 'Options EXPENSIVE - elevated IV premium (favors selling premium)' :
        spread < -5 ? 'Options CHEAP - IV discount (favors buying vol)' :
                      'Options fairly priced relative to realized vol'
      ));
    }
  } else {
    warn('No IV history returned - endpoint may be slow/rate-limited. Try again shortly.');
  }

  // --- 4. MANUAL HV CALCULATION (fast, no extra API call) ----------------------
  //    Compute your own rolling HV directly from daily bars.
  log('Manual 21-day HV from daily bars (cross-check):');
  const bars = await api.historical(SYMBOL, 35);
  if (bars.length >= 22) {
    const rets    = bars.slice(1).map((b, i) => Math.log(b.c / bars[i].c));
    const w21     = rets.slice(-21);
    const mean    = w21.reduce((s, r) => s + r, 0) / w21.length;
    const variance = w21.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (w21.length - 1);
    const hv21    = (Math.sqrt(variance * 252) * 100).toFixed(2);
    log('Manual 21-day HV: ' + hv21 + '%');
  }

}

return run();`;

const TPL_DARK = `// =============================================================================
//  DARK THEME  -  EFI Terminal Style
//  Copy this scaffold when building any script that outputs a visual tool.
//  Palette: #050505 bg  |  #ff6600 accent  |  #1a1a1a borders  |  JetBrains Mono
//  Green: #44cc77  Red: #ff5544  Muted: #555  Label: #888
// =============================================================================

async function run() {

  // ── Helper: color for pos/neg numbers ───────────────────────────────────────
  function clr(v) { return v > 0 ? '#44cc77' : v < 0 ? '#ff5544' : '#888'; }
  function fmt(v, d) { return (v >= 0 ? '+' : '') + Number(v).toFixed(d || 2) + '%'; }

  // ── Fetch some live data ─────────────────────────────────────────────────────
  const symbols = ['SPY','QQQ','IWM','DIA'];
  log('Loading data...');
  const px   = await api.prices(symbols);
  const snap = await api.marketSnapshot();

  // ── Build rows ───────────────────────────────────────────────────────────────
  const moverRows = (snap.movers || []).slice(0, 6).map(m =>
    '<tr>'
    + '<td style="padding:5px 12px 5px 0;color:#e0e0e0;font-weight:700;">'+m.ticker+'</td>'
    + '<td style="padding:5px 12px 5px 0;color:#aaa;">$'+Number(m.price).toFixed(2)+'</td>'
    + '<td style="padding:5px 0;color:'+clr(m.pct)+';font-weight:800;text-align:right;">'+fmt(m.pct)+'</td>'
    + '</tr>'
  ).join('');

  const sectorRows = Object.entries(snap.sectors || {})
    .sort((a,b) => b[1]-a[1])
    .map(([sym,pct]) =>
      '<tr>'
      + '<td style="padding:4px 12px 4px 0;color:#aaa;font-size:11px;">'+sym+'</td>'
      + '<td style="padding:4px 0;text-align:right;">'
      + '<span style="color:'+clr(pct)+';font-weight:700;font-size:11px;">'+fmt(pct)+'</span>'
      + '</td>'
      + '</tr>'
    ).join('');

  const indexCards = symbols.map(s => {
    const p = px[s] || 0;
    return '<div style="flex:1;min-width:90px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:11px 14px;">'
      + '<div style="font-size:10px;color:#555;letter-spacing:0.1em;margin-bottom:5px;">'+s+'</div>'
      + '<div style="font-size:16px;font-weight:900;color:#e0e0e0;">$'+Number(p).toFixed(2)+'</div>'
      + '</div>';
  }).join('');

  // ── Render ───────────────────────────────────────────────────────────────────
  html(\`
  <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#d0d0d0;padding:6px 0 12px;">

    <!-- Header bar -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #1a1a1a;">
      <div style="width:3px;height:14px;background:#ff6600;border-radius:1px;flex-shrink:0;"></div>
      <span style="font-size:11px;font-weight:800;color:#fff;letter-spacing:0.12em;text-transform:uppercase;">Market Overview</span>
      <span style="margin-left:auto;font-size:9px;color:#444;">\${new Date().toLocaleTimeString()}</span>
    </div>

    <!-- Index prices -->
    <div style="font-size:9px;color:#444;letter-spacing:0.12em;margin-bottom:7px;">INDEX PRICES</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
      \${indexCards}
    </div>

    <!-- Two-col layout: movers + sectors -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">

      <!-- Movers -->
      <div style="background:#050505;border:1px solid #1a1a1a;border-radius:5px;padding:13px 15px;">
        <div style="font-size:9px;color:#ff6600;letter-spacing:0.12em;margin-bottom:10px;font-weight:800;">TOP MOVERS</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="font-size:9px;color:#444;text-align:left;padding-bottom:7px;border-bottom:1px solid #111;letter-spacing:0.08em;">TICKER</th>
            <th style="font-size:9px;color:#444;text-align:left;padding-bottom:7px;border-bottom:1px solid #111;letter-spacing:0.08em;">PRICE</th>
            <th style="font-size:9px;color:#444;text-align:right;padding-bottom:7px;border-bottom:1px solid #111;letter-spacing:0.08em;">CHG</th>
          </tr></thead>
          <tbody>\${moverRows}</tbody>
        </table>
      </div>

      <!-- Sectors -->
      <div style="background:#050505;border:1px solid #1a1a1a;border-radius:5px;padding:13px 15px;">
        <div style="font-size:9px;color:#ff6600;letter-spacing:0.12em;margin-bottom:10px;font-weight:800;">SECTOR PERFORMANCE</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="font-size:9px;color:#444;text-align:left;padding-bottom:7px;border-bottom:1px solid #111;letter-spacing:0.08em;">SECTOR</th>
            <th style="font-size:9px;color:#444;text-align:right;padding-bottom:7px;border-bottom:1px solid #111;letter-spacing:0.08em;">CHG</th>
          </tr></thead>
          <tbody>\${sectorRows}</tbody>
        </table>
      </div>

    </div>

    <!-- Footer note -->
    <div style="margin-top:10px;font-size:9px;color:#333;border-top:1px solid #111;padding-top:8px;">
      Dark theme scaffold — copy &amp; adapt. Replace the data fetches and card contents with your own logic.
    </div>

  </div>\`);
}

return run();`;

const TPL_LIGHT = `// =============================================================================
//  LIGHT THEME  -  Clean White Dashboard
//  Copy this scaffold for light-mode script output.
//  Palette: #ffffff bg  |  #1a1a2e accent  |  #e8e8e8 borders  |  Inter/system-ui
//  Green: #16a34a  Red: #dc2626  Muted: #9ca3af  Label: #6b7280
// =============================================================================

async function run() {

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function clr(v) { return v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#9ca3af'; }
  function fmt(v, d) { return (v >= 0 ? '+' : '') + Number(v).toFixed(d || 2) + '%'; }
  function badge(text, bg, col) {
    return '<span style="font-size:9px;font-weight:700;letter-spacing:0.07em;background:'+bg+';color:'+col+';border-radius:3px;padding:2px 6px;">'+text+'</span>';
  }

  // ── Fetch live data ───────────────────────────────────────────────────────────
  const symbols = ['SPY','QQQ','IWM','DIA'];
  log('Loading data...');
  const px   = await api.prices(symbols);
  const snap = await api.marketSnapshot();
  const news = await api.news(undefined, 5);

  // ── Build components ──────────────────────────────────────────────────────────
  const indexCards = symbols.map(s => {
    const p = px[s] || 0;
    return '<div style="flex:1;min-width:90px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 15px;">'
      + '<div style="font-size:10px;color:#9ca3af;letter-spacing:0.09em;font-weight:600;margin-bottom:5px;">'+s+'</div>'
      + '<div style="font-size:17px;font-weight:800;color:#111827;">$'+Number(p).toFixed(2)+'</div>'
      + '</div>';
  }).join('');

  const moverRows = (snap.movers || []).slice(0, 6).map((m,i) =>
    '<tr style="background:'+(i%2===0?'#fff':'#f9fafb')+'">'
    + '<td style="padding:7px 14px;font-weight:700;color:#111827;">'+m.ticker+'</td>'
    + '<td style="padding:7px 14px;color:#374151;">$'+Number(m.price).toFixed(2)+'</td>'
    + '<td style="padding:7px 14px;text-align:right;">'
    + '<span style="font-weight:800;color:'+clr(m.pct)+';background:'+(m.pct>0?'#dcfce7':m.pct<0?'#fee2e2':'#f3f4f6')+';padding:2px 7px;border-radius:4px;font-size:11px;">'+fmt(m.pct)+'</span>'
    + '</td>'
    + '</tr>'
  ).join('');

  const sectorBars = Object.entries(snap.sectors || {})
    .sort((a,b) => b[1]-a[1])
    .map(([sym,pct]) => {
      const w = Math.min(100, Math.abs(Number(pct)) * 12).toFixed(1);
      const positive = Number(pct) >= 0;
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'
        + '<span style="width:40px;font-size:10px;font-weight:700;color:#374151;flex-shrink:0;">'+sym+'</span>'
        + '<div style="flex:1;height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden;">'
        + '<div style="height:100%;width:'+w+'%;background:'+(positive?'#16a34a':'#dc2626')+';border-radius:3px;"></div>'
        + '</div>'
        + '<span style="width:52px;text-align:right;font-size:10px;font-weight:700;color:'+clr(Number(pct))+';">'+fmt(Number(pct))+'</span>'
        + '</div>';
    }).join('');

  const newsItems = news.slice(0, 4).map(a =>
    '<div style="padding:9px 0;border-bottom:1px solid #f3f4f6;">'
    + '<div style="font-size:11px;font-weight:600;color:#111827;line-height:1.5;margin-bottom:3px;">'+a.title+'</div>'
    + '<div style="font-size:10px;color:#9ca3af;">'+(a.published_utc||'').slice(0,10)
    + (a.tickers&&a.tickers.length ? '  ·  ' + a.tickers.slice(0,4).join(' ') : '')
    + '</div>'
    + '</div>'
  ).join('');

  // ── Render ────────────────────────────────────────────────────────────────────
  html(\`
  <div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#374151;padding:6px 0 12px;background:#fff;">

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #f3f4f6;">
      <div style="display:flex;align-items:center;gap:9px;">
        <div style="width:10px;height:10px;background:#1a1a2e;border-radius:2px;flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:800;color:#111827;letter-spacing:-0.01em;">Market Overview</span>
      </div>
      <span style="font-size:10px;color:#9ca3af;">\${new Date().toLocaleTimeString()}</span>
    </div>

    <!-- Index prices -->
    <div style="font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Indices</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
      \${indexCards}
    </div>

    <!-- Two-col: movers + sectors -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">

      <!-- Movers table -->
      <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="padding:10px 14px;border-bottom:1px solid #e5e7eb;background:#f9fafb;">
          <span style="font-size:10px;font-weight:700;color:#374151;letter-spacing:0.07em;text-transform:uppercase;">Top Movers</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;">
            <th style="font-size:9px;color:#9ca3af;text-align:left;padding:7px 14px;letter-spacing:0.07em;font-weight:600;">TICKER</th>
            <th style="font-size:9px;color:#9ca3af;text-align:left;padding:7px 14px;letter-spacing:0.07em;font-weight:600;">PRICE</th>
            <th style="font-size:9px;color:#9ca3af;text-align:right;padding:7px 14px;letter-spacing:0.07em;font-weight:600;">CHANGE</th>
          </tr></thead>
          <tbody>\${moverRows}</tbody>
        </table>
      </div>

      <!-- Sector bars -->
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:13px 16px;">
        <div style="font-size:10px;font-weight:700;color:#374151;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:12px;">Sector Performance</div>
        \${sectorBars}
      </div>

    </div>

    <!-- News feed -->
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:13px 16px;">
      <div style="font-size:10px;font-weight:700;color:#374151;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:4px;">Latest News</div>
      \${newsItems}
    </div>

    <!-- Footer -->
    <div style="margin-top:10px;font-size:9px;color:#d1d5db;">
      Light theme scaffold — copy &amp; adapt for your own scripts.
    </div>

  </div>\`);
}

return run();`;

const TPL_52W = `// --- 52-Week High Screener ---------------------------------------------------
// Finds stocks trading within THRESHOLD% of their 52-week high.
// See the "API Starter Guide" template for full API usage examples.
// Uses: api.historical(symbol, days)  ->  [{t, o, h, l, c, v}, ...]

const WATCHLIST = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AMD','AVGO','LLY','V','JPM','GS'];
const THRESHOLD = 5; // % below 52-week high

async function run() {
  log('Scanning ' + WATCHLIST.length + ' symbols for 52-week high proximity...');
  const hits = [];

  for (const sym of WATCHLIST) {
    const bars = await api.historical(sym, 252);
    if (!bars || bars.length < 20) { warn('Skipping ' + sym + ' - insufficient data'); continue; }

    const high52w     = Math.max(...bars.map(b => b.h));
    const current     = bars[bars.length - 1].c;
    const pctFromHigh = ((current - high52w) / high52w) * 100;

    if (pctFromHigh >= -THRESHOLD) {
      const vol    = bars[bars.length - 1].v;
      const avgVol = bars.slice(-20).reduce((s, b) => s + b.v, 0) / 20;
      hits.push({
        Symbol:        sym,
        Price:         '$' + current.toFixed(2),
        '52W High':    '$' + high52w.toFixed(2),
        '% From High': pctFromHigh.toFixed(2) + '%',
        'Vol/Avg20':   (vol / avgVol).toFixed(2) + 'x',
      });
    }
  }

  if (hits.length === 0) {
    log('No symbols within ' + THRESHOLD + '% of 52-week high.');
  } else {
    log('Found ' + hits.length + ' symbol(s) near 52-week highs:');
    table(hits);
  }
}

return run();`;

const TPL_REGIME = `// =============================================================================
//  REGIME INDUSTRY PICKER  v3  -  Visual Dashboard
//  Outputs a live mini-dashboard with regime banner, momentum bar cards for
//  all 11 sectors, and live holding prices for the top 3 sectors.
//  Uses: api.bulkHistorical  api.prices  html()
// =============================================================================

const SECTORS = {
  'Technology':       'XLK',
  'Healthcare':       'XLV',
  'Financials':       'XLF',
  'Energy':           'XLE',
  'Utilities':        'XLU',
  'Consumer Disc':    'XLY',
  'Consumer Staples': 'XLP',
  'Industrials':      'XLI',
  'Materials':        'XLB',
  'Real Estate':      'XLRE',
  'Communication':    'XLC',
};

const REGIME_SCORE = {
  XLK:1, XLY:1, XLF:1, XLI:1, XLB:1, XLC:1,
  XLV:-1, XLU:-1, XLP:-1, XLRE:-1, XLE:0,
};

// Top 5 holdings per sector ETF
const HOLDINGS = {
  XLK:  ['AAPL','MSFT','NVDA','AVGO','AMD'],
  XLV:  ['LLY','UNH','JNJ','ABBV','MRK'],
  XLF:  ['JPM','V','MA','BAC','GS'],
  XLE:  ['XOM','CVX','COP','SLB','PSX'],
  XLU:  ['NEE','SO','DUK','AEP','SRE'],
  XLY:  ['AMZN','TSLA','HD','MCD','NKE'],
  XLP:  ['PG','KO','PEP','COST','WMT'],
  XLI:  ['GE','RTX','HON','UNP','CAT'],
  XLB:  ['LIN','APD','ECL','SHW','FCX'],
  XLRE: ['PLD','AMT','EQIX','CCI','PSA'],
  XLC:  ['META','GOOGL','NFLX','DIS','VZ'],
};

const ACCENT = ['#4da6ff','#4dffb0','#ffb84d','#c084fc','#4df3ff','#ff8c44','#44d4ff','#b0ff4d','#ff4dc8','#ffd04d','#4dffcf'];

function calcRSI(bars, period) {
  if (bars.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const d = bars[i].c - bars[i-1].c;
    if (d > 0) g += d; else l -= d;
  }
  const ag = g / period, al = l / period;
  return al === 0 ? 100 : 100 - (100 / (1 + ag / al));
}

function rc(v) { return v > 0 ? '#44cc77' : v < 0 ? '#ff5544' : '#888'; }
function rf(v, d) { return (v >= 0 ? '+' : '') + v.toFixed(d || 1) + '%'; }

async function run() {
  log('Loading sector data + SPY...');
  const bulk = await api.bulkHistorical(Object.values(SECTORS).concat(['SPY']), 252);

  const spyB  = bulk['SPY'] || [];
  const spyNow = spyB.length ? spyB[spyB.length-1].c : 1;
  const spyD22 = spyB.length >= 22 ? spyB[spyB.length-22].c : spyNow;
  const spy1m  = ((spyNow - spyD22) / spyD22) * 100;

  const rows = [];
  for (const [sector, ticker] of Object.entries(SECTORS)) {
    const b = bulk[ticker];
    if (!b || b.length < 22) continue;
    const now  = b[b.length-1].c;
    const h52  = Math.max(...b.map(x => x.h));
    const l52  = Math.min(...b.map(x => x.l));
    const d5   = b[Math.max(0,b.length-5)].c;
    const d22  = b[Math.max(0,b.length-22)].c;
    const d63  = b.length>=63  ? b[b.length-63].c  : null;
    const d126 = b.length>=126 ? b[b.length-126].c : null;
    const r5   = ((now-d5)/d5)*100;
    const r1m  = ((now-d22)/d22)*100;
    const r3m  = d63  ? ((now-d63)/d63)*100  : null;
    const r6m  = d126 ? ((now-d126)/d126)*100 : null;
    const rsi  = calcRSI(b, 14);
    const relStr = r1m - spy1m;
    const v5   = b.slice(-5).reduce((s,x)=>s+x.v,0)/5;
    const v20  = b.slice(-20).reduce((s,x)=>s+x.v,0)/20;
    const volT = v20>0 ? v5/v20 : 1;
    const rng  = h52>l52 ? ((now-l52)/(h52-l52))*100 : 50;
    const score = r5*0.15 + r1m*0.35 + (r3m!==null?r3m:r1m)*0.25 + relStr*0.15 + (volT-1)*10*0.10;
    rows.push({ sector, ticker, now, h52, l52, r5, r1m, r3m, r6m, rsi, relStr, volT, rng, score });
  }

  rows.sort((a,b)=>b.score-a.score);
  const ranked = rows.map((r,i)=>Object.assign({},r,{rank:i+1}));

  const top4   = ranked.slice(0,4);
  const regSum = top4.reduce((s,r)=>s+(REGIME_SCORE[r.ticker]||0),0);
  const regime = regSum>=2 ? 'RISK-ON' : regSum<=-1 ? 'DEFENSIVE' : 'MIXED';

  // Fetch live prices for top 3 sector holdings
  log('Fetching live holding prices...');
  const top3tickers = ranked.slice(0,3).flatMap(r => HOLDINGS[r.ticker]||[]);
  const hpx = await api.prices(top3tickers);

  // ─── Build HTML ──────────────────────────────────────────────────────────────
  const RGC = regime==='RISK-ON'
    ? {bg:'#001800',border:'#44cc77',text:'#44cc77'}
    : regime==='DEFENSIVE'
    ? {bg:'#1a0000',border:'#ff5544',text:'#ff5544'}
    : {bg:'#0d0d00',border:'#ffcc44',text:'#ffcc44'};

  const maxS = Math.max(...ranked.map(r=>r.score));
  const minS = Math.min(...ranked.map(r=>r.score));
  const bw   = s => Math.max(4, Math.min(100, ((s-minS)/(maxS-minS+0.001))*100)).toFixed(1);

  // Sector cards
  const cards = ranked.map((r,i) => {
    const col  = ACCENT[i] || '#888';
    const isTop = i < 3;
    const isBot = i >= ranked.length-3;
    const bord  = isTop ? col+'44' : isBot ? '#ff554422' : '#141414';
    const ncol  = isTop ? col : isBot ? '#ff6655' : '#666';
    const barClr = isTop ? 'linear-gradient(90deg,'+col+','+col+'55)' : isBot ? '#331111' : '#1e1e1e';
    const rsiCol = r.rsi>70?'#ff9944':r.rsi<30?'#4499ff':'#777';
    return '<div style="background:#050505;border:1px solid '+bord+';border-radius:5px;padding:11px 13px;">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">'
      +'<span style="font-size:13px;font-weight:900;color:'+ncol+';">'+r.ticker+'</span>'
      +'<span style="font-size:9px;color:#444;background:#0a0a0a;border:1px solid #191919;border-radius:3px;padding:1px 5px;">#'+r.rank+'</span>'
      +'</div>'
      +'<div style="font-size:10px;color:#555;margin-bottom:7px;">'+r.sector+'</div>'
      +'<div style="height:3px;background:#111;border-radius:2px;margin-bottom:8px;">'
      +'<div style="height:100%;width:'+bw(r.score)+'%;background:'+barClr+';border-radius:2px;"></div>'
      +'</div>'
      +'<div style="display:flex;gap:9px;font-size:10px;flex-wrap:wrap;">'
      +'<span style="color:'+rc(r.r1m)+';">1M '+rf(r.r1m)+'</span>'
      +(r.r3m!==null?'<span style="color:'+rc(r.r3m)+';">3M '+rf(r.r3m)+'</span>':'')
      +'<span style="color:'+rc(r.relStr)+';">vsSPY '+rf(r.relStr)+'</span>'
      +'<span style="color:'+rsiCol+';">RSI '+r.rsi.toFixed(0)+'</span>'
      +'</div>'
      +'<div style="font-size:10px;color:#444;margin-top:6px;">'
      +'$'+r.now.toFixed(2)+'  52W '+r.rng.toFixed(0)+'%  vol '+(r.volT>=1.1?'<span style=color:#44cc77>UP</span>':r.volT<=0.9?'<span style=color:#ff5544>DN</span>':'<span style=color:#666>FL</span>')
      +'</div>'
      +'</div>';
  }).join('');

  // Holdings panels for top 3
  const holdPanels = ranked.slice(0,3).map((r,i)=>{
    const col = ACCENT[i];
    const tix = HOLDINGS[r.ticker] || [];
    const rows2 = tix.map(t=>{
      const p = hpx[t];
      return '<tr>'
        +'<td style="padding:5px 10px 5px 0;color:#ccc;font-weight:700;font-size:11px;">'+t+'</td>'
        +'<td style="padding:5px 0;color:#fff;font-weight:900;font-size:12px;text-align:right;">$'+(p?Number(p).toFixed(2):'—')+'</td>'
        +'</tr>';
    }).join('');
    return '<div style="flex:1;min-width:160px;background:#050505;border:1px solid '+col+'33;border-radius:5px;padding:13px 15px;">'
      +'<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">'
      +'<span style="font-size:13px;font-weight:900;color:'+col+';">'+r.ticker+'</span>'
      +'<span style="font-size:10px;color:#555;">'+r.sector+'</span>'
      +'<span style="margin-left:auto;font-size:10px;color:'+rc(r.r1m)+';">'+rf(r.r1m,2)+'</span>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr>'
      +'<th style="font-size:9px;color:#ff6600;text-align:left;padding-bottom:6px;letter-spacing:0.1em;border-bottom:1px solid #111;">TICKER</th>'
      +'<th style="font-size:9px;color:#ff6600;text-align:right;padding-bottom:6px;letter-spacing:0.1em;border-bottom:1px solid #111;">LIVE PRICE</th>'
      +'</tr></thead>'
      +'<tbody>'+rows2+'</tbody></table>'
      +'</div>';
  }).join('');

  html(\`<div style="font-family:'JetBrains Mono',monospace;font-size:12px;padding:6px 0 10px;">

    <!-- Regime Banner -->
    <div style="background:\${RGC.bg};border:1px solid \${RGC.border}55;border-radius:6px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="font-size:10px;color:#555;letter-spacing:0.14em;margin-bottom:5px;">MARKET REGIME</div>
        <div style="font-size:22px;font-weight:900;color:\${RGC.text};letter-spacing:0.04em;">\${regime}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#555;margin-bottom:3px;">SPY 1-MONTH</div>
        <div style="font-size:18px;font-weight:800;color:\${rc(spy1m)};">\${rf(spy1m,2)}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#555;margin-bottom:6px;letter-spacing:0.1em;">LEADING SECTORS</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          \${top4.map((r,i)=>'<span style="background:'+ACCENT[i]+'18;border:1px solid '+ACCENT[i]+'44;border-radius:3px;padding:3px 9px;font-size:11px;font-weight:700;color:'+ACCENT[i]+';">'+r.ticker+'</span>').join('')}
        </div>
      </div>
    </div>

    <!-- Sector Grid -->
    <div style="font-size:9px;color:#444;letter-spacing:0.12em;margin-bottom:7px;">SECTOR MOMENTUM RANKING  ·  SCORE = 5d(15%) + 1M(35%) + 3M(25%) + vs SPY(15%) + VOL(10%)</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:6px;margin-bottom:16px;">
      \${cards}
    </div>

    <!-- Holdings -->
    <div style="font-size:9px;color:#444;letter-spacing:0.12em;margin-bottom:7px;">TOP 3 SECTOR HOLDINGS  ·  LIVE PRICES</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      \${holdPanels}
    </div>

  </div>\`);
}

return run();`;

const TEMPLATES = [
  { id: 'tpl-g1', name: 'Guide 1 - Price & OHLCV', desc: 'Live prices, daily bars, intraday timeframes, and bulk multi-symbol historical data in one call.', apis: ['price', 'spxPrice', 'prices', 'historical', 'bars', 'bulkHistorical'], code: TPL_G1 },
  { id: 'tpl-g2', name: 'Guide 2 - Options Chain', desc: 'Full options chain with greeks, max pain calculation, and call/put OI skew analysis.', apis: ['optionsChain', 'greeks', 'max pain', 'OI skew'], code: TPL_G2 },
  { id: 'tpl-g3', name: 'Guide 3 - Options Flow & Sweeps', desc: 'Live unusual options activity, institutional sweep detection, and market-wide C/P flow bias.', apis: ['optionsFlow', 'sweepFlow', 'C/P ratio'], code: TPL_G3 },
  { id: 'tpl-g4', name: 'Guide 4 - Market Intelligence', desc: 'Market snapshot, news feed, FRED economic calendar, cycle history, and ticker search.', apis: ['marketSnapshot', 'news', 'fredCalendar', 'marketCycle', 'search'], code: TPL_G4 },
  { id: 'tpl-g5', name: 'Guide 5 - Volatility & Risk', desc: 'Rolling historical vol, Black-Scholes IV history, IV vs HV spread signal, and manual HV.', apis: ['historicalVolatility', 'ivHistory', 'IV vs HV'], code: TPL_G5 },
  { id: 'tpl-dark', name: 'Theme - Dark Mode', desc: 'EFI terminal dark scaffold with cards, tables, and live data. Copy this palette for any script.', code: TPL_DARK },
  { id: 'tpl-light', name: 'Theme - Light Mode', desc: 'Clean white dashboard with striped tables, horizontal bar charts, and a news feed. Copy for light tools.', code: TPL_LIGHT },
  { id: 'tpl-52w', name: '52-Week High Screener', desc: 'Scans a watchlist for stocks trading within a threshold % of their 52-week high with volume confirmation.', apis: ['historical', 'bulkHistorical'], code: TPL_52W },
  { id: 'tpl-regime', name: 'Regime Industry Picker', desc: 'Ranks sector ETFs by momentum and aligns them with the current market regime for rotation signals.', apis: ['historical', 'marketSnapshot'], code: TPL_REGIME },
];

// -- Community Scripts ---------------------------------------------------------
const COMMUNITY_SCRIPTS: CommunityScript[] = [
  {
    id: 'com-1',
    name: 'Volume Surge Scanner',
    author: '@efi_trader',
    stars: 142,
    category: 'FLOW',
    desc: 'Flags tickers with volume 2.5x+ above 20-day average to detect institutional activity',
    code: `// --- Volume Surge Scanner ----------------------------------------------------
const WATCHLIST = ['SPY','QQQ','AAPL','NVDA','TSLA','AMZN','META','MSFT','JPM','GOOGL'];
const VOL_THRESHOLD = 2.5;

async function run() {
  log('Scanning ' + WATCHLIST.length + ' symbols for volume surges...');
  const flags = [];

  for (const sym of WATCHLIST) {
    const bars = await api.historical(sym, 25);
    if (!bars || bars.length < 21) { warn('Skipping ' + sym); continue; }

    const today  = bars[bars.length - 1];
    const avg20v = bars.slice(-21, -1).reduce((s, b) => s + b.v, 0) / 20;
    const ratio  = today.v / avg20v;
    const chg    = ((today.c - today.o) / today.o * 100);

    if (ratio >= VOL_THRESHOLD) {
      flags.push({
        Symbol:      sym,
        'Vol Ratio': ratio.toFixed(2) + 'x',
        'Day Chg':   (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%',
        Close:       '$' + today.c.toFixed(2),
        Signal:      ratio > 5 ? 'EXTREME' : ratio > 3 ? 'HIGH' : 'ELEVATED',
      });
    }
  }

  flags.sort((a, b) => parseFloat(b['Vol Ratio']) - parseFloat(a['Vol Ratio']));
  if (flags.length === 0) {
    log('No unusual volume detected.');
  } else {
    log('Flagged ' + flags.length + ' symbol(s):');
    table(flags);
  }
}

return run();`,
  },
  {
    id: 'com-2',
    name: 'VIX Regime Classifier',
    author: '@vol_desk',
    stars: 98,
    category: 'VOL',
    desc: 'Reads VIX to classify current market volatility regime and directional bias',
    code: `// --- VIX Regime Classifier ---------------------------------------------------
async function run() {
  log('Fetching VIX data for regime classification...');
  const vix = await api.historical('VIX', 30);

  if (!vix || vix.length < 10) {
    warn('VIX unavailable - computing SPY realized vol');
    const spy = await api.historical('SPY', 30);
    if (!spy || spy.length < 10) { warn('Insufficient data'); return; }
    const returns = spy.slice(1).map((b, i) => Math.log(b.c / spy[i].c));
    const rvol = Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length * 252) * 100;
    table([{ 'Vol Proxy': rvol.toFixed(1) + '%', Regime: rvol > 30 ? 'STRESS' : rvol > 20 ? 'ELEVATED' : 'NORMAL' }]);
    return;
  }

  const current = vix[vix.length - 1].c;
  const week5   = vix[Math.max(0, vix.length - 5)].c;
  const month   = vix[0].c;
  const trend5d = current - week5;
  const trend1m = current - month;

  const regime =
    current >= 35 ? 'CRISIS' :
    current >= 25 ? 'STRESS' :
    current >= 18 ? 'ELEVATED' :
    current >= 13 ? 'NORMAL' : 'COMPLACENT';

  table([{
    'VIX Level':   current.toFixed(2),
    Regime:        regime,
    'Trend (5d)':  (trend5d >= 0 ? '+' : '') + trend5d.toFixed(2),
    'Trend (1mo)': (trend1m >= 0 ? '+' : '') + trend1m.toFixed(2),
    Bias:          trend5d > 2 ? 'VOL RISING' : trend5d < -2 ? 'VOL FALLING' : 'STABLE',
  }]);
}

return run();`,
  },
  {
    id: 'com-3',
    name: 'Momentum Breadth Scanner',
    author: '@gex_lab',
    stars: 76,
    category: 'MACRO',
    desc: 'Checks large-cap basket for EMA20/EMA50 alignment - quantifies market breadth',
    code: `// --- Momentum Breadth Scanner ------------------------------------------------
const BASKET = ['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','JPM','V','UNH','XOM','LLY','AVGO','AMD'];

async function run() {
  log('Scanning ' + BASKET.length + ' large-caps for momentum alignment...');
  const bullish = [], bearish = [], neutral = [];

  for (const sym of BASKET) {
    const bars = await api.historical(sym, 60);
    if (!bars || bars.length < 22) { warn('Skipping ' + sym); continue; }

    const c     = bars[bars.length - 1].c;
    const ema20 = bars.slice(-20).reduce((s, b) => s + b.c, 0) / 20;
    const ema50 = bars.slice(-Math.min(50, bars.length)).reduce((s, b) => s + b.c, 0) / Math.min(50, bars.length);
    const p5d   = ((c - bars[bars.length - 5].c) / bars[bars.length - 5].c) * 100;

    const row = { Symbol: sym, Price: '$' + c.toFixed(2), 'EMA20': c > ema20 ? 'ABOVE' : 'BELOW', 'EMA50': c > ema50 ? 'ABOVE' : 'BELOW', '5D %': (p5d >= 0 ? '+' : '') + p5d.toFixed(2) + '%' };
    if (c > ema20 && c > ema50 && p5d > 0) bullish.push(row);
    else if (c < ema20 && c < ema50 && p5d < 0) bearish.push(row);
    else neutral.push(row);
  }

  log('Breadth: ' + bullish.length + '/' + BASKET.length + ' bullish (' + ((bullish.length/BASKET.length)*100).toFixed(0) + '%)');
  if (bullish.length) { log('BULLISH:'); table(bullish); }
  if (bearish.length) { log('BEARISH:'); table(bearish); }
  if (neutral.length) log('MIXED: ' + neutral.map(r => r.Symbol).join(', '));
}

return run();`,
  },
];

// -- AI quick-prompt suggestions -----------------------------------------------
const AI_SUGGESTIONS = [
  'Write a script that scans my watchlist for unusual put/call ratio spikes',
  'Create a script that shows SPY intraday VWAP deviation over last 5 days',
  'Optimize my current script for speed - batch the API calls',
  'Add error handling and retry logic to the current script',
  'Convert this screener output to include sector breakdown',
];

// -- Execution Engine ----------------------------------------------------------
let _logSeq = 0;

async function runScript(code: string, onEntry: (e: LogEntry) => void): Promise<void> {
  const push = (type: LogEntry['type'], message: string, tableData?: Record<string, unknown>[]) =>
    onEntry({ id: ++_logSeq, type, message, tableData, timestamp: Date.now() });

  const api = {
    // --- Price data ---
    async historical(symbol: string, days: number) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - Math.ceil(days * 1.65));
      const url = '/api/historical-data?symbol=' + encodeURIComponent(symbol)
        + '&startDate=' + start.toISOString().slice(0, 10)
        + '&endDate=' + end.toISOString().slice(0, 10);
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + symbol);
      const data = await res.json();
      return ((data.results || []) as Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>)
        .slice(-days);
    },

    // Current price for one symbol. Returns { symbol, price, source }
    async price(symbol: string) {
      const res = await fetch('/api/realtime-price?symbol=' + encodeURIComponent(symbol));
      if (!res.ok) throw new Error('Price fetch failed - HTTP ' + res.status);
      return await res.json() as { symbol: string; price: number; source: string };
    },

    // Current prices for multiple symbols at once. Returns { AAPL: 182.5, ... }
    async prices(symbols: string[]) {
      const res = await fetch('/api/live-prices?symbols=' + encodeURIComponent(symbols.join(',')));
      if (!res.ok) throw new Error('Live prices failed - HTTP ' + res.status);
      const data = await res.json();
      return (data.prices || {}) as Record<string, number>;
    },

    // OHLCV bars with explicit timeframe. timeframe: '1m','5m','15m','30m','1h','4h','1d','1w'
    async bars(symbol: string, timeframe: string, days: number) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      const res = await fetch('/api/stock-data?symbol=' + encodeURIComponent(symbol)
        + '&timeframe=' + encodeURIComponent(timeframe)
        + '&lookbackDays=' + days);
      if (!res.ok) throw new Error('Bars fetch failed - HTTP ' + res.status);
      const data = await res.json();
      return (data.data || []) as Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number; date: string }>;
    },

    // Bulk historical for up to 50 symbols at once. Returns { AAPL: [{t,o,h,l,c,v},...], ... }
    async bulkHistorical(symbols: string[], days: number) {
      const res = await fetch('/api/bulk-historical-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, days }),
      });
      if (!res.ok) throw new Error('Bulk historical failed - HTTP ' + res.status);
      const data = await res.json();
      // Normalize: each symbol's results array
      const out: Record<string, Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>> = {};
      for (const [sym, val] of Object.entries(data.data || {})) {
        out[sym] = ((val as { results?: unknown[] }).results || []) as Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
      }
      return out;
    },

    // --- Options ---
    // Full options chain. Pass expiration 'YYYY-MM-DD' to filter, or omit for all (next 3 months).
    // Returns { 'YYYY-MM-DD': { calls: { '150': { strike_price, bid, ask, open_interest, greeks } }, puts: {...} } }
    async optionsChain(symbol: string, expiration?: string) {
      let url = '/api/options-chain?ticker=' + encodeURIComponent(symbol);
      if (expiration) url += '&expiration=' + encodeURIComponent(expiration);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Options chain failed - HTTP ' + res.status);
      const data = await res.json();
      return data.data as Record<string, { calls: Record<string, unknown>; puts: Record<string, unknown> }>;
    },

    // Options flow (unusual activity). ticker is optional for market-wide scan.
    // Returns array of trades with { underlying_ticker, type, strike, expiry, total_premium, trade_type, ... }
    async optionsFlow(ticker?: string, limit = 50) {
      let url = '/api/live-options-flow?limit=' + limit;
      if (ticker) url += '&ticker=' + encodeURIComponent(ticker);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Options flow failed - HTTP ' + res.status);
      const data = await res.json();
      return (data.trades || []) as Array<Record<string, unknown>>;
    },

    // --- Market data ---
    // Market snapshot: sector ETF % changes, top movers, recent headlines.
    async marketSnapshot() {
      const res = await fetch('/api/market-snapshot');
      if (!res.ok) throw new Error('Market snapshot failed - HTTP ' + res.status);
      return await res.json() as { sectors: Record<string, number>; movers: Array<{ ticker: string; pct: number; price: number }>; headlines: Array<{ title: string; tickers: string[] }> };
    },

    // --- News ---
    // Latest market news. Pass ticker to filter (e.g. 'AAPL'), or omit for all.
    async news(ticker?: string, limit = 20) {
      let url = '/api/news?limit=' + limit;
      if (ticker) url += '&ticker=' + encodeURIComponent(ticker);
      const res = await fetch(url);
      if (!res.ok) throw new Error('News fetch failed - HTTP ' + res.status);
      const data = await res.json();
      return (data.articles || data.results || []) as Array<{ title: string; description: string; article_url: string; published_utc: string; tickers: string[] }>;
    },

    // --- Volatility ---
    // Rolling annualized historical volatility. days must be 10 | 20 | 30 | 60.
    // Returns { data: [{date, hv, price}, ...] }
    async historicalVolatility(symbol: string, days: 10 | 20 | 30 | 60 = 30) {
      const res = await fetch('/api/historical-volatility?ticker=' + encodeURIComponent(symbol) + '&days=' + days);
      if (!res.ok) throw new Error('Historical vol failed - HTTP ' + res.status);
      return await res.json() as { data: Array<{ date: string; hv: number; price: number }> };
    },

    // 45-day ATM implied volatility history (Black-Scholes per day — slow for large ranges).
    // Returns { data: [{date, iv, price}, ...] }  iv is in decimal (0.25 = 25%)
    async ivHistory(ticker: string, days = 30) {
      const res = await fetch('/api/calculate-historical-iv?ticker=' + encodeURIComponent(ticker) + '&days=' + days);
      if (!res.ok) throw new Error('IV history failed - HTTP ' + res.status);
      return await res.json() as { data: Array<{ date: string; iv: number; price: number }> };
    },

    // --- Sweeps ---
    // Sweep-detected options trades (multi-exchange institutional speed).
    // Returns [{ symbol, type, strike, size, stockPrice, premium, tradeType, timestamp, expiration }, ...]
    async sweepFlow(ticker?: string) {
      let url = '/api/sweep-flow';
      if (ticker) url += '?ticker=' + encodeURIComponent(ticker);
      const res = await fetch(url);
      if (!res.ok) throw new Error('Sweep flow failed - HTTP ' + res.status);
      const data = await res.json();
      return (data.trades || data.data || []) as Array<Record<string, unknown>>;
    },

    // --- Index ---
    // Live SPX (S&P 500) index price. Returns a number.
    async spxPrice() {
      const res = await fetch('/api/spx-price');
      if (!res.ok) throw new Error('SPX price failed - HTTP ' + res.status);
      const data = await res.json();
      return data.price as number;
    },

    // --- Macro ---
    // FRED economic calendar. month is 0-indexed (0=Jan). Returns { events: { 'YYYY-MM-DD': ['CPI','PPI',...] } }
    async fredCalendar(year?: number, month?: number) {
      const y = year ?? new Date().getFullYear();
      const m = month ?? new Date().getMonth();
      const res = await fetch('/api/fred-calendar?year=' + y + '&month=' + m);
      if (!res.ok) throw new Error('FRED calendar failed - HTTP ' + res.status);
      return await res.json() as { events: Record<string, string[]> };
    },

    // Market cycle/regime history. timeframe: '1Y' | '5Y' | '20Y'
    async marketCycle(timeframe: '1Y' | '5Y' | '20Y' = '1Y') {
      const res = await fetch('/api/market-cycle-history?timeframe=' + encodeURIComponent(timeframe));
      if (!res.ok) throw new Error('Market cycle failed - HTTP ' + res.status);
      return await res.json();
    },

    // --- Ticker search ---
    async search(query: string) {
      const res = await fetch('/api/ticker-search?q=' + encodeURIComponent(query));
      if (!res.ok) throw new Error('Ticker search failed - HTTP ' + res.status);
      const data = await res.json();
      return (data.results || []) as Array<{ ticker: string; name: string }>;
    },
  };

  const log = (m: unknown) => push('log', String(m));
  const warn = (m: unknown) => push('warn', String(m));
  const table = (d: unknown[]) => push('table', d.length + ' rows', d as Record<string, unknown>[]);
  const html = (markup: string) => push('html', markup);

  try {
    push('log', '--- Script started -----------------------------------------');
    // eslint-disable-next-line no-new-func
    const fn = new Function('api', 'log', 'warn', 'table', 'html',
      '"use strict"; return (async () => {\n' + code + '\n})();'
    );
    await fn(api, log, warn, table, html);
    push('success', '--- Completed -----------------------------------------------');
  } catch (err: unknown) {
    push('error', 'Runtime error: ' + (err instanceof Error ? err.message : String(err)));
  }
}

// -- localStorage helpers ------------------------------------------------------
const LS_KEY = 'efi_scripts_v2';
function lsLoad(): SavedScript[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; }
}
function lsPersist(s: SavedScript[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

// -- Shortcut helper ------------------------------------------------------------
const SHORTCUTS = [
  { keys: 'Ctrl + Enter', label: 'Run script' },
  { keys: 'Ctrl + S', label: 'Save script' },
  { keys: 'Ctrl + N', label: 'New script' },
  { keys: 'Ctrl + B', label: 'Toggle left panel' },
  { keys: 'Ctrl + J', label: 'Toggle output console' },
  { keys: 'Ctrl + \\', label: 'Toggle AI assistant' },
  { keys: 'Ctrl + Shift + F', label: 'Format code' },
  { keys: 'Ctrl + Shift + P', label: 'Copy code to clipboard' },
  { keys: 'Ctrl + Shift + E', label: 'Export results as CSV' },
  { keys: '?', label: 'Show/hide this shortcuts panel' },
  { keys: 'Escape', label: 'Close shortcuts panel / exit fullscreen' },
];

// -- Component -----------------------------------------------------------------
export default function AiSuitePage() {
  const [code, setCode] = useState(TPL_52W);
  const [scriptName, setScriptName] = useState('52-Week High Screener');
  const [saved, setSaved] = useState<SavedScript[]>([]);
  const [tab, setTab] = useState<'mine' | 'tpl' | 'community'>('tpl');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [aiMsgs, setAiMsgs] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'EFI AI Assistant - ready.\n\nDescribe a script idea and I\'ll write it, or paste your code for a review.' },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  // Panels
  const [consoleH, setConsoleH] = useState(220);
  const [leftW, setLeftW] = useState(272);
  const [aiW, setAiW] = useState(300);
  const [consoleFull, setConsoleFull] = useState(false);
  const [showLeft, setShowLeft] = useState(true);
  const [showAi, setShowAi] = useState(true);
  const [showConsole, setShowConsole] = useState(true);
  // Editor controls
  const [wordWrap, setWordWrap] = useState<'off' | 'on'>('off');
  const [minimapOn, setMinimapOn] = useState(true);
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  // Console controls
  const [logFilter, setLogFilter] = useState<'all' | 'log' | 'warn' | 'error'>('all');
  const [logSearch, setLogSearch] = useState('');
  // Script search
  const [scriptSearch, setScriptSearch] = useState('');
  // UI
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [copied, setCopied] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const aiEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const dragging = useRef<null | { which: 'console' | 'left' | 'ai'; sx: number; sy: number; sv: number }>(null);
  let _toastId = useRef(0);

  // -- Init --
  useEffect(() => { setSaved(lsLoad()); }, []);
  useEffect(() => { consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);
  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aiMsgs]);

  // -- Toast --
  const showToast = useCallback((text: string, type: Toast['type'] = 'success') => {
    const id = ++_toastId.current;
    setToasts(p => [...p, { id, text, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2800);
  }, []);

  // -- Drag resize --
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragging.current;
      if (!d) return;
      if (d.which === 'console') setConsoleH(Math.max(80, Math.min(700, d.sv + (d.sy - e.clientY))));
      else if (d.which === 'left') setLeftW(Math.max(180, Math.min(600, d.sv + (e.clientX - d.sx))));
      else if (d.which === 'ai') setAiW(Math.max(220, Math.min(620, d.sv + (d.sx - e.clientX))));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = null;
      document.body.style.cursor = '';
      (document.body.style as any).userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // -- Keyboard shortcuts --
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === '?' && !ctrl && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setShowShortcuts(s => !s);
        return;
      }
      if (e.key === 'Escape') {
        if (consoleFull) { setConsoleFull(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
      }
      if (!ctrl) return;
      if (e.key === 'Enter') { e.preventDefault(); handleRunRef.current?.(); }
      else if (e.key === 's') { e.preventDefault(); handleSaveRef.current?.(); }
      else if (e.key === 'n') { e.preventDefault(); handleNewRef.current?.(); }
      else if (e.key === 'b') { e.preventDefault(); setShowLeft(s => !s); }
      else if (e.key === 'j') { e.preventDefault(); setShowConsole(s => !s); }
      else if (e.key === '\\') { e.preventDefault(); setShowAi(s => !s); }
      else if (e.key === 'F' && e.shiftKey) { e.preventDefault(); handleFormatRef.current?.(); }
      else if (e.key === 'P' && e.shiftKey) { e.preventDefault(); handleCopyCodeRef.current?.(); }
      else if (e.key === 'E' && e.shiftKey) { e.preventDefault(); handleExportCsvRef.current?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consoleFull, showShortcuts]);

  // Ref-forwarded handlers (so keydown closure sees latest)
  const handleRunRef = useRef<(() => void) | null>(null);
  const handleSaveRef = useRef<(() => void) | null>(null);
  const handleNewRef = useRef<(() => void) | null>(null);
  const handleFormatRef = useRef<(() => void) | null>(null);
  const handleCopyCodeRef = useRef<(() => void) | null>(null);
  const handleExportCsvRef = useRef<(() => void) | null>(null);

  const handleMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('efi', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'comment', foreground: '3a3a3a', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'cc5500' },
        { token: 'string', foreground: 'b06a20' },
        { token: 'number', foreground: 'ff9940' },
        { token: 'identifier', foreground: 'cccccc' },
      ],
      colors: {
        'editor.background': '#030303',
        'editor.foreground': '#cccccc',
        'editor.lineHighlightBackground': '#090909',
        'editor.selectionBackground': '#2b1600',
        'editorLineNumber.foreground': '#505050',
        'editorLineNumber.activeForeground': '#cc6620',
        'editorCursor.foreground': '#ff6600',
        'editorGutter.background': '#030303',
        'editorBracketMatch.background': '#2a1600',
        'editorBracketMatch.border': '#ff660044',
        'scrollbarSlider.background': '#111111aa',
        'scrollbarSlider.hoverBackground': '#1c1c1caa',
        'minimap.background': '#020202',
        'editorWidget.background': '#0a0a0a',
        'editorSuggestWidget.background': '#0a0a0a',
        'editorSuggestWidget.border': '#1e1e1e',
        'editorSuggestWidget.selectedBackground': '#1a0e00',
        'input.background': '#0a0a0a',
      },
    });
    monaco.editor.setTheme('efi');
    editor.onDidChangeCursorPosition((ev: any) => {
      setCursorLine(ev.position.lineNumber);
      setCursorCol(ev.position.column);
    });
  }, []);

  const handleRun = useCallback(async () => {
    if (running) return;
    setLogs([]);
    setRunning(true);
    const t0 = Date.now();
    await runScript(code, e => setLogs(p => [...p, e]));
    setExecTime(Date.now() - t0);
    setRunning(false);
  }, [code, running]);
  handleRunRef.current = handleRun;

  const handleRunCode = useCallback(async (c: string) => {
    setCode(c);
    setLogs([]);
    setRunning(true);
    const t0 = Date.now();
    await runScript(c, e => setLogs(p => [...p, e]));
    setExecTime(Date.now() - t0);
    setRunning(false);
  }, []);

  const handleSave = useCallback(() => {
    const now = Date.now();
    const name = scriptName.trim() || 'Untitled';
    const has = saved.find(s => s.name === name);
    const next = has
      ? saved.map(s => s.name === name ? { ...s, code, savedAt: now } : s)
      : [...saved, { id: 's' + now, name, code, savedAt: now }];
    setSaved(next);
    lsPersist(next);
    showToast('Script saved: ' + name);
  }, [code, scriptName, saved, showToast]);
  handleSaveRef.current = handleSave;

  const handleDelete = useCallback((id: string) => {
    const next = saved.filter(s => s.id !== id);
    setSaved(next);
    lsPersist(next);
    showToast('Script deleted', 'info');
  }, [saved, showToast]);

  const handleLoad = useCallback((name: string, c: string) => {
    setCode(c);
    setScriptName(name);
  }, []);

  const handleNew = useCallback(() => {
    setCode(
      '// New Script - ' + new Date().toLocaleDateString() + '\n\n' +
      'async function run() {\n' +
      '  log("Hello, EFI!");\n' +
      '  const bars = await api.historical("SPY", 5);\n' +
      '  table(bars.map(b => ({\n' +
      '    Date:   new Date(b.t).toLocaleDateString(),\n' +
      '    Close:  "$" + b.c.toFixed(2),\n' +
      '    Volume: b.v.toLocaleString(),\n' +
      '  })));\n}\n\nreturn run();'
    );
    setScriptName('Untitled Script');
    setLogs([]);
    setExecTime(null);
  }, []);
  handleNewRef.current = handleNew;

  const handleFormat = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.getAction('editor.action.formatDocument')?.run();
    showToast('Code formatted');
  }, [showToast]);
  handleFormatRef.current = handleFormat;

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      showToast('Code copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code, showToast]);
  handleCopyCodeRef.current = handleCopyCode;

  const handleDownloadScript = useCallback(() => {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (scriptName.trim() || 'script').replace(/[^a-z0-9_-]/gi, '_') + '.js';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded ' + a.download);
  }, [code, scriptName, showToast]);

  const handleExportCsv = useCallback(() => {
    const tables = logs.filter(l => l.type === 'table' && l.tableData && l.tableData.length > 0);
    if (tables.length === 0) { showToast('No table data to export', 'error'); return; }
    const td = tables[tables.length - 1].tableData!;
    const headers = Object.keys(td[0]);
    const rows = td.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (scriptName.trim() || 'output').replace(/[^a-z0-9_-]/gi, '_') + '_' + Date.now() + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported ' + td.length + ' rows as CSV');
  }, [logs, scriptName, showToast]);
  handleExportCsvRef.current = handleExportCsv;

  const handleAI = useCallback(async () => {
    const msg = aiInput.trim();
    if (!msg || aiLoading) return;
    setAiInput('');
    setAiMsgs(p => [...p, { role: 'user', text: msg }]);
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai-suite/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
      setAiMsgs(p => [...p, { role: 'ai', text: data.reply || 'No response.' }]);
    } catch (e: unknown) {
      setAiMsgs(p => [...p, {
        role: 'ai',
        text: '\u26a0 ' + (e instanceof Error ? e.message : String(e)),
      }]);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, code]);

  const startDrag = (which: 'console' | 'left' | 'ai', e: React.MouseEvent, sv: number) => {
    e.preventDefault();
    dragging.current = { which, sx: e.clientX, sy: e.clientY, sv };
    document.body.style.cursor = which === 'console' ? 'ns-resize' : 'ew-resize';
    (document.body.style as any).userSelect = 'none';
  };

  // -- Filtered logs --
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (logFilter !== 'all') {
        if (logFilter === 'error' && l.type !== 'error') return false;
        if (logFilter === 'warn' && l.type !== 'warn') return false;
        if (logFilter === 'log' && !['log', 'success'].includes(l.type)) return false;
      }
      if (logSearch) {
        const q = logSearch.toLowerCase();
        const inMsg = l.message.toLowerCase().includes(q);
        const inTable = l.tableData ? JSON.stringify(l.tableData).toLowerCase().includes(q) : false;
        return inMsg || inTable;
      }
      return true;
    });
  }, [logs, logFilter, logSearch]);

  // -- Filtered scripts --
  const filteredSaved = useMemo(() => {
    if (!scriptSearch) return saved;
    const q = scriptSearch.toLowerCase();
    return saved.filter(s => s.name.toLowerCase().includes(q));
  }, [saved, scriptSearch]);

  // Monaco options (dynamic based on settings)
  const monacoOptions = useMemo(() => ({
    fontSize: editorFontSize,
    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
    fontLigatures: true,
    lineHeight: Math.round(editorFontSize * 1.6),
    minimap: { enabled: minimapOn, scale: 1 },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth' as const,
    cursorSmoothCaretAnimation: 'on' as const,
    renderLineHighlight: 'all' as const,
    padding: { top: 16, bottom: 16 },
    scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
    wordWrap: wordWrap,
    tabSize: 2,
    bracketPairColorization: { enabled: false },
    formatOnPaste: true,
    quickSuggestions: true,
    parameterHints: { enabled: true },
    suggest: { snippetsPreventQuickSuggestions: false },
  }), [editorFontSize, minimapOn, wordWrap]);

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const logCounts = useMemo(() => ({
    errors: logs.filter(l => l.type === 'error').length,
    warns: logs.filter(l => l.type === 'warn').length,
    tables: logs.filter(l => l.type === 'table').length,
  }), [logs]);

  // -- Style helpers --
  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'linear-gradient(180deg, #1e1e1e 0%, #070707 100%)',
    border: '1px solid #2e2e2e',
    borderRadius: 4, color: '#ddd', cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
    padding: '5px 12px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
    boxShadow: '0 2px 5px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.05)',
    transition: 'all 0.12s',
  };
  const toolbarBtnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    background: 'linear-gradient(180deg, #181818 0%, #060606 100%)',
    border: '1px solid #252525',
    borderRadius: 3, color: '#888', cursor: 'pointer',
    padding: '4px 8px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
    fontFamily: 'inherit', transition: 'all 0.12s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
  };

  const categoryColor: Record<string, string> = {
    FLOW: '#ff6600', VOL: '#cc44ff', MACRO: '#00aaff',
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#000', color: '#fff',
      fontFamily: '"Inter", system-ui, sans-serif', overflow: 'hidden',
    }}>
      <style>{`
        .main-content { padding-top: 0 !important; overflow: hidden !important; min-height: 0 !important; }

        /* Tabs */
        .efi-tab-btn { transition: background 0.12s, color 0.12s, border-color 0.12s; }
        .efi-tab-btn:hover { color: #ff6600 !important; background: rgba(255,102,0,0.06) !important; }

        /* Cards */
        .efi-card { transition: border-color 0.12s, background 0.12s; }
        .efi-card:hover { border-color: #ff6600 !important; background: #060606 !important; }
        .efi-saved-row { transition: background 0.1s; }
        .efi-saved-row:hover { background: #0a0a0a !important; }
        .efi-com-card { transition: border-color 0.12s, box-shadow 0.12s; }
        .efi-com-card:hover { border-color: #ff6600 !important; box-shadow: 0 0 0 1px #ff660018 !important; }

        /* Buttons */
        .efi-btn:hover { border-color: #444 !important; background: linear-gradient(180deg, #282828 0%, #0d0d0d 100%) !important; color: #fff !important; box-shadow: 0 2px 6px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.07) !important; }
        .efi-run-btn:hover { background: linear-gradient(180deg, #1a1a1a 0%, #060606 100%) !important; border-color: #ff6600 !important; color: #ff6600 !important; box-shadow: 0 0 10px rgba(255,102,0,0.15), 0 2px 5px rgba(0,0,0,0.9) !important; }
        .efi-load-btn:hover { border-color: #444 !important; background: linear-gradient(180deg, #1e1e1e 0%, #080808 100%) !important; }
        .efi-tool-btn:hover { background: linear-gradient(180deg, #202020 0%, #090909 100%) !important; border-color: #333 !important; color: #fff !important; box-shadow: 0 1px 3px rgba(0,0,0,0.8) !important; }
        .efi-tool-btn-active { background: linear-gradient(180deg, #161616 0%, #060606 100%) !important; border-color: #ff660055 !important; color: #ff6600 !important; }

        /* Resize handles */
        .efi-resize-x { transition: background 0.12s; }
        .efi-resize-x:hover { background: #ff660044 !important; }
        .efi-resize-y { transition: background 0.12s; }
        .efi-resize-y:hover { background: #ff660044 !important; }

        /* Log filter btns */
        .efi-logbtn { transition: all 0.1s; }
        .efi-logbtn:hover { color: #fff !important; }
        .efi-logbtn-active { color: #fff !important; background: #161616 !important; border: 1px solid #2a2a2a !important; }

        /* AI suggestion chips */
        .efi-chip:hover { border-color: #ff660077 !important; color: #ff9940 !important; background: #0e0800 !important; }

        /* Inputs */
        .efi-input:focus { border-color: #333 !important; outline: none; }

        /* Status bar items */
        .efi-stat:hover { background: #111 !important; color: #ccc !important; }

        /* Scrollbars */
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1c1c1c; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #2c2c2c; }

        /* Toast */
        @keyframes toastIn { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
        .efi-toast { animation: toastIn 0.2s ease; }

        /* Shortcuts modal */
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .efi-modal { animation: fadeIn 0.15s ease; }

        /* Running pulse */
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .efi-pulse { animation: pulse 1.2s ease-in-out infinite; }
      `}</style>

      {/* TOASTS */}
      <div style={{ position: 'fixed', bottom: 40, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} className="efi-toast" style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '9px 14px', borderRadius: 4,
            background: t.type === 'success' ? '#0a1a00' : t.type === 'error' ? '#1a0000' : '#0a0a0f',
            border: `1px solid ${t.type === 'success' ? '#1a4000' : t.type === 'error' ? '#440000' : '#1a1a2a'}`,
            color: t.type === 'success' ? '#44cc66' : t.type === 'error' ? '#ff4422' : '#88aaff',
            fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
            boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
          }}>
            <span style={{ display: 'flex', color: 'inherit' }}>
              {t.type === 'success' ? Icon.check : t.type === 'error' ? Icon.close : Icon.lightning}
            </span>
            {t.text}
          </div>
        ))}
      </div>

      {/* SHORTCUTS MODAL */}
      {showShortcuts && (
        <div
          className="efi-modal"
          onClick={() => setShowShortcuts(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: '#060606', border: '1px solid #1e1e1e', borderRadius: 6,
            padding: '24px 28px', minWidth: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#ff6600', display: 'flex' }}>{Icon.keyboard}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Keyboard Shortcuts</span>
              </div>
              <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', display: 'flex' }}>{Icon.close}</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {SHORTCUTS.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 3, background: i % 2 === 0 ? 'transparent' : '#060606' }}>
                  <span style={{ fontSize: 12, color: '#ddd' }}>{s.label}</span>
                  <kbd style={{ fontSize: 11, color: '#ff9940', background: '#0e0800', border: '1px solid #2a1800', borderRadius: 3, padding: '2px 8px', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>{s.keys}</kbd>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: '#888', textAlign: 'center' }}>Press <kbd style={{ color: '#fff', background: '#111', border: '1px solid #333', borderRadius: 2, padding: '1px 5px' }}>?</kbd> or <kbd style={{ color: '#fff', background: '#111', border: '1px solid #333', borderRadius: 2, padding: '1px 5px' }}>Esc</kbd> to close</div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 14px', height: 50,
        borderBottom: '1px solid #141414', flexShrink: 0,
        background: '#030303',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginRight: 2, flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.5px', fontFamily: '"JetBrains Mono", monospace', lineHeight: 1 }}>
            <span style={{ color: '#ff6600' }}>EFI</span><span style={{ color: '#fff' }}>.STUDIO</span>
          </span>
          <div style={{ width: 1, height: 16, background: '#2a2a2a', flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: '#666', letterSpacing: '0.16em', fontWeight: 700, textTransform: 'uppercase' }}>Script Environment</span>
        </div>

        <div style={{ width: 1, height: 22, background: '#1a1a1a', flexShrink: 0 }} />

        {/* Script name */}
        <input
          value={scriptName}
          onChange={e => setScriptName(e.target.value)}
          className="efi-input"
          style={{
            background: 'none', border: 'none', borderBottom: '1px solid #1e1e1e',
            outline: 'none', color: '#fff', fontSize: 13,
            fontFamily: '"JetBrains Mono", monospace',
            width: 200, padding: '3px 4px', flexShrink: 0,
          }}
          placeholder="Script name..."
        />

        <div style={{ width: 1, height: 22, background: '#1a1a1a', flexShrink: 0 }} />

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {(['mine', 'tpl', 'community'] as const).map(t => (
            <button key={t} className="efi-tab-btn" onClick={() => setTab(t)} style={{
              position: 'relative', padding: '6px 14px',
              background: tab === t
                ? 'linear-gradient(180deg, #1e1e1e 0%, #080808 100%)'
                : 'linear-gradient(180deg, #131313 0%, #040404 100%)',
              border: `1px solid ${tab === t ? '#ff6600' : '#222'}`,
              borderRadius: 4,
              color: tab === t ? '#ff6600' : '#888',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: tab === t
                ? '0 0 8px rgba(255,102,0,0.12), 0 2px 5px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.05)'
                : '0 2px 4px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)',
            }}>
              {t === 'mine' ? 'My Scripts' : t === 'tpl' ? 'Templates' : 'Community'}
              {t === 'mine' && saved.length > 0 && (
                <span style={{ fontSize: 9, background: '#1e1e1e', color: tab === t ? '#ff6600' : '#fff', borderRadius: 2, padding: '1px 5px', fontWeight: 800 }}>{saved.length}</span>
              )}
              {t === 'community' && (
                <span style={{ fontSize: 9, background: '#1a0e00', color: '#ff6600', borderRadius: 2, padding: '1px 5px', fontWeight: 800 }}>{COMMUNITY_SCRIPTS.length}</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Panel toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 6 }}>
          <button
            className={`efi-tool-btn ${showLeft ? 'efi-tool-btn-active' : ''}`}
            onClick={() => setShowLeft(s => !s)}
            title="Toggle left panel (Ctrl+B)"
            style={{ ...toolbarBtnBase, padding: '5px 9px', color: showLeft ? '#ff6600' : '#bbb', border: `1px solid ${showLeft ? '#ff660033' : '#222'}`, borderRadius: 3, background: showLeft ? '#0e0800' : 'transparent' }}
          >
            {Icon.panel}
          </button>
          <button
            className={`efi-tool-btn ${showConsole ? 'efi-tool-btn-active' : ''}`}
            onClick={() => setShowConsole(s => !s)}
            title="Toggle console (Ctrl+J)"
            style={{ ...toolbarBtnBase, padding: '5px 9px', color: showConsole ? '#ff6600' : '#bbb', border: `1px solid ${showConsole ? '#ff660033' : '#222'}`, borderRadius: 3, background: showConsole ? '#0e0800' : 'transparent' }}
          >
            {Icon.terminal}
          </button>
          <button
            className={`efi-tool-btn ${showAi ? 'efi-tool-btn-active' : ''}`}
            onClick={() => setShowAi(s => !s)}
            title="Toggle AI panel (Ctrl+\)"
            style={{ ...toolbarBtnBase, padding: '5px 9px', color: showAi ? '#ff6600' : '#bbb', border: `1px solid ${showAi ? '#ff660033' : '#252525'}`, borderRadius: 3, background: showAi ? 'linear-gradient(180deg, #161616 0%, #060606 100%)' : 'linear-gradient(180deg, #181818 0%, #060606 100%)' }}
          >
            {Icon.bot}
          </button>
        </div>

        <div style={{ width: 1, height: 22, background: '#1a1a1a', flexShrink: 0, marginRight: 2 }} />

        {/* Actions */}
        <button className="efi-btn" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (?)" style={{ ...btnBase, padding: '5px 9px' }}>
          {Icon.keyboard}
        </button>
        <button className="efi-btn" onClick={handleNew} title="New (Ctrl+N)" style={btnBase}>
          {Icon.plus}<span>New</span>
        </button>
        <button className="efi-btn" onClick={handleSave} title="Save (Ctrl+S)" style={btnBase}>
          {Icon.save}<span>Save</span>
        </button>
        <button className="efi-btn" onClick={handleDownloadScript} title="Download .js" style={{ ...btnBase, padding: '5px 9px' }}>
          {Icon.download}
        </button>
        <button
          onClick={handleRun}
          disabled={running}
          title="Run (Ctrl+Enter)"
          className="efi-run-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(180deg, #1a1a1a 0%, #060606 100%)',
            border: '1px solid #ff6600',
            borderRadius: 4, color: '#ff6600',
            fontWeight: 800, fontSize: 12,
            padding: '7px 22px', cursor: running ? 'default' : 'pointer',
            letterSpacing: '0.12em', fontFamily: 'inherit',
            opacity: running ? 0.7 : 1,
            boxShadow: '0 0 10px rgba(255,102,0,0.1), 0 2px 6px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
            transition: 'all 0.12s',
          }}
        >
          <span className={running ? 'efi-pulse' : ''}>{running ? Icon.stop : Icon.play}</span>
          <span>{running ? 'RUNNING' : 'RUN'}</span>
        </button>
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* Left Panel */}
        {showLeft && (
          <div style={{
            width: leftW, position: 'relative',
            borderRight: '1px solid #1a1a1a',
            display: 'flex', flexDirection: 'column',
            flexShrink: 0, overflow: 'hidden',
            background: '#060606',
          }}>
            <div className="efi-resize-x" style={{ position: 'absolute', top: 0, right: -2, bottom: 0, width: 5, cursor: 'ew-resize', zIndex: 20, background: 'transparent' }}
              onMouseDown={e => startDrag('left', e, leftW)} />

            {/* Panel header */}
            <div style={{ padding: '8px 12px 8px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: tab === 'mine' ? 8 : 0 }}>
                <div style={{ width: 3, height: 12, background: '#ff6600', borderRadius: 1, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.14em', textTransform: 'uppercase', flex: 1 }}>
                  {tab === 'mine' ? 'My Scripts' : tab === 'tpl' ? 'Templates' : 'Community Library'}
                </span>
                {tab === 'mine' && (
                  <span style={{ fontSize: 10, color: '#aaa' }}>{saved.length} script{saved.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              {/* Search (only MY SCRIPTS) */}
              {tab === 'mine' && (
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: '#444', display: 'flex', pointerEvents: 'none' }}>{Icon.search}</span>
                  <input
                    value={scriptSearch}
                    onChange={e => setScriptSearch(e.target.value)}
                    className="efi-input"
                    placeholder="Search scripts..."
                    style={{ width: '100%', background: '#060606', border: '1px solid #1a1a1a', borderRadius: 3, color: '#ccc', fontSize: 11, padding: '5px 8px 5px 28px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
              {/* MY SCRIPTS */}
              {tab === 'mine' && (
                filteredSaved.length === 0 ? (
                  <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ color: '#444', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{Icon.file}</div>
                    <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.8 }}>
                      {scriptSearch ? 'No matches.' : 'No saved scripts.\nWrite something and hit Save.'}
                    </div>
                  </div>
                ) : (
                  filteredSaved.map(s => (
                    <div key={s.id} className="efi-saved-row" style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 9px', borderRadius: 3, cursor: 'pointer', marginBottom: 1,
                    }} onClick={() => handleLoad(s.name, s.code)}>
                      <span style={{ color: '#444', flexShrink: 0, display: 'flex' }}>{Icon.file}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>
                          {new Date(s.savedAt).toLocaleDateString()} . {s.code.split('\n').length}L
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 3, display: 'flex', flexShrink: 0, borderRadius: 2 }}>
                        {Icon.trash}
                      </button>
                    </div>
                  ))
                )
              )}

              {/* TEMPLATES */}
              {(() => {
                const TPL_COLORS: Record<string, string> = {
                  'tpl-g1': '#4da6ff',
                  'tpl-g2': '#4dffb0',
                  'tpl-g3': '#ffb84d',
                  'tpl-g4': '#c084fc',
                  'tpl-g5': '#4df3ff',
                  'tpl-dark': '#ff6600',
                  'tpl-light': '#f59e0b',
                };
                return tab === 'tpl' && TEMPLATES.map(t => {
                  const accent = TPL_COLORS[t.id] ?? '#ff6600';
                  return (
                    <div key={t.id} className="efi-card" style={{
                      padding: '14px', marginBottom: 8, borderRadius: 5,
                      border: `1px solid ${accent}38`, cursor: 'pointer', background: '#060606',
                    }} onClick={() => handleLoad(t.name, t.code)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0, boxShadow: `0 0 7px ${accent}99` }} />
                        <div style={{ fontSize: 14, color: accent, fontWeight: 700, letterSpacing: '0.01em' }}>{t.name}</div>
                      </div>
                      <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.65 }}>{(t as any).desc}</div>
                    </div>
                  );
                });
              })()}

              {/* COMMUNITY */}
              {tab === 'community' && COMMUNITY_SCRIPTS.map(s => (
                <div key={s.id} className="efi-com-card" style={{
                  padding: '12px', marginBottom: 8, borderRadius: 4,
                  border: '1px solid #181818', background: '#050505',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 12, color: '#fff', fontWeight: 800, lineHeight: 1.3, flex: 1 }}>{s.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, marginLeft: 6, background: '#111', border: '1px solid #2a2a2a', borderRadius: 3, padding: '2px 6px' }}>
                      <span style={{ color: '#ff6600', display: 'flex' }}>{Icon.star}</span>
                      <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>{s.stars}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 10, color: '#ff6600', fontWeight: 700, letterSpacing: '0.04em' }}>{s.author}</span>
                    <span style={{ fontSize: 9, color: categoryColor[s.category] ?? '#888', background: (categoryColor[s.category] ?? '#888') + '18', border: `1px solid ${(categoryColor[s.category] ?? '#888')}44`, borderRadius: 2, padding: '1px 5px', fontWeight: 800, letterSpacing: '0.06em' }}>{s.category}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#ddd', lineHeight: 1.55, marginBottom: 10 }}>{s.desc}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="efi-load-btn" onClick={() => handleLoad(s.name, s.code)} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '7px 0', background: 'linear-gradient(180deg, #1a1a1a 0%, #060606 100%)', border: '1px solid #2a2a2a', borderRadius: 3,
                      color: '#ccc', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}>
                      {Icon.download}&nbsp;LOAD
                    </button>
                    <button className="efi-run-btn" onClick={() => handleRunCode(s.code)} disabled={running} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '7px 0', background: 'linear-gradient(180deg, #1a1a1a 0%, #060606 100%)', border: '1px solid #ff660055', borderRadius: 3,
                      color: '#ff6600', fontSize: 11, fontWeight: 800, cursor: running ? 'default' : 'pointer',
                      fontFamily: 'inherit', letterSpacing: '0.06em', opacity: running ? 0.4 : 1,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}>
                      {Icon.play}&nbsp;RUN
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Console */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

          {/* Editor Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            padding: '3px 10px', borderBottom: '1px solid #1e1e1e',
            background: '#080808', flexShrink: 0, height: 32,
          }}>
            {/* Copy code */}
            <button className={`efi-tool-btn ${copied ? 'efi-tool-btn-active' : ''}`} onClick={handleCopyCode} title="Copy code (Ctrl+Shift+P)" style={{ ...toolbarBtnBase, gap: 5, color: copied ? '#ff6600' : '#fff' }}>
              {copied ? Icon.check : Icon.copy}
              <span style={{ fontSize: 11 }}>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Format */}
            <button className="efi-tool-btn" onClick={handleFormat} title="Format (Ctrl+Shift+F)" style={{ ...toolbarBtnBase, color: '#fff' }}>
              {Icon.format}
              <span style={{ fontSize: 11 }}>Format</span>
            </button>

            <div style={{ width: 1, height: 14, background: '#1e1e1e', margin: '0 4px', flexShrink: 0 }} />

            {/* Word wrap */}
            <button
              className={`efi-tool-btn ${wordWrap === 'on' ? 'efi-tool-btn-active' : ''}`}
              onClick={() => setWordWrap(w => w === 'off' ? 'on' : 'off')}
              title="Toggle word wrap"
              style={{ ...toolbarBtnBase, color: wordWrap === 'on' ? '#ff6600' : '#fff' }}
            >
              {Icon.wrap}
              <span style={{ fontSize: 11 }}>Wrap</span>
            </button>

            {/* Minimap */}
            <button
              className={`efi-tool-btn ${minimapOn ? 'efi-tool-btn-active' : ''}`}
              onClick={() => setMinimapOn(m => !m)}
              title="Toggle minimap"
              style={{ ...toolbarBtnBase, color: minimapOn ? '#ff6600' : '#fff' }}
            >
              {Icon.minimap}
              <span style={{ fontSize: 11 }}>Map</span>
            </button>

            <div style={{ width: 1, height: 14, background: '#1e1e1e', margin: '0 4px', flexShrink: 0 }} />

            {/* Font size */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button className="efi-tool-btn" onClick={() => setEditorFontSize(f => Math.max(10, f - 1))} title="Decrease font size" style={{ ...toolbarBtnBase, padding: '4px 6px', fontSize: 13, fontWeight: 800 }}>-</button>
              <span style={{ fontSize: 11, color: '#fff', minWidth: 24, textAlign: 'center', fontFamily: '"JetBrains Mono", monospace' }}>{editorFontSize}</span>
              <button className="efi-tool-btn" onClick={() => setEditorFontSize(f => Math.min(22, f + 1))} title="Increase font size" style={{ ...toolbarBtnBase, padding: '4px 6px', fontSize: 13, fontWeight: 800 }}>+</button>
            </div>

            <div style={{ flex: 1 }} />

            {/* Export CSV */}
            <button className="efi-tool-btn" onClick={handleExportCsv} title="Export results as CSV (Ctrl+Shift+E)" style={{ ...toolbarBtnBase, gap: 5, color: '#fff' }}>
              {Icon.csv}
              <span style={{ fontSize: 11 }}>Export CSV</span>
            </button>

            {/* Keyboard shortcut hint */}
            <button className="efi-tool-btn" onClick={() => setShowShortcuts(true)} title="Shortcuts (?)" style={{ ...toolbarBtnBase, gap: 5, color: '#fff' }}>
              {Icon.keyboard}
              <span style={{ fontSize: 11 }}>?</span>
            </button>
          </div>

          {/* Monaco Editor */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <MonacoEditor
              height="100%"
              language="javascript"
              value={code}
              onChange={v => setCode(v ?? '')}
              onMount={handleMount}
              options={monacoOptions}
              theme="vs-dark"
              loading={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#030303', color: '#555', fontSize: 11, letterSpacing: '0.15em', fontFamily: '"JetBrains Mono", monospace' }}>
                  LOADING EDITOR...
                </div>
              }
            />
          </div>

          {/* Console */}
          {showConsole && (
            <div style={{
              height: consoleFull ? 'calc(100% - 32px)' : consoleH, flexShrink: 0,
              borderTop: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', background: '#050505',
              ...(consoleFull ? { position: 'absolute', top: 32, left: 0, right: 0, bottom: 0, zIndex: 30 } : {}),
            }}>
              {/* Drag handle */}
              {!consoleFull && (
                <div className="efi-resize-y" style={{ height: 5, cursor: 'ns-resize', flexShrink: 0, background: 'transparent' }}
                  onMouseDown={e => startDrag('console', e, consoleH)} />
              )}

              {/* Console */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, height: 34, background: '#060606' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                  {Icon.terminal}<span>Output</span>
                </span>
                {running && <span className="efi-pulse" style={{ fontSize: 11, color: '#ff6600', fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', marginLeft: 4 }}>- RUNNING</span>}
                {!running && execTime !== null && (
                  <span style={{ fontSize: 10, color: '#bbb', marginLeft: 4, fontFamily: '"JetBrains Mono", monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {Icon.clock}<span>{execTime < 1000 ? execTime + 'ms' : (execTime / 1000).toFixed(2) + 's'}</span>
                  </span>
                )}

                <div style={{ width: 1, height: 14, background: '#1a1a1a', margin: '0 2px' }} />

                {/* Log level filter */}
                {(['all', 'log', 'warn', 'error'] as const).map(f => (
                  <button key={f} className={`efi-logbtn ${logFilter === f ? 'efi-logbtn-active' : ''}`} onClick={() => setLogFilter(f)} style={{
                    background: logFilter === f ? '#161616' : 'transparent', border: logFilter === f ? '1px solid #2a2a2a' : '1px solid transparent',
                    borderRadius: 3, padding: '2px 7px', fontSize: 10, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: logFilter === f
                      ? (f === 'error' ? '#ff4422' : f === 'warn' ? '#ffcc00' : '#fff')
                      : '#666',
                  }}>
                    {f}
                    {f === 'error' && logCounts.errors > 0 && <span style={{ marginLeft: 4, background: '#3a0000', color: '#ff4422', borderRadius: 2, padding: '0 3px' }}>{logCounts.errors}</span>}
                    {f === 'warn' && logCounts.warns > 0 && <span style={{ marginLeft: 4, background: '#2a2000', color: '#ddaa00', borderRadius: 2, padding: '0 3px' }}>{logCounts.warns}</span>}
                  </button>
                ))}

                <div style={{ width: 1, height: 14, background: '#1a1a1a', margin: '0 2px' }} />

                {/* Console */}
                <div style={{ position: 'relative', marginRight: 2 }}>
                  <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: '#555', display: 'flex', pointerEvents: 'none' }}>{Icon.search}</span>
                  <input
                    value={logSearch}
                    onChange={e => setLogSearch(e.target.value)}
                    className="efi-input"
                    placeholder="Filter output..."
                    style={{ background: '#060606', border: '1px solid #1a1a1a', borderRadius: 3, color: '#ccc', fontSize: 11, padding: '3px 8px 3px 24px', fontFamily: 'inherit', width: 130 }}
                  />
                </div>

                <div style={{ flex: 1 }} />

                {logCounts.tables > 0 && (
                  <button className="efi-tool-btn" onClick={handleExportCsv} title="Export table as CSV" style={{ ...toolbarBtnBase, padding: '3px 7px', gap: 4, color: '#fff' }}>
                    {Icon.csv}<span style={{ fontSize: 10 }}>CSV</span>
                  </button>
                )}
                <button onClick={() => setConsoleFull(f => !f)} title={consoleFull ? 'Exit fullscreen' : 'Fullscreen'} style={{ display: 'flex', alignItems: 'center', background: 'none', border: '1px solid #2a2a2a', borderRadius: 3, color: '#fff', cursor: 'pointer', padding: '3px 7px' }}>
                  {consoleFull ? Icon.compress : Icon.expand}
                </button>
                <button onClick={() => setLogs([])} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', padding: '2px 6px', fontFamily: 'inherit', borderRadius: 2 }}>
                  {Icon.close}
                </button>
              </div>

              {/* Log entries */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '3px 0' }}>
                {filteredLogs.length === 0 ? (
                  <div style={{ color: '#666', fontSize: 12, padding: '12px 16px', fontFamily: '"JetBrains Mono", monospace' }}>
                    {logs.length === 0 ? 'Run a script to see output here.' : 'No entries match current filter.'}
                  </div>
                ) : (
                  filteredLogs.map(entry => (
                    <div key={entry.id} style={{ padding: '1px 14px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
                      {entry.type === 'html' ? (
                        <div style={{ margin: '6px 0' }} dangerouslySetInnerHTML={{ __html: entry.message }} />
                      ) : entry.type === 'table' && entry.tableData && entry.tableData.length > 0 ? (
                        <div style={{ overflowX: 'auto', margin: '5px 0' }}>
                          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                            <thead>
                              <tr>
                                {Object.keys(entry.tableData[0] ?? {}).map(k => (
                                  <th key={k} style={{ padding: '5px 14px', textAlign: 'left', borderBottom: '1px solid #161616', color: '#ff6600', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{k}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {entry.tableData.map((row, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : '#040404' }}>
                                  {Object.values(row).map((v, j) => (
                                    <td key={j} style={{ padding: '4px 14px', borderBottom: '1px solid #080808', whiteSpace: 'nowrap', fontSize: 11, color: '#d0d0d0' }}>
                                      {String(v)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '1px 0' }}>
                          <span style={{ color: '#666', fontSize: 10, flexShrink: 0, minWidth: 60 }}>{fmtTime(entry.timestamp)}</span>
                          <span style={{
                            color: entry.type === 'error' ? '#ff4422' : entry.type === 'warn' ? '#cc9900' : entry.type === 'success' ? '#44bb66' : '#d0d0d0',
                            lineHeight: 1.5,
                          }}>
                            {entry.message}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* AI Panel */}
        {showAi && (
          <div style={{ width: aiW, position: 'relative', borderLeft: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, background: '#060606' }}>
            <div className="efi-resize-x" style={{ position: 'absolute', top: 0, left: -2, bottom: 0, width: 5, cursor: 'ew-resize', zIndex: 20, background: 'transparent' }}
              onMouseDown={e => startDrag('ai', e, aiW)} />

            {/* AI header */}
            <div style={{ padding: '9px 14px 9px', borderBottom: '1px solid #1a1a1a', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, background: '#060606' }}>
              <div style={{ width: 3, height: 12, background: '#ff6600', borderRadius: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.14em', textTransform: 'uppercase' }}>AI Assistant</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: '#ff6600', border: '1px solid #ff660044', borderRadius: 2, padding: '2px 6px', fontWeight: 800, letterSpacing: '0.08em' }}>BETA</span>
              <button onClick={() => setAiMsgs([{ role: 'ai', text: 'Chat cleared. Ready.' }])}
                title="Clear chat" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', padding: 3 }}>{Icon.trash}</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 6px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aiMsgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.role === 'ai' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <span style={{ color: '#ff6600', display: 'flex' }}>{Icon.aiSparkle}</span>
                      <span style={{ fontSize: 10, color: '#aaa', fontWeight: 700, letterSpacing: '0.06em' }}>EFI AI</span>
                    </div>
                  )}
                  <div style={{
                    maxWidth: '97%', padding: '8px 10px', borderRadius: m.role === 'user' ? '6px 6px 2px 6px' : '2px 6px 6px 6px',
                    fontSize: 12, lineHeight: 1.7,
                    background: m.role === 'user' ? '#0a0a0a' : 'transparent',
                    border: m.role === 'user' ? '1px solid #1a1a1a' : 'none',
                    color: m.role === 'user' ? '#fff' : '#ddd',
                    fontFamily: '"Inter", sans-serif', whiteSpace: 'pre-wrap',
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                  <span className="efi-pulse" style={{ color: '#ff6600', display: 'flex' }}>{Icon.aiSparkle}</span>
                  <span style={{ color: '#aaa', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>Thinking...</span>
                </div>
              )}
              <div ref={aiEndRef} />
            </div>

            {/* Quick-prompt suggestions */}
            {aiMsgs.length <= 1 && !aiLoading && (
              <div style={{ padding: '0 10px 8px' }}>
                <div style={{ fontSize: 9, color: '#888', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>Suggestions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {AI_SUGGESTIONS.slice(0, 3).map((s, i) => (
                    <button key={i} className="efi-chip" onClick={() => setAiInput(s)} style={{
                      background: '#0a0a0a', border: '1px solid #222', borderRadius: 3,
                      color: '#bbb', fontSize: 11, textAlign: 'left', cursor: 'pointer',
                      padding: '6px 9px', fontFamily: 'inherit', lineHeight: 1.4,
                      transition: 'all 0.12s',
                    }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '8px 10px', borderTop: '1px solid #141414', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
                <textarea
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAI(); } }}
                  placeholder="Describe a script idea..."
                  rows={3}
                  className="efi-input"
                  style={{ flex: 1, background: '#060606', border: '1px solid #1c1c1c', borderRadius: 3, color: '#ddd', fontSize: 12, fontFamily: '"Inter", sans-serif', padding: '8px 10px', resize: 'none', lineHeight: 1.55 }}
                />
                <button onClick={handleAI} disabled={aiLoading || !aiInput.trim()} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, background: aiInput.trim() ? '#0e0600' : '#060606',
                  border: `1px solid ${aiInput.trim() ? '#ff660066' : '#1a1a1a'}`,
                  borderRadius: 3, color: aiInput.trim() ? '#ff6600' : '#333',
                  cursor: aiInput.trim() ? 'pointer' : 'default', flexShrink: 0,
                }}>
                  {Icon.send}
                </button>
              </div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 4, textAlign: 'center', letterSpacing: '0.04em' }}>Enter to send . Shift+Enter = newline</div>
            </div>
          </div>
        )}
      </div>

      {/* STATUS BAR */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        height: 22, borderTop: '1px solid #1a1a1a',
        background: '#030303', flexShrink: 0, overflow: 'hidden',
      }}>
        {/* Left - file/script info */}
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRight: '1px solid #1a1a1a', height: '100%', background: '#0a0a0a' }}>
            <span style={{ color: '#ff6600', display: 'flex' }}>{Icon.lightning}</span>
            <span style={{ fontSize: 10, color: '#ff6600', fontWeight: 800, letterSpacing: '0.1em' }}>EFI</span>
          </div>
          <div className="efi-stat" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', borderRight: '1px solid #111', height: '100%', cursor: 'default' }}>
            <span style={{ color: '#ff9940', display: 'flex' }}>{Icon.code}</span>
            <span style={{ fontSize: 10, color: '#aaa', fontFamily: '"JetBrains Mono", monospace' }}>JavaScript</span>
          </div>
          <div className="efi-stat" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRight: '1px solid #111', height: '100%', cursor: 'default' }}>
            <span style={{ fontSize: 10, color: '#bbb', fontFamily: '"JetBrains Mono", monospace' }}>Ln {cursorLine}, Col {cursorCol}</span>
          </div>
          <div className="efi-stat" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRight: '1px solid #111', height: '100%', cursor: 'default' }}>
            <span style={{ fontSize: 10, color: '#888', fontFamily: '"JetBrains Mono", monospace' }}>{code.split('\n').length}L . {code.length}ch</span>
          </div>
          {execTime !== null && (
            <div className="efi-stat" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRight: '1px solid #111', height: '100%', cursor: 'default' }}>
              <span style={{ color: '#44bb66', display: 'flex' }}>{Icon.clock}</span>
              <span style={{ fontSize: 10, color: '#44bb66', fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
                {execTime < 1000 ? execTime + 'ms' : (execTime / 1000).toFixed(2) + 's'}
              </span>
            </div>
          )}
          {logCounts.errors > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRight: '1px solid #111', height: '100%', background: '#160000' }}>
              <span style={{ fontSize: 10, color: '#ff4422', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>x {logCounts.errors} error{logCounts.errors !== 1 ? 's' : ''}</span>
            </div>
          )}
          {logCounts.warns > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', borderRight: '1px solid #111', height: '100%', background: '#0d0900' }}>
              <span style={{ fontSize: 10, color: '#cc9900', fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>! {logCounts.warns} warn{logCounts.warns !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Right - shortcuts hint */}
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <button onClick={() => setShowShortcuts(true)} className="efi-stat" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', height: '100%', background: 'none', border: 'none', cursor: 'pointer', borderLeft: '1px solid #111' }}>
            <span style={{ color: '#888', display: 'flex' }}>{Icon.keyboard}</span>
            <span style={{ fontSize: 10, color: '#888', letterSpacing: '0.06em' }}>Shortcuts</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: '100%', borderLeft: '1px solid #1a1a1a' }}>
            <span style={{ fontSize: 10, color: '#666', letterSpacing: '0.06em', fontFamily: '"JetBrains Mono", monospace' }}>
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
