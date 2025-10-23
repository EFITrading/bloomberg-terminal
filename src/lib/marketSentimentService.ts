interface SentimentAnalysis {
 overall_sentiment: 'bullish' | 'bearish' | 'neutral';
 sentiment_score: number; // -1 to 1
 confidence_level: number; // 0 to 1
 market_moving_events: MarketEvent[];
 sector_sentiment: { [sector: string]: SectorSentiment };
 trending_topics: TrendingTopic[];
}

interface MarketEvent {
 type: 'earnings' | 'merger' | 'regulatory' | 'analyst_upgrade' | 'analyst_downgrade';
 ticker: string;
 title: string;
 sentiment_impact: number;
 urgency: number;
 published_time: string;
 estimated_price_impact: number; // percentage
}

interface SectorSentiment {
 sector: string;
 sentiment_score: number;
 article_count: number;
 key_drivers: string[];
}

interface TrendingTopic {
 keyword: string;
 mentions: number;
 sentiment_score: number;
 related_tickers: string[];
}

class MarketSentimentService {
 private static instance: MarketSentimentService;

 public static getInstance(): MarketSentimentService {
 if (!MarketSentimentService.instance) {
 MarketSentimentService.instance = new MarketSentimentService();
 }
 return MarketSentimentService.instance;
 }

 async analyzeSentiment(timeframe: '1h' | '4h' | '1d' | '1w' = '1d'): Promise<SentimentAnalysis> {
 try {
 // Fetch recent news for analysis
 const baseUrl = process.env.NODE_ENV === 'production' 
 ? 'https://your-domain.com' 
 : 'http://localhost:3000';
 const newsResponse = await fetch(`${baseUrl}/api/news?limit=100`);
 const newsData = await newsResponse.json();

 if (!newsData.success || !newsData.articles) {
 throw new Error('Failed to fetch news for sentiment analysis');
 }

 const articles = newsData.articles;
 
 // Calculate overall market sentiment
 const overallSentiment = this.calculateOverallSentiment(articles);
 
 // Identify market-moving events
 const marketEvents = this.identifyMarketEvents(articles);
 
 // Analyze sector sentiment
 const sectorSentiment = this.analyzeSectorSentiment(articles);
 
 // Find trending topics
 const trendingTopics = this.findTrendingTopics(articles);

 return {
 overall_sentiment: overallSentiment.sentiment,
 sentiment_score: overallSentiment.score,
 confidence_level: overallSentiment.confidence,
 market_moving_events: marketEvents,
 sector_sentiment: sectorSentiment,
 trending_topics: trendingTopics
 };

 } catch (error) {
 console.error('Sentiment analysis failed:', error);
 throw error;
 }
 }

 private calculateOverallSentiment(articles: any[]): { sentiment: 'bullish' | 'bearish' | 'neutral', score: number, confidence: number } {
 if (!articles.length) return { sentiment: 'neutral', score: 0, confidence: 0 };

 // Weight articles by urgency and relevance
 let weightedSentimentSum = 0;
 let totalWeight = 0;

 articles.forEach(article => {
 const weight = (article.urgency || 0.5) * (article.relevance_score || 0.5);
 weightedSentimentSum += (article.sentiment_score || 0) * weight;
 totalWeight += weight;
 });

 const avgSentiment = totalWeight > 0 ? weightedSentimentSum / totalWeight : 0;
 
 // Calculate confidence based on sample size and agreement
 const confidence = Math.min(1, articles.length / 20) * 0.8; // More articles = higher confidence

 let sentiment: 'bullish' | 'bearish' | 'neutral';
 if (avgSentiment > 0.1) sentiment = 'bullish';
 else if (avgSentiment < -0.1) sentiment = 'bearish';
 else sentiment = 'neutral';

 return {
 sentiment,
 score: avgSentiment,
 confidence
 };
 }

 private identifyMarketEvents(articles: any[]): MarketEvent[] {
 const events: MarketEvent[] = [];

 articles.forEach(article => {
 const title = article.title.toLowerCase();
 const urgency = article.urgency || 0;
 
 // Only consider high-urgency articles as market events
 if (urgency < 0.4) return;

 let eventType: MarketEvent['type'] = 'earnings';
 let estimatedImpact = Math.abs(article.sentiment_score || 0) * urgency * 5; // rough percentage estimate

 // Categorize event type
 if (title.includes('earnings') || title.includes('quarter')) {
 eventType = 'earnings';
 } else if (title.includes('merger') || title.includes('acquisition')) {
 eventType = 'merger';
 estimatedImpact *= 1.5; // M&A typically has higher impact
 } else if (title.includes('fda') || title.includes('approval') || title.includes('regulatory')) {
 eventType = 'regulatory';
 estimatedImpact *= 1.3;
 } else if (title.includes('upgrade') || title.includes('price target')) {
 eventType = article.sentiment_score > 0 ? 'analyst_upgrade' : 'analyst_downgrade';
 estimatedImpact *= 0.7; // analyst events typically have lower immediate impact
 }

 // Only include events with potential meaningful impact
 if (estimatedImpact >= 1.0) {
 events.push({
 type: eventType,
 ticker: article.tickers?.[0] || 'MARKET',
 title: article.title,
 sentiment_impact: article.sentiment_score || 0,
 urgency: urgency,
 published_time: article.published_utc,
 estimated_price_impact: Math.min(20, estimatedImpact) // Cap at 20%
 });
 }
 });

 // Sort by urgency and potential impact
 return events
 .sort((a, b) => (b.urgency * Math.abs(b.estimated_price_impact)) - (a.urgency * Math.abs(a.estimated_price_impact)))
 .slice(0, 10); // Top 10 events
 }

