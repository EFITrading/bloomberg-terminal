// AI Trade Scoring Worker - Advanced 9-factor model for all market regime timeframes
// Handles Life (80d), Developing (21d), and Momentum (5d) regime tabs
self.onmessage = function(e) {
  const { candidates, pricesMap } = e.data;
  
  console.log('🔧 Worker received:', { candidateCount: candidates?.length, pricesMapKeys: Object.keys(pricesMap || {}).length });
  
  if (!candidates || !Array.isArray(candidates)) {
    console.error('Worker: Invalid candidates array');
    self.postMessage({ success: false, error: 'Invalid candidates array' });
    return;
  }
  
  if (!pricesMap || typeof pricesMap !== 'object') {
    console.error('Worker: Invalid pricesMap object');
    self.postMessage({ success: false, error: 'Invalid pricesMap object' });
    return;
  }
  
  try {
    console.log('🔧 Worker: Starting to score candidates...');
    const scoredCandidates = candidates.map((candidate, idx) => {
      if (!candidate || !candidate.symbol || !candidate.trend) {
        return { ...candidate, score: 0, details: { error: 'Invalid candidate' } };
      }
      
      const prices = pricesMap[candidate.symbol];
      // Flexible minimum: 3 points for Momentum (5d), more is better but work with what we have
      if (!prices || !Array.isArray(prices) || prices.length < 2) {
        console.log(`⚠️ Worker: ${candidate.symbol} - insufficient data (${prices?.length || 0} points)`);
        return { ...candidate, score: 0, details: { error: 'Insufficient data', dataPoints: prices?.length || 0 } };
      }
      
      const closes = prices.map(p => {
        const close = typeof p === 'object' ? p.close : p;
        return typeof close === 'number' && !isNaN(close) && close > 0 ? close : null;
      }).filter(c => c !== null);
      
      const volumes = prices.map(p => {
        if (typeof p === 'object' && p.volume) {
          const vol = parseFloat(p.volume);
          return !isNaN(vol) && vol >= 0 ? vol : 0;
        }
        return 0;
      });
      
      if (closes.length < 3) {
        console.log(`⚠️ Worker: ${candidate.symbol} - no valid closes after filtering (had ${prices.length} raw)`);
        return { ...candidate, score: 0, details: { error: 'No valid closes', rawCount: prices.length } };
      }
      
      const scores = {};
      let totalScore = 0;
      
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        const ret = (closes[i] - closes[i-1]) / closes[i-1];
        if (!isNaN(ret) && isFinite(ret) && Math.abs(ret) < 1.0) {
          returns.push(ret);
        }
      }
      
      if (returns.length === 0) {
        console.log(`⚠️ Worker: ${candidate.symbol} - no valid returns calculated`);
        return { ...candidate, score: 0, details: { error: 'No valid returns', closes: closes.length } };
      }
      
      const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      const totalReturn = (closes[closes.length - 1] / closes[0]) - 1;
      
      // 1. Persistence Score (20 points)
      const positiveReturns = returns.filter(r => candidate.trend === 'bullish' ? r > 0 : r < 0).length;
      const persistenceRatio = positiveReturns / returns.length;
      scores.persistence = Math.floor(persistenceRatio * 20);
      totalScore += scores.persistence;
      
      // 2. Regression Score (15 points)
      try {
        const xValues = Array.from({ length: closes.length }, (_, i) => i);
        const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
        const yMean = closes.reduce((a, b) => a + b, 0) / closes.length;
        const numerator = xValues.reduce((sum, x, i) => sum + (x - xMean) * (closes[i] - yMean), 0);
        const denominator = xValues.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0);
        const slope = denominator !== 0 ? numerator / denominator : 0;
        const expectedDirection = candidate.trend === 'bullish' ? slope > 0 : slope < 0;
        const yFitted = xValues.map(x => yMean + slope * (x - xMean));
        const ssRes = closes.reduce((sum, y, i) => sum + Math.pow(y - yFitted[i], 2), 0);
        const ssTot = closes.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
        const rSquared = ssTot !== 0 ? Math.max(0, Math.min(1, 1 - (ssRes / ssTot))) : 0;
        scores.regression = expectedDirection ? Math.min(rSquared * 15, 15) : 0;
        totalScore += scores.regression;
      } catch (err) {
        scores.regression = 0;
      }
      
      // 3. Efficiency Score (15 points)
      try {
        const absoluteMoves = returns.map(r => Math.abs(r));
        const avgAbsMove = absoluteMoves.length > 0 ? absoluteMoves.reduce((a, b) => a + b, 0) / absoluteMoves.length : 0;
        const totalMove = Math.abs(totalReturn);
        const pathLength = avgAbsMove * returns.length;
        const efficiency = pathLength > 0 ? Math.min(totalMove / pathLength, 1.0) : 0;
        scores.efficiency = Math.max(0, Math.min(efficiency * 15, 15));
        totalScore += scores.efficiency;
      } catch (err) {
        scores.efficiency = 0;
      }
      
      // 4. Fractal/Hurst Score (10 points)
      try {
        const absoluteMoves = returns.map(r => Math.abs(r));
        const avgAbsMove = absoluteMoves.length > 0 ? absoluteMoves.reduce((a, b) => a + b, 0) / absoluteMoves.length : 0;
        const lags = returns.length >= 20 ? [2, 5, 10, 15] : returns.length >= 10 ? [2, 5, Math.floor(returns.length / 2)] : [2, Math.floor(returns.length / 2)];
        let hurstSum = 0;
        let validLags = 0;
        for (const lag of lags) {
          if (lag >= returns.length || lag < 1) continue;
          let laggedSum = 0;
          let count = 0;
          for (let i = lag; i < returns.length; i++) {
            laggedSum += Math.abs(returns[i]);
            count++;
          }
          if (count > 0) {
            hurstSum += laggedSum / count;
            validLags++;
          }
        }
        const avgLaggedReturn = validLags > 0 ? hurstSum / validLags : avgAbsMove;
        const hurst = avgAbsMove > 0 ? avgLaggedReturn / avgAbsMove : 0.5;
        if (hurst > 0.5) {
          scores.fractal = Math.min((hurst - 0.5) * 20, 10);
        } else {
          scores.fractal = Math.max(0, (hurst - 0.3) * 5);
        }
        totalScore += scores.fractal;
      } catch (err) {
        scores.fractal = 5;
        totalScore += scores.fractal;
      }
      
      // 5. Volatility-Adjusted Return (10 points)
      try {
        const sharpeRatio = stdDev > 0 ? totalReturn / stdDev : 0;
        const scaledSharpe = Math.abs(sharpeRatio) * 3;
        scores.volAdjusted = Math.max(0, Math.min(scaledSharpe, 10));
        totalScore += scores.volAdjusted;
      } catch (err) {
        scores.volAdjusted = 0;
      }
      
      // 6. Drawdown Score (10 points)
      try {
        let maxPrice = closes[0];
        let maxDrawdown = 0;
        let drawdownCount = 0;
        for (let i = 0; i < closes.length; i++) {
          if (closes[i] > maxPrice) maxPrice = closes[i];
          const drawdown = maxPrice > 0 ? (maxPrice - closes[i]) / maxPrice : 0;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
          if (drawdown > 0.02) drawdownCount++;
        }
        const ddPenalty = maxDrawdown * 40;
        const frequencyPenalty = (drawdownCount / closes.length) * 10;
        scores.drawdown = Math.max(0, 10 - ddPenalty - frequencyPenalty);
        scores.maxDrawdown = maxDrawdown;
        totalScore += scores.drawdown;
      } catch (err) {
        scores.drawdown = 5;
        totalScore += scores.drawdown;
      }
      
      // 7. Skewness Score (10 points)
      try {
        if (stdDev > 0 && returns.length >= 5) {
          const skewness = returns.reduce((sum, r) => {
            const standardized = (r - meanReturn) / stdDev;
            return sum + Math.pow(standardized, 3);
          }, 0) / returns.length;
          const expectedSkew = candidate.trend === 'bullish' ? skewness > 0 : skewness < 0;
          if (expectedSkew) {
            scores.skewness = Math.min(Math.abs(skewness) * 5, 10);
          } else {
            scores.skewness = Math.max(0, 3 - Math.abs(skewness) * 2);
          }
        } else {
          scores.skewness = 5;
        }
        totalScore += scores.skewness;
      } catch (err) {
        scores.skewness = 5;
        totalScore += scores.skewness;
      }
      
      // 8. Regime Consistency Score (10 points)
      try {
        const minSegmentSize = Math.max(2, Math.floor(closes.length / 5));
        const segmentCount = Math.min(5, Math.floor(closes.length / minSegmentSize));
        const segments = [];
        const segmentSize = Math.floor(closes.length / segmentCount);
        for (let i = 0; i < segmentCount; i++) {
          const start = i * segmentSize;
          const end = i === segmentCount - 1 ? closes.length : (i + 1) * segmentSize;
          const segment = closes.slice(start, end);
          if (segment.length >= 2) segments.push(segment);
        }
        let consistentSegments = 0;
        let strongSegments = 0;
        for (const segment of segments) {
          const segmentReturn = (segment[segment.length - 1] - segment[0]) / segment[0];
          const matchesTrend = candidate.trend === 'bullish' ? segmentReturn > 0 : segmentReturn < 0;
          if (matchesTrend) {
            consistentSegments++;
            if (Math.abs(segmentReturn) > 0.02) strongSegments++;
          }
        }
        if (segments.length > 0) {
          const consistencyRatio = consistentSegments / segments.length;
          const strengthBonus = strongSegments / segments.length * 2;
          scores.regime = Math.min(consistencyRatio * 8 + strengthBonus, 10);
        } else {
          scores.regime = 5;
        }
        totalScore += scores.regime;
      } catch (err) {
        scores.regime = 5;
        totalScore += scores.regime;
      }
      
      // 9. Breadth Score (10 points)
      try {
        const relPerf = candidate.relativePerformance || 0;
        const relPerfMagnitude = Math.abs(relPerf);
        scores.breadth = Math.min(relPerfMagnitude / 2, 10);
        totalScore += scores.breadth;
      } catch (err) {
        scores.breadth = 0;
      }
      
      // BONUS: Volume Confirmation (up to +5 points)
      try {
        if (volumes.length >= 5) {
          const validVolumes = volumes.filter(v => v > 0);
          if (validVolumes.length >= 5) {
            const mid = Math.floor(validVolumes.length / 2);
            const firstHalfVol = validVolumes.slice(0, mid);
            const secondHalfVol = validVolumes.slice(mid);
            const avgFirstVol = firstHalfVol.reduce((a, b) => a + b, 0) / firstHalfVol.length;
            const avgSecondVol = secondHalfVol.reduce((a, b) => a + b, 0) / secondHalfVol.length;
            if (avgFirstVol > 0) {
              const volumeTrend = (avgSecondVol - avgFirstVol) / avgFirstVol;
              if (volumeTrend > 0) {
                scores.volumeConfirmation = Math.min(volumeTrend * 10, 5);
                totalScore += scores.volumeConfirmation;
              } else {
                scores.volumeConfirmation = 0;
              }
            }
          }
        }
      } catch (err) {
        scores.volumeConfirmation = 0;
      }
      
      totalScore = Math.max(0, Math.min(totalScore, 105));
      
      return { 
        ...candidate, 
        score: Math.round(totalScore),
        details: {
          persistence: Math.round((scores.persistence || 0) * 10) / 10,
          regression: Math.round((scores.regression || 0) * 10) / 10,
          efficiency: Math.round((scores.efficiency || 0) * 10) / 10,
          fractal: Math.round((scores.fractal || 0) * 10) / 10,
          volAdjusted: Math.round((scores.volAdjusted || 0) * 10) / 10,
          drawdown: Math.round((scores.drawdown || 0) * 10) / 10,
          skewness: Math.round((scores.skewness || 0) * 10) / 10,
          regime: Math.round((scores.regime || 0) * 10) / 10,
          breadth: Math.round((scores.breadth || 0) * 10) / 10,
          volumeBonus: Math.round((scores.volumeConfirmation || 0) * 10) / 10,
          dataPoints: closes.length,
          totalReturn: Math.round(totalReturn * 10000) / 100,
          volatility: Math.round(stdDev * 10000) / 100,
          avgDailyReturn: Math.round(meanReturn * 10000) / 100,
          maxDD: scores.maxDrawdown ? Math.round(scores.maxDrawdown * 10000) / 100 : 0,
          calculatedAt: Date.now(),
          workerVersion: '2.0-complete'
        }
      };
    });
    
    const validScores = scoredCandidates.filter(c => c.score > 0);
    const avgScore = validScores.length > 0 ? validScores.reduce((sum, c) => sum + c.score, 0) / validScores.length : 0;
    console.log(`✅ Worker complete: ${validScores.length}/${candidates.length} scored, avg: ${avgScore.toFixed(1)}`);
    
    self.postMessage({ 
      success: true, 
      scoredCandidates,
      stats: {
        total: candidates.length,
        scored: validScores.length,
        avgScore: Math.round(avgScore * 10) / 10,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    console.error('❌ Worker fatal error:', error);
    self.postMessage({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
};
