import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prismaDPBulk: PrismaClient }
const prisma = globalForPrisma.prismaDPBulk ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaDPBulk = prisma

// GET /api/dark-pool-cache/bulk
// Returns all cached ticker rows in a single query.
// Response: { rows: { key: string; days: DPDay[] }[] }
export async function GET() {
    try {
        const rows = await prisma.darkPoolCache.findMany({
            select: { key: true, data: true },
        })
        const parsed = rows.map(r => {
            try {
                const d = JSON.parse(r.data)
                return { key: r.key, days: d.days ?? [] }
            } catch {
                return { key: r.key, days: [] }
            }
        })
        return NextResponse.json({ rows: parsed })
    } catch {
        return NextResponse.json({ error: 'db error' }, { status: 500 })
    }
}
