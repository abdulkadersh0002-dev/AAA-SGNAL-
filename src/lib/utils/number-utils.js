/**
 * Number Utilities
 * 
 * Provides clean, consistent number validation and conversion utilities
 * to reduce code noise and duplication throughout the codebase.
 * 
 * Replaces 400+ instances of: Number.isFinite(Number(x)) ? Number(x) : fallback
 */

/**
 * Safely convert value to number with fallback
 * @param {any} value - Value to convert
 * @param {number|null} fallback - Fallback value if conversion fails
 * @returns {number|null} Converted number or fallback
 */
export function toNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Convert to positive number
 * @param {any} value - Value to convert
 * @param {number|null} fallback - Fallback value
 * @returns {number|null} Positive number or fallback
 */
export function toPositiveNumber(value, fallback = null) {
  const num = toNumber(value, fallback);
  return num !== null && num > 0 ? num : fallback;
}

/**
 * Convert to percentage (0-100)
 * @param {any} value - Value to convert
 * @param {number|null} fallback - Fallback value
 * @returns {number|null} Percentage or fallback
 */
export function toPercent(value, fallback = null) {
  const num = toNumber(value, fallback);
  if (num === null) return fallback;
  return Math.max(0, Math.min(100, num));
}

/**
 * Convert to price (positive with decimals)
 * @param {any} value - Value to convert
 * @param {number} decimals - Decimal places
 * @param {number|null} fallback - Fallback value
 * @returns {number|null} Price or fallback
 */
export function toPrice(value, decimals = 5, fallback = null) {
  const num = toNumber(value, fallback);
  if (num === null || num < 0) return fallback;
  return Number(num.toFixed(decimals));
}

/**
 * Check if value is a valid finite number
 * @param {any} value - Value to check
 * @returns {boolean} True if valid number
 */
export function isValidNumber(value) {
  return Number.isFinite(Number(value));
}

/**
 * Get absolute value safely
 * @param {any} value - Value to process
 * @param {number|null} fallback - Fallback value
 * @returns {number|null} Absolute value or fallback
 */
export function toAbsolute(value, fallback = null) {
  const num = toNumber(value, fallback);
  return num !== null ? Math.abs(num) : fallback;
}

/**
 * Round to decimal places
 * @param {any} value - Value to round
 * @param {number} decimals - Decimal places
 * @param {number|null} fallback - Fallback value
 * @returns {number|null} Rounded number or fallback
 */
export function roundTo(value, decimals = 2, fallback = null) {
  const num = toNumber(value, fallback);
  if (num === null) return fallback;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Clamp number between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  const num = toNumber(value, min);
  return Math.max(min, Math.min(max, num));
}

/**
 * Safe division with fallback
 * @param {any} numerator - Numerator
 * @param {any} denominator - Denominator
 * @param {number|null} fallback - Fallback value
 * @returns {number|null} Result or fallback
 */
export function safeDivide(numerator, denominator, fallback = null) {
  const num = toNumber(numerator);
  const den = toNumber(denominator);
  
  if (num === null || den === null || den === 0) {
    return fallback;
  }
  
  const result = num / den;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Calculate percentage change
 * @param {number} oldValue - Old value
 * @param {number} newValue - New value
 * @param {number|null} fallback - Fallback value
 * @returns {number|null} Percentage change or fallback
 */
export function percentChange(oldValue, newValue, fallback = null) {
  const old = toNumber(oldValue);
  const newVal = toNumber(newValue);
  
  if (old === null || newVal === null || old === 0) {
    return fallback;
  }
  
  return ((newVal - old) / old) * 100;
}

/**
 * Check if number is within range (inclusive)
 * @param {number} value - Value to check
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if within range
 */
export function inRange(value, min, max) {
  const num = toNumber(value);
  return num !== null && num >= min && num <= max;
}

/**
 * Convert pips to price for forex pairs
 * @param {number} pips - Number of pips
 * @param {string} pair - Currency pair
 * @returns {number} Price equivalent
 */
export function pipsToPrice(pips, pair) {
  const numPips = toNumber(pips, 0);
  
  // JPY pairs use 2 decimal places (1 pip = 0.01)
  if (pair && (pair.includes('JPY') || pair.includes('jpy'))) {
    return numPips * 0.01;
  }
  
  // Most pairs use 4-5 decimal places (1 pip = 0.0001)
  return numPips * 0.0001;
}

/**
 * Convert price to pips for forex pairs
 * @param {number} price - Price difference
 * @param {string} pair - Currency pair
 * @returns {number} Number of pips
 */
export function priceToPips(price, pair) {
  const numPrice = toNumber(price, 0);
  
  // JPY pairs
  if (pair && (pair.includes('JPY') || pair.includes('jpy'))) {
    return numPrice / 0.01;
  }
  
  // Most pairs
  return numPrice / 0.0001;
}

export default {
  toNumber,
  toPositiveNumber,
  toPercent,
  toPrice,
  isValidNumber,
  toAbsolute,
  roundTo,
  clamp,
  safeDivide,
  percentChange,
  inRange,
  pipsToPrice,
  priceToPips,
};
