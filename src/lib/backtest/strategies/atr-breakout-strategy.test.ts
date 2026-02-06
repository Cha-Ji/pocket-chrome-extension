// ============================================================
// ATR Breakout Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  ATRChannelBreakout,
  ATRVolatilityExpansion,
  ATRTrendFollowing,
  ATRStrategies,
} from './atr-breakout-strategy'
import { Candle } from '../types'

// ============================================================
// Test Data Generators
// ============================================================

function generateBreakoutData(count: number = 50): Candle[] {
  const candles: Candle[] = []
  let price = 100

  // Consolidation phase
  for (let i = 0; i < count * 0.7; i++) {
    const change = (Math.random() - 0.5) * 0.3
    price = price * (1 + change / 100)

    const volatility = Math.random() * 0.2 + 0.1
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - volatility / 2,
      high: price + volatility,
      low: price - volatility,
      close: price + volatility / 2,
    })
  }

  // Breakout phase
  for (let i = Math.floor(count * 0.7); i < count; i++) {
    const rise = Math.random() * 1.5 + 0.5
    price = price * (1 + rise / 100)

    const volatility = Math.random() * 0.5 + 0.3
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - volatility,
      high: price + volatility,
      low: price - volatility * 0.5,
      close: price,
    })
  }

  return candles
}

function generateVolatileData(count: number = 50): Candle[] {
  const candles: Candle[] = []
  let price = 100

  for (let i = 0; i < count; i++) {
    const volatilityFactor = i > count * 0.7 ? 3 : 1
    const change = (Math.random() - 0.5) * volatilityFactor
    price = price * (1 + change / 100)

    const volatility = (Math.random() * 0.3 + 0.2) * volatilityFactor
    const open = price - volatility / 2
    const close = price + volatility / 2
    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high: Math.max(open, close) + volatility,
      low: Math.min(open, close) - volatility,
      close,
    })
  }

  return candles
}

function generateTrendingData(count: number = 50, direction: 'up' | 'down' = 'up'): Candle[] {
  const candles: Candle[] = []
  let price = 100

  for (let i = 0; i < count; i++) {
    const trend = direction === 'up' ? 0.3 : -0.3
    const noise = (Math.random() - 0.5) * 0.2
    price = price * (1 + (trend + noise) / 100)

    const volatility = Math.random() * 0.2 + 0.1
    const open = direction === 'up' ? price - volatility : price + volatility
    const close = price
    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high: Math.max(open, close) + volatility * 0.5,
      low: Math.min(open, close) - volatility * 0.5,
      close,
    })
  }

  return candles
}

// ============================================================
// ATRChannelBreakout Tests
// ============================================================

describe('ATRChannelBreakout Strategy', () => {
  const defaultParams = {
    atrPeriod: 14,
    multiplier: 1.5,
    lookback: 20,
  }

  it('should have correct strategy metadata', () => {
    expect(ATRChannelBreakout.id).toBe('atr-channel-breakout')
    expect(ATRChannelBreakout.name).toBe('ATR Channel Breakout')
    expect(ATRChannelBreakout.params).toHaveProperty('atrPeriod')
    expect(ATRChannelBreakout.params).toHaveProperty('multiplier')
    expect(ATRChannelBreakout.params).toHaveProperty('lookback')
  })

  it('should return null with insufficient data', () => {
    const candles = generateBreakoutData(10)
    const result = ATRChannelBreakout.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with valid data', () => {
    const candles = generateBreakoutData(50)
    const result = ATRChannelBreakout.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('confidence')
    expect(result).toHaveProperty('indicators')
  })

  it('should include ATR and breakout levels in indicators', () => {
    const candles = generateBreakoutData(50)
    const result = ATRChannelBreakout.generateSignal(candles, defaultParams)
    expect(result?.indicators).toHaveProperty('atr')
    expect(result?.indicators).toHaveProperty('upperBreakout')
    expect(result?.indicators).toHaveProperty('lowerBreakout')
    expect(result?.indicators).toHaveProperty('prevHigh')
    expect(result?.indicators).toHaveProperty('prevLow')
  })

  it('should have confidence between 0 and 1', () => {
    const candles = generateBreakoutData(100)
    const result = ATRChannelBreakout.generateSignal(candles, defaultParams)
    expect(result?.confidence).toBeGreaterThanOrEqual(0)
    expect(result?.confidence).toBeLessThanOrEqual(1)
  })
})

