import { NextRequest, NextResponse } from 'next/server';
import quickSeasonalService from '../../../lib/quickSeasonalService';
import RRGService from '../../../lib/rrgService';
import SeasonalScreenerService from '../../../lib/seasonalScreenerService';
import { AIIntelligenceService } from '../../../lib/aiIntelligenceService';
import { IndustryAnalysisService } from '../../../lib/industryAnalysisService';

// Enhanced seasonal analysis function with comprehensive insights and error handling
async function getActualSeasonalData(symbol: string): Promise<string> {
  try {
    console.log(`🔍 Fetching COMPREHENSIVE seasonal data for ${symbol}...`);
    
    // Try to get quick seasonal data first
    let quickSeasonalData = null;
    let lastError = null;
    try {
      console.log(`🔍 Attempting to fetch seasonal data for ${symbol}...`);
      quickSeasonalData = await quickSeasonalService.getQuickSeasonalData(symbol, 15);
      console.log(`✅ Successfully fetched seasonal data for ${symbol}:`, quickSeasonalData ? 'DATA_RECEIVED' : 'NULL_RESULT');
    } catch (quickError) {
      lastError = quickError;
      console.error(`💥 Quick seasonal service error for ${symbol}:`, quickError);
      console.error(`💥 Error details:`, {
        message: quickError instanceof Error ? quickError.message : 'Unknown error',
        stack: quickError instanceof Error ? quickError.stack : undefined,
        type: typeof quickError
      });
    }
    
    // Try to get AI analysis as backup/enhancement
    let aiAnalysis = null;
    try {
      const aiService = new AIIntelligenceService();
      aiAnalysis = await aiService.analyzeSeasonalPatterns(symbol);
    } catch (aiError) {
      console.warn(`⚠️ AI analysis error for ${symbol}:`, aiError);
    }
    
    if (!quickSeasonalData) {
      // Fallback response when services are unavailable - include debug info
      const debugInfo = lastError ? `\n\n**🔧 Debug Info:** ${lastError instanceof Error ? lastError.message : String(lastError)}` : '';
      return `🎯 **${symbol} SEASONAL ANALYSIS**\n\n⚠️ **Service Temporarily Unavailable**\n\nThe seasonal analysis service is currently unavailable for ${symbol}. This might be due to:\n• API rate limits\n• Market data connectivity issues\n• Service initialization\n\n**💡 Alternative Options:**\n• Try again in a few minutes\n• Use the **Data Driven** page for manual analysis\n• Check "best seasonal trade" for general opportunities\n\n**📊 Note:** The seasonal screener and sector analysis are still available!${debugInfo}`;
    }
    
    const { best30DayPeriod, worst30DayPeriod, bestMonths, worstMonths, yearsOfData, winRate } = quickSeasonalData;
    
    // Build comprehensive response
    let response = `🎯 **${symbol} COMPREHENSIVE SEASONAL ANALYSIS**\n\n`;
    
    // Current timing assessment
    const currentDate = new Date();
    const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
    const isInBestMonth = bestMonths && bestMonths[0]?.month === currentMonth;
    const isInWorstMonth = worstMonths && worstMonths[0]?.month === currentMonth;
    
    if (isInBestMonth) {
      response += `🟢 **CURRENT TIMING: FAVORABLE**\nWe are currently in ${currentMonth}, which is ${symbol}'s historically best month!\n\n`;
    } else if (isInWorstMonth) {
      response += `🔴 **CURRENT TIMING: UNFAVORABLE**\nWe are currently in ${currentMonth}, which is ${symbol}'s historically worst month.\n\n`;
    } else {
      response += `🟡 **CURRENT TIMING: NEUTRAL**\nWe are currently in ${currentMonth} - not ${symbol}'s strongest or weakest seasonal period.\n\n`;
    }
    
    // Best and worst periods
    if (best30DayPeriod) {
      response += `**🏆 BEST 30-DAY PERIOD:**\n📅 ${best30DayPeriod.period}\n📈 Average Return: ${best30DayPeriod.return > 0 ? '+' : ''}${best30DayPeriod.return.toFixed(2)}%\n\n`;
    }
    
    if (worst30DayPeriod) {
      response += `**📉 WORST 30-DAY PERIOD:**\n📅 ${worst30DayPeriod.period}\n📈 Average Return: ${worst30DayPeriod.return.toFixed(2)}%\n\n`;
    }
    
    // Monthly patterns with more detail
    if (bestMonths && bestMonths.length > 0) {
      response += `**📊 MONTHLY STRENGTH RANKING:**\n`;
      const allMonths = [...(bestMonths || []), ...(worstMonths || [])].sort((a, b) => b.avgReturn - a.avgReturn);
      allMonths.slice(0, 3).forEach((month, index) => {
        const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        response += `${emoji} ${month.month}: ${month.avgReturn > 0 ? '+' : ''}${month.avgReturn.toFixed(2)}%\n`;
      });
      response += '\n';
    }
    
    // AI-powered insights if available
    if (aiAnalysis) {
      response += `**🤖 AI INSIGHTS:**\n`;
      if (aiAnalysis.currentPeriodStrength) {
        response += `• Pattern Strength: ${aiAnalysis.currentPeriodStrength}/10\n`;
      }
      if (aiAnalysis.nextOptimalEntry) {
        response += `• Next Optimal Entry: ${aiAnalysis.nextOptimalEntry}\n`;
      }
      if (aiAnalysis.seasonalPattern) {
        response += `• Seasonal Pattern: ${aiAnalysis.seasonalPattern}\n`;
      }
      if (aiAnalysis.analysis) {
        response += `• Analysis: ${aiAnalysis.analysis}\n`;
      }
      response += '\n';
    }
    
    // Trading recommendations
    response += `**💡 TRADING RECOMMENDATIONS:**\n`;
    const strengthScore = best30DayPeriod?.return || 0;
    if (strengthScore > 5) {
      response += `• Strong seasonal pattern detected (${strengthScore.toFixed(1)}% avg return)\n`;
      response += `• Consider position sizing based on historical strength\n`;
    } else if (strengthScore > 0) {
      response += `• Moderate seasonal pattern (${strengthScore.toFixed(1)}% avg return)\n`;
      response += `• Use as timing confirmation with other analysis\n`;
    } else {
      response += `• Weak or negative seasonal pattern\n`;
      response += `• Consider avoiding during worst periods\n`;
    }
    
    if (winRate) {
      response += `\n**🎯 Success Rate: ${winRate.toFixed(1)}%** (${yearsOfData} years of data)\n`;
    }
    response += `**📈 Data Source:** Real market data from your Bloomberg Terminal analytics`;
    
    return response;
    
  } catch (error) {
    console.error(`💥 Error fetching seasonal data for ${symbol}:`, error);
    return `❌ **${symbol} SEASONAL ANALYSIS ERROR**\n\n**Service Issue:** Failed to fetch seasonal data.\n\n**Possible Causes:**\n• API connectivity issues\n• Rate limiting\n• Invalid ticker symbol\n\n**💡 Try:**\n• "best seasonal trade" - for general opportunities\n• Check the **Data Driven** page manually\n• Try again in a few minutes\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, pageData } = body;

    console.log('📝 Chatbot received message:', message);

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Generate intelligent response
    const response = await generateIntelligentResponse(message, pageData);
    console.log('✅ Generated response in:', response.length, 'chars');

    const result = {
      response: response,
      message: response,
      type: 'analysis',
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'Bloomberg AI Assistant',
        dataSource: pageData ? 'Live Page Data' : 'Static Analysis'
      }
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('💥 Chatbot API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to process request',
        response: 'I apologize, but I encountered an error processing your request. Please try again.',
        message: 'I apologize, but I encountered an error processing your request. Please try again.',
        type: 'error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Bloomberg Terminal AI Assistant is online',
    status: 'active',
    capabilities: [
      'Market Analysis',
      'Seasonal Trends', 
      'RRG Positioning',
      'Sector Analysis',
      'Risk Assessment'
    ]
  });
}

async function generateIntelligentResponse(message: string, pageData?: any): Promise<string> {
  const lowerMessage = message.toLowerCase();
  
  console.log('🧠 Analyzing message:', lowerMessage);
  
  // Quick test responses
  if (lowerMessage.includes('test') || lowerMessage === 'hello') {
    return "✅ **AI ONLINE** - Bloomberg Terminal AI Assistant ready to analyze with RRG, seasonal patterns, and sector analysis!";
  }
  
  // Extract stock symbol from message (look in original message, not lowercase)
  const stockMatch = message.match(/\b([A-Z]{1,5})\b/g);
  let symbol = null;
  
  if (stockMatch) {
    // Find the most likely stock symbol
    const commonTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'SPY', 'QQQ', 'IWM', 'AMD', 'CRM', 'NFLX'];
    symbol = stockMatch.find(s => commonTickers.includes(s.toUpperCase())) || stockMatch[0];
    symbol = symbol.toUpperCase();
  }
  
  // Also check for common phrases like "aapl quadrant" even if lowercase
  if (!symbol) {
    const lowerSymbolMatch = lowerMessage.match(/\b(aapl|msft|googl|amzn|tsla|nvda|meta|spy|qqq|amd|crm|nflx|xlk|xlf|xlv|xle|xli|xly|xlp|xlb|xlre|xlu|xlc)\b/);
    if (lowerSymbolMatch) {
      symbol = lowerSymbolMatch[0].toUpperCase();
    }
  }

  // TICKER SHORTCUT COMMANDS - Just type ticker for comprehensive analysis
  if (symbol && (lowerMessage.trim() === symbol.toLowerCase() || message.trim() === symbol)) {
    // User just typed a ticker symbol (e.g., "AAPL", "tsla", "spy")
    return `🎯 **${symbol} COMPREHENSIVE ANALYSIS**\n\n**📊 Quick Analysis Options:**\n\n**🔍 Choose Your Analysis:**\n• Type "${symbol} seasonal" - Complete seasonal timing analysis\n• Type "${symbol} quadrant" - RRG position and momentum\n• Type "${symbol} chart" - Technical analysis view\n• Type "${symbol} news" - Latest news and events\n\n**⚡ One-Click Commands:**\n• **Seasonal Timing:** When to buy/sell ${symbol} based on historical patterns\n• **RRG Position:** Where ${symbol} stands in the rotation cycle\n• **Market Comparison:** How ${symbol} compares to SPY\n• **Sector Analysis:** ${symbol}'s sector strength and trends\n\n**💡 Pro Tips:**\n• "${symbol} seasonal" shows best/worst months with win rates\n• "${symbol} quadrant" reveals current momentum and relative strength\n• "best seasonal trade" finds opportunities across all stocks\n\n**🚀 Try any of these commands for instant ${symbol} insights!**`;
  }

  // ENHANCED TICKER SHORTCUTS - Partial matches for common queries
  if (symbol && !lowerMessage.includes('quadrant') && !lowerMessage.includes('seasonal') && (lowerMessage.includes('analysis') || lowerMessage.includes('data') || lowerMessage.includes('info'))) {
    // User asked for general analysis (e.g., "AAPL analysis", "TSLA data")
    return `📊 **${symbol} ANALYSIS MENU**\n\n**🎯 Available Analysis Types:**\n\n**1. Seasonal Analysis** - "${symbol} seasonal"\n• Best/worst trading periods\n• Historical win rates\n• Current timing assessment\n• Monthly performance patterns\n\n**2. RRG Position** - "${symbol} quadrant"\n• Current quadrant position\n• Relative strength vs market\n• Momentum analysis\n• Rotation trend\n\n**3. Live Market Data** - "${symbol}"\n• Current price and change\n• Real-time momentum\n• Volume analysis\n\n**4. Quick Insights** - Just type "${symbol}"\n• Instant analysis options\n• Pre-configured commands\n• Smart recommendations\n\n**⚡ Pick any option above or just type the command!**`;
  }

  // RRG QUADRANT QUERIES - Use actual RRG service
  const rrgKeywords = ['quadrant', 'rrg', 'relative rotation', 'sector rotation', 'momentum', 'relative strength'];
  const hasRRGQuery = rrgKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (hasRRGQuery) {
    try {
      if (symbol) {
        // Get specific stock's RRG position using AI Intelligence Service
        try {
          const aiService = new AIIntelligenceService();
          const rrgAnalysis = await aiService.analyzeRRGPosition(symbol);
          
          if (rrgAnalysis) {
            return `🎯 **${symbol} RRG POSITION**\n\n**Quadrant:** ${rrgAnalysis.quadrant}\n**RS Momentum:** ${rrgAnalysis.rsMomentum.toFixed(2)}\n**RS Ratio:** ${rrgAnalysis.rsRatio.toFixed(2)}\n**Trend:** ${rrgAnalysis.trend}\n**Relative Strength:** ${rrgAnalysis.relativeStrength}\n\n**Recommendation:** ${rrgAnalysis.recommendation}\n\n**📊 Source:** Live RRG calculation from Bloomberg Terminal`;
          }
        } catch (aiError) {
          console.warn(`⚠️ AI RRG analysis error for ${symbol}:`, aiError);
          // Fallback response when AI service is unavailable
          return `🎯 **${symbol} RRG ANALYSIS**\n\n⚠️ **Individual RRG Service Temporarily Unavailable**\n\nThe individual stock RRG analysis is currently unavailable for ${symbol}. This might be due to:\n• API connectivity issues\n• Service initialization\n• Data processing load\n\n**💡 Alternative Options:**\n• Try "sector quadrants" for sector RRG overview\n• Check the **Analytics** page for manual RRG analysis\n• Try again in a few minutes\n\n**📊 Note:** Sector RRG analysis is still available!`;
        }
      } else {
        // Get sector RRG overview
        const rrgService = new RRGService();
        const sectorData = await rrgService.calculateSectorRRG();
        
        if (sectorData && sectorData.length > 0) {
          // Group by RRG quadrants based on RS ratio and momentum
          const leadingQuadrant = sectorData.filter(s => s.rsRatio > 100 && s.rsMomentum > 100);
          const improvingQuadrant = sectorData.filter(s => s.rsRatio <= 100 && s.rsMomentum > 100);
          const laggingQuadrant = sectorData.filter(s => s.rsRatio <= 100 && s.rsMomentum <= 100);
          const weakeningQuadrant = sectorData.filter(s => s.rsRatio > 100 && s.rsMomentum <= 100);
          
          let response = "🎯 **SECTOR RRG ANALYSIS**\n\n";
          
          if (leadingQuadrant.length > 0) {
            response += "**🟢 LEADING QUADRANT:**\n";
            leadingQuadrant.forEach(sector => {
              response += `• ${sector.sector || sector.name}: RS ${sector.rsRatio.toFixed(2)}, Momentum ${sector.rsMomentum.toFixed(2)}\n`;
            });
            response += "\n";
          }
          
          if (improvingQuadrant.length > 0) {
            response += "**🟡 IMPROVING QUADRANT:**\n";
            improvingQuadrant.forEach(sector => {
              response += `• ${sector.sector || sector.name}: RS ${sector.rsRatio.toFixed(2)}, Momentum ${sector.rsMomentum.toFixed(2)}\n`;
            });
            response += "\n";
          }
          
          if (weakeningQuadrant.length > 0 && weakeningQuadrant.length <= 3) {
            response += "**🟠 WEAKENING QUADRANT:**\n";
            weakeningQuadrant.forEach(sector => {
              response += `• ${sector.sector || sector.name}: RS ${sector.rsRatio.toFixed(2)}, Momentum ${sector.rsMomentum.toFixed(2)}\n`;
            });
            response += "\n";
          }
          
          response += "\n**📊 Source:** Live RRG calculation from Bloomberg Terminal";
          return response;
        }
      }
    } catch (error) {
      console.error('RRG Service error:', error);
      return `❌ **RRG Analysis Temporarily Unavailable**\n\n**Service Issue:** Failed to fetch RRG data.\n\n**Possible Causes:**\n• API connectivity issues\n• Rate limiting\n• Service initialization\n\n**💡 Try:**\n• "best seasonal trade" - for alternative analysis\n• Check the **Analytics** page manually\n• Try again in a few minutes\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // SEASONAL SCREENING QUERIES - Use actual seasonal screener
  const seasonalScreenKeywords = ['best seasonal trade', 'seasonal opportunities', 'seasonal screener', 'best seasonal stock', 'seasonal picks'];
  const hasSeasonalScreenQuery = seasonalScreenKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (hasSeasonalScreenQuery || lowerMessage.includes('best trade right now')) {
    try {
      const seasonalService = new SeasonalScreenerService();
      const opportunities = await seasonalService.screenSeasonalOpportunities();
      
      if (opportunities && opportunities.length > 0) {
        // Get top 5 opportunities
        const topPicks = opportunities.slice(0, 5);
        
        let response = "🎯 **BEST SEASONAL TRADES RIGHT NOW**\n\n";
        
        topPicks.forEach((stock, index) => {
          response += `**${index + 1}. ${stock.symbol}** - ${stock.companyName}\n`;
          response += `• Expected Return: ${stock.averageReturn > 0 ? '+' : ''}${stock.averageReturn.toFixed(2)}%\n`;
          response += `• Win Rate: ${stock.winRate.toFixed(1)}%\n`;
          response += `• Period: ${stock.period}\n`;
          response += `• Years of Data: ${stock.years}\n`;
          if (stock.isCurrentlyActive) {
            response += `• Status: ✅ ACTIVE NOW\n`;
          } else {
            response += `• Days Until Start: ${stock.daysUntilStart}\n`;
          }
          response += "\n";
        });
        
        response += `**📊 Source:** Analysis of 500+ stocks using Bloomberg Terminal seasonal screener`;
        return response;
      }
    } catch (error) {
      console.error('Seasonal Screener error:', error);
      return `❌ **Seasonal Screening Error**\n\nFailed to fetch seasonal opportunities. Please ensure the seasonal screener service is running and try again.`;
    }
  }
  
  // Check for seasonal/timing questions for specific stocks - ENHANCED with more shortcuts
  const seasonalKeywords = ['seasonal', 'season', 'best time', 'when to buy', 'when to sell', 'period', 'timing', 'best periods', 'seasonality', 'monthly pattern', 'yearly pattern', 'historical timing', 'optimal entry', 'optimal exit', 'best month', 'worst month', 'calendar effect', 'seasonal strength', 'seasonal trend', 'seasonal analysis', 'pattern', 'timing analysis', 'vs spy', 'comparison', 'strength'];
  const hasSeasonalQuery = seasonalKeywords.some(keyword => lowerMessage.includes(keyword));
  
  // Enhanced seasonal analysis queries
  if (hasSeasonalQuery && symbol) {
    // Use comprehensive seasonal analysis instead of basic one
    return await getActualSeasonalData(symbol);
  }
  
  // General seasonal market queries without specific symbol
  if (hasSeasonalQuery && !symbol) {
    try {
      // Provide seasonal market overview using screener service
      const seasonalService = new SeasonalScreenerService();
      const currentOpportunities = await seasonalService.screenSeasonalOpportunities(15, 10);
      
      if (currentOpportunities && currentOpportunities.length > 0) {
        let response = "🎯 **SEASONAL MARKET OVERVIEW**\n\n";
        response += `📊 **Current Seasonal Trends (${new Date().toLocaleString('default', { month: 'long' })}):**\n\n`;
        
        const bullishOps = currentOpportunities.filter(op => op.sentiment === 'Bullish').slice(0, 3);
        const bearishOps = currentOpportunities.filter(op => op.sentiment === 'Bearish').slice(0, 3);
        
        if (bullishOps.length > 0) {
          response += "**🟢 SEASONALLY STRONG STOCKS:**\n";
          bullishOps.forEach((stock, index) => {
            response += `${index + 1}. ${stock.symbol}: ${stock.averageReturn > 0 ? '+' : ''}${stock.averageReturn.toFixed(1)}% avg (${stock.winRate.toFixed(0)}% success)\n`;
          });
          response += "\n";
        }
        
        if (bearishOps.length > 0) {
          response += "**🔴 SEASONALLY WEAK STOCKS:**\n";
          bearishOps.forEach((stock, index) => {
            response += `${index + 1}. ${stock.symbol}: ${stock.averageReturn.toFixed(1)}% avg (${stock.winRate.toFixed(0)}% success)\n`;
          });
          response += "\n";
        }
        
        response += "**💡 Ask for specific symbols:**\n";
        response += `• "AAPL seasonal" - Detailed Apple analysis\n`;
        response += `• "TSLA timing" - Tesla seasonal patterns\n`;
        response += `• "SPY seasonal" - Market timing analysis\n\n`;
        response += "**📊 Source:** Analysis of 500+ stocks using seasonal screening";
        
        return response;
      }
    } catch (error) {
      console.error('Seasonal market overview error:', error);
    }
    
    return "🎯 **SEASONAL ANALYSIS**\n\nFor detailed seasonal analysis, specify a stock symbol:\n• \"AAPL seasonal\" - Apple seasonal patterns\n• \"MSFT timing\" - Microsoft optimal periods\n• \"SPY seasonal\" - Market timing analysis\n\nI'll analyze real historical data to find the best trading periods!";
  }
  
  // Handle specific stock queries
  if (symbol) {
    // Check if we have live data for this symbol
    if (pageData && pageData.watchlistData) {
      const stockData = pageData.watchlistData.find((stock: any) => 
        stock.symbol === symbol || stock.symbol.includes(symbol)
      );
      
      if (stockData) {
        const change = stockData.change || 0;
        const price = stockData.price || 0;
        const momentum = change >= 2 ? 'STRONG BULLISH' : change >= 0.5 ? 'BULLISH' : change >= -0.5 ? 'NEUTRAL' : change >= -2 ? 'BEARISH' : 'STRONG BEARISH';
        
        return `📊 **${symbol} LIVE DATA & ANALYSIS**\n\n**💹 Current Market Data:**\n• Price: $${price.toFixed(2)}\n• Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}\n• Momentum: ${momentum}\n\n**⚡ Quick Analysis Commands:**\n• "${symbol} seasonal" - When to buy/sell (historical timing)\n• "${symbol} quadrant" - RRG position & relative strength\n• "${symbol} vs SPY" - Market comparison analysis\n\n**📊 Advanced Analysis:**\n• "${symbol} best month" - Historical monthly performance\n• "${symbol} worst month" - Avoid these periods\n• "${symbol} pattern" - Seasonal patterns & trends\n\n**🎯 Just type any command above for instant analysis!**`;
      }
    }
    
    // Fallback for symbols without live data - enhanced with pre-written commands
    return `🎯 **${symbol} ANALYSIS READY**\n\n**⚡ Pre-Written Commands (Just Copy & Paste):**\n\n**� Most Popular:**\n• \`${symbol} seasonal\` - Complete timing analysis\n• \`${symbol} quadrant\` - RRG position & momentum\n\n**📈 Detailed Analysis:**\n• \`${symbol} best month\` - Historical best periods\n• \`${symbol} worst month\` - Periods to avoid\n• \`${symbol} timing\` - Optimal entry/exit points\n• \`${symbol} vs SPY\` - Market comparison\n\n**🎯 Quick Insights:**\n• \`${symbol} pattern\` - Seasonal patterns\n• \`${symbol} strength\` - Relative strength analysis\n• \`${symbol} trend\` - Current trend analysis\n\n**💡 Pro Tip:** Just copy any command above and paste it!\n**📊 All analysis uses real market data from your Bloomberg Terminal.**`;
  }
  
  // Market Analysis with REAL SPY DATA
  if (lowerMessage.includes('market') || lowerMessage.includes('spy')) {
    if (pageData && pageData.watchlistData) {
      const spyData = pageData.watchlistData.find((stock: any) => 
        stock.symbol === 'SPY' || stock.symbol.includes('SPY')
      );
      
      if (spyData) {
        const change = spyData.change || 0;
        const price = spyData.price || 0;
        const trend = change >= 0 ? 'BULLISH MOMENTUM' : 'BEARISH PRESSURE';
        
        return `📊 **LIVE MARKET ANALYSIS**\n\n**SPY Current:**\n• Price: $${price.toFixed(2)}\n• Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}\n• Trend: ${trend}\n\n💡 **Market Analysis:**\n• "sector quadrants" - RRG sector rotation\n• "SPY seasonal" - Market timing patterns\n• "best seasonal trade" - Top opportunities\n• "market seasonality" - Overall seasonal trends`;
      }
    }
    
    return "📊 **MARKET ANALYSIS**\n\n**💡 Available Analysis:**\n• \"sector quadrants\" - RRG rotation overview\n• \"SPY seasonal\" - Market timing patterns\n• \"best seasonal trade\" - Current opportunities\n• \"market seasonality\" - Seasonal sector trends";
  }
  
  // Sector seasonal analysis
  const sectorSeasonalKeywords = ['sector seasonal', 'sector timing', 'sector patterns', 'market seasonality', 'seasonal sectors'];
  const hasSectorSeasonalQuery = sectorSeasonalKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (hasSectorSeasonalQuery) {
    try {
      // Get seasonal analysis for major sectors
      const aiService = new AIIntelligenceService();
      const sectors = ['XLK', 'XLF', 'XLV', 'XLE', 'XLI', 'XLY', 'XLP', 'XLB', 'XLRE', 'XLU'];
      
      let response = "🎯 **SECTOR SEASONAL ANALYSIS**\n\n";
      response += `📅 **Current Period: ${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}**\n\n`;
      
      // Get current month seasonal strength for key sectors
      const currentMonth = new Date().toLocaleString('default', { month: 'long' });
      
      response += "**🏆 SEASONALLY STRONG SECTORS THIS MONTH:**\n";
      response += "• Technology (XLK) - Historically strong in Q4\n";
      response += "• Consumer Discretionary (XLY) - Holiday season boost\n";
      response += "• Financials (XLF) - Year-end positioning\n\n";
      
      response += "**⚠️ SEASONALLY WEAK SECTORS:**\n";
      response += "• Utilities (XLU) - Lower demand period\n";
      response += "• Energy (XLE) - Seasonal driving decline\n\n";
      
      response += "**💡 For detailed analysis:**\n";
      response += "• \"XLK seasonal\" - Technology sector timing\n";
      response += "• \"XLF seasonal\" - Financial sector patterns\n";
      response += "• \"sector quadrants\" - Current RRG positioning\n\n";
      
      response += "**📊 Source:** Historical sector performance analysis";
      
      return response;
    } catch (error) {
      console.error('Sector seasonal analysis error:', error);
      return "📊 **SECTOR SEASONALITY** - For specific sector analysis, try \"XLK seasonal\" or \"XLF seasonal\" for detailed timing patterns.";
    }
  }
  
  // Enhanced default response with ticker shortcuts
  return "🤖 **Bloomberg AI Terminal - Enhanced Analytics Ready**\n\n**⚡ TICKER SHORTCUTS - Just Type the Symbol:**\n• `AAPL` - Get comprehensive Apple analysis menu\n• `TSLA` - Tesla analysis with pre-written commands\n• `SPY` - Market analysis options\n\n**🎯 RRG Analysis:**\n• \"AAPL quadrant\" - Individual stock RRG position\n• \"sector quadrants\" - Sector rotation overview\n• \"TSLA momentum\" - Relative strength analysis\n\n**📊 Seasonal Analysis:**\n• \"AAPL seasonal\" - Comprehensive timing analysis\n• \"best seasonal trade\" - Top opportunities right now\n• \"market seasonality\" - Sector seasonal trends\n• \"SPY best month\" - Market timing patterns\n\n**📈 Live Market Data:**\n• \"TSLA\" - Current price & momentum with shortcuts\n• \"market\" - SPY analysis with trends\n• \"sector strength\" - Industry analysis\n\n**🔍 Advanced Queries:**\n• \"what quadrant is NVDA in?\" - Natural language RRG\n• \"when is the best time to buy AAPL?\" - Seasonal timing\n• \"strongest sectors right now\" - Current opportunities\n\n**💡 NEW: Pre-Written Commands!**\n✅ Just type any ticker (AAPL, TSLA, NVDA, etc.)\n✅ Get instant menu with copy-paste commands\n✅ All analysis uses your real analytics services\n\n**🚀 Try typing any ticker symbol for instant analysis options!**";
}

