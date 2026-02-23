const toUpper = (value) =>
  String(value || '')
    .trim()
    .toUpperCase();

const toFinite = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeDecisionShape = (decision, source) => {
  if (!decision || typeof decision !== 'object') {
    return null;
  }

  const state = toUpper(decision.state);
  if (!state) {
    return null;
  }

  const score = toFinite(decision.score ?? decision.decisionScore);
  return {
    state,
    blocked: decision.blocked === true,
    score,
    missing: Array.isArray(decision.missing) ? decision.missing.filter(Boolean) : [],
    blockers: Array.isArray(decision.blockers) ? decision.blockers.filter(Boolean) : [],
    source,
  };
};

const resolveLayerDecision = (layers = []) => {
  if (!Array.isArray(layers) || layers.length === 0) {
    return null;
  }

  const layer20 =
    layers.find(
      (layer) => String(layer?.key || '').toUpperCase() === 'L20' || Number(layer?.layer) === 20
    ) || null;

  const direct = normalizeDecisionShape(layer20?.metrics?.decision, 'layer20');
  if (direct) {
    return direct;
  }

  const decided = layers
    .map((layer) => {
      const n = Number(layer?.layer);
      return {
        layerNo: Number.isFinite(n) ? n : -1,
        decision: normalizeDecisionShape(
          layer?.metrics?.decision,
          `layer${Number.isFinite(n) ? n : '?'}`
        ),
      };
    })
    .filter((item) => item.decision);

  if (decided.length === 0) {
    return null;
  }

  decided.sort((a, b) => b.layerNo - a.layerNo);
  return decided[0].decision;
};

export function getNormalizedDecision(signal) {
  if (!signal || typeof signal !== 'object') {
    return null;
  }

  const existing = normalizeDecisionShape(signal?.components?.normalizedDecision, 'normalized');
  if (existing) {
    return existing;
  }

  const layeredDecision = normalizeDecisionShape(
    signal?.components?.layeredDecision?.entry,
    'layered_entry'
  );
  if (layeredDecision) {
    return layeredDecision;
  }

  const legacy = normalizeDecisionShape(signal?.isValid?.decision, 'isValid');
  if (legacy) {
    return legacy;
  }

  const rootDecision = normalizeDecisionShape(signal?.decision, 'root');
  if (rootDecision) {
    return rootDecision;
  }

  const layers = signal?.components?.layeredAnalysis?.layers;
  const fromLayers = resolveLayerDecision(layers);
  if (fromLayers) {
    return fromLayers;
  }

  const fromFinalState = toUpper(signal?.finalDecision?.state);
  if (fromFinalState) {
    return {
      state: fromFinalState,
      blocked: false,
      score: toFinite(signal?.finalDecision?.score),
      missing: [],
      blockers: [],
      source: 'finalDecision',
    };
  }

  return null;
}

export function getDecisionState(signal) {
  return getNormalizedDecision(signal)?.state || null;
}

export function getDecisionScore(signal) {
  return getNormalizedDecision(signal)?.score ?? null;
}

export function isDecisionBlocked(signal) {
  return getNormalizedDecision(signal)?.blocked === true;
}
