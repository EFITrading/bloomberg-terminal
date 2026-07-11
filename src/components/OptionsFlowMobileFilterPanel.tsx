'use client'

import React from 'react'
import DateRangePicker from '@/components/DateRangePicker'

interface Props {
    selectedOptionTypes: string[]
    setSelectedOptionTypes: React.Dispatch<React.SetStateAction<string[]>>
    selectedOrderSides: string[]
    setSelectedOrderSides: React.Dispatch<React.SetStateAction<string[]>>
    selectedUniqueFilters: string[]
    setSelectedUniqueFilters: React.Dispatch<React.SetStateAction<string[]>>
    typeFilter: string[]
    setTypeFilter: React.Dispatch<React.SetStateAction<string[]>>
    selectedPremiumFilters: string[]
    setSelectedPremiumFilters: React.Dispatch<React.SetStateAction<string[]>>
    customMinPremium: string
    setCustomMinPremium: React.Dispatch<React.SetStateAction<string>>
    customMaxPremium: string
    setCustomMaxPremium: React.Dispatch<React.SetStateAction<string>>
    selectedTickerFilters: string[]
    setSelectedTickerFilters: React.Dispatch<React.SetStateAction<string[]>>
    blacklistEnabled: boolean
    setBlacklistEnabled: React.Dispatch<React.SetStateAction<boolean>>
    blacklistedTickers: string[]
    setBlacklistedTickers: React.Dispatch<React.SetStateAction<string[]>>
    expirationStartDate: string
    setExpirationStartDate: React.Dispatch<React.SetStateAction<string>>
    expirationEndDate: string
    setExpirationEndDate: React.Dispatch<React.SetStateAction<string>>
}

/**
 * Mobile-only filter panel for OptionsFlowTable.
 * Extracted from OptionsFlowTable.tsx — the {isMobileView && (...)} block containing
 * Options, Type, Premium, Ticker, Special, Blacklist and Expiration filter sections.
 */
