// ============================================================
// MACD Trading Strategies
// ============================================================
// MACD crossover and histogram-based strategies
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../types'
import { MACD, EMA } from '../../indicators'

/**
 * MACD Signal Line Crossover Strategy
 * - CALL when MACD crosses above Signal line
 * - PUT when MACD crosses below Signal line
 */
export const MACDCrossover: Strategy = {
  id: 'macd-crossover',
  name: 'MACD Crossover',
  description: 'Trade MACD and Signal line crossovers',
  params: {
    fastPeriod: { default: 12, min: 8, max: 16, step: 1 },
    slowPeriod: { default: 26, min: 20, max: 32, step: 1 },
    signalPeriod: { default: 9, min: 6, max: 12, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { fastPeriod, slowPeriod, signalPeriod } = params

    if (candles.length < slowPeriod + signalPeriod + 2) return null

    const closes = candles.map(c => c.close)
    const macdValues = MACD.calculate(closes, fastPeriod, slowPeriod, signalPeriod)

    if (macdValues.length < 2) return null

    const current = macdValues[macdValues.length - 1]
    const prev = macdValues[macdValues.length - 2]

    let direction: Direction | null = null
    let confidence = 0

    // Bullish crossover: MACD crosses above Signal
    if (prev.macd <= prev.signal && current.macd > current.signal) {
      direction = 'CALL'
      confidence = Math.min(1, Math.abs(current.histogram) / 0.5)
    }
    // Bearish crossover: MACD crosses below Signal
    else if (prev.macd >= prev.signal && current.macd < current.signal) {
      direction = 'PUT'
      confidence = Math.min(1, Math.abs(current.histogram) / 0.5)
    }

    return {
      direction,
      confidence,
      indicators: {
        macd: current.macd,
        signal: current.signal,
        histogram: current.histogram,
        prevMacd: prev.macd,
        prevSignal: prev.signal,
      },
      reason: direction
        ? `MACD ${direction === 'CALL' ? 'bullish' : 'bearish'} crossover`
        : undefined,
    }
  },
}

/**
 * MACD Histogram Reversal Strategy
 * - CALL when histogram turns from negative to positive
 * - PUT when histogram turns from positive to negative
 */
export const MACDHistogramReversal: Strategy = {
  id: 'macd-histogram-reversal',
  name: 'MACD Histogram Reversal',
  description: 'Trade when MACD histogram changes direction',
  params: {
    fastPeriod: { default: 12, min: 8, max: 16, step: 1 },
    slowPeriod: { default: 26, min: 20, max: 32, step: 1 },
    signalPeriod: { default: 9, min: 6, max: 12, step: 1 },
    minHistogram: { default: 0.1, min: 0.05, max: 0.5, step: 0.05 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { fastPeriod, slowPeriod, signalPeriod, minHistogram } = params

    if (candles.length < slowPeriod + signalPeriod + 3) return null

    const closes = candles.map(c => c.close)
    const macdValues = MACD.calculate(closes, fastPeriod, slowPeriod, signalPeriod)

    if (macdValues.length < 3) return null

    const current = macdValues[macdValues.length - 1]
    const prev = macdValues[macdValues.length - 2]
    const prev2 = macdValues[macdValues.length - 3]

    let direction: Direction | null = null
    let confidence = 0

    // Bullish reversal: histogram was declining, now rising from negative
    if (
      prev2.histogram < prev.histogram &&
      prev.histogram < 0 &&
      current.histogram > prev.histogram &&
      Math.abs(current.histogram) >= minHistogram
    ) {
      direction = 'CALL'
      confidence = Math.min(1, (current.histogram - prev.histogram) / minHistogram)
    }
    // Bearish reversal: histogram was rising, now falling from positive
    else if (
      prev2.histogram > prev.histogram &&
      prev.histogram > 0 &&
      current.histogram < prev.histogram &&
      Math.abs(current.histogram) >= minHistogram
    ) {
      direction = 'PUT'
      confidence = Math.min(1, (prev.histogram - current.histogram) / minHistogram)
    }

    return {
      direction,
      confidence,
      indicators: {
        macd: current.macd,
        signal: current.signal,
        histogram: current.histogram,
        prevHistogram: prev.histogram,
      },
      reason: direction
        ? `MACD histogram ${direction === 'CALL' ? 'bullish' : 'bearish'} reversal`
        : undefined,
    }
  },
}

/**
 * MACD Zero Line Crossover Strategy
 * - CALL when MACD crosses above zero
 * - PUT when MACD crosses below zero
 */
export const MACDZeroCross: Strategy = {
  id: 'macd-zero-cross',
  name: 'MACD Zero Line Cross',
  description: 'Trade when MACD crosses the zero line',
  params: {
    fastPeriod: { default: 12, min: 8, max: 16, step: 1 },
    slowPeriod: { default: 26, min: 20, max: 32, step: 1 },
    signalPeriod: { default: 9, min: 6, max: 12, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { fastPeriod, slowPeriod, signalPeriod } = params

    if (candles.length < slowPeriod + signalPeriod + 2) return null

    const closes = candles.map(c => c.close)
    const macdValues = MACD.calculate(closes, fastPeriod, slowPeriod, signalPeriod)

    if (macdValues.length < 2) return null

    const current = macdValues[macdValues.length - 1]
    const prev = macdValues[macdValues.length - 2]

    let direction: Direction | null = null
    let confidence = 0

    // Bullish: MACD crosses above zero
    if (prev.macd <= 0 && current.macd > 0) {
      direction = 'CALL'
      confidence = Math.min(1, Math.abs(current.macd) / 0.5)
    }
    // Bearish: MACD crosses below zero
    else if (prev.macd >= 0 && current.macd < 0) {
      direction = 'PUT'
      confidence = Math.min(1, Math.abs(current.macd) / 0.5)
    }

    return {
      direction,
      confidence,
      indicators: {
        macd: current.macd,
        signal: current.signal,
        histogram: current.histogram,
        prevMacd: prev.macd,
      },
      reason: direction
        ? `MACD zero line ${direction === 'CALL' ? 'bullish' : 'bearish'} cross`
        : undefined,
    }
  },
}

/**
 * MACD Divergence Strategy
 * - Bullish divergence: price makes lower low, MACD makes higher low → CALL
 * - Bearish divergence: price makes higher high, MACD makes lower high → PUT
 */
export const MACDDivergence: Strategy = {
  id: 'macd-divergence',
  name: 'MACD Divergence',
  description: 'Trade divergences between price and MACD',
  params: {
    fastPeriod: { default: 12, min: 8, max: 16, step: 1 },
    slowPeriod: { default: 26, min: 20, max: 32, step: 1 },
    signalPeriod: { default: 9, min: 6, max: 12, step: 1 },
    lookback: { default: 10, min: 5, max: 20, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { fastPeriod, slowPeriod, signalPeriod, lookback } = params

    if (candles.length < slowPeriod + signalPeriod + lookback) return null

    const closes = candles.map(c => c.close)
    const macdValues = MACD.calculate(closes, fastPeriod, slowPeriod, signalPeriod)

    if (macdValues.length < lookback) return null

    // Get recent values
    const recentCloses = closes.slice(-lookback)
    const recentMACD = macdValues.slice(-lookback).map(m => m.histogram)

    // Find swing points
    const priceLL = Math.min(...recentCloses)
    const priceHH = Math.max(...recentCloses)
    const macdLL = Math.min(...recentMACD)
    const macdHH = Math.max(...recentMACD)

    const currentPrice = closes[closes.length - 1]
    const currentMACD = macdValues[macdValues.length - 1].histogram

    let direction: Direction | null = null
    let confidence = 0

    // Bullish divergence: price at low, MACD not at low
    if (currentPrice <= priceLL * 1.005 && currentMACD > macdLL * 0.8) {
      direction = 'CALL'
      confidence = Math.min(1, Math.abs(currentMACD - macdLL) / Math.abs(macdLL) || 0.5)
    }
    // Bearish divergence: price at high, MACD not at high
    else if (currentPrice >= priceHH * 0.995 && currentMACD < macdHH * 0.8) {
      direction = 'PUT'
      confidence = Math.min(1, Math.abs(macdHH - currentMACD) / Math.abs(macdHH) || 0.5)
    }

    return {
      direction,
      confidence,
      indicators: {
        macd: macdValues[macdValues.length - 1].macd,
        histogram: currentMACD,
        priceLL,
        priceHH,
        macdLL,
        macdHH,
      },
      reason: direction
        ? `MACD ${direction === 'CALL' ? 'bullish' : 'bearish'} divergence`
        : undefined,
    }
  },
}

// Export all MACD strategies
export const MACDStrategies = [
  MACDCrossover,
  MACDHistogramReversal,
  MACDZeroCross,
  MACDDivergence,
]
