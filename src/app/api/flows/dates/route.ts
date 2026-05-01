import { NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    console.log('[/api/flows/dates] Query starting...')

    // Raw query first to verify DB connection and actual row count
    const rawCount = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM "Flow"`
    console.log('[/api/flows/dates] Raw SQL COUNT:', rawCount[0]?.count?.toString())

    const flows = await prisma.flow.findMany({
      select: {
        id: true,
        date: true,
        size: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    console.log('[/api/flows/dates] findMany returned:', flows.length, 'records')
    flows.forEach((f, i) => {
      console.log(`  [${i}] id=${f.id} | date=${f.date} | createdAt=${f.createdAt} | size=${f.size}`)
    })

    const result = flows.map((flow) => ({
      date: flow.date,
      createdAt: flow.createdAt,
      tradeCount: flow.size < 100000 ? flow.size : null,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('[/api/flows/dates] ERROR:', error)
    return NextResponse.json({ error: 'Failed to fetch flow dates', detail: String(error) }, { status: 500 })
  }
}
