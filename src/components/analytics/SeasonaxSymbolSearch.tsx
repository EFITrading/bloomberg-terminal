'use client';

import React, { useState, useRef, useEffect } from 'react';

interface SeasonaxSymbolSearchProps {
 onSymbolSelect: (symbol: string) => void;
 initialSymbol: string;
 onElectionPeriodSelect?: (period: string) => void;
 onElectionModeToggle?: (isElectionMode: boolean) => void;
}

const SeasonaxSymbolSearch: React.FC<SeasonaxSymbolSearchProps> = ({ 
 onSymbolSelect, 
 initialSymbol,
 onElectionPeriodSelect,
 onElectionModeToggle
}) => {
 const [searchTerm, setSearchTerm] = useState<string>(initialSymbol);
 const [isOpen, setIsOpen] = useState<boolean>(false);
 const [isElectionDropdownOpen, setIsElectionDropdownOpen] = useState<boolean>(false);
 const [selectedElectionPeriod, setSelectedElectionPeriod] = useState<string>('Normal Mode');
 const [isElectionMode, setIsElectionMode] = useState<boolean>(false);
 const [recentSymbols] = useState<string[]>(['MSFT', 'AAPL', 'GOOGL', 'AMZN', 'TSLA', 'NVDA']);
 
 const searchRef = useRef<HTMLDivElement>(null);

 const electionPeriods = [
 'Normal Mode',
 'Election Year',
 'Post-Election',
 'Mid-Term',
 'Pre-Election'
 ];

 useEffect(() => {
 const handleClickOutside = (event: MouseEvent) => {
 if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
 setIsOpen(false);
 setIsElectionDropdownOpen(false);
 }
 };

 document.addEventListener('mousedown', handleClickOutside);
 return () => document.removeEventListener('mousedown', handleClickOutside);
 }, []);

 const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const value = e.target.value.toUpperCase();
 setSearchTerm(value);
 setIsOpen(true);
 };

 const handleSymbolClick = (symbol: string) => {
 setSearchTerm(symbol);
 setIsOpen(false);
 onSymbolSelect(symbol);
 };

 const handleKeyDown = (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && searchTerm.length > 0) {
 handleSymbolClick(searchTerm);
 }
 };

 const getCompanyName = (symbol: string): string => {
 const companies: { [key: string]: string } = {
 'MSFT': 'Microsoft Corporation',
 'AAPL': 'Apple Inc.',
 'GOOGL': 'Alphabet Inc.',
 'AMZN': 'Amazon.com Inc.',
 'TSLA': 'Tesla Inc.',
 'NVDA': 'NVIDIA Corporation',
 'META': 'Meta Platforms Inc.',
 'SPY': 'SPDR S&P 500 ETF',
 'QQQ': 'Invesco QQQ Trust',
 'DIA': 'SPDR Dow Jones Industrial Average ETF'
 };
 return companies[symbol] || symbol;
 };

 const handleElectionClick = () => {
 setIsElectionDropdownOpen(!isElectionDropdownOpen);
 setIsOpen(false); // Close search dropdown if open
 };

 const handleElectionPeriodSelect = (period: string) => {
 setSelectedElectionPeriod(period);
 setIsElectionDropdownOpen(false);
 console.log('Selected election period:', period);
 
 if (period === 'Normal Mode') {
 // Switch back to normal mode
 setIsElectionMode(false);
 if (onElectionModeToggle) {
 onElectionModeToggle(false);
 }
 } else {
 // Switch to election mode
 setIsElectionMode(true);
 if (onElectionModeToggle) {
 onElectionModeToggle(true);
 }
 // Notify parent component about election period selection
 if (onElectionPeriodSelect) {
 onElectionPeriodSelect(period);
 }
 }
 };

 return (
 <div className="seasonax-symbol-search" ref={searchRef}>
 <div className="symbol-display">
 <div className="symbol-main">
 <span className="symbol-ticker">{searchTerm}</span>
 <div className="election-dropdown-container">
 <button 
 className={`election-btn ${isElectionMode ? 'active' : 'inactive'}`}
 onClick={handleElectionClick}
 >
 <span className="election-text">{selectedElectionPeriod}</span>
 <span className="dropdown-arrow">▼</span>
 </button>
 {isElectionDropdownOpen && (
 <div className="election-dropdown">
 {electionPeriods.map((period) => (
 <div
 key={period}
 className={`election-option ${selectedElectionPeriod === period ? 'selected' : ''}`}
 onClick={() => handleElectionPeriodSelect(period)}
 >
 {period}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 
 <div className="search-input-container">
 <input
 type="text"
 value={searchTerm}
 onChange={handleInputChange}
 onFocus={() => setIsOpen(true)}
 onKeyDown={handleKeyDown}
 placeholder="Search instruments..."
 className="seasonax-search-input"
 autoComplete="off"
 />
 <div className="search-icon"></div>
 </div>

 {isOpen && (
 <div className="seasonax-search-dropdown">
 <div className="search-section">
 <div className="search-section-title">Recent Symbols</div>
 {recentSymbols.map((symbol) => (
 <div
 key={symbol}
 className="search-result-item"
 onClick={() => handleSymbolClick(symbol)}
 >
 <div className="result-symbol">{symbol}</div>
 <div className="result-name">{getCompanyName(symbol)}</div>
 </div>
 ))}
 </div>
 
 {searchTerm.length > 0 && !recentSymbols.includes(searchTerm) && (
 <div className="search-section">
 <div 
 className="search-result-item"
 onClick={() => handleSymbolClick(searchTerm)}
 >
 <div className="result-symbol">{searchTerm}</div>
 <div className="result-name">Search for &quot;{searchTerm}&quot;</div>
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 );
};

export default SeasonaxSymbolSearch;
