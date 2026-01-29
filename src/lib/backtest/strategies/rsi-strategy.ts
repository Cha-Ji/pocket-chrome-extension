// ============================================================
// RSI-Based Trading Strategies
// ============================================================
// Various RSI strategies for binary options
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../types'
import { RSI, BollingerBands, SMA, Stochastic, MACD } from '../../indicators'

/**
 * Basic RSI Oversold/Overbought Strategy
 * - CALL when RSI < oversold threshold
 * - PUT when RSI > overbought threshold
 */
export const RSIOverboughtOversold: Strategy = {
  id: 'rsi-ob-os',
  name: 'RSI Overbought/Oversold',
  description: 'Trade reversals when RSI reaches extreme levels',
  params: {
    period: { default: 14, min: 5, max: 30, step: 1 },
    oversold: { default: 30, min: 20, max: 40, step: 5 },
    overbought: { default: 70, min: 60, max: 80, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, oversold, overbought } = params
    
    if (candles.length < period + 1) return null

    const closes = candles.map(c => c.close)
    const rsiValues = RSI.calculate(closes, period)
    
    if (rsiValues.length < 2) return null

    const currentRSI = rsiValues[rsiValues.length - 1]
    const prevRSI = rsiValues[rsiValues.length - 2]

    let direction: Direction | null = null
    let confidence = 0

    // RSI crossing up from oversold
    if (prevRSI < oversold && currentRSI >= oversold) {
      direction = 'CALL'
      confidence = Math.min(1, (oversold - prevRSI) / 10)
    }
    // RSI crossing down from overbought
    else if (prevRSI > overbought && currentRSI <= overbought) {
      direction = 'PUT'
      confidence = Math.min(1, (prevRSI - overbought) / 10)
    }

    return {
      direction,
      confidence,
      indicators: { rsi: currentRSI, prevRsi: prevRSI },
      reason: direction ? `RSI ${direction === 'CALL' ? 'oversold reversal' : 'overbought reversal'}` : undefined,
    }
  },
}

/**
 * RSI Divergence Strategy
 * - Bullish divergence: price makes lower low, RSI makes higher low → CALL
 * - Bearish divergence: price makes higher high, RSI makes lower high → PUT
 */
export const RSIDivergence: Strategy = {
  id: 'rsi-divergence',
  name: 'RSI Divergence',
  description: 'Trade divergences between price and RSI',
  params: {
    period: { default: 14, min: 7, max: 21, step: 1 },
    lookback: { default: 10, min: 5, max: 20, step: 1 },
    minDivergence: { default: 5, min: 2, max: 15, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, lookback, minDivergence } = params

    if (candles.length < period + lookback) return null

    const closes = candles.map(c => c.close)
    const rsiValues = RSI.calculate(closes, period)

    if (rsiValues.length < lookback) return null

    // Get recent values
    const recentCloses = closes.slice(-lookback)
    const recentRSI = rsiValues.slice(-lookback)

    // Find swing points
    const priceLL = Math.min(...recentCloses)
    const priceHH = Math.max(...recentCloses)
    const rsiLL = Math.min(...recentRSI)
    const rsiHH = Math.max(...recentRSI)

    const currentPrice = closes[closes.length - 1]
    const currentRSI = rsiValues[rsiValues.length - 1]

    let direction: Direction | null = null
    let confidence = 0

    // Bullish divergence: price at/near low, RSI not at low
    if (currentPrice <= priceLL * 1.01 && currentRSI > rsiLL + minDivergence) {
      direction = 'CALL'
      confidence = Math.min(1, (currentRSI - rsiLL) / 20)
    }
    // Bearish divergence: price at/near high, RSI not at high
    else if (currentPrice >= priceHH * 0.99 && currentRSI < rsiHH - minDivergence) {
      direction = 'PUT'
      confidence = Math.min(1, (rsiHH - currentRSI) / 20)
    }

    return {
      direction,
      confidence,
      indicators: { rsi: currentRSI, priceLL, priceHH, rsiLL, rsiHH },
      reason: direction ? `RSI ${direction === 'CALL' ? 'bullish' : 'bearish'} divergence` : undefined,
    }
  },
}

/**
 * RSI + Bollinger Bands Strategy
 * - CALL: RSI oversold AND price touches lower BB
 * - PUT: RSI overbought AND price touches upper BB
 */
