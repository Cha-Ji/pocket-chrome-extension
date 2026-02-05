// ============================================================
// Stochastic RSI Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  StochRSICrossover,
  StochRSIExtreme,
  StochRSITrend,
  StochRSIWithEMA,
  StochRSIStrategies,
} from './stochastic-rsi-strategy'
import { Candle } from '../types'

// ============================================================
// Test Data Generators
// ============================================================

function generateRangingData(count: number = 60): Candle[] {
  const candles: Candle[] = []
  let price = 100

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.4
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

  return candles
}

function generateOversoldData(count: number = 60): Candle[] {
  const candles: Candle[] = []
  let price = 100

  // Generate consistently falling prices
  for (let i = 0; i < count; i++) {
    const drop = Math.random() * 0.5 + 0.1
    price = price * (1 - drop / 100)

    const volatility = Math.random() * 0.3 + 0.1
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price + volatility,
      high: price + volatility * 1.5,
      low: price - volatility * 0.5,
      close: price,
    })
  }

  return candles
}

function generateOverboughtData(count: number = 60): Candle[] {
  const candles: Candle[] = []
  let price = 100

  // Generate consistently rising prices
  for (let i = 0; i < count; i++) {
    const rise = Math.random() * 0.5 + 0.1
    price = price * (1 + rise / 100)

    const volatility = Math.random() * 0.3 + 0.1
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: price - volatility,
      high: price + volatility * 0.5,
      low: price - volatility * 1.5,
      close: price,
    })
  }

  return candles
}

function generateTrendingData(count: number = 60, direction: 'up' | 'down' = 'up'): Candle[] {
  const candles: Candle[] = []
  let price = 100

  for (let i = 0; i < count; i++) {
    const trend = direction === 'up' ? 0.3 : -0.3
    const noise = (Math.random() - 0.5) * 0.2
    price = price * (1 + (trend + noise) / 100)

    const volatility = Math.random() * 0.2 + 0.1
    candles.push({
      timestamp: Date.now() + i * 60000,
      open: direction === 'up' ? price - volatility : price + volatility,
      high: price + volatility * 0.5,
      low: price - volatility * 0.5,
      close: price,
    })
  }

  return candles
}

// ============================================================
// StochRSICrossover Tests
// ============================================================

describe('StochRSICrossover Strategy', () => {
  const defaultParams = {
    rsiPeriod: 14,
    stochPeriod: 14,
    kSmooth: 3,
    dSmooth: 3,
    oversold: 20,
    overbought: 80,
  }

  it('should have correct strategy metadata', () => {
    expect(StochRSICrossover.id).toBe('stochrsi-crossover')
    expect(StochRSICrossover.name).toBe('Stochastic RSI Crossover')
    expect(StochRSICrossover.params).toHaveProperty('rsiPeriod')
    expect(StochRSICrossover.params).toHaveProperty('stochPeriod')
    expect(StochRSICrossover.params).toHaveProperty('kSmooth')
    expect(StochRSICrossover.params).toHaveProperty('dSmooth')
    expect(StochRSICrossover.params).toHaveProperty('oversold')
    expect(StochRSICrossover.params).toHaveProperty('overbought')
  })

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(20)
    const result = StochRSICrossover.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with valid data', () => {
    const candles = generateRangingData(80)
    const result = StochRSICrossover.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('confidence')
    expect(result).toHaveProperty('indicators')
  })

  it('should include StochRSI values in indicators', () => {
    const candles = generateRangingData(80)
    const result = StochRSICrossover.generateSignal(candles, defaultParams)
    expect(result?.indicators).toHaveProperty('stochRsiK')
    expect(result?.indicators).toHaveProperty('stochRsiD')
    expect(result?.indicators).toHaveProperty('prevK')
    expect(result?.indicators).toHaveProperty('prevD')
  })

  it('should have confidence between 0 and 1', () => {
    const candles = generateRangingData(100)
    const result = StochRSICrossover.generateSignal(candles, defaultParams)
    expect(result?.confidence).toBeGreaterThanOrEqual(0)
    expect(result?.confidence).toBeLessThanOrEqual(1)
  })
})

