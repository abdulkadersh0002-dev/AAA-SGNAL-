/**
 * Tests for:
 *  1. Pair catalog — all FX pairs and metals are enabled
 *  2. LayerOrchestrator._computeSmartEntryLevels() — computes valid levels from ATR
 *  3. Layer 16 uses smart levels when entry/SL/TP are absent from signal
 *  4. Layer 17 uses smart levels when entry/SL/TP are absent from signal
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listTargetPairs, getPairMetadata } from '../../../src/config/pair-catalog.js';
import LayerOrchestrator from '../../../src/core/engine/layer-orchestrator.js';
import { createBullishSnapshot } from '../../fixtures/layer-test-data.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeOrchestrator() {
  return new LayerOrchestrator({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
}

/** Minimal snapshot with quote + H1 bars for smart entry computation */
function makeSnapshotWithBars(bid = 1.089, ask = 1.0892) {
  const snapshot = createBullishSnapshot();
  snapshot.quote = { bid, ask, timestamp: Date.now() };
  return snapshot;
}

/** Signal with direction only (no entry/SL/TP) */
function signalDirectionOnly(direction = 'BUY') {
  return {
    symbol: 'EURUSD',
    signal: direction,
    direction,
    confidence: 75,
    timeframe: 'H1',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pair Catalog Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Pair Catalog — all FX pairs and metals enabled', () => {
  const EXPECTED_MAJORS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', 'USDCHF'];
  const EXPECTED_CROSSES = [
    'EURGBP',
    'EURJPY',
    'GBPJPY',
    'AUDJPY',
    'CADJPY',
    'EURCHF',
    'EURAUD',
    'EURCAD',
    'GBPAUD',
    'GBPCAD',
    'AUDCAD',
    'AUDNZD',
    'NZDCAD',
    'NZDCHF',
    'GBPCHF',
    'CHFJPY',
  ];
  const EXPECTED_METALS = ['XAUUSD', 'XAGUSD'];

  it('has at least 25 enabled pairs', () => {
    const pairs = listTargetPairs();
    assert.ok(pairs.length >= 25, `Expected ≥ 25 enabled pairs, got ${pairs.length}`);
  });

  for (const pair of EXPECTED_MAJORS) {
    it(`${pair} is enabled`, () => {
      const pairs = listTargetPairs();
      assert.ok(pairs.includes(pair), `${pair} should be in enabled pairs list`);
    });
  }

  for (const pair of EXPECTED_CROSSES) {
    it(`${pair} is enabled`, () => {
      const pairs = listTargetPairs();
      assert.ok(pairs.includes(pair), `${pair} should be in enabled pairs list`);
    });
  }

  for (const metal of EXPECTED_METALS) {
    it(`${metal} (metal) is enabled`, () => {
      const pairs = listTargetPairs();
      assert.ok(pairs.includes(metal), `${metal} should be in enabled pairs list`);
    });
  }

  it('XAUUSD has correct asset class and pip size', () => {
    const meta = getPairMetadata('XAUUSD');
    assert.ok(meta, 'XAUUSD metadata should exist');
    assert.equal(meta.assetClass, 'metals');
    assert.equal(meta.pipSize, 0.1);
  });

  it('USDJPY has correct JPY pip size', () => {
    const meta = getPairMetadata('USDJPY');
    assert.ok(meta, 'USDJPY metadata should exist');
    assert.equal(meta.pipSize, 0.01);
  });

  it('all enabled pairs have valid metadata', () => {
    const pairs = listTargetPairs();
    for (const pair of pairs) {
      const meta = getPairMetadata(pair);
      assert.ok(meta, `${pair} should have metadata`);
      assert.ok(meta.pipSize > 0, `${pair} should have positive pipSize`);
      assert.ok(meta.syntheticBasePrice > 0, `${pair} should have positive syntheticBasePrice`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. _computeSmartEntryLevels Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('LayerOrchestrator._computeSmartEntryLevels', () => {
  it('returns null when no quote is available', () => {
    const orch = makeOrchestrator();
    const result = orch._computeSmartEntryLevels(
      { quote: null, bars: {} },
      signalDirectionOnly('BUY')
    );
    assert.equal(result, null);
  });

  it('returns null when no bars available for ATR', () => {
    const orch = makeOrchestrator();
    const snapshot = { quote: { bid: 1.089, ask: 1.0892 }, bars: {} };
    const result = orch._computeSmartEntryLevels(snapshot, signalDirectionOnly('BUY'));
    assert.equal(result, null);
  });

  it('computes BUY levels from ATR', () => {
    const orch = makeOrchestrator();
    const snapshot = makeSnapshotWithBars(1.089, 1.0892);
    const result = orch._computeSmartEntryLevels(snapshot, signalDirectionOnly('BUY'));

    assert.ok(result !== null, 'Should return computed levels');
    assert.ok(Number.isFinite(result.entry), 'entry should be finite');
    assert.ok(Number.isFinite(result.sl), 'sl should be finite');
    assert.ok(Number.isFinite(result.tp), 'tp should be finite');
    assert.ok(Number.isFinite(result.atr) && result.atr > 0, 'atr should be positive');

    // BUY: entry = ask, SL below entry, TP above entry
    assert.ok(result.entry > 0, 'entry should be positive');
    assert.ok(result.sl < result.entry, 'BUY: SL should be below entry');
    assert.ok(result.tp > result.entry, 'BUY: TP should be above entry');

    // R:R should be ≥ 1.4 (due to ATR × 1.5 SL and ATR × 2.2 TP)
    const rr = (result.tp - result.entry) / (result.entry - result.sl);
    assert.ok(rr >= 1.4, `R:R should be ≥ 1.4, got ${rr.toFixed(2)}`);
  });

  it('computes SELL levels from ATR', () => {
    const orch = makeOrchestrator();
    const snapshot = makeSnapshotWithBars(1.089, 1.0892);
    const result = orch._computeSmartEntryLevels(snapshot, signalDirectionOnly('SELL'));

    assert.ok(result !== null, 'Should return computed levels');
    // SELL: entry = bid, SL above entry, TP below entry
    assert.ok(result.sl > result.entry, 'SELL: SL should be above entry');
    assert.ok(result.tp < result.entry, 'SELL: TP should be below entry');

    const rr = (result.entry - result.tp) / (result.sl - result.entry);
    assert.ok(rr >= 1.4, `R:R should be ≥ 1.4, got ${rr.toFixed(2)}`);
  });

  it('source is smart_swing or smart_atr', () => {
    const orch = makeOrchestrator();
    const snapshot = makeSnapshotWithBars(1.089, 1.0892);
    const result = orch._computeSmartEntryLevels(snapshot, signalDirectionOnly('BUY'));
    assert.ok(
      result.source === 'smart_swing' || result.source === 'smart_atr',
      `source should be smart_swing or smart_atr, got ${result.source}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Layer 16 — uses smart levels when signal has no entry/SL/TP
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 16 — smart entry fallback', () => {
  it('passes with smart levels when signal has direction only', async () => {
    const orch = makeOrchestrator();
    const snapshot = makeSnapshotWithBars(1.089, 1.0892);
    const signal = signalDirectionOnly('BUY');

    const result = await orch.processLayer16({ snapshot, signal });

    assert.equal(
      result.status,
      'PASS',
      `L16 should pass with smart levels. reason: ${result.reason}`
    );
    assert.ok(result.metrics.riskRewardRatio >= 1.5, 'R:R should be ≥ 1.5');
    assert.ok(
      result.metrics.source === 'smart_swing' || result.metrics.source === 'smart_atr',
      `source should be smart, got ${result.metrics.source}`
    );
  });

  it('attaches entryPrice/stopLoss/takeProfit back to signal', async () => {
    const orch = makeOrchestrator();
    const snapshot = makeSnapshotWithBars(1.089, 1.0892);
    const signal = signalDirectionOnly('SELL');

    await orch.processLayer16({ snapshot, signal });

    assert.ok(
      Number.isFinite(signal.entryPrice) && signal.entryPrice > 0,
      'signal.entryPrice should be set'
    );
    assert.ok(
      Number.isFinite(signal.stopLoss) && signal.stopLoss > 0,
      'signal.stopLoss should be set'
    );
    assert.ok(
      Number.isFinite(signal.takeProfit) && signal.takeProfit > 0,
      'signal.takeProfit should be set'
    );
  });

  it('still uses explicit entry/SL/TP when provided', async () => {
    const orch = makeOrchestrator();
    const snapshot = makeSnapshotWithBars(1.089, 1.0892);
    const signal = {
      ...signalDirectionOnly('BUY'),
      entryPrice: 1.09,
      stopLoss: 1.079, // 110 pips SL
      takeProfit: 1.113, // 230 pips TP => R:R ≈ 2.09
    };

    const result = await orch.processLayer16({ snapshot, signal });
    assert.equal(result.status, 'PASS');
    // source should NOT be smart when explicit levels were provided
    assert.ok(
      result.metrics.source !== 'smart_swing' && result.metrics.source !== 'smart_atr',
      `source should not be smart when explicit levels provided, got ${result.metrics.source}`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Layer 17 — uses smart levels when signal has no entry/SL
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 17 — smart entry fallback for position sizing', () => {
  it('passes and computes position size when signal has direction only', async () => {
    const orch = makeOrchestrator();
    const snapshot = makeSnapshotWithBars(1.089, 1.0892);
    // Attach symbol to snapshot so L17 can detect asset class
    snapshot.symbol = 'EURUSD';
    const signal = { ...signalDirectionOnly('BUY'), pair: 'EURUSD' };

    const result = await orch.processLayer17({ snapshot, signal });

    assert.equal(result.status, 'PASS', `L17 should pass. reason: ${result.reason}`);
    assert.ok(result.metrics.positionSize > 0, 'position size should be positive');
    assert.ok(result.metrics.slPips, 'slPips should be present');
  });

  it('correctly identifies XAUUSD as METAL asset class', async () => {
    const orch = makeOrchestrator();
    // Gold snapshot with realistic prices
    const snapshot = createBullishSnapshot();
    snapshot.quote = { bid: 2050.0, ask: 2050.5, timestamp: Date.now() };
    // Generate gold-range bars (around 2000-2100)
    snapshot.symbol = 'XAUUSD';
    const signal = {
      direction: 'BUY',
      signal: 'BUY',
      confidence: 75,
      timeframe: 'H1',
      pair: 'XAUUSD',
      entryPrice: 2050.5,
      stopLoss: 2035.0, // 155 pips on gold
      takeProfit: 2085.0, // 345 pips on gold => R:R ≈ 2.2
    };

    const result = await orch.processLayer17({ snapshot, signal });
    assert.equal(
      result.metrics.assetClass,
      'METAL',
      `XAUUSD should be METAL, got ${result.metrics.assetClass}`
    );
  });

  it('correctly identifies USDJPY as JPY asset class', async () => {
    const orch = makeOrchestrator();
    const snapshot = createBullishSnapshot();
    snapshot.quote = { bid: 149.5, ask: 149.52, timestamp: Date.now() };
    snapshot.symbol = 'USDJPY';
    const signal = {
      direction: 'BUY',
      signal: 'BUY',
      confidence: 75,
      timeframe: 'H1',
      pair: 'USDJPY',
      entryPrice: 149.52,
      stopLoss: 148.8, // 72 pips on JPY
      takeProfit: 150.8, // 128 pips => R:R ≈ 1.78
    };

    const result = await orch.processLayer17({ snapshot, signal });
    assert.equal(
      result.metrics.assetClass,
      'JPY',
      `USDJPY should be JPY, got ${result.metrics.assetClass}`
    );
  });
});
