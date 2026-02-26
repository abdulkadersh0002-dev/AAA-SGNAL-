import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradingSignalDTO } from '../../../src/contracts/dtos/schemas/trading-signal.dto.js';

test('createTradingSignalDTO prefers highest-layer decision over early layer decision', () => {
  const raw = {
    pair: 'EURUSD',
    timestamp: Date.now(),
    direction: 'BUY',
    confidence: 74,
    strength: 62,
    finalScore: 58,
    components: {
      layeredAnalysis: {
        layers: [
          {
            layer: 5,
            key: 'L5',
            metrics: {
              decision: {
                state: 'WAIT_MONITOR',
                score: 49,
                blocked: false,
              },
            },
          },
          {
            layer: 20,
            key: 'L20',
            metrics: {
              decision: {
                state: 'ENTER',
                score: 82,
                blocked: false,
              },
            },
          },
        ],
      },
    },
    isValid: {
      isValid: true,
      checks: {},
      reason: 'ok',
    },
  };

  const dto = createTradingSignalDTO(raw);
  assert.equal(dto.isValid?.decision?.state, 'ENTER');
  assert.equal(dto.isValid?.decision?.score, 82);
});
