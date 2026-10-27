// Royal Exchange chess engine: traders (T) vs dealers / market makers (D).
// Legal chess moves (no castling / en passant). Move choice is driven by real market signals.

export type Side = 'T' | 'D'
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'

export interface Signal {
  ticker: string
  controller: Side
  price: number
  chg: number // today % change
  mom: number // -1..1 blended momentum (trader tool)
  mom5: number // 5d return %
  rsPct: number // 0..1 percentile of RS line vs SPY
  rsCrit: number // 0..1 how close the RS line is to a critical extreme
  rs20: number // 20d return minus SPY 20d return, %
  relVol: number
  traderPrem: number // A / AA premium
  dealerPrem: number // B / BB premium
  traderDir: number // -1..1 call vs put share of A/AA flow
  dealerDir: number // -1..1 call vs put share of B/BB flow
  recentTrader: number // A/AA premium in the latest 20 minutes of the flow DB
  recentDealer: number // B/BB premium in the latest 20 minutes of the flow DB
  gex: number // -1 (strong short gamma) .. +1 (strong long gamma), 0 if no data
  gexExtreme: number // 0..1 how far from the neutral middle
  netGex: number // $B, 45 day
  wallStrike?: number
  wallType?: 'call' | 'put'
  hasGex: boolean
  isEtf: boolean
  style: 'growth' | 'defensive' | 'neutral' // from beta vs SPY
  beta: number
  marketCap: number
  rets: number[] // daily % returns over the last 40 sessions
  flow: number // direction that drives trader pieces
}

export interface Piece {
  id: string
  side: Side
  type: PieceType
  ticker: string
  x: number
  y: number
  alive: boolean
  moved: boolean
  lastFrom?: string
  capturedAt?: number
}

export interface Move {
  pieceId: string
  fx: number
  fy: number
  tx: number
  ty: number
  captureId?: string
  promote?: boolean
}

export const VALUE: Record<PieceType, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 }

export const PIECE_NAMES: Record<Side, Record<PieceType, string>> = {
  T: { K: 'Index Fund', Q: 'Whale', R: 'Block Desk', B: 'Candle', N: 'Bull', P: 'Retail Coin' },
  D: { K: 'Market Maker', Q: 'Gamma Titan', R: 'Wall', B: 'Hedger', N: 'Bear', P: 'Delta Hedge' },
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const sq = (x: number, y: number) => `${'abcdefgh'[x]}${y + 1}`

// deployment order: the strongest early tickers take the major pieces, then pawns
const SLOTS: { type: PieceType; x: number; back: boolean }[] = [
  { type: 'K', x: 4, back: true },
  { type: 'Q', x: 3, back: true },
  { type: 'R', x: 0, back: true },
  { type: 'R', x: 7, back: true },
  { type: 'B', x: 2, back: true },
  { type: 'B', x: 5, back: true },
  { type: 'N', x: 1, back: true },
  { type: 'N', x: 6, back: true },
  ...[3, 4, 2, 5, 1, 6, 0, 7].map((x) => ({ type: 'P' as PieceType, x, back: false })),
]

export const SIDE_CAPACITY = SLOTS.length

export function placePiece(side: Side, index: number, ticker: string): Piece {
  const s = SLOTS[index]
  const y = s.back ? (side === 'T' ? 0 : 7) : side === 'T' ? 1 : 6
  return { id: `${side}-${s.type}${index}`, side, type: s.type, ticker, x: s.x, y, alive: true, moved: false }
}

const cloneAll = (ps: Piece[]) => ps.map((p) => ({ ...p }))

function grid(ps: Piece[]) {
  const g: (Piece | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null))
  for (const p of ps) if (p.alive) g[p.y][p.x] = p
  return g
}

const inB = (x: number, y: number) => x >= 0 && x < 8 && y >= 0 && y < 8

function pseudoMoves(ps: Piece[], side: Side): Move[] {
  const g = grid(ps)
  const out: Move[] = []
  const dir = side === 'T' ? 1 : -1
  for (const p of ps) {
    if (!p.alive || p.side !== side) continue
    const add = (tx: number, ty: number, cap?: Piece | null) => {
      const promote = p.type === 'P' && (ty === 7 || ty === 0)
      out.push({ pieceId: p.id, fx: p.x, fy: p.y, tx, ty, captureId: cap?.id, promote })
    }
    const slide = (dirs: number[][]) => {
      for (const [dx, dy] of dirs) {
        let x = p.x + dx
        let y = p.y + dy
        while (inB(x, y)) {
          const o = g[y][x]
          if (o) {
            if (o.side !== side) add(x, y, o)
            break
          }
          add(x, y)
          x += dx
          y += dy
        }
      }
    }
    const step = (dirs: number[][]) => {
      for (const [dx, dy] of dirs) {
        const x = p.x + dx
        const y = p.y + dy
        if (!inB(x, y)) continue
        const o = g[y][x]
        if (!o) add(x, y)
        else if (o.side !== side) add(x, y, o)
      }
    }
    if (p.type === 'P') {
      if (inB(p.x, p.y + dir) && !g[p.y + dir][p.x]) {
        add(p.x, p.y + dir)
        const start = side === 'T' ? 1 : 6
        if (p.y === start && !g[p.y + 2 * dir][p.x]) add(p.x, p.y + 2 * dir)
      }
      for (const dx of [-1, 1]) {
        const x = p.x + dx
        const y = p.y + dir
        if (inB(x, y) && g[y][x] && g[y][x]!.side !== side) add(x, y, g[y][x])
      }
    } else if (p.type === 'N') {
      step([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]])
    } else if (p.type === 'B') slide([[1, 1], [1, -1], [-1, 1], [-1, -1]])
    else if (p.type === 'R') slide([[1, 0], [-1, 0], [0, 1], [0, -1]])
    else if (p.type === 'Q') slide([[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]])
    else step([[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]])
  }
  return out
}

