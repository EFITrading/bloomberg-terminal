'use client';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  const footerLinks = [
    { name: 'Documentation', href: '#' },
    { name: 'API Reference', href: '#' },
    { name: 'Support', href: '#' },
    { name: 'Terms', href: '#' },
    { name: 'Privacy', href: '#' }
  ];

  return (
    <footer className="footer enhanced">
      <div className="footer-content">
        <div className="footer-main">
          <div className="footer-brand">
            <div className="footer-logo">
              <span className="logo-text">EVOLVING FINANCE</span>
              <span className="logo-subtitle">Professional Trading Platform</span>
            </div>
            <p className="footer-description">
              Institutional-grade financial analytics and trading intelligence platform 
              trusted by hedge funds, investment banks, and professional traders worldwide.
            </p>
          </div>
          
          <div className="footer-links">
            <div className="footer-section">
              <h4 className="footer-title">Platform</h4>
              <ul className="footer-list">
                <li><a href="#" className="footer-link">Live Terminal</a></li>
                <li><a href="#" className="footer-link">Analytics Suite</a></li>
                <li><a href="#" className="footer-link">Market Data</a></li>
                <li><a href="#" className="footer-link">Research Tools</a></li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h4 className="footer-title">Resources</h4>
              <ul className="footer-list">
                <li><a href="#" className="footer-link">Documentation</a></li>
                <li><a href="#" className="footer-link">API Reference</a></li>
                <li><a href="#" className="footer-link">Tutorials</a></li>
                <li><a href="#" className="footer-link">Webinars</a></li>
              </ul>
            </div>
            
            <div className="footer-section">
              <h4 className="footer-title">Support</h4>
              <ul className="footer-list">
                <li><a href="#" className="footer-link">Help Center</a></li>
                <li><a href="#" className="footer-link">Contact Us</a></li>
                <li><a href="#" className="footer-link">Status Page</a></li>
                <li><a href="#" className="footer-link">Community</a></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="footer-legal">
            <p className="copyright">
              © {currentYear} Evolving Finance Institute. All rights reserved.
            </p>
            <div className="footer-nav">
              {footerLinks.map((link, index) => (
                <a key={index} href={link.href} className="footer-nav-link">
                  {link.name}
                </a>
              ))}
            </div>
          </div>
          
          <div className="footer-status">
            <div className="status-indicator active"></div>
            <span className="status-text">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
