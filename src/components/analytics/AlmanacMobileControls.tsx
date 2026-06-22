'use client'

import React from 'react'

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

const PATTERN_VALUE_MAP: Record<string, { id: string; label: string }> = {
    '52week-high-cooldown': { id: '52week-high-cooldown', label: '52W High (90d Cooldown)' },
    '52week-high-annual': { id: '52week-high-annual', label: '52W High (Annual)' },
    '52week-low-cooldown': { id: '52week-low-cooldown', label: '52W Low (90d Cooldown)' },
    '52week-low-annual': { id: '52week-low-annual', label: '52W Low (Annual)' },
    'move-8-11-up-cooldown': { id: 'move-8-11-up-cooldown', label: '8-11% UP (90d Cooldown)' },
    'move-8-11-up-annual': { id: 'move-8-11-up-annual', label: '8-11% UP (Annual)' },
    'move-8-11-down-cooldown': { id: 'move-8-11-down-cooldown', label: '8-11% DOWN (90d Cooldown)' },
    'move-8-11-down-annual': { id: 'move-8-11-down-annual', label: '8-11% DOWN (Annual)' },
    'move-18-22-up-cooldown': { id: 'move-18-22-up-cooldown', label: '18-22% UP (90d Cooldown)' },
    'move-18-22-up-annual': { id: 'move-18-22-up-annual', label: '18-22% UP (Annual)' },
    'move-18-22-down-cooldown': { id: 'move-18-22-down-cooldown', label: '18-22% DOWN (90d Cooldown)' },
    'move-18-22-down-annual': { id: 'move-18-22-down-annual', label: '18-22% DOWN (Annual)' },
}

function patternLabelToValue(label: string | null): string {
    const entry = Object.values(PATTERN_VALUE_MAP).find(v => v.label === label)
    return entry ? entry.id : 'none'
}

interface Props {
    selectedMonth: number
    setSelectedMonth: (v: number) => void
    onMonthChange?: (month: number) => void
    activeView: 'chart' | 'calendar' | 'table'
    setActiveView: (v: 'chart' | 'calendar' | 'table') => void
    showMaxYears: boolean
    show15Y: boolean
    show10Y: boolean
    showElection: boolean
    setShowMaxYears: (v: boolean) => void
    setShow15Y: (v: boolean) => void
    setShow10Y: (v: boolean) => void
    setShowElection: (v: boolean) => void
    selectedEvent: string | null
    setSelectedEvent: (v: string | null) => void
    setShowEventPerformance: (v: boolean) => void
    setEventPerformanceData: (v: never[]) => void
    calculateEventPerformance: (eventType: string) => void
    selectedPattern: string | null
    setSelectedPattern: (v: string | null) => void
    setShowPatternPerformance: (v: boolean) => void
    setShowEventPerformanceForPattern: (v: boolean) => void
    setPatternPerformanceData: (v: never[]) => void
    calculatePatternPerformance: (id: string, label: string, symbol: string) => void
    symbol: string
}

/**
 * Mobile-only controls block for AlmanacDailyChart.
 * Extracted from AlmanacDailyChart.tsx — renders the .almanac-mobile-controls section.
 * Desktop uses a different wide controls row that stays in AlmanacDailyChart.tsx.
 */
