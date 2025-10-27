'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Navigation() {
 const [currentTime, setCurrentTime] = useState('');
 const [isAuthenticated, setIsAuthenticated] = useState(false);
 const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
 const [isClient, setIsClient] = useState(false);
 const pathname = usePathname();
 const router = useRouter();

 // Fix hydration - only run on client
 useEffect(() => {
 setIsClient(true);
 }, []);



 useEffect(() => {
 if (!isClient) return;
 
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
 }, [isClient]);

 // Check authentication status
 useEffect(() => {
 if (!isClient) return;
 
 const checkAuth = () => {
 const cookies = document.cookie.split(';');
 const authCookie = cookies.find(cookie => cookie.trim().startsWith('efi-auth='));
 const isAuth = authCookie && authCookie.includes('authenticated');
 setIsAuthenticated(!!isAuth);
 };

 checkAuth();
 // Check auth status when pathname changes
 }, [pathname, isClient]);

 const navLinks = [
 { name: 'Market Overview', path: '/market-overview' },
 { name: 'Analysis Suite', path: '/analysis-suite' },
 { name: 'Data Driven', path: '/data-driven' },
 { name: 'Analytics', path: '/analytics' },
 { name: 'AI Suite', path: '/ai-suite' },
 { name: 'OptionsFlow', path: '/options-flow' }
 ];

 return (
 <>
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

 {/* Desktop Navigation */}
 <div className="nav-center desktop-nav">
 {navLinks.map((link) => (
 <a
 key={link.path}
 href={link.path}
 className={`nav-link ${pathname === link.path ? 'active' : ''}`}
 onClick={(e) => {
 // Allow default navigation behavior
 }}
 >
 {link.name}
 </a>
 ))}
 </div>

 <div className="nav-right">
         {/* Mobile Menu Button */}
         <button 
           className="mobile-menu-btn"
           onClick={() => {
             setIsMobileMenuOpen(!isMobileMenuOpen);
           }}
           aria-label="Toggle mobile menu"
           style={{ 
             display: 'flex', 
             zIndex: 10001,
             position: 'relative',
             flexDirection: 'column',
             justifyContent: 'center',
             alignItems: 'center',
             width: '50px',
             height: '50px',
             background: 'rgba(255, 102, 0, 0.3)',
             border: '3px solid #FF6600',
             borderRadius: '8px',
             boxShadow: '0 2px 8px rgba(255, 102, 0, 0.4)'
           }}
         >
           <span 
             className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}
             style={{
               width: '30px',
               height: '4px',
               background: '#FFFFFF',
               margin: '2px 0',
               borderRadius: '2px',
               display: 'block',
               boxShadow: '0 0 3px rgba(255, 255, 255, 0.8)'
             }}
           ></span>
           <span 
             className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}
             style={{
               width: '30px',
               height: '4px',
               background: '#FFFFFF',
               margin: '2px 0',
               borderRadius: '2px',
               display: 'block',
               boxShadow: '0 0 3px rgba(255, 255, 255, 0.8)'
             }}
           ></span>
           <span 
             className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}
             style={{
               width: '30px',
               height: '4px',
               background: '#FFFFFF',
               margin: '2px 0',
               borderRadius: '2px',
               display: 'block',
               boxShadow: '0 0 3px rgba(255, 255, 255, 0.8)'
             }}
           ></span>
         </button>

         {/* Desktop Status and Auth */}
         <div className="desktop-nav-right">
           <div className="system-status">
             <div className="status-indicator"></div>
             <span className="status-text">System Secured</span>
           </div>
           {isClient && (
             <>
               {isAuthenticated ? (
                 <button 
                   className="btn-login"
                   onClick={async () => {
                     try {
                       await fetch('/api/auth', { method: 'DELETE' });
                       document.cookie = 'efi-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                       router.push('/login');
                     } catch (error) {
                       console.error('Logout error:', error);
                       window.location.href = '/login';
                     }
                   }}
                 >
                   Logout
                 </button>
               ) : (
                 <button 
                   className="btn-login"
                   onClick={() => {
                     router.push('/login');
                   }}
                 >
                   Login
                 </button>
               )}
             </>
           )}
         </div>
 </div>
 </div>
 </nav>

 {/* Mobile Menu Overlay */}
 <div 
   className={`mobile-menu-overlay ${isMobileMenuOpen ? 'open' : ''}`}
   style={{
     position: 'fixed',
     top: 0,
     left: 0,
     width: '100vw',
     height: '100vh',
     background: isMobileMenuOpen ? 'rgba(0, 0, 0, 0.95)' : 'transparent',
     zIndex: isMobileMenuOpen ? 99999 : -1,
     opacity: isMobileMenuOpen ? 1 : 0,
     visibility: isMobileMenuOpen ? 'visible' : 'hidden',
     display: isMobileMenuOpen ? 'flex' : 'none',
     flexDirection: 'column',
     transition: 'all 0.3s ease'
   }}
 >
   <div 
     className="mobile-menu-content"
     style={{
       padding: '20px',
       height: '100%',
       background: 'rgba(0, 0, 0, 0.98)',
       color: 'white',
       position: 'relative'
     }}
   >
     <div className="mobile-menu-header" style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
       <div className="mobile-logo">
         <span className="logo-evolving" style={{ color: '#FF6600' }}>EFI</span>
         <span className="logo-finance" style={{ color: '#FFFFFF', marginLeft: '5px' }}>TERMINAL</span>
       </div>
       <button 
         className="mobile-close-btn"
         onClick={() => setIsMobileMenuOpen(false)}
         aria-label="Close mobile menu"
         style={{
           background: 'none',
           border: '2px solid #FF6600',
           color: '#FF6600',
           fontSize: '24px',
           width: '40px',
           height: '40px',
           borderRadius: '50%',
           cursor: 'pointer'
         }}
       >
         ×
       </button>
     </div>

     <div className="mobile-menu-links" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
       {navLinks.map((link) => (
         <a
           key={link.path}
           href={link.path}
           className={`mobile-nav-link ${pathname === link.path ? 'active' : ''}`}
           onClick={() => {
             setIsMobileMenuOpen(false);
           }}
           style={{
             display: 'flex',
             justifyContent: 'space-between',
             alignItems: 'center',
             padding: '15px 20px',
             background: pathname === link.path ? 'rgba(255, 102, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)',
             border: `2px solid ${pathname === link.path ? '#FF6600' : 'rgba(255, 255, 255, 0.1)'}`,
             borderRadius: '8px',
             color: '#FFFFFF',
             textDecoration: 'none',
             fontSize: '16px',
             fontWeight: '500'
           }}
         >
           <span className="mobile-link-text">{link.name}</span>
           <span className="mobile-link-arrow" style={{ color: '#FF6600' }}>→</span>
         </a>
       ))}
     </div>

 <div className="mobile-menu-footer">
 <div className="mobile-system-status">
 <div className="status-indicator"></div>
 <span className="status-text">System Secured</span>
 </div>
 {isClient && (
 <>
 {isAuthenticated ? (
 <button 
 className="mobile-btn-login"
 onClick={async () => {
 try {
 await fetch('/api/auth', { method: 'DELETE' });
 document.cookie = 'efi-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
 setIsMobileMenuOpen(false);
 router.push('/login');
 } catch (error) {
 console.error('Logout error:', error);
 window.location.href = '/login';
 }
 }}
 >
 Logout
 </button>
 ) : (
 <button 
 className="mobile-btn-login"
 onClick={() => {
 setIsMobileMenuOpen(false);
 router.push('/login');
 }}
 >
 Login
 </button>
 )}
 </>
 )}
 </div>
 </div>
 </div>
 </>
 );
}
