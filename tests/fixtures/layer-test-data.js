/**
 * Sample test data for layer orchestrator testing
 * Provides realistic MT5 data scenarios for validating layer logic
 */

/**
 * Sample OHLC bar data for multiple timeframes
 * Represents a bullish trend scenario
 */
export const bullishTrendBars = {
  M15: [
    { time: Date.now() - 900000, open: 1.0800, high: 1.0810, low: 1.0795, close: 1.0808, volume: 100 },
    { time: Date.now() - 800000, open: 1.0808, high: 1.0820, low: 1.0805, close: 1.0815, volume: 120 },
    { time: Date.now() - 700000, open: 1.0815, high: 1.0828, low: 1.0812, close: 1.0825, volume: 150 },
    { time: Date.now() - 600000, open: 1.0825, high: 1.0838, low: 1.0820, close: 1.0835, volume: 180 },
    { time: Date.now() - 500000, open: 1.0835, high: 1.0848, low: 1.0830, close: 1.0845, volume: 200 },
    { time: Date.now() - 400000, open: 1.0845, high: 1.0858, low: 1.0840, close: 1.0855, volume: 220 },
    { time: Date.now() - 300000, open: 1.0855, high: 1.0868, low: 1.0850, close: 1.0865, volume: 250 },
    { time: Date.now() - 200000, open: 1.0865, high: 1.0878, low: 1.0860, close: 1.0875, volume: 280 },
    { time: Date.now() - 100000, open: 1.0875, high: 1.0888, low: 1.0870, close: 1.0885, volume: 300 },
    { time: Date.now(), open: 1.0885, high: 1.0898, low: 1.0880, close: 1.0895, volume: 320 },
  ],
  H1: [
    { time: Date.now() - 3600000 * 5, open: 1.0750, high: 1.0770, low: 1.0740, close: 1.0765, volume: 1000 },
    { time: Date.now() - 3600000 * 4, open: 1.0765, high: 1.0790, low: 1.0760, close: 1.0785, volume: 1100 },
    { time: Date.now() - 3600000 * 3, open: 1.0785, high: 1.0810, low: 1.0780, close: 1.0805, volume: 1200 },
    { time: Date.now() - 3600000 * 2, open: 1.0805, high: 1.0835, low: 1.0800, close: 1.0830, volume: 1300 },
    { time: Date.now() - 3600000, open: 1.0830, high: 1.0860, low: 1.0825, close: 1.0855, volume: 1400 },
    { time: Date.now(), open: 1.0855, high: 1.0898, low: 1.0850, close: 1.0895, volume: 1500 },
  ],
  H4: [
    { time: Date.now() - 14400000 * 5, open: 1.0650, high: 1.0690, low: 1.0640, close: 1.0680, volume: 5000 },
    { time: Date.now() - 14400000 * 4, open: 1.0680, high: 1.0730, low: 1.0670, close: 1.0720, volume: 5500 },
    { time: Date.now() - 14400000 * 3, open: 1.0720, high: 1.0770, low: 1.0710, close: 1.0760, volume: 6000 },
    { time: Date.now() - 14400000 * 2, open: 1.0760, high: 1.0820, low: 1.0750, close: 1.0810, volume: 6500 },
    { time: Date.now() - 14400000, open: 1.0810, high: 1.0870, low: 1.0800, close: 1.0860, volume: 7000 },
    { time: Date.now(), open: 1.0860, high: 1.0920, low: 1.0850, close: 1.0895, volume: 7500 },
  ],
  D1: [
    { time: Date.now() - 86400000 * 5, open: 1.0500, high: 1.0580, low: 1.0490, close: 1.0570, volume: 50000 },
    { time: Date.now() - 86400000 * 4, open: 1.0570, high: 1.0660, low: 1.0560, close: 1.0650, volume: 55000 },
    { time: Date.now() - 86400000 * 3, open: 1.0650, high: 1.0740, low: 1.0640, close: 1.0730, volume: 60000 },
    { time: Date.now() - 86400000 * 2, open: 1.0730, high: 1.0820, low: 1.0720, close: 1.0810, volume: 65000 },
    { time: Date.now() - 86400000, open: 1.0810, high: 1.0900, low: 1.0800, close: 1.0890, volume: 70000 },
  ],
};

/**
 * Sample OHLC bar data for bearish trend scenario
 */
