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
    { time: Date.now() - 900000, open: 1.08, high: 1.081, low: 1.0795, close: 1.0808, volume: 100 },
    {
      time: Date.now() - 800000,
      open: 1.0808,
      high: 1.082,
      low: 1.0805,
      close: 1.0815,
      volume: 120,
    },
    {
      time: Date.now() - 700000,
      open: 1.0815,
      high: 1.0828,
      low: 1.0812,
      close: 1.0825,
      volume: 150,
    },
    {
      time: Date.now() - 600000,
      open: 1.0825,
      high: 1.0838,
      low: 1.082,
      close: 1.0835,
      volume: 180,
    },
    {
      time: Date.now() - 500000,
      open: 1.0835,
      high: 1.0848,
      low: 1.083,
      close: 1.0845,
      volume: 200,
    },
    {
      time: Date.now() - 400000,
      open: 1.0845,
      high: 1.0858,
      low: 1.084,
      close: 1.0855,
      volume: 220,
    },
    {
      time: Date.now() - 300000,
      open: 1.0855,
      high: 1.0868,
      low: 1.085,
      close: 1.0865,
      volume: 250,
    },
    {
      time: Date.now() - 200000,
      open: 1.0865,
      high: 1.0878,
      low: 1.086,
      close: 1.0875,
      volume: 280,
    },
    {
      time: Date.now() - 100000,
      open: 1.0875,
      high: 1.0888,
      low: 1.087,
      close: 1.0885,
      volume: 300,
    },
    { time: Date.now(), open: 1.0885, high: 1.0898, low: 1.088, close: 1.0895, volume: 320 },
  ],
  H1: [
    {
      time: Date.now() - 3600000 * 5,
      open: 1.075,
      high: 1.077,
      low: 1.074,
      close: 1.0765,
      volume: 1000,
    },
    {
      time: Date.now() - 3600000 * 4,
      open: 1.0765,
      high: 1.079,
      low: 1.076,
      close: 1.0785,
      volume: 1100,
    },
    {
      time: Date.now() - 3600000 * 3,
      open: 1.0785,
      high: 1.081,
      low: 1.078,
      close: 1.0805,
      volume: 1200,
    },
    {
      time: Date.now() - 3600000 * 2,
      open: 1.0805,
      high: 1.0835,
      low: 1.08,
      close: 1.083,
      volume: 1300,
    },
    {
      time: Date.now() - 3600000,
      open: 1.083,
      high: 1.086,
      low: 1.0825,
      close: 1.0855,
      volume: 1400,
    },
    { time: Date.now(), open: 1.0855, high: 1.0898, low: 1.085, close: 1.0895, volume: 1500 },
  ],
  H4: [
    {
      time: Date.now() - 14400000 * 5,
      open: 1.065,
      high: 1.069,
      low: 1.064,
      close: 1.068,
      volume: 5000,
    },
    {
      time: Date.now() - 14400000 * 4,
      open: 1.068,
      high: 1.073,
      low: 1.067,
      close: 1.072,
      volume: 5500,
    },
    {
      time: Date.now() - 14400000 * 3,
      open: 1.072,
      high: 1.077,
      low: 1.071,
      close: 1.076,
      volume: 6000,
    },
    {
      time: Date.now() - 14400000 * 2,
      open: 1.076,
      high: 1.082,
      low: 1.075,
      close: 1.081,
      volume: 6500,
    },
    {
      time: Date.now() - 14400000,
      open: 1.081,
      high: 1.087,
      low: 1.08,
      close: 1.086,
      volume: 7000,
    },
    { time: Date.now(), open: 1.086, high: 1.092, low: 1.085, close: 1.0895, volume: 7500 },
  ],
  D1: [
    {
      time: Date.now() - 86400000 * 5,
      open: 1.05,
      high: 1.058,
      low: 1.049,
      close: 1.057,
      volume: 50000,
    },
    {
      time: Date.now() - 86400000 * 4,
      open: 1.057,
      high: 1.066,
      low: 1.056,
      close: 1.065,
      volume: 55000,
    },
    {
      time: Date.now() - 86400000 * 3,
      open: 1.065,
      high: 1.074,
      low: 1.064,
      close: 1.073,
      volume: 60000,
    },
    {
      time: Date.now() - 86400000 * 2,
      open: 1.073,
      high: 1.082,
      low: 1.072,
      close: 1.081,
      volume: 65000,
    },
    {
      time: Date.now() - 86400000,
      open: 1.081,
      high: 1.09,
      low: 1.08,
      close: 1.089,
      volume: 70000,
    },
  ],
};

/**
 * Sample OHLC bar data for bearish trend scenario
 */
