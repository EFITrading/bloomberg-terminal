interface OptionQuote {
  bid: number
  ask: number
  mid: number
}

interface PremiumImbalance {
  symbol: string
  stockPrice: number
  atmStrike: number // Midpoint between the OTM call and put strikes
  callMid: number
  callBid: number
  callAsk: number
  callSpreadPercent: number
  putMid: number
  putBid: number
  putAsk: number
  putSpreadPercent: number
  premiumDifference: number
  imbalancePercent: number
  expensiveSide: 'CALLS' | 'PUTS'
  imbalanceSeverity: 'EXTREME' | 'HIGH' | 'MODERATE'
  strikeSpacing: number // The spacing between strikes (e.g., 1, 2.5, 5, 10)
  putStrike: number // First OTM put strike (below stock price)
  callStrike: number // First OTM call strike (above stock price)
  lastSeenTime: string // PT time of last crossing e.g. "11:23 AM"
  expiry: string
}

class PremiumImbalanceScanner {
  private readonly API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
  private readonly CONCURRENT_REQUESTS = 10 // Process 10 symbols at once for faster scanning
  private readonly REQUEST_DELAY = 25 // Reduced delay between batches for 1000+ stocks

  getNextMonthlyExpiry(): string {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()

    const nextMonth = new Date(year, month + 1, 1)

    let day = 1
    while (new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day).getDay() !== 5) {
      day++
    }

