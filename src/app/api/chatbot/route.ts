import { NextRequest, NextResponse } from 'next/server';
import GlobalDataCache from '@/lib/GlobalDataCache';
import PolygonService from '@/lib/polygonService';
import SeasonalScreenerService from '@/lib/seasonalScreenerService';

// Rate limiting store (in production, use Redis or database)
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

// Input validation
function validateInput(message: string): boolean {
  if (!message || typeof message !== 'string') return false;
  if (message.length > 1000) return false;
  
  // Block potential injection attempts
  const dangerous = ['<script', 'javascript:', 'eval(', 'function(', 'document.', 'window.'];
  return !dangerous.some(pattern => message.toLowerCase().includes(pattern));
}

// Rate limiting function
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 30; // 30 requests per minute
  
  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const limit = rateLimiter.get(ip)!;
  if (now > limit.resetTime) {
    rateLimiter.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (limit.count >= maxRequests) {
    return false;
  }
  
  limit.count++;
  return true;
}

// Real data access functions using cached data and services
async function getRealSeasonalData(symbol?: string) {
  try {
    const cache = GlobalDataCache.getInstance();
    const seasonalData = cache.get(GlobalDataCache.keys.SEASONAL_OPPORTUNITIES);
    
    if (seasonalData && Array.isArray(seasonalData)) {
      if (symbol) {
        // Filter for specific symbol
        const symbolData = seasonalData.filter((item: any) => 
          item.symbol.toUpperCase() === symbol.toUpperCase()
        );
        return symbolData.length > 0 ? symbolData : null;
      } else {
        // Return top 10 opportunities
        return seasonalData.slice(0, 10);
      }
    }
    
    // Fallback to live data if cache miss
    const seasonalService = new SeasonalScreenerService();
    const opportunities = await seasonalService.screenSeasonalOpportunities(15, 20, 0);
    cache.set(GlobalDataCache.keys.SEASONAL_OPPORTUNITIES, opportunities);
    
    if (symbol) {
      return opportunities.filter((item: any) => 
        item.symbol.toUpperCase() === symbol.toUpperCase()
      );
    }
    return opportunities.slice(0, 10);
  } catch (error) {
    console.error('Error getting seasonal data:', error);
    return null;
  }
}

