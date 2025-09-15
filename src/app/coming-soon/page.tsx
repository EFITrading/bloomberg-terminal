import '../terminal.css';
import Footer from '@/components/terminal/Footer';

export default function ComingSoon() {
  return (
    <>
      <div className="terminal-container">
        <div className="terminal-header">
          <div className="terminal-title">Coming Soon - Future Features</div>
          <div className="terminal-controls">
            <span className="control-button minimize"></span>
            <span className="control-button maximize"></span>
            <span className="control-button close"></span>
          </div>
        </div>
        <div className="terminal-content">
          <div style={{ 
            padding: '60px 40px', 
            textAlign: 'center',
            color: '#FFFFFF',
            fontSize: '18px',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            <h1 style={{ 
              color: '#FF6600', 
              fontSize: '48px', 
              marginBottom: '30px',
              fontWeight: '900',
              textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
            }}>
              COMING SOON
            </h1>
            <p style={{ 
              fontSize: '24px',
              maxWidth: '800px', 
              margin: '0 auto 40px',
              lineHeight: '1.5',
              opacity: '0.9',
              fontWeight: '300'
            }}>
              Revolutionary features are in development to enhance your trading experience
            </p>
            
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '30px',
              marginTop: '50px',
              maxWidth: '1200px',
              margin: '50px auto 0'
            }}>
              <div style={{ 
                padding: '30px',
                background: 'rgba(0, 0, 0, 0.8)',
                border: '2px solid rgba(255, 102, 0, 0.3)',
                borderRadius: '12px',
                backdropFilter: 'blur(8px)'
              }}>
                <h3 style={{ color: '#FF6600', marginBottom: '15px', fontSize: '20px' }}>
                  Options Flow Scanner
                </h3>
                <p style={{ lineHeight: '1.6', opacity: '0.8' }}>
                  Real-time options order flow analysis with institutional block detection
                </p>
              </div>
              
              <div style={{ 
                padding: '30px',
                background: 'rgba(0, 0, 0, 0.8)',
                border: '2px solid rgba(255, 102, 0, 0.3)',
                borderRadius: '12px',
                backdropFilter: 'blur(8px)'
              }}>
                <h3 style={{ color: '#FF6600', marginBottom: '15px', fontSize: '20px' }}>
                  Crypto Analytics
                </h3>
                <p style={{ lineHeight: '1.6', opacity: '0.8' }}>
                  Advanced cryptocurrency analysis tools with DeFi integration
                </p>
              </div>
              
              <div style={{ 
                padding: '30px',
                background: 'rgba(0, 0, 0, 0.8)',
                border: '2px solid rgba(255, 102, 0, 0.3)',
                borderRadius: '12px',
                backdropFilter: 'blur(8px)'
              }}>
                <h3 style={{ color: '#FF6600', marginBottom: '15px', fontSize: '20px' }}>
                  Global Markets
                </h3>
                <p style={{ lineHeight: '1.6', opacity: '0.8' }}>
                  International market coverage with forex and commodities
                </p>
              </div>
            </div>
            
            <div style={{ 
              marginTop: '60px',
              padding: '25px',
              background: 'rgba(255, 102, 0, 0.1)',
              border: '2px solid #FF6600',
              borderRadius: '10px',
              maxWidth: '600px',
              margin: '60px auto 0'
            }}>
              <p style={{ 
                fontSize: '16px',
                fontWeight: '600',
                color: '#FF6600',
                margin: '0'
              }}>
                Stay tuned for these exciting updates coming to the Bloomberg Terminal
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}