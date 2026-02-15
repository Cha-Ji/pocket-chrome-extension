import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  calculateMACD,
  calculateStochastic,
  calculateStochasticFromCloses,
  calculateTripleStochastic,
  calculateTripleStochasticFromCloses,
  getTripleStochasticZone,
  crossAbove,
  crossBelow,
  calculateCCI,
  calculateWilliamsR,
  calculateSMMA,
  calculateTrueRange,
  calculateATR,
  calculateStochRSI,
  calculateStochasticRSI,
  calculateADX,
  calculateVWAP,
  calculateVWAPFromCandles,
  CCI,
  WilliamsR,
  SMMA,
  ATR,
  StochRSI,
  StochasticRSI,
  ADX,
  VWAP,
} from './index';

describe('Technical Indicators', () => {
  // ============================================================
  // SMA Tests
  // ============================================================
  describe('calculateSMA', () => {
    it('should calculate SMA correctly', () => {
      const data = [1, 2, 3, 4, 5];
      expect(calculateSMA(data, 3)).toBe(4); // (3+4+5)/3
      expect(calculateSMA(data, 5)).toBe(3); // (1+2+3+4+5)/5
    });

    it('should return null for insufficient data', () => {
      expect(calculateSMA([1, 2], 3)).toBeNull();
      expect(calculateSMA([], 1)).toBeNull();
    });

    it('should return null for invalid period', () => {
      expect(calculateSMA([1, 2, 3], 0)).toBeNull();
      expect(calculateSMA([1, 2, 3], -1)).toBeNull();
    });
  });

  // ============================================================
  // EMA Tests
  // ============================================================
  describe('calculateEMA', () => {
    it('should calculate EMA correctly', () => {
      const data = [10, 11, 12, 13, 14, 15];
      const ema = calculateEMA(data, 3);
      expect(ema).not.toBeNull();
      expect(ema).toBeGreaterThan(13); // EMA should weight recent values more
    });

    it('should return null for insufficient data', () => {
      expect(calculateEMA([1, 2], 3)).toBeNull();
    });
  });

  // ============================================================
  // RSI Tests
  // ============================================================
  describe('calculateRSI', () => {
    it('should return 100 for all gains', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
      const rsi = calculateRSI(data, 14);
      expect(rsi).toBe(100);
    });

    it('should return value between 0 and 100', () => {
      const data = [
        44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
        46.28, 46.28, 46.0,
      ];
      const rsi = calculateRSI(data, 14);
      expect(rsi).not.toBeNull();
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    it('should return null for insufficient data', () => {
      expect(calculateRSI([1, 2, 3], 14)).toBeNull();
    });
  });

  // ============================================================
  // Bollinger Bands Tests
  // ============================================================
  describe('calculateBollingerBands', () => {
    it('should calculate bands correctly', () => {
      const data = Array(20).fill(100); // Flat line
      const bands = calculateBollingerBands(data, 20, 2);

      expect(bands).not.toBeNull();
      expect(bands?.middle).toBe(100);
      expect(bands?.upper).toBe(100); // No deviation = bands at middle
      expect(bands?.lower).toBe(100);
    });

    it('should have upper > middle > lower for varying data', () => {
      const data = [
        98, 99, 100, 101, 102, 101, 100, 99, 98, 99, 100, 101, 102, 101, 100, 99, 98, 99, 100, 101,
      ];
      const bands = calculateBollingerBands(data, 20, 2);

      expect(bands).not.toBeNull();
      expect(bands!.upper).toBeGreaterThan(bands!.middle);
      expect(bands!.middle).toBeGreaterThan(bands!.lower);
    });

    it('should return null for insufficient data', () => {
      expect(calculateBollingerBands([1, 2, 3], 20)).toBeNull();
    });
  });

  // ============================================================
  // MACD Tests
  // ============================================================
  describe('calculateMACD', () => {
    it('should calculate MACD components', () => {
      // Generate trending data
      const data = Array(50)
        .fill(0)
        .map((_, i) => 100 + i * 0.5);
      const macd = calculateMACD(data, 12, 26, 9);

      expect(macd).not.toBeNull();
      expect(macd).toHaveProperty('macd');
      expect(macd).toHaveProperty('signal');
      expect(macd).toHaveProperty('histogram');
    });

    it('should have positive MACD in uptrend', () => {
      const data = Array(50)
        .fill(0)
        .map((_, i) => 100 + i * 2); // Strong uptrend
      const macd = calculateMACD(data, 12, 26, 9);

      expect(macd?.macd).toBeGreaterThan(0);
    });

    it('should return null for insufficient data', () => {
      expect(calculateMACD(Array(20).fill(100), 12, 26, 9)).toBeNull();
    });
  });

  // ============================================================
  // Stochastic Tests
  // ============================================================
  describe('calculateStochastic', () => {
    it('should calculate stochastic correctly', () => {
      // Generate sample OHLC data
      const highs = [
        44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
        46.28, 46.28, 46.0, 46.03, 46.41,
      ];
      const lows = [
        43.94, 43.72, 43.89, 43.21, 43.98, 44.23, 44.52, 44.96, 45.23, 45.45, 45.34, 45.48, 45.15,
        45.81, 45.91, 45.53, 45.56, 45.94,
      ];
      const closes = [
        44.09, 43.96, 44.02, 43.55, 44.22, 44.76, 44.95, 45.3, 45.65, 45.95, 45.72, 45.89, 45.35,
        46.12, 46.08, 45.89, 45.98, 46.35,
      ];

      const stoch = calculateStochastic(highs, lows, closes, 14, 3);

      expect(stoch).not.toBeNull();
      expect(stoch!.k).toBeGreaterThanOrEqual(0);
      expect(stoch!.k).toBeLessThanOrEqual(100);
      expect(stoch!.d).toBeGreaterThanOrEqual(0);
      expect(stoch!.d).toBeLessThanOrEqual(100);
    });

    it('should return 100 at highest point', () => {
      // Price at highest high
      const highs = Array(14).fill(100);
      const lows = Array(14).fill(90);
      const closes = Array(14).fill(100); // Close at high

      const stoch = calculateStochastic(highs, lows, closes, 14, 1);
      expect(stoch?.k).toBe(100);
    });

    it('should return 0 at lowest point', () => {
      // Price at lowest low
      const highs = Array(14).fill(100);
      const lows = Array(14).fill(90);
      const closes = Array(14).fill(90); // Close at low

      const stoch = calculateStochastic(highs, lows, closes, 14, 1);
      expect(stoch?.k).toBe(0);
    });

    it('should return 50 at midpoint', () => {
      const highs = Array(14).fill(100);
      const lows = Array(14).fill(90);
      const closes = Array(14).fill(95); // Close at midpoint

      const stoch = calculateStochastic(highs, lows, closes, 14, 1);
      expect(stoch?.k).toBe(50);
    });

    it('should return null for insufficient data', () => {
      expect(calculateStochastic([1, 2], [1, 2], [1, 2], 14, 3)).toBeNull();
    });

    it('should handle flat prices (no range)', () => {
      const flatPrices = Array(20).fill(100);
      const stoch = calculateStochastic(flatPrices, flatPrices, flatPrices, 14, 3);

      expect(stoch).not.toBeNull();
      expect(stoch?.k).toBe(50); // Default when range is 0
    });
  });

  describe('calculateStochasticFromCloses', () => {
    it('should calculate stochastic from close prices only', () => {
      const data = Array(20)
        .fill(0)
        .map((_, i) => 100 + Math.sin(i) * 5);
      const stoch = calculateStochasticFromCloses(data, 14, 3);

      expect(stoch).not.toBeNull();
      expect(stoch!.k).toBeGreaterThanOrEqual(0);
      expect(stoch!.k).toBeLessThanOrEqual(100);
    });

    it('should return null for insufficient data', () => {
      expect(calculateStochasticFromCloses([1, 2, 3], 14, 3)).toBeNull();
    });
  });

  // ============================================================
  // Triple Stochastic Tests (고승덕 3스토캐스틱)
  // ============================================================
  describe('calculateTripleStochastic', () => {
    it('should calculate all three stochastics', () => {
      // Generate enough data for long-term (20+12 = 32 points needed)
      const data = Array(50)
        .fill(0)
        .map((_, i) => 100 + Math.sin(i * 0.5) * 10);

      const triple = calculateTripleStochastic(data, data, data);

      expect(triple.short).not.toBeNull();
      expect(triple.mid).not.toBeNull();
      expect(triple.long).not.toBeNull();
    });

    it('should use default params (5,3), (10,6), (20,12)', () => {
      const data = Array(50)
        .fill(0)
        .map((_, i) => 100 + i);

      const triple = calculateTripleStochastic(data, data, data);

      // All should be valid with enough data
      expect(triple.short).not.toBeNull();
      expect(triple.mid).not.toBeNull();
      expect(triple.long).not.toBeNull();
    });

    it('should return null for short-term with insufficient data', () => {
      const data = [1, 2, 3]; // Too short
      const triple = calculateTripleStochastic(data, data, data);

      expect(triple.short).toBeNull();
      expect(triple.mid).toBeNull();
      expect(triple.long).toBeNull();
    });

    it('should allow custom params', () => {
      const data = Array(30)
        .fill(0)
        .map((_, i) => 100 + i);

      const triple = calculateTripleStochastic(
        data,
        data,
        data,
        [3, 2], // custom short
        [7, 4], // custom mid
        [14, 7], // custom long
      );

      expect(triple.short).not.toBeNull();
      expect(triple.mid).not.toBeNull();
      expect(triple.long).not.toBeNull();
    });
  });

  describe('calculateTripleStochasticFromCloses', () => {
    it('should work with close prices only', () => {
      const data = Array(50)
        .fill(0)
        .map((_, i) => 100 + Math.sin(i) * 5);
      const triple = calculateTripleStochasticFromCloses(data);

      expect(triple.short).not.toBeNull();
      expect(triple.mid).not.toBeNull();
      expect(triple.long).not.toBeNull();
    });
  });

  describe('getTripleStochasticZone', () => {
    it('should detect all overbought', () => {
      // All values above 80
      const triple = {
        short: { k: 85, d: 82 },
        mid: { k: 90, d: 88 },
        long: { k: 81, d: 80 },
      };

      const zone = getTripleStochasticZone(triple);

      expect(zone.short).toBe('overbought');
      expect(zone.mid).toBe('overbought');
      expect(zone.long).toBe('overbought');
      expect(zone.allOverbought).toBe(true);
      expect(zone.allOversold).toBe(false);
    });

    it('should detect all oversold', () => {
      // All values below 20
      const triple = {
        short: { k: 15, d: 18 },
        mid: { k: 10, d: 12 },
        long: { k: 19, d: 20 },
      };

      const zone = getTripleStochasticZone(triple);

      expect(zone.short).toBe('oversold');
      expect(zone.mid).toBe('oversold');
      expect(zone.long).toBe('oversold');
      expect(zone.allOversold).toBe(true);
      expect(zone.allOverbought).toBe(false);
    });

    it('should detect neutral zone', () => {
      const triple = {
        short: { k: 50, d: 50 },
        mid: { k: 50, d: 50 },
        long: { k: 50, d: 50 },
      };

      const zone = getTripleStochasticZone(triple);

      expect(zone.short).toBe('neutral');
      expect(zone.mid).toBe('neutral');
      expect(zone.long).toBe('neutral');
      expect(zone.allOverbought).toBe(false);
      expect(zone.allOversold).toBe(false);
    });

    it('should handle mixed zones', () => {
      const triple = {
        short: { k: 85, d: 82 }, // overbought
        mid: { k: 50, d: 50 }, // neutral
        long: { k: 15, d: 18 }, // oversold
      };

      const zone = getTripleStochasticZone(triple);

      expect(zone.short).toBe('overbought');
      expect(zone.mid).toBe('neutral');
      expect(zone.long).toBe('oversold');
      expect(zone.allOverbought).toBe(false);
      expect(zone.allOversold).toBe(false);
    });

    it('should handle null values', () => {
      const triple = {
        short: null,
        mid: { k: 50, d: 50 },
        long: null,
      };

      const zone = getTripleStochasticZone(triple);

      expect(zone.short).toBe('neutral');
      expect(zone.mid).toBe('neutral');
      expect(zone.long).toBe('neutral');
    });

    it('should allow custom thresholds', () => {
      const triple = {
        short: { k: 75, d: 72 },
        mid: { k: 75, d: 72 },
        long: { k: 75, d: 72 },
      };

      // With default 80/20, this would be neutral
      const defaultZone = getTripleStochasticZone(triple);
      expect(defaultZone.allOverbought).toBe(false);

      // With custom 70/30, this is overbought
      const customZone = getTripleStochasticZone(triple, 70, 30);
      expect(customZone.allOverbought).toBe(true);
    });
  });

  // ============================================================
  // Cross Detection Tests
  // ============================================================
  describe('crossAbove', () => {
    it('should detect cross above', () => {
      expect(crossAbove(31, 29, 30)).toBe(true);
      expect(crossAbove(29, 31, 30)).toBe(false);
      expect(crossAbove(31, 31, 30)).toBe(false);
    });
  });

  describe('crossBelow', () => {
    it('should detect cross below', () => {
      expect(crossBelow(29, 31, 30)).toBe(true);
      expect(crossBelow(31, 29, 30)).toBe(false);
      expect(crossBelow(29, 29, 30)).toBe(false);
    });
  });

  // ============================================================
  // CCI Tests
  // ============================================================
  describe('calculateCCI', () => {
    it('should calculate CCI correctly', () => {
      const highs = Array(25)
        .fill(0)
        .map((_, i) => 100 + i + Math.sin(i) * 2);
      const lows = Array(25)
        .fill(0)
        .map((_, i) => 98 + i + Math.sin(i) * 2);
      const closes = Array(25)
        .fill(0)
        .map((_, i) => 99 + i + Math.sin(i) * 2);

      const cci = calculateCCI(highs, lows, closes, 20);
      expect(cci).not.toBeNull();
      expect(typeof cci).toBe('number');
    });

    it('should return null for insufficient data', () => {
      expect(calculateCCI([1, 2], [1, 2], [1, 2], 20)).toBeNull();
    });

    it('should handle zero mean deviation', () => {
      const flat = Array(25).fill(100);
      const cci = calculateCCI(flat, flat, flat, 20);
      expect(cci).toBe(0);
    });
  });

  describe('CCI class-style', () => {
    it('should calculate series', () => {
      const highs = Array(30)
        .fill(0)
        .map((_, i) => 100 + i);
      const lows = Array(30)
        .fill(0)
        .map((_, i) => 98 + i);
      const closes = Array(30)
        .fill(0)
        .map((_, i) => 99 + i);

      const series = CCI.calculate(highs, lows, closes, 20);
      expect(series.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Williams %R Tests
  // ============================================================
  describe('calculateWilliamsR', () => {
    it('should calculate Williams %R correctly', () => {
      const highs = Array(20)
        .fill(0)
        .map((_, i) => 100 + Math.sin(i) * 5);
      const lows = Array(20)
        .fill(0)
        .map((_, i) => 95 + Math.sin(i) * 5);
      const closes = Array(20)
        .fill(0)
        .map((_, i) => 97 + Math.sin(i) * 5);

      const wr = calculateWilliamsR(highs, lows, closes, 14);
      expect(wr).not.toBeNull();
      expect(wr).toBeGreaterThanOrEqual(-100);
      expect(wr).toBeLessThanOrEqual(0);
    });

    it('should return 0 at highest high', () => {
      const highs = Array(14).fill(100);
      const lows = Array(14).fill(90);
      const closes = Array(14).fill(100);

      const wr = calculateWilliamsR(highs, lows, closes, 14);
      expect(wr).toBeCloseTo(0, 10);
    });

    it('should return -100 at lowest low', () => {
      const highs = Array(14).fill(100);
      const lows = Array(14).fill(90);
      const closes = Array(14).fill(90);

      const wr = calculateWilliamsR(highs, lows, closes, 14);
      expect(wr).toBe(-100);
    });

    it('should return null for insufficient data', () => {
      expect(calculateWilliamsR([1, 2], [1, 2], [1, 2], 14)).toBeNull();
    });
  });

  describe('WilliamsR class-style', () => {
    it('should calculate series', () => {
      const highs = Array(20)
        .fill(0)
        .map((_, i) => 100 + i);
      const lows = Array(20)
        .fill(0)
        .map((_, i) => 98 + i);
      const closes = Array(20)
        .fill(0)
        .map((_, i) => 99 + i);

      const series = WilliamsR.calculate(highs, lows, closes, 14);
      expect(series.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // SMMA Tests
  // ============================================================
  describe('calculateSMMA', () => {
    it('should calculate SMMA correctly', () => {
      const data = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const smma = calculateSMMA(data, 5);
      expect(smma).not.toBeNull();
      expect(typeof smma).toBe('number');
    });

    it('should return null for insufficient data', () => {
      expect(calculateSMMA([1, 2], 5)).toBeNull();
    });

    it('should return SMA for first value', () => {
      const data = [10, 11, 12, 13, 14];
      const smma = calculateSMMA(data, 5);
      const expectedSMA = (10 + 11 + 12 + 13 + 14) / 5;
      expect(smma).toBe(expectedSMA);
    });
  });

  describe('SMMA class-style', () => {
    it('should calculate series', () => {
      const data = Array(20)
        .fill(0)
        .map((_, i) => 100 + i);
      const series = SMMA.calculate(data, 5);
      expect(series.length).toBe(data.length - 5 + 1);
    });

    it('should calculate multiple periods', () => {
      const data = Array(30)
        .fill(0)
        .map((_, i) => 100 + i);
      const result = SMMA.calculateMultiple(data, [5, 10, 15]);
      expect(result.size).toBe(3);
      expect(result.get(5)!.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // ATR Tests
  // ============================================================
  describe('calculateTrueRange', () => {
    it('should calculate true range correctly', () => {
      expect(calculateTrueRange(110, 100, 105)).toBe(10);
      expect(calculateTrueRange(120, 110, 100)).toBe(20);
      expect(calculateTrueRange(105, 90, 110)).toBe(20);
    });
  });

  describe('calculateATR', () => {
    it('should calculate ATR correctly', () => {
      const highs = Array(20)
        .fill(0)
        .map((_, i) => 110 + Math.sin(i) * 5);
      const lows = Array(20)
        .fill(0)
        .map((_, i) => 100 + Math.sin(i) * 5);
      const closes = Array(20)
        .fill(0)
        .map((_, i) => 105 + Math.sin(i) * 5);

      const atr = calculateATR(highs, lows, closes, 14);
      expect(atr).not.toBeNull();
      expect(atr).toBeGreaterThan(0);
    });

    it('should return null for insufficient data', () => {
      expect(calculateATR([1, 2], [1, 2], [1, 2], 14)).toBeNull();
    });
  });

  describe('ATR class-style', () => {
    it('should calculate series', () => {
      const highs = Array(20)
        .fill(0)
        .map((_, i) => 110 + i);
      const lows = Array(20)
        .fill(0)
        .map((_, i) => 100 + i);
      const closes = Array(20)
        .fill(0)
        .map((_, i) => 105 + i);

      const series = ATR.calculate(highs, lows, closes, 14);
      expect(series.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Stochastic RSI Tests
  // ============================================================
  describe('calculateStochRSI', () => {
    it('should calculate Stochastic RSI correctly', () => {
      const data = Array(50)
        .fill(0)
        .map((_, i) => 100 + Math.sin(i * 0.5) * 10);

      const stochRsi = calculateStochRSI(data, 14, 14, 3, 3);
      expect(stochRsi).not.toBeNull();
      expect(stochRsi!.k).toBeGreaterThanOrEqual(0);
      expect(stochRsi!.k).toBeLessThanOrEqual(100);
      expect(stochRsi!.d).toBeGreaterThanOrEqual(0);
      expect(stochRsi!.d).toBeLessThanOrEqual(100);
    });

    it('should return null for insufficient data', () => {
      expect(calculateStochRSI([1, 2, 3, 4, 5], 14, 14, 3, 3)).toBeNull();
    });

    it('should have alias calculateStochasticRSI', () => {
      expect(calculateStochasticRSI).toBe(calculateStochRSI);
    });

    it('should have alias StochasticRSI', () => {
      expect(StochasticRSI).toBe(StochRSI);
    });
  });

  describe('StochRSI class-style', () => {
    it('should calculate series', () => {
      const data = Array(60)
        .fill(0)
        .map((_, i) => 100 + Math.sin(i * 0.3) * 10);
      const series = StochRSI.calculate(data, 14, 14, 3, 3);
      expect(series.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // ADX Tests
  // ============================================================
  describe('calculateADX', () => {
    it('should calculate ADX correctly', () => {
      const highs = Array(35)
        .fill(0)
        .map((_, i) => 100 + i * 2 + Math.sin(i));
      const lows = Array(35)
        .fill(0)
        .map((_, i) => 98 + i * 2 + Math.sin(i));
      const closes = Array(35)
        .fill(0)
        .map((_, i) => 99 + i * 2 + Math.sin(i));

      const adx = calculateADX(highs, lows, closes, 14);
      expect(adx).not.toBeNull();
      expect(adx!.adx).toBeGreaterThanOrEqual(0);
      expect(adx!.adx).toBeLessThanOrEqual(100);
      expect(adx!.plusDI).toBeGreaterThanOrEqual(0);
      expect(adx!.minusDI).toBeGreaterThanOrEqual(0);
    });

    it('should return null for insufficient data', () => {
      expect(calculateADX([1, 2, 3], [1, 2, 3], [1, 2, 3], 14)).toBeNull();
    });

    it('should show higher +DI in uptrend', () => {
      const highs = Array(35)
        .fill(0)
        .map((_, i) => 100 + i * 3);
      const lows = Array(35)
        .fill(0)
        .map((_, i) => 98 + i * 3);
      const closes = Array(35)
        .fill(0)
        .map((_, i) => 99 + i * 3);

      const adx = calculateADX(highs, lows, closes, 14);
      expect(adx!.plusDI).toBeGreaterThan(adx!.minusDI);
    });

    it('should show higher -DI in downtrend', () => {
      const highs = Array(35)
        .fill(0)
        .map((_, i) => 200 - i * 3);
      const lows = Array(35)
        .fill(0)
        .map((_, i) => 198 - i * 3);
      const closes = Array(35)
        .fill(0)
        .map((_, i) => 199 - i * 3);

      const adx = calculateADX(highs, lows, closes, 14);
      expect(adx!.minusDI).toBeGreaterThan(adx!.plusDI);
    });
  });

  describe('ADX class-style', () => {
    it('should calculate series', () => {
      const highs = Array(35)
        .fill(0)
        .map((_, i) => 100 + i);
      const lows = Array(35)
        .fill(0)
        .map((_, i) => 98 + i);
      const closes = Array(35)
        .fill(0)
        .map((_, i) => 99 + i);

      const series = ADX.calculate(highs, lows, closes, 14);
      expect(series.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // VWAP Tests
  // ============================================================
  describe('calculateVWAP', () => {
    it('should calculate VWAP correctly', () => {
      const highs = [110, 112, 115, 113, 114];
      const lows = [108, 109, 111, 110, 111];
      const closes = [109, 111, 113, 112, 113];
      const volumes = [1000, 1500, 2000, 1200, 1800];

      const vwap = calculateVWAP(highs, lows, closes, volumes);
      expect(vwap).not.toBeNull();

      const tp = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
      const sumTPV = tp.reduce((sum, t, i) => sum + t * volumes[i], 0);
      const sumV = volumes.reduce((a, b) => a + b, 0);
      const expectedVWAP = sumTPV / sumV;

      expect(vwap).toBeCloseTo(expectedVWAP, 10);
    });

    it('should return null for empty data', () => {
      expect(calculateVWAP([], [], [], [])).toBeNull();
    });

    it('should return null for zero volume', () => {
      const highs = [110, 112];
      const lows = [108, 109];
      const closes = [109, 111];
      const volumes = [0, 0];

      expect(calculateVWAP(highs, lows, closes, volumes)).toBeNull();
    });
  });

  describe('calculateVWAPFromCandles', () => {
    it('should calculate VWAP from candles', () => {
      const candles = [
        { high: 110, low: 108, close: 109, volume: 1000 },
        { high: 112, low: 109, close: 111, volume: 1500 },
        { high: 115, low: 111, close: 113, volume: 2000 },
      ];

      const vwap = calculateVWAPFromCandles(candles);
      expect(vwap).not.toBeNull();
    });

    it('should handle candles without volume', () => {
      const candles = [
        { high: 110, low: 108, close: 109 },
        { high: 112, low: 109, close: 111 },
      ];

      expect(calculateVWAPFromCandles(candles)).toBeNull();
    });

    it('should return null for empty candles', () => {
      expect(calculateVWAPFromCandles([])).toBeNull();
    });
  });

  describe('VWAP class-style', () => {
    it('should calculate series', () => {
      const highs = [110, 112, 115, 113, 114];
      const lows = [108, 109, 111, 110, 111];
      const closes = [109, 111, 113, 112, 113];
      const volumes = [1000, 1500, 2000, 1200, 1800];

      const series = VWAP.calculate(highs, lows, closes, volumes);
      expect(series.length).toBe(5);
    });

    it('should calculate from candles', () => {
      const candles = [
        { high: 110, low: 108, close: 109, volume: 1000 },
        { high: 112, low: 109, close: 111, volume: 1500 },
      ];

      const vwap = VWAP.fromCandles(candles);
      expect(vwap).not.toBeNull();
    });
  });
});
