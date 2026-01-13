/**
 * Utility functions for calculating o console.log(' console.log('� RESULT: Next Friday calculated as:', nextFriday.toISOString().split('T')[0]); GET NEXT FRIDAY: CRITICAL - if today is Oct 1 2025 (Wed=3), next Friday should be Oct 3');tions expiration dates
 * All calculations use Eastern Time (NYSE timezone) for accurate market dates
 */

/**
 * Get current date in Eastern Time (as a date-only object)
 */
function getEasternDate(): Date {
    // Get current time in Eastern timezone
    const easternFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const parts = easternFormatter.formatToParts(new Date());
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');

    // Create date object in UTC to avoid timezone conversion issues
    const easternDate = new Date(Date.UTC(year, month - 1, day));

    console.log('🕐 FIXED TIMEZONE: Current UTC Time:', new Date().toISOString());
    console.log('🕐 FIXED TIMEZONE: Eastern Date Parts:', { year, month, day });
    console.log('🕐 FIXED TIMEZONE: Parsed Date:', easternDate.toISOString());
    console.log('🕐 FIXED TIMEZONE: Day of week:', easternDate.getUTCDay(), '(0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)');

    return easternDate;
}

/**
 * Get the next Friday from a given date (in Eastern Time)
 * Mon-Thu: Returns this week's Friday
 * Fri: Returns next week's Friday (assumes market close, looking ahead)
 * Sat-Sun: Returns next week's Friday
 */
export function getNextFriday(fromDate?: Date): Date {
    const easternDate = fromDate ? new Date(fromDate) : getEasternDate();

    const dayOfWeek = easternDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    console.log('📅 GET NEXT FRIDAY: Input date:', easternDate.toISOString());
    console.log('📅 GET NEXT FRIDAY: Day of week:', dayOfWeek, '(0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)');

    let daysUntilFriday;
    if (dayOfWeek === 0) {
        // Sunday - get Friday of this upcoming week
        daysUntilFriday = 5;
        console.log('✅ LOGIC: Sunday, getting this week\'s Friday (+5 days)');
    } else if (dayOfWeek >= 1 && dayOfWeek <= 4) {
        // Monday through Thursday - get Friday of this week
        daysUntilFriday = 5 - dayOfWeek;
        console.log(`✅ LOGIC: Mon-Thu (day ${dayOfWeek}), getting this week's Friday (+${daysUntilFriday} days)`);
    } else if (dayOfWeek === 5) {
        // Friday - get next week's Friday
        daysUntilFriday = 7;
        console.log('✅ LOGIC: Friday, getting next week\'s Friday (+7 days)');
    } else {
        // Saturday - get next week's Friday
        daysUntilFriday = 6;
        console.log('✅ LOGIC: Saturday, getting next week\'s Friday (+6 days)');
    }

    console.log('📊 CALCULATION: Days until Friday:', daysUntilFriday);
    console.log('📊 CALCULATION: Starting from date:', easternDate.toISOString().split('T')[0]);

    const nextFriday = new Date(easternDate);
    nextFriday.setUTCDate(easternDate.getUTCDate() + daysUntilFriday);

    console.log('🎯 RESULT: Next Friday calculated as:', nextFriday.toISOString().split('T')[0]);

    return nextFriday;
}

/**
 * Get the third Friday of a given month (standard monthly expiration)
 */
export function getThirdFridayOfMonth(year: number, month: number): Date {
    // Create date in UTC to avoid timezone issues
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const firstDayOfWeek = firstDay.getUTCDay();

    // Calculate days until first Friday
    let daysUntilFirstFriday;
    if (firstDayOfWeek === 0) {
        daysUntilFirstFriday = 5; // Sunday
    } else if (firstDayOfWeek <= 5) {
        daysUntilFirstFriday = 5 - firstDayOfWeek;
    } else {
        daysUntilFirstFriday = 6; // Saturday
    }

    const firstFriday = new Date(Date.UTC(year, month - 1, 1 + daysUntilFirstFriday));

    // Add 14 days to get the third Friday
    const thirdFriday = new Date(firstFriday);
    thirdFriday.setUTCDate(firstFriday.getUTCDate() + 14);

    console.log(`📅 Third Friday of ${year}-${month.toString().padStart(2, '0')}: ${thirdFriday.toISOString().split('T')[0]} (day of week: ${thirdFriday.getUTCDay()})`);

    return thirdFriday;
}

