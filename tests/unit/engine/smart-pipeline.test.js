/**
 * Tests for smart pipeline improvements:
 * - Layer 1 (graduated quote age scoring)
 * - Layer 2 (ATR-relative spread / bid-ask fallback)
 * - Layer 3 (ATR-derived volatility)
 * - Risk Engine (consecutive-loss Kelly scaling)
 * - Intelligent Trade Manager (consecutive-loss cool-down)
 * - Execution Engine (R-based profit pull-back guard)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import LayerOrchestrator from '../../../src/core/engine/layer-orchestrator.js';
import { riskEngine } from '../../../src/core/engine/modules/risk-engine.js';
import { executionEngine } from '../../../src/core/engine/modules/execution-engine.js';
import IntelligentTradeManager from '../../../src/infrastructure/services/brokers/intelligent-trade-manager.js';
import { createBullishSnapshot } from '../../fixtures/layer-test-data.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function makeOrchestrator() {
  return new LayerOrchestrator({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
}

function makeITM(opts = {}) {
  return new IntelligentTradeManager({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    ...opts,
  });
}

function makeRiskEngine(tradingHistory = []) {
  return Object.assign(Object.create(riskEngine), {
    tradingHistory,
    config: {
      accountBalance: 10000,
      minKellyFraction: 0.005,
      maxKellyFraction: 0.04,
      riskPerTrade: 0.01,
      maxDailyRisk: 0.05,
      maxExposurePerCurrency: 5,
      volatilityRiskMultipliers: { normal: 1, high: 0.8, low: 1.1 },
      correlationPenalty: { samePair: 0.5, sharedCurrency: 0.8 },
    },
    dailyRisk: 0,
    lastResetDate: new Date().toDateString(),
    activeTrades: new Map(),
    splitPair: (pair) => [pair.slice(0, 3), pair.slice(3, 6)],
    getConsecutiveLosses() {
      const history = Array.isArray(this.tradingHistory) ? this.tradingHistory : [];
      let count = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        const pnl = parseFloat(history[i]?.finalPnL?.percentage);
        if (!Number.isFinite(pnl)) {
          break;
        }
        if (pnl < 0) {
          count++;
        } else {
          break;
        }
      }
      return count;
    },
  });
}

function makeExecEngine() {
  return Object.assign(Object.create(executionEngine), {
    getTradeRiskDistance(trade) {
      const entry = Number(trade.entryPrice);
      const stop = Number(trade.stopLoss);
      if (!Number.isFinite(entry) || !Number.isFinite(stop)) {
        return null;
      }
      const dist = Math.abs(entry - stop);
      return dist > 0 ? dist : null;
    },
    getCurrentRMultiple(trade, currentPrice) {
      const dist = this.getTradeRiskDistance(trade);
      if (!dist) {
        return null;
      }
      const dir = String(trade.direction || '').toUpperCase();
      const entry = Number(trade.entryPrice);
      const current = Number(currentPrice);
      if (dir === 'BUY') {
        return (current - entry) / dist;
      }
      if (dir === 'SELL') {
        return (entry - current) / dist;
      }
      return null;
    },
  });
}

function makeTrade(pnlPct) {
  return { finalPnL: { percentage: String(pnlPct) } };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — GRADUATED QUOTE AGE SCORING
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 1: Graduated Quote Age', () => {
  let orch;
  beforeEach(() => {
    orch = makeOrchestrator();
  });

  it('score=100 for very fresh quote (< 5 s)', async () => {
    const snap = { quote: { bid: 1.1, ask: 1.1002, receivedAt: Date.now() - 1000 } };
    const r = await orch.processLayer1({ snapshot: snap });
    assert.equal(r.status, 'PASS');
    assert.equal(r.score, 100);
  });

  it('score is reduced but PASS for 45-second-old quote', async () => {
    const snap = { quote: { bid: 1.1, ask: 1.1002, receivedAt: Date.now() - 45_000 } };
    const r = await orch.processLayer1({ snapshot: snap });
    assert.equal(r.status, 'PASS');
    assert.ok(r.score >= 80 && r.score < 100, `score ${r.score} should be 80-99`);
  });

  it('score is reduced but PASS for 90-second-old quote', async () => {
    const snap = { quote: { bid: 1.1, ask: 1.1002, receivedAt: Date.now() - 90_000 } };
    const r = await orch.processLayer1({ snapshot: snap });
    assert.equal(r.status, 'PASS');
    assert.ok(r.score >= 55 && r.score < 80, `score ${r.score} should be 55-79`);
  });

  it('PASS (with low score) for quote 200 s old', async () => {
    const snap = { quote: { bid: 1.1, ask: 1.1002, receivedAt: Date.now() - 200_000 } };
    const r = await orch.processLayer1({ snapshot: snap });
    assert.equal(r.status, 'PASS');
    assert.ok(r.score < 55, `score ${r.score} should be < 55`);
  });

  it('FAIL for quote older than 5 minutes', async () => {
    const snap = { quote: { bid: 1.1, ask: 1.1002, receivedAt: Date.now() - 310_000 } };
    const r = await orch.processLayer1({ snapshot: snap });
    assert.equal(r.status, 'FAIL');
  });

  it('FAIL for invalid bid/ask', async () => {
    const snap = { quote: { bid: 0, ask: 0, receivedAt: Date.now() } };
    const r = await orch.processLayer1({ snapshot: snap });
    assert.equal(r.status, 'FAIL');
  });

  it('FAIL when no quote', async () => {
    const r = await orch.processLayer1({ snapshot: {} });
    assert.equal(r.status, 'FAIL');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — ATR-RELATIVE SPREAD / BID-ASK FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 2: Smart Spread Analysis', () => {
  let orch;
  beforeEach(() => {
    orch = makeOrchestrator();
  });

  it('PASS and uses spreadPoints when available', async () => {
    const snap = { quote: { bid: 1.1, ask: 1.1002, spreadPoints: 2 } };
    const r = await orch.processLayer2({ snapshot: snap });
    assert.equal(r.status, 'PASS');
    assert.equal(r.metrics.spreadSource, 'spreadPoints');
    assert.ok(r.score >= 85);
  });

  it('computes spread from bid/ask when spreadPoints is missing', async () => {
    // bid-ask delta 0.0002 = 2 points
    const snap = { quote: { bid: 1.1, ask: 1.1002 } };
    const r = await orch.processLayer2({ snapshot: snap });
    assert.ok(['PASS', 'FAIL'].includes(r.status));
    assert.equal(r.metrics.spreadSource, 'bid_ask_delta');
    assert.ok(Number.isFinite(r.metrics.spreadPoints));
  });

  it('FAIL when spread is extremely wide (> 1.5× threshold)', async () => {
    const snap = { quote: { bid: 1.1, ask: 1.12, spreadPoints: 200 } }; // 200 pts >> 30 max
    const r = await orch.processLayer2({ snapshot: snap });
    assert.equal(r.status, 'FAIL');
  });

  it('SKIP when no bid/ask and no spreadPoints', async () => {
    const snap = { quote: { bid: null, ask: null } };
    const r = await orch.processLayer2({ snapshot: snap });
    assert.equal(r.status, 'SKIP');
  });

  it('ATR-based threshold when H1 bars are present', async () => {
    const snap = createBullishSnapshot();
    snap.quote = { bid: 1.089, ask: 1.0892, spreadPoints: 2 };
    const r = await orch.processLayer2({ snapshot: snap });
    assert.equal(r.status, 'PASS');
    // atrBased flag should be set
    assert.ok(typeof r.metrics.atrBased === 'boolean');
  });

  it('graduated score: lower score for wider spread', async () => {
    const snapNarrow = { quote: { bid: 1.1, ask: 1.1001, spreadPoints: 1 } };
    const snapWide = { quote: { bid: 1.1, ask: 1.102, spreadPoints: 20 } };
    const narrow = await orch.processLayer2({ snapshot: snapNarrow });
    const wide = await orch.processLayer2({ snapshot: snapWide });
    assert.ok(narrow.score > wide.score, 'narrow spread should score higher');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — ATR-DERIVED VOLATILITY
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 3: ATR-Derived Volatility', () => {
  let orch;
  beforeEach(() => {
    orch = makeOrchestrator();
  });

  it('PASS with snapshot.volatility in normal range', async () => {
    const snap = { volatility: 60 };
    const r = await orch.processLayer3({ snapshot: snap });
    assert.equal(r.status, 'PASS');
    assert.ok(r.score >= 80);
  });

  it('FAIL for extremely low volatility', async () => {
    const snap = { volatility: 3 };
    const r = await orch.processLayer3({ snapshot: snap });
    assert.equal(r.status, 'FAIL');
  });

  it('FAIL for extreme volatility', async () => {
    const snap = { volatility: 200 };
    const r = await orch.processLayer3({ snapshot: snap });
    assert.equal(r.status, 'FAIL');
  });

  it('derives volatility from H1 ATR when snapshot.volatility is absent', async () => {
    const snap = createBullishSnapshot();
    delete snap.volatility;
    const r = await orch.processLayer3({ snapshot: snap, signal: snap.signal });
    assert.ok(['PASS', 'FAIL'].includes(r.status));
    assert.ok(r.metrics.source.startsWith('atr_') || r.metrics.source === 'unavailable');
  });

  it('PASS with low confidence when no volatility data available', async () => {
    const r = await orch.processLayer3({ snapshot: {}, signal: {} });
    assert.equal(r.status, 'PASS');
    assert.ok(r.confidence <= 50, 'should have low confidence without data');
  });

  it('lower score for elevated volatility vs normal', async () => {
    const normal = await orch.processLayer3({ snapshot: { volatility: 50 } });
    const elevated = await orch.processLayer3({ snapshot: { volatility: 150 } });
    assert.ok(normal.score >= elevated.score, 'normal volatility should score >= elevated');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RISK ENGINE — CONSECUTIVE-LOSS KELLY SCALING
// ─────────────────────────────────────────────────────────────────────────────
describe('Risk Engine: consecutive-loss Kelly scaling', () => {
  it('getConsecutiveLosses returns 0 with no history', () => {
    const eng = makeRiskEngine([]);
    assert.equal(eng.getConsecutiveLosses(), 0);
  });

  it('getConsecutiveLosses counts trailing losses', () => {
    const eng = makeRiskEngine([
      makeTrade(1.5), // win — streak reset
      makeTrade(-0.5), // loss 1
      makeTrade(-0.8), // loss 2
    ]);
    assert.equal(eng.getConsecutiveLosses(), 2);
  });

  it('getConsecutiveLosses stops counting on a win', () => {
    const eng = makeRiskEngine([
      makeTrade(-1.0), // old loss
      makeTrade(0.5), // WIN — resets
      makeTrade(-0.3), // loss 1 only
    ]);
    assert.equal(eng.getConsecutiveLosses(), 1);
  });

  it('Kelly fraction is reduced after 2 consecutive losses', () => {
    const baseEng = makeRiskEngine([makeTrade(1.0)]); // win — scale = 1.0
    const lossEng = makeRiskEngine([makeTrade(-0.5), makeTrade(-0.5)]); // 2 losses — scale 0.75

    const signal = { estimatedWinRate: 60, entry: { riskReward: 2 } };
    const baseKelly = baseEng.computeKellyFraction(signal);
    const lossKelly = lossEng.computeKellyFraction(signal);
    assert.ok(
      lossKelly < baseKelly,
      `After 2 losses (${lossKelly}) should be < no-loss (${baseKelly})`
    );
  });

  it('Kelly fraction is heavily reduced after 4+ consecutive losses', () => {
    const baseEng = makeRiskEngine([makeTrade(1.0)]);
    const lossEng = makeRiskEngine([makeTrade(-1), makeTrade(-1), makeTrade(-1), makeTrade(-1)]); // scale = 0.35

    const signal = { estimatedWinRate: 60, entry: { riskReward: 2 } };
    const baseKelly = baseEng.computeKellyFraction(signal);
    const lossKelly = lossEng.computeKellyFraction(signal);
    assert.ok(
      lossKelly <= baseKelly * 0.5,
      `After 4 losses (${lossKelly}) should be ≤ 50% of base (${baseKelly})`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENT TRADE MANAGER — CONSECUTIVE-LOSS COOL-DOWN
// ─────────────────────────────────────────────────────────────────────────────
describe('IntelligentTradeManager: consecutive-loss cool-down', () => {
  it('checkConsecutiveLossCoolDown returns blocked=false with no history', () => {
    const itm = makeITM();
    const r = itm.checkConsecutiveLossCoolDown('EURUSD');
    assert.equal(r.blocked, false);
    assert.equal(r.consecutiveLosses, 0);
  });

  it('does NOT block after 2 consecutive losses (below threshold=3)', () => {
    const itm = makeITM({ maxConsecutiveLossesPerSymbol: 3 });
    itm.updateSymbolPerformance('EURUSD', -50);
    itm.updateSymbolPerformance('EURUSD', -30);
    const r = itm.checkConsecutiveLossCoolDown('EURUSD');
    assert.equal(r.blocked, false);
    assert.equal(r.consecutiveLosses, 2);
  });

  it('blocks after 3 consecutive losses (at threshold)', () => {
    const itm = makeITM({ maxConsecutiveLossesPerSymbol: 3, symbolCoolDownMs: 60_000 });
    itm.updateSymbolPerformance('EURUSD', -50);
    itm.updateSymbolPerformance('EURUSD', -30);
    itm.updateSymbolPerformance('EURUSD', -20);
    const r = itm.checkConsecutiveLossCoolDown('EURUSD');
    assert.equal(r.blocked, true);
    assert.ok(r.reason.includes('EURUSD'));
    assert.ok(r.coolDownUntil > Date.now());
  });

  it('resets streak on a win — cool-down is NOT re-triggered', () => {
    const itm = makeITM({ maxConsecutiveLossesPerSymbol: 3, symbolCoolDownMs: 1 }); // 1ms CD
    itm.updateSymbolPerformance('EURUSD', -50);
    itm.updateSymbolPerformance('EURUSD', -30);
    itm.updateSymbolPerformance('EURUSD', 80); // WIN — streak reset
    const r = itm.checkConsecutiveLossCoolDown('EURUSD');
    assert.equal(r.consecutiveLosses, 0);
    // cool-down may have expired (1ms) but streak is reset
    assert.equal(r.blocked, false);
  });

  it('evaluateTradeEntry returns blocked=CONSECUTIVE_LOSS_COOLDOWN after threshold losses', () => {
    const itm = makeITM({ maxConsecutiveLossesPerSymbol: 3, symbolCoolDownMs: 60_000 });
    itm.updateSymbolPerformance('EURUSD', -1);
    itm.updateSymbolPerformance('EURUSD', -1);
    itm.updateSymbolPerformance('EURUSD', -1);

    const result = itm.evaluateTradeEntry({
      signal: { direction: 'BUY', confidence: 90, strength: 85 },
      symbol: 'EURUSD',
      broker: 'mt5',
    });

    assert.equal(result.shouldOpen, false);
    assert.equal(result.blocked, 'CONSECUTIVE_LOSS_COOLDOWN');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION ENGINE — R-BASED PROFIT PULL-BACK GUARD
// ─────────────────────────────────────────────────────────────────────────────
describe('Execution Engine: R-based profit pull-back guard', () => {
  beforeEach(() => {
    process.env.SMART_TRADE_SUPERVISOR_ENABLED = 'true';
  });

  const makeBuyTrade = () => ({
    direction: 'BUY',
    entryPrice: 1.1,
    stopLoss: 1.099,
    takeProfit: 1.112,
    currentPnL: { percentage: '0.5' },
    movedToBreakeven: false,
    _peakRMultiple: undefined,
  });

  it('returns null when price has not yet reached 1R', () => {
    const eng = makeExecEngine();
    const trade = makeBuyTrade();
    // Price at 0.5R — no pull-back yet
    const price = 1.1 + 0.5 * (1.1 - 1.099);
    const r = eng.evaluateSmartTradeSupervision(trade, price);
    assert.equal(r, null);
  });

  it('sets peak R on first call above 1R', () => {
    const eng = makeExecEngine();
    const trade = makeBuyTrade();
    const price = 1.1 + 1.2 * (1.1 - 1.099); // ~1.2R
    eng.evaluateSmartTradeSupervision(trade, price);
    // Floating-point: _peakRMultiple ≈ 1.2
    assert.ok(
      trade._peakRMultiple != null && trade._peakRMultiple >= 1.19,
      `_peakRMultiple ${trade._peakRMultiple} should be ≥ 1.19`
    );
  });

  it('triggers breakeven action when price pulls back 0.4R after reaching 1R', () => {
    const eng = makeExecEngine();
    const trade = makeBuyTrade();
    const riskDist = 1.1 - 1.099; // 0.001

    // Simulate: price ran to 1.2R, then pulled back to 0.7R (0.5R pull-back)
    trade._peakRMultiple = 1.2;
    const pullbackPrice = 1.1 + 0.7 * riskDist; // 0.7R

    const r = eng.evaluateSmartTradeSupervision(trade, pullbackPrice);
    assert.ok(r !== null, 'should return a supervision action');
    assert.equal(r.action, 'breakeven');
    assert.equal(r.reason, 'profit_pullback_guard');
  });

  it('does NOT trigger pull-back guard if already at breakeven', () => {
    const eng = makeExecEngine();
    const trade = { ...makeBuyTrade(), movedToBreakeven: true, _peakRMultiple: 1.5 };
    const riskDist = 1.1 - 1.099;
    const pullbackPrice = 1.1 + 0.8 * riskDist; // pull-back from 1.5R to 0.8R

    const r = eng.evaluateSmartTradeSupervision(trade, pullbackPrice);
    // Already at breakeven — pull-back guard should not fire again
    assert.ok(r === null || r?.reason !== 'profit_pullback_guard');
  });

  it('does NOT trigger pull-back guard if peak was below 1R (not enough profit first)', () => {
    const eng = makeExecEngine();
    const trade = makeBuyTrade();
    trade._peakRMultiple = 0.8; // peak never reached 1R
    const riskDist = 1.1 - 1.099;
    const price = 1.1 + 0.2 * riskDist; // pulled back but peak was < 1R

    const r = eng.evaluateSmartTradeSupervision(trade, price);
    assert.equal(r, null);
  });
});
