'use client';

import { useState } from 'react';

export default function SimpleCalculatorTest() {
  const [symbol, setSymbol] = useState('SPY');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const testAPI = async () => {
    setLoading(true);
    setResult('Testing...');
    
    try {
      console.log('🧪 Testing API for', symbol);
      
      // Test price API
      const priceResponse = await fetch(`/api/realtime-price?symbol=${symbol}&_t=${Date.now()}`);
      const priceData = await priceResponse.json();
      console.log('💰 Price data:', priceData);
      
      if (priceData.price) {
        setResult(`✅ ${symbol} Price: $${priceData.price}`);
      } else {
        setResult(`❌ No price data for ${symbol}`);
      }
      
    } catch (error) {
      console.error('❌ API Error:', error);
      setResult(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
      console.log('🏁 Test complete');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Simple Calculator API Test</h1>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter symbol (SPY, IWM, AAPL...)"
          />
        </div>
        
        <button
          onClick={testAPI}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white"
        >
          {loading ? '⟳ Testing...' : '🧪 Test API'}
        </button>
        
        <div className="p-4 bg-gray-900 rounded border">
          <h3 className="font-bold mb-2">Result:</h3>
          <div className="text-sm font-mono">
            {result || 'Click "Test API" to start'}
          </div>
        </div>
        
        <div className="text-xs text-gray-400">
          <p>This tests the basic API functionality.</p>
          <p>Check browser console (F12) for detailed logs.</p>
        </div>
      </div>
    </div>
  );
}