import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    // Test the exact same timestamp logic the worker should use
    const todayStart = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z').getTime();
    const todayNanos = todayStart * 1000000;
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      todayStart: todayStart,
      todayNanos: todayNanos,
      dateString: new Date().toISOString().split('T')[0],
      message: "This is what the worker should be using for timestamp filtering"
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message
    }, { status: 500 });
  }
}