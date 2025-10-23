'use client';

import React, { useState, useRef, useEffect } from 'react';

interface SymbolSearchProps {
 onSymbolSelect: (symbol: string) => void;
 initialSymbol: string;
}

interface SearchResult {
 ticker: string;
 name: string;
 market: string;
 type: string;
}

const SymbolSearch: React.FC<SymbolSearchProps> = ({ onSymbolSelect, initialSymbol }) => {
 const [searchTerm, setSearchTerm] = useState<string>(initialSymbol);
 const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
 const [isOpen, setIsOpen] = useState<boolean>(false);
 const [loading, setLoading] = useState<boolean>(false);
 const [recentSymbols, setRecentSymbols] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']);
 const [popularSymbols] = useState<string[]>(['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'ARKK', 'GLD']);
 
 const searchRef = useRef<HTMLDivElement>(null);
 const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

 useEffect(() => {
 const handleClickOutside = (event: MouseEvent) => {
 if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
 setIsOpen(false);
 }
 };

 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, []);

 useEffect(() => {
 // Load recent symbols from localStorage
 const stored = localStorage.getItem('recentSymbols');
 if (stored) {
 setRecentSymbols(JSON.parse(stored));
 }
 }, []);

 const handleSearch = async (term: string) => {
 if (term.length < 1) {
 setSearchResults([]);
 return;
 }

 setLoading(true);
 
 try {
 // For demo purposes, we'll search from a predefined list since Polygon's search is limited
 const allSymbols = [
 { ticker: 'AAPL', name: 'Apple Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'MSFT', name: 'Microsoft Corporation', market: 'stocks', type: 'CS' },
 { ticker: 'GOOGL', name: 'Alphabet Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'AMZN', name: 'Amazon.com Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'TSLA', name: 'Tesla Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'META', name: 'Meta Platforms Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'NVDA', name: 'NVIDIA Corporation', market: 'stocks', type: 'CS' },
 { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', market: 'stocks', type: 'ETF' },
 { ticker: 'QQQ', name: 'Invesco QQQ Trust', market: 'stocks', type: 'ETF' },
 { ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', market: 'stocks', type: 'ETF' },
 { ticker: 'IWM', name: 'iShares Russell 2000 ETF', market: 'stocks', type: 'ETF' },
 { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', market: 'stocks', type: 'ETF' },
 { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', market: 'stocks', type: 'ETF' },
 { ticker: 'JPM', name: 'JPMorgan Chase & Co.', market: 'stocks', type: 'CS' },
 { ticker: 'JNJ', name: 'Johnson & Johnson', market: 'stocks', type: 'CS' },
 { ticker: 'V', name: 'Visa Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'PG', name: 'Procter & Gamble Company', market: 'stocks', type: 'CS' },
 { ticker: 'UNH', name: 'UnitedHealth Group Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'HD', name: 'Home Depot Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'MA', name: 'Mastercard Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'BAC', name: 'Bank of America Corp.', market: 'stocks', type: 'CS' },
 { ticker: 'DIS', name: 'Walt Disney Company', market: 'stocks', type: 'CS' },
 { ticker: 'ADBE', name: 'Adobe Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'NFLX', name: 'Netflix Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'CRM', name: 'Salesforce Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'XOM', name: 'Exxon Mobil Corporation', market: 'stocks', type: 'CS' },
 { ticker: 'CVX', name: 'Chevron Corporation', market: 'stocks', type: 'CS' },
 { ticker: 'WMT', name: 'Walmart Inc.', market: 'stocks', type: 'CS' },
 { ticker: 'KO', name: 'Coca-Cola Company', market: 'stocks', type: 'CS' },
 { ticker: 'PFE', name: 'Pfizer Inc.', market: 'stocks', type: 'CS' }
 ];

 const filtered = allSymbols.filter(
 symbol => 
 symbol.ticker.toLowerCase().includes(term.toLowerCase()) ||
 symbol.name.toLowerCase().includes(term.toLowerCase())
 ).slice(0, 10);

 setSearchResults(filtered);
 } catch (error) {
 console.error('Search error:', error);
 setSearchResults([]);
 } finally {
 setLoading(false);
 }
 };

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const value = e.target.value.toUpperCase();
 setSearchTerm(value);
 setIsOpen(true);

 // Clear previous timeout
 if (searchTimeoutRef.current) {
 clearTimeout(searchTimeoutRef.current);
 }

 // Debounce search
 searchTimeoutRef.current = setTimeout(() => {
 handleSearch(value);
 }, 300);
 };

 const handleSymbolClick = (symbol: string) => {
 setSearchTerm(symbol);
 setIsOpen(false);
 
 // Add to recent symbols
 const newRecent = [symbol, ...recentSymbols.filter(s => s !== symbol)].slice(0, 8);
 setRecentSymbols(newRecent);
 localStorage.setItem('recentSymbols', JSON.stringify(newRecent));
 
 onSymbolSelect(symbol);
 };

 const handleInputFocus = () => {
 setIsOpen(true);
 if (searchTerm.length === 0) {
 setSearchResults([]);
 }
 };

 const handleKeyDown = (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && searchTerm.length > 0) {
 // If exact match in results, use it, otherwise use the typed symbol
 const exactMatch = searchResults.find(r => r.ticker === searchTerm);
 if (exactMatch) {
 handleSymbolClick(exactMatch.ticker);
 } else {
 handleSymbolClick(searchTerm);
 }
 }
 };

 return (
 <div className="symbol-search" ref={searchRef}>
 <div className="search-input-container">
 <input
 type="text"
 value={searchTerm}
 onChange={handleInputChange}
 onFocus={handleInputFocus}
 onKeyDown={handleKeyDown}
 placeholder="Enter symbol (e.g., AAPL, MSFT, SPY)"
 className="symbol-input"
 autoComplete="off"
 />
 <div className="search-icon"></div>
 </div>

 {isOpen && (
 <div className="search-dropdown">
 {loading && (
 <div className="search-loading">
 <div className="search-spinner"></div>
 <span>Searching...</span>
 </div>
 )}

 {!loading && searchResults.length > 0 && (
 <div className="search-section">
 <div className="search-section-title">Search Results</div>
 {searchResults.map((result) => (
 <div
 key={result.ticker}
 className="search-result-item"
 onClick={() => handleSymbolClick(result.ticker)}
 >
 <div className="result-symbol">{result.ticker}</div>
 <div className="result-name">{result.name}</div>
 <div className="result-type">{result.type}</div>
 </div>
 ))}
 </div>
 )}

 {!loading && searchResults.length === 0 && searchTerm.length === 0 && (
 <>
 <div className="search-section">
 <div className="search-section-title">Recent Symbols</div>
 {recentSymbols.map((symbol) => (
 <div
 key={symbol}
 className="search-result-item"
 onClick={() => handleSymbolClick(symbol)}
 >
 <div className="result-symbol">{symbol}</div>
 <div className="result-label">Recent</div>
 </div>
 ))}
 </div>

 <div className="search-section">
 <div className="search-section-title">Popular Symbols</div>
 {popularSymbols.map((symbol) => (
 <div
 key={symbol}
 className="search-result-item"
 onClick={() => handleSymbolClick(symbol)}
 >
 <div className="result-symbol">{symbol}</div>
 <div className="result-label">Popular</div>
 </div>
 ))}
 </div>
 </>
 )}

 {!loading && searchResults.length === 0 && searchTerm.length > 0 && (
 <div className="search-section">
 <div className="search-no-results">
 <div>No results found for &quot;{searchTerm}&quot;</div>
 <div 
 className="search-direct-option"
 onClick={() => handleSymbolClick(searchTerm)}
 >
 Use &quot;{searchTerm}&quot; anyway →
 </div>
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 );
};

export default SymbolSearch;
