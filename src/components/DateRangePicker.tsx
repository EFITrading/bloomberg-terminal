'use client'
import React, { useState, useEffect, useRef } from 'react'

interface Props {
    startDate: string   // YYYY-MM-DD or ''
    endDate: string     // YYYY-MM-DD or ''
    onStartChange: (d: string) => void
    onEndChange: (d: string) => void
    accentColor?: string
}

export default function DateRangePicker({ startDate, endDate, onStartChange, onEndChange, accentColor = '#ff8500' }: Props) {
    const today = new Date()
    const [viewYear, setViewYear] = useState(today.getFullYear())
    const [viewMonth, setViewMonth] = useState(today.getMonth())
    const [phase, setPhase] = useState<'start' | 'end'>('start')
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    // close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
    const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

    const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('en-US', { month: 'long' })

    // build calendar grid
    const firstDay = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells: (number | null)[] = Array(firstDay).fill(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)

    const fmt = (y: number, m: number, d: number) =>
        `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    const isToday = (d: number) => fmt(viewYear, viewMonth, d) === fmt(today.getFullYear(), today.getMonth(), d) && viewYear === today.getFullYear() && viewMonth === today.getMonth()
    const isStart = (d: number) => fmt(viewYear, viewMonth, d) === startDate
    const isEnd = (d: number) => fmt(viewYear, viewMonth, d) === endDate
    const inRange = (d: number) => {
        if (!startDate || !endDate) return false
        const s = fmt(viewYear, viewMonth, d)
        return s > startDate && s < endDate
    }

    const handleDayClick = (d: number) => {
        const ds = fmt(viewYear, viewMonth, d)
        if (phase === 'start') {
            onStartChange(ds)
            onEndChange('')
            setPhase('end')
        } else {
            if (ds < startDate) {
                // clicked before start — swap
                onEndChange(startDate)
                onStartChange(ds)
            } else {
                onEndChange(ds)
            }
            setPhase('start')
            setOpen(false)
        }
    }

    const clear = (e: React.MouseEvent) => {
        e.stopPropagation()
        onStartChange('')
        onEndChange('')
        setPhase('start')
    }

    const hasRange = startDate || endDate

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            {/* Trigger button */}
            <button
                onClick={() => { setOpen(o => !o); setPhase(startDate && !endDate ? 'end' : 'start') }}
                style={{
                    width: '100%', padding: '10px 12px', borderRadius: '9px',
                    border: `1px solid ${hasRange ? accentColor : 'rgba(255,255,255,0.12)'}`,
                    background: hasRange ? `${accentColor}12` : 'rgba(255,255,255,0.03)',
                    color: hasRange ? '#fff' : 'rgba(255,255,255,0.45)',
                    fontSize: '13px', fontWeight: 700, letterSpacing: '0.5px',
                    cursor: 'pointer', textAlign: 'left' as const,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'all 0.15s',
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: accentColor, fontSize: '14px' }}>📅</span>
                    {startDate && endDate
                        ? `${startDate} → ${endDate}`
                        : startDate
                            ? `From ${startDate} (pick end)`
                            : 'Select date range'}
                </span>
                {hasRange && (
                    <span onClick={clear} style={{ color: '#ef4444', fontSize: '12px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)' }}>✕</span>
                )}
            </button>

            {/* Calendar popup */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                    background: '#000', border: `1px solid ${accentColor}44`,
                    borderRadius: '12px', padding: '14px', zIndex: 999,
                    boxShadow: `0 8px 32px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.05)`,
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: accentColor, fontSize: '18px', cursor: 'pointer', padding: '2px 8px', borderRadius: '6px' }}>‹</button>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '16px', fontWeight: 800, color: '#fff', letterSpacing: '0.05em' }}>
                            {monthName} {viewYear}
                        </span>
                        <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: accentColor, fontSize: '18px', cursor: 'pointer', padding: '2px 8px', borderRadius: '6px' }}>›</button>
                    </div>

                    {/* Day headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '6px' }}>
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                            <div key={d} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 800, color: '#fff', padding: '3px 0', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono, monospace' }}>{d}</div>
                        ))}
                    </div>

                    {/* Day cells */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
                        {cells.map((d, i) => {
                            if (!d) return <div key={i} />
                            const s = isStart(d), e = isEnd(d), r = inRange(d)
                            return (
                                <button key={i} onClick={() => handleDayClick(d)}
                                    style={{
                                        padding: '7px 0', borderRadius: '7px', border: 'none', cursor: 'pointer',
                                        fontFamily: 'JetBrains Mono, monospace', fontSize: '14px', fontWeight: 700,
                                        background: r ? 'rgba(255,133,0,0.1)' : 'transparent',
                                        color: s || e ? '#ff8500' : '#fff',
                                        outline: 'none',
                                        transition: 'all 0.1s',
                                    }}
                                    onMouseEnter={e2 => { (e2.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
                                    onMouseLeave={e2 => { (e2.currentTarget as HTMLElement).style.background = r ? 'rgba(255,133,0,0.1)' : 'transparent' }}
                                >{d}</button>
                            )
                        })}
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px' }}>
                            {phase === 'start' ? 'click start date' : 'click end date'}
                        </span>
                        <button onClick={clear} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', fontSize: '12px', fontWeight: 800, cursor: 'pointer', letterSpacing: '1px', fontFamily: 'JetBrains Mono, monospace' }}>CLEAR</button>
                    </div>
                </div>
            )}
        </div>
    )
}
