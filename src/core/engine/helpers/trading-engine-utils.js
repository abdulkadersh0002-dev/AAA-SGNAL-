/**
 * Trading Engine Utility Functions
 * Consolidates common operations used throughout the trading engine
 * Reduces code duplication and improves maintainability
 */

import {
  toNumber,
  toPositiveNumber,
  toPercent,
  toPrice,
  isValidNumber,
  safeDivide,
  percentChange,
  inRange,
  pipsToPrice,
  priceToPips,
} from '../../../lib/utils/number-utils.js';

import {
  parseEventTimeMs,
  minutesUntilEvent,
  isUpcomingEvent,
  isRecentEvent,
  parseImpactLevel,
  isHighImpact,
  filterByImpact,
  findUpcomingHighImpactEvents,
  shouldAvoidDueToNews,
  sortEventsByTime,
} from '../../../lib/utils/event-utils.js';

import {
  normalizeCurrency,
  splitFxPair,
  pairContainsCurrency,
  getAssetClass,
  isMajorPair,
  isCrossPair,
  isJpyPair,
  getPipDecimals,
  formatPair,
  getStandardLotSize,
  isValidPair,
} from '../../../lib/utils/pair-utils.js';

/**
 * Safely extract numeric value from an object
 * @param {Object} obj - Source object
 * @param {string} key - Key to extract
 * @param {number} fallback - Fallback value if invalid
 * @returns {number} Extracted number or fallback
 */
export function extractNumber(obj, key, fallback = null) {
  if (!obj || typeof obj !== 'object') {
    return fallback;
  }
  return toNumber(obj[key], fallback);
}

/**
 * Safely extract positive number from an object
 * @param {Object} obj - Source object
 * @param {string} key - Key to extract
 * @param {number} fallback - Fallback value if invalid
 * @returns {number} Extracted positive number or fallback
 */
export function extractPositiveNumber(obj, key, fallback = null) {
  if (!obj || typeof obj !== 'object') {
    return fallback;
  }
  return toPositiveNumber(obj[key], fallback);
}

/**
 * Safely extract price from an object
 * @param {Object} obj - Source object
 * @param {string} key - Key to extract
 * @param {number} decimals - Decimal places (default 5)
 * @param {number} fallback - Fallback value if invalid
 * @returns {number} Extracted price or fallback
 */
export function extractPrice(obj, key, decimals = 5, fallback = null) {
  if (!obj || typeof obj !== 'object') {
    return fallback;
  }
  return toPrice(obj[key], decimals, fallback);
}

/**
 * Safely extract percentage from an object
 * @param {Object} obj - Source object
 * @param {string} key - Key to extract
 * @param {number} fallback - Fallback value if invalid
 * @returns {number} Extracted percentage or fallback
 */
export function extractPercent(obj, key, fallback = null) {
  if (!obj || typeof obj !== 'object') {
    return fallback;
  }
  return toPercent(obj[key], fallback);
}

/**
 * Calculate spread in pips
 * @param {number} bid - Bid price
 * @param {number} ask - Ask price
 * @param {string} pair - Currency pair
 * @returns {number|null} Spread in pips or null if invalid
 */
export function calculateSpreadPips(bid, ask, pair) {
  if (!isValidNumber(bid) || !isValidNumber(ask) || !pair) {
    return null;
  }

  const spread = ask - bid;
  if (spread <= 0) {
    return null;
  }

  return priceToPips(spread, pair);
}

/**
 * Validate spread is within acceptable limits for asset class
 * @param {number} spreadPips - Spread in pips
 * @param {string} pair - Currency pair
 * @returns {Object} { valid: boolean, reason: string|null, maxSpread: number }
 */
