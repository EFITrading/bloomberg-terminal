'use client';

import '../terminal.css';
import Footer from '@/components/terminal/Footer';
import AlgoFlowScreener from '@/components/AlgoFlowScreener';
import { useState } from 'react';

export default function AISuite() {
    const [activeView, setActiveView] = useState<'overview' | 'algoflow'>('algoflow');

    if (activeView === 'algoflow') {
        return (
            <div style={{ height: 'calc(100vh - 60px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', marginTop: '-60px' }}>
                <div className="fixed top-2 left-4 z-50">
                    <button
                        onClick={() => setActiveView('overview')}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 transition-all duration-200"
                    >
                        â† Back to AI Suite
                    </button>
                </div>
                <AlgoFlowScreener />
            </div>
        );
    }

    return (
        <>
            <div className="terminal-container">
                <div className="terminal-header">
                    <div className="terminal-title">AI Suite - Advanced Trading Intelligence</div>
                    <div className="terminal-controls">
                        <span className="control-button minimize"></span>
                        <span className="control-button maximize"></span>
                        <span className="control-button close"></span>
                    </div>
                </div>
                <div className="terminal-content">
                    <div style={{
                        padding: '12px',
                        color: '#FFFFFF',
                        fontFamily: 'Inter, system-ui, sans-serif'
                    }} className="sm:p-5">
                        <div className="p-2 sm:p-6 bg-gray-900 text-white rounded-lg w-full max-w-none sm:max-w-6xl mx-auto">
                            <div className="text-center mb-8">
                                <h2 className="text-3xl font-bold mb-4" style={{ color: '#FF6600' }}>
                                    AI Suite
                                </h2>
                                <p className="text-lg text-gray-300 mb-6">
                                    Advanced AI-Powered Trading Intelligence
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div
                                    className="bg-gray-800 p-6 rounded-lg border border-orange-500/30 cursor-pointer hover:border-orange-500/60 transition-all duration-300 hover:scale-105"
                                    onClick={() => setActiveView('algoflow')}
                                >
                                    <div className="flex items-center mb-4">
                                        <div className="w-3 h-3 bg-orange-500 rounded-full mr-3 animate-pulse"></div>
                                        <h3 className="text-xl font-semibold text-orange-400">Algo Flow</h3>
                                    </div>
                                    <p className="text-gray-300 mb-4">
                                        Real-time options sweeps &amp; blocks detection using live Polygon data to identify institutional flow.
                                    </p>
                                    <div className="text-sm text-gray-400">
                                        â€¢ Live options sweeps<br />
                                        â€¢ Block trade detection<br />
                                        â€¢ Institutional flow analysis<br />
                                        â€¢ Real-time scoring
                                    </div>
                                    <div className="mt-4 px-3 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full inline-block">
                                        LIVE DATA
                                    </div>
                                </div>

                                <div className="bg-gray-800 p-6 rounded-lg border border-blue-500/30">
                                    <div className="flex items-center mb-4">
                                        <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                                        <h3 className="text-xl font-semibold text-blue-400">Market Analysis</h3>
                                    </div>
                                    <p className="text-gray-300 mb-4">
                                        Real-time market sentiment analysis using advanced AI algorithms to identify trends and opportunities.
                                    </p>
                                    <div className="text-sm text-gray-400">â€¢ Sentiment scoring<br />â€¢ Trend detection<br />â€¢ Risk assessment</div>
                                </div>

                                <div className="bg-gray-800 p-6 rounded-lg border border-green-500/30">
                                    <div className="flex items-center mb-4">
                                        <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                                        <h3 className="text-xl font-semibold text-green-400">Options Intelligence</h3>
                                    </div>
                                    <p className="text-gray-300 mb-4">
                                        Sophisticated options analysis with probability calculations available in Market Overview.
                                    </p>
                                    <div className="text-sm text-gray-400">â€¢ Probability calculations<br />â€¢ Strike selection<br />â€¢ Expected range analysis</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </>
    );
}
