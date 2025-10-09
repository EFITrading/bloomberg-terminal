/**
 * API Configuration utilities
 */

/**
 * Get the correct API base URL for the current environment
 * This ensures API calls always go to the correct port/host
 */
export function getApiBaseUrl(): string {
  // In browser environment, use current origin
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // In server environment, use localhost:3000 as fallback
  return 'http://localhost:3000';
}

/**
 * Create a full API URL with proper base
 */
export function createApiUrl(endpoint: string, params?: Record<string, string>): string {
  const baseUrl = getApiBaseUrl();
  const url = new URL(endpoint, baseUrl);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  
  return url.toString();
}

/**
 * Fetch wrapper that ensures correct API URL
 */
export async function fetchApi(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = createApiUrl(endpoint);
  console.log(`🔗 API Call: ${url}`);
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}