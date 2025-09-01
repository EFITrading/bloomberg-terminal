'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Navigation() {
  const [currentTime, setCurrentTime] = useState('');
  const pathname = usePathname();

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}:${seconds} EST`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const navLinks = [
    { name: 'Market Overview', path: '/market-overview' },
    { name: 'Analysis Suite', path: '/analysis-suite' },
    { name: 'Data Driven', path: '/data-driven' },
    { name: 'Analytics', path: '/analytics' }
  ];

  return (
    <nav className="nav">
      <div className="nav-main">
        <div className="nav-brand">
          <Link 
            href="/" 
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="logo-text-container">
              <div className="logo-text-main">
                <span className="logo-evolving">EVOLVING</span>
                <span className="logo-finance">FINANCE</span>
              </div>
              <div className="logo-underline"></div>
              <div className="logo-institute">INSTITUTE</div>
            </div>
          </Link>
        </div>

        <div className="nav-center">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.path}
              className={`nav-link ${pathname === link.path ? 'active' : ''}`}
            >
              {link.name}
            </Link>
          ))}
        </div>

        <div className="nav-right">
          <div className="system-status">
            <div className="status-indicator"></div>
            <span className="status-text">System Online</span>
          </div>
          <div className="time-display">{currentTime}</div>
          <button className="btn-launch">Access Terminal</button>
        </div>
      </div>
    </nav>
  );
}
