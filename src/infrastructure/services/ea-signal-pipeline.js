import { buildLayeredAnalysis } from '../../core/analyzers/layered-analysis.js';
import { getPairMetadata } from '../../config/pair-catalog.js';
import {
  getDecisionScore,
  getDecisionState,
  getNormalizedDecision,
  isDecisionBlocked,
} from '../../core/policy/decision-contract.js';

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getBarsCoverage = ({ eaBridgeService, broker, symbol, now } = {}) => {
  if (!eaBridgeService || typeof eaBridgeService.getMarketBars !== 'function') {
    return null;
  }
  const nowMs = toNumberOrNull(now) ?? Date.now();
  const timeframes = ['M1', 'M15', 'H1', 'H4', 'D1'];
  const coverage = {};

  for (const timeframe of timeframes) {
    try {
      const bars = eaBridgeService.getMarketBars({
        broker,
        symbol,
        timeframe,
        limit: 3,
        maxAgeMs: 0,
      });
      const list = Array.isArray(bars) ? bars : [];
      const latest = list[0] || null;
      const latestTime = toNumberOrNull(latest?.time ?? latest?.timestamp ?? latest?.t);
      const receivedAt = toNumberOrNull(latest?.receivedAt);

      coverage[timeframe] = {
        count: list.length,
        latestTime,
        receivedAt,
        ageMs: latestTime != null ? Math.max(0, nowMs - latestTime) : null,
        receivedAgeMs: receivedAt != null ? Math.max(0, nowMs - receivedAt) : null,
        source: latest?.source ?? null,
      };
    } catch (_error) {
      // best-effort
    }
  }

  return Object.keys(coverage).length ? coverage : null;
};

const isRealBidAskQuote = (quote) => {
  if (!quote || typeof quote !== 'object') {
    return false;
  }
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  return Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0;
};

export const normalizeLayeredAnalysis = (layers) => {
  const list = Array.isArray(layers) ? layers.filter(Boolean) : [];

  const byKey = new Map();
  for (const layer of list) {
    if (!layer || typeof layer !== 'object') {
      continue;
    }
    const keyRaw = layer.key ?? layer.id ?? layer.layer;
    const key =
      typeof keyRaw === 'number'
        ? `L${keyRaw}`
        : String(keyRaw || '')
            .trim()
            .toUpperCase();
    if (!key) {
      continue;
    }
    byKey.set(key, layer);
  }

  // Ensure the UI (and readiness gates) always see a complete 20-layer shape.
  // Missing layers are represented as PENDING placeholders with no metrics.
  const normalized = [];
  for (let i = 1; i <= 20; i += 1) {
    const key = `L${i}`;
    const existing = byKey.get(key) || null;
    if (existing) {
      normalized.push(existing);
      continue;
    }
    normalized.push({
      key,
      id: key,
      layer: i,
      status: 'PENDING',
      score: null,
      confidence: null,
      metrics: { pending: true },
    });
  }

  // Preserve any extra, non-standard layers beyond L1..L20.
  for (const [key, layer] of byKey.entries()) {
    if (/^L\d+$/i.test(String(key))) {
      continue;
    }
    normalized.push(layer);
  }

  return { layers: normalized };
};

