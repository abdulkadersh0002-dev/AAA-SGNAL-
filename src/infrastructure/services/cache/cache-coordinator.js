/**
 * Centralized Cache Coordinator
 * Manages all caching with unified TTL, cleanup, and memory management
 */

class CacheCoordinator {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.caches = new Map();
    this.config = {
      // Global cleanup interval
      cleanupIntervalMs: options.cleanupInterval || 60000, // 1 minute
      // Memory pressure thresholds
      maxTotalEntries: options.maxTotalEntries || 50000,
      memoryPressureThreshold: options.memoryPressureThreshold || 40000,
    };
    
    // Start cleanup timer
    this.startCleanupTimer();
  }
  
  /**
   * Register a new cache
   */
  registerCache(name, options = {}) {
    if (this.caches.has(name)) {
      this.logger?.warn?.({ cache: name }, 'Cache already registered, replacing');
    }
    
    const cache = {
      name,
      store: new Map(),
      config: {
        ttlMs: options.ttl || 60000,
        maxEntries: options.maxEntries || 10000,
        onEvict: options.onEvict || null,
      },
      metrics: {
        hits: 0,
        misses: 0,
        evictions: 0,
        sets: 0,
      },
    };
    
    this.caches.set(name, cache);
    return cache;
  }
  
  /**
   * Get or create a cache
   */
  getCache(name, options = {}) {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = this.registerCache(name, options);
    }
    return cache;
  }
  
  /**
   * Set a value in a cache
   */
  set(cacheName, key, value, customTtl = null) {
    const cache = this.getCache(cacheName);
    
    const now = Date.now();
    const ttl = customTtl !== null ? customTtl : cache.config.ttlMs;
    const expiresAt = ttl > 0 ? now + ttl : null;
    
    cache.store.set(key, {
      value,
      createdAt: now,
      expiresAt,
      accessCount: 0,
      lastAccess: now,
    });
    
    cache.metrics.sets += 1;
    
    // Check if we need to evict entries
    if (cache.store.size > cache.config.maxEntries) {
      this.evictOldest(cacheName, Math.ceil(cache.config.maxEntries * 0.1));
    }
    
    return true;
  }
  
  /**
   * Get a value from a cache
   */
  get(cacheName, key) {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return null;
    }
    
    const entry = cache.store.get(key);
    if (!entry) {
      cache.metrics.misses += 1;
      return null;
    }
    
    // Check if expired
    const now = Date.now();
    if (entry.expiresAt && now > entry.expiresAt) {
      cache.store.delete(key);
      cache.metrics.misses += 1;
      cache.metrics.evictions += 1;
      return null;
    }
    
    // Update access tracking
    entry.accessCount += 1;
    entry.lastAccess = now;
    
    cache.metrics.hits += 1;
    return entry.value;
  }
  
  /**
   * Check if a key exists and is not expired
   */
  has(cacheName, key) {
    return this.get(cacheName, key) !== null;
  }
  
  /**
   * Delete a specific key
   */
  delete(cacheName, key) {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return false;
    }
    
    const deleted = cache.store.delete(key);
    if (deleted) {
      cache.metrics.evictions += 1;
    }
    return deleted;
  }
  
  /**
   * Clear all entries in a cache
   */
  clear(cacheName) {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return false;
    }
    
    const count = cache.store.size;
    cache.store.clear();
    cache.metrics.evictions += count;
    
    this.logger?.info?.({ cache: cacheName, evicted: count }, 'Cache cleared');
    return true;
  }
  
  /**
   * Evict oldest entries from a cache (LRU-style)
   */
  evictOldest(cacheName, count = 10) {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return 0;
    }
    
    // Sort by last access time (oldest first)
    const entries = Array.from(cache.store.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    
    let evicted = 0;
    for (let i = 0; i < Math.min(count, entries.length); i++) {
      const [key, entry] = entries[i];
      
      // Call eviction callback if provided
      if (cache.config.onEvict) {
        try {
          cache.config.onEvict(key, entry.value);
        } catch (error) {
          this.logger?.warn?.({ err: error, cache: cacheName, key }, 'Eviction callback error');
        }
      }
      
      cache.store.delete(key);
      evicted += 1;
    }
    
    cache.metrics.evictions += evicted;
    return evicted;
  }
  
  /**
   * Clean up expired entries across all caches
   */
  cleanupExpired() {
    const now = Date.now();
    let totalExpired = 0;
    
    for (const [name, cache] of this.caches.entries()) {
      let expired = 0;
      
      for (const [key, entry] of cache.store.entries()) {
        if (entry.expiresAt && now > entry.expiresAt) {
          cache.store.delete(key);
          expired += 1;
          
          // Call eviction callback if provided
          if (cache.config.onEvict) {
            try {
              cache.config.onEvict(key, entry.value);
            } catch (error) {
              this.logger?.warn?.({ err: error, cache: name, key }, 'Cleanup callback error');
            }
          }
        }
      }
      
      if (expired > 0) {
        cache.metrics.evictions += expired;
        totalExpired += expired;
        this.logger?.debug?.({ cache: name, expired }, 'Expired entries cleaned');
      }
    }
    
    return totalExpired;
  }
  
  /**
   * Handle memory pressure by evicting entries
   */
  handleMemoryPressure() {
    const totalEntries = this.getTotalEntries();
    
    if (totalEntries < this.config.memoryPressureThreshold) {
      return 0;
    }
    
    this.logger?.warn?.(
      { totalEntries, threshold: this.config.memoryPressureThreshold },
      'Memory pressure detected, evicting entries'
    );
    
    // Calculate how many entries to evict (bring down to 80% of threshold)
    const targetEntries = Math.floor(this.config.memoryPressureThreshold * 0.8);
    const toEvict = totalEntries - targetEntries;
    
    // Evict proportionally from each cache based on size
    let totalEvicted = 0;
    for (const [name, cache] of this.caches.entries()) {
      const cacheSize = cache.store.size;
      if (cacheSize === 0) {
        continue;
      }
      
      const proportion = cacheSize / totalEntries;
      const evictCount = Math.ceil(toEvict * proportion);
      
      const evicted = this.evictOldest(name, evictCount);
      totalEvicted += evicted;
    }
    
    this.logger?.info?.(
      { totalEvicted, remainingEntries: this.getTotalEntries() },
      'Memory pressure handled'
    );
    
    return totalEvicted;
  }
  
  /**
   * Get total entries across all caches
   */
  getTotalEntries() {
    let total = 0;
    for (const cache of this.caches.values()) {
      total += cache.store.size;
    }
    return total;
  }
  
  /**
   * Get statistics for a specific cache
   */
  getCacheStats(cacheName) {
    const cache = this.caches.get(cacheName);
    if (!cache) {
      return null;
    }
    
    const hitRate = cache.metrics.hits + cache.metrics.misses > 0
      ? cache.metrics.hits / (cache.metrics.hits + cache.metrics.misses)
      : 0;
    
    return {
      name: cacheName,
      size: cache.store.size,
      maxEntries: cache.config.maxEntries,
      ttlMs: cache.config.ttlMs,
      metrics: {
        ...cache.metrics,
        hitRate: hitRate.toFixed(3),
      },
    };
  }
  
  /**
   * Get statistics for all caches
   */
  getAllStats() {
    const stats = [];
    for (const name of this.caches.keys()) {
      stats.push(this.getCacheStats(name));
    }
    
    return {
      caches: stats,
      totalEntries: this.getTotalEntries(),
      maxTotalEntries: this.config.maxTotalEntries,
      memoryPressure: this.getTotalEntries() >= this.config.memoryPressureThreshold,
    };
  }
  
  /**
   * Start periodic cleanup timer
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      return;
    }
    
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpired();
        this.handleMemoryPressure();
      } catch (error) {
        this.logger?.error?.({ err: error }, 'Cache cleanup error');
      }
    }, this.config.cleanupIntervalMs);
  }
  
  /**
   * Stop cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
  
  /**
   * Destroy coordinator and cleanup all caches
   */
  destroy() {
    this.stopCleanupTimer();
    
    for (const [name, cache] of this.caches.entries()) {
      cache.store.clear();
      this.logger?.info?.({ cache: name }, 'Cache destroyed');
    }
    
    this.caches.clear();
  }
}

export default CacheCoordinator;
