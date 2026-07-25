import { promisify } from 'util'
import { gunzip } from 'zlib'

import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

const gunzipAsync = promisify(gunzip)

export const runtime = 'nodejs'

// Loads the saved end-of-day SweepSense snapshot for a given trading date.
// Returns 404 if none was saved yet for that day (e.g. before market close,
// or the very first afterhours load before the save trigger has fired).
export async function GET(request: NextRequest) {
  try {
    const tradingDate = request.nextUrl.searchParams.get('date')
    if (!tradingDate) {
      return NextResponse.json({ error: 'date query param is required' }, { status: 400 })
    }

    const snapshot = await prisma.sweepSenseSnapshot.findUnique({ where: { tradingDate } })
    if (!snapshot) {
      return NextResponse.json({ error: 'SweepSense snapshot not found' }, { status: 404 })
    }

    const compressedBuffer = Buffer.from(snapshot.data, 'base64')
    const decompressed = await gunzipAsync(compressedBuffer)
    const data = JSON.parse(decompressed.toString('utf8'))

    return NextResponse.json({
      tradingDate: snapshot.tradingDate,
      data,
      tradeCount: snapshot.tradeCount,
      updatedAt: snapshot.updatedAt,
    })
  } catch (error) {
    console.error('Error loading SweepSense snapshot:', error)
    return NextResponse.json({ error: 'Failed to load SweepSense snapshot' }, { status: 500 })
  }
}
