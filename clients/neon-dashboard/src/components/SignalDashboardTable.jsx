import React, { useEffect, useMemo, useState } from 'react';
import {
  formatNumber,
  formatRelativeTime,
  formatDirection,
  formatDateTime
} from '../utils/format.js';

const selectPricePrecision = (pair) => {
  if (!pair) {
    return 4;
  }
  const normalized = String(pair).toUpperCase();
  if (normalized.includes('JPY')) {
    return 3;
  }
  if (normalized.includes('XAU') || normalized.includes('XAG')) {
    return 2;
  }
  return 5;
};

const formatRiskReward = (value) => {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return '—';
  }
  if (numeric >= 1) {
    return `1:${numeric.toFixed(2)}`;
  }
  return `${numeric.toFixed(2)}:1`;
};

const toPercentLabel = (value) => {
  if (value == null || Number.isNaN(Number(value))) {
    return '—';
  }
  const numeric = Number(value);
  const scaled = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return `${scaled.toFixed(0)}%`;
};

const formatLayerStatus = (status) => {
  const s = String(status || '').toUpperCase();
  if (s === 'PASS') {
    return 'PASS';
  }
  if (s === 'FAIL') {
    return 'FAIL';
  }
  return 'SKIP';
};

const formatConfluenceScore = (confluence) => {
  const score = Number(confluence?.score);
  if (!Number.isFinite(score)) {
    return '—';
  }
  return `${Math.round(score)}%`;
};

const formatLayer18Score = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  // Keep a compact but readable precision for layer scores.
  return Math.abs(numeric) >= 100 ? numeric.toFixed(0) : numeric.toFixed(2);
};

const toFinite = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toUpper = (value) =>
  String(value || '')
    .trim()
    .toUpperCase();

const formatAlignmentTag = (value, prefix) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'support') {
    return `${prefix}↑`;
  }
  if (normalized === 'oppose') {
    return `${prefix}↓`;
  }
  if (normalized) {
    return `${prefix}•`;
  }
  return null;
};

const formatIntelligenceSummary = (intelligence) => {
  if (!intelligence || typeof intelligence !== 'object') {
    return { label: '—', title: 'No intelligence data' };
  }
  const qualityBand = toUpper(intelligence.qualityBand || '');
  const qualityIndex = toFinite(intelligence.qualityIndex);
  const divergenceTag = formatAlignmentTag(intelligence.divergenceAlignment, 'D');
  const volumeTag = formatAlignmentTag(intelligence.volumePressureAlignment, 'V');
  const qualityLabel = qualityBand
    ? qualityIndex != null
      ? `${qualityBand} ${Math.round(qualityIndex)}`
      : qualityBand
    : '—';
  const alignmentLabel = [divergenceTag, volumeTag].filter(Boolean).join(' ');
  const titleParts = [
    qualityBand ? `Quality: ${qualityBand}` : null,
    qualityIndex != null ? `Index: ${Math.round(qualityIndex)}` : null,
    intelligence.divergenceAlignment
      ? `Divergence: ${intelligence.divergenceAlignment}`
      : null,
    intelligence.volumePressureAlignment
      ? `Volume: ${intelligence.volumePressureAlignment}`
      : null,
  ].filter(Boolean);
  return {
    label: alignmentLabel ? `${qualityLabel} · ${alignmentLabel}` : qualityLabel,
    title: titleParts.length ? titleParts.join(' | ') : '—',
  };
};

const selectPipSize = (pair) => {
  const normalized = toUpper(pair);
  if (!normalized) {
    return 0.0001;
  }
  if (normalized.includes('JPY')) {
    return 0.01;
  }
  if (normalized.includes('XAU') || normalized.includes('XAG')) {
    return 0.1;
  }
  return 0.0001;
};

const extractExecutionProfile = (signal) => {
  const fromComponents =
    signal?.components?.executionProfile && typeof signal.components.executionProfile === 'object'
      ? signal.components.executionProfile
      : null;
  if (fromComponents) {
    return fromComponents;
  }

  const layers = Array.isArray(signal?.components?.layeredAnalysis?.layers)
    ? signal.components.layeredAnalysis.layers
    : [];
  const layer20 =
    layers.find(
      (layer) => toUpper(layer?.key) === 'L20' || Number(layer?.layer) === 20
    ) || null;

  return layer20?.metrics?.executionProfile && typeof layer20.metrics.executionProfile === 'object'
    ? layer20.metrics.executionProfile
    : null;
};

