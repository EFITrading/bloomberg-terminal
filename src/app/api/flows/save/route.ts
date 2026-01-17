import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { date, data } = await request.json();
    
    if (!date || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: date, data' },
        { status: 400 }
      );
    }

    // Calculate size
    const dataString = JSON.stringify(data);
    const size = new Blob([dataString]).size;

    // Upsert: create if doesn't exist, update if it does
    const flow = await prisma.flow.upsert({
      where: { date },
      update: {
        data: dataString,
        size,
      },
      create: {
        date,
        data: dataString,
        size,
      },
    });

    // Delete flows older than 5 days
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    await prisma.flow.deleteMany({
      where: {
        createdAt: {
          lt: fiveDaysAgo,
        },
      },
    });

    return NextResponse.json({ 
      success: true, 
      date: flow.date,
      size: flow.size 
    });
  } catch (error) {
    console.error('Error saving flow:', error);
    return NextResponse.json(
      { error: 'Failed to save flow' },
      { status: 500 }
    );
  }
}