export const RSIBollingerBands: Strategy = {
  id: 'rsi-bb',
  name: 'RSI + Bollinger Bands',
  description: 'Combine RSI extremes with Bollinger Band touches',
  params: {
    rsiPeriod: { default: 14, min: 7, max: 21, step: 1 },
    bbPeriod: { default: 20, min: 10, max: 30, step: 2 },
    bbStdDev: { default: 2, min: 1, max: 3, step: 0.5 },
    oversold: { default: 30, min: 20, max: 40, step: 5 },
    overbought: { default: 70, min: 60, max: 80, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { rsiPeriod, bbPeriod, bbStdDev, oversold, overbought } = params

    if (candles.length < Math.max(rsiPeriod, bbPeriod) + 1) return null

    const closes = candles.map(c => c.close)
    const rsiValues = RSI.calculate(closes, rsiPeriod)
    const bbValues = BollingerBands.calculate(closes, bbPeriod, bbStdDev)

    if (rsiValues.length === 0 || bbValues.length === 0) return null

    const currentRSI = rsiValues[rsiValues.length - 1]
    const currentBB = bbValues[bbValues.length - 1]
    const currentPrice = closes[closes.length - 1]

    let direction: Direction | null = null
    let confidence = 0

    // CALL: RSI oversold + price at/below lower BB
    if (currentRSI < oversold && currentPrice <= currentBB.lower * 1.001) {
      direction = 'CALL'
      confidence = Math.min(1, (oversold - currentRSI) / 20 + (currentBB.lower - currentPrice) / currentPrice)
    }
    // PUT: RSI overbought + price at/above upper BB
    else if (currentRSI > overbought && currentPrice >= currentBB.upper * 0.999) {
      direction = 'PUT'
      confidence = Math.min(1, (currentRSI - overbought) / 20 + (currentPrice - currentBB.upper) / currentPrice)
    }

    return {
      direction,
      confidence,
      indicators: { 
        rsi: currentRSI, 
        bbUpper: currentBB.upper, 
        bbMiddle: currentBB.middle, 
        bbLower: currentBB.lower,
        price: currentPrice,
      },
      reason: direction ? `RSI ${direction === 'CALL' ? 'oversold' : 'overbought'} + BB ${direction === 'CALL' ? 'lower' : 'upper'} touch` : undefined,
    }
  },
}

/**
 * RSI + Stochastic Double Confirmation
 * - CALL: Both RSI and Stochastic oversold
 * - PUT: Both RSI and Stochastic overbought
 */
export const RSIStochastic: Strategy = {
  id: 'rsi-stoch',
  name: 'RSI + Stochastic',
  description: 'Double confirmation with RSI and Stochastic oscillators',
  params: {
    rsiPeriod: { default: 14, min: 7, max: 21, step: 1 },
    stochK: { default: 14, min: 5, max: 21, step: 1 },
    stochD: { default: 3, min: 2, max: 5, step: 1 },
    stochSmooth: { default: 3, min: 1, max: 5, step: 1 },
    oversold: { default: 20, min: 10, max: 30, step: 5 },
    overbought: { default: 80, min: 70, max: 90, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { rsiPeriod, stochK, stochD, stochSmooth, oversold, overbought } = params

    if (candles.length < Math.max(rsiPeriod, stochK + stochD) + 1) return null

    const closes = candles.map(c => c.close)
    const highs = candles.map(c => c.high)
    const lows = candles.map(c => c.low)

    const rsiValues = RSI.calculate(closes, rsiPeriod)
    const stochValues = Stochastic.calculate(highs, lows, closes, stochK, stochD, stochSmooth)

    if (rsiValues.length === 0 || stochValues.length === 0) return null

    const currentRSI = rsiValues[rsiValues.length - 1]
    const currentStoch = stochValues[stochValues.length - 1]

    let direction: Direction | null = null
    let confidence = 0

    // Both oversold
    if (currentRSI < oversold + 10 && currentStoch.k < oversold && currentStoch.d < oversold) {
      direction = 'CALL'
      confidence = Math.min(1, ((oversold - currentStoch.k) + (oversold + 10 - currentRSI)) / 40)
    }
    // Both overbought
    else if (currentRSI > overbought - 10 && currentStoch.k > overbought && currentStoch.d > overbought) {
      direction = 'PUT'
      confidence = Math.min(1, ((currentStoch.k - overbought) + (currentRSI - overbought + 10)) / 40)
    }

    return {
      direction,
      confidence,
      indicators: { 
        rsi: currentRSI, 
        stochK: currentStoch.k, 
        stochD: currentStoch.d,
      },
      reason: direction ? `RSI + Stoch both ${direction === 'CALL' ? 'oversold' : 'overbought'}` : undefined,
    }
  },
}

/**
 * RSI Trend Following Strategy
 * - CALL: RSI > 50 and rising (bullish momentum)
 * - PUT: RSI < 50 and falling (bearish momentum)
 */
export const RSITrend: Strategy = {
  id: 'rsi-trend',
  name: 'RSI Trend Following',
  description: 'Follow momentum using RSI above/below 50',
  params: {
    period: { default: 14, min: 7, max: 21, step: 1 },
    threshold: { default: 5, min: 2, max: 15, step: 1 },
    confirmBars: { default: 3, min: 2, max: 5, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, threshold, confirmBars } = params

    if (candles.length < period + confirmBars) return null

    const closes = candles.map(c => c.close)
    const rsiValues = RSI.calculate(closes, period)

    if (rsiValues.length < confirmBars) return null

    const recentRSI = rsiValues.slice(-confirmBars)
    const currentRSI = recentRSI[recentRSI.length - 1]

    // Check if RSI has been consistently above/below 50
    const allAbove = recentRSI.every(r => r > 50 + threshold)
    const allBelow = recentRSI.every(r => r < 50 - threshold)

    // Check direction (rising/falling)
    const rising = recentRSI.every((r, i) => i === 0 || r >= recentRSI[i - 1] - 1)
    const falling = recentRSI.every((r, i) => i === 0 || r <= recentRSI[i - 1] + 1)

    let direction: Direction | null = null
    let confidence = 0

    if (allAbove && rising) {
      direction = 'CALL'
      confidence = Math.min(1, (currentRSI - 50) / 30)
    } else if (allBelow && falling) {
      direction = 'PUT'
      confidence = Math.min(1, (50 - currentRSI) / 30)
    }

    return {
      direction,
      confidence,
      indicators: { rsi: currentRSI, rising, falling },
      reason: direction ? `RSI trend ${direction === 'CALL' ? 'bullish' : 'bearish'}` : undefined,
    }
  },
}

// Export all strategies
export const RSIStrategies = [
  RSIOverboughtOversold,
  RSIDivergence,
  RSIBollingerBands,
  RSIStochastic,
  RSITrend,
]
