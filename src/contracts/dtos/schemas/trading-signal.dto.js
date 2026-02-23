import { z } from 'zod';

const normalizeDecisionState = (value) => {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'ENTER') {
    return 'ENTER';
  }
  if (normalized === 'WAIT' || normalized === 'WAIT_MONITOR') {
    return 'WAIT_MONITOR';
  }
  if (normalized === 'NO_TRADE_BLOCKED' || normalized === 'NO_TRADE' || normalized === 'BLOCKED') {
    return 'NO_TRADE_BLOCKED';
  }
  return undefined;
};

/**
 * @typedef {Object} TradingSignalDTO
 * @property {string|null|undefined} broker
 * @property {string} pair
 * @property {number} timestamp
 * @property {number|null|undefined} expiresAt
 * @property {string|null|undefined} signalStatus
 * @property {string|null|undefined} timeframe
 * @property {{ state?: string, expiresAt?: (number|null), ttlMs?: (number|null), evaluatedAt?: (number|null), reason?: (string|null) }|null|undefined} validity
 * @property {('BUY'|'SELL'|'NEUTRAL')} direction
 * @property {number} strength
 * @property {number} confidence
 * @property {number|null|undefined} winRate
 * @property {number} finalScore
 * @property {Object} components
 * @property {Object|null} entry
 * @property {Object} riskManagement
 * @property {{ isValid: boolean, checks: Object<string, boolean>, reason: string }} isValid
 * @property {Object|null} explainability
 * @property {string[]|null} reasoning
 * @property {{ action: ('BUY'|'SELL'|'NEUTRAL'), reason: (string|null), reasons: string[], tradeValid: (boolean|null) }|null|undefined} finalDecision
 */

