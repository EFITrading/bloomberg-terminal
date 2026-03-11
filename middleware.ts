import { getToken } from 'next-auth/jwt'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes
  if (
    pathname.startsWith('/api') || // Allow all API routes (they handle their own auth)
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // Check password cookie FIRST — fast, no async needed
  const passwordCookie = request.cookies.get('efi-auth')
  const hasPasswordAccess = passwordCookie?.value === 'authenticated'

  if (hasPasswordAccess) {
    return NextResponse.next()
  }

  // Only call getToken if cookie check failed — avoids hanging/slow JWT verify on every request
  let tokenAccess = false
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    })
    tokenAccess = !!(token as any)?.hasAccess
  } catch (err) {
    console.error('[Middleware] getToken failed:', err)
  }

  if (tokenAccess) {
    return NextResponse.next()
  }

  // Redirect to login
  console.log('[Middleware] No access, redirecting to login from:', pathname)
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
