// ============================================================
// Tick-Based Strategies — TIF-60 (Tick Imbalance Fade, 60s)
// ============================================================
// 이론적 근거:
//   - OIB-reversal: Order Imbalance 조건부 수익률 되돌림 (Sirnes 2021, Chordia et al. 2002)
//   - 초단기 리버설: 유동성 불균형 + bid-ask bounce (Heston et al. 2010)
// 핵심: 극단적 틱 쏠림(imbalance) 후 모멘텀 둔화(stall) 감지 → 되돌림 진입
// ============================================================

import { StrategyResult } from '../lib/backtest/strategies/high-winrate'
import { TickData } from './candle-collector'
import { Candle } from '../lib/signals/types'

// ============================================================
// Configuration
// ============================================================

export interface TIF60Config {
  /** 분석 윈도우 (초) */
  windowSec: number
  /** 최소 틱 수 — 미만이면 신호 금지 (유동성 부족) */
  minTicks: number
  /** 불균형 임계값 (0~1). 높을수록 보수적 */
  imbalanceThreshold: number
  /** 표준화 가격변화 임계값 (sigma 단위) */
  deltaZThreshold: number
  /** 모멘텀 둔화 감지용 최근 틱 수 */
  stallLookbackTicks: number
  /** stall 판정: 반대방향 틱 비율 임계 (0~1) */
  stallRatioThreshold: number
  /** 기본 신뢰도 */
  baseConfidence: number
  /** 최대 신뢰도 */
  maxConfidence: number
  /** candle std 계산에 필요한 최소 캔들 수 */
  minCandlesForStd: number
}

export const DEFAULT_TIF60_CONFIG: TIF60Config = {
  windowSec: 20,
  minTicks: 80,
  imbalanceThreshold: 0.65,
  deltaZThreshold: 2.0,
  stallLookbackTicks: 10,
  stallRatioThreshold: 0.4,
  baseConfidence: 0.60,
  maxConfidence: 0.90,
  minCandlesForStd: 10,
}

// ============================================================
// Core Strategy
// ============================================================

/**
 * TIF-60: Tick Imbalance Fade Strategy
 *
 * 최근 windowSec 구간의 틱에서 업/다운 불균형을 계산하고,
 * 극단적 쏠림 + 가격 움직임 + 모멘텀 둔화(stall) 조건이 동시 충족될 때
 * 되돌림 방향으로 신호를 생성한다.
 *
 * @param ticks - 해당 ticker의 최근 틱 데이터 (시간 역순 정렬 불필요, 내부 정렬)
 * @param candles - (선택) 1분봉 데이터 — deltaZ 표준화에 사용
 * @param config - 파라미터 오버라이드
 */
