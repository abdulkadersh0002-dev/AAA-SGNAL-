import React, { useEffect, useMemo, useState } from 'react';
import { formatRelativeTime, formatDirection } from '../utils/format.js';

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

const pad = (value) => (value == null ? '—' : String(value));

const formatDecision = (signal) => {
  const decision = signal?.isValid?.decision || null;
  const state = toUpper(decision?.state) || '—';
  const blocked = decision?.blocked === true;
  return blocked ? `${state} (BLOCKED)` : state;
};

const formatBlockers = (signal) => {
  const decision = signal?.isValid?.decision || null;
  const blockers = Array.isArray(decision?.blockers) ? decision.blockers.filter(Boolean) : [];
  const missing = Array.isArray(decision?.missing) ? decision.missing.filter(Boolean) : [];
  const parts = [];
  if (blockers.length) {
    parts.push(`blockers: ${blockers.slice(0, 3).join(', ')}`);
  }
  if (missing.length) {
    parts.push(`missing: ${missing.slice(0, 3).join(', ')}`);
  }
  return parts.length ? parts.join(' · ') : '—';
};

const CANDIDATE_MIN_CONFIDENCE = Number(import.meta?.env?.VITE_CANDIDATE_MIN_CONFIDENCE);
const CANDIDATE_MIN_STRENGTH = Number(import.meta?.env?.VITE_CANDIDATE_MIN_STRENGTH);
const CANDIDATE_MIN_WIN_RATE = Number(import.meta?.env?.VITE_CANDIDATE_MIN_WIN_RATE);
const CANDIDATE_MIN_SCORE = Number(import.meta?.env?.VITE_CANDIDATE_MIN_SCORE);

const candidateMinConfidence = Number.isFinite(CANDIDATE_MIN_CONFIDENCE)
  ? Math.max(0, Math.min(100, CANDIDATE_MIN_CONFIDENCE))
  : 65;
const candidateMinStrength = Number.isFinite(CANDIDATE_MIN_STRENGTH)
  ? Math.max(0, Math.min(100, CANDIDATE_MIN_STRENGTH))
  : 65;
const candidateMinWinRate = Number.isFinite(CANDIDATE_MIN_WIN_RATE)
  ? Math.max(0, Math.min(100, CANDIDATE_MIN_WIN_RATE))
  : 75;
const candidateMinScore = Number.isFinite(CANDIDATE_MIN_SCORE)
  ? Math.max(0, Math.min(100, CANDIDATE_MIN_SCORE))
  : 30;

const hasRequiredSignalQuality = (signal) => {
  if (!signal || typeof signal !== 'object') {
    return false;
  }

  const decision = signal?.isValid?.decision || null;
  const state = toUpper(decision?.state);
  const blocked = decision?.blocked === true;
  if (blocked) {
    return false;
  }
  if (state !== 'ENTER' && state !== 'WAIT_MONITOR') {
    return false;
  }

  const missing = Array.isArray(decision?.missing) ? decision.missing.filter(Boolean) : [];

  const confidence = Number(signal?.confidence) || 0;
  const strength = Number(signal?.strength) || 0;
  const winRateRaw = Number(signal?.winRate);
  const winRate = Number.isFinite(winRateRaw) ? winRateRaw : null;
  const decisionScore = Number(signal?.isValid?.decision?.score);
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

  const { rows, usingFallback } = useMemo(() => {
    void ageTick;
    const list = Array.isArray(signals) ? signals : [];
    const filtered = list.filter(Boolean).filter(hasRequiredSignalQuality);
    const display = filtered.length > 0 ? filtered : list.filter(Boolean);
    return {
      usingFallback: filtered.length === 0 && list.length > 0,
      rows: display.slice(0, MAX_CANDIDATE_TABLE_ROWS).map((signal) => {
        const pair = pad(signal?.pair);
        const timeframe = pad(signal?.timeframe ? toUpper(signal.timeframe) : '—');
        const direction = formatDirection(signal?.direction);
        const ts = signal?.openedAt || signal?.timestamp || signal?.createdAt || null;
        const age = ts ? formatRelativeTime(ts) : '—';
        const conf = Number.isFinite(Number(signal?.confidence))
          ? `${Math.round(Number(signal.confidence))}%`
          : '—';
        const strength = Number.isFinite(Number(signal?.strength))
          ? `${Math.round(Number(signal.strength))}`
          : '—';

        return {
          id: signal?.id || signal?.mergeKey || `${pair}-${timeframe}-${String(ts || '')}`,
          raw: signal,
          pair,
          timeframe,
          age,
          direction,
          decision: formatDecision(signal),
          conf,
          strength,
          details: formatBlockers(signal)
        };
      })
    };
  }, [signals, ageTick]);

  return (
    <div className="signal-candidates">
      <div className="signal-candidates__header">
        <h3>{title}</h3>
        <p className="panel__hint">{hint}</p>
        {usingFallback ? (
          <p className="panel__hint">
            Showing recent analyzed candidates that do not meet the smart-strong filters yet.
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="signal-candidates__empty">{emptyText}</div>
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
                <th>Why not ENTER</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = selectedId && row.id === selectedId;
                return (
                  <tr
                    key={row.id}
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
                    <td title={row.details}>{row.details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
