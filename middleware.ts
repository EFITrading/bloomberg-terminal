import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow NextAuth.js routes and auth pages
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/auth/')) {
    return addSecurityHeaders(NextResponse.next());
  }
  
  // Allow static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/public')) {
    return addSecurityHeaders(NextResponse.next());
  }
  
  // Check if user is authenticated via NextAuth
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });
  
  // If not authenticated, redirect to sign-in
  if (!token) {
    const url = new URL('/auth/signin', request.url);
    return NextResponse.redirect(url);
  }
  
  // If authenticated but no access, redirect to no-access page
  if (!token.hasAccess) {
    const url = new URL('/auth/no-access', request.url);
    return NextResponse.redirect(url);
  }
  
  // User has access, continue with security headers
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
