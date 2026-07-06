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

      response.cookies.set('efi-auth', isAdmin ? 'admin' : 'authenticated', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400,
        path: '/',
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

  // Clear the authentication cookie
  response.cookies.set('efi-auth', '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })

  return response
}
