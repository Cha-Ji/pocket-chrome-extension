import { describe, it, expect } from 'vitest'
import { DEFAULT_SELECTORS, type DOMSelectors, type Direction, type TradeResult } from './index'

describe('Types', () => {
  describe('DEFAULT_SELECTORS', () => {
    it('should have all required selector fields', () => {
      const requiredFields: (keyof DOMSelectors)[] = [
        'priceDisplay',
        'callButton',
        'putButton',
        'balanceDisplay',
        'tickerSelector',
        'chartContainer',
      ]

      requiredFields.forEach(field => {
        expect(DEFAULT_SELECTORS).toHaveProperty(field)
        expect(typeof DEFAULT_SELECTORS[field]).toBe('string')
        expect(DEFAULT_SELECTORS[field].length).toBeGreaterThan(0)
      })
    })
  })

  describe('Type Definitions', () => {
    it('should allow valid Direction values', () => {
      const validDirections: Direction[] = ['CALL', 'PUT']
      validDirections.forEach(dir => {
        expect(['CALL', 'PUT']).toContain(dir)
      })
    })

    it('should allow valid TradeResult values', () => {
      const validResults: TradeResult[] = ['WIN', 'LOSS', 'TIE', 'PENDING']
      validResults.forEach(result => {
        expect(['WIN', 'LOSS', 'TIE', 'PENDING']).toContain(result)
      })
    })
  })
})
