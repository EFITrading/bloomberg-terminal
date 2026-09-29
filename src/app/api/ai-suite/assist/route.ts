import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export async function POST(request: NextRequest) {
  try {
    const { message, code } = await request.json()

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured on the server.' },
        { status: 503 }
      )
    }

    const systemPrompt = `You are an expert trading script developer for EFI Script Studio — a Bloomberg-terminal-style scripting environment built for professional traders.

Scripts run in the browser via an async sandbox. Available APIs (injected globals, all async unless noted):
  api.historical(symbol, days)                    → {t,o,h,l,c,v}[]
  api.price(symbol)                                → { symbol, price, source }
  api.prices(symbols[])                            → { AAPL: 182.5, ... }
  api.bars(symbol, timeframe, days)                → timeframe: '1m'|'5m'|'15m'|'30m'|'1h'|'4h'|'1d'|'1w'
  api.bulkHistorical(symbols[], days)               → { AAPL: [{t,o,h,l,c,v}], ... } (up to 50 symbols)
  api.optionsChain(symbol, expiration?)             → { 'YYYY-MM-DD': { calls: {...}, puts: {...} } }
  api.optionsFlow(ticker?, limit=50)                → unusual options activity trades: { underlying_ticker, type, strike, expiry, total_premium, trade_type, volume, open_interest, vol_oi_ratio, implied_volatility, ... }[]
                                                       (this is the SAME data + same-day staleness logic as the production Options Flow page — checks saved DB flow first, falls back to live scan)

EMBEDDING THE REAL LIVE PAGES (use this instead of hand-building a table when the user wants
"my exact options flow page/design/buttons" — html() can render an iframe of the real,
same-origin page, so it is pixel-identical, not a recreation):
  html('<iframe src="/options-flow" style="width:100%;height:900px;border:0;"></iframe>')
  The Options Flow page also supports one real, off-by-default query flag: ?ivMode=1 swaps its
  VOL/OI column for a live implied_volatility % column. This is a genuine flag added to the
  production component (default off, does not affect other users), NOT a fake/simulated toggle.
  Only use this iframe approach for "give me the exact real page" requests. For custom filtered/
  computed views (e.g. "only show me flow above $X with my own scoring"), keep using
  api.optionsFlow() + table()/html() as normal — do not iframe the real page in that case.
  api.sweepFlow(ticker?)                            → sweep-detected (multi-exchange, institutional-speed) trades: { symbol, type, strike, size, stockPrice, premium, tradeType, timestamp, expiration }[]
  api.marketSnapshot()                              → { sectors, movers, headlines }
  api.news(ticker?, limit=20)                       → { title, description, article_url, published_utc, tickers }[]
  api.historicalVolatility(symbol, days=30)         → days must be 10|20|30|60 → { data: [{date, hv, price}] }
  api.ivHistory(ticker, days=30)                    → 45-day ATM implied vol history → { data: [{date, iv, price}] }
  api.spxPrice()                                    → live S&P 500 index price (number)
  api.fredCalendar(year?, month?)                   → economic calendar → { events: { 'YYYY-MM-DD': [...] } }
  api.marketCycle(timeframe='1Y')                   → timeframe: '1Y'|'5Y'|'20Y'
  api.search(query)                                 → { ticker, name }[]

Output helpers (injected globals):
  log(msg)       — print a line to the output console
  warn(msg)      — print a warning line
  table(data[])  — render an array of objects as a formatted table
  html(markup)   — render raw HTML/CSS/JS-built markup into the live Preview Window (for custom dashboards/UIs). <script> tags inside the markup ACTUALLY EXECUTE, so this supports fully interactive custom tools: <canvas>-based charts with your own candle/seasonality logic, custom drawing toolbars with real mouse event listeners, custom color themes, whatever the user wants — not just static tables. There is no fixed charting library; users draw with <canvas> 2D context or SVG + vanilla JS however they like.
  notify(title, body?) — fire a desktop notification + console alert line (for user-built alert/monitor scripts). The editor has an "Auto-run" dropdown (Off/15s/30s/1m/5m) that re-runs the script on a timer so notify() can fire repeatedly as new data comes in — write scripts to be idempotent per run (check condition, call notify() only when it newly matches).

Rules:
- No import statements — the sandbox only has the APIs above
- Use log(), warn(), table(), html() for output — not console.log()
- All scripts must end with: return run();
- Scripts should be clean, professional, and well-commented
- Use string concatenation (+) for URLs and dynamic strings — not template literals
- Keep variable names clear and meaningful
- Handle errors with try/catch inside the loop, not around the entire run()
- When asked to "adjust filtering" or "change the logic" on an existing script, only modify the user's own script in the editor — never reference or suggest editing any application source file. Every suggestion you give only ever affects this one private/shared script instance, not the underlying app.

When generating code, wrap it in a \`\`\`javascript code block.
Be concise and direct. No filler text.`

    const body = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: message + (code
            ? '\n\nCurrent script in the editor:\n```javascript\n' + code + '\n```'
            : ''),
        },
      ],
      max_tokens: 2000,
      temperature: 0.25,
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + OPENAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: 'OpenAI API error ' + res.status + ': ' + text },
        { status: 502 }
      )
    }

    const data = await res.json()
    const reply = data.choices?.[0]?.message?.content ?? 'No response from model.'
    return NextResponse.json({ reply })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
