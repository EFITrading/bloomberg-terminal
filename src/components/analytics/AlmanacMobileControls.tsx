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
    return (
        <div className="almanac-mobile-controls">
            {/* Row 1: Monthly, Chart, Calendar, Table */}
            <div className="almanac-mobile-row-1">
                <select
                    value={selectedMonth}
                    onChange={(e) => {
                        const newMonth = parseInt(e.target.value)
                        setSelectedMonth(newMonth)
                        onMonthChange?.(newMonth)
                    }}
                    className="almanac-mobile-select"
                >
                    {MONTH_NAMES.map((name, i) => (
                        <option key={i} value={i}>
                            {name}
                        </option>
                    ))}
                </select>

                <button
                    onClick={() => setActiveView('chart')}
                    className={`almanac-mobile-btn ${activeView === 'chart' ? 'active' : ''}`}
                >
                    Chart
                </button>

                <button
                    onClick={() => setActiveView('calendar')}
                    className={`almanac-mobile-btn ${activeView === 'calendar' ? 'active' : ''}`}
                >
                    Calendar
                </button>

                <button
                    onClick={() => setActiveView('table')}
                    className={`almanac-mobile-btn ${activeView === 'table' ? 'active' : ''}`}
                >
                    Table
                </button>
            </div>

            {/* Row 2: Solid/Dashed, Events, Patterns */}
            <div className="almanac-mobile-row-2">
                <button
                    onClick={() => {
                        const anyOn = showMaxYears || show15Y || show10Y || showElection
                        setShowMaxYears(!anyOn)
                        setShow15Y(!anyOn)
                        setShow10Y(!anyOn)
                        setShowElection(!anyOn)
                    }}
                    className="almanac-mobile-btn"
                >
                    Lines
                </button>

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
                    className="almanac-mobile-select"
                    value={selectedEvent || 'none'}
                >
                    <option value="none">Event</option>
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
                    className="almanac-mobile-select"
                    value={patternLabelToValue(selectedPattern)}
                >
                    <option value="none">Pattern</option>
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
        </div>
    )
}
