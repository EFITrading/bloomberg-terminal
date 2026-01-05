import { NextRequest, NextResponse } from 'next/server';
import PolygonService from '@/lib/polygonService';

// Define watchlist symbols with their display names
const WATCHLIST_SYMBOLS = [
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'ETF' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'ETF' },
    { symbol: 'IWM', name: 'iShares Russell 2000 ETF', type: 'ETF' },
    { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', type: 'ETF' },
    { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', type: 'SECTOR' },
    { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'ETF' },
    { symbol: 'AAPL', name: 'Apple Inc.', type: 'STOCK' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'STOCK' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'STOCK' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'STOCK' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'STOCK' },
    { symbol: 'META', name: 'Meta Platforms Inc.', type: 'STOCK' },
    { symbol: 'TSLA', name: 'Tesla Inc.', type: 'STOCK' },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', type: 'STOCK' },
    { symbol: 'AVGO', name: 'Broadcom Inc.', type: 'STOCK' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'STOCK' }
];

export async function GET(request: NextRequest) {
    try {
        console.log(' Fetching bulk watchlist data...');

        const polygonService = new PolygonService();
        const results = [];

        // Fetch data for each symbol in parallel with proper throttling
        const batchSize = 5;
        for (let i = 0; i < WATCHLIST_SYMBOLS.length; i += batchSize) {
            const batch = WATCHLIST_SYMBOLS.slice(i, i + batchSize);

            const batchPromises = batch.map(async ({ symbol, name, type }) => {
                try {
                    console.log(` Fetching ${symbol}...`);

                    // Get current quote data (1 day timeframe for current price)
                    const response = await fetch(
                        `${request.nextUrl.origin}/api/stock-data?symbol=${symbol}&timeframe=1h&range=1D`,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                            },
                        }
                    );

                    if (!response.ok) {
                        console.warn(` No data for ${symbol}`);
                        return null;
                    }

                    const stockData = await response.json();

                    if (!stockData.data || stockData.data.length === 0) {
                        console.warn(` Empty data for ${symbol}`);
                        return null;
                    }

                    const latestData = stockData.data[stockData.data.length - 1];
                    const previousData = stockData.data.length > 1 ? stockData.data[stockData.data.length - 2] : latestData;

                    // Calculate daily change
                    const currentPrice = latestData.close;
                    const previousPrice = previousData.close;
                    const dailyChange = currentPrice - previousPrice;
                    const dailyChangePercent = ((dailyChange / previousPrice) * 100);

                    // Get historical data for performance calculation (30 days)
                    const historicalResponse = await fetch(
                        `${request.nextUrl.origin}/api/historical-data?symbol=${symbol}&startDate=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&endDate=${new Date().toISOString().split('T')[0]}`,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                            },
                        }
                    );

                    let historicalPrices = [];
                    if (historicalResponse.ok) {
                        const historicalData = await historicalResponse.json();
                        if (historicalData.data && historicalData.data.length > 0) {
                            historicalPrices = historicalData.data.map((item: any) => ({
                                timestamp: item.timestamp,
                                close: item.close,
                                volume: item.volume
                            }));
                        }
                    }

                    const result = {
                        symbol,
                        name,
                        type,
                        currentPrice,
                        dailyChange,
                        dailyChangePercent,
                        volume: latestData.volume || 0,
                        historicalPrices,
                        timestamp: latestData.timestamp
                    };

                    console.log(` ${symbol}: $${currentPrice.toFixed(2)} (${dailyChangePercent.toFixed(2)}%)`);
                    return result;

                } catch (error) {
                    console.error(` Error fetching ${symbol}:`, error);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            const validResults = batchResults.filter(result => result !== null);
            results.push(...validResults);

            // Small delay between batches to avoid overwhelming the API
            if (i + batchSize < WATCHLIST_SYMBOLS.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(` Successfully fetched data for ${results.length}/${WATCHLIST_SYMBOLS.length} symbols`);

        return NextResponse.json({
            success: true,
            data: results,
            count: results.length,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error(' Error in watchlist-bulk API:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch watchlist data',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
