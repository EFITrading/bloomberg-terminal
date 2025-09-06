# Trading Chatbot Component

## Overview
A secure, AI-powered trading assistant chatbot built for the Bloomberg Terminal clone. Provides market analysis, trading insights, and educational content.

## Features
- 🤖 AI-powered responses for trading and market questions
- 📊 Real-time market data integration (via Polygon API)
- 🔒 Security features (rate limiting, input validation, XSS protection)
- 📱 Responsive design with terminal-style UI
- ⚡ Real-time typing indicators and smooth animations
- 🛡️ Educational content disclaimer

## Security Measures
- Input validation and sanitization
- Rate limiting (30 requests/minute per IP)
- XSS and injection attack prevention
- Secure API communication
- No sensitive data logging

## Usage
```tsx
import TradingChatbot from '@/components/chatbot/TradingChatbot';

export default function Page() {
  return (
    <div>
      {/* Your page content */}
      <TradingChatbot />
    </div>
  );
}
```

## Environment Variables Required
```env
POLYGON_API_KEY=your_polygon_api_key_here
```

## Styling
The component includes its own CSS file (`TradingChatbot.css`) with a terminal-themed design that matches the Bloomberg Terminal aesthetic.

## API Endpoint
The chatbot communicates with `/api/chatbot` which handles:
- Message processing
- Rate limiting
- Market data fetching
- AI response generation

## Educational Disclaimer
All responses are for educational purposes only and do not constitute financial advice.
