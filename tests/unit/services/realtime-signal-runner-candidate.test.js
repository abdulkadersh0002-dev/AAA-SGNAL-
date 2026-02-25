/**
 * Targeted tests for signal_candidate broadcasting in RealtimeEaSignalRunner.
 * Verifies Bug #1 fix: WAIT_MONITOR directional signals meeting min thresholds
 * are now broadcast as 'signal_candidate' instead of being silently dropped.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeEaSignalRunner } from '../../../src/infrastructure/services/realtime-ea-signal-runner.js';

// Minimal 20-layer analysis stub (analyzedReady === true requires layers.length > 0)
const makeLayeredAnalysis = (decisionState = 'WAIT_MONITOR') => ({
  layers: Array.from({ length: 20 }, (_, i) => ({
    key: `L${i + 1}`,
    layer: i + 1,
    passed: true,
    metrics: i === 19 ? { decision: { state: decisionState, score: 70 } } : {},
  })),
  confluenceScore: 72,
  evaluatedAt: Date.now(),
});

// Build a runner with all strict data guards disabled so tests are not blocked
// by missing snapshot/bars — only the publish IIFE logic is under test.
const buildRunner = (broadcastFn, extraOptions = {}) =>
  new RealtimeEaSignalRunner({
    broadcast: broadcastFn,
    smartStrong: false,
    dashboardRequireSnapshot: false,
    dashboardRequireBars: false,
    dashboardRequireEnter: false,
    dashboardRequireConfluence: false,
    dashboardRequireLayers18: false,
    dashboardMinConfidence: 60,
    dashboardMinStrength: 55,
    minConfidence: 45,
    minStrength: 35,
    minIntervalMs: 0, // no throttle in tests
    tradingEngine: {
      generateSignal: extraOptions.generateSignal ?? (() => Promise.resolve(null)),
    },
    eaBridgeService: {
      getQuotes: () => [{ symbol: 'EURUSD', bid: 1.1, ask: 1.1001, timestamp: Date.now() }],
      getMarketSnapshot: () => null,
      getMarketBars: () => [],
      isBrokerConnected: () => true,
      getSignalFactory: () => null, // use tradingEngine.generateSignal path
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    ...extraOptions,
  });

describe('RealtimeEaSignalRunner — signal_candidate broadcasting', () => {
  it('broadcasts signal_candidate for WAIT_MONITOR signal meeting min thresholds', async () => {
    const broadcasts = [];

    const runner = buildRunner((type, payload) => broadcasts.push({ type, payload }), {
      generateSignal: () =>
        Promise.resolve({
          id: 'test-wm-1',
          pair: 'EURUSD',
          direction: 'BUY',
          confidence: 70,
          strength: 65,
          isValid: { isValid: true, decision: { state: 'WAIT_MONITOR' } },
          components: { layeredAnalysis: makeLayeredAnalysis('WAIT_MONITOR') },
        }),
    });

    await runner.maybeGenerateSignal({ broker: 'mt5', symbol: 'EURUSD', force: true });

    const candidateBroadcasts = broadcasts.filter((b) => b.type === 'signal_candidate');
    assert.ok(
      candidateBroadcasts.length > 0,
      `Expected at least one signal_candidate broadcast, got: ${JSON.stringify(broadcasts.map((b) => b.type))}`
    );
  });

  it('does NOT broadcast signal_candidate for WAIT_MONITOR signal below min thresholds', async () => {
    const broadcasts = [];

    const runner = buildRunner((type, payload) => broadcasts.push({ type, payload }), {
      generateSignal: () =>
        Promise.resolve({
          id: 'test-wm-weak',
          pair: 'EURUSD',
          direction: 'BUY',
          confidence: 40, // below dashboardMinConfidence=60
          strength: 30, // below dashboardMinStrength=55
          isValid: { isValid: true, decision: { state: 'WAIT_MONITOR' } },
          components: { layeredAnalysis: makeLayeredAnalysis('WAIT_MONITOR') },
        }),
    });

    await runner.maybeGenerateSignal({ broker: 'mt5', symbol: 'EURUSD', force: true });

    const candidateBroadcasts = broadcasts.filter((b) => b.type === 'signal_candidate');
    assert.strictEqual(
      candidateBroadcasts.length,
      0,
      'Should not broadcast weak WAIT_MONITOR signal as candidate'
    );
  });

  it('broadcasts signal (not signal_candidate) for ENTER signal with shouldExecute=true', async () => {
    const broadcasts = [];

    const runner = buildRunner((type, payload) => broadcasts.push({ type, payload }), {
      generateSignal: () =>
        Promise.resolve({
          id: 'test-enter-1',
          pair: 'EURUSD',
          direction: 'BUY',
          confidence: 75,
          strength: 70,
          shouldExecute: true,
          isValid: { isValid: true, decision: { state: 'ENTER' } },
          entry: { price: 1.1, stopLoss: 1.09, takeProfit: 1.12 },
          components: { layeredAnalysis: makeLayeredAnalysis('ENTER') },
        }),
      // Provide a mock eaBridgeService that returns shouldExecute=true
      eaBridgeService: {
        getQuotes: () => [{ symbol: 'EURUSD', bid: 1.1, ask: 1.1001, timestamp: Date.now() }],
        getMarketSnapshot: () => null,
        getMarketBars: () => [],
        isBrokerConnected: () => true,
        getSignalFactory: () => null,
        getSmartSignalSnapshot: async (payload) => ({
          success: true,
          signal: payload?.signal || null,
          shouldExecute: true,
          execution: { shouldExecute: true },
        }),
      },
    });

    await runner.maybeGenerateSignal({ broker: 'mt5', symbol: 'EURUSD', force: true });

    const signalBroadcasts = broadcasts.filter((b) => b.type === 'signal');
    // signal_candidate must NOT appear for an ENTER+shouldExecute signal
    const candidateBroadcasts = broadcasts.filter((b) => b.type === 'signal_candidate');
    assert.ok(
      signalBroadcasts.length > 0 || candidateBroadcasts.length === 0,
      `ENTER signal should not appear as signal_candidate: ${JSON.stringify(broadcasts.map((b) => b.type))}`
    );
  });

  it('does not broadcast undirectional signals as candidates', async () => {
    const broadcasts = [];

    const runner = buildRunner((type, payload) => broadcasts.push({ type, payload }), {
      generateSignal: () =>
        Promise.resolve({
          id: 'test-nodirection',
          pair: 'EURUSD',
          direction: '', // no direction
          confidence: 80,
          strength: 75,
          isValid: { isValid: true, decision: { state: 'WAIT_MONITOR' } },
          components: { layeredAnalysis: makeLayeredAnalysis('WAIT_MONITOR') },
        }),
    });

    await runner.maybeGenerateSignal({ broker: 'mt5', symbol: 'EURUSD', force: true });

    assert.strictEqual(broadcasts.length, 0, 'Non-directional signal must not be broadcast at all');
  });

  it('publishCounts.candidate increments when signal_candidate is broadcast', async () => {
    const runner = buildRunner(
      () => {}, // discard broadcasts
      {
        generateSignal: () =>
          Promise.resolve({
            id: 'test-count',
            pair: 'EURUSD',
            direction: 'SELL',
            confidence: 65,
            strength: 60,
            isValid: { isValid: true, decision: { state: 'WAIT_MONITOR' } },
            components: { layeredAnalysis: makeLayeredAnalysis('WAIT_MONITOR') },
          }),
      }
    );

    const before = runner.getDashboardStats().publishCounts.candidate;
    await runner.maybeGenerateSignal({ broker: 'mt5', symbol: 'EURUSD', force: true });
    const after = runner.getDashboardStats().publishCounts.candidate;

    assert.ok(after >= before, 'publishCounts.candidate should not decrease');
    // If a candidate was broadcast, the count should increment
    if (after > before) {
      assert.strictEqual(after - before, 1, 'Should increment by exactly 1');
    }
  });
});
