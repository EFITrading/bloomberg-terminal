'use client'

import React, { useEffect, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────
interface CycleResponse {
  phase: number
  phaseIdx: number
  phaseName: string
  confidence: number
  signals: {
    spyPrice: number
    spyVs200MA: number
    spyMa200: number
    spyMa50: number
    goldenCross: boolean
    spy1M: number
    spy3M: number
    spy12M: number
    vix: number
    tlt3M: number
  }
  macro: {
    yieldCurve: number
    yieldCurveTrend: number
    daysInverted: number
    fedFunds: number
    fedCutting: boolean
    hySpread: number
    hySpreadTrend: number
    sentiment: number
    sentimentTrend: number
  }
  sectorRanking: Array<{
    ticker: string
    relReturn3M: number
    relReturn1M: number
    cycleAffinity: number
  }>
  phaseSectors: string[]
  fetchErrors: string[]
  timestamp: string
}

interface TradePick {
  ticker: string
  name: string
  direction: 'LONG' | 'SHORT' | 'AVOID' | 'HEDGE' | 'WATCH'
  conviction: 'HIGH' | 'MED' | 'LOW'
  rationale: string
  category: 'EQUITY' | 'BONDS' | 'COMMODITY' | 'VOLATILITY' | 'CASH'
}

interface PhaseAllocation {
  equities: number
  bonds: number
  alternatives: number
  cash: number
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PHASE_NAMES = [
  'Market Bottom',
  'Early Recovery',
  'Early Bull',
  'Middle Bull',
  'Late Bull / Peak',
  'Early Bear',
  'Bear Market',
  'Late Bear',
]

const PHASE_COLORS = [
  '#ef4444', // 0 Bottom        — red
  '#f97316', // 1 Early Recovery — orange
  '#f59e0b', // 2 Early Bull    — amber
  '#84cc16', // 3 Middle Bull   — lime
  '#00ff41', // 4 Late Bull     — bright green
  '#facc15', // 5 Early Bear    — yellow
  '#f97316', // 6 Bear Market   — orange
  '#ef4444', // 7 Late Bear     — red
]

const SECTOR_LABELS: Record<string, string> = {
  XLE: 'Energy',
  XLF: 'Financials',
  XLK: 'Technology',
  XLV: 'Health Care',
  XLP: 'Cons. Staples',
  XLY: 'Cons. Discret',
  XLI: 'Industrials',
  XLU: 'Utilities',
  XLB: 'Materials',
  XLRE: 'Real Estate',
  XLC: 'Comm. Svcs',
}

// ── Phase-specific trade picks ────────────────────────────────────────────────
const PHASE_TRADE_PICKS: Record<number, TradePick[]> = {
  0: [
    {
      ticker: 'TLT',
      name: 'Long-Duration Treasuries',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Peak fear → flight to quality; 20Y bond rally typical at cycle trough',
      category: 'BONDS',
    },
    {
      ticker: 'GLD',
      name: 'Gold ETF',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Safe-haven premium at extremes; dollar weakens into Fed pivot',
      category: 'COMMODITY',
    },
    {
      ticker: 'XLU',
      name: 'Utilities Select SPDR',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Defensive yield in recession; dividend premium sought by risk-off capital',
      category: 'EQUITY',
    },
    {
      ticker: 'BIL',
      name: 'T-Bill / Cash',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Capital preservation; elevated rates = attractive risk-free return',
      category: 'CASH',
    },
    {
      ticker: 'XLY',
      name: 'Consumer Discretionary',
      direction: 'AVOID',
      conviction: 'HIGH',
      rationale: 'Cyclical names crater in trough; consumer confidence at lows',
      category: 'EQUITY',
    },
    {
      ticker: 'VXX',
      name: 'VIX Futures ETN',
      direction: 'HEDGE',
      conviction: 'MED',
      rationale: 'VIX can spike higher even from elevated levels; tail risk protection',
      category: 'VOLATILITY',
    },
  ],
  1: [
    {
      ticker: 'XLF',
      name: 'Financials Select SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Financials historically lead the first leg of recovery; credit cycle turns',
      category: 'EQUITY',
    },
    {
      ticker: 'XLY',
      name: 'Consumer Discretionary',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Consumer spending rebounds early in recovery; pent-up demand',
      category: 'EQUITY',
    },
    {
      ticker: 'IWM',
      name: 'Russell 2000 Small Caps',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Small caps outperform at cycle turns; domestic revenue, rate-sensitive benefit',
      category: 'EQUITY',
    },
    {
      ticker: 'SPY',
      name: 'S&P 500 ETF',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Broad market re-entry as breadth expands; 200MA reclaim is key',
      category: 'EQUITY',
    },
    {
      ticker: 'TLT',
      name: 'Long-Duration Treasuries',
      direction: 'AVOID',
      conviction: 'MED',
      rationale: 'Rate normalization underway; bond prices under pressure as risk appetite returns',
      category: 'BONDS',
    },
    {
      ticker: 'XLK',
      name: 'Technology SPDR',
      direction: 'WATCH',
      conviction: 'LOW',
      rationale:
        'Tech lags early recovery; wait for golden cross + breadth expansion before adding',
      category: 'EQUITY',
    },
  ],
  2: [
    {
      ticker: 'XLI',
      name: 'Industrials Select SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Classic early bull leader; capex cycle picks up, manufacturing PMI expanding',
      category: 'EQUITY',
    },
    {
      ticker: 'XLF',
      name: 'Financials Select SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Loan growth accelerates; net interest margin expanding in normalization phase',
      category: 'EQUITY',
    },
    {
      ticker: 'QQQ',
      name: 'Nasdaq 100 ETF',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Tech beginning participation; growth multiples re-rate as rates peak',
      category: 'EQUITY',
    },
    {
      ticker: 'IWM',
      name: 'Russell 2000 Small Caps',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Small cap momentum sustaining; economic surprise uplift favors domestic names',
      category: 'EQUITY',
    },
    {
      ticker: 'XLU',
      name: 'Utilities Select SPDR',
      direction: 'AVOID',
      conviction: 'HIGH',
      rationale: 'Defensives rotate out as risk appetite builds; opportunity cost rising',
      category: 'EQUITY',
    },
    {
      ticker: 'GLD',
      name: 'Gold ETF',
      direction: 'AVOID',
      conviction: 'MED',
      rationale: 'Risk-on rotation pulls capital from safe-havens; real rates rising',
      category: 'COMMODITY',
    },
  ],
  3: [
    {
      ticker: 'QQQ',
      name: 'Nasdaq 100 ETF',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale:
        'Tech/growth drives mid-cycle; earnings revisions positive, multiple expansion intact',
      category: 'EQUITY',
    },
    {
      ticker: 'XLK',
      name: 'Technology SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Sector leadership in mid-bull; AI/capex spending cycle adds structural tailwind',
      category: 'EQUITY',
    },
    {
      ticker: 'XLC',
      name: 'Comm. Services SPDR',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Digital ad + mega-cap growth plays outperform mid-cycle; high ROE names',
      category: 'EQUITY',
    },
    {
      ticker: 'MTUM',
      name: 'iShares Momentum ETF',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Momentum factor peaks in mid-bull; trend-following strategies excel',
      category: 'EQUITY',
    },
    {
      ticker: 'TLT',
      name: 'Long-Duration Treasuries',
      direction: 'AVOID',
      conviction: 'HIGH',
      rationale: 'Rising nominal rates pressure duration; equity > bonds in mid-cycle',
      category: 'BONDS',
    },
    {
      ticker: 'XLP',
      name: 'Consumer Staples SPDR',
      direction: 'AVOID',
      conviction: 'MED',
      rationale: 'Low beta defensives lag in strong bull; opportunity cost significant',
      category: 'EQUITY',
    },
  ],
  4: [
    {
      ticker: 'XLE',
      name: 'Energy Select SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Energy leads late-cycle; inflation, tight supply, commodity supercycle demand',
      category: 'EQUITY',
    },
    {
      ticker: 'XLB',
      name: 'Materials Select SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Materials cycle peaks with commodities; infrastructure spending at highs',
      category: 'EQUITY',
    },
    {
      ticker: 'GLD',
      name: 'Gold ETF',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Inflation hedge as cycle peaks; real rate pressure if Fed lags behind curve',
      category: 'COMMODITY',
    },
    {
      ticker: 'DBA',
      name: 'Agricultural Commodities',
      direction: 'LONG',
      conviction: 'LOW',
      rationale: 'Commodity breadth broadening; agri inflation hedge in late-cycle environment',
      category: 'COMMODITY',
    },
    {
      ticker: 'TLT',
      name: 'Long-Duration Bonds',
      direction: 'HEDGE',
      conviction: 'MED',
      rationale: 'Start accumulating small duration position; rate peak approaching',
      category: 'BONDS',
    },
    {
      ticker: 'XLK',
      name: 'Technology SPDR',
      direction: 'AVOID',
      conviction: 'MED',
      rationale: 'High P/E growth multiples compress as rates rise into late cycle; valuation risk',
      category: 'EQUITY',
    },
  ],
  5: [
    {
      ticker: 'XLV',
      name: 'Health Care Select SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Healthcare defensive rotation; non-discretionary spending, earnings resilience',
      category: 'EQUITY',
    },
    {
      ticker: 'XLP',
      name: 'Consumer Staples SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Staples lead distribution phase; pricing power + dividend yield attractive',
      category: 'EQUITY',
    },
    {
      ticker: 'TLT',
      name: 'Long-Duration Treasuries',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Rate cuts incoming; bond duration begins to benefit as growth slows',
      category: 'BONDS',
    },
    {
      ticker: 'SH',
      name: 'ProShares Short S&P 500',
      direction: 'HEDGE',
      conviction: 'MED',
      rationale: 'Portfolio hedge as distribution confirms; limit equity beta exposure',
      category: 'EQUITY',
    },
    {
      ticker: 'XLK',
      name: 'Technology SPDR',
      direction: 'AVOID',
      conviction: 'HIGH',
      rationale: 'Growth multiples compress in early bear; earnings estimates seeing first cuts',
      category: 'EQUITY',
    },
    {
      ticker: 'XLF',
      name: 'Financials SPDR',
      direction: 'AVOID',
      conviction: 'MED',
      rationale: 'Credit cycle turning; loan losses rising, net interest margin peaking',
      category: 'EQUITY',
    },
  ],
  6: [
    {
      ticker: 'TLT',
      name: 'Long-Duration Treasuries',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Full flight to safety; Fed cutting, deflation risk → 20Y bond prime beneficiary',
      category: 'BONDS',
    },
    {
      ticker: 'GLD',
      name: 'Gold ETF',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Macro hedge + dollar debasement as fiscal/monetary stimulus deployed',
      category: 'COMMODITY',
    },
    {
      ticker: 'SH',
      name: 'ProShares Short S&P 500',
      direction: 'SHORT',
      conviction: 'HIGH',
      rationale: 'Confirmed bear market; systematic equity short provides asymmetric return',
      category: 'EQUITY',
    },
    {
      ticker: 'SQQQ',
      name: 'ProShares Ultra Short QQQ',
      direction: 'SHORT',
      conviction: 'MED',
      rationale: 'Nasdaq leads drawdown; high-beta growth names de-rate faster than value',
      category: 'VOLATILITY',
    },
    {
      ticker: 'BIL',
      name: 'T-Bill / Cash',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Capital preservation priority; high real return waiting for opportunity',
      category: 'CASH',
    },
    {
      ticker: 'XLY',
      name: 'Consumer Discretionary',
      direction: 'AVOID',
      conviction: 'HIGH',
      rationale: 'Cyclicals suffer most in broad bear; earnings and revenue both compress',
      category: 'EQUITY',
    },
  ],
  7: [
    {
      ticker: 'XLU',
      name: 'Utilities Select SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale:
        'Utilities at relative valuation extreme; dividend premium + rate decline incoming',
      category: 'EQUITY',
    },
    {
      ticker: 'XLP',
      name: 'Consumer Staples SPDR',
      direction: 'LONG',
      conviction: 'HIGH',
      rationale: 'Late bear defensive; recession-proof earnings, stable dividends',
      category: 'EQUITY',
    },
    {
      ticker: 'TLT',
      name: 'Long-Duration Treasuries',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Rates falling + Fed easing cycle; duration outperforms into policy pivot',
      category: 'BONDS',
    },
    {
      ticker: 'GLD',
      name: 'Gold ETF',
      direction: 'LONG',
      conviction: 'MED',
      rationale: 'Policy pivot + QE risk = gold structural bid; real rate decline boosts price',
      category: 'COMMODITY',
    },
    {
      ticker: 'XLF',
      name: 'Financials SPDR',
      direction: 'WATCH',
      conviction: 'LOW',
      rationale:
        'Watch XLF for early recovery signal; financials bottom before market in past cycles',
      category: 'EQUITY',
    },
    {
      ticker: 'IWM',
      name: 'Russell 2000 Small Caps',
      direction: 'WATCH',
      conviction: 'LOW',
      rationale: 'Small caps react sharply to first Fed cut; monitor for capitulation signal',
      category: 'EQUITY',
    },
  ],
}

const PHASE_ALLOCATION: Record<number, PhaseAllocation> = {
  0: { equities: 15, bonds: 45, alternatives: 20, cash: 20 },
  1: { equities: 50, bonds: 25, alternatives: 10, cash: 15 },
  2: { equities: 65, bonds: 20, alternatives: 10, cash: 5 },
  3: { equities: 75, bonds: 15, alternatives: 8, cash: 2 },
  4: { equities: 60, bonds: 15, alternatives: 22, cash: 3 },
  5: { equities: 40, bonds: 35, alternatives: 12, cash: 13 },
  6: { equities: 20, bonds: 40, alternatives: 20, cash: 20 },
  7: { equities: 25, bonds: 40, alternatives: 18, cash: 17 },
}

const PHASE_MACRO_CONTEXT: Record<
  number,
  { title: string; thesis: string; risks: string; keyWatch: string }
> = {
  0: {
    title: 'Deep Bear / Capitulation',
    thesis:
      'Market pricing maximum pessimism. Valuation support emerging but catalysts absent. Hold maximum defensive exposure and cash. Wait for VIX reversal below 30 + XLF stabilization as first signal of recovery.',
    risks:
      'Bear market rally traps premature buyers. Macro deterioration can extend trough duration beyond consensus expectations.',
    keyWatch:
      'VIX < 30 reversal · XLF vs SPY ratio bottom · Yield curve steepening · Credit spreads peaking',
  },
  1: {
    title: 'Recovery Inflection',
    thesis:
      'Credit markets lead equity recovery. Financials and Consumer Discretionary begin relative outperformance. Add risk gradually. 200MA remains overhead resistance — a decisive reclaim is the primary confirmation signal.',
    risks:
      'False dawn — macro data still deteriorating. Recovery can stall if credit spreads re-widen or unemployment spikes.',
    keyWatch:
      'SPY reclaim 200MA · ISM Manufacturing > 50 · HY spread < 4% · NFIB survey improvement',
  },
  2: {
    title: 'Early Bull — Expansion Phase',
    thesis:
      'Trend firmly re-established above 200MA. Golden cross confirmed. Industrials and cyclicals lead. Risk appetite expanding — add equity beta. Breadth broadening is primary health indicator to track.',
    risks:
      'Overheating rhetoric from Fed if CPI re-accelerates. Geopolitical shock can reset the trend.',
    keyWatch:
      'SPY breadth (% above 50MA) · Yield curve slope · ISM Services · Small cap / large cap ratio',
  },
  3: {
    title: 'Mid-Cycle Expansion',
    thesis:
      'Peak risk appetite phase. Technology and growth lead. Earnings revisions positive. Maximum equity allocation warranted. Momentum factor strongest here. This phase typically lasts longest in the cycle.',
    risks:
      'Concentration risk in mega-cap tech. Any Fed pivot to hawkishness re-prices multiples aggressively.',
    keyWatch:
      'Fed language shift · 10Y Treasury > 5% threshold · PCE inflation acceleration · Tech earnings revisions',
  },
  4: {
    title: 'Late Bull — Inflationary Peak',
    thesis:
      'Inflation assets lead as economy runs hot. Energy and Materials cycle. Equity markets still elevated but sector rotation narrows. Begin layering in hedges. Hard landing risk building — monitor credit spreads.',
    risks:
      'Fed overtightening causes abrupt reversal. Geopolitical commodity supply shock can accelerate the phase transition.',
    keyWatch:
      'Yield curve inversion depth · HY spreads > 4% · ISM Manufacturing < 50 · Earnings guidance cuts',
  },
  5: {
    title: 'Early Bear / Distribution',
    thesis:
      'Institutional distribution underway. Smart money rotating to defensives. Healthcare and Staples begin relative outperformance. Trim equity beta, add duration, initiate portfolio hedges.',
    risks:
      'Soft landing narrative delays defensive rotation. Fed pausing creates bear market rallies that trap latecomers.',
    keyWatch:
      'Credit spread widening pace · Consumer confidence decline · Leading indicators · Employment claims',
  },
  6: {
    title: 'Confirmed Bear Market',
    thesis:
      'Systematic drawdown in progress. Capital preservation is the primary objective. Treasury duration and gold are the primary asset classes. Equity short strategies viable. Await capitulation signals before re-entry.',
    risks:
      'Policy reversal (unexpected Fed cut or fiscal stimulus) can trigger violent bear market rally. Size short positions accordingly.',
    keyWatch:
      'VIX > 40 spike (capitulation signal) · Credit spread peak · Fed emergency action · Recession confirmed',
  },
  7: {
    title: 'Late Bear / Pre-Capitulation',
    thesis:
      'Cycle approaching max pessimism. Defensives at relative extremes. Begin accumulating high-quality positions at significant discounts. Monitor XLF and IWM for early recovery breadcrumbs. Cash is a call option on the recovery.',
    risks:
      'Trough uncertain — secular/structural bear can extend. Japan 1990s or GFC 2008 scenarios possible if policy error continues.',
    keyWatch:
      'XLF relative bottom · Buffett indicator (market cap/GDP) · Corporate insider buying · AAII bull/bear < 25%',
  },
}

type TabId = 'overview' | 'macro' | 'picks' | 'sectors'

// ── Sine wave SVG helpers ─────────────────────────────────────────────────────
function phaseToWaveCoords(phase: number, svgW: number, svgH: number) {
  const margin = { l: 60, r: 60, t: 40, b: 40 }
  const W = svgW - margin.l - margin.r
  const H = svgH - margin.t - margin.b
  const cx = svgH / 2 + margin.t
  const xFrac = phase / 7
  const x = margin.l + xFrac * W
  const angleStep = Math.PI / 4
  const angle = Math.PI / 2 + (phase - 4) * angleStep
  const sinVal = Math.sin(angle)
  const amplitude = H * 0.38
  const y = cx - sinVal * amplitude
  return { x, y }
}

function buildWavePath(svgW: number, svgH: number): string {
  const margin = { l: 60, r: 60, t: 40, b: 40 }
  const W = svgW - margin.l - margin.r
  const H = svgH - margin.t - margin.b
  const cx = H / 2 + margin.t
  const amplitude = H * 0.38
  const points: string[] = []
  for (let i = 0; i <= 200; i++) {
    const frac = i / 200
    const phase = frac * 7
    const angle = Math.PI / 2 + (phase - 4) * (Math.PI / 4)
    const sinVal = Math.sin(angle)
    const x = margin.l + frac * W
    const y = cx - sinVal * amplitude
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return points.join(' ')
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SignalTile({
  label,
  value,
  signal,
  sub,
}: {
  label: string
  value: string
  signal: 'bull' | 'bear' | 'neutral'
  sub?: string
}) {
  const color = signal === 'bull' ? '#00ff41' : signal === 'bear' ? '#ff3333' : '#f59e0b'
  const bg = signal === 'bull' ? '#00ff4110' : signal === 'bear' ? '#ff333310' : '#f59e0b10'
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${color}33`,
        borderRadius: 8,
        padding: '10px 14px',
        flex: '1 1 120px',
        minWidth: 110,
      }}
    >
      <div
        style={{
          color: '#ffffff',
          fontSize: 18,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 4,
          fontFamily: '"Roboto Mono", monospace',
        }}
      >
        {label}
      </div>
      <div
        style={{
          color,
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: '-0.3px',
          fontFamily: '"Roboto Mono", monospace',
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            color: '#ffffff',
            fontSize: 20,
            marginTop: 2,
            fontFamily: '"Roboto Mono", monospace',
          }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

function TradePickCard({ pick, phaseColor }: { pick: TradePick; phaseColor: string }) {
  const dirColors: Record<TradePick['direction'], string> = {
    LONG: '#00ff41',
    SHORT: '#ff3333',
    AVOID: '#f97316',
    HEDGE: '#f59e0b',
    WATCH: '#8b5cf6',
  }
  const convDots: Record<TradePick['conviction'], number> = { HIGH: 3, MED: 2, LOW: 1 }
  const catIcons: Record<TradePick['category'], string> = {
    EQUITY: '◈',
    BONDS: '◉',
    COMMODITY: '◆',
    VOLATILITY: '◇',
    CASH: '○',
  }
  const dir = pick.direction
  const dColor = dirColors[dir]
  const dots = convDots[pick.conviction]
  return (
    <div
      style={{
        background: '#060606',
        border: `1px solid ${dColor}22`,
        borderLeft: `3px solid ${dColor}`,
        borderRadius: 8,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              color: dColor,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '0.12em',
              background: `${dColor}18`,
              border: `1px solid ${dColor}44`,
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            {dir}
          </span>
          <span
            style={{
              color: '#ffffff',
              fontSize: 26,
              fontWeight: 800,
              fontFamily: '"Roboto Mono", monospace',
            }}
          >
            {pick.ticker}
          </span>
          <span style={{ color: '#ffffff', fontSize: 18 }}>{catIcons[pick.category]}</span>
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {[1, 2, 3].map((d) => (
            <div
              key={d}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: d <= dots ? dColor : '#222',
              }}
            />
          ))}
          <span style={{ color: '#ffffff', fontSize: 18, marginLeft: 4, letterSpacing: '0.08em' }}>
            {pick.conviction}
          </span>
        </div>
      </div>
      <div style={{ color: '#ffffff', fontSize: 18, marginBottom: 3, letterSpacing: '0.04em' }}>
        {pick.name}
      </div>
      <div style={{ color: '#ffffff', fontSize: 20, lineHeight: 1.5 }}>{pick.rationale}</div>
    </div>
  )
}

function AllocationBar({
  allocation,
  phaseColor,
}: {
  allocation: PhaseAllocation
  phaseColor: string
}) {
  const segments = [
    { label: 'EQUITIES', value: allocation.equities, color: phaseColor },
    { label: 'BONDS', value: allocation.bonds, color: '#3b82f6' },
    { label: 'ALTS', value: allocation.alternatives, color: '#f59e0b' },
    { label: 'CASH', value: allocation.cash, color: '#555' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 1 }}>
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${s.value}%`, background: s.color, transition: 'width 0.5s ease' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: s.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: '#ffffff', fontSize: 18, letterSpacing: '0.1em' }}>
              {s.label}
            </span>
            <span style={{ color: '#ffffff', fontSize: 20, fontWeight: 800 }}>{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MacroBar({
  label,
  value,
  min,
  max,
  signal,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  signal: 'bull' | 'bear' | 'neutral'
  format?: (v: number) => string
}) {
  const color = signal === 'bull' ? '#00ff41' : signal === 'bear' ? '#ff3333' : '#f59e0b'
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const fmt = format ?? ((v: number) => v.toFixed(2))
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 0',
        borderBottom: '1px solid #0f0f0f',
      }}
    >
      <div
        style={{
          color: '#ffffff',
          fontSize: 18,
          letterSpacing: '0.1em',
          width: 160,
          flexShrink: 0,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <div
        style={{
          color,
          fontSize: 22,
          fontWeight: 800,
          fontFamily: '"Roboto Mono", monospace',
          width: 60,
          textAlign: 'right',
          flexShrink: 0,
        }}
      >
        {fmt(value)}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketCycleIndicator() {
  const [data, setData] = useState<CycleResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pulse, setPulse] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const svgW = 860
  const svgH = 200

  useEffect(() => {
    fetch('/api/market-cycle')
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load cycle data')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 900)
    return () => clearInterval(id)
  }, [])

  const wavePath = buildWavePath(svgW, svgH)

  if (loading) {
    return (
      <div
        style={{
          background: '#000',
          border: '1px solid #111',
          borderRadius: 12,
          padding: '40px',
          textAlign: 'center',
          fontFamily: '"Roboto Mono", monospace',
          color: '#ffffff',
          letterSpacing: '0.12em',
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 8 }}>ANALYZING MARKET CYCLE</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#333',
                animation: `pulse ${0.8 + i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div
        style={{
          background: '#000',
          border: '1px solid #ff333330',
          borderRadius: 12,
          padding: '32px',
          textAlign: 'center',
          fontFamily: '"Roboto Mono", monospace',
          color: '#ff3333',
          fontSize: 22,
        }}
      >
        {error ?? 'No data'}
      </div>
    )
  }

  const phaseColor = PHASE_COLORS[data.phaseIdx] ?? '#ffffff'
  const { x: dotX, y: dotY } = phaseToWaveCoords(data.phase, svgW, svgH)
  const sig = data.signals
  const mac = data.macro
  const phaseCoords = PHASE_NAMES.map((_, i) => phaseToWaveCoords(i, svgW, svgH))
  const allocation = PHASE_ALLOCATION[data.phaseIdx] ?? PHASE_ALLOCATION[3]
  const macroCtx = PHASE_MACRO_CONTEXT[data.phaseIdx]
  const tradePicks = PHASE_TRADE_PICKS[data.phaseIdx] ?? []

  // Active wave segment
  const activeWavePts: string[] = []
  for (let i = 0; i <= 100; i++) {
    const frac = (i / 100) * (data.phase / 7)
    const phase = frac * 7
    const x = 60 + frac * (svgW - 120)
    const angle = Math.PI / 2 + (phase - 4) * (Math.PI / 4)
    const y = svgH / 2 - Math.sin(angle) * (svgH - 80) * 0.38
    activeWavePts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  const activeWavePath = activeWavePts.join(' ')

  // Signal helpers
  const vixSignal: 'bull' | 'bear' | 'neutral' =
    sig.vix < 18 ? 'bull' : sig.vix < 26 ? 'neutral' : 'bear'
  const vixLabel =
    sig.vix < 14 ? 'COMPLACENT' : sig.vix < 20 ? 'LOW' : sig.vix < 28 ? 'ELEVATED' : 'FEAR'
  const trendSignal: 'bull' | 'bear' | 'neutral' = sig.spyVs200MA > 0 ? 'bull' : 'bear'
  const momSignal: 'bull' | 'bear' | 'neutral' = sig.spy3M > 0 ? 'bull' : 'bear'
  const bondSignal: 'bull' | 'bear' | 'neutral' =
    sig.tlt3M > 5 ? 'bear' : sig.tlt3M < -3 ? 'bull' : 'neutral'
  const bondLabel = sig.tlt3M > 5 ? 'FLIGHT SAFETY' : sig.tlt3M < -3 ? 'RATES RISING' : 'NEUTRAL'
  const ycSignal: 'bull' | 'bear' | 'neutral' =
    mac.yieldCurve > 0.5 ? 'bull' : mac.yieldCurve < 0 ? 'bear' : 'neutral'
  const ycLabel =
    mac.yieldCurve < -0.5
      ? 'DEEPLY INVERTED'
      : mac.yieldCurve < 0
        ? 'INVERTED'
        : mac.yieldCurve < 0.5
          ? 'FLAT'
          : mac.yieldCurve < 1.5
            ? 'NORMAL'
            : 'STEEP'
  const ycTrendIcon =
    mac.yieldCurveTrend > 0.2
      ? '▲ STEEPENING'
      : mac.yieldCurveTrend < -0.2
        ? '▼ INVERTING'
        : '→ FLAT'
  const hySignal: 'bull' | 'bear' | 'neutral' =
    mac.hySpread < 3.5 ? 'bull' : mac.hySpread > 5 ? 'bear' : 'neutral'
  const hyLabel =
    mac.hySpread < 2.5
      ? 'TIGHT / RISK-ON'
      : mac.hySpread < 3.5
        ? 'LOW'
        : mac.hySpread < 5
          ? 'ELEVATED'
          : 'STRESS'
  const fedSignal: 'bull' | 'bear' | 'neutral' = mac.fedCutting
    ? 'bull'
    : mac.fedFunds > 4.5
      ? 'bear'
      : 'neutral'
  const fedLabel = mac.fedCutting
    ? 'CUTTING ↓'
    : mac.fedFunds > 5
      ? 'VERY TIGHT'
      : mac.fedFunds > 4
        ? 'RESTRICTIVE'
        : 'NEUTRAL'
  const sentSignal: 'bull' | 'bear' | 'neutral' =
    mac.sentiment > 80
      ? 'neutral'
      : mac.sentiment > 65
        ? 'bull'
        : mac.sentiment < 55
          ? 'bear'
          : 'neutral'
  const sentLabel =
    mac.sentiment > 85
      ? 'EUPHORIA'
      : mac.sentiment > 70
        ? 'STRONG'
        : mac.sentiment > 60
          ? 'CAUTIOUS'
          : mac.sentiment > 50
            ? 'WEAK'
            : 'RECESSION'

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'macro', label: 'MACRO' },
    { id: 'picks', label: 'TRADE PICKS' },
    { id: 'sectors', label: 'SECTORS' },
  ]

  return (
    <div
      style={{
        background: '#000000',
        border: '1px solid #111',
        borderRadius: 12,
        fontFamily: '"Roboto Mono", monospace',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '20px 28px 0',
          background: 'linear-gradient(180deg, #0c0c0c 0%, #060606 100%)',
          borderBottom: '1px solid #111',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 16px #3b82f640',
                flexShrink: 0,
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="square"
              >
                <path d="M2 12 Q5 4 8 12 Q11 20 14 12 Q17 4 20 12 Q22 16 24 12" />
              </svg>
            </div>
            <div>
              <div
                style={{
                  color: '#fff',
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Market Cycle Positioning
              </div>
              <div
                style={{
                  color: '#ffffff',
                  fontSize: 18,
                  letterSpacing: '0.1em',
                  marginTop: 3,
                  textTransform: 'uppercase',
                }}
              >
                Sector Rotation · Macro Signals · Trade Picks
              </div>
            </div>
          </div>

          {/* Phase badge + confidence */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div
              style={{
                background: `${phaseColor}15`,
                border: `1px solid ${phaseColor}44`,
                borderRadius: 8,
                padding: '8px 20px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  color: phaseColor,
                  fontSize: 31,
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {data.phaseName}
              </div>
              <div
                style={{
                  color: '#ffffff',
                  fontSize: 18,
                  marginTop: 3,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                {data.confidence}% CONFIDENCE · SPY ${sig.spyPrice.toFixed(0)}
              </div>
            </div>
            {/* Phase step indicators */}
            <div style={{ display: 'flex', gap: 3 }}>
              {PHASE_NAMES.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === data.phaseIdx ? 18 : 6,
                    height: 4,
                    borderRadius: 2,
                    background:
                      i === data.phaseIdx
                        ? phaseColor
                        : i < data.phaseIdx
                          ? `${phaseColor}55`
                          : '#1a1a1a',
                    transition: 'width 0.4s ease',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #111' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '14px 28px',
                fontSize: 26,
                letterSpacing: '0.1em',
                color: activeTab === tab.id ? phaseColor : '#ffffff',
                borderBottom:
                  activeTab === tab.id ? `2px solid ${phaseColor}` : '2px solid transparent',
                fontFamily: '"Roboto Mono", monospace',
                fontWeight: activeTab === tab.id ? 900 : 600,
                transition: 'color 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Fetch error banner ───────────────────────────────────────── */}
      {data.fetchErrors?.length > 0 && (
        <div
          style={{
            padding: '5px 28px',
            background: '#ff333310',
            borderBottom: '1px solid #ff333330',
            fontSize: 18,
            color: '#ff333388',
            letterSpacing: '0.08em',
          }}
        >
          ⚠ PARTIAL DATA: {data.fetchErrors.join(' · ')}
        </div>
      )}

      {/* ══════════════════ TAB: OVERVIEW ════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div>
          {/* Sine wave */}
          <div style={{ padding: '24px 28px 8px' }}>
            <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ overflow: 'visible' }}>
              <defs>
                <filter id="mci-glow">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="mci-waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
                  <stop offset="30%" stopColor="#f97316" stopOpacity="1" />
                  <stop offset="57%" stopColor="#00ff41" stopOpacity="1" />
                  <stop offset="75%" stopColor="#f97316" stopOpacity="1" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="1" />
                </linearGradient>
              </defs>
              <line
                x1="60"
                y1={svgH / 2}
                x2={svgW - 60}
                y2={svgH / 2}
                stroke="#111"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <path d={wavePath} stroke="#161616" strokeWidth="2" fill="none" />
              <path
                d={wavePath}
                stroke="url(#mci-waveGrad)"
                strokeWidth="2.5"
                fill="none"
                opacity={0.6}
              />
              <path
                d={activeWavePath}
                stroke={phaseColor}
                strokeWidth="3"
                fill="none"
                filter="url(#mci-glow)"
              />
              {phaseCoords.map((coord, i) => {
                const isCurrent = i === data.phaseIdx
                const c = PHASE_COLORS[i]
                const isTop = Math.sin(Math.PI / 2 + ((i - 4) * Math.PI) / 4) > 0
                return (
                  <g key={i}>
                    <circle
                      cx={coord.x}
                      cy={coord.y}
                      r={isCurrent ? 0 : 4}
                      fill={c}
                      opacity={0.9}
                    />
                    <text
                      x={coord.x}
                      y={isTop ? coord.y - 16 : coord.y + 22}
                      textAnchor="middle"
                      fill={isCurrent ? phaseColor : '#ffffff'}
                      fontSize={isCurrent ? 20 : 16}
                      fontWeight={isCurrent ? 800 : 500}
                      fontFamily='"Roboto Mono", monospace'
                      letterSpacing="0.04em"
                    >
                      {PHASE_NAMES[i].split(' / ')[0]}
                    </text>
                  </g>
                )
              })}
              <circle cx={dotX} cy={dotY} r="22" fill={phaseColor} opacity={pulse ? 0.08 : 0.03} />
              <circle cx={dotX} cy={dotY} r="14" fill={phaseColor} opacity={pulse ? 0.14 : 0.06} />
              <circle cx={dotX} cy={dotY} r="8" fill={phaseColor} filter="url(#mci-glow)" />
              <circle cx={dotX} cy={dotY} r="5" fill="#000" />
              <circle cx={dotX} cy={dotY} r="3" fill={phaseColor} />
              <text
                x={dotX}
                y={dotY + 36}
                textAnchor="middle"
                fill={phaseColor}
                fontSize={18}
                fontWeight={700}
                fontFamily='"Roboto Mono", monospace'
                letterSpacing="0.1em"
              >
                ▲ YOU ARE HERE
              </text>
            </svg>
          </div>

          {/* Technical signal tiles */}
          <div style={{ padding: '4px 28px 12px' }}>
            <div
              style={{
                color: '#ffffff',
                fontSize: 18,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Technical Signals
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SignalTile
                label="SPY vs 200MA"
                value={`${sig.spyVs200MA > 0 ? '+' : ''}${sig.spyVs200MA}%`}
                signal={trendSignal}
                sub={sig.goldenCross ? 'GOLDEN CROSS ✓' : 'DEATH CROSS ✗'}
              />
              <SignalTile
                label="Momentum 3M"
                value={`${sig.spy3M > 0 ? '+' : ''}${sig.spy3M}%`}
                signal={momSignal}
                sub={`12M: ${sig.spy12M > 0 ? '+' : ''}${sig.spy12M}%`}
              />
              <SignalTile
                label="VIX"
                value={sig.vix.toFixed(1)}
                signal={vixSignal}
                sub={vixLabel}
              />
              <SignalTile
                label="Bonds TLT 3M"
                value={`${sig.tlt3M > 0 ? '+' : ''}${sig.tlt3M}%`}
                signal={bondSignal}
                sub={bondLabel}
              />
              <SignalTile
                label="Confidence"
                value={`${data.confidence}%`}
                signal={data.confidence > 65 ? 'bull' : data.confidence > 45 ? 'neutral' : 'bear'}
                sub="SIGNAL AGREEMENT"
              />
            </div>
          </div>

          {/* Key price levels */}
          <div style={{ padding: '0 28px 16px' }}>
            <div
              style={{
                color: '#ffffff',
                fontSize: 18,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Key Watch Levels
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                {
                  label: 'SPY 200MA',
                  value: `$${(sig.spyMa200 ?? 0).toFixed(0)}`,
                  note: sig.spyPrice > (sig.spyMa200 ?? 0) ? 'ABOVE ✓' : 'BELOW ✗',
                  bull: sig.spyPrice > (sig.spyMa200 ?? 0),
                },
                {
                  label: 'SPY 50MA',
                  value: `$${(sig.spyMa50 ?? 0).toFixed(0)}`,
                  note: sig.spyPrice > (sig.spyMa50 ?? 0) ? 'ABOVE ✓' : 'BELOW ✗',
                  bull: sig.spyPrice > (sig.spyMa50 ?? 0),
                },
                {
                  label: 'VIX FEAR',
                  value: '30',
                  note:
                    sig.vix < 30
                      ? `BELOW (${sig.vix.toFixed(1)})`
                      : `ABOVE (${sig.vix.toFixed(1)})`,
                  bull: sig.vix < 30,
                },
                {
                  label: 'HY STRESS',
                  value: '5%',
                  note:
                    mac.hySpread < 5
                      ? `CLEAR (${mac.hySpread.toFixed(2)}%)`
                      : `BREACH (${mac.hySpread.toFixed(2)}%)`,
                  bull: mac.hySpread < 5,
                },
              ].map((lv) => (
                <div
                  key={lv.label}
                  style={{
                    flex: '1 1 110px',
                    background: '#060606',
                    border: `1px solid ${lv.bull ? '#00ff4118' : '#ff333318'}`,
                    borderRadius: 8,
                    padding: '9px 12px',
                  }}
                >
                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: 18,
                      letterSpacing: '0.1em',
                      marginBottom: 3,
                    }}
                  >
                    {lv.label}
                  </div>
                  <div style={{ color: '#fff', fontSize: 27, fontWeight: 800 }}>{lv.value}</div>
                  <div
                    style={{ color: lv.bull ? '#00ff41' : '#ff3333', fontSize: 18, marginTop: 2 }}
                  >
                    {lv.note}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phase thesis */}
          <div
            style={{
              margin: '0 28px 24px',
              padding: '14px 16px',
              background: `${phaseColor}08`,
              border: `1px solid ${phaseColor}20`,
              borderRadius: 8,
            }}
          >
            <div
              style={{
                color: phaseColor,
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: '0.1em',
                marginBottom: 6,
              }}
            >
              {macroCtx.title.toUpperCase()}
            </div>
            <div style={{ color: '#ffffff', fontSize: 20, lineHeight: 1.7, marginBottom: 8 }}>
              {macroCtx.thesis}
            </div>
            <div
              style={{ color: '#ffffff', fontSize: 18, letterSpacing: '0.06em', marginBottom: 4 }}
            >
              KEY WATCH:
            </div>
            <div style={{ color: '#ffffff', fontSize: 18, lineHeight: 1.6 }}>
              {macroCtx.keyWatch}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: MACRO ═══════════════════════════════════ */}
      {activeTab === 'macro' && (
        <div style={{ padding: '20px 28px 28px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <SignalTile
              label="Yield Curve T10Y-3M"
              value={`${mac.yieldCurve > 0 ? '+' : ''}${mac.yieldCurve.toFixed(2)}%`}
              signal={ycSignal}
              sub={`${ycLabel} · ${ycTrendIcon}`}
            />
            <SignalTile
              label="HY Credit Spread"
              value={`${mac.hySpread.toFixed(2)}%`}
              signal={hySignal}
              sub={`${hyLabel}${mac.hySpreadTrend > 0.3 ? ' · WIDENING' : mac.hySpreadTrend < -0.3 ? ' · TIGHTENING' : ''}`}
            />
            <SignalTile
              label="Fed Funds Rate"
              value={`${mac.fedFunds.toFixed(2)}%`}
              signal={fedSignal}
              sub={fedLabel}
            />
            <SignalTile
              label="Consumer Sentiment"
              value={mac.sentiment.toFixed(1)}
              signal={sentSignal}
              sub={`${sentLabel}${mac.sentimentTrend > 2 ? ' · IMPROVING' : mac.sentimentTrend < -2 ? ' · DECLINING' : ''}`}
            />
          </div>

          {/* Macro bars */}
          <div
            style={{
              background: '#060606',
              border: '1px solid #111',
              borderRadius: 8,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                color: '#ffffff',
                fontSize: 18,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Macro Health Dashboard
            </div>
            <MacroBar
              label="YIELD CURVE (T10Y-3M)"
              value={mac.yieldCurve}
              min={-2}
              max={3}
              signal={ycSignal}
              format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`}
            />
            <MacroBar
              label="HY CREDIT SPREAD"
              value={mac.hySpread}
              min={1.5}
              max={8}
              signal={hySignal}
              format={(v) => `${v.toFixed(2)}%`}
            />
            <MacroBar
              label="FED FUNDS RATE"
              value={mac.fedFunds}
              min={0}
              max={6}
              signal={fedSignal}
              format={(v) => `${v.toFixed(2)}%`}
            />
            <MacroBar
              label="VIX"
              value={sig.vix}
              min={10}
              max={45}
              signal={vixSignal}
              format={(v) => v.toFixed(1)}
            />
            <MacroBar
              label="CONSUMER SENTIMENT"
              value={mac.sentiment}
              min={40}
              max={100}
              signal={sentSignal}
              format={(v) => v.toFixed(1)}
            />
          </div>

          {/* Macro risks section */}
          <div
            style={{
              padding: '14px 16px',
              background: '#ff333306',
              border: '1px solid #ff333318',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                color: '#ff333380',
                fontSize: 18,
                letterSpacing: '0.12em',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Key Risks
            </div>
            <div style={{ color: '#ffffff', fontSize: 20, lineHeight: 1.7 }}>{macroCtx.risks}</div>
          </div>

          {/* Yield curve detail */}
          <div
            style={{
              background: '#060606',
              border: '1px solid #111',
              borderRadius: 8,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                color: '#ffffff',
                fontSize: 18,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Yield Curve Detail
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                {
                  label: 'Curve Level',
                  value: `${mac.yieldCurve > 0 ? '+' : ''}${mac.yieldCurve.toFixed(2)}%`,
                  color:
                    ycSignal === 'bull' ? '#00ff41' : ycSignal === 'bear' ? '#ff3333' : '#f59e0b',
                },
                {
                  label: 'Trend (90D)',
                  value: `${mac.yieldCurveTrend > 0 ? '+' : ''}${mac.yieldCurveTrend.toFixed(2)}%`,
                  color: mac.yieldCurveTrend > 0 ? '#00ff41' : '#ff3333',
                },
                {
                  label: 'Days Inverted',
                  value: `${mac.daysInverted}d`,
                  color:
                    mac.daysInverted > 60
                      ? '#ff3333'
                      : mac.daysInverted > 0
                        ? '#f59e0b'
                        : '#00ff41',
                },
                {
                  label: 'Fed Cutting',
                  value: mac.fedCutting ? 'YES' : 'NO',
                  color: mac.fedCutting ? '#00ff41' : '#f59e0b',
                },
              ].map((item) => (
                <div key={item.label} style={{ flex: '1 1 100px' }}>
                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: 18,
                      letterSpacing: '0.1em',
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ color: item.color, fontSize: 31, fontWeight: 800 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: TRADE PICKS ═══════════════════════════ */}
      {activeTab === 'picks' && (
        <div style={{ padding: '20px 28px 28px' }}>
          {/* Portfolio allocation */}
          <div
            style={{
              background: '#060606',
              border: '1px solid #111',
              borderRadius: 8,
              padding: '16px',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  color: '#ffffff',
                  fontSize: 18,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Suggested Portfolio Allocation
              </div>
              <div
                style={{
                  color: phaseColor,
                  fontSize: 18,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                }}
              >
                {data.phaseName.toUpperCase()}
              </div>
            </div>
            <AllocationBar allocation={allocation} phaseColor={phaseColor} />
          </div>

          {/* Phase thesis banner */}
          <div
            style={{
              padding: '12px 14px',
              background: `${phaseColor}08`,
              border: `1px solid ${phaseColor}22`,
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                color: phaseColor,
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '0.1em',
                marginBottom: 4,
              }}
            >
              CYCLE THESIS
            </div>
            <div style={{ color: '#ffffff', fontSize: 20, lineHeight: 1.7 }}>{macroCtx.thesis}</div>
          </div>

          {/* Trade pick cards */}
          <div
            style={{
              color: '#ffffff',
              fontSize: 18,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Phase-Based Trade Ideas
            <span style={{ color: '#ffffff', marginLeft: 8 }}>· Dots = Conviction (3 = HIGH)</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 8,
            }}
          >
            {tradePicks.map((pick) => (
              <TradePickCard
                key={`${pick.ticker}-${pick.direction}`}
                pick={pick}
                phaseColor={phaseColor}
              />
            ))}
          </div>

          {/* Disclaimer */}
          <div
            style={{
              marginTop: 16,
              color: '#666666',
              fontSize: 18,
              lineHeight: 1.5,
              borderTop: '1px solid #0a0a0a',
              paddingTop: 12,
            }}
          >
            ⚠ INFORMATIONAL ONLY — Not financial advice. Trade ideas reflect historical sector
            rotation models. Past cycle behavior does not guarantee future results. Always manage
            position size and risk.
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: SECTORS ════════════════════════════════ */}
      {activeTab === 'sectors' && (
        <div style={{ padding: '20px 28px 28px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                color: '#ffffff',
                fontSize: 18,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              3M Relative Return vs SPY
            </div>
            <div style={{ color: '#ffffff', fontSize: 18, letterSpacing: '0.08em' }}>
              Phase Leaders:{' '}
              <span style={{ color: phaseColor }}>{data.phaseSectors.join(' · ')}</span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 6,
              marginBottom: 20,
            }}
          >
            {data.sectorRanking.map((s, rank) => {
              const isLeader = rank < 3
              const isExpected = data.phaseSectors.includes(s.ticker)
              const barPct = Math.max(0, Math.min(100, ((s.relReturn3M + 10) / 20) * 100))
              const color = s.relReturn3M > 0 ? '#00ff41' : '#ff3333'
              const sectorName = SECTOR_LABELS[s.ticker] ?? s.ticker
              return (
                <div
                  key={s.ticker}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 12px',
                    background: isLeader ? '#0a0a0a' : '#050505',
                    border: isExpected ? `1px solid ${phaseColor}35` : '1px solid #111',
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: 18,
                      width: 20,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {rank + 1}
                  </div>
                  <div style={{ flexShrink: 0, width: 40 }}>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: isExpected ? phaseColor : '#fff',
                      }}
                    >
                      {s.ticker}
                    </div>
                    <div style={{ fontSize: 16, color: '#ffffff', marginTop: 1 }}>{sectorName}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 4,
                        background: '#111',
                        borderRadius: 2,
                        overflow: 'hidden',
                        marginBottom: 2,
                      }}
                    >
                      <div
                        style={{
                          width: `${barPct}%`,
                          height: '100%',
                          background: color,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <div style={{ color: '#ffffff', fontSize: 16 }}>
                      1M: {s.relReturn1M > 0 ? '+' : ''}
                      {s.relReturn1M}%
                    </div>
                  </div>
                  <div
                    style={{
                      color,
                      fontSize: 22,
                      fontWeight: 700,
                      width: 60,
                      textAlign: 'right',
                      flexShrink: 0,
                    }}
                  >
                    {s.relReturn3M > 0 ? '+' : ''}
                    {s.relReturn3M}%
                  </div>
                  {isExpected && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: phaseColor,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Cycle affinity guide */}
          <div
            style={{
              background: '#060606',
              border: '1px solid #111',
              borderRadius: 8,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                color: '#ffffff',
                fontSize: 18,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Business Cycle Sector Rotation Map
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[
                { phase: 'BOTTOM', sectors: 'XLU · GLD · TLT', color: '#ef4444' },
                { phase: 'RECOVERY', sectors: 'XLF · XLY · IWM', color: '#f97316' },
                { phase: 'BULL', sectors: 'XLI · XLK · XLC', color: '#84cc16' },
                { phase: 'PEAK', sectors: 'XLE · XLB · GLD', color: '#00ff41' },
                { phase: 'EARLY BEAR', sectors: 'XLV · XLP', color: '#facc15' },
                { phase: 'BEAR', sectors: 'TLT · GLD · Cash', color: '#f97316' },
                { phase: 'LATE BEAR', sectors: 'XLU · XLP · TLT', color: '#ef4444' },
                { phase: 'CURRENT', sectors: data.phaseSectors.join(' · '), color: phaseColor },
              ].map((item) => (
                <div
                  key={item.phase}
                  style={{
                    padding: '8px 10px',
                    background: item.phase === 'CURRENT' ? `${item.color}12` : '#000',
                    border: `1px solid ${item.color}22`,
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      color: item.color,
                      fontSize: 16,
                      fontWeight: 800,
                      letterSpacing: '0.1em',
                      marginBottom: 3,
                    }}
                  >
                    {item.phase}
                  </div>
                  <div style={{ color: '#ffffff', fontSize: 18 }}>{item.sectors}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          padding: '8px 28px',
          borderTop: '1px solid #0a0a0a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ color: '#888888', fontSize: 16, letterSpacing: '0.08em' }}>
          PHASE {data.phaseIdx}/7 · {((data.phase / 7) * 100).toFixed(0)}% THROUGH CYCLE ·{' '}
          {new Date(data.timestamp).toLocaleTimeString()}
        </div>
        <div style={{ color: '#888888', fontSize: 16, letterSpacing: '0.08em' }}>
          POLYGON.IO + FRED
        </div>
      </div>
    </div>
  )
}
