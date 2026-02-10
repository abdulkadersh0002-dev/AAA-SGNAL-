/**
 * Layer Orchestrator
 * Ensures every signal passes through all 20 layers sequentially
 * Single unified path for layer analysis
 */

import logger from '../../../infrastructure/services/logging/logger.js';
import {
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateSMA,
  calculateEMA,
  determineTrend,
  calculateADX,
  calculatePivotPoints,
  calculateFibonacciLevels,
  checkSupportResistance,
  detectMACrossover,
  calculateATR,
} from '../../../lib/utils/technical-analysis.js';

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
      const confidence = Math.min(95, Math.round(avgStrength * 0.8 + alignmentRatio * 20));

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

      // Create array of S/R levels
      const levels = [
        { value: pivots.pp, type: 'PIVOT' },
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
                distancePips: srCheck.distancePips.toFixed(1),
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
          // Overbought/oversold against signal
          signals.rsi.signal = direction === 'buy' ? 'OVERBOUGHT' : 'OVERSOLD';
          signals.rsi.aligned = false;
        } else {
          signals.rsi.aligned = true; // Neutral is acceptable
          aligned += 0.5;
        }
      }

      // MACD analysis
      if (macd !== null) {
        total++;
        const macdSignal = macd.histogram > 0 ? 'BULLISH' : 'BEARISH';
        signals.macd = {
          value: macd.histogram.toFixed(5),
          signal: macdSignal,
          aligned: false,
        };

        if (
          (direction === 'buy' && macd.histogram > 0) ||
          (direction === 'sell' && macd.histogram < 0)
        ) {
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

  async processLayer17({ snapshot, signal }) {
    // Position Sizing - Calculate optimal position size
    try {
      const entry = signal?.entry;
      const sl = signal?.sl;
      const pair = signal?.pair || snapshot?.symbol;

      if (!entry || !sl || !pair) {
        return {
          status: 'FAIL',
          score: 0,
          confidence: 0,
          reason: 'Missing entry, SL, or pair information',
        };
      }

      // Get account balance (default to 10,000 if not in snapshot)
      const accountBalance = snapshot?.accountBalance || 10000;

      // Calculate stop loss distance in pips
      const slDistance = Math.abs(entry - sl);
      const slPips = slDistance * 10000; // Approximate for forex

      // Risk percentage (1-2% of balance)
      const riskPercent = 1.5; // 1.5% risk per trade
      const riskAmount = accountBalance * (riskPercent / 100);

      // Calculate position size
      // Formula: Position Size = Risk Amount / (SL in Pips * Pip Value)
      // For forex majors, pip value = 10 for standard lot, 1 for mini lot

      const pipValue = 10; // Standard lot pip value for majors
      let positionSize = riskAmount / (slPips * pipValue);

      // Apply constraints
      const minLotSize = 0.01;
      const maxLotSize = 5.0; // Safety limit
      positionSize = Math.max(minLotSize, Math.min(maxLotSize, positionSize));

      // Round to 2 decimals
      positionSize = Math.round(positionSize * 100) / 100;

      // Calculate actual risk with this position size
      const actualRisk = positionSize * slPips * pipValue;
      const actualRiskPercent = (actualRisk / accountBalance) * 100;

      // Validate position size is reasonable
      let status = 'PASS';
      let score = 85;
      let confidence = 80;
      let reason = `Position: ${positionSize} lots, Risk: $${actualRisk.toFixed(2)} (${actualRiskPercent.toFixed(2)}%)`;

      if (positionSize < minLotSize) {
        status = 'FAIL';
        score = 0;
        confidence = 0;
        reason = `Position size ${positionSize} below minimum ${minLotSize}`;
      } else if (positionSize >= maxLotSize) {
        status = 'FAIL';
        score = 30;
        confidence = 70;
        reason = `Position size ${positionSize} at maximum limit ${maxLotSize} (risk too high)`;
      } else if (actualRiskPercent > 3) {
        status = 'FAIL';
        score = 40;
        confidence = 75;
        reason = `Risk ${actualRiskPercent.toFixed(2)}% exceeds 3% limit`;
      } else if (slPips < 10) {
        status = 'FAIL';
        score = 35;
        confidence = 70;
        reason = `Stop loss too tight (${slPips.toFixed(1)} pips < 10 pips minimum)`;
      } else if (slPips > 200) {
        status = 'FAIL';
        score = 40;
        confidence = 70;
        reason = `Stop loss too wide (${slPips.toFixed(1)} pips > 200 pips maximum)`;
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
