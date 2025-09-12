// BACKUP of RegimesPanel component from TradingViewChart.tsx
// Created on 2025-09-11 for error fixing

// Enhanced Market Regimes Panel Component with advanced analytics
const RegimesPanel = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
  const [viewMode, setViewMode] = React.useState<'overview' | 'sectors' | 'momentum' | 'correlations'>('overview');
  const [sortBy, setSortBy] = React.useState<'performance' | 'volume' | 'momentum'>('performance');
  const [filterStrength, setFilterStrength] = React.useState<'all' | 'strong' | 'moderate'>('all');
  const [selectedSector, setSelectedSector] = React.useState<string | null>(null);
  
  const getCurrentTimeframeData = () => {
    if (!marketRegimeData) return null;
    
    switch (activeTab) {
      case 'Life':
        return marketRegimeData.life;
      case 'Developing':
        return marketRegimeData.developing;
      case 'Momentum':
        return marketRegimeData.momentum;
      default:
        return marketRegimeData.life;
    }
  };

  const timeframeData = getCurrentTimeframeData();
  const bullishIndustries = timeframeData?.industries.filter(industry => industry.trend === 'bullish').slice(0, 20) || [];
  const bearishIndustries = timeframeData?.industries.filter(industry => industry.trend === 'bearish').slice(0, 20) || [];

  // Enhanced analytics calculations
  const getRegimeStrength = () => {
    if (!timeframeData) return 'Unknown';
    const totalIndustries = timeframeData.industries.length;
    const bullishRatio = bullishIndustries.length / totalIndustries;
    
    if (bullishRatio > 0.7) return 'Strong Bull';
    if (bullishRatio > 0.55) return 'Moderate Bull';
    if (bullishRatio < 0.3) return 'Strong Bear';
    if (bullishRatio < 0.45) return 'Moderate Bear';
    return 'Neutral';
  };

  const getMarketBreadth = () => {
    if (!timeframeData) return { advancing: 0, declining: 0, ratio: 0 };
    const advancing = bullishIndustries.length;
    const declining = bearishIndustries.length;
    const ratio = advancing / (advancing + declining) * 100;
    return { advancing, declining, ratio };
  };

  const getSectorBreakdown = () => {
    if (!timeframeData) return {};
    const sectors: { [key: string]: { bullish: number, bearish: number, neutral: number } } = {};
    
    timeframeData.industries.forEach(industry => {
      const sector = industry.category || 'Other';
      if (!sectors[sector]) {
        sectors[sector] = { bullish: 0, bearish: 0, neutral: 0 };
      }
      
      if (industry.trend === 'bullish') sectors[sector].bullish++;
      else if (industry.trend === 'bearish') sectors[sector].bearish++;
      else sectors[sector].neutral++;
    });
    
    return sectors;
  };

  const getTopMovers = () => {
    if (!timeframeData) return { top: [], bottom: [] };
    
    const allIndustries = [...timeframeData.industries];
    const sorted = allIndustries.sort((a, b) => b.relativePerformance - a.relativePerformance);
    
    return {
      top: sorted.slice(0, 5),
      bottom: sorted.slice(-5).reverse()
    };
  };

  // Refresh function
  const refreshData = async () => {
    if (!isLoadingRegimes) {
      setMarketRegimeData(null);
      setRegimeDataCache({});
      setLastRegimeUpdate(0);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Enhanced Header with analytics summary */}
      <div className="border-b border-[#1a1a1a] bg-[#0a0c10]">
        {/* Main tabs and controls */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-6">
            {/* Timeframe tabs */}
            <div className="flex">
              {['Life', 'Developing', 'Momentum'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition-all relative ${
                    activeTab === tab 
                      ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-900 bg-opacity-10' 
                      : 'text-white text-opacity-60 hover:text-white hover:text-opacity-80 hover:bg-white hover:bg-opacity-5'
                  }`}
                >
                  {tab}
                  {tab === 'Life' && <span className="ml-1 text-xs text-white text-opacity-40">(4d)</span>}
                  {tab === 'Developing' && <span className="ml-1 text-xs text-white text-opacity-40">(16d)</span>}
                  {tab === 'Momentum' && <span className="ml-1 text-xs text-white text-opacity-40">(23d)</span>}
                </button>
              ))}
            </div>
            
            {/* Regime strength indicator */}
            {timeframeData && (
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full border border-white border-opacity-10 bg-black bg-opacity-30">
                <div className={`w-2 h-2 rounded-full ${
                  getRegimeStrength().includes('Bull') ? 'bg-green-500 animate-pulse' :
                  getRegimeStrength().includes('Bear') ? 'bg-red-500 animate-pulse' :
                  'bg-yellow-500'
                }`} />
                <span className={`text-xs font-medium ${
                  getRegimeStrength().includes('Bull') ? 'text-green-400' :
                  getRegimeStrength().includes('Bear') ? 'text-red-400' :
                  'text-yellow-400'
                }`}>
                  {getRegimeStrength()}
                </span>
              </div>
            )}
          </div>
          
          {/* View mode selector and refresh */}
          <div className="flex items-center space-x-3">
            <div className="flex rounded-lg bg-[#1a1a1a] p-1">
              {['overview', 'sectors', 'momentum', 'correlations'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as any)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all capitalize ${
                    viewMode === mode 
                      ? 'bg-emerald-500 text-white' 
                      : 'text-white text-opacity-60 hover:text-white hover:text-opacity-80 hover:bg-white hover:bg-opacity-5'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            
            <button
              onClick={refreshData}
              disabled={isLoadingRegimes}
              className="p-2 text-white text-opacity-60 hover:text-white hover:text-opacity-80 transition-colors disabled:opacity-50 rounded-lg hover:bg-white hover:bg-opacity-5"
              title="Refresh Data"
            >
              <svg className={`w-4 h-4 ${isLoadingRegimes ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Market breadth summary */}
        {timeframeData && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-4">
                <span className="text-white text-opacity-60">
                  <span className="font-medium text-white text-opacity-80">{timeframeData.timeframe}</span>: {timeframeData.days} days
                </span>
                <div className="w-px h-4 bg-white bg-opacity-20" />
                <span className="text-white text-opacity-60">
                  Breadth: <span className={`font-medium ${getMarketBreadth().ratio > 60 ? 'text-green-400' : getMarketBreadth().ratio < 40 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {getMarketBreadth().ratio.toFixed(1)}%
                  </span>
                </span>
              </div>
              <div className="flex space-x-4 text-xs">
                <span className="text-green-400 flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-1" />
                  Bullish: {bullishIndustries.length}
                </span>
                <span className="text-red-400 flex items-center">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-1" />
                  Bearish: {bearishIndustries.length}
                </span>
                <span className="text-white text-opacity-60">
                  Total: {timeframeData.industries.length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Progress bar */}
      {isLoadingRegimes && (
        <div className="w-full bg-[#1a1a1a]">
          <div 
            className="bg-emerald-500 h-1 transition-all duration-300 ease-out"
            style={{ width: `${regimeUpdateProgress}%` }}
          />
        </div>
      )}
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoadingRegimes && !marketRegimeData ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-white text-opacity-60 text-sm text-center">
              <div>{regimeLoadingStage}</div>
              <div className="text-xs text-white text-opacity-40 mt-1">{regimeUpdateProgress}% complete</div>
              <div className="text-xs text-emerald-400 mt-2">📊 Auto-loading on startup...</div>
            </div>
          </div>
        ) : !marketRegimeData ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="text-white text-opacity-60 text-center">
              <div className="text-lg mb-2">📊</div>
              <div>Market Regime Analysis</div>
              <div className="text-xs text-white text-opacity-40 mt-1">Analysis loading automatically...</div>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {/* Show streaming indicator while still loading */}
            {isLoadingRegimes && (
              <div className="mx-4 mt-3 px-3 py-2 bg-emerald-900 bg-opacity-20 border border-emerald-500 border-opacity-30 rounded text-xs text-emerald-400">
                🔄 {regimeLoadingStage} ({regimeUpdateProgress}% complete)
              </div>
            )}
            
            {/* Dynamic content based on view mode */}
            {viewMode === 'overview' && (
              <div className="p-4">
                {/* Overview Dashboard */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                  {/* Market Regime Card */}
                  <div className="bg-gradient-to-br from-emerald-900 from-opacity-20 to-blue-900 to-opacity-20 border border-emerald-500 border-opacity-30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-emerald-400">Current Regime</h3>
                      <div className={`w-2 h-2 rounded-full ${
                        getRegimeStrength().includes('Bull') ? 'bg-green-500' :
                        getRegimeStrength().includes('Bear') ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                    </div>
                    <div className="text-xl font-bold text-white mb-1">{getRegimeStrength()}</div>
                    <div className="text-xs text-white text-opacity-60">Market breadth: {getMarketBreadth().ratio.toFixed(1)}%</div>
                  </div>
                  
                  {/* Momentum Card */}
                  <div className="bg-gradient-to-br from-purple-900 from-opacity-20 to-pink-900 to-opacity-20 border border-purple-500 border-opacity-30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-purple-400">Momentum</h3>
                      <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="text-xl font-bold text-white mb-1">
                      {bullishIndustries.length > bearishIndustries.length ? 'Positive' : 
                       bullishIndustries.length < bearishIndustries.length ? 'Negative' : 'Neutral'}
                    </div>
                    <div className="text-xs text-white text-opacity-60">
                      {Math.abs(bullishIndustries.length - bearishIndustries.length)} industry bias
                    </div>
                  </div>
                  
                  {/* Volatility Card */}
                  <div className="bg-gradient-to-br from-orange-900 from-opacity-20 to-red-900 to-opacity-20 border border-orange-500 border-opacity-30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-orange-400">Dispersion</h3>
                      <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-xl font-bold text-white mb-1">
                      {timeframeData ? (
                        timeframeData.industries.length > 50 ? 'High' : 
                        timeframeData.industries.length > 30 ? 'Medium' : 'Low'
                      ) : 'Unknown'}
                    </div>
                    <div className="text-xs text-white text-opacity-60">
                      {timeframeData?.industries.length || 0} sectors tracked
                    </div>
                  </div>
                </div>
                
                {/* Top & Bottom Movers */}
                {timeframeData && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-green-400 flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        Top Performers
                      </h3>
                      {getTopMovers().top.map((industry, index) => (
                        <div key={industry.symbol} className="flex items-center justify-between p-3 bg-green-500 bg-opacity-10 border border-green-500 border-opacity-20 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <span className="text-xs text-white text-opacity-40 w-4">#{index + 1}</span>
                            <div>
                              <div className="text-sm font-medium text-green-400">{industry.symbol}</div>
                              <div className="text-xs text-white text-opacity-60 truncate max-w-32">{industry.name}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-mono text-green-300">
                              +{industry.relativePerformance.toFixed(2)}%
                            </div>
                            <div className="text-xs text-green-300 text-opacity-60">{industry.category}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-red-400 flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Bottom Performers
                      </h3>
                      {getTopMovers().bottom.map((industry, index) => (
                        <div key={industry.symbol} className="flex items-center justify-between p-3 bg-red-500 bg-opacity-10 border border-red-500 border-opacity-20 rounded-lg">
                          <div className="flex items-center space-x-3">
                            <span className="text-xs text-white text-opacity-40 w-4">#{index + 1}</span>
                            <div>
                              <div className="text-sm font-medium text-red-400">{industry.symbol}</div>
                              <div className="text-xs text-white text-opacity-60 truncate max-w-32">{industry.name}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-mono text-red-300">
                              {industry.relativePerformance.toFixed(2)}%
                            </div>
                            <div className="text-xs text-red-300 text-opacity-60">{industry.category}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {viewMode === 'sectors' && (
              <div className="p-4">
                {/* Sector Analysis */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-white mb-4">Sector Performance Breakdown</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(getSectorBreakdown()).map(([sector, data]) => {
                      const total = data.bullish + data.bearish + data.neutral;
                      const bullishPct = (data.bullish / total) * 100;
                      const bearishPct = (data.bearish / total) * 100;
                      
                      return (
                        <div 
                          key={sector} 
                          className={`p-4 rounded-lg border transition-all cursor-pointer ${
                            selectedSector === sector 
                              ? 'bg-blue-500 bg-opacity-20 border-blue-500 border-opacity-50' 
                              : 'bg-white bg-opacity-5 border-white border-opacity-10 hover:bg-white hover:bg-opacity-10'
                          }`}
                          onClick={() => setSelectedSector(selectedSector === sector ? null : sector)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-white truncate">{sector}</h4>
                            <span className="text-xs text-white text-opacity-60">{total}</span>
                          </div>
                          
                          {/* Performance bar */}
                          <div className="w-full bg-gray-800 rounded-full h-2 mb-3 overflow-hidden">
                            <div className="h-full flex">
                              <div 
                                className="bg-green-500" 
                                style={{ width: `${bullishPct}%` }}
                              />
                              <div 
                                className="bg-red-500" 
                                style={{ width: `${bearishPct}%` }}
                              />
                            </div>
                          </div>
                          
                          <div className="flex justify-between text-xs">
                            <span className="text-green-400">{data.bullish} bull</span>
                            <span className="text-red-400">{data.bearish} bear</span>
                            {data.neutral > 0 && <span className="text-white text-opacity-60">{data.neutral} neutral</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            
            {(viewMode === 'momentum' || viewMode === 'correlations') && (
              <div className="p-4">
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">🚧</div>
                  <h3 className="text-lg font-medium text-white mb-2">
                    {viewMode === 'momentum' ? 'Momentum Analysis' : 'Correlation Matrix'}
                  </h3>
                  <p className="text-white text-opacity-60">Coming soon with advanced analytics</p>
                </div>
              </div>
            )}
            
            {/* Enhanced Industries List (only show in overview for now) */}
            {viewMode === 'overview' && (
              <div className="px-4 pb-4">
                {/* Controls */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-white">Industry Analysis</h3>
                  <div className="flex items-center space-x-3">
                    <select 
                      value={sortBy} 
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-[#1a1a1a] border border-white border-opacity-10 rounded px-3 py-1 text-xs text-white text-opacity-80"
                    >
                      <option value="performance">Performance</option>
                      <option value="volume">Volume</option>
                      <option value="momentum">Momentum</option>
                    </select>
                    
                    <select 
                      value={filterStrength} 
                      onChange={(e) => setFilterStrength(e.target.value as any)}
                      className="bg-[#1a1a1a] border border-white border-opacity-10 rounded px-3 py-1 text-xs text-white text-opacity-80"
                    >
                      <option value="all">All Signals</option>
                      <option value="strong">Strong Only</option>
                      <option value="moderate">Moderate+</option>
                    </select>
                  </div>
                </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Bullish Industries */}
              <div className="space-y-3">
                {bullishIndustries.length > 0 ? bullishIndustries.map((industry, index) => (
                  <div 
                    key={industry.symbol} 
                    className="group p-3 rounded-lg bg-green-500 bg-opacity-10 border border-green-500 border-opacity-20 hover:bg-green-500 hover:bg-opacity-15 transition-all duration-200 cursor-pointer"
                    onClick={() => setSelectedIndustry(selectedIndustry?.symbol === industry.symbol ? null : industry)}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center">
                        <span className="text-xs text-white text-opacity-40 mr-2">#{index + 1}</span>
                        <span className="text-green-400 font-medium">{industry.symbol}</span>
                      </div>
                      <div className="text-green-300 text-xs font-mono">
                        +{industry.relativePerformance.toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-white text-opacity-80 text-sm mb-1 truncate">{industry.name}</div>
                    <div className="text-green-300 text-opacity-80 text-xs mb-2">{industry.category}</div>
                    
                    {/* Performance bar */}
                    <div className="w-full bg-green-900 bg-opacity-30 rounded-full h-1.5 mb-2">
                      <div 
                        className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${Math.min(100, industry.relativePerformance * 10)}%` 
                        }}
                      />
                    </div>
                    
                    {/* Top Performers */}
                    <div className="flex flex-wrap gap-1">
                      {industry.topPerformers.slice(0, 2).map((holding) => (
                        <span
                          key={holding.symbol}
                          className="px-2 py-1 bg-green-600 bg-opacity-20 text-green-300 rounded text-xs font-mono"
                        >
                          {holding.symbol} +{holding.relativePerformance.toFixed(1)}%
                        </span>
                      ))}
                    </div>
                    
                    {/* Expanded details */}
                    {selectedIndustry?.symbol === industry.symbol && (
                      <div className="mt-3 pt-3 border-t border-green-500 border-opacity-20 space-y-2">
                        <div>
                          <div className="text-xs text-green-300 mb-1">All Top Performers:</div>
                          <div className="grid grid-cols-1 gap-1">
                            {industry.topPerformers.map((holding) => (
                              <div key={holding.symbol} className="flex justify-between text-xs">
                                <span className="text-white text-opacity-70">{holding.symbol}</span>
                                <span className="text-green-300">+{holding.relativePerformance.toFixed(2)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )) : timeframeData ? (
                  <div className="p-4 rounded-lg bg-gray-500 bg-opacity-10 border border-gray-500 border-opacity-20 text-center">
                    <div className="text-gray-400 text-sm">No bullish industries</div>
                    <div className="text-gray-500 text-xs mt-1">in this timeframe</div>
                  </div>
                ) : (
                  // Show loading placeholders while streaming
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="p-3 rounded-lg bg-gray-500 bg-opacity-10 border border-gray-500 border-opacity-20">
                      <div className="animate-pulse">
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center">
                            <div className="w-4 h-3 bg-gray-600 bg-opacity-50 rounded mr-2"></div>
                            <div className="w-12 h-3 bg-gray-600 bg-opacity-50 rounded"></div>
                          </div>
                          <div className="w-12 h-3 bg-gray-600 bg-opacity-50 rounded"></div>
                        </div>
                        <div className="w-24 h-3 bg-gray-600 bg-opacity-50 rounded mb-1"></div>
                        <div className="w-16 h-2 bg-gray-600 bg-opacity-50 rounded mb-2"></div>
                        <div className="w-full h-1.5 bg-gray-600 bg-opacity-50 rounded"></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Bearish Industries Section */}
              <div className="space-y-3">
                {bearishIndustries.length > 0 
                  ? bearishIndustries.map((industry, index) => (
                  <div 
                    key={industry.symbol} 
                    className="group p-3 rounded-lg bg-red-500 bg-opacity-10 border border-red-500 border-opacity-20 hover:bg-red-500 hover:bg-opacity-15 transition-all duration-200 cursor-pointer"
                    onClick={() => setSelectedIndustry(selectedIndustry?.symbol === industry.symbol ? null : industry)}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center">
                        <span className="text-xs text-white text-opacity-40 mr-2">#{index + 1}</span>
                        <span className="text-red-400 font-medium">{industry.symbol}</span>
                      </div>
                      <div className="text-red-300 text-xs font-mono">
                        {industry.relativePerformance.toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-white text-opacity-80 text-sm mb-1 truncate">{industry.name}</div>
                    <div className="text-red-300 text-opacity-80 text-xs mb-2">{industry.category}</div>
                    
                    {/* Performance bar */}
                    <div className="w-full bg-red-900 bg-opacity-30 rounded-full h-1.5 mb-2">
                      <div 
                        className="bg-red-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${Math.min(100, Math.abs(industry.relativePerformance) * 10)}%` 
                        }}
                      />
                    </div>
                    
                    {/* Top Performers (for bearish industries, these are the least bad) */}
                    <div className="flex flex-wrap gap-1">
                      {industry.topPerformers?.slice(0, 2).map((holding) => (
                        <span
                          key={holding.symbol}
                          className="px-2 py-1 bg-red-600 bg-opacity-20 text-red-300 rounded text-xs font-mono"
                        >
                          {holding.symbol} {holding.relativePerformance.toFixed(1)}%
                        </span>
                      ))}
                    </div>
                    
                    {/* Expanded details */}
                    {selectedIndustry?.symbol === industry.symbol && (
                      <div className="mt-3 pt-3 border-t border-red-500 border-opacity-20 space-y-2">
                        <div>
                          <div className="text-xs text-red-300 mb-1">Weakest Performers:</div>
                          <div className="grid grid-cols-1 gap-1">
                            {industry.topPerformers?.map((holding) => (
                              <div key={holding.symbol} className="flex justify-between text-xs">
                                <span className="text-white text-opacity-70">{holding.symbol}</span>
                                <span className="text-red-300">{holding.relativePerformance.toFixed(2)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  ))
                  : timeframeData ? (
                    <div className="p-4 rounded-lg bg-gray-500 bg-opacity-10 border border-gray-500 border-opacity-20 text-center">
                      <div className="text-gray-400 text-sm">No bearish industries</div>
                      <div className="text-gray-500 text-xs mt-1">in this timeframe</div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-white text-opacity-60">Loading...</div>
                  )
                }
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
};

export default RegimesPanel;
