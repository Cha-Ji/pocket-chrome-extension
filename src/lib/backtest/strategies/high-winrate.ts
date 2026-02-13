// ============================================================
// High Win-Rate Strategies (52.1%+ Target)
// ============================================================
// 목표: 92% 페이아웃에서 수익을 내기 위해 52.1% 이상 승률 달성
// 핵심: 단일 인디케이터 대신 다중 확인(Multi-Confirmation)
// ============================================================

import { Candle } from '../../signals/types'
import {
  RSI,
  MACD,
  BollingerBands,
  Stochastic,
  EMA,
} from '../../indicators'

// ============================================================
// Strategy Interfaces
// ============================================================

export interface StrategyResult {
  signal: 'CALL' | 'PUT' | null
  confidence: number
  reason: string
  indicators: Record<string, number>
  /** 전략이 제안하는 만기 시간(초). 설정 시 config.expirySeconds 대신 사용. */
  expiryOverride?: number
}

export interface HighWinRateConfig {
  rsiPeriod: number
  rsiOversold: number
  rsiOverbought: number
}

export const DEFAULT_CONFIG: HighWinRateConfig = {
  rsiPeriod: 7,
  rsiOversold: 25,
  rsiOverbought: 75,
}

// ============================================================
// Strategy 1: RSI Extreme + MACD Confirmation
// ============================================================

export function rsiMacdStrategy(
  candles: Candle[],
  config: Partial<HighWinRateConfig> = {}
): StrategyResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (candles.length < 40) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} }
  }

  const closes = candles.map(c => c.close)

  // RSI 계산 (배열 반환)
  const rsiArray = RSI.calculate(closes, cfg.rsiPeriod)
  if (rsiArray.length < 2) {
    return { signal: null, confidence: 0, reason: 'Not enough RSI data', indicators: {} }
  }

  const currentRSI = rsiArray[rsiArray.length - 1]
  const prevRSI = rsiArray[rsiArray.length - 2]

  // MACD 계산 (배열 반환)
  const macdArray = MACD.calculate(closes)
  if (macdArray.length < 2) {
    return { signal: null, confidence: 0, reason: 'Not enough MACD data', indicators: {} }
  }

  const currentMACD = macdArray[macdArray.length - 1]
  const prevMACD = macdArray[macdArray.length - 2]

  const indicators = {
    rsi: currentRSI,
    macdHistogram: currentMACD.histogram,
    macd: currentMACD.macd,
    signal: currentMACD.signal,
  }

  // CALL: RSI 과매도 + MACD 히스토그램 상승
  if (currentRSI < cfg.rsiOversold && prevRSI <= currentRSI) {
    if (currentMACD.histogram > 0 || currentMACD.histogram > prevMACD.histogram) {
      return {
        signal: 'CALL',
        confidence: 0.7,
        reason: `RSI oversold (${currentRSI.toFixed(1)}) + MACD bullish`,
        indicators
      }
    }
  }

  // PUT: RSI 과매수 + MACD 히스토그램 하락
  if (currentRSI > cfg.rsiOverbought && prevRSI >= currentRSI) {
    if (currentMACD.histogram < 0 || currentMACD.histogram < prevMACD.histogram) {
      return {
        signal: 'PUT',
        confidence: 0.7,
        reason: `RSI overbought (${currentRSI.toFixed(1)}) + MACD bearish`,
        indicators
      }
    }
  }

  return { signal: null, confidence: 0, reason: 'No signal', indicators }
}

// ============================================================
// Strategy 2: RSI + Bollinger Bands Bounce
// ============================================================

export function rsiBBBounceStrategy(
  candles: Candle[],
  config: Partial<HighWinRateConfig> = {}
): StrategyResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (candles.length < 30) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} }
  }

  const closes = candles.map(c => c.close)
  const currentPrice = closes[closes.length - 1]

  // RSI 계산
  const rsiArray = RSI.calculate(closes, cfg.rsiPeriod)
  if (rsiArray.length < 1) {
    return { signal: null, confidence: 0, reason: 'Not enough RSI', indicators: {} }
  }
  const currentRSI = rsiArray[rsiArray.length - 1]

  // Bollinger Bands 계산
  const bbArray = BollingerBands.calculate(closes, 20, 2)
  if (bbArray.length < 1) {
    return { signal: null, confidence: 0, reason: 'Not enough BB', indicators: {} }
  }
  const currentBB = bbArray[bbArray.length - 1]

  // BB 위치 (0 = lower, 0.5 = middle, 1 = upper)
  const bbRange = currentBB.upper - currentBB.lower
  const bbPosition = bbRange > 0 ? (currentPrice - currentBB.lower) / bbRange : 0.5

  const indicators = {
    rsi: currentRSI,
    bbPosition,
    price: currentPrice,
    bbUpper: currentBB.upper,
    bbLower: currentBB.lower,
  }

  // CALL: RSI 과매도 + 가격이 하단 밴드 근처
  if (currentRSI < cfg.rsiOversold && bbPosition < 0.15) {
    return {
      signal: 'CALL',
      confidence: 0.75,
      reason: `RSI ${currentRSI.toFixed(1)} + BB lower touch`,
      indicators
    }
  }

  // PUT: RSI 과매수 + 가격이 상단 밴드 근처
  if (currentRSI > cfg.rsiOverbought && bbPosition > 0.85) {
    return {
      signal: 'PUT',
      confidence: 0.75,
      reason: `RSI ${currentRSI.toFixed(1)} + BB upper touch`,
      indicators
    }
  }

  return { signal: null, confidence: 0, reason: 'No signal', indicators }
}

