// Performance monitor component to show cache status and data loading times
import React, { useState, useEffect } from 'react';

interface CacheStats {
  totalEntries: number;
  hitRate: number;
  memoryUsage: string;
  cacheHitRate: number;
}

interface PreloadStats {
  totalSymbols: number;
  loadedSymbols: number;
  failedSymbols: number;
  lastPreload: string;
  cacheHitRate: number;
}

export const PerformanceMonitor: React.FC<{ symbol?: string }> = ({ symbol }) => {
  const [stats, setStats] = useState<PreloadStats | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/top1000-status');
      const data = await response.json();
      
      if (data.success) {
        setStats(data.preloader_stats);
      }
    } catch (error) {
      console.warn('Failed to fetch preloader stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkSymbolStatus = async () => {
    if (!symbol) return;
    
    try {
      const response = await fetch(`/api/instant-preload?symbol=${symbol}`);
      const data = await response.json();
      console.log(`📊 Cache status for ${symbol}:`, data);
    } catch (error) {
      console.warn('Failed to check symbol status:', error);
    }
  };

  useEffect(() => {
    if (isVisible) {
      fetchStats();
      const interval = setInterval(fetchStats, 10000); // Update every 10 seconds
      return () => clearInterval(interval);
    }
  }, [isVisible]);

  useEffect(() => {
    if (symbol) {
      checkSymbolStatus();
    }
  }, [symbol]);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="performance-monitor-toggle"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: '#1a1a1a',
          color: '#00ff41',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '8px 12px',
          fontSize: '12px',
          cursor: 'pointer',
          zIndex: 1000,
          fontFamily: 'monospace'
        }}
      >
        📊 Cache Stats
      </button>
    );
  }

  return (
    <div 
      className="performance-monitor"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: '#1a1a1a',
        color: '#00ff41',
        border: '1px solid #333',
        borderRadius: '8px',
        padding: '16px',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: 1000,
        minWidth: '280px',
        maxWidth: '350px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, color: '#ff6b35' }}>⚡ Cache Performance</h4>
        <button
          onClick={() => setIsVisible(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          ✕
        </button>
      </div>

      {loading && <div style={{ color: '#666' }}>Loading stats...</div>}

      {stats && (
        <div style={{ lineHeight: '1.4' }}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#ff6b35' }}>Cache Hit Rate:</span>{' '}
            <span style={{ color: stats.cacheHitRate > 80 ? '#00ff41' : stats.cacheHitRate > 60 ? '#ffaa00' : '#ff4444' }}>
              {(stats.cacheHitRate * 100).toFixed(1)}%
            </span>
          </div>
          
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#ff6b35' }}>Preloaded Symbols:</span>{' '}
            <span style={{ color: '#00ff41' }}>{stats.loadedSymbols}</span>
            <span style={{ color: '#666' }}>/{stats.totalSymbols}</span>
          </div>

          {stats.failedSymbols > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#ff6b35' }}>Failed:</span>{' '}
              <span style={{ color: '#ff4444' }}>{stats.failedSymbols}</span>
            </div>
          )}

          {stats.lastPreload && (
            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#666' }}>
              <span style={{ color: '#ff6b35' }}>Last Preload:</span>{' '}
              {new Date(stats.lastPreload).toLocaleTimeString()}
            </div>
          )}

          {symbol && (
            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #333' }}>
              <div style={{ color: '#ff6b35', marginBottom: '4px' }}>Current Symbol: {symbol}</div>
              <button
                onClick={checkSymbolStatus}
                style={{
                  background: '#333',
                  color: '#00ff41',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Check Cache Status
              </button>
            </div>
          )}

          <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #333' }}>
            <button
              onClick={fetchStats}
              disabled={loading}
              style={{
                background: '#333',
                color: '#00ff41',
                border: '1px solid #555',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                marginRight: '8px'
              }}
            >
              Refresh
            </button>
            
            <span style={{ fontSize: '10px', color: '#666' }}>
              Auto-refresh: 10s
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceMonitor;