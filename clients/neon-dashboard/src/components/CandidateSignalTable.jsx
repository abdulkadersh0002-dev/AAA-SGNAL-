import React, { useEffect, useMemo, useState } from 'react';
import { formatRelativeTime, formatDirection } from '../utils/format.js';
import {
  getDecisionMissing,
  getDecisionScore,
  getDecisionState,
  getNormalizedDecision,
  isDecisionBlocked,
} from '../utils/decision.js';

const MAX_CANDIDATE_TABLE_ROWS = (() => {
  const raw = Number(import.meta?.env?.VITE_CANDIDATE_TABLE_ROWS);
  if (!Number.isFinite(raw)) {
    return 200;
  }
  return Math.max(25, Math.trunc(raw));
})();

const toUpper = (value) =>
  String(value || '')
    .trim()
    .toUpperCase();

const toFinite = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

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

const formatIntelligenceSummary = (signal) => {
  const intelligence = signal?.components?.intelligence;
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

const getExecutionProfile = (signal) => {
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

const buildMt5Summary = (signal) => {
  const execution = signal?.execution && typeof signal.execution === 'object' ? signal.execution : null;
  const gates = execution?.gates && typeof execution.gates === 'object' ? execution.gates : null;
  const backendApproved = signal?.shouldExecute === true || execution?.shouldExecute === true;

  const direction = toUpper(signal?.direction);
  const pair = toUpper(signal?.pair || signal?.symbol || signal?.instrument);

  const entry = toFinite(signal?.entry?.price ?? signal?.entryPrice);
  const stop = toFinite(signal?.entry?.stopLoss ?? signal?.stopLoss);
  const take = toFinite(signal?.entry?.takeProfit ?? signal?.takeProfit);
  const rr =
    toFinite(signal?.entry?.riskReward ?? signal?.riskReward) ??
    (entry != null && stop != null && take != null
      ? Math.abs(take - entry) / Math.max(Math.abs(entry - stop), 1e-9)
      : null);

  const spreadPips =
    toFinite(signal?.entry?.spreadPips) ??
    (() => {
      const bid = toFinite(signal?.components?.market?.quote?.bid);
      const ask = toFinite(signal?.components?.market?.quote?.ask);
      if (bid == null || ask == null) {
        return null;
      }
      return Math.abs(ask - bid) / selectPipSize(pair);
    })();

  const directionValid = direction === 'BUY' || direction === 'SELL';
  const sideValid =
    direction === 'BUY'
      ? entry != null && stop != null && take != null && stop < entry && take > entry
      : direction === 'SELL'
        ? entry != null && stop != null && take != null && stop > entry && take < entry
        : false;

  const missing = [];
  if (!pair) {
    missing.push('pair');
  }
  if (!directionValid) {
    missing.push('direction');
  }
  if (entry == null) {
    missing.push('entry');
  }
  if (stop == null) {
    missing.push('stopLoss');
  }
  if (take == null) {
    missing.push('takeProfit');
  }
  if (entry != null && stop != null && take != null && !sideValid) {
    missing.push('invalid_side');
  }

  const blockedReason =
    execution?.blockedReason ||
    gates?.blockedReason ||
    (Array.isArray(execution?.blockedReasons) && execution.blockedReasons[0]?.code
      ? String(execution.blockedReasons[0].code)
      : null) ||
    null;

  const structuralReady = missing.length === 0;
  const ready = backendApproved || (structuralReady && signal?.isValid?.isValid === true);
  const profile = getExecutionProfile(signal) || {};
  const urgency = toUpper(profile?.urgency || 'NORMAL');
  const riskMode = toUpper(profile?.riskMode || 'BALANCED');
  const protectionBias = toUpper(profile?.protectionBias || 'STANDARD');

  const summaryParts = [];
  summaryParts.push(
    ready
      ? backendApproved
        ? 'mt5: ready (ea approved)'
        : 'mt5: ready (structural)'
      : missing.length
        ? `mt5: missing ${missing.join(',')}`
        : 'mt5: blocked'
  );
  if (!backendApproved && blockedReason) {
    summaryParts.push(`blocked ${blockedReason}`);
  }
  if (rr != null) {
    summaryParts.push(`rr 1:${rr.toFixed(2)}`);
  }
  if (Number.isFinite(spreadPips)) {
    summaryParts.push(`spread ${spreadPips.toFixed(1)}p`);
  }
  summaryParts.push(`plan ${urgency}/${riskMode}/${protectionBias}`);

  return {
    ready,
    missing,
    summary: summaryParts.join(' · '),
  };
};

const pad = (value) => (value == null ? '—' : String(value));

const formatLayer18Score = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.abs(numeric) >= 100 ? numeric.toFixed(0) : numeric.toFixed(2);
};

const resolveDecision = (signal) => getNormalizedDecision(signal);

const formatDecision = (signal) => {
  const state = toUpper(getDecisionState(signal)) || '—';
  const blocked = isDecisionBlocked(signal);
  return blocked ? `${state} (BLOCKED)` : state;
};

const formatBlockers = (signal) => {
  const decision = resolveDecision(signal);
  const blockers = Array.isArray(decision?.blockers) ? decision.blockers.filter(Boolean) : [];
  const missing = getDecisionMissing(signal);
  const mt5 = buildMt5Summary(signal);

  const parts = [];
  if (blockers.length) {
    parts.push(`blockers: ${blockers.slice(0, 4).join(', ')}`);
  }
  if (missing.length) {
    parts.push(`missing: ${missing.slice(0, 5).join(', ')}`);
  }

  // Add richer diagnostics for the most confusing blockers.
  const adv = signal?.components?.advancedFilter;
  if (blockers.includes('advanced_filter') && adv && typeof adv === 'object') {
    const reasons = Array.isArray(adv?.reasons) ? adv.reasons.filter(Boolean) : [];
    const winRate = Number(adv?.metrics?.winRate);
    const minWinRate = Number(adv?.thresholds?.minWinRate);
    const strength = Number(adv?.metrics?.strength);
    const minStrength = Number(adv?.thresholds?.minStrength);
    const head = reasons.length ? `adv: ${reasons.slice(0, 2).join(', ')}` : 'adv: failed';
    const extraBits = [];
    if (Number.isFinite(winRate) && Number.isFinite(minWinRate)) {
      extraBits.push(`wr ${Math.round(winRate)}<${Math.round(minWinRate)}`);
    }
    if (Number.isFinite(strength) && Number.isFinite(minStrength)) {
      extraBits.push(`str ${Math.round(strength)}<${Math.round(minStrength)}`);
    }
    parts.push(extraBits.length ? `${head} (${extraBits.join(' ')})` : head);
  }

  // When the engine says "missing execution_cost" it usually means spread efficiency is too low.
  if (missing.includes('execution_cost') && decision && typeof decision === 'object') {
    const eff = Number(decision?.contributors?.spreadEfficiencyScore);
    const minEff = Number(decision?.context?.spreadEfficiencyMinForEnter);
    const spreadPips = Number(decision?.context?.spreadPips);
    const atrPips = Number(decision?.context?.atrPips);
    const minStr = Number(decision?.profile?.minStrength);
    const minWr = Number(decision?.profile?.minWinRate);
    const extras = [];
    if (Number.isFinite(eff) && Number.isFinite(minEff)) {
      extras.push(`spreadEff ${eff.toFixed(2)}<${minEff.toFixed(2)}`);
    }
    if (Number.isFinite(spreadPips)) {
      extras.push(`spread ${spreadPips.toFixed(1)}p`);
    }
    if (Number.isFinite(atrPips)) {
      extras.push(`atr ${atrPips.toFixed(0)}p`);
    }
    if (extras.length) {
      parts.push(`execCost: ${extras.join(' ')}`);
    }
    // Helpful, compact targets.
    const targets = [];
    const strengthNow = Number(signal?.strength);
    const winRateNow = (() => {
      const raw = signal?.winRate;
      if (raw == null || raw === '') {
        return null;
      }
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })();
    if (Number.isFinite(minStr) && Number.isFinite(strengthNow)) {
      targets.push(`str≥${Math.round(minStr)} (now ${Math.round(strengthNow)})`);
    }
    if (Number.isFinite(minWr) && Number.isFinite(winRateNow)) {
      targets.push(`wr≥${Math.round(minWr)} (now ${Math.round(winRateNow)})`);
    }
    if (targets.length) {
      parts.push(`targets: ${targets.join(' · ')}`);
    }
  }

  // If probability/strength are missing, show the exact floor.
  if ((missing.includes('strength') || missing.includes('probability')) && decision) {
    const minStr = Number(decision?.profile?.minStrength);
    const minWr = Number(decision?.profile?.minWinRate);
    const strengthNow = Number(signal?.strength);
    const winRateNow = (() => {
      const raw = signal?.winRate;
      if (raw == null || raw === '') {
        return null;
      }
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })();
    const hints = [];
    if (missing.includes('strength') && Number.isFinite(minStr) && Number.isFinite(strengthNow)) {
      hints.push(`strength ${Math.round(strengthNow)}<${Math.round(minStr)}`);
    }
    if (
      missing.includes('probability') &&
      Number.isFinite(minWr) &&
      winRateNow != null &&
      Number.isFinite(winRateNow)
    ) {
      hints.push(`winRate ${Math.round(winRateNow)}<${Math.round(minWr)}`);
    }
    if (hints.length) {
      parts.push(`floors: ${hints.join(' · ')}`);
    }
  }

  parts.push(mt5.summary);

  return parts.length ? parts.join(' · ') : '—';
};

const normalizeTimeframes = (value) => {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((tf) => String(tf || '').trim().toUpperCase())
    .filter(Boolean);
};

const pickCandidateTimeframes = (signal) => {
  const preferred = ['D1', 'H4', 'H1'];
  const fromSignal = normalizeTimeframes(signal?.availableTimeframes);

  if (fromSignal.length > 0) {
    const preferredList = preferred.filter((tf) => fromSignal.includes(tf));
    return preferredList.length > 0 ? preferredList : fromSignal;
  }

  const rawTf = signal?.timeframe ? String(signal.timeframe).trim().toUpperCase() : null;
  return rawTf ? [rawTf] : ['—'];
};

const CANDIDATE_MIN_CONFIDENCE = Number(import.meta?.env?.VITE_CANDIDATE_MIN_CONFIDENCE);
const CANDIDATE_MIN_STRENGTH = Number(import.meta?.env?.VITE_CANDIDATE_MIN_STRENGTH);
const CANDIDATE_MIN_WIN_RATE = Number(import.meta?.env?.VITE_CANDIDATE_MIN_WIN_RATE);
const CANDIDATE_MIN_SCORE = Number(import.meta?.env?.VITE_CANDIDATE_MIN_SCORE);

const candidateMinConfidence = Number.isFinite(CANDIDATE_MIN_CONFIDENCE)
  ? Math.max(0, Math.min(100, CANDIDATE_MIN_CONFIDENCE))
  : 58;
const candidateMinStrength = Number.isFinite(CANDIDATE_MIN_STRENGTH)
  ? Math.max(0, Math.min(100, CANDIDATE_MIN_STRENGTH))
  : 48;
const candidateMinWinRate = Number.isFinite(CANDIDATE_MIN_WIN_RATE)
  ? Math.max(0, Math.min(100, CANDIDATE_MIN_WIN_RATE))
  : 58;
const candidateMinScore = Number.isFinite(CANDIDATE_MIN_SCORE)
  ? Math.max(0, Math.min(100, CANDIDATE_MIN_SCORE))
  : 26;

const hasRequiredSignalQuality = (signal) => {
  if (!signal || typeof signal !== 'object') {
    return false;
  }

  const decision = resolveDecision(signal);
  const state = toUpper(getDecisionState(signal));
  const blocked = isDecisionBlocked(signal);
  if (blocked) {
    return false;
  }
  if (state !== 'ENTER' && state !== 'WAIT_MONITOR') {
    return false;
  }

  const missing = getDecisionMissing(signal);

  const confidence = Number(signal?.confidence) || 0;
  const strength = Number(signal?.strength) || 0;
  const winRate = (() => {
    const raw = signal?.winRate;
    if (raw == null || raw === '') {
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  })();
  const decisionScore = Number(getDecisionScore(signal));
  const scoreRaw = Number.isFinite(decisionScore) ? decisionScore : Number(signal?.score);
  const score = Number.isFinite(scoreRaw) ? scoreRaw : null;

  if (confidence < candidateMinConfidence || strength < candidateMinStrength) {
    return false;
  }
  if (winRate != null && winRate < candidateMinWinRate) {
    return false;
  }
  if (score != null && score < candidateMinScore) {
    return false;
  }

  return true;
};

export default function CandidateSignalTable({
  signals = [],
  selectedId,
  onSelect,
  title = 'Near / Analyzed candidates',
  hint =
    'Filtered to smart-strong, high win-rate signals (L1–L18) that are near ENTER.',
  emptyText = 'No analyzed candidates received yet.'
}) {
  const [ageTick, setAgeTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setAgeTick((v) => (v + 1) % 1000000);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const { rows, usingFallback, totalSignals } = useMemo(() => {
    void ageTick;
    const list = Array.isArray(signals)
      ? signals
      : Array.isArray(signals?.items)
        ? signals.items
        : [];
    const rawCount = list.filter(Boolean).length;

    // Keep “pair-only” candidates visible.
    // The EA runner can publish analyzed candidates early while direction/strength/confidence
    // are still being hydrated; hiding them makes the UI look broken.
    const nonEmpty = list.filter(Boolean).filter((signal) => {
      const pair = String(signal?.pair || signal?.symbol || signal?.instrument || '')
        .trim()
        .toUpperCase();
      const direction = String(signal?.direction || '').trim().toUpperCase();
      const decision = String(getDecisionState(signal) || '').trim().toUpperCase();
      const confidence = Number(signal?.confidence) || 0;
      const strength = Number(signal?.strength) || 0;
      const hasPair = Boolean(pair);
      const hasDecision = Boolean(decision);
      const hasDirection = direction === 'BUY' || direction === 'SELL';
      const hasSignalStrength = confidence > 0 || strength > 0;
      return hasPair || hasDecision || hasDirection || hasSignalStrength;
    });
    const filtered = nonEmpty.filter(hasRequiredSignalQuality);
    const display = filtered.length > 0 ? filtered : nonEmpty;
    return {
      usingFallback: filtered.length === 0 && nonEmpty.length > 0,
      totalSignals: rawCount,
      rows: display
        .slice(0, MAX_CANDIDATE_TABLE_ROWS)
        .flatMap((signal) => {
          const pair = pad(signal?.pair);
          const direction = formatDirection(signal?.direction);
          const ts = signal?.openedAt || signal?.timestamp || signal?.createdAt || null;
          const age = ts ? formatRelativeTime(ts) : '—';
          const conf = Number.isFinite(Number(signal?.confidence))
            ? `${Math.round(Number(signal.confidence))}%`
            : '—';
          const strength = Number.isFinite(Number(signal?.strength))
            ? `${Math.round(Number(signal.strength))}`
            : '—';
          const intelligence = formatIntelligenceSummary(signal);
          const decision = formatDecision(signal);
          const details = formatBlockers(signal);
          const timeframes = pickCandidateTimeframes(signal);
          const layeredAnalysis =
            signal?.components?.layeredAnalysis || signal?.layeredAnalysis || null;

          return timeframes.map((tf) => ({
            id:
              signal?.id || signal?.mergeKey
                ? `${signal?.id || signal?.mergeKey}:${tf}`
                : `${pair}-${tf}-${String(ts || '')}`,
            raw: { ...signal, timeframe: tf },
            pair,
            timeframe: pad(tf),
            age,
            direction,
            decision,
            conf,
            strength,
            details,
            intelligenceLabel: intelligence.label,
            intelligenceTitle: intelligence.title,
            layeredAnalysis
          }));
        })
    };
  }, [signals, ageTick]);

  return (
    <div className="signal-candidates">
      <div className="signal-candidates__header">
        <h3>{title}</h3>
        <p className="panel__hint">{hint}</p>
        <p className="panel__hint">
          Showing {rows.length} rows from {totalSignals} candidates
        </p>
        {usingFallback ? (
          <p className="panel__hint">
            Showing recent analyzed candidates that do not meet the smart-strong filters yet.
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="signal-candidates__empty">
          {totalSignals > 0
            ? `${emptyText} (buffered: ${totalSignals} · waiting for complete metrics/decision)`
            : emptyText}
        </div>
      ) : (
        <div className="signal-candidates__tableWrap" role="region" aria-label="Candidates table">
          <table className="signal-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>TF</th>
                <th>Age</th>
                <th>Dir</th>
                <th>Decision</th>
                <th>Conf</th>
                <th>Strength</th>
                <th>Intel</th>
                <th>Why not ENTER</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = selectedId && row.id === selectedId;
                const layers = Array.isArray(row.layeredAnalysis?.layers)
                  ? row.layeredAnalysis.layers
                  : null;

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={
                        isSelected
                          ? 'signal-table__row signal-table__row--selected'
                          : 'signal-table__row'
                      }
                      onClick={() => onSelect?.(row.raw, row.id)}
                      style={{ cursor: onSelect ? 'pointer' : 'default' }}
                    >
                      <td>{row.pair}</td>
                      <td>{row.timeframe}</td>
                      <td>{row.age}</td>
                      <td>{row.direction}</td>
                      <td>{row.decision}</td>
                      <td>{row.conf}</td>
                      <td>{row.strength}</td>
                      <td title={row.intelligenceTitle}>{row.intelligenceLabel}</td>
                      <td title={row.details}>{row.details}</td>
                    </tr>

                    {isSelected && layers && (
                      <tr className="signal-table__row signal-table__row--details">
                        <td colSpan={9} style={{ padding: '10px 12px' }}>
                          <details open>
                            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                              {layers.length} Layers — Full Analysis
                            </summary>
                            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                              {layers.map((layer) => {
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
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
