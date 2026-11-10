import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

// ─── RSS Sources ─────────────────────────────────────────────────────────────
// Benzinga feeds return 403 to server requests (Cloudflare), so they are not used.
// Sources below were verified with scripts/test-news-sources.js.
const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`
const RSS_SOURCES: { name: string; url: string; format: string }[] = [
  { name: 'Google News Markets', url: gnews('stock market when:1d'), format: 'rss' },
  { name: 'Google News Breaking', url: gnews('breaking news markets when:6h'), format: 'rss' },
  { name: 'Google News CPI/Inflation', url: gnews('(CPI OR inflation OR PPI OR "jobs report" OR payrolls) when:1d'), format: 'rss' },
  { name: 'Google News Fed/Rates', url: gnews('(Fed OR FOMC OR Powell OR "interest rates" OR "Treasury yields") when:1d'), format: 'rss' },
  { name: 'Google News Government', url: gnews('(government OR Congress OR "shutdown" OR "debt ceiling" OR tariffs OR "executive order") markets when:1d'), format: 'rss' },
  { name: 'Google News War/Geopolitics', url: gnews('(war OR ceasefire OR sanctions OR missile OR Iran OR Ukraine OR Israel) markets when:1d'), format: 'rss' },
  { name: 'Google News Earnings', url: gnews('(earnings OR guidance OR "beats estimates" OR "misses estimates") stock when:1d'), format: 'rss' },
  { name: 'Google News Oil/Commodities', url: gnews('(oil OR crude OR OPEC OR gold) prices when:1d'), format: 'rss' },
  { name: 'Google News Business', url: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en', format: 'rss' },
  { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', format: 'rss' },
  { name: 'CNBC Markets', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069', format: 'rss' },
  { name: 'Nasdaq', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets', format: 'rss' },
  { name: 'Seeking Alpha', url: 'https://seekingalpha.com/market_currents.xml', format: 'rss' },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', format: 'rss' },
  { name: 'ZeroHedge', url: 'https://feeds.feedburner.com/zerohedge/feed', format: 'rss' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', format: 'rss' },
  { name: 'NYT Business', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', format: 'rss' },
]

function calcRSSUrgency(title: string, desc: string, published: Date): number {
  const c = `${title} ${desc}`.toLowerCase()
  const hoursAgo = (Date.now() - published.getTime()) / 3600000
  let u =
    hoursAgo < 0.5
      ? 0.55
      : hoursAgo < 1
        ? 0.45
        : hoursAgo < 2
          ? 0.35
          : hoursAgo < 6
            ? 0.25
            : hoursAgo < 12
              ? 0.15
              : 0.05
  let kw = 0
  if (/ceasefire|cease.fire|truce|bombing|missile|nuclear|\bwar\b|invasion/.test(c)) kw += 0.4
  if (/breaking|flash|alert|urgent/.test(c)) kw += 0.35
  if (/trump|tariff|tariffs|sanctions|executive order|white house/.test(c)) kw += 0.3
  if (/iran|israel|ukraine|russia|china|nato|gaza|middle east/.test(c)) kw += 0.25
  if (/\bfed\b|fomc|powell|federal reserve|rate cut|rate hike|interest rates|\bcpi\b|\bppi\b|gdp|inflation|jobs report|payrolls|unemployment|recession|treasury yields?/.test(c))
    kw += 0.3
  if (/government|shutdown|congress|debt ceiling|senate|\bwar\b/.test(c)) kw += 0.2
  if (/halt|suspend|crash|plunge|collapse|selloff|sell.off|rout/.test(c)) kw += 0.25
  if (/surge|soar|spike|rally|shoot|futures up|futures down/.test(c)) kw += 0.2
  if (/oil|crude|hormuz|opec|energy/.test(c)) kw += 0.15
  if (/earnings|guidance|beats? estimates|misses? estimates|revenue|merger|acquisition|ipo/.test(c)) kw += 0.2
  if (/\bsec\b|investigation|fraud|lawsuit|indictment/.test(c)) kw += 0.1
  // Keyword boost is capped and fades with age so scores spread out instead of all hitting 1.0
  u += Math.min(kw, 0.45) * (hoursAgo < 6 ? 1 : 0.6)
  return Math.min(1, u)
}

function decodeHtml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/g, '')
}

function cleanText(raw: string, limit?: number): string {
  // Decode entities first, then strip any remaining HTML tags
  const decoded = decodeHtml(raw)
  const stripped = decoded.replace(/<[^>]*>/g, '').trim()
  return limit ? stripped.substring(0, limit).trim() : stripped
}

function parseRSSXML(xml: string, sourceName: string): any[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
  return items
    .map((item, i) => {
      const title = cleanText(
        item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ??
        item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ??
        ''
      )
      const desc = cleanText(
        item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ??
        item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ??
        '',
        300
      )
      // Decode HTML entities in URL (e.g. &amp; → &)
      const rawLink = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? '#'
      const link = decodeHtml(rawLink)
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ''
      const published = pubDate ? new Date(pubDate) : new Date()
      if (!title) return null
      const urgency = calcRSSUrgency(title, desc, published)
      return {
        id: `rss_${sourceName}_${i}`,
        title,
        description: desc,
        article_url: link,
        published_utc: published.toISOString(),
        publisher: { name: sourceName },
        tickers: [],
        urgency,
        sentiment: 'neutral',
        sentiment_score: 0.5,
        relevance_score: urgency,
        time_ago: getTimeAgo(published.toISOString()),
        category: urgency >= 0.65 ? 'breaking' : 'market',
      }
    })
    .filter(Boolean)
}

// Atom feed parser (used for Benzinga /topic/breaking-news/feed)
function parseAtomXML(xml: string, sourceName: string): any[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || []
  return entries
    .map((entry, i) => {
      const title = cleanText(
        entry.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ??
        entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ??
        ''
      )
      const desc = cleanText(
        entry.match(/<summary[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/summary>/)?.[1] ??
        entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ??
        entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ??
        '',
        300
      )
      const rawLink =
        entry.match(/<link[^>]+href=["']([^"']+)["']/)?.[1] ??
        entry.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ??
        '#'
      const link = decodeHtml(rawLink)
      const pubDate =
        entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] ??
        entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] ??
        ''
      const published = pubDate ? new Date(pubDate) : new Date()
      if (!title) return null
      const urgency = calcRSSUrgency(title, desc, published)
      return {
        id: `atom_${sourceName}_${i}`,
        title,
        description: desc,
        article_url: link,
        published_utc: published.toISOString(),
        publisher: { name: sourceName },
        tickers: [],
        urgency,
        sentiment: 'neutral',
        sentiment_score: 0.5,
        relevance_score: urgency,
        time_ago: getTimeAgo(published.toISOString()),
        category: urgency >= 0.65 ? 'breaking' : 'market',
      }
    })
    .filter(Boolean)
}

async function fetchAllRSS(ticker?: string | null): Promise<any[]> {
  // Ticker search: only ticker-specific feeds, so unrelated headlines don't leak in
  const sources: { name: string; url: string; format: string }[] = ticker ? [] : [...RSS_SOURCES]
  if (ticker) {
    const t = ticker.toUpperCase()
    // Index ETFs share names with common words, so search by what they track
    const gq: Record<string, string> = {
      SPY: '"SPY ETF" OR "S&P 500"',
      QQQ: '"QQQ ETF" OR Nasdaq-100',
      IWM: '"IWM ETF" OR "Russell 2000"',
      DIA: '"DIA ETF" OR "Dow Jones"',
    }
    sources.unshift(
      { name: `Google News ${t}`, url: gnews(`${gq[t] ?? `${t} stock`} when:3d`), format: 'rss' },
      { name: `Yahoo Finance ${t}`, url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${t}&region=US&lang=en-US`, format: 'rss' }
    )
  }
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const t0 = Date.now()
      try {
        const res = await fetch(src.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        })
        if (!res.ok) {
          console.log(`[news-rss] ${src.name}: HTTP ${res.status}`)
          return []
        }
        const xml = await res.text()
        const items = src.format === 'atom' ? parseAtomXML(xml, src.name) : parseRSSXML(xml, src.name)
        console.log(`[news-rss] ${src.name}: ${items.length} items in ${Date.now() - t0}ms`)
        return items.map((a: any) => {
          // Google News titles end with " - Publisher"
          if (src.name.startsWith('Google News')) {
            const m = a.title.match(/^(.*) - ([^-]+)$/)
            if (m) {
              a.title = m[1]
              a.publisher = { name: m[2].trim() }
            }
          }
          if (ticker && /\b(Google News|Yahoo Finance) /.test(src.name) && src.name.endsWith(ticker.toUpperCase())) {
            a.tickers = [ticker.toUpperCase()]
          }
          return a
        })
      } catch (e: any) {
        console.log(`[news-rss] ${src.name}: FAILED ${e?.name}`)
        return []
      }
    })
  )
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))

  // Deduplicate by URL and by normalized title — keep the copy with the highest urgency
  const seen = new Map<string, any>()
  for (const article of all) {
    const key = article.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
    if (!seen.has(key) || article.urgency > seen.get(key).urgency) seen.set(key, article)
  }
  return Array.from(seen.values())
}

