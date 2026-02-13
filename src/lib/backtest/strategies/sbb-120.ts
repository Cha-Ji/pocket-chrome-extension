// ============================================================
// SBB-120: Squeeze Bollinger Breakout (120s Expiry)
// ============================================================
// 근거:
// - Bollinger BandWidth squeeze → breakout (StockCharts ChartSchool)
// - Bollinger Method I: Volatility Breakout / The Squeeze
// - 변동성 군집/순환: 수축(squeeze) 뒤 확대(breakout)
// 가짜돌파 방어:
// 1. breakoutMargin: bandRange * ratio 이상 벗어나야 인정
// 2. bodyRatio >= threshold (몸통이 충분히 큰 캔들만)
// 3. volatility expansion: 현재 range > 최근 N캔들 평균 * ratio
// ============================================================

import { Candle } from '../../signals/types'
import { BollingerBands } from '../../indicators'
import { StrategyResult } from './high-winrate'

// ============================================================
// Configuration
// ============================================================

export interface SBB120Config {
  bbPeriod: number
  bbStdDev: number
  lookbackSqueeze: number
  squeezePercentile: number
  breakoutMarginRatio: number
  minBodyRatio: number
  volExpansionRatio: number
  volLookback: number
  expiryOverride: number
}

export const DEFAULT_SBB120_CONFIG: SBB120Config = {
  bbPeriod: 20,
  bbStdDev: 2,
  lookbackSqueeze: 120,
  squeezePercentile: 10,
  breakoutMarginRatio: 0.05,
  minBodyRatio: 0.55,
  volExpansionRatio: 1.2,
  volLookback: 5,
  expiryOverride: 120,
}

// ============================================================
// SBB-120 Strategy (High Win-Rate function pattern)
// ============================================================