export function validateSpread(spreadPips, pair) {
  if (!isValidNumber(spreadPips) || !pair) {
    return {
      valid: false,
      reason: 'Invalid spread or pair',
      maxSpread: null,
    };
  }

  const assetClass = getAssetClass(pair);
  let maxSpread;

  // Asset class specific spread limits
  switch (assetClass) {
    case 'forex':
      maxSpread = isMajorPair(pair) ? 3 : isCrossPair(pair) ? 5 : 8;
      break;
    case 'crypto':
      maxSpread = 50; // Crypto has higher spreads
      break;
    case 'commodity':
      maxSpread = 10;
      break;
    case 'index':
      maxSpread = 5;
      break;
    default:
      maxSpread = 5;
  }

  const valid = spreadPips <= maxSpread;
  const reason = valid
    ? null
    : `Spread ${spreadPips.toFixed(1)} pips exceeds maximum ${maxSpread} pips for ${assetClass}`;

  return { valid, reason, maxSpread };
}

/**
 * Calculate risk/reward ratio
 * @param {number} entry - Entry price
 * @param {number} stopLoss - Stop loss price
 * @param {number} takeProfit - Take profit price
 * @param {string} direction - 'buy' or 'sell'
 * @returns {number|null} R:R ratio or null if invalid
 */
export function calculateRiskRewardRatio(entry, stopLoss, takeProfit, direction) {
  if (!isValidNumber(entry) || !isValidNumber(stopLoss) || !isValidNumber(takeProfit)) {
    return null;
  }

  let risk, reward;

  if (direction === 'buy') {
    risk = entry - stopLoss;
    reward = takeProfit - entry;
  } else if (direction === 'sell') {
    risk = stopLoss - entry;
    reward = entry - takeProfit;
  } else {
    return null;
  }

  if (risk <= 0 || reward <= 0) {
    return null;
  }

  return safeDivide(reward, risk, null);
}

/**
 * Validate risk/reward ratio meets minimum requirement
 * @param {number} rrRatio - Risk/reward ratio
 * @param {number} minRR - Minimum required R:R (default 1.5)
 * @returns {Object} { valid: boolean, reason: string|null }
 */
export function validateRiskReward(rrRatio, minRR = 1.5) {
  if (!isValidNumber(rrRatio)) {
    return {
      valid: false,
      reason: 'Invalid risk/reward ratio',
    };
  }

  const valid = rrRatio >= minRR;
  const reason = valid ? null : `R:R ratio ${rrRatio.toFixed(2)} below minimum ${minRR.toFixed(2)}`;

  return { valid, reason };
}

/**
 * Check if signal should avoid trading due to upcoming news
 * @param {Array} newsEvents - Array of news events
 * @param {string} pair - Currency pair
 * @param {number} minutesBefore - Minutes before event to avoid (default 30)
 * @param {number} minutesAfter - Minutes after event to avoid (default 15)
 * @returns {Object} { shouldAvoid: boolean, reason: string|null, event: Object|null }
 */
export function checkNewsAvoidance(newsEvents, pair, minutesBefore = 30, minutesAfter = 15) {
  if (!Array.isArray(newsEvents) || newsEvents.length === 0 || !pair) {
    return { shouldAvoid: false, reason: null, event: null };
  }

  const result = shouldAvoidDueToNews(newsEvents, pair, minutesBefore, minutesAfter);

  return {
    shouldAvoid: result.shouldAvoid,
    reason: result.reason || null,
    event: result.event || null,
  };
}

/**
 * Normalize signal direction
 * @param {string} direction - Raw direction value
 * @returns {string|null} 'buy' or 'sell' or null
 */
export function normalizeDirection(direction) {
  if (!direction || typeof direction !== 'string') {
    return null;
  }

  const normalized = direction.toLowerCase().trim();
  if (normalized === 'buy' || normalized === 'long') {
    return 'buy';
  }
  if (normalized === 'sell' || normalized === 'short') {
    return 'sell';
  }

  return null;
}

/**
 * Validate required signal fields
 * @param {Object} signal - Signal object
 * @returns {Object} { valid: boolean, missingFields: Array, reason: string|null }
 */
