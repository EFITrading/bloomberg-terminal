import React, { useState, useEffect } from 'react';

interface ApiStatusProps {
  className?: string;
}

interface ApiTestResult {
  timestamp: string;
  status: string;
  port: string;
  host: string;
  error?: string;
}

export default function ApiStatus({ className = '' }: ApiStatusProps) {
  const [status, setStatus] = useState<ApiTestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const testApi = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test');
      const result = await response.json();
      setStatus(result);
    } catch (error) {
      setStatus({
        timestamp: new Date().toISOString(),
        status: 'FAILED',
        port: 'unknown',
        host: 'unknown',
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    testApi();
  }, []);

  if (!status) return null;

  return (
    <div className={`api-status ${className}`}>
      <div className="flex items-center gap-2 text-xs">
        <div className={`w-2 h-2 rounded-full ${status.status === 'OK' ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-gray-400">
          API: {status.host} ({status.status})
        </span>
        {status.error && (
          <span className="text-red-400">
            - {status.error}
          </span>
        )}
        <button 
          onClick={testApi}
          disabled={loading}
          className="ml-2 text-gray-500 hover:text-gray-300 disabled:opacity-50"
          title="Test API connection"
        >
          {loading ? '⟳' : '🔄'}
        </button>
      </div>
    </div>
  );
}