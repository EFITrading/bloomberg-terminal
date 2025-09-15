import '../terminal.css';
import Footer from '@/components/terminal/Footer';

export default function AISuite() {
  return (
    <>
      <div className="terminal-container">
        <div className="terminal-header">
          <div className="terminal-title">AI Suite - Artificial Intelligence Tools</div>
          <div className="terminal-controls">
            <span className="control-button minimize"></span>
            <span className="control-button maximize"></span>
            <span className="control-button close"></span>
          </div>
        </div>
        <div className="terminal-content">
          <div style={{ 
            padding: '40px', 
            textAlign: 'center',
            color: '#FFFFFF',
            fontSize: '18px',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            <h1 style={{ 
              color: '#FF6600', 
              fontSize: '32px', 
              marginBottom: '20px',
              fontWeight: '800'
            }}>
              AI Suite
            </h1>
            <p style={{ 
              maxWidth: '600px', 
              margin: '0 auto',
              lineHeight: '1.6',
              opacity: '0.9'
            }}>
              Advanced artificial intelligence tools for market analysis, 
              predictive modeling, and automated trading strategies.
            </p>
            <div style={{ 
              marginTop: '40px',
              padding: '20px',
              background: 'rgba(255, 102, 0, 0.1)',
              border: '1px solid rgba(255, 102, 0, 0.3)',
              borderRadius: '8px',
              maxWidth: '500px',
              margin: '40px auto 0'
            }}>
              <h3 style={{ color: '#FF6600', marginBottom: '15px' }}>Coming Features:</h3>
              <ul style={{ 
                textAlign: 'left', 
                listStyle: 'none', 
                padding: '0',
                lineHeight: '2'
              }}>
                <li>• AI-Powered Market Sentiment Analysis</li>
                <li>• Machine Learning Price Predictions</li>
                <li>• Automated Pattern Recognition</li>
                <li>• Neural Network Trading Signals</li>
                <li>• Natural Language Processing for News</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}