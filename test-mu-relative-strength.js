// Test Relative Strength for MU

const symbol = 'MU';
const trend = 'bullish'; // Change to 'bearish' to test bearish scenario

async function testRelativeStrength() {
    try {
        // Fetch 50 days of data to have enough for 21-day lookback
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        console.log(`\n🔍 Testing Relative Strength for ${symbol}`);
        console.log(`Trend: ${trend.toUpperCase()}`);
        console.log(`Date Range: ${startDate} to ${endDate}\n`);

        const response = await fetch(`http://localhost:3000/api/bulk-chart-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbols: [symbol],
                timeframe: '1d',
                startDate,
                endDate
            })
        });

        const data = await response.json();
        const prices = data.data[symbol];

        if (!prices || prices.length < 22) {
            console.log('❌ Insufficient data');
            return;
        }

        const closes = prices.map(p => p.close);
        console.log(`📊 Total data points: ${closes.length}`);
        console.log(`Current price: $${closes[closes.length - 1].toFixed(2)}\n`);

        // Calculate relative performance over 3 timeframes
        const timeframes = [
            { days: 5, name: 'Week (5d)' },
            { days: 13, name: '13-Day' },
            { days: 21, name: 'Monthly (21d)' }
        ];

        let alignedTimeframes = 0;
        let results = [];

        for (const tf of timeframes) {
            if (closes.length >= tf.days + 1) {
                const startPrice = closes[closes.length - tf.days - 1];
                const endPrice = closes[closes.length - 1];
                const stockReturn = ((endPrice - startPrice) / startPrice) * 100;

                const isOutperforming = stockReturn > 0;
                const isUnderperforming = stockReturn < 0;

                let aligned = false;
                if (trend === 'bullish' && isOutperforming) {
                    alignedTimeframes++;
                    aligned = true;
                } else if (trend === 'bearish' && isUnderperforming) {
                    alignedTimeframes++;
                    aligned = true;
                }

                results.push({
                    timeframe: tf.name,
                    startPrice: startPrice.toFixed(2),
                    endPrice: endPrice.toFixed(2),
                    return: stockReturn.toFixed(2),
                    status: stockReturn > 0 ? 'Outperforming' : 'Underperforming',
                    aligned: aligned ? '✅' : '❌'
                });
            }
        }

        // Display results
        console.log('═══════════════════════════════════════════════════════');
        console.log('                 TIMEFRAME ANALYSIS');
        console.log('═══════════════════════════════════════════════════════\n');

        results.forEach(r => {
            console.log(`${r.timeframe}:`);
            console.log(`  Start: $${r.startPrice} → End: $${r.endPrice}`);
            console.log(`  Return: ${r.return}% (${r.status})`);
            console.log(`  Aligned with ${trend} trend: ${r.aligned}\n`);
        });

        // Calculate final score
        const relativeStrengthScore = alignedTimeframes === 3 ? 15 : 0;

        console.log('═══════════════════════════════════════════════════════');
        console.log('                   FINAL SCORE');
        console.log('═══════════════════════════════════════════════════════\n');
        console.log(`Aligned Timeframes: ${alignedTimeframes}/3`);
        console.log(`Relative Strength Score: ${relativeStrengthScore}/15\n`);

        if (relativeStrengthScore === 15) {
            console.log('✅ PASS - All 3 timeframes aligned with trend direction');
        } else {
            console.log('❌ FAIL - Not all timeframes aligned (need 3/3 for points)');
        }

        console.log('\n═══════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testRelativeStrength();
