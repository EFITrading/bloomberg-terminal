'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import dynamic from 'next/dynamic'

import SeasonalityChart from '@/components/analytics/SeasonalityChart'
import { calculateFlowGrade } from '@/lib/flowGrading'

const EFIPopupChart = dynamic(
  () => import('./EFICharting').then((m) => ({ default: m.TradePopupChart })),
  { ssr: false }
)
// ── Types ────────────────────────────────────────────────────────────────────
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

// ── Storage & helpers ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'efi_insight_v1'
const HISTORY_KEY = 'efi_insight_history_v1'

const emptyData: InsightData = {
  brief: { blocks: [], theme: 'goldman', updatedAt: '' },
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

// ── Design tokens — multi-layer premium palette ──────────────────────────────
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

// ── Shared inline styles — glossy premium ────────────────────────────────────
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
  boxShadow: '0 4px 16px rgba(212,168,67,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
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

// ── Draggable chart wrapper ────────────────────────────────────────────────────
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
              background: 'rgba(255,255,255,0.18)',
            }}
          />
        </div>
      )}
      {children}
    </div>
  )
}

// ── Accent theming context ────────────────────────────────────────────────────
const AccentCtx = React.createContext('#D4A843')
const useAccent = () => React.useContext(AccentCtx)

// ── Shared sub-components — premium ──────────────────────────────────────────
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

// ── Rich Body Editor ─────────────────────────────────────────────────────────
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
  // Self-contained undo/redo stack — never touches anything outside this editor
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
    border: bg === 'transparent' ? '1px dashed #555' : '1px solid rgba(255,255,255,0.18)',
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
            border: `1px solid ${colorMode === 'text' ? accent : 'rgba(255,255,255,0.2)'}`,
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
                c.v === 'transparent' ? '1px dashed #555' : '1px solid rgba(255,255,255,0.18)',
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
          ↩
        </button>
        <button
          style={btn()}
          title="Redo"
          onMouseDown={(e) => {
            e.preventDefault()
            redo()
          }}
        >
          ↪
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

// ── BRIEF ─ Block Layout Editor ─────────────────────────────────────────────────
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

