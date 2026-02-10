/**
 * Currency Pair Utilities
 * 
 * Provides utilities for parsing, normalizing, and categorizing
 * currency pairs and other trading instruments.
 * 
 * Consolidates duplicate pair handling logic found throughout the codebase.
 */

/**
 * Normalize currency code to uppercase
 * @param {string} currency - Currency code
 * @returns {string} Normalized currency code
 */
export function normalizeCurrency(currency) {
  if (!currency || typeof currency !== 'string') return '';
  return currency.toUpperCase().trim();
}

/**
 * Split forex pair into base and quote currencies
 * Handles various formats: EURUSD, EUR/USD, EUR_USD, etc.
 * 
 * @param {string} pair - Currency pair
 * @returns {Object} { base: string, quote: string, valid: boolean }
 */
export function splitFxPair(pair) {
  if (!pair || typeof pair !== 'string') {
    return { base: '', quote: '', valid: false };
  }

  // Remove separators and normalize
  const normalized = pair.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Extract 3-letter currencies (most common)
  const match = normalized.match(/^([A-Z]{3})([A-Z]{3})$/);
  
  if (match) {
    return {
      base: match[1],
      quote: match[2],
      valid: true,
    };
  }

  // Handle special cases (e.g., XAUUSD = gold)
  const specialMatch = normalized.match(/^([A-Z]{3,4})([A-Z]{3})$/);
  if (specialMatch) {
    return {
      base: specialMatch[1],
      quote: specialMatch[2],
      valid: true,
    };
  }

  return { base: '', quote: '', valid: false };
}

/**
 * Check if pair contains a specific currency
 * @param {string} pair - Currency pair
 * @param {string} currency - Currency to check
 * @returns {boolean} True if pair contains currency
 */
export function pairContainsCurrency(pair, currency) {
  const { base, quote, valid } = splitFxPair(pair);
  if (!valid) return false;

  const currencyUpper = normalizeCurrency(currency);
  return base === currencyUpper || quote === currencyUpper;
}

/**
 * Determine asset class/category for a pair
 * @param {string} pair - Trading pair/symbol
 * @returns {string} Asset class (forex, crypto, commodity, index, stock, bond, unknown)
 */
export function getAssetClass(pair) {
  if (!pair || typeof pair !== 'string') return 'unknown';

  const normalized = pair.toUpperCase().trim();

  // Forex pairs (6-7 characters, currency codes)
  const forexPattern = /^[A-Z]{6,7}$/;
  const { valid: isFxPair } = splitFxPair(normalized);
  if (isFxPair && forexPattern.test(normalized)) {
    return 'forex';
  }

  // Cryptocurrency
  if (normalized.includes('BTC') || normalized.includes('ETH') || 
      normalized.includes('USDT') || normalized.includes('BUSD') ||
      normalized.match(/^[A-Z]+USDT?$/)) {
    return 'crypto';
  }

  // Commodities
  if (normalized.includes('XAU') || normalized.includes('XAG') || // Gold, Silver
      normalized.includes('OIL') || normalized.includes('WTI') || 
      normalized.includes('BRENT') || normalized.includes('GAS')) {
    return 'commodity';
  }

  // Indices
  if (normalized.includes('SPX') || normalized.includes('NDX') ||
      normalized.includes('DJI') || normalized.includes('DAX') ||
      normalized.includes('FTSE') || normalized.includes('NIK') ||
      normalized.match(/^[A-Z]+\d{2,}$/)) { // e.g., US30, NAS100
    return 'index';
  }

  // Bonds
  if (normalized.includes('BOND') || normalized.includes('YIELD') ||
      normalized.match(/^[A-Z]{2}\d{2}Y$/)) { // e.g., US10Y
    return 'bond';
  }

  // Stock (usually has dots or specific patterns)
  if (normalized.includes('.') || normalized.length <= 5) {
    return 'stock';
  }

  return 'unknown';
}

