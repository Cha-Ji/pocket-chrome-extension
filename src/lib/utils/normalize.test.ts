import { describe, it, expect } from 'vitest'
import { normalizeSymbol, normalizeTimestampMs } from './normalize'

describe('normalizeSymbol', () => {
  it('removes leading # and uppercases', () => {
    expect(normalizeSymbol('#eurusd')).toBe('EURUSD')
  })

  it('converts _otc suffix to -OTC', () => {
    expect(normalizeSymbol('#eurusd_otc')).toBe('EURUSD-OTC')
    expect(normalizeSymbol('eurusd_OTC')).toBe('EURUSD-OTC')
  })

  it('replaces spaces and underscores with hyphens', () => {
    expect(normalizeSymbol('EUR USD')).toBe('EUR-USD')
    expect(normalizeSymbol('eur_usd')).toBe('EUR-USD')
  })

  it('trims whitespace', () => {
    expect(normalizeSymbol('  btcusdt  ')).toBe('BTCUSDT')
  })

  it('handles already normalized input', () => {
    expect(normalizeSymbol('EURUSD-OTC')).toBe('EURUSD-OTC')
  })

  it('handles otc suffix without underscore', () => {
    expect(normalizeSymbol('#eurusdotc')).toBe('EURUSD-OTC')
  })
})

describe('normalizeTimestampMs', () => {
  it('converts seconds to milliseconds', () => {
    const sec = 1700000000 // < 1e12
    expect(normalizeTimestampMs(sec)).toBe(sec * 1000)
  })

  it('keeps milliseconds as-is', () => {
    const ms = 1700000000000 // >= 1e12
    expect(normalizeTimestampMs(ms)).toBe(ms)
  })

  it('handles edge case at boundary', () => {
    // 1e12 - 1 = 999999999999 → seconds
    expect(normalizeTimestampMs(999999999999)).toBe(999999999999000)
    // 1e12 exactly → ms
    expect(normalizeTimestampMs(1e12)).toBe(1e12)
  })
})
