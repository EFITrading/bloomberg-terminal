// Breadth History Worker - Parallel processing for historical advance/decline data
console.log('[BREADTH WORKER] Worker initialized');

self.addEventListener('message', async (e) => {
  const { type, payload } = e.data;
  
  if (type === 'LOAD_DAYS_BATCH') {
    const { dates, spyStocks, apiKey, batchIndex, totalBatches } = payload;
    
    console.log(`[WORKER ${batchIndex}] Processing ${dates.length} days`);
    
    const results = [];
    
    // Process each day
    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i];
      
      try {
        // Use grouped daily endpoint - gets ALL stocks in ONE call
        const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${apiKey}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.warn(`[WORKER ${batchIndex}] Failed to fetch ${dateStr}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
          console.warn(`[WORKER ${batchIndex}] No results for ${dateStr}`);
          continue;
        }
        
        // Filter to only S&P 500 stocks and calculate advance/decline
        const spySet = new Set(spyStocks);
        let advancing = 0;
        let declining = 0;
        const THRESHOLD = 0.001; // 0.1% threshold
        
        data.results.forEach(stock => {
          // Normalize ticker (remove market suffix)
          const ticker = stock.T.split(':')[0];
          
          if (spySet.has(ticker)) {
            const open = stock.o;
            const close = stock.c;
            
            if (open && close) {
              const percentChange = (close - open) / open;
              
              if (percentChange >= THRESHOLD) advancing++; // +0.1% or more
              else if (percentChange <= -THRESHOLD) declining++; // -0.1% or less
            }
          }
        });
        
        if (advancing + declining > 0) {
          const ratio = declining > 0 ? advancing / declining : advancing;
          const timestamp = new Date(dateStr).getTime();
          
          results.push({
            dateStr,
            timestamp,
            advancing,
            declining,
            ratio
          });
          
          console.log(`[WORKER ${batchIndex}] ✅ ${dateStr}: ${advancing}↑ ${declining}↓ ratio: ${ratio.toFixed(2)}`);
        }
        
        // Send progress update
        self.postMessage({
          type: 'PROGRESS',
          payload: {
            batchIndex,
            daysCompleted: i + 1,
            totalDays: dates.length,
            currentDate: dateStr
          }
        });
        
      } catch (error) {
        console.error(`[WORKER ${batchIndex}] Error on ${dateStr}:`, error.message);
      }
    }
    
    // Send completed results
    self.postMessage({
      type: 'BATCH_COMPLETE',
      payload: {
        batchIndex,
        results,
        daysProcessed: dates.length
      }
    });
    
    console.log(`[WORKER ${batchIndex}] ✅ Batch complete: ${results.length}/${dates.length} days with data`);
  }
});

console.log('[BREADTH WORKER] Ready for messages');
