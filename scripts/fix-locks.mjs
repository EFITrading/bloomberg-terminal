import { readFileSync, writeFileSync } from 'fs'

// ── Analysis Suite ────────────────────────────────────────────────────────────
{
    const path = 'c:/Users/zakho/Documents/bloomberg-terminal/src/app/analysis-suite/page.tsx'
    let f = readFileSync(path, 'utf8')

    // 1. Remove the LOCKED block that was placed AFTER the mobile return (unreachable on mobile)
    const dupStart = '\n\n  const LOCKED = true\n\n  if (LOCKED) {'
    const dupEnd = '\n\n  return (\n    <div\n      style={{\n        minHeight: \'4200px\','

    const dupIdx = f.indexOf(dupStart)
    if (dupIdx === -1) { console.log('analysis-suite: dup block not found'); process.exit(1) }

    // Find where the duplicate LOCKED block ends (before the real return)
    const endIdx = f.indexOf(dupEnd, dupIdx)
    if (endIdx === -1) { console.log('analysis-suite: end marker not found'); process.exit(1) }

    // Remove the duplicate locked block (keep the real return)
    f = f.slice(0, dupIdx) + dupEnd + f.slice(endIdx + dupEnd.length)

    // 2. Insert LOCKED check before the mobile block
    const mobileMarker = '\n  // \u2500\u2500\u2500 MOBILE LAYOUT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  if (isMobile) {'
    const mobileIdx = f.indexOf(mobileMarker)
    if (mobileIdx === -1) { console.log('analysis-suite: mobile marker not found'); process.exit(1) }

    const lockBlock = `

  const LOCKED = true

  if (LOCKED) return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 40%, #050d1a 0%, #000508 100%)',
      fontFamily: '"Inter", system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px', background: 'radial-gradient(ellipse, rgba(255,102,0,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '28px', padding: '56px 48px', background: 'linear-gradient(145deg, rgba(10,18,32,0.95), rgba(4,8,16,0.98))', border: '1px solid rgba(255,102,0,0.18)', borderRadius: '20px', boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
        <div style={{ width: '88px', height: '88px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, rgba(255,102,0,0.12), rgba(255,102,0,0.04))', border: '1px solid rgba(255,102,0,0.25)', borderRadius: '50%', boxShadow: '0 0 30px rgba(255,102,0,0.1)' }}>
          <svg width="36" height="42" viewBox="0 0 36 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="18" width="30" height="22" rx="4" fill="rgba(255,102,0,0.15)" stroke="rgba(255,102,0,0.7)" strokeWidth="1.8"/>
            <path d="M9 18V13C9 8.03 12.13 5 18 5C23.87 5 27 8.03 27 13V18" stroke="rgba(255,102,0,0.7)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            <circle cx="18" cy="28" r="3.5" fill="rgba(255,102,0,0.8)"/>
            <rect x="16.5" y="30" width="3" height="5" rx="1.5" fill="rgba(255,102,0,0.6)"/>
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(255,102,0,0.7)' }}>Restricted Access</div>
          <div style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #ffffff 30%, rgba(255,255,255,0.55))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Analysis Suite</div>
          <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.38)', maxWidth: '300px' }}>This module is locked. Upgrade your plan or contact an administrator to gain access.</div>
        </div>
        <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,102,0,0.15), transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', background: 'rgba(255,102,0,0.06)', border: '1px solid rgba(255,102,0,0.15)', borderRadius: '100px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ff6600', boxShadow: '0 0 8px rgba(255,102,0,0.8)' }} />
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', color: 'rgba(255,102,0,0.75)', textTransform: 'uppercase' }}>Premium Feature</span>
        </div>
      </div>
    </div>
  )`

    f = f.slice(0, mobileIdx) + lockBlock + f.slice(mobileIdx)
    writeFileSync(path, f)
    console.log('analysis-suite: done')
}