export function tickImbalanceFadeStrategy(
  ticks: TickData[],
  candles?: Candle[],
  config?: Partial<TIF60Config>
): StrategyResult {
  const cfg = { ...DEFAULT_TIF60_CONFIG, ...config }
  const noSignal = (reason: string, indicators: Record<string, number> = {}): StrategyResult => ({
    signal: null,
    confidence: 0,
    reason,
    indicators,
  })

  // ── 1. 윈도우 필터 ──
  // Use max timestamp instead of assuming last element is newest (ticks may arrive out-of-order)
  const now = ticks.length > 0
    ? ticks.reduce((max, t) => t.timestamp > max ? t.timestamp : max, ticks[0].timestamp)
    : Date.now()
  const windowMs = cfg.windowSec * 1000
  const windowTicks = ticks
    .filter(t => t.timestamp >= now - windowMs && t.timestamp <= now)
    .sort((a, b) => a.timestamp - b.timestamp)

  const tickCount = windowTicks.length

  // ── 2. 최소 틱 수 체크 ──
  if (tickCount < cfg.minTicks) {
    return noSignal(`Insufficient ticks: ${tickCount}/${cfg.minTicks}`, { tickCount })
  }

  // ── 3. Imbalance 계산 ──
  let up = 0
  let down = 0
  for (let i = 1; i < windowTicks.length; i++) {
    const diff = windowTicks[i].price - windowTicks[i - 1].price
    if (diff > 0) up++
    else if (diff < 0) down++
    // diff === 0 → unchanged, 무시
  }

  const totalMoves = up + down
  if (totalMoves === 0) {
    return noSignal('No price movement', { tickCount, up, down })
  }

  const imbalance = (up - down) / totalMoves
  const imbalanceAbs = Math.abs(imbalance)

  // ── 4. Imbalance 임계 체크 ──
  if (imbalanceAbs < cfg.imbalanceThreshold) {
    return noSignal(`Imbalance too low: ${imbalanceAbs.toFixed(3)}`, {
      tickCount, up, down, imbalance, imbalanceAbs,
    })
  }

  // ── 5. Delta (가격변화) 계산 ──
  const firstPrice = windowTicks[0].price
  const lastPrice = windowTicks[windowTicks.length - 1].price
  const delta = lastPrice - firstPrice
  const deltaAbs = Math.abs(delta)

  // ── 6. DeltaZ 표준화 ──
  let deltaZ = 0
  let candleStd = 0

  if (candles && candles.length >= cfg.minCandlesForStd) {
    // 캔들 close-to-close returns의 표준편차로 표준화
    const returns: number[] = []
    for (let i = 1; i < candles.length; i++) {
      if (candles[i - 1].close !== 0) {
        returns.push(candles[i].close - candles[i - 1].close)
      }
    }

    if (returns.length > 1) {
      const mean = returns.reduce((s, v) => s + v, 0) / returns.length
      const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1)
      candleStd = Math.sqrt(variance)
    }

    if (candleStd > 0) {
      deltaZ = deltaAbs / candleStd
    }
  }

  // candleStd를 구하지 못한 경우: 틱 자체의 변화 분포로 폴백
  if (candleStd === 0) {
    const tickDeltas: number[] = []
    for (let i = 1; i < windowTicks.length; i++) {
      tickDeltas.push(windowTicks[i].price - windowTicks[i - 1].price)
    }
    if (tickDeltas.length > 1) {
      const mean = tickDeltas.reduce((s, v) => s + v, 0) / tickDeltas.length
      const variance = tickDeltas.reduce((s, v) => s + (v - mean) ** 2, 0) / (tickDeltas.length - 1)
      const tickStd = Math.sqrt(variance)
      // 전체 delta를 총 이동(sqrt(n) * tickStd)로 표준화
      if (tickStd > 0) {
        const expectedRange = Math.sqrt(windowTicks.length) * tickStd
        deltaZ = deltaAbs / expectedRange
      }
    }
  }

  // deltaZ 미달 → 움직임이 노이즈 범위
  if (deltaZ < cfg.deltaZThreshold) {
    return noSignal(`DeltaZ too low: ${deltaZ.toFixed(2)}`, {
      tickCount, up, down, imbalance, imbalanceAbs, delta, deltaAbs, deltaZ, candleStd,
    })
  }

  // ── 7. Stall (모멘텀 둔화) 감지 ──
  const stallTicks = windowTicks.slice(-cfg.stallLookbackTicks)
  if (stallTicks.length < 3) {
    return noSignal('Not enough ticks for stall detection', {
      tickCount, up, down, imbalance, imbalanceAbs, delta, deltaZ,
    })
  }

  let stallReverse = 0
  let stallTotal = 0
  const dominantDirection = imbalance > 0 ? 'up' : 'down' // 쏠림 방향

  for (let i = 1; i < stallTicks.length; i++) {
    const diff = stallTicks[i].price - stallTicks[i - 1].price
    if (diff !== 0) {
      stallTotal++
      // 쏠림 방향의 반대 틱을 카운트
      if (dominantDirection === 'up' && diff < 0) stallReverse++
      if (dominantDirection === 'down' && diff > 0) stallReverse++
    }
  }

  const stallRatio = stallTotal > 0 ? stallReverse / stallTotal : 0

  // stall이 부족하면 → 아직 모멘텀 진행 중, 페이드하기 이름
  if (stallRatio < cfg.stallRatioThreshold) {
    return noSignal(`No stall detected: ratio ${stallRatio.toFixed(2)}`, {
      tickCount, up, down, imbalance, imbalanceAbs, delta, deltaZ,
      stallRatio, stallReverse, stallTotal,
    })
  }

  // ── 8. 신호 생성 ──
  // 매수 쏠림(imbalance > 0) → PUT (되돌림 기대)
  // 매도 쏠림(imbalance < 0) → CALL (되돌림 기대)
  const direction: 'CALL' | 'PUT' = imbalance > 0 ? 'PUT' : 'CALL'

  // ── 9. Confidence 계산 ──
  // 기본값 + imbalanceAbs 가산 + deltaZ 가산
  const imbalanceBonus = Math.min((imbalanceAbs - cfg.imbalanceThreshold) * 0.3, 0.15)
  const deltaZBonus = Math.min((deltaZ - cfg.deltaZThreshold) * 0.05, 0.10)
  const stallBonus = Math.min((stallRatio - cfg.stallRatioThreshold) * 0.1, 0.05)
  const confidence = Math.min(
    cfg.baseConfidence + imbalanceBonus + deltaZBonus + stallBonus,
    cfg.maxConfidence
  )

  const indicators: Record<string, number> = {
    tickCount,
    up,
    down,
    imbalance,
    imbalanceAbs,
    delta,
    deltaAbs,
    deltaZ,
    candleStd,
    stallRatio,
    stallReverse,
    stallTotal,
  }

  return {
    signal: direction,
    confidence,
    reason: `TIF-60: ${direction} fade (imb=${imbalance.toFixed(2)}, dZ=${deltaZ.toFixed(1)}, stall=${stallRatio.toFixed(2)})`,
    indicators,
  }
}
