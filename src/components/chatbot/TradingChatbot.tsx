'use client';

import React, { useState, useRef, useEffect } from 'react';
import './TradingChatbot.css';

interface Message {
 id: string;
 type: 'user' | 'bot';
 content: string;
 timestamp: Date;
 isTyping?: boolean;
}

interface QuickAction {
 id: string;
 label: string;
 icon: string;
 subActions?: QuickAction[];
 command?: string;
}

interface MarketData {
 symbol: string;
 price: number;
 change: number;
 changePercent: number;
}

export default function TradingChatbot() {
 const quickActions: QuickAction[] = [
 {
 id: 'seasonals',
 label: 'Seasonals',
 icon: '',
 subActions: [
 { id: 'seasonality', label: 'Seasonality', icon: '', command: 'seasonality' },
 { id: 'best-trades', label: 'Best Trades', icon: '', command: 'best-trades' }
 ]
 },
 {
 id: 'rrg',
 label: 'RRG',
 icon: '',
 subActions: [
 { id: 'scan-quadrant', label: 'Scan Quadrant', icon: '', command: 'scan-quadrant' },
 { id: 'sector-overview', label: 'Sector Overview', icon: '', command: 'sector-overview' }
 ]
 }
 ];
 const [messages, setMessages] = useState<Message[]>([
 {
 id: '1',
 type: 'bot',
 content: ' **AI Trading Assistant - FULLY INTEGRATED** \n\nHello! I now have complete access to your Bloomberg Terminal data and can provide intelligent analysis across all your trading tools:\n\n **Seasonal Analysis**: \n• "What is the best seasonal period for AAPL?"\n• "When should I buy SMH seasonally?"\n• "Show me seasonal patterns for any ticker"\n\n **RRG Analysis**: \n• "What quadrant is SMH in on the RRG chart?"\n• "Which sectors are in the leading quadrant?"\n• "Show me current RRG positioning"\n\n **Market Regimes & Industry Strength**: \n• "What is the strongest industry right now?"\n• "Which industries are breaking out?"\n• "Show me current market rotation signals"\n\n **Real-time Intelligence**: \nI can navigate between your Data-driven page (seasonality), Analytics suite (RRG), and Market Overview to provide comprehensive analysis.\n\n**Try the quick action buttons below or ask me anything!** I\'ll analyze the data from your charts and give you actionable insights.',
 timestamp: new Date()
 }
 ]);
 const [inputValue, setInputValue] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [isMinimized, setIsMinimized] = useState(false);
 const [selectedAction, setSelectedAction] = useState<string | null>(null);
 const [pendingTicker, setPendingTicker] = useState<string>('');
 const messagesEndRef = useRef<HTMLDivElement>(null);
 const inputRef = useRef<HTMLInputElement>(null);

 const formatFinancialContent = (content: string): string => {
 return content
 // Highlight stock symbols (3-5 uppercase letters)
 .replace(/\b([A-Z]{2,5})\b/g, '<span style="color: #ffff00; font-weight: bold; text-shadow: 0 0 8px rgba(255, 255, 0, 0.6);">$1</span>')
 // Highlight percentages
 .replace(/([+-]?\d+\.?\d*%)/g, '<span style="color: #00ccff; font-weight: bold; text-shadow: 0 0 6px rgba(0, 204, 255, 0.6);">$1</span>')
 // Highlight dollar amounts
 .replace(/(\$[\d,]+\.?\d*)/g, '<span style="color: #00ff88; font-weight: bold; text-shadow: 0 0 6px rgba(0, 255, 136, 0.6);">$1</span>')
 // Highlight important terms
 .replace(/\b(Leading|Weakening|Lagging|Improving)\b/g, '<span style="color: #ff8800; font-weight: bold; text-shadow: 0 0 6px rgba(255, 136, 0, 0.6);">$1</span>')
 // Highlight quadrant terms
 .replace(/\b(Quadrant|RRG|Bullish|Bearish)\b/g, '<span style="color: #ff6600; font-weight: bold; text-shadow: 0 0 6px rgba(255, 102, 0, 0.6);">$1</span>')
 // Highlight emoji and status indicators
 .replace(/(|||||||||)/g, '<span style="filter: drop-shadow(0 0 8px rgba(0, 255, 0, 0.8)); font-size: 16px;">$1</span>');
 };

 const scrollToBottom = () => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 };

 useEffect(() => {
 scrollToBottom();
 }, [messages]);

 const validateInput = (message: string): boolean => {
 if (!message || typeof message !== 'string') return false;
 if (message.length > 1000) return false;
 
 // Block potential injection attempts
 const dangerous = ['<script', 'javascript:', 'eval(', 'function(', 'document.', 'window.'];
 return !dangerous.some(pattern => message.toLowerCase().includes(pattern));
 };

 const formatMarketData = (data: MarketData[]): string => {
 return data.map(stock => 
 ` ${stock.symbol}: $${stock.price.toFixed(2)} (${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}, ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%)`
 ).join('\n');
 };

 const getPageData = () => {
 try {
 // Extract watchlist data from the page
 const watchlistData: any[] = [];
 
 // Try to find watchlist tables or data elements
 const tables = document.querySelectorAll('table');
 const rows = document.querySelectorAll('tr');
 
 // Look for stock data patterns
 rows.forEach(row => {
 const cells = row.querySelectorAll('td, th');
 if (cells.length >= 3) {
 const text = row.textContent || '';
 // Look for stock symbols (2-5 capital letters)
 const symbolMatch = text.match(/\b[A-Z]{2,5}\b/);
 // Look for prices ($XXX.XX)
 const priceMatch = text.match(/\$?\d+\.?\d*/);
 // Look for changes (+/-X.XX)
 const changeMatch = text.match(/[+-]?\d+\.?\d*%?/);
 
 if (symbolMatch && priceMatch) {
 watchlistData.push({
 symbol: symbolMatch[0],
 price: parseFloat(priceMatch[0].replace('$', '')),
 change: changeMatch ? parseFloat(changeMatch[0].replace('%', '')) : 0,
 source: 'page_scan'
 });
 }
 }
 });
 
 // Also check for any data attributes or global variables
 const windowData = (window as any).marketData || (window as any).watchlistData || null;
 
 return {
 watchlistData,
 windowData,
 timestamp: new Date().toISOString(),
 scannedElements: {
 tables: tables.length,
 rows: rows.length,
 foundStocks: watchlistData.length
 }
 };
 } catch (error) {
 console.error('Error extracting page data:', error);
 return null;
 }
 };

 const getAIResponse = async (userMessage: string): Promise<string> => {
 try {
 console.log(' Sending message to API:', userMessage);
 
 // Extract live data from the page
 const pageData = getPageData();
 console.log(' Extracted page data:', pageData);

 const response = await fetch('/api/chatbot', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ 
 message: userMessage,
 pageData: pageData 
 })
 });

 console.log(' Response status:', response.status);

 if (!response.ok) {
 if (response.status === 429) {
 throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
 }
 throw new Error('Failed to get response from AI assistant.');
 }

 const data = await response.json();
 console.log(' Received API response:', data);
 
 // Try both 'response' and 'message' fields for compatibility
 const aiResponse = data.response || data.message || 'I apologize, but I couldn\'t generate a proper response. Please try again.';
 console.log(' Final response:', aiResponse);
 return aiResponse;
 } catch (error) {
 console.error(' API Error:', error);
 
 if (error instanceof Error) {
 if (error.message.includes('Rate limit')) {
 return '⏱ **Rate Limit Reached**\n\nYou\'ve sent too many messages too quickly. Please wait a moment and try again.\n\n This protection helps ensure fair usage for all users.';
 }
 }
 
 // Fallback to local response for critical errors
 return getFallbackResponse(userMessage);
 }
 };

 const getFallbackResponse = (userMessage: string): string => {
 const lowerMessage = userMessage.toLowerCase();
 
 if (lowerMessage.includes('help')) {
 return ` **AI Trading Assistant (Offline Mode)**\n\nI can help you with:\n• Market analysis and trading concepts\n• Risk management strategies\n• Economic indicators explanation\n• Portfolio diversification tips\n• Technical analysis basics\n\n Currently running in offline mode. Some features may be limited.`;
 }
 
 return ` **Trading Assistant**\n\nI understand you're asking about "${userMessage}".\n\n**General Trading Principles:**\n• Always do your own research (DYOR)\n• Never invest more than you can afford to lose\n• Diversify your portfolio across asset classes\n• Have a clear risk management strategy\n• Stay informed about market conditions\n\n Currently experiencing connectivity issues. Please try again in a moment.\n\n **Educational Reminder**: All responses are for educational purposes only, not financial advice.`;
 };

 // Quick action handlers
 const handleQuickAction = (action: QuickAction) => {
 if (action.subActions) {
 // Main category clicked, show sub-options
 setSelectedAction(action.id);
 } else if (action.command) {
 // Sub-action clicked
 if (action.command === 'best seasonal trade' || action.command === 'sector quadrants') {
 // Commands that don't need a ticker
 setInputValue(action.command);
 setSelectedAction(null);
 setPendingTicker('');
 handleSendMessage();
 } else {
 // Commands that need a ticker (seasonal, quadrant)
 setSelectedAction(action.id);
 setPendingTicker(action.command);
 setInputValue('');
 inputRef.current?.focus();
 }
 }
 };

 const handleTickerSubmit = async (ticker: string) => {
 if (!ticker.trim() || !pendingTicker) return;
 
 const command = `${ticker.toUpperCase()} ${pendingTicker}`;
 setInputValue(command);
 setSelectedAction(null);
 setPendingTicker('');
 
 // Auto-send the command
 const userMessage: Message = {
 id: Date.now().toString(),
 type: 'user',
 content: command,
 timestamp: new Date()
 };

 setMessages(prev => [...prev, userMessage]);
 setInputValue('');
 setIsLoading(true);

 // Add typing indicator
 const typingMessage: Message = {
 id: 'typing',
 type: 'bot',
 content: 'Analyzing market data...',
 timestamp: new Date(),
 isTyping: true
 };
 
 setMessages(prev => [...prev, typingMessage]);

 try {
 await new Promise(resolve => setTimeout(resolve, 1500));
 const response = await getAIResponse(command);
 
 setMessages(prev => prev.filter(msg => msg.id !== 'typing'));
 
 const botMessage: Message = {
 id: (Date.now() + 1).toString(),
 type: 'bot',
 content: response,
 timestamp: new Date()
 };

 setMessages(prev => [...prev, botMessage]);
 } catch (error) {
 setMessages(prev => prev.filter(msg => msg.id !== 'typing'));
 
 const errorMessage: Message = {
 id: (Date.now() + 1).toString(),
 type: 'bot',
 content: ' I encountered an error processing your request. Please try again or rephrase your question.',
 timestamp: new Date()
 };
 
 setMessages(prev => [...prev, errorMessage]);
 } finally {
 setIsLoading(false);
 }
 };

 const handleSendMessage = async () => {
 if (!inputValue.trim() || isLoading) return;
 
 // If we're waiting for a ticker input
 if (pendingTicker && selectedAction) {
 await handleTickerSubmit(inputValue.trim());
 return;
 }
 
 if (!validateInput(inputValue)) {
 alert('Invalid input. Please check your message and try again.');
 return;
 }

 const userMessage: Message = {
 id: Date.now().toString(),
 type: 'user',
 content: inputValue.trim(),
 timestamp: new Date()
 };

 setMessages(prev => [...prev, userMessage]);
 setInputValue('');
 setIsLoading(true);

 // Add typing indicator
 const typingMessage: Message = {
 id: 'typing',
 type: 'bot',
 content: 'Analyzing market data...',
 timestamp: new Date(),
 isTyping: true
 };
 
 setMessages(prev => [...prev, typingMessage]);

 try {
 // Simulate API call delay
 await new Promise(resolve => setTimeout(resolve, 1500));
 
 const response = await getAIResponse(userMessage.content);
 
 // Remove typing indicator and add response
 setMessages(prev => prev.filter(msg => msg.id !== 'typing'));
 
 const botMessage: Message = {
 id: (Date.now() + 1).toString(),
 type: 'bot',
 content: response,
 timestamp: new Date()
 };

 setMessages(prev => [...prev, botMessage]);
 } catch (error) {
 setMessages(prev => prev.filter(msg => msg.id !== 'typing'));
 
 const errorMessage: Message = {
 id: (Date.now() + 1).toString(),
 type: 'bot',
 content: ' I encountered an error processing your request. Please try again or rephrase your question.',
 timestamp: new Date()
 };
 
 setMessages(prev => [...prev, errorMessage]);
 } finally {
 setIsLoading(false);
 }
 };

 const handleKeyPress = (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 handleSendMessage();
 }
 if (e.key === 'Escape') {
 // Cancel current action
 setSelectedAction(null);
 setPendingTicker('');
 setInputValue('');
 }
 };

 const clearChat = () => {
 setMessages([
 {
 id: '1',
 type: 'bot',
 content: 'Chat cleared! How can I help you with your trading questions?',
 timestamp: new Date()
 }
 ]);
 };

 return (
 <div className={`trading-chatbot ${isMinimized ? 'minimized' : ''}`}>
 <div className="chatbot-header">
 <div className="chatbot-title">
 <span className="chatbot-icon"></span>
 AI Trading Assistant
 <span className="status-indicator online"></span>
 </div>
 <div className="chatbot-controls">
 <button 
 className="control-btn clear" 
 onClick={clearChat}
 title="Clear chat"
 >
 
 </button>
 <button 
 className="control-btn minimize" 
 onClick={() => setIsMinimized(!isMinimized)}
 title={isMinimized ? "Expand" : "Minimize"}
 >
 {isMinimized ? '' : ''}
 </button>
 </div>
 </div>
 
 {!isMinimized && (
 <>
 <div className="chatbot-messages">
 {messages.map((message) => (
 <div key={message.id} className={`message ${message.type}`}>
 <div className="message-content">
 {message.isTyping ? (
 <div className="typing-indicator">
 <span></span>
 <span></span>
 <span></span>
 </div>
 ) : (
 <div 
 style={{ 
 whiteSpace: 'pre-wrap', 
 fontFamily: 'inherit',
 fontSize: '15px',
 lineHeight: '1.6'
 }}
 dangerouslySetInnerHTML={{
 __html: formatFinancialContent(message.content)
 }}
 />
 )}
 </div>
 <div className="message-time">
 {message.timestamp.toLocaleTimeString([], { 
 hour: '2-digit', 
 minute: '2-digit' 
 })}
 </div>
 </div>
 ))}
 <div ref={messagesEndRef} />
 </div>
 
 {/* Quick Action Buttons */}
 <div className="trading-chatbot-quick-actions">
 {pendingTicker ? (
 <div className="ticker-input-mode">
 <div className="action-indicator">
 <span className="action-icon"></span>
 <span className="action-text">{selectedAction}</span>
 <span className="ticker-prompt">Enter ticker symbol:</span>
 </div>
 <button 
 className="cancel-action"
 onClick={() => {
 setSelectedAction(null);
 setPendingTicker('');
 setInputValue('');
 }}
 >
 Cancel
 </button>
 </div>
 ) : (
 <div className="quick-actions-grid">
 {quickActions.map((action) => (
 <div key={action.id} className="action-group">
 <button 
 className="primary-action-btn"
 onClick={() => setSelectedAction(selectedAction === action.id ? null : action.id)}
 >
 <span className="action-icon">{action.icon}</span>
 <span className="action-label">{action.label}</span>
 </button>
 
 {selectedAction === action.id && action.subActions && (
 <div className="sub-actions">
 {action.subActions.map((subAction) => (
 <button
 key={subAction.id}
 className="sub-action-btn"
 onClick={() => handleQuickAction(subAction)}
 >
 {subAction.label}
 </button>
 ))}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 
 <div className="chatbot-input">
 <div className="input-container">
 <input
 ref={inputRef}
 type="text"
 value={inputValue}
 onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
 onKeyPress={handleKeyPress}
 placeholder={pendingTicker ? "Enter ticker symbol (e.g., AAPL, TSLA)" : "Use quick actions above or ask: 'What quadrant is XLK in?'"}
 disabled={isLoading}
 maxLength={1000}
 />
 <button 
 onClick={handleSendMessage} 
 disabled={isLoading || !inputValue.trim()}
 className="send-button"
 >
 {isLoading ? '' : ''}
 </button>
 </div>
 <div className="input-footer">
 <span className="character-count">{inputValue.length}/1000</span>
 <span className="disclaimer">AI responses are for educational purposes only</span>
 </div>
 </div>
 </>
 )}
 </div>
 );
}
