/**
 * Sample test data for layer orchestrator testing
 * Provides realistic MT5 data scenarios for validating layer logic
 */

/**
 * Generate OHLC bars with a zigzag trend (2 steps forward, 1 step back)
 * This ensures RSI stays in a realistic range (not at extremes) while showing clear trend.
 * @param {number} count - Number of bars to generate
 * @param {number} startPrice - Starting close price
 * @param {number} endPrice - Ending close price
 * @param {number} intervalMs - Milliseconds per bar
 * @param {number} baseVolume - Base volume per bar
 * @returns {Array} Array of OHLC bar objects
 */
function generateTrendBars(count, startPrice, endPrice, intervalMs, baseVolume = 1000) {
  const bars = [];
  const now = Date.now();
  const isUp = endPrice >= startPrice;
  const totalMove = Math.abs(endPrice - startPrice);

  // 3-forward-2-back zigzag (5-bar cycles): net gain per cycle = 1 unit
  // This gives RSI ~57 (neutral) instead of extreme values from a linear trend
  const cycles = Math.floor(count / 5);
  const unitStep = totalMove / Math.max(1, cycles);
  const fwdStep = unitStep;
  const bckStep = unitStep;

  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const phase = i % 5;
    let change;
    if (phase < 3) {
      change = isUp ? fwdStep : -fwdStep; // 3 bars in trend direction
    } else {
      change = isUp ? -bckStep : bckStep; // 2 bars counter-trend
    }
    const open = parseFloat(price.toFixed(5));
    const close = parseFloat((price + change).toFixed(5));
    price = close;
    bars.push({
      time: now - intervalMs * (count - 1 - i),
      open,
      high: parseFloat((Math.max(open, close) + 0.0005).toFixed(5)),
      low: parseFloat((Math.min(open, close) - 0.0005).toFixed(5)),
      close,
      volume: baseVolume + i * 10,
    });
  }
  return bars;
}

/**
 * Sample OHLC bar data for multiple timeframes
 * Represents a bullish trend scenario (90+ bars per timeframe for sufficient TA calculations)
 * Uses 200 H1 bars to enable full MA analysis (SMA200 requires 200 bars)
 */
export const bullishTrendBars = {
  // 90 M15 bars trending up with zigzag: 1.0700 → ~1.0895
  M15: generateTrendBars(90, 1.07, 1.0895, 900000, 100),
  // 200 H1 bars trending up with zigzag: 1.0500 → ~1.0895
  H1: generateTrendBars(200, 1.05, 1.0895, 3600000, 1000),
  // 90 H4 bars trending up with zigzag: 1.0300 → ~1.0895
  H4: generateTrendBars(90, 1.03, 1.0895, 14400000, 5000),
  // 90 D1 bars trending up with zigzag: 1.0000 → ~1.0895
  D1: generateTrendBars(90, 1.0, 1.0895, 86400000, 50000),
};

/**
 * Sample OHLC bar data for bearish trend scenario
 * (90+ bars per timeframe for sufficient TA calculations)
 * Uses 200 H1 bars to enable full MA analysis (SMA200 requires 200 bars)
 */
export const bearishTrendBars = {
  // 90 M15 bars trending down with zigzag: 1.0900 → ~1.0705
  M15: generateTrendBars(90, 1.09, 1.0705, 900000, 100),
  // 200 H1 bars trending down with zigzag: 1.1100 → ~1.0805
  H1: generateTrendBars(200, 1.11, 1.0805, 3600000, 1000),
  // 90 H4 bars trending down with zigzag: 1.1300 → ~1.0805
  H4: generateTrendBars(90, 1.13, 1.0805, 14400000, 5000),
  // 90 D1 bars trending down with zigzag: 1.1600 → ~1.0805
  D1: generateTrendBars(90, 1.16, 1.0805, 86400000, 50000),
};

/**
 * Sample quote data
 */
export const sampleQuote = {
  broker: 'mt5',
  symbol: 'EURUSD',
  bid: 1.0893,
  ask: 1.0895,
  timestamp: Date.now(),
  spread: 0.0002,
};

/**
 * Sample BUY signal for bullish scenario
 */
