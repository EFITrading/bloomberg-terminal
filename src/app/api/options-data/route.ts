import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface OptionsContractData {
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  option_symbol: string;
  
  // Pricing data
  last_price: number;
  bid: number;
  ask: number;
  
  // Volume and Open Interest (now working with proper endpoint)
  volume: number;
  open_interest: number;
  
  // Greeks
  implied_volatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  
  // Market data
  last_updated: number;
  change: number;
  change_percent: number;
  high: number;
  low: number;
  
  // Additional analysis
  break_even_price?: number;
  volume_oi_ratio?: number;
  liquidity_score?: 'High' | 'Medium' | 'Low';
}

// Function to get comprehensive options data using the WORKING v3/snapshot/options endpoint
async function getOptionsDetails(ticker: string, expiration: string, strike?: number, type?: 'call' | 'put'): Promise<OptionsContractData[]> {
  try {
    console.log(`🔍 Fetching options for ${ticker} expiring ${expiration}${strike ? ` strike $${strike}` : ''}${type ? ` ${type}s` : ''}`);
    
    // Use the WORKING endpoint from analysis suite - v3/snapshot/options with ticker and expiration
    const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expiration}&limit=250&apikey=${POLYGON_API_KEY}`;
    
    const snapshotResponse = await fetch(snapshotUrl);
    
    if (!snapshotResponse.ok) {
      console.error(`❌ Snapshot HTTP ${snapshotResponse.status}: ${snapshotResponse.statusText}`);
      return [];
    }
    
    const snapshotData = await snapshotResponse.json();
    
    if (snapshotData.status !== 'OK' || !snapshotData.results || snapshotData.results.length === 0) {
      console.error(`❌ No snapshot data for ${ticker} ${expiration}`);
      return [];
    }
    
    console.log(`📊 Found ${snapshotData.results.length} contracts for ${ticker} ${expiration}`);
    
    const results: OptionsContractData[] = [];
    
    snapshotData.results.forEach((contract: any) => {
      const details = contract.details || {};
      const greeks = contract.greeks || {};
      const lastQuote = contract.last_quote || {};
      const lastTrade = contract.last_trade || {};
      const day = contract.day || {};
      const underlying = contract.underlying_asset || {};
      
      // Filter by strike and type if specified
      if (strike && details.strike_price !== strike) return;
      if (type && details.contract_type?.toLowerCase() !== type) return;
      
      const contractData: OptionsContractData = {
        ticker: details.ticker || '',
        underlying_ticker: underlying.ticker || ticker,
        strike: details.strike_price || 0,
        expiry: details.expiration_date || expiration,
        type: details.contract_type?.toLowerCase() === 'call' ? 'call' : 'put',
        option_symbol: details.ticker || '',
        
        // Pricing data from last quote and trade
        last_price: lastTrade?.price || day?.close || 0,
        bid: lastQuote?.bid || 0,
        ask: lastQuote?.ask || 0,
        
        // Volume and Open Interest (THIS IS THE KEY - direct from snapshot!)
        volume: day?.volume || 0,
        open_interest: contract.open_interest || 0, // This field works in v3/snapshot/options/{ticker}
        
        // Greeks from snapshot
        implied_volatility: contract.implied_volatility || 0,
        delta: greeks.delta || 0,
        gamma: greeks.gamma || 0,
        theta: greeks.theta || 0,
        vega: greeks.vega || 0,
        
        // Market data
        last_updated: lastTrade?.sip_timestamp || day?.last_updated || Date.now(),
        change: day?.change || 0,
        change_percent: day?.change_percent || 0,
        high: day?.high || 0,
        low: day?.low || 0,
        
        // Additional calculated fields
        break_even_price: contract.break_even_price || 0,
        volume_oi_ratio: (day?.volume && contract.open_interest) ? 
          Number((day.volume / contract.open_interest).toFixed(2)) : 0,
        liquidity_score: (day?.volume || 0) > 100 ? 'High' : 
                        (day?.volume || 0) > 50 ? 'Medium' : 'Low'
      };
      
      results.push(contractData);
    });
    
    console.log(`✅ Processed ${results.length} contracts with open interest data`);
    return results;
    
  } catch (error) {
    console.error(`❌ Error fetching options details:`, error);
    return [];
  }
}

// Function to search for specific options contracts with filters
async function searchOptionsContracts(
  ticker: string, 
  filters?: {
    expiration?: string;
    strike?: number;
    type?: 'call' | 'put';
    minVolume?: number;
    minOpenInterest?: number;
    minPremium?: number;
    maxPremium?: number;
  }
): Promise<OptionsContractData[]> {
  
  try {
    let allResults: OptionsContractData[] = [];
    
    if (filters?.expiration) {
      // Get data for specific expiration
      const results = await getOptionsDetails(ticker, filters.expiration, filters.strike, filters.type);
      allResults = results;
    } else {
      // Get all available expirations first
      const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${POLYGON_API_KEY}`;
      const contractsResponse = await fetch(contractsUrl);
      
      if (contractsResponse.ok) {
        const contractsData = await contractsResponse.json();
        const expirations = [...new Set(contractsData.results?.map((c: any) => c.expiration_date) || [])].sort();
        
        console.log(`📅 Found ${expirations.length} expirations for ${ticker}`);
        
        // Get data for each expiration (limit to recent ones to avoid timeout)
        const recentExpirations = expirations.slice(0, 5);
        
        for (const exp of recentExpirations) {
          if (typeof exp === 'string') {
            const results = await getOptionsDetails(ticker, exp, filters?.strike, filters?.type);
            allResults.push(...results);
            
            // Rate limiting
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }
    }
    
    // Apply filters
    let filteredResults = allResults;
    
    if (filters?.minVolume) {
      filteredResults = filteredResults.filter(c => c.volume >= filters.minVolume!);
    }
    
    if (filters?.minOpenInterest) {
      filteredResults = filteredResults.filter(c => c.open_interest >= filters.minOpenInterest!);
    }
    
    if (filters?.minPremium) {
      filteredResults = filteredResults.filter(c => c.last_price >= filters.minPremium!);
    }
    
    if (filters?.maxPremium) {
      filteredResults = filteredResults.filter(c => c.last_price <= filters.maxPremium!);
    }
    
    // Sort by volume descending
    filteredResults.sort((a, b) => b.volume - a.volume);
    
    console.log(`🎯 Returning ${filteredResults.length} filtered contracts`);
    return filteredResults;
    
  } catch (error) {
    console.error(`❌ Error searching contracts:`, error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') || 'SPY';
  const expiry = searchParams.get('expiry') || searchParams.get('expiration');
  const strike = searchParams.get('strike') ? parseFloat(searchParams.get('strike')!) : undefined;
  const type = searchParams.get('type') as 'call' | 'put' | undefined;
  const minVolume = searchParams.get('minVolume') ? parseInt(searchParams.get('minVolume')!) : undefined;
  const minOI = searchParams.get('minOpenInterest') ? parseInt(searchParams.get('minOpenInterest')!) : undefined;
  const minPremium = searchParams.get('minPremium') ? parseFloat(searchParams.get('minPremium')!) : undefined;
  const maxPremium = searchParams.get('maxPremium') ? parseFloat(searchParams.get('maxPremium')!) : undefined;
  
  try {
    console.log(`🚀 Options Data API: ${ticker}${expiry ? ` ${expiry}` : ''}${strike ? ` $${strike}` : ''}${type ? ` ${type}` : ''}`);
    
    const filters = {
      expiration: expiry || undefined,
      strike,
      type,
      minVolume,
      minOpenInterest: minOI,
      minPremium,
      maxPremium
    };
    
    const contracts = await searchOptionsContracts(ticker, filters);
    
    // Calculate summary stats
    const summary = {
      total_contracts: contracts.length,
      total_volume: contracts.reduce((sum, c) => sum + c.volume, 0),
      total_open_interest: contracts.reduce((sum, c) => sum + c.open_interest, 0),
      avg_iv: contracts.length > 0 ? 
        contracts.reduce((sum, c) => sum + c.implied_volatility, 0) / contracts.length : 0,
      high_volume_contracts: contracts.filter(c => c.volume > 100).length,
      calls: contracts.filter(c => c.type === 'call').length,
      puts: contracts.filter(c => c.type === 'put').length
    };
    
    return NextResponse.json({
      success: true,
      data: contracts,
      summary,
      filters_applied: filters,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('❌ Options Data API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch options data',
      data: [],
      summary: null
    }, { status: 500 });
  }
}
