const toFinite = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toUpper = (value) =>
  String(value || '')
    .trim()
    .toUpperCase();

const resolveLayer = (layers, keys = []) => {
  if (!Array.isArray(layers) || layers.length === 0) {
    return null;
  }
  for (const key of keys) {
    const match = layers.find((layer) => {
      const layerKey = toUpper(layer?.key || layer?.id || layer?.name || '');
      if (typeof key === 'number') {
        return Number(layer?.number) === key || Number(layer?.layer) === key;
      }
      const keyNorm = toUpper(key);
      return layerKey === keyNorm || layerKey.includes(keyNorm);
    });
    if (match) {
      return match;
    }
  }
  return null;
};

const resolveDecisionState = (signal, layer20) => {
  const fromLayer = layer20?.metrics?.decision?.state;
  const fromSignal = signal?.isValid?.decision?.state || signal?.finalDecision?.state;
  return toUpper(fromLayer || fromSignal || 'WAIT_MONITOR');
};

const resolveRiskReward = (signal) => {
  const rr = toFinite(signal?.entry?.riskReward ?? signal?.riskReward);
  if (rr != null) {
    return rr;
  }
  const entry = toFinite(signal?.entryPrice ?? signal?.entry?.price);
  const sl = toFinite(signal?.stopLoss ?? signal?.entry?.stopLoss);
  const tp = toFinite(signal?.takeProfit ?? signal?.entry?.takeProfit);
  if (entry == null || sl == null || tp == null) {
    return null;
  }
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (!Number.isFinite(risk) || !Number.isFinite(reward) || risk <= 0) {
    return null;
  }
  return Number((reward / risk).toFixed(2));
};

export function evaluateLayeredDecision({ signal, decision, confluence, now = Date.now() } = {}) {
  const layered = signal?.components?.layeredAnalysis || null;
  const layers = Array.isArray(layered?.layers) ? layered.layers : [];

  const layer16 = resolveLayer(layers, [16, 'L16', 'Signal Validation', 'signal_validation']);
  const layer17 = resolveLayer(layers, [17, 'L17', 'Statistical Logic', 'statistical']);
  const layer18 = resolveLayer(layers, [18, 'L18', 'Validation Gate', 'Gate', 'Final Guard']);
  const layer20 = resolveLayer(layers, [20, 'L20', 'Decision', 'Final Decision']);

  const layer16Pass =
    Boolean(layer16?.metrics?.isTradeValid) ||
    toUpper(layer16?.metrics?.verdict) === 'PASS' ||
    toUpper(layer16?.metrics?.verdict) === 'OK';

  const minConfluence =
    toFinite(confluence?.minScore) ??
    toFinite(layer17?.metrics?.confluenceWeighting?.minScore) ??
    60;
  const confluenceScore =
    toFinite(confluence?.score) ??
    toFinite(layer17?.metrics?.confluenceWeighting?.weightedScore) ??
    toFinite(layer17?.confidence);
  const layer17Ok = confluenceScore == null ? false : confluenceScore >= minConfluence;

  const decisionState = resolveDecisionState(signal, layer20);
  const isTradeValid = Boolean(signal?.isValid?.isValid);

  const confidence = toFinite(signal?.confidence) ?? 0;
  const strength = toFinite(signal?.strength) ?? 0;
  const riskReward = resolveRiskReward(signal);

  const liquidityLayer = resolveLayer(layers, [5, 'L5', 'Liquidity Logic', 'Liquidity']);
  const liquidityQuality = liquidityLayer?.metrics?.liquidityQuality || null;
  const liquidityScore = toFinite(liquidityQuality?.score ?? liquidityLayer?.score);
  const liquidity = {
    quality: liquidityQuality?.quality || null,
    score: liquidityScore,
    sweep: liquidityLayer?.metrics?.sweep || null,
    orderBlock: liquidityLayer?.metrics?.orderBlock || null,
    priceImbalance: liquidityLayer?.metrics?.priceImbalance || null,
  };

  const htfConflict =
    Boolean(layered?.confluence?.htfPriority?.conflictWithSignal) ||
    Boolean(confluence?.htfPriority?.conflictWithSignal) ||
    false;

  const entryStrong = confidence >= 70 && strength >= 70;
  const entryState =
    decisionState === 'ENTER' ? 'ENTER' : decisionState === 'WAIT_MONITOR' ? 'WAIT' : 'BLOCK';

  const layer18Verdict = (() => {
    const verdict = toUpper(layer18?.metrics?.verdict);
    if (verdict === 'PASS' || verdict === 'BLOCK') {
      return verdict;
    }
    return isTradeValid ? 'PASS' : 'BLOCK';
  })();
  const layer18Pass = layer18Verdict === 'PASS';
  const layersGateOk = layer16Pass && layer17Ok && layer18Pass;

  const entry = {
    state: entryState,
    score: toFinite(decision?.score) ?? toFinite(signal?.finalScore) ?? null,
    confidence,
    strength,
    riskReward,
    entryStrong,
    meetsConfluence: layer17Ok,
    meetsLayers18: layer16Pass && layer17Ok && layer18Pass && decisionState === 'ENTER',
  };

  const exit = {
    state:
      decisionState === 'ENTER' ? 'HOLD' : decisionState === 'WAIT_MONITOR' ? 'REDUCE' : 'EXIT',
    reasons: [
      htfConflict ? 'HTF conflict' : null,
      liquidityScore != null && liquidityScore < 50 ? 'Liquidity weak' : null,
      confluenceScore != null && confluenceScore < minConfluence ? 'Confluence dropped' : null,
    ].filter(Boolean),
  };

  return {
    generatedAt: now,
    layers18: {
      ok: layersGateOk && decisionState === 'ENTER',
      layer16Pass,
      layer17Ok,
      isTradeValid,
      // L18 is a boolean gate. L20 is the only decision state.
      layer18Verdict,
      layer18Pass,
      layer20State: decisionState,
      // Back-compat legacy field name (do not use for decisioning).
      layer18State: decisionState,
      confluenceScore,
      minConfluence,
    },
    entry,
    exit,
    liquidity,
    opposition: {
      htfConflict,
    },
  };
}

export default evaluateLayeredDecision;
