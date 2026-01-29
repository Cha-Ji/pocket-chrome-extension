import { describe, it, expect } from 'vitest'
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  calculateMACD,
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
