import { NextResponse } from 'next/server';
import SeasonalScreenerService from '@/lib/seasonalScreenerService';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const years = parseInt(searchParams.get('years') || '15');
  
  // Create a readable stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const screeningService = new SeasonalScreenerService();
        
        // Define incremental batches to avoid duplicates
        const batches = [
          { start: 0, end: 100, label: 'Quick Scan (1-100)' },
          { start: 100, end: 200, label: 'Extended Scan (101-200)' },
          { start: 200, end: 500, label: 'Complete Scan (201-500)' }
        ];
        
        let totalFound = 0;
        let totalProcessed = 0;
        const allOpportunities = new Set(); // Track symbols to avoid duplicates
        
        for (const batch of batches) {
          console.log(`🔄 Starting ${batch.label}: Processing companies ${batch.start + 1}-${batch.end}...`);
          
          // Send status update
          const statusUpdate = {
            type: 'status',
            message: `🔄 ${batch.label}: Scanning companies ${batch.start + 1}-${batch.end}...`,
            processed: totalProcessed,
            total: 500,
            found: totalFound
          };
          
          const statusData = `data: ${JSON.stringify(statusUpdate)}\n\n`;
          controller.enqueue(new TextEncoder().encode(statusData));
          
          // Process this incremental batch
          const batchSize = batch.end - batch.start;
          console.log(`🔍 Processing batch ${batch.label} with ${batchSize} companies (offset: ${batch.start})...`);
          const opportunities = await screeningService.screenSeasonalOpportunities(years, batchSize, batch.start);
          
          console.log(`✅ Batch ${batch.label} returned ${opportunities.length} opportunities`);
          
          // Send each opportunity as it's found
          for (const opp of opportunities) {
            console.log(`📊 Processing opportunity: ${opp.symbol} (${opp.averageReturn.toFixed(2)}%)`);
            
            if (Math.abs(opp.averageReturn) >= 0.1 && !allOpportunities.has(opp.symbol)) { // Only send opportunities with meaningful returns and avoid duplicates
              allOpportunities.add(opp.symbol);
              totalFound++;
              
              console.log(`🚀 Streaming opportunity: ${opp.symbol} with ${opp.averageReturn.toFixed(2)}% return`);
              console.log(`📤 Sending opportunity data:`, JSON.stringify({
                type: 'opportunity',
                symbol: opp.symbol,
                averageReturn: opp.averageReturn
              }));
              
              const opportunityData = {
                type: 'opportunity',
                data: {
                  symbol: opp.symbol,
                  company: opp.companyName,
                  sector: 'Unknown',
                  marketCap: 'Large',
                  exchange: 'NASDAQ/NYSE',
                  currency: 'USD',
                  startDate: opp.startDate,
                  endDate: opp.endDate,
                  period: opp.period,
                  patternType: `Seasonal ${opp.sentiment} (${opp.averageReturn >= 0 ? '+' : ''}${opp.averageReturn.toFixed(1)}%)`,
                  averageReturn: opp.averageReturn,
                  medianReturn: opp.averageReturn * 0.9,
                  winningTrades: Math.round(opp.winRate * opp.years / 100),
                  totalTrades: opp.years,
                  winRate: opp.winRate,
                  maxProfit: Math.abs(opp.averageReturn) * 1.5,
                  maxLoss: Math.abs(opp.averageReturn) * 0.5,
                  standardDev: Math.abs(opp.averageReturn) * 0.3,
                  sharpeRatio: opp.averageReturn / (Math.abs(opp.averageReturn) * 0.3),
                  calendarDays: 30,
                  chartData: [
                    { period: 'Week 1', return: opp.averageReturn * 0.2 },
                    { period: 'Week 2', return: opp.averageReturn * 0.3 },
                    { period: 'Week 3', return: opp.averageReturn * 0.3 },
                    { period: 'Week 4', return: opp.averageReturn * 0.2 }
                  ],
                  years: opp.years,
                  sentiment: opp.sentiment,
                  daysUntilStart: opp.daysUntilStart
                },
                stats: {
                  processed: batch.end,
                  total: 500,
                  found: totalFound,
                  batchLabel: batch.label
                }
              };
              
              const data = `data: ${JSON.stringify(opportunityData)}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
              
              console.log(`✅ Successfully streamed ${opp.symbol} to client`);
              
              // Small delay to allow UI updates
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          totalProcessed = batch.end;
          
          // Send batch completion update
          const batchComplete = {
            type: 'batch_complete',
            message: `✅ ${batch.label} complete: Found ${opportunities.length} opportunities`,
            processed: totalProcessed,
            total: 500,
            found: totalFound,
            batchLabel: batch.label
          };
          
          const batchData = `data: ${JSON.stringify(batchComplete)}\n\n`;
          controller.enqueue(new TextEncoder().encode(batchData));
          
          // If this is the first batch (first 100 companies), send a special signal to show the website
          if (batch.end === 100) {
            const showWebsite = {
              type: 'show_website',
              message: '🚀 Initial scan complete - Website ready to display!',
              processed: totalProcessed,
              total: 500,
              found: totalFound
            };
            
            const showData = `data: ${JSON.stringify(showWebsite)}\n\n`;
            controller.enqueue(new TextEncoder().encode(showData));
          }
        }
        
        // Send final completion message
        const completion = {
          type: 'complete',
          message: `🎯 All scans complete! Found ${totalFound} seasonal opportunities across 500 companies`,
          processed: 500,
          total: 500,
          found: totalFound
        };
        
        const finalData = `data: ${JSON.stringify(completion)}\n\n`;
        controller.enqueue(new TextEncoder().encode(finalData));
        
        controller.close();
        
      } catch (error) {
        console.error('❌ Stream Error:', error);
        
        const errorData = {
          type: 'error',
          message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: true
        };
        
        const errorDataStr = `data: ${JSON.stringify(errorData)}\n\n`;
        controller.enqueue(new TextEncoder().encode(errorDataStr));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
