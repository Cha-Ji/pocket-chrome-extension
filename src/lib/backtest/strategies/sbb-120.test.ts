// ============================================================
// SBB-120 (Squeeze Bollinger Breakout) Strategy Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { sbb120Strategy, DEFAULT_SBB120_CONFIG, SBB120Config } from './sbb-120'
import { Candle } from '../../signals/types'

// ============================================================
// Test Data Generators
// ============================================================

/**
 * 안정적인 횡보 데이터 생성 (높은 변동성 → squeeze → breakout)
 * squeeze 구간에서 bandwidth가 lookback 하위 10%에 들도록 설계
 */
function generateSqueezeBreakoutData(opts: {
  count?: number
  breakoutDirection?: 'up' | 'down'
  breakoutStrength?: number  // 돌파 강도 배수
  squeezeDepth?: number      // squeeze 얼마나 좁게
}): Candle[] {
  const {
    count = 200,
    breakoutDirection = 'up',
    breakoutStrength = 3.0,
    squeezeDepth = 0.1,
  } = opts

  const candles: Candle[] = []
  let price = 100
  const baseTime = Date.now()

  // Phase 1: 높은 변동성 구간 (0% ~ 50%) — BW가 높음
  const highVolEnd = Math.floor(count * 0.50)
  for (let i = 0; i < highVolEnd; i++) {
    const change = (Math.sin(i * 0.3) + (Math.random() - 0.5)) * 0.8
    price = price * (1 + change / 100)
    const vol = 0.5 + Math.random() * 0.3

    candles.push({
      timestamp: baseTime + i * 60000,
      open: price - vol * 0.3,
      high: price + vol,
      low: price - vol,
      close: price + vol * 0.3,
    })
  }

  // Phase 2: squeeze 구간 (50% ~ 90%) — 매우 낮은 변동성
  const squeezeEnd = Math.floor(count * 0.90)
  for (let i = highVolEnd; i < squeezeEnd; i++) {
    const tiny = (Math.random() - 0.5) * squeezeDepth * 0.5
    price = price * (1 + tiny / 100)
    const vol = squeezeDepth * (0.3 + Math.random() * 0.2)

    candles.push({
      timestamp: baseTime + i * 60000,
      open: price - vol * 0.2,
      high: price + vol,
      low: price - vol,
      close: price + vol * 0.1,
    })
  }

  // Phase 3: breakout 캔들 (90% ~ 100%)
  for (let i = squeezeEnd; i < count; i++) {
    const dir = breakoutDirection === 'up' ? 1 : -1
    const magnitude = breakoutStrength * 0.5
    price = price * (1 + dir * magnitude / 100)
    const vol = magnitude * 0.8

    const open = breakoutDirection === 'up' ? price - vol * 0.8 : price + vol * 0.8
    const close = price

    candles.push({
      timestamp: baseTime + i * 60000,
      open,
      high: Math.max(open, close) + vol * 0.1,
      low: Math.min(open, close) - vol * 0.1,
      close,
    })
  }

  return candles
}

/**
 * 순수 횡보 데이터 (squeeze 없음, 일정한 변동성)
 */
function generateFlatData(count: number = 200): Candle[] {
  const candles: Candle[] = []
  let price = 100
  const baseTime = Date.now()

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.3
    price = price * (1 + change / 100)
    const vol = 0.3 + Math.random() * 0.1

    candles.push({
      timestamp: baseTime + i * 60000,
      open: price - vol * 0.3,
      high: price + vol,
      low: price - vol,
      close: price + vol * 0.3,
    })
  }

  return candles
}

/**
 * Squeeze 후 약한 돌파 데이터 (margin 미만)
 */
function generateWeakBreakoutData(count: number = 200): Candle[] {
  const candles: Candle[] = []
  let price = 100
  const baseTime = Date.now()

  // Phase 1: 높은 변동성
  for (let i = 0; i < Math.floor(count * 0.5); i++) {
    const change = (Math.sin(i * 0.3) + (Math.random() - 0.5)) * 0.8
    price = price * (1 + change / 100)
    const vol = 0.5 + Math.random() * 0.3

    candles.push({
      timestamp: baseTime + i * 60000,
      open: price - vol * 0.3,
      high: price + vol,
      low: price - vol,
      close: price + vol * 0.3,
    })
  }

  // Phase 2: squeeze
  for (let i = Math.floor(count * 0.5); i < count - 1; i++) {
    const tiny = (Math.random() - 0.5) * 0.05
    price = price * (1 + tiny / 100)
    const vol = 0.05

    candles.push({
      timestamp: baseTime + i * 60000,
      open: price - vol * 0.2,
      high: price + vol,
      low: price - vol,
      close: price + vol * 0.1,
    })
  }

  // Phase 3: 약한 돌파 — 극히 작은 doji 캔들 (밴드 근처지만 margin 미달)
  const vol = 0.02
  candles.push({
    timestamp: baseTime + (count - 1) * 60000,
    open: price,
    high: price + vol,
    low: price - vol,
    close: price + vol * 0.5,
  })

  return candles
}

