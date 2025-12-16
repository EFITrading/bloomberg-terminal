'use client';

import React, { useState, useEffect } from 'react';
import RRGChart from './RRGChart';
import IVLineChart from './IVLineChart';
import IVRRGService, { IVRRGCalculationResult } from '@/lib/ivRRGService';
import './RRGAnalytics.css';

interface IVRRGAnalyticsProps {
  defaultTimeframe?: string;
  defaultBenchmark?: string;
}

const IVRRGAnalytics: React.FC<IVRRGAnalyticsProps> = ({
  defaultTimeframe = '120 days',
  defaultBenchmark = 'SPY'
}) => {
  const [rrgData, setRrgData] = useState<any[]>([]);
  const [ivChartData, setIvChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTails, setShowTails] = useState(true);
  const [tailLength, setTailLength] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('iv-rrg-tail-length');
      return saved ? parseInt(saved, 10) : 10;
    }
    return 10;
  });
  const [timeframe, setTimeframe] = useState(defaultTimeframe);
  const [benchmark, setBenchmark] = useState(defaultBenchmark);
  const [symbolMode, setSymbolMode] = useState<'custom' | 'mag7' | 'highBeta' | 'lowBeta'>('custom');
  const [customSymbols, setCustomSymbols] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const ivRRGService = new IVRRGService();

  // Predefined symbol groups
  const symbolGroups = {
    mag7: 'AAPL,MSFT,GOOGL,AMZN,META,TSLA,NVDA',
    highBeta: 'HOOD,PLTR,CRWD,RBLX,UPST,AFRM',
    lowBeta: 'UPS,CRM,NFLX,BA,FDX,CAT,JPM'
  };

  // Get current symbols based on mode
  const getCurrentSymbols = () => {
    if (symbolMode === 'custom') {
      return customSymbols;
    }
    return symbolGroups[symbolMode];
  };

  const loadIVChartData = async (symbols: string[], benchmarkSymbol: string, days: number) => {
    try {
      const chartData = [];
      
      // Color palette
      const colors = ['#00CED1', '#FF1493', '#FFD700', '#32CD32', '#FF6347', '#9370DB'];
      
      // Fetch benchmark (SPY) first
      const benchmarkResponse = await fetch(`/api/calculate-historical-iv?ticker=${benchmarkSymbol}&days=${days}`);
      if (benchmarkResponse.ok) {
        const benchmarkData = await benchmarkResponse.json();
        if (benchmarkData.success && benchmarkData.data?.history) {
          chartData.push({
            symbol: benchmarkSymbol,
            ivHistory: benchmarkData.data.history.map((h: any) => {
              // API returns callIV and putIV as percentages, we need to average them and convert to decimal
              const avgIV = ((h.callIV || 0) + (h.putIV || 0)) / 2;
              return {
                date: h.date,
                iv: avgIV / 100 // Convert percentage to decimal (e.g., 45.2 -> 0.452)
              };
            }).filter((d: any) => !isNaN(d.iv) && isFinite(d.iv)),
            color: '#FF8500' // Orange for SPY
          });
        }
      }
      
      // Fetch each ticker's IV
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        const response = await fetch(`/api/calculate-historical-iv?ticker=${symbol}&days=${days}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.history) {
            chartData.push({
              symbol: symbol,
              ivHistory: data.data.history.map((h: any) => {
                // API returns callIV and putIV as percentages, we need to average them and convert to decimal
                const avgIV = ((h.callIV || 0) + (h.putIV || 0)) / 2;
                return {
                  date: h.date,
                  iv: avgIV / 100 // Convert percentage to decimal (e.g., 45.2 -> 0.452)
                };
              }).filter((d: any) => !isNaN(d.iv) && isFinite(d.iv)),
              color: colors[i % colors.length]
            });
          }
        }
      }
      
      setIvChartData(chartData);
    } catch (error) {
      console.error('Error loading IV chart data:', error);
    }
  };

  const handleTailLengthChange = (newLength: number) => {
    setTailLength(newLength);
    if (typeof window !== 'undefined') {
      localStorage.setItem('iv-rrg-tail-length', newLength.toString());
    }
  };

  const timeframeOptions = [
    { label: '30 days', value: '30 days', weeks: 5, rsPeriod: 4, momentumPeriod: 4 },
    { label: '120 days', value: '120 days', weeks: 18, rsPeriod: 16, momentumPeriod: 16 },
    { label: '365 days', value: '365 days', weeks: 52, rsPeriod: 48, momentumPeriod: 48 }
  ];

  // IV RRG specific benchmark options
  const benchmarkOptions = [
    { label: 'Benchmark by SPY', value: 'SPY' },
    { label: 'Self-Benchmark', value: 'SELF' }
  ];

  const loadIVRRGData = async () => {
    setLoading(true);
    setError(null);

    try {
      const symbolsString = getCurrentSymbols();
      if (!symbolsString.trim()) {
        // No symbols selected, just set empty data and return
        setRrgData([]);
        setIvChartData([]);
        setLoading(false);
        return;
      }

      const symbols = symbolsString.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
      
      // Multi-timeframe analysis for single ticker
      if (symbols.length === 1) {
        console.log(`🔄 Loading multi-timeframe IV RRG for ${symbols[0]}...`);
        
        // Define the three timeframes for comparison
        const multiTimeframes = [
          { label: '30d', value: '30 days', weeks: 5, rsPeriod: 4, momentumPeriod: 4 },
          { label: '120d', value: '120 days', weeks: 18, rsPeriod: 16, momentumPeriod: 16 },
          { label: '365d', value: '365 days', weeks: 52, rsPeriod: 48, momentumPeriod: 48 }
        ];

        // Fetch data for all three timeframes in parallel
        const allData = await Promise.all(
          multiTimeframes.map(async (tf) => {
            const days = tf.weeks * 7;
            // Always fetch max tail data (50 points), tailLength is used only for display
            const data = await ivRRGService.calculateIVBasedRRG(
              symbols, 
              benchmark, 
              days, 
              tf.rsPeriod, 
              tf.momentumPeriod, 
              50
            );
            return { timeframe: tf.label, data };
          })
        );

        // Transform and combine all timeframe data
        const transformedData = allData.flatMap(({ timeframe, data }) =>
          data.map(item => {
            console.log(`📍 ${item.symbol} (${timeframe}): ${item.tail?.length || 0} tail points, RS: ${item.ivRatio?.toFixed(2)}, Momentum: ${item.ivMomentum?.toFixed(2)}`);
            return {
              symbol: `${item.symbol} (${timeframe})`,
              name: `${item.name} (${timeframe})`,
              rsRatio: item.ivRatio,
              rsMomentum: item.ivMomentum,
              sector: timeframe, // Use timeframe as "sector" for color coding
              tail: item.tail.map(t => ({
                rsRatio: t.ivRatio,
                rsMomentum: t.ivMomentum,
                date: t.date
              })),
              currentPrice: item.currentIV,
              priceChange: item.ivRank,
              priceChangePercent: item.ivPercentile
            };
          })
        );

        setRrgData(transformedData);
        
        // Load IV chart data for the longest timeframe (1Y)
        const longestTF = multiTimeframes[2];
        await loadIVChartData(symbols, benchmark, longestTF.weeks * 7);
        
        console.log(`✅ Loaded ${symbols[0]} across 3 timeframes`);

      } else {
        // Normal multi-ticker single timeframe analysis
        console.log(`🔄 Loading IV RRG data for ${symbolMode} mode...`);
        console.log(`📊 TailLength state value: ${tailLength}`);
        
        const selectedTimeframe = timeframeOptions.find(tf => tf.value === timeframe);
        if (!selectedTimeframe) {
          throw new Error(`Invalid timeframe selected: ${timeframe}`);
        }

        const { weeks, rsPeriod, momentumPeriod } = selectedTimeframe;
        const days = weeks * 7;

        console.log(`📊 Calling calculateIVBasedRRG - fetching max tail data (50 points)`);
        
        // Always fetch max tail data (50 points), tailLength state is used only for display filtering
        const data = await ivRRGService.calculateIVBasedRRG(
          symbols, 
          benchmark, 
          days, 
          rsPeriod, 
          momentumPeriod, 
          50
        );

        if (!data || data.length === 0) {
          throw new Error('No data available. Please try different settings.');
        }

        // Transform IV RRG data to match RRGChart expected format
        const transformedData = data.map(item => ({
          symbol: item.symbol,
          name: item.name,
          rsRatio: item.ivRatio,
          rsMomentum: item.ivMomentum,
          sector: item.sector,
          tail: item.tail.map(t => ({
            rsRatio: t.ivRatio,
            rsMomentum: t.ivMomentum,
            date: t.date
          })),
          currentPrice: item.currentIV,
          priceChange: item.ivRank,
          priceChangePercent: item.ivPercentile
        }));

        setRrgData(transformedData);
        
        // Fetch raw IV data for line chart
        await loadIVChartData(symbols, benchmark, days);
        
        console.log(`✅ Loaded ${data.length} IV RRG positions`);
      }

    } catch (err: any) {
      console.error('❌ Error loading IV RRG data:', err);
      setError(err.message || 'Failed to load IV RRG data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadIVRRGData();
  }, [timeframe, benchmark, symbolMode]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadIVRRGData();
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#000000' }}>
      {loading && getCurrentSymbols().trim() ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#ff8500',
          fontSize: '18px',
          fontFamily: '"Bloomberg Terminal", monospace'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: '20px', fontSize: '24px' }}>⏳</div>
            <div>Loading IV RRG Data...</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '10px' }}>
              Calculating implied volatility rotation metrics
            </div>
          </div>
        </div>
      ) : error ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#ff0000',
          fontSize: '16px',
          fontFamily: '"Bloomberg Terminal", monospace',
          textAlign: 'center',
          padding: '20px'
        }}>
          <div>
            <div style={{ marginBottom: '20px', fontSize: '48px' }}>⚠️</div>
            <div style={{ marginBottom: '10px' }}>Error Loading IV RRG Data</div>
            <div style={{ fontSize: '14px', color: '#888' }}>{error}</div>
            <button
              onClick={handleRefresh}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                background: '#ff8500',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: '"Bloomberg Terminal", monospace',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          <RRGChart
            data={rrgData}
            showTails={showTails}
            tailLength={tailLength}
            onTailLengthChange={handleTailLengthChange}
            onShowTailsChange={setShowTails}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            timeframeOptions={timeframeOptions}
            benchmark={benchmark}
            onBenchmarkChange={setBenchmark}
            benchmarkOptions={benchmarkOptions}
            customSymbols={customSymbols}
            onCustomSymbolsChange={setCustomSymbols}
            onRefresh={handleRefresh}
            isIVMode={true}
            symbolMode={symbolMode}
            onSymbolModeChange={setSymbolMode}
          />
          
          {/* IV Line Chart */}
          {ivChartData.length > 0 && (
            <div style={{ marginTop: '30px', width: '100%' }}>
              <IVLineChart data={ivChartData} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default IVRRGAnalytics;
