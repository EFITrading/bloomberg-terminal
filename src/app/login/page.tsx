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
    rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/market-overview'

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

    // Abstract bokeh orbs
    const orbs = Array.from({ length: 22 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 180 + 60,
      alpha: Math.random() * 0.055 + 0.01,
      dx: (Math.random() - 0.5) * 0.22,
      dy: (Math.random() - 0.5) * 0.14,
      // deep blue, cold white, or very faint amber — no bright orange
      rgb: (['60,90,180', '40,70,160', '200,220,255', '255,255,255', '120,80,30'])[Math.floor(Math.random() * 5)],
    }))

    // Slow drifting diagonal light streaks
    const streaks = Array.from({ length: 5 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      len: Math.random() * 300 + 150,
      alpha: Math.random() * 0.04 + 0.01,
      speed: Math.random() * 0.3 + 0.1,
      angle: Math.PI / 4 + (Math.random() - 0.5) * 0.4,
    }))

    const draw = () => {
      const { width, height } = canvas

      // Fade trail — near-black fill creates motion blur effect
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(0, 0, width, height)

      // Draw bokeh orbs
      orbs.forEach(o => {
        const grd = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
        grd.addColorStop(0, `rgba(${o.rgb},${o.alpha})`)
        grd.addColorStop(0.5, `rgba(${o.rgb},${o.alpha * 0.4})`)
        grd.addColorStop(1, `rgba(${o.rgb},0)`)
        ctx.fillStyle = grd
        ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2)

        // Drift
        o.x += o.dx
        o.y += o.dy
        if (o.x < -o.r) o.x = width + o.r
        if (o.x > width + o.r) o.x = -o.r
        if (o.y < -o.r) o.y = height + o.r
        if (o.y > height + o.r) o.y = -o.r
      })

      // Draw streaks
      streaks.forEach(s => {
        ctx.save()
        ctx.translate(s.x, s.y)
        ctx.rotate(s.angle)
        const sg = ctx.createLinearGradient(-s.len / 2, 0, s.len / 2, 0)
        sg.addColorStop(0, 'rgba(255,255,255,0)')
        sg.addColorStop(0.5, `rgba(255,255,255,${s.alpha})`)
        sg.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.strokeStyle = sg
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(-s.len / 2, 0)
        ctx.lineTo(s.len / 2, 0)
        ctx.stroke()
        ctx.restore()

        s.x += Math.cos(s.angle) * s.speed
        s.y += Math.sin(s.angle) * s.speed
        if (s.x > width + s.len) { s.x = -s.len; s.y = Math.random() * height }
        if (s.y > height + s.len) { s.x = Math.random() * width; s.y = -s.len }
      })

      // Hard vignette — crushes edges to pure black
      const vig = ctx.createRadialGradient(width / 2, height / 2, width * 0.25, width / 2, height / 2, width * 0.85)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(0.6, 'rgba(0,0,0,0.2)')
      vig.addColorStop(1, 'rgba(0,0,0,0.92)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, width, height)

      animFrame = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(animFrame)
      window.removeEventListener('resize', resize)
    }
  }, [])

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
      second: '2-digit',
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
              EFI TRADING INTELLIGENCE
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <span style={{ fontSize: '12px', color: '#FFFFFF', letterSpacing: '0.1em', fontWeight: 600 }}>
              {formatDate(currentTime)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', animation: 'efi-blink 2s step-end infinite' }} />
              <span style={{ fontSize: '12px', color: '#FFFFFF', fontFamily: 'monospace', letterSpacing: '0.12em', fontWeight: 600 }}>
                {formatTime(currentTime)} EST
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
            {/* Overline tag */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              marginBottom: '26px',
              padding: '7px 18px',
              border: '1px solid rgba(255,102,0,0.45)',
              background: 'linear-gradient(90deg, rgba(255,102,0,0.08), rgba(255,102,0,0.14), rgba(255,102,0,0.08))',
              boxShadow: '0 0 20px rgba(255,102,0,0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF6600', boxShadow: '0 0 8px #FF6600' }} />
              <span style={{ fontSize: '11px', color: '#FF6600', letterSpacing: '0.25em', fontWeight: 700 }}>
                PROFESSIONAL TRADING INTELLIGENCE
              </span>
            </div>

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
