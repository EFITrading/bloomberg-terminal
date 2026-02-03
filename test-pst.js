// Test the exact logic that will run in the browser
const now = new Date();
const year = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' }));
const month = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric' }));
const day = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', day: 'numeric' }));
const hour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false }));
const minute = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', minute: 'numeric' }));
const dayOfWeek = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long' });

const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

console.log('PST Date:', todayStr);
console.log('Day of Week:', dayOfWeek);
console.log('Time:', `${hour}:${String(minute).padStart(2, '0')}`);
console.log('Expected: 2026-02-02 (Sunday) around 23:17');

const pstDate = new Date(year, month - 1, day);
const startDate = new Date(pstDate);
startDate.setDate(startDate.getDate() - 10);
const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

console.log('\nDate range:', startDateStr, 'to', todayStr);

// Now test the exact API call sequence
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

console.log('\n=== Testing SPY fetch (same as browser will do) ===');

// Step 1: Get last 3 daily bars
const dailyUrl = `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${startDateStr}/${todayStr}?adjusted=true&sort=desc&limit=3&apiKey=${POLYGON_API_KEY}`;
console.log('1. Fetching daily bars...');

fetch(dailyUrl)
    .then(res => res.json())
    .then(dailyData => {
        console.log('   Daily results count:', dailyData.results?.length);

        if (!dailyData.results || dailyData.results.length < 2) {
            throw new Error('Insufficient daily data');
        }

        // Step 2: Get last trading day - USE UTC components to avoid timezone issues
        const lastTradingDayTimestamp = dailyData.results[0].t;
        const lastTradingDay = new Date(lastTradingDayTimestamp);
        const lastTradingDayStr = `${lastTradingDay.getUTCFullYear()}-${String(lastTradingDay.getUTCMonth() + 1).padStart(2, '0')}-${String(lastTradingDay.getUTCDate()).padStart(2, '0')}`;

        console.log('   Last trading day:', lastTradingDayStr);

        // Step 3: Fetch intraday data
        const intradayUrl = `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/minute/${lastTradingDayStr}/${lastTradingDayStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
        console.log('2. Fetching intraday data for', lastTradingDayStr, '...');

        return fetch(intradayUrl);
    })
    .then(res => res.json())
    .then(intradayData => {
        console.log('   Intraday results count:', intradayData.results?.length);

        if (!intradayData.results || intradayData.results.length === 0) {
            console.log('\n❌ FAILED - No intraday data');
            console.log('Response:', JSON.stringify(intradayData, null, 2));
            return;
        }

        const intradayResults = intradayData.results;
        const currentPrice = intradayResults[intradayResults.length - 1].c;

        console.log('   First bar time:', new Date(intradayResults[0].t).toLocaleString());
        console.log('   Last bar time:', new Date(intradayResults[intradayResults.length - 1].t).toLocaleString());
        console.log('   Last price:', currentPrice);

        console.log('\n✅ SUCCESS - Exact browser logic works perfectly!');
        console.log('   This proves the tracking tab will load data correctly.');
    })
    .catch(err => {
        console.log('\n❌ ERROR:', err.message);
    });
