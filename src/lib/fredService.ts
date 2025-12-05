// FRED (Federal Reserve Economic Data) API Service
// Provides real economic release calendar data via server-side API route

// Cache for economic releases
let economicReleasesCache: { data: EconomicRelease[]; expiry: number; cacheKey: string } | null = null;

export interface EconomicRelease {
  releaseId: number;
  releaseName: string;
  date: string;
  lastUpdated?: string;
}

// High-impact economic releases to highlight (by release_id)
// Note: Release 101 (H.15 Interest Rates) updates daily - excluded
// Release 21 is FOMC Meeting Minutes which only releases on actual meeting minutes days
const HIGH_IMPACT_RELEASES: { [id: number]: { shortName: string; importance: 'high' | 'medium' | 'low' } } = {
  // Employment
  50: { shortName: 'Jobs Report', importance: 'high' },
  180: { shortName: 'Jobless Claims', importance: 'medium' },
  192: { shortName: 'JOLTS', importance: 'medium' },
  194: { shortName: 'ADP Employment', importance: 'medium' },
  
  // Inflation
  10: { shortName: 'CPI', importance: 'high' },
  46: { shortName: 'PPI', importance: 'high' },
  
  // Fed/Monetary - Only FOMC Minutes, not daily interest rate updates
  21: { shortName: 'FOMC Minutes', importance: 'high' },
  
  // GDP/Economic Activity
  53: { shortName: 'GDP', importance: 'high' },
  13: { shortName: 'Industrial Production', importance: 'medium' },
  
  // Consumer
  9: { shortName: 'Retail Sales', importance: 'high' },
  54: { shortName: 'Personal Income', importance: 'medium' },
  59: { shortName: 'Consumer Sentiment', importance: 'medium' },
  
  // Housing
  97: { shortName: 'Housing Starts', importance: 'medium' },
  
  // Manufacturing
  94: { shortName: 'Durable Goods', importance: 'medium' },
  
  // Trade
  51: { shortName: 'Trade Balance', importance: 'medium' },
};

/**
 * Fetch economic release dates via server-side API route (avoids CORS)
 * @param startDate Start date in YYYY-MM-DD format
 * @param endDate End date in YYYY-MM-DD format
 */
export async function fetchEconomicReleases(startDate: string, endDate: string): Promise<EconomicRelease[]> {
  const cacheKey = `${startDate}-${endDate}`;
  
  // Check cache (valid for 1 hour)
  if (economicReleasesCache && economicReleasesCache.cacheKey === cacheKey && economicReleasesCache.expiry > Date.now()) {
    console.log('Using cached FRED economic releases');
    return economicReleasesCache.data;
  }
  
  try {
    // Use our server-side API route to avoid CORS issues
    const url = `/api/fred-releases?start=${startDate}&end=${endDate}`;
    
    console.log(`Fetching FRED economic releases from ${startDate} to ${endDate}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      console.warn(`FRED API proxy error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.releases || !Array.isArray(data.releases)) {
      return [];
    }
    
    // Transform releases - they're already filtered by the API route
    const releases: EconomicRelease[] = data.releases.map((r: { release_id: number; release_name: string; date: string }) => ({
      releaseId: r.release_id,
      releaseName: HIGH_IMPACT_RELEASES[r.release_id]?.shortName || r.release_name,
      date: r.date
    }));
    
    // Cache for 1 hour
    economicReleasesCache = {
      data: releases,
      expiry: Date.now() + 60 * 60 * 1000,
      cacheKey
    };
    
    console.log(`Fetched ${releases.length} high-impact economic releases from FRED`);
    return releases;
  } catch (error) {
    console.error('Error fetching FRED releases:', error);
    return [];
  }
}

/**
 * Get economic releases for a specific month
 * @param year Year
 * @param month Month (0-11)
 */
export async function getMonthlyEconomicReleases(year: number, month: number): Promise<Map<number, EconomicRelease[]>> {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  const releases = await fetchEconomicReleases(startDateStr, endDateStr);
  
  // Group by day of month
  const releasesByDay = new Map<number, EconomicRelease[]>();
  
  for (const release of releases) {
    const day = new Date(release.date).getDate();
    
    if (!releasesByDay.has(day)) {
      releasesByDay.set(day, []);
    }
    releasesByDay.get(day)!.push(release);
  }
  
  return releasesByDay;
}

/**
 * Get importance level for a release
 */
export function getReleaseImportance(releaseId: number): 'high' | 'medium' | 'low' {
  return HIGH_IMPACT_RELEASES[releaseId]?.importance || 'low';
}

/**
 * Get short name for a release
 */
export function getReleaseShortName(releaseId: number, fullName: string): string {
  return HIGH_IMPACT_RELEASES[releaseId]?.shortName || fullName;
}

export default {
  fetchEconomicReleases,
  getMonthlyEconomicReleases,
  getReleaseImportance,
  getReleaseShortName
};
