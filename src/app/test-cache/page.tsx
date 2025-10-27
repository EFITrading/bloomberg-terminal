'use client';

import { useAllCachedScreeners } from '@/hooks/useCachedScreener';
import { CacheStatusIndicator } from '@/components/ui/ScreenerWrapper';

export default function ScreenerCacheTest() {
  const { data, loading, error, cacheEntries, refresh, hasData } = useAllCachedScreeners();

  const screenerTypes = [
    'seasonal-opportunities',
    'premium-screener', 
    'gex-screener',
    'market-sentiment',
    'sector-analysis',
    'watchlist-data',
    'options-flow-scan'
  ];

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Background Screener Cache Test</h1>
          <p className="text-gray-400 mb-4">
            This page tests the background screener system. Data should load instantly from cache.
          </p>
          
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={refresh}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh Cache'}
            </button>
            
            <div className={`px-3 py-1 rounded text-sm ${
              hasData ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            }`}>
              {hasData ? '✅ Cache Active' : '❌ No Cache Data'}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded text-red-400">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="grid gap-6">
          {/* Cache Status Overview */}
          <div className="bg-gray-900 p-6 rounded-lg border border-gray-700">
            <h2 className="text-xl font-bold mb-4">Cache Status Overview</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {screenerTypes.map(type => (
                <div key={type} className="p-4 bg-gray-800 rounded border border-gray-600">
                  <div className="font-medium mb-2 capitalize">
                    {type.replace('-', ' ')}
                  </div>
                  <CacheStatusIndicator type={type} />
                </div>
              ))}
            </div>
          </div>

          {/* Cache Entries Details */}
          {Object.keys(cacheEntries).length > 0 && (
            <div className="bg-gray-900 p-6 rounded-lg border border-gray-700">
              <h2 className="text-xl font-bold mb-4">Cache Entries Detail</h2>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="text-left p-2">Screener Type</th>
                      <th className="text-left p-2">Last Updated</th>
                      <th className="text-left p-2">Expires At</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cacheEntries).map(([type, entry]: [string, any]) => (
                      <tr key={type} className="border-b border-gray-700/50">
                        <td className="p-2 font-medium">{type}</td>
                        <td className="p-2 text-gray-400">
                          {new Date(entry.lastUpdated).toLocaleString()}
                        </td>
                        <td className="p-2 text-gray-400">
                          {new Date(entry.expiresAt).toLocaleString()}
                        </td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            entry.isStale 
                              ? 'bg-yellow-900/30 text-yellow-400' 
                              : 'bg-green-900/30 text-green-400'
                          }`}>
                            {entry.isStale ? 'Stale' : 'Fresh'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cached Data Preview */}
          {hasData && (
            <div className="bg-gray-900 p-6 rounded-lg border border-gray-700">
              <h2 className="text-xl font-bold mb-4">Cached Data Preview</h2>
              
              <div className="space-y-4">
                {Object.entries(data).map(([type, screenerData]: [string, any]) => (
                  <div key={type} className="p-4 bg-gray-800 rounded border border-gray-600">
                    <h3 className="font-medium mb-2 capitalize text-blue-400">
                      {type.replace('-', ' ')}
                    </h3>
                    
                    <div className="text-sm text-gray-400 mb-2">
                      Generated: {screenerData?.generatedAt ? 
                        new Date(screenerData.generatedAt).toLocaleString() : 
                        'Unknown'
                      }
                    </div>
                    
                    <div className="bg-gray-900 p-3 rounded text-xs font-mono text-green-400 max-h-40 overflow-y-auto">
                      <pre>{JSON.stringify(screenerData, null, 2)}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Data State */}
          {!hasData && !loading && (
            <div className="bg-gray-900 p-6 rounded-lg border border-gray-700 text-center">
              <div className="text-gray-400 mb-4">
                <div className="text-4xl mb-2">⏳</div>
                <h3 className="text-lg font-medium mb-2">No Cached Data Available</h3>
                <p className="text-sm">
                  Background screeners may not have run yet. 
                  They run every 10 minutes automatically.
                </p>
              </div>
              
              <div className="text-xs text-gray-500 mt-4">
                <p>Background screeners have been disabled. Data loads on-demand only.</p>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 p-6 bg-blue-900/20 border border-blue-500/30 rounded text-blue-100">
          <h3 className="font-bold mb-2">� Manual Operation Mode:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>All background screeners have been disabled</li>
            <li>Data loads only when you click on specific screeners</li>
            <li>No automatic cron jobs running in background</li>
            <li>Clean startup with minimal resource usage</li>
            <li>Full control over when data is fetched! 🎯</li>
          </ol>
        </div>
      </div>
    </div>
  );
}