 private analyzeSectorSentiment(articles: any[]): { [sector: string]: SectorSentiment } {
 const sectorMap: { [ticker: string]: string } = {
 // Technology
 'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'META': 'Technology',
 'NVDA': 'Technology', 'TSLA': 'Technology', 'NFLX': 'Technology', 'CRM': 'Technology',
 
 // Finance
 'JPM': 'Financials', 'BAC': 'Financials', 'WFC': 'Financials', 'GS': 'Financials',
 'MS': 'Financials', 'C': 'Financials', 'BLK': 'Financials',
 
 // Healthcare
 'JNJ': 'Healthcare', 'UNH': 'Healthcare', 'PFE': 'Healthcare', 'ABBV': 'Healthcare',
 'MRK': 'Healthcare', 'TMO': 'Healthcare', 'DHR': 'Healthcare',
 
 // Energy
 'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'EOG': 'Energy',
 
 // Consumer
 'AMZN': 'Consumer Discretionary', 'HD': 'Consumer Discretionary', 'MCD': 'Consumer Discretionary',
 'PG': 'Consumer Staples', 'KO': 'Consumer Staples', 'WMT': 'Consumer Staples'
 };

 const sectorData: { [sector: string]: { articles: any[], sentimentSum: number, count: number, keywords: Set<string> } } = {};

 articles.forEach(article => {
 article.tickers?.forEach((ticker: string) => {
 const sector = sectorMap[ticker] || 'Other';
 
 if (!sectorData[sector]) {
 sectorData[sector] = { articles: [], sentimentSum: 0, count: 0, keywords: new Set() };
 }
 
 sectorData[sector].articles.push(article);
 sectorData[sector].sentimentSum += article.sentiment_score || 0;
 sectorData[sector].count += 1;
 
 // Extract keywords for key drivers
 article.keywords?.forEach((keyword: string) => {
 sectorData[sector].keywords.add(keyword);
 });
 });
 });

 const result: { [sector: string]: SectorSentiment } = {};
 
 Object.entries(sectorData).forEach(([sector, data]) => {
 result[sector] = {
 sector,
 sentiment_score: data.count > 0 ? data.sentimentSum / data.count : 0,
 article_count: data.count,
 key_drivers: Array.from(data.keywords).slice(0, 5) // Top 5 keywords
 };
 });

 return result;
 }

 private findTrendingTopics(articles: any[]): TrendingTopic[] {
 const topicMap: { [keyword: string]: { mentions: number, sentimentSum: number, tickers: Set<string> } } = {};

 articles.forEach(article => {
 const keywords = [
 ...(article.keywords || []),
 ...this.extractKeywordsFromTitle(article.title)
 ];

 keywords.forEach(keyword => {
 const normalizedKeyword = keyword.toLowerCase().trim();
 if (normalizedKeyword.length < 3) return; // Skip short keywords

 if (!topicMap[normalizedKeyword]) {
 topicMap[normalizedKeyword] = { mentions: 0, sentimentSum: 0, tickers: new Set() };
 }

 topicMap[normalizedKeyword].mentions += 1;
 topicMap[normalizedKeyword].sentimentSum += article.sentiment_score || 0;
 
 article.tickers?.forEach((ticker: string) => {
 topicMap[normalizedKeyword].tickers.add(ticker);
 });
 });
 });

 // Convert to trending topics and sort by mentions
 const trendingTopics: TrendingTopic[] = Object.entries(topicMap)
 .filter(([_, data]) => data.mentions >= 3) // Only topics mentioned 3+ times
 .map(([keyword, data]) => ({
 keyword,
 mentions: data.mentions,
 sentiment_score: data.mentions > 0 ? data.sentimentSum / data.mentions : 0,
 related_tickers: Array.from(data.tickers).slice(0, 5)
 }))
 .sort((a, b) => b.mentions - a.mentions)
 .slice(0, 10); // Top 10 trending topics

 return trendingTopics;
 }

 private extractKeywordsFromTitle(title: string): string[] {
 const commonWords = new Set([
 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 
 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 
 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'stock', 'stocks',
 'shares', 'share', 'company', 'companies', 'market', 'markets'
 ]);

 return title
 .toLowerCase()
 .replace(/[^\w\s]/g, ' ') // Remove punctuation
 .split(/\s+/)
 .filter(word => word.length >= 3 && !commonWords.has(word))
 .slice(0, 5); // Max 5 keywords per title
 }
}

export default MarketSentimentService;
export type { SentimentAnalysis, MarketEvent, SectorSentiment, TrendingTopic };