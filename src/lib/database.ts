import { PrismaClient } from '@prisma/client'

// Global Prisma instance for better performance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Helper function to save options flow data
export async function saveOptionsFlow(trades: any[], sessionId?: string) {
  try {
    // Start session tracking if provided
    let session = null;
    if (sessionId) {
      session = await prisma.flowSession.create({
        data: {
          session_id: sessionId,
          started_at: new Date(),
          symbols_scanned: 0, // Will be updated later
          total_trades: trades.length,
          total_premium: trades.reduce((sum, trade) => sum + (trade.total_premium || 0), 0)
        }
      });
    }

    // Save all trades in batch for performance
    const saved = await prisma.optionsFlow.createMany({
      data: trades.map((trade) => ({
        ticker: trade.ticker,
        underlying_ticker: trade.underlying_ticker,
        strike: trade.strike,
        expiry: trade.expiry,
        type: trade.type,
        trade_size: trade.trade_size,
        premium_per_contract: trade.premium_per_contract,
        total_premium: trade.total_premium,
        flow_type: trade.flow_type,
        trade_type: trade.trade_type,
        above_ask: trade.above_ask || false,
        below_bid: trade.below_bid || false,
        exchange: trade.exchange,
        conditions: trade.conditions ? JSON.stringify(trade.conditions) : null,
        trade_timestamp: new Date(trade.timestamp),
      }))
    });

    console.log(`💾 SAVED TO DATABASE: ${saved.count} trades stored`);
    
    // Update session completion
    if (session) {
      await prisma.flowSession.update({
        where: { id: session.id },
        data: {
          completed_at: new Date(),
          scan_duration_ms: Date.now() - session.started_at.getTime()
        }
      });
    }

    return saved;
  } catch (error) {
    console.error('❌ Database save error:', error);
    throw error;
  }
}

// Helper function to get historical flow data
export async function getHistoricalFlow(filters: {
  symbol?: string;
  startDate?: Date;
  endDate?: Date;
  minPremium?: number;
  tradeType?: string;
  limit?: number;
}) {
  const {
    symbol,
    startDate,
    endDate,
    minPremium,
    tradeType,
    limit = 1000
  } = filters;

  const where: any = {};
  
  if (symbol) {
    where.underlying_ticker = { contains: symbol.toUpperCase() };
  }
  
  if (startDate || endDate) {
    where.trade_timestamp = {};
    if (startDate) where.trade_timestamp.gte = startDate;
    if (endDate) where.trade_timestamp.lte = endDate;
  }
  
  if (minPremium) {
    where.total_premium = { gte: minPremium };
  }
  
  if (tradeType) {
    where.trade_type = tradeType;
  }

  return await prisma.optionsFlow.findMany({
    where,
    orderBy: { trade_timestamp: 'desc' },
    take: limit
  });
}

// Get summary statistics
export async function getFlowStats(days: number = 1) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const stats = await prisma.optionsFlow.aggregate({
    where: {
      trade_timestamp: { gte: since }
    },
    _count: { id: true },
    _sum: { total_premium: true },
    _avg: { total_premium: true },
    _max: { total_premium: true }
  });

  const topSymbols = await prisma.optionsFlow.groupBy({
    by: ['underlying_ticker'],
    where: {
      trade_timestamp: { gte: since }
    },
    _count: { id: true },
    _sum: { total_premium: true },
    orderBy: { _sum: { total_premium: 'desc' } },
    take: 10
  });

  return {
    totalTrades: stats._count.id,
    totalPremium: stats._sum.total_premium || 0,
    avgPremium: stats._avg.total_premium || 0,
    maxPremium: stats._max.total_premium || 0,
    topSymbols
  };
}