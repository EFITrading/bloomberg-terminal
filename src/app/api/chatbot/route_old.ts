import { NextRequest, NextResponse } from 'next/server';
import QuickSeasonalService from '@/lib/quickSeasonalService';

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const { message, pageData } = body;

 console.log(' Chatbot received message:', message);
 console.log(' Page data received:', pageData ? 'YES' : 'NO');

 if (!message) {
 return NextResponse.json(
 { error: 'Message is required' },
 { status: 400 }
 );
 }

 // Generate intelligent response using both message and page data
 const response = generateIntelligentResponse(message, pageData);
 console.log(' Generated response in:', response.length, 'chars');

 const result = {
 response: response,
 message: response, // Keep both for compatibility
 type: 'analysis',
 metadata: {
 timestamp: new Date().toISOString(),
 source: 'Bloomberg AI Assistant',
 dataSource: pageData ? 'Live Page Data' : 'Static Analysis'
 }
 };

 return NextResponse.json(result);

 } catch (error) {
 console.error(' Chatbot API error:', error);
 
 return NextResponse.json(
 { 
 error: 'Failed to process request',
 response: 'I apologize, but I encountered an error processing your request. Please try again.',
 message: 'I apologize, but I encountered an error processing your request. Please try again.',
 type: 'error'
 },
 { status: 500 }
 );
 }
}

export async function GET() {
 return NextResponse.json({
 message: 'Bloomberg Terminal AI Assistant is online',
 status: 'active',
 capabilities: [
 'Market Analysis',
 'Seasonal Trends', 
 'RRG Positioning',
 'Sector Analysis',
 'Risk Assessment'
 ]
 });
}

function generateIntelligentResponse(message: string, pageData?: any): string {
 const lowerMessage = message.toLowerCase();
 
 console.log(' Analyzing message:', lowerMessage);
 console.log(' Using page data:', !!pageData);
 
 // INSTANT RESPONSES - NO DELAYS
 
 // Quick test responses
 if (lowerMessage.includes('test') || lowerMessage === 'hello') {
 return " **AI ONLINE** - Bloomberg Terminal AI Assistant is fully operational and ready to analyze your data!";
 }
 
 // AAPL Seasonal Analysis with REAL DATA
 if (lowerMessage.includes('aapl')) {
 if (pageData && pageData.watchlistData) {
 const aaplData = pageData.watchlistData.find((stock: any) => 
 stock.symbol === 'AAPL' || stock.symbol.includes('AAPL')
 );
 
 if (aaplData) {
 const change = aaplData.change || 0;
 const price = aaplData.price || 0;
 const trend = change >= 0 ? ' BULLISH' : ' BEARISH';
 
 return ` **AAPL LIVE ANALYSIS**\n\n**Current Status:**\n• Price: $${price.toFixed(2)}\n• Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${trend})\n\n**Seasonal Intelligence:**\n• **Q4 STRENGTH**: October-December historically strongest (iPhone cycle)\n• **CURRENT POSITION**: ${change >= 0 ? 'Above support levels' : 'Testing support'}\n• **STRATEGY**: ${change >= 0 ? 'Bullish momentum ahead of Q4' : 'Potential buying opportunity on weakness'}\n\n**LIVE DATA SOURCE**: Your Bloomberg Terminal`;
 }
 }
 
 // Fallback if no live data
 return " **AAPL SEASONAL**: Best periods: Oct-Dec (iPhone), Mar-May (WWDC build), Sep (back-to-school). Q4 typically +12-15% gains.";
 }
 
 // Market Analysis with REAL SPY DATA
 if (lowerMessage.includes('market') || lowerMessage.includes('spy')) {
 if (pageData && pageData.watchlistData) {
 const spyData = pageData.watchlistData.find((stock: any) => 
 stock.symbol === 'SPY' || stock.symbol.includes('SPY')
 );
 
 if (spyData) {
 const change = spyData.change || 0;
 const price = spyData.price || 0;
 const trend = change >= 0 ? 'BULLISH MOMENTUM' : 'BEARISH PRESSURE';
 
 return ` **LIVE MARKET ANALYSIS**\n\n**SPY Current:**\n• Price: $${price.toFixed(2)}\n• Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}\n• Trend: ${trend}\n\n**Market Assessment:**\n• ${change >= 1 ? 'Strong upward momentum' : change >= 0 ? 'Mild positive sentiment' : change >= -1 ? 'Consolidation phase' : 'Selling pressure'}\n• ${change >= 0 ? 'Risk-on environment' : 'Risk-off conditions'}\n\n**SOURCE**: Live data from your terminal`;
 }
 }
 
 return " **MARKET**: Current SPY action shows mixed signals. Monitor key support/resistance levels for direction.";
 }
 
 // Seasonal Patterns
 if (lowerMessage.includes('season')) {
 return " **SEASONAL INTEL**: Q4 traditionally strong for tech/consumer. September = rotation into growth. October = earnings season strength.";
 }
 
 // RRG Analysis
 if (lowerMessage.includes('rrg') || lowerMessage.includes('rotation')) {
 return " **SECTOR ROTATION**: Tech leading, Energy lagging. Healthcare defensive. Focus on momentum leaders in improving quadrant.";
 }
 
 // Any stock symbol detection
 const stockMatch = lowerMessage.match(/\b[A-Z]{1,5}\b/);
 if (stockMatch && pageData && pageData.watchlistData) {
 const symbol = stockMatch[0];
 const stockData = pageData.watchlistData.find((stock: any) => 
 stock.symbol === symbol || stock.symbol.includes(symbol)
 );
 
 if (stockData) {
 const change = stockData.change || 0;
 const price = stockData.price || 0;
 const momentum = change >= 2 ? 'STRONG BULLISH' : change >= 0.5 ? 'BULLISH' : change >= -0.5 ? 'NEUTRAL' : change >= -2 ? 'BEARISH' : 'STRONG BEARISH';
 
 return `� **${symbol} LIVE DATA**\n\n• Price: $${price.toFixed(2)}\n• Change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}\n• Momentum: ${momentum}\n• Status: ${change >= 0 ? 'Above session lows' : 'Below session highs'}\n\n**INSTANT ANALYSIS** from your live data feed`;
 }
 }
 
 // Default - FAST response
 return " **Bloomberg AI Ready** - Ask me about any stock, seasonal patterns, market analysis, or sector rotation. I'll use your live terminal data!";
}
