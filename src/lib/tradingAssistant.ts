interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface TradingKnowledge {
  patterns: { trigger: RegExp; response: string | ((match: RegExpMatchArray) => string | Promise<string>) }[];
  indicators: Record<string, string>;
  strategies: Record<string, string>;
  terminology: Record<string, string>;
}

export class TradingAssistant {
  private knowledge: TradingKnowledge;
  private baseUrl: string;
  private POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
    this.knowledge = {
      patterns: [
        // Greetings
        { 
          trigger: /^(hi|hello|hey|greetings)/i, 
          response: "Hello! I'm your Trading Guide AI assistant. I can help you with technical analysis, trading strategies, market insights, and more. What would you like to know?" 
        },

        // Open Interest queries with specific expiration (ticker first: e.g., "AAPL oi weekly")
        {
          trigger: /^([a-z]+)\s+oi\s+(weekly|45d|monthly|quad|quadwitching|all)$/i,
          response: async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            const expType = match[2].toLowerCase();
            return await this.getOIData(ticker, expType);
          }
        },

        // Open Interest queries with custom date range (ticker first: e.g., "AAPL oi 12/19/2025-01/17/2026")
        {
          trigger: /^([a-z]+)\s+oi\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})$/i,
          response: async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            let startDate = match[2];
            let endDate = match[3];
            
            // Convert MM/DD/YY to YYYY-MM-DD
            if (startDate.includes('/')) {
              const [month, day, year] = startDate.split('/');
              const fullYear = year.length === 2 ? `20${year}` : year;
              startDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            
            if (endDate.includes('/')) {
              const [month, day, year] = endDate.split('/');
              const fullYear = year.length === 2 ? `20${year}` : year;
              endDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            
            return await this.getOIData(ticker, 'range', undefined, startDate, endDate);
          }
        },

        // Open Interest queries with custom date (ticker first: e.g., "AAPL oi 12/19/2025")
        {
          trigger: /^([a-z]+)\s+oi\s+(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})$/i,
          response: async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            let dateStr = match[2];
            
