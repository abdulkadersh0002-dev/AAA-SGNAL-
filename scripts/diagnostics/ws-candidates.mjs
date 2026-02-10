import WebSocket from 'ws';

// Prints analyzed candidate signals (why ENTER is 0).
// Usage:
//   node scripts/diagnostics/ws-candidates.mjs [wsUrl|httpBaseUrl] [durationMs]
//   node scripts/diagnostics/ws-candidates.mjs [wsUrl|httpBaseUrl] --duration 20000
// Examples:
//   node scripts/diagnostics/ws-candidates.mjs ws://127.0.0.1:4101/ws/trading 20000
//   node scripts/diagnostics/ws-candidates.mjs http://127.0.0.1:4101 20000

function parseArgs(argv) {
  const args = argv.slice(2);
  const first = args[0];
  let url = first || 'ws://127.0.0.1:4101/ws/trading';
  let durationMs = null;

  const idx = args.findIndex((a) => a === '--duration' || a === '-d');
  if (idx >= 0) {
    durationMs = Number(args[idx + 1]);
  } else if (args[1] != null) {
    durationMs = Number(args[1]);
  }

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    durationMs = 20000;
  }

  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    const u = new URL(url);
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    url = `${wsProto}//${u.host}/ws/trading`;
  }
  return { url, durationMs };
}

const { url, durationMs } = parseArgs(process.argv);

const ws = new WebSocket(url);

const counts = {
  signal_candidate: 0,
  signal_candidates: 0,
  other: 0,
};

const byState = new Map();
const byPrimary = new Map();

function inc(map, key) {
  const k = String(key || 'unknown');
  map.set(k, (map.get(k) || 0) + 1);
}

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarizeOne(payload) {
  const decision = payload?.isValid?.decision || payload?.decision || null;
  const state = decision?.state ?? null;
  const primary = decision?.primary ?? null;
  const secondary = decision?.secondary ?? null;
  const score = toNum(decision?.score);

  const pair = payload?.pair ?? payload?.symbol ?? null;
  const direction = payload?.direction ?? null;
  const confidence = toNum(payload?.confidence ?? payload?.intelligentConfidence);
  const strength = toNum(payload?.strength);

  const market = payload?.market || payload?.marketData || payload?.components?.marketData || null;
  const spreadPips = toNum(market?.spreadPips ?? payload?.spreadPips);
  const spreadRelative = toNum(
    market?.spreadRelative ?? market?.eaSpreadRelative ?? payload?.spreadRelative
  );
  const spreadPoints = toNum(
    payload?.spreadPoints ?? market?.spreadPoints ?? payload?.components?.eaQuote?.spreadPoints
  );

  const layers = Array.isArray(payload?.components?.layeredAnalysis?.layers)
    ? payload.components.layeredAnalysis.layers
    : [];

  return {
    pair,
    direction,
    state,
    primary,
    secondary,
    score,
    confidence,
    strength,
    spreadPips,
    spreadRelative,
    spreadPoints,
    layersCount: layers.length,
  };
}

function printOne(summary) {
  const parts = [];
  parts.push(String(summary.pair || '-'));
  parts.push(String(summary.direction || '-'));
  parts.push(String(summary.state || '-'));
  parts.push(String(summary.primary || '-'));
  if (summary.secondary) {
    parts.push(String(summary.secondary));
  }
  if (summary.score != null) {
    parts.push(`score=${summary.score}`);
  }
  if (summary.confidence != null) {
    parts.push(`conf=${summary.confidence}`);
  }
  if (summary.strength != null) {
    parts.push(`str=${summary.strength}`);
  }
  if (summary.spreadPips != null) {
    parts.push(`spreadPips=${summary.spreadPips}`);
  }
  if (summary.spreadPoints != null) {
    parts.push(`spreadPts=${summary.spreadPoints}`);
  }
  if (summary.spreadRelative != null) {
    parts.push(`spreadRel=${summary.spreadRelative}`);
  }
  if (summary.layersCount != null) {
    parts.push(`layers=${summary.layersCount}`);
  }
  console.log('[candidate]', parts.join(' | '));
}

ws.on('open', () => {
  console.log('ws open', { url, durationMs });
});

ws.on('message', (buf) => {
  let msg;
  try {
    msg = JSON.parse(buf.toString());
  } catch {
    return;
  }

  const type = String(msg?.type || '').trim();
  if (type === 'signal_candidate') {
    counts.signal_candidate += 1;
    const payload = msg?.payload || null;
    const summary = summarizeOne(payload);
    inc(byState, summary.state);
    inc(byPrimary, summary.primary);
    printOne(summary);
    return;
  }

  if (type === 'signal_candidates') {
    counts.signal_candidates += 1;
    const items = Array.isArray(msg?.payload?.items) ? msg.payload.items : [];
    for (const item of items.slice(0, 25)) {
      const summary = summarizeOne(item);
      inc(byState, summary.state);
      inc(byPrimary, summary.primary);
      printOne(summary);
    }
    if (items.length > 25) {
      console.log(`[candidate] replay truncated: ${items.length} items (printed 25)`);
    }
    return;
  }

  counts.other += 1;
});

ws.on('error', (err) => {
  console.error('ws error', err?.message || err);
});

setTimeout(() => {
  const top = (map, n = 8) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);

  console.log('done', {
    ms: durationMs,
    counts,
    topStates: top(byState),
    topPrimary: top(byPrimary),
  });

  try {
    ws.close();
  } catch {
    // noop
  }
}, durationMs);
