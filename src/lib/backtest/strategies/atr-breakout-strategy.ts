// ============================================================
// ATR Breakout Trading Strategies
// ============================================================
// Volatility breakout strategies using Average True Range
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../types'
import { ATR, EMA } from '../../indicators'

/**
 * ATR Channel Breakout Strategy
 * - CALL when price breaks above previous high + ATR * multiplier
 * - PUT when price breaks below previous low - ATR * multiplier
 */
export const ATRChannelBreakout: Strategy = {
  id: 'atr-channel-breakout',
  name: 'ATR Channel Breakout',
  description: 'Trade breakouts when price exceeds ATR-based channels',
  params: {
    atrPeriod: { default: 14, min: 7, max: 21, step: 1 },
    multiplier: { default: 1.5, min: 0.5, max: 3.0, step: 0.25 },
    lookback: { default: 20, min: 10, max: 50, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { atrPeriod, multiplier, lookback } = params

    if (candles.length < Math.max(atrPeriod + 1, lookback) + 1) return null

    const highs = candles.map(c => c.high)
    const lows = candles.map(c => c.low)
    const closes = candles.map(c => c.close)

    const atr = ATR.latest(highs, lows, closes, atrPeriod)
    if (atr === null) return null

    // Get previous high/low over lookback period (excluding current candle)
    const lookbackHighs = highs.slice(-lookback - 1, -1)
    const lookbackLows = lows.slice(-lookback - 1, -1)
    const prevHigh = Math.max(...lookbackHighs)
    const prevLow = Math.min(...lookbackLows)

    const currentClose = closes[closes.length - 1]
    const prevClose = closes[closes.length - 2]

    // Calculate breakout levels
    const upperBreakout = prevHigh + atr * multiplier
    const lowerBreakout = prevLow - atr * multiplier

    let direction: Direction | null = null
    let confidence = 0

    // Bullish breakout: price crosses above upper channel
    if (prevClose < upperBreakout && currentClose >= upperBreakout) {
      direction = 'CALL'
      confidence = Math.min(1, (currentClose - upperBreakout) / atr)
    }
    // Bearish breakout: price crosses below lower channel
    else if (prevClose > lowerBreakout && currentClose <= lowerBreakout) {
      direction = 'PUT'
      confidence = Math.min(1, (lowerBreakout - currentClose) / atr)
    }

    return {
      direction,
      confidence,
      indicators: {
        atr,
        prevHigh,
        prevLow,
        upperBreakout,
        lowerBreakout,
        price: currentClose,
      },
      reason: direction
        ? `ATR breakout ${direction === 'CALL' ? 'above' : 'below'} channel`
        : undefined,
    }
  },
}

/**
 * ATR Volatility Expansion Strategy
 * - Trade when ATR expands significantly (volatility spike)
 * - Direction determined by price movement direction
 */
export const ATRVolatilityExpansion: Strategy = {
  id: 'atr-volatility-expansion',
  name: 'ATR Volatility Expansion',
  description: 'Trade in direction of move when volatility expands',
  params: {
    atrPeriod: { default: 14, min: 7, max: 21, step: 1 },
    expansionMultiplier: { default: 1.5, min: 1.2, max: 2.5, step: 0.1 },
    avgPeriod: { default: 20, min: 10, max: 30, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { atrPeriod, expansionMultiplier, avgPeriod } = params

    if (candles.length < atrPeriod + avgPeriod + 1) return null

    const highs = candles.map(c => c.high)
    const lows = candles.map(c => c.low)
    const closes = candles.map(c => c.close)

    // Calculate ATR series
    const atrValues = ATR.calculate(highs, lows, closes, atrPeriod)
    if (atrValues.length < avgPeriod) return null

    const currentATR = atrValues[atrValues.length - 1]
    const avgATR = atrValues.slice(-avgPeriod - 1, -1).reduce((a, b) => a + b, 0) / avgPeriod

    // Check for volatility expansion
    const isExpansion = currentATR > avgATR * expansionMultiplier

    if (!isExpansion) {
      return {
        direction: null,
        confidence: 0,
        indicators: { atr: currentATR, avgAtr: avgATR, ratio: currentATR / avgATR },
      }
    }

    // Determine direction based on price movement
    const currentCandle = candles[candles.length - 1]
    const priceMove = currentCandle.close - currentCandle.open

    let direction: Direction | null = null
    let confidence = 0

    if (priceMove > 0) {
      direction = 'CALL'
      confidence = Math.min(1, (currentATR / avgATR - 1) / 0.5)
    } else if (priceMove < 0) {
      direction = 'PUT'
      confidence = Math.min(1, (currentATR / avgATR - 1) / 0.5)
    }

    return {
      direction,
      confidence,
      indicators: {
        atr: currentATR,
        avgAtr: avgATR,
        ratio: currentATR / avgATR,
        priceMove,
      },
      reason: direction ? `ATR expansion ${direction === 'CALL' ? 'bullish' : 'bearish'}` : undefined,
    }
  },
}

/**
 * ATR Trend Following Strategy
 * - Use ATR to set trailing stops conceptually
 * - Trade in direction of trend with ATR-based momentum
 */
export const ATRTrendFollowing: Strategy = {
  id: 'atr-trend-following',
  name: 'ATR Trend Following',
  description: 'Follow trend direction using ATR-based momentum',
  params: {
    atrPeriod: { default: 14, min: 7, max: 21, step: 1 },
    emaPeriod: { default: 20, min: 10, max: 50, step: 5 },
    atrMultiplier: { default: 2.0, min: 1.0, max: 3.0, step: 0.5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { atrPeriod, emaPeriod, atrMultiplier } = params

    if (candles.length < Math.max(atrPeriod, emaPeriod) + 2) return null

    const highs = candles.map(c => c.high)
    const lows = candles.map(c => c.low)
    const closes = candles.map(c => c.close)

    const atr = ATR.latest(highs, lows, closes, atrPeriod)
    const ema = EMA.latest(closes, emaPeriod)
    const prevEma = EMA.latest(closes.slice(0, -1), emaPeriod)

    if (atr === null || ema === null || prevEma === null) return null

    const currentClose = closes[closes.length - 1]
    const prevClose = closes[closes.length - 2]

    // Calculate ATR-based trend bands
    const upperBand = ema + atr * atrMultiplier
    const lowerBand = ema - atr * atrMultiplier

    // Determine trend direction
    const emaTrend = ema > prevEma ? 'up' : ema < prevEma ? 'down' : 'flat'

    let direction: Direction | null = null
    let confidence = 0

    // Bullish: price above EMA, trend up, price bouncing from lower band
    if (currentClose > ema && emaTrend === 'up' && prevClose < currentClose) {
      direction = 'CALL'
      confidence = Math.min(1, (currentClose - ema) / atr)
    }
    // Bearish: price below EMA, trend down, price falling from upper band
    else if (currentClose < ema && emaTrend === 'down' && prevClose > currentClose) {
      direction = 'PUT'
      confidence = Math.min(1, (ema - currentClose) / atr)
    }

    return {
      direction,
      confidence,
      indicators: {
        atr,
        ema,
        upperBand,
        lowerBand,
        price: currentClose,
        trend: emaTrend === 'up' ? 1 : emaTrend === 'down' ? -1 : 0,
      },
      reason: direction ? `ATR trend ${direction === 'CALL' ? 'bullish' : 'bearish'}` : undefined,
    }
  },
}

// Export all ATR strategies
export const ATRStrategies = [
  ATRChannelBreakout,
  ATRVolatilityExpansion,
  ATRTrendFollowing,
]