            // Convert MM/DD/YYYY to YYYY-MM-DD
            if (dateStr.includes('/')) {
              const [month, day, year] = dateStr.split('/');
              dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            
            return await this.getOIData(ticker, 'custom', dateStr);
          }
        },

        // Open Interest queries without expiration - ask user (ticker first: e.g., "AAPL oi")
        {
          trigger: /^([a-z]+)\s+oi$/i,
          response: (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return `**${ticker} Open Interest Analysis**\n\nWhich expiration would you like?\n\n📅 **Weekly** - Next weekly expiration\n📅 **45d** - Aggregated 45-day view\n📅 **Monthly** - Next monthly expiration\n📅 **Quad Witching** - Next quarterly expiration\n📅 **All** - Show all four\n📅 **Custom Date** - Specify like "${ticker} oi 12/19/2025"\n\nJust reply with: "${ticker} oi weekly" or "${ticker} oi all"`;
          }
        },

        // Expected Range queries - Weekly (e.g., "AAPL weekly range")
        {
          trigger: /^([a-z]+)\s+weekly\s+range$/i,
          response: async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getExpectedRange(ticker, 'weekly');
          }
        },

        // Expected Range queries - Weekly with custom date (e.g., "AAPL weekly range 12/26/25")
        {
          trigger: /^([a-z]+)\s+weekly\s+range\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})$/i,
          response: async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            let dateStr = match[2];
            
            // Convert MM/DD/YY to YYYY-MM-DD
            if (dateStr.includes('/')) {
              const [month, day, year] = dateStr.split('/');
              const fullYear = year.length === 2 ? `20${year}` : year;
              dateStr = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            
            return await this.getExpectedRange(ticker, 'weekly', dateStr);
          }
        },

        // Expected Range queries - Monthly (e.g., "AAPL monthly range")
        {
          trigger: /^([a-z]+)\s+monthly\s+range$/i,
          response: async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getExpectedRange(ticker, 'monthly');
          }
        },

        // Expected Range queries - Monthly with custom date (e.g., "AAPL monthly range 1/16/26")
        {
          trigger: /^([a-z]+)\s+monthly\s+range\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})$/i,
          response: async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            let dateStr = match[2];
            
            // Convert MM/DD/YY to YYYY-MM-DD
            if (dateStr.includes('/')) {
              const [month, day, year] = dateStr.split('/');
              const fullYear = year.length === 2 ? `20${year}` : year;
              dateStr = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            
            return await this.getExpectedRange(ticker, 'monthly', dateStr);
          }
        },

        // Options Flow queries - ticker first (e.g., "amd flow", "nvda options flow")
        {
          trigger: /^([a-z]+)\s+(?:options?\s+)?flow$/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getOptionsFlow(ticker, false, 50000);
          }).bind(this)
        },

        // Best Flow - A grade only (REQUIRES "flow" - e.g., "amd best flow", "nvda best flow")
        {
          trigger: /^([a-z]+)\s+best\s+flow$/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getOptionsFlow(ticker, true, 0, 'A');
          }).bind(this)
        },

        // Best 30-day periods (e.g., "aapl best 30day", "nvda best 30d")
        {
          trigger: /^([a-z]+)\s+best\s+30\s?(?:d|day|days)$/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getBest30Day(ticker, 20);
          }).bind(this)
        },

        // Worst 30-day periods (e.g., "aapl worst 30day", "nvda worst 30d")
        {
          trigger: /^([a-z]+)\s+worst\s+30\s?(?:d|day|days)$/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getWorst30Day(ticker, 20);
          }).bind(this)
        },

        // EFI Highlights query - efi before ticker (e.g., "efi amd", "efi highlights nvda")
        {
          trigger: /efi\s+(?:highlights?)?\s*([a-z]+)/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getOptionsFlow(ticker, true);
          }).bind(this)
        },

        // EFI Highlights query - ticker before efi (e.g., "amd efi", "nvda efi highlights")
        {
          trigger: /([a-z]+)\s+efi\s*(?:highlights?)?/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getOptionsFlow(ticker, true);
          }).bind(this)
        },

        // Seasonal Chart - ticker seasonal with optional years (e.g., "aapl seasonal 20y", "nvda seasonal")
        {
          trigger: /([a-z]+)\s+seasonal(?:\s+(\d+)y)?/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            const years = match[2] ? parseInt(match[2]) : 20; // Default 20 years
            return await this.getSeasonalChart(ticker, years, false);
          }).bind(this)
        },

        // Seasonal Post-Election (e.g., "aapl seasonal post election", "nvda post election")
        {
          trigger: /([a-z]+)\s+(?:seasonal\s+)?post[\s-]?election/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getSeasonalChart(ticker, 20, true, 'Post-Election');
          }).bind(this)
        },

        // Seasonal Election Year
        {
          trigger: /([a-z]+)\s+(?:seasonal\s+)?election\s+year/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getSeasonalChart(ticker, 20, true, 'Election Year');
          }).bind(this)
        },

        // Seasonal Mid-Term
        {
          trigger: /([a-z]+)\s+(?:seasonal\s+)?mid[\s-]?term/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getSeasonalChart(ticker, 20, true, 'Mid-Term');
          }).bind(this)
        },

        // Seasonal Pre-Election
        {
          trigger: /([a-z]+)\s+(?:seasonal\s+)?pre[\s-]?election/i,
          response: (async (match: RegExpMatchArray) => {
            const ticker = match[1].toUpperCase();
            return await this.getSeasonalChart(ticker, 20, true, 'Pre-Election');
          }).bind(this)
        },

        // Market Analysis
        { 
          trigger: /(market regime|regime analysis)/i,
          response: "**Market Regime Analysis**\n\nIdentifying the current market environment to adapt your strategy.\n\n**Four Main Regimes:**\n\n**1. Trending Bull:**\n- Higher highs, higher lows\n- Strategy: Buy dips, momentum plays\n- Indicators: Price > MA(200), RSI > 50\n\n**2. Trending Bear:**\n- Lower highs, lower lows\n- Strategy: Sell rallies, short momentum\n- Indicators: Price < MA(200), RSI < 50\n\n**3. Range-Bound:**\n- Sideways price action\n- Strategy: Mean reversion, sell volatility\n- Indicators: Flat MAs, low ADX\n\n**4. High Volatility:**\n- Erratic swings\n- Strategy: Wait for clarity or trade breakouts\n- Indicators: High VIX, wide BB\n\n**Adaptation is Key:** Most traders fail by using wrong strategy for current regime"
        },

        { 
          trigger: /(volume|volume analysis)/i,
          response: "**Volume Analysis**\n\nVolume is the number of shares/contracts traded and validates price movements.\n\n**Key Principles:**\n\n**1. Volume Confirmation:**\n- Rising prices + rising volume = Strong uptrend ✓\n- Rising prices + falling volume = Weak, potential reversal ⚠\n- Falling prices + rising volume = Strong downtrend ✓\n- Falling prices + falling volume = Weak, potential reversal ⚠\n\n**2. Volume Patterns:**\n- **Climax Volume:** Extreme volume often marks tops/bottoms\n- **Dry Up:** Very low volume before major moves\n- **Accumulation:** Quiet volume near support\n- **Distribution:** Quiet volume near resistance\n\n**3. Key Indicators:**\n- VWAP (Volume Weighted Average Price)\n- OBV (On Balance Volume)\n- Volume Profile\n- Money Flow Index\n\n**Rule:** Never trade breakouts without volume confirmation!"
        },

        // Risk Management
        { 
          trigger: /(risk management|risk|money management)/i,
          response: "**Risk Management - The Most Important Skill**\n\nProper risk management is what separates profitable traders from losers.\n\n**Core Rules:**\n\n**1. Position Sizing:**\n- Risk 1-2% of capital per trade\n- Formula: Position Size = (Account × Risk%) / (Entry - Stop)\n- Never risk more because you're confident\n\n**2. Stop Losses:**\n- Always use stops (no exceptions)\n- Place at technical levels (not arbitrary)\n- Never move stops against you\n\n**3. Risk/Reward:**\n- Minimum 2:1 ratio\n- Better to take fewer high-quality setups\n\n**4. Diversification:**\n- Don't concentrate in one sector\n- Maximum 5% of portfolio in single position\n- Correlation matters\n\n**5. Max Daily Loss:**\n- Set daily loss limit (3-5%)\n- Stop trading when hit\n- Prevents revenge trading\n\n**Remember:** Protect your capital first, profits second!"
        },

        { 
          trigger: /(psychology|trading psychology|mental|mindset)/i,
          response: "**Trading Psychology**\n\nYour mindset determines 80% of your success.\n\n**Common Psychological Traps:**\n\n**1. Fear of Missing Out (FOMO)**\n- Chasing trades after breakout\n- Solution: Wait for pullbacks, trade plan\n\n**2. Revenge Trading**\n- Trying to win back losses immediately\n- Solution: Take break after loss, follow rules\n\n**3. Overconfidence**\n- Increasing size after winning streak\n- Solution: Stick to risk management always\n\n**4. Analysis Paralysis**\n- Too much information, can't decide\n- Solution: Simplify system, trust setups\n\n**5. Loss Aversion**\n- Holding losers too long\n- Solution: Accept losses quickly, cut fast\n\n**Mental Edge Builders:**\n- Keep trading journal\n- Meditate before session\n- Exercise regularly\n- Have life outside trading\n- Review mistakes, not P&L\n\n**Truth:** Technical skills matter, but psychology wins"
        },

        // Platform Features
        { 
          trigger: /(how to use|how do i use|what is) (this platform|the platform|efi chart)/i,
          response: "**Your EFI Platform Features**\n\nYou have access to professional-grade tools:\n\n**📊 Chart Tools:**\n- Multiple timeframes (5M, 1H, Daily)\n- Advanced drawing tools (trend lines, channels, Fib)\n- Custom indicators overlay\n\n**📈 Analysis Suite:**\n- **GEX Analysis:** Gamma exposure visualization\n- **IV & HV Screeners:** Find volatility opportunities\n- **Seasonal Patterns:** Historical trend analysis\n- **RRG Analysis:** Relative rotation graphs\n\n**⚡ Options Tools:**\n- Real-time options flow\n- Live FlowMoves tracking\n- Expansion/Liquidation signals\n- Dealer attraction levels\n\n**💡 Pro Tips:**\n- Use GEX to identify support/resistance\n- Check seasonal patterns for edge\n- Monitor options flow for institutional activity\n- Combine multiple indicators for confirmation\n\n**Need specific help?** Ask me about any feature!"
        },

        { 
          trigger: /(seasonal|seasonality)/i,
          response: "**Seasonal Analysis**\n\nHistorical patterns that repeat based on time of year.\n\n**Key Seasonal Patterns:**\n\n**Monthly:**\n- January Effect: Small caps outperform\n- September: Historically weakest month\n- December: Santa Rally (last week)\n\n**Weekly:**\n- Monday: Often weak (weekend news)\n- Tuesday-Wednesday: Strongest days\n- Friday: Profit-taking\n\n**Intraday:**\n- First hour: High volatility\n- 10:30 AM: Trend often established\n- Lunch: Low volume doldrums\n- Last hour: Power hour volatility\n\n**Election Cycle:**\n- Year 1-2: Generally weaker\n- Year 3-4: Pre-election rally\n\n**How to Use:**\n1. Know the seasonal bias\n2. Combine with technical analysis\n3. Don't trade against strong seasonal trends\n4. Use for timing entries/exits\n\n**Your Platform:** Click SEASONAL button for historical data"
        },

        // Help and general
        { 
          trigger: /(help|what can you do|capabilities|features)/i,
          response: "**I Can Help You With:**\n\n**📊 Technical Analysis:**\n- Indicators (RSI, MACD, Bollinger Bands, etc.)\n- Chart patterns and formations\n- Support/resistance identification\n- Trend analysis\n\n**🎯 Trading Strategies:**\n- Day trading setups\n- Swing trading techniques\n- Scalping methods\n- Options strategies\n\n**📈 Options Trading:**\n- GEX (Gamma Exposure)\n- IV vs HV analysis\n- Options flow interpretation\n- Greeks explanation\n\n**💰 Risk Management:**\n- Position sizing\n- Stop loss placement\n- Portfolio management\n- Risk/reward optimization\n\n**🧠 Trading Psychology:**\n- Mental discipline\n- Emotional control\n- Trading journal tips\n\n**🔧 Platform Features:**\n- How to use EFI tools\n- Feature explanations\n\n**Just ask me anything!** Examples:\n- \"Explain RSI\"\n- \"Best scalping strategy\"\n- \"How to manage risk\"\n- \"What is GEX\""
        },

        // Default fallback
        { 
          trigger: /.*/,
          response: (match: RegExpMatchArray) => {
            const query = match[0].toLowerCase();
            
            if (query.includes('trade') || query.includes('strategy')) {
              return "What type of trading strategy are you interested in?";
            }
            
            if (query.includes('indicator') || query.includes('technical')) {
              return "Which technical indicator would you like to learn about?";
            }
            
            if (query.includes('option')) {
              return "What aspect of options trading interests you?";
            }
            
            return "I can help with trading strategies, technical analysis, and options. What would you like to know?";
          }
        }
      ],
      
      indicators: {},
      strategies: {},
      terminology: {}
    };
  }

  async generateResponse(userMessage: string, conversationHistory: Message[]): Promise<string> {
    // Clean and normalize input
    const normalizedMessage = userMessage.trim();
    
    // Check for empty message
    if (!normalizedMessage) {
      return "I didn't receive a message. How can I help you with trading today?";
    }

    // Find matching pattern
    for (const pattern of this.knowledge.patterns) {
      const match = normalizedMessage.match(pattern.trigger);
      if (match) {
        if (typeof pattern.response === 'function') {
          const result = pattern.response(match);
          // Handle async responses
          if (result && typeof result === 'object' && 'then' in result) {
            return await result;
          }
          return result as string;
        }
        return pattern.response;
      }
    }

    // Fallback - should be caught by .* pattern, but just in case
    return "I'm here to help with trading strategies, technical analysis, options trading, and more. What would you like to know?";
  }

  // Black-Scholes calculation methods
  private normalCDF(x: number): number {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  private erf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  private calculateD2(S: number, K: number, r: number, sigma: number, T: number): number {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    return d1 - sigma * Math.sqrt(T);
  }

  private chanceOfProfitSellCall(S: number, K: number, r: number, sigma: number, T: number): number {
    const d2 = this.calculateD2(S, K, r, sigma, T);
    return (1 - this.normalCDF(d2)) * 100;
  }

  private chanceOfProfitSellPut(S: number, K: number, r: number, sigma: number, T: number): number {
    const d2 = this.calculateD2(S, K, r, sigma, T);
    return this.normalCDF(d2) * 100;
  }

  private findStrikeForProbability(S: number, r: number, sigma: number, T: number, targetProb: number, isCall: boolean): number {
    if (isCall) {
      let low = S + 0.01, high = S * 1.50;
      for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        const prob = this.chanceOfProfitSellCall(S, mid, r, sigma, T);
        if (Math.abs(prob - targetProb) < 0.1) return mid;
        if (prob < targetProb) low = mid; else high = mid;
      }
      return (low + high) / 2;
    } else {
      let low = S * 0.50, high = S - 0.01;
      for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        const prob = this.chanceOfProfitSellPut(S, mid, r, sigma, T);
        if (Math.abs(prob - targetProb) < 0.1) return mid;
        if (prob < targetProb) high = mid; else low = mid;
      }
      return (low + high) / 2;
    }
  }

  // Fetch and calculate Expected Ranges (80% and 90% probability ranges)
  private async getExpectedRange(ticker: string, expType: 'weekly' | 'monthly', customDate?: string): Promise<string> {
    try {
      const url = `${this.baseUrl}/api/dealer-options-premium?ticker=${ticker}`;
      const response = await fetch(url);
      const result = await response.json();

      if (!result.success || !result.data) {
        return `❌ Unable to fetch options data for ${ticker}. The ticker may not have options available.`;
      }

      let currentPrice = result.currentPrice || 0;
      
      // If currentPrice not in top level, try to extract from data
      if (currentPrice === 0) {
        const firstExp = Object.keys(result.data)[0];
        if (firstExp && result.data[firstExp]) {
          const expData = result.data[firstExp];
          const strikes = Object.keys(expData.calls || expData.puts || {}).map(Number).sort((a, b) => a - b);
          if (strikes.length > 0) {
            currentPrice = strikes[Math.floor(strikes.length / 2)];
          }
        }
      }

      if (currentPrice === 0) {
        return `❌ Unable to determine current price for ${ticker}.`;
      }

      const allExpirations = Object.keys(result.data).sort();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find the appropriate expiration
      let expiration: string | null = null;
      
      if (customDate) {
        // Use custom date if provided
        if (!allExpirations.includes(customDate)) {
          const available = allExpirations.slice(0, 5).join(', ');
          return `❌ Expiration ${customDate} not found for ${ticker}.\n\nAvailable expirations: ${available}${allExpirations.length > 5 ? '...' : ''}`;
        }
        expiration = customDate;
      } else if (expType === 'weekly') {
        // Find next Friday (weekly expiration)
        const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
        const nextFriday = new Date(today.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
        const nextFridayStr = nextFriday.toISOString().split('T')[0];
        
        expiration = allExpirations.find(exp => exp >= nextFridayStr) || null;
      } else if (expType === 'monthly') {
        // Find next monthly (3rd Friday of the month)
        const findThirdFriday = (date: Date): Date => {
          const year = date.getFullYear();
          const month = date.getMonth();
          const firstDay = new Date(year, month, 1);
          const firstFriday = (5 - firstDay.getDay() + 7) % 7 + 1;
          const thirdFriday = firstFriday + 14;
          return new Date(year, month, thirdFriday);
        };
        
        let thirdFriday = findThirdFriday(today);
        if (thirdFriday <= today) {
          const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
          thirdFriday = findThirdFriday(nextMonth);
        }
        
        const thirdFridayStr = thirdFriday.toISOString().split('T')[0];
        expiration = allExpirations.find(exp => exp === thirdFridayStr) || 
                     allExpirations.find(exp => exp >= thirdFridayStr) || null;
      }

      if (!expiration) {
        return `❌ No ${expType} expiration found for ${ticker}.`;
      }

      const expData = result.data[expiration];
      if (!expData || (!expData.calls && !expData.puts)) {
        return `❌ No options data available for ${ticker} on ${expiration}.`;
      }

      // Calculate average IV from ATM options
      let avgIV = 0.30; // Default
      const atmStrike = Object.keys(expData.calls || {})
        .map(Number)
        .reduce((prev, curr) => Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev, 0);

      if (atmStrike && expData.calls && expData.calls[atmStrike]) {
        avgIV = expData.calls[atmStrike].implied_volatility || 0.30;
      }

      // Calculate days to expiry and time fraction
      const expDate = new Date(expiration + 'T16:00:00');
      const daysToExpiry = Math.max(1, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
      const T = daysToExpiry / 365;
      const r = 0.0387;

      // Calculate 80% and 90% ranges
      const call90 = this.findStrikeForProbability(currentPrice, r, avgIV, T, 90, true);
      const put90 = this.findStrikeForProbability(currentPrice, r, avgIV, T, 90, false);
      const call80 = this.findStrikeForProbability(currentPrice, r, avgIV, T, 80, true);
      const put80 = this.findStrikeForProbability(currentPrice, r, avgIV, T, 80, false);

      // Format the output
      const label = expType === 'weekly' ? 'Weekly' : 'Monthly';
      const pct90Width = (((call90 - put90) / currentPrice) * 100).toFixed(1);
      const pct80Width = (((call80 - put80) / currentPrice) * 100).toFixed(1);
      const pct90Down = (((currentPrice - put90) / currentPrice) * 100).toFixed(1);
      const pct90Up = (((call90 - currentPrice) / currentPrice) * 100).toFixed(1);
      const pct80Down = (((currentPrice - put80) / currentPrice) * 100).toFixed(1);
      const pct80Up = (((call80 - currentPrice) / currentPrice) * 100).toFixed(1);
      
      return `## ${ticker} - ${label} Expected Range

**Current Price:** $${currentPrice.toFixed(2)} | **Expiration:** ${expiration} | **DTE:** ${daysToExpiry} | **IV:** ${(avgIV * 100).toFixed(1)}%

---

| Probability | Low | High | Range Width | Downside | Upside |
|-------------|-----|------|-------------|----------|--------|
| **90%** | $${put90.toFixed(2)} | $${call90.toFixed(2)} | $${(call90 - put90).toFixed(2)} (${pct90Width}%) | -$${(currentPrice - put90).toFixed(2)} (-${pct90Down}%) | +$${(call90 - currentPrice).toFixed(2)} (+${pct90Up}%) |
| **80%** | $${put80.toFixed(2)} | $${call80.toFixed(2)} | $${(call80 - put80).toFixed(2)} (${pct80Width}%) | -$${(currentPrice - put80).toFixed(2)} (-${pct80Down}%) | +$${(call80 - currentPrice).toFixed(2)} (+${pct80Up}%) |`;

    } catch (error) {
      console.error('Error fetching expected range:', error);
      return `❌ Error calculating expected range for ${ticker}. Please try again.`;
    }
  }

  // Fetch and calculate OI data with P/C ratio
  private async getOIData(ticker: string, expType: string, customDate?: string, startDate?: string, endDate?: string): Promise<string> {
    try {
      const url = `${this.baseUrl}/api/dealer-options-premium?ticker=${ticker}`;
      const response = await fetch(url);
      const result = await response.json();

      if (!result.success || !result.data) {
        return `❌ Unable to fetch options data for ${ticker}. The ticker may not have options available.`;
      }

      let currentPrice = result.currentPrice || 0;
      
      // If currentPrice not in top level, try to extract from data
      if (currentPrice === 0) {
        const firstExp = Object.keys(result.data)[0];
        if (firstExp && result.data[firstExp]) {
          const expData = result.data[firstExp];
          // Try to get from calls or puts data
          const strikes = Object.keys(expData.calls || expData.puts || {}).map(Number).sort((a, b) => a - b);
          if (strikes.length > 0) {
            // Estimate current price as middle strike
            currentPrice = strikes[Math.floor(strikes.length / 2)];
          }
        }
      }
      
      if (currentPrice === 0) {
        return `❌ Unable to determine current price for ${ticker}.`;
      }

      const allExpirations = Object.keys(result.data).sort();
      if (allExpirations.length === 0) {
        return `❌ No expiration dates available for ${ticker}.`;
      }

      const today = new Date();
      
      // Helper function to get next expiration of a type
      const getNextExpiration = (type: 'weekly' | 'monthly' | 'quad') => {
        return allExpirations.find(exp => {
          const expDate = new Date(exp + 'T16:00:00');
          const dayOfWeek = expDate.getDay();
          const isThirdFriday = expDate.getDate() >= 15 && expDate.getDate() <= 21 && dayOfWeek === 5;
          const isQuadMonth = [2, 5, 8, 11].includes(expDate.getMonth()); // March, June, Sept, Dec (0-indexed)
          
          if (type === 'weekly') return expDate > today && !isThirdFriday;
          if (type === 'monthly') return expDate > today && isThirdFriday && !isQuadMonth;
          if (type === 'quad') return expDate > today && isThirdFriday && isQuadMonth;
          return false;
        });
      };

      const calculatePCRatio = async (expiration: string): Promise<{ratio: string, put90: number, call90: number, totalCallOI: number, totalPutOI: number}> => {
        const expData = result.data[expiration];
        
        // Get ATM strike and IV
        const strikes = Object.keys(expData.calls || {}).map(Number);
        const atmStrike = strikes.reduce((prev, curr) => 
          Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
        );
        
        const callIV = expData.calls?.[atmStrike]?.implied_volatility || 0.3;
        const putIV = expData.puts?.[atmStrike]?.implied_volatility || 0.3;
        const avgIV = (callIV + putIV) / 2;
        
        // Calculate time to expiry
        const expDate = new Date(expiration + 'T16:00:00');
        const daysToExpiry = Math.max(1, Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        const T = daysToExpiry / 365;
        const r = 0.0387;
        
        // Calculate 90% range
        const call90 = this.findStrikeForProbability(currentPrice, r, avgIV, T, 90, true);
        const put90 = this.findStrikeForProbability(currentPrice, r, avgIV, T, 90, false);
        
        console.log(`[OI 90% Range Debug] ${expiration}:`, {
          currentPrice,
          put90,
          call90,
          avgIV,
          T,
          daysToExpiry
        });
        
        // Calculate OI within range
        let totalCallOI = 0;
        let totalPutOI = 0;
        
        if (expData.calls) {
          Object.entries(expData.calls).forEach(([strike, callData]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            if (strikeNum >= put90 && strikeNum <= call90) {
              totalCallOI += callData.open_interest || 0;
            }
          });
        }
        
        if (expData.puts) {
          Object.entries(expData.puts).forEach(([strike, putData]: [string, any]) => {
            const strikeNum = parseFloat(strike);
            if (strikeNum >= put90 && strikeNum <= call90) {
              totalPutOI += putData.open_interest || 0;
            }
          });
        }
        
        const ratio = totalCallOI === 0 ? '∞' : (totalPutOI / totalCallOI).toFixed(2);
        return { ratio, put90, call90, totalCallOI, totalPutOI };
      };

      // Handle different request types
      if (expType === 'custom' && customDate) {
        // Check if the custom date exists in available expirations
        if (!allExpirations.includes(customDate)) {
          const available = allExpirations.slice(0, 5).join(', ');
          return `❌ Expiration ${customDate} not found for ${ticker}.\n\nAvailable expirations: ${available}${allExpirations.length > 5 ? '...' : ''}`;
        }
        
        const data = await calculatePCRatio(customDate);
        
        return `## ${ticker} - OI Analysis

**Current Price:** $${currentPrice.toFixed(2)}

---

**Expiration:** ${customDate}

<strong><span style="color: rgb(59, 130, 246);">90% Range:</span></strong> $${data.put90.toFixed(2)} - $${data.call90.toFixed(2)}

<strong><span style="color: rgb(255, 215, 0);">Put/Call Ratio:</span></strong> ${data.ratio}

**Open Interest:**
- <span style="color: rgb(34, 197, 94);">Call OI:</span> ${data.totalCallOI.toLocaleString()}
- <span style="color: rgb(239, 68, 68);">Put OI:</span> ${data.totalPutOI.toLocaleString()}

---

**Interpretation:** ${data.ratio === '∞' ? 'No call OI - extremely bearish positioning' : parseFloat(data.ratio) > 1 ? 'Bearish - More put OI than calls' : 'Bullish - More call OI than puts'}`;
      }
      
      if (expType === 'range' && startDate && endDate) {
        // Find all expirations within the date range
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        
        const expsInRange = allExpirations.filter(exp => {
          const expDate = new Date(exp + 'T16:00:00');
          return expDate >= start && expDate <= end;
        });
        
        if (expsInRange.length === 0) {
          return `❌ No expirations found between ${startDate} and ${endDate} for ${ticker}.`;
        }
        
        // Aggregate OI across all expirations in range
        let totalCallOI = 0, totalPutOI = 0;
        const furthestExp = expsInRange[expsInRange.length - 1];
        const rangeData = await calculatePCRatio(furthestExp);
        
        for (const exp of expsInRange) {
          const expData = result.data[exp];
          if (expData.calls) {
            Object.entries(expData.calls).forEach(([strike, callData]: [string, any]) => {
              const strikeNum = parseFloat(strike);
              if (strikeNum >= rangeData.put90 && strikeNum <= rangeData.call90) {
                totalCallOI += callData.open_interest || 0;
              }
            });
          }
          if (expData.puts) {
            Object.entries(expData.puts).forEach(([strike, putData]: [string, any]) => {
              const strikeNum = parseFloat(strike);
              if (strikeNum >= rangeData.put90 && strikeNum <= rangeData.call90) {
                totalPutOI += putData.open_interest || 0;
              }
            });
          }
        }
        
        const ratioRange = totalCallOI === 0 ? '∞' : (totalPutOI / totalCallOI).toFixed(2);
        return `## ${ticker} - OI Analysis

**Current Price:** $${currentPrice.toFixed(2)}

**Date Range:** ${startDate} to ${endDate} (${expsInRange.length} expirations)

<strong><span style="color: rgb(59, 130, 246);">90% Range:</span></strong> $${rangeData.put90.toFixed(2)} - $${rangeData.call90.toFixed(2)}

<strong><span style="color: rgb(255, 215, 0);">Put/Call Ratio:</span></strong> ${ratioRange}

**Open Interest:**
- <span style="color: rgb(34, 197, 94);">Call OI:</span> ${totalCallOI.toLocaleString()}
- <span style="color: rgb(239, 68, 68);">Put OI:</span> ${totalPutOI.toLocaleString()}

**Interpretation:** ${ratioRange === '∞' ? 'No call OI - extremely bearish positioning' : parseFloat(ratioRange) > 1 ? 'Bearish - More put OI than calls' : 'Bullish - More call OI than puts'}`;
      }
      
      if (expType === 'all') {
        const weekly = getNextExpiration('weekly');
        const monthly = getNextExpiration('monthly');
        const quad = getNextExpiration('quad');
        
        let output = `## ${ticker} - OI Analysis

**Current Price:** $${currentPrice.toFixed(2)}

---

`;
        
        if (weekly) {
          const data = await calculatePCRatio(weekly);
          console.log(`[Weekly Output Debug]`, {
            put90: data.put90,
            call90: data.call90,
            put90Fixed: data.put90.toFixed(2),
            call90Fixed: data.call90.toFixed(2)
          });
          output += `### Weekly (${weekly})

`;
          const rangeText = `<strong><span style="color: rgb(59, 130, 246);">90% Range:</span></strong> $${data.put90.toFixed(2)} - $${data.call90.toFixed(2)}  
`;
          console.log('[Weekly Range Text]:', rangeText);
          output += rangeText;
          output += `<strong><span style="color: rgb(255, 215, 0);">P/C Ratio:</span></strong> ${data.ratio}  
`;
          output += `<strong><span style="color: rgb(34, 197, 94);">Call OI:</span></strong> ${data.totalCallOI.toLocaleString()} | <strong><span style="color: rgb(239, 68, 68);">Put OI:</span></strong> ${data.totalPutOI.toLocaleString()}  
`;
          output += `**Interpretation:** ${data.ratio === '∞' ? 'No call OI' : parseFloat(data.ratio) > 1 ? 'Bearish - More put OI than calls' : 'Bullish - More call OI than puts'}

`;
        }
        
        // 45d aggregated
        const fortyFiveDaysFromNow = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
        const exps45d = allExpirations.filter(exp => {
          const expDate = new Date(exp + 'T16:00:00');
          return expDate >= today && expDate <= fortyFiveDaysFromNow;
        });
        
        if (exps45d.length > 0) {
          let totalCallOI45 = 0, totalPutOI45 = 0;
          const furthestExp = exps45d[exps45d.length - 1];
          const rangeData = await calculatePCRatio(furthestExp);
          
          for (const exp of exps45d) {
            const expData = result.data[exp];
            if (expData.calls) {
              Object.entries(expData.calls).forEach(([strike, callData]: [string, any]) => {
                const strikeNum = parseFloat(strike);
                if (strikeNum >= rangeData.put90 && strikeNum <= rangeData.call90) {
                  totalCallOI45 += callData.open_interest || 0;
                }
              });
            }
            if (expData.puts) {
              Object.entries(expData.puts).forEach(([strike, putData]: [string, any]) => {
                const strikeNum = parseFloat(strike);
                if (strikeNum >= rangeData.put90 && strikeNum <= rangeData.call90) {
                  totalPutOI45 += putData.open_interest || 0;
                }
              });
            }
          }
          
          const ratio45 = totalCallOI45 === 0 ? '∞' : (totalPutOI45 / totalCallOI45).toFixed(2);
          output += `### 45-Day Aggregate (${exps45d.length} expirations)

`;
          output += `<strong><span style="color: rgb(59, 130, 246);">90% Range:</span></strong> $${rangeData.put90.toFixed(2)} - $${rangeData.call90.toFixed(2)}  
`;
          output += `<strong><span style="color: rgb(255, 215, 0);">P/C Ratio:</span></strong> ${ratio45}  
`;
          output += `<strong><span style="color: rgb(34, 197, 94);">Call OI:</span></strong> ${totalCallOI45.toLocaleString()} | <strong><span style="color: rgb(239, 68, 68);">Put OI:</span></strong> ${totalPutOI45.toLocaleString()}  
`;
          output += `**Interpretation:** ${ratio45 === '∞' ? 'No call OI' : parseFloat(ratio45) > 1 ? 'Bearish - More put OI than calls' : 'Bullish - More call OI than puts'}

---

`;
        }
        
        if (monthly) {
          const data = await calculatePCRatio(monthly);
          output += `### Monthly (${monthly})

`;
          output += `<strong><span style="color: rgb(59, 130, 246);">90% Range:</span></strong> $${data.put90.toFixed(2)} - $${data.call90.toFixed(2)}  
`;
          output += `<strong><span style="color: rgb(255, 215, 0);">P/C Ratio:</span></strong> ${data.ratio}  
`;
          output += `<strong><span style="color: rgb(34, 197, 94);">Call OI:</span></strong> ${data.totalCallOI.toLocaleString()} | <strong><span style="color: rgb(239, 68, 68);">Put OI:</span></strong> ${data.totalPutOI.toLocaleString()}  
`;
          output += `**Interpretation:** ${data.ratio === '∞' ? 'No call OI' : parseFloat(data.ratio) > 1 ? 'Bearish - More put OI than calls' : 'Bullish - More call OI than puts'}

---

`;
        }
        
        if (quad) {
          const data = await calculatePCRatio(quad);
          output += `### Quad Witching (${quad})

`;
          output += `<strong><span style="color: rgb(59, 130, 246);">90% Range:</span></strong> $${data.put90.toFixed(2)} - $${data.call90.toFixed(2)}  
`;
          output += `<strong><span style="color: rgb(255, 215, 0);">P/C Ratio:</span></strong> ${data.ratio}  
`;
          output += `<strong><span style="color: rgb(34, 197, 94);">Call OI:</span></strong> ${data.totalCallOI.toLocaleString()} | <strong><span style="color: rgb(239, 68, 68);">Put OI:</span></strong> ${data.totalPutOI.toLocaleString()}  
`;
          output += `**Interpretation:** ${data.ratio === '∞' ? 'No call OI' : parseFloat(data.ratio) > 1 ? 'Bearish - More put OI than calls' : 'Bullish - More call OI than puts'}`;
        }
        
        return output;
      }
      
      // Handle specific expiration types
      let expiration: string | undefined;
      let label = '';
      
      if (expType === 'weekly') {
        expiration = getNextExpiration('weekly');
        label = 'Weekly';
      } else if (expType === 'monthly') {
        expiration = getNextExpiration('monthly');
        label = 'Monthly';
      } else if (expType === 'quad' || expType === 'quadwitching') {
        expiration = getNextExpiration('quad');
        label = 'Quad Witching';
      } else if (expType === '45d') {
        // 45d aggregated logic
        const fortyFiveDaysFromNow = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
        const exps45d = allExpirations.filter(exp => {
          const expDate = new Date(exp + 'T16:00:00');
          return expDate >= today && expDate <= fortyFiveDaysFromNow;
        });
        
        if (exps45d.length > 0) {
          let totalCallOI45 = 0, totalPutOI45 = 0;
          const furthestExp = exps45d[exps45d.length - 1];
          const rangeData = await calculatePCRatio(furthestExp);
          
          for (const exp of exps45d) {
            const expData = result.data[exp];
            if (expData.calls) {
              Object.entries(expData.calls).forEach(([strike, callData]: [string, any]) => {
                const strikeNum = parseFloat(strike);
                if (strikeNum >= rangeData.put90 && strikeNum <= rangeData.call90) {
                  totalCallOI45 += callData.open_interest || 0;
                }
              });
            }
            if (expData.puts) {
              Object.entries(expData.puts).forEach(([strike, putData]: [string, any]) => {
                const strikeNum = parseFloat(strike);
                if (strikeNum >= rangeData.put90 && strikeNum <= rangeData.call90) {
                  totalPutOI45 += putData.open_interest || 0;
                }
              });
            }
          }
          
          const ratio45 = totalCallOI45 === 0 ? '∞' : (totalPutOI45 / totalCallOI45).toFixed(2);
          return `## ${ticker} - OI Analysis

**Current Price:** $${currentPrice.toFixed(2)}

---

**45-Day Aggregate** (${exps45d.length} expirations)

<strong><span style="color: rgb(59, 130, 246);">90% Range:</span></strong> $${rangeData.put90.toFixed(2)} - $${rangeData.call90.toFixed(2)}

<strong><span style="color: rgb(255, 215, 0);">Put/Call Ratio:</span></strong> ${ratio45}

**Open Interest:**
- <span style="color: rgb(34, 197, 94);">Call OI:</span> ${totalCallOI45.toLocaleString()}
- <span style="color: rgb(239, 68, 68);">Put OI:</span> ${totalPutOI45.toLocaleString()}

---

**Interpretation:** ${ratio45 === '∞' ? 'No call OI - extremely bearish positioning' : parseFloat(ratio45) > 1 ? 'Bearish - More put OI than calls' : 'Bullish - More call OI than puts'}`;
        }
      }
      
      if (!expiration) {
        return `❌ No ${label} expiration found for ${ticker}.`;
      }
      
      const data = await calculatePCRatio(expiration);
      
      return `## ${ticker} - ${label} OI Analysis

**Current Price:** $${currentPrice.toFixed(2)}

---

**Expiration:** ${expiration}

<strong><span style="color: rgb(59, 130, 246);">90% Range:</span></strong> $${data.put90.toFixed(2)} - $${data.call90.toFixed(2)}

<strong><span style="color: rgb(255, 215, 0);">Put/Call Ratio:</span></strong> ${data.ratio}

**Open Interest:**
- <span style="color: rgb(34, 197, 94);">Call OI:</span> ${data.totalCallOI.toLocaleString()}
- <span style="color: rgb(239, 68, 68);">Put OI:</span> ${data.totalPutOI.toLocaleString()}

---

**Interpretation:** ${data.ratio === '∞' ? 'No call OI - extremely bearish positioning' : parseFloat(data.ratio) > 1 ? 'Bearish - More put OI than calls' : 'Bullish - More call OI than puts'}`;
      
    } catch (error) {
      console.error('Error fetching OI data:', error);
      return `❌ Error fetching options data for ${ticker}. Please try again.`;
    }
  }

  private async fetchVolumeAndOpenInterest(trades: any[]): Promise<any[]> {
    
    // Group trades by underlying ticker to minimize API calls
    const tradesByUnderlying = trades.reduce((acc: Record<string, any[]>, trade: any) => {
      const underlying = trade.underlying_ticker;
      if (!acc[underlying]) {
        acc[underlying] = [];
      }
      acc[underlying].push(trade);
      return acc;
    }, {} as Record<string, any[]>);
    
    const updatedTrades: any[] = [];
    
    // Process each underlying separately
    for (const [underlying, underlyingTrades] of Object.entries(tradesByUnderlying)) {
      try {
        // Get unique expiration dates
        const uniqueExpirations = [...new Set(underlyingTrades.map(t => t.expiry))];
        
        let allContracts = new Map();
        
        // Fetch data for each expiration date
        for (const expiry of uniqueExpirations) {
          const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry;
          
          const response = await fetch(
            `https://api.polygon.io/v3/snapshot/options/${underlying}?expiration_date=${expiryParam}&limit=250&apikey=${this.POLYGON_API_KEY}`
          );
          
          if (response.ok) {
            const chainData = await response.json();
            if (chainData.results) {
              chainData.results.forEach((contract: any) => {
                if (contract.details && contract.details.ticker) {
                  allContracts.set(contract.details.ticker, {
                    volume: contract.day?.volume || 0,
                    open_interest: contract.open_interest || 0
                  });
                }
              });
            }
          }
        }
        
        if (allContracts.size === 0) {
          updatedTrades.push(...underlyingTrades.map((trade: any) => ({
            ...trade,
            volume: 0,
            open_interest: 0
          })));
          continue;
        }
        
        const contractLookup = allContracts;
        
        // Match trades to contracts
        for (const trade of underlyingTrades) {
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
          
          let expiryDate;
          if (trade.expiry.includes('T')) {
            expiryDate = new Date(trade.expiry);
          } else {
            const [year, month, day] = trade.expiry.split('-').map(Number);
            expiryDate = new Date(year, month - 1, day);
          }
          
          const formattedExpiry = `${expiryDate.getFullYear().toString().slice(-2)}${(expiryDate.getMonth() + 1).toString().padStart(2, '0')}${expiryDate.getDate().toString().padStart(2, '0')}`;
          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
          const optionTicker = `O:${trade.underlying_ticker}${formattedExpiry}${optionType}${strikeFormatted}`;
          
          const contractData = contractLookup.get(optionTicker);
          
          if (contractData) {
            updatedTrades.push({
              ...trade,
              volume: contractData.volume,
              open_interest: contractData.open_interest
            });
          } else {
            updatedTrades.push({
              ...trade,
              volume: 0,
              open_interest: 0
            });
          }
        }
        
      } catch (error) {
        console.error(`Error fetching data for ${underlying}:`, error);
        updatedTrades.push(...underlyingTrades.map(trade => ({
          ...trade,
          volume: 0,
          open_interest: 0
        })));
      }
    }
    
    return updatedTrades;
  }

  // FILL STYLE ENRICHMENT - Exact copy from options-flow page
  private async analyzeBidAskExecution(trades: any[]): Promise<any[]> {
    if (trades.length === 0) return trades;
    
    const tradesWithFillStyle: any[] = [];
    const BATCH_SIZE = 50; // Increased from 20 to 50 for faster processing
    
    for (let i = 0; i < trades.length; i += BATCH_SIZE) {
      const batch = trades.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (trade) => {
        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2);
          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
          const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
          
          const tradeTime = new Date(trade.trade_timestamp);
          const checkTimestamp = tradeTime.getTime() * 1000000;
          
          const quotesUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.lte=${checkTimestamp}&limit=1&apikey=${this.POLYGON_API_KEY}`;
          
          const response = await fetch(quotesUrl);
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            const quote = data.results[0];
            const bid = quote.bid_price;
            const ask = quote.ask_price;
            const fillPrice = trade.premium_per_contract;
            
            if (bid && ask && fillPrice) {
              let fillStyle: 'A' | 'B' | 'AA' | 'BB' | 'N/A' = 'N/A';
              const midpoint = (bid + ask) / 2;
              
              if (fillPrice > ask) {
                fillStyle = 'AA';
              } else if (fillPrice < bid) {
                fillStyle = 'BB';
              } else if (fillPrice >= midpoint) {
                fillStyle = 'A';
              } else {
                fillStyle = 'B';
              }
              
              return { ...trade, fill_style: fillStyle };
            }
          }
          
          return { ...trade, fill_style: 'N/A' as const };
        } catch (error) {
          return { ...trade, fill_style: 'N/A' as const };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      tradesWithFillStyle.push(...batchResults);
    }
    
    return tradesWithFillStyle;
  }

  // CURRENT PRICE ENRICHMENT - Get current option prices for position tracking
  private async enrichWithCurrentPrices(trades: any[]): Promise<any[]> {
    const enrichedTrades: any[] = [];
    const BATCH_SIZE = 50; // Process in batches of 50
    
    for (let i = 0; i < trades.length; i += BATCH_SIZE) {
      const batch = trades.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (trade) => {
        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2);
          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
          const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
          
          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${this.POLYGON_API_KEY}`;
          
          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(3000)
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.last_quote) {
              const bid = data.results.last_quote.bid || 0;
              const ask = data.results.last_quote.ask || 0;
              const currentPrice = (bid + ask) / 2;
              
              if (currentPrice > 0) {
                return { ...trade, current_price: currentPrice };
              }
            }
          }
          return { ...trade, current_price: trade.premium_per_contract };
        } catch (error) {
          return { ...trade, current_price: trade.premium_per_contract };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      enrichedTrades.push(...batchResults);
    }
    
    return enrichedTrades;
  }

  // CURRENT STOCK PRICE ENRICHMENT - Get current stock prices for Spot>>Current column
  private async enrichWithCurrentStockPrices(trades: any[]): Promise<any[]> {
    const uniqueTickers = [...new Set(trades.map(t => t.underlying_ticker))];
    const stockPrices: Record<string, number> = {};
    
    // Fetch all stock prices in parallel
    const pricePromises = uniqueTickers.map(async (ticker) => {
      try {
        const url = `https://api.polygon.io/v2/last/trade/${ticker}?apikey=${this.POLYGON_API_KEY}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        
        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.p) {
            return { ticker, price: data.results.p };
          }
        }
      } catch (error) {
        // Use spot_price as fallback
      }
      return null;
    });
    
    const results = await Promise.all(pricePromises);
    results.forEach(result => {
      if (result) {
        stockPrices[result.ticker] = result.price;
      }
    });
    
    return trades.map(trade => ({
      ...trade,
      current_stock_price: stockPrices[trade.underlying_ticker] || trade.spot_price
    }));
  }


  // EFI CRITERIA - Exact copy from OptionsFlowTable
  private meetsEfiCriteria(trade: any): boolean {
    const { days_to_expiry, total_premium, trade_size, moneyness } = trade;
    return (
      days_to_expiry >= 0 &&
      days_to_expiry <= 35 &&
      total_premium >= 100000 &&
      total_premium <= 450000 &&
      trade_size >= 650 &&
      trade_size <= 1999 &&
      moneyness === 'OTM'
    );
  }

  // POSITIONING GRADE CALCULATION - Exact copy from OptionsFlowTable
  // OPTIONS FLOW - Main query method
  private async getOptionsFlow(ticker: string, efiOnly: boolean = false, minPremium: number = 0, gradeFilter?: string): Promise<string> {
    try {
      // For EFI queries, use the new API endpoint that calculates positioning with real-time data
      if (efiOnly) {
        const url = `${this.baseUrl}/api/efi-with-positioning?ticker=${ticker}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.trades || data.trades.length === 0) {
          return `❌ No EFI Highlights found for ${ticker}.`;
        }
        
        let finalTrades = data.trades;
        
        // Filter by grade if specified
        if (gradeFilter) {
          finalTrades = data.trades.filter((trade: any) => {
            if (!trade.positioning) return false;
            
            if (gradeFilter === 'A') {
              return ['A+', 'A', 'A-'].includes(trade.positioning.grade);
            }
            
            return trade.positioning.grade === gradeFilter;
          });
          
          if (finalTrades.length === 0) {
            return `❌ No ${gradeFilter} grade flows found for ${ticker}.`;
          }
        }
        
        return this.buildOptionsFlowTable(ticker, finalTrades, efiOnly, gradeFilter);
      }
      
      // For non-EFI queries, use the old streaming approach
      // Map scan categories - EXACT same as options-flow page
      let tickerParam = ticker;
      if (ticker === 'MAG7') {
        tickerParam = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG';
      } else if (ticker === 'ETF') {
        tickerParam = 'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY';
      } else if (ticker === 'ALL') {
        tickerParam = 'ALL_EXCLUDE_ETF_MAG7';
      }
      
      // Use the EXACT same streaming endpoint as options-flow page
      const url = `${this.baseUrl}/api/stream-options-flow?ticker=${tickerParam}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error('No response body');
      }
      
      // Parse the EventSource stream manually
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let allTrades: any[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'complete' && data.trades) {
                allTrades = data.trades;
                break;
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Stream error');
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
        
        if (allTrades.length > 0) break;
      }
      
      if (allTrades.length === 0) {
        return `❌ No options flow data found for ${ticker}.`;
      }
      
      // Parallel enrichment - Run all enrichments simultaneously for speed
      const [tradesWithVolOI, tradesWithFillStyles, tradesWithCurrentPrices, tradesWithStockPrices] = await Promise.all([
        this.fetchVolumeAndOpenInterest(allTrades),
        this.analyzeBidAskExecution(allTrades),
        this.enrichWithCurrentPrices(allTrades),
        this.enrichWithCurrentStockPrices(allTrades)
      ]);
      
      // Merge all enrichments into final trades
      const fullyEnrichedTrades = allTrades.map((trade, index) => ({
        ...trade,
        volume: tradesWithVolOI[index]?.volume ?? trade.volume ?? 0,
        open_interest: tradesWithVolOI[index]?.open_interest ?? trade.open_interest ?? 0,
        fill_style: tradesWithFillStyles[index]?.fill_style ?? 'N/A',
        current_price: tradesWithCurrentPrices[index]?.current_price ?? trade.premium_per_contract,
        current_stock_price: tradesWithStockPrices[index]?.current_stock_price ?? trade.spot_price
      }));
      
      // Filter by premium amount ($50k+)
      let displayTrades = fullyEnrichedTrades;
      if (minPremium > 0) {
        displayTrades = displayTrades.filter(trade => {
          const premium = trade.size * trade.trade_price * 100;
          return premium >= minPremium;
        });
      }
      
      if (displayTrades.length === 0) {
        return `❌ No options flow data found for ${ticker}.`;
      }
      
      // Build table output (no positioning for non-EFI)
      return this.buildOptionsFlowTable(ticker, displayTrades, false, undefined);
      
    } catch (error) {
      console.error('Error fetching options flow:', error);
      return `❌ Error fetching options flow for ${ticker}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // Build table HTML - EXACT STRUCTURE from OptionsFlowTable
  private buildOptionsFlowTable(ticker: string, trades: any[], efiOnly: boolean, gradeFilter?: string): string {
    let title = efiOnly ? 'EFI Highlights' : 'Options Flow';
    if (gradeFilter) {
      title = `${gradeFilter} Grade Flow`;
    }
    let output = `## ${ticker} ${title}\n\n`;
    output += `**Total Trades:** ${trades.length}\n\n`;
    
    // Table header with exact colors from OptionsFlowTable
    output += `<table style="width: 100%; border-collapse: collapse; background: #000;">\n`;
    output += `<thead>\n<tr style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); border-bottom: 2px solid #ff8500;">\n`;
    output += `<th style="padding: 12px 8px; text-align: left; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Time</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: left; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Symbol</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: left; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">C/P</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: right; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Strike</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: left; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Size</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: right; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Premium</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: left; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Expiration</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: left; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Spot>>Current</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: left; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">VOL/OI</th>\n`;
    output += `<th style="padding: 12px 8px; text-align: center; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Type</th>\n`;
    if (efiOnly) {
      output += `<th style="padding: 12px 8px; text-align: center; color: #ff8500; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Position</th>\n`;
    }
    output += `</tr>\n</thead>\n<tbody>\n`;
    
    // Show all trades - no limit
    for (const trade of trades) {
      const time = new Date(trade.trade_timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      
      const isCall = trade.type.toLowerCase() === 'call';
      const cpColor = isCall ? '#22c55e' : '#ef4444';
      const cpText = isCall ? 'C' : 'P';
      
      // Fill style badge
      const fillStyle = trade.fill_style || 'N/A';
      const fillColor = (fillStyle === 'AA' || fillStyle === 'A') ? '#22c55e' : '#ef4444';
      const fillBadge = fillStyle !== 'N/A' 
        ? `<span style="display: inline-block; padding: 2px 6px; background: ${fillColor}22; color: ${fillColor}; border: 1px solid ${fillColor}; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 4px;">${fillStyle}</span>` 
        : '';
      
      // Trade type badge
      const typeColor = trade.trade_type === 'SWEEP' ? '#eab308' : '#3b82f6';
      const typeBadge = `<span style="display: inline-block; padding: 2px 8px; background: ${typeColor}22; color: ${typeColor}; border: 1px solid ${typeColor}; border-radius: 4px; font-size: 10px; font-weight: bold;">${trade.trade_type}</span>`;
      
      // VOL/OI
      const volOI = trade.volume && trade.open_interest 
        ? `<span style="color: #06b6d4;">${trade.volume.toLocaleString()}</span> / <span style="color: #a855f7;">${trade.open_interest.toLocaleString()}</span>`
        : '<span style="color: #666;">N/A</span>';
      
      // Positioning grade (EFI only)
      let positionCell = '';
      if (efiOnly && trade.positioning) {
        const { grade, color } = trade.positioning;
        
        // Calculate actual position metrics
        const entryPrice = trade.premium_per_contract;
        const currentPrice = trade.current_option_price || trade.current_price || entryPrice;
        const percentChangeNum = entryPrice > 0 
          ? ((currentPrice - entryPrice) / entryPrice) * 100
          : 0;
        const percentChange = percentChangeNum.toFixed(2);
        const percentColor = percentChangeNum > 0 ? '#22c55e' : percentChangeNum < 0 ? '#ef4444' : '#6b7280';
        const currentValue = (currentPrice * trade.trade_size * 100).toFixed(0);
        
        positionCell = `<td style="padding: 8px; text-align: center;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
            <div style="width: 78px; height: 78px; border-radius: 50%; border: 6px solid ${color}; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #000;">
              <div style="font-size: 24px; font-weight: bold; color: ${color}; line-height: 1;">${grade}</div>
              <div style="font-size: 10px; color: #fff; margin-top: 2px;">$${currentPrice.toFixed(2)}</div>
            </div>
            <div style="font-size: 11px; color: ${percentColor}; font-weight: 600;">
              $${Number(currentValue).toLocaleString()} (${percentChangeNum >= 0 ? '+' : ''}${percentChange}%)
            </div>
          </div>
        </td>`;
      }
      
      output += `<tr style="border-bottom: 1px solid #1a1a1a;">\n`;
      output += `<td style="padding: 8px; color: #fff; font-size: 12px;">${time}</td>\n`;
      output += `<td style="padding: 8px;"><span style="color: #ff8500; font-weight: bold; font-size: 12px;">${trade.underlying_ticker}</span></td>\n`;
      output += `<td style="padding: 8px; color: ${cpColor}; font-weight: bold; font-size: 12px;">${cpText}</td>\n`;
      output += `<td style="padding: 8px; text-align: right; color: #fff; font-size: 12px;">$${trade.strike.toFixed(2)}</td>\n`;
      output += `<td style="padding: 8px; font-size: 12px;"><span style="color: #06b6d4;">${trade.trade_size}</span> @ <span style="color: #eab308;">$${trade.premium_per_contract.toFixed(2)}</span>${fillBadge}</td>\n`;
      output += `<td style="padding: 8px; text-align: right; color: #22c55e; font-weight: bold; font-size: 12px;">$${(trade.total_premium / 1000).toFixed(1)}K</td>\n`;
      output += `<td style="padding: 8px; color: #fff; font-size: 12px;">${trade.expiry}</td>\n`;
      output += `<td style="padding: 8px; font-size: 12px;"><span style="color: #fff;">$${trade.spot_price.toFixed(2)}</span> >> <span style="color: #ef4444;">$${(trade.current_stock_price || trade.spot_price).toFixed(2)}</span></td>\n`;
      output += `<td style="padding: 8px; font-size: 12px;">${volOI}</td>\n`;
      output += `<td style="padding: 8px; text-align: center;">${typeBadge}</td>\n`;
      if (efiOnly) {
        output += positionCell;
      }
      output += `</tr>\n`;
    }
    
    output += `</tbody>\n</table>\n`;
    
    return output;
  }
  
  // Calculate positioning grade - EXACT same logic as OptionsFlowTable.tsx
  private calculatePositioningGrade(trade: any, allTrades: any[]): { grade: string; score: number; color: string } {
    // Get option ticker for current price lookup
    const expiry = trade.expiry.replace(/-/g, '').slice(2);
    const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
    const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
    const currentPrice = trade.current_price;
    const entryPrice = trade.premium_per_contract;

    let confidenceScore = 0;
    const scores = {
      expiration: 0,
      contractPrice: 0,
      combo: 0,
      priceAction: 0,
      stockReaction: 0
    };

    // 1. Expiration Score (25 points max)
    const daysToExpiry = trade.days_to_expiry;
    if (daysToExpiry <= 7) scores.expiration = 25;
    else if (daysToExpiry <= 14) scores.expiration = 20;
    else if (daysToExpiry <= 21) scores.expiration = 15;
    else if (daysToExpiry <= 28) scores.expiration = 10;
    else if (daysToExpiry <= 42) scores.expiration = 5;
    confidenceScore += scores.expiration;

    // 2. Contract Price Score (25 points max) - based on position P&L
    if (currentPrice && currentPrice > 0) {
      const percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;

      if (percentChange <= -40) scores.contractPrice = 25;
      else if (percentChange <= -20) scores.contractPrice = 20;
      else if (percentChange >= -10 && percentChange <= 10) scores.contractPrice = 15;
      else if (percentChange >= 20) scores.contractPrice = 5;
      else scores.contractPrice = 10;
    } else {
      scores.contractPrice = 12;
    }
    confidenceScore += scores.contractPrice;

    // 3. Combo Trade Score (10 points max)
    const isCall = trade.type === 'call';
    const fillStyle = trade.fill_style || '';
    const hasComboTrade = allTrades.some(t => {
      if (t.underlying_ticker !== trade.underlying_ticker) return false;
      if (t.expiry !== trade.expiry) return false;
      if (Math.abs(t.strike - trade.strike) > trade.strike * 0.05) return false;

      const oppositeFill = t.fill_style || '';
      const oppositeType = t.type.toLowerCase();

      // Bullish combo: Calls with A/AA + Puts with B/BB
      if (isCall && (fillStyle === 'A' || fillStyle === 'AA')) {
        return oppositeType === 'put' && (oppositeFill === 'B' || oppositeFill === 'BB');
      }
      // Bearish combo: Calls with B/BB + Puts with A/AA
      if (isCall && (fillStyle === 'B' || fillStyle === 'BB')) {
        return oppositeType === 'put' && (oppositeFill === 'A' || oppositeFill === 'AA');
      }
      // For puts, reverse logic
      if (!isCall && (fillStyle === 'B' || fillStyle === 'BB')) {
        return oppositeType === 'call' && (oppositeFill === 'A' || oppositeFill === 'AA');
      }
      if (!isCall && (fillStyle === 'A' || fillStyle === 'AA')) {
        return oppositeType === 'call' && (oppositeFill === 'B' || oppositeFill === 'BB');
      }
      return false;
    });
    if (hasComboTrade) scores.combo = 10;
    confidenceScore += scores.combo;

    // Shared variables for sections 4 and 5
    const entryStockPrice = trade.spot_price;
    const currentStockPrice = trade.current_stock_price || trade.spot_price;
    const tradeTime = new Date(trade.trade_timestamp);
    const currentTime = new Date();

    // 4. Price Action Score (25 points max) - simplified without std dev
    // Since we don't have historical std devs, give default score
    scores.priceAction = 12;
    confidenceScore += scores.priceAction;

    // 5. Stock Reaction Score (15 points max)
    if (currentStockPrice && entryStockPrice) {
      const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100;

      // Determine trade direction (bullish or bearish)
      const isBullish = (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
        (!isCall && (fillStyle === 'B' || fillStyle === 'BB'));
      const isBearish = (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
        (!isCall && (fillStyle === 'A' || fillStyle === 'AA'));

      // Check if stock reversed against trade direction
      const reversed = (isBullish && stockPercentChange <= -1.0) ||
        (isBearish && stockPercentChange >= 1.0);
      const followed = (isBullish && stockPercentChange >= 1.0) ||
        (isBearish && stockPercentChange <= -1.0);
      const chopped = Math.abs(stockPercentChange) < 1.0;

      // Calculate time elapsed since trade
      const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60);

      // Award points based on time checkpoints
      if (hoursElapsed >= 1) {
        // 1-hour checkpoint (50% of points)
        if (reversed) scores.stockReaction += 7.5;
        else if (chopped) scores.stockReaction += 5;
        else if (followed) scores.stockReaction += 2.5;

        if (hoursElapsed >= 3) {
          // 3-hour checkpoint (remaining 50%)
          if (reversed) scores.stockReaction += 7.5;
          else if (chopped) scores.stockReaction += 5;
          else if (followed) scores.stockReaction += 2.5;
        }
      }
    }
    confidenceScore += scores.stockReaction;

    // Color code confidence score
    let scoreColor = '#ff0000'; // F = Red
    if (confidenceScore >= 85) scoreColor = '#00ff00'; // A = Bright Green
    else if (confidenceScore >= 70) scoreColor = '#84cc16'; // B = Lime Green
    else if (confidenceScore >= 50) scoreColor = '#fbbf24'; // C = Yellow
    else if (confidenceScore >= 33) scoreColor = '#3b82f6'; // D = Blue

    // Grade letter
    let grade = 'F';
    if (confidenceScore >= 85) grade = 'A+';
    else if (confidenceScore >= 80) grade = 'A';
    else if (confidenceScore >= 75) grade = 'A-';
    else if (confidenceScore >= 70) grade = 'B+';
    else if (confidenceScore >= 65) grade = 'B';
    else if (confidenceScore >= 60) grade = 'B-';
    else if (confidenceScore >= 55) grade = 'C+';
    else if (confidenceScore >= 50) grade = 'C';
    else if (confidenceScore >= 48) grade = 'C-';
    else if (confidenceScore >= 43) grade = 'D+';
    else if (confidenceScore >= 38) grade = 'D';
    else if (confidenceScore >= 33) grade = 'D-';

    return { grade, score: confidenceScore, color: scoreColor };
  }

  // Method to add custom knowledge
  addPattern(trigger: RegExp, response: string | ((match: RegExpMatchArray) => string)): void {
    // Insert before the fallback pattern (last one)
    this.knowledge.patterns.splice(-1, 0, { trigger, response });
  }

  // SEASONAL METHODS
  private async getSeasonalChart(ticker: string, years: number, isElectionMode: boolean, electionPeriod?: string): Promise<string> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      let url = `${baseUrl}/api/seasonal-data?symbol=${ticker}&years=${years}`;
      
      if (isElectionMode && electionPeriod) {
        url += `&electionMode=${encodeURIComponent(electionPeriod)}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        return `❌ Unable to fetch seasonal data for ${ticker}.`;
      }
      
      const seasonalData = await response.json();
      
      if (!seasonalData || !seasonalData.dailyData) {
        return `❌ Unable to fetch seasonal data for ${ticker}.`;
      }
      
      // Return JSON format for chart rendering
      return JSON.stringify({
        type: 'seasonal-chart',
        data: seasonalData
      });
    } catch (error) {
      console.error('Error fetching seasonal chart:', error);
      return `❌ Error fetching seasonal data for ${ticker}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async getBest30Day(ticker: string, years: number): Promise<string> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/seasonal-data?symbol=${ticker}&years=${years}`);
      
      if (!response.ok) {
        return `❌ Unable to fetch 30-day period data for ${ticker}.`;
      }
      
      const seasonalData = await response.json();
      
      const period = seasonalData?.spyComparison?.best30DayPeriod || seasonalData?.best30DayPeriod;
      
      if (!seasonalData || !period) {
        return `❌ Unable to fetch 30-day period data for ${ticker}.`;
      }
      
      return `## ${ticker} - Best 30-Day Period

**📈 Most Bullish 30-Day Window (${years} Year Analysis)**

**Period:** ${period.period}
**Average Return:** <span style="color: #22c55e; font-weight: bold;">${period.return.toFixed(2)}%</span>
**Start Date:** ${period.startDate}
**End Date:** ${period.endDate}

---

**Company:** ${seasonalData.companyName}
**Years Analyzed:** ${seasonalData.yearsOfData}
**Overall Win Rate:** ${seasonalData.statistics?.winRate?.toFixed(1) || '0.0'}%

**💡 Interpretation:** This 30-day window has historically been ${ticker}'s strongest seasonal period, averaging ${period.return.toFixed(2)}% returns over the past ${years} years. Consider this window for potential entry timing.`;
    } catch (error) {
      console.error('Error fetching best 30-day period:', error);
      return `❌ Error fetching 30-day period data for ${ticker}.`;
    }
  }

  private async getWorst30Day(ticker: string, years: number): Promise<string> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/seasonal-data?symbol=${ticker}&years=${years}`);
      
      if (!response.ok) {
        return `❌ Unable to fetch 30-day period data for ${ticker}.`;
      }
      
      const seasonalData = await response.json();
      
      const period = seasonalData?.spyComparison?.worst30DayPeriod || seasonalData?.worst30DayPeriod;
      
      if (!seasonalData || !period) {
        return `❌ Unable to fetch 30-day period data for ${ticker}.`;
      }
      
      return `## ${ticker} - Worst 30-Day Period

**📉 Most Bearish 30-Day Window (${years} Year Analysis)**

**Period:** ${period.period}
**Average Return:** <span style="color: #ef4444; font-weight: bold;">${period.return.toFixed(2)}%</span>
**Start Date:** ${period.startDate}
**End Date:** ${period.endDate}

---

**Company:** ${seasonalData.companyName}
**Years Analyzed:** ${seasonalData.yearsOfData}
**Overall Win Rate:** ${seasonalData.statistics?.winRate?.toFixed(1) || '0.0'}%

**💡 Interpretation:** This 30-day window has historically been ${ticker}'s weakest seasonal period, averaging ${period.return.toFixed(2)}% returns over the past ${years} years. Consider avoiding or hedging positions during this window.`;
    } catch (error) {
      console.error('Error fetching worst 30-day period:', error);
      return `❌ Error fetching 30-day period data for ${ticker}.`;
    }
  }

  private formatSeasonalChart(data: any, years: number): string {
    let output = `## ${data.symbol} - ${years}Y Seasonal Pattern\n\n`;
    output += `**Company:** ${data.companyName || data.symbol}\n`;
    output += `**Years Analyzed:** ${years}\n`;
    output += `**Total Return:** ${data.statistics?.totalReturn?.toFixed(2) || '0.00'}%\n`;
    output += `**Win Rate:** ${data.statistics?.winRate?.toFixed(1) || '0.0'}%\n\n`;
    output += `---\n\n`;
    
    // Display monthly seasonal pattern (12 months)
    if (data.dailyData && data.dailyData.length > 0) {
      output += `### 📅 Monthly Seasonal Pattern\n\n`;
      
      const monthlyData: { [month: number]: { returns: number[], cumulative: number } } = {};
      
      // Aggregate by month
      data.dailyData.forEach((day: any) => {
        if (!monthlyData[day.month]) {
          monthlyData[day.month] = { returns: [], cumulative: 0 };
        }
        monthlyData[day.month].returns.push(day.avgReturn);
      });
      
      // Calculate monthly averages
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      let cumulativeReturn = 0;
      
      months.forEach((monthName, index) => {
        const monthNum = index + 1;
        const monthData = monthlyData[monthNum];
        
        if (monthData && monthData.returns.length > 0) {
          const avgReturn = monthData.returns.reduce((sum: number, r: number) => sum + r, 0) / monthData.returns.length;
          cumulativeReturn += avgReturn;
          const color = avgReturn >= 0 ? '#22c55e' : '#ef4444';
          const sign = avgReturn >= 0 ? '+' : '';
          output += `**${monthName}**: <span style="color: ${color};">${sign}${avgReturn.toFixed(2)}%</span> (Cumulative: ${cumulativeReturn.toFixed(2)}%)\\n`;
        }
      });
      
      output += `\n---\n\n`;
    }
    
    if (data.bestMonths && data.bestMonths.length > 0) {
      output += `### 📊 Best Performing Months\n\n`;
      data.bestMonths.forEach((month: any, index: number) => {
        const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        output += `${emoji} **${month.month}**: <span style="color: #22c55e;">${month.avgReturn.toFixed(2)}%</span>\n`;
      });
    }
    
    if (data.worstMonths && data.worstMonths.length > 0) {
      output += `\n### 📉 Worst Performing Months\n\n`;
      data.worstMonths.forEach((month: any, index: number) => {
        const emoji = index === 0 ? '❌' : '⚠️';
        output += `${emoji} **${month.month}**: <span style="color: #ef4444;">${month.avgReturn.toFixed(2)}%</span>\n`;
      });
    }
    
    output += `\n---\n\n`;
    
    if (data.bestQuarter) {
      output += `### 📅 Quarterly Performance\n`;
      output += `**Best Quarter:** ${data.bestQuarter.quarter} (${data.bestQuarter.return.toFixed(2)}%)\n`;
      if (data.worstQuarter) {
        output += `**Worst Quarter:** ${data.worstQuarter.quarter} (${data.worstQuarter.return.toFixed(2)}%)\n`;
      }
    }
    
    return output;
  }

  private formatElectionSeasonalChart(data: any): string {
    let output = `## ${data.symbol} - ${data.electionType} Seasonal Pattern\n\n`;
    output += `**Company:** ${data.companyName}\n`;
    output += `**Election Period:** ${data.electionType}\n`;
    output += `**Years Analyzed:** ${data.statistics.yearsOfData}\n`;
    output += `**Total Return:** ${data.statistics.totalReturn.toFixed(2)}%\n`;
    output += `**Annualized Return:** ${data.statistics.annualizedReturn.toFixed(2)}%\n`;
    output += `**Win Rate:** ${data.statistics.winRate.toFixed(1)}%\n\n`;
    output += `---\n\n`;
    
    if (data.spyComparison) {
      output += `### 📊 vs SPY Comparison\n\n`;
      
      output += `**Best Months (Outperformance):**\n`;
      data.spyComparison.bestMonths.slice(0, 3).forEach((month: any) => {
        output += `• **${month.month}**: <span style="color: #22c55e;">+${month.outperformance.toFixed(2)}%</span>\n`;
      });
      
      output += `\n**Worst Months (Underperformance):**\n`;
      data.spyComparison.worstMonths.slice(0, 3).forEach((month: any) => {
        output += `• **${month.month}**: <span style="color: #ef4444;">${month.outperformance.toFixed(2)}%</span>\n`;
      });
      
      if (data.spyComparison.best30DayPeriod) {
        output += `\n---\n\n`;
        output += `### 📈 Best 30-Day Period\n`;
        output += `**${data.spyComparison.best30DayPeriod.period}**: <span style="color: #22c55e; font-weight: bold;">${data.spyComparison.best30DayPeriod.return.toFixed(2)}%</span>\n\n`;
      }
      
      if (data.spyComparison.worst30DayPeriod) {
        output += `### 📉 Worst 30-Day Period\n`;
        output += `**${data.spyComparison.worst30DayPeriod.period}**: <span style="color: #ef4444; font-weight: bold;">${data.spyComparison.worst30DayPeriod.return.toFixed(2)}%</span>\n\n`;
      }
    }
    
    output += `---\n\n`;
    output += `### 📊 Statistics\n`;
    output += `**Best Year:** ${data.statistics.bestYear.year} (${data.statistics.bestYear.return.toFixed(2)}%)\n`;
    output += `**Worst Year:** ${data.statistics.worstYear.year} (${data.statistics.worstYear.return.toFixed(2)}%)\n`;
    output += `**Max Drawdown:** ${data.statistics.maxDrawdown.toFixed(2)}%\n`;
    output += `**Volatility:** ${data.statistics.volatility.toFixed(2)}%\n`;
    
    return output;
  }
}
