'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption {
  value: string | number
  label: string
  hint?: string
  group?: string
  tag?: string
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

function useAnchoredMenu(open: boolean, onClose: () => void, align: 'left' | 'right' = 'left') {
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 0, maxHeight: 400 })

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 16
    const above = r.top - 16
    const openUp = below < 260 && above > below
    const maxHeight = Math.max(200, Math.min(520, openUp ? above : below))
    setPos({
      top: openUp ? Math.max(8, r.top - maxHeight - 6) : r.bottom + 6,
      left: align === 'left' ? r.left : r.right,
      minWidth: r.width,
      maxHeight,
    })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', onClose)
    }
  }, [open, onClose])

  return { btnRef, menuRef, pos }
}

const triggerStyle = (open: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
  background: open ? 'linear-gradient(180deg, #1d1710, #120e08)' : 'linear-gradient(180deg, #1a1c22, #0e0f13)',
  border: `1px solid ${open ? 'rgba(245,158,11,0.7)' : 'rgba(255,255,255,0.16)'}`,
  boxShadow: open ? '0 0 14px rgba(245,158,11,0.25)' : 'inset 0 1px 0 rgba(255,255,255,0.07)',
  color: '#ffffff', fontFamily: FONT, fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap',
})

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', marginLeft: 'auto' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)

export function ChainDropdown({
  label, value, options, onChange, disabled, minWidth = 200, renderValue,   height, fill, bare,
}: {
  bare?: boolean
  height?: number
  fill?: boolean
  label: string
  value: string | number
  options: DropdownOption[]
  onChange: (v: string) => void
  disabled?: boolean
  minWidth?: number
  renderValue?: (o: DropdownOption | undefined) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { btnRef, menuRef, pos } = useAnchoredMenu(open, () => setOpen(false))
  const current = options.find((o) => String(o.value) === String(value))

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'center' })
  }, [open, menuRef])

  let lastGroup: string | undefined

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{ ...triggerStyle(open), minWidth, opacity: disabled ? 0.6 : 1, ...(height ? { height } : {}), ...(fill ? { width: '100%' } : {}), ...(bare ? { background: 'transparent', border: 'none', boxShadow: 'none', padding: 0, fontSize: 15 } : {}) }}
      >
        {label && <span style={{ fontSize: 11, letterSpacing: '0.14em', color: '#f59e0b', fontWeight: 900 }}>{label}</span>}
        <span>{renderValue ? renderValue(current) : current?.label ?? 'Loading…'}</span>
        <Chevron open={open} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed', top: pos.top, left: pos.left, minWidth: Math.max(pos.minWidth, 260), maxHeight: pos.maxHeight,
              overflowY: 'auto', zIndex: 2147483647, borderRadius: 10, padding: 6, fontFamily: FONT,
              background: 'linear-gradient(180deg, #14161b, #08090c)', border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.6)',
            }}
          >
            {options.map((o) => {
              const showGroup = o.group && o.group !== lastGroup
              lastGroup = o.group
              const active = String(o.value) === String(value)
              return (
                <React.Fragment key={String(o.value)}>
                  {showGroup && (
                    <div style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', color: '#f59e0b' }}>
                      {o.group}
                    </div>
                  )}
                  <button
                    type="button"
                    data-active={active}
                    onClick={() => {
                      onChange(String(o.value))
                      setOpen(false)
                    }}
                    className="hover:bg-white/10"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', borderRadius: 6,
                      textAlign: 'left', color: '#ffffff', fontWeight: active ? 900 : 700, fontSize: 16,
                      background: active ? 'rgba(245,158,11,0.2)' : 'transparent',
                      boxShadow: active ? 'inset 3px 0 0 #f59e0b' : 'none',
                    }}
                  >
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{o.label}</span>
                    {o.tag && (
                      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', padding: '2px 6px', borderRadius: 4, background: '#f59e0b', color: '#000' }}>
                        {o.tag}
                      </span>
                    )}
                    {o.hint && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: '#38bdf8' }}>{o.hint}</span>}
                  </button>
                </React.Fragment>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}

export interface ColumnDef {
  key: string
  label: string
  color: string
}

export function ColumnFilter({
  columns, visible, onToggle, onAll, onNone,
}: {
  columns: ColumnDef[]
  visible: Record<string, boolean>
  onToggle: (key: string, on: boolean) => void
  onAll: () => void
  onNone: () => void
}) {
  const [open, setOpen] = useState(false)
  const { btnRef, menuRef, pos } = useAnchoredMenu(open, () => setOpen(false), 'right')
  const count = columns.filter((c) => visible[c.key]).length

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} style={triggerStyle(open)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        <span>Columns</span>
        <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 999, background: '#f59e0b', color: '#000', fontWeight: 900 }}>
          {count}/{columns.length}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed', top: pos.top, left: Math.max(8, pos.left - 320), width: 320, maxHeight: pos.maxHeight,
              overflowY: 'auto', zIndex: 2147483647, borderRadius: 12, padding: 14, fontFamily: FONT,
              background: 'linear-gradient(180deg, #14161b, #08090c)', border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.85)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.16em', color: '#f59e0b' }}>VISIBLE COLUMNS</span>
              <button onClick={onAll} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#fff', padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.1)' }}>All</button>
              <button onClick={onNone} style={{ marginLeft: 6, fontSize: 12, fontWeight: 800, color: '#fff', padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.1)' }}>None</button>
            </div>
            {columns.map((c) => {
              const on = !!visible[c.key]
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onToggle(c.key, !on)}
                  className="hover:bg-white/10"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '9px 8px', borderRadius: 8, color: '#fff', fontSize: 16, fontWeight: 700 }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
                  <span>{c.label}</span>
                  <span
                    style={{
                      marginLeft: 'auto', width: 40, height: 22, borderRadius: 999, position: 'relative', transition: 'background .15s',
                      background: on ? '#f59e0b' : '#2a2d35', border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  >
                    <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: 999, background: on ? '#000' : '#fff', transition: 'left .15s' }} />
                  </span>
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}
