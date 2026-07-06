import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/', '/auth', '/api/auth', '/api/health', '/api/cron']
const COLLECTOR_SECRET = process.env.COLLECTOR_SECRET

function isAuthenticated(request: NextRequest): boolean {
  if (request.cookies.get('efi-auth')?.value === 'authenticated') return true
  if (COLLECTOR_SECRET && request.headers.get('x-collector-secret') === COLLECTOR_SECRET) return true
  return false
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/icons') || pathname.startsWith('/loading') || pathname.startsWith('/workers')) {
    return NextResponse.next()
  }

  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  if (!isAuthenticated(request)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const LOCKED_PAGES = ['/analysis-suite', '/ai-suite', '/analytics', '/data-driven', '/market-overview', '/dealers-workbench', '/rrg-screener', '/ai-trades']
  if (LOCKED_PAGES.some(p => pathname.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/options-flow'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