export default function AlmanacMobileControls({
    selectedMonth,
    setSelectedMonth,
    onMonthChange,
    activeView,
    setActiveView,
    showMaxYears,
    show15Y,
    show10Y,
    showElection,
    setShowMaxYears,
    setShow15Y,
    setShow10Y,
    setShowElection,
    selectedEvent,
    setSelectedEvent,
    setShowEventPerformance,
    setEventPerformanceData,
    calculateEventPerformance,
    selectedPattern,
    setSelectedPattern,
    setShowPatternPerformance,
    setShowEventPerformanceForPattern,
    setPatternPerformanceData,
    calculatePatternPerformance,
    symbol,
}: Props) {
    const SEL: React.CSSProperties = {
        flex: 1, minWidth: 0, width: 0, height: '28px', lineHeight: '28px', boxSizing: 'border-box',
        backgroundColor: '#1a1a1a', background: 'linear-gradient(180deg,#1a1a1a 0%,#000 100%)',
        color: '#fff', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px',
        fontSize: '10px', fontWeight: 700, WebkitAppearance: 'none', appearance: 'none',
        padding: '0 4px', cursor: 'pointer', colorScheme: 'dark',
    }
    const CTRL_BTN: React.CSSProperties = {
        flex: 1, minWidth: 0, minHeight: 0, height: '28px', lineHeight: '28px', boxSizing: 'border-box',
        background: '#000', backgroundColor: '#000',
        color: '#fff', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px',
        fontSize: '10px', fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }
    const views = [
        { id: 'chart' as const, label: 'CHART' },
        { id: 'calendar' as const, label: 'CALENDAR' },
        { id: 'table' as const, label: 'TABLE' },
    ]
    return (
        <div className="almanac-mobile-ctrl" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <style>{`
                .almanac-mobile-ctrl select option,
                .almanac-mobile-ctrl select optgroup {
                    background: #3a3a3a;
                    background-color: #3a3a3a;
                    color: #ffffff;
                }
                .almanac-mobile-ctrl select {
                    color-scheme: dark;
                }
            `}</style>
            {/* Row 1: Tabs — CHART / CAL / TABLE */}
            <div style={{ display: 'flex', borderBottom: '1px solid #FF6B00', outline: '1px solid rgba(255,107,0,0.3)' }}>
                {views.map((v, index) => {
                    const isActive = activeView === v.id
                    return (
                        <button
                            key={v.id}
                            onClick={() => setActiveView(v.id)}
                            style={{
                                flex: 1, padding: '10px 8px', boxSizing: 'border-box', minHeight: 0, minWidth: 0,
                                background: isActive ? 'linear-gradient(180deg,#1a1a1a 0%,#060606 100%)' : 'linear-gradient(180deg,#111 0%,#040404 100%)',
                                border: isActive ? '2px solid #FF6B00' : '2px solid rgba(255,255,255,0.15)',
                                borderRight: index < 2 ? (isActive ? '2px solid #FF6B00' : '1px solid rgba(255,255,255,0.08)') : undefined,
                                color: isActive ? '#FF6B00' : '#fff',
                                fontSize: 11, fontWeight: 900, letterSpacing: '0.05em',
                                textTransform: 'uppercase', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            {v.label}
                        </button>
                    )
                })}
            </div>

            {/* Row 2: Month select + Lines + Event + Pattern — only shown on CHART tab */}
            {activeView === 'chart' && (
                <div data-ctrl-row style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '4px', padding: '5px 6px', background: '#000', borderBottom: '1px solid rgba(255,107,0,0.15)' }}>
                    <select
                        value={selectedMonth}
                        onChange={(e) => {
                            const newMonth = parseInt(e.target.value)
                            setSelectedMonth(newMonth)
                            onMonthChange?.(newMonth)
                        }}
                        style={{ ...SEL, flex: '0 0 72px', width: '72px' }}
                    >
                        {MONTH_NAMES.map((name, i) => (
                            <option key={i} value={i}>{name}</option>
                        ))}
                    </select>

                    <select
                        onChange={(e) => {
                            const value = e.target.value
                            if (value === 'none') {
                                setSelectedEvent(null)
                                setShowEventPerformance(false)
                                setEventPerformanceData([])
                            } else {
                                setSelectedEvent(value)
                                setShowEventPerformance(true)
                                calculateEventPerformance(value)
                            }
                        }}
                        style={SEL}
                        value={selectedEvent || 'none'}
                    >
                        <option value="none">Market Events</option>
                        <optgroup label="HOLIDAYS">
                            <option value="thanksgiving">Thanksgiving</option>
                            <option value="christmas">Christmas</option>
                            <option value="newyear">New Year</option>
                            <option value="presidentsday">Presidents Day</option>
                            <option value="mlkday">MLK Day</option>
                            <option value="memorialday">Memorial Day</option>
                            <option value="july4th">July 4th</option>
                            <option value="laborday">Labor Day</option>
                        </optgroup>
                        <optgroup label="FOMC MEETINGS">
                            <option value="fomc-march">FOMC March</option>
                            <option value="fomc-june">FOMC June</option>
                            <option value="fomc-september">FOMC September</option>
                            <option value="fomc-december">FOMC December</option>
                        </optgroup>
                        <optgroup label="QUAD WITCHING">
                            <option value="quad-witching-mar">Quad Witching Mar</option>
                            <option value="quad-witching-jun">Quad Witching Jun</option>
                            <option value="quad-witching-sep">Quad Witching Sep</option>
                            <option value="quad-witching-dec">Quad Witching Dec</option>
                        </optgroup>
                    </select>

                    <select
                        onChange={(e) => {
                            const value = e.target.value
                            if (value === 'none') {
                                setSelectedPattern(null)
                                setShowPatternPerformance(false)
                                setPatternPerformanceData([])
                            } else {
                                const pattern = PATTERN_VALUE_MAP[value]
                                if (pattern) {
                                    setSelectedPattern(pattern.label)
                                    setShowPatternPerformance(true)
                                    setShowEventPerformanceForPattern(false)
                                    calculatePatternPerformance(pattern.id, pattern.label, symbol)
                                }
                            }
                        }}
                        style={SEL}
                        value={patternLabelToValue(selectedPattern)}
                    >
                        <option value="none">Stock Patterns</option>
                        <optgroup label="52-WEEK BREAKOUTS">
                            <option value="52week-high-cooldown">52W High (90d)</option>
                            <option value="52week-high-annual">52W High (Annual)</option>
                            <option value="52week-low-cooldown">52W Low (90d)</option>
                            <option value="52week-low-annual">52W Low (Annual)</option>
                        </optgroup>
                        <optgroup label="8-11% MOVES">
                            <option value="move-8-11-up-cooldown">8-11% UP (90d)</option>
                            <option value="move-8-11-up-annual">8-11% UP (Annual)</option>
                            <option value="move-8-11-down-cooldown">8-11% DOWN (90d)</option>
                            <option value="move-8-11-down-annual">8-11% DOWN (Annual)</option>
                        </optgroup>
                        <optgroup label="18-22% MOVES">
                            <option value="move-18-22-up-cooldown">18-22% UP (90d)</option>
                            <option value="move-18-22-up-annual">18-22% UP (Annual)</option>
                            <option value="move-18-22-down-cooldown">18-22% DOWN (90d)</option>
                            <option value="move-18-22-down-annual">18-22% DOWN (Annual)</option>
                        </optgroup>
                    </select>
                </div>
            )}
        </div>
    )
}
