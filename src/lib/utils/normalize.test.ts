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

  it('strips all separators so EUR/USD === EURUSD', () => {
    expect(normalizeSymbol('EUR/USD')).toBe('EURUSD')
    expect(normalizeSymbol('EUR USD')).toBe('EURUSD')
    expect(normalizeSymbol('eur_usd')).toBe('EURUSD')
    expect(normalizeSymbol('EURUSD')).toBe('EURUSD')
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

  it('handles "Alibaba OTC" style names', () => {
    expect(normalizeSymbol('Alibaba OTC')).toBe('ALIBABA-OTC')
  })

  it('handles hyphens in non-OTC symbols', () => {
    expect(normalizeSymbol('BTC-USDT')).toBe('BTCUSDT')
  })

  it('handles mixed separators with OTC', () => {
    expect(normalizeSymbol('eur/usd_otc')).toBe('EURUSD-OTC')
    expect(normalizeSymbol('EUR-USD OTC')).toBe('EURUSD-OTC')
  })

  it('all variant inputs for the same symbol produce the same key', () => {
    const variants = ['EUR/USD', 'EURUSD', 'eur_usd', 'EUR USD', 'eur-usd', '#eurusd']
    const keys = variants.map(normalizeSymbol)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('EURUSD')
  })

  it('OTC variants all produce the same key', () => {
    const variants = ['#eurusd_otc', 'EURUSD-OTC', 'eur/usd otc', 'EUR_USD_OTC']
    const keys = variants.map(normalizeSymbol)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('EURUSD-OTC')
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
