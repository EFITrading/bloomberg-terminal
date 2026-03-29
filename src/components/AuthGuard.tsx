'use client'

import { useEffect } from 'react'

import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'

function getCookieAuth(): boolean {
  if (typeof document === 'undefined') return false
  const cookies = document.cookie.split(';')
  const authCookie = cookies.find((c) => c.trim().startsWith('efi-auth='))
  return authCookie ? authCookie.split('=')[1]?.trim() === 'authenticated' : false
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const publicPaths = ['/login', '/']
    const isPublicPath = publicPaths.includes(pathname)

    if (status === 'loading') return

    const cookieAuth = getCookieAuth()
    const hasAccess = (session as any)?.hasAccess || cookieAuth

    if (!isPublicPath && !hasAccess) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [session, status, pathname, router])

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-orange-500 text-xl">Loading...</div>
      </div>
    )
  }

  // Show children if authenticated or on public path
  const publicPaths = ['/login', '/']
  const cookieAuth = getCookieAuth()
  if (publicPaths.includes(pathname) || (session as any)?.hasAccess || cookieAuth) {
    return <>{children}</>
  }

  // Show nothing while redirecting
  return null
}
