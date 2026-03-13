import { NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const flows = await prisma.flow.findMany({
      select: {
        date: true,
        size: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const result = flows.map((flow) => ({
      date: flow.date,
      createdAt: flow.createdAt,
      // New saves store trade count in size field (small number).
      // Old saves stored raw byte size (millions) — return null for those.
      tradeCount: flow.size < 100000 ? flow.size : null,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching flow dates:', error)
    return NextResponse.json({ error: 'Failed to fetch flow dates' }, { status: 500 })
  }
}
