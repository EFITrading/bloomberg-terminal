import { NextRequest, NextResponse } from 'next/server'

import { getOrCreateAnonUserId } from '@/lib/anonUser'
import prisma from '@/lib/prisma'

// PATCH: owner-only partial update (e.g. toggle visibility, rename, edit code).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const userId = await getOrCreateAnonUserId()
        const existing = await prisma.aiSuiteScript.findUnique({ where: { id } })
        if (!existing || existing.userId !== userId) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        const body = await req.json()
        const data: Record<string, unknown> = {}
        if (typeof body.name === 'string') data.name = body.name
        if (typeof body.code === 'string') data.code = body.code
        if (typeof body.description === 'string' || body.description === null) data.description = body.description
        if (typeof body.tags === 'string' || body.tags === null) data.tags = body.tags
        if (body.visibility === 'private' || body.visibility === 'shared') data.visibility = body.visibility

        const updated = await prisma.aiSuiteScript.update({ where: { id }, data })
        return NextResponse.json({ script: updated })
    } catch (err) {
        console.error('[ai-suite/scripts/[id] PATCH]', err)
        return NextResponse.json({ error: 'Failed to update script' }, { status: 500 })
    }
}

// DELETE: owner-only.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const userId = await getOrCreateAnonUserId()
        const existing = await prisma.aiSuiteScript.findUnique({ where: { id } })
        if (!existing || existing.userId !== userId) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        await prisma.aiSuiteScript.delete({ where: { id } })
        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[ai-suite/scripts/[id] DELETE]', err)
        return NextResponse.json({ error: 'Failed to delete script' }, { status: 500 })
    }
}
