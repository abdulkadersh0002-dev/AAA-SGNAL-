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

test('evaluateExecutionGate rejects when smartExecution says shouldEnterNow=false', () => {
  const manager = new TradeManager(
    createTradingEngine({
      autoTrading: {
        realtimeRequireLayers18: false,
      },
    })
  );

  const gate = manager.evaluateExecutionGate({
    broker: 'mt5',
    signal: {
      pair: 'EURUSD',
      direction: 'BUY',
      confidence: 80,
      strength: 70,
      isValid: {
        isValid: true,
        decision: {
          state: 'ENTER',
          score: 80,
        },
      },
      components: {
        smartExecution: {
          shouldEnterNow: false,
        },
      },
    },
    source: 'unit-test',
  });

  assert.equal(gate.ok, false);
  assert.match(gate.reason, /shouldEnterNow=false/);
});

test('evaluateExecutionGate allows ENTER when smartExecution says shouldEnterNow=true', () => {
  const manager = new TradeManager(
    createTradingEngine({
      autoTrading: {
        realtimeRequireLayers18: false,
      },
    })
  );

  const gate = manager.evaluateExecutionGate({
    broker: 'mt5',
    signal: {
      pair: 'EURUSD',
      direction: 'BUY',
      confidence: 80,
      strength: 70,
      isValid: {
        isValid: true,
        decision: {
          state: 'ENTER',
          score: 80,
        },
      },
      components: {
        smartExecution: {
          shouldEnterNow: true,
        },
      },
    },
    source: 'unit-test',
  });

  assert.equal(gate.ok, true);
});

test('evaluateExecutionGate rejects when root smartExecution says shouldEnterNow=false', () => {
  const manager = new TradeManager(
    createTradingEngine({
      autoTrading: {
        realtimeRequireLayers18: false,
      },
    })
  );

  const gate = manager.evaluateExecutionGate({
    broker: 'mt5',
    signal: {
      pair: 'EURUSD',
      direction: 'BUY',
      confidence: 80,
      strength: 70,
      isValid: {
        isValid: true,
        decision: {
          state: 'ENTER',
          score: 80,
        },
      },
      smartExecution: {
        shouldEnterNow: false,
      },
    },
    source: 'unit-test',
  });

  assert.equal(gate.ok, false);
  assert.match(gate.reason, /shouldEnterNow=false/);
});
