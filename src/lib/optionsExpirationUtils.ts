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
 
 // Create date object representing Eastern date at midnight
 const easternDate = new Date(year, month - 1, day);
 
 console.log(' FIXED TIMEZONE: Current UTC Time:', new Date().toISOString());
 console.log(' FIXED TIMEZONE: Eastern Date Parts:', {year, month, day});
 console.log(' FIXED TIMEZONE: Parsed Date:', easternDate.toISOString());
 console.log(' FIXED TIMEZONE: Day of week:', easternDate.getDay(), '(0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)');
 console.log(' FIXED TIMEZONE: If today is Oct 1 2025 (Wed), day should be 3');
 
 return easternDate;
}

/**
 * Get the next Friday from a given date (in Eastern Time)
 */
export function getNextFriday(fromDate?: Date): Date {
 const easternDate = fromDate ? new Date(fromDate) : getEasternDate();
 
 const dayOfWeek = easternDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
 console.log(' GET NEXT FRIDAY: Input date:', easternDate.toISOString());
 console.log(' GET NEXT FRIDAY: Day of week:', dayOfWeek, '(0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)');
 console.log('� GET NEXT FRIDAY: Expected - if today is Oct 2 (Wed), next Friday should be Oct 3');
 
 let daysUntilFriday;
 if (dayOfWeek === 5) {
 // Today is Friday, get next Friday (7 days from now)
 daysUntilFriday = 7;
 console.log(' LOGIC: Today is Friday, getting next Friday (+7 days)');
 } else if (dayOfWeek < 5) {
 // Before Friday this week
 daysUntilFriday = 5 - dayOfWeek;
 console.log(' LOGIC: Before Friday, days until Friday:', daysUntilFriday);
 console.log(' LOGIC: If Wed(3): 5-3=2 days → Oct 1 + 2 = Oct 3 ');
 } else {
 // Saturday (6), get Friday of next week
 daysUntilFriday = 7 - dayOfWeek + 5; // 6 days for Saturday
 console.log(' LOGIC: Weekend, getting next Friday (+6 days for Sat)');
 }
 
 console.log(' CALCULATION: Days until Friday:', daysUntilFriday);
 console.log(' CALCULATION: Starting from date:', easternDate.toISOString().split('T')[0]);
 
 const nextFriday = new Date(easternDate);
 nextFriday.setDate(easternDate.getDate() + daysUntilFriday);
 
 console.log('� RESULT: Next Friday calculated as:', nextFriday.toISOString().split('T')[0]);
 console.log(' FINAL CHECK: Should be 2025-10-03 if today is Oct 1, 2025 (Wed), NOT 2025-10-04!');
 
 return nextFriday;
}

/**
 * Get the third Friday of a given month (standard monthly expiration)
 */
export function getThirdFridayOfMonth(year: number, month: number): Date {
 // Create date in Eastern Time
 const firstDay = new Date(year, month - 1, 1);
 const firstFriday = getNextFriday(firstDay);
 
 // Add 14 days to get the third Friday
 const thirdFriday = new Date(firstFriday);
 thirdFriday.setDate(firstFriday.getDate() + 14);
 
 return thirdFriday;
}

/**
 * Get the next monthly expiration date (third Friday of current or next month)
 */
export function getNextMonthlyExpiration(fromDate?: Date): Date {
 const currentDate = fromDate ? new Date(fromDate) : getEasternDate();
 const currentYear = currentDate.getFullYear();
 const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-based
 
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
 const response = await fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&limit=1000&apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`);
 const data = await response.json();
 
 if (data.results) {
 // Extract unique expiration dates and sort them
 const expirationDates = [...new Set(data.results.map((contract: any) => contract.expiration_date as string))].sort();
 console.log(' Available expiration dates from Polygon:', expirationDates.slice(0, 10)); // Show first 10
 return expirationDates as string[];
 }
 
 return [];
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
 const now = new Date();
 
 // Filter dates that are in the future
 const futureDates = availableDates.filter(date => new Date(date) > now);
 
 if (futureDates.length === 0) {
 // Fallback to calculated dates if API fails
 return getCalculatedExpirationDates();
 }
 
 // Get current week number of the month
 const today = getEasternDate();
 const currentWeekOfMonth = Math.ceil(today.getDate() / 7);
 
 // Weekly expiry: Next Friday this week or next week
 let weeklyExpiry = futureDates.find(date => {
 const expDate = new Date(date);
 return expDate.getDay() === 5 && expDate > today; // Next Friday
 }) || futureDates[0];
 
 // Monthly expiry logic based on current week
 let monthlyExpiry;
 if (currentWeekOfMonth >= 3) {
 // Third week or later - use next month's monthly expiry
 const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
 monthlyExpiry = futureDates.find(date => {
 const expDate = new Date(date);
 return expDate >= nextMonthStart && expDate.getDay() === 5;
 }) || futureDates.find(date => new Date(date) > new Date(today.getFullYear(), today.getMonth(), 15));
 } else {
 // First or second week - use current month's third Friday
 monthlyExpiry = futureDates.find(date => {
 const expDate = new Date(date);
 return expDate.getMonth() === today.getMonth() && 
 expDate.getDate() >= 15 && expDate.getDate() <= 21 &&
 expDate.getDay() === 5;
 }) || futureDates.find(date => new Date(date) > new Date(today.getFullYear(), today.getMonth(), 15));
 }
 
 console.log(' POLYGON API RESULTS:');
 console.log(' Weekly expiry (this/next Friday):', weeklyExpiry);
 console.log(' Monthly expiry (based on week):', monthlyExpiry);
 console.log(' Current week of month:', currentWeekOfMonth);
 
 return {
 weeklyExpiry: weeklyExpiry || futureDates[0],
 monthlyExpiry: monthlyExpiry || futureDates[1] || futureDates[0],
 weeklyDate: new Date(weeklyExpiry || futureDates[0]),
 monthlyDate: new Date(monthlyExpiry || futureDates[1] || futureDates[0])
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