interface NewsArticle {
  id: string
  title: string
  description: string
  keywords: string[]
  publisher: {
    name: string
    homepage_url: string
    logo_url: string
    favicon_url: string
  }
  published_utc: string
  article_url: string
  tickers: string[]
  amp_url?: string
  image_url?: string
  author?: string
  sentiment?: 'positive' | 'negative' | 'neutral'
  sentiment_score?: number
  relevance_score?: number
}

interface NewsResponse {
  status: string
  request_id: string
  count: number
  results: NewsArticle[]
  next_url?: string
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const ticker = searchParams.get('ticker')
    const limit = searchParams.get('limit') || '20'
    const offset = searchParams.get('offset') || '0'
    const category = searchParams.get('category') // earnings, mergers, etc.
    const sort = searchParams.get('sort') || 'published_utc'
    const historical = searchParams.get('historical') === 'true'

    // Build the Polygon News API URL
    let url = `https://api.polygon.io/v2/reference/news?`

    // Map categories to keywords for filtering
    const categoryKeywords: { [key: string]: string } = {
      breaking:
        'breaking alert urgent flash emergency halt suspend crash surge spike trump tariff tariffs china trade war politics election fed reserve interest rates inflation',
      earnings: 'earnings revenue profit loss guidance forecast',
      ma: 'merger acquisition buyout takeover deal',
      ipo: 'IPO initial public offering debut listing',
      analyst: 'analyst rating upgrade downgrade target price',
      regulatory: 'SEC FDA regulatory approval investigation lawsuit',
    }

