// Test script to check what date flow scan is using
const https = require('https');

async function testFlowDate() {
    try {
        console.log('\n🧪 Testing Flow Scan Date Logic...\n');

        // Test market status API
        const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

        const response = await new Promise((resolve, reject) => {
            https.get(`https://api.polygon.io/v1/marketstatus/now?apikey=${apiKey}`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        console.log('📊 Market Status:', response.market);
        console.log('📅 Server Time:', response.serverTime);
        console.log('🏛️  Exchanges:', response.exchanges);

        const now = new Date();
        const easternString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
        const easternDate = new Date(easternString);
        const year = easternDate.getFullYear();
        const month = String(easternDate.getMonth() + 1).padStart(2, '0');
        const day = String(easternDate.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;

        console.log('\n📅 Today (Eastern):', today);
        console.log('🕐 Local Time:', now.toLocaleString());
        console.log('🕐 Eastern Time:', easternString);

        if (response.market !== 'open') {
            console.log('\n⚠️  Market is CLOSED - will scan previous trading day');
        } else {
            console.log('\n✅ Market is OPEN - will scan today from 9:30 AM');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testFlowDate();
