import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    const { msg } = await req.json()
    process.stdout.write(msg + '\n')
    return NextResponse.json({ ok: true })
}