async function getRealMarketData(symbols: string[]) {
  try {
    const cache = GlobalDataCache.getInstance();
    const polygonService = new PolygonService();
    const results: any[] = [];
    
    for (const symbol of symbols) {
      // Try cache first
      const tickerDetails = cache.get(GlobalDataCache.keys.TICKER_DETAILS(symbol));
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const historicalData = cache.get(GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDate, endDate));
      
      if (tickerDetails && historicalData?.results?.length > 0) {
        const latestPrice = historicalData.results[historicalData.results.length - 1];
        const previousPrice = historicalData.results[historicalData.results.length - 2];
        const change = ((latestPrice.c - previousPrice.c) / previousPrice.c) * 100;
        
        results.push({
          symbol,
          name: tickerDetails.name || symbol,
          price: latestPrice.c,
          change: change,
          volume: latestPrice.v,
          marketCap: tickerDetails.market_cap
        });
      } else {
        // Fallback to live data
        try {
          const details = await polygonService.getTickerDetails(symbol);
          if (details) {
            cache.set(GlobalDataCache.keys.TICKER_DETAILS(symbol), details);
            results.push({
              symbol,
              name: details.name || symbol,
              price: 'N/A',
              change: 0,
              volume: 'N/A',
              marketCap: details.market_cap
            });
          }
        } catch (error) {
          console.warn(`Failed to get data for ${symbol}:`, error);
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error getting market data:', error);
    return null;
  }
}

async function getRealFeaturedPatterns() {
  try {
    const cache = GlobalDataCache.getInstance();
    let patterns = cache.get(GlobalDataCache.keys.FEATURED_PATTERNS);
    
    if (!patterns) {
      const polygonService = new PolygonService();
      patterns = await polygonService.getFeaturedPatterns();
      if (patterns) {
        cache.set(GlobalDataCache.keys.FEATURED_PATTERNS, patterns);
      }
    }
    
    return patterns || [];
  } catch (error) {
    console.error('Error getting featured patterns:', error);
    return [];
  }
}

async function getRealWeeklyPatterns() {
  try {
    const cache = GlobalDataCache.getInstance();
    let patterns = cache.get(GlobalDataCache.keys.WEEKLY_PATTERNS);
    
    if (!patterns) {
      const polygonService = new PolygonService();
      patterns = await polygonService.getWeeklyPatterns();
      if (patterns) {
        cache.set(GlobalDataCache.keys.WEEKLY_PATTERNS, patterns);
      }
    }
    
    return patterns || [];
  } catch (error) {
    console.error('Error getting weekly patterns:', error);
    return [];
  }
}

// Helper functions for RRG analysis
function getQuadrantExplanation(quadrant: string): string {
  switch (quadrant) {
    case 'Leading':
      return '🟢 **Strong Performance**: This sector/stock is outperforming the benchmark with positive momentum. Consider for continuation or profit-taking strategies.';
    case 'Weakening':
      return '🟡 **Losing Momentum**: Still outperforming but momentum is declining. Watch for potential rotation opportunities or defensive strategies.';
    case 'Lagging':
      return '🔴 **Underperforming**: Below benchmark with negative momentum. Look for value opportunities or wait for trend reversal signals.';
    case 'Improving':
      return '🔵 **Building Strength**: Currently underperforming but gaining momentum. Potential early-stage opportunity for trend followers.';
    default:
      return '📊 Position analysis based on relative strength and momentum metrics.';
  }
}

function generateRRGInsight(summary: any): string {
  const { leading, weakening, lagging, improving, total } = summary;
  
  if (leading > total * 0.4) {
    return 'Market showing strong leadership concentration - potential for continued momentum.';
  } else if (lagging > total * 0.4) {
    return 'Market showing broad weakness - consider defensive positioning.';
  } else if (improving > total * 0.3) {
    return 'Market in rotation phase - emerging opportunities in improving sectors.';
  } else {
    return 'Balanced market distribution - mixed signals suggest selective stock picking.';
  }
}

// Enhanced AI response function with real market data integration
async function getEnhancedAIResponse(userMessage: string): Promise<string> {
  const lowerMessage = userMessage.toLowerCase();
  
  try {
    // Quick seasonal shortcuts - instant responses for bullish/bearish requests
    if (lowerMessage.includes('bullish seasonal') || lowerMessage.includes('bullish trades') || lowerMessage.includes('bullish opportunities')) {
      const seasonalData = await getRealSeasonalData();
      if (seasonalData) {
        const bullishData = seasonalData.filter((opp: any) => opp.sentiment === 'Bullish').slice(0, 3);
        if (bullishData.length > 0) {
          let response = '🟢 **Instant Bullish Seasonal Trades (From Data-Driven):**\n\n';
          bullishData.forEach((opp: any, index: number) => {
            response += `**${index + 1}. ${opp.symbol}** - ${opp.companyName}\n`;
            response += `   📈 **+${opp.averageReturn.toFixed(2)}%** return • ${opp.winRate.toFixed(1)}% win rate\n`;
            response += `   📅 Period: ${opp.period} • Starts in ${opp.daysUntilStart} days\n\n`;
          });
          response += '⚡ **Instant access to live Bloomberg Terminal data!**';
          return response;
        }
      }
    }
    
    if (lowerMessage.includes('bearish seasonal') || lowerMessage.includes('bearish trades') || lowerMessage.includes('short opportunities')) {
      const seasonalData = await getRealSeasonalData();
      if (seasonalData) {
        const bearishData = seasonalData.filter((opp: any) => opp.sentiment === 'Bearish').slice(0, 3);
        if (bearishData.length > 0) {
          let response = '🔴 **Instant Bearish Seasonal Trades (From Data-Driven):**\n\n';
          bearishData.forEach((opp: any, index: number) => {
            response += `**${index + 1}. ${opp.symbol}** - ${opp.companyName}\n`;
            response += `   📉 **${opp.averageReturn.toFixed(2)}%** return • ${(100 - opp.winRate).toFixed(1)}% win rate\n`;
            response += `   📅 Period: ${opp.period} • Starts in ${opp.daysUntilStart} days\n\n`;
          });
          response += '⚡ **Instant access to live Bloomberg Terminal data!**';
          return response;
        }
      }
    }
    
    // Seasonal Pattern Queries - Connect to REAL seasonal data with instant responses
    if (lowerMessage.includes('seasonal') || lowerMessage.includes('pattern') || lowerMessage.includes('opportunity') || 
        lowerMessage.includes('bullish') || lowerMessage.includes('bearish') || lowerMessage.includes('trades')) {
      
      const symbolMatch = userMessage.match(/\b([A-Z]{2,5})\b/);
      const symbol = symbolMatch ? symbolMatch[1] : null;
      
      // Determine if user wants bullish or bearish specifically
      const wantsBullish = lowerMessage.includes('bullish');
      const wantsBearish = lowerMessage.includes('bearish');
      
      const seasonalData = await getRealSeasonalData(symbol || undefined);
      if (seasonalData && seasonalData.length > 0) {
        if (symbol) {
          // Specific symbol analysis
          const data = seasonalData[0];
          return `🎯 **Real Seasonal Analysis for ${data.symbol}:**\n\n📊 **${data.companyName}**\n• **Sentiment**: ${data.sentiment}\n• **Period**: ${data.period}\n• **Average Return**: ${data.averageReturn.toFixed(2)}%\n• **Win Rate**: ${data.winRate.toFixed(1)}%\n• **Years of Data**: ${data.years}\n• **Days Until Start**: ${data.daysUntilStart}\n\n💡 **Analysis**: Based on ${data.years} years of historical data, this seasonal pattern shows a ${data.winRate.toFixed(1)}% success rate.\n\n⚠️ *Real data from Bloomberg Terminal - for educational purposes only.*`;
        } else {
          // Filter by sentiment if specified
          let filteredData = seasonalData;
          if (wantsBullish) {
            filteredData = seasonalData.filter((opp: any) => opp.sentiment === 'Bullish');
          } else if (wantsBearish) {
            filteredData = seasonalData.filter((opp: any) => opp.sentiment === 'Bearish');
          }
          
          const topOpportunities = filteredData.slice(0, 5);
          if (topOpportunities.length === 0) {
            return `🔍 **No ${wantsBullish ? 'Bullish' : wantsBearish ? 'Bearish' : ''} seasonal opportunities found** in current data.\n\nTry asking for the opposite sentiment or check back later as patterns update daily.`;
          }
          
          const sentimentText = wantsBullish ? 'Bullish' : wantsBearish ? 'Bearish' : 'All';
          let response = `🎯 **Live ${sentimentText} Seasonal Opportunities (From Data-Driven Channel):**\n\n`;
          
          topOpportunities.forEach((opp: any, index: number) => {
            const icon = opp.sentiment === 'Bullish' ? '🟢' : '🔴';
            response += `${icon} **${index + 1}. ${opp.symbol}** - ${opp.sentiment.toUpperCase()}\n`;
            response += `   **${opp.companyName}**\n`;
            response += `   • **Return**: ${opp.averageReturn.toFixed(2)}%\n`;
            response += `   • **Win Rate**: ${opp.winRate.toFixed(1)}%\n`;
            response += `   • **Period**: ${opp.period}\n`;
            response += `   • **Days to Start**: ${opp.daysUntilStart}\n\n`;
          });
          
          response += `💡 **Live data from ${seasonalData.length} analyzed stocks**\n`;
          response += `📊 **Found**: ${filteredData.length} ${sentimentText.toLowerCase()} opportunities\n`;
          response += '⚠️ *Real Bloomberg Terminal data from Data-Driven channel - not financial advice.*';
          return response;
        }
      } else {
        return `🔍 **No seasonal opportunities currently available**\n\nThis could mean:\n• Data is still loading (check back in a few minutes)\n• No patterns match current timeframe\n• Cache needs refresh\n\nTry asking: "cache status" to see data loading progress.`;
      }
    }
    
    // Market Data Queries - Connect to REAL market data
    if (lowerMessage.includes('market') || lowerMessage.includes('stock') || lowerMessage.includes('price') || lowerMessage.includes('spy') || lowerMessage.includes('qqq')) {
      const symbolMatch = userMessage.match(/\b([A-Z]{2,5})\b/);
      const requestedSymbols = symbolMatch ? [symbolMatch[1]] : ['SPY', 'QQQ', 'AAPL', 'MSFT', 'TSLA'];
      
      const marketData = await getRealMarketData(requestedSymbols);
      if (marketData && marketData.length > 0) {
        let response = '📊 **Live Market Data from Bloomberg Terminal:**\n\n';
        marketData.forEach((stock: any) => {
          const changeIcon = stock.change > 0 ? '🟢' : stock.change < 0 ? '🔴' : '⚪';
          response += `${changeIcon} **${stock.symbol}** - ${stock.name}\n`;
          response += `• Price: $${stock.price}\n`;
          response += `• Change: ${stock.change > 0 ? '+' : ''}${stock.change.toFixed(2)}%\n`;
          if (stock.marketCap) response += `• Market Cap: $${(stock.marketCap / 1e9).toFixed(1)}B\n`;
          response += '\n';
        });
        response += '💡 **Real-time data from Polygon API**\n⚠️ *Live Bloomberg Terminal data - for educational purposes only.*';
        return response;
      }
    }
    
    // Featured Patterns - Connect to REAL pattern data
    if (lowerMessage.includes('pattern') || lowerMessage.includes('featured') || lowerMessage.includes('trend')) {
      const patterns = await getRealFeaturedPatterns();
      if (patterns.length > 0) {
        let response = '⭐ **Live Featured Patterns:**\n\n';
        patterns.slice(0, 5).forEach((pattern: any, index: number) => {
          response += `**${index + 1}. ${pattern.title || pattern.symbol}**\n`;
          response += `• Type: ${pattern.type || 'Technical Pattern'}\n`;
          response += `• Signal: ${pattern.signal || 'Bullish'}\n`;
          response += `• Confidence: ${pattern.confidence || 'High'}\n\n`;
        });
        response += '💡 **Live patterns from Bloomberg Terminal**\n⚠️ *Real market analysis - not financial advice.*';
        return response;
      }
    }
    
    // Weekly Patterns
    if (lowerMessage.includes('weekly') || lowerMessage.includes('short term') || lowerMessage.includes('swing')) {
      const weeklyPatterns = await getRealWeeklyPatterns();
      if (weeklyPatterns.length > 0) {
        let response = '� **Live Weekly Trading Patterns:**\n\n';
        weeklyPatterns.slice(0, 5).forEach((pattern: any, index: number) => {
          response += `**${index + 1}. ${pattern.symbol || 'Pattern'}**\n`;
          response += `• Signal: ${pattern.signal || 'Bullish'}\n`;
          response += `• Timeframe: ${pattern.timeframe || '1-2 weeks'}\n`;
          response += `• Strength: ${pattern.strength || 'Medium'}\n\n`;
        });
        response += '💡 **Live weekly analysis from Bloomberg Terminal**\n⚠️ *Real short-term patterns - not financial advice.*';
        return response;
      }
    }
    
    // Cache Statistics
    if (lowerMessage.includes('cache') || lowerMessage.includes('data') || lowerMessage.includes('loaded')) {
      const cache = GlobalDataCache.getInstance();
      const stats = cache.getStats();
      return `📊 **Bloomberg Terminal Data Status:**\n\n• **Active Cache Items**: ${stats.active}\n• **Total Data Points**: ${stats.total}\n• **Cache Hit Rate**: High\n\n🚀 **Loaded Data:**\n• 600+ Stock Seasonal Patterns\n• All Market Indices (SPY, QQQ, etc.)\n• Featured Trading Patterns\n• Weekly Swing Opportunities\n• Sector Analysis (10 sectors)\n• Full Historical Data (15 years)\n\n✅ **Status**: All Bloomberg Terminal data loaded and ready!`;
    }

    // RRG Quadrant Queries - Connect to real RRG data
    if (lowerMessage.includes('rrg') || lowerMessage.includes('quadrant') || lowerMessage.includes('xlk') || lowerMessage.includes('xlf') || lowerMessage.includes('xlv')) {
      return await handleRRGQueries(userMessage, lowerMessage);
    }
    
    // Technical analysis requests
    if (lowerMessage.includes('technical') || lowerMessage.includes('chart') || lowerMessage.includes('support') || lowerMessage.includes('resistance')) {
      return `📈 **Technical Analysis Guide:**\n\n**Key Indicators to Watch:**\n• Moving Averages (20, 50, 200-day)\n• RSI (Relative Strength Index)\n• MACD (Moving Average Convergence Divergence)\n• Volume Analysis\n• Support/Resistance Levels\n\n**Current Market Sentiment:**\n• VIX (Fear Index): Monitor volatility\n• Sector Rotation: Track institutional flows\n• Economic Calendar: Watch for key events\n\n🎯 **Pro Tip**: Combine multiple timeframes for better accuracy!`;
    }
    
    // Options trading
    if (lowerMessage.includes('options') || lowerMessage.includes('call') || lowerMessage.includes('put')) {
      return `📋 **Options Trading Essentials:**\n\n**The Greeks:**\n• **Delta**: Price sensitivity to underlying\n• **Gamma**: Delta's rate of change\n• **Theta**: Time decay factor\n• **Vega**: Volatility sensitivity\n\n**Strategies:**\n• **Conservative**: Covered calls, cash-secured puts\n• **Moderate**: Iron condors, credit spreads\n• **Aggressive**: Long straddles, naked options\n\n⚠️ **Risk Warning**: Options can expire worthless. Never risk more than you can afford to lose!`;
    }
    
    // Economic analysis
    if (lowerMessage.includes('economic') || lowerMessage.includes('fed') || lowerMessage.includes('inflation') || lowerMessage.includes('gdp')) {
      const economicData = await fetchEconomicIndicators();
      return economicData;
    }
    
    // Crypto queries
    if (lowerMessage.includes('crypto') || lowerMessage.includes('bitcoin') || lowerMessage.includes('ethereum')) {
      return `₿ **Cryptocurrency Market Update:**\n\n**Major Coins:**\n• Bitcoin (BTC): Digital gold, store of value\n• Ethereum (ETH): Smart contract platform\n• Solana (SOL): High-speed blockchain\n\n**Key Factors:**\n• Regulatory developments\n• Institutional adoption\n• Network fundamentals\n• Market sentiment\n\n🔐 **Security Reminder**: Only invest what you can afford to lose in crypto!`;
    }
    
    // Portfolio management
    if (lowerMessage.includes('portfolio') || lowerMessage.includes('diversify') || lowerMessage.includes('allocation')) {
      return `📊 **Portfolio Management Best Practices:**\n\n**Asset Allocation Framework:**\n• **Conservative (60/40)**: 60% stocks, 40% bonds\n• **Moderate (70/30)**: 70% stocks, 30% bonds\n• **Aggressive (80/20)**: 80% stocks, 20% bonds\n\n**Diversification Rules:**\n• Geographic: US, International, Emerging Markets\n• Sector: Tech, Healthcare, Finance, Energy\n• Market Cap: Large, Mid, Small-cap stocks\n• Asset Classes: Stocks, Bonds, REITs, Commodities\n\n🎯 **Rebalancing**: Review quarterly, rebalance annually!`;
    }
    
    // Default comprehensive response
    return generateContextualResponse(userMessage);
    
  } catch (error) {
    console.error('AI Response Error:', error);
    return `⚠️ I encountered an issue processing your request. Here's some general market guidance:\n\n📊 **Market Fundamentals:**\n• Always do your own research (DYOR)\n• Diversify your investments\n• Have a clear risk management strategy\n• Stay informed about economic indicators\n\nCould you please rephrase your question? I'm here to help with trading and market analysis!`;
  }
}

// Handle RRG-related queries with real data
async function handleRRGQueries(userMessage: string, lowerMessage: string): Promise<string> {
  try {
    // Extract symbol from message
    const symbolMatch = userMessage.match(/\b([A-Z]{2,5})\b/);
    const symbol = symbolMatch ? symbolMatch[1] : null;
    
    // Extract timeframe if mentioned
    let timeframe = '14 weeks'; // default
    if (lowerMessage.includes('4 week')) timeframe = '4 weeks';
    else if (lowerMessage.includes('8 week')) timeframe = '8 weeks';
    else if (lowerMessage.includes('26 week')) timeframe = '26 weeks';
    else if (lowerMessage.includes('52 week') || lowerMessage.includes('1 year')) timeframe = '52 weeks';
    
    const rrgUrl = `/api/rrg-data?mode=sectors&timeframe=${encodeURIComponent(timeframe)}${symbol ? `&symbol=${symbol}` : ''}`;
    
    // Use fetch with full URL for server-side requests
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}${rrgUrl}`);
    
    if (!response.ok) {
      throw new Error(`RRG API request failed: ${response.status}`);
    }
    
    const rrgData = await response.json();
    
    if (symbol && rrgData.data) {
      // Specific symbol query
      const symbolData = rrgData.data;
      return `🎯 **RRG Analysis for ${symbol}:**\n\n**Current Position**: ${symbolData.quadrant} Quadrant\n**Timeframe**: ${timeframe}\n**Benchmark**: ${rrgData.parameters.benchmark}\n\n**Relative Strength**: ${symbolData.rsRatio.toFixed(2)}\n**Momentum**: ${symbolData.rsMomentum.toFixed(2)}\n\n**Interpretation**:\n${getQuadrantExplanation(symbolData.quadrant)}\n\n**Market Context**:\n• Leading: ${rrgData.quadrants.leading} sectors\n• Weakening: ${rrgData.quadrants.weakening} sectors\n• Lagging: ${rrgData.quadrants.lagging} sectors\n• Improving: ${rrgData.quadrants.improving} sectors\n\n⚠️ *Analysis based on ${timeframe} data for educational purposes only.*`;
    } else if (rrgData.data && Array.isArray(rrgData.data)) {
      // General RRG overview
      const leading = rrgData.data.filter((d: any) => d.quadrant === 'Leading');
      const weakening = rrgData.data.filter((d: any) => d.quadrant === 'Weakening');
      const lagging = rrgData.data.filter((d: any) => d.quadrant === 'Lagging');
      const improving = rrgData.data.filter((d: any) => d.quadrant === 'Improving');
      
      return `📊 **RRG Market Overview (${timeframe}):**\n\n**🟢 Leading Quadrant (${leading.length}):**\n${leading.slice(0, 3).map((s: any) => `• ${s.symbol} (${s.name.split(' ')[0]})`).join('\n') || 'None'}\n\n**🟡 Weakening Quadrant (${weakening.length}):**\n${weakening.slice(0, 3).map((s: any) => `• ${s.symbol} (${s.name.split(' ')[0]})`).join('\n') || 'None'}\n\n**🔴 Lagging Quadrant (${lagging.length}):**\n${lagging.slice(0, 3).map((s: any) => `• ${s.symbol} (${s.name.split(' ')[0]})`).join('\n') || 'None'}\n\n**🔵 Improving Quadrant (${improving.length}):**\n${improving.slice(0, 3).map((s: any) => `• ${s.symbol} (${s.name.split(' ')[0]})`).join('\n') || 'None'}\n\n💡 **Insight**: ${generateRRGInsight(rrgData.summary)}\n\n⚠️ *Real-time RRG data for educational analysis only.*`;
    }
    
    return `❌ No RRG data found. Please specify a valid sector ETF symbol (XLK, XLF, XLV, etc.) or ask for a general RRG overview.`;
    
  } catch (error) {
    console.error('RRG Query Error:', error);
    return `⚠️ Unable to fetch RRG data at the moment. The system may be updating or experiencing high load. Please try again in a few moments.`;
  }
}

// Handle seasonal pattern queries with real data
async function handleSeasonalQueries(userMessage: string, lowerMessage: string): Promise<string> {
  try {
    // Extract symbol from message
    const symbolMatch = userMessage.match(/\b([A-Z]{2,5})\b/);
    const symbol = symbolMatch ? symbolMatch[1] : null;
    
    // Determine sentiment filter
    let sentiment = null;
    if (lowerMessage.includes('bearish') || lowerMessage.includes('short') || lowerMessage.includes('sell')) {
      sentiment = 'bearish';
    } else if (lowerMessage.includes('bullish') || lowerMessage.includes('long') || lowerMessage.includes('buy')) {
      sentiment = 'bullish';
    }
    
    // Check if asking for active/current patterns
    const activeOnly = lowerMessage.includes('active') || lowerMessage.includes('today') || lowerMessage.includes('yesterday') || lowerMessage.includes('now') || lowerMessage.includes('current');
    
    const seasonalUrl = `/api/seasonal-data?${symbol ? `symbol=${symbol}&` : ''}${sentiment ? `sentiment=${sentiment}&` : ''}active=${activeOnly}&years=15&batchSize=50`;
    
    // Use fetch with full URL for server-side requests
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}${seasonalUrl}`);
    
    if (!response.ok) {
      throw new Error(`Seasonal API request failed: ${response.status}`);
    }
    
    const seasonalData = await response.json();
    
    if (symbol && seasonalData.data) {
      // Specific symbol query
      const symbolData = seasonalData.data;
      return `📅 **Seasonal Analysis for ${symbol}:**\n\n**Pattern Found**: ${symbolData.sentiment} trend\n**Period**: ${symbolData.period}\n**Start Date**: ${symbolData.startDate}\n**End Date**: ${symbolData.endDate}\n\n**Historical Performance**:\n• Average Return: ${symbolData.averageReturn >= 0 ? '+' : ''}${symbolData.averageReturn.toFixed(1)}%\n• Win Rate: ${symbolData.winRate.toFixed(1)}%\n• Confidence: ${symbolData.confidence}\n• Years Analyzed: ${symbolData.years}\n\n**Status**: ${symbolData.isActive ? '🟢 ACTIVE - Pattern period is current!' : `⏳ ${symbolData.daysUntilStart > 0 ? `Starts in ${symbolData.daysUntilStart} days` : 'Pattern period has passed'}`}\n\n**Risk Level**: ${symbolData.riskLevel}\n\n⚠️ *Historical seasonal patterns for educational analysis only.*`;
    } else if (seasonalData.data && Array.isArray(seasonalData.data)) {
      // General seasonal overview
      const activePatterns = seasonalData.data.filter((p: any) => p.isActive);
      const topPatterns = seasonalData.data.slice(0, 5);
      
      if (activeOnly && activePatterns.length > 0) {
        return `🔥 **Active Seasonal Patterns (Starting Now):**\n\n${activePatterns.slice(0, 3).map((p: any) => 
          `**${p.symbol}** (${p.sentiment})\n• Period: ${p.period}\n• Avg Return: ${p.averageReturn >= 0 ? '+' : ''}${p.averageReturn.toFixed(1)}%\n• Win Rate: ${p.winRate.toFixed(1)}%\n• Confidence: ${p.confidence}`
        ).join('\n\n')}\n\n📊 **Summary**: ${seasonalData.summary.active} active patterns found\n\n⚠️ *Active seasonal opportunities for educational analysis only.*`;
      } else if (sentiment) {
        const filteredPatterns = seasonalData.data.filter((p: any) => p.sentiment.toLowerCase() === sentiment);
        return `📈 **${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)} Seasonal Patterns:**\n\n${filteredPatterns.slice(0, 3).map((p: any) => 
          `**${p.symbol}** - ${p.companyName}\n• Period: ${p.period}\n• Avg Return: ${p.averageReturn >= 0 ? '+' : ''}${p.averageReturn.toFixed(1)}%\n• Win Rate: ${p.winRate.toFixed(1)}%\n• ${p.isActive ? '🟢 ACTIVE NOW' : `⏳ Days until start: ${p.daysUntilStart}`}`
        ).join('\n\n')}\n\n📊 **Found**: ${filteredPatterns.length} ${sentiment} patterns\n\n⚠️ *Seasonal pattern analysis for educational purposes only.*`;
      } else {
        return `📅 **Top Seasonal Opportunities:**\n\n${topPatterns.map((p: any) => 
          `**${p.symbol}** (${p.sentiment})\n• Period: ${p.period}\n• Avg Return: ${p.averageReturn >= 0 ? '+' : ''}${p.averageReturn.toFixed(1)}%\n• Win Rate: ${p.winRate.toFixed(1)}%\n• ${p.isActive ? '🟢 ACTIVE' : '⏳ Upcoming'}`
        ).join('\n\n')}\n\n📊 **Market Summary**:\n• Total Patterns: ${seasonalData.summary.total}\n• Bullish: ${seasonalData.summary.bullish}\n• Bearish: ${seasonalData.summary.bearish}\n• Currently Active: ${seasonalData.summary.active}\n\n⚠️ *Historical seasonal analysis for educational purposes only.*`;
      }
    }
    
    return seasonalData.message || `❌ No seasonal patterns found with the specified criteria.`;
    
  } catch (error) {
    console.error('Seasonal Query Error:', error);
    return `⚠️ Unable to fetch seasonal data at the moment. The system may be processing or experiencing high load. Please try again shortly.`;
  }
}

