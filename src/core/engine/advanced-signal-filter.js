import { getPairMetadata } from '../../config/pair-catalog.js';

const DEFAULTS = {
  minWinRate: 62,
  minRiskReward: 1.6,
  minConfidence: 55,
  minStrength: 30,
  minDataQualityScore: 70,
  maxSpreadPipsFx: 4.2,
  maxSpreadPipsMetals: 6,
  maxSpreadPipsCrypto: 25,
  maxSpreadRelative: 0.003,
  maxNewsImpact: 70,
};

const toNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const resolveNumberEnv = (value, fallback) => {
  const num = toNumber(value);
  return Number.isFinite(num) ? num : fallback;
};

const resolveBoolean = (value) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) {
    return false;
  }
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const resolveNewsWindowMinutes = () => {
  const explicit = resolveNumberEnv(process.env.ADVANCED_SIGNAL_NEWS_WINDOW_MINUTES, null);
  if (Number.isFinite(explicit)) {
    return Math.max(0, explicit);
  }
  const fallback = resolveNumberEnv(process.env.AUTO_TRADING_NEWS_BLACKOUT_MINUTES, null);
  if (Number.isFinite(fallback)) {
    return Math.max(0, fallback);
  }
  return 30;
};

const parseNewsEventTime = (evt) => {
  if (!evt) {
    return null;
  }
  if (typeof evt === 'string') {
    const tsMatch = evt.match(/timestamp=([0-9]+)/i);
    if (tsMatch) {
      const ts = Number(tsMatch[1]);
      return Number.isFinite(ts) ? ts : null;
    }
    const timeMatch = evt.match(/time=([^;]+)/i);
    if (timeMatch) {
      const parsed = Date.parse(String(timeMatch[1]).trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  const raw = evt?.timestamp ?? evt?.time ?? evt?.date ?? null;
  if (raw == null) {
    return null;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNewsEventImpact = (evt) => {
  if (!evt) {
    return null;
  }
  if (typeof evt === 'string') {
    const impactMatch = evt.match(/impact=([0-9.]+)/i);
    if (!impactMatch) {
      return null;
    }
    const impact = Number(impactMatch[1]);
    return Number.isFinite(impact) ? impact : null;
  }
  const impact = Number(evt?.impact);
  return Number.isFinite(impact) ? impact : null;
};

export class AdvancedSignalFilter {
  constructor(options = {}) {
    this.options = {
      ...DEFAULTS,
      ...(options || {}),
    };
  }

  resolveThresholds({ assetClass, marketData }) {
    const envMinWinRate = resolveNumberEnv(process.env.ADVANCED_SIGNAL_MIN_WIN_RATE, null);
    const envMinRiskReward = resolveNumberEnv(process.env.ADVANCED_SIGNAL_MIN_RISK_REWARD, null);
    const envMinConfidence = resolveNumberEnv(process.env.ADVANCED_SIGNAL_MIN_CONFIDENCE, null);
    const envMinStrength = resolveNumberEnv(process.env.ADVANCED_SIGNAL_MIN_STRENGTH, null);
    const envMinDqScore = resolveNumberEnv(process.env.ADVANCED_SIGNAL_MIN_DATA_QUALITY, null);
    const envMaxNewsImpact = resolveNumberEnv(process.env.ADVANCED_SIGNAL_MAX_NEWS_IMPACT, null);
    const envMaxSpreadFx = resolveNumberEnv(process.env.ADVANCED_SIGNAL_MAX_SPREAD_PIPS_FX, null);
    const envMaxSpreadMetals = resolveNumberEnv(
      process.env.ADVANCED_SIGNAL_MAX_SPREAD_PIPS_METALS,
      null
    );
    const envMaxSpreadCrypto = resolveNumberEnv(
      process.env.ADVANCED_SIGNAL_MAX_SPREAD_PIPS_CRYPTO,
      null
    );
    const envMaxSpreadRelative = resolveNumberEnv(
      process.env.ADVANCED_SIGNAL_MAX_SPREAD_RELATIVE,
      null
    );

    const maxSpreadPips = Number.isFinite(Number(marketData?.maxSpreadPips))
      ? Number(marketData.maxSpreadPips)
      : assetClass === 'crypto'
        ? resolveNumberEnv(envMaxSpreadCrypto, this.options.maxSpreadPipsCrypto)
        : assetClass === 'metals'
          ? resolveNumberEnv(envMaxSpreadMetals, this.options.maxSpreadPipsMetals)
          : resolveNumberEnv(envMaxSpreadFx, this.options.maxSpreadPipsFx);

    const maxSpreadRelative = Number.isFinite(Number(marketData?.maxSpreadRelative))
      ? Number(marketData.maxSpreadRelative)
      : resolveNumberEnv(envMaxSpreadRelative, this.options.maxSpreadRelative);

    return {
      maxSpreadPips,
      maxSpreadRelative,
      minWinRate: resolveNumberEnv(envMinWinRate, this.options.minWinRate),
      minRiskReward: resolveNumberEnv(envMinRiskReward, this.options.minRiskReward),
      minConfidence: resolveNumberEnv(envMinConfidence, this.options.minConfidence),
      minStrength: resolveNumberEnv(envMinStrength, this.options.minStrength),
      minDataQualityScore: resolveNumberEnv(envMinDqScore, this.options.minDataQualityScore),
      maxNewsImpact: resolveNumberEnv(envMaxNewsImpact, this.options.maxNewsImpact),
    };
  }

  async filterSignal(signal, pair, marketData = {}) {
    const reasons = [];
    const metadata = getPairMetadata(pair);
    const assetClass = metadata?.assetClass || null;
    const thresholds = this.resolveThresholds({ assetClass, marketData });

    const strength = toNumber(signal?.strength) ?? 0;
    const confidence = toNumber(signal?.confidence) ?? 0;
    const winRate = toNumber(signal?.estimatedWinRate) ?? 0;
    const direction = String(signal?.direction || '')
      .trim()
      .toUpperCase();
    const riskReward = toNumber(signal?.entry?.riskReward);

    if (winRate < thresholds.minWinRate) {
      reasons.push(`win_rate_below_${thresholds.minWinRate}`);
    }

    if (riskReward != null && riskReward < thresholds.minRiskReward) {
      reasons.push(`risk_reward_below_${thresholds.minRiskReward}`);
    }

    if (strength < thresholds.minStrength) {
      reasons.push(`strength_below_${thresholds.minStrength}`);
    }

    if (!direction || direction === 'NEUTRAL') {
      reasons.push('direction_missing');
    }

    const spreadPips = toNumber(marketData?.spreadPips);
    const bid = toNumber(marketData?.eaQuote?.bid);
    const ask = toNumber(marketData?.eaQuote?.ask);
    const mid =
      Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
    const spreadRelative =
      Number.isFinite(mid) && mid > 0 && Number.isFinite(bid) && Number.isFinite(ask)
        ? Math.abs(ask - bid) / mid
        : null;

    const isFxLike = assetClass === 'forex' || assetClass === 'metals' || assetClass === 'crypto';
    if (isFxLike) {
      if (spreadPips != null && spreadPips > thresholds.maxSpreadPips) {
        reasons.push('spread_too_wide');
      }
    } else if (spreadRelative != null && spreadRelative > thresholds.maxSpreadRelative) {
      reasons.push('spread_relative_too_wide');
    }

    const dqScore = toNumber(marketData?.score);
    if (dqScore != null && dqScore < thresholds.minDataQualityScore) {
      reasons.push(`data_quality_below_${thresholds.minDataQualityScore}`);
    }

    const dqStatus = String(marketData?.status || '').toLowerCase();
    const dqRecommendation = String(marketData?.recommendation || '').toLowerCase();
    if (marketData?.circuitBreaker || dqRecommendation === 'block' || dqStatus === 'critical') {
      reasons.push('data_quality_blocked');
    }

    if (marketData?.stale === true) {
      reasons.push('market_data_stale');
    }

    const newsImpact = toNumber(signal?.components?.news?.impact) ?? 0;
    const upcomingEvents = toNumber(signal?.components?.news?.upcomingEvents) ?? 0;
    const calendarEvents = Array.isArray(signal?.components?.news?.calendarEvents)
      ? signal.components.news.calendarEvents
      : [];
    const newsWindowMinutes = resolveNewsWindowMinutes();
    const newsWindowMs = newsWindowMinutes * 60 * 1000;
    let highImpactNearEvents = 0;
    if (calendarEvents.length > 0 && newsWindowMs > 0) {
      const now = Date.now();
      for (const evt of calendarEvents) {
        const impact = parseNewsEventImpact(evt);
        if (impact == null || impact < thresholds.maxNewsImpact) {
          continue;
        }
        const when = parseNewsEventTime(evt);
        if (when == null) {
          continue;
        }
        if (Math.abs(when - now) <= newsWindowMs) {
          highImpactNearEvents += 1;
        }
      }
    }
    const hasHighImpactNear =
      calendarEvents.length > 0 ? highImpactNearEvents > 0 : upcomingEvents > 0;
    if (newsImpact >= thresholds.maxNewsImpact && hasHighImpactNear) {
      reasons.push('high_impact_news_near');
    }

    const enabled = resolveBoolean(process.env.ADVANCED_SIGNAL_FILTER_ENABLED);

    const winRateOk = winRate >= thresholds.minWinRate;
    const strengthOk = strength >= thresholds.minStrength;
    const directionOk = direction && direction !== 'NEUTRAL';

    const executionCostReasons = new Set(['spread_too_wide', 'spread_relative_too_wide']);
    const coreReasons = new Set([
      `win_rate_below_${thresholds.minWinRate}`,
      `strength_below_${thresholds.minStrength}`,
      'direction_missing',
    ]);
    const nonExecutionReasons = reasons.filter((reason) => !executionCostReasons.has(reason));
    const nonCoreReasons = nonExecutionReasons.filter((reason) => !coreReasons.has(reason));

    const relaxCore = directionOk && (strengthOk || winRateOk) && nonCoreReasons.length === 0;
    const finalReasons = relaxCore ? [] : nonExecutionReasons;

    return {
      passed: enabled ? (relaxCore ? true : finalReasons.length === 0) : true,
      reasons: finalReasons,
      thresholds,
      metrics: {
        strength,
        confidence,
        winRate,
        riskReward,
        spreadPips,
        spreadRelative,
        dataQualityScore: dqScore,
        dataQualityStatus: dqStatus || null,
        dataQualityRecommendation: dqRecommendation || null,
        newsImpact,
        upcomingEvents,
        newsWindowMinutes,
        highImpactNearEvents,
        assetClass,
      },
    };
  }
}
