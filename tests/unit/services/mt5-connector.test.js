import test from 'node:test';
import assert from 'node:assert/strict';
import Mt5Connector from '../../../src/infrastructure/services/brokers/mt5-connector.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

test('computeReconnectDelay applies exponential backoff with jitter control', () => {
  const connector = new Mt5Connector({
    autoReconnect: false,
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 8000,
    reconnectJitterRatio: 0.1,
    random: () => 0.5,
    logger: noopLogger,
  });

  assert.equal(connector.computeReconnectDelay(1), 1000);
  assert.equal(connector.computeReconnectDelay(2), 2000);
  assert.equal(connector.computeReconnectDelay(3), 4000);
});

test('isConnectionStale flags when last success exceeds threshold', () => {
  const connector = new Mt5Connector({
    autoReconnect: false,
    staleThresholdMs: 5000,
    logger: noopLogger,
  });

  connector.connectionState.lastSuccessfulRequest = Date.now() - 6000;
  assert.equal(connector.isConnectionStale(), true);
});
