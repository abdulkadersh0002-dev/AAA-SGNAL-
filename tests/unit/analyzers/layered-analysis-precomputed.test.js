import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayeredAnalysis } from '../../../src/core/analyzers/layered-analysis.js';

describe('buildLayeredAnalysis precomputed layers', () => {
  it('formats layeredAnalysis layers when provided', () => {
    const signal = {
      direction: 'BUY',
      layeredAnalysis: {
        layers: [
          {
            layer: 1,
            key: 'L1',
            name: 'Market Data Quality',
            status: 'PASS',
            score: 88,
            confidence: 77,
            metrics: { ageMs: 120 },
            reason: 'Fresh quote data',
          },
        ],
      },
    };

    const result = buildLayeredAnalysis({ scenario: { pair: 'EURUSD' }, signal });
    assert.equal(result.length, 20);

    const layer1 = result[0];
    assert.equal(layer1.nameEn, 'Market Data Quality');
    assert.equal(layer1.status, 'PASS');
    assert.equal(layer1.score, 88);
    assert.equal(layer1.confidence, 77);
    assert.equal(layer1.summaryEn, 'Fresh quote data');
    assert.equal(layer1.metrics.ageMs, 120);
  });

  it('uses signal.layers when layeredAnalysis is missing', () => {
    const signal = {
      direction: 'SELL',
      layers: [
        {
          layer: 2,
          key: 'L2',
          name: 'Spread Analysis',
          status: 'FAIL',
          score: 10,
          confidence: 20,
          metrics: { spreadPoints: 55 },
          reason: 'Spread too wide',
        },
      ],
    };

    const result = buildLayeredAnalysis({ scenario: { pair: 'EURUSD' }, signal });
    const layer2 = result.find((layer) => layer.layer === 2);

    assert.ok(layer2, 'Layer 2 should be present');
    assert.equal(layer2.nameEn, 'Spread Analysis');
    assert.equal(layer2.status, 'FAIL');
    assert.equal(layer2.score, 10);
    assert.equal(layer2.confidence, 20);
    assert.equal(layer2.summaryEn, 'Spread too wide');
    assert.equal(layer2.metrics.spreadPoints, 55);
  });
});
