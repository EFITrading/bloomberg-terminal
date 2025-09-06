import '../terminal.css';
import Background from '@/components/terminal/Background';
import Navigation from '@/components/terminal/Navigation';
import Footer from '@/components/terminal/Footer';
import TradingChatbot from '@/components/chatbot/TradingChatbot';

export default function MarketPage() {
  return (
    <>
      <Background />
      <Navigation />
      <main className="main-content">
        <div className="terminal-container">
          <div className="terminal-header">
            <div className="terminal-title">Market Overview</div>
            <div className="terminal-controls">
              <span className="control-button minimize"></span>
              <span className="control-button maximize"></span>
              <span className="control-button close"></span>
            </div>
          </div>
          <div className="terminal-content">
            <div className="market-overview-content" style={{ padding: '2rem', color: '#00ff00' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Market Overview & AI Assistant</h2>
              <p style={{ marginBottom: '1rem' }}>Welcome to your enhanced trading terminal with AI-powered market analysis.</p>
              
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                <div style={{ 
                  border: '1px solid #00ff00', 
                  padding: '1rem', 
                  borderRadius: '8px',
                  backgroundColor: '#001100'
                }}>
                  <h3 style={{ marginBottom: '0.5rem', color: '#00ff00' }}>🤖 AI Trading Assistant</h3>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
                    Your personal AI assistant now connects to REAL DATA from your analytics and seasonal screening pages. 
                    Ask specific questions about RRG positions, seasonal patterns, and get live market insights!
                  </p>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#888' }}>
                    <strong>Connected Data Sources:</strong> RRG Analytics • Seasonal Screener • Market Data API
                  </div>
                </div>
                
                <div style={{ 
                  border: '1px solid #00ff00', 
                  padding: '1rem', 
                  borderRadius: '8px',
                  backgroundColor: '#001100'
                }}>
                  <h3 style={{ marginBottom: '0.5rem', color: '#00ff00' }}>📊 Live Data Features</h3>
                  <ul style={{ fontSize: '0.9rem', lineHeight: 1.6, paddingLeft: '1rem' }}>
                    <li><strong>RRG Analysis:</strong> Real-time quadrant positions for all sector ETFs</li>
                    <li><strong>Seasonal Patterns:</strong> Active trading opportunities from your screener</li>
                    <li><strong>Market Data:</strong> Live price feeds via Polygon API</li>
                    <li><strong>Smart Analysis:</strong> Contextual insights based on your data</li>
                    <li><strong>Multi-timeframe:</strong> 4W, 8W, 14W, 26W, 52W analysis</li>
                  </ul>
                </div>
                
                <div style={{ 
                  border: '1px solid #00ff00', 
                  padding: '1rem', 
                  borderRadius: '8px',
                  backgroundColor: '#001100'
                }}>
                  <h3 style={{ marginBottom: '0.5rem', color: '#00ff00' }}>� Security Features</h3>
                  <ul style={{ fontSize: '0.9rem', lineHeight: 1.6, paddingLeft: '1rem' }}>
                    <li>Secure API communication</li>
                    <li>Rate limiting protection</li>
                    <li>Input validation & sanitization</li>
                    <li>Educational content only</li>
                    <li>No financial advice liability</li>
                  </ul>
                </div>
                
                <div style={{ 
                  border: '1px solid #ffa500', 
                  padding: '1rem', 
                  borderRadius: '8px',
                  backgroundColor: '#332200'
                }}>
                  <h3 style={{ marginBottom: '0.5rem', color: '#ffa500' }}>⚠️ Important Disclaimer</h3>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.4, color: '#ffa500' }}>
                    All AI responses are for educational purposes only and do not constitute financial advice. 
                    Always do your own research and consult with qualified professionals before making investment decisions.
                  </p>
                </div>
              </div>
              
              <div style={{ 
                border: '1px solid #333', 
                padding: '1.5rem', 
                borderRadius: '8px',
                backgroundColor: '#0a0a0a',
                textAlign: 'center'
              }}>
                <h3 style={{ marginBottom: '1rem', color: '#00ff00' }}>� Get Started</h3>
                <p style={{ marginBottom: '1rem' }}>
                  Try asking specific questions about your live data:
                </p>
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '0.5rem', 
                  justifyContent: 'center',
                  marginBottom: '1rem'
                }}>
                  <span style={{ 
                    background: '#004400', 
                    padding: '0.3rem 0.8rem', 
                    borderRadius: '15px', 
                    fontSize: '0.8rem',
                    border: '1px solid #00ff00'
                  }}>
                    "What quadrant is XLK in right now?"
                  </span>
                  <span style={{ 
                    background: '#004400', 
                    padding: '0.3rem 0.8rem', 
                    borderRadius: '15px', 
                    fontSize: '0.8rem',
                    border: '1px solid #00ff00'
                  }}>
                    "Any active bearish seasonal trades?"
                  </span>
                  <span style={{ 
                    background: '#004400', 
                    padding: '0.3rem 0.8rem', 
                    borderRadius: '15px', 
                    fontSize: '0.8rem',
                    border: '1px solid #00ff00'
                  }}>
                    "Show me seasonal patterns for ADBE"
                  </span>
                  <span style={{ 
                    background: '#004400', 
                    padding: '0.3rem 0.8rem', 
                    borderRadius: '15px', 
                    fontSize: '0.8rem',
                    border: '1px solid #00ff00'
                  }}>
                    "RRG overview for 14 weeks"
                  </span>
                </div>
                <p style={{ fontSize: '0.9rem', color: '#888' }}>
                  Look for the 🤖 chatbot icon in the bottom-right corner!
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <TradingChatbot />
    </>
  );
}
