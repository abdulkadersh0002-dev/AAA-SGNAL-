import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import EaBridgeService from '../../../src/infrastructure/services/brokers/ea-bridge-service.js';

const silentLogger = { info() {}, warn() {}, error() {} };

const buildEnterSignal = () => ({
  broker: 'mt5',
  pair: 'EURUSD',
  direction: 'BUY',
  confidence: 80,
  strength: 80,
  timeframe: 'M15',
  isValid: { isValid: true, decision: { state: 'ENTER', score: 72 } },
  entry: { price: 1.1, stopLoss: 1.09, takeProfit: 1.12, riskReward: 2 },
  entryPrice: 1.1,
  stopLoss: 1.09,
  takeProfit: 1.12,
  components: {
    layeredAnalysis: {
      layers: [
        { key: 'L16', metrics: { verdict: 'PASS' } },
        { key: 'L17', confidence: 80, metrics: { confluenceWeighting: { weightedScore: 80 } } },
        { key: 'L18', metrics: { verdict: 'PASS' } },
        { key: 'L20', metrics: { decision: { state: 'ENTER' } } },
      ],
    },
  },
});

const buildWaitMonitorSignal = () => ({
  broker: 'mt5',
  pair: 'EURUSD',
  direction: 'BUY',
  confidence: 88,
  strength: 84,
  winRate: 82,
  timeframe: 'M15',
  isValid: { isValid: true, decision: { state: 'WAIT_MONITOR', score: 78, blocked: false } },
  entry: { price: 1.1, stopLoss: 1.09, takeProfit: 1.12, riskReward: 2 },
  entryPrice: 1.1,
  stopLoss: 1.09,
  takeProfit: 1.12,
  components: {
    normalizedDecision: { state: 'WAIT_MONITOR', score: 78, blocked: false },
    layeredAnalysis: {
      layers: [
        { key: 'L16', metrics: { verdict: 'PASS', isTradeValid: true } },
        { key: 'L17', confidence: 84, metrics: { confluenceWeighting: { weightedScore: 84 } } },
        { key: 'L18', metrics: { verdict: 'PASS' } },
        { key: 'L20', metrics: { decision: { state: 'WAIT_MONITOR' } } },
      ],
    },
  },
});

describe('EA bridge execution uses precomputed snapshot', () => {
  it('does not call getAnalysisSnapshot when payload.signal is provided', async () => {
    const svc = new EaBridgeService({
      logger: silentLogger,
      tradingEngine: { config: { autoTrading: {} } },
    });

    svc.restrictSymbols = false;

    // Make sure execution can proceed with a fresh real quote.
    svc.getQuotes = () => [
      {
        broker: 'mt5',
        symbol: 'EURUSD',
        bid: 1.1,
        ask: 1.1001,
        receivedAt: Date.now(),
        source: 'ea_tick',
      },
    ];

    svc.getMarketSnapshot = () => ({
      quote: { broker: 'mt5', symbol: 'EURUSD', bid: 1.1, ask: 1.1001, receivedAt: Date.now() },
      timeframes: {},
    });

    // Guard against accidental recompute.
    svc.getAnalysisSnapshot = async () => {
      throw new Error('getAnalysisSnapshot should not be called');
    };

    // Ensure intelligent evaluation approves.
    svc.intelligentTradeManager.evaluateTradeEntry = () => ({ shouldOpen: true, reasons: [] });

    const signal = buildEnterSignal();

    const result = await svc.getSignalForExecution({
      broker: 'mt5',
      symbol: 'EURUSD',
      signal,
    });

    assert.equal(result.success, true);
    assert.equal(result.shouldExecute, true);
    assert.equal(String(result.signal?.isValid?.decision?.state || '').toUpperCase(), 'ENTER');
  });

  it('reuses cached analysis snapshot in getAnalysisSnapshot()', async () => {
    const svc = new EaBridgeService({
      logger: silentLogger,
      tradingEngine: {
        config: { autoTrading: {} },
        generateSignal: async () => {
          throw new Error('generateSignal should not be called');
        },
      },
    });

    svc.restrictSymbols = false;

    const signal = buildEnterSignal();
    svc.cacheAnalysisSnapshot({
      broker: 'mt5',
      symbol: 'EURUSD',
      signal,
      tradeValid: true,
      message: 'OK',
      computedAt: Date.now(),
    });

    const result = await svc.getAnalysisSnapshot({ broker: 'mt5', symbol: 'EURUSD' });

    assert.equal(result.success, true);
    assert.ok(result.signal);
    assert.equal(String(result.signal?.pair || '').toUpperCase(), 'EURUSD');
  });

  it('promotes WAIT_MONITOR to ENTER when promotion policy and structural layers are satisfied', async () => {
    const prevAllowWait = process.env.EA_SIGNAL_ALLOW_WAIT_MONITOR;
    delete process.env.EA_SIGNAL_WAIT_EXEC_REQUIRE_LAYERS18;
    process.env.EA_SIGNAL_ALLOW_WAIT_MONITOR = 'true';

    try {
      const svc = new EaBridgeService({
        logger: silentLogger,
        tradingEngine: { config: { autoTrading: { realtimeRequireLayers18: true } } },
      });

      svc.restrictSymbols = false;

      svc.getQuotes = () => [
        {
          broker: 'mt5',
          symbol: 'EURUSD',
          bid: 1.1,
          ask: 1.1001,
          receivedAt: Date.now(),
          source: 'ea_tick',
        },
      ];

      svc.getMarketSnapshot = () => ({
        quote: { broker: 'mt5', symbol: 'EURUSD', bid: 1.1, ask: 1.1001, receivedAt: Date.now() },
        timeframes: {},
      });

      svc.getAnalysisSnapshot = async () => {
        throw new Error('getAnalysisSnapshot should not be called');
      };

      svc.intelligentTradeManager.evaluateTradeEntry = () => ({ shouldOpen: true, reasons: [] });

      const signal = buildWaitMonitorSignal();
      const result = await svc.getSignalForExecution({
        broker: 'mt5',
        symbol: 'EURUSD',
        signal,
      });

      assert.equal(result.success, true);
      assert.equal(result.shouldExecute, true);
      assert.equal(String(result.signal?.isValid?.decision?.state || '').toUpperCase(), 'ENTER');
      assert.equal(
        String(result.signal?.components?.normalizedDecision?.state || '').toUpperCase(),
        'ENTER'
      );
    } finally {
      if (prevAllowWait == null) {
        delete process.env.EA_SIGNAL_ALLOW_WAIT_MONITOR;
      } else {
        process.env.EA_SIGNAL_ALLOW_WAIT_MONITOR = prevAllowWait;
      }
    }
  });
});
