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
    assert.ok(result.signal.components.smartExecution);
    assert.equal(typeof result.signal.components.smartExecution.shouldEnterNow, 'boolean');
    assert.ok(result.signal.components.smartExecution.entry);
    assert.ok(result.signal.components.smartExecution.exit);
    assert.equal(result.signal.components.layeredAnalysis.layers.length, 1);
  });

  it('builds conservative smart entry plan when spread is high', async () => {
    const orchestrationCoordinator = {
      generateSignal: async (pair) => ({
        success: true,
        signal: {
          pair,
          direction: 'BUY',
          signal: 'BUY',
          timeframe: 'H1',
          confidence: 76,
          strength: 64,
          entryPrice: 1.1,
          stopLoss: 1.098,
          takeProfit: 1.104,
          entry: { price: 1.1, stopLoss: 1.098, takeProfit: 1.104, riskReward: 2.0 },
          isValid: { isValid: true, checks: {}, reason: 'ok', decision: { state: 'ENTER' } },
          components: {},
        },
      }),
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

    const factory = new SignalFactory({
      orchestrationCoordinator,
      snapshotManager,
    });

    factory.layerOrchestrator = {
      processSignal: async () => ({
        layer18Ready: true,
        layers: [
          { layer: 1, key: 'L1', status: 'PASS', metrics: {} },
          { layer: 2, key: 'L2', status: 'PASS', metrics: { spreadPoints: 28 } },
          { layer: 3, key: 'L3', status: 'PASS', metrics: { volatility: 125 } },
          { layer: 11, key: 'L11', status: 'PASS', score: 70, metrics: { confluenceScore: 70 } },
          { layer: 18, key: 'L18', status: 'PASS', metrics: {} },
        ],
      }),
    };

    const result = await factory.generateSignal({
      broker: 'mt5',
      symbol: 'EURUSD',
      source: 'unit-test',
    });

    assert.equal(result.success, true);
    assert.equal(result.signal.components.smartExecution.style, 'retest');
    assert.equal(result.signal.components.smartExecution.shouldEnterNow, false);
    assert.ok(result.signal.components.smartExecution.entry.nearEntryBand > 0);
    assert.ok(result.signal.components.smartExecution.why.thresholds);
    assert.ok(result.signal.components.smartExecution.lifecycle);
    assert.ok(result.signal.components.smartExecution.lifecycle.decisionCooldownMs > 0);
  });

  it('tightens entry decision when execution clearance band is low', async () => {
    const orchestrationCoordinator = {
      generateSignal: async (pair) => ({
        success: true,
        signal: {
          pair,
          direction: 'BUY',
          signal: 'BUY',
          timeframe: 'H1',
          confidence: 70,
          strength: 60,
          entryPrice: 1.1,
          stopLoss: 1.099,
          takeProfit: 1.102,
          entry: { price: 1.1, stopLoss: 1.099, takeProfit: 1.102, riskReward: 2.0 },
          isValid: { isValid: true, checks: {}, reason: 'ok', decision: { state: 'ENTER' } },
          components: {},
        },
      }),
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

    const factory = new SignalFactory({
      orchestrationCoordinator,
      snapshotManager,
    });

    factory.layerOrchestrator = {
      processSignal: async () => ({
        layer18Ready: true,
        layers: [
          { layer: 1, key: 'L1', status: 'PASS', metrics: {} },
          { layer: 2, key: 'L2', status: 'PASS', metrics: { spreadPoints: 19 } },
          { layer: 3, key: 'L3', status: 'PASS', metrics: { volatility: 120 } },
          { layer: 11, key: 'L11', status: 'PASS', score: 75, metrics: { confluenceScore: 75 } },
          {
            layer: 18,
            key: 'L18',
            status: 'PASS',
            metrics: { compositeScore: 66, minCompositeScore: 63 },
          },
          { layer: 19, key: 'L19', status: 'PASS', score: 78, metrics: { clearanceBand: 'LOW' } },
          {
            layer: 20,
            key: 'L20',
            status: 'PASS',
            metrics: {
              executionProfile: {
                urgency: 'patient',
                riskMode: 'balanced',
                protectionBias: 'tight',
                confidenceBand: 'MEDIUM',
              },
            },
          },
        ],
      }),
    };

    const result = await factory.generateSignal({
      broker: 'mt5',
      symbol: 'EURUSD',
      source: 'unit-test',
    });

    assert.equal(result.success, true);
    assert.equal(result.signal.components.smartExecution.shouldEnterNow, false);
    assert.ok(result.signal.components.smartExecution.why.thresholds.minConfidence >= 72);
    assert.equal(result.signal.components.smartExecution.context.layer19ClearanceBand, 'LOW');
  });

  it('applies stricter thresholds for major crosses versus majors', async () => {
    const orchestrationCoordinator = {
      generateSignal: async (pair) => ({
        success: true,
        signal: {
          pair,
          direction: 'BUY',
          signal: 'BUY',
          timeframe: 'H1',
          confidence: 75,
          strength: 65,
          entryPrice: 1.1,
          stopLoss: 1.099,
          takeProfit: 1.102,
          entry: { price: 1.1, stopLoss: 1.099, takeProfit: 1.102, riskReward: 2.0 },
          isValid: { isValid: true, checks: {}, reason: 'ok', decision: { state: 'ENTER' } },
          components: {},
        },
      }),
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

    const factory = new SignalFactory({ orchestrationCoordinator, snapshotManager });
    factory.layerOrchestrator = {
      processSignal: async () => ({
        layer18Ready: true,
        layers: [
          { layer: 1, key: 'L1', status: 'PASS', metrics: {} },
          { layer: 2, key: 'L2', status: 'PASS', metrics: { spreadPoints: 16 } },
          { layer: 3, key: 'L3', status: 'PASS', metrics: { volatility: 100 } },
          { layer: 11, key: 'L11', status: 'PASS', score: 77, metrics: { confluenceScore: 77 } },
          {
            layer: 18,
            key: 'L18',
            status: 'PASS',
            metrics: { compositeScore: 72, minCompositeScore: 60 },
          },
          {
            layer: 19,
            key: 'L19',
            status: 'PASS',
            score: 86,
            metrics: { clearanceBand: 'MEDIUM' },
          },
        ],
      }),
    };

    const major = await factory.generateSignal({
      broker: 'mt5',
      symbol: 'EURUSD',
      source: 'unit-test',
    });
    const cross = await factory.generateSignal({
      broker: 'mt5',
      symbol: 'EURGBP',
      source: 'unit-test',
    });

    assert.equal(major.success, true);
    assert.equal(cross.success, true);
    assert.equal(major.signal.components.smartExecution.why.pairProfile, 'major');
    assert.equal(cross.signal.components.smartExecution.why.pairProfile, 'major_cross');
    assert.ok(
      cross.signal.components.smartExecution.why.thresholds.minConfidence >=
        major.signal.components.smartExecution.why.thresholds.minConfidence
    );
  });

  it('blocks entry when high-impact news is inside blackout window', async () => {
    const orchestrationCoordinator = {
      generateSignal: async (pair) => ({
        success: true,
        signal: {
          pair,
          direction: 'BUY',
          signal: 'BUY',
          timeframe: 'H1',
          confidence: 88,
          strength: 72,
          entryPrice: 1.1,
          stopLoss: 1.099,
          takeProfit: 1.104,
          entry: { price: 1.1, stopLoss: 1.099, takeProfit: 1.104, riskReward: 2.2 },
          isValid: { isValid: true, checks: {}, reason: 'ok', decision: { state: 'ENTER' } },
          components: {
            telemetry: {
              news: {
                nextHighImpactMinutes: 8,
                impactScore: 90,
              },
            },
          },
        },
      }),
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

    const factory = new SignalFactory({ orchestrationCoordinator, snapshotManager });
    factory.layerOrchestrator = {
      processSignal: async () => ({
        layer18Ready: true,
        layers: [
          { layer: 1, key: 'L1', status: 'PASS', metrics: {} },
          { layer: 2, key: 'L2', status: 'PASS', metrics: { spreadPoints: 12 } },
          { layer: 3, key: 'L3', status: 'PASS', metrics: { volatility: 95 } },
          { layer: 11, key: 'L11', status: 'PASS', score: 82, metrics: { confluenceScore: 82 } },
          {
            layer: 18,
            key: 'L18',
            status: 'PASS',
            metrics: { compositeScore: 78, minCompositeScore: 62 },
          },
          { layer: 19, key: 'L19', status: 'PASS', score: 90, metrics: { clearanceBand: 'HIGH' } },
        ],
      }),
    };

    const result = await factory.generateSignal({
      broker: 'mt5',
      symbol: 'GBPUSD',
      source: 'unit-test',
    });

    assert.equal(result.success, true);
    assert.equal(result.signal.components.smartExecution.why.newsGuard.blocked, true);
    assert.equal(result.signal.components.smartExecution.shouldEnterNow, false);
  });
});
