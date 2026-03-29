import { NextRequest, NextResponse } from 'next/server'

const SITE_PASSWORD = process.env.SITE_PASSWORD

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    // Check if the provided password matches
    if (SITE_PASSWORD && password === SITE_PASSWORD) {
      // Create response with success
      const response = NextResponse.json({
        success: true,
        message: 'Authentication successful',
      })

      // Set secure cookie
      response.cookies.set('efi-auth', 'authenticated', {
        httpOnly: false, // Must stay false — client JS reads this cookie for UI state
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400, // 24 hours
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
