import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchJson, postJson } from '../utils/api.js';
import { formatDateTime, formatNumber } from '../utils/format.js';
import { normalizeBrokerId } from '../app/app-constants.js';

const NA_LABEL = 'N/A';

function MetaTraderBridgePanel({
  brokerHealth = [],
  onRefreshBrokers,
  bridgeStats: bridgeStatsProp = null,
  bridgeStatus: bridgeStatusProp = null,
  bridgeError: bridgeErrorProp = null,
  onRefreshBridgeStats,
  selectedPlatform: selectedPlatformProp,
  onSelectedPlatformChange,
  showAutoTradingControls = false
}) {
  const [bridgeActivity, setBridgeActivity] = useState({});
  const [selectedPlatformState, setSelectedPlatformState] = useState('MT5');
  const [bridgeStats, setBridgeStats] = useState(bridgeStatsProp);
  const [bridgeStatus, setBridgeStatus] = useState(bridgeStatusProp);
  const [statsError, setStatsError] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [autoTradingLoading, setAutoTradingLoading] = useState(false);
  const [autoTradingError, setAutoTradingError] = useState(null);
  const [forcedBrokerId, setForcedBrokerId] = useState(null);

  const selectedPlatform = selectedPlatformProp || selectedPlatformState;
  const setSelectedPlatform = useCallback(
    (next) => {
      onSelectedPlatformChange?.(next);
      if (!selectedPlatformProp) {
        setSelectedPlatformState(next);
      }
    },
    [onSelectedPlatformChange, selectedPlatformProp]
  );

  const trackedPlatforms = useMemo(() => ['MT4', 'MT5'], []);

  const connectorHealthMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(brokerHealth)) {
      brokerHealth.forEach((snapshot) => {
        if (!snapshot?.broker) {
          return;
        }
        map.set(String(snapshot.broker).toUpperCase(), snapshot);
      });
    }
    return map;
  }, [brokerHealth]);

  const anyBridgeLoading = useMemo(
    () => Object.values(bridgeActivity).some((entry) => entry?.loading),
    [bridgeActivity]
  );

  useEffect(() => {
    if (bridgeStatsProp !== undefined) {
      setBridgeStats(bridgeStatsProp);
    }
  }, [bridgeStatsProp]);

  useEffect(() => {
    if (bridgeStatusProp !== undefined) {
      setBridgeStatus(bridgeStatusProp);
    }
  }, [bridgeStatusProp]);

  useEffect(() => {
    if (!bridgeErrorProp) {
      return;
    }
    setStatsError(String(bridgeErrorProp));
  }, [bridgeErrorProp]);

  const refreshBridgeTelemetry = useCallback(async () => {
    if (typeof onRefreshBridgeStats !== 'function') {
      return;
    }
    setStatsLoading(true);
    setStatusLoading(true);
    try {
      await onRefreshBridgeStats();
      setStatsError(null);
      setStatusError(null);
    } catch (error) {
      const message = error?.message || 'Failed to load bridge telemetry';
      setStatsError(message);
      setStatusError(message);
    } finally {
      setStatsLoading(false);
      setStatusLoading(false);
    }
  }, [onRefreshBridgeStats]);

  const refreshAutoTradingStatus = useCallback(async () => {
    setAutoTradingError(null);
    try {
      const payload = await fetchJson('/api/status');
      const brokerId = normalizeBrokerId(selectedPlatform || '');
      const forced =
        normalizeBrokerId(payload?.status?.autoTrading?.forcedBroker || '') || null;
      setForcedBrokerId(forced);
      const effectiveBrokerId = forced || brokerId;

      if (forced && forced !== brokerId) {
        const forcedLabel = forced.toUpperCase();
        if (forcedLabel === 'MT4' || forcedLabel === 'MT5') {
          setSelectedPlatform(forcedLabel);
        }
      }

      const enabledByBroker = payload?.status?.enabledByBroker || null;
      setAutoTradingEnabled(
        typeof enabledByBroker === 'object' && enabledByBroker
          ? Boolean(enabledByBroker[effectiveBrokerId])
          : Boolean(payload?.status?.enabled)
      );
    } catch (error) {
      setAutoTradingError(error?.message || 'Failed to load auto trading status');
    }
  }, [selectedPlatform, setSelectedPlatform]);

  useEffect(() => {
    const tasks = [refreshBridgeTelemetry()];
    if (showAutoTradingControls) {
      tasks.push(refreshAutoTradingStatus());
    }
    void Promise.allSettled(tasks);
  }, [refreshAutoTradingStatus, refreshBridgeTelemetry, showAutoTradingControls]);

  useEffect(() => {
    if (!showAutoTradingControls) {
      return undefined;
    }
    const timer = setInterval(refreshAutoTradingStatus, 15000);
    return () => clearInterval(timer);
  }, [refreshAutoTradingStatus, showAutoTradingControls]);

  const handleBridgeAction = useCallback(
    async (platform) => {
      if (!platform) {
        return;
      }

      const id = String(platform).toLowerCase();
      setBridgeActivity((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          loading: true,
          error: null,
          message: null
        }
      }));

      try {
        await Promise.allSettled([refreshBridgeTelemetry(), onRefreshBrokers?.()]);

        setBridgeActivity((prev) => ({
          ...prev,
          [id]: {
            loading: false,
            error: null,
            message:
              'Download the EA, attach it to a chart in MetaTrader, enable AutoTrading, and whitelist http://localhost:4101 in WebRequest settings. Status updates after the first heartbeat.'
          }
        }));
      } catch (err) {
        setBridgeActivity((prev) => ({
          ...prev,
          [id]: {
            loading: false,
            error: err?.message || 'Bridge request failed',
            message: null
          }
        }));
      }
    },
    [onRefreshBrokers, refreshBridgeTelemetry]
  );

  const selectedSessions = useMemo(() => {
    const sessions = Array.isArray(bridgeStats?.sessions) ? bridgeStats.sessions : [];
    const normalized = String(selectedPlatform).toLowerCase();
    return sessions.filter((session) => String(session?.broker || '').toLowerCase() === normalized);
  }, [bridgeStats, selectedPlatform]);

  const selectedConnectorSnapshot = useMemo(() => {
    const platform = String(selectedPlatform).toUpperCase();
    const platformId = platform.toLowerCase();
    return (
      connectorHealthMap.get(platform) ||
      connectorHealthMap.get(platformId.toUpperCase()) ||
      connectorHealthMap.get(platformId) ||
      null
    );
  }, [connectorHealthMap, selectedPlatform]);

  const primarySession = useMemo(() => {
    if (!Array.isArray(selectedSessions) || selectedSessions.length === 0) {
      return null;
    }

    return [...selectedSessions].sort(
      (a, b) => Number(b?.lastHeartbeat || 0) - Number(a?.lastHeartbeat || 0)
    )[0];
  }, [selectedSessions]);

  const selectedSummary = useMemo(() => {
    const summary = {
      sessions: selectedSessions.length,
      tradesExecuted: 0,
      profitLoss: 0,
      lastHeartbeat: null,
      connectedAt: null
    };

    selectedSessions.forEach((session) => {
      summary.tradesExecuted += Number(session?.tradesExecuted || 0);
      summary.profitLoss += Number(session?.profitLoss || 0);
      const lastHeartbeat = session?.lastHeartbeat || null;
      const connectedAt = session?.connectedAt || null;
      if (lastHeartbeat && (!summary.lastHeartbeat || lastHeartbeat > summary.lastHeartbeat)) {
        summary.lastHeartbeat = lastHeartbeat;
      }
      if (connectedAt && (!summary.connectedAt || connectedAt < summary.connectedAt)) {
        summary.connectedAt = connectedAt;
      }
    });

    return summary;
  }, [selectedSessions]);

  const selectedIsConnected = useMemo(() => {
    const platformId = String(selectedPlatform || '').toLowerCase();
    const derived = bridgeStatus?.brokers?.[platformId]?.connected;
    if (typeof derived === 'boolean') {
      return derived;
    }
    if (!selectedSummary.lastHeartbeat) {
      return false;
    }
    return Date.now() - Number(selectedSummary.lastHeartbeat) <= 2 * 60 * 1000;
  }, [bridgeStatus, selectedPlatform, selectedSummary.lastHeartbeat]);

  const selectedRealtimeDropAudit = useMemo(() => {
    const platformId = String(selectedPlatform || '').toLowerCase();
    const audit = bridgeStatus?.realtimeDropAudit || null;
    const events = Array.isArray(audit?.recent)
      ? audit.recent.filter((entry) => String(entry?.broker || '').toLowerCase() === platformId)
      : [];
    const byReason = {};
    for (const item of events) {
      const reason = String(item?.reason || 'dropped_unknown');
      byReason[reason] = Number(byReason[reason] || 0) + 1;
    }
    return {
      total: events.length,
      latestAt: events.length ? Number(events[events.length - 1]?.ts || 0) : null,
      byReason,
    };
  }, [bridgeStatus, selectedPlatform]);

  const selectedRealtimeResilience = useMemo(() => {
    const platformId = String(selectedPlatform || '').toLowerCase();
    const resilience = bridgeStatus?.realtimeResilience || null;
    const events = Array.isArray(resilience?.recent)
      ? resilience.recent.filter((entry) => String(entry?.broker || '').toLowerCase() === platformId)
      : [];
    const bySource = {};
    for (const item of events) {
      const source = String(item?.source || 'fallback_unknown');
      bySource[source] = Number(bySource[source] || 0) + 1;
    }
    return {
      attempts: Number(resilience?.attempts || 0),
      recoveries: Number(resilience?.recoveries || 0),
      successRatePct: Number.isFinite(Number(resilience?.successRatePct))
        ? Number(resilience.successRatePct)
        : null,
      latestAt: events.length ? Number(events[events.length - 1]?.ts || 0) : null,
      bySource,
    };
  }, [bridgeStatus, selectedPlatform]);

  const toggleAutoTrading = useCallback(async () => {
    setAutoTradingLoading(true);
    setAutoTradingError(null);
    const broker = forcedBrokerId || String(selectedPlatform || '').toLowerCase();
    try {
      if (autoTradingEnabled) {
        await postJson('/api/auto-trading/stop', { broker });
        setAutoTradingEnabled(false);
      } else {
        await postJson('/api/auto-trading/start', { broker });
        setAutoTradingEnabled(true);
      }
    } catch (error) {
      setAutoTradingError(error?.message || 'Failed to toggle auto trading');
    } finally {
      setAutoTradingLoading(false);
    }
  }, [autoTradingEnabled, forcedBrokerId, selectedPlatform]);

  return (
    <div className="engine-console__bridge">
      <div className="engine-console__bridge-header">
        <div>
          <h3 className="engine-console__bridge-title">MetaTrader Bridge</h3>
          <p className="engine-console__bridge-subtitle">
            Link MT4 and MT5 terminals for manual trade alignment
          </p>
        </div>
        <div className="engine-console__bridge-toolbar">
          <label className="engine-console__bridge-select">
            <span>Platform</span>
            <select
              id="mt-bridge-platform"
              name="mtBridgePlatform"
              value={selectedPlatform}
              onChange={(event) => setSelectedPlatform(event.target.value)}
            >
              {trackedPlatforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>
          {showAutoTradingControls && (
            <button
              type="button"
              className="engine-console__bridge-refresh"
              onClick={toggleAutoTrading}
              disabled={!selectedIsConnected || autoTradingLoading}
              title={
                selectedIsConnected
                  ? 'Start or stop automated trading'
                  : 'Connect the selected MetaTrader account first'
              }
            >
              {autoTradingLoading
                ? 'Working…'
                : autoTradingEnabled
                  ? 'Stop Auto Trading'
                  : 'Start Auto Trading'}
            </button>
          )}
          <button
            type="button"
            className="engine-console__bridge-refresh"
            onClick={async () => {
              await Promise.allSettled([
                refreshBridgeTelemetry(),
                refreshAutoTradingStatus(),
                onRefreshBrokers?.()
              ]);
            }}
            disabled={anyBridgeLoading || statsLoading || statusLoading}
          >
            {statsLoading || statusLoading ? 'Refreshing…' : 'Refresh Status'}
          </button>
        </div>
      </div>

      {statsError && <div className="engine-console__warning">{statsError}</div>}
      {statusError && <div className="engine-console__warning">{statusError}</div>}
      {showAutoTradingControls && autoTradingError && (
        <div className="engine-console__warning">{autoTradingError}</div>
      )}

      <div className="engine-console__bridge-grid">
        {(() => {
          const platform = String(selectedPlatform).toUpperCase();
          const platformId = platform.toLowerCase();
          const snapshot = selectedConnectorSnapshot;
          const activity = bridgeActivity[platformId] || {};
          const isAvailable = platform === 'MT4' || platform === 'MT5';
          const heartbeatIsFresh =
            selectedSummary.lastHeartbeat &&
            Date.now() - Number(selectedSummary.lastHeartbeat) <= 2 * 60 * 1000;
          const derived = bridgeStatus?.brokers?.[platformId] || null;
          const status = selectedIsConnected || heartbeatIsFresh ? 'connected' : 'disconnected';
          const lastSeen = selectedSummary.lastHeartbeat || null;
          const downloadHref = `/eas/SignalBridge-${platform}.mq${platform === 'MT5' ? '5' : '4'}`;
          const accountMode =
            primarySession?.accountMode || snapshot?.mode || snapshot?.details?.mode || null;
          const accountNumber = primarySession?.accountNumber ?? null;
          const accountServer = primarySession?.server ?? null;
          const accountCurrency = primarySession?.currency ?? null;
          const accountEquity = primarySession?.equity;
          const accountBalance = primarySession?.balance;

          return (
            <article key={platform} className="engine-console__bridge-card">
              <header className="engine-console__bridge-card-header">
                <span className="engine-console__bridge-label">{platform}</span>
                <span
                  className={`engine-console__bridge-status engine-console__bridge-status--${status}`}
                >
                  {status === 'connected' && 'Connected'}
                  {status === 'disconnected' && 'Offline'}
                  {status === 'unknown' && 'Unknown'}
                </span>
              </header>
              <div className="engine-console__bridge-body">
                <p className="engine-console__bridge-description">
                  Mirror trades and synchronize execution with the trading engine.
                </p>
                <dl className="engine-console__bridge-meta">
                  <div>
                    <dt>Account Mode</dt>
                    <dd>{accountMode ? String(accountMode).toUpperCase() : NA_LABEL}</dd>
                  </div>
                  <div>
                    <dt>Account</dt>
                    <dd>
                      {accountNumber !== null && accountNumber !== undefined && accountNumber !== ''
                        ? String(accountNumber)
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Server</dt>
                    <dd>
                      {accountServer !== null && accountServer !== undefined && accountServer !== ''
                        ? String(accountServer)
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Currency</dt>
                    <dd>
                      {accountCurrency !== null &&
                      accountCurrency !== undefined &&
                      accountCurrency !== ''
                        ? String(accountCurrency)
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Equity</dt>
                    <dd>
                      {Number.isFinite(Number(accountEquity))
                        ? formatNumber(Number(accountEquity))
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd>
                      {Number.isFinite(Number(accountBalance))
                        ? formatNumber(Number(accountBalance))
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Last Check</dt>
                    <dd>{lastSeen ? formatDateTime(lastSeen) : NA_LABEL}</dd>
                  </div>
                  <div>
                    <dt>Sessions</dt>
                    <dd>{selectedSummary.sessions}</dd>
                  </div>
                  <div>
                    <dt>Last Heartbeat</dt>
                    <dd>
                      {selectedSummary.lastHeartbeat
                        ? formatDateTime(selectedSummary.lastHeartbeat)
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Fresh Quotes</dt>
                    <dd>
                      {derived?.quotes && typeof derived.quotes.count === 'number'
                        ? String(derived.quotes.count)
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Latest Quote</dt>
                    <dd>
                      {derived?.quotes?.latestQuoteAt
                        ? formatDateTime(derived.quotes.latestQuoteAt)
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Trades</dt>
                    <dd>{selectedSummary.tradesExecuted}</dd>
                  </div>
                  <div>
                    <dt>P/L</dt>
                    <dd>
                      {Number.isFinite(selectedSummary.profitLoss)
                        ? formatNumber(selectedSummary.profitLoss)
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Dropped Events</dt>
                    <dd>{String(selectedRealtimeDropAudit.total || 0)}</dd>
                  </div>
                  <div>
                    <dt>Drop Reasons</dt>
                    <dd>
                      {Object.keys(selectedRealtimeDropAudit.byReason || {}).length
                        ? Object.entries(selectedRealtimeDropAudit.byReason)
                            .map(([reason, count]) => `${reason}:${count}`)
                            .join(', ')
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Last Drop</dt>
                    <dd>
                      {selectedRealtimeDropAudit.latestAt
                        ? formatDateTime(selectedRealtimeDropAudit.latestAt)
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Quote Recoveries</dt>
                    <dd>
                      {`${selectedRealtimeResilience.recoveries}/${selectedRealtimeResilience.attempts}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Recovery Success</dt>
                    <dd>
                      {selectedRealtimeResilience.successRatePct != null
                        ? `${selectedRealtimeResilience.successRatePct}%`
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Recovery Sources</dt>
                    <dd>
                      {Object.keys(selectedRealtimeResilience.bySource || {}).length
                        ? Object.entries(selectedRealtimeResilience.bySource)
                            .map(([source, count]) => `${source}:${count}`)
                            .join(', ')
                        : NA_LABEL}
                    </dd>
                  </div>
                  <div>
                    <dt>Last Recovery</dt>
                    <dd>
                      {selectedRealtimeResilience.latestAt
                        ? formatDateTime(selectedRealtimeResilience.latestAt)
                        : NA_LABEL}
                    </dd>
                  </div>
                </dl>
              </div>
              <footer className="engine-console__bridge-actions">
                <button
                  type="button"
                  className="engine-console__bridge-button"
                  onClick={() => handleBridgeAction(platform)}
                  disabled={activity.loading}
                >
                  {activity.loading ? 'Connecting...' : `Connect ${platform}`}
                </button>
                <a
                  className="engine-console__bridge-button engine-console__bridge-button--ghost"
                  href={downloadHref}
                  download
                >
                  Download EA
                </a>
                {activity.error && <p className="engine-console__bridge-alert">{activity.error}</p>}
                {!activity.error && activity.message && (
                  <p className="engine-console__bridge-note">{activity.message}</p>
                )}
              </footer>
            </article>
          );
        })()}
      </div>
    </div>
  );
}

export default MetaTraderBridgePanel;
