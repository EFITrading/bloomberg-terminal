'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

// Market quotes with animation types
const marketQuotes = [
  { text: "BULLS CHARGING", animation: "bulls", color: "#00FF88", condition: "bullish" },
  { text: "BEARS HUNTING", animation: "bears", color: "#FF0044", condition: "bearish" }, 
  { text: "VOLATILITY RISING", animation: "volatility", color: "#FFD700", condition: "highVol" },
  { text: "GAMMA SQUEEZE", animation: "gamma", color: "#00FFFF", condition: "highVolume" },
  { text: "OPTIONS EXPIRING", animation: "pulse", color: "#FF6600", condition: "expiration" },
  { text: "RALLY MODE", animation: "bulls", color: "#00FF88", condition: "strongBullish" },
  { text: "SELL THE RIP", animation: "bears", color: "#FF0044", condition: "strongBearish" },
  { text: "BUY THE DIP", animation: "bulls", color: "#00FF88", condition: "dip" },
  { text: "RISK OFF", animation: "bears", color: "#FF0044", condition: "vixHigh" },
  { text: "VOLUME SPIKE", animation: "gamma", color: "#00FFFF", condition: "highVolume" },
  { text: "BREAKOUT ALERT", animation: "bulls", color: "#00FF88", condition: "breakout" },
  { text: "MARKET LIVE", animation: "pulse", color: "#00FF88", condition: "neutral" }
];

// Function to determine market condition based on SPY data
const getMarketCondition = (spyData: any, vixData: any) => {
  if (!spyData || !vixData) return 'neutral';
  
  const priceChange = ((spyData.close - spyData.open) / spyData.open) * 100;
  const volume = spyData.volume;
  const avgVolume = spyData.avgVolume || 80000000; // SPY average volume
  const vix = vixData.close;
  
  // Check for options expiration (Fridays)
  const today = new Date();
  const dayOfWeek = today.getDay();
  if (dayOfWeek === 5) return 'expiration';
  
  // High VIX (fear)
  if (vix > 25) return 'vixHigh';
  
  // Strong bullish (up more than 1%)
  if (priceChange > 1) return 'strongBullish';
  
  // Strong bearish (down more than 1%)
  if (priceChange < -1) return 'strongBearish';
  
  // High volume (50% above average)
  if (volume > avgVolume * 1.5) return 'highVolume';
  
  // High volatility (VIX above 20)
  if (vix > 20) return 'highVol';
  
  // Bullish (up 0.3% to 1%)
  if (priceChange > 0.3) return 'bullish';
  
  // Bearish (down 0.3% to 1%)
  if (priceChange < -0.3) return 'bearish';
  
  // Dip (down but not extreme)
  if (priceChange < 0 && priceChange > -0.5) return 'dip';
  
  // Breakout (up significantly on high volume)
  if (priceChange > 0.5 && volume > avgVolume * 1.2) return 'breakout';
  
  return 'neutral';
};

