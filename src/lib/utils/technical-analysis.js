/**
 * Technical Analysis Utilities
 * Provides calculation functions for indicators and patterns
 */

/**
 * Calculate Simple Moving Average
 * @param {Array} prices - Array of prices
 * @param {number} period - SMA period
 * @returns {number|null} SMA value
 */
export function calculateSMA(prices, period) {
  if (!Array.isArray(prices) || prices.length < period) {
    return null;
  }

  const relevantPrices = prices.slice(-period);
  const sum = relevantPrices.reduce((acc, price) => acc + price, 0);
  return sum / period;
}

/**
 * Calculate Exponential Moving Average
 * @param {Array} prices - Array of prices
 * @param {number} period - EMA period
 * @returns {number|null} EMA value
 */
export function calculateEMA(prices, period) {
  if (!Array.isArray(prices) || prices.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let ema = calculateSMA(prices.slice(0, period), period);

  if (ema === null) return null;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate RSI (Relative Strength Index)
 * @param {Array} prices - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {number|null} RSI value (0-100)
 */
export function calculateRSI(prices, period = 14) {
  if (!Array.isArray(prices) || prices.length < period + 1) {
    return null;
  }

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const gains = changes.map((change) => (change > 0 ? change : 0));
  const losses = changes.map((change) => (change < 0 ? Math.abs(change) : 0));

  const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  return rsi;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param {Array} prices - Array of closing prices
 * @param {number} fastPeriod - Fast EMA period (default 12)
 * @param {number} slowPeriod - Slow EMA period (default 26)
 * @param {number} signalPeriod - Signal line period (default 9)
 * @returns {Object|null} MACD values {macd, signal, histogram}
 */
export function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!Array.isArray(prices) || prices.length < slowPeriod + signalPeriod) {
    return null;
  }

  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  if (fastEMA === null || slowEMA === null) {
    return null;
  }

  const macdLine = fastEMA - slowEMA;

  // Calculate signal line (EMA of MACD line)
  // For simplicity, using last value only - in production would track full MACD history
  const signalLine = macdLine; // Simplified - should be EMA of MACD line

  const histogram = macdLine - signalLine;

  return {
    macd: macdLine,
    signal: signalLine,
    histogram,
  };
}

/**
 * Calculate Stochastic Oscillator
 * @param {Array} highs - Array of high prices
 * @param {Array} lows - Array of low prices
 * @param {Array} closes - Array of closing prices
 * @param {number} period - %K period (default 14)
 * @param {number} smoothK - %K smoothing (default 3)
 * @param {number} smoothD - %D period (default 3)
 * @returns {Object|null} Stochastic values {k, d}
 */
export function calculateStochastic(
  highs,
  lows,
  closes,
  period = 14,
  smoothK = 3,
  smoothD = 3
) {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes) ||
    highs.length < period ||
    lows.length < period ||
    closes.length < period
  ) {
    return null;
  }

  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const currentClose = closes[closes.length - 1];

  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);

  if (highestHigh === lowestLow) {
    return { k: 50, d: 50 };
  }

  const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;

  // %D is SMA of %K (simplified - should track full %K history)
  const d = k; // Simplified

  return { k, d };
}

/**
 * Calculate ADX (Average Directional Index)
 * @param {Array} highs - Array of high prices
 * @param {Array} lows - Array of low prices
 * @param {Array} closes - Array of closing prices
 * @param {number} period - ADX period (default 14)
 * @returns {Object|null} ADX values {adx, plusDI, minusDI}
 */
export function calculateADX(highs, lows, closes, period = 14) {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes) ||
    highs.length < period + 1 ||
    lows.length < period + 1 ||
    closes.length < period + 1
  ) {
    return null;
  }

  // Simplified ADX calculation
  // In production, would implement full Wilder's smoothing

  const trueRanges = [];
  const plusDMs = [];
  const minusDMs = [];

  for (let i = 1; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevHigh = highs[i - 1];
    const prevLow = lows[i - 1];
    const prevClose = closes[i - 1];

    // True Range
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);

    // Directional Movement
    const plusDM = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
    const minusDM = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  const avgTR =
    trueRanges.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, trueRanges.length);
  const avgPlusDM =
    plusDMs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, plusDMs.length);
  const avgMinusDM =
    minusDMs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, minusDMs.length);

  const plusDI = avgTR !== 0 ? (avgPlusDM / avgTR) * 100 : 0;
  const minusDI = avgTR !== 0 ? (avgMinusDM / avgTR) * 100 : 0;

  const dx =
    plusDI + minusDI !== 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;

  // ADX is smoothed DX (simplified here)
  const adx = dx;

  return {
    adx,
    plusDI,
    minusDI,
  };
}

/**
 * Calculate ATR (Average True Range)
 * @param {Array} highs - Array of high prices
 * @param {Array} lows - Array of low prices
 * @param {Array} closes - Array of closing prices
 * @param {number} period - ATR period (default 14)
 * @returns {number|null} ATR value
 */
