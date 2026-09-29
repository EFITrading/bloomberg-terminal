import { NextRequest, NextResponse } from 'next/server'

import { getOrCreateAnonUserId } from '@/lib/anonUser'
import prisma from '@/lib/prisma'

// GET: list this user's own scripts (any visibility) + everyone else's shared scripts.
export async function GET() {
    try {
        const userId = await getOrCreateAnonUserId()
        const [mine, shared] = await Promise.all([
            prisma.aiSuiteScript.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
            prisma.aiSuiteScript.findMany({ where: { visibility: 'shared', userId: { not: userId } }, orderBy: { updatedAt: 'desc' } }),
        ])
        return NextResponse.json({ mine, shared })
    } catch (err) {
        console.error('[ai-suite/scripts GET]', err)
        return NextResponse.json({ error: 'Failed to load scripts' }, { status: 500 })
    }
}

// POST: create a new script, or update one the caller owns (pass `id` to update).
export async function POST(req: NextRequest) {
    try {
        const userId = await getOrCreateAnonUserId()
        const body = await req.json()
        const { id, name, code, description, tags, visibility } = body

        if (!name || typeof code !== 'string') {
            return NextResponse.json({ error: 'Missing name or code' }, { status: 400 })
        }
        const vis = visibility === 'shared' ? 'shared' : 'private'

        if (id) {
            const existing = await prisma.aiSuiteScript.findUnique({ where: { id } })
            if (!existing || existing.userId !== userId) {
                return NextResponse.json({ error: 'Not found' }, { status: 404 })
            }
            const updated = await prisma.aiSuiteScript.update({
                where: { id },
                data: { name, code, description: description ?? null, tags: tags ?? null, visibility: vis },
            })
            return NextResponse.json({ script: updated })
        }

        const created = await prisma.aiSuiteScript.create({
            data: { userId, name, code, description: description ?? null, tags: tags ?? null, visibility: vis },
        })
        return NextResponse.json({ script: created })
    } catch (err) {
        console.error('[ai-suite/scripts POST]', err)
        return NextResponse.json({ error: 'Failed to save script' }, { status: 500 })
    }
}
