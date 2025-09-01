import '../terminal.css';
import Background from '@/components/terminal/Background';
import Navigation from '@/components/terminal/Navigation';
import Footer from '@/components/terminal/Footer';

export default function Analytics() {
  return (
    <>
      <Background />
      <Navigation />
      <main className="main-content">
        <div className="terminal-container">
          <div className="terminal-header">
            <div className="terminal-title">Analytics</div>
            <div className="terminal-controls">
              <span className="control-button minimize"></span>
              <span className="control-button maximize"></span>
              <span className="control-button close"></span>
            </div>
          </div>
          <div className="terminal-content">
            <div className="hero-content">
              <h1 className="hero-title">Advanced Analytics</h1>
              <p className="hero-subtitle">
                Sophisticated analytics tools for professional traders and analysts
              </p>
              <div className="coming-soon">
                <h2>Coming Soon</h2>
                <p>Advanced analytics features are currently in development.</p>
                <p>For now, visit the <a href="/data-driven" style={{color: '#00ff88'}}>Data-Driven</a> page for seasonal analysis.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
