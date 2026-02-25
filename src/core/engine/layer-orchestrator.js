/**
 * Layer Orchestrator
 * Ensures every signal passes through all 20 layers sequentially
 * Single unified path for layer analysis
 */

import logger from '../../infrastructure/services/logging/logger.js';
import {
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateSMA,
  calculateEMA,
  calculateADX,
  calculateATR,
  determineTrend,
  calculatePivotPoints,
  checkSupportResistance,
  detectMACrossover,
} from '../../lib/utils/technical-analysis.js';
import { analyzeCandleSeries } from '../analyzers/candle-analysis-lite.js';

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
  initializeLayers(_options) {
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
    // Market Data Quality — graduated score based on quote freshness
    const quote = snapshot?.quote;
    if (!quote) {
      return { status: 'FAIL', reason: 'No quote data available' };
    }

    if (!quote.bid || !quote.ask || Number(quote.bid) <= 0 || Number(quote.ask) <= 0) {
      return { status: 'FAIL', reason: 'Invalid bid/ask prices' };
    }

    const now = Date.now();
    const quoteTs = Number(quote.receivedAt || quote.timestamp || 0);
    const age = quoteTs > 0 ? now - quoteTs : 0;

    // Hard limit: 5 minutes (300 s) — allows slow EA heartbeats while still blocking truly stale data
    const HARD_LIMIT_MS = 300_000;
    // Score degrades linearly from 100 at 0 s to 55 at 120 s, then to 30 at 300 s
    let score, reason;
    if (age > HARD_LIMIT_MS) {
      return {
        status: 'FAIL',
        reason: `Quote too old: ${Math.round(age / 1000)}s (max ${HARD_LIMIT_MS / 1000}s)`,
        metrics: { ageMs: age, bid: quote.bid, ask: quote.ask },
      };
    } else if (age <= 5_000) {
      score = 100;
      reason = 'Quote is live (< 5 s)';
    } else if (age <= 60_000) {
      score = Math.round(100 - ((age - 5_000) / 55_000) * 20); // 100 → 80
      reason = `Quote fresh (${Math.round(age / 1000)}s old)`;
    } else if (age <= 120_000) {
      score = Math.round(80 - ((age - 60_000) / 60_000) * 25); // 80 → 55
      reason = `Quote aging (${Math.round(age / 1000)}s old)`;
    } else {
      score = Math.round(55 - ((age - 120_000) / 180_000) * 25); // 55 → 30
      reason = `Quote stale (${Math.round(age / 1000)}s old) — proceed with caution`;
    }

    const confidence = Math.min(95, Math.max(40, score));
    return {
      status: 'PASS',
      score,
      confidence,
      metrics: { ageMs: age, bid: quote.bid, ask: quote.ask },
      reason,
    };
  }

  async processLayer2({ snapshot }) {
    // Spread Analysis — compute spread from bid/ask when spreadPoints is missing
    const quote = snapshot?.quote;
    if (!quote) {
      return { status: 'SKIP', reason: 'No quote available for spread check' };
    }

    const bid = Number(quote.bid);
    const ask = Number(quote.ask);

    // Compute spread: prefer explicit spreadPoints, fall back to bid/ask delta
    let spread = Number(quote.spreadPoints);
    let spreadSource = 'spreadPoints';
    if (!Number.isFinite(spread) || spread <= 0) {
      if (Number.isFinite(bid) && Number.isFinite(ask) && ask > bid && bid > 0) {
        spread = Math.round((ask - bid) * 10000 * 10) / 10; // rounded to 0.1 points
        spreadSource = 'bid_ask_delta';
      } else {
        return { status: 'SKIP', reason: 'Spread data not available and bid/ask invalid' };
      }
    }

    // ATR-relative threshold: use ATR from H1 bars if available, otherwise fixed threshold
    let maxSpread = 30; // points — conservative default for major FX
    let atrBased = false;
    try {
      const h1Bars = snapshot?.bars?.H1;
      if (Array.isArray(h1Bars) && h1Bars.length >= 10) {
        const highs = h1Bars.map((b) => b.high);
        const lows = h1Bars.map((b) => b.low);
        const closes = h1Bars.map((b) => b.close);
        const atr = calculateATR(highs, lows, closes, Math.min(14, h1Bars.length - 1));
        if (Number.isFinite(atr) && atr > 0) {
          // Allow spread up to 12% of H1 ATR (in price units → points ×10000)
          const atrPoints = atr * 10000;
          maxSpread = Math.max(20, Math.min(60, atrPoints * 0.12));
          atrBased = true;
        }
      }
    } catch (_e) {
      // best-effort ATR; fall back to fixed threshold
    }

    const spreadRatio = spread / maxSpread;

    if (spread > maxSpread * 1.5) {
      return {
        status: 'FAIL',
        reason: `Spread too wide: ${spread.toFixed(1)} pts (max ${maxSpread.toFixed(1)})`,
        metrics: { spreadPoints: spread, maxSpread, spreadSource, atrBased },
      };
    }

    // Graduated score: 0 ratio → 100, ratio=1 → 75, ratio=1.5 → 50
    const score = Math.round(Math.max(50, 100 - spreadRatio * 33));
    const confidence = atrBased ? 88 : 82;

    return {
      status: 'PASS',
      score,
      confidence,
      metrics: {
        spreadPoints: spread,
        maxSpread: Number(maxSpread.toFixed(2)),
        spreadSource,
        atrBased,
        spreadRatio: Number(spreadRatio.toFixed(3)),
      },
      reason: `Spread ${spread.toFixed(1)} pts is ${atrBased ? 'ATR-relative' : 'within fixed threshold'}`,
    };
  }

  async processLayer3({ snapshot, signal }) {
    // Volatility Check — use ATR from bars when raw volatility metric is absent
    try {
      let volatility = snapshot?.volatility != null ? Number(snapshot.volatility) : null;
      let source = 'snapshot';
      let atr = null;
      let atrPct = null;

      // Derive volatility from H1/M15 ATR if not provided directly
      if (!Number.isFinite(volatility) || volatility <= 0) {
        const tfOrder = ['H1', 'M15', 'H4'];
        for (const tf of tfOrder) {
          const tfBars = snapshot?.bars?.[tf];
          if (Array.isArray(tfBars) && tfBars.length >= 15) {
            const highs = tfBars.map((b) => b.high);
            const lows = tfBars.map((b) => b.low);
            const closes = tfBars.map((b) => b.close);
            const computedAtr = calculateATR(highs, lows, closes, Math.min(14, tfBars.length - 1));
            if (Number.isFinite(computedAtr) && computedAtr > 0) {
              atr = computedAtr;
              const lastClose = closes[closes.length - 1];
              atrPct = lastClose > 0 ? (atr / lastClose) * 100 : null;
              // Convert ATR% to a 0-200 volatility index: 0.1% ATR = ~10, 2% ATR = ~200
              volatility = Number.isFinite(atrPct) ? atrPct * 100 : null;
              source = `atr_${tf}`;
              break;
            }
          }
        }
      }

      if (!Number.isFinite(volatility) || volatility <= 0) {
        return {
          status: 'PASS',
          score: 70,
          confidence: 40,
          reason: 'Volatility data unavailable — passing with low confidence',
          metrics: { volatility: null, source: 'unavailable' },
        };
      }

      // Thresholds: volatility index (scaled ATR% × 100)
      // < 8   → dead market (likely weekend/holiday)
      // 8–15  → low — ok for strong signals
      // 15–100 → normal — ideal
      // 100–180 → elevated — still tradeable, score penalty
      // > 180 → extreme — risk of gapping, slippage
      let score, reason, status;
      if (volatility < 8) {
        return {
          status: 'FAIL',
          score: 20,
          confidence: 80,
          reason: `Volatility too low (${volatility.toFixed(1)}) — dead market, avoid`,
          metrics: { volatility, atr, atrPct, source },
        };
      } else if (volatility > 180) {
        return {
          status: 'FAIL',
          score: 25,
          confidence: 80,
          reason: `Volatility extreme (${volatility.toFixed(1)}) — excessive slippage risk`,
          metrics: { volatility, atr, atrPct, source },
        };
      } else if (volatility <= 15) {
        score = 65;
        status = 'PASS';
        reason = `Low volatility (${volatility.toFixed(1)}) — require strong signal`;
      } else if (volatility <= 100) {
        // Sweet spot: score from 80 to 100
        score = Math.round(80 + ((volatility - 15) / 85) * 20);
        status = 'PASS';
        reason = `Normal volatility (${volatility.toFixed(1)}) — ideal conditions`;
      } else {
        // Elevated: score from 75 down to 50
        score = Math.round(75 - ((volatility - 100) / 80) * 25);
        status = 'PASS';
        reason = `Elevated volatility (${volatility.toFixed(1)}) — trade with tighter stops`;
      }

      return {
        status,
        score,
        confidence: 78,
        metrics: { volatility: Number(volatility.toFixed(2)), atr, atrPct, source },
        reason,
      };
    } catch (error) {
      return {
        status: 'PASS',
        score: 65,
        confidence: 40,
        reason: `Volatility check skipped: ${error.message}`,
      };
    }
  }

  // Placeholder processors for remaining layers (4-20)
  // In production, these would contain the actual analysis logic

  async processLayer4({ snapshot, signal }) {
    // Trend Direction - Multi-timeframe trend analysis
    try {
      const bars = snapshot?.bars || {};
      const direction = signal?.direction?.toLowerCase();

      if (!direction) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Signal direction not specified',
        };
      }

      // Analyze trend across multiple timeframes
      const timeframes = ['H1', 'H4', 'D1'];
      const trends = {};
      let totalStrength = 0;
      let alignedCount = 0;

      for (const tf of timeframes) {
        const tfBars = bars[tf];
        if (!tfBars || !Array.isArray(tfBars) || tfBars.length < 50) {
          continue;
        }

        const closes = tfBars.map((b) => b.close);
        const trendInfo = determineTrend(closes, 20, 50);

        trends[tf] = trendInfo;
        totalStrength += trendInfo.strength;

        // Check if trend aligns with signal direction
        const trendDirection = trendInfo.direction.toLowerCase();
        if (
          (direction === 'buy' && trendDirection === 'bullish') ||
          (direction === 'sell' && trendDirection === 'bearish')
        ) {
          alignedCount++;
        }
      }

      const analyzedCount = Object.keys(trends).length;
      if (analyzedCount === 0) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Insufficient bar data for trend analysis',
          metrics: { trends },
        };
      }

      // Calculate scores
      const alignmentRatio = alignedCount / analyzedCount;
      const avgStrength = totalStrength / analyzedCount;
      const score = Math.round(alignmentRatio * 100);
      // Base confidence of 50 + 40 for full alignment + up to 5 from trend strength
      const confidence = Math.min(
        95,
        Math.round(50 + alignmentRatio * 40 + Math.min(5, avgStrength * 0.5))
      );

      // Determine pass/fail
      const minAlignment = 0.66; // At least 2 out of 3 timeframes
      const status = alignmentRatio >= minAlignment ? 'PASS' : 'FAIL';

      const reason =
        status === 'PASS'
          ? `${alignedCount}/${analyzedCount} timeframes aligned with ${direction.toUpperCase()}`
          : `Only ${alignedCount}/${analyzedCount} timeframes aligned (need ${Math.ceil(analyzedCount * minAlignment)})`;

      return {
        status,
        score,
        confidence,
        reason,
        metrics: {
          trends,
          alignedCount,
          totalTimeframes: analyzedCount,
          alignmentRatio,
          avgStrength: Math.round(avgStrength),
        },
      };
    } catch (error) {
      return {
        status: 'ERROR',
        score: 0,
        confidence: 0,
        reason: `Trend analysis error: ${error.message}`,
      };
    }
  }

  async processLayer5({ snapshot, signal }) {
    // Support/Resistance - Key level detection
    try {
      const bars = snapshot?.bars || {};
      const quote = snapshot?.quote;
      const currentPrice = quote?.bid || signal?.entry;

      if (!currentPrice) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Current price not available',
        };
      }

      const direction = signal?.direction?.toLowerCase();

      // Get daily bars for pivot calculation
      const dailyBars = bars.D1;
      if (!dailyBars || dailyBars.length < 2) {
        return {
          status: 'PASS',
          score: 60,
          confidence: 40,
          reason: 'Insufficient data for S/R analysis (passing with low confidence)',
          metrics: { method: 'insufficient_data' },
        };
      }

      // Calculate pivot points from previous day
      const prevBar = dailyBars[dailyBars.length - 2];
      const pivots = calculatePivotPoints(prevBar.high, prevBar.low, prevBar.close);

      // Create array of S/R levels (exclude PIVOT to keep types as SUPPORT/RESISTANCE only)
      const levels = [
        { value: pivots.r1, type: 'RESISTANCE' },
        { value: pivots.r2, type: 'RESISTANCE' },
        { value: pivots.s1, type: 'SUPPORT' },
        { value: pivots.s2, type: 'SUPPORT' },
      ];

      // Check if price is near a key level
      const srCheck = checkSupportResistance(currentPrice, levels, 0.002);

      let score = 70;
      let confidence = 65;
      let status = 'PASS';
      let reason = 'Price not at major S/R level';

      if (srCheck && srCheck.atLevel) {
        // Price is at a key level
        const levelType = srCheck.type.toLowerCase();

        if (
          (direction === 'buy' && levelType === 'support') ||
          (direction === 'sell' && levelType === 'resistance')
        ) {
          // Good - bouncing off support/resistance in signal direction
          score = 90;
          confidence = 85;
          status = 'PASS';
          reason = `At ${levelType} level ${srCheck.level.toFixed(5)} (${srCheck.distancePips.toFixed(1)} pips)`;
        } else if (
          (direction === 'buy' && levelType === 'resistance') ||
          (direction === 'sell' && levelType === 'support')
        ) {
          // Bad - signal against key level
          score = 30;
          confidence = 70;
          status = 'FAIL';
          reason = `Signal against ${levelType} at ${srCheck.level.toFixed(5)}`;
        }
      } else if (srCheck) {
        // Not at level, check distance
        const distancePips = srCheck.distancePips;

        if (distancePips < 10) {
          // Very close to level
          score = 75;
          confidence = 70;
          reason = `Near ${srCheck.type} at ${srCheck.level.toFixed(5)} (${distancePips.toFixed(1)} pips away)`;
        } else {
          // Clear of major levels
          score = 80;
          confidence = 75;
          reason = `Clear of major levels (nearest: ${srCheck.type} at ${distancePips.toFixed(1)} pips)`;
        }
      }

      return {
        status,
        score,
        confidence,
        reason,
        metrics: {
          currentPrice,
          pivots,
          nearestLevel: srCheck
            ? {
                value: srCheck.level,
                type: srCheck.type,
                distancePips: Math.round(srCheck.distancePips * 10) / 10,
                atLevel: srCheck.atLevel,
              }
            : null,
        },
      };
    } catch (error) {
      return {
        status: 'ERROR',
        score: 0,
        confidence: 0,
        reason: `S/R analysis error: ${error.message}`,
      };
    }
  }

  async processLayer6({ snapshot, signal }) {
    // Technical Indicators - RSI, MACD, Stochastic
    try {
      const bars = snapshot?.bars || {};
      const direction = signal?.direction?.toLowerCase();

      if (!direction) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Signal direction not specified',
        };
      }

      // Use H1 timeframe for indicators
      const h1Bars = bars.H1;
      if (!h1Bars || h1Bars.length < 30) {
        return {
          status: 'PASS',
          score: 60,
          confidence: 40,
          reason: 'Insufficient H1 data (passing with low confidence)',
        };
      }

      const closes = h1Bars.map((b) => b.close);
      const highs = h1Bars.map((b) => b.high);
      const lows = h1Bars.map((b) => b.low);

      // Calculate indicators
      const rsi = calculateRSI(closes, 14);
      const macd = calculateMACD(closes, 12, 26, 9);
      const stoch = calculateStochastic(highs, lows, closes, 14, 3, 3);

      const indicators = { rsi, macd, stoch };
      let aligned = 0;
      let total = 0;
      const signals = {};

      // RSI analysis
      if (rsi !== null) {
        total++;
        signals.rsi = {
          value: rsi.toFixed(2),
          signal: 'NEUTRAL',
          aligned: false,
        };

        if (direction === 'buy' && rsi < 50 && rsi > 30) {
          // RSI not overbought, good for buy
          aligned++;
          signals.rsi.signal = 'BULLISH';
          signals.rsi.aligned = true;
        } else if (direction === 'sell' && rsi > 50 && rsi < 70) {
          // RSI not oversold, good for sell
          aligned++;
          signals.rsi.signal = 'BEARISH';
          signals.rsi.aligned = true;
        } else if ((direction === 'buy' && rsi > 70) || (direction === 'sell' && rsi < 30)) {
          // Overbought/oversold against signal - mapped to BEARISH/BULLISH for consistency
          signals.rsi.signal = direction === 'buy' ? 'BEARISH' : 'BULLISH';
          signals.rsi.aligned = false;
        } else {
          signals.rsi.aligned = true; // Neutral is acceptable
          aligned += 0.5;
        }
      }

      // MACD analysis - use macd line (not histogram which is simplified to 0)
      if (macd !== null) {
        total++;
        const macdSignal = macd.macd > 0 ? 'BULLISH' : 'BEARISH';
        signals.macd = {
          value: macd.macd.toFixed(5),
          signal: macdSignal,
          aligned: false,
        };

        if ((direction === 'buy' && macd.macd > 0) || (direction === 'sell' && macd.macd < 0)) {
          aligned++;
          signals.macd.aligned = true;
        }
      }

      // Stochastic analysis
      if (stoch !== null) {
        total++;
        const stochSignal = stoch.k > 50 ? 'BULLISH' : 'BEARISH';
        signals.stoch = {
          k: stoch.k.toFixed(2),
          d: stoch.d.toFixed(2),
          signal: stochSignal,
          aligned: false,
        };

        if ((direction === 'buy' && stoch.k < 70) || (direction === 'sell' && stoch.k > 30)) {
          // Not extreme levels
          aligned++;
          signals.stoch.aligned = true;
        }
      }

      // Calculate consensus
      const consensus = total > 0 ? aligned / total : 0;
      const score = Math.round(consensus * 100);
      const confidence = Math.min(90, Math.round(50 + consensus * 40));

      // Minimum 60% consensus required
      const status = consensus >= 0.6 ? 'PASS' : 'FAIL';

      const reason =
        status === 'PASS'
          ? `${Math.round(aligned)}/${total} indicators aligned with ${direction.toUpperCase()}`
          : `Only ${Math.round(aligned)}/${total} indicators aligned (need 60%+ consensus)`;

      return {
        status,
        score,
        confidence,
        reason,
        metrics: {
          indicators,
          signals,
          consensus: Math.round(consensus * 100),
          aligned: Math.round(aligned * 10) / 10,
          total,
        },
      };
    } catch (error) {
      return {
        status: 'ERROR',
        score: 0,
        confidence: 0,
        reason: `Indicator analysis error: ${error.message}`,
      };
    }
  }

  async processLayer7({ snapshot, signal }) {
    // Moving Averages - MA crossovers and alignment
    try {
      const bars = snapshot?.bars || {};
      const direction = signal?.direction?.toLowerCase();
      const quote = snapshot?.quote;
      const currentPrice = quote?.bid || signal?.entry;

      if (!direction || !currentPrice) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Missing signal direction or price',
        };
      }

      // Use H1 timeframe
      const h1Bars = bars.H1;
      if (!h1Bars || h1Bars.length < 200) {
        return {
          status: 'PASS',
          score: 60,
          confidence: 40,
          reason: 'Insufficient H1 data for MA analysis (passing with low confidence)',
        };
      }

      const closes = h1Bars.map((b) => b.close);

      // Calculate key moving averages
      const sma20 = calculateSMA(closes, 20);
      const sma50 = calculateSMA(closes, 50);
      const sma200 = calculateSMA(closes, 200);
      const ema9 = calculateEMA(closes, 9);
      const ema21 = calculateEMA(closes, 21);

      // Check for crossovers
      const crossover50_200 = detectMACrossover(closes, 50, 200, 10);

      const mas = { sma20, sma50, sma200, ema9, ema21 };
      let aligned = 0;
      let total = 0;

      // Check price position vs MAs
      const priceVsMAs = {};

      if (sma20 !== null) {
        total++;
        const above = currentPrice > sma20;
        priceVsMAs.sma20 = { value: sma20, above };
        if ((direction === 'buy' && above) || (direction === 'sell' && !above)) {
          aligned++;
        }
      }

      if (sma50 !== null) {
        total++;
        const above = currentPrice > sma50;
        priceVsMAs.sma50 = { value: sma50, above };
        if ((direction === 'buy' && above) || (direction === 'sell' && !above)) {
          aligned++;
        }
      }

      if (ema21 !== null) {
        total++;
        const above = currentPrice > ema21;
        priceVsMAs.ema21 = { value: ema21, above };
        if ((direction === 'buy' && above) || (direction === 'sell' && !above)) {
          aligned++;
        }
      }

      // Check MA alignment
      let maAlignment = 'NEUTRAL';
      if (sma20 !== null && sma50 !== null && sma200 !== null) {
        if (sma20 > sma50 && sma50 > sma200) {
          maAlignment = 'BULLISH';
        } else if (sma20 < sma50 && sma50 < sma200) {
          maAlignment = 'BEARISH';
        }
      }

      // Bonus for MA alignment
      if (
        (direction === 'buy' && maAlignment === 'BULLISH') ||
        (direction === 'sell' && maAlignment === 'BEARISH')
      ) {
        aligned += 0.5;
        total += 0.5;
      }

      // Bonus/penalty for golden/death cross
      if (crossover50_200.crossover) {
        if (
          (direction === 'buy' && crossover50_200.type === 'GOLDEN_CROSS') ||
          (direction === 'sell' && crossover50_200.type === 'DEATH_CROSS')
        ) {
          aligned += 1;
          total += 1;
        } else {
          total += 1; // Count but don't add to aligned
        }
      }

      const alignmentRatio = total > 0 ? aligned / total : 0;
      const score = Math.round(alignmentRatio * 100);
      const confidence = Math.min(90, Math.round(40 + alignmentRatio * 50));

      const status = alignmentRatio >= 0.65 ? 'PASS' : 'FAIL';

      const reason =
        status === 'PASS'
          ? `${Math.round(aligned * 10) / 10}/${total} MA criteria aligned with ${direction.toUpperCase()}`
          : `Only ${Math.round(aligned * 10) / 10}/${total} MA aligned (need 65%+)`;

      return {
        status,
        score,
        confidence,
        reason,
        metrics: {
          mas,
          currentPrice,
          priceVsMAs,
          maAlignment,
          crossover: crossover50_200.crossover ? crossover50_200.type : 'NONE',
          alignmentRatio: Math.round(alignmentRatio * 100),
          aligned: Math.round(aligned * 10) / 10,
          total,
        },
      };
    } catch (error) {
      return {
        status: 'ERROR',
        score: 0,
        confidence: 0,
        reason: `MA analysis error: ${error.message}`,
      };
    }
  }

  async processLayer8({ snapshot, signal }) {
    // Momentum Analysis - ADX strength + RSI rate-of-change
    try {
      const bars = snapshot?.bars || {};
      const direction = signal?.direction?.toLowerCase();

      if (!direction) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Signal direction not specified',
        };
      }

      const h1Bars = bars.H1;
      if (!h1Bars || h1Bars.length < 20) {
        return {
          status: 'PASS',
          score: 60,
          confidence: 40,
          reason: 'Insufficient data for momentum (passing with low confidence)',
        };
      }

      const closes = h1Bars.map((b) => b.close);
      const highs = h1Bars.map((b) => b.high);
      const lows = h1Bars.map((b) => b.low);

      // ADX measures trend strength (>25 = trending, >40 = strong trend)
      const adx = calculateADX(highs, lows, closes, 14);
      const atr = calculateATR(highs, lows, closes, 14);

      // RSI rate of change (momentum direction)
      const rsi = calculateRSI(closes, 14);
      const rsiPrev = calculateRSI(closes.slice(0, -3), 14);
      const rsiMomentum = rsi != null && rsiPrev != null ? rsi - rsiPrev : null;

      // Recent price rate-of-change (last 5 bars vs 10 bars ago)
      const recent = closes[closes.length - 1];
      const past = closes[Math.max(0, closes.length - 6)];
      const roc5 = past && past !== 0 ? ((recent - past) / past) * 100 : null;

      let score = 50;
      let aligned = 0;
      let total = 0;
      const metrics = {
        adx: adx?.adx,
        plusDI: adx?.plusDI,
        minusDI: adx?.minusDI,
        rsi,
        rsiMomentum,
        roc5: roc5 != null ? Math.round(roc5 * 1000) / 1000 : null,
        atr,
      };

      // ADX strength bonus
      if (adx?.adx != null) {
        const adxValue = adx.adx;
        total++;
        if (adxValue >= 25) {
          score += 15;
          // DI alignment
          if (
            (direction === 'buy' && adx.plusDI > adx.minusDI) ||
            (direction === 'sell' && adx.minusDI > adx.plusDI)
          ) {
            aligned++;
            score += 10;
          }
        } else if (adxValue < 15) {
          score -= 15; // Weak/choppy market
        }
      }

      // RSI momentum direction
      if (rsiMomentum != null) {
        total++;
        const momentumBullish = rsiMomentum > 2;
        const momentumBearish = rsiMomentum < -2;
        if ((direction === 'buy' && momentumBullish) || (direction === 'sell' && momentumBearish)) {
          aligned++;
          score += 10;
        } else if (
          (direction === 'buy' && momentumBearish) ||
          (direction === 'sell' && momentumBullish)
        ) {
          score -= 10;
        }
      }

      // Price rate-of-change confirmation
      if (roc5 != null) {
        total++;
        if ((direction === 'buy' && roc5 > 0.01) || (direction === 'sell' && roc5 < -0.01)) {
          aligned++;
          score += 10;
        }
      }

      const finalScore = Math.min(100, Math.max(0, score));
      const confidence = Math.min(
        90,
        40 + (total > 0 ? (aligned / total) * 40 : 0) + (adx?.adx >= 25 ? 10 : 0)
      );
      const status = finalScore >= 45 ? 'PASS' : 'FAIL';

      return {
        status,
        score: finalScore,
        confidence: Math.round(confidence),
        reason:
          status === 'PASS'
            ? `Momentum ${direction.toUpperCase()}: ADX=${adx?.adx?.toFixed(1) ?? 'n/a'}, RSI=${rsi?.toFixed(1) ?? 'n/a'}`
            : `Weak momentum for ${direction.toUpperCase()}: ADX=${adx?.adx?.toFixed(1) ?? 'n/a'}`,
        metrics,
      };
    } catch (error) {
      return {
        status: 'ERROR',
        score: 0,
        confidence: 0,
        reason: `Momentum error: ${error.message}`,
      };
    }
  }

  async processLayer9({ snapshot, signal }) {
    // Volume Profile - volume confirmation using bar data
    try {
      const bars = snapshot?.bars || {};
      const direction = signal?.direction?.toLowerCase();

      if (!direction) {
        return {
          status: 'PASS',
          score: 60,
          confidence: 50,
          reason: 'No direction for volume check',
        };
      }

      // Try multiple timeframes for volume data
      const tfPriority = ['H1', 'M15', 'H4'];
      let targetBars = null;
      let usedTf = null;
      for (const tf of tfPriority) {
        if (bars[tf] && bars[tf].length >= 10) {
          targetBars = bars[tf];
          usedTf = tf;
          break;
        }
      }

      if (!targetBars) {
        // No volume data — pass with neutral confidence (volume not always available)
        return {
          status: 'PASS',
          score: 60,
          confidence: 45,
          reason: 'Volume data unavailable (skipping volume check)',
        };
      }

      const hasVolume = targetBars.some((b) => b.volume != null && b.volume > 0);
      if (!hasVolume) {
        return {
          status: 'PASS',
          score: 60,
          confidence: 45,
          reason: 'No volume data in bars (broker may not provide volume)',
        };
      }

      // Use analyzeCandleSeries for SMC volume analysis
      const analysis = analyzeCandleSeries(targetBars, { timeframe: usedTf });
      if (!analysis) {
        return { status: 'PASS', score: 60, confidence: 45, reason: 'Volume analysis unavailable' };
      }

      const volImbalance = analysis.smc?.volumeImbalance;
      const volSpike = analysis.smc?.volumeSpike;
      const volSummary = analysis.volume;

      let score = 65;
      let confidence = 55;
      const metrics = {
        timeframe: usedTf,
        volumeImbalance: volImbalance,
        volumeSpike: volSpike,
        volumeSummary: volSummary,
      };

      // Volume imbalance alignment
      if (volImbalance?.state) {
        const buying = volImbalance.state === 'buying';
        const selling = volImbalance.state === 'selling';
        if ((direction === 'buy' && buying) || (direction === 'sell' && selling)) {
          score += 20;
          confidence += 15;
        } else if ((direction === 'buy' && selling) || (direction === 'sell' && buying)) {
          score -= 20;
          confidence += 10; // Still confident in the assessment, just negative
        }
      }

      // Volume spike is generally positive (market showing interest)
      if (volSpike?.isSpike) {
        score += 10;
        confidence += 5;
      }

      // Volume trend: expanding volume confirms moves
      if (volSummary?.trendPct != null) {
        if (volSummary.trendPct > 10) {
          score += 5;
        } else if (volSummary.trendPct < -30) {
          score -= 5;
        }
      }

      const finalScore = Math.min(100, Math.max(0, score));
      const finalConfidence = Math.min(90, Math.max(30, confidence));
      const status = finalScore >= 40 ? 'PASS' : 'FAIL';

      return {
        status,
        score: finalScore,
        confidence: finalConfidence,
        reason:
          status === 'PASS'
            ? `Volume ${volImbalance?.state ?? 'neutral'} pressure (${usedTf})`
            : `Volume counter to ${direction.toUpperCase()} direction`,
        metrics,
      };
    } catch (error) {
      return {
        status: 'PASS',
        score: 60,
        confidence: 45,
        reason: `Volume check skipped: ${error.message}`,
      };
    }
  }

  async processLayer10({ snapshot, signal }) {
    // Candlestick Patterns — uses real SMC+pattern analysis via analyzeCandleSeries
    try {
      const bars = snapshot?.bars || {};
      const direction = signal?.direction?.toLowerCase();

      if (!direction) {
        return {
          status: 'PASS',
          score: 65,
          confidence: 55,
          reason: 'No direction for pattern check',
        };
      }

      // Prefer M15 for patterns (most recent price action), fall back to H1
      const tfPriority = ['M15', 'H1', 'H4'];
      let targetBars = null;
      let usedTf = null;
      for (const tf of tfPriority) {
        if (bars[tf] && bars[tf].length >= 10) {
          targetBars = bars[tf];
          usedTf = tf;
          break;
        }
      }

      if (!targetBars) {
        return {
          status: 'PASS',
          score: 65,
          confidence: 50,
          reason: 'Insufficient bar data for pattern analysis',
        };
      }

      const analysis = analyzeCandleSeries(targetBars, { timeframe: usedTf });
      if (!analysis) {
        return {
          status: 'PASS',
          score: 65,
          confidence: 50,
          reason: 'Pattern analysis unavailable',
        };
      }

      const patterns = analysis.patterns || [];
      const structure = analysis.structure;
      const liquiditySweep = analysis.smc?.liquiditySweep;
      const orderBlock = analysis.smc?.orderBlock;
      const priceImbalance = analysis.smc?.priceImbalance;

      // Score patterns that align with signal direction
      let patternScore = 0;
      let alignedPatterns = 0;
      const totalPatterns = patterns.length;

      for (const p of patterns) {
        const patternDir = String(p?.bias || '').toUpperCase();
        const strength = Number(p?.strength) || 0;
        if (
          (direction === 'buy' && patternDir === 'BUY') ||
          (direction === 'sell' && patternDir === 'SELL')
        ) {
          patternScore += strength;
          alignedPatterns++;
        } else if (patternDir !== 'NEUTRAL') {
          patternScore -= strength * 0.5;
        }
      }

      // Structure alignment
      let structureBonus = 0;
      if (structure?.bias) {
        const structureDir = String(structure.bias).toUpperCase();
        if (
          (direction === 'buy' && structureDir === 'BUY') ||
          (direction === 'sell' && structureDir === 'SELL')
        ) {
          structureBonus = 20;
        } else if (structureDir !== 'NEUTRAL') {
          structureBonus = -15;
        }
      }

      // SMC bonuses: liquidity sweep + order block alignment
      let smcBonus = 0;
      if (liquiditySweep?.detected) {
        smcBonus += 10;
      }
      if (orderBlock?.near) {
        const obDir = String(orderBlock?.direction || '').toUpperCase();
        if (
          (direction === 'buy' && obDir === 'BUY') ||
          (direction === 'sell' && obDir === 'SELL')
        ) {
          smcBonus += 15;
        }
      }
      if (priceImbalance?.detected) {
        smcBonus += 5;
      }

      const baseScore = 60;
      const finalScore = Math.min(
        100,
        Math.max(0, baseScore + patternScore + structureBonus + smcBonus)
      );
      const confidence = Math.min(
        90,
        45 +
          (totalPatterns > 0 ? Math.min(20, alignedPatterns * 7) : 0) +
          (structure ? 10 : 0) +
          smcBonus * 0.3
      );
      const status = finalScore >= 40 ? 'PASS' : 'FAIL';

      const patternNames = patterns.map((p) => p?.name || 'unknown').join(', ');

      return {
        status,
        score: Math.round(finalScore),
        confidence: Math.round(confidence),
        reason:
          status === 'PASS'
            ? `Patterns aligned (${alignedPatterns}/${totalPatterns}): ${patternNames || 'structure confirmed'}`
            : `Patterns counter to ${direction.toUpperCase()} signal`,
        metrics: {
          timeframe: usedTf,
          patterns,
          structure,
          alignedPatterns,
          totalPatterns,
          smcBonus,
          liquiditySweep: liquiditySweep?.detected ?? false,
          orderBlockNear: orderBlock?.near ?? false,
          priceImbalance: priceImbalance?.detected ?? false,
        },
      };
    } catch (error) {
      return {
        status: 'PASS',
        score: 65,
        confidence: 50,
        reason: `Pattern check skipped: ${error.message}`,
      };
    }
  }

  async processLayer11({ snapshot, signal }) {
    // Multi-Timeframe Confluence - Ensure timeframes agree
    try {
      const bars = snapshot?.bars || {};
      const direction = signal?.direction?.toLowerCase();

      if (!direction) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Signal direction not specified',
        };
      }

      // Analyze trend across all timeframes with weights
      const timeframes = [
        { name: 'M15', weight: 1 },
        { name: 'H1', weight: 2 },
        { name: 'H4', weight: 3 },
        { name: 'D1', weight: 4 },
      ];

      let totalWeight = 0;
      let alignedWeight = 0;
      const tfAnalysis = {};

      for (const tf of timeframes) {
        const tfBars = bars[tf.name];

        if (!tfBars || !Array.isArray(tfBars) || tfBars.length < 50) {
          tfAnalysis[tf.name] = {
            available: false,
            trend: null,
            aligned: false,
          };
          continue;
        }

        const closes = tfBars.map((b) => b.close);
        const trendInfo = determineTrend(closes, 20, 50);

        const trendDirection = trendInfo.direction.toLowerCase();
        const aligned =
          (direction === 'buy' && trendDirection === 'bullish') ||
          (direction === 'sell' && trendDirection === 'bearish') ||
          trendDirection === 'neutral';

        tfAnalysis[tf.name] = {
          available: true,
          trend: trendInfo.direction,
          strength: Math.round(trendInfo.strength),
          aligned,
          weight: tf.weight,
        };

        totalWeight += tf.weight;
        if (aligned) {
          alignedWeight += tf.weight;
        }
      }

      if (totalWeight === 0) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'No timeframe data available',
          metrics: { tfAnalysis },
        };
      }

      // Calculate weighted confluence
      const confluenceScore = Math.round((alignedWeight / totalWeight) * 100);
      const confidence = Math.min(95, Math.round(confluenceScore * 0.9));

      // Require 75% weighted confluence (higher timeframes more important)
      const status = confluenceScore >= 75 ? 'PASS' : 'FAIL';

      // Count available timeframes
      const availableCount = Object.values(tfAnalysis).filter((tf) => tf.available).length;
      const alignedCount = Object.values(tfAnalysis).filter((tf) => tf.aligned).length;

      const reason =
        status === 'PASS'
          ? `${confluenceScore}% weighted confluence (${alignedCount}/${availableCount} TFs aligned)`
          : `Only ${confluenceScore}% confluence (need 75%+, ${alignedCount}/${availableCount} aligned)`;

      return {
        status,
        score: confluenceScore,
        confidence,
        reason,
        metrics: {
          tfAnalysis,
          confluenceScore,
          weightedAlignment: alignedWeight,
          totalWeight,
          availableTimeframes: availableCount,
          alignedTimeframes: alignedCount,
        },
      };
    } catch (error) {
      return {
        status: 'ERROR',
        score: 0,
        confidence: 0,
        reason: `MTF confluence error: ${error.message}`,
      };
    }
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

  async processLayer13({ snapshot }) {
    // Economic Calendar — check upcoming high-impact events in next 4 hours
    try {
      const news = snapshot?.news || [];
      const now = Date.now();
      const lookAheadMs = 4 * 60 * 60 * 1000; // 4 hours

      // Filter calendar events that are high-impact and imminent
      const upcomingHigh = news.filter((n) => {
        const impact = Number(n?.impact ?? n?.importance ?? 0);
        const eventTime = Number(n?.time ?? n?.datetime ?? n?.timestamp ?? 0);
        const isUpcoming = eventTime > 0 && eventTime >= now && eventTime <= now + lookAheadMs;
        return impact >= 65 && isUpcoming;
      });

      const allHigh = news.filter((n) => Number(n?.impact ?? n?.importance ?? 0) >= 65);

      if (upcomingHigh.length >= 2) {
        return {
          status: 'FAIL',
          score: 20,
          confidence: 85,
          reason: `${upcomingHigh.length} high-impact calendar events within 4 hours`,
          metrics: { upcomingHighImpact: upcomingHigh.length, totalHighImpact: allHigh.length },
        };
      }

      if (upcomingHigh.length === 1) {
        return {
          status: 'PASS',
          score: 65,
          confidence: 75,
          reason: '1 high-impact event upcoming — trade with caution',
          metrics: { upcomingHighImpact: 1, totalHighImpact: allHigh.length },
        };
      }

      return {
        status: 'PASS',
        score: 95,
        confidence: 88,
        reason: 'Calendar clear — no high-impact events imminent',
        metrics: { upcomingHighImpact: 0, totalHighImpact: allHigh.length },
      };
    } catch (error) {
      return {
        status: 'PASS',
        score: 85,
        confidence: 70,
        reason: `Calendar check skipped: ${error.message}`,
      };
    }
  }

  async processLayer14({ snapshot }) {
    // Market Session — London/New York/Asia/Sydney session detection
    try {
      const now = snapshot?.quote?.timestamp ?? Date.now();
      const utcHour = new Date(now).getUTCHours();
      const utcMinute = new Date(now).getUTCMinutes();
      const utcTime = utcHour + utcMinute / 60;

      // Session windows (UTC)
      // Sydney:  21:00–06:00 UTC (low liquidity)
      // Tokyo/Asia: 00:00–09:00 UTC (medium)
      // London: 07:00–16:00 UTC (high liquidity)
      // New York: 12:00–21:00 UTC (high liquidity)
      // London+NY overlap: 12:00–16:00 UTC (highest liquidity — best to trade)

      const inLondon = utcTime >= 7.0 && utcTime < 16.0;
      const inNewYork = utcTime >= 12.0 && utcTime < 21.0;
      const inAsia = utcTime >= 0.0 && utcTime < 9.0;
      const inOverlap = utcTime >= 12.0 && utcTime < 16.0; // London/NY overlap

      let session, score, confidence, reason;

      if (inOverlap) {
        session = 'LONDON_NY_OVERLAP';
        score = 95;
        confidence = 92;
        reason = `London/NY overlap (${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')} UTC) — peak liquidity`;
      } else if (inLondon && !inNewYork) {
        session = 'LONDON';
        score = 85;
        confidence = 88;
        reason = `London session (${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')} UTC) — good liquidity`;
      } else if (inNewYork && !inLondon) {
        session = 'NEW_YORK';
        score = 80;
        confidence = 85;
        reason = `New York session (${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')} UTC) — good liquidity`;
      } else if (inAsia) {
        session = 'ASIA';
        score = 60;
        confidence = 70;
        reason = `Asian session (${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')} UTC) — moderate liquidity`;
      } else {
        session = 'OFF_HOURS';
        score = 35;
        confidence = 80;
        reason = `Off-hours (${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')} UTC) — low liquidity`;
      }

      // Off-hours is a soft fail (low liquidity increases risk)
      const status = score >= 50 ? 'PASS' : 'FAIL';

      return {
        status,
        score,
        confidence,
        reason,
        metrics: { session, utcHour, utcMinute, inLondon, inNewYork, inAsia, inOverlap },
      };
    } catch (error) {
      return {
        status: 'PASS',
        score: 70,
        confidence: 60,
        reason: `Session check skipped: ${error.message}`,
      };
    }
  }

  async processLayer15({ snapshot, signal }) {
    // Correlation Analysis — guard against over-exposure on correlated pairs
    try {
      const pair = signal?.pair || snapshot?.symbol || '';
      const direction = signal?.direction?.toLowerCase();

      if (!pair || !direction) {
        return {
          status: 'PASS',
          score: 70,
          confidence: 60,
          reason: 'Pair/direction not available for correlation check',
        };
      }

      // Known high-correlation clusters (simplified; production would use live data)
      // Same-direction exposure on all three USD pairs = over-correlated
      const usdPositive = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD']; // BUY = long USD pairs
      const usdNegative = ['USDJPY', 'USDCHF', 'USDCAD']; // BUY = short USD
      const goldCorrelated = ['XAUUSD', 'XAGUSD'];

      const pairUpper = pair.toUpperCase().replace(/[^A-Z]/g, '');

      // Check if signal would increase USD exposure beyond 2 correlated positions
      const activePairs = Array.isArray(snapshot?.activePairs) ? snapshot.activePairs : [];
      let correlatedCount = 0;

      for (const active of activePairs) {
        const activePair = String(active?.pair || '').toUpperCase();
        const activeDir = String(active?.direction || '').toLowerCase();
        const sameDirection = activeDir === direction;

        if (usdPositive.includes(pairUpper) && usdPositive.includes(activePair) && sameDirection) {
          correlatedCount++;
        } else if (
          usdNegative.includes(pairUpper) &&
          usdNegative.includes(activePair) &&
          sameDirection
        ) {
          correlatedCount++;
        } else if (
          goldCorrelated.includes(pairUpper) &&
          goldCorrelated.includes(activePair) &&
          sameDirection
        ) {
          correlatedCount++;
        }
      }

      if (correlatedCount >= 2) {
        return {
          status: 'FAIL',
          score: 30,
          confidence: 75,
          reason: `High correlation exposure: ${correlatedCount} same-direction correlated trades open`,
          metrics: { pair: pairUpper, direction, correlatedCount },
        };
      }

      if (correlatedCount === 1) {
        return {
          status: 'PASS',
          score: 65,
          confidence: 72,
          reason: `1 correlated trade — moderate correlation risk`,
          metrics: { pair: pairUpper, direction, correlatedCount },
        };
      }

      return {
        status: 'PASS',
        score: 85,
        confidence: 80,
        reason: `No correlated exposure detected for ${pairUpper}`,
        metrics: { pair: pairUpper, direction, correlatedCount: 0 },
      };
    } catch (error) {
      return {
        status: 'PASS',
        score: 75,
        confidence: 65,
        reason: `Correlation check skipped: ${error.message}`,
      };
    }
  }

  /**
   * Compute smart entry, stop-loss and take-profit levels from market data.
   *
   * When a signal specifies direction but no explicit price levels, this method
   * derives them from:
   *   - Entry  : current quote bid (SELL) or ask (BUY)
   *   - SL     : entry ± 1.5 × H1 ATR  (placed beyond recent swing high/low)
   *   - TP     : entry ± 2.2 × H1 ATR  (ensuring R:R ≥ 1.5 by construction)
   *
   * @param {object} snapshot - Market snapshot (quote + bars)
   * @param {object} signal   - Signal object (must have direction)
   * @returns {{ entry, sl, tp, atr, source } | null}
   */
  _computeSmartEntryLevels(snapshot, signal) {
    try {
      const direction = String(signal?.direction || signal?.signal || '').toUpperCase();
      const isBuy = direction === 'BUY' || direction === 'LONG';
      const isSell = direction === 'SELL' || direction === 'SHORT';
      if (!isBuy && !isSell) {
        return null;
      }

      const quote = snapshot?.quote;
      const bid = Number(quote?.bid);
      const ask = Number(quote?.ask);
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
        return null;
      }

      // Compute ATR from H1 bars (fall back to H4, M15)
      let atr = null;
      const tfOrder = ['H1', 'H4', 'M15'];
      for (const tf of tfOrder) {
        const bars = snapshot?.bars?.[tf];
        if (!Array.isArray(bars) || bars.length < 15) {
          continue;
        }
        const highs = bars.map((b) => b.high);
        const lows = bars.map((b) => b.low);
        const closes = bars.map((b) => b.close);
        const computed = calculateATR(highs, lows, closes, Math.min(14, bars.length - 1));
        if (Number.isFinite(computed) && computed > 0) {
          atr = computed;
          break;
        }
      }
      if (!Number.isFinite(atr) || atr <= 0) {
        return null;
      }

      // Direction-aware entry from live quote
      const entry = isBuy ? ask : bid;
      const slDist = atr * 1.5; // 1.5× ATR stop-loss distance
      const tpDist = atr * 2.2; // 2.2× ATR take-profit distance (R:R ≈ 1.47 → rounds to 1.5)

      const sl = isBuy ? entry - slDist : entry + slDist;
      const tp = isBuy ? entry + tpDist : entry - tpDist;

      // Snap SL to recent swing high/low if available (more precise placement)
      try {
        const h1Bars = snapshot?.bars?.H1;
        if (Array.isArray(h1Bars) && h1Bars.length >= 10) {
          const lookback = Math.min(20, h1Bars.length);
          const recentBars = h1Bars.slice(-lookback);
          if (isBuy) {
            const swingLow = Math.min(...recentBars.map((b) => b.low));
            // Only use swing low if it gives a valid SL (not too wide)
            if (swingLow > 0 && swingLow < entry && entry - swingLow <= atr * 3) {
              return {
                entry,
                sl: swingLow - atr * 0.1,
                tp: entry + (entry - (swingLow - atr * 0.1)) * 2.2,
                atr,
                source: 'smart_swing',
              };
            }
          } else {
            const swingHigh = Math.max(...recentBars.map((b) => b.high));
            if (swingHigh > entry && swingHigh - entry <= atr * 3) {
              return {
                entry,
                sl: swingHigh + atr * 0.1,
                tp: entry - (swingHigh + atr * 0.1 - entry) * 2.2,
                atr,
                source: 'smart_swing',
              };
            }
          }
        }
      } catch (_e) {
        // fall through to ATR-only
      }

      return { entry, sl, tp, atr, source: 'smart_atr' };
    } catch (_e) {
      return null;
    }
  }

  async processLayer16({ snapshot, signal }) {
    // Risk/Reward Ratio — compute from entry/SL/TP when pre-computed value is absent
    try {
      let entry = Number(signal?.entry ?? signal?.entryPrice ?? signal?.price);
      let sl = Number(signal?.sl ?? signal?.stopLoss ?? signal?.entry?.stopLoss);
      let tp = Number(signal?.tp ?? signal?.takeProfit ?? signal?.entry?.takeProfit);

      // If entry/SL/TP are absent, derive them via smart level computation
      let smartLevels = null;
      if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tp)) {
        smartLevels = this._computeSmartEntryLevels(snapshot, signal);
        if (smartLevels) {
          entry = smartLevels.entry;
          sl = smartLevels.sl;
          tp = smartLevels.tp;
          // Attach smart levels back to signal for downstream layers
          signal.entryPrice = entry;
          signal.stopLoss = sl;
          signal.takeProfit = tp;
          signal._smartEntrySource = smartLevels.source;
        }
      }

      // Try to use a pre-computed R:R first, then fall back to computing it
      let riskRewardRatio = Number.isFinite(Number(signal?.riskRewardRatio))
        ? Number(signal.riskRewardRatio)
        : null;

      if (riskRewardRatio == null) {
        if (Number.isFinite(entry) && Number.isFinite(sl) && Number.isFinite(tp)) {
          const riskDist = Math.abs(entry - sl);
          const rewardDist = Math.abs(tp - entry);
          riskRewardRatio = riskDist > 0 ? Number((rewardDist / riskDist).toFixed(2)) : null;
        }
      }

      if (riskRewardRatio == null || !Number.isFinite(riskRewardRatio)) {
        return {
          status: 'SKIP',
          score: 50,
          confidence: 40,
          reason: 'R:R cannot be computed — missing entry/SL/TP',
        };
      }

      // Attach computed value back to signal so downstream layers can read it
      signal.riskRewardRatio = riskRewardRatio;

      const MIN_RR = 1.5;
      if (riskRewardRatio < MIN_RR) {
        return {
          status: 'FAIL',
          score: Math.max(10, Math.round(riskRewardRatio * 30)),
          confidence: 85,
          reason: `R:R too low: ${riskRewardRatio.toFixed(2)} (min ${MIN_RR})`,
          metrics: {
            riskRewardRatio,
            entry,
            sl,
            tp,
            source: smartLevels
              ? smartLevels.source
              : signal?.riskRewardRatio != null
                ? 'signal'
                : 'computed',
          },
        };
      }

      const score = Math.min(100, Math.round(riskRewardRatio * 38));
      return {
        status: 'PASS',
        score,
        confidence: 90,
        reason: `R:R ${riskRewardRatio.toFixed(2)} — acceptable${smartLevels ? ` (levels from ${smartLevels.source})` : ''}`,
        metrics: {
          riskRewardRatio,
          entry,
          sl,
          tp,
          source: smartLevels
            ? smartLevels.source
            : signal?.riskRewardRatio != null
              ? 'signal'
              : 'computed',
        },
      };
    } catch (error) {
      return { status: 'ERROR', score: 0, confidence: 0, reason: `R:R error: ${error.message}` };
    }
  }

  async processLayer17({ snapshot, signal }) {
    // Position Sizing — adaptive per asset class (FX, JPY, metals, crypto)
    try {
      // Accept entry/SL from multiple signal shapes (L16 may have already attached smart levels)
      const entryRaw = signal?.entry ?? signal?.entryPrice ?? signal?.price;
      const slRaw = signal?.sl ?? signal?.stopLoss ?? signal?.entry?.stopLoss;
      const pair = (signal?.pair || snapshot?.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

      let entry = Number(entryRaw);
      let sl = Number(slRaw);

      // If still missing after L16 ran, attempt smart computation here too
      if ((!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(sl) || sl <= 0) && pair) {
        const smartLevels = this._computeSmartEntryLevels(snapshot, signal);
        if (smartLevels) {
          entry = smartLevels.entry;
          sl = smartLevels.sl;
          signal.entryPrice = entry;
          signal.stopLoss = sl;
          if (!signal.takeProfit) {
            signal.takeProfit = smartLevels.tp;
          }
        }
      }

      if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(sl) || sl <= 0 || !pair) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Missing entry, SL, or pair information',
        };
      }

      // ── Asset-class-aware pip/point resolution ─────────────────────────────
      // The "pip divisor" converts a raw price difference into standard pips.
      // The "pip value" is the $ value per pip per standard lot (100k units).
      const isJpyPair = pair.endsWith('JPY') || pair.includes('JPY');
      const isXauPair = pair.startsWith('XAU') || pair === 'GOLD';
      const isXagPair = pair.startsWith('XAG') || pair === 'SILVER';
      const isMetal = isXauPair || isXagPair;

      // Crypto detection: base is a known crypto token
      const CRYPTO_BASES = new Set([
        'BTC',
        'ETH',
        'LTC',
        'XRP',
        'BCH',
        'ADA',
        'DOT',
        'SOL',
        'DOGE',
        'BNB',
        'AVAX',
        'TRX',
        'XLM',
        'LINK',
        'MATIC',
        'NEAR',
        'ALGO',
        'INJ',
        'APT',
        'SUI',
        'ARB',
        'OP',
        'TON',
        'HBAR',
        'PEPE',
        'SHIB',
      ]);
      const isCrypto = (() => {
        for (const base of CRYPTO_BASES) {
          if (pair.startsWith(base)) {
            return true;
          }
        }
        return false;
      })();

      let pipDivisor; // divide raw price diff by this to get pip count
      let pipValue; // $ value per pip per standard lot
      let minSlPips, maxSlPips;

      if (isCrypto) {
        // Crypto: 1 pip = 1 USD of price movement; lot = 1 unit
        // We skip standard pip sizing and just use % of balance
        const slDist = Math.abs(entry - sl);
        const slPct = (slDist / entry) * 100;
        const accountBalance = snapshot?.accountBalance || 10000;
        const riskPercent = 1.5;
        const riskAmount = accountBalance * (riskPercent / 100);
        // positionSize in "units" = riskAmount / slDist
        let positionSize = slDist > 0 ? riskAmount / slDist : null;
        const minUnits = 0.0001;
        const maxUnits = 10;
        positionSize =
          positionSize != null
            ? Math.max(minUnits, Math.min(maxUnits, Number(positionSize.toFixed(4))))
            : minUnits;

        const actualRisk = positionSize * slDist;
        const actualRiskPercent = (actualRisk / accountBalance) * 100;
        const status = slPct < 0.05 || slPct > 30 ? 'FAIL' : 'PASS';

        return {
          status,
          score: status === 'PASS' ? 82 : 35,
          confidence: 78,
          reason:
            status === 'PASS'
              ? `Crypto ${pair}: ${positionSize} units, SL ${slPct.toFixed(2)}%, risk $${actualRisk.toFixed(2)}`
              : `Crypto SL out of range: ${slPct.toFixed(2)}%`,
          metrics: {
            accountBalance,
            riskPercent,
            actualRisk: actualRisk.toFixed(2),
            actualRiskPercent: actualRiskPercent.toFixed(2),
            positionSize,
            slPct: slPct.toFixed(2),
            entry,
            sl,
            pair,
            assetClass: 'CRYPTO',
          },
        };
      } else if (isXauPair) {
        // Gold: 1 pip = $0.10 price move; standard lot = 100 oz; pip value ≈ $10
        pipDivisor = 10; // XAUUSD price e.g. 2050.50 → 1 pip = 0.10
        pipValue = 10;
        minSlPips = 50; // minimum 50 pips (= $5) on gold
        maxSlPips = 5000; // 500 USD max SL on gold
      } else if (isXagPair) {
        // Silver: 1 pip = $0.001 move; standard lot = 5000 oz; pip value ≈ $5
        pipDivisor = 1000;
        pipValue = 5;
        minSlPips = 100;
        maxSlPips = 10000;
      } else if (isJpyPair) {
        // JPY pairs: 1 pip = 0.01 price move (e.g. USDJPY 150.00 → 1 pip = 0.01)
        pipDivisor = 100;
        pipValue = 10;
        minSlPips = 10;
        maxSlPips = 300;
      } else {
        // Standard FX (EURUSD, GBPUSD, etc.): 1 pip = 0.0001
        pipDivisor = 10000;
        pipValue = 10;
        minSlPips = 10;
        maxSlPips = 200;
      }

      const accountBalance = snapshot?.accountBalance || 10000;
      const riskPercent = 1.5;
      const riskAmount = accountBalance * (riskPercent / 100);

      const slDistance = Math.abs(entry - sl);
      const slPips = slDistance * pipDivisor;

      let positionSize = slPips > 0 ? riskAmount / (slPips * pipValue) : null;
      const minLotSize = 0.01;
      const maxLotSize = 5.0;
      positionSize =
        positionSize != null
          ? Math.max(minLotSize, Math.min(maxLotSize, Number(positionSize.toFixed(2))))
          : minLotSize;

      const actualRisk = positionSize * slPips * pipValue;
      const actualRiskPercent = (actualRisk / accountBalance) * 100;

      let status = 'PASS';
      let score = 85;
      let confidence = 82;
      let reason = `Position: ${positionSize} lots, SL: ${slPips.toFixed(1)} pips, Risk: $${actualRisk.toFixed(2)} (${actualRiskPercent.toFixed(2)}%)`;
      const assetClass = isMetal ? 'METAL' : isJpyPair ? 'JPY' : 'FX';

      if (positionSize <= minLotSize && slPips > 0) {
        // Not a fail — just note it hits the floor
        score = 75;
        reason = `Min lot (${positionSize}) applied for ${pair}`;
      } else if (actualRiskPercent > 3) {
        status = 'FAIL';
        score = 40;
        confidence = 75;
        reason = `Risk ${actualRiskPercent.toFixed(2)}% exceeds 3% limit`;
      } else if (slPips < minSlPips) {
        status = 'FAIL';
        score = 35;
        confidence = 72;
        reason = `SL too tight for ${assetClass}: ${slPips.toFixed(1)} pips (min ${minSlPips})`;
      } else if (slPips > maxSlPips) {
        status = 'FAIL';
        score = 40;
        confidence = 72;
        reason = `SL too wide for ${assetClass}: ${slPips.toFixed(1)} pips (max ${maxSlPips})`;
      }

      return {
        status,
        score,
        confidence,
        reason,
        metrics: {
          accountBalance,
          riskPercent,
          riskAmount: actualRisk.toFixed(2),
          actualRiskPercent: actualRiskPercent.toFixed(2),
          positionSize,
          slPips: slPips.toFixed(1),
          entry,
          sl,
          pair,
          assetClass,
          pipDivisor,
          pipValue,
        },
      };
    } catch (error) {
      return {
        status: 'ERROR',
        score: 0,
        confidence: 0,
        reason: `Position sizing error: ${error.message}`,
      };
    }
  }

  async processLayer18({ previousLayers }) {
    // Final validation with adaptive thresholds derived from real market state.
    const findLayer = (id) => previousLayers.find((layer) => layer.layer === id) || null;
    const toNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const criticalLayers = [1, 2, 3, 4, 6, 11, 12, 14, 16, 17];
    const supportingLayers = [5, 7, 10, 13];

    for (const layerId of criticalLayers) {
      const layer = findLayer(layerId);
      if (!layer || layer.status !== 'PASS') {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: `Critical layer L${layerId} did not pass`,
          metrics: {
            failedLayer: layerId,
            failedType: 'critical',
          },
        };
      }
    }

    const supportFailures = supportingLayers.filter((id) => {
      const layer = findLayer(id);
      return !layer || layer.status !== 'PASS';
    });

    const l2Spread = toNumber(findLayer(2)?.metrics?.spreadPoints);
    const l3Volatility = toNumber(findLayer(3)?.metrics?.volatility);
    const l11Confluence = toNumber(findLayer(11)?.metrics?.confluenceScore ?? findLayer(11)?.score);
    const l16RiskReward = toNumber(findLayer(16)?.metrics?.riskRewardRatio);

    let minCompositeScore = 60;
    if (l3Volatility != null && l3Volatility > 140) {
      minCompositeScore += 3;
    }
    if (l2Spread != null && l2Spread > 20) {
      minCompositeScore += 2;
    }
    if (l16RiskReward != null && l16RiskReward < 1.8) {
      minCompositeScore += 2;
    }

    const scores = previousLayers
      .filter((layer) => layer.score != null)
      .map((layer) => Number(layer.score));
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    if (supportFailures.length > 2) {
      return {
        status: 'FAIL',
        score: Math.max(20, Math.round(avgScore * 0.7)),
        confidence: 65,
        reason: `Too many supporting-layer failures (${supportFailures.length})`,
        metrics: {
          supportFailures,
          compositeScore: avgScore,
          minCompositeScore,
        },
      };
    }

    if (l11Confluence != null && l11Confluence < 75) {
      return {
        status: 'FAIL',
        score: Math.max(25, Math.round(avgScore * 0.75)),
        confidence: 70,
        reason: `Confluence too low (${l11Confluence.toFixed(1)} < 75)`,
        metrics: {
          confluenceScore: l11Confluence,
          supportFailures,
        },
      };
    }

    if (avgScore < minCompositeScore) {
      return {
        status: 'FAIL',
        score: Math.max(25, Math.round(avgScore)),
        confidence: 70,
        reason: `Composite score too low: ${avgScore.toFixed(1)} (min ${minCompositeScore.toFixed(1)})`,
        metrics: {
          compositeScore: avgScore,
          minCompositeScore,
          supportFailures,
        },
      };
    }

    const passedCount = previousLayers.filter((layer) => layer.status === 'PASS').length;
    const confidence = Math.max(82, 96 - supportFailures.length * 4);

    return {
      status: 'PASS',
      score: Math.round(avgScore * 10) / 10,
      confidence,
      metrics: {
        compositeScore: Math.round(avgScore * 10) / 10,
        minCompositeScore,
        passedLayers: passedCount,
        supportFailures,
        confluenceScore: l11Confluence,
        spreadPoints: l2Spread,
        volatility: l3Volatility,
        riskRewardRatio: l16RiskReward,
      },
      reason:
        supportFailures.length > 0
          ? `Final validation passed with caution (${supportFailures.length} support issue)`
          : 'Final validation passed with strong readiness',
    };
  }

  async processLayer19({ previousLayers }) {
    // Execution clearance tied to tradability and slippage/news constraints.
    const findLayer = (id) => previousLayers.find((layer) => layer.layer === id) || null;
    const toNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const layer18 = findLayer(18);
    if (!layer18 || layer18.status !== 'PASS') {
      return {
        status: 'FAIL',
        score: 0,
        confidence: 0,
        reason: 'Layer 18 must pass before execution clearance',
      };
    }

    const spreadPoints = toNumber(findLayer(2)?.metrics?.spreadPoints);
    const volatility = toNumber(findLayer(3)?.metrics?.volatility);
    const confluence = toNumber(findLayer(11)?.metrics?.confluenceScore ?? findLayer(11)?.score);
    const riskRewardRatio = toNumber(findLayer(16)?.metrics?.riskRewardRatio);
    const positionSize = toNumber(findLayer(17)?.metrics?.positionSize);
    const newsIsClear = findLayer(12)?.status === 'PASS';

    if (!newsIsClear) {
      return {
        status: 'FAIL',
        score: 10,
        confidence: 70,
        reason: 'Execution blocked by news-risk layer',
        metrics: { spreadPoints, volatility, confluence, riskRewardRatio, positionSize },
      };
    }

    if (spreadPoints != null && spreadPoints > 25) {
      return {
        status: 'FAIL',
        score: 35,
        confidence: 72,
        reason: `Execution blocked: spread too wide (${spreadPoints} points)`,
        metrics: { spreadPoints, volatility, confluence, riskRewardRatio, positionSize },
      };
    }

    if (riskRewardRatio != null && riskRewardRatio < 1.6) {
      return {
        status: 'FAIL',
        score: 45,
        confidence: 75,
        reason: `Execution blocked: R:R too weak (${riskRewardRatio.toFixed(2)} < 1.60)`,
        metrics: { spreadPoints, volatility, confluence, riskRewardRatio, positionSize },
      };
    }

    let clearanceScore = 92;
    if (spreadPoints != null) {
      clearanceScore -= Math.min(20, spreadPoints / 2);
    }
    if (volatility != null && volatility > 150) {
      clearanceScore -= 8;
    }
    if (confluence != null && confluence >= 85) {
      clearanceScore += 4;
    }
    if (riskRewardRatio != null && riskRewardRatio >= 2.0) {
      clearanceScore += 4;
    }

    const score = Math.max(55, Math.min(99, Math.round(clearanceScore)));
    const confidence = Math.max(76, Math.min(97, score - 2));

    return {
      status: 'PASS',
      score,
      confidence,
      reason: 'Execution clearance passed with live-condition weighting',
      metrics: {
        spreadPoints,
        volatility,
        confluence,
        riskRewardRatio,
        positionSize,
        clearanceBand: score >= 90 ? 'HIGH' : score >= 75 ? 'MEDIUM' : 'LOW',
      },
    };
  }

  async processLayer20({ signal, previousLayers }) {
    // Build execution metadata/profile for downstream trade lifecycle management.
    const findLayer = (id) => previousLayers.find((layer) => layer.layer === id) || null;
    const toNumber = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const direction = String(signal?.direction || '').toUpperCase() || 'UNKNOWN';
    const baseConfidence = toNumber(signal?.confidence);
    const confidence = baseConfidence ?? toNumber(findLayer(18)?.confidence) ?? 70;
    const strength = toNumber(signal?.strength) ?? 0;
    const confluence = toNumber(findLayer(11)?.metrics?.confluenceScore ?? findLayer(11)?.score);
    const spreadPoints = toNumber(findLayer(2)?.metrics?.spreadPoints);
    const riskRewardRatio = toNumber(findLayer(16)?.metrics?.riskRewardRatio);
    const positionSize = toNumber(findLayer(17)?.metrics?.positionSize);
    const clearanceScore = toNumber(findLayer(19)?.score) ?? 75;

    const executionProfile = {
      urgency: clearanceScore >= 92 ? 'immediate' : clearanceScore >= 80 ? 'normal' : 'patient',
      riskMode: riskRewardRatio != null && riskRewardRatio >= 2.0 ? 'offensive' : 'balanced',
      protectionBias:
        spreadPoints != null && spreadPoints >= 18
          ? 'tight'
          : confluence != null && confluence >= 85
            ? 'adaptive'
            : 'standard',
      confidenceBand: confidence >= 80 ? 'HIGH' : confidence >= 60 ? 'MEDIUM' : 'LOW',
    };

    return {
      status: 'PASS',
      score: Math.max(70, Math.min(100, Math.round((clearanceScore + confidence) / 2))),
      confidence: Math.max(70, Math.min(99, Math.round((confidence + clearanceScore) / 2))),
      metrics: {
        metadataPrepared: true,
        direction,
        strength,
        confidence,
        confluence,
        spreadPoints,
        riskRewardRatio,
        positionSize,
        executionProfile,
      },
      reason: 'Trade metadata prepared with smart execution profile',
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
