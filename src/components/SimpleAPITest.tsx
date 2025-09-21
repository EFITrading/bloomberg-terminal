'use client';

import React, { useState, useEffect } from 'react';

const SimpleAPITest: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const testAPI = async () => {
    setLoading(true);
    setError('');
    console.log('🔥 Testing API call...');
    
    try {
      // Simple fetch to prove API works
      const response = await fetch('/api/test-polygon');
      console.log('📡 Response received:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('📊 API Data received:', result);
      setData(result);
      
    } catch (err) {
      console.error('❌ API Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Auto-test on mount
  useEffect(() => {
    console.log('🚀 SimpleAPITest mounted - auto-testing...');
    testAPI();
  }, []);

  return (
    <div style={{ padding: '20px', background: '#000', color: '#FF6600', minHeight: '100vh' }}>
      <h1>🔥 API TEST - PROOF OF CONCEPT</h1>
      
      <button 
        onClick={testAPI} 
        disabled={loading}
        style={{ 
          padding: '10px 20px', 
          background: '#FF6600', 
          color: '#000', 
          border: 'none',
          margin: '10px 0'
        }}
      >
        {loading ? 'Testing...' : 'Test API Again'}
      </button>

      {error && (
        <div style={{ color: '#ff0000', margin: '10px 0' }}>
          <h3>❌ ERROR:</h3>
          <pre>{error}</pre>
        </div>
      )}

      {data && (
        <div style={{ color: '#00ff00', margin: '10px 0' }}>
          <h3>✅ SUCCESS - DATA RECEIVED:</h3>
          <pre style={{ background: '#111', padding: '10px', overflow: 'auto' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}

      {loading && (
        <div style={{ color: '#ffff00', margin: '10px 0' }}>
          <h3>⏳ LOADING...</h3>
        </div>
      )}
    </div>
  );
};

export default SimpleAPITest;