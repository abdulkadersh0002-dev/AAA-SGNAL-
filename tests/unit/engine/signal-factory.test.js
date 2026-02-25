import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import SignalFactory from '../../../src/core/engine/signal-factory.js';

describe('SignalFactory (unit)', () => {
  it('passes EA options and attaches layered analysis to components', async () => {
    let captured = null;
    const orchestrationCoordinator = {
      generateSignal: async (pair, options = {}) => {
        captured = { pair, options };
        return {
          success: true,
          signal: {
            pair,
            direction: 'BUY',
            signal: 'BUY',
            timeframe: 'H1',
            confidence: 72,
            strength: 60,
            entryPrice: 1.1,
            stopLoss: 1.09,
            takeProfit: 1.12,
            entry: { price: 1.1, stopLoss: 1.09, takeProfit: 1.12, riskReward: 1.7 },
            isValid: { isValid: true, checks: {}, reason: 'ok', decision: { state: 'ENTER' } },
            components: {},
          },
        };
      },
    };

    const snapshotManager = {
      getSnapshot: () => null,
      createSnapshot: ({ broker, symbol }) => ({
        broker,
        symbol,
        updatedAt: Date.now(),
      }),
      updateSnapshot: () => {},
    };

    const eaBridgeService = { id: 'ea-bridge' };
    const factory = new SignalFactory({
      orchestrationCoordinator,
      snapshotManager,
      eaBridgeService,
    });

    factory.layerOrchestrator = {
      processSignal: async () => ({
        layer18Ready: true,
        layers: [{ layer: 1, key: 'L1', status: 'PASS', metrics: {} }],
      }),
    };

    const result = await factory.generateSignal({
      broker: 'mt5',
      symbol: 'EURUSD',
      analysisMode: 'ea',
      eaOnly: true,
      source: 'unit-test',
    });

    assert.equal(captured.pair, 'EURUSD');
    assert.equal(captured.options.analysisMode, 'ea');
    assert.equal(captured.options.eaOnly, true);
    assert.equal(captured.options.broker, 'mt5');
    assert.equal(captured.options.source, 'unit-test');
    assert.equal(captured.options.eaBridgeService, eaBridgeService);
    assert.ok(result.signal.components.layeredAnalysis);
    assert.equal(result.signal.components.layeredAnalysis.layers.length, 1);
  });
});
