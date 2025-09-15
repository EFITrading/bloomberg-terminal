'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Navigation() {
  const [currentTime, setCurrentTime] = useState('');
  const pathname = usePathname();
  const router = useRouter();

  // Debug: Log pathname changes
  useEffect(() => {
    console.log('Navigation: pathname changed to:', pathname);
  }, [pathname]);

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
    { name: 'Analytics', path: '/analytics' },
    { name: 'AI Suite', path: '/ai-suite' },
    { name: 'Coming Soon', path: '/coming-soon' }
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
            <a
              key={link.path}
              href={link.path}
              className={`nav-link ${pathname === link.path ? 'active' : ''}`}
              onClick={(e) => {
                console.log('Navigation clicked:', link.name, link.path);
                // Allow default navigation behavior
              }}
            >
              {link.name}
            </a>
          ))}
        </div>

        <div className="nav-right">
          <div className="system-status">
            <div className="status-indicator"></div>
            <span className="status-text">System Online</span>
          </div>
          <button className="btn-login">Login</button>
        </div>
      </div>
    </nav>
  );
}