/**
 * Get the next monthly expiration date (third Friday of current or next month)
 */
export function getNextMonthlyExpiration(fromDate?: Date): Date {
    const currentDate = fromDate ? new Date(fromDate) : getEasternDate();
    const currentYear = currentDate.getUTCFullYear();
    const currentMonth = currentDate.getUTCMonth() + 1; // JavaScript months are 0-based

    // Get third Friday of current month
    const thisMonthExpiry = getThirdFridayOfMonth(currentYear, currentMonth);

    // If we haven't passed this month's expiry, return it
    if (currentDate <= thisMonthExpiry) {
        return thisMonthExpiry;
    }

    // Otherwise, get next month's expiry
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    return getThirdFridayOfMonth(nextYear, nextMonth);
}

/**
 * Format date as YYYY-MM-DD for API calls
 */
export function formatDateForAPI(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Fetch actual available expiration dates from Polygon API
 */
export async function fetchAvailableExpirationDates(symbol: string = 'SPY'): Promise<string[]> {
    try {
        const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
        let allExpirations = new Set<string>();
        let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&limit=1000&apikey=${apiKey}`;

        // Paginate through all results
        while (nextUrl) {
            const response: Response = await fetch(nextUrl);
            const data: any = await response.json();

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                data.results.forEach((contract: any) => {
                    if (contract.expiration_date) {
                        allExpirations.add(contract.expiration_date);
                    }
                });

                // Check for next page and append API key
                nextUrl = data.next_url ? `${data.next_url}&apikey=${apiKey}` : null;

                // Rate limiting between requests
                if (nextUrl) {
                    await new Promise(r => setTimeout(r, 100));
                }
            } else {
                break;
            }
        }

        const expirationDates = Array.from(allExpirations).sort();
        console.log(`📦 Fetched ${expirationDates.length} unique expiration dates from Polygon`);
        console.log('📅 Available expiration dates from Polygon (first 20):');
        expirationDates.slice(0, 20).forEach((date, idx) => {
            const d = new Date(date + 'T00:00:00Z');
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            console.log(`   ${idx + 1}. ${date} (${dayNames[d.getUTCDay()]})`);
        });

        return expirationDates as string[];
    } catch (error) {
        console.error('Error fetching expiration dates from Polygon:', error);
        return [];
    }
}

/**
 * Get weekly and monthly expiration dates from actual Polygon data
 */
export async function getExpirationDatesFromAPI(symbol: string = 'SPY'): Promise<{
    weeklyExpiry: string;
    monthlyExpiry: string;
    weeklyDate: Date;
    monthlyDate: Date;
}> {
    const availableDates = await fetchAvailableExpirationDates(symbol);
    const now = getEasternDate();

    // Filter dates that are in the future
    const futureDates = availableDates.filter(date => {
        const expDate = new Date(date + 'T00:00:00Z'); // Parse as UTC
        return expDate > now;
    });

    if (futureDates.length === 0) {
        // Fallback to calculated dates if API fails
        return getCalculatedExpirationDates();
    }

    // Get current week number of the month
    const today = getEasternDate();
    const currentWeekOfMonth = Math.ceil(today.getUTCDate() / 7);

    // Weekly expiry: Next Friday this week or next week
    let weeklyExpiry = futureDates.find(date => {
        const expDate = new Date(date + 'T00:00:00Z'); // Parse as UTC
        return expDate.getUTCDay() === 5 && expDate > today; // Next Friday
    }) || futureDates[0];

    // Monthly expiry: Find the third Friday of current or next month
    // CRITICAL FIX: If we're in week 2 or later, skip current month's 3rd Friday to avoid overlap with weekly
    // Third Friday falls between the 15th and 21st of the month
    console.log('🔍 Searching for monthly expiry (3rd Friday, days 15-21)...');
    console.log(`📅 Current week of month: ${currentWeekOfMonth}`);

    let monthlyExpiry;

    if (currentWeekOfMonth >= 2) {
        // Week 2 or later: Skip current month, get NEXT month's 3rd Friday
        console.log('✅ Week 2+: Skipping current month, finding NEXT month\'s 3rd Friday to avoid overlap');
        const currentMonth = today.getUTCMonth();
        const currentYear = today.getUTCFullYear();

        monthlyExpiry = futureDates.find(date => {
            const expDate = new Date(date + 'T00:00:00Z');
            const dayOfMonth = expDate.getUTCDate();
            const dayOfWeek = expDate.getUTCDay();
            const expMonth = expDate.getUTCMonth();
            const expYear = expDate.getUTCFullYear();
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            console.log(`   Checking ${date}: day ${dayOfMonth}, ${dayNames[dayOfWeek]} (${dayOfWeek}), month ${expMonth + 1}`);

            // Must be: (1) a different month, (2) a Friday, (3) between 15th-21st
            const isDifferentMonth = expYear > currentYear || expMonth > currentMonth;
            const isThirdFriday = dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21;
            const isMatch = isDifferentMonth && isThirdFriday;

            if (isMatch) console.log(`   ✅ FOUND NEXT MONTH'S 3RD FRIDAY: ${date}`);
            return isMatch;
        });
    } else {
        // Week 1: Get current month's 3rd Friday
        console.log('✅ Week 1: Finding current month\'s 3rd Friday');
        monthlyExpiry = futureDates.find(date => {
            const expDate = new Date(date + 'T00:00:00Z');
            const dayOfMonth = expDate.getUTCDate();
            const dayOfWeek = expDate.getUTCDay();
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            console.log(`   Checking ${date}: day ${dayOfMonth}, ${dayNames[dayOfWeek]} (${dayOfWeek})`);
            // Must be a Friday (5) and between 15th-21st (third week)
            const isMatch = dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21;
            if (isMatch) console.log(`   ✅ FOUND MONTHLY: ${date}`);
            return isMatch;
        });
    }

    // If no monthly expiry found, fall back to any Friday after the 15th
    if (!monthlyExpiry) {
        console.log('⚠️ No 3rd Friday found, looking for any Friday after 15th...');
        monthlyExpiry = futureDates.find(date => {
            const expDate = new Date(date + 'T00:00:00Z');
            return expDate.getUTCDay() === 5 && expDate.getUTCDate() >= 15;
        });
    }

    console.log('📊 POLYGON API RESULTS:');
    console.log('   Weekly expiry (this/next Friday):', weeklyExpiry);
    console.log('   Monthly expiry (based on week):', monthlyExpiry);
    console.log('   Current week of month:', currentWeekOfMonth);

    return {
        weeklyExpiry: weeklyExpiry || futureDates[0],
        monthlyExpiry: monthlyExpiry || futureDates[1] || futureDates[0],
        weeklyDate: new Date(weeklyExpiry ? weeklyExpiry + 'T00:00:00Z' : futureDates[0] + 'T00:00:00Z'),
        monthlyDate: new Date(monthlyExpiry ? monthlyExpiry + 'T00:00:00Z' : (futureDates[1] || futureDates[0]) + 'T00:00:00Z')
    };
}

/**
 * Fallback calculated expiration dates (old method)
 */
export function getCalculatedExpirationDates(): {
    weeklyExpiry: string;
    monthlyExpiry: string;
    weeklyDate: Date;
    monthlyDate: Date;
} {
    const easternNow = getEasternDate();
    const weeklyDate = getNextFriday(easternNow);
    const monthlyDate = getNextMonthlyExpiration(easternNow);

    return {
        weeklyExpiry: formatDateForAPI(weeklyDate),
        monthlyExpiry: formatDateForAPI(monthlyDate),
        weeklyDate,
        monthlyDate
    };
}

/**
 * Get both weekly and monthly expiration dates (main function)
 */
export function getExpirationDates(): {
    weeklyExpiry: string;
    monthlyExpiry: string;
    weeklyDate: Date;
    monthlyDate: Date;
} {
    // For now, return calculated dates synchronously
    // TODO: Convert callers to use async getExpirationDatesFromAPI
    return getCalculatedExpirationDates();
}

/**
 * Get days until expiration (using Eastern Time)
 */
export function getDaysUntilExpiration(expirationDate: Date): number {
    const easternNow = getEasternDate();
    const timeDiff = expirationDate.getTime() - easternNow.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
}