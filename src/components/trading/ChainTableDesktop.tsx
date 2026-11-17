'use client'

import React from 'react'
import { TbStar, TbStarFilled, TbCurrencyDollar } from 'react-icons/tb'

export interface ChainContract {
  ticker: string
  strike_price: number
  bid?: number
  ask?: number
  volume?: number
  open_interest?: number
  implied_volatility?: number
  delta?: number
  theta?: number
  change_percent?: number
}

type Side = 'call' | 'put'
type ProbType = '80call' | '80put' | '90call' | '90put' | null

interface Props {
  strikes: number[]
  calls: ChainContract[]
  puts: ChainContract[]
  stockPrice: number
  visibleColumns: Record<string, boolean>
  isITM: (strike: number, type: Side) => boolean
  isATM: (strike: number) => boolean
  getProbabilityType: (strike: number) => { type: ProbType }
  isInWatchlist: (ticker: string) => boolean
  toggleWatchlist: (c: ChainContract) => void
  onContractSelect?: (c: any, stockPrice: number) => void
  onPriceChart: (c: ChainContract) => void
  maxOI: number
  maxVolume: number
  chanceOf: (strike: number, side: Side, iv?: number) => number | null
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const CALL_ORDER = ['watchlist', 'openInterest', 'volume', 'delta', 'theta', 'iv', 'change', 'breakeven', 'chance', 'bid', 'ask']
const PUT_ORDER = [...CALL_ORDER].reverse()
const fmt = (n: number) => n.toLocaleString()

function ChainRow({ strike, call, put, p, prevSpot }: { strike: number; call?: ChainContract; put?: ChainContract; p: Props; prevSpot: boolean }) {
  const { visibleColumns: vc, stockPrice } = p
  const cols = Object.values(vc).filter(Boolean).length
  const callITM = p.isITM(strike, 'call')
  const putITM = p.isITM(strike, 'put')
  const atm = p.isATM(strike)
  const prob = p.getProbabilityType(strike).type

  const heat = (v: number | undefined, max: number, rgb: string, side: Side): React.CSSProperties => {
    const pct = v ? Math.min(100, Math.max(5, (v / max) * 100)) : 0
    return pct
      ? {
          backgroundImage: `linear-gradient(to ${side === 'call' ? 'left' : 'right'}, rgba(${rgb},0.34), rgba(${rgb},0.06) ${pct}%, transparent ${pct}%)`,
        }
      : {}
  }

  const cell = (key: string, c: ChainContract | undefined, side: Side) => {
    if (!vc[key]) return null
    const al = side === 'call' ? 'right' : 'left'
    const base: React.CSSProperties = {
      textAlign: al, fontFamily: MONO, fontSize: 19, fontWeight: 600, color: '#e5e7eb',
      padding: '8px 0', borderRadius: 4, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
    }
    const dash = <span style={{ color: '#3f3f46' }}>—</span>
    const accent = side === 'call' ? '#22c55e' : '#ef4444'
    switch (key) {
      case 'watchlist':
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {c && (p.onContractSelect ? (
              <button onDoubleClick={() => p.onContractSelect!(c, stockPrice)} title="Double-click to autofill New Position Entry" style={{ color: '#22c55e' }}>
                <TbCurrencyDollar className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={() => p.toggleWatchlist(c)} title="Watchlist" className="transition-transform hover:scale-125">
                {p.isInWatchlist(c.ticker) ? <TbStarFilled className="w-4 h-4 text-orange-400" /> : <TbStar className="w-4 h-4 text-gray-500 hover:text-orange-300" />}
              </button>
            ))}
          </div>
        )
      case 'openInterest':
        return <div key={key} style={{ ...base, ...heat(c?.open_interest, p.maxOI, side === 'call' ? '34,197,94' : '239,68,68', side) }}>{c?.open_interest ? fmt(c.open_interest) : dash}</div>
      case 'volume':
        return <div key={key} style={{ ...base, ...heat(c?.volume, p.maxVolume, '56,189,248', side) }}>{c?.volume ? fmt(c.volume) : dash}</div>
      case 'delta':
        return <div key={key} style={{ ...base, color: '#67e8f9' }}>{c?.delta ? c.delta.toFixed(3) : dash}</div>
      case 'theta':
        return <div key={key} style={{ ...base, color: '#fb923c' }}>{c?.theta ? c.theta.toFixed(3) : dash}</div>
      case 'iv':
        return <div key={key} style={{ ...base, color: '#c084fc', fontWeight: 700 }}>{c?.implied_volatility ? (c.implied_volatility * 100).toFixed(0) + '%' : dash}</div>
      case 'change': {
        const v = c?.change_percent
        const has = v !== undefined && v !== 0
        return (
          <div key={key} style={{ ...base, color: has ? (v! >= 0 ? '#22c55e' : '#ef4444') : undefined }}>
            {has ? `${v! >= 0 ? '+' : ''}${v!.toFixed(1)}%` : dash}
          </div>
        )
      }
      case 'breakeven': {
        if (!c?.ask || stockPrice <= 0) return <div key={key} style={base}>{dash}</div>
        const be = side === 'call' ? ((strike + c.ask - stockPrice) / stockPrice) * 100 : ((stockPrice - (strike - c.ask)) / stockPrice) * 100
        return <div key={key} style={{ ...base, color: be > 0 ? '#f87171' : '#4ade80' }}>{be.toFixed(1)}%</div>
      }
      case 'chance': {
        const pc = c ? p.chanceOf(strike, side, c.implied_volatility) : null
        if (pc === null) return <div key={key} style={base}>{dash}</div>
        const marked = prob === `80${side}` || prob === `90${side}`
        const col = pc >= 90 ? '#a3e635' : pc >= 80 ? '#4ade80' : pc >= 50 ? '#facc15' : '#fb923c'
        return (
          <div
            key={key}
            style={{
              ...base, color: col, fontWeight: 800,
              background: marked ? 'rgba(250,204,21,0.14)' : undefined,
              boxShadow: marked ? `inset 0 0 0 1px ${col}` : undefined,
            }}
          >
            {pc.toFixed(0)}%
          </div>
        )
      }
      case 'bid':
      case 'ask': {
        const v = key === 'bid' ? c?.bid : c?.ask
        return (
          <div
            key={key}
            onDoubleClick={() => c && p.onPriceChart(c)}
            title="Double-click to view premium chart"
            className="cursor-pointer hover:bg-white/10"
            style={{ ...base, color: accent, fontWeight: 800, background: 'rgba(255,255,255,0.03)' }}
          >
            {v ? v.toFixed(2) : dash}
          </div>
        )
      }
    }
    return null
  }

