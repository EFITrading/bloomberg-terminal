import { NextRequest, NextResponse } from 'next/server';

// Database storage has been removed - this endpoint is no longer functional

export async function GET(request: NextRequest) {
 console.log('⚠️ Flow history API called but database storage has been disabled');
 
 return NextResponse.json({ 
 success: false, 
 error: 'Database storage has been disabled',
 message: 'Historical flow data is no longer available. Database storage was removed.'
 }, { status: 501 });
}