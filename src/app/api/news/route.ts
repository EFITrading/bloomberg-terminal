import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface NewsArticle {
 id: string;
 title: string;
 description: string;
 keywords: string[];
 publisher: {
 name: string;
 homepage_url: string;
 logo_url: string;
 favicon_url: string;
 };
 published_utc: string;
 article_url: string;
 tickers: string[];
 amp_url?: string;
 image_url?: string;
 author?: string;
 sentiment?: 'positive' | 'negative' | 'neutral';
 sentiment_score?: number;
 relevance_score?: number;
}

interface NewsResponse {
 status: string;
 request_id: string;
 count: number;
 results: NewsArticle[];
 next_url?: string;
}

export async function GET(request: NextRequest) {
 try {
 const searchParams = request.nextUrl.searchParams;
 const ticker = searchParams.get('ticker');
 const limit = searchParams.get('limit') || '20';
 const offset = searchParams.get('offset') || '0';
 const category = searchParams.get('category'); // earnings, mergers, etc.
 const sort = searchParams.get('sort') || 'published_utc';
 
 // Build the Polygon News API URL
 let url = `https://api.polygon.io/v2/reference/news?`;
 
 // Map categories to keywords for filtering
 const categoryKeywords: { [key: string]: string } = {
 'breaking': 'breaking alert urgent flash emergency halt suspend crash surge spike trump tariff tariffs china trade war politics election fed reserve interest rates inflation',
 'earnings': 'earnings revenue profit loss guidance forecast',
 'ma': 'merger acquisition buyout takeover deal',
 'ipo': 'IPO initial public offering debut listing',
 'analyst': 'analyst rating upgrade downgrade target price',
 'regulatory': 'SEC FDA regulatory approval investigation lawsuit'
 };
 
 // Add parameters
 const params = new URLSearchParams({
 apikey: POLYGON_API_KEY,
 limit: category && category !== 'all' ? '100' : limit, // Get more results for filtering
 order: 'desc',
 sort,
 ...(ticker && { ticker: ticker.toUpperCase() }),
 });
 
 // Add date filtering - expand timeframe to capture more breaking news
 const timeframeHours = category === 'breaking' ? 72 : category === 'all' ? 48 : 168; // Last 72h for breaking, 48h for all news, 7 days for categories 
 const timeAgo = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
 const dateFilter = timeAgo.toISOString();
 params.append('published_utc.gte', dateFilter);
 
 url += params.toString();
 
 console.log(` Fetching news from Polygon API: ${url.replace(POLYGON_API_KEY, '[HIDDEN]')}`);
 
 const response = await fetch(url, {
 headers: {
 'Accept': 'application/json',
 'User-Agent': 'Bloomberg-Terminal/1.0'
 }
 });
 
 if (!response.ok) {
 throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
 }
 
 const data: NewsResponse = await response.json();
 
 // Enhance news articles with sentiment analysis and relevance scoring
 const enhancedArticles = data.results.map(article => ({
 ...article,
 sentiment: analyzeSentiment(article.title, article.description),
 sentiment_score: calculateSentimentScore(article.title, article.description),
 relevance_score: calculateRelevanceScore(article, ticker),
 time_ago: getTimeAgo(article.published_utc),
 category: categorizeNews(article),
 urgency: calculateUrgency(article)
 }));
 
 // Quality filter - remove blacklisted publishers and low-urgency "crab" articles
 const qualityFilteredArticles = enhancedArticles.filter(article => {
 const publisher = article.publisher?.name?.toLowerCase() || '';
 
 // COMPLETE BLACKLIST - Zero tolerance for these publishers
 const blacklistedPublishers = [
 'motley fool',
 'fool',
 'the motley fool'
 ];
 
 // Block ALL articles from blacklisted publishers
 const isBlacklisted = blacklistedPublishers.some(pub => publisher.includes(pub));
 if (isBlacklisted) {
 console.log(` Blocked article from ${article.publisher?.name}: ${article.title}`);
 return false;
 }
 
 // For remaining publishers, apply quality filters
 const title = article.title.toLowerCase();
 
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
 /stock.*volatile/i
 ];
 
 // Skip low-value content if urgency is very low
 if (article.urgency < 0.3) {
 const isLowValue = lowValuePatterns.some(pattern => pattern.test(title));
 if (isLowValue) return false;
 }
 
 return true;
 });
 
 // Filter by category if specified
 let filteredArticles = qualityFilteredArticles;
 if (category && category !== 'all') {
 if (category === 'breaking') {
 // For breaking news, filter by medium-high urgency (≥ 0.4) and recent timing to capture more political/economic news
 filteredArticles = qualityFilteredArticles.filter(article => {
 const hoursAgo = (Date.now() - new Date(article.published_utc).getTime()) / (1000 * 60 * 60);
 return article.urgency >= 0.4 || hoursAgo < 4; // Medium-high urgency OR recent (4 hours)
 });
 } else if (categoryKeywords[category]) {
 const keywords = categoryKeywords[category].toLowerCase().split(' ');
 filteredArticles = qualityFilteredArticles.filter(article => {
 const searchText = `${article.title} ${article.description}`.toLowerCase();
 return keywords.some(keyword => searchText.includes(keyword));
 });
 }
 }
 
 // Sort by relevance and recency
 const sortedArticles = filteredArticles.sort((a, b) => {
 // Primary sort by urgency (breaking news first)
 if (a.urgency !== b.urgency) {
 return b.urgency - a.urgency;
 }
 // Secondary sort by relevance score
 if (a.relevance_score !== b.relevance_score) {
 return (b.relevance_score || 0) - (a.relevance_score || 0);
 }
 // Tertiary sort by published date
 return new Date(b.published_utc).getTime() - new Date(a.published_utc).getTime();
 });
 
 // Fetch additional social/RSS news for market-moving events
 let socialArticles: any[] = [];
 // Always include RSS feeds for macro economic news that affects all stocks
 // Only skip for very specific categories like earnings or analyst reports
 const skipRSSCategories = ['earnings', 'analyst', 'ma', 'ipo'];
 if (!category || !skipRSSCategories.includes(category)) {
 try {
 console.log(' Fetching social news for category:', category);
 const socialResponse = await fetch(`${process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000'}/api/news/social?category=${category}&limit=${Math.ceil(parseInt(limit) / 2)}`);
 if (socialResponse.ok) {
 const socialData = await socialResponse.json();
 console.log(' Social data received:', socialData.count, 'articles');
 if (socialData.success) {
 socialArticles = socialData.articles.map((article: any) => ({
 ...article,
 sentiment: 'neutral',
 sentiment_score: 0.5,
 relevance_score: article.urgency,
 category: article.category
 }));
 console.log(' Social articles processed:', socialArticles.length);
 }
 } else {
 console.log(' Social response not OK:', socialResponse.status);
 }
 } catch (error) {
 console.log('Social news fetch error:', error);
 }
 }
 
 // Combine and sort all articles
 console.log(' Combining articles - Polygon:', sortedArticles.length, 'Social:', socialArticles.length);
 const combinedArticles = [...sortedArticles, ...socialArticles];
 console.log(' Combined total:', combinedArticles.length);
 
 const finalSorted = combinedArticles.sort((a, b) => {
 if (a.urgency !== b.urgency) return b.urgency - a.urgency;
 return new Date(b.published_utc).getTime() - new Date(a.published_utc).getTime();
 });
 
 // Limit results to requested amount
 const finalArticles = finalSorted.slice(0, parseInt(limit));
 console.log(' Final articles returned:', finalArticles.length, 'of', combinedArticles.length);
 
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
 category: category || 'all'
 },
 news_sources: ['GlobeNewswire Inc.', 'The Motley Fool'],
 coverage: 'Corporate announcements, earnings, M&A, IPOs, analyst reports',
 limitations: 'Political/economic news (Trump tariffs, Fed policy) may require Reuters, Bloomberg, or CNBC',
 note: category === 'breaking' ? 'Breaking news filtered for high-impact corporate stories. Major political/economic events may not appear.' : undefined
 }
 });
 
 } catch (error) {
 console.error('News API Error:', error);
 return NextResponse.json({
 success: false,
 error: 'Failed to fetch news',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { status: 500 });
 }
}

