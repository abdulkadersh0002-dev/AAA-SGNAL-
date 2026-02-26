import test from 'node:test';
import assert from 'node:assert/strict';
import { executionEngine } from '../../../src/core/engine/modules/execution-engine.js';

function createEngine() {
  return { ...executionEngine };
}

test('getTradeRiskDistance returns positive distance for valid trade', () => {
  const engine = createEngine();
  const trade = { entryPrice: 1.1, stopLoss: 1.0985 };
  const distance = engine.getTradeRiskDistance(trade);
  assert.ok(Math.abs(distance - 0.0015) < 1e-10);
});

test('getCurrentRMultiple handles BUY and SELL correctly', () => {
  const engine = createEngine();

  const buyTrade = { direction: 'BUY', entryPrice: 1.1, stopLoss: 1.099 };
  const sellTrade = { direction: 'SELL', entryPrice: 1.1, stopLoss: 1.101 };

  const buyR = engine.getCurrentRMultiple(buyTrade, 1.1015);
  const sellR = engine.getCurrentRMultiple(sellTrade, 1.0985);
  assert.ok(Math.abs(buyR - 1.5) < 1e-9);
  assert.ok(Math.abs(sellR - 1.5) < 1e-9);
});

test('applySmartProfitProtection moves to breakeven around 1R', () => {
  const engine = createEngine();
  const trade = {
    direction: 'BUY',
    entryPrice: 1.1,
    stopLoss: 1.099,
    trailingStop: { enabled: false },
    movedToBreakeven: false,
  };

  const result = engine.applySmartProfitProtection(trade, 1.10101);

  assert.equal(result.applied, true);
  assert.equal(result.reason, 'breakeven_1_0r');
  assert.equal(trade.stopLoss, 1.1);
  assert.equal(trade.trailingStop.enabled, true);
  assert.equal(trade.movedToBreakeven, true);
});

test('applySmartProfitProtection locks profit around 1.5R', () => {
  const engine = createEngine();
  const trade = {
    direction: 'BUY',
    entryPrice: 1.1,
    stopLoss: 1.099,
    trailingStop: { enabled: false, activationAtFraction: 0.6, breakevenAtFraction: 0.5 },
  };

  const result = engine.applySmartProfitProtection(trade, 1.10151);

  assert.equal(result.applied, true);
  assert.equal(result.reason, 'lock_profit_1_5r');
  assert.equal(trade.stopLoss, 1.10035);
  assert.equal(trade.trailingStop.enabled, true);
  assert.equal(trade.trailingStop.activationAtFraction, 0.45);
  assert.equal(trade.trailingStop.breakevenAtFraction, 0.35);
});

test('applySmartProfitProtection tightens trailing and locks more at 2.2R', () => {
  const engine = createEngine();
  const trade = {
    direction: 'BUY',
    entryPrice: 1.1,
    stopLoss: 1.099,
    trailingStop: { enabled: true, trailingDistance: 0.001 },
  };

  const result = engine.applySmartProfitProtection(trade, 1.10221);

  assert.equal(result.applied, true);
  assert.equal(result.reason, 'lock_profit_2_2r');
  assert.equal(trade.stopLoss, 1.1011);
  assert.equal(trade.trailingStop.enabled, true);
  assert.equal(trade.trailingStop.trailingDistance, 0.00075);
});

test('applySmartProfitProtection with TIGHT bias protects earlier than baseline', () => {
  const engine = createEngine();
  const trade = {
    direction: 'BUY',
    entryPrice: 1.1,
    stopLoss: 1.099,
    trailingStop: { enabled: false },
    executionProfile: {
      urgency: 'normal',
      riskMode: 'balanced',
      protectionBias: 'tight',
      confidenceBand: 'MEDIUM',
    },
  };

  const result = engine.applySmartProfitProtection(trade, 1.10095);

  assert.equal(result.applied, true);
  assert.equal(result.reason, 'breakeven_1_0r');
  assert.ok(trade.stopLoss > 1.1);
  assert.equal(trade.trailingStop.enabled, true);
});

