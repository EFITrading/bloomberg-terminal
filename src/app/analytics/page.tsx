'use client';

import React, { useState } from 'react';
import '../terminal.css';
import './analytics-tabs.css';
import Footer from '@/components/terminal/Footer';
import RRGAnalytics from '@/components/analytics/RRGAnalytics';
import RSScreener from '@/components/RSScreener';
import LeadershipScan from '@/components/LeadershipScan';

export default function Analytics() {
 const [activeTab, setActiveTab] = useState('rrg');

 return (
 <>
 <div className="terminal-container">
 <div className="terminal-header">
 <div className="terminal-title">Analytics Suite</div>
 <div className="terminal-controls">
 <span className="control-button minimize"></span>
 <span className="control-button maximize"></span>
 <span className="control-button close"></span>
 </div>
 </div>
 
 {/* Tab Navigation */}
 <div style={{
 background: '#000000',
 borderBottom: '3px solid #ff8500',
 padding: '0',
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'stretch',
 boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
 }}>
 <button
 className="analytics-tab-button"
 onClick={() => setActiveTab('rrg')}
 style={{
 background: activeTab === 'rrg' ? '#ff8500' : '#000000',
 color: activeTab === 'rrg' ? '#000000' : '#ffffff',
 border: 'none',
 padding: '20px 40px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '16px',
 fontWeight: '800',
 textTransform: 'uppercase',
 letterSpacing: '2px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 borderRight: '1px solid #333333',
 borderBottom: activeTab === 'rrg' ? '4px solid #ff8500' : '4px solid transparent',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'rrg' ? '0 0 20px rgba(255, 133, 0, 0.4)' : 'none'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'rrg') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.background = '#111111';
 e.currentTarget.style.borderBottom = '4px solid #ff8500';
 e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 133, 0, 0.2)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'rrg') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.background = '#000000';
 e.currentTarget.style.borderBottom = '4px solid transparent';
 e.currentTarget.style.boxShadow = 'none';
 }
 }}
 >
 RELATIVE ROTATION GRAPH
 </button>
 
 <button
 className="analytics-tab-button"
 onClick={() => setActiveTab('rs-screener')}
 style={{
 background: activeTab === 'rs-screener' ? '#ff8500' : '#000000',
 color: activeTab === 'rs-screener' ? '#000000' : '#ffffff',
 border: 'none',
 padding: '20px 40px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '16px',
 fontWeight: '800',
 textTransform: 'uppercase',
 letterSpacing: '2px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 borderRight: '1px solid #333333',
 borderBottom: activeTab === 'rs-screener' ? '4px solid #ff8500' : '4px solid transparent',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'rs-screener' ? '0 0 20px rgba(255, 133, 0, 0.4)' : 'none'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'rs-screener') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.background = '#111111';
 e.currentTarget.style.borderBottom = '4px solid #ff8500';
 e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 133, 0, 0.2)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'rs-screener') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.background = '#000000';
 e.currentTarget.style.borderBottom = '4px solid transparent';
 e.currentTarget.style.boxShadow = 'none';
 }
 }}
 >
 RS SCREENER
 </button>
 
 <button
 className="analytics-tab-button"
 onClick={() => setActiveTab('leadership-scan')}
 style={{
 background: activeTab === 'leadership-scan' ? '#ff8500' : '#000000',
 color: activeTab === 'leadership-scan' ? '#000000' : '#ffffff',
 border: 'none',
 padding: '20px 40px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '16px',
 fontWeight: '800',
 textTransform: 'uppercase',
 letterSpacing: '2px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 borderBottom: activeTab === 'leadership-scan' ? '4px solid #ff8500' : '4px solid transparent',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'leadership-scan' ? '0 0 20px rgba(255, 133, 0, 0.4)' : 'none'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'leadership-scan') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.background = '#111111';
 e.currentTarget.style.borderBottom = '4px solid #ff8500';
 e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 133, 0, 0.2)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'leadership-scan') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.background = '#000000';
 e.currentTarget.style.borderBottom = '4px solid transparent';
 e.currentTarget.style.boxShadow = 'none';
 }
 }}
 >
 LEADERSHIP SCAN
 </button>
 </div>

 <div className="terminal-content" style={{ padding: 0 }}>
 {activeTab === 'rrg' && (
 <RRGAnalytics 
 defaultTimeframe="14 weeks"
 defaultBenchmark="SPY"
 />
 )}
 
 {/* RS Screener - Always mounted for immediate scanning, but only visible when active */}
 <div style={{ display: activeTab === 'rs-screener' ? 'block' : 'none' }}>
 <RSScreener />
 </div>
 
 {/* Leadership Scan - Always mounted for immediate scanning, but only visible when active */}
 <div style={{ display: activeTab === 'leadership-scan' ? 'block' : 'none' }}>
 <LeadershipScan />
 </div>
 </div>
 </div>
 <Footer />
 </>
 );
}