// Sentiment Analysis Function
function analyzeSentiment(title: string, description?: string): 'positive' | 'negative' | 'neutral' {
 const text = `${title} ${description || ''}`.toLowerCase();
 
 const positiveWords = [
 'surge', 'soar', 'rally', 'gain', 'rise', 'jump', 'climb', 'boost', 'strong', 'beat',
 'exceed', 'outperform', 'bull', 'bullish', 'upgrade', 'buy', 'growth', 'profit',
 'revenue', 'earnings beat', 'positive', 'optimistic', 'breakthrough', 'success'
 ];
 
 const negativeWords = [
 'plunge', 'crash', 'fall', 'drop', 'decline', 'sink', 'tumble', 'weak', 'miss',
 'underperform', 'bear', 'bearish', 'downgrade', 'sell', 'loss', 'deficit',
 'earnings miss', 'negative', 'concern', 'risk', 'warning', 'cut', 'reduce'
 ];
 
 let positiveScore = 0;
 let negativeScore = 0;
 
 positiveWords.forEach(word => {
 if (text.includes(word)) positiveScore++;
 });
 
 negativeWords.forEach(word => {
 if (text.includes(word)) negativeScore++;
 });
 
 if (positiveScore > negativeScore) return 'positive';
 if (negativeScore > positiveScore) return 'negative';
 return 'neutral';
}