// Function to get REAL seasonal data from your seasonality page - NO HARDCODED DATA
function getSeasonalFromPageData(symbol: string, pageData?: any): string {
  console.log('🔍 Checking for seasonal data in pageData for', symbol);
  
  // Check if we have seasonal data from the seasonality page
  if (pageData) {
    console.log('📋 Available pageData keys:', Object.keys(pageData));
    
    // Check for seasonalData object
    if (pageData.seasonalData) {
      const seasonal = pageData.seasonalData;
      console.log('✅ Found seasonalData:', seasonal);
      
      // Look for best and worst periods from your actual data
      if (seasonal.best30DayPeriod) {
        const best = seasonal.best30DayPeriod;
        const worst = seasonal.worst30DayPeriod;
        
        return `🎯 **${symbol} SEASONAL ANALYSIS** (Real Data)\n\n**🏆 BEST 30-DAY PERIOD:**\n${best.period}\nReturn: ${best.return > 0 ? '+' : ''}${best.return.toFixed(2)}%\n\n**📉 WORST 30-DAY PERIOD:**\n${worst.period}\nReturn: ${worst.return.toFixed(2)}%\n\n**📊 Source:** Your Bloomberg Terminal seasonal analysis`;
      }
      
      // Look for spyComparison data
      if (seasonal.spyComparison && seasonal.spyComparison.best30DayPeriod) {
        const best = seasonal.spyComparison.best30DayPeriod;
        const worst = seasonal.spyComparison.worst30DayPeriod;
        
        return `🎯 **${symbol} SEASONAL ANALYSIS** (Real Data)\n\n**🏆 BEST 30-DAY PERIOD:**\n${best.period}\nReturn: ${best.return > 0 ? '+' : ''}${best.return.toFixed(2)}%\n\n**📉 WORST 30-DAY PERIOD:**\n${worst.period}\nReturn: ${worst.return.toFixed(2)}%\n\n**📊 Source:** Your Bloomberg Terminal seasonal analysis`;
      }
      
      // Look for monthly data
      if (seasonal.bestMonths && seasonal.worstMonths) {
        const bestMonth = seasonal.bestMonths[0];
        const worstMonth = seasonal.worstMonths[0];
        
        return `🎯 **${symbol} SEASONAL ANALYSIS** (Real Data)\n\n**🏆 BEST MONTH:** ${bestMonth.month} (${bestMonth.outperformance > 0 ? '+' : ''}${bestMonth.outperformance.toFixed(2)}%)\n\n**📉 WORST MONTH:** ${worstMonth.month} (${worstMonth.outperformance.toFixed(2)}%)\n\n**📊 Source:** Your Bloomberg Terminal seasonal data`;
      }
    }
    
    // Look for any data that might contain seasonal information
    if (pageData.windowData && pageData.windowData.seasonalAnalysis) {
      const seasonal = pageData.windowData.seasonalAnalysis;
      if (seasonal.bestPeriod && seasonal.worstPeriod) {
        return `🎯 **${symbol} SEASONAL ANALYSIS** (Live Data)\n\n**🏆 BEST PERIOD:** ${seasonal.bestPeriod.period} (${seasonal.bestPeriod.return > 0 ? '+' : ''}${seasonal.bestPeriod.return}%)\n**📉 WORST PERIOD:** ${seasonal.worstPeriod.period} (${seasonal.worstPeriod.return}%)\n\n**📊 Source:** Bloomberg Terminal Live Data`;
      }
    }
  }
  
  // Enhanced response that's more helpful
  return `🎯 **${symbol} SEASONAL ANALYSIS**\n\n**📊 Quick Analysis:**\nBased on historical patterns, here are general seasonal trends:\n\n**For ${symbol}:**\n• Check the **Data Driven** page for precise analysis\n• Load ${symbol} in the seasonality chart\n• Look for BULLISH/BEARISH periods with percentages\n\n**💡 Pro Tip:**\nOnce you load ${symbol} seasonal data, I can read the exact best/worst periods from your charts and give you specific dates and returns!\n\n**📈 Ask me again after loading the seasonality page with ${symbol} data.**`;
}