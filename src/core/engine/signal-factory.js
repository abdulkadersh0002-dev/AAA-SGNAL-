/**
 * Unified Signal Factory
 * Consolidates all signal generation paths into a single, smart approach
 * Replaces 5 different signal generation methods with one robust pipeline
 */

import logger from '../../infrastructure/services/logging/logger.js';

class SignalFactory {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.tradingEngine = options.tradingEngine;
    this.orchestrationCoordinator = options.orchestrationCoordinator;
    this.layeredDecisionEngine = options.layeredDecisionEngine;
    this.eaBridgeService = options.eaBridgeService;

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

      const { broker, symbol, timeframe, source } = validatedRequest;

      // Step 2: Check cache for recent signal (avoid re-computation)
      const cached = this.getCachedSignal({ broker, symbol, maxAgeMs: 2500 });
      if (cached) {
        this.metrics.cached += 1;
        return {
          success: true,
          signal: cached,
          cached: true,
          computeTimeMs: Date.now() - startTime,
        };
      }

      // Step 3: Generate signal through orchestration coordinator
      const orchestrationResult = await this.orchestrationCoordinator.generateSignal({
        broker,
        symbol,
        timeframe,
        source,
        requestedBy: request.requestedBy || 'signal-factory',
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

      // Step 4: Validate signal structure and data quality
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

      // Step 5: Apply layered decision engine (20-layer validation)
      const layeredAnalysis = await this.layeredDecisionEngine.analyze({
        signal,
        broker,
        symbol,
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

      // Step 6: Check Layer 18 readiness (validation gate)
      const layer18Ready = this.checkLayer18Readiness(layeredAnalysis);
      signal.layer18Ready = layer18Ready;

      // Step 7: Final validation - is this signal tradeable?
      const tradeValid = this.isTradeable(signal, layeredAnalysis);
      signal.tradeValid = tradeValid;

      // Step 8: Cache the result
      this.cacheSignal({ broker, symbol, signal, ttlMs: 2500 });

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
    };
  }

  /**
   * Validate signal quality and data completeness
   */
  validateSignalQuality(signal) {
    if (!signal || typeof signal !== 'object') {
      return { valid: false, error: 'Signal is null or not an object' };
    }

    // Check required fields
    const requiredFields = ['symbol', 'timeframe', 'signal', 'confidence'];
    for (const field of requiredFields) {
      if (signal[field] == null) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    // Validate signal direction
    const validDirections = ['BUY', 'SELL', 'HOLD', 'NEUTRAL'];
    if (!validDirections.includes(signal.signal)) {
      return { valid: false, error: `Invalid signal direction: ${signal.signal}` };
    }

    // Validate confidence range
    if (typeof signal.confidence !== 'number' || signal.confidence < 0 || signal.confidence > 100) {
      return { valid: false, error: 'Confidence must be a number between 0-100' };
    }

    // Validate entry price if present
    if (
      signal.entryPrice != null &&
      (typeof signal.entryPrice !== 'number' || signal.entryPrice <= 0)
    ) {
      return { valid: false, error: 'Entry price must be a positive number' };
    }

    return { valid: true };
  }

  /**
   * Check if Layer 18 readiness criteria are met
   */
  checkLayer18Readiness(layeredAnalysis) {
    if (!layeredAnalysis || !layeredAnalysis.layers) {
      return false;
    }

    // Layer 18 must exist and be ready
    const layer18 = layeredAnalysis.layers.find((l) => l.layer === 18);
    if (!layer18) {
      return false;
    }

    // Check readiness flag
    if (layer18.ready === false) {
      return false;
    }

    // Check minimum confluence score (from layer metadata)
    const confluenceScore = layeredAnalysis.confluenceScore || 0;
    if (confluenceScore < 60) {
      return false;
    }

    return true;
  }

  /**
   * Determine if signal is tradeable (final gate)
   */
  isTradeable(signal, layeredAnalysis) {
    // Must pass layer 18 readiness
    if (!this.checkLayer18Readiness(layeredAnalysis)) {
      return false;
    }

    // Signal must not be HOLD or NEUTRAL
    if (signal.signal === 'HOLD' || signal.signal === 'NEUTRAL') {
      return false;
    }

    // Minimum confidence threshold
    if (signal.confidence < 65) {
      return false;
    }

    // Must have entry price
    if (!signal.entryPrice || signal.entryPrice <= 0) {
      return false;
    }

    // Must have stop loss
    if (!signal.stopLoss || signal.stopLoss <= 0) {
      return false;
    }

    // Risk/reward must be favorable
    if (signal.riskRewardRatio != null && signal.riskRewardRatio < 1.5) {
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
