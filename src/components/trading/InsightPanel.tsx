'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import dynamic from 'next/dynamic'

import SeasonalityChart from '@/components/analytics/SeasonalityChart'
import { calculateFlowGrade } from '@/lib/flowGrading'

const EFIPopupChart = dynamic(
  () => import('./EFICharting').then((m) => ({ default: m.TradePopupChart })),
  { ssr: false }
)
// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type BriefBlockType =
  | 'intro'
  | 'body'
  | 'conclusion'
  | 'chart'
  | 'seasonality'
  | 'flow'
  | 'metrics'
  | 'header'
  | 'quote'
  | 'image'
  | 'divider'
type BriefTheme = 'goldman' | 'bloomberg' | 'terminal'
interface MetricItem {
  label: string
  value: string
  delta?: string
}
interface BriefBlock {
  id: string
  type: BriefBlockType
  title?: string
  subtitle?: string
  logoText?: string
  date?: string
  content?: string
  url?: string
  caption?: string
  size?: 'sm' | 'md' | 'lg'
  items?: MetricItem[]
}
interface Brief {
  blocks: BriefBlock[]
  theme: BriefTheme
  updatedAt: string
}
interface InsightData {
  brief: Brief
  reportTitle?: string
}
interface SavedReport {
  id: string
  title: string
  savedAt: string
  snapshot: InsightData
}

// â”€â”€ Quick Brief types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface MktDataItem { label: string; value: string; change: string; up: boolean }
interface BulletItem { category: string; text: string }
interface KeyLevelItem { price: string; tag: string; note: string }
interface FocusItem { id: string; ticker: string; direction: 'bull' | 'bear' | 'straddle' | 'neutral' | 'hot'; bullets: string[]; trade: string }
interface TradeRow { id: string; ticker: string; type: 'call' | 'put' | 'straddle' | 'spread' | 'stock'; contract: string; entry: string; t1: string; t2: string; stop: string; notes: string }
interface QuickBrief {
  mode: 'daily' | 'weekly' | 'monthly'
  headline: string
  summary: string
  layout: 'single' | 'double'
  marketData: MktDataItem[]
  focusItems: FocusItem[]
  bullets: BulletItem[]
  trades: TradeRow[]
  keyLevels: KeyLevelItem[]
  updatedAt: string
}

// â”€â”€ Storage & helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STORAGE_KEY = 'efi_insight_v1'
const HISTORY_KEY = 'efi_insight_history_v1'
const QUICK_KEY = 'efi_quick_v1'

const emptyData: InsightData = {
  brief: { blocks: [], theme: 'goldman', updatedAt: '' },
}
const emptyQuick: QuickBrief = {
  mode: 'daily',
  headline: '',
  summary: '',
  layout: 'single',
  marketData: [
    { label: 'SPX', value: '', change: '', up: true },
    { label: 'NDX', value: '', change: '', up: true },
    { label: 'VIX', value: '', change: '', up: false },
    { label: 'DXY', value: '', change: '', up: false },
    { label: 'OIL', value: '', change: '', up: true },
    { label: 'BTC', value: '', change: '', up: true },
  ],
  focusItems: [],
  bullets: [
    { category: 'THEME', text: '' },
    { category: 'RISK', text: '' },
    { category: 'CATALYST', text: '' },
    { category: 'SETUP', text: '' },
  ],
  trades: [],
  keyLevels: [
    { price: '', tag: 'RESISTANCE', note: '' },
    { price: '', tag: 'CURRENT', note: '' },
    { price: '', tag: 'SUPPORT', note: '' },
  ],
  updatedAt: '',
}
const BULLET_CATS = ['THEME', 'RISK', 'CATALYST', 'SETUP', 'WATCH', 'NOTE']
const LEVEL_TAGS = ['RESISTANCE', 'SUPPORT', 'CURRENT', 'PIVOT', 'TARGET', 'STOP', 'KEY']
const BRIEF_MODES = [{ id: 'daily', label: 'DAILY PULSE' }, { id: 'weekly', label: 'WEEKLY BRIEF' }, { id: 'monthly', label: 'MONTHLY OUTLOOK' }]
const BULLET_COLORS: Record<string, string> = {
  THEME: '#FF6600', RISK: '#FF3B3B', CATALYST: '#22D3EE',
  SETUP: '#A855F7', WATCH: '#FFD700', NOTE: 'rgba(255,255,255,0.35)',
}
const LEVEL_TAG_COLORS: Record<string, string> = {
  RESISTANCE: '#FF3B3B', SUPPORT: '#00D68F', CURRENT: '#FFD700',
  PIVOT: '#A855F7', TARGET: '#22D3EE', STOP: '#FF3B3B', KEY: '#FF6600',
}
// â”€â”€ Quick-pulse direction helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const QD_COLOR: Record<string, string> = { bull: '#00D68F', bear: '#FF3B3B', straddle: '#A855F7', neutral: '#9AAAB8', hot: '#FF6600' }
const QD_LABEL: Record<string, string> = { bull: 'BULLISH', bear: 'BEARISH', straddle: 'STRADDLE', neutral: 'NEUTRAL', hot: 'TOP FOCUS' }
const QD_TRADE_CLR: Record<string, string> = { call: '#00D68F', put: '#FF3B3B', straddle: '#A855F7', spread: '#FFD700', stock: '#22D3EE' }
function renderDirIcon(d: string, size = 18): React.ReactElement {
  const c = QD_COLOR[d] || '#9AAAB8'
  if (d === 'bull') return <svg width={size} height={size} viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8.5" fill={`${c}22`} stroke={c} strokeWidth="1" /><path d="M9 13V5M6 8l3-3 3 3" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  if (d === 'bear') return <svg width={size} height={size} viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8.5" fill={`${c}22`} stroke={c} strokeWidth="1" /><path d="M9 5v8M12 10l-3 3-3-3" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  if (d === 'straddle') return <svg width={size} height={size} viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8.5" fill={`${c}22`} stroke={c} strokeWidth="1" /><path d="M3 9h12M6 6l-3 3 3 3M12 6l3 3-3 3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  if (d === 'hot') return <svg width={size} height={size} viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8.5" fill={`${c}22`} stroke={c} strokeWidth="1" /><path d="M10 3.5L7 9h4l-3 5.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  return <svg width={size} height={size} viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="8.5" fill={`${c}22`} stroke={c} strokeWidth="1" /><path d="M5.5 9h7" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
}

const uid = () => Math.random().toString(36).slice(2, 10)
const nowTs = () => new Date().toISOString()

const fmtTs = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : ''

// â”€â”€ Design tokens â€” multi-layer premium palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GS = {
  gold: '#D4A843', // warm amber-gold
  goldFaint: '#080808', // pure void black
  goldBorder: 'rgba(212,168,67,0.22)', // translucent depth border
  white: '#FFFFFF',
  offWhite: '#E8EDF2',
  bg: '#000000', // pure black
  card: 'linear-gradient(180deg, #161616 0%, #0a0a0a 100%)',
  input: '#0d0d0d',
  red: '#FF2D55',
  green: '#34D399',
  amber: '#FF9500',
  blue: '#3B82F6',
  live: '#FF2D55',
}

// â”€â”€ Shared inline styles â€” glossy premium â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const iBase: React.CSSProperties = {
  background: '#020202',
  border: '1px solid rgba(212,168,67,0.25)',
  color: '#F1F5F9',
  fontFamily: 'monospace',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '4px',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -1px 0 rgba(0,0,0,0.4)',
}
const iLg: React.CSSProperties = { ...iBase, padding: '12px 16px', fontSize: '17px' }
const iSm: React.CSSProperties = { ...iBase, padding: '10px 14px', fontSize: '18px' }
const goldBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg, #E8B84B 0%, #C49A2E 100%)',
  color: '#000000',
  border: '1px solid rgba(255,200,80,0.35)',
  padding: '11px 28px',
  fontSize: '17px',
  fontWeight: '900',
  letterSpacing: '2px',
  fontFamily: 'monospace',
  cursor: 'pointer',
  borderRadius: '4px',
  boxShadow: '0 4px 16px rgba(212,168,67,0.3), inset 0 1px 0 rgba(255,255,255,0.65)',
}
const rmBtn: React.CSSProperties = {
  background: 'rgba(255,45,85,0.07)',
  border: '1px solid rgba(255,45,85,0.45)',
  color: '#FF2D55',
  padding: '6px 14px',
  fontSize: '18px',
  fontWeight: '700',
  cursor: 'pointer',
  borderRadius: '4px',
  letterSpacing: '1px',
  fontFamily: 'monospace',
}
const ghostBtn = (color: string): React.CSSProperties => ({
  background: `${color}0E`,
  border: `1px solid ${color}55`,
  color,
  padding: '6px 14px',
  fontSize: '18px',
  fontWeight: '700',
  cursor: 'pointer',
  borderRadius: '4px',
  letterSpacing: '1px',
  fontFamily: 'monospace',
  boxShadow: `0 0 10px ${color}18`,
})

// â”€â”€ Draggable chart wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ChartDraggableWrapper({
  children,
  editMode,
}: {
  children: React.ReactNode
  editMode: boolean
}) {
  const [offsetX, setOffsetX] = React.useState(0)
  const drag = React.useRef({ active: false, startX: 0, startOffset: 0 })
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current.active) return
      setOffsetX(drag.current.startOffset + (e.clientX - drag.current.startX))
    }
    const onUp = () => {
      drag.current.active = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
  return (
    <div style={{ position: 'relative', left: offsetX, marginBottom: '28px', userSelect: 'none' }}>
      {editMode && (
        <div
          onMouseDown={(e) => {
            drag.current = { active: true, startX: e.clientX, startOffset: offsetX }
          }}
          style={{
            height: '18px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '4px 4px 0 0',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '2px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '3px',
              borderRadius: '2px',
              background: '#FFFFFF',
            }}
          />
        </div>
      )}
      {children}
    </div>
  )
}

// â”€â”€ Accent theming context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AccentCtx = React.createContext('#D4A843')
const useAccent = () => React.useContext(AccentCtx)

// â”€â”€ Shared sub-components â€” premium â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SectionTitle = ({ children }: { children: React.ReactNode }) => {
  const accent = useAccent()
  return (
    <div
      style={{
        fontSize: '18px',
        fontWeight: '900',
        letterSpacing: '5px',
        color: '#F1F5F9',
        paddingBottom: '10px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '3px',
          height: '14px',
          background: `linear-gradient(180deg, ${accent}, transparent)`,
          flexShrink: 0,
          borderRadius: '2px',
        }}
      />
      {children}
      <div
        style={{
          flex: 1,
          height: '1px',
          background: `linear-gradient(90deg, ${accent}33, transparent)`,
        }}
      />
    </div>
  )
}

const Badge = ({ label, color, bg }: { label: string; color: string; bg: string }) => (
  <span
    style={{
      background: bg,
      color,
      fontSize: '17px',
      fontWeight: '900',
      letterSpacing: '2px',
      padding: '3px 10px',
      borderRadius: '3px',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
      boxShadow: `0 0 8px ${bg}40`,
    }}
  >
    {label}
  </span>
)

const EmptyState = ({ label }: { label: string }) => {
  const accent = useAccent()
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 20px',
        fontSize: '18px',
        color: '#F1F5F9',
        letterSpacing: '4px',
        background: 'linear-gradient(135deg, rgba(18,18,18,0.97), rgba(8,8,8,0.99))',
        borderRadius: '6px',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.8)',
      }}
    >
      <div
        style={{ width: '24px', height: '1px', background: `${accent}4D`, marginBottom: '14px' }}
      />
      {label}
      <div style={{ width: '24px', height: '1px', background: `${accent}4D`, marginTop: '14px' }} />
    </div>
  )
}

const Timestamp = ({ iso }: { iso: string }) => {
  const accent = useAccent()
  return (
    <div
      style={{
        fontSize: '17px',
        color: accent,
        letterSpacing: '1.5px',
        marginTop: '10px',
        fontFamily: 'monospace',
      }}
    >
      {fmtTs(iso)}
    </div>
  )
}

const AddFormHeader = ({ label }: { label: string }) => {
  const accent = useAccent()
  return (
    <div
      style={{
        fontSize: '17px',
        color: accent,
        letterSpacing: '4px',
        marginBottom: '8px',
        fontWeight: '900',
      }}
    >
      {label}
    </div>
  )
}

const AddFormBox = ({ children }: { children: React.ReactNode }) => {
  const accent = useAccent()
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #050505 0%, #020202 100%)',
        border: `1px solid ${accent}2E`,
        padding: '16px',
        borderRadius: '6px',
        marginBottom: '22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: `inset 0 2px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.8), 0 4px 20px rgba(0,0,0,0.7), 0 0 0 1px ${accent}0A`,
      }}
    >
      {children}
    </div>
  )
}

// â”€â”€ Rich Body Editor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FONTS = [
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Monospace', value: 'monospace' },
  { label: 'Impact', value: 'Impact, fantasy' },
]
const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48]

const RICH_COLORS = [
  { v: '#FF2D55', label: 'Red' },
  { v: '#34D399', label: 'Green' },
  { v: '#FFFFFF', label: 'White' },
  { v: '#22D3EE', label: 'Cyan' },
  { v: '#FF6B00', label: 'Orange' },
  { v: '#F472B6', label: 'Pink' },
  { v: '#FBBF24', label: 'Yellow' },
  { v: '#000000', label: 'Black' },
  { v: 'transparent', label: 'None' },
]