export const bearishTrendBars = {
  M15: [
    {
      time: Date.now() - 900000,
      open: 1.09,
      high: 1.0905,
      low: 1.0892,
      close: 1.0895,
      volume: 100,
    },
    { time: Date.now() - 800000, open: 1.0895, high: 1.09, low: 1.088, close: 1.0885, volume: 120 },
    {
      time: Date.now() - 700000,
      open: 1.0885,
      high: 1.089,
      low: 1.087,
      close: 1.0875,
      volume: 150,
    },
    {
      time: Date.now() - 600000,
      open: 1.0875,
      high: 1.088,
      low: 1.086,
      close: 1.0865,
      volume: 180,
    },
    {
      time: Date.now() - 500000,
      open: 1.0865,
      high: 1.087,
      low: 1.085,
      close: 1.0855,
      volume: 200,
    },
    {
      time: Date.now() - 400000,
      open: 1.0855,
      high: 1.086,
      low: 1.084,
      close: 1.0845,
      volume: 220,
    },
    {
      time: Date.now() - 300000,
      open: 1.0845,
      high: 1.085,
      low: 1.083,
      close: 1.0835,
      volume: 250,
    },
    {
      time: Date.now() - 200000,
      open: 1.0835,
      high: 1.084,
      low: 1.082,
      close: 1.0825,
      volume: 280,
    },
    {
      time: Date.now() - 100000,
      open: 1.0825,
      high: 1.083,
      low: 1.081,
      close: 1.0815,
      volume: 300,
    },
    { time: Date.now(), open: 1.0815, high: 1.082, low: 1.08, close: 1.0805, volume: 320 },
  ],
  H1: [
    {
      time: Date.now() - 3600000 * 5,
      open: 1.095,
      high: 1.096,
      low: 1.093,
      close: 1.0935,
      volume: 1000,
    },
    {
      time: Date.now() - 3600000 * 4,
      open: 1.0935,
      high: 1.0945,
      low: 1.091,
      close: 1.0915,
      volume: 1100,
    },
    {
      time: Date.now() - 3600000 * 3,
      open: 1.0915,
      high: 1.0925,
      low: 1.089,
      close: 1.0895,
      volume: 1200,
    },
    {
      time: Date.now() - 3600000 * 2,
      open: 1.0895,
      high: 1.0905,
      low: 1.087,
      close: 1.0875,
      volume: 1300,
    },
    {
      time: Date.now() - 3600000,
      open: 1.0875,
      high: 1.0885,
      low: 1.085,
      close: 1.0855,
      volume: 1400,
    },
    { time: Date.now(), open: 1.0855, high: 1.0865, low: 1.08, close: 1.0805, volume: 1500 },
  ],
  H4: [
    {
      time: Date.now() - 14400000 * 5,
      open: 1.1,
      high: 1.102,
      low: 1.098,
      close: 1.099,
      volume: 5000,
    },
    {
      time: Date.now() - 14400000 * 4,
      open: 1.099,
      high: 1.101,
      low: 1.096,
      close: 1.097,
      volume: 5500,
    },
    {
      time: Date.now() - 14400000 * 3,
      open: 1.097,
      high: 1.099,
      low: 1.094,
      close: 1.095,
      volume: 6000,
    },
    {
      time: Date.now() - 14400000 * 2,
      open: 1.095,
      high: 1.097,
      low: 1.092,
      close: 1.093,
      volume: 6500,
    },
    {
      time: Date.now() - 14400000,
      open: 1.093,
      high: 1.095,
      low: 1.088,
      close: 1.089,
      volume: 7000,
    },
    { time: Date.now(), open: 1.089, high: 1.091, low: 1.08, close: 1.0805, volume: 7500 },
  ],
  D1: [
    {
      time: Date.now() - 86400000 * 5,
      open: 1.11,
      high: 1.115,
      low: 1.108,
      close: 1.109,
      volume: 50000,
    },
    {
      time: Date.now() - 86400000 * 4,
      open: 1.109,
      high: 1.112,
      low: 1.1,
      close: 1.101,
      volume: 55000,
    },
    {
      time: Date.now() - 86400000 * 3,
      open: 1.101,
      high: 1.104,
      low: 1.092,
      close: 1.093,
      volume: 60000,
    },
    {
      time: Date.now() - 86400000 * 2,
      open: 1.093,
      high: 1.096,
      low: 1.084,
      close: 1.085,
      volume: 65000,
    },
    {
      time: Date.now() - 86400000,
      open: 1.085,
      high: 1.088,
      low: 1.076,
      close: 1.077,
      volume: 70000,
    },
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