export const bullishBuySignal = {
  broker: 'mt5',
  symbol: 'EURUSD',
  direction: 'BUY',
  entry: 1.0895,
  sl: 1.0845, // 50 pips
  tp: 1.097, // 75 pips (1.5 R:R)
  timeframe: 'H1',
  confidence: 75,
  reason: 'Strong bullish trend across all timeframes',
};

/**
 * Sample SELL signal for bearish scenario
 */
export const bearishSellSignal = {
  broker: 'mt5',
  symbol: 'EURUSD',
  direction: 'SELL',
  entry: 1.0805,
  sl: 1.0855, // 50 pips
  tp: 1.073, // 75 pips (1.5 R:R)
  timeframe: 'H1',
  confidence: 75,
  reason: 'Strong bearish trend across all timeframes',
};

/**
 * Sample account info
 */
export const sampleAccount = {
  balance: 10000,
  equity: 10000,
  margin: 0,
  freeMargin: 10000,
  currency: 'USD',
};

/**
 * Create complete snapshot for bullish scenario
 */
export function createBullishSnapshot() {
  const data = {
    quote: sampleQuote,
    bars: bullishTrendBars,
    account: sampleAccount,
    signal: bullishBuySignal,
  };
  return {
    broker: 'mt5',
    symbol: 'EURUSD',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data,
    quote: data.quote,
    bars: data.bars,
    account: data.account,
    signal: data.signal,
    layers: {},
    layeredAnalysis: null,
    signalValid: false,
    layer18Ready: false,
  };
}

/**
 * Create complete snapshot for bearish scenario
 */
export function createBearishSnapshot() {
  const data = {
    quote: { ...sampleQuote, bid: 1.0803, ask: 1.0805 },
    bars: bearishTrendBars,
    account: sampleAccount,
    signal: bearishSellSignal,
  };
  return {
    broker: 'mt5',
    symbol: 'EURUSD',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data,
    quote: data.quote,
    bars: data.bars,
    account: data.account,
    signal: data.signal,
    layers: {},
    layeredAnalysis: null,
    signalValid: false,
    layer18Ready: false,
  };
}

/**
 * Expected layer results for bullish scenario
 */
export const expectedBullishLayerResults = {
  layer4: {
    status: 'PASS',
    scoreRange: [75, 95],
    confidenceRange: [70, 90],
    reason: /aligned.*BUY/i,
  },
  layer5: {
    status: 'PASS',
    scoreRange: [70, 90],
    confidenceRange: [65, 85],
  },
  layer6: {
    status: 'PASS',
    scoreRange: [70, 90],
    confidenceRange: [65, 85],
    reason: /indicators.*aligned/i,
  },
  layer7: {
    status: 'PASS',
    scoreRange: [75, 95],
    confidenceRange: [70, 90],
    reason: /MA.*aligned/i,
  },
  layer11: {
    status: 'PASS',
    scoreRange: [80, 100],
    confidenceRange: [75, 95],
    reason: /confluence/i,
  },
  layer17: {
    status: 'PASS',
    scoreRange: [75, 95],
    confidenceRange: [70, 90],
    metrics: {
      positionSizeRange: [0.05, 0.3],
      riskPercentRange: [1.0, 2.0],
    },
  },
};

/**
 * Expected layer results for bearish scenario
 */
export const expectedBearishLayerResults = {
  layer4: {
    status: 'PASS',
    scoreRange: [75, 95],
    confidenceRange: [70, 90],
    reason: /aligned.*SELL/i,
  },
  layer5: {
    status: 'PASS',
    scoreRange: [70, 90],
    confidenceRange: [65, 85],
  },
  layer6: {
    status: 'PASS',
    scoreRange: [70, 90],
    confidenceRange: [65, 85],
    reason: /indicators.*aligned/i,
  },
  layer7: {
    status: 'PASS',
    scoreRange: [75, 95],
    confidenceRange: [70, 90],
    reason: /MA.*aligned/i,
  },
  layer11: {
    status: 'PASS',
    scoreRange: [80, 100],
    confidenceRange: [75, 95],
    reason: /confluence/i,
  },
  layer17: {
    status: 'PASS',
    scoreRange: [75, 95],
    confidenceRange: [70, 90],
    metrics: {
      positionSizeRange: [0.05, 0.3],
      riskPercentRange: [1.0, 2.0],
    },
  },
};
