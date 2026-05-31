'use client'

import React from 'react'

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
    calViewMode: 'monthly' | 'weekly'
    setCalViewMode: (v: 'monthly' | 'weekly') => void
    mobileDayIdx: number
    setMobileDayIdx: (v: number) => void
    weekDays: Date[]
    shiftWeek: (delta: number) => void
    month: number
    year: number
    setCalMonth: (fn: (m: { year: number; month: number }) => { year: number; month: number }) => void
    calView: 'events' | 'earnings'
    setCalView: (v: 'events' | 'earnings') => void
    weeklySubView: 'logos' | 'notable' | 'implied'
    setWeeklySubView: (v: 'logos' | 'notable' | 'implied') => void
    calSearchInput: string
    setCalSearchInput: (v: string) => void
    fetchCalSearchData: (sym: string) => void
    calSearchPopover?: React.ReactNode
    showFilterDropdown: boolean
    setShowFilterDropdown: (fn: (v: boolean) => boolean) => void
    calImportanceFilter: Set<string>
    toggleCalImp: (level: string) => void
}

/**
 * Mobile-only compact calendar controls row for NewsPanelV2.
 * Extracted from NewsPanelV2.tsx — replaces the {isMobile && (...)} block inside the calendar header.
 * Desktop uses a different, wider control row that stays in NewsPanelV2.tsx.
 */
