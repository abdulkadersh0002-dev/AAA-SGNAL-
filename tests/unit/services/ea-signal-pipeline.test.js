import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachLayeredAnalysisToSignal,
  evaluateLayers18Readiness,
} from '../../../src/infrastructure/services/ea-signal-pipeline.js';

describe('EA signal pipeline layered context', () => {
  it('attaches pairContext, entryContext, expectedMarketBehavior, invalidationRules', () => {
    const rawSignal = {
      pair: 'EURUSD',
      direction: 'BUY',
      confidence: 70,
      finalScore: 65,
      isValid: { isValid: true, decision: { state: 'ENTER', score: 72 } },
      components: {},
    };

    const result = attachLayeredAnalysisToSignal({ rawSignal, symbol: 'EURUSD', now: Date.now() });

    assert.ok(result.components.pairContext);
    assert.ok(result.components.entryContext);
    assert.ok(result.components.expectedMarketBehavior);
    assert.ok(Array.isArray(result.components.invalidationRules));
    assert.ok(result.components.invalidationRules.length > 0);

    assert.ok(result.components.layeredAnalysis);
    assert.ok(Array.isArray(result.components.layeredAnalysis.layers));
    assert.equal(result.components.layeredAnalysis.layers.length, 20);
    assert.ok(
      result.components.layeredAnalysis.layers.some(
        (layer) => String(layer?.key || '').toUpperCase() === 'L20'
      )
    );
  });

  it('blocks execution readiness when layers are missing (no overrides)', () => {
    const result = evaluateLayers18Readiness({
      layeredAnalysis: { layers: [] },
      minConfluence: 60,
      decisionStateFallback: 'ENTER',
      allowStrongOverride: true,
      signal: {
        direction: 'BUY',
        confidence: 92,
        strength: 80,
        isValid: { isValid: true, decision: { state: 'ENTER' } },
        entry: { price: 1.1, stopLoss: 1.09, takeProfit: 1.12 },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.strongOverride, undefined);
  });

  it('returns ok only when L16 PASS + L17>=min + L18 PASS + L20 ENTER', () => {
    const result = evaluateLayers18Readiness({
      layeredAnalysis: {
        layers: [
          { key: 'L16', metrics: { verdict: 'PASS' } },
          { key: 'L17', confidence: 72, metrics: { confluenceWeighting: { weightedScore: 72 } } },
          { key: 'L18', metrics: { verdict: 'PASS' } },
          { key: 'L20', metrics: { decision: { state: 'ENTER' } } },
        ],
      },
      minConfluence: 60,
      decisionStateFallback: 'ENTER',
      allowStrongOverride: false,
      signal: {
        direction: 'BUY',
        confidence: 92,
        strength: 80,
        isValid: { isValid: true, decision: { state: 'ENTER' } },
        entry: { price: 1.1, stopLoss: 1.09, takeProfit: 1.12 },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.layer16Pass, true);
    assert.equal(result.layer17Ok, true);
    assert.equal(result.layer18Pass, true);
    assert.equal(result.layer20State, 'ENTER');
    assert.equal(result.strongOverride, undefined);
  });

  it('blocks execution readiness when L18 is not PASS (gate blocks)', () => {
    const result = evaluateLayers18Readiness({
      layeredAnalysis: {
        layers: [
          { key: 'L16', metrics: { verdict: 'PASS' } },
          { key: 'L17', confidence: 90, metrics: { confluenceWeighting: { weightedScore: 90 } } },
          { key: 'L18', metrics: { verdict: 'BLOCK' } },
          { key: 'L20', metrics: { decision: { state: 'ENTER' } } },
        ],
      },
      minConfluence: 60,
      decisionStateFallback: 'ENTER',
      allowStrongOverride: true,
      signal: {
        direction: 'BUY',
        confidence: 90,
        strength: 75,
        isValid: { isValid: true, decision: { state: 'ENTER' } },
        entry: { price: 1.1, stopLoss: 1.09, takeProfit: 1.12 },
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.layer18Pass, false);
    assert.equal(result.layer20State, 'ENTER');
    assert.equal(result.strongOverride, undefined);
  });

  // ── LayerOrchestrator format tests (status-based, no metrics.verdict) ──

  it('accepts LayerOrchestrator format: status:PASS on L16/L17/L18 with decisionState fallback', () => {
    // LayerOrchestrator layers use { status: 'PASS', confidence: number } format
    // (no metrics.verdict, no metrics.isTradeValid)
    const result = evaluateLayers18Readiness({
      layeredAnalysis: {
        layers: [
          {
            key: 'L16',
            status: 'PASS',
            score: 2.2,
            confidence: 85,
            metrics: { riskRewardRatio: 2.2 },
          },
          {
            key: 'L17',
            status: 'PASS',
            score: 95,
            confidence: 90,
            metrics: { positionSize: 0.01 },
          },
          {
            key: 'L18',
            status: 'PASS',
            score: 78,
            confidence: 88,
            metrics: { compositeScore: 78 },
          },
          {
            key: 'L20',
            status: 'PASS',
            score: 85,
            confidence: 85,
            metrics: { executionProfile: { urgency: 'normal' } },
          },
        ],
      },
      minConfluence: 60,
      decisionStateFallback: 'ENTER',
      signal: {
        direction: 'BUY',
        confidence: 85,
        isValid: { isValid: true, decision: { state: 'ENTER' } },
      },
    });

    assert.equal(result.ok, true, 'LayerOrchestrator format should pass evaluateLayers18Readiness');
    assert.equal(result.layer16Pass, true);
    assert.equal(result.layer17Ok, true);
    assert.equal(result.layer18Pass, true);
    assert.equal(result.layer20State, 'ENTER');
  });

  it('blocks in LayerOrchestrator format when L18 status is FAIL', () => {
    const result = evaluateLayers18Readiness({
      layeredAnalysis: {
        layers: [
          { key: 'L16', status: 'PASS', confidence: 85, metrics: {} },
          { key: 'L17', status: 'PASS', confidence: 90, metrics: {} },
          { key: 'L18', status: 'FAIL', confidence: 60, metrics: { compositeScore: 45 } },
          { key: 'L20', status: 'PASS', confidence: 80, metrics: {} },
        ],
      },
      minConfluence: 60,
      decisionStateFallback: 'ENTER',
      signal: { isValid: { isValid: false, decision: { state: 'ENTER' } } },
    });

    assert.equal(result.ok, false);
    assert.equal(result.layer18Pass, false);
  });
});
