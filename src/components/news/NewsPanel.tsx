import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
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
    onClose?: () => void;
}

const NewsPanel: React.FC<NewsTabProps> = ({ symbol = '', onClose }) => {
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

    // Scroll position preservation
    const scrollRef = useRef<HTMLDivElement>(null);
    const savedScrollPos = useRef<number>(0);

    // Restore scroll position on every render
    useLayoutEffect(() => {
        if (scrollRef.current && savedScrollPos.current > 0) {
            scrollRef.current.scrollTop = savedScrollPos.current;
        }
    });

    // Save scroll position
    const handleScroll = useCallback(() => {
        if (scrollRef.current) {
            savedScrollPos.current = scrollRef.current.scrollTop;
        }
    }, []);

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

            console.log(' Fetching news with params:', params.toString());
            const response = await fetch(`/api/news?${params.toString()}`, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            const data: NewsResponse = await response.json();
            console.log(' News response:', data);

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
            <div className="px-6 py-1 md:py-5 border-b border-gray-800 bg-black relative">
                {/* Close button - mobile only */}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="absolute top-1 right-3 md:top-3 md:hidden text-gray-400 hover:text-white transition-colors z-50"
                        aria-label="Close panel"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                )}
                {/* Centered 3D Carved Title */}
                <div className="text-center">
                    <h1 className="font-black text-white tracking-wider uppercase"
                        style={{
                            fontSize: window.innerWidth < 768 ? '45px' : '3rem',
                            lineHeight: window.innerWidth < 768 ? '1' : 'normal',
                            marginBottom: window.innerWidth < 768 ? '5px' : '20px',
                            textShadow: `
 2px 2px 0px rgba(0, 0, 0, 0.9),
 -1px -1px 0px rgba(255, 255, 255, 0.1),
 0px -2px 0px rgba(255, 255, 255, 0.05),
 0px 2px 0px rgba(0, 0, 0, 0.8),
 inset 0 2px 4px rgba(0, 0, 0, 0.5)
 `,
                            background: 'linear-gradient(to bottom, #ffffff 0%, #cccccc 50%, #999999 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
                        }}>
                        Market News
                    </h1>
                </div>

                {/* Single Row: Search + All Buttons + Refresh */}
                <div className="flex items-center gap-2">
                    {/* Ticker Search Bar - 50% smaller again */}
                    <form onSubmit={handleSearch} className="w-16 md:w-64">
                        <div className="flex items-center bg-black border border-gray-700 rounded-lg focus-within:border-orange-500 transition-all">
                            <div className="pl-2 pr-1">
                                <TbSearch className="text-orange-400 w-4 h-4" />
                            </div>
                            <input
                                type="text"
                                value={searchTicker}
                                onChange={(e) => setSearchTicker(e.target.value)}
                                placeholder="SPY"
                                className="flex-1 px-1 py-2 bg-transparent text-white placeholder-white/60 focus:outline-none font-mono text-sm"
                            />
                        </div>
                    </form>

                    {/* Category Buttons - Smaller */}
                    {categories.map((cat) => {
                        const IconComponent = cat.icon;
                        const isActive = selectedCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-1 px-2 py-2 md:px-5 md:py-3 rounded-lg text-xs md:text-base font-bold whitespace-nowrap transition-all ${isActive
                                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-black shadow-lg'
                                        : 'bg-black text-white hover:bg-gray-900 border border-gray-700 hover:border-orange-500/50'
                                    }`}
                            >
                                <IconComponent className={`w-4 h-4 md:w-5 md:h-5 ${isActive ? 'text-black' : 'text-orange-400'}`} />
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}

                    {/* Refresh Button */}
                    <button
                        onClick={() => fetchNews(searchTicker, selectedCategory)}
                        className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 bg-black hover:bg-gray-900 rounded-lg border border-gray-700 hover:border-orange-500 transition-all group"
                        title="Refresh News Feed"
                    >
                        <TbRefresh className={`w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-orange-400 transition-colors ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Market Sentiment Panel */}
            {marketSentiment && showSentimentPanel && (
                <div className="border-b border-gray-700/30 bg-black/95">
                    <div className="p-6">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-sm font-semibold text-white uppercase tracking-widest">Market Sentiment</h3>
                            <button
                                onClick={() => setShowSentimentPanel(false)}
                                className="flex items-center justify-center w-6 h-6 hover:bg-gray-800 rounded transition-colors"
                            >
                                <TbX className="w-4 h-4 text-gray-400 hover:text-white" />
                            </button>
                        </div>

                        {/* Overall Sentiment */}
                        <div className="mb-5">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Overall</span>
                                <div className={`flex items-center gap-2 px-2.5 py-1 rounded ${marketSentiment.overall_sentiment === 'bullish'
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : marketSentiment.overall_sentiment === 'bearish'
                                            ? 'bg-rose-500/15 text-rose-400'
                                            : 'bg-gray-500/15 text-gray-300'
                                    }`}>
                                    {marketSentiment.overall_sentiment === 'bullish' ? (
                                        <TbTrendingUp className="w-3.5 h-3.5" />
                                    ) : marketSentiment.overall_sentiment === 'bearish' ? (
                                        <TbTrendingDown className="w-3.5 h-3.5" />
                                    ) : (
                                        <div className="w-3.5 h-3.5 rounded-full bg-gray-400"></div>
                                    )}
                                    <span className="text-xs font-bold uppercase tracking-wide">
                                        {marketSentiment.overall_sentiment}
                                    </span>
                                </div>
                            </div>
                            <div className="relative w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className={`absolute h-full transition-all duration-500 ${marketSentiment.sentiment_score > 0
                                            ? 'bg-emerald-500'
                                            : 'bg-rose-500'
                                        }`}
                                    style={{
                                        width: `${Math.abs(marketSentiment.sentiment_score) * 100}%`,
                                        left: marketSentiment.sentiment_score < 0 ? 'auto' : '0',
                                        right: marketSentiment.sentiment_score < 0 ? '0' : 'auto'
                                    }}
                                ></div>
                            </div>
                        </div>

                        {/* Confidence */}
                        <div className="mb-5">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Confidence</span>
                                <span className="text-xs font-bold text-cyan-400">
                                    {(marketSentiment.confidence_level * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div className="relative w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="absolute h-full bg-cyan-500 transition-all duration-500"
                                    style={{ width: `${marketSentiment.confidence_level * 100}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Trending Topics */}
                        {marketSentiment.trending_topics.length > 0 && (
                            <div className="mb-5">
                                <div className="flex items-center gap-2 mb-2.5">
                                    <TbFlame className="w-3.5 h-3.5 text-orange-500" />
                                    <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Trending</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {marketSentiment.trending_topics.slice(0, 8).map((topic) => (
                                        <div
                                            key={topic.keyword}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-gray-800/80 border border-gray-700/50 hover:border-gray-600/80 transition-colors"
                                            title={`${topic.mentions} mentions • ${topic.related_tickers.join(', ')}`}
                                        >
                                            <span className="text-xs text-white/90 font-medium">
                                                {topic.keyword}
                                            </span>
                                            <span className="text-[10px] text-gray-500">
                                                {topic.mentions}
                                            </span>
                                            {topic.sentiment_score > 0.1 ? (
                                                <div className="w-1 h-1 rounded-full bg-emerald-400"></div>
                                            ) : topic.sentiment_score < -0.1 ? (
                                                <div className="w-1 h-1 rounded-full bg-rose-400"></div>
                                            ) : (
                                                <div className="w-1 h-1 rounded-full bg-gray-500"></div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Market Events */}
                        {marketSentiment.market_moving_events.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-2.5">
                                    <TbTarget className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Events</span>
                                </div>
                                <div className="space-y-1.5">
                                    {marketSentiment.market_moving_events.slice(0, 3).map((event, index) => (
                                        <div
                                            key={index}
                                            className="flex items-center justify-between px-3 py-2.5 rounded bg-gray-800/60 border border-gray-700/40 hover:border-gray-600/60 transition-colors"
                                        >
                                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px] font-bold uppercase tracking-wider">
                                                    {event.ticker}
                                                </span>
                                                <span className="text-xs text-gray-300 truncate flex-1">
                                                    {event.title.slice(0, 55)}{event.title.length > 55 ? '...' : ''}
                                                </span>
                                            </div>
                                            <div className={`text-xs font-bold px-2 py-0.5 rounded ml-2 ${event.estimated_price_impact > 0
                                                    ? 'text-emerald-400 bg-emerald-500/15'
                                                    : 'text-rose-400 bg-rose-500/15'
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
                    <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto custom-scrollbar">
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