// ============================================================
// StochRSIExtreme Tests
// ============================================================

describe('StochRSIExtreme Strategy', () => {
  const defaultParams = {
    rsiPeriod: 14,
    stochPeriod: 14,
    kSmooth: 3,
    dSmooth: 3,
    oversold: 20,
    overbought: 80,
  }

  it('should have correct strategy metadata', () => {
    expect(StochRSIExtreme.id).toBe('stochrsi-extreme')
    expect(StochRSIExtreme.name).toBe('Stochastic RSI Extreme')
  })

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(20)
    const result = StochRSIExtreme.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with oversold data', () => {
    const candles = generateOversoldData(80)
    const result = StochRSIExtreme.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('indicators')
  })

  it('should return signal with overbought data', () => {
    const candles = generateOverboughtData(80)
    const result = StochRSIExtreme.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('indicators')
  })
})

// ============================================================
// StochRSITrend Tests
// ============================================================

describe('StochRSITrend Strategy', () => {
  const defaultParams = {
    rsiPeriod: 14,
    stochPeriod: 14,
    kSmooth: 3,
    dSmooth: 3,
    threshold: 10,
    confirmBars: 3,
  }

  it('should have correct strategy metadata', () => {
    expect(StochRSITrend.id).toBe('stochrsi-trend')
    expect(StochRSITrend.name).toBe('Stochastic RSI Trend')
    expect(StochRSITrend.params).toHaveProperty('threshold')
    expect(StochRSITrend.params).toHaveProperty('confirmBars')
  })

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(20)
    const result = StochRSITrend.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with trending data', () => {
    const candles = generateTrendingData(80, 'up')
    const result = StochRSITrend.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('indicators')
  })

  it('should include trend direction in indicators', () => {
    const candles = generateTrendingData(80, 'up')
    const result = StochRSITrend.generateSignal(candles, defaultParams)
    expect(result?.indicators).toHaveProperty('rising')
    expect(result?.indicators).toHaveProperty('falling')
  })
})

// ============================================================
// StochRSIWithEMA Tests
// ============================================================

describe('StochRSIWithEMA Strategy', () => {
  const defaultParams = {
    rsiPeriod: 14,
    stochPeriod: 14,
    kSmooth: 3,
    dSmooth: 3,
    emaPeriod: 20,
    oversold: 20,
    overbought: 80,
  }

  it('should have correct strategy metadata', () => {
    expect(StochRSIWithEMA.id).toBe('stochrsi-ema')
    expect(StochRSIWithEMA.name).toBe('StochRSI + EMA')
    expect(StochRSIWithEMA.params).toHaveProperty('emaPeriod')
  })

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(20)
    const result = StochRSIWithEMA.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with valid data', () => {
    const candles = generateTrendingData(80, 'up')
    const result = StochRSIWithEMA.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('indicators')
  })

  it('should include EMA in indicators', () => {
    const candles = generateTrendingData(80, 'up')
    const result = StochRSIWithEMA.generateSignal(candles, defaultParams)
    expect(result?.indicators).toHaveProperty('ema')
    expect(result?.indicators).toHaveProperty('aboveEma')
  })
})

// ============================================================
// StochRSIStrategies Array Tests
// ============================================================

describe('StochRSIStrategies Collection', () => {
  it('should export 4 strategies', () => {
    expect(StochRSIStrategies).toHaveLength(4)
  })

  it('should include all StochRSI strategies', () => {
    const ids = StochRSIStrategies.map(s => s.id)
    expect(ids).toContain('stochrsi-crossover')
    expect(ids).toContain('stochrsi-extreme')
    expect(ids).toContain('stochrsi-trend')
    expect(ids).toContain('stochrsi-ema')
  })

  it('all strategies should implement the Strategy interface', () => {
    StochRSIStrategies.forEach(strategy => {
      expect(strategy).toHaveProperty('id')
      expect(strategy).toHaveProperty('name')
      expect(strategy).toHaveProperty('description')
      expect(strategy).toHaveProperty('params')
      expect(strategy).toHaveProperty('generateSignal')
      expect(typeof strategy.generateSignal).toBe('function')
    })
  })
})
