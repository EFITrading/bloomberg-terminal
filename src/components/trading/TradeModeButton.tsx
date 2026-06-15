'use client'

import React, { useEffect, useRef } from 'react'

export function TradeModeButton({ isActive = false, onClick }: { isActive?: boolean; onClick?: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let animFrame: number
        let t = 0

        const W = canvas.width
        const H = canvas.height

        // ── Value noise (same as login page) ──────────────────────────────────
        const noise = (x: number, y: number): number => {
            const ix = Math.floor(x), iy = Math.floor(y)
            const fx = x - ix, fy = y - iy
            const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
            const h = (a: number, b: number) => {
                let n = a * 127 + b * 311
                n = ((n >> 8) ^ n) * 1540483477
                return ((n ^ (n >> 15)) & 0xffffffff) / 0xffffffff
            }
            return (
                h(ix, iy) * (1 - ux) * (1 - uy) +
                h(ix + 1, iy) * ux * (1 - uy) +
                h(ix, iy + 1) * (1 - ux) * uy +
                h(ix + 1, iy + 1) * ux * uy
            )
        }

        // ── Flow-field particles ──────────────────────────────────────────────
        const N = 180
        type Particle = {
            x: number; y: number
            vx: number; vy: number
            life: number; maxLife: number
            speed: number; hue: number; bright: boolean
        }
        const reset = (p: Partial<Particle>): Particle => {
            const bright = Math.random() < 0.2
            return {
                x: Math.random() * W,
                y: Math.random() * H,
                vx: 0, vy: 0,
                life: 0,
                maxLife: Math.random() * 120 + 50,
                speed: bright ? Math.random() * 1.2 + 0.5 : Math.random() * 0.5 + 0.15,
                hue: bright ? 22 + Math.random() * 14 : 190 + Math.random() * 30,
                bright,
                ...p,
            }
        }
        const particles: Particle[] = Array.from({ length: N }, () =>
            reset({ life: Math.random() * 150 })
        )

        // ── Off-screen trail buffer ───────────────────────────────────────────
        const trail = document.createElement('canvas')
        trail.width = W
        trail.height = H
        const tctx = trail.getContext('2d')!

        // ── Data-stream sparks ────────────────────────────────────────────────
        type Spark = { x: number; y: number; speed: number; alpha: number; len: number }
        const SPARKS: Spark[] = Array.from({ length: 6 }, () => ({
            x: Math.random(),
            y: 0.1 + Math.random() * 0.8,
            speed: 0.004 + Math.random() * 0.01,
            alpha: 0.3 + Math.random() * 0.5,
            len: 0.05 + Math.random() * 0.15,
        }))

        // ── Occasional diagonal slash ─────────────────────────────────────────
        type Slash = { progress: number; active: boolean; x0: number; y0: number; x1: number; y1: number; alpha: number }
        const slash: Slash = { progress: 0, active: false, x0: 0, y0: 0, x1: 0, y1: 0, alpha: 0 }
        let nextSlash = 60 + Math.random() * 120

        const draw = () => {
            // 1. Fade trail
            tctx.fillStyle = 'rgba(0,0,0,0.07)'
            tctx.fillRect(0, 0, W, H)

            // 2. Particles onto trail
            particles.forEach(p => {
                p.life++
                if (p.life > p.maxLife) {
                    Object.assign(p, reset({ x: Math.random() * W, y: Math.random() * H, life: 0 }))
                    return
                }
                const scale = 0.003
                const angle =
                    (noise(p.x * scale + t * 0.12, p.y * scale + t * 0.07) * 2 - 1) * Math.PI * 2.4 +
                    noise(p.x * scale * 2.1 + 4.3, p.y * scale * 2.1 + 2.7) * Math.PI
                p.vx = p.vx * 0.82 + Math.cos(angle) * p.speed * 0.18
                p.vy = p.vy * 0.82 + Math.sin(angle) * p.speed * 0.18
                p.x += p.vx; p.y += p.vy
                if (p.x < 0) p.x += W; if (p.x > W) p.x -= W
                if (p.y < 0) p.y += H; if (p.y > H) p.y -= H

                const lifeAlpha = Math.sin((p.life / p.maxLife) * Math.PI)
                const a = p.bright ? lifeAlpha * 0.9 : lifeAlpha * 0.25
                const r = p.bright ? 1.4 : 0.8
                tctx.beginPath()
                tctx.arc(p.x, p.y, r, 0, Math.PI * 2)
                tctx.fillStyle = `hsla(${p.hue},90%,${p.bright ? 72 : 55}%,${a})`
                tctx.fill()
            })

            // 3. Composite
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, W, H)
            ctx.drawImage(trail, 0, 0)

            // 4. Subtle perspective grid
            const horizon = H * 0.55
            const vp = { x: W * 0.5, y: horizon }
            ctx.save()
            ctx.strokeStyle = 'rgba(255,102,0,0.07)'
            ctx.lineWidth = 0.5
            const VL = 16
            for (let i = 0; i <= VL; i++) {
                const bx = (i / VL) * W
                ctx.beginPath(); ctx.moveTo(vp.x, vp.y); ctx.lineTo(bx, H); ctx.stroke()
            }
            const HL = 10
            for (let i = 0; i <= HL; i++) {
                const frac = Math.pow(i / HL, 2.4)
                const y = horizon + frac * (H - horizon)
                ctx.strokeStyle = `rgba(255,102,0,${0.03 + frac * 0.07})`
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
            }
            ctx.restore()

            // 5. Sparks
            SPARKS.forEach(s => {
                s.x += s.speed
                if (s.x - s.len > 1) s.x = -s.len
                const sx = s.x * W, sy = s.y * H
                const g = ctx.createLinearGradient(sx - s.len * W, sy, sx, sy)
                g.addColorStop(0, 'rgba(255,140,20,0)')
                g.addColorStop(0.7, `rgba(255,200,80,${s.alpha})`)
                g.addColorStop(1, `rgba(255,255,200,${s.alpha * 0.6})`)
                ctx.strokeStyle = g; ctx.lineWidth = 0.8
                ctx.beginPath(); ctx.moveTo(sx - s.len * W, sy); ctx.lineTo(sx, sy); ctx.stroke()
                ctx.beginPath(); ctx.arc(sx, sy, 1.1, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(255,240,180,${s.alpha})`; ctx.fill()
            })

            // 6. Slash
            nextSlash--
            if (nextSlash <= 0 && !slash.active) {
                slash.active = true; slash.progress = 0
                slash.alpha = 0.5 + Math.random() * 0.3
                slash.x0 = Math.random() * W; slash.y0 = 0
                slash.x1 = slash.x0 + (Math.random() - 0.3) * W * 0.7; slash.y1 = H
                nextSlash = 80 + Math.random() * 160
            }
            if (slash.active) {
                slash.progress = Math.min(slash.progress + 0.05, 1)
                const fa = slash.progress < 0.5 ? slash.progress * 2 : (1 - slash.progress) * 2
                const ex = slash.x0 + (slash.x1 - slash.x0) * slash.progress
                const ey = slash.y0 + (slash.y1 - slash.y0) * slash.progress
                const sg = ctx.createLinearGradient(slash.x0, slash.y0, ex, ey)
                sg.addColorStop(0, 'rgba(255,160,40,0)')
                sg.addColorStop(0.5, `rgba(255,200,100,${slash.alpha * fa})`)
                sg.addColorStop(1, 'rgba(255,255,200,0)')
                ctx.strokeStyle = sg; ctx.lineWidth = 1.2
                ctx.shadowColor = 'rgba(255,160,40,0.7)'; ctx.shadowBlur = 6
                ctx.beginPath(); ctx.moveTo(slash.x0, slash.y0); ctx.lineTo(ex, ey); ctx.stroke()
                ctx.shadowBlur = 0
                if (slash.progress >= 1) slash.active = false
            }

            // 7. Radial glow at vp
            const vpg = ctx.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, W * 0.5)
            vpg.addColorStop(0, `rgba(255,100,20,${0.07 + Math.sin(t * 0.8) * 0.02})`)
            vpg.addColorStop(0.5, 'rgba(255,60,0,0.02)')
            vpg.addColorStop(1, 'rgba(0,0,0,0)')
            ctx.fillStyle = vpg; ctx.fillRect(0, 0, W, H)

            // 8. Vignette
            const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.05, W * 0.5, H * 0.5, W * 0.75)
            vig.addColorStop(0, 'rgba(0,0,0,0)')
            vig.addColorStop(0.6, 'rgba(0,0,0,0.15)')
            vig.addColorStop(1, 'rgba(0,0,0,0.85)')
            ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H)

            t += 0.009
            animFrame = requestAnimationFrame(draw)
        }

        draw()
        return () => cancelAnimationFrame(animFrame)
    }, [])

    return (
        <>
            <style>{`
        @keyframes trademode-shine {
          0% { left: -100%; }
          100% { left: 200%; }
        }
        .trademode-btn {
          position: relative;
          overflow: hidden;
          cursor: pointer;
          border: none;
          outline: none;
          padding: 0;
          border-radius: 4px;
          background: transparent;
        }
        .trademode-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 4px;
          border: 1px solid rgba(212,175,55,0.55);
          pointer-events: none;
          box-shadow:
            0 0 8px rgba(212,175,55,0.25),
            inset 0 1px 0 rgba(255,255,255,0.08);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .trademode-btn.active::after {
          border-color: rgba(212,175,55,1);
          box-shadow:
            0 0 24px rgba(212,175,55,0.7),
            0 0 8px rgba(212,175,55,0.4),
            inset 0 1px 0 rgba(255,255,255,0.15);
        }
        .trademode-btn:hover::after {
          border-color: rgba(212,175,55,0.9);
          box-shadow:
            0 0 18px rgba(212,175,55,0.5),
            inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .trademode-shine {
          position: absolute;
          top: 0; left: -100%;
          width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          pointer-events: none;
          border-radius: 4px;
        }
        .trademode-btn:hover .trademode-shine {
          animation: trademode-shine 0.55s ease forwards;
        }
      `}</style>

            <button
                className={`trademode-btn${isActive ? ' active' : ''}`}
                title="Trade Mode"
                onClick={onClick}
                style={{ marginRight: '12px' }}
            >
                {/* Canvas animation background */}
                <canvas
                    ref={canvasRef}
                    width={120}
                    height={34}
                    style={{
                        display: 'block',
                        borderRadius: '4px',
                    }}
                />
                {/* Label overlay */}
                <span
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                        userSelect: 'none',
                    }}
                >
                    {/* Black pill wrapping the gold text so it's legible over the animation */}
                    <span
                        style={{
                            display: 'inline-block',
                            background: 'rgba(0,0,0,0.88)',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            whiteSpace: 'nowrap',
                            fontWeight: '800',
                            fontSize: '11px',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            fontFamily: 'system-ui, -apple-system, "Segoe UI", monospace',
                            color: '#D4AF37',
                            textShadow: '0 0 8px rgba(212,175,55,0.8), 0 1px 2px rgba(0,0,0,1)',
                        }}
                    >
                        Trade- Mode
                    </span>
                </span>
                {/* Shine sweep */}
                <span className="trademode-shine" />
            </button>
        </>
    )
}