// Calculate Sentiment Score (-1 to 1)
function calculateSentimentScore(title: string, description?: string): number {
 const sentiment = analyzeSentiment(title, description);
 const text = `${title} ${description || ''}`.toLowerCase();
 
 // Base score from sentiment
 let score = sentiment === 'positive' ? 0.3 : sentiment === 'negative' ? -0.3 : 0;
 
 // Intensity modifiers
 const intensityWords = {
 'massive': 0.4, 'huge': 0.3, 'significant': 0.2, 'major': 0.2,
 'slight': 0.1, 'minor': 0.1, 'crash': -0.5, 'plunge': -0.4,
 'soar': 0.4, 'surge': 0.4, 'rally': 0.3
 };
 
 Object.entries(intensityWords).forEach(([word, modifier]) => {
 if (text.includes(word)) {
 score += modifier;
 }
 });
 
 return Math.max(-1, Math.min(1, score));
}

// Calculate Relevance Score for specific ticker
function calculateRelevanceScore(article: NewsArticle, ticker?: string | null): number {
 if (!ticker) return 0.5; // Default relevance for general news
 
 let score = 0;
 
 // Direct ticker mention
 if (article.tickers.includes(ticker.toUpperCase())) {
 score += 1.0;
 }
 
 // Title mentions company/ticker
 const titleLower = article.title.toLowerCase();
 if (titleLower.includes(ticker.toLowerCase())) {
 score += 0.8;
 }
 
 // Keywords relevance
 const relevantKeywords = ['earnings', 'revenue', 'profit', 'merger', 'acquisition', 'ipo'];
 article.keywords.forEach(keyword => {
 if (relevantKeywords.includes(keyword.toLowerCase())) {
 score += 0.2;
 }
 });
 
 return Math.min(1, score);
}

// Time ago helper
function getTimeAgo(publishedUtc: string): string {
 const now = new Date();
 const published = new Date(publishedUtc);
 const diffMs = now.getTime() - published.getTime();
 const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
 const diffMinutes = Math.floor(diffMs / (1000 * 60));
 
 if (diffMinutes < 60) return `${diffMinutes}m ago`;
 if (diffHours < 24) return `${diffHours}h ago`;
 const diffDays = Math.floor(diffHours / 24);
 return `${diffDays}d ago`;
}

