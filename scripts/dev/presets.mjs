// Centralized dev presets for `npm run start:all`
// Keep this as the single source of truth for common env combinations.

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^preset:/, '')
    .replace(/[\s-]+/g, '_');

export const PRESETS = {
  default: {
    label: 'Default (uses env defaults)',
    env: {},
  },

  realtime_db: {
    label: 'Real-time + DB required (no synthetic)',
    env: {
      REQUIRE_REALTIME_DATA: 'true',
      ALLOW_SYNTHETIC_DATA: 'false',
      DB_REQUIRED: 'true',
    },
  },

  synthetic: {
    label: 'Synthetic dev (NO DB/NO KEYS)',
    env: {
      ALLOW_SYNTHETIC_DATA: 'true',
      REQUIRE_REALTIME_DATA: 'false',
      NEWS_RSS_ONLY: 'true',
    },
  },

  all_symbols: {
    label: 'Allow ALL symbols',
    env: {
      ALLOW_ALL_SYMBOLS: 'true',
    },
  },

  all_symbols_full_scan: {
    label: 'Allow ALL symbols + Full scan',
    env: {
      ALLOW_ALL_SYMBOLS: 'true',
      EA_FULL_SCAN: 'true',
      EA_BACKGROUND_SIGNALS: 'true',
      EA_RESPECT_DASHBOARD_ACTIVE_SYMBOLS: 'false',
      EA_DASHBOARD_ALLOW_CANDIDATES: 'true',
      EA_SCAN_SYMBOLS_MAX: '2000',
      VITE_ACTIVE_SYMBOLS_SYNC_MAX: '2000',
      WS_MAX_RECENT_CANDIDATE_SIGNALS: '500',
      VITE_MAX_CANDIDATE_ITEMS: '500',
      VITE_CANDIDATE_TABLE_ROWS: '200',
    },
  },

  all_symbols_auto_trading: {
    label: 'Allow ALL symbols + Auto-trading autostart',
    env: {
      ALLOW_ALL_SYMBOLS: 'true',
      AUTO_TRADING_AUTOSTART: 'true',
    },
  },

  smart_strong_mt5_auto: {
    label: 'SMART STRONG MT5 auto',
    env: {
      ALLOW_ALL_SYMBOLS: 'false',
      AUTO_TRADING_ASSET_CLASSES: 'forex,metals',
      AUTO_TRADING_AUTOSTART: 'true',
      AUTO_TRADING_PRESET: 'smart_strong',
      AUTO_TRADING_FORCE_BROKER: 'mt5',
    },
  },

  smart_strong_mt5_more_entries: {
    label: 'SMART STRONG MT5 auto (+ more entries)',
    env: {
      ALLOW_ALL_SYMBOLS: 'false',
      AUTO_TRADING_ASSET_CLASSES: 'forex,metals',
      AUTO_TRADING_AUTOSTART: 'true',
      AUTO_TRADING_PRESET: 'smart_strong',
      AUTO_TRADING_FORCE_BROKER: 'mt5',
      AUTO_TRADING_REALTIME_REQUIRE_LAYERS18: 'false',
      AUTO_TRADING_REALTIME_MIN_CONFIDENCE: '70',
      AUTO_TRADING_REALTIME_MIN_STRENGTH: '55',
      EA_SIGNAL_MIN_CONFIDENCE: '70',
      EA_SIGNAL_MIN_STRENGTH: '55',
      AUTO_TRADING_ENFORCE_HTF_ALIGNMENT: 'false',
      AUTO_TRADING_SMART_STRONG_ENTER_SCORE: '35',
      EA_STRICT_SMART_CHECKLIST: 'false',
      SIGNAL_CONFLUENCE_ADVISORY_SMART_FAILS: 'true',
      SIGNAL_CONFLUENCE_MIN_SCORE: '45',
      SIGNAL_HARD_MIN_CONFIDENCE: '40',
      EA_NEWS_GUARD_BLACKOUT_MINUTES: '30',
    },
  },

  fx_metals_strong_auto_v2: {
    label: 'FX+Metals STRONG AUTO v2',
    env: {
      ALLOW_ALL_SYMBOLS: 'false',
      AUTO_TRADING_ASSET_CLASSES: 'forex,metals',
      AUTO_TRADING_AUTOSTART: 'true',
      AUTO_TRADING_PRESET: 'smart_strong',
      AUTO_TRADING_FORCE_BROKER: 'mt5',
      AUTO_TRADING_REALTIME_REQUIRE_LAYERS18: 'false',
      AUTO_TRADING_REALTIME_MIN_CONFIDENCE: '70',
      AUTO_TRADING_REALTIME_MIN_STRENGTH: '55',
      EA_SIGNAL_MIN_CONFIDENCE: '70',
      EA_SIGNAL_MIN_STRENGTH: '55',
      AUTO_TRADING_ENFORCE_HTF_ALIGNMENT: 'false',
      AUTO_TRADING_SMART_STRONG_ENTER_SCORE: '40',
    },
  },

  fx_metals_active_auto_more_trades: {
    label: 'FX+Metals ACTIVE AUTO (more trades)',
    env: {
      // EA-only execution mode: MT5 terminal EA performs order execution.
      // (Server still generates signals + publishes attempts for visibility.)
      EA_ONLY_MODE: 'true',
      ALLOW_ALL_SYMBOLS: 'false',
      EA_FULL_SCAN: 'true',
      EA_BACKGROUND_SIGNALS: 'true',
      EA_RESPECT_DASHBOARD_ACTIVE_SYMBOLS: 'false',
      EA_SCAN_SYMBOLS_MAX: '2000',
      VITE_ACTIVE_SYMBOLS_SYNC_MAX: '2000',
      WS_MAX_RECENT_CANDIDATE_SIGNALS: '500',
      VITE_MAX_CANDIDATE_ITEMS: '500',
      VITE_CANDIDATE_TABLE_ROWS: '200',
      VITE_CANDIDATE_MIN_CONFIDENCE: '58',
      VITE_CANDIDATE_MIN_STRENGTH: '48',
      VITE_CANDIDATE_MIN_WIN_RATE: '58',
      VITE_CANDIDATE_MIN_SCORE: '26',
      EA_DASHBOARD_ALLOW_CANDIDATES: 'true',
      // Dashboard visibility should not depend on always-on tick quotes.
      // Execution (real orders) remains quote-gated inside getSignalForExecution().
      EA_SMART_REQUIRE_QUOTE: 'false',
      // Allow publishing diagnostics even when the full layers18 readiness isn't met yet.
      EA_DASHBOARD_REQUIRE_LAYERS18: 'false',
      EA_SIGNAL_ALLOW_WAIT_MONITOR: 'true',
      // Only promote WAIT_MONITOR to executable ENTER when it is truly trade-ready.
      // This keeps WAIT mode useful for monitoring while allowing strong setups to auto-trade.
      EA_SIGNAL_WAIT_EXEC_REQUIRE_LAYERS18: 'true',
      EA_SIGNAL_WAIT_EXEC_MIN_CONFIDENCE: '58',
      EA_SIGNAL_WAIT_EXEC_MIN_STRENGTH: '48',
      EA_SIGNAL_WAIT_EXEC_MIN_SCORE: '22',
      // MT5 EA uses smartMaxTickAgeSec=6; keep backend execution aligned.
      EA_SIGNAL_EXEC_QUOTE_MAX_AGE_MS: '6000',
      EA_SIGNAL_ALLOW_NEAR_STRONG: 'true',
      PREFETCH_TIMEFRAMES: 'M15,H1,H4,D1',
      EA_SIGNAL_BARS_READY_TIMEFRAMES: 'M15,H1,H4,D1',
      AUTO_TRADING_AUTOSTART_BROKER: 'mt5',
      // In EA-only mode the server normally skips autostart; force it on so
      // the dashboard + WS stream reflect live automation (execution still happens in MT5 EA).
      AUTO_TRADING_AUTOSTART_FORCE: 'true',
      AUTO_TRADING_ENABLED: 'true',
      AUTO_TRADING_ASSET_CLASSES: 'forex,metals',
      AUTO_TRADING_AUTOSTART: 'true',
      AUTO_TRADING_PRESET: 'smart_strong',
      AUTO_TRADING_FORCE_BROKER: 'mt5',
      AUTO_TRADING_REALTIME_REQUIRE_LAYERS18: 'false',
      AUTO_TRADING_REALTIME_MIN_CONFIDENCE: '50',
      AUTO_TRADING_REALTIME_MIN_STRENGTH: '35',
      EA_SIGNAL_MIN_CONFIDENCE: '50',
      EA_SIGNAL_MIN_STRENGTH: '35',
      AUTO_TRADING_ENFORCE_HTF_ALIGNMENT: 'false',
      AUTO_TRADING_SMART_STRONG_ENTER_SCORE: '35',
      AUTO_TRADING_SMART_MIN_SCORE: '33',
      AUTO_TRADING_SMART_MIN_CONFIDENCE: '45',
      AUTO_TRADING_SMART_MIN_STRENGTH: '30',
      EA_STRICT_SMART_CHECKLIST: 'false',
      SIGNAL_CONFLUENCE_ADVISORY_SMART_FAILS: 'true',
      SIGNAL_CONFLUENCE_MIN_SCORE: '40',
      SIGNAL_HARD_MIN_CONFIDENCE: '40',
      AUTO_TRADING_NEWS_BLACKOUT_MINUTES: '10',
      AUTO_TRADING_NEWS_BLACKOUT_IMPACT: '100',
      EA_NEWS_GUARD_BLACKOUT_MINUTES: '10',
      EA_NEWS_GUARD_IMPACT_THRESHOLD: '100',
      EVENT_GOVERNOR_BEFORE_MINUTES: '10',
      EVENT_GOVERNOR_AFTER_MINUTES: '10',
      EVENT_GOVERNOR_IMPACT_THRESHOLD: '100',
      EA_LAYERS18_MANAGEMENT_ENABLED: 'true',
      EA_LAYERS18_REDUCE_PCT: '0.6',
      EA_LAYERS18_EXIT_MIN_CONFLUENCE: '30',
      EA_DYNAMIC_TRAILING_ENABLED: 'true',
      EA_PARTIAL_CLOSE_ENABLED: 'true',
      EA_LIQUIDITY_MAX_SPREAD_PIPS: '3.5',
      EA_KILL_SWITCH_ON_NEWS: 'true',
      EA_KILL_SWITCH_ON_DATA_QUALITY: 'true',
      EA_KILL_SWITCH_SPREAD_PIPS: '80',
      EA_KILL_SWITCH_GAP_PIPS: '120',
      EA_HEARTBEAT_MAX_AGE_MS: '1800000',
      EA_DASHBOARD_QUOTE_MAX_AGE_MS: '120000',
      EA_SIGNAL_QUOTE_MAX_AGE_MS: '120000',
      AUTO_TRADING_EA_QUOTE_MAX_AGE_MS: '120000',
      INTELLIGENT_MIN_EXECUTION_CONFIDENCE: '40',
      ADVANCED_SIGNAL_FILTER_ENABLED: 'true',
      ADVANCED_SIGNAL_MIN_WIN_RATE: '55',
      ADVANCED_SIGNAL_MIN_CONFIDENCE: '52',
      ADVANCED_SIGNAL_MIN_STRENGTH: '28',
      ADVANCED_SIGNAL_MAX_SPREAD_PIPS_FX: '4.8',
      ADVANCED_SIGNAL_MAX_SPREAD_RELATIVE: '0.0035',
      ADVANCED_SIGNAL_MAX_NEWS_IMPACT: '100',
      ADVANCED_SIGNAL_OVERRIDE_STRONG: 'true',
      ADVANCED_SIGNAL_OVERRIDE_MIN_STRENGTH: '75',
      ADVANCED_SIGNAL_OVERRIDE_MIN_CONFIDENCE: '60',
      ADVANCED_SIGNAL_OVERRIDE_MIN_WIN_RATE: '60',
      SIGNAL_SPREAD_EFFICIENCY_MIN: '0.25',
      AUTO_TRADING_MOMENTUM_ENTER_FACTOR: '0.85',
      AUTO_TRADING_ENFORCE_SPREAD_TO_ATR: 'true',
      AUTO_TRADING_MAX_SPREAD_TO_ATR: '0.22',
      AUTO_TRADING_EXECUTION_COST_SOFTEN: 'true',
      AUTO_TRADING_EXECUTION_COST_OVERRIDE_MIN_SCORE: '62',
      AUTO_TRADING_EXECUTION_COST_OVERRIDE_MAX_SPREAD_TO_ATR: '0.26',
      AUTO_TRADING_EXECUTION_COST_OVERRIDE_MAX_SPREAD_TO_TP: '0.35',
      AUTO_TRADING_SCORE_SMOOTHING_WINDOW: '2',
      AUTO_TRADING_SCORE_SMOOTHING_MIN_SCORE: '35',
    },
  },

  fx_metals_smart_auto_strong_trades: {
    label: 'FX+Metals SMART AUTO (strong trades)',
    env: {
      ALLOW_ALL_SYMBOLS: 'false',
      AUTO_TRADING_ASSET_CLASSES: 'forex,metals',
      AUTO_TRADING_AUTOSTART: 'true',
      AUTO_TRADING_PRESET: 'smart_strong',
      AUTO_TRADING_PROFILE: 'aggressive',
      AUTO_TRADING_AGGRESSIVE_ENTER_SCORE: '15',
      AUTO_TRADING_FORCE_BROKER: 'mt5',
      AUTO_TRADING_REALTIME_REQUIRE_LAYERS18: 'false',
      AUTO_TRADING_REALTIME_MIN_CONFIDENCE: '48',
      AUTO_TRADING_REALTIME_MIN_STRENGTH: '45',
      EA_SIGNAL_MIN_CONFIDENCE: '48',
      EA_SIGNAL_MIN_STRENGTH: '45',
      AUTO_TRADING_ENFORCE_HTF_ALIGNMENT: 'false',
      AUTO_TRADING_SMART_STRONG_ENTER_SCORE: '32',
      EA_STRICT_SMART_CHECKLIST: 'false',
      SIGNAL_CONFLUENCE_ADVISORY_SMART_FAILS: 'true',
      SIGNAL_CONFLUENCE_MIN_SCORE: '30',
      SIGNAL_HARD_MIN_CONFIDENCE: '35',
      SIGNAL_SPREAD_EFFICIENCY_MIN: '0.25',
      ADVANCED_SIGNAL_MIN_WIN_RATE: '50',
      ADVANCED_SIGNAL_MIN_STRENGTH: '15',
      ADVANCED_SIGNAL_MIN_CONFIDENCE: '35',
      ADVANCED_SIGNAL_MIN_RISK_REWARD: '1.4',
    },
  },
};

const ALIASES = new Map([
  ['no_db_no_keys', 'synthetic'],
  ['db', 'realtime_db'],
  ['all', 'all_symbols'],
  ['all_symbols_fullscan', 'all_symbols_full_scan'],
  ['full_scan', 'all_symbols_full_scan'],
  ['smart_strong_mt5', 'smart_strong_mt5_auto'],
  ['smart_strong', 'smart_strong_mt5_auto'],
]);

export function resolvePresetKey(input) {
  const key = normalizeName(input);
  if (!key) {
    return 'default';
  }
  const resolved = ALIASES.get(key) || key;
  return PRESETS[resolved] ? resolved : 'default';
}

export function applyPresetEnv(env, presetKey) {
  const resolvedKey = resolvePresetKey(presetKey);
  const preset = PRESETS[resolvedKey] || PRESETS.default;
  const next = { ...env };

  for (const [k, v] of Object.entries(preset.env || {})) {
    if (v === undefined) {
      continue;
    }
    next[k] = String(v);
  }

  return { presetKey: resolvedKey, preset, env: next };
}

export function formatPresetList() {
  const lines = [];
  for (const [key, value] of Object.entries(PRESETS)) {
    lines.push(`${key} - ${value.label}`);
  }
  return lines.join('\n');
}