// ============================================================
// ATRVolatilityExpansion Tests
// ============================================================

describe('ATRVolatilityExpansion Strategy', () => {
  const defaultParams = {
    atrPeriod: 14,
    expansionMultiplier: 1.5,
    avgPeriod: 20,
  }

  it('should have correct strategy metadata', () => {
    expect(ATRVolatilityExpansion.id).toBe('atr-volatility-expansion')
    expect(ATRVolatilityExpansion.name).toBe('ATR Volatility Expansion')
    expect(ATRVolatilityExpansion.params).toHaveProperty('atrPeriod')
    expect(ATRVolatilityExpansion.params).toHaveProperty('expansionMultiplier')
    expect(ATRVolatilityExpansion.params).toHaveProperty('avgPeriod')
  })

  it('should return null with insufficient data', () => {
    const candles = generateVolatileData(10)
    const result = ATRVolatilityExpansion.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with valid data', () => {
    const candles = generateVolatileData(60)
    const result = ATRVolatilityExpansion.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('indicators')
  })

  it('should include ATR ratio in indicators', () => {
    const candles = generateVolatileData(60)
    const result = ATRVolatilityExpansion.generateSignal(candles, defaultParams)
    expect(result?.indicators).toHaveProperty('atr')
    expect(result?.indicators).toHaveProperty('avgAtr')
    expect(result?.indicators).toHaveProperty('ratio')
  })
})

// ============================================================
// ATRTrendFollowing Tests
// ============================================================

describe('ATRTrendFollowing Strategy', () => {
  const defaultParams = {
    atrPeriod: 14,
    emaPeriod: 20,
    atrMultiplier: 2.0,
  }

  it('should have correct strategy metadata', () => {
    expect(ATRTrendFollowing.id).toBe('atr-trend-following')
    expect(ATRTrendFollowing.name).toBe('ATR Trend Following')
    expect(ATRTrendFollowing.params).toHaveProperty('atrPeriod')
    expect(ATRTrendFollowing.params).toHaveProperty('emaPeriod')
    expect(ATRTrendFollowing.params).toHaveProperty('atrMultiplier')
  })

  it('should return null with insufficient data', () => {
    const candles = generateTrendingData(10)
    const result = ATRTrendFollowing.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with valid trending data', () => {
    const candles = generateTrendingData(50, 'up')
    const result = ATRTrendFollowing.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('indicators')
  })

  it('should include trend bands in indicators', () => {
    const candles = generateTrendingData(50, 'up')
    const result = ATRTrendFollowing.generateSignal(candles, defaultParams)
    expect(result?.indicators).toHaveProperty('atr')
    expect(result?.indicators).toHaveProperty('ema')
    expect(result?.indicators).toHaveProperty('upperBand')
    expect(result?.indicators).toHaveProperty('lowerBand')
  })
})

// ============================================================
// ATRStrategies Array Tests
// ============================================================

describe('ATRStrategies Collection', () => {
  it('should export 3 strategies', () => {
    expect(ATRStrategies).toHaveLength(3)
  })

  it('should include all ATR strategies', () => {
    const ids = ATRStrategies.map(s => s.id)
    expect(ids).toContain('atr-channel-breakout')
    expect(ids).toContain('atr-volatility-expansion')
    expect(ids).toContain('atr-trend-following')
  })

  it('all strategies should implement the Strategy interface', () => {
    ATRStrategies.forEach(strategy => {
      expect(strategy).toHaveProperty('id')
      expect(strategy).toHaveProperty('name')
      expect(strategy).toHaveProperty('description')
      expect(strategy).toHaveProperty('params')
      expect(strategy).toHaveProperty('generateSignal')
      expect(typeof strategy.generateSignal).toBe('function')
    })
  })
})
