import React from 'react';
import { useCachedScreener } from '@/hooks/useCachedScreener';

interface CacheStatusIndicatorProps {
  type: string;
  className?: string;
}

export const CacheStatusIndicator: React.FC<CacheStatusIndicatorProps> = ({ 
  type, 
  className = "" 
}) => {
  const { cacheStatus, lastUpdated, refresh, loading } = useCachedScreener(type, undefined, {
    refreshInterval: 0 // Don't auto-refresh, just show status
  });

  const getStatusColor = () => {
    switch (cacheStatus) {
      case 'hit': return 'text-green-400';
      case 'stale': return 'text-yellow-400';
      case 'fallback': return 'text-blue-400';
      case 'miss': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = () => {
    switch (cacheStatus) {
      case 'hit': return '🟢';
      case 'stale': return '🟡';
      case 'fallback': return '🔵';
      case 'miss': return '🔴';
      default: return '⚪';
    }
  };

  const getStatusText = () => {
    switch (cacheStatus) {
      case 'hit': return 'Cached (Fresh)';
      case 'stale': return 'Cached (Stale)';
      case 'fallback': return 'Live API';
      case 'miss': return 'No Cache';
      default: return 'Loading...';
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Unknown';
    const date = new Date(lastUpdated);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`flex items-center space-x-2 text-sm ${className}`}>
      <span className="flex items-center space-x-1">
        <span>{getStatusIcon()}</span>
        <span className={getStatusColor()}>{getStatusText()}</span>
      </span>
      
      {lastUpdated && (
        <span className="text-gray-400">
          • Updated {formatLastUpdated()}
        </span>
      )}
      
      <button
        onClick={refresh}
        disabled={loading}
        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50"
        title="Refresh data"
      >
        {loading ? '⟳' : '↻'}
      </button>
    </div>
  );
};

interface ScreenerWrapperProps {
  type: string;
  title: string;
  fallbackApiUrl?: string;
  children: (data: any, loading: boolean, error: string | null) => React.ReactNode;
  className?: string;
}

/**
 * Wrapper component that automatically handles cached data loading
 * Shows cache status and provides data to children
 */
export const ScreenerWrapper: React.FC<ScreenerWrapperProps> = ({
  type,
  title,
  fallbackApiUrl,
  children,
  className = ""
}) => {
  const { data, loading, error, cacheStatus, refresh } = useCachedScreener(
    type,
    fallbackApiUrl,
    {
      refreshInterval: 30000, // Check for updates every 30 seconds
      maxStaleTime: 15 * 60 * 1000, // Accept 15 minute stale data
      enableFallback: true
    }
  );

  return (
    <div className={`screener-wrapper ${className}`}>
      {/* Header with title and cache status */}
      <div className="flex justify-between items-center mb-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <CacheStatusIndicator type={type} />
      </div>
      
      {/* Performance indicator */}
      {cacheStatus === 'hit' && (
        <div className="mb-4 p-2 bg-green-900/20 border border-green-500/30 rounded text-green-400 text-sm">
          ⚡ Instant load from background cache
        </div>
      )}
      
      {cacheStatus === 'fallback' && (
        <div className="mb-4 p-2 bg-blue-900/20 border border-blue-500/30 rounded text-blue-400 text-sm">
          🔄 Loading from live API (cache unavailable)
        </div>
      )}
      
      {cacheStatus === 'stale' && (
        <div className="mb-4 p-2 bg-yellow-900/20 border border-yellow-500/30 rounded text-yellow-400 text-sm">
          ⏰ Showing cached data (updating in background)
        </div>
      )}
      
      {/* Content */}
      <div className="screener-content">
        {children(data, loading, error)}
      </div>
      
      {/* Error handling */}
      {error && (
        <div className="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded">
          <div className="text-red-400 font-medium">Error loading {title}</div>
          <div className="text-red-300 text-sm mt-1">{error}</div>
          <button
            onClick={refresh}
            className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};