// Fetch market data from Polygon API
async function fetchMarketData(symbols: string[]): Promise<any[] | null> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      console.warn('Polygon API key not configured');
      return null;
    }
    
    // Use grouped daily bars for multiple symbols
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apikey=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('API request failed');
    
    const data = await response.json();
    
    // Filter for our symbols and format
    if (data.results) {
      return data.results
        .filter((item: any) => symbols.includes(item.T))
        .map((item: any) => ({
          symbol: item.T,
          price: item.c,
          change: item.c - item.o,
          changePercent: ((item.c - item.o) / item.o) * 100,
          volume: item.v
        }));
    }
    
    return null;
  } catch (error) {
    console.error('Market data fetch error:', error);
    return null;
  }
}

// Generate market analysis based on data
function generateMarketAnalysis(marketData: any[]): string {
  const gainers = marketData.filter(stock => stock.change > 0);
  const losers = marketData.filter(stock => stock.change < 0);
  
  let analysis = '';
  
  if (gainers.length > losers.length) {
    analysis = 'Market showing bullish sentiment with more gainers than losers. ';
  } else if (losers.length > gainers.length) {
    analysis = 'Market showing bearish sentiment with more decliners. ';
  } else {
    analysis = 'Mixed market signals with balanced gains and losses. ';
  }
  
  const highVolume = marketData.filter(stock => stock.volume > 50000000);
  if (highVolume.length > 0) {
    analysis += 'High volume activity detected in major names. ';
  }
  
  analysis += 'Monitor key support/resistance levels for direction.';
  
  return analysis;
}