function RichBodyEditor({
  block,
  updateBlock,
}: {
  block: BriefBlock
  updateBlock: (id: string, upd: Partial<BriefBlock>) => void
}) {
  const accent = useAccent()
  const editorRef = useRef<HTMLDivElement>(null)
  const isInitialized = useRef(false)
  const [colorMode, setColorMode] = React.useState<'text' | 'hl'>('text')
  // Self-contained undo/redo stack â€” never touches anything outside this editor
  const histRef = useRef<string[]>([])
  const histIdxRef = useRef(-1)
  const applyingRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!editorRef.current || isInitialized.current) return
    isInitialized.current = true
    const html = block.content || ''
    const init = html.includes('<')
      ? html
      : html
        .split('\n')
        .map((l) => `<p>${l || '<br>'}</p>`)
        .join('')
    editorRef.current.innerHTML = init
    histRef.current = [init]
    histIdxRef.current = 0
  }, [])

  const pushHistory = (html: string) => {
    histRef.current = histRef.current.slice(0, histIdxRef.current + 1)
    histRef.current.push(html)
    if (histRef.current.length > 100) histRef.current.shift()
    histIdxRef.current = histRef.current.length - 1
  }

  const applyHistory = (html: string) => {
    if (!editorRef.current) return
    applyingRef.current = true
    editorRef.current.innerHTML = html
    applyingRef.current = false
    updateBlock(block.id, { content: html })
  }

  const undo = () => {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--
    applyHistory(histRef.current[histIdxRef.current])
  }
  const redo = () => {
    if (histIdxRef.current >= histRef.current.length - 1) return
    histIdxRef.current++
    applyHistory(histRef.current[histIdxRef.current])
  }

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  const handleInput = () => {
    if (!editorRef.current || applyingRef.current) return
    const html = editorRef.current.innerHTML
    pushHistory(html)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      updateBlock(block.id, { content: html })
    }, 400)
  }

  const handleBlur = () => {
    if (!editorRef.current || applyingRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const html = editorRef.current.innerHTML
    updateBlock(block.id, { content: html })
  }

  const sel: React.CSSProperties = {
    background: '#020202',
    border: `1px solid ${accent}33`,
    color: '#F1F5F9',
    fontFamily: 'monospace',
    fontSize: '17px',
    padding: '6px 4px',
    borderRadius: '4px',
    cursor: 'pointer',
    outline: 'none',
    width: '80px',
  }
  const btn = (): React.CSSProperties => ({
    background: '#020202',
    border: `1px solid ${accent}33`,
    color: '#F1F5F9',
    fontFamily: 'monospace',
    fontSize: '17px',
    fontWeight: 700,
    padding: '6px 13px',
    borderRadius: '4px',
    cursor: 'pointer',
    lineHeight: 1,
  })
  const sw = (bg: string): React.CSSProperties => ({
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    background: bg === 'transparent' ? '#181818' : bg,
    border: bg === 'transparent' ? '1px dashed #555' : '1px solid #FFFFFF',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Single toolbar row */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          padding: '8px 10px',
          background: '#000000',
          border: `1px solid ${accent}22`,
          borderRadius: '4px',
          alignItems: 'center',
        }}
      >
        <select style={sel} onChange={(e) => exec('fontName', e.target.value)} defaultValue="">
          <option value="" disabled>
            Font
          </option>
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select style={sel} onChange={(e) => exec('fontSize', e.target.value)} defaultValue="">
          <option value="" disabled>
            Size
          </option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={String(Math.round(s / 4))}>
              {s}px
            </option>
          ))}
        </select>

        <div style={{ width: '1px', alignSelf: 'stretch', background: `${accent}22` }} />
        <button
          style={btn()}
          onMouseDown={(e) => {
            e.preventDefault()
            exec('bold')
          }}
        >
          <b>B</b>
        </button>
        <button
          style={btn()}
          onMouseDown={(e) => {
            e.preventDefault()
            exec('italic')
          }}
        >
          <i>I</i>
        </button>
        <button
          style={{ ...btn(), textDecoration: 'underline' }}
          onMouseDown={(e) => {
            e.preventDefault()
            exec('underline')
          }}
        >
          U
        </button>

        <div style={{ width: '1px', alignSelf: 'stretch', background: `${accent}22` }} />
        {/* A / HL toggle + unified color swatches */}
        <button
          onMouseDown={(e) => {
            e.preventDefault()
            setColorMode((m) => (m === 'text' ? 'hl' : 'text'))
          }}
          style={{
            ...btn(),
            background: colorMode === 'text' ? `${accent}22` : 'rgba(255,255,255,0.07)',
            border: `1px solid ${colorMode === 'text' ? accent : 'rgba(255,255,255,0.65)'}`,
            color: colorMode === 'text' ? accent : '#F1F5F9',
            minWidth: '44px',
          }}
        >
          {colorMode === 'text' ? 'A' : 'HL'}
        </button>
        {RICH_COLORS.map((c) => (
          <button
            key={c.v}
            title={`${colorMode === 'text' ? 'Text' : 'Highlight'}: ${c.label}`}
            onMouseDown={(e) => {
              e.preventDefault()
              exec(colorMode === 'text' ? 'foreColor' : 'hiliteColor', c.v)
            }}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              background: c.v === 'transparent' ? '#181818' : c.v,
              border:
                c.v === 'transparent' ? '1px dashed #555' : '1px solid #FFFFFF',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          />
        ))}

        <div style={{ width: '1px', alignSelf: 'stretch', background: `${accent}22` }} />
        <button
          style={btn()}
          onMouseDown={(e) => {
            e.preventDefault()
            exec('insertUnorderedList')
          }}
        >
          • List
        </button>
        <button
          style={btn()}
          onMouseDown={(e) => {
            e.preventDefault()
            exec('insertOrderedList')
          }}
        >
          # List
        </button>

        <div style={{ width: '1px', alignSelf: 'stretch', background: `${accent}22` }} />
        <button
          style={btn()}
          title="Undo"
          onMouseDown={(e) => {
            e.preventDefault()
            undo()
          }}
        >
          â†©
        </button>
        <button
          style={btn()}
          title="Redo"
          onMouseDown={(e) => {
            e.preventDefault()
            redo()
          }}
        >
          â†ª
        </button>
        <button
          style={btn()}
          onMouseDown={(e) => {
            e.preventDefault()
            exec('removeFormat')
          }}
        >
          ✕ Clear
        </button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
        style={{
          minHeight: '200px',
          padding: '14px 16px',
          background: '#000000',
          border: `1px solid ${accent}33`,
          borderRadius: '4px',
          color: '#F1F5F9',
          fontSize: '18px',
          lineHeight: '1.9',
          fontFamily: 'Georgia, serif',
          outline: 'none',
          overflowY: 'auto',
          caretColor: accent,
          wordBreak: 'break-word',
        }}
      />
    </div>
  )
}

// â”€â”€ BRIEF â”€ Block Layout Editor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BRIEF_THEMES: Record<string, string> = {
  goldman: '#D4A843',
  bloomberg: '#FF6B00',
  terminal: '#34D399',
}

const BRIEF_LAYOUT_TEMPLATES: Record<string, Omit<BriefBlock, 'id'>[]> = {
  'CHART FOCUS': [
    { type: 'header', title: 'MARKET BRIEF', logoText: 'EFI TRADING DESK', subtitle: '' },
    { type: 'intro', content: '' },
    { type: 'chart', url: '', caption: '', size: 'lg' },
    { type: 'body', content: '' },
    {
      type: 'metrics',
      items: [
        { label: 'SPX', value: '', delta: '' },
        { label: 'NDX', value: '', delta: '' },
        { label: 'VIX', value: '', delta: '' },
        { label: 'DXY', value: '', delta: '' },
      ],
    },
  ],
  'TEXT PRIMARY': [
    { type: 'header', title: 'MARKET BRIEF', logoText: 'EFI TRADING DESK' },
    { type: 'intro', content: '' },
    { type: 'body', content: '' },
    { type: 'chart', url: '', caption: '', size: 'sm' },
    { type: 'quote', content: '' },
  ],
  BALANCED: [
    { type: 'header', title: 'MARKET BRIEF', logoText: 'EFI TRADING DESK' },
    { type: 'intro', content: '' },
    { type: 'chart', url: '', caption: '', size: 'md' },
    { type: 'body', content: '' },
    { type: 'quote', content: '' },
  ],
  ANALYSIS: [
    { type: 'header', title: 'MARKET BRIEF', logoText: 'EFI TRADING DESK' },
    {
      type: 'metrics',
      items: [
        { label: '', value: '', delta: '' },
        { label: '', value: '', delta: '' },
        { label: '', value: '', delta: '' },
      ],
    },
    { type: 'intro', content: '' },
    { type: 'body', content: '' },
    { type: 'divider', content: 'KEY RISKS' },
    { type: 'body', content: '' },
  ],
}

const POLYGON_KEY = '' || ''

interface FlowTargets {
  t1: number | null
  t2: number | null
  pctToT1: number | null
  pctToT2: number | null
  magnet: number | null
  pivot: number | null
}
const EMPTY_TARGETS: FlowTargets = {
  t1: null,
  t2: null,
  pctToT1: null,
  pctToT2: null,
  magnet: null,
  pivot: null,
}

