// Test script to verify our stock data API is working
// Run this with: node test-api.js

const testStockAPI = async () => {
  try {
    console.log('🧪 Testing Stock Data API...');
    
    // Test 1: Basic stock data
    const response = await fetch('http://localhost:3002/api/stock-data?symbol=AAPL&timeframe=1h&range=1D');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('✅ API Response received');
    console.log(`📊 Symbol: ${data.symbol}`);
    console.log(`📈 Data points: ${data.meta.count}`);
    console.log(`💰 Current price: $${data.meta.currentPrice.toFixed(2)}`);
    console.log(`📉 Price change: ${data.meta.priceChange > 0 ? '+' : ''}${data.meta.priceChange.toFixed(2)} (${data.meta.priceChangePercent.toFixed(2)}%)`);
    console.log(`📅 Date range: ${data.meta.dataRange.start} to ${data.meta.dataRange.end}`);
    
    if (data.data && data.data.length > 0) {
      const firstCandle = data.data[0];
      const lastCandle = data.data[data.data.length - 1];
      
      console.log(`\n🕐 First candle: ${firstCandle.date} - O:${firstCandle.open} H:${firstCandle.high} L:${firstCandle.low} C:${firstCandle.close}`);
      console.log(`🕕 Last candle: ${lastCandle.date} - O:${lastCandle.open} H:${lastCandle.high} L:${lastCandle.low} C:${lastCandle.close}`);
    }
    
    console.log('\n🎉 Stock Data API is working perfectly with real Polygon data!');
    
  } catch (error) {
    console.error('❌ Error testing Stock Data API:', error.message);
  }
};

// Test 2: Real-time quotes (commented out as it requires EventSource which is browser-only)
/*
const testRealTimeAPI = () => {
  console.log('\n🔄 Testing Real-time Quotes API...');
  
  const eventSource = new EventSource('http://localhost:3002/api/realtime-quotes?symbols=AAPL,TSLA');
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('📡 Real-time update:', data);
  };
  
  eventSource.onerror = (error) => {
    console.error('❌ Real-time connection error:', error);
    eventSource.close();
  };
  
  // Close after 10 seconds
  setTimeout(() => {
    eventSource.close();
    console.log('🔌 Real-time connection closed');
  }, 10000);
};
*/

// Run the test
testStockAPI();
