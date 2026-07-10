'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const ADMIN_ONLY_PATHS = [
  '/analysis-suite',
  '/ai-suite',
  '/analytics',
  '/data-driven',
  '/market-overview',
  '/dealers-workbench',
  '/rrg-screener',
  '/ai-trades',
]

function getCookieAuthLevel(): 'none' | 'user' | 'admin' {
  if (typeof document === 'undefined') return 'none'
  const cookies = document.cookie.split(';')
  // Read efi-level (non-httpOnly UX cookie). The real security enforcement
  // is in middleware which reads the httpOnly efi-auth cookie instead.
  const levelCookie = cookies.find((c) => c.trim().startsWith('efi-level='))
  const val = levelCookie?.split('=')[1]?.trim()
  if (val === 'admin') return 'admin'
  // Also accept legacy efi-auth=authenticated/admin for existing sessions
  const authCookie = cookies.find((c) => c.trim().startsWith('efi-auth='))
  const authVal = authCookie?.split('=')[1]?.trim()
  if (authVal === 'admin') return 'admin'
  if (val === 'user' || authVal === 'authenticated') return 'user'
  return 'none'
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    const publicPaths = ['/login', '/']
    if (publicPaths.includes(pathname)) {
      setAllowed(true)
      return
    }

    const level = getCookieAuthLevel()

    if (level === 'none') {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
      setAllowed(false)
      return
    }

    const isAdminOnly = ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p))
    if (isAdminOnly && level !== 'admin') {
      router.replace('/options-flow')
      setAllowed(false)
      return
    }

    setAllowed(true)
  }, [pathname, router])

  // Block render until auth check completes — prevents content flash on protected pages
  if (allowed === false) return null
  return <>{children}</>
}
