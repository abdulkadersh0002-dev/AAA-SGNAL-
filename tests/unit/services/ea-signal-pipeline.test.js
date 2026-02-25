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

  it('reuses existing layeredAnalysis when already provided', () => {
    const rawSignal = {
      pair: 'EURUSD',
      direction: 'BUY',
      confidence: 72,
      finalScore: 66,
      isValid: { isValid: true, decision: { state: 'ENTER', score: 70 } },
      components: {
        layeredAnalysis: {
          layer18Ready: true,
          layers: [
            {
              key: 'L1',
              layer: 1,
              status: 'PASS',
              metrics: { spreadPoints: 12 },
            },
          ],
        },
      },
    };

    const result = attachLayeredAnalysisToSignal({ rawSignal, symbol: 'EURUSD', now: Date.now() });

    const layer1 = result.components.layeredAnalysis.layers.find(
      (layer) => String(layer?.key || '').toUpperCase() === 'L1'
    );
    assert.equal(layer1?.metrics?.spreadPoints, 12);
    assert.equal(result.components.layeredAnalysis.layer18Ready, true);
    assert.equal(result.components.layeredAnalysis.layers.length, 20);
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
});
