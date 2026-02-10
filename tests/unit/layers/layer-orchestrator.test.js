/**
 * Layer Orchestrator Unit Tests
 * Tests for the 6 reimplemented layers with production logic
 */

import { describe, it, beforeEach, expect } from 'vitest';
import LayerOrchestrator from '../../../src/core/engine/layer-orchestrator.js';
import {
  createBullishSnapshot,
  createBearishSnapshot,
} from '../../fixtures/layer-test-data.js';

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

      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.reason).toContain('aligned');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.alignedCount).toBeGreaterThanOrEqual(2);
      expect(result.metrics.totalTimeframes).toBe(3);
    });

    it('passes with bearish trend across all timeframes', async () => {
      const result = await orchestrator.processLayer4({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.reason).toContain('aligned');
      expect(result.metrics.alignedCount).toBeGreaterThanOrEqual(2);
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
      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.metrics.alignedCount).toBe(2);
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
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('calculates alignment ratio correctly', async () => {
      const result = await orchestrator.processLayer4({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.alignmentRatio).toBeDefined();
      expect(result.metrics.alignmentRatio).toBeGreaterThanOrEqual(0);
      expect(result.metrics.alignmentRatio).toBeLessThanOrEqual(1);
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

      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.pivots).toBeDefined();
      expect(result.metrics.currentPrice).toBeDefined();
    });

    it('gives high score at resistance level with SELL signal', async () => {
      const result = await orchestrator.processLayer5({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.metrics.pivots).toBeDefined();
    });

    it('validates pivot point calculations', async () => {
      const result = await orchestrator.processLayer5({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      const { pivots } = result.metrics;
      expect(pivots).toBeDefined();
      expect(pivots.pp).toBeDefined();
      expect(pivots.r1).toBeGreaterThan(pivots.pp);
      expect(pivots.r2).toBeGreaterThan(pivots.r1);
      expect(pivots.s1).toBeLessThan(pivots.pp);
      expect(pivots.s2).toBeLessThan(pivots.s1);
    });

    it('calculates distance in pips correctly', async () => {
      const result = await orchestrator.processLayer5({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      if (result.metrics.nearestLevel) {
        expect(result.metrics.nearestLevel.distancePips).toBeDefined();
        expect(typeof result.metrics.nearestLevel.distancePips).toBe('number');
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
        expect(['SUPPORT', 'RESISTANCE']).toContain(result.metrics.nearestLevel.type);
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

      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.metrics.signals).toBeDefined();
      expect(result.metrics.consensus).toBeGreaterThanOrEqual(60);
    });

    it('validates RSI calculation and signal', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.signals.rsi).toBeDefined();
      expect(result.metrics.signals.rsi.value).toBeDefined();
      expect(result.metrics.signals.rsi.signal).toBeDefined();
      expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(result.metrics.signals.rsi.signal);
    });

    it('validates MACD calculation and signal', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.signals.macd).toBeDefined();
      expect(result.metrics.signals.macd.value).toBeDefined();
      expect(result.metrics.signals.macd.signal).toBeDefined();
      expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(result.metrics.signals.macd.signal);
    });

    it('validates Stochastic calculation and signal', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.signals.stoch).toBeDefined();
      expect(result.metrics.signals.stoch.k).toBeDefined();
      expect(result.metrics.signals.stoch.d).toBeDefined();
      expect(result.metrics.signals.stoch.signal).toBeDefined();
    });

    it('requires 60% consensus threshold', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.consensus).toBeGreaterThanOrEqual(0);
      expect(result.metrics.consensus).toBeLessThanOrEqual(100);

      if (result.status === 'PASS') {
        expect(result.metrics.consensus).toBeGreaterThanOrEqual(60);
      }
    });

    it('handles bearish signals correctly', async () => {
      const result = await orchestrator.processLayer6({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      expect(result.status).toBe('PASS');
      expect(result.metrics.consensus).toBeGreaterThanOrEqual(60);
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

      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(65);
      expect(result.metrics.mas).toBeDefined();
      expect(result.metrics.currentPrice).toBeDefined();
    });

    it('passes with price below MAs for bearish signal', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(65);
    });

    it('calculates all required MAs', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.mas.sma20).toBeDefined();
      expect(result.metrics.mas.sma50).toBeDefined();
      expect(result.metrics.mas.sma200).toBeDefined();
      expect(result.metrics.mas.ema9).toBeDefined();
      expect(result.metrics.mas.ema21).toBeDefined();
    });

    it('validates MA alignment detection', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.maAlignment).toBeDefined();
      expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(result.metrics.maAlignment);
    });

    it('requires 65% alignment threshold', async () => {
      const result = await orchestrator.processLayer7({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.alignmentRatio).toBeDefined();
      expect(result.metrics.alignmentRatio).toBeGreaterThanOrEqual(0);
      expect(result.metrics.alignmentRatio).toBeLessThanOrEqual(100);

      if (result.status === 'PASS') {
        expect(result.metrics.alignmentRatio).toBeGreaterThanOrEqual(65);
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

      expect(result.status).toBe('PASS');
      expect(result.score).toBeGreaterThanOrEqual(75);
      expect(result.metrics.confluenceScore).toBeGreaterThanOrEqual(75);
    });

    it('validates weighted scoring (D1 > H4 > H1 > M15)', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.tfAnalysis).toBeDefined();
      expect(result.metrics.tfAnalysis.M15.weight).toBe(1);
      expect(result.metrics.tfAnalysis.H1.weight).toBe(2);
      expect(result.metrics.tfAnalysis.H4.weight).toBe(3);
      expect(result.metrics.tfAnalysis.D1.weight).toBe(4);
    });

    it('requires 75% weighted confluence threshold', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      if (result.status === 'PASS') {
        expect(result.metrics.confluenceScore).toBeGreaterThanOrEqual(75);
      } else {
        expect(result.metrics.confluenceScore).toBeLessThan(75);
      }
    });

    it('analyzes all 4 timeframes', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      expect(result.metrics.tfAnalysis.M15).toBeDefined();
      expect(result.metrics.tfAnalysis.H1).toBeDefined();
      expect(result.metrics.tfAnalysis.H4).toBeDefined();
      expect(result.metrics.tfAnalysis.D1).toBeDefined();
    });

    it('handles bearish confluence correctly', async () => {
      const result = await orchestrator.processLayer11({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bearishSnapshot,
        signal: bearishSnapshot.signal,
      });

      expect(result.status).toBe('PASS');
      expect(result.metrics.confluenceScore).toBeGreaterThanOrEqual(75);
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

      expect(result.status).toBe('PASS');
      expect(result.metrics.positionSize).toBeDefined();
      expect(result.metrics.positionSize).toBeGreaterThan(0);
      expect(result.metrics.riskAmount).toBeDefined();
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

      expect(result.metrics.positionSize).toBeGreaterThanOrEqual(0.01);
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

      expect(result.metrics.positionSize).toBeLessThanOrEqual(5.0);
    });

    it('validates SL distance (10-200 pips)', async () => {
      const result = await orchestrator.processLayer17({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      const slPips = parseFloat(result.metrics.slPips);
      expect(slPips).toBeGreaterThanOrEqual(10);
      expect(slPips).toBeLessThanOrEqual(200);
    });

    it('limits risk to reasonable percentage', async () => {
      const result = await orchestrator.processLayer17({
        broker: 'mt5',
        symbol: 'EURUSD',
        snapshot: bullishSnapshot,
        signal: bullishSnapshot.signal,
      });

      const riskPercent = parseFloat(result.metrics.actualRiskPercent);
      expect(riskPercent).toBeGreaterThan(0);
      expect(riskPercent).toBeLessThanOrEqual(3);
    });
  });
});
