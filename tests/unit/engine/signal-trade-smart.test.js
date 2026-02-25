/**
 * Tests for smart signal/trade improvements:
 * 1. Layer 16 R:R computation from entry/SL/TP
 * 2. Layer 17 adaptive pip value per asset class
 * 3. evaluateSmartTradeSupervision candle reversal guard
 * 4. evaluatePartialClose + applyPartialClose milestone tracking
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { executionEngine } from '../../../src/core/engine/modules/execution-engine.js';
import LayerOrchestrator from '../../../src/core/engine/layer-orchestrator.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOrchestrator() {
  return new LayerOrchestrator({ logger: { info: () => {}, warn: () => {}, error: () => {} } });
}

function createEngine(extra = {}) {
  return {
    ...executionEngine,
    activeTrades: new Map(),
    tradingHistory: [],
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    ...extra,
  };
}

function makeTrade(overrides = {}) {
  return {
    id: 'T1',
    pair: 'EURUSD',
    direction: 'BUY',
    entryPrice: 1.1,
    stopLoss: 1.099,
    takeProfit: 1.103,
    positionSize: 0.1,
    trailingStop: { enabled: false },
    movedToBreakeven: false,
    broker: null,
    ...overrides,
  };
}

// ── Layer 16 ─────────────────────────────────────────────────────────────────

test('L16: computes R:R from entry/sl/tp when signal.riskRewardRatio absent', async () => {
  const orc = makeOrchestrator();
  // entry=1.1, sl=1.0990 (10 pips), tp=1.1020 (20 pips) => R:R = 2.0
  const signal = { direction: 'BUY', entry: 1.1, sl: 1.099, tp: 1.102 };
  const result = await orc.processLayer16({ snapshot: {}, signal });
  assert.equal(result.status, 'PASS');
  assert.ok(
    result.metrics.riskRewardRatio >= 1.9,
    `expected R:R ≥1.9, got ${result.metrics.riskRewardRatio}`
  );
  // Layer attaches computed R:R to the signal — verify it was stored
  assert.ok(Number.isFinite(signal.riskRewardRatio), 'layer should attach computed R:R to signal');
});

test('L16: uses pre-computed signal.riskRewardRatio when present', async () => {
  const orc = makeOrchestrator();
  const signal = { riskRewardRatio: 2.5, direction: 'BUY' };
  const result = await orc.processLayer16({ snapshot: {}, signal });
  assert.equal(result.status, 'PASS');
  assert.equal(result.metrics.riskRewardRatio, 2.5);
});

test('L16: FAIL when computed R:R < 1.5', async () => {
  const orc = makeOrchestrator();
  const signal = { direction: 'SELL', entry: 1.1, sl: 1.101, tp: 1.1006 }; // 10 pip risk, 6 pip reward
  const result = await orc.processLayer16({ snapshot: {}, signal });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.metrics.riskRewardRatio < 1.5);
});

test('L16: SKIP when entry/SL/TP all missing', async () => {
  const orc = makeOrchestrator();
  const signal = { direction: 'BUY' };
  const result = await orc.processLayer16({ snapshot: {}, signal });
  assert.equal(result.status, 'SKIP');
});

// ── Layer 17 ─────────────────────────────────────────────────────────────────

test('L17: standard FX pair uses 10000 pip divisor', async () => {
  const orc = makeOrchestrator();
  // EURUSD: 30 pip SL (0.0030), 1.5% of $10k balance = $150 risk
  // $150 / (30 pips * $10/pip) = 0.5 lots
  const signal = { pair: 'EURUSD', entry: 1.1, sl: 1.097, tp: 1.109 };
  const result = await orc.processLayer17({ snapshot: { accountBalance: 10000 }, signal });
  assert.equal(result.status, 'PASS');
  assert.equal(result.metrics.assetClass, 'FX');
  assert.equal(Number(result.metrics.pipDivisor), 10000);
});

test('L17: JPY pair uses 100 pip divisor', async () => {
  const orc = makeOrchestrator();
  // USDJPY: entry=150.00, sl=149.50 (50 pips at 0.01 per pip)
  const signal = { pair: 'USDJPY', entry: 150.0, sl: 149.5, tp: 151.5 };
  const result = await orc.processLayer17({ snapshot: { accountBalance: 10000 }, signal });
  assert.equal(result.metrics.assetClass, 'JPY');
  assert.equal(Number(result.metrics.pipDivisor), 100);
  assert.ok(result.status === 'PASS' || result.status === 'FAIL'); // sizing logic should run
});

test('L17: gold (XAUUSD) uses 10 pip divisor', async () => {
  const orc = makeOrchestrator();
  // XAUUSD: entry=2050, sl=2040 => 100 pips at 0.1 per pip, above 50-pip minimum
  const signal = { pair: 'XAUUSD', entry: 2050, sl: 2040, tp: 2080 };
  const result = await orc.processLayer17({ snapshot: { accountBalance: 10000 }, signal });
  assert.equal(result.metrics.assetClass, 'METAL');
  assert.equal(Number(result.metrics.pipDivisor), 10);
  assert.equal(result.status, 'PASS');
});

test('L17: crypto uses percentage-based sizing', async () => {
  const orc = makeOrchestrator();
  const signal = { pair: 'BTCUSD', entry: 60000, sl: 59000, tp: 63000 };
  const result = await orc.processLayer17({ snapshot: { accountBalance: 10000 }, signal });
  assert.equal(result.metrics.assetClass, 'CRYPTO');
  assert.ok(result.metrics.slPct !== undefined);
  assert.equal(result.status, 'PASS');
});

test('L17: FAIL when SL too tight for FX pair (<10 pips)', async () => {
  const orc = makeOrchestrator();
  // EURUSD: only 3 pips SL
  const signal = { pair: 'EURUSD', entry: 1.1, sl: 1.09997, tp: 1.102 };
  const result = await orc.processLayer17({ snapshot: { accountBalance: 10000 }, signal });
  assert.equal(result.status, 'FAIL');
  assert.match(result.reason, /tight/i);
});

// ── evaluatePartialClose ──────────────────────────────────────────────────────

test('evaluatePartialClose: returns R1 milestone at 1R', () => {
  const engine = createEngine();
  const trade = makeTrade({ entryPrice: 1.1, stopLoss: 1.099, takeProfit: 1.103 });
  // R=1.0+ε to avoid float rounding (1.101 - 1.1 = 0.0009999... in JS)
  const result = engine.evaluatePartialClose(trade, 1.10102);
  assert.ok(result !== null);
  assert.equal(result.milestone, 'R1');
  assert.equal(result.fraction, 0.25);
  assert.equal(result.shouldPartialClose, true);
});

test('evaluatePartialClose: returns R2 milestone at 2R', () => {
  const engine = createEngine();
  const trade = makeTrade({ entryPrice: 1.1, stopLoss: 1.099, takeProfit: 1.103 });
  // R=2.0+ε to avoid float rounding
  const result = engine.evaluatePartialClose(trade, 1.10202);
  assert.ok(result !== null);
  assert.equal(result.milestone, 'R2');
});

test('evaluatePartialClose: null when R < 1.0 (not in profit enough)', () => {
  const engine = createEngine();
  const trade = makeTrade({ entryPrice: 1.1, stopLoss: 1.099, takeProfit: 1.103 });
  const result = engine.evaluatePartialClose(trade, 1.1005); // only 0.5R
  assert.equal(result, null);
});

test('evaluatePartialClose: does not re-trigger R1 after already taken', () => {
  const engine = createEngine();
  const trade = makeTrade({
    entryPrice: 1.1,
    stopLoss: 1.099,
    takeProfit: 1.103,
    _partialCloseR1: true,
  });
  // Still at 1R but R1 already done
  const result = engine.evaluatePartialClose(trade, 1.10102);
  assert.equal(result, null);
});

test('applyPartialClose: reduces positionSize and marks milestone', async () => {
  const engine = createEngine();
  const trade = makeTrade({
    entryPrice: 1.1,
    stopLoss: 1.099,
    takeProfit: 1.103,
    positionSize: 0.4,
  });
  engine.activeTrades.set('T1', trade);
  const result = await engine.applyPartialClose('T1', 0.25, 'R1', 1.101);
  assert.equal(result.success, true);
  assert.equal(result.milestone, 'R1');
  assert.ok(
    Math.abs(result.closeUnits - 0.1) < 1e-6,
    `expected 0.1 close, got ${result.closeUnits}`
  );
  assert.ok(
    Math.abs(trade.positionSize - 0.3) < 1e-6,
    `expected remaining 0.3, got ${trade.positionSize}`
  );
  assert.equal(trade._partialCloseR1, true);
});

// ── Candle reversal guard ─────────────────────────────────────────────────────

test('evaluateSmartTradeSupervision: candle reversal guard triggers breakeven at 0.5R with counter-bias', () => {
  const engine = createEngine({
    getMarketCandleAnalysisByTimeframe: () => ({
      aggregate: {
        bias: 'BEARISH',
        patterns: [{ pattern: 'BEARISH_ENGULFING', strength: 80 }],
      },
    }),
  });

  // Simulate env to enable supervisor
  const origEnv = process.env.SMART_TRADE_SUPERVISOR_ENABLED;
  process.env.SMART_TRADE_SUPERVISOR_ENABLED = 'true';

  const trade = makeTrade({
    entryPrice: 1.1,
    stopLoss: 1.099,
    takeProfit: 1.103,
    direction: 'BUY',
  });
  // currentPrice gives 0.6R (in profit, reversal should trigger)
  const currentPrice = 1.1006;
  const result = engine.evaluateSmartTradeSupervision(trade, currentPrice);

  process.env.SMART_TRADE_SUPERVISOR_ENABLED = origEnv ?? '';

  assert.ok(result !== null, 'should return a supervision action');
  assert.equal(result.action, 'breakeven');
  assert.equal(result.reason, 'candle_reversal_guard');
});

test('evaluateSmartTradeSupervision: no reversal when no counter-bias', () => {
  const engine = createEngine({
    getMarketCandleAnalysisByTimeframe: () => ({
      aggregate: {
        bias: 'BULLISH', // same direction as trade
        patterns: [{ pattern: 'HAMMER', strength: 80 }],
      },
    }),
  });

  const origEnv = process.env.SMART_TRADE_SUPERVISOR_ENABLED;
  process.env.SMART_TRADE_SUPERVISOR_ENABLED = 'true';

  const trade = makeTrade({
    entryPrice: 1.1,
    stopLoss: 1.099,
    takeProfit: 1.103,
    direction: 'BUY',
  });
  const result = engine.evaluateSmartTradeSupervision(trade, 1.1006);

  process.env.SMART_TRADE_SUPERVISOR_ENABLED = origEnv ?? '';

  // Should not trigger reversal guard — might be null or news/dq-based
  if (result !== null) {
    assert.notEqual(result.reason, 'candle_reversal_guard');
  }
});
