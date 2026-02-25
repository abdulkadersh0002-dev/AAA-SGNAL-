/**
 * Unified Signal Factory
 * Consolidates all signal generation paths into a single, smart approach
 * Replaces 5 different signal generation methods with one robust pipeline
 */

import logger from '../../infrastructure/services/logging/logger.js';
import LayerOrchestrator from './layer-orchestrator.js';

class SignalFactory {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.tradingEngine = options.tradingEngine;
    this.orchestrationCoordinator = options.orchestrationCoordinator;
    this.layeredDecisionEngine = options.layeredDecisionEngine;
    this.eaBridgeService = options.eaBridgeService;
    this.snapshotManager = options.snapshotManager;

    // Initialize layer orchestrator
    this.layerOrchestrator = new LayerOrchestrator({
      logger: this.logger,
      snapshotManager: this.snapshotManager,
    });

    // Signal generation metrics
    this.metrics = {
      generated: 0,
      validated: 0,
      rejected: 0,
      cached: 0,
      errors: 0,
    };
  }

  /**
   * Generate a signal using the unified pipeline
   * This is the ONE method to rule them all
   */
  async generateSignal(request = {}) {
    const startTime = Date.now();

    try {
      // Step 1: Validate and normalize request
      const validatedRequest = this.validateRequest(request);
      if (!validatedRequest.valid) {
        this.metrics.rejected += 1;
        return {
          success: false,
          error: validatedRequest.error,
          reason: 'REQUEST_VALIDATION_FAILED',
        };
      }

      const { broker, symbol, timeframe, source, analysisMode, eaOnly, requestedBy } =
        validatedRequest;

      // Step 2: Get or create snapshot
      let snapshot = this.snapshotManager ? this.snapshotManager.getSnapshot(broker, symbol) : null;

      // If no snapshot exists, create one
      if (!snapshot && this.snapshotManager) {
        snapshot = this.snapshotManager.createSnapshot({
          broker,
          symbol,
          data: {},
        });
      }

      // Step 3: Check cache for recent signal (avoid re-computation)
      if (snapshot && snapshot.signal && snapshot.signalValid) {
        const age = Date.now() - snapshot.updatedAt;
        if (age < 2500) {
          // Signal is fresh
          this.metrics.cached += 1;
          return {
            success: true,
            signal: snapshot.signal,
            cached: true,
            computeTimeMs: Date.now() - startTime,
            snapshot,
          };
        }
      }

      // Step 4: Generate signal through orchestration coordinator
      if (!this.orchestrationCoordinator?.generateSignal) {
        this.metrics.rejected += 1;
        return {
          success: false,
          error: 'Orchestration coordinator unavailable',
          reason: 'ORCHESTRATION_UNAVAILABLE',
        };
      }

      const orchestrationResult = await this.orchestrationCoordinator.generateSignal(symbol, {
        broker,
        timeframe,
        source,
        analysisMode,
        eaOnly,
        eaBridgeService: this.eaBridgeService,
        requestedBy: requestedBy || 'signal-factory',
      });

      if (!orchestrationResult || !orchestrationResult.success) {
        this.metrics.rejected += 1;
        return {
          success: false,
          error: orchestrationResult?.message || 'Signal generation failed',
          reason: 'ORCHESTRATION_FAILED',
        };
      }

      const signal = orchestrationResult.signal;

      // Step 5: Validate signal structure and data quality
      const qualityCheck = this.validateSignalQuality(signal);
      if (!qualityCheck.valid) {
        this.metrics.rejected += 1;
        return {
          success: false,
          error: qualityCheck.error,
          reason: 'QUALITY_CHECK_FAILED',
          signal: signal, // Include partial signal for debugging
        };
      }

      // Step 6: Process through 20-layer orchestrator
      const layeredAnalysis = await this.layerOrchestrator.processSignal({
        broker,
        symbol,
        snapshot,
        signal,
      });

      if (!layeredAnalysis) {
        this.metrics.rejected += 1;
        return {
          success: false,
          error: 'Layered analysis failed',
          reason: 'LAYERED_ANALYSIS_FAILED',
        };
      }

      // Attach layered analysis to signal
      signal.layeredAnalysis = layeredAnalysis;
      signal.layers = layeredAnalysis.layers;
      signal.components =
        signal.components && typeof signal.components === 'object' ? signal.components : {};
      signal.components.layeredAnalysis = layeredAnalysis;

      // Step 7: Check Layer 18 readiness (from orchestrator)
      const layer18Ready = layeredAnalysis.layer18Ready;
      signal.layer18Ready = layer18Ready;

      // Step 8: Final validation - is this signal tradeable?
      const tradeValid = this.isTradeable(signal, layeredAnalysis);
      signal.tradeValid = tradeValid;

      // Step 9: Update snapshot with complete signal and layer results
      if (this.snapshotManager) {
        this.snapshotManager.updateSnapshot({
          broker,
          symbol,
          updates: {
            signal,
            layers: layeredAnalysis.layers,
            layeredAnalysis,
            signalValid: tradeValid,
            layer18Ready,
          },
        });
      }

      // Update metrics
      if (tradeValid) {
        this.metrics.validated += 1;
      } else {
        this.metrics.rejected += 1;
      }
      this.metrics.generated += 1;

      return {
        success: true,
        signal,
        cached: false,
        layer18Ready,
        tradeValid,
        layeredAnalysis,
        computeTimeMs: Date.now() - startTime,
        metrics: {
          generated: this.metrics.generated,
          validated: this.metrics.validated,
          rejectionRate: (this.metrics.rejected / Math.max(1, this.metrics.generated)).toFixed(3),
        },
      };
    } catch (error) {
      this.metrics.errors += 1;
      this.logger?.error?.({ err: error, request }, 'Signal generation error in unified pipeline');

      return {
        success: false,
        error: error.message,
        reason: 'PIPELINE_ERROR',
      };
    }
  }

  /**
   * Batch generate signals for multiple symbols
   */
  async generateBatchSignals(requests = []) {
    const startTime = Date.now();
    const results = [];

    // Process in parallel with concurrency limit
    const concurrency = 5;
    const batches = [];

    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      batches.push(batch);
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(batch.map((request) => this.generateSignal(request)));
      results.push(...batchResults);
    }

    const successful = results.filter((r) => r.success && r.tradeValid);

    return {
      success: true,
      total: requests.length,
      successful: successful.length,
      failed: results.length - successful.length,
      results,
      computeTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Validate request parameters
   */
  validateRequest(request) {
    if (!request || typeof request !== 'object') {
      return { valid: false, error: 'Request must be an object' };
    }

    const broker = request.broker || request.brokerId || 'mt5';
    const symbol = request.symbol || request.pair || null;
    const analysisMode = request.analysisMode ?? request.options?.analysisMode ?? null;
    const eaOnly = request.eaOnly === true || request.options?.eaOnly === true;
    const requestedBy = request.requestedBy ?? request.options?.requestedBy ?? null;

    if (!symbol || typeof symbol !== 'string') {
      return { valid: false, error: 'Symbol is required' };
    }

    const timeframe = request.timeframe || 'H1';
    const source = request.source || 'signal-factory';

    return {
      valid: true,
      broker,
      symbol: symbol.toUpperCase(),
      timeframe,
      source,
      analysisMode,
      eaOnly,
      requestedBy,
    };
  }

  /**
   * Validate signal quality and data completeness
   */
  validateSignalQuality(signal) {
    if (!signal || typeof signal !== 'object') {
      return { valid: false, error: 'Signal is null or not an object' };
    }

    const pair = signal.pair || signal.symbol || null;
    if (!pair) {
      return { valid: false, error: 'Missing required field: pair' };
    }

    const direction = String(signal.direction || signal.signal || '').toUpperCase();
    const validDirections = ['BUY', 'SELL', 'HOLD', 'NEUTRAL'];
    if (!validDirections.includes(direction)) {
      return { valid: false, error: `Invalid signal direction: ${direction}` };
    }

    // Validate confidence range
    if (typeof signal.confidence !== 'number' || signal.confidence < 0 || signal.confidence > 100) {
      return { valid: false, error: 'Confidence must be a number between 0-100' };
    }

    // Validate entry price if present
    const entryPrice = signal.entryPrice ?? signal.entry?.price ?? null;
    if (entryPrice != null && (typeof entryPrice !== 'number' || entryPrice <= 0)) {
      return { valid: false, error: 'Entry price must be a positive number' };
    }

    return { valid: true };
  }

  /**
   * Determine if signal is tradeable (final gate)
   * Uses LayerOrchestrator's layer18Ready flag
   */
  isTradeable(signal, layeredAnalysis) {
    // Must pass layer 18 readiness from orchestrator
    if (!layeredAnalysis.layer18Ready) {
      return false;
    }

    // Signal must not be HOLD or NEUTRAL
    const direction = String(signal.signal || signal.direction || '').toUpperCase();
    if (direction === 'HOLD' || direction === 'NEUTRAL') {
      return false;
    }

    // Minimum confidence threshold
    if (signal.confidence < 65) {
      return false;
    }

    // Must have entry price
    const entryPrice = signal.entryPrice ?? signal.entry?.price ?? null;
    if (!entryPrice || entryPrice <= 0) {
      return false;
    }

    // Must have stop loss
    const stopLoss = signal.stopLoss ?? signal.entry?.stopLoss ?? null;
    if (!stopLoss || stopLoss <= 0) {
      return false;
    }

    // Risk/reward must be favorable
    const riskRewardRatio = signal.riskRewardRatio ?? signal.entry?.riskReward ?? null;
    if (riskRewardRatio != null && riskRewardRatio < 1.5) {
      return false;
    }

    return true;
  }

  /**
   * Cache signal for reuse
   */
  cacheSignal({ broker, symbol, signal, ttlMs: _ttlMs = 2500 }) {
    if (!this.eaBridgeService || !this.eaBridgeService.cacheAnalysisSnapshot) {
      return false;
    }

    try {
      this.eaBridgeService.cacheAnalysisSnapshot({
        broker,
        symbol,
        signal,
        tradeValid: signal.tradeValid,
        computedAt: Date.now(),
      });
      return true;
    } catch (error) {
      this.logger?.warn?.({ err: error }, 'Failed to cache signal');
      return false;
    }
  }

  /**
   * Get cached signal if available and fresh
   */
  getCachedSignal({ broker, symbol, maxAgeMs = 2500 }) {
    if (!this.eaBridgeService || !this.eaBridgeService.getCachedAnalysisSnapshot) {
      return null;
    }

    try {
      const cached = this.eaBridgeService.getCachedAnalysisSnapshot({
        broker,
        symbol,
        maxAgeMs,
      });

      return cached?.signal || null;
    } catch (error) {
      this.logger?.warn?.({ err: error }, 'Failed to get cached signal');
      return null;
    }
  }

  /**
   * Get generation metrics
   */
  getMetrics() {
    const total = this.metrics.generated;
    return {
      ...this.metrics,
      successRate: total > 0 ? (this.metrics.validated / total).toFixed(3) : '0.000',
      rejectionRate: total > 0 ? (this.metrics.rejected / total).toFixed(3) : '0.000',
      cacheHitRate: total > 0 ? (this.metrics.cached / total).toFixed(3) : '0.000',
      errorRate: total > 0 ? (this.metrics.errors / total).toFixed(3) : '0.000',
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      generated: 0,
      validated: 0,
      rejected: 0,
      cached: 0,
      errors: 0,
    };
  }
}

export default SignalFactory;