export function validateSignalStructure(signal) {
  if (!signal || typeof signal !== 'object') {
    return {
      valid: false,
      missingFields: ['signal'],
      reason: 'Signal is null or not an object',
    };
  }

  const requiredFields = ['symbol', 'direction', 'entryPrice', 'stopLoss', 'takeProfit'];

  const missingFields = requiredFields.filter((field) => {
    const value = signal[field];
    if (field === 'direction') {
      return !normalizeDirection(value);
    }
    if (field === 'symbol') {
      return !value || typeof value !== 'string';
    }
    return !isValidNumber(value);
  });

  const valid = missingFields.length === 0;
  const reason = valid ? null : `Missing or invalid required fields: ${missingFields.join(', ')}`;

  return { valid, missingFields, reason };
}

/**
 * Calculate position size based on risk parameters
 * @param {Object} params - Parameters
 * @param {number} params.accountBalance - Account balance
 * @param {number} params.riskPercent - Risk percentage per trade (e.g., 1 for 1%)
 * @param {number} params.entry - Entry price
 * @param {number} params.stopLoss - Stop loss price
 * @param {string} params.pair - Currency pair
 * @returns {number|null} Position size in lots or null if invalid
 */
export function calculatePositionSize({ accountBalance, riskPercent, entry, stopLoss, pair }) {
  if (
    !isValidNumber(accountBalance) ||
    !isValidNumber(riskPercent) ||
    !isValidNumber(entry) ||
    !isValidNumber(stopLoss) ||
    !pair
  ) {
    return null;
  }

  // Calculate risk amount in account currency
  const riskAmount = (accountBalance * riskPercent) / 100;

  // Calculate stop distance in price
  const stopDistance = Math.abs(entry - stopLoss);
  if (stopDistance <= 0) {
    return null;
  }

  // Get standard lot size for pair
  const lotSize = getStandardLotSize(pair);

  // Calculate position size
  // positionSize = riskAmount / (stopDistance * lotSize)
  const positionSize = safeDivide(riskAmount, stopDistance * lotSize, null);

  // Ensure minimum and maximum lot sizes
  if (!positionSize || positionSize <= 0) {
    return null;
  }
  if (positionSize < 0.01) {
    return 0.01;
  } // Minimum lot size
  if (positionSize > 100) {
    return 100;
  } // Maximum lot size for safety

  // Round to 2 decimal places
  return Math.round(positionSize * 100) / 100;
}

/**
 * Extract snapshot data safely
 * @param {Object} snapshot - Snapshot object
 * @returns {Object} Extracted data with defaults
 */
export function extractSnapshotData(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      quote: null,
      bars: null,
      layers: null,
      signal: null,
      layeredAnalysis: null,
      layer18Ready: false,
      signalValid: false,
    };
  }

  return {
    quote: snapshot.quote || null,
    bars: snapshot.bars || null,
    layers: snapshot.layers || null,
    signal: snapshot.signal || null,
    layeredAnalysis: snapshot.layeredAnalysis || null,
    layer18Ready: snapshot.layer18Ready === true,
    signalValid: snapshot.signalValid === true,
  };
}

// Re-export utilities for convenience
export {
  // Number utilities
  toNumber,
  toPositiveNumber,
  toPercent,
  toPrice,
  isValidNumber,
  safeDivide,
  percentChange,
  inRange,
  pipsToPrice,
  priceToPips,
  // Event utilities
  parseEventTimeMs,
  minutesUntilEvent,
  isUpcomingEvent,
  isRecentEvent,
  parseImpactLevel,
  isHighImpact,
  filterByImpact,
  findUpcomingHighImpactEvents,
  shouldAvoidDueToNews,
  sortEventsByTime,
  // Pair utilities
  normalizeCurrency,
  splitFxPair,
  pairContainsCurrency,
  getAssetClass,
  isMajorPair,
  isCrossPair,
  isJpyPair,
  getPipDecimals,
  formatPair,
  getStandardLotSize,
  isValidPair,
};