  const sideStyle = (itm: boolean, side: Side): React.CSSProperties => {
    const rgb = side === 'call' ? '34,197,94' : '239,68,68'
    const probHit = prob === `80${side}` || prob === `90${side}`
    return {
      display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: 8, padding: '2px 12px', alignItems: 'center',
      background: itm ? `linear-gradient(${side === 'call' ? '90deg' : '270deg'}, rgba(${rgb},0.12), rgba(${rgb},0.03))` : 'transparent',
      [side === 'call' ? 'borderLeft' : 'borderRight']: `3px solid ${probHit ? (prob!.startsWith('80') ? '#facc15' : '#a3e635') : itm ? `rgba(${rgb},0.9)` : 'transparent'}`,
    }
  }

  return (
    <>
      {prevSpot && (
        <div style={{ position: 'relative', height: 26, display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: 'linear-gradient(90deg, transparent, #f59e0b 15%, #f59e0b 85%, transparent)', boxShadow: '0 0 10px rgba(245,158,11,0.7)' }} />
          <div style={{ position: 'relative', margin: '0 auto', padding: '2px 16px', borderRadius: 999, background: '#f59e0b', color: '#000', fontWeight: 900, fontSize: 13, fontFamily: MONO, letterSpacing: '0.05em' }}>
            ${stockPrice.toFixed(2)}
          </div>
        </div>
      )}
      <div className="grid hover:brightness-125 transition-[filter]" style={{ gridTemplateColumns: '1fr 130px 1fr', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={sideStyle(callITM, 'call')}>{CALL_ORDER.map((k) => cell(k, call, 'call'))}</div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 21, fontWeight: 900,
            color: atm ? '#fbbf24' : '#fff', background: atm ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.035)',
            borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)',
            boxShadow: atm ? 'inset 0 0 0 1px rgba(245,158,11,0.6)' : undefined,
          }}
        >
          {strike.toFixed(2)}
        </div>
        <div style={sideStyle(putITM, 'put')}>{PUT_ORDER.map((k) => cell(k, put, 'put'))}</div>
      </div>
    </>
  )
}

export default function ChainTableDesktop(p: Props) {
  const callMap = new Map(p.calls.map((c) => [c.strike_price, c]))
  const putMap = new Map(p.puts.map((c) => [c.strike_price, c]))
  return (
    <div>
      {p.strikes.map((s, i) => (
        <ChainRow
          key={s}
          strike={s}
          call={callMap.get(s)}
          put={putMap.get(s)}
          p={p}
          prevSpot={i > 0 && p.stockPrice > 0 && p.strikes[i - 1] < p.stockPrice && s >= p.stockPrice}
        />
      ))}
    </div>
  )
}