export const TradingSignalSchema = z
  .object({
    broker: z.string().nullable().optional(),
    pair: z.string(),
    timestamp: z.number(),
    expiresAt: z.number().nullable().optional(),
    signalStatus: z.string().nullable().optional(),
    timeframe: z.string().nullable().optional(),
    validity: z
      .object({
        state: z.string().optional(),
        expiresAt: z.number().nullable().optional(),
        ttlMs: z.number().nullable().optional(),
        evaluatedAt: z.number().nullable().optional(),
        reason: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    direction: z.enum(['BUY', 'SELL', 'NEUTRAL']),
    strength: z.number(),
    confidence: z.number(),
    winRate: z.number().nullable().optional(),
    finalScore: z.number(),
    finalDecision: z
      .object({
        action: z.enum(['BUY', 'SELL', 'NEUTRAL']),
        reason: z.string().nullable().optional(),
        reasons: z.array(z.string()).optional(),
        tradeValid: z.boolean().nullable().optional(),
      })
      .nullable()
      .optional(),
    components: z.record(z.unknown()),
    entry: z.unknown().nullable(),
    riskManagement: z.record(z.unknown()),
    isValid: z.object({
      isValid: z.boolean(),
      checks: z.record(z.boolean()),
      reason: z.string(),
      decision: z
        .object({
          state: z.enum(['ENTER', 'WAIT_MONITOR', 'NO_TRADE_BLOCKED']).optional(),
          blocked: z.boolean().optional(),
          score: z.number().optional(),
          assetClass: z.string().optional(),
          category: z.string().optional(),
          blockedReason: z.string().nullable().optional(),
          blockedReasons: z
            .array(
              z.object({
                code: z.string(),
                key: z.string().optional(),
                message: z.string().optional(),
                meta: z.record(z.unknown()).optional(),
              })
            )
            .optional(),
          killSwitch: z
            .object({
              enabled: z.boolean().optional(),
              blocked: z.boolean().optional(),
              ids: z.array(z.string()).optional(),
              items: z
                .array(
                  z.object({
                    id: z.string(),
                    label: z.string().nullable().optional(),
                    reason: z.string().nullable().optional(),
                    weight: z.number().nullable().optional(),
                  })
                )
                .optional(),
            })
            .nullable()
            .optional(),
          blockers: z.array(z.string()).optional(),
          missing: z.array(z.string()).optional(),
          whatWouldChange: z.array(z.string()).optional(),
          missingInputs: z
            .object({
              missing: z.array(z.string()).optional(),
              details: z.record(z.unknown()).optional(),
            })
            .optional(),
          nextSteps: z.array(z.string()).optional(),
          contributors: z.record(z.unknown()).optional(),
          modifiers: z.record(z.unknown()).optional(),
          context: z.record(z.unknown()).optional(),
          profile: z
            .object({
              enterScore: z.number().optional(),
              minStrength: z.number().optional(),
              minWinRate: z.number().optional(),
              minConfidence: z.number().optional(),
            })
            .optional(),
        })
        .optional(),
    }),
    explainability: z.unknown().nullable(),
    reasoning: z.array(z.string()).nullable().optional(),
  })
  .strict();

export function createTradingSignalDTO(raw) {
  if (!raw) {
    return {
      broker: null,
      pair: '',
      timestamp: Date.now(),
      expiresAt: null,
      signalStatus: null,
      timeframe: null,
      validity: null,
      direction: 'NEUTRAL',
      strength: 0,
      confidence: 0,
      winRate: null,
      finalScore: 0,
      finalDecision: null,
      components: {},
      entry: null,
      riskManagement: {},
      isValid: { isValid: false, checks: {}, reason: 'Empty signal' },
      explainability: null,
      reasoning: null,
    };
  }

  const winRate = (() => {
    const direct = raw.estimatedWinRate;
    if (Number.isFinite(Number(direct))) {
      return Number(direct);
    }
    const alt = raw.winRate;
    if (Number.isFinite(Number(alt))) {
      return Number(alt);
    }
    const adv = raw.components?.advancedFilter?.metrics?.winRate;
    if (Number.isFinite(Number(adv))) {
      return Number(adv);
    }
    return null;
  })();

  const timeframe = (() => {
    const direct = raw.timeframe ?? raw.meta?.timeframe;
    if (direct != null && String(direct).trim()) {
      return String(direct);
    }
    const technicalTf = raw.components?.technical?.signals?.[0]?.timeframe;
    if (technicalTf != null && String(technicalTf).trim()) {
      return String(technicalTf);
    }
    return null;
  })();

  const layeredDecisionFallback = (() => {
    const layers = raw?.components?.layeredAnalysis?.layers;
    if (!Array.isArray(layers) || layers.length === 0) {
      return null;
    }

    for (const layer of layers) {
      const decision = layer?.metrics?.decision;
      if (!decision || typeof decision !== 'object') {
        continue;
      }
      const state = decision?.state != null ? String(decision.state).trim() : '';
      if (!state) {
        continue;
      }
      const direction = layer?.metrics?.direction != null ? String(layer.metrics.direction) : null;
      const confidence = layer?.metrics?.confidence ?? layer?.confidence ?? null;
      return {
        state: normalizeDecisionState(state),
        score: Number.isFinite(Number(decision?.score)) ? Number(decision.score) : null,
        blocked: decision?.blocked === true,
        missing: Array.isArray(decision?.missing) ? decision.missing.map((v) => String(v)) : null,
        whatWouldChange: Array.isArray(decision?.whatWouldChange)
          ? decision.whatWouldChange.map((v) => String(v))
          : null,
        missingInputs:
          decision?.missingInputs && typeof decision.missingInputs === 'object'
            ? decision.missingInputs
            : null,
        nextSteps: Array.isArray(decision?.nextSteps)
          ? decision.nextSteps.map((v) => String(v))
          : null,
        killSwitch:
          decision?.killSwitch && typeof decision.killSwitch === 'object'
            ? decision.killSwitch
            : null,
        direction: direction != null ? String(direction).trim().toUpperCase() : null,
        confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : null,
      };
    }

    return null;
  })();

  const technicalPrimary = raw?.components?.technical?.signals?.[0] || null;
  const directionFallback =
    layeredDecisionFallback?.direction ||
    raw?.finalDecision?.action ||
    technicalPrimary?.direction ||
    null;
  const normalizedDirection = (() => {
    const dir = String(raw?.direction || directionFallback || 'NEUTRAL')
      .trim()
      .toUpperCase();
    return dir === 'BUY' || dir === 'SELL' ? dir : 'NEUTRAL';
  })();

  const strengthFallback =
    raw?.components?.technical?.strength ??
    technicalPrimary?.strength ??
    raw?.components?.technical?.signals?.[0]?.strength ??
    (Number.isFinite(Number(raw?.finalScore))
      ? Math.min(100, Math.abs(Number(raw.finalScore)))
      : null) ??
    null;
  const confidenceFallback =
    raw?.components?.technical?.confidence ??
    technicalPrimary?.confidence ??
    layeredDecisionFallback?.confidence ??
    null;

  return {
    broker: raw.broker || null,
    pair: String(raw.pair || ''),
    timestamp: Number.isFinite(raw.timestamp) ? raw.timestamp : Date.now(),
    expiresAt: Number.isFinite(Number(raw.expiresAt)) ? Number(raw.expiresAt) : null,
    signalStatus: raw.signalStatus != null ? String(raw.signalStatus) : null,
    timeframe,
    validity:
      raw.validity && typeof raw.validity === 'object'
        ? {
            state: raw.validity.state != null ? String(raw.validity.state) : undefined,
            expiresAt:
              raw.validity.expiresAt == null || !Number.isFinite(Number(raw.validity.expiresAt))
                ? null
                : Number(raw.validity.expiresAt),
            ttlMs:
              raw.validity.ttlMs == null || !Number.isFinite(Number(raw.validity.ttlMs))
                ? null
                : Number(raw.validity.ttlMs),
            evaluatedAt:
              raw.validity.evaluatedAt == null || !Number.isFinite(Number(raw.validity.evaluatedAt))
                ? null
                : Number(raw.validity.evaluatedAt),
            reason: raw.validity.reason != null ? String(raw.validity.reason) : null,
          }
        : null,
    direction: normalizedDirection,
    strength: Number.isFinite(Number(raw.strength))
      ? Number(raw.strength)
      : Number.isFinite(Number(strengthFallback))
        ? Number(strengthFallback)
        : 0,
    confidence: Number.isFinite(Number(raw.confidence))
      ? Number(raw.confidence)
      : Number.isFinite(Number(confidenceFallback))
        ? Number(confidenceFallback)
        : 0,
    winRate,
    finalScore: Number(raw.finalScore) || 0,
    finalDecision:
      raw.finalDecision && typeof raw.finalDecision === 'object'
        ? {
            action: raw.finalDecision.action || raw.direction || 'NEUTRAL',
            reason:
              raw.finalDecision.reason != null
                ? String(raw.finalDecision.reason)
                : raw.isValid?.reason || null,
            reasons: Array.isArray(raw.finalDecision.reasons)
              ? raw.finalDecision.reasons.map((r) => String(r)).slice(0, 6)
              : [],
            tradeValid:
              raw.finalDecision.tradeValid === null || raw.finalDecision.tradeValid === undefined
                ? null
                : Boolean(raw.finalDecision.tradeValid),
          }
        : null,
    components: raw.components || {},
    entry: raw.entry ?? null,
    riskManagement: raw.riskManagement || {},
    // Normalize validation structure to ensure downstream Zod schema only sees booleans
    // even when upstream signal builders hand back null/undefined states.
    isValid: {
      isValid: Boolean(raw.isValid?.isValid),
      checks: (() => {
        const checks = raw.isValid?.checks || {};
        if (typeof checks !== 'object' || checks === null) {
          return {};
        }
        return Object.fromEntries(
          Object.entries(checks).map(([key, value]) => [
            key,
            value === null ? false : Boolean(value),
          ])
        );
      })(),
      reason: raw.isValid?.reason || 'Unspecified',
      decision:
        raw.isValid?.decision && typeof raw.isValid.decision === 'object'
          ? {
              state: normalizeDecisionState(
                raw.isValid.decision.state || layeredDecisionFallback?.state
              ),
              blocked:
                raw.isValid.decision.blocked === undefined
                  ? undefined
                  : Boolean(raw.isValid.decision.blocked),
              score: Number.isFinite(Number(raw.isValid.decision.score))
                ? Number(raw.isValid.decision.score)
                : undefined,
              assetClass: raw.isValid.decision.assetClass || undefined,
              category: raw.isValid.decision.category || undefined,
              blockedReason:
                raw.isValid.decision.blockedReason === null ||
                raw.isValid.decision.blockedReason === undefined
                  ? undefined
                  : String(raw.isValid.decision.blockedReason),
              blockedReasons: Array.isArray(raw.isValid.decision.blockedReasons)
                ? raw.isValid.decision.blockedReasons
                    .map((r) =>
                      r && typeof r === 'object'
                        ? {
                            code: String(r.code || ''),
                            key: r.key == null ? undefined : String(r.key),
                            message: r.message == null ? undefined : String(r.message),
                            meta:
                              r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)
                                ? r.meta
                                : undefined,
                          }
                        : null
                    )
                    .filter((r) => r && r.code)
                    .slice(0, 10)
                : undefined,
              blockers: Array.isArray(raw.isValid.decision.blockers)
                ? raw.isValid.decision.blockers.map((v) => String(v)).slice(0, 10)
                : undefined,
              missing: Array.isArray(raw.isValid.decision.missing)
                ? raw.isValid.decision.missing.map((v) => String(v)).slice(0, 12)
                : layeredDecisionFallback?.missing
                  ? layeredDecisionFallback.missing.slice(0, 12)
                  : undefined,
              whatWouldChange: Array.isArray(raw.isValid.decision.whatWouldChange)
                ? raw.isValid.decision.whatWouldChange.map((v) => String(v)).slice(0, 12)
                : layeredDecisionFallback?.whatWouldChange
                  ? layeredDecisionFallback.whatWouldChange.slice(0, 12)
                  : undefined,
              contributors:
                raw.isValid.decision.contributors &&
                typeof raw.isValid.decision.contributors === 'object'
                  ? raw.isValid.decision.contributors
                  : undefined,
              modifiers:
                raw.isValid.decision.modifiers && typeof raw.isValid.decision.modifiers === 'object'
                  ? raw.isValid.decision.modifiers
                  : undefined,
              context:
                raw.isValid.decision.context && typeof raw.isValid.decision.context === 'object'
                  ? raw.isValid.decision.context
                  : undefined,
              profile:
                raw.isValid.decision.profile && typeof raw.isValid.decision.profile === 'object'
                  ? {
                      enterScore: Number.isFinite(Number(raw.isValid.decision.profile.enterScore))
                        ? Number(raw.isValid.decision.profile.enterScore)
                        : undefined,
                      minStrength: Number.isFinite(Number(raw.isValid.decision.profile.minStrength))
                        ? Number(raw.isValid.decision.profile.minStrength)
                        : undefined,
                      minWinRate: Number.isFinite(Number(raw.isValid.decision.profile.minWinRate))
                        ? Number(raw.isValid.decision.profile.minWinRate)
                        : undefined,
                      minConfidence: Number.isFinite(
                        Number(raw.isValid.decision.profile.minConfidence)
                      )
                        ? Number(raw.isValid.decision.profile.minConfidence)
                        : undefined,
                    }
                  : undefined,
            }
          : layeredDecisionFallback
            ? {
                state: normalizeDecisionState(layeredDecisionFallback.state),
                blocked: layeredDecisionFallback.blocked,
                score: layeredDecisionFallback.score ?? undefined,
                missing: layeredDecisionFallback.missing
                  ? layeredDecisionFallback.missing.slice(0, 12)
                  : undefined,
                whatWouldChange: layeredDecisionFallback.whatWouldChange
                  ? layeredDecisionFallback.whatWouldChange.slice(0, 12)
                  : undefined,
                missingInputs:
                  layeredDecisionFallback.missingInputs &&
                  typeof layeredDecisionFallback.missingInputs === 'object'
                    ? layeredDecisionFallback.missingInputs
                    : undefined,
                nextSteps: layeredDecisionFallback.nextSteps
                  ? layeredDecisionFallback.nextSteps.slice(0, 10)
                  : undefined,
                killSwitch:
                  layeredDecisionFallback.killSwitch &&
                  typeof layeredDecisionFallback.killSwitch === 'object'
                    ? layeredDecisionFallback.killSwitch
                    : undefined,
              }
            : undefined,
    },
    explainability: raw.explainability ?? null,
    reasoning: Array.isArray(raw.reasoning) ? raw.reasoning : null,
  };
}

export function validateTradingSignalDTO(dto) {
  return TradingSignalSchema.parse(dto);
}
