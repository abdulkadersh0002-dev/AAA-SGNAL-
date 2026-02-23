import { readEnvNumber } from '../../utils/env.js';

const clampMs = (value, fallback, min = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.trunc(numeric));
};

export function resolveEaFreshnessPolicy() {
  const dashboardQuoteMaxAgeMs = clampMs(
    readEnvNumber('EA_DASHBOARD_QUOTE_MAX_AGE_MS', null),
    2 * 60 * 1000,
    1_000
  );

  const signalQuoteMaxAgeMs = clampMs(
    readEnvNumber('EA_SIGNAL_QUOTE_MAX_AGE_MS', null),
    dashboardQuoteMaxAgeMs,
    1_000
  );

  const signalExecQuoteMaxAgeMs = clampMs(
    readEnvNumber('EA_SIGNAL_EXEC_QUOTE_MAX_AGE_MS', null),
    Math.min(signalQuoteMaxAgeMs, 30 * 1000),
    1_000
  );

  const signalSnapshotMaxAgeMs = clampMs(
    readEnvNumber('EA_SIGNAL_SNAPSHOT_MAX_AGE_MS', null),
    2 * 60 * 1000,
    1_000
  );

  const snapshotMaxAgeMs = clampMs(
    readEnvNumber('EA_SNAPSHOT_MAX_AGE_MS', null),
    5 * 60 * 1000,
    1_000
  );

  const snapshotRequestTtlMs = clampMs(
    readEnvNumber('EA_SNAPSHOT_REQUEST_TTL_MS', null),
    2 * 60 * 1000,
    1_000
  );

  const heartbeatMaxAgeMs = clampMs(
    readEnvNumber('EA_HEARTBEAT_MAX_AGE_MS', null),
    2 * 60 * 1000,
    1_000
  );

  const dashboardAnalysisQuoteMaxAgeMs = clampMs(
    readEnvNumber('EA_DASHBOARD_ANALYSIS_QUOTE_MAX_AGE_MS', null),
    dashboardQuoteMaxAgeMs,
    1_000
  );

  return {
    dashboardQuoteMaxAgeMs,
    signalQuoteMaxAgeMs,
    signalExecQuoteMaxAgeMs,
    signalSnapshotMaxAgeMs,
    snapshotMaxAgeMs,
    snapshotRequestTtlMs,
    heartbeatMaxAgeMs,
    dashboardAnalysisQuoteMaxAgeMs,
  };
}
