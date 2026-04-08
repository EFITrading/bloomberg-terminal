import { NextRequest, NextResponse } from 'next/server'

interface SocialNewsArticle {
  id: string
  title: string
  description: string
  url: string
  source: string
  author: string
  published_utc: string
  urgency: number
  category: 'breaking' | 'market' | 'economic' | 'political'
  tickers: string[]
}

// Free RSS feeds and news sources
const NEWS_SOURCES = [
  {
    name: 'Benzinga',
    url: 'https://www.benzinga.com/feed',
    category: 'breaking',
  },
  {
    name: 'Benzinga Markets',
    url: 'https://www.benzinga.com/markets/feed',
    category: 'breaking',
  },
  {
    name: 'Benzinga Trading Ideas',
    url: 'https://www.benzinga.com/trading-ideas/feed',
    category: 'breaking',
  },
  {
    name: 'Benzinga Movers',
    url: 'https://www.benzinga.com/movers/feed',
    category: 'market',
  },
]

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
  const decoded = decodeHtml(raw)
  const stripped = decoded.replace(/<[^>]*>/g, '').trim()
  return limit ? stripped.substring(0, limit).trim() : stripped
}

// Extract tickers from text using common patterns
function extractTickers(text: string): string[] {
  const tickerRegex = /\b([A-Z]{1,5})\b/g
  const matches = text.match(tickerRegex) || []

  // Filter out common false positives
  const blacklist = [
    'THE',
    'AND',
    'FOR',
    'ARE',
    'BUT',
    'NOT',
    'YOU',
    'ALL',
    'CAN',
    'HER',
    'WAS',
    'ONE',
    'OUR',
    'HAD',
    'BY',
    'UP',
    'DO',
    'NO',
    'IF',
    'MY',
    'US',
    'AN',
    'ME',
    'OR',
    'SO',
    'HE',
    'AS',
    'IN',
    'ON',
    'AT',
    'BE',
    'TO',
    'OF',
    'IT',
    'IS',
    'HAS',
    'NEW',
    'GET',
    'NOW',
    'WHO',
    'HOW',
    'WHY',
    'WHAT',
    'WHEN',
    'WHERE',
  ]

  return matches
    .filter((ticker) => !blacklist.includes(ticker))
    .filter((ticker) => ticker.length >= 2 && ticker.length <= 5)
    .slice(0, 5) // Limit to 5 tickers
}

// Calculate urgency based on keywords and recency
function calculateSocialUrgency(title: string, description: string, publishedTime: Date): number {
  const content = `${title} ${description}`.toLowerCase()
  const hoursAgo = (Date.now() - publishedTime.getTime()) / (1000 * 60 * 60)

  // Start with recency — most important factor
  let urgency = 0
  if (hoursAgo < 0.5)
    urgency = 0.55 // Last 30 min — very fresh
  else if (hoursAgo < 1) urgency = 0.45
  else if (hoursAgo < 2) urgency = 0.35
  else if (hoursAgo < 6) urgency = 0.25
  else if (hoursAgo < 12) urgency = 0.15
  else urgency = 0.05

  // Breaking / geopolitical / macro — big boosts (additive on top of recency)
  if (/ceasefire|cease.fire|truce|bombing|missile|nuclear|war|invasion/i.test(content))
    urgency += 0.4
  if (/breaking|flash|alert|urgent/i.test(content)) urgency += 0.35
  if (/trump|tariff|tariffs|sanctions|executive order|white house/i.test(content)) urgency += 0.3
  if (/iran|israel|ukraine|russia|china|nato|gaza|middle east/i.test(content)) urgency += 0.25
  if (
    /fed|federal reserve|rate cut|rate hike|interest rates|cpi|gdp|inflation|jobs report/i.test(
      content
    )
  )
    urgency += 0.25
  if (/halt|suspend|crash|plunge|collapse|selloff|sell.off|rout/i.test(content)) urgency += 0.25
  if (/surge|soar|spike|rally|shoot|futures up|futures down/i.test(content)) urgency += 0.2
  if (/oil|crude|hormuz|opec|energy/i.test(content)) urgency += 0.15
  if (/earnings|revenue|merger|acquisition|ipo/i.test(content)) urgency += 0.1
  if (/sec|investigation|fraud|lawsuit|indictment/i.test(content)) urgency += 0.1

  return Math.min(1, urgency)
}

// Parse RSS feed
async function parseRSSFeed(url: string, sourceName: string): Promise<SocialNewsArticle[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Bloomberg-Terminal-News-Aggregator/1.0',
      },
    })

    if (!response.ok) {
      console.log(`Failed to fetch ${sourceName}: ${response.status}`)
      return []
    }

    const xmlText = await response.text()

    // Simple XML parsing for RSS items
    const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || []

    return items
      .map((item, index) => {
        const title =
          item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
          item.match(/<title>(.*?)<\/title>/)?.[1] ||
          'No title'

        const description =
          item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
          item.match(/<description>(.*?)<\/description>/)?.[1] ||
          ''

        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '#'

        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || new Date().toISOString()

        const publishedTime = new Date(pubDate)
        const tickers = extractTickers(`${title} ${description}`)
        const urgency = calculateSocialUrgency(title, description, publishedTime)

        return {
          id: `social_${sourceName.toLowerCase().replace(/\s+/g, '_')}_${index}_${Date.now()}`,
          title: cleanText(title),
          description: cleanText(description, 300),
          url: link,
          source: sourceName,
          author: sourceName,
          published_utc: publishedTime.toISOString(),
          urgency,
          category: urgency >= 0.7 ? 'breaking' : urgency >= 0.5 ? 'market' : 'economic',
          tickers,
        } as SocialNewsArticle
      })
      .filter((article) => article.title !== 'No title')
  } catch (error) {
    console.log(`Error parsing RSS for ${sourceName}:`, error)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category') || 'all'
    const limit = parseInt(searchParams.get('limit') || '20')

    // Fetch from all RSS sources in parallel
    const allArticlesPromises = NEWS_SOURCES.map((source) => parseRSSFeed(source.url, source.name))

    const allArticlesArrays = await Promise.all(allArticlesPromises)
    const allArticles = allArticlesArrays.flat()

    // Filter by category
    let filteredArticles = allArticles
    if (category === 'breaking') {
      // Lower threshold so fresh geopolitical/macro stories aren't dropped
      filteredArticles = allArticles.filter((article) => article.urgency >= 0.35)
    } else if (category !== 'all') {
      filteredArticles = allArticles.filter((article) => article.category === category)
    }

    // Sort by urgency and recency
    const sortedArticles = filteredArticles.sort((a, b) => {
      if (a.urgency !== b.urgency) return b.urgency - a.urgency
      return new Date(b.published_utc).getTime() - new Date(a.published_utc).getTime()
    })

    // Limit results and add time_ago
    const finalArticles = sortedArticles.slice(0, limit).map((article) => ({
      ...article,
      time_ago: getTimeAgo(article.published_utc),
    }))

    return NextResponse.json({
      success: true,
      count: finalArticles.length,
      articles: finalArticles,
      metadata: {
        sources: NEWS_SOURCES.map((s) => s.name),
        category: category,
        coverage: 'Real-time breaking news, market updates, political events affecting markets',
        last_updated: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Social news API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch social news feed',
        articles: [],
      },
      { status: 500 }
    )
  }
}

function getTimeAgo(publishedUtc: string): string {
  const now = new Date()
  const published = new Date(publishedUtc)
  const diffMs = now.getTime() - published.getTime()

  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
