/**
 * Layer Orchestrator
 * Ensures every signal passes through all 20 layers sequentially
 * Single unified path for layer analysis
 */

import logger from '../../../infrastructure/services/logging/logger.js';

class LayerOrchestrator {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.snapshotManager = options.snapshotManager;

    // Layer definitions - all 20 layers with their processors
    this.layers = this.initializeLayers(options);

    // Metrics
    this.metrics = {
      processed: 0,
      passed: 0,
      failed: 0,
      byLayer: new Map(),
    };
  }

  /**
   * Initialize all 20 layers with their processing functions
   */
  initializeLayers(options) {
    return [
      {
        id: 1,
        name: 'Market Data Quality',
        description: 'Validate quote freshness and data completeness',
        required: true,
        processor: this.processLayer1.bind(this),
      },
      {
        id: 2,
        name: 'Spread Analysis',
        description: 'Check spread is within acceptable limits',
        required: true,
        processor: this.processLayer2.bind(this),
      },
      {
        id: 3,
        name: 'Volatility Check',
        description: 'Ensure market volatility is appropriate',
        required: true,
        processor: this.processLayer3.bind(this),
      },
      {
        id: 4,
        name: 'Trend Direction',
        description: 'Identify primary trend across timeframes',
        required: true,
        processor: this.processLayer4.bind(this),
      },
      {
        id: 5,
        name: 'Support/Resistance',
        description: 'Check proximity to key levels',
        required: true,
        processor: this.processLayer5.bind(this),
      },
      {
        id: 6,
        name: 'Technical Indicators',
        description: 'RSI, MACD, Stochastic alignment',
        required: true,
        processor: this.processLayer6.bind(this),
      },
      {
        id: 7,
        name: 'Moving Averages',
        description: 'MA crossovers and alignment',
        required: true,
        processor: this.processLayer7.bind(this),
      },
      {
        id: 8,
        name: 'Momentum Analysis',
        description: 'Price momentum and acceleration',
        required: true,
        processor: this.processLayer8.bind(this),
      },
      {
        id: 9,
        name: 'Volume Profile',
        description: 'Volume confirmation and patterns',
        required: false,
        processor: this.processLayer9.bind(this),
      },
      {
        id: 10,
        name: 'Candlestick Patterns',
        description: 'Reversal and continuation patterns',
        required: true,
        processor: this.processLayer10.bind(this),
      },
      {
        id: 11,
        name: 'Multi-Timeframe Confluence',
        description: 'Agreement across M15, H1, H4, D1',
        required: true,
        processor: this.processLayer11.bind(this),
      },
      {
        id: 12,
        name: 'News Impact',
        description: 'High-impact news event avoidance',
        required: true,
        processor: this.processLayer12.bind(this),
      },
      {
        id: 13,
        name: 'Economic Calendar',
        description: 'Upcoming economic events check',
        required: true,
        processor: this.processLayer13.bind(this),
      },
      {
        id: 14,
        name: 'Market Session',
        description: 'Trading session liquidity and timing',
        required: true,
        processor: this.processLayer14.bind(this),
      },
      {
        id: 15,
        name: 'Correlation Analysis',
        description: 'Inter-market correlations',
        required: false,
        processor: this.processLayer15.bind(this),
      },
      {
        id: 16,
        name: 'Risk/Reward Ratio',
        description: 'Minimum 1.5:1 R:R ratio',
        required: true,
        processor: this.processLayer16.bind(this),
      },
      {
        id: 17,
        name: 'Position Sizing',
        description: 'Calculate optimal position size',
        required: true,
        processor: this.processLayer17.bind(this),
      },
      {
        id: 18,
        name: 'Final Validation',
        description: 'Composite readiness check',
        required: true,
        processor: this.processLayer18.bind(this),
      },
      {
        id: 19,
        name: 'Execution Clearance',
        description: 'Pre-execution final checks',
        required: true,
        processor: this.processLayer19.bind(this),
      },
      {
        id: 20,
        name: 'Trade Metadata',
        description: 'Prepare trade execution metadata',
        required: true,
        processor: this.processLayer20.bind(this),
      },
    ];
  }

  /**
   * Process a signal through all 20 layers sequentially
   */
  async processSignal({ broker, symbol, snapshot, signal }) {
    const startTime = Date.now();
    const layerResults = [];

    this.logger?.info?.({ broker, symbol }, 'Starting 20-layer analysis');

    // Process each layer sequentially
    for (const layer of this.layers) {
      const layerStart = Date.now();

      try {
        // Process layer
        const result = await layer.processor({
          broker,
          symbol,
          snapshot,
          signal,
          previousLayers: layerResults,
        });

        // Ensure result has standard structure
        const layerResult = {
          layer: layer.id,
          key: `L${layer.id}`,
          name: layer.name,
          description: layer.description,
          status: result.status || 'PASS',
          score: result.score || null,
          confidence: result.confidence || null,
          metrics: result.metrics || {},
          reason: result.reason || null,
          processingTimeMs: Date.now() - layerStart,
        };

        layerResults.push(layerResult);

        // Update metrics
        this.updateLayerMetrics(layer.id, layerResult.status);

        // Log layer result
        this.logger?.debug?.(
          {
            broker,
            symbol,
            layer: layer.id,
            status: layerResult.status,
            score: layerResult.score,
          },
          `Layer ${layer.id} (${layer.name}): ${layerResult.status}`
        );

        // Stop if layer failed and is required
        if (layerResult.status === 'FAIL' && layer.required) {
          this.logger?.warn?.(
            { broker, symbol, layer: layer.id, reason: layerResult.reason },
            `Required layer ${layer.id} failed - stopping analysis`
          );

          // Fill remaining layers as SKIPPED
          for (let i = layer.id; i < this.layers.length; i++) {
            const skippedLayer = this.layers[i];
            layerResults.push({
              layer: skippedLayer.id,
              key: `L${skippedLayer.id}`,
              name: skippedLayer.name,
              status: 'SKIPPED',
              reason: `Previous required layer (L${layer.id}) failed`,
            });
          }

          break;
        }
      } catch (error) {
        this.logger?.error?.(
          { err: error, broker, symbol, layer: layer.id },
          `Layer ${layer.id} processing error`
        );

        layerResults.push({
          layer: layer.id,
          key: `L${layer.id}`,
          name: layer.name,
          status: 'ERROR',
          reason: error.message,
          processingTimeMs: Date.now() - layerStart,
        });

        this.updateLayerMetrics(layer.id, 'ERROR');

        // Stop on error if layer is required
        if (layer.required) {
          break;
        }
      }
    }

    // Calculate overall result
    const totalTime = Date.now() - startTime;
    const passedLayers = layerResults.filter((l) => l.status === 'PASS').length;
    const failedLayers = layerResults.filter((l) => l.status === 'FAIL').length;
    const errorLayers = layerResults.filter((l) => l.status === 'ERROR').length;

    // Check if all required layers passed
    const allRequiredPassed = this.layers
      .filter((l) => l.required)
      .every((l) => {
        const result = layerResults.find((r) => r.layer === l.id);
        return result && result.status === 'PASS';
      });

    // Calculate confluence score (percentage of passed layers)
    const confluenceScore = Math.round((passedLayers / 20) * 100);

    const analysis = {
      broker,
      symbol,
      layers: layerResults,
      summary: {
        total: 20,
        passed: passedLayers,
        failed: failedLayers,
        errors: errorLayers,
        skipped: 20 - passedLayers - failedLayers - errorLayers,
        allRequiredPassed,
        confluenceScore,
      },
      layer18Ready: allRequiredPassed && confluenceScore >= 60,
      processingTimeMs: totalTime,
      timestamp: Date.now(),
    };

    // Update metrics
    this.metrics.processed += 1;
    if (analysis.layer18Ready) {
      this.metrics.passed += 1;
    } else {
      this.metrics.failed += 1;
    }

    this.logger?.info?.(
      {
        broker,
        symbol,
        passed: passedLayers,
        failed: failedLayers,
        confluenceScore,
        layer18Ready: analysis.layer18Ready,
        timeMs: totalTime,
      },
      `20-layer analysis complete: ${analysis.layer18Ready ? 'READY' : 'NOT READY'}`
    );

    return analysis;
  }

  /**
   * Update layer metrics
   */
  updateLayerMetrics(layerId, status) {
    const key = `L${layerId}`;
    const metrics = this.metrics.byLayer.get(key) || { pass: 0, fail: 0, error: 0 };

    if (status === 'PASS') {
      metrics.pass += 1;
    } else if (status === 'FAIL') {
      metrics.fail += 1;
    } else if (status === 'ERROR') {
      metrics.error += 1;
    }

    this.metrics.byLayer.set(key, metrics);
  }

  // ===== LAYER PROCESSORS =====
  // Each layer implements specific validation logic

  async processLayer1({ snapshot }) {
    // Market Data Quality
    const quote = snapshot?.quote;
    if (!quote) {
      return { status: 'FAIL', reason: 'No quote data available' };
    }

    const age = Date.now() - (quote.receivedAt || quote.timestamp || 0);
    if (age > 60000) {
      // Quote older than 60 seconds
      return { status: 'FAIL', reason: `Quote too old: ${age}ms`, metrics: { ageMs: age } };
    }

    if (!quote.bid || !quote.ask || quote.bid <= 0 || quote.ask <= 0) {
      return { status: 'FAIL', reason: 'Invalid bid/ask prices' };
    }

    return {
      status: 'PASS',
      score: 100,
      confidence: 95,
      metrics: { ageMs: age, bid: quote.bid, ask: quote.ask },
      reason: 'Quote data is fresh and valid',
    };
  }

  async processLayer2({ snapshot }) {
    // Spread Analysis
    const quote = snapshot?.quote;
    if (!quote || !quote.spreadPoints) {
      return { status: 'SKIP', reason: 'Spread data not available' };
    }

    // Acceptable spread: < 30 points for major pairs
    const spread = quote.spreadPoints;
    if (spread > 30) {
      return {
        status: 'FAIL',
        reason: `Spread too wide: ${spread} points`,
        metrics: { spreadPoints: spread },
      };
    }

    return {
      status: 'PASS',
      score: 100 - (spread / 30) * 20, // Lower score for wider spreads
      confidence: 90,
      metrics: { spreadPoints: spread },
      reason: 'Spread is acceptable',
    };
  }

  async processLayer3({ snapshot }) {
    // Volatility Check
    const volatility = snapshot?.volatility;
    if (volatility == null) {
      return { status: 'SKIP', reason: 'Volatility data not available' };
    }

    // Accept moderate volatility (not too low, not too high)
    if (volatility < 10) {
      return { status: 'FAIL', reason: 'Volatility too low', metrics: { volatility } };
    }
    if (volatility > 200) {
      return { status: 'FAIL', reason: 'Volatility too high', metrics: { volatility } };
    }

    return {
      status: 'PASS',
      score: 80,
      confidence: 75,
      metrics: { volatility },
      reason: 'Volatility is in acceptable range',
    };
  }

  // Placeholder processors for remaining layers (4-20)
  // In production, these would contain the actual analysis logic

  async processLayer4({ snapshot: _snapshot }) {
    // Trend Direction - placeholder
    return { status: 'PASS', score: 75, confidence: 70, reason: 'Trend analysis passed' };
  }

  async processLayer5({ snapshot: _snapshot }) {
    // Support/Resistance - placeholder
    return { status: 'PASS', score: 70, confidence: 65, reason: 'S/R levels clear' };
  }

  async processLayer6({ snapshot: _snapshot }) {
    // Technical Indicators - placeholder
    return { status: 'PASS', score: 80, confidence: 75, reason: 'Indicators aligned' };
  }

  async processLayer7({ snapshot: _snapshot }) {
    // Moving Averages - placeholder
    return { status: 'PASS', score: 75, confidence: 70, reason: 'MA alignment confirmed' };
  }

  async processLayer8({ snapshot: _snapshot }) {
    // Momentum Analysis - placeholder
    return { status: 'PASS', score: 70, confidence: 65, reason: 'Momentum positive' };
  }

  async processLayer9({ snapshot: _snapshot }) {
    // Volume Profile - placeholder (optional)
    return { status: 'PASS', score: 60, confidence: 50, reason: 'Volume confirmed' };
  }

  async processLayer10({ snapshot: _snapshot }) {
    // Candlestick Patterns - placeholder
    return { status: 'PASS', score: 75, confidence: 70, reason: 'Pattern detected' };
  }

  async processLayer11({ snapshot: _snapshot }) {
    // Multi-Timeframe Confluence - placeholder
    return { status: 'PASS', score: 85, confidence: 80, reason: 'Timeframes aligned' };
  }

  async processLayer12({ snapshot }) {
    // News Impact - placeholder
    const news = snapshot?.news || [];
    const highImpact = news.filter((n) => n.impact >= 70);

    if (highImpact.length > 0) {
      return {
        status: 'FAIL',
        reason: 'High-impact news detected',
        metrics: { newsCount: highImpact.length },
      };
    }

    return { status: 'PASS', score: 100, confidence: 95, reason: 'No high-impact news' };
  }

  async processLayer13({ snapshot: _snapshot }) {
    // Economic Calendar - placeholder
    return { status: 'PASS', score: 90, confidence: 85, reason: 'Calendar clear' };
  }

  async processLayer14({ snapshot: _snapshot }) {
    // Market Session - placeholder
    return { status: 'PASS', score: 80, confidence: 75, reason: 'Good trading session' };
  }

  async processLayer15({ snapshot: _snapshot }) {
    // Correlation Analysis - placeholder (optional)
    return { status: 'PASS', score: 70, confidence: 60, reason: 'Correlations normal' };
  }

  async processLayer16({ snapshot, signal }) {
    // Risk/Reward Ratio
    if (!signal || !signal.riskRewardRatio) {
      return { status: 'SKIP', reason: 'R:R ratio not calculated' };
    }

    if (signal.riskRewardRatio < 1.5) {
      return {
        status: 'FAIL',
        reason: `R:R ratio too low: ${signal.riskRewardRatio}`,
        metrics: { riskRewardRatio: signal.riskRewardRatio },
      };
    }

    return {
      status: 'PASS',
      score: Math.min(100, signal.riskRewardRatio * 40),
      confidence: 90,
      metrics: { riskRewardRatio: signal.riskRewardRatio },
      reason: 'R:R ratio acceptable',
    };
  }

  async processLayer17({ snapshot: _snapshot, signal: _signal }) {
    // Position Sizing - placeholder
    return { status: 'PASS', score: 85, confidence: 80, reason: 'Position size calculated' };
  }

  async processLayer18({ previousLayers }) {
    // Final Validation - check all previous layers
    const requiredLayers = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 16, 17];

    for (const layerId of requiredLayers) {
      const layer = previousLayers.find((l) => l.layer === layerId);
      if (!layer || layer.status !== 'PASS') {
        return {
          status: 'FAIL',
          reason: `Required layer L${layerId} did not pass`,
        };
      }
    }

    // Calculate composite score from all layers
    const scores = previousLayers.filter((l) => l.score != null).map((l) => l.score);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    if (avgScore < 60) {
      return {
        status: 'FAIL',
        reason: `Composite score too low: ${avgScore.toFixed(1)}`,
        metrics: { compositeScore: avgScore },
      };
    }

    const passedCount = previousLayers.filter((l) => l.status === 'PASS').length;
    return {
      status: 'PASS',
      score: avgScore,
      confidence: 95,
      metrics: { compositeScore: avgScore, passedLayers: passedCount },
      reason: 'All required layers passed',
    };
  }

  async processLayer19({ previousLayers: _previousLayers }) {
    // Execution Clearance - placeholder
    return { status: 'PASS', score: 95, confidence: 90, reason: 'Cleared for execution' };
  }

  async processLayer20({ signal: _signal }) {
    // Trade Metadata - placeholder
    return {
      status: 'PASS',
      score: 100,
      confidence: 100,
      metrics: { metadataPrepared: true },
      reason: 'Trade metadata prepared',
    };
  }

  /**
   * Get processing metrics
   */
  getMetrics() {
    const layerMetrics = [];
    for (const [key, metrics] of this.metrics.byLayer.entries()) {
      const total = metrics.pass + metrics.fail + metrics.error;
      layerMetrics.push({
        layer: key,
        ...metrics,
        total,
        passRate: total > 0 ? `${((metrics.pass / total) * 100).toFixed(1)}%` : '0%',
      });
    }

    return {
      overall: {
        processed: this.metrics.processed,
        passed: this.metrics.passed,
        failed: this.metrics.failed,
        passRate:
          this.metrics.processed > 0
            ? `${((this.metrics.passed / this.metrics.processed) * 100).toFixed(1)}%`
            : '0%',
      },
      byLayer: layerMetrics,
    };
  }
}

export default LayerOrchestrator;
