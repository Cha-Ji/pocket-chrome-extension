import { describe, it, expect } from 'vitest'
import { RELAY_MESSAGE_TYPES, THROTTLE_CONFIG, PORT_CHANNEL } from './port-channel'

describe('port-channel', () => {
  it('PORT_CHANNEL should be "side-panel"', () => {
    expect(PORT_CHANNEL).toBe('side-panel')
  })

  describe('RELAY_MESSAGE_TYPES', () => {
    it('should include WS_PRICE_UPDATE (P0-4: prevent MSG_INVALID_TYPE error)', () => {
      expect(RELAY_MESSAGE_TYPES.has('WS_PRICE_UPDATE')).toBe(true)
    })

    it('should include WS_MESSAGE', () => {
      expect(RELAY_MESSAGE_TYPES.has('WS_MESSAGE')).toBe(true)
    })

    it('should include WS_CONNECTION', () => {
      expect(RELAY_MESSAGE_TYPES.has('WS_CONNECTION')).toBe(true)
    })

    it('should include core relay types', () => {
      const coreTypes = [
        'STATUS_UPDATE',
        'NEW_SIGNAL_V2',
        'TRADE_EXECUTED',
        'TRADE_LOGGED',
        'TRADE_SETTLED',
        'INDICATOR_UPDATE',
      ]
      for (const t of coreTypes) {
        expect(RELAY_MESSAGE_TYPES.has(t)).toBe(true)
      }
    })
  })

  describe('THROTTLE_CONFIG', () => {
    it('should throttle WS_PRICE_UPDATE at 500ms (P0-4)', () => {
      expect(THROTTLE_CONFIG['WS_PRICE_UPDATE']).toBe(500)
    })

    it('should throttle INDICATOR_UPDATE at 2000ms', () => {
      expect(THROTTLE_CONFIG['INDICATOR_UPDATE']).toBe(2000)
    })
  })
})
