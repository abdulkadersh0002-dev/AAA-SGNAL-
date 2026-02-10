import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import brokerRoutes from '../../src/routes/broker-routes.js';
import { requestIdMiddleware } from '../../src/middleware/request-id.js';
import { createErrorHandler } from '../../src/middleware/error-handler.js';

async function startEphemeralServer(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  if (!port) {
    server.close();
    throw new Error('Unable to determine ephemeral port');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

describe('Broker routes (integration)', () => {
  let server;
  let baseUrl;

  afterEach(async () => {
    if (!server) {
      return;
    }
    await new Promise((resolve) => server.close(resolve));
    server = null;
    baseUrl = null;
  });

  it('returns 503 with requestId when broker routing disabled', async () => {
    const app = express();
    app.use(requestIdMiddleware());
    app.use(express.json());

    const router = brokerRoutes({
      tradingEngine: { activeTrades: new Map() },
      brokerRouter: {
        getStatus: () => ({ ok: true }),
        getHealthSnapshots: async () => [],
      },
      auditLogger: { record: async () => {} },
      logger: createLogger(),
      config: { brokerRouting: { enabled: false } },
      requireBrokerRead: (req, res, next) => next(),
      requireBrokerWrite: (req, res, next) => next(),
    });

    app.use('/api', router);
    app.use(createErrorHandler({ logger: createLogger() }));

    const started = await startEphemeralServer(app);
    server = started.server;
    baseUrl = started.baseUrl;

    const res = await fetch(`${baseUrl}/api/broker/status`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(body.requestId);
  });

  it('maps probeConnector errors and supports success response', async () => {
    const app = express();
    app.use(requestIdMiddleware());
    app.use(express.json());

    const brokerRouter = {
      defaultBroker: 'mt5',
      getStatus: () => ({ routing: 'ok' }),
      getHealthSnapshots: async () => [{ id: 'mt5', ok: true }],
      probeConnector: async (id) => {
        if (id === 'unknown') {
          const err = new Error('Unknown connector');
          err.code = 'UNKNOWN_CONNECTOR';
          throw err;
        }
        return { id, ok: true };
      },
    };

    const router = brokerRoutes({
      tradingEngine: { activeTrades: new Map() },
      brokerRouter,
      auditLogger: { record: async () => {} },
      logger: createLogger(),
      config: { brokerRouting: { enabled: true } },
      requireBrokerRead: (req, res, next) => next(),
      requireBrokerWrite: (req, res, next) => next(),
    });

    app.use('/api', router);
    app.use(createErrorHandler({ logger: createLogger() }));

    const started = await startEphemeralServer(app);
    server = started.server;
    baseUrl = started.baseUrl;

    const statusRes = await fetch(`${baseUrl}/api/broker/status`);
    assert.equal(statusRes.status, 200);
    const statusBody = await statusRes.json();
    assert.equal(statusBody.success, true);
    assert.ok(statusBody.requestId);
    assert.ok(statusBody.status);
    assert.ok(statusBody.health);

    const missing = await fetch(`${baseUrl}/api/broker/connectors/unknown/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'connect' }),
    });
    assert.equal(missing.status, 404);
    const missingBody = await missing.json();
    assert.equal(missingBody.success, false);
    assert.ok(missingBody.requestId);
  });

  it('resets circuit breakers (all + per-broker)', async () => {
    const app = express();
    app.use(requestIdMiddleware());
    app.use(express.json());

    const calls = [];
    const brokerRouter = {
      defaultBroker: 'mt5',
      getStatus: () => ({ routing: 'ok', breakers: [] }),
      getHealthSnapshots: async () => [{ id: 'mt5', ok: true }],
      resetAllBreakers: () => {
        calls.push({ kind: 'all' });
        return {
          before: [{ broker: 'mt5', active: true }],
          after: [{ broker: 'mt5', active: false }],
        };
      },
      resetBreaker: (broker) => {
        calls.push({ kind: 'one', broker });
        return { broker, active: false, failures: 0 };
      },
    };

    const router = brokerRoutes({
      tradingEngine: { activeTrades: new Map() },
      brokerRouter,
      auditLogger: { record: async () => {} },
      logger: createLogger(),
      config: { brokerRouting: { enabled: true } },
      requireBrokerRead: (req, res, next) => next(),
      requireBrokerWrite: (req, res, next) => next(),
    });

    app.use('/api', router);
    app.use(createErrorHandler({ logger: createLogger() }));

    const started = await startEphemeralServer(app);
    server = started.server;
    baseUrl = started.baseUrl;

    const resAll = await fetch(`${baseUrl}/api/broker/circuit/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    assert.equal(resAll.status, 200);
    const bodyAll = await resAll.json();
    assert.equal(bodyAll.success, true);
    assert.ok(bodyAll.requestId);

    const resOne = await fetch(`${baseUrl}/api/broker/circuit/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ broker: 'mt5' }),
    });
    assert.equal(resOne.status, 200);
    const bodyOne = await resOne.json();
    assert.equal(bodyOne.success, true);
    assert.ok(bodyOne.requestId);

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { kind: 'all' });
    assert.deepEqual(calls[1], { kind: 'one', broker: 'mt5' });
  });
});
