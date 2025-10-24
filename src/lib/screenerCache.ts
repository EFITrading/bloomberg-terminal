// Shared cache for background screener data
export const screenerCache = new Map<string, { 
  data: any; 
  timestamp: number; 
  expiresAt: number 
}>();

// Cache TTL: 10 minutes
export const CACHE_TTL = 10 * 60 * 1000;