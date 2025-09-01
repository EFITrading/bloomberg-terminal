import '../terminal.css';
import Background from '@/components/terminal/Background';
import Navigation from '@/components/terminal/Navigation';
import Footer from '@/components/terminal/Footer';

export default function DataDriven() {
  return (
    <>
      <Background />
      <Navigation />
      <main className="main-content">
        <div className="terminal-container">
          <div className="terminal-header">
            <div className="terminal-title">Data Driven</div>
            <div className="terminal-controls">
              <span className="control-button minimize"></span>
              <span className="control-button maximize"></span>
              <span className="control-button close"></span>
            </div>
          </div>
          <div className="terminal-content">
            <div className="hero-content">
              <h1 className="hero-title">Data-Driven Insights</h1>
              <p className="hero-subtitle">
                Quantitative analysis and data-driven investment strategies
              </p>
              <div className="coming-soon">
                <h2>Coming Soon</h2>
                <p>Data-driven analytics platform is currently in development.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
