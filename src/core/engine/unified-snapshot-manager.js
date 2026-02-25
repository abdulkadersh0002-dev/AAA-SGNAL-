/**
 * Unified Snapshot Manager
 * Single source of truth for all market data, analysis, and signals
 * Used by both dashboard and execution engine
 */

import logger from '../../infrastructure/services/logging/logger.js';

class UnifiedSnapshotManager {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.cacheCoordinator = options.cacheCoordinator;
    this.eaBridgeService = options.eaBridgeService;

    // Snapshot storage: key -> snapshot
    // key format: `${broker}:${symbol}`
    this.snapshots = new Map();

    // Snapshot update listeners
    this.listeners = new Set();

    // Snapshot versioning for change tracking
    this.version = 0;

    // Configuration
    this.config = {
      snapshotTTL: options.snapshotTTL || 5000, // 5 seconds default
      maxSnapshots: options.maxSnapshots || 200,
      enableVersioning: options.enableVersioning !== false,
    };
  }

  /**
   * Create or update a snapshot for a symbol
   */
  createSnapshot({ broker, symbol, data = {} }) {
    const key = this.getSnapshotKey(broker, symbol);
    const now = Date.now();

    // Get existing snapshot or create new
    const existing = this.snapshots.get(key);
    const snapshot = {
      // Metadata
      broker,
      symbol,
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt || now,
      updatedAt: now,

      // Market data
      quote: data.quote || existing?.quote || null,
      bars: data.bars || existing?.bars || {},
      technicalSnapshot: data.technicalSnapshot || existing?.technicalSnapshot || null,

      // Analysis results (20 layers)
      layers: data.layers || existing?.layers || this.createEmptyLayers(),
      layeredAnalysis: data.layeredAnalysis || existing?.layeredAnalysis || null,

      // Signal data
      signal: data.signal || existing?.signal || null,
      signalValid:
        data.signalValid !== undefined ? data.signalValid : existing?.signalValid || false,
      layer18Ready:
        data.layer18Ready !== undefined ? data.layer18Ready : existing?.layer18Ready || false,

      // Validation results
      validationResult: data.validationResult || existing?.validationResult || null,

      // Execution status
      executionStatus: data.executionStatus || existing?.executionStatus || 'PENDING',
      executionResult: data.executionResult || existing?.executionResult || null,

      // News and events
      news: data.news || existing?.news || [],

      // Market conditions
      marketPhase: data.marketPhase || existing?.marketPhase || null,
      volatility: data.volatility || existing?.volatility || null,

      // Metadata
      source: data.source || 'snapshot-manager',
      metadata: {
        ...existing?.metadata,
        ...data.metadata,
      },
    };

    // Store snapshot
    this.snapshots.set(key, snapshot);

    // Increment global version if versioning enabled
    if (this.config.enableVersioning) {
      this.version += 1;
    }

    // Cleanup old snapshots if limit exceeded
    if (this.snapshots.size > this.config.maxSnapshots) {
      this.cleanupOldSnapshots();
    }

    // Notify listeners
    this.notifyListeners('update', { key, snapshot });

    this.logger?.debug?.({ broker, symbol, version: snapshot.version }, 'Snapshot created/updated');

    return snapshot;
  }

  /**
   * Get snapshot for a symbol
   */
  getSnapshot(broker, symbol) {
    const key = this.getSnapshotKey(broker, symbol);
    const snapshot = this.snapshots.get(key);

    if (!snapshot) {
      return null;
    }

    // Check if snapshot is stale
    const age = Date.now() - snapshot.updatedAt;
    if (age > this.config.snapshotTTL) {
      this.logger?.debug?.({ broker, symbol, age }, 'Snapshot is stale');
      // Don't delete, just mark as stale
      snapshot.stale = true;
    }

    return snapshot;
  }

  /**
   * Update specific part of snapshot (partial update)
   */
  updateSnapshot({ broker, symbol, updates = {} }) {
    const key = this.getSnapshotKey(broker, symbol);
    const existing = this.snapshots.get(key);

    if (!existing) {
      // Create new snapshot with updates
      return this.createSnapshot({ broker, symbol, data: updates });
    }

    // Merge updates
    return this.createSnapshot({
      broker,
      symbol,
      data: {
        ...existing,
        ...updates,
        metadata: {
          ...existing.metadata,
          ...updates.metadata,
        },
      },
    });
  }

  /**
   * Update quote data in snapshot
   */
  updateQuote({ broker, symbol, quote }) {
    const now = Date.now();
    const normalizedQuote =
      quote && typeof quote === 'object'
        ? {
            ...quote,
            receivedAt: quote.receivedAt ?? quote.timestamp ?? now,
          }
        : quote;
    const receivedAt = Number(normalizedQuote?.receivedAt ?? normalizedQuote?.timestamp ?? now);
    return this.updateSnapshot({
      broker,
      symbol,
      updates: {
        quote: normalizedQuote,
        metadata: {
          lastQuoteAt: Number.isFinite(receivedAt) ? receivedAt : now,
          lastQuoteSource: normalizedQuote?.source ?? null,
        },
      },
    });
  }

  /**
   * Update bars data in snapshot
   */
  updateBars({ broker, symbol, timeframe, bars }) {
    const existing = this.getSnapshot(broker, symbol);
    const existingBars = existing?.bars || {};
    const now = Date.now();

    return this.updateSnapshot({
      broker,
      symbol,
      updates: {
        bars: {
          ...existingBars,
          [timeframe]: bars,
        },
        metadata: {
          lastBarsAt: now,
          lastBarsTimeframe: timeframe || null,
        },
      },
    });
  }

  /**
   * Update layer results in snapshot
   */
  updateLayers({ broker, symbol, layers }) {
    return this.updateSnapshot({
      broker,
      symbol,
      updates: { layers },
    });
  }

  /**
   * Update signal in snapshot
   */
  updateSignal({ broker, symbol, signal, signalValid, layer18Ready }) {
    return this.updateSnapshot({
      broker,
      symbol,
      updates: { signal, signalValid, layer18Ready },
    });
  }

  /**
   * Get all snapshots
   */
  getAllSnapshots(filter = {}) {
    const snapshots = [];

    for (const snapshot of this.snapshots.values()) {
      // Apply filters
      if (filter.broker && snapshot.broker !== filter.broker) {
        continue;
      }
      if (filter.signalValid !== undefined && snapshot.signalValid !== filter.signalValid) {
        continue;
      }
      if (filter.layer18Ready !== undefined && snapshot.layer18Ready !== filter.layer18Ready) {
        continue;
      }

      snapshots.push(snapshot);
    }

    // Sort by update time (newest first)
    snapshots.sort((a, b) => b.updatedAt - a.updatedAt);

    return snapshots;
  }

  /**
   * Get snapshots ready for execution (passed all layers)
   */
  getReadySnapshots(broker = null) {
    return this.getAllSnapshots({
      broker,
      signalValid: true,
      layer18Ready: true,
    });
  }

  /**
   * Get snapshot key
   */
  getSnapshotKey(broker, symbol) {
    const b = String(broker || 'mt5').toLowerCase();
    const s = String(symbol || '').toUpperCase();
    return `${b}:${s}`;
  }

  /**
   * Create empty layer structure (20 layers)
   */
  createEmptyLayers() {
    const layers = [];
    for (let i = 1; i <= 20; i++) {
      layers.push({
        layer: i,
        key: `L${i}`,
        status: 'PENDING',
        score: null,
        confidence: null,
        metrics: {},
        reason: null,
      });
    }
    return layers;
  }

  /**
   * Cleanup old snapshots
   */
  cleanupOldSnapshots() {
    // Sort by update time
    const sorted = Array.from(this.snapshots.entries()).sort(
      (a, b) => a[1].updatedAt - b[1].updatedAt
    );

    // Remove oldest to get back to limit
    const toRemove = sorted.length - this.config.maxSnapshots;
    if (toRemove > 0) {
      for (let i = 0; i < toRemove; i++) {
        const [key, snapshot] = sorted[i];
        this.snapshots.delete(key);
        this.notifyListeners('remove', { key, snapshot });

        this.logger?.debug?.(
          { broker: snapshot.broker, symbol: snapshot.symbol },
          'Old snapshot removed'
        );
      }
    }
  }

  /**
   * Register listener for snapshot updates
   */
  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    return () => {};
  }

  /**
   * Notify all listeners of changes
   */
  notifyListeners(event, data) {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (error) {
        this.logger?.error?.({ err: error }, 'Listener notification error');
      }
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const snapshots = Array.from(this.snapshots.values());
    const now = Date.now();

    return {
      total: snapshots.length,
      version: this.version,
      byStatus: {
        ready: snapshots.filter((s) => s.signalValid && s.layer18Ready).length,
        pending: snapshots.filter((s) => !s.signalValid || !s.layer18Ready).length,
      },
      byFreshness: {
        fresh: snapshots.filter((s) => now - s.updatedAt < this.config.snapshotTTL).length,
        stale: snapshots.filter((s) => now - s.updatedAt >= this.config.snapshotTTL).length,
      },
      listeners: this.listeners.size,
    };
  }

  /**
   * Clear all snapshots
   */
  clear() {
    this.snapshots.clear();
    this.version = 0;
    this.notifyListeners('clear', {});
    this.logger?.info?.('All snapshots cleared');
  }

  /**
   * Destroy manager
   */
  destroy() {
    this.clear();
    this.listeners.clear();
    this.logger?.info?.('Snapshot manager destroyed');
  }
}

export default UnifiedSnapshotManager;
