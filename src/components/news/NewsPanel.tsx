import React, { useState, useEffect, useCallback } from 'react';
import { 
  TbSearch, 
  TbFilter, 
  TbRefresh, 
  TbExternalLink, 
  TbTrendingUp, 
  TbTrendingDown, 
  TbClock,
  TbBolt,
  TbChevronDown,
  TbChevronUp,
  TbStar,
  TbStarFilled,
  TbChartBar,
  TbFlame,
  TbTarget,
  TbX
} from 'react-icons/tb';

interface NewsArticle {
  id: string;
  title: string;
  description: string;
  publisher: {
    name: string;
    homepage_url: string;
    logo_url?: string;
    favicon_url?: string;
  };
  published_utc: string;
  article_url: string;
  tickers: string[];
  image_url?: string;
  author?: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentiment_score: number;
  relevance_score: number;
  time_ago: string;
  category: string;
  urgency: number;
}

interface NewsResponse {
  success: boolean;
  articles: NewsArticle[];
  count: number;
  error?: string;
  metadata: {
    ticker: string;
    limit: number;
    total_available: number;
    filters_applied: {
      date_range: string;
      sort_by: string;
      category: string;
    };
  };
}

interface MarketSentiment {
  overall_sentiment: 'bullish' | 'bearish' | 'neutral';
  sentiment_score: number;
  confidence_level: number;
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
  estimated_price_impact: number;
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

interface NewsTabProps {
  symbol?: string;
}

const NewsPanel: React.FC<NewsTabProps> = ({ symbol = '' }) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTicker, setSearchTicker] = useState(symbol);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [marketSentiment, setMarketSentiment] = useState<MarketSentiment | null>(null);
  const [showSentimentPanel, setShowSentimentPanel] = useState(true);

  const categories = [
    { id: 'all', label: 'All News', icon: TbBolt },
    { id: 'breaking', label: 'Breaking', icon: TbFlame },
    { id: 'earnings', label: 'Earnings', icon: TbTrendingUp },
    { id: 'ma', label: 'M&A', icon: TbStar },
    { id: 'analyst', label: 'Analyst', icon: TbChartBar }
  ];

  const fetchNews = useCallback(async (ticker?: string, category?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        limit: '50',
        ...(ticker && ticker.trim() && { ticker: ticker.trim().toUpperCase() }),
        ...(category && category !== 'all' && { category }),
        _t: Date.now().toString() // Cache busting parameter
      });

      console.log('🔄 Fetching news with params:', params.toString());
      const response = await fetch(`/api/news?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      const data: NewsResponse = await response.json();
      console.log('📰 News response:', data);

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch news');
      }

      setArticles(data.articles);
      setLastRefresh(new Date());
      
      // Fetch market sentiment analysis
      fetchMarketSentiment();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load news');
      console.error('News fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMarketSentiment = useCallback(async () => {
    try {
      const response = await fetch('/api/market-sentiment');
      const data = await response.json();
      
      if (data.success) {
        setMarketSentiment(data.sentiment_analysis);
      }
    } catch (err) {
      console.error('Sentiment fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchNews(searchTicker, selectedCategory);
  }, [fetchNews, searchTicker, selectedCategory]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchNews(searchTicker, selectedCategory);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchNews, searchTicker, selectedCategory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNews(searchTicker, selectedCategory);
  };

  const toggleExpanded = (articleId: string) => {
    const newExpanded = new Set(expandedArticles);
    if (newExpanded.has(articleId)) {
      newExpanded.delete(articleId);
    } else {
      newExpanded.add(articleId);
    }
    setExpandedArticles(newExpanded);
  };

  const toggleFavorite = (articleId: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(articleId)) {
      newFavorites.delete(articleId);
    } else {
      newFavorites.add(articleId);
    }
    setFavorites(newFavorites);
  };

  const getSentimentColor = (sentiment: string, score: number) => {
    if (sentiment === 'positive') return 'text-green-400';
    if (sentiment === 'negative') return 'text-red-400';
    return 'text-gray-400';
  };

  const getSentimentIcon = (sentiment: string) => {
    if (sentiment === 'positive') return <TbTrendingUp className="w-4 h-4" />;
    if (sentiment === 'negative') return <TbTrendingDown className="w-4 h-4" />;
    return <div className="w-4 h-4 rounded-full bg-gray-500"></div>;
  };

  const getUrgencyIndicator = (urgency: number) => {
    if (urgency >= 0.7) return (
      <div className="flex items-center justify-center w-6 h-6 bg-red-900/50 border border-red-500 rounded-full">
        <TbFlame className="w-3 h-3 text-red-400 animate-pulse" />
      </div>
    );
    if (urgency >= 0.4) return (
      <div className="flex items-center justify-center w-6 h-6 bg-orange-900/50 border border-orange-500 rounded-full">
        <TbBolt className="w-3 h-3 text-orange-400" />
      </div>
    );
    return (
      <div className="flex items-center justify-center w-6 h-6 bg-gray-900 border border-gray-600 rounded-full">
        <div className="w-2 h-2 rounded-full bg-gray-500"></div>
      </div>
    );
  };

  const getCategoryBadgeColor = (category: string) => {
    const colors: { [key: string]: string } = {
      breaking: 'bg-red-900/70 text-red-200 border-red-400/70 animate-pulse',
      earnings: 'bg-emerald-900/50 text-emerald-300 border-emerald-500/50',
      ma: 'bg-purple-900/50 text-purple-300 border-purple-500/50',
      ipo: 'bg-blue-900/50 text-blue-300 border-blue-500/50',
      analyst: 'bg-orange-900/50 text-orange-300 border-orange-500/50',
      regulatory: 'bg-red-900/50 text-red-300 border-red-500/50',
      general: 'bg-gray-900/50 text-gray-300 border-gray-500/50'
    };
    return colors[category] || colors.general;
  };

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header */}
      <div className="p-6 border-b border-gray-800 bg-black">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
              <TbBolt className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Market News</h2>
              <p className="text-sm text-orange-400 font-medium">Real-time Financial Intelligence</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 bg-black rounded-lg border border-gray-700">
                <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-orange-400 font-bold tracking-wide">LIVE</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 bg-black rounded-lg border border-gray-700">
              <TbClock className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-gray-300 font-mono">{lastRefresh.toLocaleTimeString()}</span>
            </div>
            <button
              onClick={() => fetchNews(searchTicker, selectedCategory)}
              className="flex items-center justify-center w-10 h-10 bg-black hover:bg-gray-900 rounded-xl border border-gray-700 hover:border-orange-500 transition-all duration-200 group"
              title="Refresh News Feed"
            >
              <TbRefresh className={`w-5 h-5 text-gray-400 group-hover:text-orange-400 transition-colors ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Category Filters and Search Bar */}
        <div className="space-y-4">
          {/* First Row - 3 buttons */}
          <div className="grid grid-cols-3 gap-3">
            {categories.slice(0, 3).map((cat) => {
              const IconComponent = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                    isActive
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-black shadow-lg shadow-orange-500/30 border border-orange-400'
                      : 'bg-black text-gray-300 hover:bg-gray-900 hover:text-white border border-gray-700 hover:border-orange-500/50'
                  }`}
                >
                  <IconComponent className={`w-4 h-4 ${isActive ? 'text-black' : 'text-orange-400'}`} />
                  <span className="tracking-wide">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Second Row - 2 buttons + Search Bar */}
          <div className="flex items-center gap-3">
            <div className="flex gap-3">
              {categories.slice(3, 5).map((cat) => {
                const IconComponent = cat.icon;
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                      isActive
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-black shadow-lg shadow-orange-500/30 border border-orange-400'
                        : 'bg-black text-gray-300 hover:bg-gray-900 hover:text-white border border-gray-700 hover:border-orange-500/50'
                    }`}
                  >
                    <IconComponent className={`w-4 h-4 ${isActive ? 'text-black' : 'text-orange-400'}`} />
                    <span className="tracking-wide">{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex-1">
              <div className="flex items-center bg-black border border-gray-700 rounded-xl focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 transition-all duration-200">
                <div className="pl-4 pr-2">
                  <TbSearch className="text-orange-400 w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={searchTicker}
                  onChange={(e) => setSearchTicker(e.target.value)}
                  placeholder="Enter ticker symbols: AAPL, MSFT, TSLA..."
                  className="flex-1 px-2 py-3 bg-transparent text-white placeholder-gray-500 focus:outline-none font-mono text-sm tracking-wide"
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Market Sentiment Panel */}
      {marketSentiment && showSentimentPanel && (
        <div className="border-b border-gray-800 bg-black">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg">
                  <TbChartBar className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">Market Sentiment</h3>
              </div>
              <button
                onClick={() => setShowSentimentPanel(false)}
                className="flex items-center justify-center w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 hover:border-gray-600 transition-all duration-200"
              >
                <TbX className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3">
              {/* Overall Sentiment */}
              <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Overall</span>
                  <div className={`flex items-center gap-1 ${
                    marketSentiment.overall_sentiment === 'bullish' 
                      ? 'text-green-400' 
                      : marketSentiment.overall_sentiment === 'bearish' 
                      ? 'text-red-400' 
                      : 'text-gray-400'
                  }`}>
                    {marketSentiment.overall_sentiment === 'bullish' ? (
                      <TbTrendingUp className="w-3 h-3" />
                    ) : marketSentiment.overall_sentiment === 'bearish' ? (
                      <TbTrendingDown className="w-3 h-3" />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                    )}
                    <span className="text-xs font-medium capitalize">
                      {marketSentiment.overall_sentiment}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      marketSentiment.sentiment_score > 0 ? 'bg-green-400' : 'bg-red-400'
                    }`}
                    style={{ 
                      width: `${Math.abs(marketSentiment.sentiment_score) * 100}%`,
                      marginLeft: marketSentiment.sentiment_score < 0 ? `${100 - Math.abs(marketSentiment.sentiment_score) * 100}%` : '0'
                    }}
                  ></div>
                </div>
              </div>

              {/* Confidence */}
              <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Confidence</span>
                  <span className="text-xs font-medium text-blue-400">
                    {(marketSentiment.confidence_level * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div 
                    className="h-1.5 rounded-full bg-blue-400 transition-all duration-300"
                    style={{ width: `${marketSentiment.confidence_level * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Trending Topics */}
            {marketSentiment.trending_topics.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <TbFlame className="w-3 h-3 text-orange-400" />
                  <span className="text-xs font-medium text-gray-300">Trending Topics</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {marketSentiment.trending_topics.slice(0, 6).map((topic) => (
                    <span
                      key={topic.keyword}
                      className={`px-2 py-1 rounded text-xs ${
                        topic.sentiment_score > 0.1 
                          ? 'bg-green-500/20 text-green-400' 
                          : topic.sentiment_score < -0.1 
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                      title={`${topic.mentions} mentions • ${topic.related_tickers.join(', ')}`}
                    >
                      {topic.keyword} ({topic.mentions})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Market Events */}
            {marketSentiment.market_moving_events.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TbTarget className="w-3 h-3 text-yellow-400" />
                  <span className="text-xs font-medium text-gray-300">Market Events</span>
                </div>
                <div className="space-y-1">
                  {marketSentiment.market_moving_events.slice(0, 3).map((event, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-900/50 rounded px-2 py-1 border border-gray-800">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                          {event.ticker}
                        </span>
                        <span className="text-xs text-gray-300 truncate">
                          {event.title.slice(0, 40)}...
                        </span>
                      </div>
                      <div className={`text-xs font-medium ${
                        event.estimated_price_impact > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {event.estimated_price_impact > 0 ? '+' : ''}{event.estimated_price_impact.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-black">
        {loading && articles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="flex items-center justify-center w-16 h-16 bg-gray-900 rounded-xl mb-4 border border-gray-800">
                <TbRefresh className="w-8 h-8 text-orange-400 animate-spin" />
              </div>
              <p className="text-white font-semibold mb-1">Loading Financial News...</p>
              <p className="text-gray-400 text-sm">Fetching real-time market data</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="flex items-center justify-center w-16 h-16 bg-red-900/50 rounded-xl mb-4 border border-red-800">
                <TbX className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-white font-bold mb-2">Connection Error</h3>
              <p className="text-red-400 mb-1">Failed to load market news</p>
              <p className="text-gray-400 text-sm mb-6">{error}</p>
              <button
                onClick={() => fetchNews(searchTicker, selectedCategory)}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl text-white font-semibold transition-all duration-200 shadow-lg"
              >
                Retry Connection
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {articles.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <div className="flex items-center justify-center w-16 h-16 bg-gray-900 rounded-xl mb-4 border border-gray-800">
                    <TbSearch className="w-8 h-8 text-orange-400" />
                  </div>
                  <h3 className="text-white font-bold mb-2">No Results Found</h3>
                  <p className="text-gray-400 mb-1">No news articles match your criteria</p>
                  <p className="text-gray-500 text-sm">Try adjusting your search terms or category filter</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-6">
                {articles.map((article) => (
                  <div
                    key={article.id}
                    className="bg-gradient-to-br from-gray-900 to-black rounded-xl border border-gray-800 hover:border-orange-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10 group"
                  >
                    <div className="p-6">
                      {/* Article Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          {getUrgencyIndicator(article.urgency)}
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide border ${getCategoryBadgeColor(article.category)}`}>
                            {article.category.toUpperCase()}
                          </span>
                          {article.tickers.length > 0 && (
                            <div className="flex gap-2">
                              {article.tickers.slice(0, 3).map((ticker) => (
                                <span key={ticker} className="px-3 py-1.5 bg-orange-500/20 text-orange-300 rounded-lg text-xs font-bold tracking-wider border border-orange-500/30">
                                  {ticker}
                                </span>
                              ))}
                              {article.tickers.length > 3 && (
                                <span className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs font-bold border border-gray-700">
                                  +{article.tickers.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleFavorite(article.id)}
                          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 hover:border-orange-500/50 transition-all duration-200 group-hover:border-orange-500/30"
                        >
                          {favorites.has(article.id) ? (
                            <TbStarFilled className="w-4 h-4 text-orange-400" />
                          ) : (
                            <TbStar className="w-4 h-4 text-gray-400 hover:text-orange-400" />
                          )}
                        </button>
                      </div>

                      {/* Title */}
                      <h3 className="text-white font-bold mb-3 line-clamp-2 leading-tight text-lg group-hover:text-orange-50 transition-colors">
                        {article.title}
                      </h3>

                      {/* Description */}
                      {expandedArticles.has(article.id) && article.description && (
                        <p className="text-gray-300 text-sm mb-3 leading-relaxed">
                          {article.description}
                        </p>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <div className="flex items-center gap-1">
                            <TbClock className="w-3 h-3" />
                            {article.time_ago}
                          </div>
                          <span>•</span>
                          <span>{article.publisher.name}</span>
                          <div className={`flex items-center gap-1 ${getSentimentColor(article.sentiment, article.sentiment_score)}`}>
                            {getSentimentIcon(article.sentiment)}
                            <span>{article.sentiment}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {article.description && (
                            <button
                              onClick={() => toggleExpanded(article.id)}
                              className="text-gray-400 hover:text-white transition-colors"
                            >
                              {expandedArticles.has(article.id) ? (
                                <TbChevronUp className="w-4 h-4" />
                              ) : (
                                <TbChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          <a
                            href={article.article_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                            title="Read full article"
                          >
                            <TbExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsPanel;