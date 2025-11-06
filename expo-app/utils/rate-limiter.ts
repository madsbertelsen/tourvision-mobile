/**
 * Rate Limiter Utility
 *
 * Implements request queuing with throttling to respect API rate limits.
 * Designed for Nominatim (1 req/sec) but configurable for other services.
 */

interface QueuedRequest<T, R> {
  args: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class RateLimiter<T = any, R = any> {
  private queue: QueuedRequest<T, R>[] = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(
    private minIntervalMs: number = 1000, // 1 second between requests
    private maxQueueSize: number = 50
  ) {}

  /**
   * Enqueue a request to be processed with rate limiting
   */
  async enqueue(
    args: T,
    executor: (args: T) => Promise<R>
  ): Promise<R> {
    // Check queue size limit
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Rate limiter queue is full');
    }

    return new Promise<R>((resolve, reject) => {
      this.queue.push({
        args,
        resolve,
        reject,
        timestamp: Date.now()
      });

      // Start processing if not already running
      this.processQueue(executor);
    });
  }

  private async processQueue(executor: (args: T) => Promise<R>) {
    // Already processing
    if (this.processing) {
      return;
    }

    // No items to process
    if (this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Calculate delay needed to respect rate limit
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const delayNeeded = Math.max(0, this.minIntervalMs - timeSinceLastRequest);

      if (delayNeeded > 0) {
        await new Promise(resolve => setTimeout(resolve, delayNeeded));
      }

      // Process next request
      const request = this.queue.shift();
      if (!request) {
        this.processing = false;
        return;
      }

      // Execute the request
      try {
        const result = await executor(request.args);
        this.lastRequestTime = Date.now();
        request.resolve(result);
      } catch (error) {
        request.reject(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.processing = false;

      // Process next item if queue not empty
      if (this.queue.length > 0) {
        this.processQueue(executor);
      }
    }
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear all pending requests
   */
  clear() {
    const error = new Error('Rate limiter cleared');
    this.queue.forEach(request => request.reject(error));
    this.queue = [];
  }
}

/**
 * LRU Cache for storing request results
 */
export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>();

  constructor(
    private maxSize: number = 100,
    private ttlMs: number = 3600000 // 1 hour default
  ) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: K, value: V): void {
    // Remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
