import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

// Use session email as key, fall back to "default" for unauthenticated
async function getLayoutKey(): Promise<string> {
  try {
    const session = await getServerSession()
    return session?.user?.email ?? 'default'
  } catch {
    return 'default'
  }
}

export async function GET() {
  try {
    const userId = await getLayoutKey()
    const record = await prisma.userLayout.findUnique({ where: { userId } })
    if (!record) return NextResponse.json({ data: null })
    return NextResponse.json({ data: JSON.parse(record.data) })
  } catch (err) {
    console.error('[layout GET]', err)
    return NextResponse.json({ error: 'Failed to load layout' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { panelOffsets, panelEnabled } = body

    if (!panelOffsets || !panelEnabled) {
      return NextResponse.json({ error: 'Missing layout data' }, { status: 400 })
    }

    const userId = await getLayoutKey()
    const data = JSON.stringify({ panelOffsets, panelEnabled })

    await prisma.userLayout.upsert({
      where: { userId },
      update: { data },
      create: { userId, data },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[layout POST]', err)
    return NextResponse.json({ error: 'Failed to save layout' }, { status: 500 })
  }
}
