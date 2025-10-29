// GEX/DEX/VEX Calculation Worker for ultra-fast parallel processing
// Compatible with Vercel deployment

console.log('[WORKER] Worker file loaded and executing!');

self.onmessage = function(e) {
  const { type, data } = e.data;
  console.log('[WORKER] Received message:', type);
  
  if (type === 'CALCULATE_GEX') {
    try {
      console.log('[WORKER] Starting calculation...');
      const { expirations, optionsData, currentPrice } = data;
      
      console.log(`[WORKER] Received ${expirations.length} expirations, currentPrice: ${currentPrice}`);
      
      const gexByStrikeByExp = {};
      const vexByStrikeByExp = {};
      const dexByStrikeByExp = {};
      const allStrikes = new Set();
      
      const totalExpirations = expirations.length;
      
      // Process each expiration
      expirations.forEach((expDate, index) => {
        if (!optionsData[expDate]) {
          console.warn(`[WORKER] No data for expiration: ${expDate}`);
          return;
        }
        
        const { calls, puts } = optionsData[expDate];
        
        if (!calls || !puts) {
          console.warn(`[WORKER] Missing calls or puts for ${expDate}`);
          return;
        }
        
        gexByStrikeByExp[expDate] = {};
        vexByStrikeByExp[expDate] = {};
        dexByStrikeByExp[expDate] = {};
        
        // Helper function to process options
        const processOptions = (optionsData, isCall) => {
          Object.entries(optionsData).forEach(([strike, optData]) => {
            const strikeNum = parseFloat(strike);
            const oi = optData.open_interest || 0;
            
            if (oi > 0) {
              const gamma = optData.greeks?.gamma || 0;
              const vega = optData.greeks?.vega || 0;
              const delta = optData.greeks?.delta || 0;
              
              // GEX calculation (positive for calls, negative for puts)
              if (gamma) {
                const gex = (isCall ? gamma : -gamma) * oi * (currentPrice * currentPrice) * 100;
                gexByStrikeByExp[expDate][strikeNum] = (gexByStrikeByExp[expDate][strikeNum] || 0) + gex;
              }
              
              // VEX calculation (always positive)
              if (vega) {
                const vex = vega * oi * 100;
                vexByStrikeByExp[expDate][strikeNum] = (vexByStrikeByExp[expDate][strikeNum] || 0) + vex;
              }
              
              // DEX calculation
              if (delta) {
                const dex = delta * oi * currentPrice * 100;
                dexByStrikeByExp[expDate][strikeNum] = (dexByStrikeByExp[expDate][strikeNum] || 0) + dex;
              }
              
              allStrikes.add(strikeNum);
            }
          });
        };
        
        processOptions(calls, true);
        processOptions(puts, false);
        
        // Send progress updates every 5 expirations or at the end
        if ((index + 1) % 5 === 0 || index === totalExpirations - 1) {
          const progress = Math.round(((index + 1) / totalExpirations) * 80) + 10; // 10-90%
          console.log(`[WORKER] Progress: ${progress}% (${index + 1}/${totalExpirations})`);
          self.postMessage({
            type: 'PROGRESS',
            progress
          });
        }
      });
      
      console.log('[WORKER] Calculation complete, sending results...');
      
      // Send results back to main thread
      self.postMessage({
        type: 'CALCULATION_COMPLETE',
        result: {
          gexByStrikeByExp,
          vexByStrikeByExp,
          dexByStrikeByExp,
          allStrikes: Array.from(allStrikes),
          currentPrice, // Return this so the handler can use it
          expirations // Return expirations so handler knows what to display
        }
      });
    } catch (error) {
      console.error('[WORKER] Error:', error);
      self.postMessage({
        type: 'CALCULATION_ERROR',
        error: error.message
      });
    }
  }
};