const resolveSmartExecution = ({ signal, snapshot, pair, direction }) => {
  const execution = signal?.execution && typeof signal.execution === 'object' ? signal.execution : null;
  const gates = execution?.gates && typeof execution.gates === 'object' ? execution.gates : null;
  const profile = extractExecutionProfile(signal) || {};
  const urgency = toUpper(profile?.urgency || 'NORMAL');
  const riskMode = toUpper(profile?.riskMode || 'BALANCED');
  const protectionBias = toUpper(profile?.protectionBias || 'STANDARD');

  const featureRoot = snapshot?.features && typeof snapshot.features === 'object' ? snapshot.features : {};
  const quote =
    featureRoot.quote && typeof featureRoot.quote === 'object'
      ? featureRoot.quote
      : signal?.components?.market?.quote && typeof signal.components.market.quote === 'object'
        ? signal.components.market.quote
        : {};

  const bid = toFinite(quote.bid);
  const ask = toFinite(quote.ask);
  const mid =
    toFinite(quote.mid) ??
    (bid != null && ask != null ? Number(((bid + ask) / 2).toFixed(selectPricePrecision(pair))) : null);

  const directionKey = toUpper(direction);
  const isBuy = directionKey === 'BUY';
  const isSell = directionKey === 'SELL';

  const entryRaw = toFinite(signal?.entryPrice ?? signal?.entry?.price);
  const stopRaw = toFinite(signal?.stopLoss ?? signal?.entry?.stopLoss);
  const takeRaw = toFinite(signal?.takeProfit ?? signal?.entry?.takeProfit);
  const atr = toFinite(signal?.atr ?? signal?.entry?.atr);
  const spreadPips =
    toFinite(quote.spreadPips) ??
    toFinite(signal?.entry?.spreadPips) ??
    (bid != null && ask != null
      ? Math.abs(ask - bid) / selectPipSize(pair)
      : null);

  const entryValid = entryRaw != null && entryRaw > 0;
  const stopValid =
    entryValid && stopRaw != null
      ? isBuy
        ? stopRaw < entryRaw
        : isSell
          ? stopRaw > entryRaw
          : false
      : false;
  const takeValid =
    entryValid && takeRaw != null
      ? isBuy
        ? takeRaw > entryRaw
        : isSell
          ? takeRaw < entryRaw
          : false
      : false;

  let smartEntry = entryValid ? entryRaw : null;
  if (smartEntry == null) {
    if (directionKey === 'BUY' && ask != null) {
      smartEntry = ask;
    } else if (directionKey === 'SELL' && bid != null) {
      smartEntry = bid;
    } else {
      smartEntry = mid;
    }
  }

  const pipSize = selectPipSize(pair);
  const minStopPips = Math.max(8, Number.isFinite(spreadPips) ? spreadPips * 1.8 : 0);
  const atrPips = Number.isFinite(atr) ? Math.max(0, atr / pipSize) : null;
  const baseStopDistancePips =
    atrPips != null ? Math.max(minStopPips, atrPips * 1.1) : minStopPips;
  const slMultiplierRaw =
    toFinite(execution?.stopLossMultiplier) ??
    toFinite(signal?.execution?.stopLossMultiplier) ??
    toFinite(signal?.riskManagement?.stopLossMultiplier);
  const slMultiplier = slMultiplierRaw != null && slMultiplierRaw > 0 ? slMultiplierRaw : 1;
  const stopDistancePrice = baseStopDistancePips * slMultiplier * pipSize;

  let smartStop = stopValid ? stopRaw : null;
  if (smartStop == null && smartEntry != null) {
    smartStop =
      directionKey === 'BUY'
        ? Number((smartEntry - stopDistancePrice).toFixed(selectPricePrecision(pair)))
        : directionKey === 'SELL'
          ? Number((smartEntry + stopDistancePrice).toFixed(selectPricePrecision(pair)))
          : null;
  }

  const riskDistance =
    smartEntry != null && smartStop != null ? Math.abs(smartEntry - smartStop) : null;
  const rrSource = toFinite(signal?.riskReward ?? signal?.entry?.riskReward);
  const rrTarget =
    rrSource != null && rrSource > 0
      ? rrSource
      : riskMode === 'OFFENSIVE'
        ? 2.4
        : protectionBias === 'TIGHT'
          ? 1.6
          : urgency === 'PATIENT'
            ? 1.8
            : 2.0;

  let smartTake = takeValid ? takeRaw : null;
  if (smartTake == null && smartEntry != null && riskDistance != null && riskDistance > 0) {
    smartTake =
      directionKey === 'BUY'
        ? Number((smartEntry + riskDistance * rrTarget).toFixed(selectPricePrecision(pair)))
        : directionKey === 'SELL'
          ? Number((smartEntry - riskDistance * rrTarget).toFixed(selectPricePrecision(pair)))
          : null;
  }

  const entrySelected = smartEntry;
  const stopSelected = smartStop;
  const takeSelected = smartTake;

  const directionValid = directionKey === 'BUY' || directionKey === 'SELL';
  const sideValid =
    directionKey === 'BUY'
      ? stopSelected != null &&
        takeSelected != null &&
        entrySelected != null &&
        stopSelected < entrySelected &&
        takeSelected > entrySelected
      : directionKey === 'SELL'
        ? stopSelected != null &&
          takeSelected != null &&
          entrySelected != null &&
          stopSelected > entrySelected &&
          takeSelected < entrySelected
        : false;

  const rrEffective =
    entrySelected != null && stopSelected != null && takeSelected != null
      ? Math.abs(takeSelected - entrySelected) /
        Math.max(Math.abs(entrySelected - stopSelected), 1e-9)
      : null;

  const lotRaw =
    toFinite(signal?.riskManagement?.positionSize) ??
    toFinite(signal?.positionSize) ??
    toFinite(signal?.entry?.positionSize);
  const lot = lotRaw != null && lotRaw > 0 ? lotRaw : 0.01;

  const backendApproved = signal?.shouldExecute === true || execution?.shouldExecute === true;
  const blockedReason =
    execution?.blockedReason ||
    gates?.blockedReason ||
    (Array.isArray(execution?.blockedReasons) && execution.blockedReasons[0]?.code
      ? String(execution.blockedReasons[0].code)
      : null) ||
    null;
  const decisionState = toUpper(gates?.decisionState || signal?.isValid?.decision?.state || '');
  const enterState = decisionState ? decisionState === 'ENTER' : signal?.isValid?.isValid === true;

  const mt5Ready =
    backendApproved ||
    (Boolean(pair) &&
      directionValid &&
      sideValid &&
      enterState &&
      signal?.isValid?.isValid === true);

  return {
    profile: {
      urgency: urgency || 'NORMAL',
      riskMode: riskMode || 'BALANCED',
      protectionBias: protectionBias || 'STANDARD',
      confidenceBand: toUpper(profile?.confidenceBand || 'MEDIUM'),
    },
    entry: entrySelected,
    stopLoss: stopSelected,
    takeProfit: takeSelected,
    lot,
    rr: rrEffective,
    spreadPips,
    mt5Ready,
    backendApproved,
    blockedReason,
    quoteTs: snapshot?.ts ?? snapshot?.timestamp ?? snapshot?.updatedAt ?? null,
  };
};

