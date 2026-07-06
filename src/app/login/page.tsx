'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const searchParams = useSearchParams()
  const rawRedirect = searchParams.get('redirect') || ''
  const redirectTo =
    rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/options-flow'

  useEffect(() => {
    setMounted(true)
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    // Trigger fade-in after mount — React-controlled, no CSS animation dependency
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    return () => clearInterval(timer)
  }, [])

  // Animated particle grid background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animFrame: number

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let t = 0

    // ── Simplex-like smooth noise (value noise, 2 octaves) ──────────────────
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

    // ── Flow-field particles ─────────────────────────────────────────────────
    // Each particle follows a vector field derived from noise — curves and arcs
    // naturally. Hot-orange core particles + cold blue dim ones.
    const N_PARTICLES = 420
    type Particle = {
      x: number; y: number
      vx: number; vy: number
      life: number; maxLife: number
      speed: number
      hue: number   // 22 = orange, 200 = blue
      bright: boolean
    }
    const resetParticle = (p: Partial<Particle>, w: number, h: number): Particle => {
      const bright = Math.random() < 0.18
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: 0, vy: 0,
        life: 0,
        maxLife: Math.random() * 180 + 80,
        speed: bright ? Math.random() * 1.4 + 0.7 : Math.random() * 0.7 + 0.2,
        hue: bright ? 22 + Math.random() * 14 : 190 + Math.random() * 30,
        bright,
        ...p,
      }
    }
    const particles: Particle[] = Array.from({ length: N_PARTICLES }, () =>
      resetParticle({ life: Math.random() * 200 }, window.innerWidth, window.innerHeight)
    )

    // ── Off-screen trail buffer ──────────────────────────────────────────────
    // We draw trails onto a persistent offscreen canvas and composite it.
    // This gives the glowing-comet-tail effect without smearing the whole frame.
    const trail = document.createElement('canvas')
    trail.width = window.innerWidth
    trail.height = window.innerHeight
    const tctx = trail.getContext('2d')!

    // ── Perspective grid receding to horizon ─────────────────────────────────
    // Drawn once per frame, very faint.  Horizon sits at 58% down the screen.
    const drawGrid = (w: number, h: number) => {
      const horizon = h * 0.58
      const vp = { x: w * 0.5, y: horizon }
      ctx.save()
      ctx.strokeStyle = 'rgba(255,102,0,0.06)'
      ctx.lineWidth = 0.6
      // Vertical lines converging to vp
      const VLINES = 28
      for (let i = 0; i <= VLINES; i++) {
        const bx = (i / VLINES) * w
        ctx.beginPath()
        ctx.moveTo(vp.x, vp.y)
        ctx.lineTo(bx, h)
        ctx.stroke()
      }
      // Horizontal lines spaced by perspective (exponential crowding near horizon)
      const HLINES = 18
      for (let i = 0; i <= HLINES; i++) {
        const frac = Math.pow(i / HLINES, 2.4)
        const y = horizon + frac * (h - horizon)
        const alpha = 0.03 + frac * 0.07
        ctx.strokeStyle = `rgba(255,102,0,${alpha})`
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
      ctx.restore()
    }

    // ── Data-stream sparks: fast horizontal bright dots ──────────────────────
    type Spark = { x: number; y: number; speed: number; alpha: number; len: number }
    const SPARKS: Spark[] = Array.from({ length: 14 }, () => ({
      x: Math.random(),
      y: 0.08 + Math.random() * 0.84,
      speed: 0.003 + Math.random() * 0.009,
      alpha: 0.3 + Math.random() * 0.5,
      len: 0.04 + Math.random() * 0.12,
    }))

    // ── Diagonal light-slash that occasionally fires ─────────────────────────
    type Slash = { progress: number; active: boolean; x0: number; y0: number; x1: number; y1: number; alpha: number }
    const slash: Slash = { progress: 0, active: false, x0: 0, y0: 0, x1: 0, y1: 0, alpha: 0 }
    let nextSlash = 90 + Math.random() * 180

    const draw = () => {
      const { width: W, height: H } = canvas

      // ── 1. Fade trail canvas slightly — keeps comet tails ───────────────
      tctx.fillStyle = 'rgba(0,0,0,0.055)'
      tctx.fillRect(0, 0, W, H)

      // ── 2. Update + draw particles onto trail canvas ────────────────────
      particles.forEach(p => {
        p.life++
        if (p.life > p.maxLife) {
          Object.assign(p, resetParticle({ x: Math.random() * W, y: Math.random() * H, life: 0 }, W, H))
          return
        }

        // Vector field angle from layered noise
        const scale = 0.0022
        const angle = (noise(p.x * scale + t * 0.12, p.y * scale + t * 0.07) * 2 - 1) * Math.PI * 2.4
          + noise(p.x * scale * 2.1 + 4.3, p.y * scale * 2.1 + 2.7) * Math.PI

        p.vx = p.vx * 0.82 + Math.cos(angle) * p.speed * 0.18
        p.vy = p.vy * 0.82 + Math.sin(angle) * p.speed * 0.18
        p.x += p.vx
        p.y += p.vy

        // Wrap
        if (p.x < 0) p.x += W
        if (p.x > W) p.x -= W
        if (p.y < 0) p.y += H
        if (p.y > H) p.y -= H

        const lifeAlpha = Math.sin((p.life / p.maxLife) * Math.PI) // 0→1→0
        const a = p.bright ? lifeAlpha * 0.85 : lifeAlpha * 0.22
        const r = p.bright ? 1.6 : 0.9

        tctx.beginPath()
        tctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        tctx.fillStyle = `hsla(${p.hue},90%,${p.bright ? 72 : 55}%,${a})`
        tctx.fill()
      })

      // ── 3. Composite: black base + trail buffer ──────────────────────────
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(trail, 0, 0)

      // ── 4. Perspective grid (on top of trails, below everything else) ────
      drawGrid(W, H)

      // ── 5. Data-stream sparks ────────────────────────────────────────────
      SPARKS.forEach(s => {
        s.x += s.speed
        if (s.x - s.len > 1) s.x = -s.len

        const sx = s.x * W
        const sy = s.y * H
        const g = ctx.createLinearGradient(sx - s.len * W, sy, sx, sy)
        g.addColorStop(0, 'rgba(255,140,20,0)')
        g.addColorStop(0.7, `rgba(255,200,80,${s.alpha})`)
        g.addColorStop(1, `rgba(255,255,200,${s.alpha * 0.6})`)
        ctx.strokeStyle = g
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(sx - s.len * W, sy)
        ctx.lineTo(sx, sy)
        ctx.stroke()

        // Bright leading point
        ctx.beginPath()
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,240,180,${s.alpha})`
        ctx.fill()
      })

      // ── 6. Diagonal light-slash ──────────────────────────────────────────
      nextSlash--
      if (nextSlash <= 0 && !slash.active) {
        slash.active = true
        slash.progress = 0
        slash.alpha = 0.55 + Math.random() * 0.3
        slash.x0 = Math.random() * W
        slash.y0 = 0
        slash.x1 = slash.x0 + (Math.random() - 0.3) * W * 0.6
        slash.y1 = H
        nextSlash = 120 + Math.random() * 240
      }
      if (slash.active) {
        slash.progress = Math.min(slash.progress + 0.045, 1)
        const fadeAlpha = slash.progress < 0.5
          ? slash.progress * 2
          : (1 - slash.progress) * 2
        const ex = slash.x0 + (slash.x1 - slash.x0) * slash.progress
        const ey = slash.y0 + (slash.y1 - slash.y0) * slash.progress
        const g = ctx.createLinearGradient(slash.x0, slash.y0, ex, ey)
        g.addColorStop(0, 'rgba(255,160,40,0)')
        g.addColorStop(0.5, `rgba(255,200,100,${slash.alpha * fadeAlpha})`)
        g.addColorStop(1, 'rgba(255,255,200,0)')
        ctx.strokeStyle = g
        ctx.lineWidth = 1.5
        ctx.shadowColor = 'rgba(255,160,40,0.8)'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.moveTo(slash.x0, slash.y0)
        ctx.lineTo(ex, ey)
        ctx.stroke()
        ctx.shadowBlur = 0
        if (slash.progress >= 1) slash.active = false
      }

      // ── 7. Radial glow at vanishing point ────────────────────────────────
      const vpx = W * 0.5, vpy = H * 0.58
      const vpg = ctx.createRadialGradient(vpx, vpy, 0, vpx, vpy, W * 0.35)
      vpg.addColorStop(0, `rgba(255,100,20,${0.06 + Math.sin(t * 0.8) * 0.02})`)
      vpg.addColorStop(0.4, 'rgba(255,60,0,0.02)')
      vpg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = vpg
      ctx.fillRect(0, 0, W, H)

      // ── 8. Heavy vignette ────────────────────────────────────────────────
      const vig = ctx.createRadialGradient(W * 0.5, H * 0.46, W * 0.12, W * 0.5, H * 0.46, W * 0.78)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(0.5, 'rgba(0,0,0,0.1)')
      vig.addColorStop(1, 'rgba(0,0,0,0.96)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, W, H)

      t += 0.008
      animFrame = requestAnimationFrame(draw)
    }

    // Sync trail canvas size on resize
    const origResize = resize
    const resizeWithTrail = () => {
      origResize()
      trail.width = window.innerWidth
      trail.height = window.innerHeight
    }
    window.removeEventListener('resize', resize)
    window.addEventListener('resize', resizeWithTrail)

    draw()
    return () => {
      cancelAnimationFrame(animFrame)
      window.removeEventListener('resize', resizeWithTrail)
    }
  }, [mounted])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (data.success) {
        window.location.href = redirectTo
      } else {
        setError('INVALID ACCESS CODE — AUTHORIZATION DENIED')
      }
    } catch {
      setError('CONNECTION FAILED — PLEASE RETRY')
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).toUpperCase()
  }

  if (!mounted) return null

  return (
    <>
      <style>{`
        @keyframes efi-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes efi-btn-shine { to{left:100%} }
        @keyframes efi-fadein { from{opacity:0} to{opacity:1} }
        @keyframes efi-btn-shine {
          0% { left: -100%; }
          100% { left: 200%; }
        }
        .efi-card {
          background: linear-gradient(160deg, rgba(18,18,20,0.98) 0%, rgba(10,10,12,0.99) 50%, rgba(4,4,6,1) 100%);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.07),
            0 60px 120px rgba(0,0,0,0.98),
            0 30px 60px rgba(0,0,0,0.85),
            0 8px 24px rgba(0,0,0,0.7),
            inset 0 1px 0 rgba(255,255,255,0.1),
            inset 0 -1px 0 rgba(0,0,0,0.8);
        }
        .efi-cursor::after { content:'|'; animation: efi-blink 1s step-end infinite; color:#FF6600; margin-left:1px; }
        .efi-btn { position:relative; overflow:hidden; }
        .efi-btn::before {
          content:''; position:absolute; top:0; left:-100%; width:60%; height:100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          transition: none;
        }
        .efi-btn:not(:disabled):hover::before { animation: efi-btn-shine 0.55s ease forwards; }
        .efi-input-wrap { position:relative; }
        .efi-input-wrap::after {
          content:''; position:absolute; bottom:0; left:50%; width:0; height:2px;
          background: linear-gradient(90deg, transparent, #FF6600, transparent);
          transform:translateX(-50%); transition: width 0.3s ease;
        }
        .efi-input-wrap.focused::after { width:100%; }
        .efi-corner { position:absolute; width:16px; height:16px; }
        .efi-corner-tl { top:-1px; left:-1px; border-top:2px solid #FF6600; border-left:2px solid #FF6600; }
        .efi-corner-tr { top:-1px; right:-1px; border-top:2px solid #FF6600; border-right:2px solid #FF6600; }
        .efi-corner-bl { bottom:-1px; left:-1px; border-bottom:2px solid #FF6600; border-left:2px solid #FF6600; }
        .efi-corner-br { bottom:-1px; right:-1px; border-bottom:2px solid #FF6600; border-right:2px solid #FF6600; }
        .efi-efi-text {
          background: linear-gradient(180deg, #FFFFFF 0%, #CCCCCC 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: drop-shadow(0 2px 12px rgba(255,255,255,0.25));
        }
        .efi-terminal-text {
          background: linear-gradient(180deg, #FF8533 0%, #FF6600 50%, #CC5200 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .efi-input-field {
          background: linear-gradient(180deg, rgba(4,4,6,0.95) 0%, rgba(0,0,0,0.98) 100%) !important;
        }
        .efi-input-field:focus {
          box-shadow: 0 0 0 1px rgba(255,102,0,0.4), 0 0 30px rgba(255,102,0,0.08), inset 0 1px 0 rgba(255,255,255,0.05) !important;
        }
      `}</style>

      {/* Animated canvas background */}
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />

      {/* Page layout */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
      }}>

        {/* Top status bar */}
        <div className="efi-slideup" style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          borderBottom: '1px solid rgba(255,102,0,0.25)',
          background: 'linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(10,6,0,0.92) 50%, rgba(0,0,0,0.92) 100%)',
          backdropFilter: 'blur(12px)',
          padding: '12px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 0 rgba(255,102,0,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF6600', boxShadow: '0 0 10px #FF6600, 0 0 20px rgba(255,102,0,0.5)' }} />
            <span style={{ fontSize: '12px', color: '#FF6600', letterSpacing: '0.15em', fontWeight: 700 }}>
              EFI TRADING
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <span style={{ fontSize: '12px', color: '#FFFFFF', letterSpacing: '0.1em', fontWeight: 600 }}>
              {formatDate(currentTime)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'efi-blink 2s step-end infinite' }} />
              <span style={{ fontSize: '12px', color: '#FFFFFF', fontFamily: 'monospace', letterSpacing: '0.12em', fontWeight: 600 }}>
                {formatTime(currentTime)} PST
              </span>
            </div>
          </div>
        </div>

        {/* Main login card */}
        <div style={{
          width: '100%', maxWidth: '709px', position: 'relative',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(28px)',
          transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
        }}>

          {/* Logo section */}
          <div style={{ textAlign: 'center', marginBottom: '54px' }}>

            {/* EFI wordmark */}
            <div style={{ lineHeight: 1, marginBottom: '4px' }}>
              <span className="efi-efi-text" style={{
                display: 'block',
                fontSize: 'clamp(107px,16vw,162px)',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                fontFamily: "'Inter', sans-serif",
                lineHeight: 0.9,
              }}>EFI</span>
              <span className="efi-terminal-text" style={{
                display: 'block',
                fontSize: 'clamp(54px,8vw,81px)',
                fontWeight: 700,
                letterSpacing: '0.22em',
                fontFamily: "'Inter', sans-serif",
                lineHeight: 1.1,
              }}>TERMINAL</span>
            </div>

            {/* Divider */}
            <div style={{
              width: '108px', height: '2px', margin: '22px auto 0',
              background: 'linear-gradient(90deg, transparent, #FF6600, #FF8533, #FF6600, transparent)',
              boxShadow: '0 0 8px rgba(255,102,0,0.5)',
            }} />
          </div>

          {/* Card */}
          <div className="efi-card" style={{
            position: 'relative',
            border: '1px solid rgba(255,102,0,0.35)',
            padding: '60px',
            borderRadius: '2px',
          }}>
            {/* Gloss highlight — top edge */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
              background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.18) 35%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.18) 65%, transparent 95%)',
            }} />
            {/* Inner top gloss sheen */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '80px',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)',
              pointerEvents: 'none',
            }} />

            {/* Corner accents */}
            <div className="efi-corner efi-corner-tl" />
            <div className="efi-corner efi-corner-tr" />
            <div className="efi-corner efi-corner-bl" />
            <div className="efi-corner efi-corner-br" />

            {/* Top accent line */}
            <div style={{
              position: 'absolute', top: 0, left: '15%', right: '15%', height: '2px',
              background: 'linear-gradient(90deg, transparent, #FF6600, #FF8533, #FF6600, transparent)',
              boxShadow: '0 0 12px rgba(255,102,0,0.6)',
            }} />

            <form onSubmit={handleSubmit}>
              {/* Field label */}
              <div style={{ marginBottom: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: '#FF6600', letterSpacing: '0.2em', fontWeight: 800, textShadow: '0 0 10px rgba(255,102,0,0.4)' }}>
                  ACCESS CODE
                </span>
                <span style={{ fontSize: '12px', color: '#FFFFFF', letterSpacing: '0.15em', fontWeight: 700 }}>
                  REQUIRED
                </span>
              </div>

              {/* Input */}
              <div className={`efi-input-wrap${inputFocused ? ' focused' : ''}`} style={{ marginBottom: '27px' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    className="efi-input-field"
                    style={{
                      width: '100%',
                      padding: '18px 56px 18px 20px',
                      border: `1px solid ${inputFocused ? 'rgba(255,102,0,0.7)' : 'rgba(255,255,255,0.15)'}`,
                      color: '#FFFFFF',
                      fontSize: '22px',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '0.2em',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      boxShadow: inputFocused
                        ? '0 0 0 1px rgba(255,102,0,0.3), 0 0 30px rgba(255,102,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 2px 6px rgba(0,0,0,0.4)',
                    }}
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                    autoComplete="current-password"
                  />
                  {/* Show/hide toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    style={{
                      position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                      color: '#FFFFFF',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#FF6600')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#FFFFFF')}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div style={{
                  marginBottom: '24px',
                  padding: '14px 18px',
                  background: 'rgba(220,38,38,0.1)',
                  border: '1px solid rgba(220,38,38,0.4)',
                  boxShadow: '0 0 20px rgba(220,38,38,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444', flexShrink: 0, animation: 'efi-blink 1s step-end infinite' }} />
                  <span style={{ fontSize: '13px', color: '#fca5a5', letterSpacing: '0.1em', fontWeight: 700 }}>
                    {error}
                  </span>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className="efi-btn"
                style={{
                  width: '100%',
                  padding: '20px',
                  background: isLoading
                    ? 'rgba(255,102,0,0.12)'
                    : 'linear-gradient(180deg, #FF8533 0%, #FF6600 45%, #CC5200 100%)',
                  border: '1px solid rgba(255,102,0,0.8)',
                  color: isLoading ? '#FF6600' : '#000000',
                  fontSize: '15px',
                  fontWeight: 900,
                  letterSpacing: '0.22em',
                  fontFamily: "'JetBrains Mono', monospace",
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                  textTransform: 'uppercase',
                  boxShadow: isLoading ? 'none' : '0 4px 24px rgba(255,102,0,0.45), 0 2px 6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
                onMouseEnter={e => {
                  if (!isLoading) {
                    const btn = e.currentTarget as HTMLButtonElement
                    btn.style.background = 'linear-gradient(180deg, #FF9A4D 0%, #FF7A1A 45%, #E05A00 100%)'
                    btn.style.boxShadow = '0 6px 36px rgba(255,102,0,0.65), 0 3px 10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.35)'
                    btn.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={e => {
                  if (!isLoading) {
                    const btn = e.currentTarget as HTMLButtonElement
                    btn.style.background = 'linear-gradient(180deg, #FF8533 0%, #FF6600 45%, #CC5200 100%)'
                    btn.style.boxShadow = '0 4px 24px rgba(255,102,0,0.45), 0 2px 6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)'
                    btn.style.transform = 'translateY(0)'
                  }
                }}
              >
                {isLoading ? (
                  <>
                    <svg style={{ animation: 'spin 1s linear infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>AUTHENTICATING...</span>
                  </>
                ) : (
                  <>
                    <span>INITIALIZE SESSION</span>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', margin: '36px 0 28px' }} />

            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="17" height="17" fill="none" stroke="#22c55e" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" /><path d="M5.64 5.64a9 9 0 0 1 12.73 0M3.22 3.22a13 13 0 0 1 17.56 0M8.46 8.46a5 5 0 0 1 7.07 0" />
                </svg>
                <span style={{ fontSize: '17px', color: '#22c55e', letterSpacing: '0.2em', fontWeight: 800 }}>LIVE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="17" height="17" fill="none" stroke="#00D4FF" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span style={{ fontSize: '17px', color: '#00D4FF', letterSpacing: '0.2em', fontWeight: 800 }}>SECURE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="17" height="17" fill="none" stroke="#FFFFFF" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                </svg>
                <span style={{ fontSize: '17px', color: '#FFFFFF', letterSpacing: '0.2em', fontWeight: 800 }}>24/7</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <span style={{ fontSize: '12px', color: '#ffffff', letterSpacing: '0.2em', fontWeight: 700 }}>
              © 2025 EFI TRADING INTELLIGENCE — ALL RIGHTS RESERVED
            </span>
          </div>
        </div>

        {/* Bottom system bar */}
        <div className="efi-slideup-3" style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          borderTop: '1px solid rgba(255,102,0,0.2)',
          background: 'linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(10,6,0,0.92) 50%, rgba(0,0,0,0.92) 100%)',
          backdropFilter: 'blur(12px)',
          padding: '10px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '0.15em', fontWeight: 600 }}>
            SYS:ONLINE
          </span>
          <span style={{ fontSize: '11px', color: '#FF6600', letterSpacing: '0.15em', fontWeight: 700 }}>
            TERMINAL v2.0
          </span>
          <span style={{ fontSize: '11px', color: '#FFFFFF', letterSpacing: '0.15em', fontWeight: 600 }}>
            ENC:AES-256
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
          <div style={{ color: '#FF6600', fontFamily: 'monospace', letterSpacing: '0.2em' }}>LOADING...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
