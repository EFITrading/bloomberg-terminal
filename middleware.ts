import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// The password for accessing the site
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'efitrading2025';

// Public paths that don't require authentication - ONLY landing page and essential assets
const publicPaths = [
  '/', // Only the main landing page
  '/login', // Login page
  '/favicon.ico', // Favicon
  '/_next', // Next.js static assets
  '/images', // Static images
  '/api' // All API routes should be accessible
];

// Protected paths that require authentication (all navigation pages)
const protectedPaths = [
  '/market-overview',
  '/analysis-suite', 
  '/data-driven',
  '/analytics',
  '/ai-suite',
  '/options-flow',
  '/optionsflow', // Alternative spelling
  '/seasonax',
  '/terminal'
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow public paths and static assets (includes root path "/")
  if (publicPaths.some(path => pathname === path || (path !== '/' && pathname.startsWith(path)))) {
    return addSecurityHeaders(NextResponse.next());
  }
  
  // All other paths require authentication
  const authCookie = request.cookies.get('efi-auth');
  
  if (!authCookie || authCookie.value !== 'authenticated') {
    // Redirect to login page with the current path as redirect parameter
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  return addSecurityHeaders(NextResponse.next());
}

function addSecurityHeaders(response: NextResponse) {
  // Log the request for security monitoring (optional)
  if (process.env.NODE_ENV === 'development') {
    console.log(`EFI Security middleware active`)
  }

  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https:; " +
      "style-src 'self' 'unsafe-inline' https:; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' https:; " +
      "connect-src 'self' https: wss:; " +
      "frame-ancestors 'none';"
  )

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // HSTS (only in production)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
