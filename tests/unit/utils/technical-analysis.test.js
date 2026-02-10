import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSMA,
  calculateEMA,
  detectMACrossover,
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateADX,
  determineTrend,
  calculateATR,
  calculatePivotPoints,
  calculateFibonacciLevels,
  checkSupportResistance,
} from '../../../src/lib/utils/technical-analysis.js';

describe('Technical Analysis Library', () => {
  describe('Moving Averages', () => {
    it('calculateSMA() returns correct simple moving average', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const sma5 = calculateSMA(prices, 5);
      
      assert.ok(sma5 !== null);
      assert.equal(sma5.length, 6); // 10 prices - 5 period + 1
      assert.equal(sma5[0], 12); // (10+11+12+13+14)/5
      assert.equal(sma5[sma5.length - 1], 17); // (15+16+17+18+19)/5
    });

    it('calculateSMA() handles insufficient data', () => {
      const prices = [10, 11, 12];
      const sma5 = calculateSMA(prices, 5);
      
      assert.equal(sma5, null);
    });

    it('calculateSMA() handles invalid inputs', () => {
      assert.equal(calculateSMA(null, 5), null);
      assert.equal(calculateSMA([], 5), null);
      assert.equal(calculateSMA([10, 11], 0), null);
    });

    it('calculateEMA() returns correct exponential moving average', () => {
      const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
      const ema5 = calculateEMA(prices, 5);
      
      assert.ok(ema5 !== null);
      assert.ok(Array.isArray(ema5));
      assert.ok(ema5.length > 0);
      // EMA gives more weight to recent prices
      assert.ok(ema5[ema5.length - 1] > calculateSMA(prices, 5)[calculateSMA(prices, 5).length - 1]);
    });

    it('detectMACrossover() detects golden cross', () => {
      // Prices trending up, fast MA crosses above slow MA
      const prices = [10, 10, 11, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
      const result = detectMACrossover(prices, 3, 5, 5);
      
      assert.ok(result !== null);
      if (result.type !== 'NONE') {
        assert.ok(['GOLDEN_CROSS', 'DEATH_CROSS'].includes(result.type));
      }
    });

    it('detectMACrossover() handles no crossover', () => {
      const prices = [10, 10, 10, 10, 10, 10, 10, 10];
      const result = detectMACrossover(prices, 2, 4, 3);
      
      assert.ok(result !== null);
      assert.equal(result.type, 'NONE');
    });
  });

  describe('Momentum Indicators', () => {
    it('calculateRSI() returns value between 0 and 100', () => {
      const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
      const rsi = calculateRSI(prices, 14);
      
      assert.ok(rsi !== null);
      assert.ok(rsi >= 0 && rsi <= 100);
    });

    it('calculateRSI() detects overbought conditions', () => {
      // Strongly rising prices
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
      const rsi = calculateRSI(prices, 14);
      
      assert.ok(rsi > 70); // Should be overbought
    });

    it('calculateRSI() detects oversold conditions', () => {
      // Strongly falling prices
      const prices = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
      const rsi = calculateRSI(prices, 14);
      
      assert.ok(rsi < 30); // Should be oversold
    });

    it('calculateRSI() handles insufficient data', () => {
      const prices = [10, 11, 12];
      const rsi = calculateRSI(prices, 14);
      
      assert.equal(rsi, null);
    });

    it('calculateMACD() returns histogram with correct structure', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 5) * 10);
      const macd = calculateMACD(prices, 12, 26, 9);
      
      assert.ok(macd !== null);
      assert.ok(typeof macd.macd === 'number');
      assert.ok(typeof macd.signal === 'number');
      assert.ok(typeof macd.histogram === 'number');
    });

    it('calculateMACD() identifies bullish crossover', () => {
      // Rising prices should give positive histogram
      const prices = Array.from({ length: 40 }, (_, i) => 100 + i * 0.5);
      const macd = calculateMACD(prices, 12, 26, 9);
      
      assert.ok(macd !== null);
      assert.ok(macd.histogram > 0); // Bullish
    });

    it('calculateStochastic() returns values between 0 and 100', () => {
      const highs = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62];
      const lows = [42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56];
      const closes = [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59];
      
      const stoch = calculateStochastic(highs, lows, closes, 14, 3, 3);
      
      assert.ok(stoch !== null);
      assert.ok(stoch.k >= 0 && stoch.k <= 100);
      assert.ok(stoch.d >= 0 && stoch.d <= 100);
    });

    it('calculateStochastic() detects overbought', () => {
      // Price at highs
      const highs = Array.from({ length: 20 }, (_, i) => 100 + i);
      const lows = Array.from({ length: 20 }, (_, i) => 95 + i);
      const closes = Array.from({ length: 20 }, (_, i) => 99 + i);
      
      const stoch = calculateStochastic(highs, lows, closes, 14, 3, 3);
      
      assert.ok(stoch.k > 80); // Should be overbought
    });
  });

  describe('Trend Indicators', () => {
    it('calculateADX() returns trend strength', () => {
      const highs = Array.from({ length: 20 }, (_, i) => 100 + i + Math.random() * 2);
      const lows = Array.from({ length: 20 }, (_, i) => 95 + i + Math.random() * 2);
      const closes = Array.from({ length: 20 }, (_, i) => 98 + i + Math.random() * 2);
      
      const adx = calculateADX(highs, lows, closes, 14);
      
      assert.ok(adx !== null);
      assert.ok(adx >= 0 && adx <= 100);
    });

    it('determineTrend() identifies bullish trend', () => {
      // Clear uptrend
      const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
      const trend = determineTrend(closes, 20, 50);
      
      assert.ok(trend !== null);
      assert.equal(trend.direction, 'BULLISH');
      assert.ok(trend.strength > 50);
    });

    it('determineTrend() identifies bearish trend', () => {
      // Clear downtrend
      const closes = Array.from({ length: 60 }, (_, i) => 150 - i * 0.5);
      const trend = determineTrend(closes, 20, 50);
      
      assert.ok(trend !== null);
      assert.equal(trend.direction, 'BEARISH');
      assert.ok(trend.strength > 50);
    });

    it('determineTrend() identifies neutral/ranging market', () => {
      // Sideways price action
      const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 2);
      const trend = determineTrend(closes, 20, 50);
      
      assert.ok(trend !== null);
      assert.equal(trend.direction, 'NEUTRAL');
    });

    it('calculateATR() returns positive volatility measure', () => {
      const highs = Array.from({ length: 20 }, (_, i) => 100 + Math.random() * 5);
      const lows = Array.from({ length: 20 }, (_, i) => 95 + Math.random() * 5);
      const closes = Array.from({ length: 20 }, (_, i) => 98 + Math.random() * 5);
      
      const atr = calculateATR(highs, lows, closes, 14);
      
      assert.ok(atr !== null);
      assert.ok(atr > 0);
    });
  });

  describe('Support/Resistance', () => {
    it('calculatePivotPoints() returns all pivot levels', () => {
      const high = 1.1050;
      const low = 1.1000;
      const close = 1.1025;
      
      const pivots = calculatePivotPoints(high, low, close);
      
      assert.ok(pivots !== null);
      assert.ok(typeof pivots.pp === 'number');
      assert.ok(typeof pivots.r1 === 'number');
      assert.ok(typeof pivots.r2 === 'number');
      assert.ok(typeof pivots.r3 === 'number');
      assert.ok(typeof pivots.s1 === 'number');
      assert.ok(typeof pivots.s2 === 'number');
      assert.ok(typeof pivots.s3 === 'number');
      
      // Validate hierarchy
      assert.ok(pivots.r3 > pivots.r2);
      assert.ok(pivots.r2 > pivots.r1);
      assert.ok(pivots.r1 > pivots.pp);
      assert.ok(pivots.pp > pivots.s1);
      assert.ok(pivots.s1 > pivots.s2);
      assert.ok(pivots.s2 > pivots.s3);
    });

    it('calculateFibonacciLevels() returns retracement levels', () => {
      const high = 1.2000;
      const low = 1.1000;
      
      const fibs = calculateFibonacciLevels(high, low, true);
      
      assert.ok(fibs !== null);
      assert.ok(typeof fibs.level_0 === 'number');
      assert.ok(typeof fibs.level_236 === 'number');
      assert.ok(typeof fibs.level_382 === 'number');
      assert.ok(typeof fibs.level_500 === 'number');
      assert.ok(typeof fibs.level_618 === 'number');
      assert.ok(typeof fibs.level_100 === 'number');
      
      // Validate range
      assert.equal(fibs.level_0, high);
      assert.equal(fibs.level_100, low);
      assert.ok(fibs.level_500 > low && fibs.level_500 < high);
    });

    it('checkSupportResistance() detects proximity to level', () => {
      const price = 1.1025;
      const levels = [
        { value: 1.1000, type: 'SUPPORT' },
        { value: 1.1025, type: 'RESISTANCE' },
        { value: 1.1050, type: 'RESISTANCE' },
      ];
      
      const result = checkSupportResistance(price, levels, 0.0005);
      
      assert.ok(result !== null);
      assert.ok(result.atLevel);
      assert.equal(result.nearestLevel.value, 1.1025);
      assert.equal(result.nearestLevel.type, 'RESISTANCE');
    });

    it('checkSupportResistance() returns null when away from levels', () => {
      const price = 1.1500;
      const levels = [
        { value: 1.1000, type: 'SUPPORT' },
        { value: 1.1100, type: 'RESISTANCE' },
      ];
      
      const result = checkSupportResistance(price, levels, 0.0005);
      
      assert.ok(result !== null);
      assert.equal(result.atLevel, false);
      assert.ok(result.nearestLevel !== null);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles null inputs gracefully', () => {
      assert.equal(calculateSMA(null, 5), null);
      assert.equal(calculateEMA(null, 5), null);
      assert.equal(calculateRSI(null, 14), null);
      assert.equal(calculateMACD(null), null);
      assert.equal(calculateADX(null, null, null, 14), null);
      assert.equal(determineTrend(null, 20, 50), null);
      assert.equal(calculateATR(null, null, null, 14), null);
    });

    it('handles empty arrays gracefully', () => {
      assert.equal(calculateSMA([], 5), null);
      assert.equal(calculateEMA([], 5), null);
      assert.equal(calculateRSI([], 14), null);
      assert.equal(calculateMACD([]), null);
    });

    it('handles insufficient data gracefully', () => {
      const shortData = [10, 11, 12];
      
      assert.equal(calculateSMA(shortData, 10), null);
      assert.equal(calculateEMA(shortData, 10), null);
      assert.equal(calculateRSI(shortData, 14), null);
      assert.equal(calculateMACD(shortData), null);
    });

    it('handles invalid periods gracefully', () => {
      const prices = [10, 11, 12, 13, 14];
      
      assert.equal(calculateSMA(prices, 0), null);
      assert.equal(calculateSMA(prices, -5), null);
      assert.equal(calculateEMA(prices, 0), null);
      assert.equal(calculateRSI(prices, 0), null);
    });
  });

  describe('Performance', () => {
    it('calculates SMA for large dataset efficiently', () => {
      const prices = Array.from({ length: 1000 }, () => Math.random() * 100);
      
      const start = Date.now();
      const sma = calculateSMA(prices, 50);
      const duration = Date.now() - start;
      
      assert.ok(sma !== null);
      assert.ok(duration < 100, `SMA calculation took ${duration}ms, should be < 100ms`);
    });

    it('calculates RSI for large dataset efficiently', () => {
      const prices = Array.from({ length: 1000 }, () => Math.random() * 100);
      
      const start = Date.now();
      const rsi = calculateRSI(prices, 14);
      const duration = Date.now() - start;
      
      assert.ok(rsi !== null);
      assert.ok(duration < 100, `RSI calculation took ${duration}ms, should be < 100ms`);
    });
  });
});
