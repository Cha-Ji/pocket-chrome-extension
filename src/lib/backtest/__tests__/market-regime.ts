// ============================================================
// Market Regime Detection
// ============================================================
// Detects whether market is trending or ranging
// Uses ADX, Bollinger Band Width, and price action
// ============================================================

import { Candle } from '../types'
import { calculateSMA, BollingerBands } from '../../indicators'

export type MarketRegime = 'strong_uptrend' | 'weak_uptrend' | 'ranging' | 'weak_downtrend' | 'strong_downtrend'

export interface RegimeResult {
  regime: MarketRegime
  adx: number
  bbWidth: number
  trendDirection: number // +1 up, -1 down, 0 neutral
  confidence: number // 0-1
}

// ============================================================
// ADX (Average Directional Index)
// ============================================================

interface DMResult {
  plusDM: number
  minusDM: number
  tr: number
}

function calculateDM(curr: Candle, prev: Candle): DMResult {
  const upMove = curr.high - prev.high
  const downMove = prev.low - curr.low

  let plusDM = 0
  let minusDM = 0

  if (upMove > downMove && upMove > 0) {
    plusDM = upMove
  }
  if (downMove > upMove && downMove > 0) {
    minusDM = downMove
  }

  // True Range
  const tr = Math.max(
    curr.high - curr.low,
    Math.abs(curr.high - prev.close),
    Math.abs(curr.low - prev.close)
  )

  return { plusDM, minusDM, tr }
}

/**
 * Calculate ADX (Average Directional Index)
 * ADX > 25: Trending market
 * ADX < 20: Ranging market
 */
export function calculateADX(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period * 2 + 1) return null

  const dms: DMResult[] = []
  
  for (let i = 1; i < candles.length; i++) {
    dms.push(calculateDM(candles[i], candles[i - 1]))
  }

  // Smoothed +DM, -DM, TR
  let smoothedPlusDM = dms.slice(0, period).reduce((s, d) => s + d.plusDM, 0)
  let smoothedMinusDM = dms.slice(0, period).reduce((s, d) => s + d.minusDM, 0)
  let smoothedTR = dms.slice(0, period).reduce((s, d) => s + d.tr, 0)

  const dxValues: number[] = []

  for (let i = period; i < dms.length; i++) {
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + dms[i].plusDM
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + dms[i].minusDM
    smoothedTR = smoothedTR - (smoothedTR / period) + dms[i].tr

    const plusDI = (smoothedPlusDM / smoothedTR) * 100
    const minusDI = (smoothedMinusDM / smoothedTR) * 100

    const diDiff = Math.abs(plusDI - minusDI)
    const diSum = plusDI + minusDI

    const dx = diSum > 0 ? (diDiff / diSum) * 100 : 0
    dxValues.push(dx)
  }

  if (dxValues.length < period) return null

  // ADX is smoothed DX
  let adx = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period
  
  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period
  }

  return adx
}

/**
 * Calculate +DI and -DI for trend direction
 */
export function calculateDI(candles: Candle[], period: number = 14): { plusDI: number; minusDI: number } | null {
  if (candles.length < period + 1) return null

  const dms: DMResult[] = []
  
  for (let i = 1; i < candles.length; i++) {
    dms.push(calculateDM(candles[i], candles[i - 1]))
  }

  let smoothedPlusDM = dms.slice(-period).reduce((s, d) => s + d.plusDM, 0)
  let smoothedMinusDM = dms.slice(-period).reduce((s, d) => s + d.minusDM, 0)
  let smoothedTR = dms.slice(-period).reduce((s, d) => s + d.tr, 0)

  const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0
  const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0

  return { plusDI, minusDI }
}

// ============================================================
// Bollinger Band Width
// ============================================================

/**
 * Calculate BB Width (normalized)
 * High width = trending/volatile
 * Low width = ranging/consolidating
 */
export function calculateBBWidth(candles: Candle[], period: number = 20): number | null {
  const closes = candles.map(c => c.close)
  const bb = BollingerBands.latest(closes, period, 2)
  
  if (!bb) return null
  
  return ((bb.upper - bb.lower) / bb.middle) * 100
}

// ============================================================
// Regime Detector
// ============================================================

/**
 * Detect current market regime
 */
export function detectRegime(candles: Candle[], period: number = 14): RegimeResult | null {
  if (candles.length < period * 3) return null

  const adx = calculateADX(candles, period)
  const di = calculateDI(candles, period)
  const bbWidth = calculateBBWidth(candles, 20)

  if (adx === null || di === null || bbWidth === null) return null

  // Trend direction from DI
  const trendDirection = di.plusDI > di.minusDI ? 1 : di.plusDI < di.minusDI ? -1 : 0

  // Determine regime
  let regime: MarketRegime
  let confidence: number

  if (adx >= 40) {
    // Strong trend
    regime = trendDirection > 0 ? 'strong_uptrend' : 'strong_downtrend'
    confidence = Math.min(1, adx / 50)
  } else if (adx >= 25) {
    // Moderate trend
    regime = trendDirection > 0 ? 'weak_uptrend' : 'weak_downtrend'
    confidence = (adx - 20) / 30
  } else {
    // Ranging
    regime = 'ranging'
    confidence = Math.min(1, (25 - adx) / 15)
  }

  return {
    regime,
    adx,
    bbWidth,
    trendDirection,
    confidence,
  }
}

/**
 * Calculate regime for each candle (for backtesting)
 */
export function calculateRegimeSeries(candles: Candle[], period: number = 14): (RegimeResult | null)[] {
  const results: (RegimeResult | null)[] = []
  const minRequired = period * 3

  for (let i = 0; i < candles.length; i++) {
    if (i < minRequired) {
      results.push(null)
    } else {
      results.push(detectRegime(candles.slice(0, i + 1), period))
    }
  }

  return results
}

/**
 * Simple regime check for strategy selection
 */
export function isTrending(regime: RegimeResult | null, threshold: number = 25): boolean {
  if (!regime) return false
  return regime.adx >= threshold
}

export function isRanging(regime: RegimeResult | null, threshold: number = 20): boolean {
  if (!regime) return false
  return regime.adx < threshold
}
