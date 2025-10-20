// CLEAN FETCHSINGLESTOCK FUNCTION FOR IV SCREENER
const fetchSingleStock = async (symbol: string): Promise<StockData | null> => {
  try {
    // Get stock price
    const priceRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${API_KEY}`);
    
    if (!priceRes.ok) return null;
    
    const priceData = await priceRes.json();
    
    if (!priceData?.results) return null;

    const priceResult = priceData.results[0];
    const currentPrice = priceResult?.c || 0;
    const prevClose = priceResult?.o || 0;
    
    // Get front-month option contracts (30-45 days)
    const today = new Date().toISOString().split('T')[0];
    const contractsRes = await fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date.gte=${today}&limit=1000&apiKey=${API_KEY}`);
    
    if (!contractsRes.ok) return null;
    
    const contractsData = await contractsRes.json();
    
    if (!contractsData?.results) return null;
    
    // Filter for front-month (30-45 days) and ATM contracts
    const frontMonthATMContracts = contractsData.results
      .filter((contract: any) => {
        const expiry = new Date(contract.expiration_date);
        const daysToExpiry = (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        const strike = contract.strike_price;
        
        return daysToExpiry >= 30 && 
               daysToExpiry <= 45 && 
               Math.abs(strike - currentPrice) <= 5;
      })
      .sort((a: any, b: any) => Math.abs(a.strike_price - currentPrice) - Math.abs(b.strike_price - currentPrice));
    
    if (frontMonthATMContracts.length === 0) {
      console.log(`❌ No front-month ATM contracts (30-45 DTE) found for ${symbol}`);
      return null;
    }
    
    const bestContract = frontMonthATMContracts[0];
    const daysToExpiry = (new Date(bestContract.expiration_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    
    // Get REAL IV directly from Polygon snapshot
    const snapshotRes = await fetch(`https://api.polygon.io/v3/snapshot/options/${symbol}?apiKey=${API_KEY}`);
    
    if (!snapshotRes.ok) {
      console.log(`❌ Snapshot failed for ${symbol}`);
      return null;
    }
    
    const snapshotData = await snapshotRes.json();
    
    if (!snapshotData?.results) {
      console.log(`❌ No snapshot data for ${symbol}`);
      return null;
    }
    
    // Find our specific contract in the snapshot
    const ourOption = snapshotData.results.find((opt: any) => 
      opt.details?.strike_price === bestContract.strike_price && 
      opt.details?.contract_type === bestContract.contract_type &&
      opt.details?.expiration_date === bestContract.expiration_date
    );
    
    if (!ourOption || !ourOption.implied_volatility) {
      console.log(`❌ No IV data for ${symbol} ${bestContract.strike_price} ${bestContract.contract_type}`);
      return null;
    }
    
    // Get REAL IV directly from Polygon
    const realIV = ourOption.implied_volatility;
    const realIVPercent = (realIV * 100).toFixed(2);
    
    console.log(`✅ ${symbol}: REAL IV ${realIVPercent}% from Polygon (${Math.round(daysToExpiry)} DTE, $${bestContract.strike_price} ${bestContract.contract_type})`);

    return {
      symbol,
      ivRank: 0, // Will implement with historical data
      ivPercentile: 0, // Will implement with historical data
      iv52WeekHigh: realIVPercent, // Show real IV as proof
      iv52WeekLow: realIVPercent, // Show real IV as proof  
      price: currentPrice.toString(),
      change: prevClose > 0 ? (currentPrice - prevClose).toString() : '0',
      volume: priceResult?.v || 0,
      historicalIV: [] // Will implement with historical data
    };
  } catch (error) {
    console.error(`❌ Error fetching REAL IV for ${symbol}:`, error);
    return null;
  }
};

export default fetchSingleStock;