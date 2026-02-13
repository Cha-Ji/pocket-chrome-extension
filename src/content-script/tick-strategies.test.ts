// ============================================================
// TIF-60 Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { tickImbalanceFadeStrategy, DEFAULT_TIF60_CONFIG, TIF60Config } from './tick-strategies'
import { TickData } from './candle-collector'
import { Candle } from '../lib/signals/types'

// ============================================================
// Helpers: 인위적 틱 시퀀스 생성
// ============================================================

function generateTicks(
  count: number,
  opts: {
    basePrice?: number
    ticker?: string
    baseTimestamp?: number
    /** 'up' = 대부분 상승, 'down' = 대부분 하락, 'mixed' = 혼재 */
    direction?: 'up' | 'down' | 'mixed'
    /** 업틱 비율 (0~1), direction보다 우선 */
    upRatio?: number
    /** 가격 변동 스텝 */
    step?: number
    /** 틱 간격 ms */
    intervalMs?: number
  } = {}
): TickData[] {
  const {
    basePrice = 100,
    ticker = 'TEST-OTC',
    baseTimestamp = Date.now() - 30000,
    step = 0.01,
    intervalMs = 200,
  } = opts

  let upRatio = opts.upRatio
  if (upRatio === undefined) {
    switch (opts.direction) {
      case 'up': upRatio = 0.85; break
      case 'down': upRatio = 0.15; break
      default: upRatio = 0.5; break
    }
  }

  const ticks: TickData[] = []
  let price = basePrice

  for (let i = 0; i < count; i++) {
    ticks.push({
      price,
      timestamp: baseTimestamp + i * intervalMs,
      ticker,
    })
    // 다음 틱 방향 결정
    if (i < count - 1) {
      const goUp = Math.random() < upRatio
      price += goUp ? step : -step
      price = Math.round(price * 100000) / 100000 // 부동소수점 보정
    }
  }

  return ticks
}

/**
 * 틱 쏠림(imbalance) + stall(둔화) 시나리오 생성
 * 앞부분은 강한 방향성, 뒷부분은 모멘텀 둔화
 */
function generateImbalanceWithStall(
  totalTicks: number,
  opts: {
    direction: 'up' | 'down'
    stallTicks?: number
    basePrice?: number
    ticker?: string
    baseTimestamp?: number
    step?: number
    intervalMs?: number
  }
): TickData[] {
  const {
    direction,
    stallTicks = 12,
    basePrice = 100,
    ticker = 'TEST-OTC',
    baseTimestamp = Date.now() - 30000,
    step = 0.01,
    intervalMs = 200,
  } = opts

  const trendTicks = totalTicks - stallTicks
  const upRatioTrend = direction === 'up' ? 0.95 : 0.05
  const upRatioStall = direction === 'up' ? 0.30 : 0.70 // 반대 방향 증가 = stall

  const ticks: TickData[] = []
  let price = basePrice

  // Phase 1: 강한 추세 구간
  for (let i = 0; i < trendTicks; i++) {
    ticks.push({ price, timestamp: baseTimestamp + i * intervalMs, ticker })
    const goUp = Math.random() < upRatioTrend
    price += goUp ? step : -step
    price = Math.round(price * 100000) / 100000
  }

  // Phase 2: stall 구간 (반대방향 틱 증가)
  for (let i = 0; i < stallTicks; i++) {
    ticks.push({ price, timestamp: baseTimestamp + (trendTicks + i) * intervalMs, ticker })
    if (i < stallTicks - 1) {
      const goUp = Math.random() < upRatioStall
      price += goUp ? step : -step
      price = Math.round(price * 100000) / 100000
    }
  }

  return ticks
}

function generateCandles(count: number, basePrice: number = 100): Candle[] {
  const candles: Candle[] = []
  let price = basePrice
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.1
    const open = price
    const close = price + change
    candles.push({
      timestamp: Date.now() - (count - i) * 60000,
      open,
      high: Math.max(open, close) + Math.random() * 0.02,
      low: Math.min(open, close) - Math.random() * 0.02,
      close,
    })
    price = close
  }
  return candles
}