export function sbb120Strategy(
  candles: Candle[],
  config: Partial<SBB120Config> = {}
): StrategyResult {
  const cfg = { ...DEFAULT_SBB120_CONFIG, ...config }

  // 최소 데이터 요구: BB 기간 + squeeze lookback
  const minCandles = cfg.bbPeriod + cfg.lookbackSqueeze
  if (candles.length < minCandles) {
    return {
      signal: null,
      confidence: 0,
      reason: 'Insufficient data for SBB-120',
      indicators: {},
    }
  }

  const closes = candles.map(c => c.close)

  // ── 1. Bollinger Bands 계산 ──────────────────────────────
  const bbArray = BollingerBands.calculate(closes, cfg.bbPeriod, cfg.bbStdDev)
  if (bbArray.length < cfg.lookbackSqueeze + 1) {
    return {
      signal: null,
      confidence: 0,
      reason: 'Not enough BB data for squeeze lookback',
      indicators: {},
    }
  }

  // ── 2. Bandwidth 시리즈 계산 ─────────────────────────────
  const bandwidths = bbArray.map(bb =>
    bb.middle > 0 ? (bb.upper - bb.lower) / bb.middle : 0
  )

  const currentBB = bbArray[bbArray.length - 1]
  const currentBandwidth = bandwidths[bandwidths.length - 1]
  const currentClose = closes[closes.length - 1]
  const currentCandle = candles[candles.length - 1]

  // ── 3. Squeeze 판정 (하위 percentile) ────────────────────
  const lookbackBWs = bandwidths.slice(-(cfg.lookbackSqueeze + 1), -1)
  const sortedBWs = [...lookbackBWs].sort((a, b) => a - b)
  const percentileIndex = Math.max(0, Math.floor(sortedBWs.length * cfg.squeezePercentile / 100) - 1)
  const squeezeThreshold = sortedBWs[percentileIndex]

  // 직전 캔들의 bandwidth로 squeeze 상태 판정
  const prevBandwidth = bandwidths[bandwidths.length - 2]
  const wasSqueeze = prevBandwidth <= squeezeThreshold

  // bandwidth가 최소값 대비 얼마나 극단적이었는지 (confidence 가산용)
  const bwMin = sortedBWs[0]
  const bwMax = sortedBWs[sortedBWs.length - 1]
  const bwRange = bwMax - bwMin
  const bwExtremeness = bwRange > 0 ? 1 - ((prevBandwidth - bwMin) / bwRange) : 0

  const bandRange = currentBB.upper - currentBB.lower
  const breakoutMargin = cfg.breakoutMarginRatio * bandRange

  // 기본 indicators (항상 반환)
  const indicators: Record<string, number> = {
    bandwidth: currentBandwidth,
    bwPercentile: lookbackBWs.length > 0
      ? (lookbackBWs.filter(bw => bw < currentBandwidth).length / lookbackBWs.length) * 100
      : 50,
    squeezeThreshold,
    upper: currentBB.upper,
    lower: currentBB.lower,
    mid: currentBB.middle,
    price: currentClose,
    wasSqueeze: wasSqueeze ? 1 : 0,
    expiryOverride: cfg.expiryOverride,
  }

  if (!wasSqueeze) {
    return {
      signal: null,
      confidence: 0,
      reason: 'No squeeze detected',
      indicators,
    }
  }

  // ── 4. Breakout 방향 판정 ────────────────────────────────
  const breakAboveUpper = currentClose > currentBB.upper + breakoutMargin
  const breakBelowLower = currentClose < currentBB.lower - breakoutMargin

  if (!breakAboveUpper && !breakBelowLower) {
    const breakoutDistance = breakAboveUpper
      ? currentClose - currentBB.upper
      : currentBB.lower - currentClose
    indicators.breakoutDistance = Math.max(
      currentClose - currentBB.upper,
      currentBB.lower - currentClose
    )
    indicators.breakoutMargin = breakoutMargin
    return {
      signal: null,
      confidence: 0,
      reason: `Squeeze detected but no breakout (margin: ${breakoutMargin.toFixed(5)})`,
      indicators,
    }
  }

  // ── 5. 가짜돌파 방어 #2: bodyRatio 체크 ─────────────────
  const candleRange = currentCandle.high - currentCandle.low
  const bodySize = Math.abs(currentCandle.close - currentCandle.open)
  const bodyRatio = candleRange > 0 ? bodySize / candleRange : 0

  indicators.bodyRatio = bodyRatio
  indicators.breakoutMargin = breakoutMargin

  if (bodyRatio < cfg.minBodyRatio) {
    return {
      signal: null,
      confidence: 0,
      reason: `Body ratio too small (${bodyRatio.toFixed(2)} < ${cfg.minBodyRatio})`,
      indicators,
    }
  }

  // ── 6. 가짜돌파 방어 #3: volatility expansion 체크 ──────
  const recentCandles = candles.slice(-(cfg.volLookback + 1), -1)
  const avgRange = recentCandles.reduce((sum, c) => sum + (c.high - c.low), 0) / recentCandles.length
  const volExpanded = candleRange > avgRange * cfg.volExpansionRatio

  indicators.currentRange = candleRange
  indicators.avgRange = avgRange
  indicators.volExpansionRatio = avgRange > 0 ? candleRange / avgRange : 0

  if (!volExpanded) {
    return {
      signal: null,
      confidence: 0,
      reason: `Volatility not expanding (${(candleRange / avgRange).toFixed(2)}x < ${cfg.volExpansionRatio}x)`,
      indicators,
    }
  }

  // ── 7. 신호 생성 ────────────────────────────────────────
  const direction: 'CALL' | 'PUT' = breakAboveUpper ? 'CALL' : 'PUT'
  const breakoutDistance = breakAboveUpper
    ? currentClose - currentBB.upper
    : currentBB.lower - currentClose

  indicators.breakoutDistance = breakoutDistance

  // ── 8. Confidence 계산 (0.60 ~ 0.90) ────────────────────
  let confidence = 0.60

  // 가산 1: bandwidth 극단성 (최대 +0.10)
  confidence += bwExtremeness * 0.10

  // 가산 2: breakout margin 초과폭 (최대 +0.10)
  const marginExcess = breakoutMargin > 0 ? breakoutDistance / breakoutMargin : 0
  confidence += Math.min(marginExcess / 3, 1) * 0.10

  // 가산 3: bodyRatio 크기 (최대 +0.10)
  const bodyBonus = (bodyRatio - cfg.minBodyRatio) / (1 - cfg.minBodyRatio)
  confidence += Math.min(bodyBonus, 1) * 0.10

  confidence = Math.min(confidence, 0.90)

  return {
    signal: direction,
    confidence,
    reason: `SBB-120 ${direction}: squeeze breakout (bw=${currentBandwidth.toFixed(5)}, body=${bodyRatio.toFixed(2)})`,
    indicators,
    expiryOverride: cfg.expiryOverride,
  }
}
