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
});
