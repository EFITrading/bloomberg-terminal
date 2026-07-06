'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

function getCookieAuth(): boolean {
  if (typeof document === 'undefined') return false
  const cookies = document.cookie.split(';')
  const authCookie = cookies.find((c) => c.trim().startsWith('efi-auth='))
  return authCookie ? ['authenticated', 'admin'].includes(authCookie.split('=')[1]?.trim()) : false
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const publicPaths = ['/login', '/']
    if (publicPaths.includes(pathname)) return
    if (!getCookieAuth()) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [pathname, router])

  // Always render children on initial render so server HTML matches client HTML.
  // The useEffect above handles unauthenticated redirects after hydration.
  return <>{children}</>
}
