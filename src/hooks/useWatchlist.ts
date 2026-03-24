"use client";

import { useState, useEffect, useRef } from 'react';
import { WatchlistItem, PerformanceCategory, AISignal } from '../types/watchlist';
import { EnhancedWatchlistService } from '../lib/enhancedWatchlistService';
import { polygonStocksWS } from '../lib/polygonStocksWS';

export function useWatchlist() {
    const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const prevCloseRef = useRef<Record<string, number>>({});

    const enhancedService = EnhancedWatchlistService.getInstance();

    const fetchWatchlistData = async () => {
        try {
            setLoading(true);
            setError(null);
            console.log(' Starting enhanced bulk watchlist data fetch...');

            // Fetch bulk data from the enhanced service
            const bulkData = await enhancedService.fetchBulkWatchlistData();

            if (bulkData.length === 0) {
                console.log(' No bulk data available');
                setError('No market data available. Please check your internet connection.');
                return;
            }

            console.log(` Processing bulk data for ${bulkData.length} symbols...`);

            const dataPromises = bulkData.map(async (data) => {
                try {
                    console.log(`� Processing ${data.symbol}...`);

                    const performance = await enhancedService.calculatePerformanceCategory(data.symbol);
                    const signal = await enhancedService.generateAISignal(data.symbol, performance, data.dailyChangePercent);

                    const result: WatchlistItem = {
                        symbol: data.symbol,
                        name: data.name,
                        price: data.currentPrice,
                        change: data.dailyChange,
                        changePercent: data.dailyChangePercent,
                        volume: data.volume,
                        performance,
                        signal,
                        timestamp: data.timestamp,
                        rrgMomentum: 0,
                        rrgStrength: 0,
                        seasonality: 'NEUTRAL'
                    };

                    console.log(` ${data.symbol}: $${result.price.toFixed(2)} (${result.changePercent.toFixed(2)}%) - ${result.performance} - ${result.signal}`);
                    return result;
                } catch (error) {
                    console.error(` Error processing data for ${data.symbol}:`, error);
                    return null;
                }
            });

            const results = await Promise.all(dataPromises);
            const validResults = results.filter((item): item is WatchlistItem => item !== null);

            console.log(` Total valid results: ${validResults.length}`);

            if (validResults.length === 0) {
                console.log(' No valid results - setting error state');
                setError('Failed to process market data. Please try again.');
            } else {
                console.log(` Setting watchlist data with ${validResults.length} items:`,
                    validResults.map(r => `${r.symbol}: $${r.price.toFixed(2)} (${r.performance}/${r.signal})`));
                // Seed prevClose from REST data so WebSocket can compute daily % change in real-time
                for (const item of validResults) {
                    if (item.changePercent !== 0) {
                        prevCloseRef.current[item.symbol] = item.price / (1 + item.changePercent / 100);
                    }
                }
                setWatchlistData(validResults);
                console.log(` Successfully loaded ${validResults.length} symbols with enhanced analysis`);
            }
        } catch (error) {
            console.error('Error fetching watchlist data:', error);
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // ── WebSocket: real-time per-minute price updates via AM.* ────────────────
        let dead = false;
        let interval: ReturnType<typeof setInterval>;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = () => {
            if (dead) return;
            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({ action: 'auth', params: POLYGON_API_KEY }));
            };

            ws.onmessage = (evt: MessageEvent) => {
                let messages: any[];
                try { messages = JSON.parse(evt.data); } catch { return; }

                for (const msg of messages) {
                    if (msg.ev === 'status' && msg.status === 'auth_success') {
                        const syms = Object.keys(prevCloseRef.current);
                        if (syms.length > 0) {
                            ws.send(JSON.stringify({ action: 'subscribe', params: syms.map(s => `AM.${s}`).join(',') }));
                        }
                    }

                    if (msg.ev === 'AM') {
                        const prevClose = prevCloseRef.current[msg.sym];
                        if (prevClose) {
                            const newPrice: number = msg.c;
                            const newChangePercent = ((newPrice - prevClose) / prevClose) * 100;
                            const newChange = newPrice - prevClose;
                            setWatchlistData(prev => prev.map(item =>
                                item.symbol === msg.sym
                                    ? { ...item, price: newPrice, change: newChange, changePercent: newChangePercent }
                                    : item
                            ));
                        }
                    }
                }
            };

            ws.onerror = () => { /* handled by onclose */ };

            ws.onclose = () => {
                if (!dead) reconnectTimer = setTimeout(connect, 5000);
            };
        };

        // Seed REST first, then open WebSocket (ensures prevCloseRef is populated before auth_success)
        fetchWatchlistData().then(() => {
            if (!dead) {
                connect();
                // REST polling every 5 minutes for full analysis refresh — prices come from WebSocket
                interval = setInterval(fetchWatchlistData, 300000);
            }
        });

        return () => {
            dead = true;
            clearInterval(interval);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        };
    }, []);

    return {
        watchlistData,
        loading,
        error,
        refreshData: fetchWatchlistData,
        getPerformanceColor: (category: PerformanceCategory) => enhancedService.getPerformanceColor(category),
        getSignalColor: (signal: AISignal) => enhancedService.getSignalColor(signal)
    };
}
