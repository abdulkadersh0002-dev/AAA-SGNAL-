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

    // Connection monitoring and auto-reconnect
    this.connectionState = {
      connected: false,
      lastHealthCheck: null,
      consecutiveFailures: 0,
      lastSuccessfulRequest: Date.now(),
    };

    // Reconnection strategy with exponential backoff
    this.reconnectConfig = {
      enabled: options.autoReconnect !== false,
      maxRetries: options.maxReconnectRetries || 5,
      baseDelayMs: options.reconnectBaseDelay || 2000,
      maxDelayMs: options.reconnectMaxDelay || 30000,
      healthCheckIntervalMs: options.healthCheckInterval || 30000,
    };
    // Guard flag: prevents concurrent reconnection storms
    this._reconnecting = false;

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
      try {
        const result = await this.healthCheck();

        if (result.connected) {
          this.connectionState.connected = true;
          this.connectionState.consecutiveFailures = 0;
          this.connectionState.lastSuccessfulRequest = Date.now();
        } else {
          this.connectionState.connected = false;
          this.connectionState.consecutiveFailures += 1;

          // Trigger auto-reconnect if threshold exceeded
          if (this.connectionState.consecutiveFailures >= 3) {
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
      }
    };

    // Run initial check immediately
    runHealthCheck();

    // Schedule periodic checks — use .unref() so the timer never prevents the process from exiting
    this.healthCheckTimer = setInterval(
      () => runHealthCheck(),
      this.reconnectConfig.healthCheckIntervalMs
    );
    this.healthCheckTimer.unref?.();
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
   * Attempt auto-reconnect with exponential backoff + jitter.
   * A guard flag prevents concurrent reconnect storms when the health-check
   * fires multiple times before a previous reconnect attempt finishes.
   */
  async attemptAutoReconnect() {
    if (!this.reconnectConfig.enabled) {
      return false;
    }
    // Prevent concurrent reconnect storms
    if (this._reconnecting) {
      this.logger?.debug?.({ broker: this.name }, 'MT5 reconnect already in progress — skipping');
      return false;
    }
    this._reconnecting = true;

    let attempt = 0;
    try {
      while (attempt < this.reconnectConfig.maxRetries) {
        attempt += 1;

        // Exponential backoff with ±20% random jitter to spread out reconnect load
        const baseDelay = this.reconnectConfig.baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1); // ±20%
        const delayMs = Math.min(Math.round(baseDelay + jitter), this.reconnectConfig.maxDelayMs);

        this.logger?.info?.({ broker: this.name, attempt, delayMs }, 'Attempting MT5 reconnection');

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        try {
          const result = await this.connect({ forceReconnect: true });

          if (result?.connected || result?.success) {
            this.logger?.info?.({ broker: this.name, attempt }, 'MT5 reconnection successful');
            this.connectionState.connected = true;
            this.connectionState.consecutiveFailures = 0;
            return true;
          }
        } catch (error) {
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
      this._reconnecting = false;
    }
  }

  async healthCheck() {
    try {
      const response = await this.http.get('/status', {
        headers: this.authHeaders(),
        timeout: 8000, // Shorter timeout for health checks
      });

      const connected = Boolean(response.data?.connected);

      // Update connection state
      if (connected) {
        this.connectionState.connected = true;
        this.connectionState.consecutiveFailures = 0;
        this.connectionState.lastSuccessfulRequest = Date.now();
      }

      return {
        broker: this.name,
        mode: this.accountMode,
        connected,
        details: response.data,
        lastSuccessfulRequest: this.connectionState.lastSuccessfulRequest,
        consecutiveFailures: this.connectionState.consecutiveFailures,
      };
    } catch (error) {
      this.connectionState.consecutiveFailures += 1;
      this.connectionState.connected = false;

      this.logger?.warn?.({ err: error, broker: this.name }, 'MT5 health check failed');
      return {
        broker: this.name,
        mode: this.accountMode,
        connected: false,
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
      this.connectionState.consecutiveFailures = 0;
      this.connectionState.lastSuccessfulRequest = Date.now();

      return response.data;
    } catch (error) {
      this.connectionState.consecutiveFailures += 1;
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
      this.connectionState.lastSuccessfulRequest = Date.now();
      this.connectionState.consecutiveFailures = 0;

      return response.data || null;
    } catch (error) {
      this.connectionState.consecutiveFailures += 1;
      this.logger?.warn?.({ err: error, broker: this.name }, 'MT5 fetchAccountSummary failed');
      return null;
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState() {
    return {
      ...this.connectionState,
      timeSinceLastSuccess: Date.now() - this.connectionState.lastSuccessfulRequest,
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
