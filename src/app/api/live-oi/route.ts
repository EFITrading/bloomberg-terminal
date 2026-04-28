import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

// GET /api/live-oi?ticker=AAPL&date=2026-04-28
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const ticker = searchParams.get('ticker')?.toUpperCase()
        const tradingDate = searchParams.get('date')

        if (!ticker || !tradingDate) {
            return NextResponse.json({ error: 'ticker and date are required' }, { status: 400 })
        }

        const record = await prisma.liveOICache.findUnique({
            where: { ticker_tradingDate: { ticker, tradingDate } },
        })

        if (!record) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }

        return NextResponse.json({
            ticker,
            tradingDate,
            entries: JSON.parse(record.data),
            updatedAt: record.updatedAt,
        })
    } catch (error) {
        console.error('[live-oi GET]', error)
        return NextResponse.json({ error: 'Failed to fetch live OI' }, { status: 500 })
    }
}

// POST /api/live-oi
// Body: { ticker: string, tradingDate: string, entries: [string, number][] }
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { ticker, tradingDate, entries } = body as {
            ticker: string
            tradingDate: string
            entries: [string, number][]
        }

        if (!ticker || !tradingDate || !Array.isArray(entries)) {
            return NextResponse.json({ error: 'ticker, tradingDate, and entries are required' }, { status: 400 })
        }

        const record = await prisma.liveOICache.upsert({
            where: { ticker_tradingDate: { ticker: ticker.toUpperCase(), tradingDate } },
            update: { data: JSON.stringify(entries) },
            create: { ticker: ticker.toUpperCase(), tradingDate, data: JSON.stringify(entries) },
            select: { ticker: true, tradingDate: true, updatedAt: true },
        })

        return NextResponse.json({ success: true, ...record })
    } catch (error) {
        console.error('[live-oi POST]', error)
        return NextResponse.json({ error: 'Failed to save live OI' }, { status: 500 })
    }
}