// Compute live DTE from today using expiry string (YYYY-MM-DD)
function liveDTE(expiry: string): number {
  // market close is 4:00 PM ET â€” derive correct UTC offset (EDT=-04:00, EST=-05:00)
  const probe = new Date(expiry + 'T12:00:00Z')
  const isEDT = probe
    .toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' })
    .includes('EDT')
  const exp = new Date(expiry + (isEDT ? 'T16:00:00-04:00' : 'T16:00:00-05:00'))
  const now = new Date()
  return Math.max(1, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
}

async function fetchFlowTargets(flow: any): Promise<FlowTargets> {
  if (!flow?.underlying_ticker || !flow?.expiry) return EMPTY_TARGETS
  try {
    // Try stored expiry first; if API returns nothing, try without expiry param to get nearest
    let res = await fetch(
      `/api/options-chain?ticker=${flow.underlying_ticker}&expiration=${flow.expiry}`,
      { signal: AbortSignal.timeout(10000) }
    )
    let result = res.ok ? await res.json() : null
    if (!result?.success || !result?.data || Object.keys(result.data).length === 0) {
      res = await fetch(`/api/options-chain?ticker=${flow.underlying_ticker}`, {
        signal: AbortSignal.timeout(10000),
      })
      result = res.ok ? await res.json() : null
    }
    if (!result?.success || !result?.data) return EMPTY_TARGETS
    const expData: any = result.data[flow.expiry] || Object.values(result.data)[0]
    if (!expData) return EMPTY_TARGETS

    // Build call/put entries + ATM IV list
    const callEntries: { strike: number; oi: number }[] = []
    const putEntries: { strike: number; oi: number }[] = []
    const atmIVs: number[] = []
    const spot: number = flow.spot_price || 0
    if (expData.calls) {
      for (const [k, d] of Object.entries(expData.calls as Record<string, any>)) {
        const strike = parseFloat(k)
        callEntries.push({ strike, oi: d.open_interest || 0 })
        if (d.implied_volatility > 0 && spot > 0 && Math.abs(strike - spot) / spot <= 0.05)
          atmIVs.push(d.implied_volatility)
      }
    }
    if (expData.puts) {
      for (const [k, d] of Object.entries(expData.puts as Record<string, any>)) {
        const strike = parseFloat(k)
        putEntries.push({ strike, oi: d.open_interest || 0 })
        if (d.implied_volatility > 0 && spot > 0 && Math.abs(strike - spot) / spot <= 0.05)
          atmIVs.push(d.implied_volatility)
      }
    }
    callEntries.sort((a, b) => a.strike - b.strike)
    putEntries.sort((a, b) => a.strike - b.strike)

    const avgIV =
      atmIVs.length > 0
        ? atmIVs.reduce((s, v) => s + v, 0) / atmIVs.length
        : flow.implied_volatility > 0
          ? flow.implied_volatility
          : 0.3
    // Use live DTE computed from today, not the stale stored days_to_expiry
    const daysToExpiry = liveDTE(flow.expiry)
    const T = daysToExpiry / 365
    const r = 0.0387
    const fillStyle = flow.fill_style || ''
    const isSold = fillStyle === 'B' || fillStyle === 'BB'
    const isCall = flow.type === 'call'
    const targetUp = (isCall && !isSold) || (!isCall && isSold)

    // Black-Scholes helpers
    const normalCDF = (x: number): number => {
      const a1 = 0.31938153,
        a2 = -0.356563782,
        a3 = 1.781477937,
        a4 = -1.821255978,
        a5 = 1.330274429
      const kk = 1.0 / (1.0 + 0.2316419 * Math.abs(x))
      const poly = ((((a5 * kk + a4) * kk + a3) * kk + a2) * kk + a1) * kk
      const approx = 1.0 - (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly
      return x >= 0 ? approx : 1.0 - approx
    }
    const d2 = (S: number, K: number, sig: number) => {
      if (T <= 0 || sig <= 0 || S <= 0 || K <= 0) return 0
      return (
        (Math.log(S / K) + (r + 0.5 * sig * sig) * T) / (sig * Math.sqrt(T)) - sig * Math.sqrt(T)
      )
    }
    const copUp = (K: number) => (1 - normalCDF(d2(spot, K, avgIV))) * 100 // sell call COP
    const copDn = (K: number) => normalCDF(d2(spot, K, avgIV)) * 100 // sell put COP

    const findStrike = (targetProb: number): number | null => {
      if (T <= 0 || avgIV <= 0 || spot <= 0) return null
      let lo = targetUp ? spot : spot * 0.5,
        hi = targetUp ? spot * 1.5 : spot
      const fn = targetUp ? copUp : copDn
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2
        if (fn(mid) < targetProb) {
          if (targetUp) lo = mid
          else hi = mid
        } else {
          if (targetUp) hi = mid
          else lo = mid
        }
      }
      return (lo + hi) / 2
    }

    const t1 = findStrike(80)
    const t2 = findStrike(90)
    const pctToT1 = t1 != null && spot > 0 ? (Math.abs(t1 - spot) / spot) * 100 : null
    const pctToT2 = t2 != null && spot > 0 ? (Math.abs(t2 - spot) / spot) * 100 : null

    // Tower detection: magnet = top call OI tower, pivot = top put OI tower
    const detectTopTower = (entries: { strike: number; oi: number }[]): number | null => {
      if (entries.length === 0) return null
      const sorted = [...entries].sort((a, b) => b.oi - a.oi)
      for (const cand of sorted) {
        const idx = entries.findIndex((e) => e.strike === cand.strike)
        if (idx <= 0 || idx >= entries.length - 1) continue
        const lPct = (entries[idx - 1].oi / cand.oi) * 100
        const rPct = (entries[idx + 1].oi / cand.oi) * 100
        if (lPct >= 25 && lPct <= 65 && rPct >= 25 && rPct <= 65) return cand.strike
      }
      return sorted[0]?.strike ?? null
    }

    return {
      t1,
      t2,
      pctToT1,
      pctToT2,
      magnet: detectTopTower(callEntries),
      pivot: detectTopTower(putEntries),
    }
  } catch {
    return EMPTY_TARGETS
  }
}

function FlowBlockView({ block, accent }: { block: BriefBlock; accent: string }) {
  let flow: any = null
  try {
    flow = block.content ? JSON.parse(block.content) : null
  } catch {
    /* ignore */
  }
  const [liveOptPrice, setLiveOptPrice] = useState<number | null>(null)
  const [liveStockPrice, setLiveStockPrice] = useState<number | null>(null)
  const [targets, setTargets] = useState<FlowTargets>(EMPTY_TARGETS)
  const [targetsLoading, setTargetsLoading] = useState(true)

  useEffect(() => {
    if (!flow) return
    setTargetsLoading(true)
    // Fetch live option price (bid/ask mid)
    const expiry = (flow.expiry || '').replace(/-/g, '').slice(2)
    const strikeFmt = String(Math.round((flow.strike || 0) * 1000)).padStart(8, '0')
    const optType = flow.type?.toLowerCase() === 'call' ? 'C' : 'P'
    const normTicker = (flow.underlying_ticker || '').replace(/\./g, '')
    const optTicker = `O:${normTicker}${expiry}${optType}${strikeFmt}`
    fetch(
      `/api/polygon/v3/snapshot/options/${flow.underlying_ticker}/${optTicker}?apikey=${POLYGON_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.results?.last_quote) {
          const mid = ((data.results.last_quote.bid || 0) + (data.results.last_quote.ask || 0)) / 2
          if (mid > 0) setLiveOptPrice(mid)
        }
      })
      .catch(() => { })
    // Fetch live stock price (previous close snapshot)
    fetch(
      `/api/polygon/v2/snapshot/locale/us/markets/stocks/tickers/${normTicker}?apiKey=${POLYGON_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const price = data?.ticker?.day?.c || data?.ticker?.prevDay?.c
        if (price && price > 0) setLiveStockPrice(price)
      })
      .catch(() => { })
    // Fetch T1/T2/Magnet/Pivot
    fetchFlowTargets(flow).then((t) => {
      setTargets(t)
      setTargetsLoading(false)
    })
  }, [block.content]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!flow)
    return (
      <div
        style={{
          height: '90px',
          marginBottom: '20px',
          border: `1px solid ${accent}`,
          display: 'flex',
          gap: '14px',
          padding: '12px 16px',
          background: '#040404',
          borderRadius: '3px',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize: '15px',
            letterSpacing: '4px',
            color: accent,
            fontFamily: 'monospace',
            fontWeight: 700,
          }}
        >
          FLOW â€” SELECT FROM TRACKER IN EDIT
        </span>
      </div>
    )

  const flowFmtTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    })
  const flowFmtDate = (d: string) => {
    const [y, m, day] = d.split('-')
    return `${m}/${day}/${y}`
  }
  const flowFmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v)
  const entryPrice: number = (flow as any).originalPrice ?? flow.premium_per_contract
  const fillStyle: string = flow.fill_style || ''
  const isSoldToOpen = fillStyle === 'B' || fillStyle === 'BB'
  const fillColor =
    fillStyle === 'A' || fillStyle === 'AA'
      ? '#00ff44'
      : fillStyle === 'B' || fillStyle === 'BB'
        ? '#ff3333'
        : '#ff8800'
  const typeColor = flow.type === 'call' ? '#00ff44' : '#ff3333'
  const tradeTypeColor =
    flow.trade_type === 'SWEEP' ? '#FFD700' : flow.trade_type === 'BLOCK' ? '#00aaff' : '#ff8800'
  const currentOptPrice =
    liveOptPrice ?? (flow.current_price && flow.current_price > 0 ? flow.current_price : null)
  const currentStockPrice =
    liveStockPrice ?? (flow.spot_price && flow.spot_price > 0 ? flow.spot_price : null)
  let percentChange = 0,
    priceHigher = false,
    hasPnl = false
  if (currentOptPrice && currentOptPrice > 0 && entryPrice > 0) {
    const raw = ((currentOptPrice - entryPrice) / entryPrice) * 100
    percentChange = isSoldToOpen ? -raw : raw
    priceHigher = percentChange > 0
    hasPnl = true
  }
  const _normT = (t: string) => t.replace(/\./g, '')
  const _expCode = (flow.expiry || '').replace(/-/g, '').slice(2)
  const _strikeFmt = String(Math.round((flow.strike || 0) * 1000)).padStart(8, '0')
  const _optType = flow.type?.toLowerCase() === 'call' ? 'C' : 'P'
  const _optTicker = `O:${_normT(flow.underlying_ticker || '')}${_expCode}${_optType}${_strikeFmt}`
  const _optPrices: Record<string, number> = currentOptPrice
    ? { [_optTicker]: currentOptPrice }
    : {}
  const _stockPrices: Record<string, number> = currentStockPrice
    ? { [flow.underlying_ticker]: currentStockPrice }
    : {}
  const gradeResult = calculateFlowGrade(
    { ...flow, premium_per_contract: entryPrice },
    _optPrices,
    _stockPrices,
    new Map(),
    new Map([[flow.underlying_ticker, 2.5]]),
    new Map()
  )
  const detailCells: { label: string; value: string; color?: string }[] = []
  detailCells.push({
    label: 'STOCK PRICE',
    value: currentStockPrice ? `$${currentStockPrice.toFixed(2)}` : '...',
    color: '#00ccff',
  })
  detailCells.push({
    label: 'OPT PRICE',
    value: currentOptPrice ? `$${currentOptPrice.toFixed(2)}` : '...',
    color: '#FFD700',
  })
  if (targetsLoading || targets.t1 != null)
    detailCells.push({
      label: 'T1 (80%)',
      value: targetsLoading
        ? '...'
        : `$${targets.t1!.toFixed(2)}${targets.pctToT1 != null ? ` (${targets.pctToT1.toFixed(1)}%)` : ''}`,
      color: '#00ff88',
    })
  if (targetsLoading || targets.t2 != null)
    detailCells.push({
      label: 'T2 (90%)',
      value: targetsLoading
        ? '...'
        : `$${targets.t2!.toFixed(2)}${targets.pctToT2 != null ? ` (${targets.pctToT2.toFixed(1)}%)` : ''}`,
      color: '#00ffcc',
    })
  if (targetsLoading || targets.magnet != null)
    detailCells.push({
      label: 'MAGNET',
      value: targetsLoading ? '...' : `$${targets.magnet}`,
      color: '#FFD700',
    })
  if (targetsLoading || targets.pivot != null)
    detailCells.push({
      label: 'PIVOT',
      value: targetsLoading ? '...' : `$${targets.pivot}`,
      color: '#a855f7',
    })
  if (flow.implied_volatility)
    detailCells.push({
      label: 'IV',
      value: `${((flow.implied_volatility as number) * 100).toFixed(1)}%`,
      color: '#cc88ff',
    })
  if (flow.volume)
    detailCells.push({
      label: 'VOL',
      value: (flow.volume as number).toLocaleString(),
      color: '#00ccff',
    })
  if (flow.open_interest)
    detailCells.push({
      label: 'OI',
      value: (flow.open_interest as number).toLocaleString(),
      color: '#ffffff',
    })
  if (flow.vol_oi_ratio)
    detailCells.push({
      label: 'VOL/OI',
      value: (flow.vol_oi_ratio as number).toFixed(2),
      color: '#ff8800',
    })
  if (flow.delta != null)
    detailCells.push({ label: 'DELTA', value: (flow.delta as number).toFixed(2), color: '#44aaff' })
  if (flow.exchange_name)
    detailCells.push({ label: 'EXCH', value: flow.exchange_name, color: '#ffffff' })

  const isCall = flow.type === 'call'
  const sideLabel = isSoldToOpen ? 'SOLD TO OPEN' : 'BOT TO OPEN'
  const detailGrid = detailCells.filter(c => !['STOCK PRICE', 'OPT PRICE'].includes(c.label))
  const liveData = detailCells.filter(c => ['STOCK PRICE', 'OPT PRICE'].includes(c.label))

  return (
    <div style={{
      marginBottom: '18px',
      border: `1px solid rgba(255,255,255,0.08)`,
      borderLeft: `3px solid ${typeColor}`,
      background: '#050505',
      fontFamily: 'monospace',
      overflow: 'hidden',
    }}>
      {/* â”€â”€ Wire ticket header bar â”€â”€ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px',
        background: '#0a0a0a',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        gap: '8px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isCall ? <CallIcon size={16} /> : <PutIcon size={16} />}
          <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '3px', color: typeColor }}>{flow.type?.toUpperCase()}</span>
          {fillStyle && (
            <span style={{
              fontSize: '9px', padding: '1px 6px', letterSpacing: '2px', fontWeight: 700,
              border: `1px solid ${fillColor}44`, background: `${fillColor}0D`, color: fillColor,
            }}>{sideLabel} · {fillStyle}</span>
          )}
          {(flow.trade_type === 'SWEEP' || flow.trade_type === 'BLOCK') && (
            <span style={{
              fontSize: '9px', padding: '1px 6px', letterSpacing: '2px', fontWeight: 700,
              border: `1px solid ${tradeTypeColor}44`, background: `${tradeTypeColor}0D`, color: tradeTypeColor,
            }}>{flow.trade_type}</span>
          )}
        </div>
        <span style={{ fontSize: '9px', color: '#FFFFFF', letterSpacing: '1.5px' }}>
          {flowFmtTime(flow.trade_timestamp)} · EXP {flowFmtDate(flow.expiry)}
        </span>
      </div>

      {/* â”€â”€ Primary row: ticker + title â”€â”€ */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '20px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '1px' }}>
            {flow.underlying_ticker}
          </span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: typeColor, letterSpacing: '0.5px' }}>
            ${flow.strike} {flow.type?.toUpperCase()}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hasPnl && (
              <span style={{
                fontSize: '13px', fontWeight: 900,
                color: priceHigher ? '#00D68F' : '#FF3B3B',
              }}>
                {priceHigher ? '▲' : '▼'} {priceHigher ? '+' : ''}{percentChange.toFixed(1)}%
              </span>
            )}
            {gradeResult.grade !== 'N/A' && (
              <span style={{
                fontSize: '13px', fontWeight: 900, color: gradeResult.color,
                border: `1px solid ${gradeResult.color}44`, padding: '1px 6px',
              }}>{gradeResult.grade}</span>
            )}
          </div>
        </div>

        {/* â”€â”€ Key deal metrics â”€â”€ */}
        <div style={{ display: 'flex', gap: '0', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {[
            { label: 'CONTRACTS', value: (flow.trade_size || 0).toLocaleString(), color: '#22D3EE' },
            { label: 'ENTRY', value: `$${entryPrice?.toFixed(2)}`, color: '#FFD700' },
            { label: 'TOTAL PREM', value: flowFmtCurrency(flow.total_premium), color: '#00D68F' },
            ...liveData.map(c => ({ label: c.label.replace(' PRICE', ''), value: c.value, color: c.color || '#fff' })),
          ].map((item, i, arr) => (
            <div key={i} style={{
              padding: '8px 12px',
              borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              minWidth: '80px',
            }}>
              <div style={{ fontSize: '8px', color: '#FFFFFF', letterSpacing: '2px', marginBottom: '3px', fontWeight: 700 }}>
                {item.label}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: item.color }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* â”€â”€ Analytics grid â”€â”€ */}
      {detailGrid.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(85px, 1fr))',
        }}>
          {detailGrid.map((item, idx, arr) => (
            <div key={idx} style={{
              padding: '6px 10px',
              borderRight: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ fontSize: '8px', color: '#FFFFFF', letterSpacing: '2px', marginBottom: '3px', fontWeight: 700 }}>
                {item.label}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: item.color || '#FFFFFF' }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function viewBriefBlock(block: BriefBlock, accent: string, editMode: boolean): React.ReactNode {
  switch (block.type) {
    case 'header':
      return (
        <div style={{ marginBottom: '32px', position: 'relative' }}>
          {/* Top wire rule */}
          <div style={{ height: '3px', background: accent, marginBottom: '0' }} />
          <div style={{ height: '1px', background: `${accent}40`, marginBottom: '12px' }} />
          {/* Masthead row */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '10px 0 10px',
            borderBottom: `1px solid ${accent}25`,
            marginBottom: '20px',
          }}>
            <div>
              <div style={{
                fontSize: '11px', fontWeight: 900, letterSpacing: '5px',
                color: accent, fontFamily: 'monospace', lineHeight: 1,
                marginBottom: '4px', textTransform: 'uppercase',
              }}>
                {block.logoText || 'EFI TRADING DESK'}
              </div>
              <div style={{
                fontSize: '11px', letterSpacing: '2px',
                color: '#FFFFFF', fontFamily: 'monospace',
              }}>
                MARKET INTELLIGENCE · PROPRIETARY RESEARCH
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: '11px', letterSpacing: '2px',
                color: '#FFFFFF', fontFamily: 'monospace',
                marginBottom: '3px',
              }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}
              </div>
              <div style={{
                fontSize: '11px', letterSpacing: '2px',
                color: accent, fontFamily: 'monospace', fontWeight: 700,
              }}>
                INTERNAL USE ONLY
              </div>
            </div>
          </div>
          {/* Headline */}
          <div style={{
            fontSize: '34px', fontWeight: 900, lineHeight: 1.15,
            fontFamily: '"Times New Roman", Georgia, serif',
            color: '#FFFFFF', letterSpacing: '0.5px',
            marginBottom: block.subtitle ? '12px' : '0',
          }}>
            {block.title || 'MARKET BRIEF'}
          </div>
          {/* Deck / subtitle */}
          {block.subtitle && (
            <div style={{
              fontSize: '15px', color: '#FFFFFF',
              lineHeight: 1.6, fontFamily: 'Georgia, serif',
              paddingTop: '10px',
              borderTop: `1px solid rgba(255,255,255,0.08)`,
              marginTop: '4px',
            }}>
              {block.subtitle}
            </div>
          )}
          {/* Bottom rule */}
          <div style={{ height: '1px', background: `${accent}25`, marginTop: '20px' }} />
        </div>
      )
    case 'intro':
      return (
        <div style={{ marginBottom: '24px', position: 'relative' }}>
          {/* Lede label */}
          <div style={{
            fontSize: '9px', fontWeight: 900, letterSpacing: '4px',
            color: accent, fontFamily: 'monospace', marginBottom: '10px',
            paddingBottom: '6px', borderBottom: `1px solid ${accent}20`,
          }}>LEAD · SUMMARY</div>
          <div style={{
            borderLeft: `3px solid ${accent}`,
            paddingLeft: '18px',
          }}>
            <div style={{
              color: '#F1F5F9', fontSize: '16px', lineHeight: '1.85',
              fontFamily: 'Georgia, serif', fontWeight: 400,
            }}
              dangerouslySetInnerHTML={{ __html: block.content || '' }}
            />
          </div>
        </div>
      )
    case 'body':
      return (
        <div style={{ marginBottom: '22px', paddingBottom: '22px', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
          <div style={{
            color: 'rgba(225,232,240,0.88)', fontSize: '14px', lineHeight: '1.95',
            fontFamily: 'Georgia, serif',
          }}
            dangerouslySetInnerHTML={{ __html: block.content || '' }}
          />
        </div>
      )
    case 'quote':
      return (
        <div style={{
          margin: '24px 0', padding: '20px 24px 20px 24px',
          background: 'rgba(255,255,255,0.02)',
          borderLeft: `4px solid ${accent}`,
          borderTop: `1px solid ${accent}20`,
          borderBottom: `1px solid ${accent}20`,
          position: 'relative',
        }}>
          {/* Giant quotation mark */}
          <div style={{
            position: 'absolute', top: '8px', left: '20px',
            fontSize: '48px', lineHeight: 1, color: `${accent}30`,
            fontFamily: 'Georgia, serif', fontWeight: 900, userSelect: 'none',
            pointerEvents: 'none',
          }}>\u201C</div>
          <div style={{
            color: '#E8EDF2', fontSize: '15px', fontStyle: 'italic',
            lineHeight: '1.8', fontFamily: 'Georgia, serif',
            paddingLeft: '16px', paddingTop: '14px',
          }}>
            {block.content}
          </div>
          <div style={{
            position: 'absolute', bottom: '8px', right: '20px',
            fontSize: '48px', lineHeight: 1, color: `${accent}30`,
            fontFamily: 'Georgia, serif', fontWeight: 900, userSelect: 'none',
            pointerEvents: 'none',
          }}>\u201D</div>
        </div>
      )
    case 'conclusion':
      return (
        <div style={{ marginBottom: '24px' }}>
          {/* Section header bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            marginBottom: '14px',
          }}>
            <div style={{ width: '3px', height: '18px', background: accent, borderRadius: '2px', flexShrink: 0 }} />
            <span style={{
              fontSize: '10px', fontWeight: 900, letterSpacing: '5px',
              color: accent, fontFamily: 'monospace',
            }}>BOTTOM LINE</span>
            <div style={{ flex: 1, height: '1px', background: `${accent}25` }} />
          </div>
          <div style={{
            background: `linear-gradient(135deg, ${accent}08 0%, transparent 60%)`,
            border: `1px solid ${accent}20`,
            borderLeft: `3px solid ${accent}`,
            padding: '16px 20px',
            borderRadius: '0 4px 4px 0',
          }}>
            <div style={{
              color: '#FFFFFF', fontSize: '14px', lineHeight: '1.85',
              fontFamily: 'Georgia, serif',
            }}
              dangerouslySetInnerHTML={{ __html: block.content || '' }}
            />
          </div>
        </div>
      )
    case 'seasonality': {
      const stTicker = (block.content || '').toUpperCase().trim()
      const stYears = parseInt(block.url || '10')
      const stElection =
        block.subtitle && block.subtitle !== 'Normal Mode' ? block.subtitle : undefined
      const stSweet = block.title === '1'
      const stPain = block.logoText === '1'
      return (
        <div style={{ marginBottom: '28px' }}>
          {stTicker ? (
            <div style={{ position: 'relative' }}>
              <SeasonalityChart
                key={`${stTicker}-${stYears}-${stElection}`}
                autoStart={true}
                initialSymbol={stTicker}
                hideScreener={true}
                hideMonthlyReturns={true}
                hideControls={!editMode}
                externalYears={stYears}
                externalElectionMode={stElection}
                externalSweetSpot={stSweet}
                externalPainPoint={stPain}
              />
              {/* Centered ticker watermark */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  zIndex: 5,
                  userSelect: 'none',
                }}
              >
                <span
                  style={{
                    fontSize: '80px',
                    fontWeight: 900,
                    color: '#ffffff',
                    opacity: 0.045,
                    letterSpacing: '14px',
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stTicker}
                </span>
              </div>
              {/* Year label top-right (view mode only â€” edit mode has year dropdown in controls) */}
              {!editMode && (
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '14px',
                    pointerEvents: 'none',
                    zIndex: 10,
                    fontSize: '11px',
                    fontWeight: 900,
                    color: '#FF6B00',
                    letterSpacing: '4px',
                    fontFamily: 'monospace',
                    userSelect: 'none',
                  }}
                >
                  {stYears}YR
                </div>
              )}
            </div>
          ) : (
            <div style={{
              height: '220px', border: `1px dashed ${accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#050505',
            }}>
              <span style={{ fontSize: '9px', letterSpacing: '5px', color: `${accent}60`, fontFamily: 'monospace' }}>
                SEASONALITY â€” ENTER TICKER IN EDIT
              </span>
            </div>
          )}
          {block.caption && (
            <div style={{
              padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.06)',
              background: '#080808',
            }}>
              <span style={{ fontSize: '11px', color: '#E0E6F0', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                {block.caption}
              </span>
            </div>
          )}
        </div>
      )
    }
    case 'flow':
      return <FlowBlockView block={block} accent={accent} />
    case 'chart': {
      const ticker = (block.content || '').toUpperCase().trim()
      return (
        <ChartDraggableWrapper editMode={editMode}>
          {ticker ? (
            <EFIPopupChart key={ticker} symbol={ticker} fallbackCandles={[]} />
          ) : (
            <div style={{
              height: '220px', border: `1px dashed ${accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#050505',
            }}>
              <span style={{ fontSize: '9px', letterSpacing: '5px', color: `${accent}60`, fontFamily: 'monospace' }}>
                CHART â€” ENTER TICKER IN EDIT
              </span>
            </div>
          )}
          {block.caption && (
            <div style={{
              padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.06)',
              background: '#080808', marginTop: '2px',
            }}>
              <span style={{ fontSize: '11px', color: '#E0E6F0', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                {block.caption}
              </span>
            </div>
          )}
        </ChartDraggableWrapper>
      )
    }
    case 'image':
      return (
        <div style={{ marginBottom: '22px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          {block.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.url} alt={block.caption || ''} style={{ width: '100%', display: 'block' }} />
          ) : (
            <div style={{
              height: '220px', border: `1px dashed ${accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#050505',
            }}>
              <span style={{ fontSize: '9px', letterSpacing: '5px', color: `${accent}60`, fontFamily: 'monospace' }}>
                IMAGE â€” ADD URL IN EDIT
              </span>
            </div>
          )}
          {block.caption && (
            <div style={{
              padding: '8px 12px',
              background: '#080808',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <div style={{ width: '2px', height: '12px', background: accent, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: '#E0E6F0', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                {block.caption}
              </span>
            </div>
          )}
        </div>
      )
    case 'metrics': {
      const mode = (block.content || 'zones') as 'zones' | 'directional' | 'straddle'
      const ticker = block.title || ''
      const items = block.items || []
      if (mode === 'zones') {
        const zoneRows = [
          {
            label: 'BULLISH',
            sub: 'ZONE',
            value: items[0]?.value || 'â€”',
            color: GS.green,
            bg: 'rgba(52,211,153,0.055)',
            glowColor: 'rgba(52,211,153,0.12)',
            Icon: BullishZoneIcon,
          },
          {
            label: 'CHOP',
            sub: 'ZONE',
            value: items[1]?.value || 'â€”',
            color: GS.amber,
            bg: 'rgba(255,149,0,0.055)',
            glowColor: 'rgba(255,149,0,0.12)',
            Icon: ChopZoneIcon,
          },
          {
            label: 'BEARISH',
            sub: 'ZONE',
            value: items[2]?.value || 'â€”',
            color: GS.red,
            bg: 'rgba(255,45,85,0.055)',
            glowColor: 'rgba(255,45,85,0.12)',
            Icon: BearishZoneIcon,
          },
        ]
        return (
          <div style={{
            marginBottom: '20px',
            border: '1px solid rgba(255,255,255,0.07)',
            overflow: 'hidden',
            fontFamily: 'monospace',
          }}>
            {/* Header */}
            <div style={{
              padding: '8px 14px',
              background: '#080808',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '2px', color: '#FFFFFF' }}>
                {ticker || 'TICKER'}
              </span>
              <span style={{ fontSize: '9px', letterSpacing: '3px', color: accent, fontWeight: 700 }}>MARKET ZONES</span>
            </div>
            {/* Zone rows */}
            {zoneRows.map((r, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '100px 1fr',
                borderLeft: `3px solid ${r.color}`,
                borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '12px 8px',
                  background: `${r.color}0A`, borderRight: `1px solid ${r.color}22`,
                  gap: '4px',
                }}>
                  <r.Icon size={28} />
                  <span style={{ fontSize: '9px', fontWeight: 900, color: r.color, letterSpacing: '2px' }}>{r.label}</span>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(232,237,242,0.85)', lineHeight: 1.7 }}>
                    {r.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      }
      if (mode === 'directional') {
        const bull = items[0]?.value || 'â€”'
        const target = items[1]?.value || 'â€”'
        const stop = items[2]?.value || 'â€”'
        const note = block.caption || ''
        const isBearish = items[0]?.delta === 'bear'
        const dirRows = [
          {
            label: isBearish ? 'BEARISH' : 'BULLISH',
            sub: 'ENTRY',
            value: bull,
            color: isBearish ? GS.red : GS.green,
            bg: isBearish ? 'rgba(255,45,85,0.055)' : 'rgba(52,211,153,0.055)',
            glowColor: isBearish ? 'rgba(255,45,85,0.12)' : 'rgba(52,211,153,0.12)',
            Icon: isBearish ? BearishZoneIcon : BullishZoneIcon,
          },
          {
            label: 'TARGET',
            sub: 'PROFIT',
            value: target,
            color: GS.blue,
            bg: 'rgba(59,130,246,0.055)',
            glowColor: 'rgba(59,130,246,0.12)',
            Icon: ProfitTargetIcon,
          },
          {
            label: 'STOP',
            sub: 'LOSS',
            value: stop,
            color: GS.red,
            bg: 'rgba(255,45,85,0.055)',
            glowColor: 'rgba(255,45,85,0.12)',
            Icon: StopLossIcon,
          },
        ]
        return (
          <div style={{
            marginBottom: '20px',
            border: '1px solid rgba(255,255,255,0.07)',
            overflow: 'hidden',
            fontFamily: 'monospace',
          }}>
            {/* Header */}
            <div style={{
              padding: '8px 14px',
              background: '#080808',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '2px', color: '#FFFFFF' }}>
                {ticker || 'TICKER'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <DirectionalBadgeIcon size={10} color="#22D3EE" />
                <span style={{ fontSize: '9px', letterSpacing: '3px', color: '#22D3EE', fontWeight: 700 }}>DIRECTIONAL</span>
              </div>
            </div>
            {note && (
              <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', color: '#FFFFFF', lineHeight: 1.6 }}>
                {note}
              </div>
            )}
            {/* 3 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {dirRows.map((r, i) => (
                <div key={i} style={{
                  borderTop: `2px solid ${r.color}`,
                  borderRight: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  background: `${r.color}08`,
                  padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <r.Icon size={22} />
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 900, color: r.color, letterSpacing: '2px', lineHeight: 1 }}>{r.label}</div>
                      <div style={{ fontSize: '8px', color: `${r.color}88`, letterSpacing: '2px', marginTop: '2px' }}>{r.sub}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.5 }}>{r.value}</div>
                </div>
              ))}
            </div>
            {/* Embedded image */}
            {block.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={block.url}
                alt=""
                style={{
                  width: '100%',
                  display: 'block',
                  maxHeight: '340px',
                  objectFit: 'contain',
                  borderTop: '1px solid rgba(255,255,255,0.07)',
                  background: '#050505',
                }}
              />
            )}
          </div>
        )
      }
      // straddle
      const note = block.caption || ''
      const callVal = items[0]?.value || 'â€”'
      const callT = items[1]?.value || 'â€”'
      const putVal = items[2]?.value || 'â€”'
      const putT = items[3]?.value || 'â€”'
      return (
        <div style={{
          marginBottom: '20px',
          border: '1px solid rgba(255,255,255,0.07)',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{
            padding: '8px 14px', background: '#080808',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '2px', color: '#FFFFFF' }}>
              {ticker || 'TICKER'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LevelsGridIcon size={10} color="#22D3EE" />
              <span style={{ fontSize: '9px', letterSpacing: '3px', color: '#22D3EE', fontWeight: 700 }}>STRADDLE</span>
            </div>
          </div>
          {note && (
            <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', color: '#FFFFFF', lineHeight: 1.6 }}>
              {note}
            </div>
          )}
          {/* Call / Put side-by-side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{
              borderTop: `2px solid ${GS.green}`, borderRight: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(52,211,153,0.05)', padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CallIcon size={18} />
                <span style={{ fontSize: '9px', fontWeight: 900, color: GS.green, letterSpacing: '3px' }}>CALL</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF2', lineHeight: 1.6 }}>{callVal}</div>
              {callT && callT !== 'â€”' && <div style={{ fontSize: '11px', color: GS.green, fontWeight: 700 }}>TARGET: {callT}</div>}
            </div>
            <div style={{
              borderTop: `2px solid ${GS.red}`,
              background: 'rgba(255,45,85,0.05)', padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PutIcon size={18} />
                <span style={{ fontSize: '9px', fontWeight: 900, color: GS.red, letterSpacing: '3px' }}>PUT</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#E8EDF2', lineHeight: 1.6 }}>{putVal}</div>
              {putT && putT !== 'â€”' && <div style={{ fontSize: '11px', color: GS.red, fontWeight: 700 }}>TARGET: {putT}</div>}
            </div>
          </div>
          {block.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.url} alt="" style={{
              width: '100%', display: 'block', maxHeight: '320px',
              objectFit: 'contain', background: '#050505',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }} />
          )}
        </div>
      )
    }
    case 'divider':
      return (
        <div style={{ margin: '28px 0', position: 'relative' }}>
          <div style={{ height: '1px', background: `rgba(255,255,255,0.08)` }} />
          {block.content && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#000000',
              padding: '0 16px',
            }}>
              <span style={{
                fontSize: '9px', fontWeight: 900, letterSpacing: '5px',
                color: accent, fontFamily: 'monospace',
                whiteSpace: 'nowrap', textTransform: 'uppercase',
              }}>
                {block.content}
              </span>
            </div>
          )}
        </div>
      )
    default:
      return null
  }
}

// â”€â”€ SVG Zone Icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BullishZoneIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      {/* Zone band â€” solid fill */}
      <rect x="4" y="6" width="32" height="5" rx="2" fill="#34D399" />
      {/* Uptrend line */}
      <polyline
        points="5,32 14,22 21,27 32,12"
        stroke="#34D399"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Arrowhead */}
      <polyline
        points="24,11 32,11 32,18"
        stroke="#34D399"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function ChopZoneIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      {/* Upper band â€” solid fill same as bullish/bearish rect */}
      <rect x="4" y="6" width="32" height="5" rx="2" fill="#FF9500" />
      {/* Lower band â€” solid fill same as bullish/bearish rect */}
      <rect x="4" y="29" width="32" height="5" rx="2" fill="#FF9500" />
      {/* Zigzag between the two bands */}
      <polyline
        points="4,20 10,12 18,28 26,12 32,28 36,20"
        stroke="#FF9500"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function BearishZoneIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      {/* Zone band â€” solid fill */}
      <rect x="4" y="29" width="32" height="5" rx="2" fill="#FF2D55" />
      {/* Downtrend line */}
      <polyline
        points="5,8 14,18 21,13 32,28"
        stroke="#FF2D55"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Arrowhead */}
      <polyline
        points="24,29 32,29 32,22"
        stroke="#FF2D55"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function LevelsGridIcon({ size = 14, color = '#D4A843' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <line x1="1" y1="3" x2="13" y2="3" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="7" x2="13" y2="7" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="1" y1="11" x2="13" y2="11" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function ProfitTargetIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      {/* Solid top band */}
      <rect x="4" y="6" width="32" height="5" rx="2" fill="#3B82F6" />
      {/* Bullseye circle */}
      <circle cx="20" cy="26" r="8" stroke="#3B82F6" strokeWidth="2.5" fill="none" />
      <circle cx="20" cy="26" r="3.5" fill="#3B82F6" />
    </svg>
  )
}

function StopLossIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      {/* Solid bottom band */}
      <rect x="4" y="29" width="32" height="5" rx="2" fill="#FF2D55" />
      {/* Shield outline */}
      <path
        d="M20 7 L32 12 L32 22 C32 28 20 34 20 34 C20 34 8 28 8 22 L8 12 Z"
        stroke="#FF2D55"
        strokeWidth="2.5"
        fill="none"
        strokeLinejoin="round"
      />
      {/* X inside shield */}
      <line
        x1="15"
        y1="16"
        x2="25"
        y2="24"
        stroke="#FF2D55"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="25"
        y1="16"
        x2="15"
        y2="24"
        stroke="#FF2D55"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DirectionalBadgeIcon({ size = 14, color = '#D4A843' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <polyline
        points="1,11 5,7 8,9 13,3"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="10,3 13,3 13,6"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// â”€â”€ SVG Market Icons (animated, no emoji) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CallIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }}>
      <style>{`
                @keyframes callGlow {
                    0%,100%{filter:drop-shadow(0 0 3px #34D399);opacity:1}
                    50%{filter:drop-shadow(0 0 10px #34D399) drop-shadow(0 0 20px #34D39988);opacity:.9}
                }
                @keyframes callRise {
                    0%,100%{transform:translateY(0)}
                    50%{transform:translateY(-2px)}
                }
                .call-svg-g{animation:callGlow 2.4s ease-in-out infinite,callRise 2.4s ease-in-out infinite}
            `}</style>
      <g className="call-svg-g">
        <polygon
          points="14,3 26,23 2,23"
          fill="#34D399"
          fillOpacity="0.15"
          stroke="#34D399"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <polyline
          points="10,15 14,8 18,15"
          stroke="#34D399"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <line
          x1="14"
          y1="8"
          x2="14"
          y2="23"
          stroke="#34D399"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

function PutIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }}>
      <style>{`
                @keyframes putGlow {
                    0%,100%{filter:drop-shadow(0 0 3px #FF2D55);opacity:1}
                    50%{filter:drop-shadow(0 0 10px #FF2D55) drop-shadow(0 0 20px #FF2D5588);opacity:.9}
                }
                @keyframes putDrop {
                    0%,100%{transform:translateY(0)}
                    50%{transform:translateY(2px)}
                }
                .put-svg-g{animation:putGlow 2.4s ease-in-out infinite,putDrop 2.4s ease-in-out infinite}
            `}</style>
      <g className="put-svg-g">
        <polygon
          points="14,25 26,5 2,5"
          fill="#FF2D55"
          fillOpacity="0.15"
          stroke="#FF2D55"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <polyline
          points="10,13 14,20 18,13"
          stroke="#FF2D55"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <line
          x1="14"
          y1="20"
          x2="14"
          y2="5"
          stroke="#FF2D55"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

// â”€â”€ Brief block editors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function FlowEditRow({
  flow,
  isSelected,
  onSelect,
}: {
  flow: any
  isSelected: boolean
  onSelect: () => void
}) {
  const [liveOptPrice, setLiveOptPrice] = React.useState<number | null>(null)
  const [liveStockPrice, setLiveStockPrice] = React.useState<number | null>(null)
  const [targets, setTargets] = React.useState<FlowTargets>(EMPTY_TARGETS)
  const [targetsLoading, setTargetsLoading] = React.useState(true)
  React.useEffect(() => {
    const expiry = (flow.expiry || '').replace(/-/g, '').slice(2)
    const strikeFmt = String(Math.round((flow.strike || 0) * 1000)).padStart(8, '0')
    const optType = flow.type?.toLowerCase() === 'call' ? 'C' : 'P'
    const normTicker = (flow.underlying_ticker || '').replace(/\./g, '')
    const optTicker = `O:${normTicker}${expiry}${optType}${strikeFmt}`
    fetch(
      `/api/polygon/v3/snapshot/options/${flow.underlying_ticker}/${optTicker}?apikey=${POLYGON_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.results?.last_quote) {
          const mid = ((data.results.last_quote.bid || 0) + (data.results.last_quote.ask || 0)) / 2
          if (mid > 0) setLiveOptPrice(mid)
        }
      })
      .catch(() => { })
    fetch(
      `/api/polygon/v2/snapshot/locale/us/markets/stocks/tickers/${normTicker}?apiKey=${POLYGON_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const price = data?.ticker?.day?.c || data?.ticker?.prevDay?.c
        if (price && price > 0) setLiveStockPrice(price)
      })
      .catch(() => { })
    fetchFlowTargets(flow).then((t) => {
      setTargets(t)
      setTargetsLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const entryPrice: number = (flow as any).originalPrice ?? flow.premium_per_contract
  const fillStyle: string = flow.fill_style || ''
  const isSoldToOpen = fillStyle === 'B' || fillStyle === 'BB'
  const fillColor =
    fillStyle === 'A' || fillStyle === 'AA'
      ? '#00ff44'
      : fillStyle === 'B' || fillStyle === 'BB'
        ? '#ff3333'
        : '#ff8800'
  const typeColor = flow.type === 'call' ? '#00ff44' : '#ff3333'
  const tradeTypeColor =
    flow.trade_type === 'SWEEP' ? '#FFD700' : flow.trade_type === 'BLOCK' ? '#00aaff' : '#ff8800'
  const currentOptPrice = liveOptPrice ?? null
  const currentStockPrice = liveStockPrice ?? (flow.spot_price > 0 ? flow.spot_price : null)
  let percentChange = 0,
    priceHigher = false,
    hasPnl = false
  if (currentOptPrice && currentOptPrice > 0 && entryPrice > 0) {
    const raw = ((currentOptPrice - entryPrice) / entryPrice) * 100
    percentChange = isSoldToOpen ? -raw : raw
    priceHigher = percentChange > 0
    hasPnl = true
  }
  const normT = (t: string) => t.replace(/\./g, '')
  const expCode = (flow.expiry || '').replace(/-/g, '').slice(2)
  const sFmt = String(Math.round((flow.strike || 0) * 1000)).padStart(8, '0')
  const oType = flow.type?.toLowerCase() === 'call' ? 'C' : 'P'
  const oTicker = `O:${normT(flow.underlying_ticker || '')}${expCode}${oType}${sFmt}`
  const optPrices: Record<string, number> = currentOptPrice ? { [oTicker]: currentOptPrice } : {}
  const stockPrices: Record<string, number> = currentStockPrice
    ? { [flow.underlying_ticker]: currentStockPrice }
    : {}
  const grade = calculateFlowGrade(
    { ...flow, premium_per_contract: entryPrice },
    optPrices,
    stockPrices,
    new Map(),
    new Map([[flow.underlying_ticker, 2.5]]),
    new Map()
  )
  const flowFmtDate = (d: string) => {
    const [y, m, day] = d.split('-')
    return `${m}/${day}/${y}`
  }
  const flowFmtTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    })
  const flowFmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v)

  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius: '6px',
        cursor: 'pointer',
        overflow: 'hidden',
        marginBottom: '4px',
        background: isSelected
          ? 'linear-gradient(180deg, #221800 0%, #110c00 100%)'
          : 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 40%, #050505 100%)',
        border: `1px solid ${isSelected ? '#ff8800' : '#444'}`,
        boxShadow: isSelected ? '0 0 10px rgba(255,136,0,0.4)' : 'none',
      }}
    >
      <div style={{ padding: '4px' }}>
        <table
          style={{
            width: '100%',
            textAlign: 'center',
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
          }}
        >
          <tbody>
            <tr style={{ borderBottom: '1px solid #333' }}>
              {/* Ticker + Time */}
              <td style={{ padding: '5px 4px', width: '15%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <span
                    style={{
                      background: 'linear-gradient(180deg, #1f2937, #000)',
                      color: '#ff8800',
                      fontWeight: 'bold',
                      padding: '2px 6px',
                      border: '1px solid #666',
                      fontSize: '18px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {flow.underlying_ticker}
                  </span>
                  <span
                    style={{
                      fontSize: '13px',
                      color: '#ffffff',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                    }}
                  >
                    {flowFmtTime(flow.trade_timestamp)}
                  </span>
                </div>
              </td>
              {/* Strike + Type */}
              <td style={{ padding: '5px 4px', width: '15%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '18px',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    ${flow.strike}
                  </span>
                  <span
                    style={{
                      fontSize: '16px',
                      color: typeColor,
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                    }}
                  >
                    {flow.type?.toUpperCase()}
                  </span>
                </div>
              </td>
              {/* Size @ Price + Fill + Premium */}
              <td style={{ padding: '5px 4px', width: '30%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '18px',
                        color: '#00ccff',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                      }}
                    >
                      {(flow.trade_size || 0).toLocaleString()}
                    </span>
                    <span
                      style={{
                        fontSize: '18px',
                        color: '#FFD700',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                      }}
                    >
                      @${entryPrice?.toFixed(2)}
                    </span>
                    {fillStyle && (
                      <span
                        style={{
                          fontSize: '18px',
                          fontWeight: 'bold',
                          color: fillColor,
                          fontFamily: 'monospace',
                        }}
                      >
                        {fillStyle}
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '16px',
                      fontWeight: 'bold',
                      color: '#00ff44',
                      fontFamily: 'monospace',
                    }}
                  >
                    {flowFmtCurrency(flow.total_premium)}
                  </span>
                </div>
              </td>
              {/* Expiry + Trade Type */}
              <td style={{ padding: '5px 4px', width: '20%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '16px',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                    }}
                  >
                    {flowFmtDate(flow.expiry)}
                  </span>
                  {(flow.trade_type === 'SWEEP' || flow.trade_type === 'BLOCK') && (
                    <span
                      style={{
                        fontSize: '16px',
                        fontWeight: 'bold',
                        color: tradeTypeColor,
                        fontFamily: 'monospace',
                      }}
                    >
                      {flow.trade_type}
                    </span>
                  )}
                </div>
              </td>
              {/* P&L + Grade */}
              <td style={{ padding: '5px 4px', width: '20%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  {hasPnl ? (
                    <span
                      style={{
                        fontSize: '17px',
                        fontWeight: 'bold',
                        color: priceHigher ? '#00ff00' : '#ff0000',
                        fontFamily: 'monospace',
                      }}
                    >
                      {priceHigher ? '+' : ''}
                      {percentChange.toFixed(1)}%
                    </span>
                  ) : (
                    <span style={{ fontSize: '15px', color: '#ffffff', fontFamily: 'monospace' }}>
                      -
                    </span>
                  )}
                  {grade.grade !== 'N/A' && (
                    <span
                      style={{
                        fontSize: '22px',
                        fontWeight: 900,
                        color: grade.color,
                        textShadow: `0 0 8px ${grade.color}`,
                        fontFamily: 'monospace',
                      }}
                    >
                      {grade.grade}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* Stock + Opt + T1/T2/Magnet/Pivot strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', borderTop: '1px solid #333' }}>
        <div
          style={{
            flex: '1 1 auto',
            minWidth: '60px',
            padding: '4px 8px',
            textAlign: 'center',
            borderRight: '1px solid #333',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: '#ff8800',
              fontWeight: 700,
              letterSpacing: '1px',
            }}
          >
            STOCK
          </div>
          <div
            style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 700, color: '#00ccff' }}
          >
            {currentStockPrice ? `$${currentStockPrice.toFixed(2)}` : '...'}
          </div>
        </div>
        <div
          style={{
            flex: '1 1 auto',
            minWidth: '60px',
            padding: '4px 8px',
            textAlign: 'center',
            borderRight: targets.t1 != null || targets.magnet != null ? '1px solid #333' : 'none',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: '#ff8800',
              fontWeight: 700,
              letterSpacing: '1px',
            }}
          >
            OPT
          </div>
          <div
            style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 700, color: '#FFD700' }}
          >
            {currentOptPrice ? `$${currentOptPrice.toFixed(2)}` : '...'}
          </div>
        </div>
        {(targetsLoading || targets.t1 != null) && (
          <div
            style={{
              flex: '1 1 auto',
              minWidth: '80px',
              padding: '4px 8px',
              textAlign: 'center',
              borderRight: '1px solid #333',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#ff8800',
                fontWeight: 700,
                letterSpacing: '1px',
              }}
            >
              T1 (80%)
            </div>
            <div
              style={{
                fontSize: '13px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#00ff88',
              }}
            >
              {targetsLoading
                ? '...'
                : `$${targets.t1!.toFixed(2)}${targets.pctToT1 != null ? ` (${targets.pctToT1.toFixed(1)}%)` : ''}`}
            </div>
          </div>
        )}
        {(targetsLoading || targets.t2 != null) && (
          <div
            style={{
              flex: '1 1 auto',
              minWidth: '80px',
              padding: '4px 8px',
              textAlign: 'center',
              borderRight: '1px solid #333',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#ff8800',
                fontWeight: 700,
                letterSpacing: '1px',
              }}
            >
              T2 (90%)
            </div>
            <div
              style={{
                fontSize: '13px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#00ffcc',
              }}
            >
              {targetsLoading
                ? '...'
                : `$${targets.t2!.toFixed(2)}${targets.pctToT2 != null ? ` (${targets.pctToT2.toFixed(1)}%)` : ''}`}
            </div>
          </div>
        )}
        {(targetsLoading || targets.magnet != null) && (
          <div
            style={{
              flex: '1 1 auto',
              minWidth: '60px',
              padding: '4px 8px',
              textAlign: 'center',
              borderRight: '1px solid #333',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#ff8800',
                fontWeight: 700,
                letterSpacing: '1px',
              }}
            >
              MAGNET
            </div>
            <div
              style={{
                fontSize: '14px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#FFD700',
              }}
            >
              {targetsLoading ? '...' : `$${targets.magnet}`}
            </div>
          </div>
        )}
        {(targetsLoading || targets.pivot != null) && (
          <div
            style={{ flex: '1 1 auto', minWidth: '60px', padding: '4px 8px', textAlign: 'center' }}
          >
            <div
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#ff8800',
                fontWeight: 700,
                letterSpacing: '1px',
              }}
            >
              PIVOT
            </div>
            <div
              style={{
                fontSize: '14px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#a855f7',
              }}
            >
              {targetsLoading ? '...' : `$${targets.pivot}`}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FlowBlockEdit({
  block,
  updateBlock,
}: {
  block: BriefBlock
  updateBlock: (id: string, upd: Partial<BriefBlock>) => void
}) {
  const accent = useAccent()
  const [flows, setFlows] = React.useState<any[]>([])
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('flowTrackingWatchlist')
      if (saved) setFlows(JSON.parse(saved))
    } catch {
      /* ignore */
    }
  }, [])

  let selected: any = null
  try {
    selected = block.content ? JSON.parse(block.content) : null
  } catch {
    /* ignore */
  }

  if (flows.length === 0)
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '13px',
          letterSpacing: '3px',
          border: `1px solid ${accent}`,
          borderRadius: '4px',
        }}
      >
        NO FLOWS IN TRACKER â€” ADD FLOWS FROM THE LIVE FLOW PANEL FIRST
      </div>
    )

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', maxHeight: '600px', overflowY: 'auto' }}
    >
      {flows.map((flow, i) => {
        const isSelected =
          selected &&
          selected.underlying_ticker === flow.underlying_ticker &&
          selected.trade_timestamp === flow.trade_timestamp
        return (
          <FlowEditRow
            key={i}
            flow={flow}
            isSelected={isSelected}
            onSelect={() =>
              updateBlock(block.id, { content: isSelected ? '' : JSON.stringify(flow) })
            }
          />
        )
      })}
    </div>
  )
}

function ChartBlockEdit({
  block,
  updateBlock,
}: {
  block: BriefBlock
  updateBlock: (id: string, upd: Partial<BriefBlock>) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <input
          placeholder="TICKER (e.g. SPY, AAPL)"
          value={block.content || ''}
          onChange={(e) => updateBlock(block.id, { content: e.target.value.toUpperCase() })}
          style={iLg}
        />
        <select
          value={block.url || 'D'}
          onChange={(e) => updateBlock(block.id, { url: e.target.value })}
          style={{ ...iSm, cursor: 'pointer' }}
        >
          <option value="1">1 MIN</option>
          <option value="5">5 MIN</option>
          <option value="15">15 MIN</option>
          <option value="30">30 MIN</option>
          <option value="60">1 HOUR</option>
          <option value="240">4 HOUR</option>
          <option value="D">DAILY</option>
          <option value="W">WEEKLY</option>
        </select>
      </div>
      <input
        placeholder="Caption (optional)"
        value={block.caption || ''}
        onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
        style={iSm}
      />
    </div>
  )
}

const ELECTION_PERIODS = [
  'Normal Mode',
  'Election Year',
  'Post-Election',
  'Mid-Term',
  'Pre-Election',
]
const YEARS_OPTIONS = [1, 3, 5, 10, 15, 20]

function SeasonalityBlockEdit({
  block,
  updateBlock,
}: {
  block: BriefBlock
  updateBlock: (id: string, upd: Partial<BriefBlock>) => void
}) {
  const accent = useAccent()
  const selStyle: React.CSSProperties = {
    ...iBase,
    padding: '10px 14px',
    fontSize: '15px',
    cursor: 'pointer',
    appearance: 'none' as const,
  }
  const sweetOn = block.title === '1'
  const painOn = block.logoText === '1'
  const toggleStyle = (on: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 900,
    fontFamily: 'monospace',
    letterSpacing: '3px',
    cursor: 'pointer',
    border: `1px solid ${on ? accent : accent + '44'}`,
    background: on ? accent + '22' : 'transparent',
    color: on ? accent : accent + '88',
    borderRadius: '3px',
    userSelect: 'none',
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        placeholder="TICKER (e.g. SPY, AAPL)"
        value={block.content || ''}
        onChange={(e) => updateBlock(block.id, { content: e.target.value.toUpperCase() })}
        style={iLg}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <select
          value={block.url || '10'}
          onChange={(e) => updateBlock(block.id, { url: e.target.value })}
          style={{ ...selStyle, flex: 1 }}
          title="Years of data"
        >
          {YEARS_OPTIONS.map((y) => (
            <option key={y} value={String(y)}>
              {y} {y === 1 ? 'Year' : 'Years'}
            </option>
          ))}
        </select>
        <select
          value={block.subtitle || 'Normal Mode'}
          onChange={(e) => updateBlock(block.id, { subtitle: e.target.value })}
          style={{ ...selStyle, flex: 2 }}
          title="Election mode"
        >
          {ELECTION_PERIODS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          style={toggleStyle(sweetOn)}
          onClick={() => updateBlock(block.id, { title: sweetOn ? '0' : '1' })}
        >
          {sweetOn ? 'â˜…' : 'â˜†'} SWEET SPOT
        </button>
        <button
          style={toggleStyle(painOn)}
          onClick={() => updateBlock(block.id, { logoText: painOn ? '0' : '1' })}
        >
          {painOn ? '▼' : '△'} PAIN POINT
        </button>
      </div>
      <input
        placeholder="Caption (optional)"
        value={block.caption || ''}
        onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
        style={iSm}
      />
    </div>
  )
}

function ImageBlockEdit({
  block,
  updateBlock,
}: {
  block: BriefBlock
  updateBlock: (id: string, upd: Partial<BriefBlock>) => void
}) {
  const accent = useAccent()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const pasteZoneRef = React.useRef<HTMLDivElement>(null)
  const [focused, setFocused] = React.useState(false)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => updateBlock(block.id, { url: e.target?.result as string })
    reader.readAsDataURL(file)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) {
          handleFile(file)
          break
        }
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <input
        type="file"
        ref={fileRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />

      {/* Big paste zone */}
      <div
        ref={pasteZoneRef}
        tabIndex={0}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => pasteZoneRef.current?.focus()}
        onPaste={handlePaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f?.type.startsWith('image/')) handleFile(f)
        }}
        style={{
          width: '100%',
          minHeight: '110px',
          border: `2px dashed ${focused ? accent : accent + '55'}`,
          borderRadius: '6px',
          background: focused ? `${accent}0A` : '#080808',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          cursor: 'pointer',
          outline: 'none',
          transition: 'border-color 0.15s, background 0.15s',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: '28px' }}>ðŸ“‹</span>
        <span
          style={{
            fontSize: '13px',
            fontFamily: 'monospace',
            letterSpacing: '3px',
            color: focused ? accent : '#888',
            fontWeight: 700,
          }}
        >
          {focused ? 'PASTE NOW (CTRL+V)' : 'CLICK THEN CTRL+V'}
        </span>
        <span
          style={{ fontSize: '11px', fontFamily: 'monospace', letterSpacing: '2px', color: '#555' }}
        >
          OR DROP IMAGE HERE
        </span>
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        style={{
          ...ghostBtn(accent),
          padding: '9px',
          fontSize: '13px',
          letterSpacing: '2px',
          cursor: 'pointer',
          textAlign: 'center' as const,
        }}
      >
        ðŸ“ PICK FILE INSTEAD
      </button>

      {block.url && (
        <div style={{ position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt=""
            style={{
              width: '100%',
              maxHeight: '160px',
              objectFit: 'cover',
              borderRadius: '4px',
              border: `1px solid ${accent}33`,
              display: 'block',
            }}
          />
          <button
            onClick={() => updateBlock(block.id, { url: '' })}
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              background: 'rgba(0,0,0,0.85)',
              border: 'none',
              color: '#FF2D55',
              cursor: 'pointer',
              padding: '3px 8px',
              borderRadius: '2px',
              fontSize: '13px',
              fontWeight: 900,
            }}
          >
            ✕
          </button>
        </div>
      )}
      <input
        placeholder="Caption (optional)"
        value={block.caption || ''}
        onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
        style={iSm}
      />
    </div>
  )
}

function MetricsBlockEdit({
  block,
  updateBlock,
}: {
  block: BriefBlock
  updateBlock: (id: string, upd: Partial<BriefBlock>) => void
}) {
  const accent = useAccent()
  const mode = (block.content || 'zones') as 'zones' | 'directional' | 'straddle'
  const items = block.items || []
  const inpStyle = {
    background: '#0d0d0d',
    border: `1px solid ${accent}33`,
    color: '#F1F5F9',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: 'monospace',
    letterSpacing: '1px',
    borderRadius: '3px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  }
  const imgFileRef = React.useRef<HTMLInputElement>(null)
  const pasteRef = React.useRef<HTMLDivElement>(null)
  const [imgFocused, setImgFocused] = React.useState(false)

  const handleImgFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => updateBlock(block.id, { url: e.target?.result as string })
    reader.readAsDataURL(file)
  }
  const handleImgPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile()
        if (f) {
          handleImgFile(f)
          break
        }
      }
    }
  }

  const setTicker = (v: string) => updateBlock(block.id, { title: v.toUpperCase() })
  const setNote = (v: string) => updateBlock(block.id, { caption: v })
  const setItem = (mi: number, val: string) => {
    const arr = items.map((it, i) => (i === mi ? { ...it, value: val } : it))
    updateBlock(block.id, { items: arr })
  }

  const switchMode = (m: string) =>
    updateBlock(block.id, {
      content: m,
      caption: '',
      items:
        m === 'zones'
          ? [
            { label: 'BULLISH', value: '', delta: 'bull' },
            { label: 'CHOP', value: '', delta: 'chop' },
            { label: 'BEARISH', value: '', delta: 'bear' },
          ]
          : m === 'directional'
            ? [
              { label: 'BULLISH', value: '', delta: '' },
              { label: 'TARGET', value: '', delta: '' },
              { label: 'STOP', value: '', delta: '' },
            ]
            : [
              { label: 'CALL', value: '', delta: '' },
              { label: 'CALL_T', value: '', delta: '' },
              { label: 'PUT', value: '', delta: '' },
              { label: 'PUT_T', value: '', delta: '' },
            ],
    })

  const modeBtn = (m: string, label: string) => (
    <button
      key={m}
      onClick={() => switchMode(m)}
      style={{
        padding: '7px 14px',
        fontSize: '12px',
        fontWeight: 900,
        letterSpacing: '2px',
        fontFamily: 'monospace',
        cursor: 'pointer',
        borderRadius: '3px',
        border: `1px solid ${accent}55`,
        background: mode === m ? accent : 'transparent',
        color: mode === m ? '#000' : accent,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {modeBtn('zones', 'THREE ZONE')}
        {modeBtn('directional', 'DIRECTIONAL')}
        {modeBtn('straddle', 'STRADDLE')}
      </div>
      {(mode === 'directional' || mode === 'straddle') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 900,
              color: accent,
              letterSpacing: '3px',
              fontFamily: 'monospace',
            }}
          >
            NOTES
          </div>
          <textarea
            placeholder="Add notes here..."
            value={block.caption || ''}
            onChange={(e) => setNote(e.target.value)}
            style={{ ...inpStyle, minHeight: '72px', resize: 'vertical', lineHeight: '1.6' }}
          />
        </div>
      )}
      <input
        placeholder="TICKER (e.g. $SPY)"
        value={block.title || ''}
        onChange={(e) => setTicker(e.target.value)}
        style={inpStyle}
      />

      {mode === 'zones' && (
        <>
          <input
            placeholder="Bullish Zone  (e.g. $671-689)"
            value={items[0]?.value || ''}
            onChange={(e) => setItem(0, e.target.value)}
            style={{ ...inpStyle, borderColor: `${GS.green}55` }}
          />
          <input
            placeholder="Chop Zone  (e.g. $667-670)"
            value={items[1]?.value || ''}
            onChange={(e) => setItem(1, e.target.value)}
            style={{ ...inpStyle, borderColor: `${GS.amber}55` }}
          />
          <input
            placeholder="Bearish Zone  (e.g. $651-666)"
            value={items[2]?.value || ''}
            onChange={(e) => setItem(2, e.target.value)}
            style={{ ...inpStyle, borderColor: `${GS.red}55` }}
          />
        </>
      )}

      {mode === 'directional' && (
        <>
          {/* Bias toggle */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => {
                const arr = [...items]
                arr[0] = { ...arr[0], delta: 'bull' }
                updateBlock(block.id, { items: arr })
              }}
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: '12px',
                fontWeight: 900,
                letterSpacing: '2px',
                fontFamily: 'monospace',
                cursor: 'pointer',
                borderRadius: '3px',
                border: `1px solid ${GS.green}55`,
                background: items[0]?.delta !== 'bear' ? GS.green : 'transparent',
                color: items[0]?.delta !== 'bear' ? '#000' : GS.green,
              }}
            >
              BULLISH
            </button>
            <button
              onClick={() => {
                const arr = [...items]
                arr[0] = { ...arr[0], delta: 'bear' }
                updateBlock(block.id, { items: arr })
              }}
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: '12px',
                fontWeight: 900,
                letterSpacing: '2px',
                fontFamily: 'monospace',
                cursor: 'pointer',
                borderRadius: '3px',
                border: `1px solid ${GS.red}55`,
                background: items[0]?.delta === 'bear' ? GS.red : 'transparent',
                color: items[0]?.delta === 'bear' ? '#000' : GS.red,
              }}
            >
              BEARISH
            </button>
          </div>
          <input
            placeholder="Entry  (e.g. Buy the dip $395-397)"
            value={items[0]?.value || ''}
            onChange={(e) => setItem(0, e.target.value)}
            style={{
              ...inpStyle,
              borderColor: items[0]?.delta === 'bear' ? `${GS.red}55` : `${GS.green}55`,
            }}
          />
          <input
            placeholder="Profit Target  (e.g. $525)"
            value={items[1]?.value || ''}
            onChange={(e) => setItem(1, e.target.value)}
            style={{ ...inpStyle, borderColor: `${GS.blue}55` }}
          />
          <input
            placeholder="Stop Loss  (e.g. $498)"
            value={items[2]?.value || ''}
            onChange={(e) => setItem(2, e.target.value)}
            style={{ ...inpStyle, borderColor: `${GS.red}55` }}
          />
        </>
      )}

      {(mode === 'directional' || mode === 'straddle') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 900,
              color: accent,
              letterSpacing: '3px',
              fontFamily: 'monospace',
            }}
          >
            IMAGE (OPTIONAL)
          </div>
          <input
            type="file"
            ref={imgFileRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImgFile(f)
            }}
          />
          <div
            ref={pasteRef}
            tabIndex={0}
            onFocus={() => setImgFocused(true)}
            onBlur={() => setImgFocused(false)}
            onClick={() => pasteRef.current?.focus()}
            onPaste={handleImgPaste}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f?.type.startsWith('image/')) handleImgFile(f)
            }}
            style={{
              border: `2px dashed ${imgFocused ? accent : accent + '44'}`,
              borderRadius: '5px',
              background: imgFocused ? `${accent}0A` : '#080808',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <span style={{ fontSize: '20px' }}>ðŸ“‹</span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                letterSpacing: '2px',
                color: imgFocused ? accent : '#888',
                fontWeight: 700,
              }}
            >
              {imgFocused ? 'PASTE NOW (CTRL+V)' : 'CLICK â†’ CTRL+V  OR  DROP'}
            </span>
          </div>
          <button
            onClick={() => imgFileRef.current?.click()}
            style={{
              ...ghostBtn(accent),
              padding: '7px',
              fontSize: '12px',
              letterSpacing: '2px',
              cursor: 'pointer',
              textAlign: 'center' as const,
            }}
          >
            ðŸ“ PICK FILE
          </button>
          {block.url && (
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt=""
                style={{
                  width: '100%',
                  maxHeight: '140px',
                  objectFit: 'cover',
                  borderRadius: '4px',
                  border: `1px solid ${accent}33`,
                  display: 'block',
                }}
              />
              <button
                onClick={() => updateBlock(block.id, { url: '' })}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  background: 'rgba(0,0,0,0.85)',
                  border: 'none',
                  color: '#FF2D55',
                  cursor: 'pointer',
                  padding: '2px 7px',
                  borderRadius: '2px',
                  fontSize: '12px',
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}
      {mode === 'straddle' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '10px',
                background: 'rgba(52,211,153,0.05)',
                borderRadius: '3px',
                border: `1px solid ${GS.green}22`,
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 900,
                  color: GS.green,
                  letterSpacing: '3px',
                  marginBottom: '2px',
                }}
              >
                CALL
              </div>
              <input
                placeholder="e.g. $510 Call 3/20 Expiry"
                value={items[0]?.value || ''}
                onChange={(e) => setItem(0, e.target.value)}
                style={{ ...inpStyle, borderColor: `${GS.green}33` }}
              />
              <input
                placeholder="Targets  (e.g. $515 and $523)"
                value={items[1]?.value || ''}
                onChange={(e) => setItem(1, e.target.value)}
                style={{ ...inpStyle, borderColor: `${GS.green}33` }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '10px',
                background: 'rgba(255,45,85,0.05)',
                borderRadius: '3px',
                border: `1px solid ${GS.red}22`,
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 900,
                  color: GS.red,
                  letterSpacing: '3px',
                  marginBottom: '2px',
                }}
              >
                PUT
              </div>
              <input
                placeholder="e.g. $500 Put 3/20 Expiry"
                value={items[2]?.value || ''}
                onChange={(e) => setItem(2, e.target.value)}
                style={{ ...inpStyle, borderColor: `${GS.red}33` }}
              />
              <input
                placeholder="Targets  (e.g. $489 and $470)"
                value={items[3]?.value || ''}
                onChange={(e) => setItem(3, e.target.value)}
                style={{ ...inpStyle, borderColor: `${GS.red}33` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// â”€â”€ QuickSection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function QuickSection({
  quick, persist, editMode, accent,
}: { quick: QuickBrief; persist: (q: QuickBrief) => void; editMode: boolean; accent: string }) {
  const save = (u: Partial<QuickBrief>) => persist({ ...quick, ...u, updatedAt: nowTs() })
  const focusItems: FocusItem[] = quick.focusItems || []
  const trades: TradeRow[] = quick.trades || []
  const modeLabel = BRIEF_MODES.find(m => m.id === quick.mode)?.label || 'DAILY PULSE'
  const isDouble = quick.layout === 'double'

  const updMkt = (i: number, f: keyof MktDataItem, v: any) => save({ marketData: quick.marketData.map((d, j) => j === i ? { ...d, [f]: v } : d) })
  const updLvl = (i: number, f: keyof KeyLevelItem, v: string) => save({ keyLevels: quick.keyLevels.map((l, j) => j === i ? { ...l, [f]: v } : l) })

  const addFocus = () => save({ focusItems: [...focusItems, { id: uid(), ticker: '', direction: 'hot', bullets: [''], trade: '' }] })
  const updFocus = (id: string, upd: Partial<FocusItem>) => save({ focusItems: focusItems.map(f => f.id === id ? { ...f, ...upd } : f) })
  const delFocus = (id: string) => save({ focusItems: focusItems.filter(f => f.id !== id) })
  const addFocusBullet = (id: string, buls: string[]) => updFocus(id, { bullets: [...buls, ''] })
  const updFocusBullet = (id: string, buls: string[], bi: number, v: string) => updFocus(id, { bullets: buls.map((b, j) => j === bi ? v : b) })
  const delFocusBullet = (id: string, buls: string[], bi: number) => updFocus(id, { bullets: buls.filter((_, j) => j !== bi) })

  const addTrade = () => save({ trades: [...trades, { id: uid(), ticker: '', type: 'call', contract: '', entry: '', t1: '', t2: '', stop: '', notes: '' }] })
  const updTrade = (id: string, upd: Partial<TradeRow>) => save({ trades: trades.map(t => t.id === id ? { ...t, ...upd } : t) })
  const delTrade = (id: string) => save({ trades: trades.filter(t => t.id !== id) })

  const inp: React.CSSProperties = { ...iBase, padding: '7px 10px', fontSize: '12px' }
  const TRADE_TYPES = ['call', 'put', 'straddle', 'spread', 'stock']
  const DIRECTIONS: FocusItem['direction'][] = ['hot', 'bull', 'bear', 'straddle', 'neutral']
  const secLabel = (txt: string, icon?: React.ReactElement) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', paddingBottom: '8px', borderBottom: `1px solid ${accent}25` }}>
      {icon}
      <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '4px', color: accent, fontFamily: 'monospace' }}>{txt}</span>
    </div>
  )

  // â”€â”€ EDIT MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (editMode) return (
    <div style={{ fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '22px', padding: '4px 0' }}>
      {/* Config row: mode + layout */}
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: accent, marginBottom: '6px', fontWeight: 900 }}>BRIEFING MODE</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {BRIEF_MODES.map(m => (
              <button key={m.id} onClick={() => save({ mode: m.id as QuickBrief['mode'] })} style={{ padding: '5px 12px', fontSize: '9px', fontWeight: 900, letterSpacing: '2px', fontFamily: 'monospace', cursor: 'pointer', border: `1px solid ${quick.mode === m.id ? accent : 'rgba(255,255,255,0.1)'}`, background: quick.mode === m.id ? `${accent}18` : 'transparent', color: quick.mode === m.id ? accent : 'rgba(255,255,255,0.35)' }}>{m.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: accent, marginBottom: '6px', fontWeight: 900 }}>LAYOUT</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['single', 'double'] as const).map(l => (
              <button key={l} onClick={() => save({ layout: l })} style={{ padding: '5px 12px', fontSize: '9px', fontWeight: 900, letterSpacing: '2px', fontFamily: 'monospace', cursor: 'pointer', border: `1px solid ${(quick.layout || 'single') === l ? accent : 'rgba(255,255,255,0.1)'}`, background: (quick.layout || 'single') === l ? `${accent}18` : 'transparent', color: (quick.layout || 'single') === l ? accent : 'rgba(255,255,255,0.35)' }}>{l === 'single' ? 'â‘  SINGLE COL' : 'â‘¡ DOUBLE COL'}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Headline + Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: accent, marginBottom: '6px', fontWeight: 900 }}>HEADLINE</div>
          <textarea value={quick.headline} onChange={e => save({ headline: e.target.value })} placeholder="Main market takeaway..." style={{ ...iBase, padding: '10px 12px', fontSize: '13px', resize: 'vertical', minHeight: '48px', lineHeight: '1.6', fontFamily: 'Georgia, serif', width: '100%' }} />
        </div>
        <div>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: accent, marginBottom: '6px', fontWeight: 900 }}>MARKET SUMMARY</div>
          <textarea value={quick.summary || ''} onChange={e => save({ summary: e.target.value })} placeholder="Context paragraph â€” macro drivers, overnight news..." style={{ ...iBase, padding: '10px 12px', fontSize: '12px', resize: 'vertical', minHeight: '48px', lineHeight: '1.65', fontFamily: 'Georgia, serif', width: '100%' }} />
        </div>
      </div>

      {/* Market Data */}
      <div>
        <div style={{ fontSize: '9px', letterSpacing: '4px', color: accent, marginBottom: '8px', fontWeight: 900 }}>MARKET DATA</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 55px 1fr 95px 42px)', gap: '4px 6px', alignItems: 'center', marginBottom: '4px' }}>
          {[0, 1, 2].map(col => ['LABEL', 'VALUE', 'CHG', 'DIR'].map(h => <div key={`${col}-${h}`} style={{ fontSize: '8px', color: '#FFFFFF', letterSpacing: '2px' }}>{h}</div>))}
        </div>
        {[0, 1].map(row => (
          <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 55px 1fr 95px 42px)', gap: '4px 6px', marginBottom: '4px', alignItems: 'center' }}>
            {[0, 1, 2].map(col => {
              const i = row * 3 + col
              const d = quick.marketData[i]
              if (!d) return null
              return (
                <React.Fragment key={i}>
                  <input value={d.label} onChange={e => updMkt(i, 'label', e.target.value)} style={{ ...inp, textAlign: 'center', fontWeight: 900, letterSpacing: '2px' }} />
                  <input value={d.value} onChange={e => updMkt(i, 'value', e.target.value)} placeholder="5,612" style={inp} />
                  <input value={d.change} onChange={e => updMkt(i, 'change', e.target.value)} placeholder="+1.2%" style={inp} />
                  <button onClick={() => updMkt(i, 'up', !d.up)} style={{ ...inp, cursor: 'pointer', textAlign: 'center', color: d.up ? '#00D68F' : '#FF3B3B', fontWeight: 900, background: 'transparent', border: `1px solid ${d.up ? '#00D68F44' : '#FF3B3B44'}` }}>{d.up ? '▲' : '▼'}</button>
                </React.Fragment>
              )
            })}
          </div>
        ))}
      </div>

      {/* Focus Items */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: accent, fontWeight: 900 }}>TOP FOCUS ITEMS</div>
          <button onClick={addFocus} style={{ ...ghostBtn(accent), padding: '4px 12px', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer' }}>+ ADD TICKER</button>
        </div>
        {focusItems.length === 0 && <div style={{ fontSize: '10px', color: '#FFFFFF', letterSpacing: '2px', padding: '4px 0' }}>No focus items â€” click + ADD TICKER</div>}
        {focusItems.map((fi) => (
          <div key={fi.id} style={{ border: `1px solid ${QD_COLOR[fi.direction] || accent}30`, marginBottom: '10px', background: '#040404' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 140px 1fr 32px', gap: '6px', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
              <input value={fi.ticker} onChange={e => updFocus(fi.id, { ticker: e.target.value.toUpperCase() })} placeholder="TICKER" style={{ ...inp, fontWeight: 900, letterSpacing: '3px', fontSize: '13px', textAlign: 'center' }} />
              <select value={fi.direction} onChange={e => updFocus(fi.id, { direction: e.target.value as FocusItem['direction'] })} style={{ ...iSm, padding: '7px 8px', fontSize: '10px', letterSpacing: '2px', color: QD_COLOR[fi.direction] || accent }}>
                {DIRECTIONS.map(d => <option key={d} value={d}>{QD_LABEL[d]}</option>)}
              </select>
              <input value={fi.trade} onChange={e => updFocus(fi.id, { trade: e.target.value })} placeholder="Trade note (e.g. $212.5 Puts & $220 Calls 6/26)" style={{ ...inp, fontSize: '11px' }} />
              <button onClick={() => delFocus(fi.id)} style={{ ...rmBtn, padding: '5px 7px', cursor: 'pointer', fontSize: '13px' }}>✕</button>
            </div>
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {fi.bullets.map((b, bi) => (
                <div key={bi} style={{ display: 'grid', gridTemplateColumns: '1fr 30px', gap: '4px', alignItems: 'center' }}>
                  <input value={b} onChange={e => updFocusBullet(fi.id, fi.bullets, bi, e.target.value)} placeholder={`Bullet ${bi + 1} â€” thesis, setup, risk...`} style={{ ...inp, fontSize: '12px' }} />
                  <button onClick={() => delFocusBullet(fi.id, fi.bullets, bi)} style={{ ...rmBtn, padding: '5px 6px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
                </div>
              ))}
              <button onClick={() => addFocusBullet(fi.id, fi.bullets)} style={{ ...ghostBtn(accent), padding: '3px 10px', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer', alignSelf: 'flex-start', marginTop: '2px' }}>+ BULLET</button>
            </div>
          </div>
        ))}
      </div>

      {/* Trade Setups */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: accent, fontWeight: 900 }}>TRADE SETUPS</div>
          <button onClick={addTrade} style={{ ...ghostBtn(accent), padding: '4px 12px', fontSize: '9px', letterSpacing: '2px', cursor: 'pointer' }}>+ ADD TRADE</button>
        </div>
        {trades.length === 0 && <div style={{ fontSize: '10px', color: '#FFFFFF', letterSpacing: '2px', padding: '4px 0' }}>No trades â€” click + ADD TRADE</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '70px 66px 1fr 70px 70px 70px 72px 1fr 30px', gap: '4px', marginBottom: '4px' }}>
          {['TICKER', 'TYPE', 'CONTRACT', 'ENTRY', 'T1', 'T2', 'STOP', 'NOTES', ''].map(h => <div key={h} style={{ fontSize: '8px', color: '#FFFFFF', letterSpacing: '2px' }}>{h}</div>)}
        </div>
        {trades.map(tr => (
          <div key={tr.id} style={{ display: 'grid', gridTemplateColumns: '70px 66px 1fr 70px 70px 70px 72px 1fr 30px', gap: '4px', marginBottom: '5px', alignItems: 'center' }}>
            <input value={tr.ticker} onChange={e => updTrade(tr.id, { ticker: e.target.value.toUpperCase() })} placeholder="TICK" style={{ ...inp, fontWeight: 900, letterSpacing: '2px', textAlign: 'center' }} />
            <select value={tr.type} onChange={e => updTrade(tr.id, { type: e.target.value as TradeRow['type'] })} style={{ ...iSm, padding: '7px 4px', fontSize: '10px', color: QD_TRADE_CLR[tr.type] || '#fff' }}>
              {TRADE_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
            <input value={tr.contract} onChange={e => updTrade(tr.id, { contract: e.target.value })} placeholder="6/27 $580C" style={{ ...inp, fontSize: '11px' }} />
            <input value={tr.entry} onChange={e => updTrade(tr.id, { entry: e.target.value })} placeholder="ENTRY" style={{ ...inp, textAlign: 'center' }} />
            <input value={tr.t1} onChange={e => updTrade(tr.id, { t1: e.target.value })} placeholder="T1" style={{ ...inp, textAlign: 'center' }} />
            <input value={tr.t2} onChange={e => updTrade(tr.id, { t2: e.target.value })} placeholder="T2" style={{ ...inp, textAlign: 'center' }} />
            <input value={tr.stop} onChange={e => updTrade(tr.id, { stop: e.target.value })} placeholder="STOP" style={{ ...inp, textAlign: 'center', color: '#FF3B3B' }} />
            <input value={tr.notes} onChange={e => updTrade(tr.id, { notes: e.target.value })} placeholder="Notes..." style={{ ...inp, fontSize: '11px' }} />
            <button onClick={() => delTrade(tr.id)} style={{ ...rmBtn, padding: '5px 6px', cursor: 'pointer', fontSize: '11px' }}>✕</button>
          </div>
        ))}
      </div>

      {/* Key Levels */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '4px', color: accent, fontWeight: 900 }}>KEY LEVELS</div>
          <button onClick={() => save({ keyLevels: [...quick.keyLevels, { price: '', tag: 'KEY', note: '' }] })} style={{ ...ghostBtn(accent), padding: '3px 10px', fontSize: '10px', letterSpacing: '2px', cursor: 'pointer' }}>+ ADD</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '75px 100px 1fr 30px', gap: '4px 6px', alignItems: 'center', marginBottom: '4px' }}>
          {['PRICE', 'TAG', 'NOTE', ''].map(h => <div key={h} style={{ fontSize: '8px', color: '#FFFFFF', letterSpacing: '2px' }}>{h}</div>)}
        </div>
        {quick.keyLevels.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '75px 100px 1fr 30px', gap: '4px 6px', marginBottom: '4px', alignItems: 'center' }}>
            <input value={l.price} onChange={e => updLvl(i, 'price', e.target.value)} placeholder="5,612" style={{ ...inp, textAlign: 'right', fontWeight: 700 }} />
            <select value={l.tag} onChange={e => updLvl(i, 'tag', e.target.value)} style={{ ...iSm, padding: '7px 8px', fontSize: '10px', letterSpacing: '2px' }}>
              {LEVEL_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={l.note} onChange={e => updLvl(i, 'note', e.target.value)} placeholder="Note..." style={inp} />
            <button onClick={() => save({ keyLevels: quick.keyLevels.filter((_, j) => j !== i) })} style={{ ...rmBtn, padding: '5px 7px', fontSize: '13px', cursor: 'pointer' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )

  // â”€â”€ VIEW MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hasAnyContent = quick.headline || quick.summary || focusItems.some(f => f.ticker) || trades.some(t => t.ticker) || quick.marketData.some(d => d.value) || quick.bullets.some(b => b.text)
  if (!hasAnyContent) return (
    <div style={{ padding: '52px 0', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px', justifyContent: 'center' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,107,0,0.2)' }} />
        <span style={{ fontSize: '10px', letterSpacing: '5px', color: '#FF8C00', fontFamily: 'monospace', fontWeight: 900 }}>NO BRIEF PUBLISHED</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,107,0,0.2)' }} />
      </div>
      <div style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '3px', fontFamily: 'monospace' }}>
        SWITCH TO EDIT MODE TO CREATE A BRIEF
      </div>
    </div>
  )

  const activeMktData = quick.marketData.filter(d => d.value)

  // â”€â”€ Section blocks â”€â”€
  const mastheadEl = (
    <div style={{ borderBottom: `2px solid ${accent}`, paddingBottom: '10px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: '9px', letterSpacing: '5px', color: accent, fontWeight: 900, marginBottom: '4px' }}>EFI CAPITAL · MARKET INTELLIGENCE</div>
        <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '5px', color: accent }}>{modeLabel}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '10px', color: '#FFFFFF', letterSpacing: '2px' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
        </div>
        {quick.updatedAt && <div style={{ fontSize: '9px', color: '#E0E6F0', letterSpacing: '1px', marginTop: '2px' }}>UPDATED {fmtTs(quick.updatedAt).toUpperCase()}</div>}
      </div>
    </div>
  )

  const headlineEl = quick.headline ? (
    <div style={{ paddingBottom: '4px' }}>
      <div style={{ fontSize: '9px', letterSpacing: '4px', color: '#FFFFFF', marginBottom: '6px', fontWeight: 900 }}>HEADLINE</div>
      <div style={{ fontSize: '17px', fontWeight: 600, color: '#FFFFFF', fontFamily: '"Times New Roman", Georgia, serif', lineHeight: 1.45 }}>{quick.headline}</div>
    </div>
  ) : null

  const summaryEl = quick.summary ? (
    <div>
      <div style={{ fontSize: '9px', letterSpacing: '4px', color: '#FFFFFF', marginBottom: '8px', fontWeight: 900 }}>MARKET OVERVIEW</div>
      <div style={{ fontSize: '13px', color: '#D8E0EC', fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.75 }}>{quick.summary}</div>
    </div>
  ) : null

  const snapshotEl = activeMktData.length > 0 ? (
    <div>
      <div style={{ fontSize: '9px', letterSpacing: '4px', color: '#FFFFFF', marginBottom: '8px', fontWeight: 900 }}>MARKET SNAPSHOT</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(activeMktData.length, 6)}, 1fr)`, border: '1px solid rgba(255,255,255,0.07)' }}>
        {activeMktData.map((d, i) => (
          <div key={i} style={{ padding: '10px', borderRight: i < activeMktData.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none', borderTop: `2px solid ${d.up ? '#00D68F' : '#FF3B3B'}` }}>
            <div style={{ fontSize: '8px', letterSpacing: '2px', color: '#FFFFFF', marginBottom: '5px', fontWeight: 700 }}>{d.label}</div>
            <div style={{ fontSize: '13px', fontWeight: 900, color: '#FFFFFF', marginBottom: '3px' }}>{d.value}</div>
            {d.change && <div style={{ fontSize: '11px', fontWeight: 700, color: d.up ? '#00D68F' : '#FF3B3B' }}>{d.change}</div>}
          </div>
        ))}
      </div>
    </div>
  ) : null

  const focusEl = focusItems.some(f => f.ticker) ? (
    <div>
      {secLabel('TOP FOCUS',
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#FF6600" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="4" stroke="#FF6600" strokeWidth="1.5" />
          <line x1="12" y1="3" x2="12" y2="7" stroke="#FF6600" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="17" x2="12" y2="21" stroke="#FF6600" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="3" y1="12" x2="7" y2="12" stroke="#FF6600" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="17" y1="12" x2="21" y2="12" stroke="#FF6600" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      {focusItems.filter(f => f.ticker).map((fi) => {
        const dc = QD_COLOR[fi.direction] || '#9AAAB8'
        return (
          <div key={fi.id} style={{ marginBottom: '18px', borderLeft: `3px solid ${dc}`, paddingLeft: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {renderDirIcon(fi.direction, 20)}
              <span style={{ fontSize: '16px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '3px', fontFamily: 'monospace' }}>{fi.ticker}</span>
              <span style={{ fontSize: '8px', fontWeight: 900, color: dc, letterSpacing: '2px', padding: '2px 7px', border: `1px solid ${dc}44`, background: `${dc}0D`, fontFamily: 'monospace' }}>{QD_LABEL[fi.direction] || fi.direction.toUpperCase()}</span>
            </div>
            {fi.bullets.filter(b => b.trim()).map((b, bi) => (
              <div key={bi} style={{ display: 'flex', gap: '8px', marginBottom: '5px' }}>
                <span style={{ color: dc, fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>•</span>
                <span style={{ fontSize: '13px', color: '#D8E0EC', lineHeight: 1.65, fontFamily: 'Georgia, serif' }}>{b}</span>
              </div>
            ))}
            {fi.trade && (
              <div style={{ marginTop: '9px', padding: '7px 12px', background: `${dc}0F`, border: `1px solid ${dc}28`, borderRadius: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 900, color: dc, fontFamily: 'monospace', letterSpacing: '1px' }}>{fi.trade}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  ) : null

  // Legacy bullets (shown only when no focus items, backward compat)
  const legacyBulletsEl = quick.bullets.some(b => b.text) && focusItems.length === 0 ? (
    <div>
      <div style={{ fontSize: '9px', letterSpacing: '4px', color: '#FFFFFF', marginBottom: '8px', fontWeight: 900 }}>KEY INSIGHTS</div>
      <div style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        {quick.bullets.filter(b => b.text).map((b, i, arr) => {
          const col = BULLET_COLORS[b.category] || BULLET_COLORS.NOTE
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ padding: '10px', background: `${col}0A`, borderRight: `1px solid ${col}1A`, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: 900, color: col, letterSpacing: '2px' }}>{b.category}</span>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#E8EDF2', lineHeight: 1.55 }}>{b.text}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  ) : null

  const tradesEl = trades.some(t => t.ticker) ? (
    <div>
      {secLabel('TRADE SETUPS',
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="18" height="14" rx="1" stroke={accent} strokeWidth="1.5" />
          <line x1="3" y1="9" x2="21" y2="9" stroke={accent} strokeWidth="1.2" />
          <line x1="9" y1="9" x2="9" y2="19" stroke={accent} strokeWidth="1.2" />
        </svg>
      )}
      <div style={{ border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 58px 1fr 72px 72px 72px 72px', background: '#0A0A0A', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '6px 10px', gap: '6px' }}>
          {['TICKER', 'TYPE', 'CONTRACT', 'ENTRY', 'T1', 'T2', 'STOP'].map(h => (
            <div key={h} style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{h}</div>
          ))}
        </div>
        {trades.filter(t => t.ticker).map((tr) => {
          const tc = QD_TRADE_CLR[tr.type] || '#FFD700'
          return (
            <div key={tr.id}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 58px 1fr 72px 72px 72px 72px', padding: '10px', gap: '6px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `3px solid ${tc}`, alignItems: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '1px' }}>{tr.ticker}</div>
                <div style={{ fontSize: '9px', fontWeight: 900, color: tc, letterSpacing: '1px', padding: '2px 4px', border: `1px solid ${tc}44`, background: `${tc}0F`, textAlign: 'center' }}>{tr.type.toUpperCase()}</div>
                <div style={{ fontSize: '12px', color: '#E8EDF2', fontFamily: 'monospace', fontWeight: 600 }}>{tr.contract}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontFamily: 'monospace' }}>{tr.entry}</div>
                <div style={{ fontSize: '12px', color: '#00D68F', fontWeight: 700, textAlign: 'center', fontFamily: 'monospace' }}>{tr.t1}</div>
                <div style={{ fontSize: '12px', color: '#00D68F', fontWeight: 700, textAlign: 'center', fontFamily: 'monospace' }}>{tr.t2}</div>
                <div style={{ fontSize: '12px', color: '#FF3B3B', fontWeight: 700, textAlign: 'center', fontFamily: 'monospace' }}>{tr.stop}</div>
              </div>
              {tr.notes && (
                <div style={{ padding: '5px 14px 8px', background: '#030303', borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: `3px solid ${tc}44` }}>
                  <span style={{ fontSize: '11px', color: '#FFFFFF', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{tr.notes}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  ) : null

  const levelsEl = quick.keyLevels.some(l => l.price) ? (
    <div>
      {secLabel('KEY LEVELS',
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <line x1="3" y1="6" x2="21" y2="6" stroke="#9AAAB8" strokeWidth="1.5" strokeDasharray="3 2" />
          <line x1="3" y1="12" x2="21" y2="12" stroke="#FF6600" strokeWidth="1.5" />
          <line x1="3" y1="18" x2="21" y2="18" stroke="#9AAAB8" strokeWidth="1.5" strokeDasharray="3 2" />
          <circle cx="12" cy="12" r="2.5" fill="#FF6600" />
        </svg>
      )}
      <div style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 1fr', padding: '5px 10px', background: '#060606', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['PRICE', 'TAG', 'NOTE'].map(h => <span key={h} style={{ fontSize: '8px', letterSpacing: '2px', color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{h}</span>)}
        </div>
        {quick.keyLevels.filter(l => l.price).map((l, i, arr) => {
          const col = LEVEL_TAG_COLORS[l.tag] || accent
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 100px 1fr', padding: '9px 10px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', borderLeft: `3px solid ${col}` }}>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '0.5px', fontFamily: 'monospace' }}>{l.price}</div>
              <div><span style={{ fontSize: '9px', fontWeight: 900, color: col, letterSpacing: '2px', padding: '1px 5px', border: `1px solid ${col}30`, background: `${col}0D`, fontFamily: 'monospace' }}>{l.tag}</span></div>
              <div style={{ fontSize: '11px', color: '#FFFFFF', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{l.note}</div>
            </div>
          )
        })}
      </div>
    </div>
  ) : null

  // â”€â”€ Double column â”€â”€
  if (isDouble) return (
    <div style={{ display: 'grid', gridTemplateColumns: '58% 1fr', gap: '28px', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {mastheadEl}{headlineEl}{summaryEl}{snapshotEl}{focusEl}{legacyBulletsEl}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {tradesEl}{levelsEl}
      </div>
    </div>
  )

  // â”€â”€ Single column â”€â”€
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {mastheadEl}{headlineEl}{summaryEl}{snapshotEl}{focusEl}{legacyBulletsEl}{tradesEl}{levelsEl}
      {quick.updatedAt && (
        <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '8px', color: '#E0E6F0', letterSpacing: '2px' }}>END OF BRIEF · EFI CAPITAL</span>
        </div>
      )}
    </div>
  )
}

// ── BriefSection ─────────────────────────────────────────────────────────────
function BriefSection({
  data,
  persist,
  editMode,
}: {
  data: InsightData
  persist: (d: InsightData) => void
  editMode: boolean
}) {
  const brief = data.brief
  const blocks = brief.blocks || []
  const theme = (brief.theme ?? 'goldman') as BriefTheme
  const accent = BRIEF_THEMES[theme] || BRIEF_THEMES.goldman

  const save = (updates: Partial<Brief>) =>
    persist({ ...data, brief: { ...brief, ...updates, updatedAt: nowTs() } as Brief })

  const applyLayout = (name: string) =>
    save({ blocks: (BRIEF_LAYOUT_TEMPLATES[name] || []).map((b) => ({ ...b, id: uid() })) })

  const updateBlock = (id: string, upd: Partial<BriefBlock>) =>
    save({ blocks: blocks.map((b) => (b.id === id ? { ...b, ...upd } : b)) })

  const deleteBlock = (id: string) => save({ blocks: blocks.filter((b) => b.id !== id) })

  const moveBlock = (id: string, dir: -1 | 1) => {
    const arr = [...blocks]
    const i = arr.findIndex((b) => b.id === id)
    const j = i + dir
    if (j < 0 || j >= arr.length) return
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    save({ blocks: arr })
  }

  const addBlock = (type: BriefBlockType) => {
    const base: BriefBlock = { id: uid(), type }
    if (type === 'metrics') {
      base.content = 'zones'
      base.items = [
        { label: 'BULLISH', value: '', delta: 'bull' },
        { label: 'CHOP', value: '', delta: 'chop' },
        { label: 'BEARISH', value: '', delta: 'bear' },
      ]
    } else if (type === 'image') {
      base.url = ''
      base.caption = ''
    } else {
      base.content = ''
    }
    save({ blocks: [...blocks, base] })
  }

  const BLOCK_TYPE_LIST: { type: BriefBlockType; label: string }[] = [
    { type: 'intro', label: 'INTRO PARAGRAPH' },
    { type: 'body', label: 'BODY PARAGRAPH' },
    { type: 'conclusion', label: 'CONCLUSION' },
    { type: 'chart', label: 'CHART' },
    { type: 'seasonality', label: 'SEASONALITY' },
    { type: 'flow', label: 'FLOW' },
    { type: 'metrics', label: 'OPTIONS TRADES' },
    { type: 'image', label: 'IMAGE' },
  ]

  return (
    <div>
      {blocks.length === 0 && !editMode ? (
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px', justifyContent: 'center' }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,107,0,0.2)' }} />
            <span style={{ fontSize: '9px', letterSpacing: '5px', color: 'rgba(255,107,0,0.6)', fontFamily: 'monospace', fontWeight: 900 }}>NO WIRE PUBLISHED</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,107,0,0.2)' }} />
          </div>
          <div style={{ fontSize: '12px', color: '#FFFFFF', letterSpacing: '3px', fontFamily: 'monospace' }}>
            Open Options menu · Enable Edit Mode · Select a layout
          </div>
        </div>
      ) : editMode ? (
        <div>
          {blocks.map((block, idx) => {
            const isFirst = idx === 0,
              isLast = idx === blocks.length - 1
            return (
              <div key={block.id} style={{ border: `1px solid ${accent}30`, marginBottom: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: '#0A0A0A',
                    borderBottom: `1px solid ${accent}25`,
                  }}
                >
                  <select
                    value={block.type}
                    onChange={(e) =>
                      updateBlock(block.id, { type: e.target.value as BriefBlockType })
                    }
                    style={{ ...iSm, padding: '4px 10px', fontSize: '17px', letterSpacing: '2px' }}
                  >
                    {BLOCK_TYPE_LIST.map(({ type, label }) => (
                      <option key={type} value={type}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => moveBlock(block.id, -1)}
                      disabled={isFirst}
                      style={{
                        ...ghostBtn(accent),
                        opacity: isFirst ? 0.2 : 1,
                        padding: '4px 12px',
                        fontSize: '17px',
                        cursor: 'pointer',
                      }}
                    >
                      â†‘
                    </button>
                    <button
                      onClick={() => moveBlock(block.id, 1)}
                      disabled={isLast}
                      style={{
                        ...ghostBtn(accent),
                        opacity: isLast ? 0.2 : 1,
                        padding: '4px 12px',
                        fontSize: '17px',
                        cursor: 'pointer',
                      }}
                    >
                      â†“
                    </button>
                    <button
                      onClick={() => deleteBlock(block.id)}
                      style={{ ...rmBtn, padding: '4px 12px', fontSize: '17px', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div style={{ padding: '12px', background: '#050505' }}>
                  {(block.type === 'intro' ||
                    block.type === 'conclusion' ||
                    block.type === 'body') && (
                      <RichBodyEditor block={block} updateBlock={updateBlock} />
                    )}
                  {block.type === 'flow' && (
                    <FlowBlockEdit block={block} updateBlock={updateBlock} />
                  )}
                  {block.type === 'chart' && (
                    <ChartBlockEdit block={block} updateBlock={updateBlock} />
                  )}
                  {block.type === 'seasonality' && (
                    <SeasonalityBlockEdit block={block} updateBlock={updateBlock} />
                  )}
                  {block.type === 'metrics' && (
                    <MetricsBlockEdit block={block} updateBlock={updateBlock} />
                  )}
                  {block.type === 'image' && (
                    <ImageBlockEdit block={block} updateBlock={updateBlock} />
                  )}
                </div>
              </div>
            )
          })}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              paddingTop: '10px',
              borderTop: `1px solid ${accent}30`,
            }}
          >
            {BLOCK_TYPE_LIST.map(({ type, label }) => (
              <button
                key={type}
                onClick={() => addBlock(type)}
                style={{
                  ...ghostBtn(accent),
                  padding: '8px 14px',
                  fontSize: '17px',
                  letterSpacing: '2px',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ width: '100%' }}>
          {/* Edition stamp */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            marginBottom: '24px', paddingBottom: '12px',
            borderBottom: `2px solid ${accent}`,
          }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,107,0,0.2)' }} />
            <span style={{
              fontSize: '9px', fontWeight: 900, letterSpacing: '4px', color: '#FF8C00', fontFamily: 'monospace',
              padding: '3px 10px',
              border: `1px solid rgba(255,140,0,0.3)`,
            }}>
              MARKET BRIEF · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,107,0,0.2)' }} />
          </div>
          {blocks.map((block) => (
            <div key={block.id}>{viewBriefBlock(block, accent, editMode)}</div>
          ))}
          {/* End-of-wire mark */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            marginTop: '32px', paddingTop: '16px',
            borderTop: `1px solid rgba(255,255,255,0.06)`,
          }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
            <span style={{
              fontSize: '9px', letterSpacing: '4px', color: '#FFFFFF',
              fontFamily: 'monospace',
            }}>END OF WIRE · EFI CAPITAL</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
          </div>
        </div>
      )}
    </div>
  )
}

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function InsightPanel({ onClose }: { onClose: () => void }) {
  const [editMode, setEditMode] = useState(false)
  const [activeTab, setActiveTab] = useState<'pulse' | 'brief'>('pulse')
  const [data, setData] = useState<InsightData>(emptyData)
  const [quickData, setQuickData] = useState<QuickBrief>(emptyQuick)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<SavedReport[]>([])
  const [savedToast, setSavedToast] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)

  useEffect(() => {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) setData(JSON.parse(s)) } catch { }
    try { const h = localStorage.getItem(HISTORY_KEY); if (h) setHistory(JSON.parse(h)) } catch { }
    try { const q = localStorage.getItem(QUICK_KEY); if (q) setQuickData(JSON.parse(q)) } catch { }
  }, [])

  const persist = (next: InsightData) => {
    setData(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { }
  }

  const persistQuick = (next: QuickBrief) => {
    setQuickData(next)
    try { localStorage.setItem(QUICK_KEY, JSON.stringify(next)) } catch { }
  }

  const saveReport = () => {
    const title = data.reportTitle?.trim() || fmtTs(nowTs()) + ' Snapshot'
    const report: SavedReport = { id: uid(), title, savedAt: nowTs(), snapshot: data }
    setHistory((prev) => {
      const next = [report, ...prev].slice(0, 50)
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { }
      return next
    })
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 2500)
  }

  const loadReport = (report: SavedReport) => {
    persist(report.snapshot)
    setHistoryOpen(false)
  }

  const deleteReport = (id: string) => {
    const next = history.filter((r) => r.id !== id)
    setHistory(next)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    } catch { }
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: GS.bg,
        fontFamily: 'monospace',
        color: GS.white,
        position: 'relative',
      }}
    >
      {/* â”€â”€ Wire masthead top rules â”€â”€ */}
      <div style={{ height: '3px', background: '#FF6B00', flexShrink: 0 }} />
      <div style={{ height: '1px', background: 'rgba(255,107,0,0.25)', flexShrink: 0 }} />

      {/* â”€â”€ Header â”€â”€ */}
      <div style={{
        padding: '10px 18px',
        flexShrink: 0,
        background: '#050505',
        borderBottom: '1px solid rgba(255,107,0,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px' }}>
            <div style={{
              fontSize: '9px', fontWeight: 900, letterSpacing: '5px',
              color: 'rgba(255,107,0,0.7)', fontFamily: 'monospace',
            }}>EFI CAPITAL</div>
            <div style={{
              fontSize: '17px', fontWeight: 900, letterSpacing: '4px',
              color: '#FF6B00', fontFamily: 'monospace', lineHeight: 1,
            }}>MARKET INSIGHT</div>
          </div>
          <div style={{
            width: '1px', height: '28px',
            background: 'linear-gradient(180deg, transparent, rgba(255,107,0,0.3), transparent)',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{
              fontSize: '11px', color: 'rgba(255,255,255,0.5)',
              letterSpacing: '3px', fontWeight: 600, fontFamily: 'monospace',
            }}>
              INTELLIGENCE WIRE
            </span>
            {editMode ? (
              <input
                value={data.reportTitle || ''}
                onChange={(e) => persist({ ...data, reportTitle: e.target.value })}
                placeholder="e.g. March 22nd Weekly Snapshot"
                style={{
                  ...iBase,
                  fontSize: '13px',
                  padding: '4px 10px',
                  color: '#FFE000',
                  letterSpacing: '1.5px',
                  width: '280px',
                  fontWeight: '700',
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: '13px',
                  color: '#FFE000',
                  letterSpacing: '2px',
                  fontWeight: '800',
                  minHeight: '18px',
                }}
              >
                {data.reportTitle || 'No title â€” enter in Edit Mode'}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Single OPTIONS dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setOptionsOpen((o) => !o)}
              style={{
                background: optionsOpen ? 'rgba(255,100,0,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${optionsOpen ? 'rgba(255,100,0,0.6)' : '#FFFFFF'}`,
                color: '#FF6400',
                padding: '7px',
                cursor: 'pointer',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF6400">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
            {optionsOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: '#0f0f0f',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  zIndex: 99999,
                  minWidth: '180px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                }}
              >
                <button
                  onClick={() => { setHistoryOpen((h) => !h); setOptionsOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    background: 'transparent',
                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    color: '#FFFFFF',
                    padding: '11px 16px', fontSize: '13px', fontWeight: '700',
                    letterSpacing: '1.5px', cursor: 'pointer', fontFamily: 'monospace',
                    textAlign: 'left', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  â± HISTORICAL
                </button>
                <button
                  onClick={() => { saveReport(); setOptionsOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    background: 'transparent',
                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    color: '#22C55E',
                    padding: '11px 16px', fontSize: '13px', fontWeight: '700',
                    letterSpacing: '1.5px', cursor: 'pointer', fontFamily: 'monospace',
                    textAlign: 'left', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {savedToast ? 'âœ… SAVED!' : 'âœ¦ SAVE REPORT'}
                </button>
                <button
                  onClick={() => { setEditMode((e) => !e); setOptionsOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: '#06B6D4',
                    padding: '11px 16px', fontSize: '13px', fontWeight: '700',
                    letterSpacing: '1.5px', cursor: 'pointer', fontFamily: 'monospace',
                    textAlign: 'left', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(6,182,212,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {editMode ? 'â— EDITING' : 'âœŽ EDIT MODE'}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #FFFFFF',
              color: '#F1F5F9',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1,
              padding: '6px 10px',
              borderRadius: '4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* â”€â”€ Tab bar â”€â”€ */}
      <div style={{
        display: 'flex', flexShrink: 0,
        background: '#030303',
        borderBottom: '1px solid rgba(255,107,0,0.12)',
      }}>
        {([
          { id: 'pulse', label: 'QUICK PULSE', sub: 'DAILY · WEEKLY · MONTHLY' },
          { id: 'brief', label: 'DEEP BRIEF', sub: 'BLOCK BUILDER' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: 1, padding: '9px 12px', cursor: 'pointer',
            background: 'transparent', border: 'none',
            borderBottom: activeTab === t.id ? `2px solid #FF6B00` : '2px solid transparent',
            borderRight: '1px solid rgba(255,107,0,0.1)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
          }}>
            <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '3px', color: activeTab === t.id ? '#FF6B00' : 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>{t.label}</span>
            <span style={{ fontSize: '8px', letterSpacing: '2px', color: activeTab === t.id ? '#FF8C00' : 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>{t.sub}</span>
          </button>
        ))}
      </div>

      {/* â”€â”€ Content â”€â”€ */}
      <AccentCtx.Provider value={GS.gold}>
        <div style={{ flex: 1, overflowY: 'auto', background: '#000000', position: 'relative' }}>
          <div style={{ padding: '18px 28px' }}>
            {activeTab === 'pulse'
              ? <QuickSection quick={quickData} persist={persistQuick} editMode={editMode} accent={GS.gold} />
              : <BriefSection data={data} persist={persist} editMode={editMode} />
            }
          </div>
        </div>
      </AccentCtx.Provider>

      {/* â”€â”€ History Drawer â”€â”€ */}
      {historyOpen && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '360px',
            background: '#060606',
            borderLeft: '1px solid rgba(34,211,238,0.25)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            boxShadow: '-8px 0 40px rgba(0,0,0,0.9)',
          }}
        >
          <div
            style={{
              padding: '16px 18px',
              borderBottom: '1px solid rgba(34,211,238,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: '15px',
                color: '#22D3EE',
                letterSpacing: '3px',
                fontWeight: '700',
              }}
            >
              â± HISTORICAL REPORTS
            </span>
            <button
              onClick={() => setHistoryOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#9AAAB8',
                cursor: 'pointer',
                fontSize: '18px',
              }}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {history.length === 0 && (
              <div
                style={{
                  color: '#FFFFFF',
                  fontSize: '14px',
                  textAlign: 'center',
                  marginTop: '40px',
                  letterSpacing: '1px',
                }}
              >
                No saved reports yet.
                <br />
                Click âœ¦ SAVE REPORT to archive the current report.
              </div>
            )}
            {history.map((report) => (
              <div
                key={report.id}
                style={{
                  background: '#0a0a0a',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    fontSize: '14px',
                    color: '#FFFFFF',
                    fontWeight: '700',
                    marginBottom: '4px',
                    letterSpacing: '0.5px',
                  }}
                >
                  {report.title}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#9AAAB8',
                    marginBottom: '10px',
                    letterSpacing: '1px',
                  }}
                >
                  {fmtTs(report.savedAt)}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => loadReport(report)}
                    style={{
                      flex: 1,
                      background: 'rgba(34,211,238,0.08)',
                      border: '1px solid rgba(34,211,238,0.3)',
                      color: '#22D3EE',
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: '700',
                      letterSpacing: '1.5px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                    }}
                  >
                    LOAD
                  </button>
                  <button
                    onClick={() => deleteReport(report.id)}
                    style={{
                      background: 'rgba(255,45,85,0.07)',
                      border: '1px solid rgba(255,45,85,0.3)',
                      color: '#FF2D55',
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: '700',
                      letterSpacing: '1.5px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                    }}
                  >
                    DEL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* â”€â”€ Footer â”€â”€ */}
      <div style={{
        borderTop: '1px solid rgba(255,107,0,0.12)',
        padding: '6px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
        background: '#030303',
      }}>
        <span style={{ fontSize: '9px', color: '#E0E6F0', letterSpacing: '3px', fontFamily: 'monospace' }}>
          EFI CAPITAL · MARKET INTELLIGENCE · INTERNAL USE ONLY
        </span>
        {editMode && (
          <span style={{ fontSize: '9px', color: GS.amber, letterSpacing: '3px', fontWeight: 900, fontFamily: 'monospace' }}>
            â— LIVE EDIT
          </span>
        )}
      </div>
    </div>
  )
}
