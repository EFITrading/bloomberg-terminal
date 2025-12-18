import { NextRequest, NextResponse } from 'next/server';
import { createCanvas } from 'canvas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface DailyData {
  dayOfYear: number;
  month: number;
  day: number;
  averageReturn: number;
  cumulativeReturn: number;
  positiveYears: number;
  totalYears: number;
}

interface SeasonalData {
  symbol: string;
  companyName?: string;
  yearsOfData: number;
  dailyData: DailyData[];
  statistics?: any;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const years = parseInt(searchParams.get('years') || '20');
    const electionMode = searchParams.get('electionMode');

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    // Fetch seasonal data
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    let dataUrl = `${baseUrl}/api/seasonal-data?symbol=${symbol}&years=${years}`;
    
    if (electionMode) {
      dataUrl += `&electionMode=${encodeURIComponent(electionMode)}`;
    }

    const response = await fetch(dataUrl);
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch seasonal data' }, { status: 500 });
    }

    const seasonalData: SeasonalData = await response.json();

    if (!seasonalData || !seasonalData.dailyData || seasonalData.dailyData.length === 0) {
      return NextResponse.json({ error: 'No seasonal data available' }, { status: 404 });
    }

    // Generate chart image
    const imageBuffer = await generateSeasonalChartImage(seasonalData, electionMode || undefined);

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error generating seasonal chart:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function generateSeasonalChartImage(data: SeasonalData, electionMode?: string): Promise<Buffer> {
  const scale = 2;
  const width = 1200 * scale;
  const height = 600 * scale;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  ctx.scale(scale, scale);
  
  const baseWidth = 1200;
  const baseHeight = 600;
  const padding = { top: 80, right: 60, bottom: 60, left: 80 };
  const chartWidth = baseWidth - padding.left - padding.right;
  const chartHeight = baseHeight - padding.top - padding.bottom;

  // Background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, baseWidth, baseHeight);

  // Title
  ctx.fillStyle = '#ff8500';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(`${data.symbol} - ${data.yearsOfData}Y Seasonal Pattern`, 20, 40);
  
  if (electionMode) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.fillText(`Election Mode: ${electionMode}`, 20, 65);
  }

  // Apply detrending - remove linear trend from cumulative returns
  const dailyData = data.dailyData.map(d => ({ ...d }));
  
  // Calculate linear trend
  const n = dailyData.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = dailyData[i].cumulativeReturn;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Detrend the data
  for (let i = 0; i < dailyData.length; i++) {
    const trend = slope * i + intercept;
    dailyData[i].cumulativeReturn -= trend;
  }

  // Find data range after detrending
  const returns = dailyData.map(d => d.cumulativeReturn);
  const minReturn = Math.min(...returns);
  const maxReturn = Math.max(...returns);
  const returnRange = maxReturn - minReturn;
  const yPadding = returnRange * 0.1;

  // Draw grid
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  
  // Horizontal grid lines (5 lines)
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
    
    // Y-axis labels
    const value = maxReturn + yPadding - ((maxReturn + yPadding - (minReturn - yPadding)) / 5) * i;
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${value.toFixed(1)}%`, padding.left - 10, y + 4);
  }

  // Vertical grid lines (12 months)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i <= 12; i++) {
    const x = padding.left + (chartWidth / 12) * i;
    ctx.strokeStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();
    
    // X-axis labels
    if (i < 12) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(months[i], x + (chartWidth / 24), padding.top + chartHeight + 20);
    }
  }

  // Draw axes
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  // Draw zero line
  const zeroY = padding.top + chartHeight - ((0 - (minReturn - yPadding)) / (maxReturn + yPadding - (minReturn - yPadding))) * chartHeight;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(padding.left + chartWidth, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw current date vertical line
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const currentDayX = padding.left + (dayOfYear / 365) * chartWidth;
  
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(currentDayX, padding.top);
  ctx.lineTo(currentDayX, padding.top + chartHeight);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Current date label
  ctx.fillStyle = '#22c55e';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Today', currentDayX, padding.top - 10);

  // Draw seasonal line
  ctx.strokeStyle = '#ff8500';
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  dailyData.forEach((point, index) => {
    const x = padding.left + (point.dayOfYear / 365) * chartWidth;
    const y = padding.top + chartHeight - ((point.cumulativeReturn - (minReturn - yPadding)) / (maxReturn + yPadding - (minReturn - yPadding))) * chartHeight;
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();

  // Draw positive/negative fill
  ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
  ctx.beginPath();
  dailyData.forEach((point, index) => {
    const x = padding.left + (point.dayOfYear / 365) * chartWidth;
    const y = padding.top + chartHeight - ((point.cumulativeReturn - (minReturn - yPadding)) / (maxReturn + yPadding - (minReturn - yPadding))) * chartHeight;
    
    if (index === 0) {
      ctx.moveTo(x, zeroY);
      ctx.lineTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.lineTo(padding.left + chartWidth, zeroY);
  ctx.closePath();
  ctx.fill();

  // Legend
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Years: ${data.yearsOfData}`, baseWidth - 200, 30);
  ctx.fillText(`Detrended: Yes`, baseWidth - 200, 50);
  
  // Final return
  const finalReturn = dailyData[dailyData.length - 1]?.cumulativeReturn || 0;
  const returnColor = finalReturn >= 0 ? '#22c55e' : '#ef4444';
  ctx.fillStyle = returnColor;
  ctx.fillText(`Return: ${finalReturn.toFixed(2)}%`, baseWidth - 200, 70);

  return canvas.toBuffer('image/png');
}
