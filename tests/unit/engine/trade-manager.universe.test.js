import test from 'node:test';
import assert from 'node:assert/strict';
import TradeManager from '../../../src/core/engine/trade-manager.js';

function createTradingEngine(config = {}) {
  return {
    config,
    activeTrades: new Map(),
    getStatistics: () => ({ totalTrades: 0, active: 0 }),
    getRejectionSummary: () => ({}),
    brokerRouter: {
      listConnectorIds: () => ['mt5'],
    },
  };
}

test('TradeManager seeds full forex + metals universe by default', () => {
  const original = process.env.AUTO_TRADING_FULL_FX_METALS_UNIVERSE;
  try {
    delete process.env.AUTO_TRADING_FULL_FX_METALS_UNIVERSE;
    const manager = new TradeManager(createTradingEngine({ autoTrading: {} }));

    assert.equal(manager.configuredPairs.includes('EURUSD'), true);
    assert.equal(manager.configuredPairs.includes('XAUUSD'), false);

    assert.equal(manager.tradingPairs.includes('EURUSD'), true);
    assert.equal(manager.tradingPairs.includes('EURJPY'), true);
    assert.equal(manager.tradingPairs.includes('GBPCHF'), true);
    assert.equal(manager.tradingPairs.includes('NZDJPY'), true);
    assert.equal(manager.tradingPairs.includes('GBPNZD'), true);
    assert.equal(manager.tradingPairs.includes('AUDCHF'), true);
    assert.equal(manager.tradingPairs.includes('NZDCHF'), true);
    assert.equal(manager.tradingPairs.includes('XAUUSD'), true);
    assert.equal(manager.tradingPairs.includes('XAGUSD'), true);
    assert.equal(manager.tradingPairs.length, 31);
  } finally {
    if (original === undefined) {
      delete process.env.AUTO_TRADING_FULL_FX_METALS_UNIVERSE;
    } else {
      process.env.AUTO_TRADING_FULL_FX_METALS_UNIVERSE = original;
    }
  }
});

test('TradeManager can restrict to configured pairs only', () => {
  const original = process.env.AUTO_TRADING_FULL_FX_METALS_UNIVERSE;
  try {
    process.env.AUTO_TRADING_FULL_FX_METALS_UNIVERSE = 'false';
    const manager = new TradeManager(createTradingEngine({ autoTrading: {} }));

    assert.equal(manager.tradingPairs.includes('EURUSD'), true);
    assert.equal(manager.tradingPairs.includes('EURJPY'), false);
    assert.equal(manager.tradingPairs.includes('GBPCHF'), false);
    assert.equal(manager.tradingPairs.includes('XAUUSD'), false);
  } finally {
    if (original === undefined) {
      delete process.env.AUTO_TRADING_FULL_FX_METALS_UNIVERSE;
    } else {
      process.env.AUTO_TRADING_FULL_FX_METALS_UNIVERSE = original;
    }
  }
});
