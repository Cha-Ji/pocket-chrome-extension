// ============================================================
// ZMR-60: Z-score Mean Reversion Strategy (60-second expiry)
// ============================================================
// 이론적 근거:
// - 초단기 리버설: Heston/Korajczyk/Sadka (2010) — 극단 1분 음봉 후 되돌림
// - OIB-reversal: Rif/Utz (2021) — 오더 불균형 조건부 음의 자기상관
// - 변동성 군집: 밴드폭 수축 후 확대 패턴
// 승률 목표: 52.1%+ (92% 페이아웃 손익분기)
// ============================================================

import { Candle } from '../../signals/types'
import { RSI, BollingerBands } from '../../indicators'
import { StrategyResult, HighWinRateConfig, DEFAULT_CONFIG } from './high-winrate'

// ============================================================
// ZMR-60 Configuration
// ============================================================

export interface ZMR60Config {
  // Z-score 파라미터
  lookbackReturns: number   // 수익률 통계 lookback 구간
  zThreshold: number        // Z-score 트리거 임계값

  // RSI 파라미터
  rsiPeriod: number
  rsiOversold: number
  rsiOverbought: number

  // Bollinger Bands 파라미터
  bbPeriod: number
  bbStdDev: number
  bbCallThreshold: number   // CALL: bbPosition 상한
  bbPutThreshold: number    // PUT: bbPosition 하한

  // Candle rejection (윅) 파라미터
  wickThreshold: number     // 윅 비율 임계값

  // 다중 확인
  confirmMin: number        // 최소 확인 조건 수 (RSI, BB, 윅 중)

  // 데이터 요구사항
  minCandles: number        // 최소 캔들 수
}

export const DEFAULT_ZMR60_CONFIG: ZMR60Config = {
  lookbackReturns: 60,
  zThreshold: 2.5,
  rsiPeriod: 7,
  rsiOversold: 25,
  rsiOverbought: 75,
  bbPeriod: 20,
  bbStdDev: 2,
  bbCallThreshold: 0.10,
  bbPutThreshold: 0.90,
  wickThreshold: 0.45,
  confirmMin: 2,
  minCandles: 80,
}

// ============================================================
// ZMR-60 Strategy Implementation
// ============================================================