export const getBestEffortQuote = ({
  eaBridgeService,
  broker,
  symbol,
  quoteMaxAgeMs,
  barFallback,
  now,
} = {}) => {
  const nowMs = toNumberOrNull(now) ?? Date.now();

  const mappedSymbol =
    eaBridgeService?.mapSymbolAlias && typeof eaBridgeService.mapSymbolAlias === 'function'
      ? eaBridgeService.mapSymbolAlias(symbol)
      : null;
  const requestedSymbol = mappedSymbol || symbol;

  const isFreshEnough = (quote) => {
    const maxAgeMs = toNumberOrNull(quoteMaxAgeMs);
    if (maxAgeMs == null) {
      return true;
    }
    const receivedAt = toNumberOrNull(quote?.receivedAt ?? quote?.timestamp);
    if (receivedAt == null) {
      return false;
    }
    return nowMs - receivedAt <= maxAgeMs;
  };

  try {
    let quote = null;

    if (typeof eaBridgeService?.getLatestQuoteForSymbolMatch === 'function') {
      const best = eaBridgeService.getLatestQuoteForSymbolMatch(broker, requestedSymbol);
      if (best && typeof best === 'object' && isFreshEnough(best)) {
        quote = best;
      }
    }

    if (!quote) {
      const quotes = eaBridgeService?.getQuotes
        ? eaBridgeService.getQuotes({
            broker,
            symbols: [requestedSymbol],
            maxAgeMs: quoteMaxAgeMs,
          })
        : [];
      quote = Array.isArray(quotes) && quotes.length ? quotes[0] : null;
    }

    if (quote && typeof quote === 'object') {
      // Prefer true bid/ask quotes. If we only have bars-derived last/mid,
      // try to hydrate from the latest snapshot quote.
      if (isRealBidAskQuote(quote)) {
        return { quote, source: 'quotes' };
      }

      try {
        if (eaBridgeService?.getMarketSnapshot) {
          const snapshot = eaBridgeService.getMarketSnapshot({
            broker,
            symbol: requestedSymbol,
            maxAgeMs: quoteMaxAgeMs,
          });
          const sq = snapshot?.quote && typeof snapshot.quote === 'object' ? snapshot.quote : null;
          if (sq) {
            const normalized = {
              ...sq,
              broker: sq.broker ?? broker,
              symbol: sq.symbol ?? requestedSymbol,
              source: sq.source ?? snapshot?.source ?? 'ea_snapshot',
              receivedAt: sq.receivedAt ?? snapshot?.receivedAt ?? null,
              timestamp: sq.timestamp ?? snapshot?.timestamp ?? null,
            };
            if (isRealBidAskQuote(normalized)) {
              return { quote: normalized, source: 'snapshot' };
            }
          }
        }
      } catch (_error) {
        // best-effort
      }

      return { quote, source: 'quotes' };
    }

    if (barFallback && typeof barFallback === 'object') {
      return {
        quote: {
          symbol: requestedSymbol,
          last: barFallback.price,
          source: `ea.bars.${barFallback.timeframe}`,
          receivedAt: barFallback.timeMs || nowMs,
        },
        source: 'bars',
      };
    }

    return { quote: null, source: null };
  } catch (_error) {
    return { quote: null, source: null };
  }
};

