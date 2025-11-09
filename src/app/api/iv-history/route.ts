import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'iv-history');

interface IVSnapshot {
  date: string;
  time: string;
  timestamp: number;
  callIV: number;
  putIV: number;
  price: number;
  expiration: string;
  scanType: 'OPEN' | 'CLOSE';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase();

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const filePath = path.join(DATA_DIR, `${ticker}.json`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        success: false,
        error: 'No historical IV data available for this ticker. Data collection starts after first scan.'
      });
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    const history: IVSnapshot[] = JSON.parse(data);

    // Format for chart display
    const chartData = history.map(snapshot => ({
      date: snapshot.date,
      time: snapshot.time,
      callIV: snapshot.callIV,
      putIV: snapshot.putIV,
      price: snapshot.price,
      expiration: snapshot.expiration,
      scanType: snapshot.scanType
    }));

    // Get latest values
    const latest = history[history.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        ticker,
        currentPrice: latest?.price || 0,
        callIV: latest?.callIV || 0,
        putIV: latest?.putIV || 0,
        expiration: latest?.expiration || '',
        date: latest?.date || '',
        weeksTarget: 3,
        history: chartData,
        dataPoints: chartData.length
      }
    });

  } catch (error) {
    console.error('IV History API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