export function zmr60Strategy(
  candles: Candle[],
  config: Partial<ZMR60Config> = {}
): StrategyResult {
  const cfg = { ...DEFAULT_ZMR60_CONFIG, ...config }

  // 1. 데이터 충분성 체크
  if (candles.length < cfg.minCandles) {
    return { signal: null, confidence: 0, reason: 'Insufficient data for ZMR-60', indicators: {} }
  }

  const closes = candles.map(c => c.close)

  // 2. 로그수익률 계산
  const logReturns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] <= 0 || closes[i] <= 0) continue
    logReturns.push(Math.log(closes[i] / closes[i - 1]))
  }

  if (logReturns.length < cfg.lookbackReturns + 1) {
    return { signal: null, confidence: 0, reason: 'Insufficient returns for Z-score', indicators: {} }
  }

  // 3. lookback 구간 평균/표준편차 → Z-score
  const lookbackSlice = logReturns.slice(-(cfg.lookbackReturns + 1), -1)
  const mu = lookbackSlice.reduce((a, b) => a + b, 0) / lookbackSlice.length

  const squaredDiffs = lookbackSlice.map(r => (r - mu) ** 2)
  const sigma = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / lookbackSlice.length)

  if (sigma === 0) {
    return { signal: null, confidence: 0, reason: 'Zero volatility — no signal', indicators: {} }
  }

  const rLast = logReturns[logReturns.length - 1]
  const z = (rLast - mu) / sigma

  // 4. Z-score 트리거 체크
  const isCallCandidate = z <= -cfg.zThreshold
  const isPutCandidate = z >= cfg.zThreshold

  if (!isCallCandidate && !isPutCandidate) {
    return {
      signal: null,
      confidence: 0,
      reason: `ZMR-60: z=${z.toFixed(2)}, no trigger (threshold=±${cfg.zThreshold})`,
      indicators: { z, sigma, rLast, mu },
    }
  }

  // 5. 다중 확인 필터
  let confirmCount = 0

  // 5a. RSI 확인
  const rsiArray = RSI.calculate(closes, cfg.rsiPeriod)
  const currentRSI = rsiArray.length > 0 ? rsiArray[rsiArray.length - 1] : 50
  const prevRSI = rsiArray.length > 1 ? rsiArray[rsiArray.length - 2] : 50

  let rsiConfirm = false
  if (isCallCandidate) {
    // CALL: RSI < oversold 또는 oversold 상향 재진입
    rsiConfirm = currentRSI < cfg.rsiOversold ||
      (prevRSI < cfg.rsiOversold && currentRSI >= cfg.rsiOversold)
  } else {
    // PUT: RSI > overbought 또는 하향 재진입
    rsiConfirm = currentRSI > cfg.rsiOverbought ||
      (prevRSI > cfg.rsiOverbought && currentRSI <= cfg.rsiOverbought)
  }
  if (rsiConfirm) confirmCount++

  // 5b. Bollinger Bands 위치 확인
  const bbArray = BollingerBands.calculate(closes, cfg.bbPeriod, cfg.bbStdDev)
  let bbPosition = 0.5
  if (bbArray.length > 0) {
    const currentBB = bbArray[bbArray.length - 1]
    const bbRange = currentBB.upper - currentBB.lower
    bbPosition = bbRange > 0 ? (closes[closes.length - 1] - currentBB.lower) / bbRange : 0.5
  }

  let bbConfirm = false
  if (isCallCandidate) {
    bbConfirm = bbPosition < cfg.bbCallThreshold
  } else {
    bbConfirm = bbPosition > cfg.bbPutThreshold
  }
  if (bbConfirm) confirmCount++

  // 5c. Candle rejection (윅 비율) 확인
  const lastCandle = candles[candles.length - 1]
  const candleRange = lastCandle.high - lastCandle.low
  let wickRatio = 0
  if (candleRange > 0) {
    if (isCallCandidate) {
      // 하방 윅: (min(open, close) - low) / range
      const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low
      wickRatio = lowerWick / candleRange
    } else {
      // 상방 윅: (high - max(open, close)) / range
      const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close)
      wickRatio = upperWick / candleRange
    }
  }

  let wickConfirm = false
  if (wickRatio >= cfg.wickThreshold) {
    wickConfirm = true
    confirmCount++
  }

  // 6. 최소 확인 조건 미충족 → 신호 없음
  if (confirmCount < cfg.confirmMin) {
    return {
      signal: null,
      confidence: 0,
      reason: `ZMR-60: z=${z.toFixed(2)}, confirms=${confirmCount}/${cfg.confirmMin} (RSI:${rsiConfirm ? 'Y' : 'N'}, BB:${bbConfirm ? 'Y' : 'N'}, wick:${wickConfirm ? 'Y' : 'N'})`,
      indicators: { z, sigma, rLast, mu, rsi: currentRSI, bbPosition, wickRatio, confirmCount },
    }
  }

  // 7. Confidence 산정
  const absZ = Math.abs(z)
  const zExcess = absZ - cfg.zThreshold
  let confidence = 0.60

  // |z|가 threshold를 초과한 만큼 가산 (0.1 당 +0.05, 상한 +0.20)
  confidence += Math.min(zExcess * 0.5, 0.20)

  // confirmCount에 따라 가산
  if (confirmCount === 2) confidence += 0.05
  if (confirmCount === 3) confidence += 0.10

  // 상한 0.90
  confidence = Math.min(confidence, 0.90)

  // 8. 결과 반환
  const direction: 'CALL' | 'PUT' = isCallCandidate ? 'CALL' : 'PUT'
  const indicators = {
    z,
    sigma,
    rLast,
    mu,
    rsi: currentRSI,
    bbPosition,
    wickRatio,
    confirmCount,
  }

  return {
    signal: direction,
    confidence,
    reason: `ZMR-60: z=${z.toFixed(1)}, RSI=${currentRSI.toFixed(1)}, BBpos=${bbPosition.toFixed(2)}, wick=${wickRatio.toFixed(2)}`,
    indicators,
  }
}

// ============================================================
// Convenience wrapper following HighWinRateConfig pattern
// ============================================================

export function zmr60WithHighWinRateConfig(
  candles: Candle[],
  hwConfig: Partial<HighWinRateConfig> = {}
): StrategyResult {
  const mergedConfig: Partial<ZMR60Config> = {}
  const cfg = { ...DEFAULT_CONFIG, ...hwConfig }

  mergedConfig.rsiPeriod = cfg.rsiPeriod
  mergedConfig.rsiOversold = cfg.rsiOversold
  mergedConfig.rsiOverbought = cfg.rsiOverbought

  return zmr60Strategy(candles, mergedConfig)
}