export const buildScenarioForLayeredAnalysis = ({
  rawSignal,
  symbol,
  effectiveQuote,
  barFallback,
  barsCoverage,
  now,
} = {}) => {
  const normalizedDecision = getNormalizedDecision(rawSignal);
  const legacyDecision =
    rawSignal?.isValid?.decision && typeof rawSignal.isValid.decision === 'object'
      ? rawSignal.isValid.decision
      : {};
  const nowMs = toNumberOrNull(now) ?? Date.now();

  const receivedAt =
    effectiveQuote && typeof effectiveQuote === 'object'
      ? (effectiveQuote.receivedAt ?? effectiveQuote.timestamp ?? null)
      : null;

  const receivedAtMs = toNumberOrNull(receivedAt);
  const ageMs = receivedAtMs != null ? Math.max(0, nowMs - receivedAtMs) : null;

  const bid = effectiveQuote?.bid != null ? Number(effectiveQuote.bid) : null;
  const ask = effectiveQuote?.ask != null ? Number(effectiveQuote.ask) : null;
  const mid =
    effectiveQuote?.mid != null
      ? Number(effectiveQuote.mid)
      : Number.isFinite(bid) && Number.isFinite(ask)
        ? (bid + ask) / 2
        : effectiveQuote?.last != null
          ? Number(effectiveQuote.last)
          : null;
  const spread =
    Number.isFinite(bid) && Number.isFinite(ask) ? Number((ask - bid).toFixed(8)) : null;
  const spreadPct =
    spread != null && mid != null && mid !== 0 ? Number(((spread / mid) * 100).toFixed(6)) : null;

  const spreadPoints =
    effectiveQuote?.spreadPoints != null
      ? Number(effectiveQuote.spreadPoints)
      : spread != null && effectiveQuote?.point != null
        ? Number((spread / Number(effectiveQuote.point)).toFixed(2))
        : null;

  const liquidityHint = (() => {
    if (spreadPct == null && spreadPoints == null) {
      return null;
    }
    const wide =
      (spreadPct != null && spreadPct >= 0.15) || (spreadPoints != null && spreadPoints >= 60);
    return wide ? 'thin' : 'normal';
  })();

  const bar = barFallback && typeof barFallback === 'object' ? barFallback : null;
  const barClose = bar?.price != null ? Number(bar.price) : null;
  const barOpen = bar?.open != null ? Number(bar.open) : null;
  const barPrevClose = bar?.prevClose != null ? Number(bar.prevClose) : null;
  const barVolume = bar?.volume != null ? Number(bar.volume) : null;

  const gapToMid = mid != null && barClose != null ? Number((mid - barClose).toFixed(8)) : null;
  const gapOpen =
    barOpen != null && barPrevClose != null ? Number((barOpen - barPrevClose).toFixed(8)) : null;

  const telemetry =
    rawSignal?.components?.telemetry && typeof rawSignal.components.telemetry === 'object'
      ? rawSignal.components.telemetry
      : null;

  return {
    pair: rawSignal?.pair || symbol,
    primary: {
      direction: rawSignal?.direction,
      confidence: rawSignal?.confidence,
      finalScore: rawSignal?.finalScore,
    },
    intermarket:
      rawSignal?.components?.intermarket && typeof rawSignal.components.intermarket === 'object'
        ? rawSignal.components.intermarket
        : null,
    market: {
      quote:
        effectiveQuote && typeof effectiveQuote === 'object'
          ? {
              ...effectiveQuote,
              ageMs,
              bid,
              ask,
              mid,
              spread,
              spreadPct,
              spreadPoints,
              liquidityHint,
              volume: barVolume,
              gapToMid,
              gapOpen,
              midVelocityPerSec:
                telemetry?.quote?.midVelocityPerSec ?? telemetry?.quote?.velocityPerSec ?? null,
              midAccelerationPerSec2:
                telemetry?.quote?.midAccelerationPerSec2 ??
                telemetry?.quote?.accelerationPerSec2 ??
                null,
              midDelta: telemetry?.quote?.midDelta ?? null,
            }
          : { ageMs, pending: true },
      barsCoverage: barsCoverage && typeof barsCoverage === 'object' ? barsCoverage : null,
    },
    telemetry,
    factors: {
      economic: rawSignal?.components?.economic?.details || rawSignal?.components?.economic || null,
      news: rawSignal?.components?.news || null,
      technical: rawSignal?.components?.technical || null,
      candles: rawSignal?.components?.technical?.candlesSummary || null,
    },
    decision: {
      state: getDecisionState(rawSignal),
      blocked: isDecisionBlocked(rawSignal),
      score: getDecisionScore(rawSignal),
      reason: rawSignal?.isValid?.reason || null,
      checks: rawSignal?.isValid?.checks || null,
      isTradeValid: rawSignal?.isValid?.isValid === true,
      missing:
        (Array.isArray(normalizedDecision?.missing) && normalizedDecision.missing) ||
        legacyDecision.missing ||
        null,
      whatWouldChange: legacyDecision.whatWouldChange || null,
    },
  };
};