// ============================================================
// Strategy 3: Simple RSI Reversal (No ADX)
// ============================================================

export function adxFilteredRsiStrategy(
  candles: Candle[],
  config: Partial<HighWinRateConfig> = {}
): StrategyResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (candles.length < 30) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} }
  }

  const closes = candles.map(c => c.close)

  // RSI 계산
  const rsiArray = RSI.calculate(closes, cfg.rsiPeriod)
  if (rsiArray.length < 2) {
    return { signal: null, confidence: 0, reason: 'Not enough RSI', indicators: {} }
  }

  const currentRSI = rsiArray[rsiArray.length - 1]
  const prevRSI = rsiArray[rsiArray.length - 2]

  const indicators = {
    rsi: currentRSI,
    prevRsi: prevRSI,
  }

  // 단순 RSI 반전 (ADX 없이)
  // CALL: RSI가 매우 낮고(< 20) 상승 시작
  if (currentRSI < 20 && currentRSI > prevRSI) {
    return {
      signal: 'CALL',
      confidence: 0.65,
      reason: `RSI extreme oversold reversal ${currentRSI.toFixed(1)}`,
      indicators
    }
  }

  // PUT: RSI가 매우 높고(> 80) 하락 시작
  if (currentRSI > 80 && currentRSI < prevRSI) {
    return {
      signal: 'PUT',
      confidence: 0.65,
      reason: `RSI extreme overbought reversal ${currentRSI.toFixed(1)}`,
      indicators
    }
  }

  return { signal: null, confidence: 0, reason: 'No signal', indicators }
}

// ============================================================
// Strategy 4: Triple Confirmation (RSI + Stoch + MACD)
// ============================================================

export function tripleConfirmationStrategy(
  candles: Candle[],
  config: Partial<HighWinRateConfig> = {}
): StrategyResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (candles.length < 40) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} }
  }

  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const closes = candles.map(c => c.close)

  // RSI
  const rsiArray = RSI.calculate(closes, cfg.rsiPeriod)
  if (rsiArray.length < 1) {
    return { signal: null, confidence: 0, reason: 'Not enough RSI', indicators: {} }
  }
  const currentRSI = rsiArray[rsiArray.length - 1]

  // Stochastic
  const stochArray = Stochastic.calculate(highs, lows, closes, 14, 3)
  if (stochArray.length < 2) {
    return { signal: null, confidence: 0, reason: 'Not enough Stoch', indicators: {} }
  }
  const currentStoch = stochArray[stochArray.length - 1]
  const prevStoch = stochArray[stochArray.length - 2]

  // MACD
  const macdArray = MACD.calculate(closes)
  if (macdArray.length < 1) {
    return { signal: null, confidence: 0, reason: 'Not enough MACD', indicators: {} }
  }
  const currentMACD = macdArray[macdArray.length - 1]

  const indicators = {
    rsi: currentRSI,
    stochK: currentStoch.k,
    stochD: currentStoch.d,
    macdHistogram: currentMACD.histogram,
  }

  // CALL: RSI < 35 + Stoch K < 30 (K가 D 상향돌파) + MACD 히스토그램 양수
  const rsiBullish = currentRSI < 35
  const stochBullish = currentStoch.k < 30 && currentStoch.k > prevStoch.k && currentStoch.k > currentStoch.d
  const macdBullish = currentMACD.histogram > 0

  if (rsiBullish && stochBullish && macdBullish) {
    return {
      signal: 'CALL',
      confidence: 0.8,
      reason: 'Triple bullish confirmation',
      indicators
    }
  }

  // PUT: RSI > 65 + Stoch K > 70 (K가 D 하향돌파) + MACD 히스토그램 음수
  const rsiBearish = currentRSI > 65
  const stochBearish = currentStoch.k > 70 && currentStoch.k < prevStoch.k && currentStoch.k < currentStoch.d
  const macdBearish = currentMACD.histogram < 0

  if (rsiBearish && stochBearish && macdBearish) {
    return {
      signal: 'PUT',
      confidence: 0.8,
      reason: 'Triple bearish confirmation',
      indicators
    }
  }

  return { signal: null, confidence: 0, reason: 'No triple confirmation', indicators }
}

// ============================================================
// Strategy 5: EMA Trend + RSI Pullback
// ============================================================