// ── AI Suite ─────────────────────────────────────────────────────────────────
{
    const path = 'c:/Users/zakho/Documents/bloomberg-terminal/src/app/ai-suite/page.tsx'
    let f = readFileSync(path, 'utf8')

    // Find the existing LOCKED block placement (it was inserted before the main return)
    // Check if it's already before the mobile layout or not
    const lockedIdx = f.indexOf('const LOCKED = true')
    const mobileCheck = f.indexOf('if (isMobile)')
    console.log('ai-suite: LOCKED at char', lockedIdx, '| isMobile check at char', mobileCheck)

    if (lockedIdx > mobileCheck && mobileCheck !== -1) {
        console.log('ai-suite: LOCKED is after isMobile — needs fix')
    } else {
        console.log('ai-suite: LOCKED position looks OK, verifying...')
    }

    // For ai-suite, remove current LOCKED block and re-insert before any mobile check
    // First find where LOCKED block ends (before the real return)
    const realReturn = '\n\n  return (\n    <div style={{\n      display: \'flex\', flexDirection: \'column\', height: \'100%\','
    const lockedBlockStart = f.indexOf('\n\n  const LOCKED = true')
    const realReturnIdx = f.indexOf(realReturn, lockedBlockStart)

    if (lockedBlockStart === -1 || realReturnIdx === -1) {
        console.log('ai-suite: markers not found, skipping')
        process.exit(0)
    }

    // Remove current locked block
    f = f.slice(0, lockedBlockStart) + realReturn + f.slice(realReturnIdx + realReturn.length)

    // Find the function's first early-return or mobile block to insert before
    // Look for where to insert: before the first isMobile check or before first return
    const insertBefore = f.indexOf('\n\n  return (\n    <div style={{\n      display: \'flex\', flexDirection: \'column\', height: \'100%\',')

    const lockBlock = `

  const LOCKED = true

  if (LOCKED) return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 40%, #050d1a 0%, #000508 100%)',
      fontFamily: '"Inter", system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '500px', background: 'radial-gradient(ellipse, rgba(255,102,0,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '28px', padding: '56px 48px', background: 'linear-gradient(145deg, rgba(10,18,32,0.95), rgba(4,8,16,0.98))', border: '1px solid rgba(255,102,0,0.18)', borderRadius: '20px', boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
        <div style={{ width: '88px', height: '88px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, rgba(255,102,0,0.12), rgba(255,102,0,0.04))', border: '1px solid rgba(255,102,0,0.25)', borderRadius: '50%', boxShadow: '0 0 30px rgba(255,102,0,0.1)' }}>
          <svg width="36" height="42" viewBox="0 0 36 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="18" width="30" height="22" rx="4" fill="rgba(255,102,0,0.15)" stroke="rgba(255,102,0,0.7)" strokeWidth="1.8"/>
            <path d="M9 18V13C9 8.03 12.13 5 18 5C23.87 5 27 8.03 27 13V18" stroke="rgba(255,102,0,0.7)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            <circle cx="18" cy="28" r="3.5" fill="rgba(255,102,0,0.8)"/>
            <rect x="16.5" y="30" width="3" height="5" rx="1.5" fill="rgba(255,102,0,0.6)"/>
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(255,102,0,0.7)' }}>Restricted Access</div>
          <div style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #ffffff 30%, rgba(255,255,255,0.55))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>AI Suite</div>
          <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'rgba(255,255,255,0.38)', maxWidth: '300px' }}>This module is locked. Upgrade your plan or contact an administrator to gain access.</div>
        </div>
        <div style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,102,0,0.15), transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', background: 'rgba(255,102,0,0.06)', border: '1px solid rgba(255,102,0,0.15)', borderRadius: '100px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ff6600', boxShadow: '0 0 8px rgba(255,102,0,0.8)' }} />
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', color: 'rgba(255,102,0,0.75)', textTransform: 'uppercase' }}>Premium Feature</span>
        </div>
      </div>
    </div>
  )`

    f = f.slice(0, insertBefore) + lockBlock + f.slice(insertBefore)
    writeFileSync(path, f)
    console.log('ai-suite: done')
}