export const attachLayeredAnalysisToSignal = ({
  rawSignal,
  broker,
  symbol,
  eaBridgeService,
  quoteMaxAgeMs,
  barFallback,
  now,
} = {}) => {
  if (!rawSignal || typeof rawSignal !== 'object') {
    return rawSignal;
  }

  rawSignal.components =
    rawSignal.components && typeof rawSignal.components === 'object' ? rawSignal.components : {};

  const pair = rawSignal?.pair || symbol || null;
  const metadata = pair ? getPairMetadata(pair) : null;
  const cleanedPair = String(pair || '').toUpperCase();
  const fallbackBase = cleanedPair.length >= 6 ? cleanedPair.slice(0, 3) : null;
  const fallbackQuote = cleanedPair.length >= 6 ? cleanedPair.slice(3, 6) : null;

  rawSignal.components.pairContext = {
    pair: metadata?.pair || pair || null,
    base: metadata?.base || fallbackBase,
    quote: metadata?.quote || fallbackQuote,
    assetClass: metadata?.assetClass || null,
    displayName: metadata?.displayName || null,
    pipSize: metadata?.pipSize ?? null,
    pricePrecision: metadata?.pricePrecision ?? null,
    contractSize: metadata?.contractSize ?? null,
    sessions: metadata?.sessions ?? null,
    liquidityNotes: metadata?.liquidityNotes ?? null,
  };

  const generatedAt = toNumberOrNull(rawSignal?.generatedAt ?? now) ?? Date.now();
  const fallbackDecisionState = getDecisionState(rawSignal);

  const baseEntryContext = {
    generatedAt,
    direction: rawSignal?.direction || null,
    timeframe: rawSignal?.components?.technical?.timeframe || null,
    marketPhase: null,
    volatilityState: null,
    session: null,
    confluenceScore: null,
    decisionState: fallbackDecisionState,
    spreadPoints: null,
    newsImpact: null,
  };

  rawSignal.components.entryContext =
    rawSignal.components.entryContext && typeof rawSignal.components.entryContext === 'object'
      ? { ...baseEntryContext, ...rawSignal.components.entryContext }
      : baseEntryContext;

  rawSignal.components.expectedMarketBehavior = {
    summary: 'Monitor confluence, spreads, and news impact before entry.',
    expectations: {
      marketPhase: null,
      volatilityState: null,
      confluenceScore: null,
      spreadPoints: null,
      newsImpact: null,
    },
  };

  rawSignal.components.invalidationRules = Array.isArray(rawSignal.components.invalidationRules)
    ? rawSignal.components.invalidationRules
    : [
        'Confluence drops below threshold',
        'Volatility shock or regime change',
        'Spread spike beyond acceptable range',
        'High-impact news event detected',
      ];

  try {
    const existingLayered =
      rawSignal.components?.layeredAnalysis &&
      Array.isArray(rawSignal.components.layeredAnalysis.layers) &&
      rawSignal.components.layeredAnalysis.layers.length > 0
        ? rawSignal.components.layeredAnalysis
        : rawSignal.layeredAnalysis &&
            Array.isArray(rawSignal.layeredAnalysis.layers) &&
            rawSignal.layeredAnalysis.layers.length > 0
          ? rawSignal.layeredAnalysis
          : null;

    let normalizedLayers;
    if (existingLayered) {
      const normalizedExisting = normalizeLayeredAnalysis(existingLayered.layers);
      normalizedLayers = { ...existingLayered, ...normalizedExisting };
    } else {
      const { quote: effectiveQuote } = getBestEffortQuote({
        eaBridgeService,
        broker,
        symbol,
        quoteMaxAgeMs,
        barFallback,
        now,
      });

      const barsCoverage = getBarsCoverage({ eaBridgeService, broker, symbol, now });

      const scenario = buildScenarioForLayeredAnalysis({
        rawSignal,
        symbol,
        effectiveQuote,
        barFallback,
        barsCoverage,
        now,
      });
      const layers = buildLayeredAnalysis({ scenario, signal: rawSignal });
      normalizedLayers = normalizeLayeredAnalysis(layers);
    }
    rawSignal.components.layeredAnalysis = normalizedLayers;

    const layerList = Array.isArray(normalizedLayers?.layers) ? normalizedLayers.layers : [];
    const getLayer = (key) =>
      layerList.find((layer) => String(layer?.key || '').toUpperCase() === key) || null;
    const layer1 = getLayer('L1');
    const layer2 = getLayer('L2');
    const layer7 = getLayer('L7');
    const layer8 = getLayer('L8');
    const layer14 = getLayer('L14');
    const layer17 = getLayer('L17');
    const layer20 = getLayer('L20');
    const confluenceScore =
      Number(layer17?.metrics?.confluenceWeighting?.weightedScore ?? layer17?.confidence) || null;
    const decisionState = layer20?.metrics?.decision?.state || getDecisionState(rawSignal) || null;
    const spreadPoints = toNumberOrNull(layer1?.metrics?.spreadPoints);
    const newsImpact =
      toNumberOrNull(layer14?.metrics?.news?.impact ?? layer14?.metrics?.newsImpactScore) ??
      toNumberOrNull(layer14?.score);
    const entryContext = {
      ...rawSignal.components.entryContext,
      timeframe:
        layer2?.metrics?.timeframeFocus ||
        layer1?.metrics?.timeframeFocus ||
        rawSignal?.components?.technical?.timeframe ||
        null,
      marketPhase: layer2?.metrics?.marketPhase || null,
      volatilityState: layer7?.metrics?.volatility?.state || null,
      session: layer8?.metrics?.session || null,
      confluenceScore,
      decisionState,
      spreadPoints,
      newsImpact,
    };
    rawSignal.components.entryContext = entryContext;

    const phaseLabel = entryContext.marketPhase || 'current';
    const volLabel = entryContext.volatilityState || 'current';
    rawSignal.components.expectedMarketBehavior = {
      summary: `Maintain ${phaseLabel} phase with ${volLabel} volatility; monitor confluence and spreads.`,
      expectations: {
        marketPhase: entryContext.marketPhase,
        volatilityState: entryContext.volatilityState,
        confluenceScore,
        spreadPoints,
        newsImpact,
      },
    };

    const invalidationRules = [
      confluenceScore != null
        ? `Confluence drops below ${Math.max(40, Math.round(confluenceScore) - 15)}`
        : 'Confluence drops below threshold',
      entryContext.volatilityState
        ? `Volatility shifts out of ${entryContext.volatilityState} regime`
        : 'Volatility shock or regime change',
      spreadPoints != null
        ? `Spread spikes above ${Math.max(30, Math.round(spreadPoints * 1.5))} pts`
        : 'Spread spike beyond acceptable range',
      entryContext.session ? `Session changes away from ${entryContext.session}` : null,
      newsImpact != null
        ? `High news impact (>=${Math.max(3, Math.round(newsImpact) + 1)})`
        : 'High-impact news event detected',
    ].filter(Boolean);
    rawSignal.components.invalidationRules = invalidationRules;

    const normalizedDecision = getNormalizedDecision(rawSignal);
    if (normalizedDecision) {
      rawSignal.components.normalizedDecision = normalizedDecision;
      if (rawSignal.isValid && typeof rawSignal.isValid === 'object') {
        const legacyDecision =
          rawSignal.isValid.decision && typeof rawSignal.isValid.decision === 'object'
            ? rawSignal.isValid.decision
            : {};
        rawSignal.isValid.decision = {
          ...legacyDecision,
          state: normalizedDecision.state,
          blocked: normalizedDecision.blocked,
          score:
            normalizedDecision.score != null
              ? normalizedDecision.score
              : (legacyDecision.score ?? null),
          missing:
            Array.isArray(normalizedDecision.missing) && normalizedDecision.missing.length
              ? normalizedDecision.missing
              : legacyDecision.missing || [],
          blockers:
            Array.isArray(normalizedDecision.blockers) && normalizedDecision.blockers.length
              ? normalizedDecision.blockers
              : legacyDecision.blockers || [],
          source: normalizedDecision.source,
        };
      }
    }
  } catch (error) {
    // best-effort; never block trading/analysis, but do surface why layers are missing.
    rawSignal.components.layeredAnalysis = rawSignal.components.layeredAnalysis || { layers: [] };
    rawSignal.components.layeredAnalysisError = {
      message: error?.message || 'layered analysis unavailable',
      name: error?.name || null,
      at: 'attachLayeredAnalysisToSignal',
    };
  }

  return rawSignal;
};

