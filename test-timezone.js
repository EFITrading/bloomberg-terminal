const now = new Date();
const year = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric' }));
const month = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric' }));
const day = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric' }));
const dayOfWeek = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' });

const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
console.log('ET Date:', todayStr);
console.log('Day of Week:', dayOfWeek);
console.log('Components:', { year, month, day });

// Now test with the actual API
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const etDate = new Date(year, month - 1, day);
const startDate = new Date(etDate);
startDate.setDate(startDate.getDate() - 10);
const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

console.log('\nDate range:', startDateStr, 'to', todayStr);

// Fetch daily data
const dailyUrl = `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${startDateStr}/${todayStr}?adjusted=true&sort=desc&limit=3&apiKey=${POLYGON_API_KEY}`;
console.log('\nFetching daily data for SPY...');

fetch(dailyUrl)
    .then(res => res.json())
    .then(dailyData => {
        console.log('Daily results count:', dailyData.results?.length);
        if (dailyData.results && dailyData.results.length >= 2) {
            const lastTradingDayTimestamp = dailyData.results[0].t;
            const lastTradingDay = new Date(lastTradingDayTimestamp);
            const lastTradingDayStr = `${lastTradingDay.getFullYear()}-${String(lastTradingDay.getMonth() + 1).padStart(2, '0')}-${String(lastTradingDay.getDate()).padStart(2, '0')}`;

            console.log('Last trading day:', lastTradingDayStr);

            // Fetch intraday
            const intradayUrl = `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/minute/${lastTradingDayStr}/${lastTradingDayStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
            console.log('\nFetching intraday data...');

            return fetch(intradayUrl);
        } else {
            throw new Error('Insufficient daily data');
        }
    })
    .then(res => res.json())
    .then(intradayData => {
        console.log('Intraday results count:', intradayData.results?.length);
        if (intradayData.results && intradayData.results.length > 0) {
            console.log('✅ SUCCESS - Data fetched properly!');
            console.log('First bar time:', new Date(intradayData.results[0].t));
            console.log('Last bar time:', new Date(intradayData.results[intradayData.results.length - 1].t));
        } else {
            console.log('❌ FAILED - No intraday data');
        }
    })
    .catch(err => console.error('Error:', err));