export default function Navigation() {
 const { data: session } = useSession();
 const [currentTime, setCurrentTime] = useState('');
 const [isAuthenticated, setIsAuthenticated] = useState(false);
 const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
 const [isClient, setIsClient] = useState(false);
 const [marketQuote, setMarketQuote] = useState({ text: 'MARKET LIVE', animation: 'pulse', color: '#00FF88' });
 const pathname = usePathname();
 const router = useRouter();

 // Fix hydration - only run on client
 useEffect(() => {
 setIsClient(true);
 }, []);

 // Fetch live market data and update quote based on conditions
 useEffect(() => {
 if (!isClient) return;
 
 const updateMarketQuote = async () => {
 try {
 const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
 
 // Get SPY (market) data
 const spyResponse = await fetch(
 `https://api.polygon.io/v2/aggs/ticker/SPY/prev?adjusted=true&apikey=${POLYGON_API_KEY}`
 );
 const spyData = await spyResponse.json();
 
 // Get VIX (volatility) data
 const vixResponse = await fetch(
 `https://api.polygon.io/v2/aggs/ticker/I:VIX/prev?adjusted=true&apikey=${POLYGON_API_KEY}`
 );
 const vixData = await vixResponse.json();
 
 if (spyData.results && spyData.results[0] && vixData.results && vixData.results[0]) {
 const spy = spyData.results[0];
 const vix = vixData.results[0];
 
 const condition = getMarketCondition(spy, vix);
 const matchingQuotes = marketQuotes.filter(q => q.condition === condition);
 const selectedQuote = matchingQuotes.length > 0 
 ? matchingQuotes[Math.floor(Math.random() * matchingQuotes.length)]
 : marketQuotes[marketQuotes.length - 1]; // Default to "MARKET LIVE"
 
 setMarketQuote(selectedQuote);
 
 console.log('📊 Market Condition:', condition, '| Quote:', selectedQuote.text);
 console.log('📈 SPY Change:', ((spy.close - spy.open) / spy.open * 100).toFixed(2) + '%', '| VIX:', vix.close.toFixed(2));
 }
 } catch (error) {
 console.error('Error fetching market data:', error);
 }
 };
 
 updateMarketQuote(); // Initial fetch
 const interval = setInterval(updateMarketQuote, 60000); // Update every minute
 return () => clearInterval(interval);
 }, [isClient]);



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
 const hasDiscordAuth = (session as any)?.hasAccess;
 setIsAuthenticated(!!isAuth || !!hasDiscordAuth);
 };

 checkAuth();
 // Check auth status when pathname changes
 }, [pathname, isClient, session]);

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
             background: 'rgba(0, 0, 0, 0.8)',
             border: '2px solid rgba(255, 255, 255, 0.2)',
             borderRadius: '8px',
             boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)'
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
           <div className={`system-status market-quote-${marketQuote.animation}`} style={{ borderColor: marketQuote.color }}>
             <div className="status-indicator" style={{ background: marketQuote.color, boxShadow: `0 0 25px ${marketQuote.color}` }}></div>
             <span className="status-text" style={{ color: marketQuote.color }}>{marketQuote.text || 'MARKET LIVE'}</span>
           </div>
           {isClient && (
             <>
               {isAuthenticated ? (
                 session?.user?.image ? (
                   <button 
                     onClick={() => router.push('/account')}
                     className="flex items-center justify-center"
                     style={{ 
                       background: 'transparent',
                       border: 'none',
                       padding: '0',
                       cursor: 'pointer'
                     }}
                   >
                     <img 
                       src={session.user.image} 
                       alt="Profile" 
                       className="w-10 h-10 rounded-full border-2 border-gray-600 hover:border-gray-400 transition-all duration-300"
                       style={{
                         boxShadow: '0 0 8px rgba(0, 0, 0, 0.4)'
                       }}
                     />
                   </button>
                 ) : (
                   <button 
                     className="btn-login"
                     onClick={() => router.push('/account')}
                     style={{ 
                       background: 'linear-gradient(135deg, #FF6600 0%, #FF8833 100%)',
                       minWidth: '100px',
                       whiteSpace: 'nowrap'
                     }}
                   >
                     Member
                   </button>
                 )
               ) : (
                 <button 
                   className="btn-login"
                   onClick={() => {
                     router.push('/login');
                   }}
                   style={{
                     minWidth: '100px',
                     whiteSpace: 'nowrap'
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
           border: '2px solid rgba(255, 255, 255, 0.2)',
           color: '#FFFFFF',
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
             background: pathname === link.path ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
             border: `2px solid ${pathname === link.path ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
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
 <div className={`mobile-system-status market-quote-${marketQuote.animation}`} style={{ borderColor: marketQuote.color }}>
 <div className="status-indicator" style={{ background: marketQuote.color, boxShadow: `0 0 25px ${marketQuote.color}` }}></div>
 <span className="status-text" style={{ color: marketQuote.color }}>{marketQuote.text || 'MARKET LIVE'}</span>
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
