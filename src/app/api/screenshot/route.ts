import puppeteer from 'puppeteer'

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Simple in-memory rate limit: max 10 requests per IP per minute
const rateLimitMap = new Map<string, { count: number; reset: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + 60_000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return new NextResponse('Rate limit exceeded', { status: 429 })
  }

  const searchParams = request.nextUrl.searchParams
  const ticker = searchParams.get('ticker')
  const type = searchParams.get('type') || 'efi'

  if (!ticker) {
    return new NextResponse('Ticker required', { status: 400 })
  }

  // Validate ticker format to prevent injection into URLs/Puppeteer navigation
  if (!/^[A-Z0-9.:^/]{1,20}$/i.test(ticker)) {
    return new NextResponse('Invalid ticker format', { status: 400 })
  }

  try {
    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()

    // Set viewport size
    await page.setViewport({ width: 1920, height: 1080 })

    // Navigate to options flow page
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'

    const url = `${baseUrl}/options-flow?ticker=${ticker}&efi=${type === 'efi'}`

    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    })

    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 })

    // Take screenshot of the main content area
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    })

    await browser.close()

    return new NextResponse(screenshot, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Screenshot error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new NextResponse(`Screenshot failed: ${message}`, { status: 500 })
  }
}