/**
 * Check if pair is a major forex pair
 * Major pairs: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD
 * @param {string} pair - Currency pair
 * @returns {boolean} True if major pair
 */
export function isMajorPair(pair) {
  const majorPairs = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF',
    'AUDUSD', 'USDCAD', 'NZDUSD',
  ];

  const normalized = normalizeCurrency(pair).replace(/[^A-Z]/g, '');
  return majorPairs.includes(normalized);
}

/**
 * Check if pair is a cross pair (no USD)
 * @param {string} pair - Currency pair
 * @returns {boolean} True if cross pair
 */
export function isCrossPair(pair) {
  const { base, quote, valid } = splitFxPair(pair);
  if (!valid) return false;

  return base !== 'USD' && quote !== 'USD';
}

/**
 * Check if pair involves JPY
 * @param {string} pair - Currency pair
 * @returns {boolean} True if JPY pair
 */
export function isJpyPair(pair) {
  return pairContainsCurrency(pair, 'JPY');
}

/**
 * Get pip value decimal places for pair
 * @param {string} pair - Currency pair
 * @returns {number} Decimal places for pip value
 */
export function getPipDecimals(pair) {
  // JPY pairs typically use 2 decimal places
  if (isJpyPair(pair)) return 2;

  // Most other forex pairs use 4-5 decimal places
  const assetClass = getAssetClass(pair);
  if (assetClass === 'forex') return 4;

  // Crypto typically uses more decimals
  if (assetClass === 'crypto') return 8;

  // Default
  return 4;
}

/**
 * Format pair for display (with separator)
 * @param {string} pair - Currency pair
 * @param {string} separator - Separator character
 * @returns {string} Formatted pair
 */
export function formatPair(pair, separator = '/') {
  const { base, quote, valid } = splitFxPair(pair);
  if (!valid) return pair;

  return `${base}${separator}${quote}`;
}

/**
 * Get standard lot size for asset class
 * @param {string} pair - Trading pair
 * @returns {number} Standard lot size
 */
export function getStandardLotSize(pair) {
  const assetClass = getAssetClass(pair);

  switch (assetClass) {
    case 'forex':
      return 100000; // 1 standard lot = 100,000 units
    case 'crypto':
      return 1; // Crypto usually trades in units
    case 'commodity':
      if (pair.includes('XAU') || pair.includes('GOLD')) return 100; // Gold oz
      if (pair.includes('XAG') || pair.includes('SILVER')) return 5000; // Silver oz
      return 1000; // Oil barrels
    case 'index':
      return 1; // Index points
    default:
      return 1;
  }
}

/**
 * Check if pair is valid format
 * @param {string} pair - Currency pair
 * @returns {boolean} True if valid
 */
export function isValidPair(pair) {
  if (!pair || typeof pair !== 'string') return false;

  const normalized = pair.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // At least 6 characters for forex
  if (normalized.length < 6) return false;

  // Check if it matches known patterns
  const assetClass = getAssetClass(pair);
  return assetClass !== 'unknown';
}

/**
 * Extract all currencies from pair
 * @param {string} pair - Currency pair
 * @returns {Array<string>} Array of currencies [base, quote]
 */
export function extractCurrencies(pair) {
  const { base, quote, valid } = splitFxPair(pair);
  if (!valid) return [];
  return [base, quote];
}

/**
 * Check if two pairs share a common currency
 * @param {string} pair1 - First pair
 * @param {string} pair2 - Second pair
 * @returns {Object} { hasCommon: boolean, common: Array<string> }
 */
export function hasCommonCurrency(pair1, pair2) {
  const currencies1 = extractCurrencies(pair1);
  const currencies2 = extractCurrencies(pair2);

  const common = currencies1.filter(c => currencies2.includes(c));

  return {
    hasCommon: common.length > 0,
    common,
  };
}

export default {
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
  extractCurrencies,
  hasCommonCurrency,
};
