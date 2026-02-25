import BaseBrokerConnector from './base-connector.js';
import { appConfig } from '../../../app/config.js';

class Mt5Connector extends BaseBrokerConnector {
  constructor(options = {}) {
    const brokerConfig = appConfig.brokers?.mt5 || {};
    const baseURL = options.baseUrl || brokerConfig.baseUrl || 'http://127.0.0.1:5002/api';
    super({
      name: 'mt5',
      accountMode: options.accountMode === 'real' ? 'real' : 'demo',
      logger: options.logger,
      httpOptions: {
        baseURL,
        timeout: options.timeout || 10000, // Increased timeout from 5s to 10s
        headers: {
          'Content-Type': 'application/json',
        },
      },
    });
    this.apiKey = options.apiKey || brokerConfig.apiKey || null;
    this.expectedAccount = options.accountNumber || brokerConfig.accountNumber || null;
    this.random = typeof options.random === 'function' ? options.random : Math.random;

    // Connection monitoring and auto-reconnect
    this.connectionState = {
      connected: false,
      lastHealthCheck: null,
      consecutiveFailures: 0,
      lastSuccessfulRequest: Date.now(),
      lastFailureAt: null,
      lastFailureReason: null,
      lastReconnectAttempt: null,
      reconnecting: false,
    };

    // Reconnection strategy with exponential backoff
    this.reconnectConfig = {
      enabled: options.autoReconnect !== false,
      maxRetries: options.maxReconnectRetries || 5,
      failureThreshold: options.reconnectFailureThreshold || 3,
      baseDelayMs: options.reconnectBaseDelay || 2000,
      maxDelayMs: options.reconnectMaxDelay || 30000,
      staleThresholdMs: options.staleThresholdMs || 90000,
      jitterRatio: options.reconnectJitterRatio || 0.2,
      healthCheckIntervalMs: options.healthCheckInterval || 30000,
    };

    this.healthCheckInProgress = false;

    // Start health check monitoring if enabled
    if (this.reconnectConfig.enabled) {
      this.startHealthCheckMonitoring();
    }
  }

