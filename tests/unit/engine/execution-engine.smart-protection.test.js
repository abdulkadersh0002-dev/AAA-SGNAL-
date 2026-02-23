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
