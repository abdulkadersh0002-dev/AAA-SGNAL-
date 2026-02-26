import test from 'node:test';
import assert from 'node:assert/strict';
import { getDecisionState } from '../../../src/core/policy/decision-contract.js';

test('getDecisionState falls back to finalDecision.action BUY/SELL as ENTER', () => {
  const signal = {
    finalDecision: {
      action: 'BUY',
    },
  };

  assert.equal(getDecisionState(signal), 'ENTER');
});

test('getDecisionState falls back to smartExecution.shouldEnterNow when decision payload is absent', () => {
  const enterSignal = {
    components: {
      smartExecution: {
        shouldEnterNow: true,
      },
    },
  };

  const waitSignal = {
    components: {
      smartExecution: {
        shouldEnterNow: false,
      },
    },
  };

  assert.equal(getDecisionState(enterSignal), 'ENTER');
  assert.equal(getDecisionState(waitSignal), 'WAIT_MONITOR');
});

test('getDecisionState supports root smartExecution fallback', () => {
  const enterSignal = {
    smartExecution: {
      shouldEnterNow: true,
    },
  };

  const waitSignal = {
    smartExecution: {
      shouldEnterNow: false,
    },
  };

  assert.equal(getDecisionState(enterSignal), 'ENTER');
  assert.equal(getDecisionState(waitSignal), 'WAIT_MONITOR');
});

test('getDecisionState normalizes WAIT/BLOCKED aliases', () => {
  assert.equal(getDecisionState({ isValid: { decision: { state: 'WAIT' } } }), 'WAIT_MONITOR');
  assert.equal(
    getDecisionState({ isValid: { decision: { state: 'BLOCKED' } } }),
    'NO_TRADE_BLOCKED'
  );
});
