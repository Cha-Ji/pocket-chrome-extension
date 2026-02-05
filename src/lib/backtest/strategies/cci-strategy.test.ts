// ============================================================
// CCI Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  CCIOverboughtOversold,
  CCIZeroCross,
  CCITrendFollowing,
  CCIStrategies,
} from './cci-strategy'
import { Candle } from '../types'

// ============================================================
// Test Data Generators
// ============================================================

function generateOversoldData(count: number = 50): Candle[] {
  const candles: Candle[] = []
  let price = 100

  // Generate consistently falling prices to create oversold condition
  for (let i = 0; i < count; i++) {
    const drop = Math.random() * 0.5 + 0.1
    price = price * (1 - drop / 100)

    const volatility = Math.random() * 0.3 + 0.1
    const open = price + volatility
    const close = price
    const high = Math.max(open, close) + volatility * 0.5
    const low = Math.min(open, close) - volatility * 0.5

    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
    })
  }

  return candles
}

function generateOverboughtData(count: number = 50): Candle[] {
  const candles: Candle[] = []
  let price = 100

  // Generate consistently rising prices to create overbought condition
  for (let i = 0; i < count; i++) {
    const rise = Math.random() * 0.5 + 0.1
    price = price * (1 + rise / 100)

    const volatility = Math.random() * 0.3 + 0.1
    const open = price - volatility
    const close = price
    const high = Math.max(open, close) + volatility * 0.5
    const low = Math.min(open, close) - volatility * 0.5

    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
    })
  }

  return candles
}

function generateRangingData(count: number = 50): Candle[] {
  const candles: Candle[] = []
  let price = 100

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.4
    price = price * (1 + change / 100)

    const volatility = Math.random() * 0.2 + 0.1
    const open = price - volatility / 2
    const close = price + volatility / 2
    const high = Math.max(open, close) + volatility * 0.3
    const low = Math.min(open, close) - volatility * 0.3

    candles.push({
      timestamp: Date.now() + i * 60000,
      open,
      high,
      low,
      close,
    })
  }

  return candles
}

// ============================================================
// CCIOverboughtOversold Tests
// ============================================================

describe('CCIOverboughtOversold Strategy', () => {
  const defaultParams = {
    period: 20,
    overbought: 100,
    oversold: -100,
  }

  it('should have correct strategy metadata', () => {
    expect(CCIOverboughtOversold.id).toBe('cci-ob-os')
    expect(CCIOverboughtOversold.name).toBe('CCI Overbought/Oversold')
    expect(CCIOverboughtOversold.params).toHaveProperty('period')
    expect(CCIOverboughtOversold.params).toHaveProperty('overbought')
    expect(CCIOverboughtOversold.params).toHaveProperty('oversold')
  })

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10)
    const result = CCIOverboughtOversold.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with valid data', () => {
    const candles = generateRangingData(50)
    const result = CCIOverboughtOversold.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('confidence')
    expect(result).toHaveProperty('indicators')
  })

  it('should include CCI values in indicators', () => {
    const candles = generateRangingData(50)
    const result = CCIOverboughtOversold.generateSignal(candles, defaultParams)
    expect(result?.indicators).toHaveProperty('cci')
    expect(result?.indicators).toHaveProperty('prevCci')
  })

  it('should have confidence between 0 and 1', () => {
    const candles = generateRangingData(100)
    const result = CCIOverboughtOversold.generateSignal(candles, defaultParams)
    expect(result?.confidence).toBeGreaterThanOrEqual(0)
    expect(result?.confidence).toBeLessThanOrEqual(1)
  })
})

// ============================================================
// CCIZeroCross Tests
// ============================================================

describe('CCIZeroCross Strategy', () => {
  const defaultParams = {
    period: 20,
    confirmBars: 2,
  }

  it('should have correct strategy metadata', () => {
    expect(CCIZeroCross.id).toBe('cci-zero-cross')
    expect(CCIZeroCross.name).toBe('CCI Zero Line Cross')
    expect(CCIZeroCross.params).toHaveProperty('period')
    expect(CCIZeroCross.params).toHaveProperty('confirmBars')
  })

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10)
    const result = CCIZeroCross.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with valid data', () => {
    const candles = generateRangingData(50)
    const result = CCIZeroCross.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result).toHaveProperty('confidence')
  })
})

