import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from 'recharts';
import { RefreshCw, TrendingUp, Calendar } from 'lucide-react';

interface HistoricalGEXChartProps {
    ticker: string;
    expiration: string;
}

interface HistoricalDataPoint {
    timestamp: string;
    price: number;
    volume: number;
    totalNetGEX: number;
    gexByStrike: {
        [strike: string]: {
            netGEX: number;
            callGEX: number;
            putGEX: number;
            callGamma: number;
            putGamma: number;
        };
    };
}

const HistoricalGEXChart: React.FC<HistoricalGEXChartProps> = ({ ticker, expiration }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<HistoricalDataPoint[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [topStrikes, setTopStrikes] = useState<number[]>([]);
    const [selectedStrike, setSelectedStrike] = useState<number | null>(null);

    const fetchHistoricalData = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/historical-gex?ticker=${ticker}&expiration=${expiration}&date=${selectedDate}`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch data');
            }

            setData(result.data.historicalData);
            setTopStrikes(result.data.topStrikes);
            if (result.data.topStrikes.length > 0) {
                setSelectedStrike(result.data.topStrikes[0]);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (ticker && expiration) {
            fetchHistoricalData();
        }
    }, [ticker, expiration, selectedDate]);

    // Format data for chart
    const chartData = data.map(point => ({
        time: new Date(point.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        price: point.price,
        totalGEX: point.totalNetGEX / 1e9, // Convert to billions
        strikeGEX: selectedStrike ? (point.gexByStrike[selectedStrike]?.netGEX || 0) / 1e9 : 0
    }));

    // Custom tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-black border border-gray-700 p-3 rounded-lg shadow-xl">
                    <p className="text-white font-bold mb-1">{data.time}</p>
                    <p className="text-blue-400">Price: ${data.price.toFixed(2)}</p>
                    <p className="text-green-400">Total GEX: ${data.totalGEX.toFixed(2)}B</p>
                    {selectedStrike && (
                        <p className="text-yellow-400">${selectedStrike} GEX: ${data.strikeGEX.toFixed(2)}B</p>
                    )}
                </div>
            );
        }
        return null;
    };

    if (!ticker || !expiration) {
        return (
            <div className="bg-black border border-gray-800 rounded-lg p-6">
                <p className="text-gray-400">Select a ticker and expiration to view historical GEX</p>
            </div>
        );
    }

    return (
        <div className="bg-black border-2 border-purple-500/50 rounded-lg p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <TrendingUp className="text-purple-400" size={24} />
                    <h3 className="text-xl font-bold text-white">Historical GEX Timeline</h3>
                </div>

                <div className="flex items-center gap-3">
                    {/* Date Selector */}
                    <div className="flex items-center gap-2">
                        <Calendar className="text-gray-400" size={16} />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="bg-gray-900 border border-gray-700 text-white px-3 py-1 rounded text-sm focus:border-purple-500 focus:outline-none"
                        />
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={fetchHistoricalData}
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
                        {loading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
                    <p className="font-semibold">Error:</p>
                    <p>{error}</p>
                </div>
            )}

            {/* Strike Selector */}
            {topStrikes.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-400 text-sm font-semibold">Focus Strike:</span>
                    {topStrikes.map(strike => (
                        <button
                            key={strike}
                            onClick={() => setSelectedStrike(strike)}
                            className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${selectedStrike === strike
                                    ? 'bg-yellow-500 text-black'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                        >
                            ${strike}
                        </button>
                    ))}
                </div>
            )}

            {/* Chart */}
            {data.length > 0 ? (
                <div className="bg-gray-900 rounded-lg p-4">
                    <ResponsiveContainer width="100%" height={400}>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis
                                dataKey="time"
                                stroke="#888"
                                tick={{ fill: '#888', fontSize: 11 }}
                                interval={Math.floor(chartData.length / 12)} // Show ~12 labels
                            />
                            <YAxis
                                yAxisId="left"
                                stroke="#3b82f6"
                                tick={{ fill: '#3b82f6', fontSize: 12 }}
                                label={{ value: 'Price ($)', angle: -90, position: 'insideLeft', fill: '#3b82f6' }}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#22c55e"
                                tick={{ fill: '#22c55e', fontSize: 12 }}
                                label={{ value: 'Net GEX ($B)', angle: 90, position: 'insideRight', fill: '#22c55e' }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ color: '#fff' }} />

                            {/* Price Line */}
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="price"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={false}
                                name="Stock Price"
                            />

                            {/* Total GEX Bars */}
                            <Bar
                                yAxisId="right"
                                dataKey="totalGEX"
                                fill="#22c55e"
                                opacity={0.6}
                                name="Total Net GEX"
                            />

                            {/* Selected Strike GEX Line */}
                            {selectedStrike && (
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="strikeGEX"
                                    stroke="#fbbf24"
                                    strokeWidth={2}
                                    dot={false}
                                    name={`$${selectedStrike} GEX`}
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                !loading && (
                    <div className="bg-gray-900 rounded-lg p-8 text-center">
                        <p className="text-gray-400">No data available for this date</p>
                        <p className="text-gray-500 text-sm mt-2">Try selecting a different date or refreshing</p>
                    </div>
                )
            )}

            {/* Stats */}
            {data.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-900 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Data Points</p>
                        <p className="text-white text-2xl font-bold">{data.length}</p>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Price Range</p>
                        <p className="text-white text-2xl font-bold">
                            ${Math.min(...data.map(d => d.price)).toFixed(2)} - ${Math.max(...data.map(d => d.price)).toFixed(2)}
                        </p>
                    </div>
                    <div className="bg-gray-900 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">GEX Range</p>
                        <p className="text-white text-2xl font-bold">
                            ${(Math.min(...data.map(d => d.totalNetGEX)) / 1e9).toFixed(1)}B - ${(Math.max(...data.map(d => d.totalNetGEX)) / 1e9).toFixed(1)}B
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HistoricalGEXChart;
