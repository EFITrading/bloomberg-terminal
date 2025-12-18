import { NextRequest, NextResponse } from 'next/server';
import { createCanvas } from 'canvas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RangeData {
  currentPrice: number;
  expiration: string;
  dte: number;
  iv: number;
  ranges: {
    probability: number;
    low: number;
    high: number;
    rangeWidth: number;
    downside: number;
    downsidePercent: number;
    upside: number;
    upsidePercent: number;
  }[];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const date = searchParams.get('date');

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    // Fetch range data from existing API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    let dataUrl = `${baseUrl}/api/expected-range?symbol=${symbol}`;
    
    if (date) {
      dataUrl += `&date=${date}`;
    }

    const response = await fetch(dataUrl);
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch range data' }, { status: 500 });
    }

    const rangeData: RangeData = await response.json();

    if (!rangeData || !rangeData.ranges) {
      return NextResponse.json({ error: 'No range data available' }, { status: 404 });
    }

    // Generate chart image
    const imageBuffer = await generateRangeImage(rangeData, symbol);

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Error generating range chart:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function generateRangeImage(data: RangeData, symbol: string): Promise<Buffer> {
  const scale = 2;
  const width = 1350 * scale;
  const height = 300 * scale;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  ctx.scale(scale, scale);
  
  const baseWidth = 1350;
  const baseHeight = 300;
  const padding = { top: 60, right: 40, bottom: 20, left: 20 };

  // Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, baseWidth, baseHeight);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial';
  ctx.fillText(`${symbol} - Weekly Expected Range`, 20, 30);
  
  // Subtitle
  ctx.font = '14px Arial';
  const subtitle = `Current Price: $${data.currentPrice.toFixed(2)} | Expiration: ${data.expiration} | DTE: ${data.dte} | IV: ${data.iv.toFixed(1)}%`;
  ctx.fillText(subtitle, 20, 50);

  // Table headers
  const headerY = padding.top + 10;
  const colWidths = [130, 120, 120, 180, 240, 240];
  let colX = 20;
  
  ctx.fillStyle = '#ff8500';
  ctx.font = 'bold 13px Arial';
  
  const headers = ['PROBABILITY', 'LOW', 'HIGH', 'RANGE WIDTH', 'DOWNSIDE', 'UPSIDE'];
  headers.forEach((header, i) => {
    ctx.fillText(header, colX, headerY);
    colX += colWidths[i];
  });

  // Draw header line
  ctx.strokeStyle = '#ff8500';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, headerY + 5);
  ctx.lineTo(baseWidth - 20, headerY + 5);
  ctx.stroke();

  // Draw rows
  let rowY = headerY + 30;
  const rowHeight = 50;
  
  data.ranges.forEach((range, index) => {
    // Alternating row background
    if (index % 2 === 0) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(15, rowY - 20, baseWidth - 30, rowHeight);
    }

    colX = 20;
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px Arial';
    
    // Probability
    ctx.fillText(`${range.probability}%`, colX, rowY);
    colX += colWidths[0];
    
    // Low
    ctx.fillText(`$${range.low.toFixed(2)}`, colX, rowY);
    colX += colWidths[1];
    
    // High
    ctx.fillText(`$${range.high.toFixed(2)}`, colX, rowY);
    colX += colWidths[2];
    
    // Range Width
    ctx.fillText(`$${range.rangeWidth.toFixed(2)} (${(range.rangeWidth / data.currentPrice * 100).toFixed(1)}%)`, colX, rowY);
    colX += colWidths[3];
    
    // Downside
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`-$${Math.abs(range.downside).toFixed(2)} (${range.downsidePercent.toFixed(1)}%)`, colX, rowY);
    colX += colWidths[4];
    
    // Upside
    ctx.fillStyle = '#22c55e';
    ctx.fillText(`+$${range.upside.toFixed(2)} (+${range.upsidePercent.toFixed(1)}%)`, colX, rowY);
    
    rowY += rowHeight;
  });

  return canvas.toBuffer('image/png');
}
