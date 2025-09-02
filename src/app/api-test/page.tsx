'use client';

import React, { useState, useEffect } from 'react';

export default function ApiTestPage() {
  const [testResult, setTestResult] = useState<string>('Testing...');
  const [apiKeyStatus, setApiKeyStatus] = useState<string>('Checking...');

  useEffect(() => {
    const testApi = async () => {
      try {
        // Test basic API connectivity
        const response = await fetch('/api/test-polygon');
        const data = await response.json();
        
        if (response.ok) {
          setTestResult(`✅ API Test Success: ${JSON.stringify(data, null, 2)}`);
          setApiKeyStatus('✅ API Key Valid');
        } else {
          setTestResult(`❌ API Test Failed: ${data.error}`);
          setApiKeyStatus('❌ API Key Invalid');
        }
      } catch (error) {
        setTestResult(`❌ API Test Error: ${error}`);
        setApiKeyStatus('❌ Connection Failed');
      }
    };

    testApi();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Polygon API Test</h1>
      <div style={{ marginBottom: '20px' }}>
        <h3>API Key Status:</h3>
        <p>{apiKeyStatus}</p>
      </div>
      <div>
        <h3>Test Result:</h3>
        <pre style={{ background: '#f5f5f5', padding: '10px', whiteSpace: 'pre-wrap' }}>
          {testResult}
        </pre>
      </div>
    </div>
  );
}
