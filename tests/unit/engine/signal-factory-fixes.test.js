/**
 * Tests for signal-factory correctness:
 * 1. orchestrationCoordinator is used directly for signal generation
 * 2. validateSignalQuality field mismatch (symbol vs pair, signal vs direction)
 * 3. isTradeable direction check uses signal.signal vs signal.direction
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import SignalFactory from '../../../src/core/engine/signal-factory.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOrchestrationResult(overrides = {}) {
  return {
    success: true,
    signal: {
      pair: 'EURUSD',
      direction: 'BUY',
      confidence: 72,
      strength: 65,
      estimatedWinRate: 78,
      entryPrice: 1.1,
      stopLoss: 1.09,
      takeProfit: 1.12,
      isValid: { isValid: true, checks: {} },
      components: {},
    },
    ...overrides,
  };
}

function makeFactory(orchestrationCoordinatorOverrides = {}) {
  const orchestrationCoordinator = {
    generateSignal: async (_symbol, _opts) => makeOrchestrationResult(),
    ...orchestrationCoordinatorOverrides,
  };

  const layerOrchestrator = {
    processSignal: async () => ({
      layers: new Array(20).fill({ status: 'PASS', score: 80 }),
      layer18Ready: true,
      finalScore: 80,
    }),
  };

  const factory = new SignalFactory({
    orchestrationCoordinator,
    eaBridgeService: null,
    snapshotManager: null,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
  // Replace layerOrchestrator to avoid heavy dependency
  factory.layerOrchestrator = layerOrchestrator;
  return factory;
}

// ── validateSignalQuality ─────────────────────────────────────────────────────

test('validateSignalQuality: accepts signal.direction (current analysis-core format)', () => {
  const factory = makeFactory();
  const result = factory.validateSignalQuality({
    pair: 'EURUSD',
    direction: 'BUY',
    confidence: 75,
  });
  assert.equal(result.valid, true);
});

test('validateSignalQuality: accepts signal.signal (legacy format)', () => {
  const factory = makeFactory();
  const result = factory.validateSignalQuality({
    symbol: 'EURUSD',
    signal: 'SELL',
    confidence: 70,
  });
  assert.equal(result.valid, true);
});

test('validateSignalQuality: rejects when neither pair nor symbol is present', () => {
  const factory = makeFactory();
  const result = factory.validateSignalQuality({
    direction: 'BUY',
    confidence: 75,
  });
  assert.equal(result.valid, false);
  assert.match(result.error, /symbol\/pair/);
});

test('validateSignalQuality: rejects invalid direction', () => {
  const factory = makeFactory();
  const result = factory.validateSignalQuality({
    pair: 'EURUSD',
    direction: 'LONG', // invalid
    confidence: 75,
  });
  assert.equal(result.valid, false);
  assert.match(result.error, /direction/i);
});

test('validateSignalQuality: rejects confidence out of range', () => {
  const factory = makeFactory();
  const result = factory.validateSignalQuality({
    pair: 'EURUSD',
    direction: 'BUY',
    confidence: 150, // >100
  });
  assert.equal(result.valid, false);
});

// ── isTradeable ───────────────────────────────────────────────────────────────

test('isTradeable: accepts signal.direction (current format)', () => {
  const factory = makeFactory();
  const signal = {
    direction: 'BUY',
    confidence: 70,
    entryPrice: 1.1,
    stopLoss: 1.09,
  };
  const layered = { layer18Ready: true };
  assert.equal(factory.isTradeable(signal, layered), true);
});

test('isTradeable: rejects NEUTRAL via signal.direction', () => {
  const factory = makeFactory();
  const signal = {
    direction: 'NEUTRAL',
    confidence: 70,
    entryPrice: 1.1,
    stopLoss: 1.09,
  };
  const layered = { layer18Ready: true };
  assert.equal(factory.isTradeable(signal, layered), false);
});

test('isTradeable: rejects when layer18Ready is false', () => {
  const factory = makeFactory();
  const signal = { direction: 'BUY', confidence: 70, entryPrice: 1.1, stopLoss: 1.09 };
  assert.equal(factory.isTradeable(signal, { layer18Ready: false }), false);
});

// ── generateSignal integration ────────────────────────────────────────────────

test('generateSignal: uses orchestrationCoordinator.generateSignal', async () => {
  let calledWith = null;
  const factory = makeFactory({
    generateSignal: async (symbol, opts) => {
      calledWith = { symbol, opts };
      return makeOrchestrationResult({
        signal: { ...makeOrchestrationResult().signal, pair: symbol },
      });
    },
  });

  const result = await factory.generateSignal({
    broker: 'mt5',
    symbol: 'EURUSD',
    analysisMode: 'ea',
    eaOnly: true,
    requestedBy: 'test-runner',
  });

  assert.equal(result.success, true);
  assert.notEqual(calledWith, null, 'orchestrationCoordinator.generateSignal should be called');
  assert.equal(calledWith.symbol, 'EURUSD');
  assert.equal(calledWith.opts.broker, 'mt5');
  assert.equal(calledWith.opts.analysisMode, 'ea');
  assert.equal(calledWith.opts.eaOnly, true);
  assert.equal(calledWith.opts.requestedBy, 'test-runner');
});

test('generateSignal: returns ORCHESTRATION_UNAVAILABLE when coordinator missing', async () => {
  const factory = new SignalFactory({
    orchestrationCoordinator: null,
    eaBridgeService: null,
    snapshotManager: null,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });

  const result = await factory.generateSignal({ broker: 'mt5', symbol: 'EURUSD' });
  assert.equal(result.success, false);
  assert.equal(result.reason, 'ORCHESTRATION_UNAVAILABLE');
});

test('generateSignal: returns ORCHESTRATION_FAILED when coordinator returns failure', async () => {
  const factory = makeFactory({
    generateSignal: async () => ({ success: false, message: 'no data' }),
  });

  const result = await factory.generateSignal({ broker: 'mt5', symbol: 'EURUSD' });
  assert.equal(result.success, false);
  assert.equal(result.reason, 'ORCHESTRATION_FAILED');
});

test('generateSignal: records error when coordinator throws', async () => {
  const factory = makeFactory({
    generateSignal: async () => {
      throw new Error('connection lost');
    },
  });

  const result = await factory.generateSignal({ broker: 'mt5', symbol: 'EURUSD' });
  assert.equal(result.success, false);
  assert.equal(result.reason, 'PIPELINE_ERROR');
});
