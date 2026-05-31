'use client'

import React from 'react'

interface Props {
    selectedOptionTypes: string[]
    setSelectedOptionTypes: React.Dispatch<React.SetStateAction<string[]>>
    selectedOrderSides: string[]
    setSelectedOrderSides: React.Dispatch<React.SetStateAction<string[]>>
    selectedUniqueFilters: string[]
    setSelectedUniqueFilters: React.Dispatch<React.SetStateAction<string[]>>
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
                            {[
                                { label: 'BUY', value: 'buy', color: '#22d3ee', glow: 'rgba(34,211,238,0.25)' },
                                { label: 'SELL', value: 'sell', color: '#f97316', glow: 'rgba(249,115,22,0.25)' },
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
                                            gap: '7px',
                                            padding: '8px 8px',
                                            marginBottom: '6px',
                                            borderRadius: '8px',
                                            border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
                                            background: active
                                                ? `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`
                                                : 'rgba(255,255,255,0.02)',
                                            boxShadow: active ? `0 0 12px ${glow}` : 'none',
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
                                                fontSize: '14px',
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
                            { label: 'BLOCK', value: 'block', color: '#6366f1', glow: 'rgba(99,102,241,0.25)' },
                            { label: 'SWEEP', value: 'sweep', color: '#f59e0b', glow: 'rgba(245,158,11,0.25)' },
                        ].map(({ label, value, color, glow }) => {
                            const active = selectedUniqueFilters.includes(value)
                            return (
                                <button
                                    key={value}
                                    onClick={() =>
                                        setSelectedUniqueFilters((prev) =>
                                            active ? prev.filter((f) => f !== value) : [...prev, value]
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* TICKER */}
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
                                background: 'linear-gradient(180deg, #3b82f6, #1d4ed8)',
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
                            Ticker
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {[
                            { label: 'ETF', value: 'ETF_ONLY' },
                            { label: 'STOCK', value: 'STOCK_ONLY' },
                            { label: 'MAG 7', value: 'MAG7_ONLY' },
                            { label: 'NO MAG7', value: 'EXCLUDE_MAG7' },
                            { label: 'NO ETF', value: 'EXCLUDE_ETF' },
                        ].map(({ label, value }) => {
                            const active = selectedTickerFilters.includes(value)
                            return (
                                <button
                                    key={value}
                                    onClick={() =>
                                        setSelectedTickerFilters((prev) =>
                                            active ? prev.filter((f) => f !== value) : [...prev, value]
                                        )
                                    }
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '7px',
                                        padding: '7px 8px',
                                        borderRadius: '7px',
                                        border: `1px solid ${active ? '#3b82f6' : 'rgba(255,255,255,0.05)'}`,
                                        background: active ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                                        boxShadow: active ? '0 0 10px rgba(59,130,246,0.2)' : 'none',
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
                                            background: active ? '#3b82f6' : '#374151',
                                            boxShadow: active ? '0 0 5px #3b82f6' : 'none',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: 800,
                                            letterSpacing: '1px',
                                            color: active ? '#93c5fd' : '#ffffff',
                                        }}
                                    >
                                        {label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* SPECIAL */}
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
                            { label: 'WEEKLY', value: 'WEEKLY_ONLY' },
                            { label: 'MINI', value: 'MINI_ONLY' },
                        ].map(({ label, value }) => {
                            const active = selectedUniqueFilters.includes(value)
                            return (
                                <button
                                    key={value}
                                    onClick={() =>
                                        setSelectedUniqueFilters((prev) =>
                                            active ? prev.filter((f) => f !== value) : [...prev, value]
                                        )
                                    }
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '7px',
                                        padding: '7px 8px',
                                        borderRadius: '7px',
                                        border: `1px solid ${active ? '#06b6d4' : 'rgba(255,255,255,0.05)'}`,
                                        background: active ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.02)',
                                        boxShadow: active ? '0 0 10px rgba(6,182,212,0.2)' : 'none',
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
                                            background: active ? '#06b6d4' : '#374151',
                                            boxShadow: active ? '0 0 5px #06b6d4' : 'none',
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: 800,
                                            letterSpacing: '1px',
                                            color: active ? '#67e8f9' : '#ffffff',
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
                            background: 'linear-gradient(180deg, #a855f7, #7c3aed)',
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
                        Expiration
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                        <span
                            style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 800,
                                letterSpacing: '1.5px',
                                color: '#94a3b8',
                                marginBottom: '5px',
                                textTransform: 'uppercase',
                            }}
                        >
                            Start
                        </span>
                        <input
                            type="date"
                            value={expirationStartDate}
                            onChange={(e) => setExpirationStartDate(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '9px 8px',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(168,85,247,0.3)',
                                borderRadius: '8px',
                                color: '#e9d5ff',
                                fontSize: '14px',
                                fontWeight: 700,
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>
                    <div>
                        <span
                            style={{
                                display: 'block',
                                fontSize: '12px',
                                fontWeight: 800,
                                letterSpacing: '1.5px',
                                color: '#94a3b8',
                                marginBottom: '5px',
                                textTransform: 'uppercase',
                            }}
                        >
                            End
                        </span>
                        <input
                            type="date"
                            value={expirationEndDate}
                            onChange={(e) => setExpirationEndDate(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '9px 8px',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(168,85,247,0.3)',
                                borderRadius: '8px',
                                color: '#e9d5ff',
                                fontSize: '14px',
                                fontWeight: 700,
                                outline: 'none',
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
