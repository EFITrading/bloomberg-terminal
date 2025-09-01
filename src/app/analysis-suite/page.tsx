import '../terminal.css';
import Background from '@/components/terminal/Background';
import Navigation from '@/components/terminal/Navigation';
import Footer from '@/components/terminal/Footer';

export default function AnalysisSuite() {
  return (
    <>
      <Background />
      <Navigation />
      <main className="main-content">
        <div className="terminal-container">
          <div className="terminal-header">
            <div className="terminal-title">Analysis Suite</div>
            <div className="terminal-controls">
              <span className="control-button minimize"></span>
              <span className="control-button maximize"></span>
              <span className="control-button close"></span>
            </div>
          </div>
          <div className="terminal-content">
            <div className="hero-content">
              <h1 className="hero-title">Professional Analysis Suite</h1>
              <p className="hero-subtitle">
                Advanced technical analysis tools and charting capabilities
              </p>
              <div className="coming-soon">
                <h2>Coming Soon</h2>
                <p>Comprehensive analysis tools are currently in development.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
