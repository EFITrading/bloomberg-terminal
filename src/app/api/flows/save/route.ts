import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { date, data } = await request.json();
    
    if (!date || !data) {
      return NextResponse.json(
        { error: 'Date and data are required' },
        { status: 400 }
      );
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    const dataString = JSON.stringify(data);
    const size = Buffer.byteLength(dataString, 'utf8');

    // Upsert the flow data
    const flow = await prisma.flow.upsert({
      where: { date: dateObj.toISOString() },
      update: { data: dataString, size },
      create: { date: dateObj.toISOString(), data: dataString, size },
    });

    // Clean up flows older than 5 days
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    await prisma.flow.deleteMany({
      where: {
        createdAt: {
          lt: fiveDaysAgo,
        },
      },
    });

    return NextResponse.json({ success: true, flow });
  } catch (error) {
    console.error('Error saving flow:', error);
    return NextResponse.json(
      { error: 'Failed to save flow' },
      { status: 500 }
    );
  }
}
