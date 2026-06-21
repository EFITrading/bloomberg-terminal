import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const m = req.nextUrl.searchParams.get('m') ?? ''
    console.log('\x1b[33m[DRAG]\x1b[0m', m)
    return NextResponse.json({ ok: true })
}
