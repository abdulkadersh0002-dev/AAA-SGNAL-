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

      const smartExecution = this.buildSmartExecutionPlan({
        signal,
        layeredAnalysis,
        snapshot,
      });
      signal.components.smartExecution = smartExecution;

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

  getLayer(layeredAnalysis, layerId) {
    if (!layeredAnalysis?.layers || !Array.isArray(layeredAnalysis.layers)) {
      return null;
    }
    return layeredAnalysis.layers.find((layer) => Number(layer?.layer) === Number(layerId)) || null;
  }

  getLayerMetric(layeredAnalysis, layerId, metricName) {
    const layer = this.getLayer(layeredAnalysis, layerId);
    const value = layer?.metrics?.[metricName];
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  resolveExecutionStyle({ confidence, confluence, spreadPoints, volatility }) {
    if (spreadPoints != null && spreadPoints >= 20) {
      return 'retest';
    }
    if (volatility != null && volatility >= 150) {
      return 'confirm-breakout';
    }
    if (confidence >= 84 && (confluence == null || confluence >= 82)) {
      return 'aggressive';
    }
    return 'balanced';
  }

  resolveAdaptiveEntryThresholds({ style, riskRegime, layer18, layer19 }) {
    const layer18MinComposite = Number(layer18?.metrics?.minCompositeScore);
    const layer18Composite = Number(layer18?.metrics?.compositeScore);
    const layer19Score = Number(layer19?.score);
    const clearanceBand = String(layer19?.metrics?.clearanceBand || '')
      .trim()
      .toUpperCase();

    const thresholds = {
      minConfidence: 68,
      minConfluence: 74,
      maxSpreadPoints: 22,
      minRiskReward: 1.55,
    };

    if (style === 'aggressive') {
      thresholds.minConfidence = 71;
      thresholds.minConfluence = 78;
      thresholds.maxSpreadPoints = 20;
      thresholds.minRiskReward = 1.7;
    } else if (style === 'retest') {
      thresholds.minConfidence = 66;
      thresholds.minConfluence = 70;
      thresholds.maxSpreadPoints = 24;
      thresholds.minRiskReward = 1.5;
    } else if (style === 'confirm-breakout') {
      thresholds.minConfidence = 70;
      thresholds.minConfluence = 76;
      thresholds.maxSpreadPoints = 21;
      thresholds.minRiskReward = 1.65;
    }

    if (riskRegime === 'high-volatility') {
      thresholds.minConfidence += 3;
      thresholds.minConfluence += 2;
      thresholds.maxSpreadPoints -= 2;
      thresholds.minRiskReward += 0.1;
    } else if (riskRegime === 'low-volatility') {
      thresholds.minConfidence -= 1;
      thresholds.minConfluence -= 1;
    }

    if (clearanceBand === 'LOW') {
      thresholds.minConfidence += 4;
      thresholds.minConfluence += 3;
      thresholds.maxSpreadPoints -= 2;
      thresholds.minRiskReward += 0.15;
    } else if (clearanceBand === 'HIGH') {
      thresholds.minConfidence -= 2;
      thresholds.minConfluence -= 1;
      thresholds.maxSpreadPoints += 1;
    }

    if (
      Number.isFinite(layer18Composite) &&
      Number.isFinite(layer18MinComposite) &&
      layer18Composite < layer18MinComposite + 4
    ) {
      thresholds.minConfidence += 2;
      thresholds.minConfluence += 2;
      thresholds.minRiskReward += 0.08;
    }

    if (Number.isFinite(layer19Score) && layer19Score < 82) {
      thresholds.minConfidence += 2;
      thresholds.maxSpreadPoints -= 1;
    }

    thresholds.minConfidence = Math.max(60, Math.min(90, thresholds.minConfidence));
    thresholds.minConfluence = Math.max(65, Math.min(92, thresholds.minConfluence));
    thresholds.maxSpreadPoints = Math.max(12, Math.min(30, thresholds.maxSpreadPoints));
    thresholds.minRiskReward = Number(
      Math.max(1.4, Math.min(2.3, thresholds.minRiskReward)).toFixed(2)
    );

    return thresholds;
  }

  classifyForexPairProfile(pair) {
    const normalized = String(pair || '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{6}$/.test(normalized)) {
      return null;
    }

    const base = normalized.slice(0, 3);
    const quote = normalized.slice(3, 6);
    const majors = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
    const hasUsd = base === 'USD' || quote === 'USD';
    const isYenCross = quote === 'JPY' || base === 'JPY';
    const isMajor = majors.includes(base) && majors.includes(quote);

    if (hasUsd && isMajor) {
      return 'major';
    }
    if (isYenCross) {
      return 'yen_cross';
    }
    if (isMajor) {
      return 'major_cross';
    }
    return 'other';
  }

  applyPairProfileThresholdAdjustments({ thresholds, pairProfile }) {
    const next = { ...thresholds };

    if (pairProfile === 'major') {
      next.minConfidence -= 1;
      next.maxSpreadPoints += 1;
    } else if (pairProfile === 'yen_cross') {
      next.minConfluence -= 1;
      next.maxSpreadPoints += 2;
    } else if (pairProfile === 'major_cross') {
      next.minConfidence += 2;
      next.minConfluence += 2;
      next.minRiskReward += 0.05;
    } else if (pairProfile === 'other') {
      next.minConfidence += 3;
      next.minConfluence += 3;
      next.minRiskReward += 0.1;
      next.maxSpreadPoints -= 1;
    }

    next.minConfidence = Math.max(60, Math.min(90, next.minConfidence));
    next.minConfluence = Math.max(65, Math.min(92, next.minConfluence));
    next.maxSpreadPoints = Math.max(12, Math.min(30, next.maxSpreadPoints));
    next.minRiskReward = Number(Math.max(1.4, Math.min(2.3, next.minRiskReward)).toFixed(2));
    return next;
  }

  resolveNewsGuard({ signal }) {
    const telemetryNews = signal?.components?.telemetry?.news;
    const componentNews = signal?.components?.news;

    const nextHighImpactMinutesRaw =
      telemetryNews?.nextHighImpactMinutes ??
      componentNews?.nextHighImpactMinutes ??
      componentNews?.calendar?.nextHighImpactMinutes ??
      null;
    const impactRaw =
      telemetryNews?.nextHighImpact?.impact ??
      telemetryNews?.impactScore ??
      componentNews?.impact ??
      componentNews?.impactScore ??
      null;

    const nextHighImpactMinutes = Number(nextHighImpactMinutesRaw);
    const impactScore = Number(impactRaw);

    const hasMinutes = Number.isFinite(nextHighImpactMinutes);
    const hasImpact = Number.isFinite(impactScore);

    const absoluteMinutes = hasMinutes ? Math.abs(nextHighImpactMinutes) : null;
    const hardBlockWindowMin = 15;
    const cautionWindowMin = 45;
    const hardBlockImpact = 75;
    const cautionImpact = 60;

    const blocked =
      hasMinutes &&
      hasImpact &&
      absoluteMinutes <= hardBlockWindowMin &&
      impactScore >= hardBlockImpact;

    const caution =
      !blocked &&
      hasMinutes &&
      hasImpact &&
      absoluteMinutes <= cautionWindowMin &&
      impactScore >= cautionImpact;

    return {
      blocked,
      caution,
      nextHighImpactMinutes: hasMinutes ? nextHighImpactMinutes : null,
      impactScore: hasImpact ? impactScore : null,
      hardBlockWindowMin,
      cautionWindowMin,
    };
  }

  buildSmartExecutionPlan({ signal, layeredAnalysis, snapshot }) {
    const entry = signal?.entry && typeof signal.entry === 'object' ? signal.entry : {};
    const entryPrice = Number(signal?.entryPrice ?? entry?.price);
    const stopLoss = Number(signal?.stopLoss ?? entry?.stopLoss);
    const takeProfit = Number(signal?.takeProfit ?? entry?.takeProfit);
    const direction = String(signal?.direction || signal?.signal || '').toUpperCase();

    const confidence = Number.isFinite(Number(signal?.confidence)) ? Number(signal.confidence) : 0;
    const spreadPoints = this.getLayerMetric(layeredAnalysis, 2, 'spreadPoints');
    const volatility = this.getLayerMetric(layeredAnalysis, 3, 'volatility');
    const confluence =
      this.getLayerMetric(layeredAnalysis, 11, 'confluenceScore') ??
      (Number.isFinite(Number(this.getLayer(layeredAnalysis, 11)?.score))
        ? Number(this.getLayer(layeredAnalysis, 11).score)
        : null);

    const riskDistance =
      Number.isFinite(entryPrice) && Number.isFinite(stopLoss)
        ? Math.abs(entryPrice - stopLoss)
        : null;
    const rewardDistance =
      Number.isFinite(entryPrice) && Number.isFinite(takeProfit)
        ? Math.abs(takeProfit - entryPrice)
        : null;
    const riskReward =
      riskDistance && rewardDistance && riskDistance > 0 ? rewardDistance / riskDistance : null;

    const style = this.resolveExecutionStyle({ confidence, confluence, spreadPoints, volatility });
    const layer18 = this.getLayer(layeredAnalysis, 18);
    const layer19 = this.getLayer(layeredAnalysis, 19);
    const layer20Profile = this.getLayer(layeredAnalysis, 20)?.metrics?.executionProfile || null;

    const riskRegime =
      volatility != null && volatility >= 160
        ? 'high-volatility'
        : volatility != null && volatility <= 80
          ? 'low-volatility'
          : 'normal-volatility';

    const thresholds = this.resolveAdaptiveEntryThresholds({
      style,
      riskRegime,
      layer18,
      layer19,
    });

    const pairProfile = this.classifyForexPairProfile(signal?.pair || signal?.symbol);
    const adjustedThresholds = this.applyPairProfileThresholdAdjustments({
      thresholds,
      pairProfile,
    });

    const newsGuard = this.resolveNewsGuard({ signal });

    const nearEntryBand =
      riskDistance != null
        ? style === 'aggressive'
          ? riskDistance * 0.18
          : style === 'retest'
            ? riskDistance * 0.42
            : riskDistance * 0.28
        : null;

    const entryWindowSec =
      style === 'aggressive'
        ? 25
        : style === 'confirm-breakout'
          ? 90
          : style === 'retest'
            ? 150
            : 60;

    const entryWindowAdjustedSec = newsGuard.caution
      ? Math.max(entryWindowSec, 120)
      : entryWindowSec;

    const tapeVolatility =
      snapshot?.market?.volatility ??
      snapshot?.volatility ??
      snapshot?.liveContext?.volatility ??
      null;

    const tapeBias = String(snapshot?.liveContext?.decision || snapshot?.market?.bias || '')
      .trim()
      .toUpperCase();

    const shouldEnterNow =
      newsGuard.blocked !== true &&
      confidence >= adjustedThresholds.minConfidence &&
      (confluence == null || confluence >= adjustedThresholds.minConfluence) &&
      (riskReward == null || riskReward >= adjustedThresholds.minRiskReward) &&
      (spreadPoints == null || spreadPoints <= adjustedThresholds.maxSpreadPoints) &&
      (!tapeBias || tapeBias === 'ENTER' || tapeBias === 'HOLD');

    const lifecycle = {
      hardRiskBreachR: -1.02,
      givebackMinPeakR: style === 'aggressive' ? 1.45 : 1.2,
      profitGivebackExitR: style === 'retest' ? 0.95 : 0.82,
      momentumRolloverMinPeakR: style === 'confirm-breakout' ? 1.05 : 0.9,
      momentumRolloverToR: style === 'aggressive' ? 0.1 : 0.22,
      decisionCooldownMs: style === 'aggressive' ? 12000 : 18000,
      staleTradeMinutes: riskRegime === 'high-volatility' ? 70 : 110,
      staleMinR: 0.12,
    };

    return {
      style,
      shouldEnterNow,
      why: {
        confidence,
        confluence,
        spreadPoints,
        volatility,
        tapeBias: tapeBias || null,
        riskReward: riskReward != null ? Number(riskReward.toFixed(3)) : null,
        pairProfile,
        thresholds: adjustedThresholds,
        newsGuard,
      },
      entry: {
        preferredWindowSec: entryWindowAdjustedSec,
        nearEntryBand: nearEntryBand != null ? Number(nearEntryBand.toFixed(6)) : null,
        entryPrice: Number.isFinite(entryPrice) ? entryPrice : null,
      },
      exit: {
        stopLoss: Number.isFinite(stopLoss) ? stopLoss : null,
        takeProfit: Number.isFinite(takeProfit) ? takeProfit : null,
        tp1RR: 1.0,
        tp2RR: 1.8,
        trailStartRR: style === 'retest' ? 1.2 : 0.9,
      },
      context: {
        direction,
        riskRegime,
        tapeVolatility: Number.isFinite(Number(tapeVolatility)) ? Number(tapeVolatility) : null,
        layer19ClearanceBand: String(layer19?.metrics?.clearanceBand || '').toUpperCase() || null,
        layer20Profile,
      },
      lifecycle,
    };
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