export const bearishTrendBars = {
  M15: [
    { time: Date.now() - 900000, open: 1.0900, high: 1.0905, low: 1.0892, close: 1.0895, volume: 100 },
    { time: Date.now() - 800000, open: 1.0895, high: 1.0900, low: 1.0880, close: 1.0885, volume: 120 },
    { time: Date.now() - 700000, open: 1.0885, high: 1.0890, low: 1.0870, close: 1.0875, volume: 150 },
    { time: Date.now() - 600000, open: 1.0875, high: 1.0880, low: 1.0860, close: 1.0865, volume: 180 },
    { time: Date.now() - 500000, open: 1.0865, high: 1.0870, low: 1.0850, close: 1.0855, volume: 200 },
    { time: Date.now() - 400000, open: 1.0855, high: 1.0860, low: 1.0840, close: 1.0845, volume: 220 },
    { time: Date.now() - 300000, open: 1.0845, high: 1.0850, low: 1.0830, close: 1.0835, volume: 250 },
    { time: Date.now() - 200000, open: 1.0835, high: 1.0840, low: 1.0820, close: 1.0825, volume: 280 },
    { time: Date.now() - 100000, open: 1.0825, high: 1.0830, low: 1.0810, close: 1.0815, volume: 300 },
    { time: Date.now(), open: 1.0815, high: 1.0820, low: 1.0800, close: 1.0805, volume: 320 },
  ],
  H1: [
    { time: Date.now() - 3600000 * 5, open: 1.0950, high: 1.0960, low: 1.0930, close: 1.0935, volume: 1000 },
    { time: Date.now() - 3600000 * 4, open: 1.0935, high: 1.0945, low: 1.0910, close: 1.0915, volume: 1100 },
    { time: Date.now() - 3600000 * 3, open: 1.0915, high: 1.0925, low: 1.0890, close: 1.0895, volume: 1200 },
    { time: Date.now() - 3600000 * 2, open: 1.0895, high: 1.0905, low: 1.0870, close: 1.0875, volume: 1300 },
    { time: Date.now() - 3600000, open: 1.0875, high: 1.0885, low: 1.0850, close: 1.0855, volume: 1400 },
    { time: Date.now(), open: 1.0855, high: 1.0865, low: 1.0800, close: 1.0805, volume: 1500 },
  ],
  H4: [
    { time: Date.now() - 14400000 * 5, open: 1.1000, high: 1.1020, low: 1.0980, close: 1.0990, volume: 5000 },
    { time: Date.now() - 14400000 * 4, open: 1.0990, high: 1.1010, low: 1.0960, close: 1.0970, volume: 5500 },
    { time: Date.now() - 14400000 * 3, open: 1.0970, high: 1.0990, low: 1.0940, close: 1.0950, volume: 6000 },
    { time: Date.now() - 14400000 * 2, open: 1.0950, high: 1.0970, low: 1.0920, close: 1.0930, volume: 6500 },
    { time: Date.now() - 14400000, open: 1.0930, high: 1.0950, low: 1.0880, close: 1.0890, volume: 7000 },
    { time: Date.now(), open: 1.0890, high: 1.0910, low: 1.0800, close: 1.0805, volume: 7500 },
  ],
  D1: [
    { time: Date.now() - 86400000 * 5, open: 1.1100, high: 1.1150, low: 1.1080, close: 1.1090, volume: 50000 },
    { time: Date.now() - 86400000 * 4, open: 1.1090, high: 1.1120, low: 1.1000, close: 1.1010, volume: 55000 },
    { time: Date.now() - 86400000 * 3, open: 1.1010, high: 1.1040, low: 1.0920, close: 1.0930, volume: 60000 },
    { time: Date.now() - 86400000 * 2, open: 1.0930, high: 1.0960, low: 1.0840, close: 1.0850, volume: 65000 },
    { time: Date.now() - 86400000, open: 1.0850, high: 1.0880, low: 1.0760, close: 1.0770, volume: 70000 },
  ],
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
  tp: 1.0970, // 75 pips (1.5 R:R)
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
  tp: 1.0730, // 75 pips (1.5 R:R)
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
  return {
    broker: 'mt5',
    symbol: 'EURUSD',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: {
      quote: sampleQuote,
      bars: bullishTrendBars,
      account: sampleAccount,
      signal: bullishBuySignal,
    },
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
  return {
    broker: 'mt5',
    symbol: 'EURUSD',
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    data: {
      quote: { ...sampleQuote, bid: 1.0803, ask: 1.0805 },
      bars: bearishTrendBars,
      account: sampleAccount,
      signal: bearishSellSignal,
    },
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
      positionSizeRange: [0.05, 0.30],
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
      positionSizeRange: [0.05, 0.30],
      riskPercentRange: [1.0, 2.0],
    },
  },
};