  /**
   * Start periodic health check monitoring with auto-reconnect on failure
   */
  startHealthCheckMonitoring() {
    if (this.healthCheckTimer) {
      return; // Already running
    }

    const runHealthCheck = async () => {
      if (this.healthCheckInProgress) {
        return;
      }
      this.healthCheckInProgress = true;
      try {
        const result = await this.healthCheck();

        if (result.connected) {
          this.connectionState.connected = true;
          this.connectionState.consecutiveFailures = 0;
          this.connectionState.lastSuccessfulRequest = Date.now();
        } else {
          this.connectionState.connected = false;

          // Trigger auto-reconnect if threshold exceeded
          if (
            this.connectionState.consecutiveFailures >= this.reconnectConfig.failureThreshold ||
            result.stale
          ) {
            this.logger?.warn?.(
              { broker: this.name, failures: this.connectionState.consecutiveFailures },
              'MT5 connection lost, attempting auto-reconnect'
            );
            await this.attemptAutoReconnect();
          }
        }

        this.connectionState.lastHealthCheck = Date.now();
      } catch (error) {
        this.logger?.error?.({ err: error, broker: this.name }, 'Health check error');
      } finally {
        this.healthCheckInProgress = false;
      }
    };

    // Run initial check immediately
    runHealthCheck();

    // Schedule periodic checks
    this.healthCheckTimer = setInterval(
      () => runHealthCheck(),
      this.reconnectConfig.healthCheckIntervalMs
    );
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheckMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Attempt auto-reconnect with exponential backoff
   */
  async attemptAutoReconnect() {
    if (!this.reconnectConfig.enabled) {
      return;
    }
    if (this.connectionState.reconnecting) {
      return false;
    }

    this.connectionState.reconnecting = true;
    let attempt = 0;
    try {
      while (attempt < this.reconnectConfig.maxRetries) {
        attempt += 1;

        const delayMs = this.computeReconnectDelay(attempt);
        this.connectionState.lastReconnectAttempt = Date.now();

        this.logger?.info?.({ broker: this.name, attempt, delayMs }, 'Attempting MT5 reconnection');

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        try {
          const result = await this.connect({ forceReconnect: true });

          if (result?.connected || result?.success) {
            this.logger?.info?.({ broker: this.name, attempt }, 'MT5 reconnection successful');
            this.recordRequestSuccess();
            return true;
          }
        } catch (error) {
          this.recordRequestFailure(error, 'reconnect_attempt');
          this.logger?.warn?.(
            { err: error, broker: this.name, attempt },
            'MT5 reconnection attempt failed'
          );
        }
      }

      this.logger?.error?.(
        { broker: this.name, maxRetries: this.reconnectConfig.maxRetries },
        'MT5 reconnection failed after max retries'
      );
      return false;
    } finally {
      this.connectionState.reconnecting = false;
    }
  }

  async healthCheck() {
    try {
      const response = await this.http.get('/status', {
        headers: this.authHeaders(),
        timeout: 8000, // Shorter timeout for health checks
      });

      let connected = Boolean(response.data?.connected);
      const stale = this.isConnectionStale();
      if (connected && stale) {
        connected = false;
      }

      // Update connection state
      if (connected) {
        this.recordRequestSuccess();
      } else if (stale) {
        this.recordRequestFailure(new Error('stale_connection'), 'health_check');
      } else {
        this.recordRequestFailure(new Error('disconnected'), 'health_check');
      }

      return {
        broker: this.name,
        mode: this.accountMode,
        connected,
        stale,
        staleDurationMs: this.getTimeSinceLastSuccess(),
        details: response.data,
        lastSuccessfulRequest: this.connectionState.lastSuccessfulRequest,
        consecutiveFailures: this.connectionState.consecutiveFailures,
      };
    } catch (error) {
      this.recordRequestFailure(error, 'health_check');

      this.logger?.warn?.({ err: error, broker: this.name }, 'MT5 health check failed');
      return {
        broker: this.name,
        mode: this.accountMode,
        connected: false,
        stale: false,
        staleDurationMs: this.getTimeSinceLastSuccess(),
        error: error.message,
        consecutiveFailures: this.connectionState.consecutiveFailures,
      };
    }
  }

  authHeaders() {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined;
  }

  async connect(options = {}) {
    try {
      const payload = {
        accountMode: options.accountMode || this.accountMode,
        accountNumber: options.accountNumber || this.expectedAccount,
        forceReconnect: Boolean(options.forceReconnect),
      };

      const response = await this.http.post('/session/connect', payload, {
        headers: this.authHeaders(),
      });

      // Update connection state on successful connect
      this.connectionState.connected = Boolean(response.data?.connected || response.data?.success);
      this.recordRequestSuccess();

      return response.data;
    } catch (error) {
      this.recordRequestFailure(error, 'connect');
      this.logger?.error?.({ err: error, broker: this.name }, 'MT5 connect failed');
      throw error;
    }
  }

  async disconnect(options = {}) {
    try {
      const response = await this.http.post(
        '/session/disconnect',
        {
          accountMode: options.accountMode || this.accountMode,
          accountNumber: options.accountNumber || this.expectedAccount,
        },
        {
          headers: this.authHeaders(),
        }
      );

      // Update connection state
      this.connectionState.connected = false;

      return response.data;
    } catch (error) {
      this.logger?.error?.({ err: error, broker: this.name }, 'MT5 disconnect failed');
      throw error;
    }
  }

  async restart(options = {}) {
    try {
      await this.disconnect(options);
    } catch (error) {
      this.logger?.warn?.(
        { err: error, broker: this.name },
        'MT5 disconnect failed during restart, continuing'
      );
    }
    return this.connect({ ...options, forceReconnect: true });
  }

  async placeOrder(order) {
    try {
      const payload = {
        symbol: order.symbol,
        type: order.side === 'buy' ? 'BUY' : 'SELL',
        volume: Number(order.volume || order.units || 0),
        deviation: order.deviation || 10,
        comment: order.comment || 'auto-trade',
        takeProfit: order.takeProfit || null,
        stopLoss: order.stopLoss || null,
        magicNumber: order.magicNumber || 87001,
        accountMode: this.accountMode,
        accountNumber: order.accountNumber || this.expectedAccount,
        timeInForce: order.timeInForce || 'GTC',
      };

      const response = await this.http.post('/orders', payload, {
        headers: this.authHeaders(),
      });
      return {
        success: Boolean(response.data?.success),
        order: response.data?.order || null,
        error: response.data?.error || null,
      };
    } catch (error) {
      this.recordRequestFailure(error, 'place_order');
      this.logger?.error?.({ err: error, broker: this.name }, 'MT5 placeOrder failed');
      return { success: false, error: error.message };
    }
  }

  async closePosition(position) {
    try {
      const payload = {
        ticket: position.ticket || position.id,
        symbol: position.symbol,
        volume: Number(position.volume || position.units || 0),
        comment: position.comment || 'auto-close',
      };
      const response = await this.http.post('/positions/close', payload, {
        headers: this.authHeaders(),
      });
      return {
        success: Boolean(response.data?.success),
        result: response.data || null,
        error: response.data?.error || null,
      };
    } catch (error) {
      this.recordRequestFailure(error, 'close_position');
      this.logger?.error?.({ err: error, broker: this.name }, 'MT5 closePosition failed');
      return { success: false, error: error.message };
    }
  }

  async modifyPosition(position = {}) {
    try {
      const ticket = position.ticket || position.id || null;
      if (!ticket) {
        return { success: false, error: 'Missing position ticket/id' };
      }

      const payload = {
        ticket,
        symbol: position.symbol,
        stopLoss: position.stopLoss ?? null,
        takeProfit: position.takeProfit ?? null,
        comment: position.comment || 'auto-modify',
        accountMode: this.accountMode,
        accountNumber: position.accountNumber || this.expectedAccount,
      };

      const response = await this.http.post('/positions/modify', payload, {
        headers: this.authHeaders(),
      });

      return {
        success: Boolean(response.data?.success),
        result: response.data || null,
        error: response.data?.error || null,
      };
    } catch (error) {
      this.recordRequestFailure(error, 'modify_position');
      this.logger?.error?.({ err: error, broker: this.name }, 'MT5 modifyPosition failed');
      return { success: false, error: error.message };
    }
  }

  async fetchOpenPositions() {
    try {
      const response = await this.http.get('/positions', {
        headers: this.authHeaders(),
        params: {
          accountNumber: this.expectedAccount,
          accountMode: this.accountMode,
        },
      });
      return response.data?.positions || [];
    } catch (error) {
      this.recordRequestFailure(error, 'fetch_positions');
      this.logger?.warn?.({ err: error, broker: this.name }, 'MT5 fetchOpenPositions failed');
      return [];
    }
  }

  async fetchRecentFills() {
    try {
      const response = await this.http.get('/deals', {
        headers: this.authHeaders(),
        params: {
          accountNumber: this.expectedAccount,
          accountMode: this.accountMode,
          limit: 50,
        },
      });
      return response.data?.deals || [];
    } catch (error) {
      this.recordRequestFailure(error, 'fetch_fills');
      this.logger?.warn?.({ err: error, broker: this.name }, 'MT5 fetchRecentFills failed');
      return [];
    }
  }

  async fetchAccountSummary() {
    try {
      const response = await this.http.get('/account', {
        headers: this.authHeaders(),
        params: {
          accountNumber: this.expectedAccount,
          accountMode: this.accountMode,
        },
      });

      // Track successful request
      this.recordRequestSuccess();

      return response.data || null;
    } catch (error) {
      this.recordRequestFailure(error, 'fetch_account');
      this.logger?.warn?.({ err: error, broker: this.name }, 'MT5 fetchAccountSummary failed');
      return null;
    }
  }

  computeReconnectDelay(attempt) {
    const baseDelay = Math.min(
      this.reconnectConfig.baseDelayMs * Math.pow(2, attempt - 1),
      this.reconnectConfig.maxDelayMs
    );
    const jitter = baseDelay * this.reconnectConfig.jitterRatio;
    const offset = (this.random() * 2 - 1) * jitter;
    return Math.max(250, Math.round(baseDelay + offset));
  }

  getTimeSinceLastSuccess() {
    return Date.now() - this.connectionState.lastSuccessfulRequest;
  }

  isConnectionStale() {
    const threshold = Number(this.reconnectConfig.staleThresholdMs);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return false;
    }
    return this.getTimeSinceLastSuccess() > threshold;
  }

  recordRequestSuccess() {
    this.connectionState.connected = true;
    this.connectionState.consecutiveFailures = 0;
    this.connectionState.lastSuccessfulRequest = Date.now();
    this.connectionState.lastFailureAt = null;
    this.connectionState.lastFailureReason = null;
  }

  recordRequestFailure(error, reason) {
    this.connectionState.connected = false;
    this.connectionState.consecutiveFailures += 1;
    this.connectionState.lastFailureAt = Date.now();
    this.connectionState.lastFailureReason = reason || error?.message || 'unknown';
    if (
      this.reconnectConfig.enabled &&
      this.connectionState.consecutiveFailures >= this.reconnectConfig.failureThreshold
    ) {
      this.attemptAutoReconnect().catch(() => {});
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState() {
    const timeSinceLastSuccess = this.getTimeSinceLastSuccess();
    return {
      ...this.connectionState,
      timeSinceLastSuccess,
      stale: this.isConnectionStale(),
    };
  }

  /**
   * Cleanup and destroy connector
   */
  destroy() {
    this.stopHealthCheckMonitoring();
    this.connectionState.connected = false;
    this.logger?.info?.({ broker: this.name }, 'MT5 connector destroyed');
  }
}

export default Mt5Connector;
