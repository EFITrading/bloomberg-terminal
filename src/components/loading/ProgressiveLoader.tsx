// Ultra-fast loading states with skeleton UI and progressive loading
import React from 'react';

interface ProgressiveLoaderProps {
  symbol: string;
  timeframe: string;
  stage: 'checking-cache' | 'fetching-data' | 'processing' | 'rendering' | 'complete';
  progress?: number;
  showSkeletonChart?: boolean;
}

export const ProgressiveLoader: React.FC<ProgressiveLoaderProps> = ({ 
  symbol, 
  timeframe, 
  stage, 
  progress = 0,
  showSkeletonChart = true 
}) => {
  const getStageMessage = () => {
    switch (stage) {
      case 'checking-cache':
        return 'Checking cache...';
      case 'fetching-data':
        return 'Loading market data...';
      case 'processing':
        return 'Processing data...';
      case 'rendering':
        return 'Rendering chart...';
      case 'complete':
        return 'Ready!';
      default:
        return 'Loading...';
    }
  };

  const getStageIcon = () => {
    switch (stage) {
      case 'checking-cache':
        return '🔍';
      case 'fetching-data':
        return '📊';
      case 'processing':
        return '⚡';
      case 'rendering':
        return '🎨';
      case 'complete':
        return '✅';
      default:
        return '⏳';
    }
  };

  return (
    <div className="relative w-full h-full bg-[#0a0a0a] flex flex-col">
      {/* Minimalist Loading Header */}
      <div className="absolute top-4 left-4 z-50 bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-xl animate-pulse">{getStageIcon()}</span>
          <div className="flex flex-col">
            <span className="text-white font-semibold text-sm">
              {symbol} • {timeframe}
            </span>
            <span className="text-gray-400 text-xs">
              {getStageMessage()}
            </span>
          </div>
          {progress > 0 && (
            <div className="w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Skeleton Chart */}
      {showSkeletonChart && (
        <div className="flex-1 p-4 pt-20">
          <SkeletonChart />
        </div>
      )}
    </div>
  );
};

// Fast skeleton chart that mimics real chart structure
const SkeletonChart: React.FC = () => {
  return (
    <div className="w-full h-full bg-[#0a0a0a] relative overflow-hidden">
      {/* Chart Area */}
      <div className="w-full h-full relative">
        {/* Y-axis labels */}
        <div className="absolute right-0 top-0 h-full w-16 flex flex-col justify-between py-8">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-3 bg-gray-800 rounded animate-pulse" style={{
              animationDelay: `${i * 100}ms`
            }} />
          ))}
        </div>
        
        {/* X-axis labels */}
        <div className="absolute bottom-0 left-0 right-16 h-8 flex justify-between items-center px-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-12 h-3 bg-gray-800 rounded animate-pulse" style={{
              animationDelay: `${i * 150}ms`
            }} />
          ))}
        </div>
        
        {/* Chart candlesticks skeleton */}
        <div className="absolute top-8 left-4 right-16 bottom-12 flex items-end justify-between px-2">
          {[...Array(50)].map((_, i) => {
            const height = Math.random() * 60 + 20; // Random height between 20-80%
            const isGreen = Math.random() > 0.5;
            
            return (
              <div key={i} className="flex flex-col items-center" style={{
                animationDelay: `${i * 20}ms`
              }}>
                <div 
                  className={`w-0.5 ${isGreen ? 'bg-green-900' : 'bg-red-900'} animate-pulse`}
                  style={{ height: `${height * 0.2}%` }}
                />
                <div 
                  className={`w-1.5 ${isGreen ? 'bg-green-700' : 'bg-red-700'} animate-pulse`}
                  style={{ height: `${height * 0.6}%` }}
                />
                <div 
                  className={`w-0.5 ${isGreen ? 'bg-green-900' : 'bg-red-900'} animate-pulse`}
                  style={{ height: `${height * 0.2}%` }}
                />
              </div>
            );
          })}
        </div>
        
        {/* Shimmer effect overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 animate-shimmer" />
      </div>
    </div>
  );
};

// Instant feedback component for symbol changes
interface InstantFeedbackProps {
  newSymbol: string;
  previousSymbol?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const InstantFeedback: React.FC<InstantFeedbackProps> = ({
  newSymbol,
  previousSymbol,
  onConfirm,
  onCancel
}) => {
  return (
    <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-50 bg-black/90 backdrop-blur-md rounded-xl border border-gray-700 p-4 min-w-72">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔄</span>
          <div>
            <div className="text-white font-semibold">
              Switching to {newSymbol}
            </div>
            {previousSymbol && (
              <div className="text-gray-400 text-sm">
                From {previousSymbol}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
};

// Smart loading overlay that adapts to content
interface SmartLoadingOverlayProps {
  isVisible: boolean;
  symbol: string;
  timeframe: string;
  estimatedTime?: number;
  fromCache?: boolean;
}

export const SmartLoadingOverlay: React.FC<SmartLoadingOverlayProps> = ({
  isVisible,
  symbol,
  timeframe,
  estimatedTime = 1000,
  fromCache = false
}) => {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center">
      <div className="bg-black/80 rounded-xl border border-gray-700 p-6 max-w-sm">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            {fromCache && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            )}
          </div>
          
          <div>
            <div className="text-white font-semibold text-sm">
              {fromCache ? 'Loading from cache' : 'Fetching live data'}
            </div>
            <div className="text-gray-400 text-xs">
              {symbol} • {timeframe}
              {estimatedTime > 0 && !fromCache && (
                <span className="ml-2">
                  ~{Math.round(estimatedTime / 1000)}s
                </span>
              )}
            </div>
          </div>
        </div>
        
        {fromCache && (
          <div className="mt-3 text-xs text-green-400 flex items-center gap-1">
            <span>⚡</span>
            <span>Instant load from cache</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Performance metrics display for development
interface PerformanceMetricsProps {
  metrics: {
    cacheHit: boolean;
    loadTime: number;
    dataPoints: number;
    source: string;
  };
  showInProduction?: boolean;
}

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({
  metrics,
  showInProduction = false
}) => {
  // Only show in development unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && !showInProduction) {
    return null;
  }

  const { cacheHit, loadTime, dataPoints, source } = metrics;

  return (
    <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg p-2 text-xs font-mono border border-gray-800 z-30">
      <div className="grid grid-cols-2 gap-2 text-gray-300">
        <span>Source:</span>
        <span className={cacheHit ? 'text-green-400' : 'text-blue-400'}>
          {source}
        </span>
        
        <span>Load:</span>
        <span className={loadTime < 500 ? 'text-green-400' : loadTime < 1000 ? 'text-yellow-400' : 'text-red-400'}>
          {loadTime}ms
        </span>
        
        <span>Points:</span>
        <span className="text-gray-400">
          {dataPoints.toLocaleString()}
        </span>
        
        <span>Cache:</span>
        <span className={cacheHit ? 'text-green-400' : 'text-gray-400'}>
          {cacheHit ? '✓ HIT' : '✗ MISS'}
        </span>
      </div>
    </div>
  );
};

// CSS for shimmer animation
const shimmerKeyframes = `
  @keyframes shimmer {
    0% { transform: translateX(-100%) skewX(-12deg); }
    100% { transform: translateX(200%) skewX(-12deg); }
  }
  
  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
`;

// Inject CSS if not already present
if (typeof document !== 'undefined' && !document.getElementById('progressive-loader-styles')) {
  const style = document.createElement('style');
  style.id = 'progressive-loader-styles';
  style.textContent = shimmerKeyframes;
  document.head.appendChild(style);
}