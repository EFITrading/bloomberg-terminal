'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

function getCookieAuth(): boolean {
  if (typeof document === 'undefined') return false
  const cookies = document.cookie.split(';')
  const authCookie = cookies.find((c) => c.trim().startsWith('efi-auth='))
  return authCookie ? authCookie.split('=')[1]?.trim() === 'authenticated' : false
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

  const publicPaths = ['/login', '/']
  if (publicPaths.includes(pathname) || getCookieAuth()) {
    return <>{children}</>
  }

  return null
}