export function applyMove(ps: Piece[], m: Move): Piece[] {
  const next = cloneAll(ps)
  const p = next.find((q) => q.id === m.pieceId)!
  if (m.captureId) {
    const dead = next.find((q) => q.id === m.captureId)!
    dead.capturedAt = next.filter((q) => !q.alive).length
    dead.alive = false
  }
  p.lastFrom = sq(p.x, p.y)
  p.x = m.tx
  p.y = m.ty
  p.moved = true
  if (m.promote) p.type = 'Q'
  return next
}

export function inCheck(ps: Piece[], side: Side): boolean {
  const king = ps.find((p) => p.alive && p.side === side && p.type === 'K')
  if (!king) return false
  const opp: Side = side === 'T' ? 'D' : 'T'
  return pseudoMoves(ps, opp).some((m) => m.captureId === king.id)
}

export function legalMoves(ps: Piece[], side: Side): Move[] {
  return pseudoMoves(ps, side).filter((m) => !inCheck(applyMove(ps, m), side))
}

export type Outcome = 'ongoing' | 'T-wins' | 'D-wins' | 'draw'

export function outcome(ps: Piece[], toMove: Side): Outcome {
  if (legalMoves(ps, toMove).length > 0) return 'ongoing'
  if (inCheck(ps, toMove)) return toMove === 'T' ? 'D-wins' : 'T-wins'
  return 'draw'
}

// how much is happening right now for a side: fresh flow, momentum, gamma and RS extremes on its best pieces
export function actionScore(ps: Piece[], side: Side, signals: Record<string, Signal>): number {
  const scores = ps
    .filter((p) => p.alive && p.side === side)
    .map((p) => {
      const s = signals[p.ticker]
      if (!s) return 0
      return side === 'T'
        ? (Math.log10(1 + s.recentTrader) / 8) * 0.6 + Math.abs(s.mom) * 0.4
        : (Math.log10(1 + s.recentDealer) / 8) * 0.5 + s.gexExtreme * 0.3 + s.rsCrit * 0.2
    })
    .sort((a, b) => b - a)
  const top = scores.slice(0, 3)
  return top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0
}

// the side with the most action moves next; the side in check must answer; nobody moves more than twice in a row
export function pickSide(ps: Piece[], signals: Record<string, Signal>, lastSide: Side, streak: number, rng: () => number): Side {
  const other: Side = lastSide === 'T' ? 'D' : 'T'
  if (inCheck(ps, other)) return other
  if (legalMoves(ps, other).length === 0) return lastSide
  if (streak >= 2) return other
  const mine = actionScore(ps, lastSide, signals)
  const theirs = actionScore(ps, other, signals)
  return theirs + rng() * 0.05 >= mine ? other : lastSide
}

export interface Decision {
  move: Move
  piece: Piece
  target?: Piece
  check: boolean
  mate: boolean
  why?: string
}

function corr(a: number[], b: number[]) {
  const n = Math.min(a?.length ?? 0, b?.length ?? 0)
  if (n < 10) return 0
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let c = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < n; i++) {
    c += (a[i] - ma) * (b[i] - mb)
    va += (a[i] - ma) ** 2
    vb += (b[i] - mb) ** 2
  }
  return va > 0 && vb > 0 ? c / Math.sqrt(va * vb) : 0
}

const LARGE_CAP = 1e11