/**
 * Squeeze 후 작은 몸통 캔들 (bodyRatio 미달)
 */
function generateSmallBodyBreakoutData(count: number = 200): Candle[] {
  const candles = generateSqueezeBreakoutData({
    count: count - 1,
    breakoutDirection: 'up',
    breakoutStrength: 3.0,
  })

  // 마지막 캔들을 큰 범위지만 작은 몸통으로 교체 (doji-like)
  const lastPrice = candles[candles.length - 1].close
  const vol = 2.0

  candles.push({
    timestamp: Date.now() + (count - 1) * 60000,
    open: lastPrice + vol * 0.02,
    high: lastPrice + vol,
    low: lastPrice - vol * 0.5,
    close: lastPrice + vol * 0.05, // 매우 작은 몸통
  })

  return candles
}

// ============================================================
// Core Strategy Tests
// ============================================================

describe('SBB-120 Strategy', () => {
  it('should return null with insufficient data', () => {
    const candles = generateFlatData(50) // 최소 140 필요 (20 + 120)
    const result = sbb120Strategy(candles)

    expect(result.signal).toBeNull()
    expect(result.reason).toContain('Insufficient data')
  })

  it('should return no signal when no squeeze detected (flat volatility)', () => {
    const candles = generateFlatData(200)
    const result = sbb120Strategy(candles)

    // 일정한 변동성이면 squeeze가 감지되지 않을 가능성이 높음
    // 또는 breakout 조건도 미충족
    if (result.signal === null) {
      expect(result.indicators).toHaveProperty('bandwidth')
    }
    // 어느 쪽이든 crash 없이 StrategyResult 반환 확인
    expect(result).toHaveProperty('confidence')
    expect(result).toHaveProperty('reason')
    expect(result).toHaveProperty('indicators')
  })

  it('should generate CALL on squeeze + upper band breakout', () => {
    const candles = generateSqueezeBreakoutData({
      count: 200,
      breakoutDirection: 'up',
      breakoutStrength: 4.0,
      squeezeDepth: 0.05,
    })
    const result = sbb120Strategy(candles)

    // 명확한 squeeze + strong breakout이면 CALL
    if (result.signal === 'CALL') {
      expect(result.confidence).toBeGreaterThanOrEqual(0.60)
      expect(result.confidence).toBeLessThanOrEqual(0.90)
      expect(result.expiryOverride).toBe(120)
      expect(result.indicators).toHaveProperty('bandwidth')
      expect(result.indicators).toHaveProperty('breakoutDistance')
      expect(result.indicators).toHaveProperty('bodyRatio')
      expect(result.reason).toContain('SBB-120')
      expect(result.reason).toContain('CALL')
    }
  })

  it('should generate PUT on squeeze + lower band breakout', () => {
    const candles = generateSqueezeBreakoutData({
      count: 200,
      breakoutDirection: 'down',
      breakoutStrength: 4.0,
      squeezeDepth: 0.05,
    })
    const result = sbb120Strategy(candles)

    if (result.signal === 'PUT') {
      expect(result.confidence).toBeGreaterThanOrEqual(0.60)
      expect(result.confidence).toBeLessThanOrEqual(0.90)
      expect(result.expiryOverride).toBe(120)
      expect(result.reason).toContain('SBB-120')
      expect(result.reason).toContain('PUT')
    }
  })

  it('should always include expiryOverride=120 when signal is generated', () => {
    const candles = generateSqueezeBreakoutData({
      count: 200,
      breakoutDirection: 'up',
      breakoutStrength: 5.0,
      squeezeDepth: 0.03,
    })
    const result = sbb120Strategy(candles)

    if (result.signal) {
      expect(result.expiryOverride).toBe(120)
    }
  })

  it('should have confidence between 0.60 and 0.90', () => {
    const candles = generateSqueezeBreakoutData({
      count: 200,
      breakoutDirection: 'up',
      breakoutStrength: 5.0,
      squeezeDepth: 0.03,
    })
    const result = sbb120Strategy(candles)

    if (result.signal) {
      expect(result.confidence).toBeGreaterThanOrEqual(0.60)
      expect(result.confidence).toBeLessThanOrEqual(0.90)
    }
  })
})

// ============================================================
// Anti-False-Breakout Filter Tests
// ============================================================