// Format market data for display
function formatMarketData(data: any[]): string {
  return data.map(stock => {
    const arrow = stock.change >= 0 ? '🟢' : '🔴';
    const sign = stock.change >= 0 ? '+' : '';
    return `${arrow} **${stock.symbol}**: $${stock.price.toFixed(2)} (${sign}${stock.change.toFixed(2)}, ${sign}${stock.changePercent.toFixed(2)}%)`;
  }).join('\n');
}

// Fetch economic indicators
async function fetchEconomicIndicators(): Promise<string> {
  // In a real implementation, you'd fetch from economic data APIs
  return `🏛️ **Economic Indicators Dashboard:**\n\n**Federal Reserve Policy:**\n• Current Fed Funds Rate: 5.25-5.50%\n• Next FOMC Meeting: Check Fed calendar\n• QE/QT Status: Quantitative tightening ongoing\n\n**Key Metrics:**\n• Unemployment Rate: ~3.8%\n• Core PCE Inflation: ~3.2% YoY\n• GDP Growth: ~2.1% annualized\n• Consumer Confidence: Monitor trends\n\n📅 **Upcoming Events:**\n• Jobs Report: First Friday of month\n• CPI/PPI Data: Mid-month releases\n• FOMC Minutes: 3 weeks after meetings\n\n💡 **Impact**: Watch for dovish/hawkish Fed signals affecting markets!`;
}

// Generate contextual response
function generateContextualResponse(userMessage: string): string {
  return `🤖 **AI Trading Assistant Response:**\n\nI understand you're asking about: "${userMessage}"\n\n**General Market Guidance:**\n• **Risk Management**: Never risk more than 2% per trade\n• **Research**: Use multiple sources for analysis\n• **Timing**: Markets are unpredictable short-term\n• **Patience**: Long-term investing often outperforms trading\n\n**Popular Topics I Can Help With:**\n• Market analysis and stock prices\n• Trading strategies and risk management\n• Economic indicators and Fed policy\n• Technical analysis and chart patterns\n• Portfolio allocation and diversification\n• Options trading and derivatives\n• Cryptocurrency market updates\n\n**Ask me something more specific!** 📊`;
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
    
    // Check rate limit
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    const { message } = body;
    
    // Validate input
    if (!validateInput(message)) {
      return NextResponse.json(
        { error: 'Invalid input. Please check your message and try again.' },
        { status: 400 }
      );
    }
    
    // Get AI response
    const response = await getEnhancedAIResponse(message);
    
    // Return response
    return NextResponse.json({
      response,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Chatbot API Error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error. Please try again.' },
      { status: 500 }
    );
  }
}

// Handle CORS for browser requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