export default function NewsPanelMobileCalendarControls({
    calViewMode,
    setCalViewMode,
    mobileDayIdx,
    setMobileDayIdx,
    weekDays,
    shiftWeek,
    month,
    year,
    setCalMonth,
    calView,
    setCalView,
    weeklySubView,
    setWeeklySubView,
    calSearchInput,
    setCalSearchInput,
    fetchCalSearchData,
    calSearchPopover,
    showFilterDropdown,
    setShowFilterDropdown,
    calImportanceFilter,
    toggleCalImp,
}: Props) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Row A: ◀ [title] ▶ */}
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <button
                    onClick={() => {
                        if (calViewMode === 'monthly') {
                            setCalMonth(m => { const d = new Date(m.year, m.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
                        } else if (mobileDayIdx > 0) {
                            setMobileDayIdx(mobileDayIdx - 1)
                        } else { shiftWeek(-1); setMobileDayIdx(4) }
                    }}
                    style={{ padding: '7px 16px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px 0 0 6px', color: '#fff', fontSize: 15, cursor: 'pointer', flexShrink: 0, fontWeight: 900 }}
                >◀</button>
                <div style={{ flex: 1, textAlign: 'center', background: '#0d0d0d', borderTop: '1px solid #333', borderBottom: '1px solid #333', padding: '7px 8px', color: calViewMode === 'weekly' && weekDays[mobileDayIdx]?.toDateString() === new Date().toDateString() ? '#fb923c' : '#fff', fontWeight: 900, fontSize: 14, fontFamily: 'monospace', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {calViewMode === 'monthly'
                        ? `${MONTH_NAMES[month]} ${year}`
                        : weekDays[mobileDayIdx]?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase() ?? ''}
                </div>
                <button
                    onClick={() => {
                        if (calViewMode === 'monthly') {
                            setCalMonth(m => { const d = new Date(m.year, m.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() } })
                        } else if (mobileDayIdx < 4) {
                            setMobileDayIdx(mobileDayIdx + 1)
                        } else { shiftWeek(1); setMobileDayIdx(0) }
                    }}
                    style={{ padding: '7px 16px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '0 6px 6px 0', color: '#fff', fontSize: 15, cursor: 'pointer', flexShrink: 0, fontWeight: 900 }}
                >▶</button>
            </div>
            {/* Row B: compact control pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'space-between' }}>
                {/* MONTH / WEEK */}
                <div style={{ display: 'flex', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', border: '1px solid #333', borderRadius: 8, overflow: 'hidden', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
                    {(['monthly', 'weekly'] as const).map((id, idx) => (
                        <button key={id} onClick={() => setCalViewMode(id)}
                            style={{ padding: '6px 13px', fontWeight: 900, fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', border: 'none', borderLeft: idx > 0 ? '1px solid #333' : 'none', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', color: calViewMode === id ? '#FF6600' : '#ffffff', letterSpacing: '0.06em', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                            {id === 'monthly' ? 'MONTH' : 'WEEK'}
                        </button>
                    ))}
                </div>
                {/* EARN / ECON */}
                <div style={{ display: 'flex', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', border: '1px solid #333', borderRadius: 8, overflow: 'hidden', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
                    {(['earnings', 'events'] as const).map((id, idx) => (
                        <button key={id} onClick={() => setCalView(id)}
                            style={{ padding: '6px 13px', fontWeight: 900, fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', border: 'none', borderLeft: idx > 0 ? '1px solid #333' : 'none', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', color: calView === id ? '#FF6600' : '#ffffff', letterSpacing: '0.06em', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                            {id === 'earnings' ? 'EARN' : 'ECON'}
                        </button>
                    ))}
                </div>
                {/* LOGOS / NOTABLE / IV — weekly only */}
                {calViewMode === 'weekly' && (
                    <div style={{ display: 'flex', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', border: '1px solid #333', borderRadius: 8, overflow: 'hidden', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
                        {(['logos', 'notable', 'implied'] as const).map((id, idx) => (
                            <button key={id} onClick={() => setWeeklySubView(id)}
                                style={{ padding: '6px 12px', fontWeight: 900, fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', border: 'none', borderLeft: idx > 0 ? '1px solid #333' : 'none', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', color: weeklySubView === id ? '#FF6600' : '#ffffff', letterSpacing: '0.06em', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                                {id === 'logos' ? 'LOGOS' : id === 'notable' ? 'NOTABLE' : 'IV'}
                            </button>
                        ))}
                    </div>
                )}
                {/* Calendar company search */}
                <div data-cal-search style={{ position: 'relative', flexShrink: 0 }}>
                    <form onSubmit={e => { e.preventDefault(); if (calSearchInput.trim()) fetchCalSearchData(calSearchInput) }} style={{ display: 'flex', alignItems: 'center' }}>
                        <input
                            value={calSearchInput}
                            onChange={e => setCalSearchInput(e.target.value.toUpperCase())}
                            placeholder="TICKER…"
                            maxLength={8}
                            style={{ width: 78, padding: '5px 8px', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', border: '1px solid #333', borderRight: 'none', borderRadius: '8px 0 0 8px', fontWeight: 900, fontSize: 11, fontFamily: 'monospace', color: '#fff', letterSpacing: '0.06em', outline: 'none', caretColor: '#FF6600' }}
                        />
                        <button type="submit" style={{ padding: '5px 7px', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', border: '1px solid #333', borderRadius: '0 8px 8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg style={{ width: 11, height: 11, color: '#aaa' }} fill="none" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.8" /><path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                        </button>
                    </form>
                    {calSearchPopover}
                </div>
                {/* SHOW filter dropdown */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button onClick={() => setShowFilterDropdown(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', border: '1px solid #333', borderRadius: 8, fontWeight: 900, fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', color: '#ffffff', letterSpacing: '0.06em', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
                        SHOW
                        <svg style={{ width: 10, height: 10, flexShrink: 0, transform: showFilterDropdown ? 'rotate(180deg)' : undefined }} fill="none" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    {showFilterDropdown && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, background: '#111', border: '1px solid #333', borderRadius: 8, padding: 6, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.8)' }}>
                            {([
                                { id: 'critical' as const, label: 'Critical', color: '#ef4444' },
                                { id: 'high' as const, label: 'High', color: '#f97316' },
                                { id: 'medium' as const, label: 'Medium', color: '#f59e0b' },
                                { id: 'low' as const, label: 'Low', color: 'rgba(255,255,255,0.25)' },
                            ]).map(({ id, label, color }) => (
                                <button key={id} onClick={() => toggleCalImp(id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', width: '100%' }}>
                                    <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${calImportanceFilter.has(id) ? '#FF6600' : '#555'}`, background: calImportanceFilter.has(id) ? '#FF6600' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {calImportanceFilter.has(id) && <svg style={{ width: 8, height: 8 }} fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                    </div>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 900, color: '#fff', fontFamily: 'monospace' }}>{label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
