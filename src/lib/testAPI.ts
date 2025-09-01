// Test the Polygon API connection
import PolygonService from './polygonService';

const testPolygonAPI = async () => {
  console.log('🧪 Testing Polygon API Connection');
  console.log('API Key:', 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf');
  
  const service = new PolygonService();
  
  try {
    // Test 1: Get ticker details
    console.log('📊 Testing ticker details...');
    const ticker = await service.getTickerDetails('AAPL');
    console.log('✅ Ticker details:', ticker?.name);
    
    // Test 2: Get historical data
    console.log('📈 Testing historical data...');
    const historical = await service.getHistoricalData('AAPL', '2024-08-01', '2024-08-31');
    console.log('✅ Historical data points:', historical?.results?.length);
    
    // Test 3: Analyze seasonal pattern
    console.log('🔍 Testing seasonal analysis...');
    const pattern = await service.analyzeSeasonalPattern('AAPL', 8, 12, 9, 18, 5);
    console.log('✅ Seasonal pattern:', pattern?.symbol, pattern?.annualizedReturn);
    
    return true;
  } catch (error) {
    console.error('❌ API Test Failed:', error);
    return false;
  }
};

// Run the test
testPolygonAPI().then(success => {
  console.log('API Test Result:', success ? 'PASSED' : 'FAILED');
});

export default testPolygonAPI;