export function calculateATR(highs, lows, closes, period = 14) {
  if (
    !Array.isArray(highs) ||
    !Array.isArray(lows) ||
    !Array.isArray(closes) ||
    highs.length < period + 1
  ) {
    return null;
  }

  const trueRanges = [];

  for (let i = 1; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  const atr =
    trueRanges.slice(-period).reduce((a, b) => a + b, 0) / Math.min(period, trueRanges.length);

  return atr;
}

/**
 * Calculate Pivot Points (Standard)
 * @param {number} high - Previous high
 * @param {number} low - Previous low
 * @param {number} close - Previous close
 * @returns {Object} Pivot points {pp, r1, r2, r3, s1, s2, s3}
 */
export function calculatePivotPoints(high, low, close) {
  const pp = (high + low + close) / 3;
  const r1 = 2 * pp - low;
  const s1 = 2 * pp - high;
  const r2 = pp + (high - low);
  const s2 = pp - (high - low);
  const r3 = high + 2 * (pp - low);
  const s3 = low - 2 * (high - pp);

  return { pp, r1, r2, r3, s1, s2, s3 };
}

/**
 * Calculate Fibonacci Retracement Levels
 * @param {number} high - Swing high
 * @param {number} low - Swing low
 * @param {boolean} isUptrend - True for uptrend, false for downtrend
 * @returns {Object} Fibonacci levels
 */
export function calculateFibonacciLevels(high, low, isUptrend = true) {
  const diff = high - low;

  const levels = {
    '0': isUptrend ? high : low,
    '23.6': isUptrend ? high - diff * 0.236 : low + diff * 0.236,
    '38.2': isUptrend ? high - diff * 0.382 : low + diff * 0.382,
    '50': isUptrend ? high - diff * 0.5 : low + diff * 0.5,
    '61.8': isUptrend ? high - diff * 0.618 : low + diff * 0.618,
    '78.6': isUptrend ? high - diff * 0.786 : low + diff * 0.786,
    '100': isUptrend ? low : high,
  };

  return levels;
}

/**
 * Determine trend direction based on price action
 * @param {Array} closes - Array of closing prices
 * @param {number} shortPeriod - Short period for trend (default 20)
 * @param {number} longPeriod - Long period for trend (default 50)
 * @returns {Object} Trend info {direction, strength, shortMA, longMA}
 */
export function determineTrend(closes, shortPeriod = 20, longPeriod = 50) {
  if (!Array.isArray(closes) || closes.length < longPeriod) {
    return { direction: 'NEUTRAL', strength: 0, shortMA: null, longMA: null };
  }

  const shortMA = calculateSMA(closes, shortPeriod);
  const longMA = calculateSMA(closes, longPeriod);

  if (shortMA === null || longMA === null) {
    return { direction: 'NEUTRAL', strength: 0, shortMA: null, longMA: null };
  }

  const currentPrice = closes[closes.length - 1];

  // Determine direction
  let direction = 'NEUTRAL';
  let strength = 0;

  if (shortMA > longMA && currentPrice > shortMA) {
    direction = 'BULLISH';
    strength = Math.min(100, ((shortMA - longMA) / longMA) * 1000);
  } else if (shortMA < longMA && currentPrice < shortMA) {
    direction = 'BEARISH';
    strength = Math.min(100, ((longMA - shortMA) / longMA) * 1000);
  } else {
    direction = 'NEUTRAL';
    strength = 0;
  }

  return {
    direction,
    strength: Math.abs(strength),
    shortMA,
    longMA,
    currentPrice,
  };
}

/**
 * Check if price is at support or resistance
 * @param {number} price - Current price
 * @param {Array} levels - Array of S/R levels
 * @param {number} tolerance - Tolerance percentage (default 0.002 = 0.2%)
 * @returns {Object|null} Level info if near level
 */
export function checkSupportResistance(price, levels, tolerance = 0.002) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return null;
  }

  for (const level of levels) {
    const distance = Math.abs(price - level.value);
    const threshold = level.value * tolerance;

    if (distance <= threshold) {
      return {
        level: level.value,
        type: level.type,
        distance,
        distancePips: distance * 10000, // Approximate for forex
        atLevel: true,
      };
    }
  }

  // Find nearest level
  const nearest = levels.reduce((prev, curr) => {
    const prevDist = Math.abs(price - prev.value);
    const currDist = Math.abs(price - curr.value);
    return currDist < prevDist ? curr : prev;
  });

  return {
    level: nearest.value,
    type: nearest.type,
    distance: Math.abs(price - nearest.value),
    distancePips: Math.abs(price - nearest.value) * 10000,
    atLevel: false,
  };
}

/**
 * Detect MA crossover
 * @param {Array} prices - Array of prices
 * @param {number} fastPeriod - Fast MA period
 * @param {number} slowPeriod - Slow MA period
 * @param {number} lookback - Bars to look back for crossover (default 5)
 * @returns {Object} Crossover info {crossover, type, barsAgo}
 */
export function detectMACrossover(prices, fastPeriod, slowPeriod, lookback = 5) {
  if (!Array.isArray(prices) || prices.length < slowPeriod + lookback) {
    return { crossover: false, type: null, barsAgo: null };
  }

  for (let i = 1; i <= Math.min(lookback, prices.length - slowPeriod); i++) {
    const currentPrices = prices.slice(0, -i + 1 || undefined);
    const previousPrices = prices.slice(0, -i || undefined);

    const currentFast = calculateSMA(currentPrices, fastPeriod);
    const currentSlow = calculateSMA(currentPrices, slowPeriod);
    const previousFast = calculateSMA(previousPrices, fastPeriod);
    const previousSlow = calculateSMA(previousPrices, slowPeriod);

    if (
      currentFast !== null &&
      currentSlow !== null &&
      previousFast !== null &&
      previousSlow !== null
    ) {
      // Bullish crossover
      if (previousFast <= previousSlow && currentFast > currentSlow) {
        return { crossover: true, type: 'GOLDEN_CROSS', barsAgo: i };
      }
      // Bearish crossover
      if (previousFast >= previousSlow && currentFast < currentSlow) {
        return { crossover: true, type: 'DEATH_CROSS', barsAgo: i };
      }
    }
  }

  return { crossover: false, type: null, barsAgo: null };
}

export default {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateADX,
  calculateATR,
  calculatePivotPoints,
  calculateFibonacciLevels,
  determineTrend,
  checkSupportResistance,
  detectMACrossover,
};
