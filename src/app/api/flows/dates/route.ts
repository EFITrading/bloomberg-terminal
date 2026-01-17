import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const flows = await prisma.flow.findMany({
      select: {
        date: true,
        size: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ flows });
  } catch (error) {
    console.error('Error fetching flow dates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flow dates' },
      { status: 500 }
    );
  }
}