    // Add parameters
    const params = new URLSearchParams({
      apikey: POLYGON_API_KEY,
      limit: category && category !== 'all' ? '100' : limit, // Get more results for filtering
      order: 'desc',
      sort,
      ...(ticker && { ticker: ticker.toUpperCase() }),
    })

    // Add date filtering - expand timeframe to capture more breaking news
    // historical=true → 72h window; breaking → 72h; all → 48h; specific categories → 7 days
    const timeframeHours = historical
      ? 72
      : category === 'breaking'
        ? 72
        : category === 'all'
          ? 48
          : 168
    const timeAgo = new Date(Date.now() - timeframeHours * 60 * 60 * 1000)
    const dateFilter = timeAgo.toISOString()
    params.append('published_utc.gte', dateFilter)

    // For historical requests, override limit to get max coverage
    if (historical) {
      params.set('limit', '1000')
    }

    url += params.toString()

    console.log(` Fetching news from Polygon API: ${url.replace(POLYGON_API_KEY, '[HIDDEN]')}`)

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Bloomberg-Terminal/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status} ${response.statusText}`)
    }

    const data: NewsResponse = await response.json()

    // Enhance news articles with sentiment analysis and relevance scoring
    const enhancedArticles = data.results.map((article) => ({
      ...article,
      sentiment: analyzeSentiment(article.title, article.description),
      sentiment_score: calculateSentimentScore(article.title, article.description),
      relevance_score: calculateRelevanceScore(article, ticker),
      time_ago: getTimeAgo(article.published_utc),
      category: categorizeNews(article),
      urgency: calculateUrgency(article),
    })).map((a) =>
      // Zacks earnings recaps are low-value filler; keep them below real headlines
      /zacks/i.test(a.publisher?.name || '') ? { ...a, urgency: Math.min(a.urgency, 0.3) } : a
    )

    // Quality filter - remove blacklisted publishers and low-urgency "crab" articles
    const qualityFilteredArticles = enhancedArticles.filter((article) => {
      const publisher = article.publisher?.name?.toLowerCase() || ''

      // COMPLETE BLACKLIST - Zero tolerance for these publishers
      const blacklistedPublishers = [
        'motley fool',
        'fool',
        'the motley fool',
        'globenewswire',
        'globe newswire',
        'pr newswire',
        'prnewswire',
        'business wire',
        'businesswire',
        'accesswire',
        'news direct',
        'newsdirect',
        'einpresswire',
        'ein presswire',
        'globe wire',
        'marketwired',
  'investing com',
      ]

      // Block ALL articles from blacklisted publishers
      const isBlacklisted = blacklistedPublishers.some((pub) => publisher.includes(pub))
      if (isBlacklisted) {
        console.log(` Blocked article from ${article.publisher?.name}: ${article.title}`)
        return false
      }

      // For remaining publishers, apply quality filters
      const title = article.title.toLowerCase()

      // Low-value content patterns to filter regardless of publisher
      const lowValuePatterns = [
        /prediction/i,
        /could.*reach/i,
        /might.*be.*good/i,
        /should.*you.*buy/i,
        /is.*stock.*buy/i,
        /penny stock/i,
        /reddit/i,
        /wallstreetbets/i,
        /why.*stock.*moving/i,
        /here's why.*stock/i,
        /stock.*down.*today/i,
        /stock.*up.*today/i,
        /what happened/i,
        /stock spotlight/i,
        /why shares.*trading/i,
        /why.*shares.*down/i,
        /why.*shares.*up/i,
        /stock.*volatile/i,
      ]

      // Skip low-value content if urgency is very low
      if (article.urgency < 0.3) {
        const isLowValue = lowValuePatterns.some((pattern) => pattern.test(title))
        if (isLowValue) return false
      }

      return true
    })

    // Filter by category if specified
    let filteredArticles = qualityFilteredArticles
    if (category && category !== 'all') {
      if (category === 'breaking') {
        // For breaking news, filter by medium-high urgency (≥ 0.4) and recent timing to capture more political/economic news
        filteredArticles = qualityFilteredArticles.filter((article) => {
          const hoursAgo =
            (Date.now() - new Date(article.published_utc).getTime()) / (1000 * 60 * 60)
          return article.urgency >= 0.4 || hoursAgo < 4 // Medium-high urgency OR recent (4 hours)
        })
      } else if (categoryKeywords[category]) {
        const keywords = categoryKeywords[category].toLowerCase().split(' ')
        filteredArticles = qualityFilteredArticles.filter((article) => {
          const searchText = `${article.title} ${article.description}`.toLowerCase()
          return keywords.some((keyword) => searchText.includes(keyword))
        })
      }
    }

    // Sort by relevance and recency
    const sortedArticles = filteredArticles.sort((a, b) => {
      // Primary sort by urgency (breaking news first)
      if (a.urgency !== b.urgency) {
        return b.urgency - a.urgency
      }
      // Secondary sort by relevance score
      if (a.relevance_score !== b.relevance_score) {
        return (b.relevance_score || 0) - (a.relevance_score || 0)
      }
      // Tertiary sort by published date
      return new Date(b.published_utc).getTime() - new Date(a.published_utc).getTime()
    })

    // Fetch additional social/RSS news for market-moving events
    let socialArticles: any[] = []
    const skipRSSCategories = ['earnings', 'analyst', 'ma', 'ipo']
    if (!category || !skipRSSCategories.includes(category)) {
      try {
        console.log(' Fetching RSS feeds directly...')
        const rssArticles = await fetchAllRSS(ticker)
        console.log(' RSS articles fetched:', rssArticles.length)
        socialArticles = rssArticles
      } catch (error) {
        console.log('RSS fetch error:', error)
      }
    }

    // Drop stale RSS articles — if the feed hasn't updated (e.g. holiday weekend)
    // old articles would dominate after Polygon blacklist filtering
    const cutoff24h = Date.now() - (historical || ticker ? 72 : 24) * 60 * 60 * 1000
    const freshSocialArticles = socialArticles.filter(
      (a) => new Date(a.published_utc).getTime() > cutoff24h
    )
    if (socialArticles.length !== freshSocialArticles.length) {
      console.log(`[news-api-debug] Dropped ${socialArticles.length - freshSocialArticles.length} stale RSS articles (>24h old)`)
    }

    // Combine and sort all articles
    console.log(
      ' Combining articles - Polygon:',
      sortedArticles.length,
      'Social:',
      freshSocialArticles.length
    )
    const combinedArticles = [...sortedArticles, ...freshSocialArticles]
    console.log(' Combined total:', combinedArticles.length)

    const finalSorted = combinedArticles.sort((a, b) => {
      // For historical requests, sort purely by date so older days show up
      if (historical) {
        return new Date(b.published_utc).getTime() - new Date(a.published_utc).getTime()
      }
      if (a.urgency !== b.urgency) return b.urgency - a.urgency
      return new Date(b.published_utc).getTime() - new Date(a.published_utc).getTime()
    })

    // Limit results to requested amount
    const finalArticles = finalSorted.slice(0, parseInt(limit))
    console.log(' Final articles returned:', finalArticles.length, 'of', combinedArticles.length)

    return NextResponse.json({
      success: true,
      count: finalArticles.length,
      articles: finalArticles,
      request_id: data.request_id,
      metadata: {
        ticker: ticker?.toUpperCase() || 'ALL',
        limit: parseInt(limit),
        total_available: data.count,
        filters_applied: {
          date_range: `${timeframeHours}_hours`,
          sort_by: sort,
          category: category || 'all',
        },
        news_sources: ['GlobeNewswire Inc.', 'The Motley Fool'],
        coverage: 'Corporate announcements, earnings, M&A, IPOs, analyst reports',
        limitations:
          'Political/economic news (Trump tariffs, Fed policy) may require Reuters, Bloomberg, or CNBC',
        note:
          category === 'breaking'
            ? 'Breaking news filtered for high-impact corporate stories. Major political/economic events may not appear.'
            : undefined,
      },
    })
  } catch (error) {
    console.error('News API Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch news',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Sentiment Analysis Function
function analyzeSentiment(
  title: string,
  description?: string
): 'positive' | 'negative' | 'neutral' {
  // Weight title 3x more than description — headlines drive sentiment
  const titleText = title.toLowerCase()
  const descText = (description || '').toLowerCase()

  const positiveWords = [
    'surge',
    'soar',
    'rally',
    'gain',
    'rise',
    'jump',
    'climb',
    'boost',
    'strong',
    'beat',
    'exceed',
    'outperform',
    'bull',
    'bullish',
    'upgrade',
    'growth',
    'profit',
    'earnings beat',
    'positive',
    'optimistic',
    'breakthrough',
    'success',
    'record high',
    'record revenue',
    'record profit',
    'raises guidance',
    'raised guidance',
    'above expectations',
    'tops estimates',
    'rebounds',
    'recovers',
    'trending higher',
    'up overnight',
    'after-hours gain',
    'ipo priced above',
    'raised price target',
    'new high',
  ]

  const negativeWords = [
    'plunge',
    'crash',
    'tumble',
    'collapse',
    'sink',
    'slump',
    'plummet',
    'miss',
    'underperform',
    'bear',
    'bearish',
    'downgrade',
    'loss',
    'earnings miss',
    'below expectations',
    'misses estimates',
    'cuts guidance',
    'cut guidance',
    'lowers guidance',
    'lowered guidance',
    'job cut',
    'layoff',
    'layoffs',
    'bankruptcy',
    'defaults',
    'default',
    'halted',
    'suspended trading',
    'sec charges',
    'fraud',
    'investigation',
    'recall',
    'class action',
    'downside',
    'price target cut',
    'lowered target',
  ]

  let positiveScore = 0
  let negativeScore = 0

  // Title words count 3x
  positiveWords.forEach((word) => {
    if (titleText.includes(word)) positiveScore += 3
    else if (descText.includes(word)) positiveScore += 1
  })

  negativeWords.forEach((word) => {
    if (titleText.includes(word)) negativeScore += 3
    else if (descText.includes(word)) negativeScore += 1
  })

  // Explicit numeric signals in title: "up X%" → positive, "down X%" → negative
  if (
    /\bup\s+\d+\.?\d*%/.test(titleText) ||
    /rose\s+\d+\.?\d*%/.test(titleText) ||
    /gained?\s+\d+\.?\d*%/.test(titleText)
  )
    positiveScore += 4
  if (
    /\bdown\s+\d+\.?\d*%/.test(titleText) ||
    /fell?\s+\d+\.?\d*%/.test(titleText) ||
    /dropped?\s+\d+\.?\d*%/.test(titleText) ||
    /lost\s+\d+\.?\d*%/.test(titleText)
  )
    negativeScore += 4

  if (positiveScore > negativeScore) return 'positive'
  if (negativeScore > positiveScore) return 'negative'
  return 'neutral'
}

// Calculate Sentiment Score (-1 to 1)
function calculateSentimentScore(title: string, description?: string): number {
  const sentiment = analyzeSentiment(title, description)
  const text = `${title} ${description || ''}`.toLowerCase()

  // Base score from sentiment
  let score = sentiment === 'positive' ? 0.3 : sentiment === 'negative' ? -0.3 : 0

  // Intensity modifiers
  const intensityWords = {
    massive: 0.4,
    huge: 0.3,
    significant: 0.2,
    major: 0.2,
    slight: 0.1,
    minor: 0.1,
    crash: -0.5,
    plunge: -0.4,
    soar: 0.4,
    surge: 0.4,
    rally: 0.3,
  }

  Object.entries(intensityWords).forEach(([word, modifier]) => {
    if (text.includes(word)) {
      score += modifier
    }
  })

  return Math.max(-1, Math.min(1, score))
}

// Calculate Relevance Score for specific ticker
function calculateRelevanceScore(article: NewsArticle, ticker?: string | null): number {
  if (!ticker) return 0.5 // Default relevance for general news

  let score = 0

  // Direct ticker mention
  if (article.tickers.includes(ticker.toUpperCase())) {
    score += 1.0
  }

  // Title mentions company/ticker
  const titleLower = article.title.toLowerCase()
  if (titleLower.includes(ticker.toLowerCase())) {
    score += 0.8
  }

  // Keywords relevance
  const relevantKeywords = ['earnings', 'revenue', 'profit', 'merger', 'acquisition', 'ipo']
  article.keywords.forEach((keyword) => {
    if (relevantKeywords.includes(keyword.toLowerCase())) {
      score += 0.2
    }
  })

  return Math.min(1, score)
}

// Time ago helper
function getTimeAgo(publishedUtc: string): string {
  const now = new Date()
  const published = new Date(publishedUtc)
  const diffMs = now.getTime() - published.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

// Categorize news articles
function categorizeNews(article: NewsArticle): string {
  const title = article.title.toLowerCase()
  const keywords = article.keywords.map((k) => k.toLowerCase())

  if (
    keywords.includes('earnings') ||
    title.includes('earnings') ||
    title.includes('q1') ||
    title.includes('q2') ||
    title.includes('q3') ||
    title.includes('q4')
  ) {
    return 'earnings'
  }
  if (
    keywords.includes('merger') ||
    keywords.includes('acquisition') ||
    title.includes('merger') ||
    title.includes('acquisition')
  ) {
    return 'ma' // Mergers & Acquisitions
  }
  if (keywords.includes('ipo') || title.includes('ipo') || title.includes('public offering')) {
    return 'ipo'
  }
  if (title.includes('fda') || title.includes('approval') || keywords.includes('regulatory')) {
    return 'regulatory'
  }
  if (
    keywords.includes('analyst') ||
    title.includes('upgrade') ||
    title.includes('downgrade') ||
    title.includes('price target')
  ) {
    return 'analyst'
  }
  return 'general'
}

// Calculate news urgency (0-1)
function calculateUrgency(article: NewsArticle): number {
  const title = article.title.toLowerCase()
  const description = article.description?.toLowerCase() || ''
  const content = `${title} ${description}`
  const publishedTime = new Date(article.published_utc)
  const hoursAgo = (Date.now() - publishedTime.getTime()) / (1000 * 60 * 60)
  const minutesAgo = (Date.now() - publishedTime.getTime()) / (1000 * 60)

  let urgency = 0

  // BREAKING NEWS indicators (highest priority)
  if (/breaking|alert|urgent|flash|live|now/i.test(content)) urgency += 0.9
  if (/halt|suspend|stop|emergency|crisis/i.test(content)) urgency += 0.95
  if (/crash|plunge|surge|spike|soar/i.test(content)) urgency += 0.8

  // Major market events
  if (/earnings|revenue|profit|loss/i.test(content) && hoursAgo < 4) urgency += 0.7
  if (/merger|acquisition|buyout|takeover/i.test(content)) urgency += 0.6
  if (/fda approval|drug approval|clinical trial/i.test(content)) urgency += 0.75
  if (/rate cut|rate hike|fed|federal reserve/i.test(content)) urgency += 0.8
  if (/bankruptcy|default|liquidation/i.test(content)) urgency += 0.85

  // Political and trade news affecting markets
  if (/trump|biden|election|political|politics/i.test(content)) urgency += 0.75
  if (/tariff|tariffs|trade war|china trade|trade deal/i.test(content)) urgency += 0.85
  if (/sanctions|embargo|trade restrictions/i.test(content)) urgency += 0.8
  if (/inflation|cpi|ppi|unemployment|jobs report/i.test(content)) urgency += 0.7

  // Executive changes and major announcements
  if (/ceo|cfo|resignation|fired|appointed|new leadership/i.test(content)) urgency += 0.6
  if (/stock split|dividend|buyback/i.test(content)) urgency += 0.5
  if (/guidance|forecast|outlook/i.test(content) && hoursAgo < 6) urgency += 0.55

  // Regulatory and legal
  if (/sec|investigation|lawsuit|settlement|fine/i.test(content)) urgency += 0.65
  if (/recall|safety|warning/i.test(content)) urgency += 0.7

  // Time-based urgency (breaking news effect)
  if (minutesAgo < 30)
    urgency += 0.4 // Last 30 minutes
  else if (hoursAgo < 1)
    urgency += 0.35 // Last hour
  else if (hoursAgo < 2)
    urgency += 0.3 // Last 2 hours
  else if (hoursAgo < 6)
    urgency += 0.2 // Last 6 hours
  else if (hoursAgo < 12)
    urgency += 0.15 // Last 12 hours
  else if (hoursAgo < 24) urgency += 0.1 // Last day

  // Major tickers boost urgency
  const majorTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'SPY', 'QQQ']
  if (article.tickers.some((ticker) => majorTickers.includes(ticker))) urgency += 0.2

  return Math.min(1, urgency)
}

// Exported helper — call this directly instead of doing a loopback HTTP fetch
export async function fetchNewsArticles(limit: number = 100): Promise<any[]> {
  try {
    const params = new URLSearchParams({
      apikey: POLYGON_API_KEY,
      limit: String(Math.min(limit, 1000)),
      order: 'desc',
      sort: 'published_utc',
    })
    const timeAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    params.append('published_utc.gte', timeAgo.toISOString())

    const url = `https://api.polygon.io/v2/reference/news?${params.toString()}`
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Bloomberg-Terminal/1.0' },
    })

    const polygonArticles: any[] = []
    if (response.ok) {
      const data: NewsResponse = await response.json()
      const blacklistedPublishers = [
        'motley fool', 'fool', 'the motley fool', 'globenewswire', 'globe newswire',
        'pr newswire', 'prnewswire', 'business wire', 'businesswire', 'accesswire',
        'news direct', 'newsdirect', 'einpresswire', 'ein presswire', 'globe wire',
        'marketwired', 'investing.com', 'investing com',
      ]
      data.results
        .map((article) => ({
          ...article,
          sentiment: analyzeSentiment(article.title, article.description),
          sentiment_score: calculateSentimentScore(article.title, article.description),
          relevance_score: calculateRelevanceScore(article, null),
          time_ago: getTimeAgo(article.published_utc),
          category: categorizeNews(article),
          urgency: calculateUrgency(article),
        }))
        .filter((article) => {
          const publisher = article.publisher?.name?.toLowerCase() || ''
          return !blacklistedPublishers.some((pub) => publisher.includes(pub))
        })
        .forEach((article) => polygonArticles.push(article))
    }

    let rssArticles: any[] = []
    try {
      rssArticles = await fetchAllRSS()
    } catch (_) { }

    const combined = [...polygonArticles, ...rssArticles]
    combined.sort((a, b) => {
      if (a.urgency !== b.urgency) return b.urgency - a.urgency
      return new Date(b.published_utc).getTime() - new Date(a.published_utc).getTime()
    })
    return combined.slice(0, limit)
  } catch (error) {
    console.error('fetchNewsArticles error:', error)
    return []
  }
}
