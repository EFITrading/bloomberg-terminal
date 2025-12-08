'use client';

import React, { useState } from 'react';
import '../terminal.css';
import './analytics-tabs.css';
import Footer from '@/components/terminal/Footer';
import RRGAnalytics from '@/components/analytics/RRGAnalytics';
import RSScreener from '@/components/RSScreener';
import HVScreener from '@/components/HVScreener';
import LeadershipScan from '@/components/LeadershipScan';
import PerformanceDashboard from '@/components/charts/PerformanceDashboard';
import MarketHeatmap from '@/components/analytics/MarketHeatmap';

export default function Analytics() {
 const [activeTab, setActiveTab] = useState('rrg');

 return (
 <>
 <div className="terminal-container">
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
 background: activeTab === 'rrg' 
 ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
 : 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
 color: activeTab === 'rrg' ? '#ff8500' : '#ffffff',
 border: activeTab === 'rrg' ? '1px solid rgba(255, 133, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
 borderRadius: '12px',
 margin: '8px',
 padding: '16px 32px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '13px',
 fontWeight: '700',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'rrg' 
 ? 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 12px rgba(255, 133, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)'
 : 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'rrg') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(255, 133, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.6)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'rrg') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)';
 }
 }}
 >
 RELATIVE ROTATION
 </button>
 
 <button
 className="analytics-tab-button"
 onClick={() => setActiveTab('rs-screener')}
 style={{
 background: activeTab === 'rs-screener' 
 ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
 : 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
 color: activeTab === 'rs-screener' ? '#ff8500' : '#ffffff',
 border: activeTab === 'rs-screener' ? '1px solid rgba(255, 133, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
 borderRadius: '12px',
 margin: '8px',
 padding: '16px 32px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '13px',
 fontWeight: '700',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'rs-screener' 
 ? 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 12px rgba(255, 133, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)'
 : 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'rs-screener') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(255, 133, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.6)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'rs-screener') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)';
 }
 }}
 >
 RS SCREENER
 </button>
 
 <button
 className="analytics-tab-button"
 onClick={() => setActiveTab('hv-screener')}
 style={{
 background: activeTab === 'hv-screener' 
 ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
 : 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
 color: activeTab === 'hv-screener' ? '#ff8500' : '#ffffff',
 border: activeTab === 'hv-screener' ? '1px solid rgba(255, 133, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
 borderRadius: '12px',
 margin: '8px',
 padding: '16px 32px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '13px',
 fontWeight: '700',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'hv-screener' 
 ? 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 12px rgba(255, 133, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)'
 : 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'hv-screener') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(255, 133, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.6)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'hv-screener') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)';
 }
 }}
 >
 HV SCREENER
 </button>
 
 <button
 className="analytics-tab-button"
 onClick={() => setActiveTab('leadership-scan')}
 style={{
 background: activeTab === 'leadership-scan' 
 ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
 : 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
 color: activeTab === 'leadership-scan' ? '#ff8500' : '#ffffff',
 border: activeTab === 'leadership-scan' ? '1px solid rgba(255, 133, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
 borderRadius: '12px',
 margin: '8px',
 padding: '16px 32px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '13px',
 fontWeight: '700',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'leadership-scan' 
 ? 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 12px rgba(255, 133, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)'
 : 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'leadership-scan') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(255, 133, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.6)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'leadership-scan') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)';
 }
 }}
 >
 LEADERSHIP SCAN
 </button>
 
 <button
 className="analytics-tab-button"
 onClick={() => setActiveTab('performance')}
 style={{
 background: activeTab === 'performance' 
 ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
 : 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
 color: activeTab === 'performance' ? '#ff8500' : '#ffffff',
 border: activeTab === 'performance' ? '1px solid rgba(255, 133, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
 borderRadius: '12px',
 margin: '8px',
 padding: '16px 32px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '13px',
 fontWeight: '700',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'performance' 
 ? 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 12px rgba(255, 133, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)'
 : 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'performance') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(255, 133, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.6)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'performance') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)';
 }
 }}
 >
 KOYFIN
 </button>

 <button
 className="analytics-tab-button"
 onClick={() => setActiveTab('heatmap')}
 style={{
 background: activeTab === 'heatmap' 
 ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
 : 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
 color: activeTab === 'heatmap' ? '#ff8500' : '#ffffff',
 border: activeTab === 'heatmap' ? '1px solid rgba(255, 133, 0, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
 borderRadius: '12px',
 margin: '8px',
 padding: '16px 32px',
 fontFamily: '"Bloomberg Terminal", "Consolas", "Monaco", monospace',
 fontSize: '13px',
 fontWeight: '700',
 textTransform: 'uppercase',
 letterSpacing: '1.5px',
 cursor: 'pointer',
 transition: 'all 0.3s ease',
 position: 'relative',
 flex: '1',
 textAlign: 'center',
 boxShadow: activeTab === 'heatmap' 
 ? 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 4px 12px rgba(255, 133, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)'
 : 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)'
 }}
 onMouseEnter={(e) => {
 if (activeTab !== 'heatmap') {
 e.currentTarget.style.color = '#ff8500';
 e.currentTarget.style.transform = 'translateY(-2px)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(255, 133, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.6)';
 }
 }}
 onMouseLeave={(e) => {
 if (activeTab !== 'heatmap') {
 e.currentTarget.style.color = '#ffffff';
 e.currentTarget.style.transform = 'translateY(0)';
 e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px rgba(0, 0, 0, 0.4)';
 }
 }}
 >
 MARKET HEATMAP
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
 
 {/* HV Screener - Always mounted for immediate scanning, but only visible when active */}
 <div style={{ display: activeTab === 'hv-screener' ? 'block' : 'none' }}>
 <HVScreener />
 </div>
 
 {/* Leadership Scan - Always mounted for immediate scanning, but only visible when active */}
 <div style={{ display: activeTab === 'leadership-scan' ? 'block' : 'none' }}>
 <LeadershipScan />
 </div>
 
 {/* Performance Comparison - Only render when active */}
 {activeTab === 'performance' && (
 <div style={{ 
 width: '100%',
 height: 'calc(100vh - 200px)',
 minHeight: '600px'
 }}>
 <PerformanceDashboard isVisible={true} />
 </div>
 )}
 
 {/* Market Heatmap - Only render when active */}
 {activeTab === 'heatmap' && (
 <div style={{ 
 width: '100%',
 height: 'calc(100vh - 200px)',
 minHeight: '600px'
 }}>
 <MarketHeatmap />
 </div>
 )}
 </div>
 </div>
 <Footer />
 </>
 );
}
