import React, { useEffect, useRef, useState } from 'react'

type Props = {
    visible: boolean
    selectedTicker?: string
    streamingStatus?: string | null
    fill?: boolean // when true: position:absolute (fills parent) instead of position:fixed (fills viewport)
}

const EFI_LOADING_QUOTES = [
    { text: 'The trend is your friend — until it bends.', author: 'Wall Street Proverb' },
    { text: 'Markets can remain irrational longer than you can remain solvent.', author: 'John Maynard Keynes' },
    { text: 'In the short run the market is a voting machine. In the long run, a weighing machine.', author: 'Benjamin Graham' },
    { text: 'The stock market is filled with individuals who know the price of everything, but the value of nothing.', author: 'Philip Fisher' },
    { text: 'The four most dangerous words in investing: "this time it\'s different."', author: 'Sir John Templeton' },
    { text: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett' },
    { text: 'Price is what you pay. Value is what you get.', author: 'Warren Buffett' },
    { text: 'The market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett' },
    { text: 'It\'s not whether you\'re right or wrong, but how much money you make when you\'re right and lose when you\'re wrong.', author: 'George Soros' },
    { text: 'Know what you own, and know why you own it.', author: 'Peter Lynch' },
    { text: 'I will tell you how to become rich: be fearful when others are greedy. Be greedy when others are fearful.', author: 'Warren Buffett' },
    { text: 'The intelligent investor is a realist who sells to optimists and buys from pessimists.', author: 'Benjamin Graham' },
    { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
    { text: 'Block trades don\'t lie. Institutions leave footprints.', author: 'EFI Research' },
    { text: 'When sweep orders cluster, the smart money is speaking.', author: 'EFI Research' },
    { text: 'Volume is the weapon of the informed trader.', author: 'EFI Research' },
    { text: 'The best trades come from where conviction meets flow.', author: 'EFI Research' },
    { text: 'Follow the smart money — it always leaves a trail in options.', author: 'EFI Research' },
    { text: 'Premium doesn\'t lie. Size tells the story.', author: 'EFI Research' },
    { text: 'Unusual options activity today is tomorrow\'s headline.', author: 'EFI Research' },
    { text: 'Options flow is the heartbeat of institutional conviction.', author: 'EFI Research' },
    { text: 'A sweep across multiple exchanges is a trader screaming urgency.', author: 'EFI Research' },
    { text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder' },
    { text: 'Trading is 30% strategy, 70% psychology. Master yourself first.', author: 'Mark Douglas' },
    { text: 'Cut your losses short and let your profits run.', author: 'Trading Maxim' },
    { text: 'Compound interest is the eighth wonder of the world. He who understands it, earns it.', author: 'Albert Einstein' },
    { text: 'If you don\'t find a way to make money while you sleep, you will work until you die.', author: 'Warren Buffett' },
    { text: 'Opportunities come infrequently. When it rains gold, put out the bucket, not the thimble.', author: 'Warren Buffett' },
    { text: 'Invert, always invert. Avoid stupidity rather than seeking brilliance.', author: 'Charlie Munger' },
    { text: 'The stock market is a no-called-strike game. You don\'t have to swing at everything.', author: 'Warren Buffett' },
    { text: 'Formal education will make you a living; self-education will make you a fortune.', author: 'Jim Rohn' },
    { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
]

export default function OptionsFlowScene({ visible, selectedTicker, streamingStatus, fill }: Props) {
    const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * EFI_LOADING_QUOTES.length))
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const modeRef = useRef(Math.floor(Math.random() * 3))

    useEffect(() => {
        if (!visible) return
        const iv = setInterval(() => setQuoteIndex(i => (i + 1) % EFI_LOADING_QUOTES.length), 10000)
        return () => clearInterval(iv)
    }, [visible])

    useEffect(() => {
        if (!visible) return
        const t = setInterval(() => { modeRef.current = (modeRef.current + 1) % 3 }, 14000)
        return () => clearInterval(t)
    }, [visible])

    useEffect(() => {
        if (!visible) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let raf = 0
        let lightning = 0, lightningAlpha = 0
        type WP = { x: number; y: number; vx: number; vy: number; len: number; r: number; alpha: number; depth: number; drift: number; rot: number; rotV: number }
        let particles: WP[] = []
        let prevMode = -1

        const W = () => canvas.offsetWidth
        const H = () => canvas.offsetHeight

        const init = (mode: number) => {
            particles = []
            const w = W(), h = H()
            if (mode === 0) {
                for (let i = 0; i < 320; i++) {
                    const d = 0.3 + Math.random() * 0.7
                    particles.push({ x: Math.random() * w, y: Math.random() * h, vx: -1.2 - d * 2.5, vy: 9 + d * 12, len: 8 + d * 22, r: 0.5 + d * 0.9, alpha: 0.12 + d * 0.5, depth: d, drift: 0, rot: 0, rotV: 0 })
                }
            } else if (mode === 1) {
                for (let i = 0; i < 220; i++) {
                    const d = Math.random(), layer = d < 0.33 ? 0 : d < 0.66 ? 1 : 2
                    particles.push({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0.4 + layer * 0.9 + Math.random() * 0.5, len: 0, r: 1 + layer * 2.2 + Math.random() * 1.5, alpha: 0.15 + layer * 0.35 + Math.random() * 0.25, depth: d, drift: (Math.random() - 0.5) * 0.4, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.025 })
                }
            } else {
                for (let i = 0; i < 400; i++) {
                    const d = 0.3 + Math.random() * 0.7
                    particles.push({ x: Math.random() * w, y: Math.random() * h, vx: -7 - d * 10, vy: 4 + d * 7, len: 14 + d * 32, r: 0.35 + d * 0.7, alpha: 0.08 + d * 0.4, depth: d, drift: 0, rot: 0, rotV: 0 })
                }
            }
        }

        const draw = () => {
            const mode = modeRef.current
            const w = W(), h = H()
            if (!canvas.width || canvas.width !== w) { canvas.width = w; canvas.height = h }
            if (mode !== prevMode) { init(mode); prevMode = mode; lightning = 0 }

            if (mode === 0) {
                ctx.fillStyle = '#020407'; ctx.fillRect(0, 0, w, h)
                const fog = ctx.createLinearGradient(0, 0, 0, h)
                fog.addColorStop(0, 'rgba(5,15,30,0.35)'); fog.addColorStop(1, 'rgba(2,6,14,0)')
                ctx.fillStyle = fog; ctx.fillRect(0, 0, w, h)
                if (lightning > 0) { ctx.fillStyle = `rgba(180,220,255,${lightningAlpha * lightning / 6})`; ctx.fillRect(0, 0, w, h); lightning-- }
                else if (Math.random() < 0.0018) { lightning = 4 + Math.floor(Math.random() * 4); lightningAlpha = 0.1 + Math.random() * 0.15 }
                ctx.lineCap = 'round'
                for (const p of particles) {
                    ctx.beginPath(); ctx.strokeStyle = `rgba(160,205,255,${p.alpha})`; ctx.lineWidth = p.r
                    const a = Math.atan2(p.vy, p.vx); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * p.len, p.y + Math.sin(a) * p.len); ctx.stroke()
                    p.x += p.vx * 0.55; p.y += p.vy * 0.55
                    if (p.y > h + p.len) { p.y = -p.len; p.x = Math.random() * w }
                    if (p.x < -p.len) { p.x = w + p.len; p.y = Math.random() * h }
                }
            } else if (mode === 1) {
                ctx.fillStyle = '#020309'; ctx.fillRect(0, 0, w, h)
                const atm = ctx.createRadialGradient(w * 0.5, h * 0.15, 0, w * 0.5, h * 0.5, w * 0.65)
                atm.addColorStop(0, 'rgba(12,22,55,0.35)'); atm.addColorStop(1, 'rgba(0,0,0,0)')
                ctx.fillStyle = atm; ctx.fillRect(0, 0, w, h)
                const wind = Math.sin(Date.now() * 0.00025) * 0.35
                for (const p of particles) {
                    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = p.alpha
                    if (p.r > 2.8) {
                        ctx.strokeStyle = `rgba(220,238,255,${p.alpha})`; ctx.lineWidth = 0.75
                        for (let a2 = 0; a2 < 6; a2++) {
                            const ax = Math.cos(a2 * Math.PI / 3), ay = Math.sin(a2 * Math.PI / 3)
                            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ax * p.r, ay * p.r); ctx.stroke()
                            ctx.beginPath(); ctx.moveTo(ax * p.r * 0.5, ay * p.r * 0.5); ctx.lineTo(ax * p.r * 0.5 + Math.cos(a2 * Math.PI / 3 + Math.PI / 2) * p.r * 0.28, ay * p.r * 0.5 + Math.sin(a2 * Math.PI / 3 + Math.PI / 2) * p.r * 0.28); ctx.stroke()
                        }
                    } else {
                        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r * 1.8)
                        g.addColorStop(0, `rgba(240,250,255,${p.alpha})`); g.addColorStop(1, 'rgba(200,225,255,0)')
                        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.r * 1.8, 0, Math.PI * 2); ctx.fill()
                    }
                    ctx.restore(); ctx.globalAlpha = 1
                    p.drift += (Math.random() - 0.5) * 0.012; p.drift = Math.max(-0.55, Math.min(0.55, p.drift))
                    p.x += p.drift + wind; p.y += p.vy; p.rot += p.rotV
                    if (p.y > h + p.r * 2) { p.y = -p.r * 2; p.x = Math.random() * w }
                    if (p.x < -p.r * 2) p.x = w + p.r * 2
                    if (p.x > w + p.r * 2) p.x = -p.r * 2
                }
            } else {
                ctx.fillStyle = '#010203'; ctx.fillRect(0, 0, w, h)
                for (let l = 0; l < 3; l++) {
                    const fy = h * (0.2 + l * 0.3) + Math.sin(Date.now() * 0.00009 + l * 2) * 25
                    const fg = ctx.createLinearGradient(0, fy - 50, 0, fy + 90)
                    fg.addColorStop(0, 'rgba(10,18,30,0)'); fg.addColorStop(0.5, 'rgba(14,24,42,0.2)'); fg.addColorStop(1, 'rgba(10,18,30,0)')
                    ctx.fillStyle = fg; ctx.fillRect(0, fy - 50, w, 140)
                }
                if (lightning > 0) {
                    ctx.fillStyle = `rgba(200,230,255,${lightningAlpha * lightning / 8})`; ctx.fillRect(0, 0, w, h)
                    if (lightning === 8) {
                        ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 1.5
                        let bx = w * 0.25 + Math.random() * w * 0.5, by = 0; ctx.moveTo(bx, 0)
                        while (by < h * 0.72) { by += 18 + Math.random() * 28; bx += (Math.random() - 0.5) * 55; ctx.lineTo(bx, by) }
                        ctx.stroke()
                    }
                    lightning--
                } else if (Math.random() < 0.005) { lightning = 6 + Math.floor(Math.random() * 6); lightningAlpha = 0.13 + Math.random() * 0.2 }
                ctx.lineCap = 'round'
                for (const p of particles) {
                    ctx.beginPath(); ctx.strokeStyle = `rgba(130,180,230,${p.alpha})`; ctx.lineWidth = p.r
                    const a = Math.atan2(p.vy, p.vx); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * p.len, p.y + Math.sin(a) * p.len); ctx.stroke()
                    p.x += p.vx * 0.65; p.y += p.vy * 0.65
                    if (p.y > h + p.len) { p.y = -p.len; p.x = Math.random() * (w + 150) - 75 }
                    if (p.x < -p.len * 2) { p.x = w + p.len; p.y = Math.random() * h }
                }
            }
            raf = requestAnimationFrame(draw)
        }

        canvas.width = W(); canvas.height = H()
        init(modeRef.current); prevMode = modeRef.current
        draw()
        const ro = new ResizeObserver(() => { canvas.width = W(); canvas.height = H(); init(modeRef.current) })
        ro.observe(canvas)
        return () => { cancelAnimationFrame(raf); ro.disconnect() }
    }, [visible])

    if (!visible) return null

    const selected = selectedTicker ?? 'OPTIONS'
    const quote = EFI_LOADING_QUOTES[quoteIndex % EFI_LOADING_QUOTES.length]

    return (
        <div style={{ position: fill ? 'absolute' : 'fixed', inset: 0, zIndex: 60, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}} @keyframes scenePulse{0%,100%{opacity:1}50%{opacity:0.8}}`}</style>
            {/* Weather canvas background */}
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
            {/* Content */}
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(20px,4vh,44px)', padding: '0 24px', maxWidth: 780, width: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 'clamp(42px,8vw,94px)', fontWeight: 900, color: '#ffffff', letterSpacing: '8px', lineHeight: 1, animation: 'scenePulse 2.8s ease-in-out infinite', textShadow: '0 0 60px rgba(255,255,255,0.12), 0 1px 0 #ccc, 0 2px 0 #999, 0 6px 20px rgba(0,0,0,0.8)' }}>{selected}</div>
                    <div style={{ fontSize: 'clamp(14px,2.5vw,28px)', fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: '10px', marginTop: '8px' }}>FLOW SCAN</div>
                </div>
                <div style={{ position: 'relative', width: 'clamp(70px,10vw,110px)', height: 'clamp(70px,10vw,110px)', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '5px solid rgba(255,255,255,0.06)', borderTopColor: '#ffffff', animation: 'spin 0.9s linear infinite' }} />
                    <div style={{ position: 'absolute', inset: '14px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.04)', borderTopColor: 'rgba(255,255,255,0.5)', animation: 'spin 1.5s linear infinite reverse' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', boxShadow: '0 0 12px rgba(255,255,255,0.9)' }} />
                    </div>
                </div>
                <div style={{ fontSize: 'clamp(13px,1.5vw,18px)', fontWeight: 600, color: '#fff', letterSpacing: '0.5px', textAlign: 'center', maxWidth: 560, opacity: 0.85 }}>
                    {streamingStatus ? streamingStatus.replace(/^Worker\s+\d+:\s*/i, '') : 'Scanning options flow...'}
                </div>
                <div style={{ maxWidth: 680, width: '100%', textAlign: 'center', padding: 'clamp(20px,3vw,30px) clamp(20px,4vw,40px)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 55%, rgba(0,0,0,0.4) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 16px 50px rgba(0,0,0,0.7)' }}>
                    <div style={{ fontSize: 'clamp(15px,1.8vw,22px)', fontStyle: 'italic', color: '#f1f5f9', lineHeight: 1.7, fontWeight: 400 }}>
                        &ldquo;{quote.text}&rdquo;
                    </div>
                    <div style={{ fontSize: 'clamp(13px,1.4vw,17px)', color: 'rgba(255,255,255,0.45)', fontWeight: 600, marginTop: 14, letterSpacing: '0.5px' }}>
                        — {quote.author}
                    </div>
                </div>
            </div>
        </div>
    )
}