const resolveExecutionDebugChain = (signal) => {
  const layers = Array.isArray(signal?.components?.layeredAnalysis?.layers)
    ? signal.components.layeredAnalysis.layers
    : [];
  const layer18 =
    layers.find((layer) => toUpper(layer?.key) === 'L18' || Number(layer?.layer) === 18) || null;
  const layer20 =
    layers.find((layer) => toUpper(layer?.key) === 'L20' || Number(layer?.layer) === 20) || null;

  const execution = signal?.execution && typeof signal.execution === 'object' ? signal.execution : null;
  const gates = execution?.gates && typeof execution.gates === 'object' ? execution.gates : null;
  const layersStatus =
    gates?.layersStatus && typeof gates.layersStatus === 'object' ? gates.layersStatus : null;

  const decisionState =
    toUpper(gates?.decisionState) ||
    toUpper(layer20?.metrics?.decision?.state) ||
    toUpper(signal?.isValid?.decision?.state) ||
    '—';

  const originalDecisionState = toUpper(gates?.originalDecisionState) || null;
  const layer18Verdict =
    toUpper(gates?.layer18Verdict) || toUpper(layer18?.metrics?.verdict) || '—';
  const layers18Ready = layersStatus?.ok === true;
  const intelligentApproved = gates?.intelligentApproved === true;
  const tradingEnabled = gates?.tradingEnabled === true;
  const passesStrengthFloor = gates?.passesStrengthFloor === true;
  const quoteOk = gates?.quoteOk === true;
  const shouldExecute = signal?.shouldExecute === true || execution?.shouldExecute === true;

  const blockedReason =
    execution?.blockedReason ||
    gates?.blockedReason ||
    (Array.isArray(execution?.blockedReasons) && execution.blockedReasons[0]?.code
      ? String(execution.blockedReasons[0].code)
      : null) ||
    null;

  const intelligentReasons = Array.isArray(gates?.intelligentReasons)
    ? gates.intelligentReasons.filter(Boolean)
    : [];

  return {
    decisionState,
    originalDecisionState,
    layer18Verdict,
    layers18Ready,
    tradingEnabled,
    passesStrengthFloor,
    quoteOk,
    intelligentApproved,
    intelligentReasonsLabel: intelligentReasons.length
      ? intelligentReasons.slice(0, 3).join(' | ')
      : '—',
    shouldExecute,
    blockedReason: blockedReason || '—',
    stageDecisionLabel:
      decisionState === 'ENTER' ? 'ENTER' : decisionState === 'WAIT_MONITOR' ? 'WAIT_MONITOR' : decisionState,
    stageLayersLabel:
      layers18Ready
        ? `READY · L18 ${layer18Verdict}`
        : `NOT READY · L18 ${layer18Verdict}`,
    stageIntelligentLabel:
      intelligentApproved
        ? 'APPROVED'
        : gates?.intelligentApproved === false
          ? 'BLOCKED'
          : '—',
    stageFinalLabel: shouldExecute ? 'EXECUTE NOW' : 'NO EXECUTE',
  };
};