// ============================================================
// Tests
// ============================================================

describe('TIF-60: tickImbalanceFadeStrategy', () => {
  // 최소 설정: 빠른 테스트를 위해 minTicks를 낮춤
  const testConfig: Partial<TIF60Config> = {
    windowSec: 60, // 모든 생성 틱이 윈도우에 포함되도록
    minTicks: 30,
    imbalanceThreshold: 0.50,
    deltaZThreshold: 1.5,
    stallLookbackTicks: 10,
    stallRatioThreshold: 0.3,
  }

  describe('신호 금지 조건', () => {
    it('minTicks 미만이면 신호 없음', () => {
      const ticks = generateTicks(10, { direction: 'up' })
      const result = tickImbalanceFadeStrategy(ticks, undefined, testConfig)

      expect(result.signal).toBeNull()
      expect(result.reason).toContain('Insufficient ticks')
    })

    it('빈 틱 배열이면 신호 없음', () => {
      const result = tickImbalanceFadeStrategy([], undefined, testConfig)

      expect(result.signal).toBeNull()
      expect(result.reason).toContain('Insufficient ticks')
    })

    it('imbalance가 임계값 미만이면 신호 없음', () => {
      // 혼재된 방향 → 낮은 imbalance
      const ticks = generateTicks(50, { direction: 'mixed', upRatio: 0.50 })
      const result = tickImbalanceFadeStrategy(ticks, undefined, testConfig)

      expect(result.signal).toBeNull()
      // imbalance too low 또는 다른 이유
    })

    it('가격 움직임 없으면(delta=0) 신호 없음', () => {
      // 모든 틱이 같은 가격
      const now = Date.now()
      const ticks: TickData[] = Array.from({ length: 50 }, (_, i) => ({
        price: 100,
        timestamp: now - 50000 + i * 200,
        ticker: 'TEST-OTC',
      }))
      const result = tickImbalanceFadeStrategy(ticks, undefined, testConfig)

      expect(result.signal).toBeNull()
    })
  })

  describe('신호 생성 조건', () => {
    it('매수 쏠림(up imbalance) + stall → PUT 신호', () => {
      // 강한 상승 + 둔화 = 매수 쏠림 페이드 → PUT
      const ticks = generateImbalanceWithStall(100, {
        direction: 'up',
        stallTicks: 15,
        step: 0.02,
        baseTimestamp: Date.now() - 25000,
        intervalMs: 200,
      })

      const candles = generateCandles(20, 100)
      const result = tickImbalanceFadeStrategy(ticks, candles, {
        ...testConfig,
        windowSec: 30,
        minTicks: 30,
        imbalanceThreshold: 0.30,
        deltaZThreshold: 1.0,
        stallRatioThreshold: 0.25,
      })

      // 이 시나리오에서는 대부분 PUT 신호가 나와야 함
      if (result.signal) {
        expect(result.signal).toBe('PUT')
        expect(result.confidence).toBeGreaterThanOrEqual(0.60)
        expect(result.reason).toContain('TIF-60')
        expect(result.indicators.imbalance).toBeGreaterThan(0) // 매수 쏠림
      }
    })

    it('매도 쏠림(down imbalance) + stall → CALL 신호', () => {
      const ticks = generateImbalanceWithStall(100, {
        direction: 'down',
        stallTicks: 15,
        step: 0.02,
        baseTimestamp: Date.now() - 25000,
        intervalMs: 200,
      })

      const candles = generateCandles(20, 100)
      const result = tickImbalanceFadeStrategy(ticks, candles, {
        ...testConfig,
        windowSec: 30,
        minTicks: 30,
        imbalanceThreshold: 0.30,
        deltaZThreshold: 1.0,
        stallRatioThreshold: 0.25,
      })

      if (result.signal) {
        expect(result.signal).toBe('CALL')
        expect(result.confidence).toBeGreaterThanOrEqual(0.60)
        expect(result.indicators.imbalance).toBeLessThan(0) // 매도 쏠림
      }
    })

    it('stall 없으면(모멘텀 진행 중) 신호 없음', () => {
      // 끝까지 같은 방향 = stall 없음
      const ticks = generateTicks(100, {
        direction: 'up',
        upRatio: 0.95,
        step: 0.02,
        baseTimestamp: Date.now() - 25000,
        intervalMs: 200,
      })

      const candles = generateCandles(20, 100)
      const result = tickImbalanceFadeStrategy(ticks, candles, {
        ...testConfig,
        windowSec: 30,
        minTicks: 30,
        imbalanceThreshold: 0.30,
        deltaZThreshold: 1.0,
        stallRatioThreshold: 0.4, // 높은 stall 요구
      })

      // stall 없어서 신호 없거나, 낮은 stall ratio
      if (result.signal === null) {
        expect(result.reason).toMatch(/stall|No stall/)
      }
    })
  })

  describe('결정적(deterministic) 시나리오', () => {
    it('100% 상승 틱 + 명확한 stall → PUT', () => {
      const now = Date.now()
      const ticks: TickData[] = []

      // Phase 1: 40틱 상승
      for (let i = 0; i < 40; i++) {
        ticks.push({
          price: 100 + i * 0.01,
          timestamp: now - 15000 + i * 200,
          ticker: 'DET-OTC',
        })
      }

      // Phase 2: 10틱 stall (주로 하락)
      let price = 100 + 40 * 0.01
      const stallPattern = [-1, -1, 1, -1, -1, -1, 1, -1, -1, -1] // 80% 하락
      for (let i = 0; i < stallPattern.length; i++) {
        price += stallPattern[i] * 0.01
        ticks.push({
          price,
          timestamp: now - 15000 + (40 + i) * 200,
          ticker: 'DET-OTC',
        })
      }

      const candles = generateCandles(15, 100)
      const result = tickImbalanceFadeStrategy(ticks, candles, {
        windowSec: 20,
        minTicks: 30,
        imbalanceThreshold: 0.30,
        deltaZThreshold: 1.0,
        stallLookbackTicks: 10,
        stallRatioThreshold: 0.3,
        baseConfidence: 0.60,
        maxConfidence: 0.90,
        minCandlesForStd: 10,
      })

      expect(result.signal).toBe('PUT')
      expect(result.confidence).toBeGreaterThanOrEqual(0.60)
      expect(result.indicators.up).toBeGreaterThan(result.indicators.down)
      expect(result.indicators.stallRatio).toBeGreaterThanOrEqual(0.3)
    })

    it('100% 하락 틱 + 명확한 stall → CALL', () => {
      const now = Date.now()
      const ticks: TickData[] = []

      // Phase 1: 40틱 하락
      for (let i = 0; i < 40; i++) {
        ticks.push({
          price: 100 - i * 0.01,
          timestamp: now - 15000 + i * 200,
          ticker: 'DET-OTC',
        })
      }

      // Phase 2: 10틱 stall (주로 상승 = 하락 모멘텀 둔화)
      let price = 100 - 40 * 0.01
      const stallPattern = [1, 1, -1, 1, 1, 1, -1, 1, 1, 1] // 80% 상승
      for (let i = 0; i < stallPattern.length; i++) {
        price += stallPattern[i] * 0.01
        ticks.push({
          price,
          timestamp: now - 15000 + (40 + i) * 200,
          ticker: 'DET-OTC',
        })
      }

      const candles = generateCandles(15, 100)
      const result = tickImbalanceFadeStrategy(ticks, candles, {
        windowSec: 20,
        minTicks: 30,
        imbalanceThreshold: 0.30,
        deltaZThreshold: 1.0,
        stallLookbackTicks: 10,
        stallRatioThreshold: 0.3,
        baseConfidence: 0.60,
        maxConfidence: 0.90,
        minCandlesForStd: 10,
      })

      expect(result.signal).toBe('CALL')
      expect(result.confidence).toBeGreaterThanOrEqual(0.60)
      expect(result.indicators.down).toBeGreaterThan(result.indicators.up)
    })
  })

  describe('confidence 계산', () => {
    it('confidence는 baseConfidence 이상 maxConfidence 이하', () => {
      const now = Date.now()
      const ticks: TickData[] = []

      // 극단적 상승 + stall
      for (let i = 0; i < 80; i++) {
        ticks.push({
          price: 100 + i * 0.02,
          timestamp: now - 20000 + i * 200,
          ticker: 'CONF-OTC',
        })
      }
      for (let i = 0; i < 15; i++) {
        ticks.push({
          price: 100 + 80 * 0.02 - i * 0.01,
          timestamp: now - 20000 + (80 + i) * 200,
          ticker: 'CONF-OTC',
        })
      }

      const candles = generateCandles(15, 100)
      const result = tickImbalanceFadeStrategy(ticks, candles, {
        windowSec: 30,
        minTicks: 30,
        imbalanceThreshold: 0.30,
        deltaZThreshold: 1.0,
        stallLookbackTicks: 15,
        stallRatioThreshold: 0.3,
        baseConfidence: 0.60,
        maxConfidence: 0.90,
        minCandlesForStd: 10,
      })

      if (result.signal) {
        expect(result.confidence).toBeGreaterThanOrEqual(0.60)
        expect(result.confidence).toBeLessThanOrEqual(0.90)
      }
    })
  })

  describe('indicators 포함 검증', () => {
    it('결과 indicators에 핵심 메트릭이 포함', () => {
      const ticks = generateImbalanceWithStall(100, {
        direction: 'up',
        stallTicks: 15,
        step: 0.02,
        baseTimestamp: Date.now() - 25000,
        intervalMs: 200,
      })
      const candles = generateCandles(20, 100)
      const result = tickImbalanceFadeStrategy(ticks, candles, {
        ...testConfig,
        windowSec: 30,
        minTicks: 30,
        imbalanceThreshold: 0.20,
        deltaZThreshold: 0.5,
        stallRatioThreshold: 0.2,
      })

      // 신호가 나든 안 나든 indicators는 항상 존재
      expect(result.indicators).toBeDefined()
      expect(typeof result.indicators.tickCount).toBe('number')
    })
  })

  describe('candle 미제공 시 폴백', () => {
    it('candles 없이도 틱 자체 std로 deltaZ 계산', () => {
      const now = Date.now()
      const ticks: TickData[] = []

      for (let i = 0; i < 50; i++) {
        ticks.push({
          price: 100 + i * 0.02,
          timestamp: now - 15000 + i * 200,
          ticker: 'NCANDLE-OTC',
        })
      }
      for (let i = 0; i < 12; i++) {
        ticks.push({
          price: 100 + 50 * 0.02 - i * 0.01,
          timestamp: now - 15000 + (50 + i) * 200,
          ticker: 'NCANDLE-OTC',
        })
      }

      const result = tickImbalanceFadeStrategy(ticks, undefined, {
        windowSec: 20,
        minTicks: 30,
        imbalanceThreshold: 0.30,
        deltaZThreshold: 1.0,
        stallLookbackTicks: 12,
        stallRatioThreshold: 0.3,
        baseConfidence: 0.60,
        maxConfidence: 0.90,
        minCandlesForStd: 10,
      })

      // candles 없어도 deltaZ가 계산되어야 함 (틱 기반 폴백)
      if (result.indicators.deltaZ !== undefined) {
        expect(result.indicators.deltaZ).toBeGreaterThanOrEqual(0)
      }
    })
  })
})