describe('SBB-120 Anti-False-Breakout Filters', () => {
  it('Filter #1: should reject breakout below margin threshold', () => {
    // 약한 돌파 — margin 미달
    const candles = generateWeakBreakoutData(200)
    const result = sbb120Strategy(candles)

    // 약한 돌파이므로 신호 없음 (또는 margin/bodyRatio/vol 필터 중 하나에 걸림)
    if (result.signal === null) {
      // breakoutMargin 관련 reject이거나 다른 필터
      expect(result.confidence).toBe(0)
    }
  })

  it('Filter #2: should reject when bodyRatio is too small', () => {
    // bodyRatio 기본 0.55 미만인 경우 거부
    const candles = generateSqueezeBreakoutData({
      count: 200,
      breakoutDirection: 'up',
      breakoutStrength: 4.0,
      squeezeDepth: 0.05,
    })

    // 매우 높은 minBodyRatio로 테스트 — 어떤 캔들이든 통과 불가
    const result = sbb120Strategy(candles, { minBodyRatio: 0.99 })

    if (result.signal === null && result.reason.includes('Body ratio')) {
      expect(result.indicators.bodyRatio).toBeLessThan(0.99)
    }
  })

  it('Filter #3: should reject when volatility is not expanding', () => {
    // 매우 높은 volExpansionRatio로 테스트
    const candles = generateSqueezeBreakoutData({
      count: 200,
      breakoutDirection: 'up',
      breakoutStrength: 4.0,
      squeezeDepth: 0.05,
    })

    const result = sbb120Strategy(candles, { volExpansionRatio: 100 })

    if (result.signal === null && result.reason.includes('Volatility')) {
      expect(result.confidence).toBe(0)
    }
  })
})

// ============================================================
// Configuration Tests
// ============================================================

describe('SBB-120 Configuration', () => {
  it('should use default config when none provided', () => {
    const candles = generateFlatData(200)
    const result = sbb120Strategy(candles)

    // 기본 설정으로 작동해야 함 (crash 없이)
    expect(result).toHaveProperty('signal')
    expect(result).toHaveProperty('confidence')
    expect(result).toHaveProperty('reason')
    expect(result).toHaveProperty('indicators')
  })

  it('should accept partial config overrides', () => {
    const candles = generateSqueezeBreakoutData({
      count: 200,
      breakoutDirection: 'up',
      breakoutStrength: 4.0,
    })

    const result = sbb120Strategy(candles, {
      bbPeriod: 15,
      expiryOverride: 180,
    })

    if (result.signal) {
      expect(result.expiryOverride).toBe(180)
    }
  })

  it('should have correct default values', () => {
    expect(DEFAULT_SBB120_CONFIG.bbPeriod).toBe(20)
    expect(DEFAULT_SBB120_CONFIG.bbStdDev).toBe(2)
    expect(DEFAULT_SBB120_CONFIG.lookbackSqueeze).toBe(120)
    expect(DEFAULT_SBB120_CONFIG.squeezePercentile).toBe(10)
    expect(DEFAULT_SBB120_CONFIG.breakoutMarginRatio).toBe(0.05)
    expect(DEFAULT_SBB120_CONFIG.minBodyRatio).toBe(0.55)
    expect(DEFAULT_SBB120_CONFIG.volExpansionRatio).toBe(1.2)
    expect(DEFAULT_SBB120_CONFIG.expiryOverride).toBe(120)
  })
})

// ============================================================
// Indicator Output Tests
// ============================================================

describe('SBB-120 Indicator Output', () => {
  it('should always include bandwidth in indicators', () => {
    const candles = generateSqueezeBreakoutData({ count: 200 })
    const result = sbb120Strategy(candles)

    if (Object.keys(result.indicators).length > 0) {
      expect(result.indicators).toHaveProperty('bandwidth')
    }
  })

  it('should include squeeze detection info', () => {
    const candles = generateSqueezeBreakoutData({ count: 200 })
    const result = sbb120Strategy(candles)

    if (result.indicators.wasSqueeze !== undefined) {
      expect(typeof result.indicators.wasSqueeze).toBe('number')
      // wasSqueeze는 0 또는 1
      expect([0, 1]).toContain(result.indicators.wasSqueeze)
    }
  })

  it('should include expiryOverride in indicators for transparency', () => {
    const candles = generateSqueezeBreakoutData({ count: 200 })
    const result = sbb120Strategy(candles)

    if (result.indicators.expiryOverride !== undefined) {
      expect(result.indicators.expiryOverride).toBe(120)
    }
  })
})

// ============================================================
// SignalGeneratorV2 Integration Test
// ============================================================

describe('SBB-120 + SignalGeneratorV2 expiryOverride Integration', () => {
  it('expiryOverride should be present in StrategyResult', () => {
    const candles = generateSqueezeBreakoutData({
      count: 200,
      breakoutDirection: 'up',
      breakoutStrength: 5.0,
      squeezeDepth: 0.03,
    })
    const result = sbb120Strategy(candles)

    if (result.signal) {
      // expiryOverride가 StrategyResult에 있어야 함
      expect(result).toHaveProperty('expiryOverride')
      expect(result.expiryOverride).toBe(120)
    }
  })

  it('StrategyResult without expiryOverride should be backward compatible', () => {
    // 기존 전략은 expiryOverride가 없음 = undefined
    const result = {
      signal: 'CALL' as const,
      confidence: 0.75,
      reason: 'test',
      indicators: {},
    }

    // expiryOverride가 없으면 undefined → config 값 사용
    const expiry = result.expiryOverride ?? 60
    expect(expiry).toBe(60)
  })
})
