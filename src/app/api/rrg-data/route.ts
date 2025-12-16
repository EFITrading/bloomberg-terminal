// Removed - AI chatbot RRG integration no longer exists
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({ error: 'This endpoint is no longer available' }, { status: 404 });
}