test('applySmartProfitProtection with OFFENSIVE profile lets winners run longer', () => {
  const engine = createEngine();
  const trade = {
    direction: 'BUY',
    entryPrice: 1.1,
    stopLoss: 1.099,
    trailingStop: { enabled: true, trailingDistance: 0.001 },
    executionProfile: {
      urgency: 'patient',
      riskMode: 'offensive',
      protectionBias: 'adaptive',
      confidenceBand: 'HIGH',
    },
    entryContext: {
      confluenceScore: 85,
      volatilityState: 'normal',
      newsImpact: 1,
    },
  };

  const result = engine.applySmartProfitProtection(trade, 1.10221);

  assert.equal(result.applied, true);
  assert.equal(result.reason, 'lock_profit_1_5r');
  assert.ok(trade.stopLoss > 1.1);
  assert.ok(trade.stopLoss < 1.1011);
});

test('updateLiveTradeIntelligence tracks favorable R and drawdown', () => {
  const engine = createEngine();
  const trade = {
    direction: 'BUY',
    entryPrice: 1.1,
    stopLoss: 1.099,
    lifecycleIntelligence: {
      maxFavorableR: null,
      maxAdverseR: null,
      drawdownFromPeakR: 0,
      lastRMultiple: null,
      momentumScore: null,
      lastPrice: null,
      priceTape: [],
    },
  };

  const first = engine.updateLiveTradeIntelligence(trade, 1.1015);
  const second = engine.updateLiveTradeIntelligence(trade, 1.1008);

  assert.ok(first.rMultiple > 1.4);
  assert.ok(second.rMultiple > 0.7);
  assert.ok(trade.lifecycleIntelligence.maxFavorableR >= first.rMultiple);
  assert.ok(trade.lifecycleIntelligence.drawdownFromPeakR > 0);
});

test('decideAdaptiveLifecycleAction exits on large profit giveback', () => {
  const engine = createEngine();
  const trade = {
    direction: 'BUY',
    smartExecution: { exit: { trailStartRR: 0.9 } },
  };

  const action = engine.decideAdaptiveLifecycleAction(trade, {
    rMultiple: 0.45,
    maxFavorableR: 1.5,
    drawdownFromPeakR: 1.05,
    momentumScore: -0.00004,
  });

  assert.equal(action?.action, 'close');
  assert.equal(action?.reason, 'adaptive_profit_giveback_exit');
});

test('decideAdaptiveLifecycleAction honors lifecycle config and cooldown', () => {
  const engine = createEngine();
  const now = Date.now();
  const trade = {
    direction: 'BUY',
    openTime: now - 30 * 60 * 1000,
    smartExecution: {
      lifecycle: {
        hardRiskBreachR: -0.8,
        givebackMinPeakR: 1.1,
        profitGivebackExitR: 0.5,
        decisionCooldownMs: 15000,
      },
    },
    lifecycleIntelligence: {
      lastAdaptiveActionAt: now,
    },
  };

  const blocked = engine.decideAdaptiveLifecycleAction(trade, {
    rMultiple: -0.95,
    maxFavorableR: 1.3,
    drawdownFromPeakR: 0.9,
    momentumScore: -0.00002,
    consecutiveNegativeMomentum: 3,
  });
  assert.equal(blocked, null);

  trade.lifecycleIntelligence.lastAdaptiveActionAt = now - 20000;
  const allowed = engine.decideAdaptiveLifecycleAction(trade, {
    rMultiple: -0.95,
    maxFavorableR: 1.3,
    drawdownFromPeakR: 0.9,
    momentumScore: -0.00002,
    consecutiveNegativeMomentum: 3,
  });

  assert.equal(allowed?.action, 'close');
  assert.equal(allowed?.reason, 'adaptive_hard_risk_breach');
});

test('decideAdaptiveLifecycleAction exits stale trade when momentum stays weak', () => {
  const engine = createEngine();
  const trade = {
    direction: 'BUY',
    openTime: Date.now() - 150 * 60 * 1000,
    smartExecution: {
      lifecycle: {
        staleTradeMinutes: 90,
        staleMinR: 0.2,
      },
    },
    lifecycleIntelligence: {
      lastAdaptiveActionAt: Date.now() - 180000,
    },
  };

  const action = engine.decideAdaptiveLifecycleAction(trade, {
    rMultiple: 0.1,
    maxFavorableR: 0.45,
    drawdownFromPeakR: 0.35,
    momentumScore: -0.00001,
    consecutiveNegativeMomentum: 3,
  });

  assert.equal(action?.action, 'close');
  assert.equal(action?.reason, 'adaptive_stale_trade_exit');
});
