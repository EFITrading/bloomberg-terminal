import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

async function getPortfolioKey(): Promise<string> {
    try {
        const session = await getServerSession()
        return session?.user?.email ?? 'default'
    } catch {
        return 'default'
    }
}

export async function GET() {
    try {
        const userId = await getPortfolioKey()
        const record = await prisma.portfolioData.findUnique({ where: { userId } })
        if (!record) return NextResponse.json({ data: null })
        return NextResponse.json({ data: JSON.parse(record.data) })
    } catch (err) {
        console.error('[portfolio GET]', err)
        return NextResponse.json({ error: 'Failed to load portfolio' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { trades, alerts, notes, cashBalance, equityHistory } = body

        if (trades === undefined) {
            return NextResponse.json({ error: 'Missing portfolio data' }, { status: 400 })
        }

        const userId = await getPortfolioKey()
        const data = JSON.stringify({ trades, alerts, notes, cashBalance, equityHistory })

        await prisma.portfolioData.upsert({
            where: { userId },
            update: { data },
            create: { userId, data },
        })

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[portfolio POST]', err)
        return NextResponse.json({ error: 'Failed to save portfolio' }, { status: 500 })
    }
}
