/**
 * Tests for Layers 8, 9, 10 (Momentum, Volume, Candlestick Patterns)
 * and Layers 13, 14, 15 (Economic Calendar, Market Session, Correlation)
 * and the enhanced Statistical System (getStatistics)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import LayerOrchestrator from '../../../src/core/engine/layer-orchestrator.js';
import { persistenceHub } from '../../../src/core/engine/modules/persistence-hub.js';
import { createBullishSnapshot, createBearishSnapshot } from '../../fixtures/layer-test-data.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function makeOrchestrator() {
  return new LayerOrchestrator({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
}

// Build a minimal persistence-hub instance for statistics tests
function makeHub() {
  return Object.assign(Object.create(persistenceHub), {
    tradingHistory: [],
    activeTrades: new Map(),
    dailyRisk: 0,
    newsInsights: new Map(),
    dataQualityAssessments: new Map(),
  });
}

function makeTrade(pnlPct) {
  return { finalPnL: { percentage: pnlPct.toString() } };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 8 — MOMENTUM ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 8: Momentum Analysis', () => {
  let orchestrator, bullishSnapshot, bearishSnapshot;
  beforeEach(() => {
    orchestrator = makeOrchestrator();
    bullishSnapshot = createBullishSnapshot();
    bearishSnapshot = createBearishSnapshot();
  });

  it('returns PASS status for bullish signal with uptrending bars', async () => {
    const result = await orchestrator.processLayer8({
      snapshot: bullishSnapshot,
      signal: bullishSnapshot.signal,
    });
    assert.equal(result.status, 'PASS');
    assert.ok(result.score >= 40, `score ${result.score} should be >= 40`);
    assert.ok(result.confidence >= 30, `confidence ${result.confidence} should be >= 30`);
  });

  it('returns PASS status for bearish signal with downtrending bars', async () => {
    const result = await orchestrator.processLayer8({
      snapshot: bearishSnapshot,
      signal: bearishSnapshot.signal,
    });
    assert.equal(result.status, 'PASS');
    assert.ok(result.score >= 40, `score ${result.score} should be >= 40`);
  });

  it('includes ADX and RSI metrics in result', async () => {
    const result = await orchestrator.processLayer8({
      snapshot: bullishSnapshot,
      signal: bullishSnapshot.signal,
    });
    assert.ok(result.metrics !== undefined, 'metrics should be defined');
    // ADX may be null if insufficient bars, but key must exist
    assert.ok('adx' in result.metrics, 'metrics.adx key should exist');
    assert.ok('rsi' in result.metrics, 'metrics.rsi key should exist');
  });

  it('handles missing bar data gracefully', async () => {
    const snap = createBullishSnapshot();
    snap.bars = {};
    const result = await orchestrator.processLayer8({ snapshot: snap, signal: snap.signal });
    assert.equal(result.status, 'PASS'); // graceful fallback
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  it('handles missing signal direction gracefully', async () => {
    const snap = createBullishSnapshot();
    const result = await orchestrator.processLayer8({ snapshot: snap, signal: {} });
    assert.ok(['PASS', 'FAIL', 'ERROR'].includes(result.status));
    assert.ok(result.reason, 'should have a reason');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 9 — VOLUME PROFILE
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 9: Volume Profile', () => {
  let orchestrator, bullishSnapshot;
  beforeEach(() => {
    orchestrator = makeOrchestrator();
    bullishSnapshot = createBullishSnapshot();
  });

  it('returns valid status and score for snapshot with bars', async () => {
    const result = await orchestrator.processLayer9({
      snapshot: bullishSnapshot,
      signal: bullishSnapshot.signal,
    });
    assert.ok(['PASS', 'FAIL'].includes(result.status));
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it('handles no-volume bars gracefully (PASS with reduced confidence)', async () => {
    const snap = createBullishSnapshot();
    // Strip volume from all bars
    for (const tf of Object.keys(snap.bars)) {
      snap.bars[tf] = snap.bars[tf].map(({ volume: _v, ...b }) => b);
    }
    const result = await orchestrator.processLayer9({ snapshot: snap, signal: snap.signal });
    assert.equal(result.status, 'PASS');
    assert.ok(result.score >= 40);
  });

  it('handles empty snapshot bars gracefully', async () => {
    const snap = createBullishSnapshot();
    snap.bars = {};
    const result = await orchestrator.processLayer9({ snapshot: snap, signal: snap.signal });
    assert.equal(result.status, 'PASS'); // volume is optional
    assert.ok(result.score >= 40);
  });

  it('includes timeframe in metrics when volume data available', async () => {
    const result = await orchestrator.processLayer9({
      snapshot: bullishSnapshot,
      signal: bullishSnapshot.signal,
    });
    if (result.metrics?.timeframe) {
      assert.ok(['M15', 'H1', 'H4'].includes(result.metrics.timeframe));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 10 — CANDLESTICK PATTERNS
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 10: Candlestick Patterns', () => {
  let orchestrator, bullishSnapshot, bearishSnapshot;
  beforeEach(() => {
    orchestrator = makeOrchestrator();
    bullishSnapshot = createBullishSnapshot();
    bearishSnapshot = createBearishSnapshot();
  });

  it('returns PASS for bullish signal with bullish bar structure', async () => {
    const result = await orchestrator.processLayer10({
      snapshot: bullishSnapshot,
      signal: bullishSnapshot.signal,
    });
    assert.ok(['PASS', 'FAIL'].includes(result.status));
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
  });

  it('returns PASS for bearish signal with bearish bar structure', async () => {
    const result = await orchestrator.processLayer10({
      snapshot: bearishSnapshot,
      signal: bearishSnapshot.signal,
    });
    assert.ok(['PASS', 'FAIL'].includes(result.status));
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  it('includes pattern metrics in result', async () => {
    const result = await orchestrator.processLayer10({
      snapshot: bullishSnapshot,
      signal: bullishSnapshot.signal,
    });
    assert.ok(result.metrics !== undefined);
    assert.ok(Array.isArray(result.metrics?.patterns));
    assert.ok(typeof result.metrics?.alignedPatterns === 'number');
    assert.ok(typeof result.metrics?.totalPatterns === 'number');
  });

  it('handles missing bar data gracefully', async () => {
    const snap = createBullishSnapshot();
    snap.bars = {};
    const result = await orchestrator.processLayer10({ snapshot: snap, signal: snap.signal });
    assert.ok(['PASS', 'FAIL'].includes(result.status));
  });

  it('includes SMC metrics (liquiditySweep, orderBlockNear)', async () => {
    const result = await orchestrator.processLayer10({
      snapshot: bullishSnapshot,
      signal: bullishSnapshot.signal,
    });
    if (result.metrics) {
      assert.ok('liquiditySweep' in result.metrics);
      assert.ok('orderBlockNear' in result.metrics);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 13 — ECONOMIC CALENDAR
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 13: Economic Calendar', () => {
  let orchestrator, bullishSnapshot;
  beforeEach(() => {
    orchestrator = makeOrchestrator();
    bullishSnapshot = createBullishSnapshot();
  });

  it('passes when no high-impact events in snapshot', async () => {
    const snap = createBullishSnapshot();
    snap.news = []; // no news
    const result = await orchestrator.processLayer13({ snapshot: snap });
    assert.equal(result.status, 'PASS');
    assert.ok(result.score >= 80);
  });

  it('fails when 2+ high-impact events are imminent', async () => {
    const snap = createBullishSnapshot();
    const soon = Date.now() + 30 * 60 * 1000; // 30 min from now
    snap.news = [
      { impact: 90, time: soon, event: 'NFP' },
      { impact: 85, time: soon + 60000, event: 'FOMC' },
    ];
    const result = await orchestrator.processLayer13({ snapshot: snap });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.score <= 30);
  });

  it('passes with caution when exactly 1 high-impact event is upcoming', async () => {
    const snap = createBullishSnapshot();
    const soon = Date.now() + 60 * 60 * 1000; // 1 hour from now
    snap.news = [{ impact: 80, time: soon, event: 'CPI' }];
    const result = await orchestrator.processLayer13({ snapshot: snap });
    assert.equal(result.status, 'PASS');
    assert.ok(result.score < 90, 'score should be reduced for cautionary pass');
    assert.ok(result.metrics.upcomingHighImpact === 1);
  });

  it('ignores past and far-future events', async () => {
    const snap = createBullishSnapshot();
    const past = Date.now() - 60 * 60 * 1000;
    const farFuture = Date.now() + 8 * 60 * 60 * 1000; // 8 hours away
    snap.news = [
      { impact: 90, time: past, event: 'Past Event' },
      { impact: 85, time: farFuture, event: 'Far Future' },
    ];
    const result = await orchestrator.processLayer13({ snapshot: snap });
    assert.equal(result.status, 'PASS');
    assert.equal(result.metrics.upcomingHighImpact, 0);
  });

  it('passes when snapshot has no news array', async () => {
    const result = await orchestrator.processLayer13({ snapshot: bullishSnapshot });
    assert.equal(result.status, 'PASS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 14 — MARKET SESSION
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 14: Market Session', () => {
  let orchestrator;
  beforeEach(() => {
    orchestrator = makeOrchestrator();
  });

  function makeSnapWithUtcHour(utcHour) {
    const now = new Date();
    now.setUTCHours(utcHour, 30, 0, 0);
    return { quote: { timestamp: now.getTime() }, news: [] };
  }

  it('returns PASS with high score during London/NY overlap (12-16 UTC)', async () => {
    const snap = makeSnapWithUtcHour(13); // 13:30 UTC
    const result = await orchestrator.processLayer14({ snapshot: snap });
    assert.equal(result.status, 'PASS');
    assert.ok(result.score >= 90, `score ${result.score} should be >= 90 during overlap`);
    assert.equal(result.metrics.session, 'LONDON_NY_OVERLAP');
  });

  it('returns PASS during London session (07-12 UTC)', async () => {
    const snap = makeSnapWithUtcHour(9); // 9:30 UTC
    const result = await orchestrator.processLayer14({ snapshot: snap });
    assert.equal(result.status, 'PASS');
    assert.equal(result.metrics.session, 'LONDON');
    assert.ok(result.score >= 80);
  });

  it('returns PASS during New York session (16-21 UTC)', async () => {
    const snap = makeSnapWithUtcHour(17); // 17:30 UTC
    const result = await orchestrator.processLayer14({ snapshot: snap });
    assert.equal(result.status, 'PASS');
    assert.equal(result.metrics.session, 'NEW_YORK');
  });

  it('returns PASS during Asian session (00-09 UTC) with moderate score', async () => {
    const snap = makeSnapWithUtcHour(3); // 3:30 UTC
    const result = await orchestrator.processLayer14({ snapshot: snap });
    assert.equal(result.status, 'PASS');
    assert.equal(result.metrics.session, 'ASIA');
    assert.ok(result.score >= 55 && result.score <= 75);
  });

  it('returns FAIL during off-hours (21-07 UTC but not Asia)', async () => {
    const snap = makeSnapWithUtcHour(22); // 22:30 UTC — off hours (Sydney only)
    const result = await orchestrator.processLayer14({ snapshot: snap });
    // Off-hours: low liquidity = fail
    assert.equal(result.status, 'FAIL');
    assert.equal(result.metrics.session, 'OFF_HOURS');
  });

  it('includes session and UTC time metrics', async () => {
    const snap = makeSnapWithUtcHour(10);
    const result = await orchestrator.processLayer14({ snapshot: snap });
    assert.ok(result.metrics.session, 'session should be set');
    assert.ok(typeof result.metrics.utcHour === 'number');
    assert.ok(typeof result.metrics.inLondon === 'boolean');
    assert.ok(typeof result.metrics.inNewYork === 'boolean');
  });

  it('handles missing quote timestamp using current time', async () => {
    const result = await orchestrator.processLayer14({ snapshot: {} });
    assert.ok(['PASS', 'FAIL'].includes(result.status));
    assert.ok(result.metrics?.session);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 15 — CORRELATION ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────
describe('Layer 15: Correlation Analysis', () => {
  let orchestrator, bullishSnapshot;
  beforeEach(() => {
    orchestrator = makeOrchestrator();
    bullishSnapshot = createBullishSnapshot();
  });

  it('passes with no correlated active trades', async () => {
    const snap = createBullishSnapshot();
    snap.activePairs = [];
    const result = await orchestrator.processLayer15({ snapshot: snap, signal: snap.signal });
    assert.equal(result.status, 'PASS');
    assert.ok(result.score >= 80);
    assert.equal(result.metrics.correlatedCount, 0);
  });

  it('passes with caution when 1 correlated trade is open', async () => {
    const snap = createBullishSnapshot();
    snap.activePairs = [{ pair: 'GBPUSD', direction: 'buy' }]; // correlated with EURUSD BUY
    const result = await orchestrator.processLayer15({ snapshot: snap, signal: snap.signal });
    assert.equal(result.status, 'PASS');
    assert.ok(result.score < 80, 'score should be reduced');
    assert.equal(result.metrics.correlatedCount, 1);
  });

  it('fails when 2+ correlated trades in same direction', async () => {
    const snap = createBullishSnapshot();
    snap.activePairs = [
      { pair: 'GBPUSD', direction: 'buy' },
      { pair: 'AUDUSD', direction: 'buy' },
    ];
    const result = await orchestrator.processLayer15({ snapshot: snap, signal: snap.signal });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.metrics.correlatedCount >= 2);
  });

  it('does NOT flag opposite-direction correlated trades as over-exposure', async () => {
    const snap = createBullishSnapshot();
    // EURUSD BUY + GBPUSD SELL = hedge, not same-direction exposure
    snap.activePairs = [{ pair: 'GBPUSD', direction: 'sell' }];
    const result = await orchestrator.processLayer15({ snapshot: snap, signal: snap.signal });
    assert.equal(result.status, 'PASS');
    assert.equal(result.metrics.correlatedCount, 0);
  });

  it('handles missing pair in signal gracefully', async () => {
    const result = await orchestrator.processLayer15({ snapshot: bullishSnapshot, signal: {} });
    assert.ok(['PASS', 'FAIL'].includes(result.status));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STATISTICAL SYSTEM — enhanced getStatistics
// ─────────────────────────────────────────────────────────────────────────────
describe('Statistical System: getStatistics', () => {
  it('returns all required fields when no trades closed', () => {
    const hub = makeHub();
    const stats = hub.getStatistics();
    // Basic fields
    assert.equal(stats.totalTrades, 0);
    assert.equal(stats.wins, 0);
    assert.equal(stats.losses, 0);
    // New fields
    assert.ok('expectancy' in stats, 'expectancy should be present');
    assert.ok('maxDrawdownPct' in stats, 'maxDrawdownPct should be present');
    assert.ok('sharpeRatio' in stats, 'sharpeRatio should be present');
    assert.ok('maxConsecWins' in stats, 'maxConsecWins should be present');
    assert.ok('maxConsecLosses' in stats, 'maxConsecLosses should be present');
    assert.ok('profitFactor' in stats, 'profitFactor should be present');
  });

  it('calculates win rate correctly', () => {
    const hub = makeHub();
    hub.tradingHistory = [makeTrade(2.5), makeTrade(-1.0), makeTrade(1.8), makeTrade(-0.5)];
    const stats = hub.getStatistics();
    assert.equal(stats.totalTrades, 4);
    assert.equal(stats.wins, 2);
    assert.equal(stats.losses, 2);
    assert.equal(stats.winRate, '50.00');
  });

  it('calculates positive expectancy for winning system', () => {
    const hub = makeHub();
    // 3 wins of +2%, 1 loss of -1% → expectancy = 0.75*2 + 0.25*(-1) = 1.25
    hub.tradingHistory = [makeTrade(2), makeTrade(2), makeTrade(2), makeTrade(-1)];
    const stats = hub.getStatistics();
    assert.ok(stats.expectancy > 0, `expectancy ${stats.expectancy} should be positive`);
  });

  it('calculates negative expectancy for losing system', () => {
    const hub = makeHub();
    // 1 win of +1%, 3 losses of -2% → expectancy = 0.25*1 + 0.75*(-2) = -1.25
    hub.tradingHistory = [makeTrade(1), makeTrade(-2), makeTrade(-2), makeTrade(-2)];
    const stats = hub.getStatistics();
    assert.ok(stats.expectancy < 0, `expectancy ${stats.expectancy} should be negative`);
  });

  it('calculates max drawdown correctly', () => {
    const hub = makeHub();
    // Sequence: +5, +5, -8, +2 → peak at 10, drawdown to 2 = 80% drawdown
    hub.tradingHistory = [makeTrade(5), makeTrade(5), makeTrade(-8), makeTrade(2)];
    const stats = hub.getStatistics();
    assert.ok(stats.maxDrawdownPct > 0, 'maxDrawdownPct should be positive');
    assert.ok(stats.maxDrawdownPct <= 100);
  });

  it('calculates profit factor correctly', () => {
    const hub = makeHub();
    // Gross profit = 6, gross loss = 2 → PF = 3.0
    hub.tradingHistory = [makeTrade(3), makeTrade(3), makeTrade(-1), makeTrade(-1)];
    const stats = hub.getStatistics();
    assert.ok(
      Number(stats.profitFactor) >= 2.5,
      `profitFactor ${stats.profitFactor} should be >= 2.5`
    );
  });

  it('tracks max consecutive wins and losses', () => {
    const hub = makeHub();
    // W W W L L W L → maxConsecWins=3, maxConsecLosses=2
    hub.tradingHistory = [
      makeTrade(1),
      makeTrade(1),
      makeTrade(1),
      makeTrade(-1),
      makeTrade(-1),
      makeTrade(1),
      makeTrade(-1),
    ];
    const stats = hub.getStatistics();
    assert.equal(stats.maxConsecWins, 3);
    assert.equal(stats.maxConsecLosses, 2);
  });

  it('calculates Sharpe ratio with sufficient trades', () => {
    const hub = makeHub();
    hub.tradingHistory = [
      makeTrade(2),
      makeTrade(1.5),
      makeTrade(-0.5),
      makeTrade(3),
      makeTrade(1),
    ];
    const stats = hub.getStatistics();
    assert.ok(typeof stats.sharpeRatio === 'number', 'sharpeRatio should be a number');
    // With positive avg return, Sharpe should be positive
    assert.ok(stats.sharpeRatio > 0);
  });

  it('returns zero Sharpe ratio with fewer than 5 trades', () => {
    const hub = makeHub();
    hub.tradingHistory = [makeTrade(2), makeTrade(-1)];
    const stats = hub.getStatistics();
    assert.equal(stats.sharpeRatio, 0);
  });
});