// Who gets knocked out is a market question: are the two tickers connected, and is one beating the other?
export function rivalry(a: Signal, b: Signal): { score: number; why: string } {
  const link = Math.abs(corr(a.rets, b.rets))
  const rotation = a.isEtf && b.isEtf && a.style !== 'neutral' && b.style !== 'neutral' && a.style !== b.style
  const largePair = !a.isEtf && !b.isEtf && a.marketCap >= LARGE_CAP && b.marketCap >= LARGE_CAP
  const conn = rotation ? Math.max(0.7, link) : largePair ? Math.max(0.55, link) : link
  const gap = a.chg - b.chg + 0.3 * (a.mom5 - b.mom5)
  const lead = Math.tanh(gap / 2)
  const score = conn < 0.3 ? -6 : conn * lead * 8
  let why: string
  if (rotation) why = `${a.style} funds ${gap >= 0 ? 'beating' : 'lagging'} ${b.style} funds`
  else if (largePair) why = `large caps going opposite ways, ${a.ticker} ${gap >= 0 ? 'leading' : 'lagging'}`
  else if (conn >= 0.3) why = `closely linked, ${a.ticker} ${gap >= 0 ? 'outperforming' : 'underperforming'}`
  else why = 'no real connection'
  return { score, why }
}


export function chooseMove(
  ps: Piece[],
  side: Side,
  signals: Record<string, Signal>,
  rng: () => number
): Decision | null {
  const moves = legalMoves(ps, side)
  if (!moves.length) return null
  const opp: Side = side === 'T' ? 'D' : 'T'
  const dir = side === 'T' ? 1 : -1
  const scored = moves.map((m) => {
    const p = ps.find((q) => q.id === m.pieceId)!
    const target = m.captureId ? ps.find((q) => q.id === m.captureId) : undefined
    const sig = signals[p.ticker]
    const after = applyMove(ps, m)
    const dy = (m.ty - m.fy) * dir
    let s = rng() * 0.9
    let why: string | undefined

    if (sig) {
      if (side === 'T') {
        // momentum + A/AA flow: bullish drives forward, bearish retreats
        s += sig.flow * dy * 1.3 + Math.abs(sig.flow) * 0.25
      } else {
        // short gamma: dealers chase; long gamma: they hold the wall; RS at a critical level adds pressure
        if (sig.gex < 0) s += -sig.gex * dy * 1.1
        else s += sig.gex * (dy <= 0 ? 0.5 : -0.2)
        s += sig.rsCrit * dy * 0.7
      }
    }
    if (target) {
      // who gets knocked out comes from the market: connection between the two tickers and who is beating whom
      const tSig = signals[target.ticker]
      if (sig && tSig) {
        const r = rivalry(sig, tSig)
        s += r.score
        why = r.why
      } else s -= 6
    }
    if (m.promote) s += 2
    if (p.type === 'K' && !target) s -= 0.8
    if (p.lastFrom === sq(m.tx, m.ty)) s -= 1.2

    const check = inCheck(after, opp)
    let mate = false
    if (check) {
      s += 0.8
      if (legalMoves(after, opp).length === 0) {
        mate = true
        s += 1000
      }
    }
    return { m, p, target, check, mate, s, why }
  })
  scored.sort((a, b) => b.s - a.s)
  const top = scored.slice(0, 3)
  const w = top.map((t, i) => Math.exp((t.s - top[0].s) * 1.2) * (i === 0 ? 1.5 : 1))
  let r = rng() * w.reduce((a, b) => a + b, 0)
  let pick = top[0]
  for (let i = 0; i < top.length; i++) {
    r -= w[i]
    if (r <= 0) {
      pick = top[i]
      break
    }
  }
  return { move: pick.m, piece: pick.p, target: pick.target, check: pick.check, mate: pick.mate, why: pick.why }
}

export const fmt$ = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`
  return `$${a.toFixed(0)}`
}

export type LogKind = 'flow' | 'gamma' | 'capture' | 'check' | 'mate' | 'info'

export function narrate(d: Decision, signals: Record<string, Signal>): { text: string; kind: LogKind } {
  const p = d.piece
  const sig = signals[p.ticker]
  const to = sq(d.move.tx, d.move.ty)
  const nm = PIECE_NAMES[p.side][p.type]
  if (d.mate) {
    return {
      text: p.side === 'T' ? `SQUEEZE: ${p.ticker} traps the Market Maker on ${to}` : `MARGIN CALL: ${p.ticker} corners the Index Fund on ${to}`,
      kind: 'mate',
    }
  }
  if (d.target) {
    const t = d.target
    return { text: `${p.ticker} knocks out ${t.ticker} on ${to} — ${d.why ?? 'no real connection'}`, kind: 'capture' }
  }
  if (d.check) {
    return { text: `${p.ticker} ${nm} → ${to} puts the ${p.side === 'T' ? 'Market Maker' : 'Index Fund'} in check`, kind: 'check' }
  }
  if (p.side === 'T') {
    const verb = (sig?.flow ?? 0) >= 0 ? 'advances' : 'retreats'
    return { text: `${p.ticker} ${nm} ${verb} to ${to}`, kind: 'flow' }
  }
  const verb = sig && sig.gex < 0 ? 'chases' : 'holds'
  return { text: `${p.ticker} ${nm} ${verb} ${to}`, kind: 'gamma' }
}
