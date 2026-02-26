const toUpper = (value) =>
  String(value || '')
    .trim()
    .toUpperCase();

const toFinite = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeDecisionState = (value) => {
  const normalized = toUpper(value);
  if (!normalized) {
    return null;
  }
  if (normalized === 'WAIT') {
    return 'WAIT_MONITOR';
  }
  if (normalized === 'BLOCKED' || normalized === 'NO_TRADE') {
    return 'NO_TRADE_BLOCKED';
  }
  return normalized;
};

const normalizeDecisionShape = (decision, source) => {
  if (!decision || typeof decision !== 'object') {
    return null;
  }

  const state = normalizeDecisionState(decision.state);
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

  const fromFinalState = normalizeDecisionState(signal?.finalDecision?.state);
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

  const fromFinalAction = toUpper(signal?.finalDecision?.action);
  if (fromFinalAction === 'BUY' || fromFinalAction === 'SELL') {
    return {
      state: 'ENTER',
      blocked: false,
      score: toFinite(signal?.finalDecision?.score),
      missing: [],
      blockers: [],
      source: 'finalDecisionAction',
    };
  }
  if (fromFinalAction === 'NEUTRAL') {
    return {
      state: 'WAIT_MONITOR',
      blocked: false,
      score: toFinite(signal?.finalDecision?.score),
      missing: [],
      blockers: [],
      source: 'finalDecisionAction',
    };
  }

  if (signal?.smartExecution && typeof signal.smartExecution === 'object') {
    const shouldEnterNow = signal.smartExecution.shouldEnterNow;
    if (shouldEnterNow === true) {
      return {
        state: 'ENTER',
        blocked: false,
        score: null,
        missing: [],
        blockers: [],
        source: 'smartExecution',
      };
    }
    if (shouldEnterNow === false) {
      return {
        state: 'WAIT_MONITOR',
        blocked: false,
        score: null,
        missing: [],
        blockers: [],
        source: 'smartExecution',
      };
    }
  }

  if (signal?.components?.smartExecution && typeof signal.components.smartExecution === 'object') {
    const shouldEnterNow = signal.components.smartExecution.shouldEnterNow;
    if (shouldEnterNow === true) {
      return {
        state: 'ENTER',
        blocked: false,
        score: null,
        missing: [],
        blockers: [],
        source: 'components.smartExecution',
      };
    }
    if (shouldEnterNow === false) {
      return {
        state: 'WAIT_MONITOR',
        blocked: false,
        score: null,
        missing: [],
        blockers: [],
        source: 'components.smartExecution',
      };
    }
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