export const evaluateLayers18Readiness = ({
  layeredAnalysis,
  minConfluence,
  decisionStateFallback,
  allowStrongOverride: _allowStrongOverride = false,
  signal,
} = {}) => {
  const min = Number.isFinite(Number(minConfluence)) ? Number(minConfluence) : 60;
  const layers = Array.isArray(layeredAnalysis?.layers) ? layeredAnalysis.layers : [];

  const layer16 = layers.find((l) => String(l?.key || '').toUpperCase() === 'L16') || null;
  const layer17 = layers.find((l) => String(l?.key || '').toUpperCase() === 'L17') || null;
  const layer18 = layers.find((l) => String(l?.key || '').toUpperCase() === 'L18') || null;
  const layer20 = layers.find((l) => String(l?.key || '').toUpperCase() === 'L20') || null;

  const layer16Pass =
    Boolean(layer16?.metrics?.isTradeValid) ||
    String(layer16?.metrics?.verdict || '').toUpperCase() === 'PASS';

  const layer17Conf = Number(layer17?.confidence);
  const layer17Ok = Number.isFinite(layer17Conf) ? layer17Conf >= min : false;

  const layer18Verdict = String(layer18?.metrics?.verdict || '').toUpperCase();
  const layer18Pass = layer18Verdict === 'PASS';

  const layer20State = String(
    layer20?.metrics?.decision?.state || decisionStateFallback || getDecisionState(signal) || ''
  ).toUpperCase();

  // Canonical semantics:
  // - L16: risk/execution feasibility (must PASS)
  // - L17: confluence threshold (must PASS)
  // - L18: validation gate (PASS/BLOCK)
  // - L20: the only decision maker (ENTER/WAIT/BLOCK)
  const ok = layer16Pass && layer17Ok && layer18Pass && layer20State === 'ENTER';

  return {
    ok,
    layersCount: layers.length,
    layer16Pass,
    layer17Ok,
    layer18Verdict: layer18Verdict || null,
    layer18Pass,
    layer20State: layer20State || null,
  };
};
