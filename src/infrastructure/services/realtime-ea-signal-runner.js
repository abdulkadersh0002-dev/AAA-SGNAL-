import { createTradingSignalDTO, validateTradingSignalDTO } from '../../contracts/dtos.js';
import { attachLayeredAnalysisToSignal, evaluateLayers18Readiness } from './ea-signal-pipeline.js';
import {
  extractBaseSymbol,
  isSaneEaSymbolToken,
  normalizeBroker,
  normalizeSymbol,
} from '../../utils/ea-symbols.js';
import { resolveEaFreshnessPolicy } from '../../core/policy/ea-freshness-policy.js';
import { getDecisionState } from '../../core/policy/decision-contract.js';

const computeMidFromQuote = (quote) => {
  if (!quote || typeof quote !== 'object') {
    return null;
  }
  const bid = quote.bid != null ? Number(quote.bid) : null;
  const ask = quote.ask != null ? Number(quote.ask) : null;
  const last = quote.last != null ? Number(quote.last) : null;

  const bidOk = Number.isFinite(bid);
  const askOk = Number.isFinite(ask);

  if (bidOk && askOk) {
    return (bid + ask) / 2;
  }
  if (bidOk) {
    return bid;
  }
  if (askOk) {
    return ask;
  }
  if (Number.isFinite(last)) {
    return last;
  }
  return null;
};

const toEpochMs = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric > 10_000_000_000 ? numeric : numeric * 1000;
};