function SignalDashboardTable({
  signals = [],
  snapshots = [],
  selectedId,
  onSelect,
  mode = 'strong',
  emptyDetails,
  emptyTitle
}) {
  const [ageTick, setAgeTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setAgeTick((value) => (value + 1) % 1000000);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const rows = useMemo(() => {
    if (!Array.isArray(signals) || signals.length === 0) {
      return [];
    }

    const snapshotMap = new Map();
    const snapshotPairFallback = new Map();
    const snapshotsSource = Array.isArray(snapshots) ? snapshots : [];

    for (const snapshot of snapshotsSource) {
      if (!snapshot?.pair) {
        continue;
      }
      const pair = String(snapshot.pair).toUpperCase();
      const timeframe = snapshot.timeframe ? String(snapshot.timeframe).toUpperCase() : '';
      const key = `${pair}:${timeframe}`;
      const ts = snapshot.ts ?? snapshot.timestamp ?? snapshot.updatedAt ?? null;

      const existing = snapshotMap.get(key);
      const existingTs = existing?.ts ?? existing?.timestamp ?? existing?.updatedAt ?? null;
      const numericTs = typeof ts === 'number' ? ts : Date.parse(String(ts || ''));
      const numericExisting =
        typeof existingTs === 'number' ? existingTs : Date.parse(String(existingTs || ''));
      if (!existing || (Number(numericTs) || 0) > (Number(numericExisting) || 0)) {
        snapshotMap.set(key, snapshot);
      }

      const existingPair = snapshotPairFallback.get(pair);
      const existingPairTs =
        existingPair?.ts ?? existingPair?.timestamp ?? existingPair?.updatedAt ?? null;
      const numericPairExisting =
        typeof existingPairTs === 'number'
          ? existingPairTs
          : Date.parse(String(existingPairTs || ''));
      if (!existingPair || (Number(numericTs) || 0) > (Number(numericPairExisting) || 0)) {
        snapshotPairFallback.set(pair, snapshot);
      }
    }

    return signals.filter(Boolean).map((signal) => {
      const pair = signal.pair || 'N/A';
      const timeframe = signal.timeframe ? String(signal.timeframe).toUpperCase() : '—';
      const direction = formatDirection(signal.direction);
      const dirClass = direction === 'BUY' ? 'long' : direction === 'SELL' ? 'short' : 'neutral';

      const ts = signal.openedAt || signal.timestamp || signal.createdAt;
      const ageLabel = formatRelativeTime(ts);

      const entry = signal.entryPrice ?? signal.entry?.price ?? null;
      const takeProfit = signal.takeProfit ?? signal.entry?.takeProfit ?? null;
      const stopLoss = signal.stopLoss ?? signal.entry?.stopLoss ?? null;
      const riskReward = signal.riskReward ?? signal.entry?.riskReward ?? null;
      const atr = signal.atr ?? signal.entry?.atr ?? null;

      const technical = signal.components?.technical?.signals?.[0] || null;
      const netBias =
        technical?.bias ?? technical?.signal ?? technical?.direction ?? technical?.type ?? null;
      const techTimeframe = technical?.timeframe ?? technical?.timeFrame ?? null;
      const techScore = technical?.strength ?? technical?.score ?? null;

      const precision = selectPricePrecision(pair);

      const snapKey = `${String(pair).toUpperCase()}:${timeframe === '—' ? '' : timeframe}`;
      const snapshot =
        snapshotMap.get(snapKey) || snapshotPairFallback.get(String(pair).toUpperCase()) || null;

      const snapshotFeatures = snapshot?.features || {};
      const snapshotTs = snapshot?.ts ?? snapshot?.timestamp ?? snapshot?.updatedAt ?? null;
      const smartExecution = resolveSmartExecution({ signal, snapshot, pair, direction });
      const entryDisplay = smartExecution.entry ?? entry;
      const stopDisplay = smartExecution.stopLoss ?? stopLoss;
      const takeDisplay = smartExecution.takeProfit ?? takeProfit;
      const rrDisplay = smartExecution.rr ?? riskReward;
      const executionDebug = resolveExecutionDebugChain(signal);

      const signalTechnical = signal.components?.technical || {};
      const signalTrend = signalTechnical.trend || null;
      const signalRegime = signalTechnical.regime?.state || signalTechnical.regimeState || null;
      const signalVolatility =
        signal.entry?.volatilityState || signalTechnical.volatility?.state || null;

      const snapshotDirection = formatDirection(
        snapshotFeatures.direction ??
          snapshotFeatures.signal ??
          snapshotFeatures.bias ??
          signalTechnical.direction
      );
      const snapshotDirClass =
        snapshotDirection === 'BUY' ? 'long' : snapshotDirection === 'SELL' ? 'short' : 'neutral';
      const snapshotScore =
        snapshotFeatures.score ??
        snapshotFeatures.strength ??
        snapshotFeatures.confidence ??
        signalTechnical.score;

      const snapshotRegime =
        snapshotFeatures.regime?.state ??
        snapshotFeatures.regimeState ??
        snapshotFeatures.marketState ??
        signalRegime ??
        signalTrend;

      const snapshotVolatility =
        snapshotFeatures.volatility?.state ?? snapshotFeatures.volatilityState ?? signalVolatility;

      const confluence = signal.components?.confluence || null;
      const layeredAnalysis = signal.components?.layeredAnalysis || null;
      const layers = Array.isArray(confluence?.layers) ? confluence.layers : [];
      const evaluated = layers.filter((l) => String(l?.status || '').toUpperCase() !== 'SKIP');
      const fails = evaluated.filter((l) => String(l?.status || '').toUpperCase() === 'FAIL');
      const passCount = evaluated.filter(
        (l) => String(l?.status || '').toUpperCase() === 'PASS'
      ).length;
      const failCount = fails.length;
      const layerCount = layers.length;
      const confluenceVariant = failCount > 0 ? 'fail' : passCount > 0 ? 'pass' : 'neutral';
      const confluenceLabel = formatConfluenceScore(confluence);
      const confluenceMin = Number(confluence?.minScore);
      const confluenceMinLabel = Number.isFinite(confluenceMin)
        ? `${Math.round(confluenceMin)}%`
        : '—';
      const intelligence = signal.components?.intelligence || null;
      const intelligenceSummary = formatIntelligenceSummary(intelligence);

      return {
        id: signal.id || `${pair}-${timeframe}-${ts || Math.random()}`,
        raw: signal,
        pair,
        timeframe,
        status: (() => {
          const expiresAt = Number(signal?.expiresAt ?? signal?.validity?.expiresAt);
          if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
            return 'EXPIRED';
          }
          const base = signal.signalStatus || signal.status || 'PENDING';
          return String(base).toUpperCase();
        })(),
        ageLabel,
        direction,
        dirClass,
        entryLabel: formatNumber(entryDisplay, precision),
        takeProfitLabel: formatNumber(takeDisplay, precision),
        stopLossLabel: formatNumber(stopDisplay, precision),
        riskRewardLabel: formatRiskReward(rrDisplay),
        atrLabel:
          atr !== undefined && atr !== null && !Number.isNaN(Number(atr))
            ? formatNumber(atr, 4)
            : '—',
        netBiasLabel: netBias ? String(netBias).toUpperCase() : '—',
        techTimeframeLabel: techTimeframe ? String(techTimeframe).toUpperCase() : '—',
        techScoreLabel:
          techScore !== undefined && techScore !== null && !Number.isNaN(Number(techScore))
            ? Math.round(Number(techScore))
            : '—',
        confidenceLabel: toPercentLabel(signal.confidence),
        strengthLabel: signal.strength != null ? Math.round(Number(signal.strength)) : '—',
        scoreLabel: signal.score != null ? Math.round(Number(signal.score)) : '—',
        featureUpdatedLabel: snapshotTs
          ? formatDateTime(snapshotTs)
          : ts
            ? formatDateTime(ts)
            : '—',
        featureDirection: snapshotDirection || '—',
        featureDirClass: snapshotDirection ? snapshotDirClass : 'neutral',
        featureScoreLabel:
          snapshotScore !== undefined &&
          snapshotScore !== null &&
          !Number.isNaN(Number(snapshotScore))
            ? Number(snapshotScore).toFixed(2)
            : '—',
        featureRegimeLabel: snapshotRegime ? String(snapshotRegime).toUpperCase() : '—',
        featureVolatilityLabel: snapshotVolatility ? String(snapshotVolatility).toUpperCase() : '—',
        intelligenceLabel: intelligenceSummary.label,
        intelligenceTitle: intelligenceSummary.title,
        confluence,
        layeredAnalysis,
        confluenceLabel,
        confluenceMinLabel,
        confluenceVariant,
        confluenceLayerCount: layerCount,
        confluenceFailCount: failCount,
        mt5Ready: smartExecution.mt5Ready,
        mt5ReadyLabel: smartExecution.mt5Ready ? 'READY' : 'NEEDS REVIEW',
        mt5BackendLabel: smartExecution.backendApproved ? 'EA-APPROVED' : 'EA-BLOCKED',
        mt5BlockedReason: smartExecution.blockedReason || '—',
        smartEntryLabel: formatNumber(smartExecution.entry, precision),
        smartStopLossLabel: formatNumber(smartExecution.stopLoss, precision),
        smartTakeProfitLabel: formatNumber(smartExecution.takeProfit, precision),
        smartRiskRewardLabel: formatRiskReward(smartExecution.rr),
        smartLotLabel: smartExecution.lot != null ? Number(smartExecution.lot).toFixed(2) : '0.01',
        smartSpreadLabel:
          smartExecution.spreadPips != null ? `${Number(smartExecution.spreadPips).toFixed(1)}p` : '—',
        executionProfileLabel: `${smartExecution.profile.urgency}/${smartExecution.profile.riskMode}/${smartExecution.profile.protectionBias}`,
        executionConfidenceBand: smartExecution.profile.confidenceBand,
        debugDecisionLabel: executionDebug.stageDecisionLabel,
        debugLayersLabel: executionDebug.stageLayersLabel,
        debugIntelligentLabel: executionDebug.stageIntelligentLabel,
        debugFinalLabel: executionDebug.stageFinalLabel,
        debugDecisionState: executionDebug.decisionState,
        debugOriginalDecisionState: executionDebug.originalDecisionState,
        debugLayer18Verdict: executionDebug.layer18Verdict,
        debugLayers18Ready: executionDebug.layers18Ready ? 'YES' : 'NO',
        debugTradingEnabled: executionDebug.tradingEnabled ? 'YES' : 'NO',
        debugStrengthFloor: executionDebug.passesStrengthFloor ? 'YES' : 'NO',
        debugQuoteOk: executionDebug.quoteOk ? 'YES' : 'NO',
        debugIntelligentApproved: executionDebug.intelligentApproved ? 'YES' : 'NO',
        debugIntelligentReasons: executionDebug.intelligentReasonsLabel,
        debugShouldExecute: executionDebug.shouldExecute ? 'YES' : 'NO',
        debugBlockedReason: executionDebug.blockedReason,
      };
    });
  }, [ageTick, signals, snapshots]);

  const isStrongMode = String(mode || '').toLowerCase() === 'strong';

  if (!rows.length) {
    return (
      <table className="signal-dashboard__table" aria-label="Trading signals">
        <thead>
          <tr>
            <th>Pair</th>
            <th>Timeframe</th>
            <th>Age</th>
            <th>Dir</th>
            <th>Entry</th>
            <th>SL</th>
            <th>TP</th>
            <th>R:R</th>
            <th>Layers</th>
            <th>Conf</th>
            <th>Strength</th>
            <th>Intel</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan="12" className="cell--empty">
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontWeight: 650 }}>
                  {emptyTitle
                    ? String(emptyTitle)
                    : isStrongMode
                      ? 'No strong trade signals right now.'
                      : 'No trade signals to show right now.'}
                </div>
                {emptyDetails ? (
                  <div style={{ opacity: 0.85, lineHeight: 1.35 }}>{String(emptyDetails)}</div>
                ) : null}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table className="signal-dashboard__table" aria-label="Trading signals">
      <thead>
        <tr>
          <th>Pair</th>
          <th>Timeframe</th>
          {!isStrongMode && <th>Status</th>}
          <th>Age</th>
          <th>Dir</th>
          <th>Entry</th>
          <th>SL</th>
          <th>TP</th>
          <th>R:R</th>
          <th>Layers</th>
          {!isStrongMode && <th>ATR</th>}
          {!isStrongMode && <th>Net Bias</th>}
          {!isStrongMode && <th>Tech TF</th>}
          {!isStrongMode && <th>Tech Score</th>}
          <th>Conf</th>
          <th>Strength</th>
          <th>Intel</th>
          {!isStrongMode && <th>Score</th>}
          {!isStrongMode && <th>Feat Updated</th>}
          {!isStrongMode && <th>Feat Dir</th>}
          {!isStrongMode && <th>Feat Score</th>}
          {!isStrongMode && <th>Regime</th>}
          {!isStrongMode && <th>Vol</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSelected = selectedId && row.id === selectedId;
          return (
            <React.Fragment key={row.id}>
              <tr
                className={`signal-dashboard__row ${isSelected ? 'signal-dashboard__row--selected' : ''}`}
                onClick={() => onSelect?.(row.raw, row.id)}
                role="row"
                aria-selected={isSelected}
              >
                <td>{row.pair}</td>
                <td>{row.timeframe}</td>
                {!isStrongMode && <td>{row.status}</td>}
                <td>{row.ageLabel}</td>
                <td>
                  <span
                    className={`signal-dashboard__direction signal-dashboard__direction--${row.dirClass}`}
                  >
                    {row.direction}
                  </span>
                </td>
                <td>{row.entryLabel}</td>
                <td>{row.stopLossLabel}</td>
                <td>{row.takeProfitLabel}</td>
                <td>{row.riskRewardLabel}</td>
                <td>
                  <span
                    title={`Min ${row.confluenceMinLabel} | ${row.confluenceLayerCount} layers | ${row.confluenceFailCount} fails`}
                    style={{
                      fontWeight: 600,
                      color:
                        row.confluenceVariant === 'fail'
                          ? 'var(--danger, #d14343)'
                          : row.confluenceVariant === 'pass'
                            ? 'var(--success, #2eaa6a)'
                            : 'inherit'
                    }}
                  >
                    {row.confluenceLabel}
                  </span>
                </td>
                {!isStrongMode && <td>{row.atrLabel}</td>}
                {!isStrongMode && <td>{row.netBiasLabel}</td>}
                {!isStrongMode && <td>{row.techTimeframeLabel}</td>}
                {!isStrongMode && <td>{row.techScoreLabel}</td>}
                <td>{row.confidenceLabel}</td>
                <td>{row.strengthLabel}</td>
                <td title={row.intelligenceTitle}>{row.intelligenceLabel}</td>
                {!isStrongMode && <td>{row.scoreLabel}</td>}
                {!isStrongMode && <td>{row.featureUpdatedLabel}</td>}
                {!isStrongMode && (
                  <td>
                    <span
                      className={`signal-dashboard__direction signal-dashboard__direction--${row.featureDirClass}`}
                    >
                      {row.featureDirection}
                    </span>
                  </td>
                )}
                {!isStrongMode && <td>{row.featureScoreLabel}</td>}
                {!isStrongMode && <td>{row.featureRegimeLabel}</td>}
                {!isStrongMode && <td>{row.featureVolatilityLabel}</td>}
              </tr>

              {isSelected && row.layeredAnalysis && Array.isArray(row.layeredAnalysis.layers) && (
                <tr className="signal-dashboard__row signal-dashboard__row--details">
                  <td colSpan={isStrongMode ? 12 : 23} style={{ padding: '10px 12px' }}>
                    <details open>
                      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                        {row.layeredAnalysis.layers.length} Layers — Full Analysis
                      </summary>
                      <div
                        style={{
                          marginTop: 8,
                          marginBottom: 8,
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <strong>MT5:</strong> {row.mt5ReadyLabel}
                        </div>
                        <div>
                          <strong>EA Gate:</strong> {row.mt5BackendLabel}
                        </div>
                        <div>
                          <strong>Blocked:</strong> {row.mt5BlockedReason}
                        </div>
                        <div>
                          <strong>Smart Entry:</strong> {row.smartEntryLabel}
                        </div>
                        <div>
                          <strong>Smart SL:</strong> {row.smartStopLossLabel}
                        </div>
                        <div>
                          <strong>Smart TP:</strong> {row.smartTakeProfitLabel}
                        </div>
                        <div>
                          <strong>Smart R:R:</strong> {row.smartRiskRewardLabel}
                        </div>
                        <div>
                          <strong>Lot:</strong> {row.smartLotLabel}
                        </div>
                        <div>
                          <strong>Spread:</strong> {row.smartSpreadLabel}
                        </div>
                        <div>
                          <strong>Execution Profile:</strong> {row.executionProfileLabel}
                        </div>
                        <div>
                          <strong>Band:</strong> {row.executionConfidenceBand}
                        </div>
                        <div>
                          <strong>Intelligence:</strong> {row.intelligenceLabel}
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          marginBottom: 8,
                          border: '1px solid var(--panelBorder, rgba(255,255,255,0.08))',
                          borderRadius: 8,
                          padding: '8px 10px',
                          display: 'grid',
                          gap: 6,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>Debug Chain</div>
                        <div>
                          <strong>1) Decision:</strong> {row.debugDecisionLabel}
                          {row.debugOriginalDecisionState ? ` (from ${row.debugOriginalDecisionState})` : ''}
                        </div>
                        <div>
                          <strong>2) Layers18:</strong> {row.debugLayersLabel}
                        </div>
                        <div>
                          <strong>3) Intelligent Gate:</strong> {row.debugIntelligentLabel}
                        </div>
                        <div>
                          <strong>4) Final:</strong> {row.debugFinalLabel}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          <strong>Checks:</strong> trading {row.debugTradingEnabled} · floor {row.debugStrengthFloor} · quote {row.debugQuoteOk} · layers {row.debugLayers18Ready}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          <strong>Intelligent reasons:</strong> {row.debugIntelligentReasons}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          <strong>Blocked reason:</strong> {row.debugBlockedReason}
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          <strong>Decision state:</strong> {row.debugDecisionState} · <strong>shouldExecute:</strong> {row.debugShouldExecute}
                        </div>
                      </div>

                      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                        {row.layeredAnalysis.layers.map((layer) => {
                          const layerNo = Number(layer?.layer);
                          const label = layer?.nameEn || layer?.key || `L${layerNo || '—'}`;
                          const arrow = layer?.arrow || '•';
                          const dir = layer?.direction || 'NEUTRAL';
                          const conf =
                            layer?.confidence !== undefined && layer?.confidence !== null
                              ? `${layer.confidence}%`
                              : '—';
                          const scoreLabel = formatLayer18Score(layer?.score);
                          const score = scoreLabel != null ? ` · ${scoreLabel}` : '';
                          const summary = layer?.summaryEn ? String(layer.summaryEn) : '';

                          return (
                            <div
                              key={layer?.key || `${label}-${layerNo}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(220px, 1fr) minmax(140px, 220px)',
                                gap: 10,
                                alignItems: 'baseline',
                                fontSize: 13
                              }}
                            >
                              <div style={{ fontWeight: 650 }}>
                                {layer?.key || `L${layerNo}`} · {label}
                              </div>
                              <div
                                style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                              >
                                {arrow} {dir} · {conf}
                                {score}
                              </div>
                              {summary ? (
                                <div
                                  style={{
                                    gridColumn: '1 / -1',
                                    opacity: 0.85,
                                    fontSize: 12,
                                    lineHeight: 1.35
                                  }}
                                >
                                  {summary}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </td>
                </tr>
              )}

              {isSelected &&
                (!row.layeredAnalysis || !Array.isArray(row.layeredAnalysis.layers)) &&
                row.confluence &&
                Array.isArray(row.confluence.layers) && (
                  <tr className="signal-dashboard__row signal-dashboard__row--details">
                    <td colSpan={isStrongMode ? 11 : 22} style={{ padding: '10px 12px' }}>
                      <details open>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                          Analysis Layers ({row.confluenceLayerCount}) — Score {row.confluenceLabel}{' '}
                          (min {row.confluenceMinLabel})
                        </summary>
                        <div
                          style={{
                            marginTop: 8,
                            marginBottom: 8,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          <div>
                            <strong>MT5:</strong> {row.mt5ReadyLabel}
                          </div>
                          <div>
                            <strong>EA Gate:</strong> {row.mt5BackendLabel}
                          </div>
                          <div>
                            <strong>Blocked:</strong> {row.mt5BlockedReason}
                          </div>
                          <div>
                            <strong>Smart Entry:</strong> {row.smartEntryLabel}
                          </div>
                          <div>
                            <strong>Smart SL:</strong> {row.smartStopLossLabel}
                          </div>
                          <div>
                            <strong>Smart TP:</strong> {row.smartTakeProfitLabel}
                          </div>
                          <div>
                            <strong>Smart R:R:</strong> {row.smartRiskRewardLabel}
                          </div>
                          <div>
                            <strong>Lot:</strong> {row.smartLotLabel}
                          </div>
                          <div>
                            <strong>Spread:</strong> {row.smartSpreadLabel}
                          </div>
                          <div>
                            <strong>Execution Profile:</strong> {row.executionProfileLabel}
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 6,
                            marginBottom: 8,
                            border: '1px solid var(--panelBorder, rgba(255,255,255,0.08))',
                            borderRadius: 8,
                            padding: '8px 10px',
                            display: 'grid',
                            gap: 6,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>Debug Chain</div>
                          <div>
                            <strong>1) Decision:</strong> {row.debugDecisionLabel}
                            {row.debugOriginalDecisionState ? ` (from ${row.debugOriginalDecisionState})` : ''}
                          </div>
                          <div>
                            <strong>2) Layers18:</strong> {row.debugLayersLabel}
                          </div>
                          <div>
                            <strong>3) Intelligent Gate:</strong> {row.debugIntelligentLabel}
                          </div>
                          <div>
                            <strong>4) Final:</strong> {row.debugFinalLabel}
                          </div>
                          <div style={{ opacity: 0.9 }}>
                            <strong>Checks:</strong> trading {row.debugTradingEnabled} · floor {row.debugStrengthFloor} · quote {row.debugQuoteOk} · layers {row.debugLayers18Ready}
                          </div>
                          <div style={{ opacity: 0.9 }}>
                            <strong>Intelligent reasons:</strong> {row.debugIntelligentReasons}
                          </div>
                          <div style={{ opacity: 0.9 }}>
                            <strong>Blocked reason:</strong> {row.debugBlockedReason}
                          </div>
                        </div>

                        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                          {row.confluence.layers.map((layer, idx) => {
                            const status = formatLayerStatus(layer?.status);
                            const reason = layer?.reason ? String(layer.reason) : '';
                            return (
                              <div
                                key={`${String(layer?.id || 'layer')}-${idx}`}
                                style={{
                                  display: 'flex',
                                  gap: 10,
                                  alignItems: 'baseline',
                                  fontSize: 13,
                                  opacity: status === 'SKIP' ? 0.7 : 1
                                }}
                              >
                                <span
                                  style={{
                                    minWidth: 44,
                                    fontWeight: 700,
                                    color:
                                      status === 'FAIL'
                                        ? 'var(--danger, #d14343)'
                                        : status === 'PASS'
                                          ? 'var(--success, #2eaa6a)'
                                          : 'inherit'
                                  }}
                                >
                                  {status}
                                </span>
                                <span style={{ minWidth: 220, fontWeight: 600 }}>
                                  {layer?.label || layer?.id || `Layer ${idx + 1}`}
                                </span>
                                <span style={{ opacity: 0.9 }}>{reason || '—'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    </td>
                  </tr>
                )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export default SignalDashboardTable;
