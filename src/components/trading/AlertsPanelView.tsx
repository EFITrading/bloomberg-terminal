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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#07090c', color: '#e5e7eb', fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <TbBell size={18} color="#9ca3af" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#f3f4f6' }}>Alerts</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>{active.length} active · {triggered.length} triggered</div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px', display: 'flex' }}
        >
          <TbX size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', flex: 1, background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '2px' }}>
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectType(t.id)}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontFamily: FONT,
                background: selectedType === t.id ? 'rgba(255,255,255,0.09)' : 'transparent',
                color: selectedType === t.id ? '#f3f4f6' : '#8b94a3',
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
            gap: '6px',
            padding: '7px 12px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: FONT,
            whiteSpace: 'nowrap',
            background: isPlacementMode ? '#2563eb' : 'transparent',
            color: isPlacementMode ? '#fff' : '#d1d5db',
            border: `1px solid ${isPlacementMode ? '#2563eb' : 'rgba(255,255,255,0.18)'}`,
          }}
        >
          {isPlacementMode ? <TbCheck size={14} /> : <TbPlus size={14} />}
          {isPlacementMode ? 'Click chart' : 'New alert'}
        </button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', overscrollBehavior: 'contain' }}>
        <SectionLabel>Active</SectionLabel>
        {active.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px' }}>
            <TbBellOff size={28} color="#4b5563" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af' }}>No active alerts</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Select “New alert”, then click the chart to set a price level.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {active.map((a) => (
              <div key={a.id} style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#f3f4f6' }}>{a.symbol}</span>
                    <Tag>{a.type}</Tag>
                    <span style={{ fontSize: '11px', color: '#8b94a3' }}>{CONDITION_LABEL[a.condition] ?? a.condition}</span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f3f4f6', marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
                    ${a.price.toFixed(2)}
                  </div>
                  {a.message && <div style={{ fontSize: '12px', color: '#8b94a3', marginTop: '4px' }}>{a.message}</div>}
                  {a.optionsData && (
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                      {a.optionsData.strike} {a.optionsData.optionType.toUpperCase()} · {a.optionsData.expiration}
                    </div>
                  )}
                  {(a.soundEnabled || a.emailEnabled || a.once) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: '#6b7280' }}>
                      {a.soundEnabled && <TbBell size={13} />}
                      {a.emailEnabled && <TbMail size={13} />}
                      {a.once && <Tag>Once</Tag>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => remove(a.id)}
                  aria-label="Delete alert"
                  style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '2px', display: 'flex' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                >
                  <TbX size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {triggered.length > 0 && (
          <>
            <div style={{ height: '18px' }} />
            <SectionLabel>Triggered</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {triggered.slice(0, 5).map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}>
                  <TbCheck size={15} color="#22c55e" />
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{a.symbol}</span>
                  <span style={{ fontSize: '12px', color: '#8b94a3', flex: 1 }}>${a.price.toFixed(2)}</span>
                  <button onClick={() => remove(a.id)} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', display: 'flex' }}>
                    <TbX size={14} />
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
  return <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '8px' }}>{children}</div>
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
      {children}
    </span>
  )
}
