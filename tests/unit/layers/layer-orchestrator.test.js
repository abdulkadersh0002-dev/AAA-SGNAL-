/**
 * Layer Orchestrator Unit Tests
 * Tests for the 6 reimplemented layers with production logic
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import LayerOrchestrator from '../../../src/core/engine/layer-orchestrator.js';
import { createBullishSnapshot, createBearishSnapshot } from '../../fixtures/layer-test-data.js';

describe('LayerOrchestrator - Reimplemented Layers', () => {
  let orchestrator;
  let bullishSnapshot;
  let bearishSnapshot;

  beforeEach(() => {
    orchestrator = new LayerOrchestrator({
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    bullishSnapshot = createBullishSnapshot();
    bearishSnapshot = createBearishSnapshot();
  });

  // ============================================================================
  // LAYER 4: TREND DIRECTION TESTS
  // ============================================================================

  describe('Layer 4: Trend Direction', () => {
    it('passes with bullish trend across all timeframes', async () => {
      const result = await orchestrator.processLayer4({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 75, `result.score should be >= 75`);
      assert.ok(result.confidence >= 70, `result.confidence should be >= 70`);
      assert.ok(result.reason.includes('aligned'), `result.reason should contain 'aligned'`);
      assert.ok(
        result.metrics !== undefined && result.metrics !== null,
        `result.metrics should be defined`
      );
      assert.ok(result.metrics.alignedCount >= 2, `result.metrics.alignedCount should be >= 2`);
      assert.equal(result.metrics.totalTimeframes, 3);
    });

    it('passes with bearish trend across all timeframes', async () => {
      const result = await orchestrator.processLayer4({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 75, `result.score should be >= 75`);
      assert.ok(result.confidence >= 70, `result.confidence should be >= 70`);
      assert.ok(result.reason.includes('aligned'), `result.reason should contain 'aligned'`);
      assert.ok(result.metrics.alignedCount >= 2, `result.metrics.alignedCount should be >= 2`);
    });

    it('handles partial alignment (2/3 timeframes)', async () => {
      // Modify H1 to be bearish while others are bullish
      const modifiedSnapshot = { ...bullishSnapshot };
      modifiedSnapshot.bars = { ...bullishSnapshot.bars };
      modifiedSnapshot.bars.H1 = bearishSnapshot.bars.H1;

      const result = await orchestrator.processLayer4({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: modifiedSnapshot,
        signal: bullishSnapshot.signal,
      });

      // Should still pass with lower score
      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 60, `result.score should be >= 60`);
      assert.equal(result.metrics.alignedCount, 2);
    });

    it('handles missing bar data gracefully', async () => {
      const incompleteSnapshot = { ...bullishSnapshot };
      incompleteSnapshot.bars = { ...bullishSnapshot.bars };
      delete incompleteSnapshot.bars.H4;

      const result = await orchestrator.processLayer4({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: incompleteSnapshot,
        signal: bullishSnapshot.signal,
      });

      // Should handle gracefully
      assert.ok(result !== undefined && result !== null, `result should be defined`);
      assert.ok(
        result.status !== undefined && result.status !== null,
        `result.status should be defined`
      );
      assert.ok(
        result.metrics !== undefined && result.metrics !== null,
        `result.metrics should be defined`
      );
    });

    it('calculates alignment ratio correctly', async () => {
      const result = await orchestrator.processLayer4({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.alignmentRatio !== undefined && result.metrics.alignmentRatio !== null,
        `result.metrics.alignmentRatio should be defined`
      );
      assert.ok(result.metrics.alignmentRatio >= 0, `result.metrics.alignmentRatio should be >= 0`);
      assert.ok(result.metrics.alignmentRatio <= 1, `result.metrics.alignmentRatio should be <= 1`);
    });
  });

  // ============================================================================
  // LAYER 5: SUPPORT/RESISTANCE TESTS
  // ============================================================================

  describe('Layer 5: Support/Resistance', () => {
    it('gives high score at support level with BUY signal', async () => {
      const result = await orchestrator.processLayer5({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 75, `result.score should be >= 75`);
      assert.ok(
        result.metrics !== undefined && result.metrics !== null,
        `result.metrics should be defined`
      );
      assert.ok(
        result.metrics.pivots !== undefined && result.metrics.pivots !== null,
        `result.metrics.pivots should be defined`
      );
      assert.ok(
        result.metrics.currentPrice !== undefined && result.metrics.currentPrice !== null,
        `result.metrics.currentPrice should be defined`
      );
    });

    it('gives high score at resistance level with SELL signal', async () => {
      const result = await orchestrator.processLayer5({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 75, `result.score should be >= 75`);
      assert.ok(
        result.metrics.pivots !== undefined && result.metrics.pivots !== null,
        `result.metrics.pivots should be defined`
      );
    });

    it('validates pivot point calculations', async () => {
      const result = await orchestrator.processLayer5({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      const { pivots } = result.metrics;
      assert.ok(pivots !== undefined && pivots !== null, `pivots should be defined`);
      assert.ok(pivots.pp !== undefined && pivots.pp !== null, `pivots.pp should be defined`);
      assert.ok(pivots.r1 > pivots.pp, `pivots.r1 should be > pivots.pp`);
      assert.ok(pivots.r2 > pivots.r1, `pivots.r2 should be > pivots.r1`);
      assert.ok(pivots.s1 < pivots.pp, `pivots.s1 should be < pivots.pp`);
      assert.ok(pivots.s2 < pivots.s1, `pivots.s2 should be < pivots.s1`);
    });

    it('calculates distance in pips correctly', async () => {
      const result = await orchestrator.processLayer5({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      if (result.metrics.nearestLevel) {
        assert.ok(
          result.metrics.nearestLevel.distancePips !== undefined &&
            result.metrics.nearestLevel.distancePips !== null,
          `result.metrics.nearestLevel.distancePips should be defined`
        );
        assert.equal(typeof result.metrics.nearestLevel.distancePips, 'number');
      }
    });

    it('identifies support vs resistance correctly', async () => {
      const result = await orchestrator.processLayer5({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      if (result.metrics.nearestLevel && result.metrics.nearestLevel.type) {
        assert.ok(
          ['SUPPORT', 'RESISTANCE'].includes(result.metrics.nearestLevel.type),
          `['SUPPORT', 'RESISTANCE'] should contain result.metrics.nearestLevel.type`
        );
      }
    });
  });

  // ============================================================================
  // LAYER 6: TECHNICAL INDICATORS TESTS
  // ============================================================================

  describe('Layer 6: Technical Indicators', () => {
    it('passes when all indicators aligned with signal', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 60, `result.score should be >= 60`);
      assert.ok(
        result.metrics.signals !== undefined && result.metrics.signals !== null,
        `result.metrics.signals should be defined`
      );
      assert.ok(result.metrics.consensus >= 60, `result.metrics.consensus should be >= 60`);
    });

    it('validates RSI calculation and signal', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.signals.rsi !== undefined && result.metrics.signals.rsi !== null,
        `result.metrics.signals.rsi should be defined`
      );
      assert.ok(
        result.metrics.signals.rsi.value !== undefined && result.metrics.signals.rsi.value !== null,
        `result.metrics.signals.rsi.value should be defined`
      );
      assert.ok(
        result.metrics.signals.rsi.signal !== undefined &&
          result.metrics.signals.rsi.signal !== null,
        `result.metrics.signals.rsi.signal should be defined`
      );
      assert.ok(
        ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.metrics.signals.rsi.signal),
        `['BULLISH', 'BEARISH', 'NEUTRAL'] should contain result.metrics.signals.rsi.signal`
      );
    });

    it('validates MACD calculation and signal', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.signals.macd !== undefined && result.metrics.signals.macd !== null,
        `result.metrics.signals.macd should be defined`
      );
      assert.ok(
        result.metrics.signals.macd.value !== undefined &&
          result.metrics.signals.macd.value !== null,
        `result.metrics.signals.macd.value should be defined`
      );
      assert.ok(
        result.metrics.signals.macd.signal !== undefined &&
          result.metrics.signals.macd.signal !== null,
        `result.metrics.signals.macd.signal should be defined`
      );
      assert.ok(
        ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.metrics.signals.macd.signal),
        `['BULLISH', 'BEARISH', 'NEUTRAL'] should contain result.metrics.signals.macd.signal`
      );
    });

    it('validates Stochastic calculation and signal', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.signals.stoch !== undefined && result.metrics.signals.stoch !== null,
        `result.metrics.signals.stoch should be defined`
      );
      assert.ok(
        result.metrics.signals.stoch.k !== undefined && result.metrics.signals.stoch.k !== null,
        `result.metrics.signals.stoch.k should be defined`
      );
      assert.ok(
        result.metrics.signals.stoch.d !== undefined && result.metrics.signals.stoch.d !== null,
        `result.metrics.signals.stoch.d should be defined`
      );
      assert.ok(
        result.metrics.signals.stoch.signal !== undefined &&
          result.metrics.signals.stoch.signal !== null,
        `result.metrics.signals.stoch.signal should be defined`
      );
    });

    it('requires 60% consensus threshold', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(result.metrics.consensus >= 0, `result.metrics.consensus should be >= 0`);
      assert.ok(result.metrics.consensus <= 100, `result.metrics.consensus should be <= 100`);

      if (result.status === 'PASS') {
        assert.ok(result.metrics.consensus >= 60, `result.metrics.consensus should be >= 60`);
      }
    });

    it('handles bearish signals correctly', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.metrics.consensus >= 60, `result.metrics.consensus should be >= 60`);
    });
  });

  // ============================================================================
  // LAYER 7: MOVING AVERAGES TESTS
  // ============================================================================

  describe('Layer 7: Moving Averages', () => {
    it('passes with price above MAs for bullish signal', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 65, `result.score should be >= 65`);
      assert.ok(
        result.metrics.mas !== undefined && result.metrics.mas !== null,
        `result.metrics.mas should be defined`
      );
      assert.ok(
        result.metrics.currentPrice !== undefined && result.metrics.currentPrice !== null,
        `result.metrics.currentPrice should be defined`
      );
    });

    it('passes with price below MAs for bearish signal', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 65, `result.score should be >= 65`);
    });

    it('calculates all required MAs', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.mas.sma20 !== undefined && result.metrics.mas.sma20 !== null,
        `result.metrics.mas.sma20 should be defined`
      );
      assert.ok(
        result.metrics.mas.sma50 !== undefined && result.metrics.mas.sma50 !== null,
        `result.metrics.mas.sma50 should be defined`
      );
      assert.ok(
        result.metrics.mas.sma200 !== undefined && result.metrics.mas.sma200 !== null,
        `result.metrics.mas.sma200 should be defined`
      );
      assert.ok(
        result.metrics.mas.ema9 !== undefined && result.metrics.mas.ema9 !== null,
        `result.metrics.mas.ema9 should be defined`
      );
      assert.ok(
        result.metrics.mas.ema21 !== undefined && result.metrics.mas.ema21 !== null,
        `result.metrics.mas.ema21 should be defined`
      );
    });

    it('validates MA alignment detection', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.maAlignment !== undefined && result.metrics.maAlignment !== null,
        `result.metrics.maAlignment should be defined`
      );
      assert.ok(
        ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.metrics.maAlignment),
        `['BULLISH', 'BEARISH', 'NEUTRAL'] should contain result.metrics.maAlignment`
      );
    });

    it('requires 65% alignment threshold', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.alignmentRatio !== undefined && result.metrics.alignmentRatio !== null,
        `result.metrics.alignmentRatio should be defined`
      );
      assert.ok(result.metrics.alignmentRatio >= 0, `result.metrics.alignmentRatio should be >= 0`);
      assert.ok(
        result.metrics.alignmentRatio <= 100,
        `result.metrics.alignmentRatio should be <= 100`
      );

      if (result.status === 'PASS') {
        assert.ok(
          result.metrics.alignmentRatio >= 65,
          `result.metrics.alignmentRatio should be >= 65`
        );
      }
    });
  });

  // ============================================================================
  // LAYER 11: MULTI-TIMEFRAME CONFLUENCE TESTS
  // ============================================================================

  describe('Layer 11: Multi-Timeframe Confluence', () => {
    it('passes with all timeframes aligned', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 75, `result.score should be >= 75`);
      assert.ok(
        result.metrics.confluenceScore >= 75,
        `result.metrics.confluenceScore should be >= 75`
      );
    });

    it('validates weighted scoring (D1 > H4 > H1 > M15)', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.tfAnalysis !== undefined && result.metrics.tfAnalysis !== null,
        `result.metrics.tfAnalysis should be defined`
      );
      assert.equal(result.metrics.tfAnalysis.M15.weight, 1);
      assert.equal(result.metrics.tfAnalysis.H1.weight, 2);
      assert.equal(result.metrics.tfAnalysis.H4.weight, 3);
      assert.equal(result.metrics.tfAnalysis.D1.weight, 4);
    });

    it('requires 75% weighted confluence threshold', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      if (result.status === 'PASS') {
        assert.ok(
          result.metrics.confluenceScore >= 75,
          `result.metrics.confluenceScore should be >= 75`
        );
      } else {
        assert.ok(
          result.metrics.confluenceScore < 75,
          `result.metrics.confluenceScore should be < 75`
        );
      }
    });

    it('analyzes all 4 timeframes', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.ok(
        result.metrics.tfAnalysis.M15 !== undefined && result.metrics.tfAnalysis.M15 !== null,
        `result.metrics.tfAnalysis.M15 should be defined`
      );
      assert.ok(
        result.metrics.tfAnalysis.H1 !== undefined && result.metrics.tfAnalysis.H1 !== null,
        `result.metrics.tfAnalysis.H1 should be defined`
      );
      assert.ok(
        result.metrics.tfAnalysis.H4 !== undefined && result.metrics.tfAnalysis.H4 !== null,
        `result.metrics.tfAnalysis.H4 should be defined`
      );
      assert.ok(
        result.metrics.tfAnalysis.D1 !== undefined && result.metrics.tfAnalysis.D1 !== null,
        `result.metrics.tfAnalysis.D1 should be defined`
      );
    });

    it('handles bearish confluence correctly', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(
        result.metrics.confluenceScore >= 75,
        `result.metrics.confluenceScore should be >= 75`
      );
    });
  });

  // ============================================================================
  // LAYER 17: POSITION SIZING TESTS
  // ============================================================================

  describe('Layer 17: Position Sizing', () => {
    it('calculates position size correctly', async () => {
      const result = await orchestrator.processLayer17({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      assert.equal(result.status, 'PASS');
      assert.ok(
        result.metrics.positionSize !== undefined && result.metrics.positionSize !== null,
        `result.metrics.positionSize should be defined`
      );
      assert.ok(result.metrics.positionSize > 0, `result.metrics.positionSize should be > 0`);
      assert.ok(
        result.metrics.riskAmount !== undefined && result.metrics.riskAmount !== null,
        `result.metrics.riskAmount should be defined`
      );
    });

    it('enforces minimum lot size (0.01)', async () => {
      const smallAccountSnapshot = createBullishSnapshot();
      smallAccountSnapshot.account = { balance: 100 };

      const result = await orchestrator.processLayer17({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: smallAccountSnapshot,
        signal: smallAccountSnapshot.signal,
      });

      assert.ok(
        result.metrics.positionSize >= 0.01,
        `result.metrics.positionSize should be >= 0.01`
      );
    });

    it('enforces maximum lot size (5.0)', async () => {
      const largeAccountSnapshot = createBullishSnapshot();
      largeAccountSnapshot.account = { balance: 1000000 };

      const result = await orchestrator.processLayer17({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: largeAccountSnapshot,
        signal: largeAccountSnapshot.signal,
      });

      assert.ok(result.metrics.positionSize <= 5.0, `result.metrics.positionSize should be <= 5.0`);
    });

    it('validates SL distance (10-200 pips)', async () => {
      const result = await orchestrator.processLayer17({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      const slPips = parseFloat(result.metrics.slPips);
      assert.ok(slPips >= 10, `slPips should be >= 10`);
      assert.ok(slPips <= 200, `slPips should be <= 200`);
    });

    it('limits risk to reasonable percentage', async () => {
      const result = await orchestrator.processLayer17({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      const riskPercent = parseFloat(result.metrics.actualRiskPercent);
      assert.ok(riskPercent > 0, `riskPercent should be > 0`);
      assert.ok(riskPercent <= 3, `riskPercent should be <= 3`);
    });
  });

  // ============================================================================
  // LAYERS 18-20: FINAL VALIDATION / CLEARANCE / METADATA TESTS
  // ============================================================================

  describe('Layers 18-20: Smart Finalization', () => {
    const buildPassingLayerSet = () => [
      { layer: 1, status: 'PASS', score: 82, metrics: {} },
      { layer: 2, status: 'PASS', score: 84, metrics: { spreadPoints: 12 } },
      { layer: 3, status: 'PASS', score: 80, metrics: { volatility: 95 } },
      { layer: 4, status: 'PASS', score: 86, metrics: {} },
      { layer: 5, status: 'PASS', score: 78, metrics: {} },
      { layer: 6, status: 'PASS', score: 82, metrics: {} },
      { layer: 7, status: 'PASS', score: 79, metrics: {} },
      { layer: 10, status: 'PASS', score: 75, metrics: {} },
      { layer: 11, status: 'PASS', score: 88, metrics: { confluenceScore: 88 } },
      { layer: 12, status: 'PASS', score: 95, metrics: {} },
      { layer: 13, status: 'PASS', score: 90, metrics: {} },
      { layer: 14, status: 'PASS', score: 85, metrics: {} },
      { layer: 16, status: 'PASS', score: 84, metrics: { riskRewardRatio: 2.1 } },
      { layer: 17, status: 'PASS', score: 86, metrics: { positionSize: 0.21 } },
    ];

    it('layer 18 passes with adaptive validation on good inputs', async () => {
      const previousLayers = buildPassingLayerSet();
      const result = await orchestrator.processLayer18({ previousLayers });

      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 75, `result.score should be >= 75`);
      assert.ok(result.confidence >= 80, `result.confidence should be >= 80`);
      assert.ok(
        result.metrics.compositeScore !== undefined,
        'result.metrics.compositeScore should be defined'
      );
      assert.ok(
        Array.isArray(result.metrics.supportFailures),
        'result.metrics.supportFailures should be array'
      );
    });

    it('layer 18 fails when a critical layer fails', async () => {
      const previousLayers = buildPassingLayerSet();
      const idx = previousLayers.findIndex((layer) => layer.layer === 11);
      previousLayers[idx] = { ...previousLayers[idx], status: 'FAIL' };

      const result = await orchestrator.processLayer18({ previousLayers });
      assert.equal(result.status, 'FAIL');
      assert.match(result.reason, /Critical layer L11/i);
    });

    it('layer 19 fails when spread is too wide', async () => {
      const previousLayers = buildPassingLayerSet();
      const l18 = await orchestrator.processLayer18({ previousLayers });
      previousLayers.push({ layer: 18, ...l18 });

      const idx = previousLayers.findIndex((layer) => layer.layer === 2);
      previousLayers[idx] = {
        ...previousLayers[idx],
        metrics: { ...(previousLayers[idx].metrics || {}), spreadPoints: 31 },
      };

      const result = await orchestrator.processLayer19({ previousLayers });
      assert.equal(result.status, 'FAIL');
      assert.match(result.reason, /spread too wide/i);
    });

    it('layer 19 passes and returns clearance band on healthy context', async () => {
      const previousLayers = buildPassingLayerSet();
      const l18 = await orchestrator.processLayer18({ previousLayers });
      previousLayers.push({ layer: 18, ...l18 });

      const result = await orchestrator.processLayer19({ previousLayers });
      assert.equal(result.status, 'PASS');
      assert.ok(result.score >= 55, `result.score should be >= 55`);
      assert.ok(
        ['HIGH', 'MEDIUM', 'LOW'].includes(result.metrics.clearanceBand),
        `['HIGH', 'MEDIUM', 'LOW'] should contain result.metrics.clearanceBand`
      );
    });

    it('layer 20 produces smart execution metadata profile', async () => {
      const previousLayers = buildPassingLayerSet();
      const l18 = await orchestrator.processLayer18({ previousLayers });
      previousLayers.push({ layer: 18, ...l18 });
      const l19 = await orchestrator.processLayer19({ previousLayers });
      previousLayers.push({ layer: 19, ...l19 });

      const signal = { direction: 'BUY', confidence: 83, strength: 78 };
      const result = await orchestrator.processLayer20({ signal, previousLayers });

      assert.equal(result.status, 'PASS');
      assert.equal(result.metrics.metadataPrepared, true);
      assert.ok(result.metrics.executionProfile, 'result.metrics.executionProfile should exist');
      assert.ok(
        ['immediate', 'normal', 'patient'].includes(result.metrics.executionProfile.urgency),
        `['immediate', 'normal', 'patient'] should contain result.metrics.executionProfile.urgency`
      );
      assert.ok(
        ['offensive', 'balanced'].includes(result.metrics.executionProfile.riskMode),
        `['offensive', 'balanced'] should contain result.metrics.executionProfile.riskMode`
      );
    });
  });
});
