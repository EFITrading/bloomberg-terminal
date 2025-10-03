'use client';

import '../terminal.css';
import Footer from '@/components/terminal/Footer';

function AISuiteContent() {
  return (
    <div className="p-6 bg-gray-900 text-white rounded-lg max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-4" style={{ color: '#FF6600' }}>
          AI Suite
        </h2>
        <p className="text-lg text-gray-300 mb-6">
          Advanced AI-Powered Trading Intelligence
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Market Analysis */}
        <div className="bg-gray-800 p-6 rounded-lg border border-blue-500/30">
          <div className="flex items-center mb-4">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
            <h3 className="text-xl font-semibold text-blue-400">Market Analysis</h3>
          </div>
          <p className="text-gray-300 mb-4">
            Real-time market sentiment analysis using advanced AI algorithms to identify trends and opportunities.
          </p>
          <div className="text-sm text-gray-400">
            • Sentiment scoring
            • Trend detection
            • Risk assessment
          </div>
        </div>

        {/* Options Intelligence */}
        <div className="bg-gray-800 p-6 rounded-lg border border-green-500/30">
          <div className="flex items-center mb-4">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
            <h3 className="text-xl font-semibold text-green-400">Options Intelligence</h3>
          </div>
          <p className="text-gray-300 mb-4">
            Sophisticated options analysis with probability calculations available in Market Overview.
          </p>
          <div className="text-sm text-gray-400">
            • Probability calculations
            • Strike selection
            • Expected range analysis
          </div>
        </div>

        {/* Portfolio Optimization */}
        <div className="bg-gray-800 p-6 rounded-lg border border-purple-500/30">
          <div className="flex items-center mb-4">
            <div className="w-3 h-3 bg-purple-500 rounded-full mr-3"></div>
            <h3 className="text-xl font-semibold text-purple-400">Portfolio Optimization</h3>
          </div>
          <p className="text-gray-300 mb-4">
            AI-driven portfolio optimization using modern portfolio theory and machine learning.
          </p>
          <div className="text-sm text-gray-400">
            • Risk optimization
            • Asset allocation
            • Performance analytics
          </div>
        </div>

        {/* Predictive Analytics */}
        <div className="bg-gray-800 p-6 rounded-lg border border-yellow-500/30">
          <div className="flex items-center mb-4">
            <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
            <h3 className="text-xl font-semibold text-yellow-400">Predictive Analytics</h3>
          </div>
          <p className="text-gray-300 mb-4">
            Machine learning models for price prediction and volatility forecasting.
          </p>
          <div className="text-sm text-gray-400">
            • Price forecasting
            • Volatility modeling
            • Pattern recognition
          </div>
        </div>

        {/* Risk Management */}
        <div className="bg-gray-800 p-6 rounded-lg border border-red-500/30">
          <div className="flex items-center mb-4">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
            <h3 className="text-xl font-semibold text-red-400">Risk Management</h3>
          </div>
          <p className="text-gray-300 mb-4">
            Advanced risk assessment and management tools powered by AI algorithms.
          </p>
          <div className="text-sm text-gray-400">
            • VaR calculations
            • Stress testing
            • Correlation analysis
          </div>
        </div>

        {/* Data Intelligence */}
        <div className="bg-gray-800 p-6 rounded-lg border border-cyan-500/30">
          <div className="flex items-center mb-4">
            <div className="w-3 h-3 bg-cyan-500 rounded-full mr-3"></div>
            <h3 className="text-xl font-semibold text-cyan-400">Data Intelligence</h3>
          </div>
          <p className="text-gray-300 mb-4">
            Comprehensive data analysis and visualization with AI-powered insights.
          </p>
          <div className="text-sm text-gray-400">
            • Data mining
            • Pattern analysis
            • Automated reporting
          </div>
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-800 rounded-lg border border-gray-600">
        <h4 className="text-lg font-semibold mb-3 text-center text-orange-400">
          Available Tools
        </h4>
        <div className="text-center text-gray-300">
          <p className="mb-2">
            For <strong>Options Probability Calculations</strong> and <strong>Expected Range Analysis</strong>, 
            visit the <span className="text-blue-400 font-semibold">Market Overview</span> page and click the 
            <span className="text-green-400 font-semibold">"Expected Range"</span> button.
          </p>
          <p className="text-sm text-gray-400">
            Real-time calculations with dynamic expiration dates and live market data.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AISuite() {
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
            padding: '20px',
            color: '#FFFFFF',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            <AISuiteContent />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}