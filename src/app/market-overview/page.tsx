import '../terminal.css';
import Background from '@/components/terminal/Background';
import Navigation from '@/components/terminal/Navigation';
import Footer from '@/components/terminal/Footer';

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
              <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Market Overview</h2>
              <p style={{ marginBottom: '1rem' }}>Market data and analysis will be displayed here.</p>
              <div style={{ 
                border: '1px solid #333', 
                padding: '1rem', 
                borderRadius: '4px',
                backgroundColor: '#001100'
              }}>
                <p>📊 Market functionality has been removed.</p>
                <p>💼 This page is now ready for your custom content.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