export default function OptionsFlowMobileFilterPanel({
    selectedOptionTypes, setSelectedOptionTypes,
    selectedOrderSides, setSelectedOrderSides,
    selectedUniqueFilters, setSelectedUniqueFilters,
    typeFilter, setTypeFilter,
    selectedPremiumFilters, setSelectedPremiumFilters,
    customMinPremium, setCustomMinPremium,
    customMaxPremium, setCustomMaxPremium,
    selectedTickerFilters, setSelectedTickerFilters,
    blacklistEnabled, setBlacklistEnabled,
    blacklistedTickers, setBlacklistedTickers,
    expirationStartDate, setExpirationStartDate,
    expirationEndDate, setExpirationEndDate,
}: Props) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* -- OPTIONS + TYPE -- */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* OPTIONS */}
                <div
                    style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '10px',
                            paddingBottom: '8px',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        <div
                            style={{
                                width: '3px',
                                height: '14px',
                                borderRadius: '2px',
                                background: 'linear-gradient(180deg, #10b981, #ef4444)',
                            }}
                        />
                        <span
                            style={{
                                fontSize: '13px',
                                fontWeight: 800,
                                letterSpacing: '2px',
                                textTransform: 'uppercase',
                                color: '#ffffff',
                            }}
                        >
                            Options
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                            { label: 'CALLS', value: 'call', color: '#10b981', glow: 'rgba(16,185,129,0.25)' },
                            { label: 'PUTS', value: 'put', color: '#ef4444', glow: 'rgba(239,68,68,0.25)' },
                        ].map(({ label, value, color, glow }) => {
                            const active = selectedOptionTypes.includes(value)
                            return (
                                <button
                                    key={value}
                                    onClick={() =>
                                        setSelectedOptionTypes((prev) =>
                                            active ? prev.filter((t) => t !== value) : [...prev, value]
                                        )
                                    }
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '7px',
                                        padding: '9px 8px',
                                        borderRadius: '8px',
                                        border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                                        background: active
                                            ? `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`
                                            : 'rgba(255,255,255,0.02)',
                                        boxShadow: active
                                            ? `0 0 12px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)`
                                            : 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        width: '100%',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: '7px',
                                            height: '7px',
                                            borderRadius: '50%',
                                            background: active ? color : '#374151',
                                            boxShadow: active ? `0 0 6px ${color}` : 'none',
                                            transition: 'all 0.15s ease',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: 800,
                                            letterSpacing: '1.5px',
                                            color: active ? color : '#ffffff',
                                        }}
                                    >
                                        {label}
                                    </span>
                                </button>
                            )
                        })}
                        <div
                            style={{
                                marginTop: '8px',
                                paddingTop: '8px',
                                borderTop: '1px solid rgba(255,255,255,0.07)',
                            }}
                        >
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                                {[
                                    { label: 'BUY A', value: 'buy_a', color: '#22d3ee', glow: 'rgba(34,211,238,0.25)' },
                                    { label: 'BUY AA', value: 'buy_aa', color: '#22d3ee', glow: 'rgba(34,211,238,0.25)' },
                                    { label: 'SELL B', value: 'sell_b', color: '#f97316', glow: 'rgba(249,115,22,0.25)' },
                                    { label: 'SELL BB', value: 'sell_bb', color: '#f97316', glow: 'rgba(249,115,22,0.25)' },
                                ].map(({ label, value, color, glow }) => {
                                    const active = selectedOrderSides.includes(value)
                                    return (
                                        <button
                                            key={value}
                                            onClick={() =>
                                                setSelectedOrderSides((prev) =>
                                                    active ? prev.filter((s) => s !== value) : [...prev, value]
                                                )
                                            }
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '5px',
                                                padding: '7px 4px',
                                                borderRadius: '8px',
                                                border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                                                background: active
                                                    ? `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`
                                                    : 'rgba(255,255,255,0.02)',
                                                boxShadow: active ? `0 0 10px ${glow}` : 'none',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                width: '100%',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: '6px',
                                                    height: '6px',
                                                    borderRadius: '50%',
                                                    background: active ? color : '#374151',
                                                    boxShadow: active ? `0 0 5px ${color}` : 'none',
                                                    transition: 'all 0.15s ease',
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <span
                                                style={{
                                                    fontSize: '12px',
                                                    fontWeight: 800,
                                                    letterSpacing: '0.5px',
                                                    color: active ? color : '#ffffff',
                                                }}
                                            >
                                                {label}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* TYPE */}
                <div
                    style={{
                        background: '#000',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '10px',
                            paddingBottom: '8px',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        <div
                            style={{
                                width: '3px',
                                height: '14px',
                                borderRadius: '2px',
                                background: 'linear-gradient(180deg, #6366f1, #f59e0b)',
                            }}
                        />
                        <span
                            style={{
                                fontSize: '13px',
                                fontWeight: 800,
                                letterSpacing: '2px',
                                textTransform: 'uppercase',
                                color: '#ffffff',
                            }}
                        >
                            Type
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                            { label: 'SWEEP', value: 'SWEEP', color: '#f59e0b', glow: 'rgba(245,158,11,0.25)' },
                            { label: 'BLOCK', value: 'BLOCK', color: '#6366f1', glow: 'rgba(99,102,241,0.25)' },
                            { label: 'MULTI-LEG', value: 'MULTI-LEG', color: '#a855f7', glow: 'rgba(168,85,247,0.25)' },
                            { label: 'MINI', value: 'MINI', color: '#84cc16', glow: 'rgba(132,204,22,0.25)' },
                        ].map(({ label, value, color, glow }) => {
                            const active = typeFilter.includes(value)
                            return (
                                <button
                                    key={value}
                                    onClick={() => {
                                        console.log('[TypeFilter] button clicked:', value, '| current typeFilter:', typeFilter)
                                        setTypeFilter((prev) => {
                                            const next = prev.includes(value)
                                                ? prev.filter((v) => v !== value)
                                                : [...prev, value]
                                            console.log('[TypeFilter] new typeFilter:', next)
                                            return next
                                        })
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '7px',
                                        padding: '9px 8px',
                                        borderRadius: '8px',
                                        border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                                        background: active
                                            ? `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`
                                            : 'rgba(255,255,255,0.02)',
                                        boxShadow: active
                                            ? `0 0 12px ${glow}, inset 0 1px 0 rgba(255,255,255,0.08)`
                                            : 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        width: '100%',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: '7px',
                                            height: '7px',
                                            borderRadius: '50%',
                                            background: active ? color : '#374151',
                                            boxShadow: active ? `0 0 6px ${color}` : 'none',
                                            transition: 'all 0.15s ease',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontSize: '16px',
                                            fontWeight: 800,
                                            letterSpacing: '1.5px',
                                            color: active ? color : '#ffffff',
                                        }}
                                    >
                                        {label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* -- PREMIUM -- */}
            <div
                style={{
                    background: '#000',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '10px',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                    alignSelf: 'flex-start',
                    width: '100%',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '8px',
                        paddingBottom: '6px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <div
                        style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #10b981, #059669)',
                        }}
                    />
                    <span
                        style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                        }}
                    >
                        Premium
                    </span>
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '5px',
                        marginBottom: '6px',
                    }}
                >
                    {[
                        { label: '= $50K', value: '50000' },
                        { label: '= $99K', value: '99000' },
                        { label: '= $200K', value: '200000' },
                        { label: '= $1M', value: '1000000' },
                        { label: '< $0.40', value: 'contract_lt_040' },
                        { label: '< $5', value: 'contract_lt_5' },
                    ].map(({ label, value }) => {
                        const active = selectedPremiumFilters.includes(value)
                        return (
                            <button
                                key={value}
                                onClick={() =>
                                    setSelectedPremiumFilters((prev) =>
                                        active ? prev.filter((f) => f !== value) : [...prev, value]
                                    )
                                }
                                style={{
                                    padding: '6px 4px',
                                    borderRadius: '8px',
                                    border: `1px solid ${active ? '#10b981' : 'rgba(255,255,255,0.06)'}`,
                                    background: active
                                        ? 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.08) 100%)'
                                        : 'rgba(255,255,255,0.02)',
                                    boxShadow: active
                                        ? '0 0 12px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
                                        : 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    fontSize: '16px',
                                    fontWeight: 800,
                                    letterSpacing: '0.5px',
                                    color: active ? '#10b981' : '#ffffff',
                                }}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '5px',
                        paddingTop: '6px',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    <div style={{ position: 'relative' }}>
                        <span
                            style={{
                                position: 'absolute',
                                left: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '14px',
                                color: '#94a3b8',
                                pointerEvents: 'none',
                                fontWeight: 700,
                            }}
                        >
                            MIN
                        </span>
                        <input
                            type="number"
                            value={customMinPremium}
                            onChange={(e) => setCustomMinPremium(e.target.value)}
                            placeholder="$0"
                            style={{
                                width: '100%',
                                paddingLeft: '38px',
                                paddingRight: '8px',
                                paddingTop: '6px',
                                paddingBottom: '6px',
                                background: '#000',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '8px',
                                color: '#ffffff',
                                fontSize: '16px',
                                fontWeight: 700,
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <span
                            style={{
                                position: 'absolute',
                                left: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '14px',
                                color: '#94a3b8',
                                pointerEvents: 'none',
                                fontWeight: 700,
                            }}
                        >
                            MAX
                        </span>
                        <input
                            type="number"
                            value={customMaxPremium}
                            onChange={(e) => setCustomMaxPremium(e.target.value)}
                            placeholder="$8"
                            style={{
                                width: '100%',
                                paddingLeft: '40px',
                                paddingRight: '8px',
                                paddingTop: '6px',
                                paddingBottom: '6px',
                                background: '#000',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '8px',
                                color: '#ffffff',
                                fontSize: '16px',
                                fontWeight: 700,
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* -- TICKER + SPECIAL -- */}
            {/* -- TICKER FILTER -- */}
            <div
                style={{
                    background: '#000',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: 'linear-gradient(180deg, #3b82f6, #1d4ed8)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#ffffff' }}>Ticker Filter</span>
                </div>
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: '4px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase' as const }}>Group</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e', letterSpacing: '1.5px', textTransform: 'uppercase' as const, textAlign: 'center' as const }}>Include</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', letterSpacing: '1.5px', textTransform: 'uppercase' as const, textAlign: 'center' as const }}>Exclude</span>
                </div>
                {[
                    { label: 'ETF Only', inc: 'ETF_ONLY', exc: 'EXCLUDE_ETF' },
                    { label: 'Stocks Only', inc: 'STOCK_ONLY', exc: null },
                    { label: 'Mag 7 Only', inc: 'MAG7_ONLY', exc: 'EXCLUDE_MAG7' },
                    { label: 'Exclude Futures', inc: null, exc: 'EXCLUDE_FUTURES' },
                    { label: 'Overblown Tickers', inc: 'OVERBLOWN_TICKERS', exc: null },
                ].map(({ label, inc, exc }) => {
                    const incActive = inc ? selectedTickerFilters.includes(inc) : false
                    const excActive = exc ? selectedTickerFilters.includes(exc) : false
                    const toggle = (val: string, current: boolean) =>
                        setSelectedTickerFilters((prev) =>
                            current ? prev.filter((f) => f !== val) : [...prev.filter((f) => f !== (val === inc ? exc : inc) ?? ''), val]
                        )
                    return (
                        <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: '4px', alignItems: 'center', marginBottom: '5px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.5px' }}>{label}</span>
                            {/* Include button */}
                            <button
                                onClick={() => inc && toggle(inc, incActive)}
                                disabled={!inc}
                                style={{
                                    padding: '7px 0',
                                    borderRadius: '7px',
                                    border: `1px solid ${incActive ? '#22c55e' : 'rgba(255,255,255,0.08)'}`,
                                    background: incActive ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.02)',
                                    boxShadow: incActive ? '0 0 8px rgba(34,197,94,0.3)' : 'none',
                                    cursor: inc ? 'pointer' : 'not-allowed',
                                    opacity: inc ? 1 : 0.25,
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    color: incActive ? '#22c55e' : 'rgba(255,255,255,0.35)',
                                    textAlign: 'center' as const,
                                    transition: 'all 0.15s ease',
                                }}
                            >{incActive ? '✓ YES' : 'YES'}</button>
                            {/* Exclude button */}
                            <button
                                onClick={() => exc && toggle(exc, excActive)}
                                disabled={!exc}
                                style={{
                                    padding: '7px 0',
                                    borderRadius: '7px',
                                    border: `1px solid ${excActive ? '#ef4444' : 'rgba(255,255,255,0.08)'}`,
                                    background: excActive ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.02)',
                                    boxShadow: excActive ? '0 0 8px rgba(239,68,68,0.3)' : 'none',
                                    cursor: exc ? 'pointer' : 'not-allowed',
                                    opacity: exc ? 1 : 0.25,
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    color: excActive ? '#ef4444' : 'rgba(255,255,255,0.35)',
                                    textAlign: 'center' as const,
                                    transition: 'all 0.15s ease',
                                }}
                            >{excActive ? '✓ NO' : 'NO'}</button>
                        </div>
                    )
                })}
            </div>

            {/* -- SPECIAL -- */}
            <div
                style={{
                    background: '#000',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <div
                        style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #06b6d4, #0891b2)',
                        }}
                    />
                    <span
                        style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                        }}
                    >
                        Special
                    </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {[
                        { label: 'ITM', value: 'ITM' },
                        { label: 'OTM', value: 'OTM' },
                        { label: 'MINI', value: 'MINI_ONLY' },
                        { label: 'Weekly Expiry', value: 'WEEKLY_ONLY' },
                        { label: 'Monthly Expiry', value: 'MONTHLY_ONLY' },
                        { label: 'Quad Witching', value: 'QUAD_WITCHING' },
                        { label: '0DTE Expiry', value: 'ZERO_DTE' },
                    ].map(({ label, value }) => {
                        const active = selectedUniqueFilters.includes(value)
                        return (
                            <button key={value} onClick={() => setSelectedUniqueFilters((prev) => active ? prev.filter((f) => f !== value) : [...prev, value])}
                                style={{ padding: '7px 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.07)', background: '#000', cursor: 'pointer', width: '100%', fontSize: '13px', fontWeight: 800, color: active ? '#ff8500' : '#ffffff', textAlign: 'left' as const, transition: 'color 0.15s ease' }}>
                                {label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* -- SECTORS -- */}
            <div
                style={{
                    background: '#000',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: 'linear-gradient(180deg, #34d399, #60a5fa)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#ffffff' }}>Sectors</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[
                        { label: 'Growth  XLK · XLY · XLC · ARKK', value: 'GROWTH_ONLY' },
                        { label: 'Value  XLI · XLF · XLB', value: 'VALUE_ONLY' },
                        { label: 'Defensives  XLV · XLRE · XLP · XLU', value: 'DEFENSIVES_ONLY' },
                    ].map(({ label, value }) => {
                        const active = selectedUniqueFilters.includes(value)
                        return (
                            <button key={value}
                                onClick={() => setSelectedUniqueFilters((prev) => active ? prev.filter((f) => f !== value) : [...prev, value])}
                                style={{ padding: '9px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)', background: '#000', cursor: 'pointer', fontSize: '13px', fontWeight: 800, color: active ? '#ff8500' : '#ffffff', width: '100%', textAlign: 'left' as const, transition: 'color 0.15s ease' }}
                            >{label}</button>
                        )
                    })}
                </div>
            </div>

            {/* -- BLACKLIST -- */}
            <div
                style={{
                    background: '#000',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '10px',
                        paddingBottom: '8px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}
                >
                    <div
                        style={{
                            width: '3px',
                            height: '14px',
                            borderRadius: '2px',
                            background: 'linear-gradient(180deg, #ef4444, #b91c1c)',
                        }}
                    />
                    <span
                        style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: '#ffffff',
                            flex: 1,
                        }}
                    >
                        Blacklist
                    </span>
                    <button
                        onClick={() => setBlacklistEnabled((v) => !v)}
                        style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            border: blacklistEnabled ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.15)',
                            background: blacklistEnabled ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                            color: blacklistEnabled ? '#fca5a5' : 'rgba(255,255,255,0.4)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            letterSpacing: '1px',
                        }}
                    >
                        {blacklistEnabled ? 'ON' : 'OFF'}
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {blacklistedTickers.slice(0, 10).map((ticker, index) => (
                        <input
                            key={index}
                            type="text"
                            value={ticker}
                            onChange={(e) => {
                                const t = [...blacklistedTickers]
                                t[index] = e.target.value.toUpperCase()
                                setBlacklistedTickers(t)
                            }}
                            placeholder={`#${index + 1}`}
                            maxLength={6}
                            style={{
                                padding: '9px 6px',
                                textAlign: 'center',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: '8px',
                                color: '#fca5a5',
                                fontSize: '16px',
                                fontWeight: 800,
                                letterSpacing: '1px',
                                outline: 'none',
                                width: '100%',
                                boxSizing: 'border-box',
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* -- EXPIRATION -- */}
            <div
                style={{
                    background: '#000',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.95)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '3px', height: '14px', borderRadius: '2px', background: 'linear-gradient(180deg, #a855f7, #7c3aed)' }} />
                        <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#ffffff' }}>Expiration</span>
                    </div>
                    {(expirationStartDate || expirationEndDate) && (
                        <button
                            onClick={() => { setExpirationStartDate(''); setExpirationEndDate('') }}
                            style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#ef4444', fontSize: '11px', fontWeight: 700, cursor: 'pointer', letterSpacing: '1px' }}
                        >CLEAR</button>
                    )}
                </div>

                <DateRangePicker
                    startDate={expirationStartDate}
                    endDate={expirationEndDate}
                    onStartChange={setExpirationStartDate}
                    onEndChange={setExpirationEndDate}
                />
            </div>
        </div>
    )
}