    const thirdFriday = day + 14
    const expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), thirdFriday)

    const yyyy = expiryDate.getFullYear()
    const mm = String(expiryDate.getMonth() + 1).padStart(2, '0')
    const dd = String(expiryDate.getDate()).padStart(2, '0')

    return `${yyyy}-${mm}-${dd}`
  }

  getNextWeeklyExpiry(): string {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    let daysUntilFriday = 5 - dayOfWeek
    if (daysUntilFriday < 0) daysUntilFriday += 7 // Sunday → 6, Saturday → 7 (shouldn't run)

    // Less than 2 days until expiry (Thu=1, Fri=0) → roll to NEXT Friday
    if (daysUntilFriday < 2) daysUntilFriday += 7

    const nextFriday = new Date(today)
    nextFriday.setDate(today.getDate() + daysUntilFriday)

    const yyyy = nextFriday.getFullYear()
    const mm = String(nextFriday.getMonth() + 1).padStart(2, '0')
    const dd = String(nextFriday.getDate()).padStart(2, '0')

    return `${yyyy}-${mm}-${dd}`
  }

  /**
   * Scan with streaming callback for real-time results
   * Symbols are processed in order of market cap (largest first)
   */
  async *scanSymbolsStream(
    symbols: string[],
    maxSpreadPercent: number = 5,
    customExpiry?: string
  ): AsyncGenerator<{
    type: 'progress' | 'result' | 'complete' | 'error' | 'debug'
    symbol?: string
    result?: PremiumImbalance
    progress?: { current: number; total: number }
    error?: string
    msg?: string
  }> {
    const expiry = customExpiry || this.getNextWeeklyExpiry()
    yield { type: 'debug', msg: `Scanning ${symbols.length} symbols for expiry: ${expiry}` }

    const symbolList = symbols.map((s) => s.trim().toUpperCase())
    const total = symbolList.length
    let current = 0

    // Process sequentially but with optimized batching for 1000+ stocks
    for (let i = 0; i < symbolList.length; i += this.CONCURRENT_REQUESTS) {
      const batch = symbolList.slice(i, i + this.CONCURRENT_REQUESTS)

      // Process batch sequentially to maintain yield context
      for (const symbol of batch) {
        try {
          current++

          // Send progress update every 10 symbols to reduce overhead
          if (current % 10 === 0 || current === 1) {
            yield {
              type: 'progress' as const,
              symbol,
              progress: { current, total },
            }
          }

          const { result: imbalance, logs: debugLogs } = await this.analyzeSymbol(
            symbol,
            expiry,
            maxSpreadPercent
          )

          // Always yield debug logs so client can see them
          for (const msg of debugLogs) {
            yield { type: 'debug' as const, msg }
          }

          if (imbalance) {
            yield {
              type: 'result' as const,
              result: imbalance,
            }
          }
        } catch (error) {
          console.error(` Error analyzing ${symbol}:`, error)
          yield {
            type: 'error' as const,
            symbol,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      }

      // Small delay between batches to avoid rate limits
      if (i + this.CONCURRENT_REQUESTS < symbolList.length) {
        await new Promise((resolve) => setTimeout(resolve, this.REQUEST_DELAY))
      }
    }

    yield {
      type: 'complete' as const,
    }
  }

  // ── Helpers matching history route logic ────────────────────────────────────

  private getETOffsetHours(date: Date): number {
    const year = date.getUTCFullYear()
    const march1 = new Date(Date.UTC(year, 2, 1))
    const dstStart = new Date(Date.UTC(year, 2, 1 + ((14 - march1.getUTCDay()) % 7) + 7))
    const nov1 = new Date(Date.UTC(year, 10, 1))
    const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov1.getUTCDay()) % 7)))
    return date >= dstStart && date < dstEnd ? 4 : 5
  }

  private getPTOffsetHours(date: Date): number {
    const year = date.getUTCFullYear()
    const march1 = new Date(Date.UTC(year, 2, 1))
    const dstStart = new Date(Date.UTC(year, 2, 1 + ((14 - march1.getUTCDay()) % 7) + 7))
    const nov1 = new Date(Date.UTC(year, 10, 1))
    const dstEnd = new Date(Date.UTC(year, 10, 1 + ((7 - nov1.getUTCDay()) % 7)))
    return date >= dstStart && date < dstEnd ? 7 : 8
  }

  private utcMsToETTime(ms: number): string {
    const d = new Date(ms)
    const offset = this.getPTOffsetHours(d)
    const ptDate = new Date(ms - offset * 3600 * 1000)
    let h = ptDate.getUTCHours()
    const mm = String(ptDate.getUTCMinutes()).padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return `${h}:${mm} ${ampm}`
  }

  private marketHoursUTC(dateStr: string): { openMs: number; closeMs: number } {
    const [y, m, d] = dateStr.split('-').map(Number)
    const probe = new Date(Date.UTC(y, m - 1, d, 14, 0, 0))
    const offset = this.getETOffsetHours(probe)
    return {
      openMs: Date.UTC(y, m - 1, d, 9 + offset, 30, 0),
      closeMs: Date.UTC(y, m - 1, d, 16 + offset, 0, 0),
    }
  }

  private formatOptionTicker(
    symbol: string,
    expiry: string,
    type: 'C' | 'P',
    strike: number
  ): string {
    const [year, month, day] = expiry.split('-')
    const yy = year.slice(2)
    const strikeFormatted = Math.round(strike * 1000)
      .toString()
      .padStart(8, '0')
    return `O:${symbol.toUpperCase()}${yy}${month}${day}${type}${strikeFormatted}`
  }

  private async fetchTodayMinuteBars(symbol: string, dateStr: string): Promise<any[]> {
    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/minute/${dateStr}/${dateStr}?adjusted=false&sort=desc&limit=500&apiKey=${this.API_KEY}`
      const res = await fetch(url)
      if (!res.ok) return []
      const data = await res.json()
      return data.results || []
    } catch {
      return []
    }
  }

  private async fetchOptionQuoteAt(
    optionTicker: string,
    atMs: number
  ): Promise<{ bid: number; ask: number } | null> {
    try {
      const toNs = (atMs + 59_999) * 1_000_000
      const url = `https://api.polygon.io/v3/quotes/${encodeURIComponent(optionTicker)}?timestamp.lte=${toNs}&order=desc&limit=1&apiKey=${this.API_KEY}`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = await res.json()
      if (data.results?.length > 0) {
        const q = data.results[0]
        if (!q.bid_price && !q.ask_price) return null
        return { bid: q.bid_price ?? 0, ask: q.ask_price ?? 0 }
      }
      return null
    } catch {
      return null
    }
  }

  // ── Main analysis: find last minute today stock was perfectly between OTM strikes ─

  private async analyzeSymbol(
    symbol: string,
    expiry: string,
    maxSpreadPercent: number
  ): Promise<{ result: PremiumImbalance | null; logs: string[] }> {
    const logs: string[] = []
    const dbg = (msg: string) => {
      logs.push(`[scanner] ${msg}`)
      console.log(`[scanner] ${msg}`)
    }

    // Roll back to last weekday if today is Sat/Sun
    const today = new Date()
    const dow = today.getUTCDay() // 0=Sun,6=Sat
    if (dow === 0) today.setUTCDate(today.getUTCDate() - 2)
    else if (dow === 6) today.setUTCDate(today.getUTCDate() - 1)
    const dateStr = today.toISOString().split('T')[0]
    const { openMs, closeMs } = this.marketHoursUTC(dateStr)

    // Fetch real available strikes from the option chain for this expiry
    const chainData = await this.getOptionChain(symbol, expiry)
    if (!chainData || chainData.length === 0) {
      dbg(`${symbol} → no option chain data for ${expiry}`)
      return { result: null, logs }
    }
    const realStrikes = this.getAvailableStrikes(chainData)
    dbg(`${symbol} → ${realStrikes.length} real strikes for ${expiry}`)

    const minuteBars = await this.fetchTodayMinuteBars(symbol, dateStr)
    dbg(
      `${symbol} date=${dateStr} totalMinuteBars=${minuteBars.length} openMs=${openMs} closeMs=${closeMs}`
    )

    const mktBars = minuteBars.filter((b) => b.t >= openMs && b.t <= closeMs)
    if (!mktBars.length) {
      if (minuteBars.length > 0)
        dbg(
          `${symbol} → 0 market-hours bars. First bar t=${minuteBars[0].t} last t=${minuteBars[minuteBars.length - 1].t}`
        )
      else dbg(`${symbol} → 0 minute bars returned from Polygon`)
      return { result: null, logs }
    }
    dbg(`${symbol} → ${mktBars.length} market-hours bars`)

    let closestDist = Infinity
    let closestInfo = ''
    for (const mb of mktBars) {
      const price = mb.c

      // Build candidate pairs: adjacent pair + symmetric pair around nearest strike
      const candidates: { callStrike: number; putStrike: number }[] = []

      // 1) Adjacent pair: first real put below price, first real call above price
      const { callStrike: adjCall, putStrike: adjPut } = this.findOTMStrikes(price, realStrikes)
      if (adjPut !== null && adjCall !== null) {
        candidates.push({ putStrike: adjPut, callStrike: adjCall })
      }

      // 2) Symmetric pair: find nearest strike to price, use the put/call flanking THAT strike
      // This catches cases where price is at/near a strike (e.g. price=$310.02 → symmetric $307.5/$312.5)
      const nearestStrike = realStrikes.reduce((prev, curr) =>
        Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
      )
      const symPut = [...realStrikes].filter((s) => s < nearestStrike).pop() ?? null
      const symCall = realStrikes.find((s) => s > nearestStrike) ?? null
      if (symPut !== null && symCall !== null) {
        const isDup = adjPut === symPut && adjCall === symCall
        if (!isDup) candidates.push({ putStrike: symPut, callStrike: symCall })
      }

      for (const { callStrike, putStrike } of candidates) {
        if (putStrike >= price || callStrike <= price) continue

        const midpoint = (callStrike + putStrike) / 2
        const dist = Math.abs(price - midpoint)
        if (dist < closestDist) {
          closestDist = dist
          closestInfo = `price=${price} strikes=${putStrike}/${callStrike} mid=${midpoint} dist=${dist.toFixed(4)} time=${this.utcMsToETTime(mb.t)}`
        }
        if (!this.isStockAtMidpoint(price, putStrike, callStrike)) continue

        dbg(
          `${symbol} ✓ HIT ${this.utcMsToETTime(mb.t)} price=${price} strikes=${putStrike}/${callStrike} dist=${dist.toFixed(4)}`
        )

        const callTicker = this.formatOptionTicker(symbol, expiry, 'C', callStrike)
        const putTicker = this.formatOptionTicker(symbol, expiry, 'P', putStrike)
        dbg(`${symbol} fetching ${callTicker} + ${putTicker}`)

        const [callQuote, putQuote] = await Promise.all([
          this.fetchOptionQuoteAt(callTicker, mb.t),
          this.fetchOptionQuoteAt(putTicker, mb.t),
        ])
        dbg(`${symbol} callQuote=${JSON.stringify(callQuote)} putQuote=${JSON.stringify(putQuote)}`)

        if (!callQuote || !putQuote) {
          dbg(`${symbol} → quote fetch failed`)
          continue
        }

        const callBid = callQuote.bid
        const callAsk = callQuote.ask
        const putBid = putQuote.bid
        const putAsk = putQuote.ask
        const callMid = (callBid + callAsk) / 2
        const putMid = (putBid + putAsk) / 2
        if (callMid <= 0 || putMid <= 0) {
          dbg(`${symbol} → zero mids callMid=${callMid} putMid=${putMid}`)
          continue
        }

        const premiumDifference = callMid - putMid
        const callSpreadPercent = callAsk > 0 ? ((callAsk - callBid) / callAsk) * 100 : 100
        const putSpreadPercent = putAsk > 0 ? ((putAsk - putBid) / putAsk) * 100 : 100
        if (callSpreadPercent > 25 || putSpreadPercent > 25) {
          dbg(
            `${symbol} → spread too wide call=${callSpreadPercent.toFixed(1)}% put=${putSpreadPercent.toFixed(1)}%`
          )
          continue
        }

        const avgPremium = (callMid + putMid) / 2
        const imbalancePercent = (premiumDifference / avgPremium) * 100
        const absImbalance = Math.abs(imbalancePercent)
        dbg(
          `${symbol} imbalance=${imbalancePercent.toFixed(1)}% callMid=${callMid} putMid=${putMid}`
        )
        if (absImbalance <= 1) {
          dbg(`${symbol} → imbalance too small`)
          continue
        }

        const expensiveSide = premiumDifference > 0 ? 'CALLS' : 'PUTS'
        let imbalanceSeverity: 'EXTREME' | 'HIGH' | 'MODERATE'
        if (absImbalance > 40) imbalanceSeverity = 'EXTREME'
        else if (absImbalance > 25) imbalanceSeverity = 'HIGH'
        else imbalanceSeverity = 'MODERATE'

        const strikeSpacing = callStrike - putStrike
        return {
          result: {
            symbol,
            stockPrice: price,
            atmStrike: midpoint,
            callMid,
            callBid,
            callAsk,
            callSpreadPercent,
            putMid,
            putBid,
            putAsk,
            putSpreadPercent,
            premiumDifference,
            imbalancePercent,
            expensiveSide,
            imbalanceSeverity,
            strikeSpacing,
            putStrike,
            callStrike,
            lastSeenTime: this.utcMsToETTime(mb.t),
            expiry,
          },
          logs,
        }
      } // end candidates loop
    } // end bars loop

    dbg(`${symbol} → no hit. Closest: ${closestInfo}`)
    return { result: null, logs }
  }

  private getAvailableStrikes(chainData: any[]): number[] {
    const strikes = new Set<number>()
    chainData.forEach((option) => {
      if (option.details?.strike_price) {
        strikes.add(option.details.strike_price)
      }
    })
    return Array.from(strikes).sort((a, b) => a - b)
  }

  private determineStrikeSpacing(strikes: number[]): number | null {
    if (strikes.length < 2) return null

    // Calculate the most common spacing between consecutive strikes
    const spacings = new Map<number, number>()
    for (let i = 1; i < strikes.length; i++) {
      const spacing = Math.round((strikes[i] - strikes[i - 1]) * 100) / 100 // Round to avoid float precision issues
      spacings.set(spacing, (spacings.get(spacing) || 0) + 1)
    }

    // Return the most common spacing
    let maxCount = 0
    let mostCommonSpacing = null
    for (const [spacing, count] of spacings.entries()) {
      if (count > maxCount) {
        maxCount = count
        mostCommonSpacing = spacing
      }
    }

    return mostCommonSpacing
  }

  private isStockAtMidpoint(stockPrice: number, lowerStrike: number, upperStrike: number): boolean {
    const midpoint = (lowerStrike + upperStrike) / 2
    const difference = Math.abs(stockPrice - midpoint)
    // Flat $0.10 tolerance for stocks >= $100, scaled for cheaper stocks
    const tolerance = stockPrice >= 100 ? 0.1 : stockPrice >= 50 ? 0.05 : 0.025
    return difference <= tolerance
  }

  private findOTMStrikes(
    stockPrice: number,
    strikes: number[]
  ): { callStrike: number | null; putStrike: number | null } {
    const asc = [...strikes].sort((a, b) => a - b)
    const desc = [...strikes].sort((a, b) => b - a)

    let callStrike: number | null = null
    for (const strike of asc) {
      if (strike > stockPrice) {
        callStrike = strike
        break
      }
    }

    let putStrike: number | null = null
    for (const strike of desc) {
      if (strike < stockPrice) {
        putStrike = strike
        break
      }
    }

    return { callStrike, putStrike }
  }

  private async getStockPrice(symbol: string): Promise<number | null> {
    try {
      const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${this.API_KEY}`
      const response = await fetch(url)
      if (!response.ok) return null

      const data = await response.json()
      return data.results?.p || null
    } catch (error) {
      return null
    }
  }

  private async getOptionChain(symbol: string, expiry: string): Promise<any> {
    try {
      const url = `https://api.polygon.io/v3/snapshot/options/${symbol}?expiration_date=${expiry}&limit=250&apiKey=${this.API_KEY}`
      const response = await fetch(url)

      if (!response.ok) return null

      const data = await response.json()
      return data.results || null
    } catch (error) {
      return null
    }
  }

  private extractQuoteFromChain(
    chainData: any[],
    strike: number,
    type: 'call' | 'put'
  ): OptionQuote | null {
    const contract = chainData.find(
      (c) => c.details.strike_price === strike && c.details.contract_type === type
    )

    if (!contract?.last_quote) return null

    const quote = contract.last_quote
    if (!quote.bid || !quote.ask || quote.bid <= 0 || quote.ask <= 0) {
      return null
    }

    return {
      bid: quote.bid,
      ask: quote.ask,
      mid: (quote.bid + quote.ask) / 2,
    }
  }
}

export const premiumScanner = new PremiumImbalanceScanner()
export type { PremiumImbalance, OptionQuote }
