import React, { useState, useEffect, useRef } from 'react';
import { Clock, Play, Pause } from 'lucide-react';

interface TimelineDataPoint {
    timestamp: number;
    label: string;
    price: number;
}

interface GEXTimelineScrubberProps {
    ticker: string;
    date: string; // YYYY-MM-DD
    onTimeChange: (timestamp: number | null, price: number) => void;
    currentPrice?: number;
}

// US Market Holidays (2025-2027)
const US_MARKET_HOLIDAYS = [
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
    '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-04-02', '2027-05-31',
    '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
];

// Check if market is open on a given date
const isMarketOpen = (dateStr: string): boolean => {
    const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
    const dayOfWeek = date.getDay();

    // Check if weekend (0 = Sunday, 6 = Saturday)
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;

    // Check if holiday
    if (US_MARKET_HOLIDAYS.includes(dateStr)) return false;

    return true;
};

const GEXTimelineScrubber: React.FC<GEXTimelineScrubberProps> = ({
    ticker,
    date,
    onTimeChange,
    currentPrice = 0
}) => {
    const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch historical price bars for the timeline
    useEffect(() => {
        const fetchTimeline = async () => {
            setLoading(true);
            try {
                const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
                const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${date}/${date}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

                const response = await fetch(url);
                const data = await response.json();

                if (data.status === 'OK' && data.results && data.results.length > 0) {
                    const timeline: TimelineDataPoint[] = data.results.map((bar: any) => {
                        const time = new Date(bar.t);
                        return {
                            timestamp: bar.t,
                            label: time.toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                                timeZone: 'America/New_York'
                            }),
                            price: bar.c
                        };
                    });

                    setTimelineData(timeline);
                    // Default to last (most recent) data point
                    setSelectedIndex(timeline.length - 1);
                    onTimeChange(null, currentPrice); // null = use current/live data
                } else {
                    // No data available - only warn if market should be open
                    if (isMarketOpen(date)) {
                        console.warn('No historical data available for', ticker, 'on', date, '(trading day)');
                    }
                    // For weekends/holidays, silently set empty data
                }
            } catch (error) {
                console.error('Failed to fetch timeline data:', error);
            } finally {
                setLoading(false);
            }
        };

        if (ticker && date) {
            fetchTimeline();
        }
    }, [ticker, date]);

    // Handle slider change
    const handleSliderChange = (index: number) => {
        setSelectedIndex(index);
        if (index === timelineData.length - 1) {
            // Last index = current/live data
            onTimeChange(null, currentPrice);
        } else {
            const point = timelineData[index];
            onTimeChange(point.timestamp, point.price);
        }
    };

    // Play/pause animation
    const togglePlay = () => {
        if (isPlaying) {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
            }
            setIsPlaying(false);
        } else {
            setIsPlaying(true);
            playIntervalRef.current = setInterval(() => {
                setSelectedIndex(prev => {
                    if (prev === null || prev >= timelineData.length - 1) {
                        // Stop at end
                        if (playIntervalRef.current) {
                            clearInterval(playIntervalRef.current);
                            playIntervalRef.current = null;
                        }
                        setIsPlaying(false);
                        return timelineData.length - 1;
                    }
                    const nextIndex = prev + 1;
                    const point = timelineData[nextIndex];
                    if (nextIndex === timelineData.length - 1) {
                        onTimeChange(null, currentPrice);
                    } else {
                        onTimeChange(point.timestamp, point.price);
                    }
                    return nextIndex;
                });
            }, 500); // 500ms per bar
        }
    };

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
            }
        };
    }, []);

    if (loading) {
        return (
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-center gap-2 text-gray-400">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
                    <span className="text-sm">Loading timeline...</span>
                </div>
            </div>
        );
    }

    if (timelineData.length === 0) {
        // Only show warning if market should be open
        if (!isMarketOpen(date)) {
            // Weekend or holiday - don't show a warning
            return null;
        }

        // Market should be open but no data available
        return (
            <div className="bg-gray-900/50 border border-yellow-600/50 rounded-lg p-4">
                <div className="flex items-center justify-center gap-2 text-yellow-400">
                    <span className="text-sm">⚠ No historical data available for {ticker} on {date}</span>
                </div>
            </div>
        );
    }

    const selectedPoint = selectedIndex !== null ? timelineData[selectedIndex] : null;
    const isLiveMode = selectedIndex === timelineData.length - 1;

    return (
        <div className="relative gex-timeline-container" style={{
            background: 'linear-gradient(180deg, #0a0e1a 0%, #000000 100%)',
            border: '2px solid #1a4d8f',
            borderRadius: '4px',
            padding: '8px 16px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.6), 0 0 0 1px rgba(26,77,143,0.3)'
        }}>
            <style>{`
                @media (max-width: 768px) {
                    .gex-timeline-container { padding: 0px 6px 16px 6px !important; margin-top: -3px !important; }
                    .gex-timeline-header { margin-top: -3px !important; margin-bottom: -5px !important; gap: 4px !important; }
                    .gex-timeline-slider { padding-bottom: 0px !important; }
                    .gex-timeline-button { padding: 2px 6px !important; }
                    .gex-timeline-badge { padding: 1px 6px !important; }
                    .gex-timeline-title { font-size: 11px !important; }
                }
            `}</style>
            {/* Header */}
            <div className="flex items-center justify-between mb-2 gex-timeline-header">
                <div className="flex items-center gap-2">
                    {/* Play/Pause Button */}
                    <button
                        onClick={togglePlay}
                        className="text-white hover:brightness-110 transition-all gex-timeline-button"
                        style={{
                            background: 'linear-gradient(180deg, #1e5a9e 0%, #0d3a6e 100%)',
                            border: '1px solid #2a7fd8',
                            borderRadius: '3px',
                            padding: '6px 8px',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.4)',
                            cursor: 'pointer'
                        }}
                        title={isPlaying ? 'Pause' : 'Play Timeline'}
                    >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>

                    {/* Time Display */}
                    {selectedPoint && (
                        <div className="gex-timeline-badge" style={{
                            background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.8) 100%)',
                            border: '1px solid rgba(255,144,0,0.3)',
                            borderRadius: '3px',
                            padding: '4px 10px',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)'
                        }}>
                            <div className="text-xs font-bold" style={{ color: '#ff9000', fontFamily: 'monospace' }}>{selectedPoint.label}</div>
                        </div>
                    )}

                    {isLiveMode && (
                        <span className="gex-timeline-badge" style={{
                            background: 'linear-gradient(180deg, rgba(0,255,0,0.2) 0%, rgba(0,180,0,0.2) 100%)',
                            border: '1px solid #00ff00',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            color: '#00ff00',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            boxShadow: 'inset 0 1px 0 rgba(0,255,0,0.3)'
                        }}>
                            LIVE
                        </span>
                    )}
                </div>

                {/* Title - Center */}
                <div className="absolute left-1/2 transform -translate-x-1/2">
                    <h4 className="text-sm font-bold uppercase tracking-widest gex-timeline-title" style={{
                        color: '#4d9eff',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        letterSpacing: '0.15em'
                    }}>
                        HISTORICAL GEX
                    </h4>
                </div>

                {/* Price Display */}
                {selectedPoint && (
                    <div className="gex-timeline-badge" style={{
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.8) 100%)',
                        border: '1px solid rgba(77,158,255,0.3)',
                        borderRadius: '3px',
                        padding: '4px 10px',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)'
                    }}>
                        <div className="text-xs font-bold" style={{ color: '#4d9eff', fontFamily: 'monospace' }}>${selectedPoint.price.toFixed(2)}</div>
                    </div>
                )}
            </div>

            {/* Timeline Slider */}
            <div className="relative gex-timeline-slider" style={{ paddingBottom: '10px' }}>
                {/* Timeline track */}
                <div style={{
                    height: '6px',
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(20,20,30,0.9) 100%)',
                    border: '1px solid #1a4d8f',
                    borderRadius: '2px',
                    position: 'relative',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)'
                }}>
                    {/* Progress fill */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            background: 'linear-gradient(90deg, #ff9000 0%, #ffb84d 100%)',
                            boxShadow: '0 0 4px rgba(255,144,0,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
                            width: selectedIndex !== null ? `${(selectedIndex / (timelineData.length - 1)) * 100}%` : '0%',
                            transition: 'width 0.15s ease-out'
                        }}
                    />
                </div>

                {/* Slider input */}
                <input
                    type="range"
                    min={0}
                    max={timelineData.length - 1}
                    value={selectedIndex ?? timelineData.length - 1}
                    onChange={(e) => handleSliderChange(parseInt(e.target.value))}
                    className="absolute top-0 left-0 w-full opacity-0 cursor-pointer"
                    style={{ margin: 0, height: '6px' }}
                />

                {/* X-axis time labels - visible below slider */}
                <div className="relative" style={{ height: '10px', marginTop: '2px', overflow: 'visible' }}>
                    {timelineData.filter((point) => {
                        // Show only specific times: 4AM, 9:30AM, 12PM, 4PM, 7:55PM
                        const time = point.label;
                        return time === '4:00 AM' || time === '9:30 AM' || time === '12:00 PM' || time === '4:00 PM' || time === '7:55 PM';
                    }).map((point, idx, arr) => {
                        const position = (timelineData.indexOf(point) / (timelineData.length - 1)) * 100;
                        // Adjust transform for edge labels to prevent cropping
                        let transform = 'translateX(-50%)';
                        if (idx === 0) transform = 'translateX(0)'; // First label: left-align
                        if (idx === arr.length - 1) transform = 'translateX(-100%)'; // Last label: right-align

                        return (
                            <span
                                key={point.timestamp}
                                style={{
                                    position: 'absolute',
                                    left: `${position}%`,
                                    transform: transform,
                                    color: '#ffffff',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    fontFamily: 'monospace',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {point.label}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default GEXTimelineScrubber;