export function emaTrendRsiPullbackStrategy(
  candles: Candle[],
  config: Partial<HighWinRateConfig> = {}
): StrategyResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (candles.length < 50) {
    return { signal: null, confidence: 0, reason: 'Insufficient data', indicators: {} }
  }

  const closes = candles.map(c => c.close)
  const currentPrice = closes[closes.length - 1]

  // EMA 계산 (9, 21)
  const ema9Array = EMA.calculate(closes, 9)
  const ema21Array = EMA.calculate(closes, 21)

  if (ema9Array.length < 2 || ema21Array.length < 2) {
    return { signal: null, confidence: 0, reason: 'Not enough EMA', indicators: {} }
  }

  const currentEMA9 = ema9Array[ema9Array.length - 1]
  const currentEMA21 = ema21Array[ema21Array.length - 1]

  // 트렌드 방향 판단
  const isUptrend = currentEMA9 > currentEMA21 && currentPrice > currentEMA21
  const isDowntrend = currentEMA9 < currentEMA21 && currentPrice < currentEMA21

  // RSI 계산
  const rsiArray = RSI.calculate(closes, cfg.rsiPeriod)
  if (rsiArray.length < 2) {
    return { signal: null, confidence: 0, reason: 'Not enough RSI', indicators: {} }
  }
  const currentRSI = rsiArray[rsiArray.length - 1]
  const prevRSI = rsiArray[rsiArray.length - 2]

  const indicators = {
    rsi: currentRSI,
    ema9: currentEMA9,
    ema21: currentEMA21,
    price: currentPrice,
  }

  // CALL: 상승 트렌드 + RSI 40-55에서 반등
  if (isUptrend && currentRSI >= 40 && currentRSI <= 55 && currentRSI > prevRSI) {
    return {
      signal: 'CALL',
      confidence: 0.7,
      reason: `Uptrend pullback: RSI ${currentRSI.toFixed(1)} bouncing`,
      indicators
    }
  }

  // PUT: 하락 트렌드 + RSI 45-60에서 하락
  if (isDowntrend && currentRSI >= 45 && currentRSI <= 60 && currentRSI < prevRSI) {
    return {
      signal: 'PUT',
      confidence: 0.7,
      reason: `Downtrend pullback: RSI ${currentRSI.toFixed(1)} dropping`,
      indicators
    }
  }

  return { signal: null, confidence: 0, reason: 'No trend pullback signal', indicators }
}

// ============================================================
// Combined Strategy Selector
// ============================================================

export type StrategyName =
  | 'rsi-macd'
  | 'rsi-bb'
  | 'adx-rsi'
  | 'triple-confirm'
  | 'ema-pullback'

export function runHighWinRateStrategy(
  strategyName: StrategyName,
  candles: Candle[],
  config: Partial<HighWinRateConfig> = {}
): StrategyResult {
  switch (strategyName) {
    case 'rsi-macd':
      return rsiMacdStrategy(candles, config)
    case 'rsi-bb':
      return rsiBBBounceStrategy(candles, config)
    case 'adx-rsi':
      return adxFilteredRsiStrategy(candles, config)
    case 'triple-confirm':
      return tripleConfirmationStrategy(candles, config)
    case 'ema-pullback':
      return emaTrendRsiPullbackStrategy(candles, config)
    default:
      return { signal: null, confidence: 0, reason: 'Unknown strategy', indicators: {} }
  }
}

// ============================================================
// Vote Strategy (Multiple Confirmations)
// ============================================================

export function voteStrategy(
  candles: Candle[],
  minVotes: number = 3,
  config: Partial<HighWinRateConfig> = {}
): StrategyResult {
  const strategies: StrategyName[] = ['rsi-macd', 'rsi-bb', 'adx-rsi', 'triple-confirm', 'ema-pullback']

  let callVotes = 0
  let putVotes = 0
  const reasons: string[] = []
  const allIndicators: Record<string, number> = {}

  for (const name of strategies) {
    const result = runHighWinRateStrategy(name, candles, config)

    if (result.signal === 'CALL') {
      callVotes++
      reasons.push(`${name}: CALL`)
    } else if (result.signal === 'PUT') {
      putVotes++
      reasons.push(`${name}: PUT`)
    }

    // 인디케이터 병합
    Object.entries(result.indicators).forEach(([key, value]) => {
      if (typeof value === 'number') {
        allIndicators[`${name}_${key}`] = value
      }
    })
  }

  allIndicators.callVotes = callVotes
  allIndicators.putVotes = putVotes

  if (callVotes >= minVotes) {
    return {
      signal: 'CALL',
      confidence: callVotes / strategies.length,
      reason: `${callVotes}/${strategies.length} strategies agree: CALL`,
      indicators: allIndicators
    }
  }

  if (putVotes >= minVotes) {
    return {
      signal: 'PUT',
      confidence: putVotes / strategies.length,
      reason: `${putVotes}/${strategies.length} strategies agree: PUT`,
      indicators: allIndicators
    }
  }

  return {
    signal: null,
    confidence: 0,
    reason: `No consensus: ${callVotes} CALL, ${putVotes} PUT (need ${minVotes})`,
    indicators: allIndicators
  }
}
