import '../terminal.css';
import Footer from '@/components/terminal/Footer';
import RRGAnalytics from '@/components/analytics/RRGAnalytics';

export default function Analytics() {
  return (
    <>
      <div className="terminal-container">
        <div className="terminal-header">
          <div className="terminal-title">Analytics - Relative Rotation Graph (RRG)</div>
          <div className="terminal-controls">
            <span className="control-button minimize"></span>
            <span className="control-button maximize"></span>
            <span className="control-button close"></span>
          </div>
        </div>
        <div className="terminal-content">
          <RRGAnalytics 
            defaultTimeframe="14 weeks"
            defaultBenchmark="SPY"
          />
        </div>
      </div>
      <Footer />
    </>
  );
}
