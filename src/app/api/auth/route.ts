import { NextRequest, NextResponse } from 'next/server'

const SITE_PASSWORD = process.env.SITE_PASSWORD
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    const isAdmin = ADMIN_PASSWORD && password === ADMIN_PASSWORD
    const isUser = SITE_PASSWORD && password === SITE_PASSWORD

    if (isAdmin || isUser) {
      const response = NextResponse.json({
        success: true,
        message: 'Authentication successful',
      })

      const cookieOpts = {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        maxAge: 86400,
        path: '/',
      }

      // httpOnly — readable only by server/middleware, cannot be spoofed via JS
      response.cookies.set('efi-auth', isAdmin ? 'admin' : 'authenticated', {
        ...cookieOpts,
        httpOnly: true,
      })

      // Non-httpOnly — readable by AuthGuard client-side for UX redirects only
      // Even if spoofed, the middleware enforces the real httpOnly cookie
      response.cookies.set('efi-level', isAdmin ? 'admin' : 'user', {
        ...cookieOpts,
        httpOnly: false,
      })

      return response
    } else {
      return NextResponse.json({ success: false, message: 'Invalid password' }, { status: 401 })
    }
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Authentication error' }, { status: 500 })
  }
}

// Logout endpoint
export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  })

  const clearOpts = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 0,
    path: '/',
  }

  response.cookies.set('efi-auth', '', { ...clearOpts, httpOnly: true })
  response.cookies.set('efi-level', '', { ...clearOpts, httpOnly: false })

  return response
}
