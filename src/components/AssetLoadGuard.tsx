'use client'

import { useEffect } from 'react'

const RELOAD_KEY = '__asset_guard_reload_ts'
const RELOAD_COOLDOWN_MS = 30_000

function recover() {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
        if (Date.now() - last < RELOAD_COOLDOWN_MS) return
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    } catch { /* storage unavailable */ }
    window.location.reload()
}

function isChunkError(msg: string) {
    return /ChunkLoadError|Loading chunk .* failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg)
}

// Silently reloads once when a deploy leaves the page pointing at stale /_next/ assets.
export default function AssetLoadGuard() {
    useEffect(() => {
        const onResourceError = (e: Event) => {
            const t = e.target as HTMLElement | null
            if (!t || t === (window as unknown as HTMLElement)) return
            const url = (t as HTMLLinkElement).href || (t as HTMLScriptElement).src
            if (url && url.includes('/_next/')) recover()
        }
        const onError = (e: ErrorEvent) => {
            if (isChunkError(`${e.message} ${e.error?.name ?? ''}`)) recover()
        }
        const onRejection = (e: PromiseRejectionEvent) => {
            const r = e.reason
            if (isChunkError(`${r?.name ?? ''} ${r?.message ?? r ?? ''}`)) recover()
        }
        const timer = window.setTimeout(() => {
            const dead = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
                .some(l => l.href.includes('/_next/') && !l.sheet)
            if (dead) recover()
        }, 3000)

        window.addEventListener('error', onResourceError, true)
        window.addEventListener('error', onError)
        window.addEventListener('unhandledrejection', onRejection)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener('error', onResourceError, true)
            window.removeEventListener('error', onError)
            window.removeEventListener('unhandledrejection', onRejection)
        }
    }, [])

    return null
}
