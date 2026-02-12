/**
 * Polygon.io API Rate Limiter
 * 
 * Prevents ERR_CONNECTION_RESET errors by:
 * - Queuing requests instead of firing them simultaneously
 * - Rate limiting (max 5 requests per second for free tier)
 * - Retry logic with exponential backoff
 * - Request deduplication to prevent duplicate calls
 */

interface QueuedRequest {
  url: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retryCount: number;
}

class PolygonRateLimiter {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private requestsThisSecond = 0;
  private lastResetTime = Date.now();
  private readonly MAX_REQUESTS_PER_SECOND = 5; // Polygon free tier limit
  private readonly RETRY_DELAY = 1000; // 1 second
  private readonly MAX_RETRIES = 3;
  private inFlightRequests = new Map<string, Promise<any>>();

  /**
   * Fetch data from Polygon API with rate limiting and retry logic
   */
  async fetch(url: string): Promise<any> {
    // Check if we already have this request in flight
    if (this.inFlightRequests.has(url)) {
      return this.inFlightRequests.get(url);
    }

    const promise = new Promise<any>((resolve, reject) => {
      this.queue.push({
        url,
        resolve,
        reject,
        retryCount: 0
      });
      this.processQueue();
    });

    this.inFlightRequests.set(url, promise);

    // Clean up after request completes
    promise.finally(() => {
      this.inFlightRequests.delete(url);
    });

    return promise;
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Reset counter every second
      const now = Date.now();
      if (now - this.lastResetTime >= 1000) {
        this.requestsThisSecond = 0;
        this.lastResetTime = now;
      }

      // Wait if we've hit the rate limit
      if (this.requestsThisSecond >= this.MAX_REQUESTS_PER_SECOND) {
        const waitTime = 1000 - (now - this.lastResetTime);
        await this.sleep(waitTime);
        this.requestsThisSecond = 0;
        this.lastResetTime = Date.now();
      }

      const request = this.queue.shift();
      if (!request) break;

      this.requestsThisSecond++;
      this.executeRequest(request);

      // Small delay between requests to be extra safe
      await this.sleep(100);
    }

    this.processing = false;
  }

  private async executeRequest(request: QueuedRequest) {
    try {
      const response = await fetch(request.url);

      if (!response.ok) {
        // Handle rate limit errors (429) or server errors (5xx)
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // For other errors, try to parse error message
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      request.resolve(data);
    } catch (error) {
      // Retry logic for network errors or rate limits
      if (request.retryCount < this.MAX_RETRIES) {
        const delay = this.RETRY_DELAY * Math.pow(2, request.retryCount);
        console.warn(`Retrying request (${request.retryCount + 1}/${this.MAX_RETRIES}) after ${delay}ms:`, request.url);

        await this.sleep(delay);
        request.retryCount++;
        this.queue.unshift(request); // Add back to front of queue

        // Don't block, let the queue processor handle it
        setTimeout(() => this.processQueue(), 0);
      } else {
        console.error(`Request failed after ${this.MAX_RETRIES} retries:`, request.url, error);
        request.reject(error);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current queue size (for debugging)
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Clear all pending requests
   */
  clearQueue(): void {
    this.queue.forEach(req => {
      req.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }
}

// Export singleton instance
export const polygonRateLimiter = new PolygonRateLimiter();
