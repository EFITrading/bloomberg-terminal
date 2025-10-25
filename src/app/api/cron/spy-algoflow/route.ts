import { NextRequest, NextResponse } from 'next/server';
import { OptionsFlowService } from '@/lib/optionsFlowService';
import { screenerCache } from '@/lib/screenerCache';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('🚀 SPY AlgoFlow background scan started');
  
  try {
    const startTime = Date.now();
    
    console.log('📊 Fetching SPY options flow data...');
    const polygonApiKey = process.env.POLYGON_API_KEY;
    if (!polygonApiKey) {
      throw new Error('POLYGON_API_KEY not configured');
    }
    
    const optionsFlowService = new OptionsFlowService(polygonApiKey);
    const flowData = await optionsFlowService.fetchLiveOptionsFlow('SPY');
    
    if (!flowData || flowData.length === 0) {
      console.log('⚠️ No SPY flow data found');
      return NextResponse.json({ 
        status: 'no_data',
        symbol: 'SPY',
        message: 'No options flow data found for SPY'
      });
    }

    // Calculate time range for the data
    const endTime = new Date();
    const startTime4Hours = new Date(endTime.getTime() - (4 * 60 * 60 * 1000));

    // Process and analyze the flow data
    const processedData = {
      symbol: 'SPY',
      totalTrades: flowData.length,
      sweeps: flowData.filter((trade: any) => trade.trade_type === 'SWEEP').length,
      blocks: flowData.filter((trade: any) => trade.trade_type === 'BLOCK').length,
      calls: flowData.filter((trade: any) => trade.type === 'call').length,
      puts: flowData.filter((trade: any) => trade.type === 'put').length,
      totalPremium: flowData.reduce((sum: number, trade: any) => sum + (trade.total_premium || 0), 0),
      avgPremium: flowData.length > 0 ? flowData.reduce((sum: number, trade: any) => sum + (trade.total_premium || 0), 0) / flowData.length : 0,
      timeRange: {
        start: startTime4Hours.toISOString(),
        end: endTime.toISOString()
      },
      topTrades: flowData
        .sort((a: any, b: any) => (b.total_premium || 0) - (a.total_premium || 0))
        .slice(0, 10)
        .map((trade: any) => ({
          strike: trade.strike || 0,
          expiry: trade.expiry || '',
          type: trade.type || 'call',
          trade_type: trade.trade_type || 'UNKNOWN',
          total_premium: trade.total_premium || 0,
          trade_size: trade.trade_size || 0,
          premium_per_contract: trade.premium_per_contract || 0,
          timestamp: trade.trade_timestamp || new Date().toISOString(),
          exchange: trade.exchange_name || 'UNKNOWN'
        })),
      flowAnalysis: {
        bullishFlow: flowData.filter((trade: any) => 
          (trade.type === 'call' && (trade.moneyness || 1) >= 0.95) || 
          (trade.type === 'put' && (trade.moneyness || 1) <= 1.05)
        ).reduce((sum: number, trade: any) => sum + (trade.total_premium || 0), 0),
        bearishFlow: flowData.filter((trade: any) => 
          (trade.type === 'put' && (trade.moneyness || 1) >= 0.95) || 
          (trade.type === 'call' && (trade.moneyness || 1) <= 1.05)
        ).reduce((sum: number, trade: any) => sum + (trade.total_premium || 0), 0),
        institutionalActivity: flowData.filter((trade: any) => 
          (trade.total_premium || 0) >= 50000
        ).length,
        unusualActivity: flowData.filter((trade: any) => 
          trade.trade_type === 'SWEEP' || (trade.total_premium || 0) >= 100000
        ).length
      },
      rawData: flowData, // Store complete data for detailed analysis
      generatedAt: new Date().toISOString(),
      processingTime: Date.now() - startTime
    };

    // Cache the processed SPY flow data with proper cache format
    const now = Date.now();
    screenerCache.set('spy-algoflow', {
      data: processedData,
      timestamp: now,
      expiresAt: now + (5 * 60 * 1000) // 5 minutes TTL for SPY flow
    });
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ SPY AlgoFlow scan completed in ${processingTime}ms`);
    console.log(`📈 Found ${flowData.length} trades, ${processedData.sweeps} sweeps, ${processedData.blocks} blocks`);
    console.log(`💰 Total premium: $${processedData.totalPremium.toLocaleString()}`);

    return NextResponse.json({
      status: 'success',
      symbol: 'SPY',
      tradesFound: flowData.length,
      sweeps: processedData.sweeps,
      blocks: processedData.blocks,
      totalPremium: processedData.totalPremium,
      processingTime,
      cachedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ SPY AlgoFlow background scan error:', error);
    
    return NextResponse.json({
      status: 'error',
      symbol: 'SPY',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}