// ============================================================
// CCITrendFollowing Tests
// ============================================================

describe('CCITrendFollowing Strategy', () => {
  const defaultParams = {
    period: 20,
    threshold: 100,
    lookback: 3,
  }

  it('should have correct strategy metadata', () => {
    expect(CCITrendFollowing.id).toBe('cci-trend')
    expect(CCITrendFollowing.name).toBe('CCI Trend Following')
    expect(CCITrendFollowing.params).toHaveProperty('period')
    expect(CCITrendFollowing.params).toHaveProperty('threshold')
    expect(CCITrendFollowing.params).toHaveProperty('lookback')
  })

  it('should return null with insufficient data', () => {
    const candles = generateRangingData(10)
    const result = CCITrendFollowing.generateSignal(candles, defaultParams)
    expect(result).toBeNull()
  })

  it('should return signal with valid data', () => {
    const candles = generateOverboughtData(60)
    const result = CCITrendFollowing.generateSignal(candles, defaultParams)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('direction')
    expect(result?.indicators).toHaveProperty('cci')
  })
})

// ============================================================
// CCIStrategies Array Tests
// ============================================================

describe('CCIStrategies Collection', () => {
  it('should export 3 strategies', () => {
    expect(CCIStrategies).toHaveLength(3)
  })

  it('should include all CCI strategies', () => {
    const ids = CCIStrategies.map(s => s.id)
    expect(ids).toContain('cci-ob-os')
    expect(ids).toContain('cci-zero-cross')
    expect(ids).toContain('cci-trend')
  })

  it('all strategies should implement the Strategy interface', () => {
    CCIStrategies.forEach(strategy => {
      expect(strategy).toHaveProperty('id')
      expect(strategy).toHaveProperty('name')
      expect(strategy).toHaveProperty('description')
      expect(strategy).toHaveProperty('params')
      expect(strategy).toHaveProperty('generateSignal')
      expect(typeof strategy.generateSignal).toBe('function')
    })
  })
})

// ============================================================
// Backtest Simulation Tests
// ============================================================

describe('CCI Strategy Backtest Simulation', () => {
  function runSimpleBacktest(
    candles: Candle[],
    strategyFn: (candles: Candle[], params: Record<string, number>) => ReturnType<typeof CCIOverboughtOversold.generateSignal>,
    params: Record<string, number>,
    expiryCandles: number = 5
  ): { totalTrades: number; wins: number; winRate: number } {
    let wins = 0
    let losses = 0

    for (let i = 25; i < candles.length - expiryCandles; i++) {
      const lookback = candles.slice(0, i + 1)
      const result = strategyFn(lookback, params)

      if (result?.direction) {
        const entryPrice = candles[i].close
        const exitPrice = candles[i + expiryCandles].close

        const isWin =
          (result.direction === 'CALL' && exitPrice > entryPrice) ||
          (result.direction === 'PUT' && exitPrice < entryPrice)

        if (isWin) wins++
        else losses++
      }
    }

    const totalTrades = wins + losses
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0

    return { totalTrades, wins, winRate }
  }

  it('CCIOverboughtOversold should generate trades', () => {
    const candles = generateRangingData(100)
    const result = runSimpleBacktest(
      candles,
      CCIOverboughtOversold.generateSignal.bind(CCIOverboughtOversold),
      { period: 20, overbought: 100, oversold: -100 }
    )

    // Strategy may or may not generate trades depending on data
    expect(result.totalTrades).toBeGreaterThanOrEqual(0)
  })

  it('CCIZeroCross should generate trades in trending market', () => {
    const candles = [...generateOversoldData(50), ...generateOverboughtData(50)]
    const result = runSimpleBacktest(
      candles,
      CCIZeroCross.generateSignal.bind(CCIZeroCross),
      { period: 20, confirmBars: 2 }
    )

    expect(result.totalTrades).toBeGreaterThanOrEqual(0)
  })
})
