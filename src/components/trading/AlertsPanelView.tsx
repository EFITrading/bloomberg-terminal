'use client'

import React from 'react'
import { TbBell, TbBellOff, TbCheck, TbMail, TbPlus, TbX } from 'react-icons/tb'

type AlertType = 'price' | 'options' | 'technical'

interface AlertItem {
  id: string | number
  type: AlertType
  symbol: string
  condition: string
  price: number
  message?: string
  triggered?: boolean
  once?: boolean
  soundEnabled?: boolean
  emailEnabled?: boolean
  optionsData?: { strike: number | string; optionType: string; expiration: string }
}

interface Props {
  alerts: AlertItem[]
  setAlerts: (next: any[]) => void
  isPlacementMode: boolean
  onTogglePlacement: () => void
  selectedType: AlertType
  onSelectType: (t: AlertType) => void
  onClose: () => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: () => void
}

const CONDITION_LABEL: Record<string, string> = {
  above: 'Above',
  below: 'Below',
  crossesAbove: 'Crosses above',
  crossesBelow: 'Crosses below',
}

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'
const TYPES: { id: AlertType; label: string }[] = [
  { id: 'price', label: 'Price' },
  { id: 'options', label: 'Options' },
  { id: 'technical', label: 'Technical' },
]

export default function AlertsPanelView({
  alerts, setAlerts, isPlacementMode, onTogglePlacement, selectedType, onSelectType, onClose, scrollRef, onScroll,
}: Props) {
  const active = alerts.filter((a) => !a.triggered)
  const triggered = alerts.filter((a) => a.triggered)
  const remove = (id: AlertItem['id']) => setAlerts(alerts.filter((a) => a.id !== id))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0b0e13', color: '#FFFFFF', fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 16px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.01em', color: '#FFFFFF' }}>Alerts</div>
          <div style={{ fontSize: '13px', color: '#B4BBC7', marginTop: '3px', fontVariantNumeric: 'tabular-nums' }}>
            {active.length} active <span style={{ margin: '0 6px', opacity: 0.5 }}>/</span> {triggered.length} triggered
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '8px', color: '#FFFFFF', cursor: 'pointer', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <TbX size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', padding: '0 22px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', gap: '22px' }}>
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectType(t.id)}
              style={{
                padding: '10px 0 12px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: FONT,
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${selectedType === t.id ? '#FFFFFF' : 'transparent'}`,
                marginBottom: '-1px',
                color: selectedType === t.id ? '#FFFFFF' : '#9AA3B2',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={onTogglePlacement}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '8px 14px',
            margin: '0 0 8px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '8px',
            cursor: 'pointer',
            fontFamily: FONT,
            whiteSpace: 'nowrap',
            background: isPlacementMode ? '#2563EB' : '#FFFFFF',
            color: isPlacementMode ? '#FFFFFF' : '#0b0e13',
            border: 'none',
          }}
        >
          {isPlacementMode ? <TbCheck size={15} /> : <TbPlus size={15} />}
          {isPlacementMode ? 'Click chart' : 'New alert'}
        </button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', overscrollBehavior: 'contain' }}>
        <SectionLabel>Active</SectionLabel>
        {active.length === 0 ? (
          <div style={{ padding: '40px 24px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', background: 'rgba(255,255,255,0.025)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', marginBottom: '16px' }}>
              <TbBellOff size={22} color="#FFFFFF" />
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF' }}>No active alerts</div>
            <div style={{ fontSize: '13px', color: '#B4BBC7', marginTop: '6px', lineHeight: 1.55, maxWidth: '260px' }}>
              Choose New alert, then click the chart at the level you want to be notified at.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden', background: 'rgba(255,255,255,0.025)' }}>
            {active.map((a, i) => (
              <div key={a.id} style={{ padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: '14px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>{a.symbol}</span>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: '#B4BBC7', textTransform: 'capitalize' }}>{a.type}</span>
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: 600, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                      ${a.price.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#B4BBC7', marginTop: '4px' }}>{CONDITION_LABEL[a.condition] ?? a.condition}</div>
                  {a.message && <div style={{ fontSize: '13px', color: '#FFFFFF', marginTop: '8px' }}>{a.message}</div>}
                  {a.optionsData && (
                    <div style={{ fontSize: '13px', color: '#FFFFFF', marginTop: '8px', fontVariantNumeric: 'tabular-nums' }}>
                      {a.optionsData.strike} {a.optionsData.optionType.toUpperCase()} · {a.optionsData.expiration}
                    </div>
                  )}
                  {(a.soundEnabled || a.emailEnabled || a.once) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', color: '#B4BBC7' }}>
                      {a.soundEnabled && <TbBell size={15} />}
                      {a.emailEnabled && <TbMail size={15} />}
                      {a.once && <Tag>Once</Tag>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => remove(a.id)}
                  aria-label="Delete alert"
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '8px', color: '#B4BBC7', cursor: 'pointer', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#B4BBC7'; e.currentTarget.style.background = 'transparent' }}
                >
                  <TbX size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {triggered.length > 0 && (
          <>
            <div style={{ height: '26px' }} />
            <SectionLabel>Triggered</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden', background: 'rgba(255,255,255,0.025)' }}>
              {triggered.slice(0, 5).map((a, i) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>
                  <TbCheck size={16} color="#22c55e" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>{a.symbol}</span>
                  <span style={{ fontSize: '14px', color: '#FFFFFF', flex: 1, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${a.price.toFixed(2)}</span>
                  <button onClick={() => remove(a.id)} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: '#B4BBC7', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                    <TbX size={15} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#B4BBC7', marginBottom: '10px' }}>{children}</div>
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.16)', color: '#FFFFFF' }}>
      {children}
    </span>
  )
}
