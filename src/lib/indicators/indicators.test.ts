import { describe, it, expect } from 'vitest'
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
} from './index'

describe('Technical Indicators', () => {
  // ============================================================
  // SMA Tests
  // ============================================================
  describe('calculateSMA', () => {
    it('should calculate SMA correctly', () => {
      const data = [1, 2, 3, 4, 5]
      expect(calculateSMA(data, 3)).toBe(4) // (3+4+5)/3
      expect(calculateSMA(data, 5)).toBe(3) // (1+2+3+4+5)/5
    })

    it('should return null for insufficient data', () => {
      expect(calculateSMA([1, 2], 3)).toBeNull()
      expect(calculateSMA([], 1)).toBeNull()
    })

    it('should return null for invalid period', () => {
      expect(calculateSMA([1, 2, 3], 0)).toBeNull()
      expect(calculateSMA([1, 2, 3], -1)).toBeNull()
    })
  })

  // ============================================================
  // EMA Tests
  // ============================================================
  describe('calculateEMA', () => {
    it('should calculate EMA correctly', () => {
      const data = [10, 11, 12, 13, 14, 15]
      const ema = calculateEMA(data, 3)
      expect(ema).not.toBeNull()
      expect(ema).toBeGreaterThan(13) // EMA should weight recent values more
    })

    it('should return null for insufficient data', () => {
      expect(calculateEMA([1, 2], 3)).toBeNull()
    })
  })

  // ============================================================
  // RSI Tests
  // ============================================================
  describe('calculateRSI', () => {
    it('should return 100 for all gains', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
      const rsi = calculateRSI(data, 14)
      expect(rsi).toBe(100)
    })

    it('should return value between 0 and 100', () => {
      const data = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 
                    46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00]
      const rsi = calculateRSI(data, 14)
      expect(rsi).not.toBeNull()
      expect(rsi).toBeGreaterThanOrEqual(0)
      expect(rsi).toBeLessThanOrEqual(100)
    })

    it('should return null for insufficient data', () => {
      expect(calculateRSI([1, 2, 3], 14)).toBeNull()
    })
  })

  // ============================================================
  // Bollinger Bands Tests
  // ============================================================
  describe('calculateBollingerBands', () => {
    it('should calculate bands correctly', () => {
      const data = Array(20).fill(100) // Flat line
      const bands = calculateBollingerBands(data, 20, 2)
      
      expect(bands).not.toBeNull()
      expect(bands?.middle).toBe(100)
      expect(bands?.upper).toBe(100) // No deviation = bands at middle
      expect(bands?.lower).toBe(100)
    })

    it('should have upper > middle > lower for varying data', () => {
      const data = [98, 99, 100, 101, 102, 101, 100, 99, 98, 99, 
                    100, 101, 102, 101, 100, 99, 98, 99, 100, 101]
      const bands = calculateBollingerBands(data, 20, 2)
      
      expect(bands).not.toBeNull()
      expect(bands!.upper).toBeGreaterThan(bands!.middle)
      expect(bands!.middle).toBeGreaterThan(bands!.lower)
    })

    it('should return null for insufficient data', () => {
      expect(calculateBollingerBands([1, 2, 3], 20)).toBeNull()
    })
  })

  // ============================================================
  // MACD Tests
  // ============================================================
  describe('calculateMACD', () => {
    it('should calculate MACD components', () => {
      // Generate trending data
      const data = Array(50).fill(0).map((_, i) => 100 + i * 0.5)
      const macd = calculateMACD(data, 12, 26, 9)
      
      expect(macd).not.toBeNull()
      expect(macd).toHaveProperty('macd')
      expect(macd).toHaveProperty('signal')
      expect(macd).toHaveProperty('histogram')
    })

    it('should have positive MACD in uptrend', () => {
      const data = Array(50).fill(0).map((_, i) => 100 + i * 2) // Strong uptrend
      const macd = calculateMACD(data, 12, 26, 9)
      
      expect(macd?.macd).toBeGreaterThan(0)
    })

    it('should return null for insufficient data', () => {
      expect(calculateMACD(Array(20).fill(100), 12, 26, 9)).toBeNull()
    })
  })

  // ============================================================
  // Stochastic Tests
  // ============================================================
  describe('calculateStochastic', () => {
    it('should calculate stochastic correctly', () => {
      // Generate sample OHLC data
      const highs = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84,
                     46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41]
      const lows = [43.94, 43.72, 43.89, 43.21, 43.98, 44.23, 44.52, 44.96, 45.23,
                    45.45, 45.34, 45.48, 45.15, 45.81, 45.91, 45.53, 45.56, 45.94]
      const closes = [44.09, 43.96, 44.02, 43.55, 44.22, 44.76, 44.95, 45.30, 45.65,
                      45.95, 45.72, 45.89, 45.35, 46.12, 46.08, 45.89, 45.98, 46.35]
      
      const stoch = calculateStochastic(highs, lows, closes, 14, 3)
      
      expect(stoch).not.toBeNull()
      expect(stoch!.k).toBeGreaterThanOrEqual(0)
      expect(stoch!.k).toBeLessThanOrEqual(100)
      expect(stoch!.d).toBeGreaterThanOrEqual(0)
      expect(stoch!.d).toBeLessThanOrEqual(100)
    })

    it('should return 100 at highest point', () => {
      // Price at highest high
      const highs = Array(14).fill(100)
      const lows = Array(14).fill(90)
      const closes = Array(14).fill(100) // Close at high
      
      const stoch = calculateStochastic(highs, lows, closes, 14, 1)
      expect(stoch?.k).toBe(100)
    })

    it('should return 0 at lowest point', () => {
      // Price at lowest low
      const highs = Array(14).fill(100)
      const lows = Array(14).fill(90)
      const closes = Array(14).fill(90) // Close at low
      
      const stoch = calculateStochastic(highs, lows, closes, 14, 1)
      expect(stoch?.k).toBe(0)
    })

    it('should return 50 at midpoint', () => {
      const highs = Array(14).fill(100)
      const lows = Array(14).fill(90)
      const closes = Array(14).fill(95) // Close at midpoint
      
      const stoch = calculateStochastic(highs, lows, closes, 14, 1)
      expect(stoch?.k).toBe(50)
    })

    it('should return null for insufficient data', () => {
      expect(calculateStochastic([1, 2], [1, 2], [1, 2], 14, 3)).toBeNull()
    })

    it('should handle flat prices (no range)', () => {
      const flatPrices = Array(20).fill(100)
      const stoch = calculateStochastic(flatPrices, flatPrices, flatPrices, 14, 3)
      
      expect(stoch).not.toBeNull()
      expect(stoch?.k).toBe(50) // Default when range is 0
    })
  })

  describe('calculateStochasticFromCloses', () => {
    it('should calculate stochastic from close prices only', () => {
      const data = Array(20).fill(0).map((_, i) => 100 + Math.sin(i) * 5)
      const stoch = calculateStochasticFromCloses(data, 14, 3)
      
      expect(stoch).not.toBeNull()
      expect(stoch!.k).toBeGreaterThanOrEqual(0)
      expect(stoch!.k).toBeLessThanOrEqual(100)
    })

    it('should return null for insufficient data', () => {
      expect(calculateStochasticFromCloses([1, 2, 3], 14, 3)).toBeNull()
    })
  })

  // ============================================================
  // Triple Stochastic Tests (고승덕 3스토캐스틱)
  // ============================================================
  describe('calculateTripleStochastic', () => {
    it('should calculate all three stochastics', () => {
      // Generate enough data for long-term (20+12 = 32 points needed)
      const data = Array(50).fill(0).map((_, i) => 100 + Math.sin(i * 0.5) * 10)
      
      const triple = calculateTripleStochastic(data, data, data)
      
      expect(triple.short).not.toBeNull()
      expect(triple.mid).not.toBeNull()
      expect(triple.long).not.toBeNull()
    })

    it('should use default params (5,3), (10,6), (20,12)', () => {
      const data = Array(50).fill(0).map((_, i) => 100 + i)
      
      const triple = calculateTripleStochastic(data, data, data)
      
      // All should be valid with enough data
      expect(triple.short).not.toBeNull()
      expect(triple.mid).not.toBeNull()
      expect(triple.long).not.toBeNull()
    })

    it('should return null for short-term with insufficient data', () => {
      const data = [1, 2, 3] // Too short
      const triple = calculateTripleStochastic(data, data, data)
      
      expect(triple.short).toBeNull()
      expect(triple.mid).toBeNull()
      expect(triple.long).toBeNull()
    })

    it('should allow custom params', () => {
      const data = Array(30).fill(0).map((_, i) => 100 + i)
      
      const triple = calculateTripleStochastic(
        data, data, data,
        [3, 2],  // custom short
        [7, 4],  // custom mid
        [14, 7]  // custom long
      )
      
      expect(triple.short).not.toBeNull()
      expect(triple.mid).not.toBeNull()
      expect(triple.long).not.toBeNull()
    })
  })

  describe('calculateTripleStochasticFromCloses', () => {
    it('should work with close prices only', () => {
      const data = Array(50).fill(0).map((_, i) => 100 + Math.sin(i) * 5)
      const triple = calculateTripleStochasticFromCloses(data)
      
      expect(triple.short).not.toBeNull()
      expect(triple.mid).not.toBeNull()
      expect(triple.long).not.toBeNull()
    })
  })

  describe('getTripleStochasticZone', () => {
    it('should detect all overbought', () => {
      // All values above 80
      const triple = {
        short: { k: 85, d: 82 },
        mid: { k: 90, d: 88 },
        long: { k: 81, d: 80 },
      }
      
      const zone = getTripleStochasticZone(triple)
      
      expect(zone.short).toBe('overbought')
      expect(zone.mid).toBe('overbought')
      expect(zone.long).toBe('overbought')
      expect(zone.allOverbought).toBe(true)
      expect(zone.allOversold).toBe(false)
    })

    it('should detect all oversold', () => {
      // All values below 20
      const triple = {
        short: { k: 15, d: 18 },
        mid: { k: 10, d: 12 },
        long: { k: 19, d: 20 },
      }
      
      const zone = getTripleStochasticZone(triple)
      
      expect(zone.short).toBe('oversold')
      expect(zone.mid).toBe('oversold')
      expect(zone.long).toBe('oversold')
      expect(zone.allOversold).toBe(true)
      expect(zone.allOverbought).toBe(false)
    })

    it('should detect neutral zone', () => {
      const triple = {
        short: { k: 50, d: 50 },
        mid: { k: 50, d: 50 },
        long: { k: 50, d: 50 },
      }
      
      const zone = getTripleStochasticZone(triple)
      
      expect(zone.short).toBe('neutral')
      expect(zone.mid).toBe('neutral')
      expect(zone.long).toBe('neutral')
      expect(zone.allOverbought).toBe(false)
      expect(zone.allOversold).toBe(false)
    })

    it('should handle mixed zones', () => {
      const triple = {
        short: { k: 85, d: 82 }, // overbought
        mid: { k: 50, d: 50 },   // neutral
        long: { k: 15, d: 18 },  // oversold
      }
      
      const zone = getTripleStochasticZone(triple)
      
      expect(zone.short).toBe('overbought')
      expect(zone.mid).toBe('neutral')
      expect(zone.long).toBe('oversold')
      expect(zone.allOverbought).toBe(false)
      expect(zone.allOversold).toBe(false)
    })

    it('should handle null values', () => {
      const triple = {
        short: null,
        mid: { k: 50, d: 50 },
        long: null,
      }
      
      const zone = getTripleStochasticZone(triple)
      
      expect(zone.short).toBe('neutral')
      expect(zone.mid).toBe('neutral')
      expect(zone.long).toBe('neutral')
    })

    it('should allow custom thresholds', () => {
      const triple = {
        short: { k: 75, d: 72 },
        mid: { k: 75, d: 72 },
        long: { k: 75, d: 72 },
      }
      
      // With default 80/20, this would be neutral
      const defaultZone = getTripleStochasticZone(triple)
      expect(defaultZone.allOverbought).toBe(false)
      
      // With custom 70/30, this is overbought
      const customZone = getTripleStochasticZone(triple, 70, 30)
      expect(customZone.allOverbought).toBe(true)
    })
  })

  // ============================================================
  // Cross Detection Tests
  // ============================================================
  describe('crossAbove', () => {
    it('should detect cross above', () => {
      expect(crossAbove(31, 29, 30)).toBe(true)
      expect(crossAbove(29, 31, 30)).toBe(false)
      expect(crossAbove(31, 31, 30)).toBe(false)
    })
  })

  describe('crossBelow', () => {
    it('should detect cross below', () => {
      expect(crossBelow(29, 31, 30)).toBe(true)
      expect(crossBelow(31, 29, 30)).toBe(false)
      expect(crossBelow(29, 29, 30)).toBe(false)
    })
  })
})