const isStrictEaSymbolFilterEnabled = () => {
  const raw = String(process.env.EA_STRICT_SYMBOL_FILTER || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

const isMetalSymbolToken = (symbol) => {
  const base = extractBaseSymbol(symbol);
  if (!base) {
    return false;
  }
  return (
    base === 'XAUUSD' ||
    base === 'XAGUSD' ||
    base === 'XAGEUR' ||
    base === 'XPTUSD' ||
    base === 'XPDUSD' ||
    base === 'GOLD' ||
    base === 'SILVER'
  );
};

export class RealtimeEaSignalRunner {
  constructor(options = {}) {
    this.tradingEngine = options.tradingEngine;
    this.eaBridgeService = options.eaBridgeService;
    this.broadcast = typeof options.broadcast === 'function' ? options.broadcast : () => {};
    this.onSignal = typeof options.onSignal === 'function' ? options.onSignal : null;
    this.logger = options.logger;

    this.dashboardStats = {
      lastScanAt: null,
      lastScanBroker: null,
      lastScanTotal: 0,
      lastScanBatch: 0,
      lastScanSymbols: 0,
      pendingBrokers: 0,
      pendingSymbols: 0,
      maxPendingSymbolsSeen: 0,
      flushRuns: 0,
      flushInProgress: false,
      lastFlushAt: null,
      lastFlushDurationMs: 0,
      maxFlushDurationMs: 0,
      queueOverflowDrops: 0,
      lastQueueOverflowAt: null,
      droppedEvents: [],
      droppedCounts: {},
      droppedByBroker: {},
      quoteRecoveryAttempts: 0,
      quoteRecoveriesTotal: 0,
      quoteRecoveryByBroker: {},
      quoteRecoveryBySource: {},
      lastQuoteRecoveryAt: null,
      recentQuoteRecoveries: [],
      lastSignalAt: null,
      lastCandidateAt: null,
      hotSymbols: [],
      publishCounts: {
        signal: 0,
        candidate: 0,
      },
      rejectCounts: {},
      lastRejects: [],
      debugTop: [],
    };

    // Throttling / batching
    this.debounceMs = Number.isFinite(Number(options.debounceMs))
      ? Number(options.debounceMs)
      : 250;
    this.minIntervalMs = Number.isFinite(Number(options.minIntervalMs))
      ? Number(options.minIntervalMs)
      : 5000;

    this.maxSymbolsPerFlush = Number.isFinite(Number(options.maxSymbolsPerFlush))
      ? Math.max(1, Math.trunc(Number(options.maxSymbolsPerFlush)))
      : 30;

    this.maxSnapshotRequestsPerFlush = Number.isFinite(Number(options.maxSnapshotRequestsPerFlush))
      ? Math.max(0, Math.trunc(Number(options.maxSnapshotRequestsPerFlush)))
      : 10;

    const envMaxPendingPerBroker = Number(process.env.EA_SIGNAL_MAX_PENDING_SYMBOLS_PER_BROKER);
    this.maxPendingSymbolsPerBroker = Number.isFinite(Number(options.maxPendingSymbolsPerBroker))
      ? Math.max(25, Math.trunc(Number(options.maxPendingSymbolsPerBroker)))
      : Number.isFinite(envMaxPendingPerBroker)
        ? Math.max(25, Math.trunc(envMaxPendingPerBroker))
        : 500;

    // Periodic revalidation ("living signals")
    const envRevalidateMs = Number(process.env.EA_SIGNAL_REVALIDATE_INTERVAL_MS);
    this.revalidateIntervalMs = Number.isFinite(Number(options.revalidateIntervalMs))
      ? Math.max(10_000, Number(options.revalidateIntervalMs))
      : Number.isFinite(envRevalidateMs)
        ? Math.max(10_000, envRevalidateMs)
        : 60 * 1000;

    const envRevalidateEnabled = String(process.env.EA_SIGNAL_REVALIDATION_ENABLED || '')
      .trim()
      .toLowerCase();
    this.revalidationEnabled =
      typeof options.revalidationEnabled === 'boolean'
        ? options.revalidationEnabled
        : envRevalidateEnabled === '0' ||
            envRevalidateEnabled === 'false' ||
            envRevalidateEnabled === 'no'
          ? false
          : true;

    this.revalidateTimer = null;
    this.lastRevalidatedAt = new Map(); // key -> timestamp

    // Data freshness
    const freshnessPolicy = resolveEaFreshnessPolicy();
    this.quoteMaxAgeMs = Number.isFinite(Number(options.quoteMaxAgeMs))
      ? Number(options.quoteMaxAgeMs)
      : freshnessPolicy.dashboardQuoteMaxAgeMs;
    this.snapshotMaxAgeMs = Number.isFinite(Number(options.snapshotMaxAgeMs))
      ? Number(options.snapshotMaxAgeMs)
      : freshnessPolicy.snapshotMaxAgeMs;
    this.snapshotRequestTtlMs = Number.isFinite(Number(options.snapshotRequestTtlMs))
      ? Number(options.snapshotRequestTtlMs)
      : freshnessPolicy.snapshotRequestTtlMs;

    // Strong-signal gating
    const envMinConfidence = Number(process.env.EA_SIGNAL_MIN_CONFIDENCE);
    const envMinStrength = Number(process.env.EA_SIGNAL_MIN_STRENGTH);

    // Dashboard gating can be more permissive than EA execution.
    // This only affects what is *broadcast* to the dashboard, not what is auto-traded.
    const envDashMinConfidence = Number(process.env.EA_DASHBOARD_SIGNAL_MIN_CONFIDENCE);
    const envDashMinStrength = Number(process.env.EA_DASHBOARD_SIGNAL_MIN_STRENGTH);

    // Dashboard publish policy.
    // Note: for dev visibility (EA_DASHBOARD_ALLOW_CANDIDATES), we avoid blocking on snapshots/bars
    // unless explicitly required by env.
    const envRequireSnapshotRaw = String(process.env.EA_DASHBOARD_REQUIRE_SNAPSHOT || '');
    const envRequireSnapshot = envRequireSnapshotRaw.trim().toLowerCase();
    const envRequireBarsRaw = String(process.env.EA_DASHBOARD_REQUIRE_BARS || '');
    const envRequireBars = envRequireBarsRaw.trim().toLowerCase();
    const envRequireConfluence = String(process.env.EA_DASHBOARD_REQUIRE_CONFLUENCE || '')
      .trim()
      .toLowerCase();
    const envRequireEnter = String(process.env.EA_DASHBOARD_REQUIRE_ENTER || '')
      .trim()
      .toLowerCase();
    const envRequireLayers18 = String(process.env.EA_DASHBOARD_REQUIRE_LAYERS18 || '')
      .trim()
      .toLowerCase();

    const envLayers18MinConfluence = Number(process.env.EA_DASHBOARD_LAYERS18_MIN_CONFLUENCE);

    const envAllowCandidates = String(process.env.EA_DASHBOARD_ALLOW_CANDIDATES || '')
      .trim()
      .toLowerCase();

    const eaOnlyMode =
      String(process.env.EA_ONLY_MODE || '')
        .trim()
        .toLowerCase() === 'true';

    const nodeEnv = String(process.env.NODE_ENV || '')
      .trim()
      .toLowerCase();
    const isNonProd = nodeEnv !== 'production';

    const envSmartStrong = String(process.env.EA_SMART_STRONG || '')
      .trim()
      .toLowerCase();
    const smartStrong =
      typeof options.smartStrong === 'boolean'
        ? options.smartStrong
        : envSmartStrong === '1' || envSmartStrong === 'true' || envSmartStrong === 'yes'
          ? true
          : eaOnlyMode;
    this.smartStrong = smartStrong;

    const envSmartRequireBarsCoverage = String(process.env.EA_SMART_REQUIRE_BARS_COVERAGE || '')
      .trim()
      .toLowerCase();
    this.smartRequireBarsCoverage =
      typeof options.smartRequireBarsCoverage === 'boolean'
        ? options.smartRequireBarsCoverage
        : envSmartRequireBarsCoverage
          ? !(
              envSmartRequireBarsCoverage === '0' ||
              envSmartRequireBarsCoverage === 'false' ||
              envSmartRequireBarsCoverage === 'no'
            )
          : this.smartStrong;

    const envSmartBarsMinM15 = Number(process.env.EA_SMART_BARS_MIN_M15);
    const envSmartBarsMinH1 = Number(process.env.EA_SMART_BARS_MIN_H1);
    const envSmartBarsMaxAgeM15Ms = Number(process.env.EA_SMART_BARS_MAX_AGE_M15_MS);
    const envSmartBarsMaxAgeH1Ms = Number(process.env.EA_SMART_BARS_MAX_AGE_H1_MS);

    this.smartBarsMinM15 = Number.isFinite(Number(options.smartBarsMinM15))
      ? Math.max(0, Number(options.smartBarsMinM15))
      : Number.isFinite(envSmartBarsMinM15)
        ? Math.max(0, envSmartBarsMinM15)
        : this.smartStrong
          ? 60
          : 30;

    this.smartBarsMinH1 = Number.isFinite(Number(options.smartBarsMinH1))
      ? Math.max(0, Number(options.smartBarsMinH1))
      : Number.isFinite(envSmartBarsMinH1)
        ? Math.max(0, envSmartBarsMinH1)
        : this.smartStrong
          ? 20
          : 10;

    this.smartBarsMaxAgeM15Ms = Number.isFinite(Number(options.smartBarsMaxAgeM15Ms))
      ? Math.max(0, Number(options.smartBarsMaxAgeM15Ms))
      : Number.isFinite(envSmartBarsMaxAgeM15Ms)
        ? Math.max(0, envSmartBarsMaxAgeM15Ms)
        : this.smartStrong
          ? 30 * 60 * 1000
          : null;

    this.smartBarsMaxAgeH1Ms = Number.isFinite(Number(options.smartBarsMaxAgeH1Ms))
      ? Math.max(0, Number(options.smartBarsMaxAgeH1Ms))
      : Number.isFinite(envSmartBarsMaxAgeH1Ms)
        ? Math.max(0, envSmartBarsMaxAgeH1Ms)
        : this.smartStrong
          ? 3 * 60 * 60 * 1000
          : null;

    const envSmartRequireQuote = String(process.env.EA_SMART_REQUIRE_QUOTE || '')
      .trim()
      .toLowerCase();
    this.smartRequireQuote =
      typeof options.smartRequireQuote === 'boolean'
        ? options.smartRequireQuote
        : envSmartRequireQuote
          ? !(
              envSmartRequireQuote === '0' ||
              envSmartRequireQuote === 'false' ||
              envSmartRequireQuote === 'no'
            )
          : this.smartStrong;

    const envSmartMaxBarAgeMs = Number(process.env.EA_SMART_MAX_BAR_AGE_MS);
    this.smartMaxBarAgeMs = Number.isFinite(Number(options.smartMaxBarAgeMs))
      ? Math.max(0, Number(options.smartMaxBarAgeMs))
      : Number.isFinite(envSmartMaxBarAgeMs)
        ? Math.max(0, envSmartMaxBarAgeMs)
        : this.smartStrong
          ? 20 * 60 * 1000
          : null;

    const envSmartSpreadPct = Number(process.env.EA_SMART_MAX_SPREAD_PCT);
    const envSmartSpreadPctMetals = Number(process.env.EA_SMART_MAX_SPREAD_PCT_METALS);
    const envSmartSpreadPoints = Number(process.env.EA_SMART_MAX_SPREAD_POINTS);
    const envSmartSpreadPointsMetals = Number(process.env.EA_SMART_MAX_SPREAD_POINTS_METALS);
    this.smartMaxSpreadPct = Number.isFinite(envSmartSpreadPct)
      ? Math.max(0, envSmartSpreadPct)
      : this.smartStrong
        ? 0.12
        : null;
    this.smartMaxSpreadPctMetals = Number.isFinite(envSmartSpreadPctMetals)
      ? Math.max(0, envSmartSpreadPctMetals)
      : this.smartStrong
        ? 0.25
        : null;
    this.smartMaxSpreadPoints = Number.isFinite(envSmartSpreadPoints)
      ? Math.max(0, envSmartSpreadPoints)
      : this.smartStrong
        ? 45
        : null;
    this.smartMaxSpreadPointsMetals = Number.isFinite(envSmartSpreadPointsMetals)
      ? Math.max(0, envSmartSpreadPointsMetals)
      : this.smartStrong
        ? 800
        : null;

    // Default: publish strict entry-ready signals to the dashboard.
    // This keeps the dashboard focused on tradeable setups (ENTER + trade-valid).

    const allowCandidatesByDefault =
      typeof options.dashboardAllowCandidates === 'boolean'
        ? options.dashboardAllowCandidates
        : envAllowCandidates === '1' ||
            envAllowCandidates === 'true' ||
            envAllowCandidates === 'yes'
          ? true
          : this.smartStrong
            ? eaOnlyMode || isNonProd
            : eaOnlyMode || isNonProd;

    this.dashboardAllowCandidates = allowCandidatesByDefault;

    const envSnapshotSpecified = envRequireSnapshotRaw.trim().length > 0;
    const envBarsSpecified = envRequireBarsRaw.trim().length > 0;

    this.dashboardRequireSnapshot =
      typeof options.dashboardRequireSnapshot === 'boolean'
        ? options.dashboardRequireSnapshot
        : envSnapshotSpecified
          ? !(
              envRequireSnapshot === '0' ||
              envRequireSnapshot === 'false' ||
              envRequireSnapshot === 'no'
            )
          : this.smartStrong
            ? !allowCandidatesByDefault
            : allowCandidatesByDefault
              ? false
              : true;

    this.dashboardRequireBars =
      typeof options.dashboardRequireBars === 'boolean'
        ? options.dashboardRequireBars
        : envBarsSpecified
          ? envRequireBars === '1' || envRequireBars === 'true' || envRequireBars === 'yes'
          : this.smartStrong
            ? !allowCandidatesByDefault
            : allowCandidatesByDefault
              ? false
              : false;

    this.dashboardRequireConfluence =
      typeof options.dashboardRequireConfluence === 'boolean'
        ? options.dashboardRequireConfluence
        : envRequireConfluence === '0' ||
            envRequireConfluence === 'false' ||
            envRequireConfluence === 'no'
          ? false
          : allowCandidatesByDefault
            ? false
            : true;

    this.dashboardRequireEnter =
      typeof options.dashboardRequireEnter === 'boolean'
        ? options.dashboardRequireEnter
        : envRequireEnter === '0' || envRequireEnter === 'false' || envRequireEnter === 'no'
          ? false
          : true;
    // Require the canonical 18-layer analysis to be present and "ready" before publishing.
    this.dashboardRequireLayers18 =
      typeof options.dashboardRequireLayers18 === 'boolean'
        ? options.dashboardRequireLayers18
        : envRequireLayers18 === '0' ||
            envRequireLayers18 === 'false' ||
            envRequireLayers18 === 'no'
          ? false
          : this.smartStrong
            ? true
            : allowCandidatesByDefault
              ? false
              : true;

    this.dashboardLayers18MinConfluence = Number.isFinite(
      Number(options.dashboardLayers18MinConfluence)
    )
      ? Number(options.dashboardLayers18MinConfluence)
      : Number.isFinite(envLayers18MinConfluence)
        ? Math.max(0, Math.min(100, envLayers18MinConfluence))
        : this.smartStrong
          ? 60
          : 55;

    this.minConfidence = Number.isFinite(Number(options.minConfidence))
      ? Number(options.minConfidence)
      : Number.isFinite(envMinConfidence)
        ? envMinConfidence
        : this.smartStrong
          ? 55
          : 45;

    this.minStrength = Number.isFinite(Number(options.minStrength))
      ? Number(options.minStrength)
      : Number.isFinite(envMinStrength)
        ? envMinStrength
        : this.smartStrong
          ? 45
          : 35;

    // Broadcast thresholds (dashboard visibility).
    // Default to the strong thresholds; strict mode can be relaxed via env if desired.
    this.dashboardMinConfidence = Number.isFinite(Number(options.dashboardMinConfidence))
      ? Number(options.dashboardMinConfidence)
      : Number.isFinite(envDashMinConfidence)
        ? envDashMinConfidence
        : this.smartStrong
          ? Math.max(60, this.minConfidence)
          : allowCandidatesByDefault
            ? 45
            : this.minConfidence;

    this.dashboardMinStrength = Number.isFinite(Number(options.dashboardMinStrength))
      ? Number(options.dashboardMinStrength)
      : Number.isFinite(envDashMinStrength)
        ? envDashMinStrength
        : this.smartStrong
          ? Math.max(55, this.minStrength)
          : allowCandidatesByDefault
            ? 55
            : this.minStrength;

    // State
    this.pendingByBroker = new Map(); // broker -> Set(symbol)
    this.flushTimer = null;
    this.flushInProgress = false;
    this.flushQueued = false;
    this.lastGeneratedAt = new Map(); // key -> timestamp
    this.lastFingerprint = new Map(); // key -> string
    this.cursorByBroker = new Map(); // broker -> round-robin cursor
    this.lastPublishedBarTime = new Map(); // key -> epoch ms
    this.lastPublishedMeta = new Map(); // key -> { decisionState, tradeValid, status, confluenceScore, expiresAt }
    this.lastQuoteRecoveryAtByKey = new Map(); // key -> epoch ms
    this.lastSnapshotRequestAtByKey = new Map(); // key -> epoch ms
    const envQuoteRecoveryCooldownMs = Number(process.env.EA_QUOTE_RECOVERY_COOLDOWN_MS);
    this.quoteRecoveryCooldownMs = Number.isFinite(Number(options.quoteRecoveryCooldownMs))
      ? Math.max(1000, Number(options.quoteRecoveryCooldownMs))
      : Number.isFinite(envQuoteRecoveryCooldownMs)
        ? Math.max(1000, envQuoteRecoveryCooldownMs)
        : 15_000;
    const envSnapshotRequestCooldownMs = Number(process.env.EA_SNAPSHOT_REQUEST_COOLDOWN_MS);
    this.snapshotRequestCooldownMs = Number.isFinite(Number(options.snapshotRequestCooldownMs))
      ? Math.max(1000, Number(options.snapshotRequestCooldownMs))
      : Number.isFinite(envSnapshotRequestCooldownMs)
        ? Math.max(1000, envSnapshotRequestCooldownMs)
        : 20_000;
    this.refreshQueueStats();
  }

  refreshQueueStats() {
    let pendingSymbols = 0;
    for (const set of this.pendingByBroker.values()) {
      pendingSymbols += set?.size || 0;
    }
    this.dashboardStats.pendingBrokers = this.pendingByBroker.size;
    this.dashboardStats.pendingSymbols = pendingSymbols;
    this.dashboardStats.maxPendingSymbolsSeen = Math.max(
      Number(this.dashboardStats.maxPendingSymbolsSeen || 0),
      pendingSymbols
    );
    this.dashboardStats.flushInProgress = this.flushInProgress === true;
  }

  recordScan({ broker, total, batchSize, symbols } = {}) {
    const count = Array.isArray(symbols) ? symbols.length : Number(batchSize) || 0;
    this.dashboardStats.lastScanAt = Date.now();
    this.dashboardStats.lastScanBroker = broker || null;
    this.dashboardStats.lastScanTotal = Number.isFinite(Number(total)) ? Number(total) : 0;
    this.dashboardStats.lastScanBatch = Number.isFinite(Number(batchSize))
      ? Number(batchSize)
      : count;
    this.dashboardStats.lastScanSymbols = count;
  }

  recordPublish(type) {
    if (type === 'signal') {
      this.dashboardStats.lastSignalAt = Date.now();
      this.dashboardStats.publishCounts.signal += 1;
      return;
    }
    if (type === 'signal_candidate') {
      this.dashboardStats.lastCandidateAt = Date.now();
      this.dashboardStats.publishCounts.candidate += 1;
    }
  }

  recordHotSymbol({ broker, symbol, event, kind: kindOverride } = {}) {
    const sym = String(symbol || '')
      .trim()
      .toUpperCase();
    if (!sym) {
      return;
    }

    const kind =
      kindOverride ||
      (event === 'signal' ? 'signal' : event === 'signal_candidate' ? 'candidate' : 'other');
    const list = Array.isArray(this.dashboardStats.hotSymbols)
      ? [...this.dashboardStats.hotSymbols]
      : [];

    const now = Date.now();
    const next = [
      { ts: now, broker: broker || null, symbol: sym, kind },
      ...list.filter((x) => x?.symbol !== sym),
    ];

    // Keep the list compact.
    this.dashboardStats.hotSymbols = next.slice(0, 60);
  }

  recordReject(reason, context) {
    const key = String(reason || 'unknown');
    const bucket = this.dashboardStats.rejectCounts || {};
    bucket[key] = Number(bucket[key] || 0) + 1;
    this.dashboardStats.rejectCounts = bucket;

    const list = Array.isArray(this.dashboardStats.lastRejects)
      ? this.dashboardStats.lastRejects
      : [];
    const entry = {
      ts: Date.now(),
      reason: key,
      context: context && typeof context === 'object' ? context : null,
    };
    list.push(entry);
    while (list.length > 25) {
      list.shift();
    }
    this.dashboardStats.lastRejects = list;
  }

  getQuoteRecoveryKey({ broker, symbol } = {}) {
    const normalizedBroker = normalizeBroker(broker);
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedBroker || !normalizedSymbol) {
      return null;
    }
    return `${normalizedBroker}:${normalizedSymbol}`;
  }

  canAttemptQuoteRecovery({ broker, symbol, now = Date.now() } = {}) {
    const key = this.getQuoteRecoveryKey({ broker, symbol });
    if (!key) {
      return false;
    }
    const last = Number(this.lastQuoteRecoveryAtByKey.get(key) || 0);
    return now - last >= this.quoteRecoveryCooldownMs;
  }

  recordQuoteRecoveryAttempt({ broker, symbol } = {}) {
    this.dashboardStats.quoteRecoveryAttempts =
      Number(this.dashboardStats.quoteRecoveryAttempts || 0) + 1;
    if (broker || symbol) {
      this.recordReject('quote_recovery_attempted', {
        broker: broker || null,
        symbol: symbol || null,
      });
    }
  }

  recordQuoteRecovery({ broker, symbol, source, price, now = Date.now() } = {}) {
    const brokerKey = String(normalizeBroker(broker) || 'unknown');
    const symbolKey = String(normalizeSymbol(symbol) || '').toUpperCase() || null;
    const sourceKey = String(source || 'fallback_unknown')
      .trim()
      .toLowerCase();

    this.dashboardStats.quoteRecoveriesTotal =
      Number(this.dashboardStats.quoteRecoveriesTotal || 0) + 1;
    this.dashboardStats.lastQuoteRecoveryAt = now;

    const recoveryByBroker =
      this.dashboardStats.quoteRecoveryByBroker &&
      typeof this.dashboardStats.quoteRecoveryByBroker === 'object'
        ? this.dashboardStats.quoteRecoveryByBroker
        : {};
    recoveryByBroker[brokerKey] = Number(recoveryByBroker[brokerKey] || 0) + 1;
    this.dashboardStats.quoteRecoveryByBroker = recoveryByBroker;

    const recoveryBySource =
      this.dashboardStats.quoteRecoveryBySource &&
      typeof this.dashboardStats.quoteRecoveryBySource === 'object'
        ? this.dashboardStats.quoteRecoveryBySource
        : {};
    recoveryBySource[sourceKey] = Number(recoveryBySource[sourceKey] || 0) + 1;
    this.dashboardStats.quoteRecoveryBySource = recoveryBySource;

    const entries = Array.isArray(this.dashboardStats.recentQuoteRecoveries)
      ? this.dashboardStats.recentQuoteRecoveries
      : [];
    entries.push({
      ts: now,
      broker: brokerKey,
      symbol: symbolKey,
      source: sourceKey,
      price: Number.isFinite(Number(price)) ? Number(price) : null,
    });
    while (entries.length > 25) {
      entries.shift();
    }
    this.dashboardStats.recentQuoteRecoveries = entries;
  }

  attemptQuoteRecovery({ broker, symbol, mid, source, now = Date.now() } = {}) {
    if (!Number.isFinite(Number(mid))) {
      return null;
    }
    if (!this.eaBridgeService?.recordQuote || !this.eaBridgeService?.getQuotes) {
      return null;
    }

    const normalizedBroker = normalizeBroker(broker);
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedBroker || !normalizedSymbol) {
      return null;
    }

    if (
      !this.canAttemptQuoteRecovery({ broker: normalizedBroker, symbol: normalizedSymbol, now })
    ) {
      return null;
    }

    this.lastQuoteRecoveryAtByKey.set(`${normalizedBroker}:${normalizedSymbol}`, now);
    this.recordQuoteRecoveryAttempt({ broker: normalizedBroker, symbol: normalizedSymbol });

    const price = Number(mid);
    const result = this.eaBridgeService.recordQuote({
      broker: normalizedBroker,
      symbol: normalizedSymbol,
      bid: price,
      ask: price,
      last: price,
      timestamp: now,
      source: source || 'runner_recovery',
    });

    if (result?.success === false) {
      this.recordReject('quote_recovery_failed', {
        broker: normalizedBroker,
        symbol: normalizedSymbol,
        source: source || 'runner_recovery',
        message: result?.message || null,
      });
      return null;
    }

    const refreshed = this.eaBridgeService.getQuotes({
      broker: normalizedBroker,
      symbols: [normalizedSymbol],
      maxAgeMs: this.quoteMaxAgeMs,
    });
    const recovered = Array.isArray(refreshed) && refreshed.length ? refreshed[0] : null;

    if (recovered) {
      this.recordQuoteRecovery({
        broker: normalizedBroker,
        symbol: normalizedSymbol,
        source: source || 'runner_recovery',
        price,
        now,
      });
      return recovered;
    }

    this.recordReject('quote_recovery_not_visible', {
      broker: normalizedBroker,
      symbol: normalizedSymbol,
      source: source || 'runner_recovery',
    });
    return null;
  }

  requestSnapshotBestEffort({ broker, symbol, ctx, reason = null, now = Date.now() } = {}) {
    if (!this.eaBridgeService?.requestMarketSnapshot) {
      return false;
    }

    const normalizedBroker = normalizeBroker(broker);
    const normalizedSymbol = normalizeSymbol(symbol);
    if (!normalizedBroker || !normalizedSymbol) {
      return false;
    }

    const key = `${normalizedBroker}:${normalizedSymbol}`;
    const last = Number(this.lastSnapshotRequestAtByKey.get(key) || 0);
    if (last > 0 && now - last < this.snapshotRequestCooldownMs) {
      this.recordReject('snapshot_request_throttled', {
        broker: normalizedBroker,
        symbol: normalizedSymbol,
        reason,
        cooldownMs: this.snapshotRequestCooldownMs,
        remainingMs: Math.max(0, this.snapshotRequestCooldownMs - (now - last)),
      });
      return false;
    }

    if (ctx && typeof ctx.snapshotRequestsLeft === 'number') {
      if (ctx.snapshotRequestsLeft <= 0) {
        this.recordReject('snapshot_request_budget_exhausted', {
          broker: normalizedBroker,
          symbol: normalizedSymbol,
          reason,
        });
        return false;
      }
      ctx.snapshotRequestsLeft -= 1;
    }

    try {
      this.eaBridgeService.requestMarketSnapshot({
        broker: normalizedBroker,
        symbol: normalizedSymbol,
        ttlMs: this.snapshotRequestTtlMs,
      });
      this.lastSnapshotRequestAtByKey.set(key, now);
      return true;
    } catch (_error) {
      this.recordReject('snapshot_request_error', {
        broker: normalizedBroker,
        symbol: normalizedSymbol,
        reason,
      });
      return false;
    }
  }

  recordDroppedEvent({ reason, broker, symbol, event, message } = {}) {
    const key = String(reason || 'dropped_unknown');
    const brokerKey =
      String(broker || 'unknown')
        .trim()
        .toLowerCase() || 'unknown';
    const now = Date.now();

    const droppedCounts =
      this.dashboardStats.droppedCounts && typeof this.dashboardStats.droppedCounts === 'object'
        ? this.dashboardStats.droppedCounts
        : {};
    droppedCounts[key] = Number(droppedCounts[key] || 0) + 1;
    this.dashboardStats.droppedCounts = droppedCounts;

    const droppedByBroker =
      this.dashboardStats.droppedByBroker && typeof this.dashboardStats.droppedByBroker === 'object'
        ? this.dashboardStats.droppedByBroker
        : {};
    droppedByBroker[brokerKey] = Number(droppedByBroker[brokerKey] || 0) + 1;
    this.dashboardStats.droppedByBroker = droppedByBroker;

    const entries = Array.isArray(this.dashboardStats.droppedEvents)
      ? this.dashboardStats.droppedEvents
      : [];
    entries.push({
      ts: now,
      reason: key,
      broker: brokerKey,
      symbol: symbol ? String(symbol).trim().toUpperCase() : null,
      event: event ? String(event) : null,
      message: message ? String(message) : null,
    });
    while (entries.length > 50) {
      entries.shift();
    }
    this.dashboardStats.droppedEvents = entries;
  }

  recordDebugCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }

    const next = Array.isArray(this.dashboardStats.debugTop)
      ? [...this.dashboardStats.debugTop]
      : [];
    const score = Number(candidate.score);
    const normalized = {
      ...candidate,
      score: Number.isFinite(score) ? score : null,
      ts: Date.now(),
    };

    next.push(normalized);
    next.sort((a, b) => {
      const sa = Number.isFinite(Number(a?.score)) ? Number(a.score) : -Infinity;
      const sb = Number.isFinite(Number(b?.score)) ? Number(b.score) : -Infinity;
      return sb - sa;
    });
    this.dashboardStats.debugTop = next.slice(0, 15);
  }

  getDashboardStats() {
    return {
      ...this.dashboardStats,
      publishCounts: { ...this.dashboardStats.publishCounts },
      rejectCounts: { ...(this.dashboardStats.rejectCounts || {}) },
      lastRejects: Array.isArray(this.dashboardStats.lastRejects)
        ? [...this.dashboardStats.lastRejects]
        : [],
      debugTop: Array.isArray(this.dashboardStats.debugTop)
        ? [...this.dashboardStats.debugTop]
        : [],
      hotSymbols: Array.isArray(this.dashboardStats.hotSymbols)
        ? [...this.dashboardStats.hotSymbols]
        : [],
      droppedEvents: Array.isArray(this.dashboardStats.droppedEvents)
        ? [...this.dashboardStats.droppedEvents]
        : [],
      droppedCounts:
        this.dashboardStats.droppedCounts && typeof this.dashboardStats.droppedCounts === 'object'
          ? { ...this.dashboardStats.droppedCounts }
          : {},
      droppedByBroker:
        this.dashboardStats.droppedByBroker &&
        typeof this.dashboardStats.droppedByBroker === 'object'
          ? { ...this.dashboardStats.droppedByBroker }
          : {},
      quoteRecoveryByBroker:
        this.dashboardStats.quoteRecoveryByBroker &&
        typeof this.dashboardStats.quoteRecoveryByBroker === 'object'
          ? { ...this.dashboardStats.quoteRecoveryByBroker }
          : {},
      quoteRecoveryBySource:
        this.dashboardStats.quoteRecoveryBySource &&
        typeof this.dashboardStats.quoteRecoveryBySource === 'object'
          ? { ...this.dashboardStats.quoteRecoveryBySource }
          : {},
      recentQuoteRecoveries: Array.isArray(this.dashboardStats.recentQuoteRecoveries)
        ? [...this.dashboardStats.recentQuoteRecoveries]
        : [],
    };
  }

  startRevalidationLoop() {
    if (!this.revalidationEnabled) {
      return;
    }
    if (this.revalidateTimer) {
      return;
    }

    this.revalidateTimer = setInterval(() => {
      void this.revalidatePublishedSignals();
    }, this.revalidateIntervalMs);
    this.revalidateTimer.unref?.();
  }

  stopRevalidationLoop() {
    if (this.revalidateTimer) {
      clearInterval(this.revalidateTimer);
      this.revalidateTimer = null;
    }
  }

  async revalidatePublishedSignals() {
    if (!this.revalidationEnabled) {
      return;
    }

    const keys = Array.from(this.lastPublishedMeta.keys());
    if (keys.length === 0) {
      return;
    }

    const now = Date.now();

    for (const key of keys) {
      const [broker, symbol] = String(key).split(':');
      if (!broker || !symbol) {
        continue;
      }

      const last = this.lastRevalidatedAt.get(key) || 0;
      if (now - last < this.revalidateIntervalMs - 250) {
        continue;
      }

      this.lastRevalidatedAt.set(key, now);
      await this.maybeGenerateSignal({ broker, symbol, ctx: null, force: true });
    }
  }

  isSupportedSymbol(symbol) {
    const s = normalizeSymbol(symbol);
    if (!s) {
      return false;
    }

    // Default behavior: accept any sane EA symbol token.
    // Strict behavior (opt-in): require known/allowed instruments only.
    if (!isStrictEaSymbolFilterEnabled()) {
      return isSaneEaSymbolToken(s);
    }

    if (this.eaBridgeService?.isAllowedAssetSymbol) {
      try {
        return Boolean(this.eaBridgeService.isAllowedAssetSymbol(s));
      } catch (_error) {
        // fall through
      }
    }

    const base = extractBaseSymbol(s);
    if (!base) {
      return false;
    }

    // FX
    if (/^[A-Z]{6}$/.test(base)) {
      return true;
    }

    // Metals
    if (
      base === 'XAUUSD' ||
      base === 'XAGUSD' ||
      base === 'XAGEUR' ||
      base === 'XPTUSD' ||
      base === 'XPDUSD'
    ) {
      return true;
    }
    if (base === 'GOLD' || base === 'SILVER') {
      return true;
    }

    // Crypto (common quote currencies)
    if (/^(BTC|ETH|LTC|XRP|BCH|ADA|DOT|SOL|DOGE|BNB|AVAX|TRX|XLM|LINK)(USD|USDT|EUR)/.test(base)) {
      return true;
    }

    return false;
  }

  getLatestBarTime({ broker, symbol } = {}) {
    if (!this.eaBridgeService?.getMarketBars) {
      return null;
    }
    const brokerId = normalizeBroker(broker);
    const sym = normalizeSymbol(symbol);
    if (!brokerId || !sym) {
      return null;
    }

    const timeframes = ['M1', 'M15', 'H1', 'H4', 'D1'];
    for (const timeframe of timeframes) {
      try {
        const bars = this.eaBridgeService.getMarketBars({
          broker: brokerId,
          symbol: sym,
          timeframe,
          limit: 3,
          maxAgeMs: 0,
        });
        const list = Array.isArray(bars) ? bars : [];
        if (list.length === 0) {
          continue;
        }
        const newest = list[0];
        const t = toEpochMs(newest?.time ?? newest?.timestamp ?? newest?.t);
        if (t != null) {
          return t;
        }
      } catch (_error) {
        // ignore
      }
    }

    return null;
  }

  hasEnoughBars({ broker, symbol, timeframe = 'M15', minBars = 120 } = {}) {
    if (!this.eaBridgeService?.getMarketBars) {
      return false;
    }
    const brokerId = normalizeBroker(broker);
    const sym = normalizeSymbol(symbol);
    const tf = String(timeframe || '')
      .trim()
      .toUpperCase();
    if (!brokerId || !sym || !tf) {
      return false;
    }

    try {
      const bars = this.eaBridgeService.getMarketBars({
        broker: brokerId,
        symbol: sym,
        timeframe: tf,
        limit: minBars,
        maxAgeMs: 0,
      });
      return Array.isArray(bars) && bars.length >= Math.max(30, Number(minBars) || 120);
    } catch (_error) {
      return false;
    }
  }

  ingestSymbols({ broker, symbols } = {}) {
    const brokerId = normalizeBroker(broker);
    if (!brokerId) {
      return;
    }

    const list = Array.isArray(symbols) ? symbols : [];
    if (list.length === 0) {
      return;
    }

    const set = this.pendingByBroker.get(brokerId) || new Set();
    let dropped = 0;
    for (const raw of list) {
      const symbol = normalizeSymbol(raw);
      if (!symbol) {
        continue;
      }
      if (!set.has(symbol) && set.size >= this.maxPendingSymbolsPerBroker) {
        dropped += 1;
        continue;
      }
      set.add(symbol);
    }
    this.pendingByBroker.set(brokerId, set);

    if (dropped > 0) {
      this.dashboardStats.queueOverflowDrops =
        Number(this.dashboardStats.queueOverflowDrops || 0) + dropped;
      this.dashboardStats.lastQueueOverflowAt = Date.now();
      this.recordReject('pending_queue_overflow', {
        broker: brokerId,
        dropped,
        cap: this.maxPendingSymbolsPerBroker,
      });
    }

    this.refreshQueueStats();

    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.flushInProgress) {
      this.flushQueued = true;
      return;
    }
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushPending();
    }, this.debounceMs);
  }

  async flushPending() {
    if (this.flushInProgress) {
      this.flushQueued = true;
      return;
    }

    this.flushInProgress = true;
    this.refreshQueueStats();
    const flushStartedAt = Date.now();

    try {
      const brokers = Array.from(this.pendingByBroker.keys());
      if (brokers.length === 0) {
        return;
      }

      for (const broker of brokers) {
        const symbolsSet = this.pendingByBroker.get(broker);
        if (!symbolsSet || symbolsSet.size === 0) {
          this.pendingByBroker.delete(broker);
          continue;
        }

        const allSymbols = Array.from(symbolsSet);
        symbolsSet.clear();
        this.pendingByBroker.delete(broker);

        const cursor = this.cursorByBroker.get(broker) || 0;
        const total = allSymbols.length;
        const batchSize = Math.min(this.maxSymbolsPerFlush, total);

        const batch = [];
        const remaining = new Set();
        for (let i = 0; i < total; i++) {
          const idx = (cursor + i) % total;
          const symbol = allSymbols[idx];
          if (batch.length < batchSize) {
            batch.push(symbol);
          } else {
            remaining.add(symbol);
          }
        }

        this.cursorByBroker.set(broker, (cursor + batchSize) % Math.max(1, total));

        if (remaining.size > 0) {
          this.pendingByBroker.set(broker, remaining);
        }

        this.refreshQueueStats();

        const ctx = { snapshotRequestsLeft: this.maxSnapshotRequestsPerFlush };

        // Process sequentially to avoid stampeding the engine.
        for (const symbol of batch) {
          if (!this.isSupportedSymbol(symbol)) {
            continue;
          }
          try {
            await this.maybeGenerateSignal({ broker, symbol, ctx });
          } catch (error) {
            this.recordReject('flush_symbol_error', {
              broker,
              symbol,
              message: error?.message || null,
            });
            try {
              this.logger?.warn?.(
                { module: 'RealtimeEaSignalRunner', broker, symbol, err: error },
                'Realtime flush failed for symbol'
              );
            } catch (_logError) {
              // best-effort
            }
          }
        }
      }
    } finally {
      this.flushInProgress = false;
      const flushDuration = Math.max(0, Date.now() - flushStartedAt);
      this.dashboardStats.flushRuns = Number(this.dashboardStats.flushRuns || 0) + 1;
      this.dashboardStats.lastFlushAt = Date.now();
      this.dashboardStats.lastFlushDurationMs = flushDuration;
      this.dashboardStats.maxFlushDurationMs = Math.max(
        Number(this.dashboardStats.maxFlushDurationMs || 0),
        flushDuration
      );
      this.refreshQueueStats();

      const needsAnotherPass = this.pendingByBroker.size > 0 || this.flushQueued;
      this.flushQueued = false;
      if (needsAnotherPass) {
        this.scheduleFlush();
      }
    }
  }

  buildFingerprint(signal) {
    if (!signal || typeof signal !== 'object') {
      return '';
    }

    const dir = String(signal.direction || '').toUpperCase();
    const confidence = Number.isFinite(Number(signal.confidence))
      ? Math.round(Number(signal.confidence))
      : 0;
    const strength = Number.isFinite(Number(signal.strength))
      ? Math.round(Number(signal.strength))
      : 0;
    const entry = Number.isFinite(Number(signal.entry?.price))
      ? Number(signal.entry.price).toFixed(6)
      : 'na';

    const decisionState = String(getDecisionState(signal) || '').toUpperCase() || 'na';
    const status =
      String(signal?.signalStatus || signal?.validity?.state || '').toUpperCase() || 'na';
    const confluenceScore = Number.isFinite(Number(signal?.components?.confluence?.score))
      ? Math.round(Number(signal.components.confluence.score))
      : 0;

    return `${dir}:${confidence}:${strength}:${entry}:${decisionState}:${status}:${confluenceScore}`;
  }

  async maybeGenerateSignal({ broker, symbol, ctx, force = false }) {
    const key = `${broker}:${symbol}`;
    const now = Date.now();

    const last = this.lastGeneratedAt.get(key) || 0;
    if (!force && now - last < this.minIntervalMs) {
      return;
    }

    const quotes = this.eaBridgeService?.getQuotes
      ? this.eaBridgeService.getQuotes({ broker, symbols: [symbol], maxAgeMs: this.quoteMaxAgeMs })
      : [];
    let quote = Array.isArray(quotes) && quotes.length ? quotes[0] : null;

    const snapshot = this.eaBridgeService?.getMarketSnapshot
      ? this.eaBridgeService.getMarketSnapshot({ broker, symbol, maxAgeMs: this.snapshotMaxAgeMs })
      : null;

    // Fallback: some EA setups stream bars/snapshots but quotes can pause.
    // For dashboard analysis we can use the latest bar close as a best-effort price anchor.
    const barFallback = (() => {
      if (!this.eaBridgeService?.getMarketBars) {
        return null;
      }
      const timeframes = ['M1', 'M15', 'H1', 'H4', 'D1'];
      for (const timeframe of timeframes) {
        try {
          const bars = this.eaBridgeService.getMarketBars({
            broker,
            symbol,
            timeframe,
            limit: 1,
            maxAgeMs: 0,
          });
          const list = Array.isArray(bars) ? bars : [];
          const newest = list[0] || null;
          const close = newest?.close ?? newest?.c;
          const t = toEpochMs(newest?.time ?? newest?.timestamp ?? newest?.t);
          const price = close != null ? Number(close) : null;
          if (Number.isFinite(price)) {
            return { price, timeMs: t || null, timeframe };
          }
        } catch (_error) {
          // ignore
        }
      }
      return null;
    })();

    const snapshotMid = (() => {
      if (!snapshot || typeof snapshot !== 'object') {
        return null;
      }
      const q = snapshot?.quote || snapshot?.tick || snapshot;
      const bid = Number(q?.bid);
      const ask = Number(q?.ask);
      const last = Number(q?.last);

      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
        return (bid + ask) / 2;
      }
      if (Number.isFinite(last) && last > 0) {
        return last;
      }
      return null;
    })();

    if (!quote && !barFallback && !Number.isFinite(snapshotMid)) {
      if (this.eaBridgeService?.isBrokerConnected) {
        const connected = this.eaBridgeService.isBrokerConnected({
          broker,
          maxAgeMs: this.quoteMaxAgeMs,
        });
        if (!connected) {
          return;
        }
      }
      // No local market data yet; ask EA to send a snapshot so the next scan cycle can proceed.
      this.requestSnapshotBestEffort({ broker, symbol, ctx, reason: 'missing_market_data', now });
      return;
    }

    const fallbackMid = barFallback?.price ?? snapshotMid;
    if (!quote && Number.isFinite(fallbackMid)) {
      const recoverySource = barFallback
        ? `bars_${String(barFallback.timeframe || 'unknown').toLowerCase()}`
        : 'snapshot_mid';
      const recoveredQuote = this.attemptQuoteRecovery({
        broker,
        symbol,
        mid: fallbackMid,
        source: recoverySource,
        now,
      });
      if (recoveredQuote) {
        quote = recoveredQuote;
      }
    }

    const mid = quote ? computeMidFromQuote(quote) : fallbackMid;
    if (!Number.isFinite(mid)) {
      return;
    }

    if (this.smartStrong && this.smartRequireQuote) {
      const hasQuotePrice =
        quote &&
        (Number.isFinite(Number(quote.bid)) ||
          Number.isFinite(Number(quote.ask)) ||
          Number.isFinite(Number(quote.last)));
      if (!hasQuotePrice) {
        return;
      }
    }

    const latestBarTime = this.getLatestBarTime({ broker, symbol });
    const barAgeMs = latestBarTime != null ? Math.max(0, now - latestBarTime) : null;
    if (this.smartStrong && this.smartMaxBarAgeMs != null) {
      if (barAgeMs == null) {
        if (this.dashboardRequireBars) {
          return;
        }
      } else if (barAgeMs > this.smartMaxBarAgeMs) {
        return;
      }
    }

    if (this.smartStrong && quote && quote.bid != null && quote.ask != null) {
      const bid = Number(quote.bid);
      const ask = Number(quote.ask);
      if (Number.isFinite(bid) && Number.isFinite(ask) && ask > bid) {
        const spread = ask - bid;
        const spreadPct = mid > 0 ? (spread / mid) * 100 : null;
        const spreadPoints =
          quote.point != null && Number.isFinite(Number(quote.point))
            ? spread / Number(quote.point)
            : quote.spreadPoints != null
              ? Number(quote.spreadPoints)
              : null;

        const spreadPctLimit = isMetalSymbolToken(symbol)
          ? this.smartMaxSpreadPctMetals
          : this.smartMaxSpreadPct;

        if (spreadPctLimit != null && Number.isFinite(spreadPct) && spreadPct > spreadPctLimit) {
          return;
        }

        const spreadPointsLimit = isMetalSymbolToken(symbol)
          ? this.smartMaxSpreadPointsMetals
          : this.smartMaxSpreadPoints;

        if (
          spreadPointsLimit != null &&
          Number.isFinite(spreadPoints) &&
          spreadPoints > spreadPointsLimit
        ) {
          return;
        }
      }
    }

    const barsReady = this.hasEnoughBars({ broker, symbol, timeframe: 'M15', minBars: 120 });

    if (!snapshot) {
      // Ask EA to send the full technical snapshot; dashboard publishing may require it.
      this.requestSnapshotBestEffort({ broker, symbol, ctx, reason: 'snapshot_missing', now });

      if (this.dashboardRequireSnapshot) {
        // No decision should be published before the full analysis snapshot is ready.
        this.recordReject('missing_snapshot', { broker, symbol });
        this.lastGeneratedAt.set(key, now);
        return;
      }

      if (this.dashboardRequireBars && !barsReady) {
        this.recordReject('missing_bars', { broker, symbol, timeframe: 'M15' });
        this.lastGeneratedAt.set(key, now);
        return;
      }
    }

    if (this.dashboardRequireBars && !barsReady) {
      // Even with snapshot, require enough bars for stable candle-based analysis.
      this.recordReject('missing_bars', { broker, symbol, timeframe: 'M15' });
      this.lastGeneratedAt.set(key, now);
      return;
    }

    if (this.smartStrong) {
      const strictDataRequired = this.dashboardRequireSnapshot || this.dashboardRequireBars;
      if (strictDataRequired && (!snapshot || !barsReady)) {
        this.recordReject('smart_strict_missing_data', {
          broker,
          symbol,
          snapshot: Boolean(snapshot),
          barsReady: Boolean(barsReady),
        });
        this.lastGeneratedAt.set(key, now);
        return;
      }
    }

    // Use unified SignalFactory instead of direct tradingEngine call
    // This ensures all signals go through LayerOrchestrator and update UnifiedSnapshotManager
    let rawSignal;
    try {
      const signalFactory = this.eaBridgeService?.getSignalFactory?.();

      if (!signalFactory) {
        // Fallback to old method if SignalFactory not available
        rawSignal = await this.tradingEngine.generateSignal(symbol, {
          broker,
          analysisMode: 'ea',
          eaOnly: true,
        });
      } else {
        // Use unified SignalFactory (includes LayerOrchestrator)
        const result = await signalFactory.generateSignal({
          broker,
          symbol,
          options: {
            analysisMode: 'ea',
            eaOnly: true,
          },
        });

        rawSignal = result?.signal || null;

        // Signal is already enriched with layered analysis and validated
        // No need for manual layer attachment - LayerOrchestrator already did it
      }
    } catch (error) {
      this.recordReject('generate_signal_error', {
        broker,
        symbol,
        message: error?.message || null,
      });
      this.logger?.warn?.(
        { module: 'RealtimeEaSignalRunner', broker, symbol, err: error },
        'EA realtime signal generation failed'
      );
      return;
    }

    if (!rawSignal || typeof rawSignal !== 'object') {
      this.recordReject('generate_signal_empty', { broker, symbol });

      const fallbackDirection = (() => {
        const current = Number(barFallback?.price);
        const previous = Number(barFallback?.prevClose);
        if (Number.isFinite(current) && Number.isFinite(previous) && current !== previous) {
          return current > previous ? 'BUY' : 'SELL';
        }
        const quoteBid = Number(quote?.bid);
        const quoteAsk = Number(quote?.ask);
        if (Number.isFinite(quoteBid) && Number.isFinite(quoteAsk) && quoteAsk > quoteBid) {
          return quoteAsk >= quoteBid ? 'BUY' : 'SELL';
        }
        return 'NEUTRAL';
      })();

      // Deterministic candidate fallback (non-random): keep symbol visible in dashboard
      // when upstream signal computation is temporarily unavailable (e.g. missing snapshot).
      rawSignal = {
        broker,
        pair: symbol,
        symbol,
        timestamp: now,
        direction: fallbackDirection,
        strength: 0,
        confidence: 0,
        finalScore: 0,
        signalStatus: 'analysis_pending',
        validity: {
          state: 'WAIT_MONITOR',
          evaluatedAt: now,
          reason: 'analysis_pending_upstream',
        },
        components: {
          technical: {
            signals: [
              {
                timeframe: barFallback?.timeframe || null,
                source: 'realtime_fallback',
              },
            ],
          },
          diagnostics: {
            fallback: true,
            reason: 'generate_signal_empty',
            barFallbackTimeframe: barFallback?.timeframe || null,
            hasQuote: Boolean(quote),
            hasSnapshot: Boolean(snapshot),
            barsReady,
          },
        },
        isValid: {
          isValid: false,
          checks: {},
          reason: 'Signal generation pending complete market context',
          decision: {
            state: 'WAIT_MONITOR',
            blocked: true,
            blockedReason: 'analysis_pending_upstream',
          },
        },
      };
    }

    // Ensure the DTO includes broker context (used by the dashboard to filter).
    rawSignal.broker = broker;

    // LEGACY: Attach the canonical 18-layer analysis for dashboard visibility
    // if SignalFactory was not available (fallback path).
    // If using SignalFactory, layers are already attached by LayerOrchestrator.
    const signalFactory = this.eaBridgeService?.getSignalFactory?.();
    if (!signalFactory) {
      // Fallback: manual layer attachment (old path)
      try {
        attachLayeredAnalysisToSignal({
          rawSignal,
          broker,
          symbol,
          eaBridgeService: this.eaBridgeService,
          quoteMaxAgeMs: this.quoteMaxAgeMs,
          barFallback,
          now,
        });
      } catch (error) {
        this.recordReject('attach_layers_error', {
          broker,
          symbol,
          message: error?.message || null,
        });
        this.lastGeneratedAt.set(key, now);
        return;
      }
    }

    if (this.smartStrong && this.smartRequireBarsCoverage && this.dashboardRequireBars) {
      const layers = rawSignal?.components?.layeredAnalysis?.layers;
      const layer1 = Array.isArray(layers)
        ? layers.find((layer) => String(layer?.key || '') === 'L1' || Number(layer?.layer) === 1)
        : null;
      const barsCoverage = layer1?.metrics?.barsCoverage || null;
      const m15 = barsCoverage?.M15 || null;
      const h1 = barsCoverage?.H1 || null;

      const m15Count = Number(m15?.count);
      const h1Count = Number(h1?.count);
      const m15Age = Number(m15?.ageMs);
      const h1Age = Number(h1?.ageMs);

      const m15CountOk = !Number.isFinite(m15Count) || m15Count >= this.smartBarsMinM15;
      const h1CountOk = !Number.isFinite(h1Count) || h1Count >= this.smartBarsMinH1;

      const m15AgeOk =
        this.smartBarsMaxAgeM15Ms == null ||
        !Number.isFinite(m15Age) ||
        m15Age <= this.smartBarsMaxAgeM15Ms;
      const h1AgeOk =
        this.smartBarsMaxAgeH1Ms == null ||
        !Number.isFinite(h1Age) ||
        h1Age <= this.smartBarsMaxAgeH1Ms;

      if (!(m15CountOk && h1CountOk && m15AgeOk && h1AgeOk)) {
        this.recordReject('bars_coverage_guard', {
          broker,
          symbol,
          m15: m15 || null,
          h1: h1 || null,
        });
        this.lastGeneratedAt.set(key, now);
        return;
      }
    }

    // Best-effort timeframe inference for dashboard display.
    // Prefer explicit/technical timeframe; fallback to the bar fallback timeframe if available.
    if (!rawSignal.timeframe) {
      const inferred =
        rawSignal?.components?.technical?.signals?.[0]?.timeframe ?? barFallback?.timeframe ?? null;
      if (inferred != null && String(inferred).trim()) {
        rawSignal.timeframe = String(inferred);
      }
    }

    const decisionState = getDecisionState(rawSignal);
    const tradeValid = rawSignal?.isValid?.isValid === true;

    const confluence = rawSignal?.components?.confluence || null;
    const confluencePassed = confluence?.passed === true;
    const confluenceReady = Boolean(
      confluence &&
      Number.isFinite(Number(confluence?.evaluatedAt)) &&
      Array.isArray(confluence?.layers) &&
      confluence.layers.length > 0
    );

    const confidence = Number(rawSignal.confidence) || 0;
    const strength = Number(rawSignal.strength) || 0;

    const minConfidence = Number.isFinite(this.dashboardMinConfidence)
      ? this.dashboardMinConfidence
      : this.minConfidence;
    const minStrength = Number.isFinite(this.dashboardMinStrength)
      ? this.dashboardMinStrength
      : this.minStrength;

    const isStrong = confidence >= minConfidence && strength >= minStrength;

    const prevMeta = this.lastPublishedMeta.get(key) || null;
    const statusNow =
      String(rawSignal?.signalStatus || rawSignal?.validity?.state || '').toUpperCase() || null;
    const expiresAtNow = Number(rawSignal?.expiresAt ?? rawSignal?.validity?.expiresAt);
    const confluenceScoreNow = Number(rawSignal?.components?.confluence?.score);
    const metaNow = {
      decisionState: decisionState || null,
      tradeValid,
      status: statusNow,
      confluenceScore: Number.isFinite(confluenceScoreNow) ? Number(confluenceScoreNow) : null,
      expiresAt: Number.isFinite(expiresAtNow) ? Number(expiresAtNow) : null,
    };

    const isLifecycleUpdate = Boolean(
      prevMeta &&
      (prevMeta.decisionState !== metaNow.decisionState ||
        prevMeta.tradeValid !== metaNow.tradeValid ||
        prevMeta.status !== metaNow.status ||
        (metaNow.confluenceScore != null && prevMeta.confluenceScore !== metaNow.confluenceScore))
    );

    const directional = (() => {
      const dir = String(rawSignal.direction || '').toUpperCase();
      return dir === 'BUY' || dir === 'SELL';
    })();

    const actionableState = decisionState === 'ENTER';
    const tier = isStrong ? 'strong' : null;

    // Canonical semantics:
    // - 'signal' == entry-ready (ENTER) or lifecycle updates for previously ENTER signals
    // - 'signal_candidate' == watch/candidate visibility (WAIT_MONITOR, diagnostics)
    const requiresEnter = this.dashboardRequireEnter;
    const meetsEnter = !requiresEnter || decisionState === 'ENTER';
    const meetsConfluence =
      !this.dashboardRequireConfluence || (confluenceReady && confluencePassed);
    const layered = rawSignal?.components?.layeredAnalysis || null;
    const layersStatus = evaluateLayers18Readiness({
      layeredAnalysis: layered,
      minConfluence: this.dashboardLayers18MinConfluence,
      decisionStateFallback: decisionState,
      signal: rawSignal,
    });
    const layers18 = Array.isArray(layered?.layers) ? layered.layers : [];
    const layers18Ready = layersStatus.ok === true;
    const layersGateVerdict = String(layersStatus?.layer18Verdict || '').toUpperCase() || null;
    const layersDecisionState = String(layersStatus?.layer20State || '').toUpperCase() || null;

    const meetsLayers18 = !this.dashboardRequireLayers18 || layers18Ready;
    const meetsTradeValidity = tradeValid === true;

    // "Analyzed" presence marker from layered payload.
    const analyzedReady = Boolean(rawSignal?.components?.layeredAnalysis) && layers18.length > 0;
    const analyzedComplete = layers18.length >= 20;

    const publish = (() => {
      const canPublishEntryReady =
        directional &&
        decisionState === 'ENTER' &&
        isStrong &&
        meetsEnter &&
        meetsConfluence &&
        meetsLayers18 &&
        meetsTradeValidity;

      if (
        canPublishEntryReady ||
        (directional && isLifecycleUpdate && prevMeta?.decisionState === 'ENTER')
      ) {
        return { event: 'signal', keySuffix: '' };
      }
      return null;
    })();

    if (!publish) {
      const rejectReason = (() => {
        if (!directional) {
          return 'filtered_non_directional';
        }
        if (!actionableState) {
          return 'filtered_state';
        }
        if (!isStrong) {
          return 'filtered_weak';
        }
        if (!meetsEnter) {
          return 'filtered_require_enter';
        }
        if (this.dashboardRequireConfluence) {
          if (!confluenceReady) {
            return 'filtered_confluence_missing';
          }
          if (!confluencePassed) {
            return 'filtered_confluence_failed';
          }
        }
        if (this.dashboardRequireLayers18 && !layers18Ready) {
          return 'filtered_layers18';
        }
        if (!meetsTradeValidity) {
          return 'filtered_trade_invalid';
        }
        if (!analyzedReady) {
          return 'filtered_missing_layered_analysis';
        }
        return 'filtered_other';
      })();

      this.recordReject(rejectReason, {
        broker,
        symbol,
        pair: rawSignal?.pair || symbol,
        decisionState,
        tradeValid,
        confidence,
        strength,
        tier,
        confluencePassed,
        confluenceReady,
        confluenceScore: Number.isFinite(Number(confluence?.score))
          ? Number(confluence.score)
          : null,
        layers: {
          count: layers18.length,
          complete: analyzedComplete,
          ready: layers18Ready,
          layer18Verdict: layersGateVerdict,
          decisionState: layersDecisionState,
        },
      });

      if (isStrong || analyzedReady) {
        const score = Number.isFinite(Number(rawSignal?.finalScore))
          ? Number(rawSignal.finalScore)
          : confidence + strength;
        this.recordDebugCandidate({
          broker,
          symbol,
          pair: rawSignal?.pair || symbol,
          decisionState,
          tradeValid,
          tier,
          confidence,
          strength,
          finalScore: Number.isFinite(Number(rawSignal?.finalScore))
            ? Number(rawSignal.finalScore)
            : null,
          score,
          analyzed: {
            available: analyzedReady,
            layers: layers18.length,
            complete: analyzedComplete,
          },
          confluence: {
            passed: confluencePassed,
            ready: confluenceReady,
            score: Number.isFinite(Number(confluence?.score)) ? Number(confluence.score) : null,
          },
          layers18: {
            ready: layers18Ready,
            layer18Verdict: layersGateVerdict,
            decisionState: layersDecisionState,
          },
          filteredBy: rejectReason,
        });
      }

      const publishCandidate =
        (directional && analyzedReady) ||
        (this.dashboardAllowCandidates === true &&
          (directional || decisionState === 'WAIT_MONITOR' || tradeValid === false));
      if (!publishCandidate) {
        this.lastGeneratedAt.set(key, now);
        return;
      }

      const candidateBroadcastEvent = 'signal_candidate';
      const candidateBroadcastKey = `${key}:candidate`;

      const lastCandidateBarTime = this.lastPublishedBarTime.get(candidateBroadcastKey) || null;
      if (
        !isLifecycleUpdate &&
        latestBarTime != null &&
        lastCandidateBarTime != null &&
        latestBarTime === lastCandidateBarTime
      ) {
        this.lastGeneratedAt.set(key, now);
        this.lastGeneratedAt.set(candidateBroadcastKey, now);
        return;
      }

      const candidateFingerprint = `${this.buildFingerprint(rawSignal)}:candidate:${rejectReason}`;
      const lastCandidateFp = this.lastFingerprint.get(candidateBroadcastKey) || '';
      if (candidateFingerprint && candidateFingerprint === lastCandidateFp) {
        this.lastGeneratedAt.set(key, now);
        this.lastGeneratedAt.set(candidateBroadcastKey, now);
        return;
      }

      let candidateDto;
      try {
        candidateDto = validateTradingSignalDTO(createTradingSignalDTO(rawSignal));
      } catch (error) {
        this.recordReject('dto_validation_error', {
          broker,
          symbol,
          message: error?.message || null,
          event: candidateBroadcastEvent,
        });
        this.lastGeneratedAt.set(key, now);
        this.lastGeneratedAt.set(candidateBroadcastKey, now);
        return;
      }

      candidateDto.shouldExecute = false;

      this.lastGeneratedAt.set(key, now);
      this.lastGeneratedAt.set(candidateBroadcastKey, now);
      this.lastFingerprint.set(candidateBroadcastKey, candidateFingerprint);
      if (latestBarTime != null) {
        this.lastPublishedBarTime.set(candidateBroadcastKey, latestBarTime);
      }
      this.lastPublishedMeta.set(candidateBroadcastKey, metaNow);

      try {
        if (typeof this.broadcast !== 'function') {
          this.recordReject('broadcast_unavailable', {
            broker,
            symbol,
            event: candidateBroadcastEvent,
          });
          this.recordDroppedEvent({
            reason: 'broadcast_unavailable',
            broker,
            symbol,
            event: candidateBroadcastEvent,
            message: 'Broadcast handler is unavailable',
          });
          return;
        }
        this.broadcast(candidateBroadcastEvent, candidateDto);
        this.recordHotSymbol({
          broker,
          symbol: candidateDto?.pair || symbol,
          event: candidateBroadcastEvent,
          kind: 'candidate',
        });
        this.recordPublish(candidateBroadcastEvent);
      } catch (error) {
        this.recordReject('broadcast_error', {
          broker,
          symbol,
          event: candidateBroadcastEvent,
          message: error?.message || null,
        });
        this.recordDroppedEvent({
          reason: 'broadcast_error',
          broker,
          symbol,
          event: candidateBroadcastEvent,
          message: error?.message || null,
        });
      }
      return;
    }

    const broadcastEvent = publish.event;
    const broadcastKey = publish.keySuffix ? `${key}${publish.keySuffix}` : key;

    // Bar-driven behavior: publish at most once per new bar (prefer M15/H1).
    // Lifecycle updates (validity/status/confluence changes) are allowed intra-bar.
    const lastBarTime = this.lastPublishedBarTime.get(broadcastKey) || null;
    if (
      !isLifecycleUpdate &&
      latestBarTime != null &&
      lastBarTime != null &&
      latestBarTime === lastBarTime
    ) {
      this.lastGeneratedAt.set(broadcastKey, now);
      return;
    }

    const fingerprint = this.buildFingerprint(rawSignal);
    const lastFp = this.lastFingerprint.get(broadcastKey) || '';
    if (fingerprint && fingerprint === lastFp) {
      // Avoid spamming the same signal repeatedly.
      this.lastGeneratedAt.set(broadcastKey, now);
      return;
    }

    let dto;
    try {
      dto = validateTradingSignalDTO(createTradingSignalDTO(rawSignal));
    } catch (error) {
      this.recordReject('dto_validation_error', {
        broker,
        symbol,
        message: error?.message || null,
      });
      this.lastGeneratedAt.set(broadcastKey, now);
      return;
    }

    // Single smart path (no conflicts): seed snapshot cache + compute executability using the same payload.
    // Only ENTER signals will be evaluated for execution gates.
    if (
      broadcastEvent === 'signal' &&
      (broker === 'mt4' || broker === 'mt5') &&
      typeof this.eaBridgeService?.getSmartSignalSnapshot === 'function'
    ) {
      try {
        const snapshot = await this.eaBridgeService.getSmartSignalSnapshot({
          broker,
          symbol: dto?.pair || symbol,
          accountMode: ctx?.accountMode || null,
          signal: dto,
        });

        if (snapshot && snapshot.signal) {
          try {
            dto = validateTradingSignalDTO(createTradingSignalDTO(snapshot.signal));
          } catch (_error) {
            // Keep previously validated DTO as fallback.
          }
          dto.shouldExecute = snapshot.shouldExecute === true;
          dto.execution = snapshot.execution || dto.execution || null;

          // Surface EA-bridge blocking as a decision flag to keep UI consistent.
          if (dto?.isValid?.decision && typeof dto.isValid.decision === 'object') {
            const blocked =
              snapshot?.shouldExecute === false &&
              (snapshot?.executionMessage === 'Signal is blocked' ||
                snapshot?.execution?.gates?.blockedReason != null);
            if (blocked) {
              dto.isValid.decision.blocked = true;
            }
          }
        }
      } catch (_error) {
        // best-effort
      }
    } else {
      // Fallback: still seed analysis snapshot cache for dashboard/EA alignment.
      try {
        if (typeof this.eaBridgeService?.cacheAnalysisSnapshot === 'function') {
          this.eaBridgeService.cacheAnalysisSnapshot({
            broker,
            symbol: dto?.pair || symbol,
            signal: dto,
            tradeValid: Boolean(dto?.isValid?.isValid),
            message: Boolean(dto?.isValid?.isValid)
              ? 'OK'
              : 'Signal not valid for trading (showing analysis only)',
            computedAt: now,
          });
        }
      } catch (_error) {
        // best-effort
      }
    }

    if (broadcastEvent === 'signal' && dto?.shouldExecute !== true) {
      this.recordReject('filtered_not_executable', {
        broker,
        symbol,
        pair: dto?.pair || symbol,
        decisionState: getDecisionState(dto),
        shouldExecute: dto?.shouldExecute === true,
      });
      this.lastGeneratedAt.set(broadcastKey, now);
      return;
    }

    this.lastGeneratedAt.set(broadcastKey, now);
    this.lastFingerprint.set(broadcastKey, fingerprint);
    if (latestBarTime != null) {
      this.lastPublishedBarTime.set(broadcastKey, latestBarTime);
    }
    this.lastPublishedMeta.set(broadcastKey, metaNow);

    try {
      if (typeof this.broadcast !== 'function') {
        this.recordReject('broadcast_unavailable', { broker, symbol, event: broadcastEvent });
        this.recordDroppedEvent({
          reason: 'broadcast_unavailable',
          broker,
          symbol,
          event: broadcastEvent,
          message: 'Broadcast handler is unavailable',
        });
        return;
      }
      this.broadcast(broadcastEvent, dto);
      this.recordHotSymbol({
        broker,
        symbol: dto?.pair || symbol,
        event: broadcastEvent,
        kind: dto?.shouldExecute === true ? 'executable' : null,
      });
      this.recordPublish(broadcastEvent);
    } catch (error) {
      this.recordReject('broadcast_error', {
        broker,
        symbol,
        event: broadcastEvent,
        message: error?.message || null,
      });
      this.recordDroppedEvent({
        reason: 'broadcast_error',
        broker,
        symbol,
        event: broadcastEvent,
        message: error?.message || null,
      });
      return;
    }

    // Local hook for auto-trading execution (server-side).
    // Only ENTER signals are eligible for execution.
    if (
      broadcastEvent === 'signal' &&
      getDecisionState(dto) === 'ENTER' &&
      dto?.shouldExecute === true &&
      this.onSignal
    ) {
      try {
        this.onSignal({ broker, signal: dto });
      } catch (_error) {
        // best-effort
      }
    }

    this.logger?.info?.(
      {
        module: 'RealtimeEaSignalRunner',
        broker,
        pair: dto.pair,
        direction: dto.direction,
        strength: dto.strength,
        confidence: dto.confidence,
        tier: tier || (isLifecycleUpdate ? 'update' : 'filtered'),
      },
      'Broadcasted EA realtime signal'
    );
  }
}
