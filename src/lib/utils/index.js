/**
 * Utility Functions Index
 * 
 * Centralized export of all utility functions
 * for easy importing throughout the codebase.
 */

export * as NumberUtils from './number-utils.js';
export * as EventUtils from './event-utils.js';
export * as PairUtils from './pair-utils.js';

// Re-export commonly used functions
export {
  toNumber,
  toPositiveNumber,
  toPercent,
  toPrice,
  isValidNumber,
  toAbsolute,
  roundTo,
  clamp,
  safeDivide,
} from './number-utils.js';

export {
  parseEventTimeMs,
  minutesUntilEvent,
  isUpcomingEvent,
  isHighImpact,
  shouldAvoidDueToNews,
} from './event-utils.js';

export {
  normalizeCurrency,
  splitFxPair,
  getAssetClass,
  isMajorPair,
  isJpyPair,
  formatPair,
  isValidPair,
} from './pair-utils.js';
