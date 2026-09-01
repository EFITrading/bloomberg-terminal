'use client'

import { useEffect, useState } from 'react'

// Reusable admin-only lock. Unlike a CSS overlay, this never mounts `children`
// for non-admin users - so there's no DOM node to delete/hide via devtools to
// reveal the underlying feature, and no network requests are ever fired for it.
export default function AdminOnlyGate({
  children,
  label = 'Coming Soon',
  message = 'Members will gain access to these tools very soon, currently beta testing Seasonal Annual and Monthly charts only.',
}: {
  children: React.ReactNode
  label?: string
  message?: string
}) {
  // Fail-closed: starts locked until the cookie check resolves.
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const cookies = document.cookie.split(';')
    const levelCookie = cookies.find((c) => c.trim().startsWith('efi-level='))
    const authCookie = cookies.find((c) => c.trim().startsWith('efi-auth='))
    const level = levelCookie?.split('=')[1]?.trim()
    const auth = authCookie?.split('=')[1]?.trim()
    setIsAdmin(level === 'admin' || auth === 'admin')
  }, [])

  if (!isAdmin) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          height: '100%',
          minHeight: 240,
          width: '100%',
          background: '#000000',
          textAlign: 'center',
          padding: 24,
          boxSizing: 'border-box',
        }}
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <div style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: '"Roboto Mono", monospace' }}>
          {label}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, letterSpacing: '0.05em', maxWidth: 320 }}>
          {message}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