const POLYGON_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

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
  // market close is 4:00 PM ET — derive correct UTC offset (EDT=-04:00, EST=-05:00)
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
      `https://api.polygon.io/v3/snapshot/options/${flow.underlying_ticker}/${optTicker}?apikey=${POLYGON_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.results?.last_quote) {
          const mid = ((data.results.last_quote.bid || 0) + (data.results.last_quote.ask || 0)) / 2
          if (mid > 0) setLiveOptPrice(mid)
        }
      })
      .catch(() => {})
    // Fetch live stock price (previous close snapshot)
    fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${normTicker}?apiKey=${POLYGON_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const price = data?.ticker?.day?.c || data?.ticker?.prevDay?.c
        if (price && price > 0) setLiveStockPrice(price)
      })
      .catch(() => {})
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
          FLOW — SELECT FROM TRACKER IN EDIT
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

  return (
    <div
      style={{
        marginBottom: '20px',
        borderRadius: '6px',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 40%, #050505 100%)',
        border: '1px solid #ff8800',
        boxShadow: '0 4px 16px rgba(0,0,0,0.8)',
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
            <tr style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '6px 4px', width: '15%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      background: 'linear-gradient(180deg, #1f2937, #000)',
                      color: '#ff8800',
                      fontWeight: 'bold',
                      padding: '3px 8px',
                      border: '1px solid #666',
                      fontSize: '22px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {flow.underlying_ticker}
                  </span>
                  <span
                    style={{
                      fontSize: '18px',
                      color: '#ffffff',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                    }}
                  >
                    {flowFmtTime(flow.trade_timestamp)}
                  </span>
                </div>
              </td>
              <td style={{ padding: '6px 4px', width: '15%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '22px',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    ${flow.strike}
                  </span>
                  <span
                    style={{
                      fontSize: '20px',
                      color: typeColor,
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                    }}
                  >
                    {flow.type?.toUpperCase()}
                  </span>
                </div>
              </td>
              <td style={{ padding: '6px 4px', width: '30%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '22px',
                        color: '#00ccff',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                      }}
                    >
                      {(flow.trade_size || 0).toLocaleString()}
                    </span>
                    <span
                      style={{
                        fontSize: '22px',
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
                          fontSize: '22px',
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
                      fontSize: '20px',
                      fontWeight: 'bold',
                      color: '#00ff44',
                      fontFamily: 'monospace',
                    }}
                  >
                    {flowFmtCurrency(flow.total_premium)}
                  </span>
                </div>
              </td>
              <td style={{ padding: '6px 4px', width: '20%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '20px',
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
                        fontSize: '20px',
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
              <td style={{ padding: '6px 4px', width: '20%' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {hasPnl ? (
                    <span
                      style={{
                        fontSize: '20px',
                        fontWeight: 'bold',
                        color: priceHigher ? '#00ff00' : '#ff0000',
                        fontFamily: 'monospace',
                      }}
                    >
                      {priceHigher ? '+' : ''}
                      {percentChange.toFixed(1)}%
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '20px',
                        color: '#ffffff',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                      }}
                    >
                      -
                    </span>
                  )}
                  {gradeResult.grade !== 'N/A' && (
                    <span
                      style={{
                        fontSize: '26px',
                        fontWeight: 900,
                        color: gradeResult.color,
                        textShadow: `0 0 8px ${gradeResult.color}`,
                        fontFamily: 'monospace',
                      }}
                    >
                      {gradeResult.grade}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {detailCells.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            padding: '8px 4px',
            borderTop: '1px solid #444',
          }}
        >
          {detailCells.map((item, idx) => (
            <div
              key={idx}
              style={{
                flex: '1 1 auto',
                minWidth: '70px',
                padding: '4px 8px',
                borderRight: idx < detailCells.length - 1 ? '1px solid #333' : 'none',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#ff8800',
                  letterSpacing: '1px',
                  marginBottom: '3px',
                  fontWeight: 700,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontSize: '16px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: item.color || '#ffffff',
                }}
              >
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
        <div
          style={{
            paddingBottom: '24px',
            marginBottom: '32px',
            borderBottom: `1px solid ${accent}30`,
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: `linear-gradient(90deg, ${accent}, ${accent}00)`,
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <span
              style={{
                fontSize: '18px',
                letterSpacing: '6px',
                color: accent,
                fontWeight: 900,
                fontFamily: 'monospace',
              }}
            >
              {block.logoText || 'EFI TRADING DESK'}
            </span>
          </div>
          <div
            style={{
              fontSize: '54px',
              fontWeight: 900,
              letterSpacing: '4px',
              lineHeight: 1.05,
              fontFamily: 'serif',
              background: `linear-gradient(135deg, #FFFFFF 20%, ${accent} 110%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {block.title || 'MARKET BRIEF'}
          </div>
          {block.subtitle && (
            <div
              style={{
                fontSize: '20px',
                color: accent,
                letterSpacing: '3px',
                marginTop: '10px',
                fontFamily: 'monospace',
              }}
            >
              {block.subtitle}
            </div>
          )}
        </div>
      )
    case 'intro':
      return (
        <div
          style={{ borderLeft: `6px solid ${accent}`, paddingLeft: '22px', marginBottom: '28px' }}
        >
          <div
            style={{
              color: GS.white,
              fontSize: '22px',
              lineHeight: '1.9',
              fontFamily: 'Georgia, serif',
            }}
            dangerouslySetInnerHTML={{ __html: block.content || '' }}
          />
        </div>
      )
    case 'body':
      return (
        <div style={{ marginBottom: '28px' }}>
          <div
            style={{
              color: GS.offWhite,
              fontSize: '19px',
              lineHeight: '2.1',
              fontFamily: 'Georgia, serif',
            }}
            dangerouslySetInnerHTML={{ __html: block.content || '' }}
          />
        </div>
      )
    case 'quote':
      return (
        <div
          style={{
            borderLeft: `8px solid ${accent}`,
            background: '#070707',
            padding: '22px 28px',
            marginBottom: '28px',
          }}
        >
          <pre
            style={{
              color: accent,
              fontSize: '22px',
              fontStyle: 'italic',
              lineHeight: '1.85',
              whiteSpace: 'pre-wrap',
              margin: 0,
              fontFamily: 'Georgia, serif',
            }}
          >{`\u201C${block.content}\u201D`}</pre>
        </div>
      )
    case 'conclusion':
      return (
        <div style={{ borderTop: `2px solid ${accent}`, paddingTop: '24px', marginBottom: '28px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 900,
              color: accent,
              letterSpacing: '6px',
              marginBottom: '14px',
              fontFamily: 'monospace',
            }}
          >
            CONCLUSION
          </div>
          <div
            style={{
              color: GS.white,
              fontSize: '22px',
              lineHeight: '1.9',
              fontFamily: 'Georgia, serif',
            }}
            dangerouslySetInnerHTML={{ __html: block.content || '' }}
          />
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
              {/* Year label top-right (view mode only — edit mode has year dropdown in controls) */}
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
            <div
              style={{
                width: '100%',
                height: '380px',
                border: `2px dashed ${accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#040404',
              }}
            >
              <span
                style={{
                  fontSize: '17px',
                  letterSpacing: '6px',
                  color: accent,
                  fontFamily: 'monospace',
                }}
              >
                SEASONALITY — ENTER TICKER IN EDIT
              </span>
            </div>
          )}
          {block.caption && (
            <div
              style={{
                fontSize: '17px',
                color: accent,
                letterSpacing: '2px',
                marginTop: '8px',
                fontFamily: 'monospace',
              }}
            >
              {block.caption}
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
            <div
              style={{
                width: '100%',
                height: '380px',
                border: `2px dashed ${accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#040404',
              }}
            >
              <span
                style={{
                  fontSize: '17px',
                  letterSpacing: '6px',
                  color: accent,
                  fontFamily: 'monospace',
                }}
              >
                CHART — ENTER TICKER IN EDIT
              </span>
            </div>
          )}
          {block.caption && (
            <div
              style={{
                fontSize: '17px',
                color: accent,
                letterSpacing: '2px',
                marginTop: '8px',
                fontFamily: 'monospace',
              }}
            >
              {block.caption}
            </div>
          )}
        </ChartDraggableWrapper>
      )
    }
    case 'image':
      return (
        <div style={{ marginBottom: '28px' }}>
          {block.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.url}
              alt={block.caption || ''}
              style={{ width: '100%', border: `1px solid ${accent}`, display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '280px',
                border: `2px dashed ${accent}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#040404',
              }}
            >
              <span
                style={{
                  fontSize: '17px',
                  letterSpacing: '6px',
                  color: accent,
                  fontFamily: 'monospace',
                }}
              >
                IMAGE — ADD URL IN EDIT MODE
              </span>
            </div>
          )}
          {block.caption && (
            <div
              style={{
                fontSize: '17px',
                color: accent,
                letterSpacing: '2px',
                marginTop: '8px',
                fontFamily: 'monospace',
              }}
            >
              {block.caption}
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
            value: items[0]?.value || '—',
            color: GS.green,
            bg: 'rgba(52,211,153,0.055)',
            glowColor: 'rgba(52,211,153,0.12)',
            Icon: BullishZoneIcon,
          },
          {
            label: 'CHOP',
            sub: 'ZONE',
            value: items[1]?.value || '—',
            color: GS.amber,
            bg: 'rgba(255,149,0,0.055)',
            glowColor: 'rgba(255,149,0,0.12)',
            Icon: ChopZoneIcon,
          },
          {
            label: 'BEARISH',
            sub: 'ZONE',
            value: items[2]?.value || '—',
            color: GS.red,
            bg: 'rgba(255,45,85,0.055)',
            glowColor: 'rgba(255,45,85,0.12)',
            Icon: BearishZoneIcon,
          },
        ]
        return (
          <div
            style={{
              marginBottom: '28px',
              borderRadius: '6px',
              overflow: 'hidden',
              border: `1px solid ${accent}20`,
              background: '#070707',
              boxShadow: `0 4px 24px rgba(0,0,0,0.5)`,
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 18px',
                background: `linear-gradient(90deg, ${accent}16 0%, transparent 80%)`,
                borderBottom: `1px solid ${accent}1A`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <span
                  style={{
                    fontSize: '30px',
                    fontWeight: 900,
                    letterSpacing: '6px',
                    fontFamily: 'monospace',
                    lineHeight: 1,
                    background:
                      'linear-gradient(180deg, #FFE57A 0%, #E8B84B 28%, #C9881C 55%, #F5D06A 78%, #A0660A 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 1px 6px rgba(212,168,67,0.55))',
                    textShadow: 'none',
                  }}
                >
                  {ticker || 'TICKER'}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '5px 11px',
                  border: `1px solid ${accent}33`,
                  borderRadius: '4px',
                  background: `${accent}0C`,
                }}
              >
                <LevelsGridIcon size={14} color={accent} />
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 900,
                    color: accent,
                    letterSpacing: '3px',
                    fontFamily: 'monospace',
                  }}
                >
                  3 ZONES
                </span>
              </div>
            </div>
            {/* Zone rows */}
            {zoneRows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  borderLeft: `4px solid ${r.color}`,
                  borderBottom: i < 2 ? `1px solid rgba(255,255,255,0.06)` : 'none',
                  background: r.bg,
                }}
              >
                {/* Icon + label column */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '14px 16px',
                    minWidth: '88px',
                    background: r.glowColor,
                    borderRight: `1px solid ${r.color}33`,
                  }}
                >
                  <r.Icon size={40} />
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 900,
                        color: r.color,
                        letterSpacing: '2px',
                        fontFamily: 'monospace',
                        lineHeight: 1,
                      }}
                    >
                      {r.label}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: r.color,
                        letterSpacing: '3px',
                        fontFamily: 'monospace',
                        marginTop: '3px',
                        opacity: 0.6,
                      }}
                    >
                      {r.sub}
                    </div>
                  </div>
                </div>
                {/* Value text */}
                <div
                  style={{ flex: 1, padding: '16px 20px', display: 'flex', alignItems: 'center' }}
                >
                  <span
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: '#E8EDF2',
                      fontFamily: 'monospace',
                      letterSpacing: '0.5px',
                      lineHeight: 1.6,
                    }}
                  >
                    {r.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      }
      if (mode === 'directional') {
        const bull = items[0]?.value || '—'
        const target = items[1]?.value || '—'
        const stop = items[2]?.value || '—'
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
          <div
            style={{
              marginBottom: '28px',
              borderRadius: '6px',
              overflow: 'hidden',
              border: `1px solid ${accent}20`,
              background: '#000000',
              boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
            }}
          >
            {/* Header — ticker + mode inline */}
            <div
              style={{
                padding: '12px 18px',
                background: `linear-gradient(90deg, rgba(34,211,153,0.08) 0%, rgba(59,130,246,0.06) 50%, rgba(255,45,85,0.08) 100%)`,
                borderBottom: `1px solid rgba(255,255,255,0.07)`,
                display: 'flex',
                alignItems: 'center',
                gap: '0',
              }}
            >
              <span
                style={{
                  fontSize: '26px',
                  fontWeight: 900,
                  letterSpacing: '5px',
                  fontFamily: 'monospace',
                  color: '#FFFFFF',
                  lineHeight: 1,
                }}
              >
                {ticker || 'TICKER'}
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 900,
                  letterSpacing: '4px',
                  fontFamily: 'monospace',
                  color: 'rgba(255,255,255,0.25)',
                  margin: '0 10px',
                  lineHeight: 1,
                }}
              >
                ·
              </span>
              <DirectionalBadgeIcon size={13} color="#22D3EE" />
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 900,
                  letterSpacing: '4px',
                  fontFamily: 'monospace',
                  color: '#22D3EE',
                  marginLeft: '6px',
                  lineHeight: 1,
                }}
              >
                DIRECTIONAL
              </span>
            </div>
            {/* Notes */}
            {note && (
              <div
                style={{
                  padding: '10px 18px',
                  borderBottom: `1px solid rgba(255,255,255,0.07)`,
                  fontSize: '17px',
                  color: '#FFFFFF',
                  letterSpacing: '0.5px',
                  fontFamily: 'monospace',
                  lineHeight: 1.7,
                }}
              >
                {note}
              </div>
            )}
            {/* Single row — 3 equal columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {dirRows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    borderLeft: i === 0 ? `4px solid ${r.color}` : 'none',
                    borderTop: `4px solid ${r.color}`,
                    borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    background: r.bg,
                    padding: '18px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <r.Icon size={28} />
                    <div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 900,
                          color: r.color,
                          letterSpacing: '2px',
                          fontFamily: 'monospace',
                          lineHeight: 1,
                        }}
                      >
                        {r.label}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: r.color,
                          letterSpacing: '3px',
                          fontFamily: 'monospace',
                          marginTop: '2px',
                          opacity: 0.55,
                        }}
                      >
                        {r.sub}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      fontFamily: 'monospace',
                      letterSpacing: '0.5px',
                      lineHeight: 1.5,
                    }}
                  >
                    {r.value}
                  </div>
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
      const callVal = items[0]?.value || '—'
      const callT = items[1]?.value || '—'
      const putVal = items[2]?.value || '—'
      const putT = items[3]?.value || '—'
      return (
        <div
          style={{
            marginBottom: '28px',
            borderRadius: '6px',
            overflow: 'hidden',
            border: `1px solid ${accent}20`,
            background: '#000000',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          }}
        >
          {/* Header — ticker + mode inline */}
          <div
            style={{
              padding: '12px 18px',
              background: `linear-gradient(90deg, rgba(52,211,153,0.07) 0%, rgba(0,0,0,0) 50%, rgba(255,45,85,0.07) 100%)`,
              borderBottom: `1px solid rgba(255,255,255,0.07)`,
              display: 'flex',
              alignItems: 'center',
              gap: '0',
            }}
          >
            <span
              style={{
                fontSize: '26px',
                fontWeight: 900,
                letterSpacing: '5px',
                fontFamily: 'monospace',
                color: '#FFFFFF',
                lineHeight: 1,
              }}
            >
              {ticker || 'TICKER'}
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 900,
                letterSpacing: '4px',
                fontFamily: 'monospace',
                color: 'rgba(255,255,255,0.25)',
                margin: '0 10px',
                lineHeight: 1,
              }}
            >
              ·
            </span>
            <LevelsGridIcon size={13} color="#22D3EE" />
            <span
              style={{
                fontSize: '12px',
                fontWeight: 900,
                letterSpacing: '4px',
                fontFamily: 'monospace',
                color: '#22D3EE',
                marginLeft: '6px',
                lineHeight: 1,
              }}
            >
              STRADDLE
            </span>
          </div>
          {/* Notes */}
          {note && (
            <div
              style={{
                padding: '10px 18px',
                borderBottom: `1px solid rgba(255,255,255,0.07)`,
                fontSize: '17px',
                color: '#FFFFFF',
                letterSpacing: '0.5px',
                fontFamily: 'monospace',
                lineHeight: 1.7,
              }}
            >
              {note}
            </div>
          )}
          {/* Call / Put columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {/* CALL */}
            <div
              style={{
                borderRight: '1px solid rgba(255,255,255,0.06)',
                borderLeft: `4px solid ${GS.green}`,
                background: 'rgba(52,211,153,0.055)',
                borderBottom: block.url ? `1px solid rgba(255,255,255,0.07)` : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 16px',
                  background: 'rgba(52,211,153,0.12)',
                  borderBottom: `1px solid ${GS.green}33`,
                }}
              >
                <CallIcon size={32} />
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: GS.green,
                    letterSpacing: '4px',
                    fontFamily: 'monospace',
                  }}
                >
                  CALL
                </span>
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '17px',
                    fontWeight: 900,
                    color: '#E8EDF2',
                    letterSpacing: '0.5px',
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                  }}
                >
                  {callVal}
                </div>
                {callT && callT !== '—' && (
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: GS.green,
                      letterSpacing: '2px',
                      fontFamily: 'monospace',
                    }}
                  >
                    TARGET: {callT}
                  </div>
                )}
              </div>
            </div>
            {/* PUT */}
            <div
              style={{
                borderLeft: `4px solid ${GS.red}`,
                background: 'rgba(255,45,85,0.055)',
                borderBottom: block.url ? `1px solid rgba(255,255,255,0.07)` : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 16px',
                  background: 'rgba(255,45,85,0.12)',
                  borderBottom: `1px solid ${GS.red}33`,
                }}
              >
                <PutIcon size={32} />
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 900,
                    color: GS.red,
                    letterSpacing: '4px',
                    fontFamily: 'monospace',
                  }}
                >
                  PUT
                </span>
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    fontSize: '17px',
                    fontWeight: 900,
                    color: '#E8EDF2',
                    letterSpacing: '0.5px',
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                  }}
                >
                  {putVal}
                </div>
                {putT && putT !== '—' && (
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: GS.red,
                      letterSpacing: '2px',
                      fontFamily: 'monospace',
                    }}
                  >
                    TARGET: {putT}
                  </div>
                )}
              </div>
            </div>
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
                background: '#050505',
              }}
            />
          )}
        </div>
      )
    }
    case 'divider':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
          <div style={{ flex: 1, height: '1px', background: accent }} />
          {block.content && (
            <span
              style={{
                fontSize: '18px',
                letterSpacing: '5px',
                color: accent,
                fontWeight: 900,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}
            >
              {block.content}
            </span>
          )}
          <div style={{ flex: 1, height: '1px', background: accent }} />
        </div>
      )
    default:
      return null
  }
}

// ── SVG Zone Icons ───────────────────────────────────────────────────────────
function BullishZoneIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ flexShrink: 0 }}>
      {/* Zone band — solid fill */}
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
      {/* Upper band — solid fill same as bullish/bearish rect */}
      <rect x="4" y="6" width="32" height="5" rx="2" fill="#FF9500" />
      {/* Lower band — solid fill same as bullish/bearish rect */}
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
      {/* Zone band — solid fill */}
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

// ── SVG Market Icons (animated, no emoji) ───────────────────────────────────
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

// ── Brief block editors ───────────────────────────────────────────────────────

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
      `https://api.polygon.io/v3/snapshot/options/${flow.underlying_ticker}/${optTicker}?apikey=${POLYGON_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.results?.last_quote) {
          const mid = ((data.results.last_quote.bid || 0) + (data.results.last_quote.ask || 0)) / 2
          if (mid > 0) setLiveOptPrice(mid)
        }
      })
      .catch(() => {})
    fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${normTicker}?apiKey=${POLYGON_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const price = data?.ticker?.day?.c || data?.ticker?.prevDay?.c
        if (price && price > 0) setLiveStockPrice(price)
      })
      .catch(() => {})
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
        NO FLOWS IN TRACKER — ADD FLOWS FROM THE LIVE FLOW PANEL FIRST
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
          {sweetOn ? '★' : '☆'} SWEET SPOT
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
        <span style={{ fontSize: '28px' }}>📋</span>
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
        📁 PICK FILE INSTEAD
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
            <span style={{ fontSize: '20px' }}>📋</span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                letterSpacing: '2px',
                color: imgFocused ? accent : '#888',
                fontWeight: 700,
              }}
            >
              {imgFocused ? 'PASTE NOW (CTRL+V)' : 'CLICK → CTRL+V  OR  DROP'}
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
            📁 PICK FILE
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
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div
            style={{
              fontSize: '25px',
              letterSpacing: '4px',
              color: GS.white,
              fontWeight: 900,
              fontFamily: 'monospace',
            }}
          >
            NO BRIEF PUBLISHED
          </div>
          <div
            style={{
              fontSize: '18px',
              letterSpacing: '2px',
              color: '#F1F5F9',
              marginTop: '10px',
              fontFamily: 'monospace',
            }}
          >
            ENABLE EDIT MODE AND PICK A LAYOUT
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
                      ↑
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
                      ↓
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
        <div>
          {blocks.map((block) => (
            <div key={block.id}>{viewBriefBlock(block, accent, editMode)}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InsightPanel({ onClose }: { onClose: () => void }) {
  const [editMode, setEditMode] = useState(false)
  const [data, setData] = useState<InsightData>(emptyData)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<SavedReport[]>([])
  const [savedToast, setSavedToast] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setData(JSON.parse(saved))
    } catch {}
    try {
      const hist = localStorage.getItem(HISTORY_KEY)
      if (hist) setHistory(JSON.parse(hist))
    } catch {}
  }, [])

  const persist = (next: InsightData) => {
    setData(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }

  const saveReport = () => {
    const title = data.reportTitle?.trim() || fmtTs(nowTs()) + ' Snapshot'
    const report: SavedReport = { id: uid(), title, savedAt: nowTs(), snapshot: data }
    setHistory((prev) => {
      const next = [report, ...prev].slice(0, 50)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {}
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
    } catch {}
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
      {/* ── Prismatic accent strip ── */}
      <div
        style={{
          height: '2px',
          flexShrink: 0,
          background:
            'linear-gradient(90deg, #D4A843 0%, #FF2D55 22%, #C084FC 44%, #22D3EE 66%, #34D399 88%, #D4A843 100%)',
        }}
      />

      {/* ── Header ── */}
      <div
        style={{
          padding: '14px 20px',
          flexShrink: 0,
          background: 'linear-gradient(135deg, #030303 0%, #000000 60%, #020202 100%)',
          borderBottom: '1px solid rgba(212,168,67,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow:
            'inset 0 2px 0 rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.95)',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
          <div style={{ padding: '8px 14px' }}>
            <div
              style={{
                fontSize: '18px',
                fontWeight: '900',
                letterSpacing: '5px',
                color: '#FF6B00',
                lineHeight: 1,
                marginBottom: '3px',
              }}
            >
              EFI CAPITAL
            </div>
            <div
              style={{
                fontSize: '26px',
                fontWeight: '900',
                letterSpacing: '5px',
                lineHeight: 1.1,
                color: '#FF6B00',
              }}
            >
              INSIGHT
            </div>
          </div>
          <div
            style={{
              width: '1px',
              height: '36px',
              background:
                'linear-gradient(180deg, transparent, rgba(212,168,67,0.35), transparent)',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span
              style={{
                fontSize: '18px',
                color: '#FFFFFF',
                letterSpacing: '3px',
                fontWeight: '600',
              }}
            >
              MARKET INTELLIGENCE HUB
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
                {data.reportTitle || 'No title — enter in Edit Mode'}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setHistoryOpen((h) => !h)}
            style={{
              background: historyOpen ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${historyOpen ? 'rgba(34,211,238,0.45)' : 'rgba(255,255,255,0.18)'}`,
              color: historyOpen ? '#22D3EE' : '#9AAAB8',
              padding: '8px 16px',
              fontSize: '15px',
              fontWeight: '700',
              letterSpacing: '2px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              borderRadius: '4px',
            }}
          >
            ⏱ HISTORICAL
          </button>
          <button
            onClick={saveReport}
            style={{
              background: savedToast ? 'rgba(52,211,153,0.25)' : 'rgba(52,211,153,0.07)',
              border: `1px solid ${savedToast ? '#34D399' : 'rgba(52,211,153,0.4)'}`,
              color: '#34D399',
              padding: '8px 16px',
              fontSize: '15px',
              fontWeight: '700',
              letterSpacing: '2px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              borderRadius: '4px',
              transition: 'all 0.2s',
            }}
          >
            {savedToast ? '✅ SAVED!' : '✦ SAVE REPORT'}
          </button>
          <button
            onClick={() => setEditMode((e) => !e)}
            style={{
              background: editMode
                ? 'linear-gradient(135deg, #E8B84B 0%, #C49A2E 100%)'
                : 'rgba(212,168,67,0.07)',
              border: `1px solid ${editMode ? 'rgba(255,200,80,0.55)' : 'rgba(212,168,67,0.25)'}`,
              color: editMode ? '#000' : GS.gold,
              padding: '8px 20px',
              fontSize: '17px',
              fontWeight: '900',
              letterSpacing: '2.5px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              borderRadius: '4px',
              boxShadow: editMode
                ? '0 0 18px rgba(212,168,67,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                : 'none',
              transition: 'all 0.2s',
            }}
          >
            {editMode ? '● EDITING' : 'EDIT MODE'}
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.18)',
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

      {/* ── Content ── */}
      <AccentCtx.Provider value={GS.gold}>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 18px',
            background: '#000000',
            position: 'relative',
          }}
        >
          <BriefSection data={data} persist={persist} editMode={editMode} />
        </div>
      </AccentCtx.Provider>

      {/* ── History Drawer ── */}
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
              ⏱ HISTORICAL REPORTS
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
                  color: 'rgba(255,255,255,0.25)',
                  fontSize: '14px',
                  textAlign: 'center',
                  marginTop: '40px',
                  letterSpacing: '1px',
                }}
              >
                No saved reports yet.
                <br />
                Click ✦ SAVE REPORT to archive the current report.
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

      {/* ── Footer ── */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.04)',
          padding: '8px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          background: 'linear-gradient(180deg, #020202 0%, #000000 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <span
          style={{ fontSize: '18px', color: '#9AAAB8', letterSpacing: '3px', fontWeight: '600' }}
        >
          EFI TRADING · INTERNAL USE
        </span>
        {editMode && (
          <span
            style={{ fontSize: '17px', color: GS.amber, letterSpacing: '2px', fontWeight: '900' }}
          >
            ● EDIT MODE ACTIVE — CHANGES SAVE AUTOMATICALLY
          </span>
        )}
      </div>
    </div>
  )
}