// Categorize news articles
function categorizeNews(article: NewsArticle): string {
 const title = article.title.toLowerCase();
 const keywords = article.keywords.map(k => k.toLowerCase());
 
 if (keywords.includes('earnings') || title.includes('earnings') || title.includes('q1') || title.includes('q2') || title.includes('q3') || title.includes('q4')) {
 return 'earnings';
 }
 if (keywords.includes('merger') || keywords.includes('acquisition') || title.includes('merger') || title.includes('acquisition')) {
 return 'ma'; // Mergers & Acquisitions
 }
 if (keywords.includes('ipo') || title.includes('ipo') || title.includes('public offering')) {
 return 'ipo';
 }
 if (title.includes('fda') || title.includes('approval') || keywords.includes('regulatory')) {
 return 'regulatory';
 }
 if (keywords.includes('analyst') || title.includes('upgrade') || title.includes('downgrade') || title.includes('price target')) {
 return 'analyst';
 }
 return 'general';
}

// Calculate news urgency (0-1)
function calculateUrgency(article: NewsArticle): number {
 const title = article.title.toLowerCase();
 const description = article.description?.toLowerCase() || '';
 const content = `${title} ${description}`;
 const publishedTime = new Date(article.published_utc);
 const hoursAgo = (Date.now() - publishedTime.getTime()) / (1000 * 60 * 60);
 const minutesAgo = (Date.now() - publishedTime.getTime()) / (1000 * 60);
 
 let urgency = 0;
 
 // BREAKING NEWS indicators (highest priority)
 if (/breaking|alert|urgent|flash|live|now/i.test(content)) urgency += 0.9;
 if (/halt|suspend|stop|emergency|crisis/i.test(content)) urgency += 0.95;
 if (/crash|plunge|surge|spike|soar/i.test(content)) urgency += 0.8;
 
 // Major market events
 if (/earnings|revenue|profit|loss/i.test(content) && hoursAgo < 4) urgency += 0.7;
 if (/merger|acquisition|buyout|takeover/i.test(content)) urgency += 0.6;
 if (/fda approval|drug approval|clinical trial/i.test(content)) urgency += 0.75;
 if (/rate cut|rate hike|fed|federal reserve/i.test(content)) urgency += 0.8;
 if (/bankruptcy|default|liquidation/i.test(content)) urgency += 0.85;
 
 // Political and trade news affecting markets
 if (/trump|biden|election|political|politics/i.test(content)) urgency += 0.75;
 if (/tariff|tariffs|trade war|china trade|trade deal/i.test(content)) urgency += 0.85;
 if (/sanctions|embargo|trade restrictions/i.test(content)) urgency += 0.8;
 if (/inflation|cpi|ppi|unemployment|jobs report/i.test(content)) urgency += 0.7;
 
 // Executive changes and major announcements
 if (/ceo|cfo|resignation|fired|appointed|new leadership/i.test(content)) urgency += 0.6;
 if (/stock split|dividend|buyback/i.test(content)) urgency += 0.5;
 if (/guidance|forecast|outlook/i.test(content) && hoursAgo < 6) urgency += 0.55;
 
 // Regulatory and legal
 if (/sec|investigation|lawsuit|settlement|fine/i.test(content)) urgency += 0.65;
 if (/recall|safety|warning/i.test(content)) urgency += 0.7;
 
 // Time-based urgency (breaking news effect)
 if (minutesAgo < 30) urgency += 0.4; // Last 30 minutes
 else if (hoursAgo < 1) urgency += 0.35; // Last hour
 else if (hoursAgo < 2) urgency += 0.3; // Last 2 hours
 else if (hoursAgo < 6) urgency += 0.2; // Last 6 hours
 else if (hoursAgo < 12) urgency += 0.15; // Last 12 hours
 else if (hoursAgo < 24) urgency += 0.1; // Last day
 
 // Major tickers boost urgency
 const majorTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'SPY', 'QQQ'];
 if (article.tickers.some(ticker => majorTickers.includes(ticker))) urgency += 0.2;
 
 return Math.min(1, urgency);
}