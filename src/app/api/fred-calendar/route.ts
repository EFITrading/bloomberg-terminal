import { NextRequest, NextResponse } from 'next/server';

const FRED_API_KEY = '8c728c7ae1e59b0a43694fa3ff0a8580';

// FRED Release IDs for key economic indicators
// Only including releases that have specific monthly release dates
const FRED_RELEASES: Record<string, number> = {
  CPI: 10,           // Consumer Price Index - monthly
  PPI: 46,           // Producer Price Index - monthly  
  EMPLOYMENT: 50,    // Employment Situation (Jobs Report) - monthly
  RETAIL_SALES: 28,  // Advance Monthly Sales - monthly
  GDP: 53,           // Gross Domestic Product - quarterly
};

// These releases have daily data, not suitable for calendar events
// HOUSING_STARTS: 200 - has daily updates
// DURABLE_GOODS: 86 - has daily updates

async function fetchReleaseDates(releaseId: number): Promise<string[]> {
  try {
    const response = await fetch(
      `https://api.stlouisfed.org/fred/release/dates?release_id=${releaseId}&api_key=${FRED_API_KEY}&file_type=json&include_release_dates_with_no_data=true`,
      { 
        next: { revalidate: 86400 }, // Cache for 24 hours
      }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.release_dates) return [];
    
    return data.release_dates.map((r: { date: string }) => r.date);
  } catch (error) {
    console.error(`Error fetching FRED release ${releaseId}:`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
  const month = parseInt(searchParams.get('month') || new Date().getMonth().toString());
  
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  
  try {
    // Fetch all releases in parallel
    const [cpiAll, ppiAll, jobsAll, retailAll, gdpAll] = await Promise.all([
      fetchReleaseDates(FRED_RELEASES.CPI),
      fetchReleaseDates(FRED_RELEASES.PPI),
      fetchReleaseDates(FRED_RELEASES.EMPLOYMENT),
      fetchReleaseDates(FRED_RELEASES.RETAIL_SALES),
      fetchReleaseDates(FRED_RELEASES.GDP),
    ]);
    
    // Filter to requested month
    const filterMonth = (dates: string[]) => dates.filter(d => d.startsWith(monthStr));
    
    const events: Record<string, string[]> = {};
    
    const addEvents = (dates: string[], name: string) => {
      for (const date of dates) {
        if (!events[date]) events[date] = [];
        events[date].push(name);
      }
    };
    
    addEvents(filterMonth(cpiAll), 'CPI');
    addEvents(filterMonth(ppiAll), 'PPI');
    addEvents(filterMonth(jobsAll), 'Jobs Report');
    addEvents(filterMonth(retailAll), 'Retail Sales');
    addEvents(filterMonth(gdpAll), 'GDP');
    
    // Check if we have real data
    const hasData = Object.keys(events).length > 0;
    
    return NextResponse.json({
      success: true,
      hasRealData: hasData,
      events,
      month: monthStr
    });
    
  } catch (error) {
    console.error('Error fetching FRED calendar:', error);
    return NextResponse.json({
      success: false,
      hasRealData: false,
      events: {},
      error: 'Failed to fetch FRED data'
    });
  }
}
