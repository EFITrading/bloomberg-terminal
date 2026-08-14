import React, { useEffect, useRef, useState } from 'react'

type Props = {
    visible: boolean
    market?: string
    streamingStatus?: string | null
    processed?: number
    total?: number
    found?: number
    fill?: boolean // when true: position:absolute (fills parent) instead of position:fixed (fills viewport)
}

const SEASONAL_LOADING_QUOTES = [
    { text: 'Sell in May and go away — history rhymes more than it repeats.', author: 'Wall Street Proverb' },
    { text: 'The stock market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett' },
    { text: 'Time in the market beats timing the market — but seasonality tilts the odds.', author: 'Trading Maxim' },
    { text: 'History does not repeat itself, but it often rhymes.', author: 'Mark Twain' },
    { text: 'Cycles are the market\'s memory of itself.', author: 'EFI Research' },
    { text: 'Seasonality is probability, not certainty — respect the tail risk.', author: 'EFI Research' },
    { text: 'The four most dangerous words in investing: "this time it\'s different."', author: 'Sir John Templeton' },
    { text: 'Know what you own, and know why you own it.', author: 'Peter Lynch' },
    { text: 'Price is what you pay. Value is what you get.', author: 'Warren Buffett' },
    { text: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett' },
    { text: 'The market can stay irrational longer than you can stay solvent.', author: 'John Maynard Keynes' },
    { text: 'Winning trades average years of consistent seasonal edge, not one lucky call.', author: 'EFI Research' },
    { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
    { text: 'The intelligent investor is a realist who sells to optimists and buys from pessimists.', author: 'Benjamin Graham' },
    { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
    { text: 'Compound interest is the eighth wonder of the world.', author: 'Albert Einstein' },
    { text: 'Be fearful when others are greedy, and greedy when others are fearful.', author: 'Warren Buffett' },
    { text: 'The trend is your friend — until the calendar turns.', author: 'Wall Street Proverb' },
]

export default function SeasonalScanScene({ visible, market, streamingStatus, processed = 0, total = 1, found = 0, fill }: Props) {
    const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * SEASONAL_LOADING_QUOTES.length))
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        if (!visible) return
        const iv = setInterval(() => setQuoteIndex(i => (i + 1) % SEASONAL_LOADING_QUOTES.length), 10000)
        return () => clearInterval(iv)
    }, [visible])

    // Drifting embers / particle field — orange seasonal theme (vs blue weather in options-flow scene)
    useEffect(() => {
        if (!visible) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let raf = 0
        type EP = { x: number; y: number; vx: number; vy: number; r: number; alpha: number; drift: number; hue: number }
        let particles: EP[] = []

        const W = () => canvas.offsetWidth
        const H = () => canvas.offsetHeight

        const init = () => {
            particles = []
            const w = W(), h = H()
            for (let i = 0; i < 140; i++) {
                const d = Math.random()
                particles.push({
                    x: Math.random() * w,
                    y: h + Math.random() * h,
                    vx: 0,
                    vy: -(0.3 + d * 0.9),
                    r: 0.8 + d * 2.4,
                    alpha: 0.08 + d * 0.45,
                    drift: (Math.random() - 0.5) * 0.5,
                    hue: Math.random() < 0.7 ? 0 : 1, // mostly orange, some gold
                })
            }
        }

        const draw = () => {
            const w = W(), h = H()
            if (!canvas.width || canvas.width !== w) { canvas.width = w; canvas.height = h }

            ctx.fillStyle = '#050301'
            ctx.fillRect(0, 0, w, h)

            const glow = ctx.createRadialGradient(w * 0.5, h * 0.65, 0, w * 0.5, h * 0.65, w * 0.6)
            glow.addColorStop(0, 'rgba(90,45,0,0.22)')
            glow.addColorStop(1, 'rgba(0,0,0,0)')
            ctx.fillStyle = glow
            ctx.fillRect(0, 0, w, h)

            const t = Date.now() * 0.0003
            for (const p of particles) {
                const color = p.hue === 0 ? `rgba(255,133,0,${p.alpha})` : `rgba(255,210,90,${p.alpha})`
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2)
                g.addColorStop(0, color)
                g.addColorStop(1, 'rgba(255,133,0,0)')
                ctx.fillStyle = g
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2)
                ctx.fill()

                p.drift += Math.sin(t + p.x * 0.01) * 0.01
                p.drift = Math.max(-0.6, Math.min(0.6, p.drift))
                p.x += p.drift
                p.y += p.vy
                if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w }
                if (p.x < -10) p.x = w + 10
                if (p.x > w + 10) p.x = -10
            }
            raf = requestAnimationFrame(draw)
        }

        canvas.width = W(); canvas.height = H()
        init()
        draw()
        const ro = new ResizeObserver(() => { canvas.width = W(); canvas.height = H(); init() })
        ro.observe(canvas)
        return () => { cancelAnimationFrame(raf); ro.disconnect() }
    }, [visible])

    if (!visible) return null

    const label = (market ?? 'MARKET').toUpperCase()
    const quote = SEASONAL_LOADING_QUOTES[quoteIndex % SEASONAL_LOADING_QUOTES.length]
    const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

    return (
        <div style={{ position: fill ? 'absolute' : 'fixed', inset: 0, zIndex: 60, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <style>{`@keyframes seasonalSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}} @keyframes seasonalPulse{0%,100%{opacity:1}50%{opacity:0.8}}`}</style>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(18px,3.5vh,36px)', padding: '0 24px', maxWidth: 780, width: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 'clamp(32px,6.5vw,72px)', fontWeight: 900, color: '#ffffff', letterSpacing: '7px', lineHeight: 1, animation: 'seasonalPulse 2.8s ease-in-out infinite', textShadow: '0 0 60px rgba(255,133,0,0.25), 0 1px 0 #ccc, 0 2px 0 #663300, 0 6px 20px rgba(0,0,0,0.8)' }}>{label}</div>
                    <div style={{ fontSize: 'clamp(12px,2.2vw,22px)', fontWeight: 800, color: '#ff8500', letterSpacing: '9px', marginTop: '8px' }}>SEASONAL SCAN</div>
                </div>

                <div style={{ position: 'relative', width: 'clamp(60px,9vw,96px)', height: 'clamp(60px,9vw,96px)', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '5px solid rgba(255,133,0,0.08)', borderTopColor: '#ff8500', animation: 'seasonalSpin 0.9s linear infinite' }} />
                    <div style={{ position: 'absolute', inset: '13px', borderRadius: '50%', border: '4px solid rgba(255,133,0,0.06)', borderTopColor: 'rgba(255,180,90,0.7)', animation: 'seasonalSpin 1.5s linear infinite reverse' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff8500', boxShadow: '0 0 12px rgba(255,133,0,0.9)' }} />
                    </div>
                </div>

                <div style={{ fontSize: 'clamp(12px,1.4vw,17px)', fontWeight: 600, color: '#fff', letterSpacing: '0.5px', textAlign: 'center', maxWidth: 560, opacity: 0.85 }}>
                    {streamingStatus ? streamingStatus.replace(/^Worker\s+\d+:\s*/i, '') : 'Scanning seasonal patterns...'}
                </div>

                {total > 1 && (
                    <div style={{ width: 'min(420px, 80vw)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', marginBottom: 6 }}>
                            <span>{processed} / {total} SCANNED</span>
                            <span style={{ color: '#ff8500' }}>{found} FOUND</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #ff8500, #ffb84d)', boxShadow: '0 0 10px rgba(255,133,0,0.6)', transition: 'width 0.2s ease' }} />
                        </div>
                    </div>
                )}

                <div style={{ maxWidth: 680, width: '100%', textAlign: 'center', padding: 'clamp(16px,2.6vw,26px) clamp(18px,3.5vw,34px)', borderRadius: 14, border: '1px solid rgba(255,133,0,0.18)', background: 'linear-gradient(160deg, rgba(255,133,0,0.06) 0%, rgba(255,255,255,0.01) 55%, rgba(0,0,0,0.4) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 50px rgba(0,0,0,0.7)' }}>
                    <div style={{ fontSize: 'clamp(14px,1.6vw,19px)', fontStyle: 'italic', color: '#f1f5f9', lineHeight: 1.7, fontWeight: 400 }}>
                        &ldquo;{quote.text}&rdquo;
                    </div>
                    <div style={{ fontSize: 'clamp(12px,1.3vw,15px)', color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginTop: 12, letterSpacing: '0.5px' }}>
                        — {quote.author}
                    </div>
                </div>
            </div>
        </div>
    )
}
