'use client'

import { useState } from 'react'

interface Props {
    loading: boolean
    savingFlow: boolean
    loadingHistory: boolean
    data: unknown[] | null
    onSave: () => void
    onHistory: () => void
    onClear?: () => void
    /**
     * 'fixed'    — compact 40×40 button, dropdown fixed at top:190px right:8px
     *              (used in the first/mini control bar)
     * 'dropdown' — taller 48px button, absolute dropdown below the button
     *              (used in the second/main control bar, hidden on md+ via md:hidden)
     */
    variant: 'fixed' | 'dropdown'
}

/**
 * Mobile-only action menu for OptionsFlowTable.
 * Extracted from OptionsFlowTable.tsx so the desktop control bars stay clean.
 * Manages its own open/close state internally.
 */
export default function OptionsFlowMobileMenu({
    loading,
    savingFlow,
    loadingHistory,
    data,
    onSave,
    onHistory,
    onClear,
    variant,
}: Props) {
    const [isOpen, setIsOpen] = useState(false)

    const triggerButton = (
        <button
            onClick={() => setIsOpen((o) => !o)}
            disabled={loading}
            className={`text-white font-black uppercase transition-all duration-200 flex items-center justify-center focus:outline-none ${loading ? 'cursor-not-allowed opacity-40' : 'hover:scale-[1.02] active:scale-[0.98]'
                }`}
            style={
                variant === 'fixed'
                    ? {
                        height: '40px',
                        width: '40px',
                        background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                        border: '2px solid #6b7280',
                        borderRadius: '4px',
                        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    }
                    : {
                        height: '48px',
                        padding: '0 16px',
                        gap: '8px',
                        background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                        border: '2px solid #6b7280',
                        borderRadius: '4px',
                        fontSize: '14px',
                        letterSpacing: '1.5px',
                        fontWeight: '900',
                        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    }
            }
        >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
        </button>
    )

    if (variant === 'fixed') {
        return (
            <div className="relative">
                {triggerButton}
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
                        <div
                            className="fixed z-[99999]"
                            style={{
                                top: '190px',
                                right: '8px',
                                width: '134px',
                                background: '#000',
                                border: '2px solid #f97316',
                                borderRadius: '6px',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.9)',
                            }}
                        >
                            {/* SAVE */}
                            <button
                                onClick={() => { onSave(); setIsOpen(false) }}
                                disabled={savingFlow || !data || data.length === 0}
                                className="w-full flex items-center justify-center gap-3 group disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                                    color: '#fff',
                                    fontWeight: 900,
                                    fontSize: '16px',
                                    padding: '13px 10px',
                                    borderBottom: '1px solid #1e3a8a',
                                    letterSpacing: '1px',
                                    transition: 'filter 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                                onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                            >
                                <svg style={{ width: '20px', height: '20px' }} className="group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                                    <polyline strokeLinecap="round" strokeLinejoin="round" points="17 21 17 13 7 13 7 21" />
                                    <polyline strokeLinecap="round" strokeLinejoin="round" points="7 3 7 8 15 8" />
                                </svg>
                                <span>SAVE</span>
                            </button>

                            {/* HISTORY */}
                            <button
                                onClick={() => { onHistory(); setIsOpen(false) }}
                                disabled={loadingHistory}
                                className="w-full flex items-center justify-center gap-3 group disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    background: 'linear-gradient(135deg, #f0f0f0 0%, #e5e7eb 100%)',
                                    color: '#111',
                                    fontWeight: 900,
                                    fontSize: '16px',
                                    padding: '13px 10px',
                                    borderBottom: onClear ? '1px solid #9ca3af' : 'none',
                                    letterSpacing: '1px',
                                    transition: 'filter 0.15s ease',
                                    borderRadius: onClear ? '0' : '0 0 6px 6px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.93)')}
                                onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                            >
                                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>HISTORY</span>
                            </button>

                            {/* CLEAR */}
                            {onClear && (
                                <button
                                    onClick={() => { onClear(); setIsOpen(false) }}
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-3 group disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{
                                        background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                                        color: '#fff',
                                        fontWeight: 900,
                                        fontSize: '16px',
                                        padding: '13px 10px',
                                        borderRadius: '0 0 6px 6px',
                                        letterSpacing: '1px',
                                        transition: 'filter 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.15)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                                >
                                    <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span>CLEAR</span>
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        )
    }

    // variant === 'dropdown'
    return (
        <div className="md:hidden relative">
            {triggerButton}
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-black border border-orange-500 rounded shadow-lg z-50">
                        <button
                            onClick={() => { onSave(); setIsOpen(false) }}
                            disabled={savingFlow || !data || data.length === 0}
                            className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                            <span className="font-bold">Save</span>
                        </button>

                        <button
                            onClick={() => { onHistory(); setIsOpen(false) }}
                            disabled={loadingHistory}
                            className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-bold">History</span>
                        </button>

                        {onClear && (
                            <button
                                onClick={() => { onClear(); setIsOpen(false) }}
                                disabled={loading}
                                className="w-full text-left px-4 py-3 text-red-400 hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed border-t border-gray-700"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span className="font-bold">Clear</span>
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
