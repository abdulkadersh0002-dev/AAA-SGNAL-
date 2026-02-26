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

  return {
    state,
    blocked: decision.blocked === true,
    score: toFinite(decision.score ?? decision.decisionScore),
    missing: Array.isArray(decision.missing) ? decision.missing.filter(Boolean) : [],
    blockers: Array.isArray(decision.blockers) ? decision.blockers.filter(Boolean) : [],
    whatWouldChange: Array.isArray(decision.whatWouldChange)
      ? decision.whatWouldChange.filter(Boolean)
      : [],
    missingInputs:
      decision.missingInputs && typeof decision.missingInputs === 'object'
        ? decision.missingInputs
        : undefined,
    nextSteps: Array.isArray(decision.nextSteps) ? decision.nextSteps.filter(Boolean) : [],
    killSwitch:
      decision.killSwitch && typeof decision.killSwitch === 'object'
        ? decision.killSwitch
        : undefined,
    contributors:
      decision.contributors && typeof decision.contributors === 'object'
        ? decision.contributors
        : undefined,
    context:
      decision.context && typeof decision.context === 'object' ? decision.context : undefined,
    profile:
      decision.profile && typeof decision.profile === 'object' ? decision.profile : undefined,
    source,
  };
};

const normalizeLayerDecision = (layer, fallbackSource = 'layer') => {
  const layerNo = Number(layer?.layer);
  const source = Number.isFinite(layerNo) ? `layer${layerNo}` : fallbackSource;
  return normalizeDecisionShape(layer?.metrics?.decision, source);
};

const resolveFromLayers = (signal) => {
  const layered = signal?.components?.layeredAnalysis || signal?.layeredAnalysis || null;
  const layers = Array.isArray(layered?.layers) ? layered.layers : [];
  if (!layers.length) {
    return null;
  }

  const layer20 =
    layers.find(
      (layer) =>
        String(layer?.key || layer?.id || '')
          .trim()
          .toUpperCase() === 'L20' || Number(layer?.layer) === 20
    ) || null;

  const direct = normalizeLayerDecision(layer20, 'layer20');
  if (direct) {
    return direct;
  }

  const decided = layers
    .map((layer) => ({
      layerNo: Number.isFinite(Number(layer?.layer)) ? Number(layer.layer) : -1,
      decision: normalizeLayerDecision(layer),
    }))
    .filter((item) => item.decision);

  if (!decided.length) {
    return null;
  }

  decided.sort((a, b) => b.layerNo - a.layerNo);
  return decided[0].decision;
};

export const getNormalizedDecision = (signal) => {
  if (!signal || typeof signal !== 'object') {
    return null;
  }

  const fromKnown =
    normalizeDecisionShape(signal?.components?.normalizedDecision, 'normalized') ||
    normalizeDecisionShape(signal?.components?.layeredDecision?.entry, 'layered_entry') ||
    normalizeDecisionShape(signal?.isValid?.decision, 'isValid') ||
    normalizeDecisionShape(signal?.decision, 'root') ||
    resolveFromLayers(signal);

  if (fromKnown) {
    return fromKnown;
  }

  const finalState = toUpper(signal?.finalDecision?.state);
  const normalizedFinalState = normalizeDecisionState(finalState);
  if (normalizedFinalState) {
    return {
      state: normalizedFinalState,
      blocked: false,
      score: toFinite(signal?.finalDecision?.score),
      missing: [],
      blockers: [],
      source: 'finalDecision',
    };
  }

  const finalAction = toUpper(signal?.finalDecision?.action);
  if (finalAction === 'BUY' || finalAction === 'SELL') {
    return {
      state: 'ENTER',
      blocked: false,
      score: toFinite(signal?.finalDecision?.score),
      missing: [],
      blockers: [],
      source: 'finalDecisionAction',
    };
  }
  if (finalAction === 'NEUTRAL') {
    return {
      state: 'WAIT_MONITOR',
      blocked: false,
      score: toFinite(signal?.finalDecision?.score),
      missing: [],
      blockers: [],
      source: 'finalDecisionAction',
    };
  }

  const rootSmartShouldEnterNow = signal?.smartExecution?.shouldEnterNow;
  if (rootSmartShouldEnterNow === true) {
    return {
      state: 'ENTER',
      blocked: false,
      score: null,
      missing: [],
      blockers: [],
      source: 'smartExecution',
    };
  }
  if (rootSmartShouldEnterNow === false) {
    return {
      state: 'WAIT_MONITOR',
      blocked: false,
      score: null,
      missing: [],
      blockers: [],
      source: 'smartExecution',
    };
  }

  const smartShouldEnterNow = signal?.components?.smartExecution?.shouldEnterNow;
  if (smartShouldEnterNow === true) {
    return {
      state: 'ENTER',
      blocked: false,
      score: null,
      missing: [],
      blockers: [],
      source: 'components.smartExecution',
    };
  }
  if (smartShouldEnterNow === false) {
    return {
      state: 'WAIT_MONITOR',
      blocked: false,
      score: null,
      missing: [],
      blockers: [],
      source: 'components.smartExecution',
    };
  }

  return null;
};

export const getDecisionState = (signal) => getNormalizedDecision(signal)?.state || null;

export const getDecisionScore = (signal) => getNormalizedDecision(signal)?.score ?? null;

export const isDecisionBlocked = (signal) => getNormalizedDecision(signal)?.blocked === true;

export const getDecisionMissing = (signal) => {
  const normalized = getNormalizedDecision(signal);
  return Array.isArray(normalized?.missing) ? normalized.missing : [];
};
