import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { date: string } }
) {
  try {
    const { date } = params;

    const flow = await prisma.flow.findUnique({
      where: { date },
    });

    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      date: flow.date,
      data: JSON.parse(flow.data),
      size: flow.size,
      createdAt: flow.createdAt,
    });
  } catch (error) {
    console.error('Error fetching flow:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flow' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { date: string } }
) {
  try {
    const { date } = params;

    await prisma.flow.delete({
      where: { date },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting flow:', error);
    return NextResponse.json(
      { error: 'Failed to delete flow' },
      { status: 500 }
    );
  }
}
