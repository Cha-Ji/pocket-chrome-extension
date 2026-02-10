import { describe, it, expect } from 'vitest'
import {
  validateTradeAmount,
  assertValidTradeAmount,
  DEFAULT_AMOUNT_VALIDATION,
} from './validate-amount'

describe('validateTradeAmount', () => {
  // ============================================================
  // 기본 유효성 체크
  // ============================================================
  describe('undefined/null 체크', () => {
    it('undefined를 거부한다', () => {
      const result = validateTradeAmount(undefined)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('undefined')
    })

    it('null을 거부한다', () => {
      const result = validateTradeAmount(null)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('null')
    })
  })

  describe('타입 체크', () => {
    it('문자열을 거부한다', () => {
      const result = validateTradeAmount('100' as unknown)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('숫자가 아닙니다')
    })

    it('boolean을 거부한다', () => {
      const result = validateTradeAmount(true as unknown)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('숫자가 아닙니다')
    })

    it('객체를 거부한다', () => {
      const result = validateTradeAmount({} as unknown)
      expect(result.valid).toBe(false)
    })
  })

  describe('NaN 체크', () => {
    it('NaN을 거부한다', () => {
      const result = validateTradeAmount(NaN)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('NaN')
    })

    it('parseInt 실패 결과(NaN)를 거부한다', () => {
      const result = validateTradeAmount(parseInt('abc'))
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('NaN')
    })
  })

  describe('Infinity 체크', () => {
    it('Infinity를 거부한다', () => {
      const result = validateTradeAmount(Infinity)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('유한하지 않습니다')
    })

    it('-Infinity를 거부한다', () => {
      const result = validateTradeAmount(-Infinity)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('유한하지 않습니다')
    })
  })

  // ============================================================
  // 범위 체크
  // ============================================================
  describe('범위 체크', () => {
    it('0을 거부한다', () => {
      const result = validateTradeAmount(0)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('0보다 커야')
    })

    it('음수를 거부한다', () => {
      const result = validateTradeAmount(-10)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('0보다 커야')
    })

    it('최소 금액 미만을 거부한다 (기본값 1)', () => {
      const result = validateTradeAmount(0.5)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('최소 금액')
    })

    it('최대 금액 초과를 거부한다 (기본값 10000)', () => {
      const result = validateTradeAmount(10001)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('최대 금액')
    })

    it('커스텀 최소 금액을 적용한다', () => {
      const result = validateTradeAmount(3, { minAmount: 5 })
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('5')
    })

    it('커스텀 최대 금액을 적용한다', () => {
      const result = validateTradeAmount(600, { maxAmount: 500 })
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('500')
    })
  })

  // ============================================================
  // 정상 케이스
  // ============================================================
  describe('정상 금액 통과', () => {
    it('최소 금액(1)을 통과한다', () => {
      const result = validateTradeAmount(1)
      expect(result.valid).toBe(true)
      expect(result.normalizedAmount).toBe(1)
    })

    it('최대 금액(10000)을 통과한다', () => {
      const result = validateTradeAmount(10000)
      expect(result.valid).toBe(true)
      expect(result.normalizedAmount).toBe(10000)
    })

    it('일반 금액(50)을 통과한다', () => {
      const result = validateTradeAmount(50)
      expect(result.valid).toBe(true)
      expect(result.normalizedAmount).toBe(50)
    })

    it('소수점 금액(10.55)을 통과한다', () => {
      const result = validateTradeAmount(10.55)
      expect(result.valid).toBe(true)
      expect(result.normalizedAmount).toBe(10.55)
    })
  })

  // ============================================================
  // 소수점 정규화
  // ============================================================
  describe('소수점 정규화', () => {
    it('3자리 소수점을 2자리로 반올림한다', () => {
      const result = validateTradeAmount(10.555)
      expect(result.valid).toBe(true)
      expect(result.normalizedAmount).toBe(10.56)
    })

    it('부동소수점 오차를 정규화한다 (예: 10.1 + 10.2)', () => {
      const result = validateTradeAmount(10.1 + 10.2)
      expect(result.valid).toBe(true)
      expect(result.normalizedAmount).toBe(20.3)
    })

    it('커스텀 소수점 자릿수를 적용한다', () => {
      const result = validateTradeAmount(10.5, { maxDecimalPlaces: 0 })
      expect(result.valid).toBe(true)
      expect(result.normalizedAmount).toBe(11)
    })
  })

  // ============================================================
  // 설정 커스터마이즈
  // ============================================================
  describe('커스텀 설정', () => {
    it('기본 설정값이 올바르다', () => {
      expect(DEFAULT_AMOUNT_VALIDATION.minAmount).toBe(1)
      expect(DEFAULT_AMOUNT_VALIDATION.maxAmount).toBe(10000)
      expect(DEFAULT_AMOUNT_VALIDATION.maxDecimalPlaces).toBe(2)
    })

    it('부분 설정 오버라이드가 작동한다', () => {
      const result = validateTradeAmount(50, { maxAmount: 100 })
      expect(result.valid).toBe(true)
    })
  })
})

describe('assertValidTradeAmount', () => {
  const ctx = { module: 'lib', function: 'test' }

  it('유효한 금액에 대해 정규화된 값을 반환한다', () => {
    const result = assertValidTradeAmount(50, ctx)
    expect(result).toBe(50)
  })

  it('소수점 정규화된 값을 반환한다', () => {
    const result = assertValidTradeAmount(10.999, ctx)
    expect(result).toBe(11)
  })

  it('NaN에 대해 POError를 throw한다', () => {
    expect(() => assertValidTradeAmount(NaN, ctx)).toThrow()
  })

  it('음수에 대해 POError를 throw한다', () => {
    expect(() => assertValidTradeAmount(-5, ctx)).toThrow()
  })

  it('상한 초과에 대해 POError를 throw한다', () => {
    expect(() => assertValidTradeAmount(99999, ctx)).toThrow()
  })

  it('undefined에 대해 POError를 throw한다', () => {
    expect(() => assertValidTradeAmount(undefined, ctx)).toThrow()
  })

  it('null에 대해 POError를 throw한다', () => {
    expect(() => assertValidTradeAmount(null, ctx)).toThrow()
  })

  it('문자열에 대해 POError를 throw한다', () => {
    expect(() => assertValidTradeAmount('100', ctx)).toThrow()
  })

  it('커스텀 설정으로 검증한다', () => {
    const result = assertValidTradeAmount(50, ctx, { maxAmount: 100 })
    expect(result).toBe(50)

    expect(() => assertValidTradeAmount(150, ctx, { maxAmount: 100 })).toThrow()
  })
})
