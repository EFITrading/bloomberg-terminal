import WebSocket from 'ws';

interface WebSocketOptionsFlow {
 ev: string; // Event type
 sym: string; // Symbol
 x: number; // Exchange
 p: number; // Price
 s: number; // Size
 c: number[]; // Conditions
 t: number; // Timestamp
 q: number; // Sequence number
}

export class PolygonWebSocketService {
 private ws: WebSocket | null = null;
 private apiKey: string;
 private subscriptions: Set<string> = new Set();
 private messageHandlers: ((data: WebSocketOptionsFlow[]) => void)[] = [];

 constructor(apiKey: string) {
 this.apiKey = apiKey;
 }

 connect(): Promise<void> {
 return new Promise((resolve, reject) => {
 try {
 // Polygon WebSocket URL for options trades
 const wsUrl = `wss://socket.polygon.io/options`;
 this.ws = new WebSocket(wsUrl);

 this.ws.on('open', () => {
 console.log(' Connected to Polygon WebSocket');
 
 // Authenticate
 this.ws!.send(JSON.stringify({
 action: 'auth',
 params: this.apiKey
 }));
 });

 this.ws.on('message', (data) => {
 try {
 const message = JSON.parse(data.toString());
 
 if (message[0]?.ev === 'status' && message[0]?.status === 'auth_success') {
 console.log(' WebSocket authentication successful');
 resolve();
 } else if (message[0]?.ev === 'T') {
 // This is a trade message
 const trades = message as WebSocketOptionsFlow[];
 this.handleTradeMessages(trades);
 }
 } catch (error) {
 console.error(' Error parsing WebSocket message:', error);
 }
 });

 this.ws.on('error', (error) => {
 console.error(' WebSocket error:', error);
 reject(error);
 });

 this.ws.on('close', () => {
 console.log(' WebSocket connection closed');
 });

 } catch (error) {
 reject(error);
 }
 });
 }

 subscribeToOptionsFlow(tickers: string[] = ['*']) {
 if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
 console.error(' WebSocket not connected');
 return;
 }

 // Subscribe to options trades for all symbols
 const subscription = {
 action: 'subscribe',
 params: tickers.map(ticker => `T.${ticker}`).join(',')
 };

 console.log(' Subscribing to options flow:', subscription);
 this.ws.send(JSON.stringify(subscription));
 }

 addMessageHandler(handler: (data: WebSocketOptionsFlow[]) => void) {
 this.messageHandlers.push(handler);
 }

 private handleTradeMessages(trades: WebSocketOptionsFlow[]) {
 // Filter for options trades and pass to handlers
 const optionsTrades = trades.filter(trade => 
 trade.ev === 'T' && trade.sym && this.isOptionsTicker(trade.sym)
 );

 if (optionsTrades.length > 0) {
 console.log(` Received ${optionsTrades.length} options trades`);
 this.messageHandlers.forEach(handler => handler(optionsTrades));
 }
 }

 private isOptionsTicker(symbol: string): boolean {
 // Options tickers typically follow format: AAPL241025C00225000
 return /^[A-Z]+\d{6}[CP]\d{8}$/.test(symbol);
 }

 disconnect() {
 if (this.ws) {
 this.ws.close();
 this.ws = null;
 }
 }
}

// Enhanced options flow service that can use both REST and WebSocket
export class EnhancedOptionsFlowService {
 private polygonApiKey: string;
 private wsService: PolygonWebSocketService;
 private liveTradesBuffer: WebSocketOptionsFlow[] = [];

 constructor(apiKey: string) {
 this.polygonApiKey = apiKey;
 this.wsService = new PolygonWebSocketService(apiKey);
 
 // Set up WebSocket message handler
 this.wsService.addMessageHandler((trades) => {
 this.liveTradesBuffer.push(...trades);
 // Keep only last 1000 trades to prevent memory issues
 if (this.liveTradesBuffer.length > 1000) {
 this.liveTradesBuffer = this.liveTradesBuffer.slice(-1000);
 }
 });
 }

 async startLiveStream(): Promise<void> {
 try {
 await this.wsService.connect();
 this.wsService.subscribeToOptionsFlow(['*']); // Subscribe to all options
 console.log(' Live options flow stream started');
 } catch (error) {
 console.error(' Failed to start live stream:', error);
 throw error;
 }
 }

 getLiveTradesBuffer(): WebSocketOptionsFlow[] {
 return [...this.liveTradesBuffer];
 }

 clearBuffer() {
 this.liveTradesBuffer = [];
 }

 stopLiveStream() {
 this.wsService.disconnect();
 console.log(' Live options flow stream stopped');
 }
}