import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'gex-scan', 'latest.json');

export async function GET(request: NextRequest) {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return NextResponse.json({
        success: false,
        error: 'No GEX scan data available. Background scan will run at 9:47 AM and 3:43 PM ET.'
      });
    }

    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    const scanData = JSON.parse(data);

    return NextResponse.json({
      success: true,
      data: scanData.results,
      timestamp: scanData.timestamp,
      scanType: scanData.scanType,
      scanned: scanData.scanned
    });

  } catch (error) {
    console.error('GEX Latest Data API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
