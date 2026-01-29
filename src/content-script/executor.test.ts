import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TradeExecutor } from './executor'
import { DEFAULT_SELECTORS } from '../lib/types'

// Mock chrome API
const mockChrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
}
// @ts-ignore
globalThis.chrome = mockChrome

describe('TradeExecutor', () => {
  let executor: TradeExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    executor = new TradeExecutor(DEFAULT_SELECTORS)
  })

  describe('initialization', () => {
    it('should initialize with isTrading false', () => {
      expect(executor.isTrading).toBe(false)
    })
  })

  describe('startAutoTrading', () => {
    it('should return success when starting', () => {
      const result = executor.startAutoTrading()
      expect(result.success).toBe(true)
      expect(result.message).toBe('Auto-trading started')
    })

    it('should set isTrading to true', () => {
      executor.startAutoTrading()
      expect(executor.isTrading).toBe(true)
    })

    it('should return failure if already trading', () => {
      executor.startAutoTrading()
      const result = executor.startAutoTrading()
      expect(result.success).toBe(false)
      expect(result.message).toBe('Already trading')
    })
  })

  describe('stopAutoTrading', () => {
    it('should return failure if not trading', () => {
      const result = executor.stopAutoTrading()
      expect(result.success).toBe(false)
      expect(result.message).toBe('Not trading')
    })

    it('should return success when stopping', () => {
      executor.startAutoTrading()
      const result = executor.stopAutoTrading()
      expect(result.success).toBe(true)
      expect(result.message).toBe('Auto-trading stopped')
    })

    it('should set isTrading to false', () => {
      executor.startAutoTrading()
      executor.stopAutoTrading()
      expect(executor.isTrading).toBe(false)
    })
  })

  describe('executeTrade', () => {
    it('should fail when trade buttons not found', async () => {
      const result = await executor.executeTrade('CALL')
      expect(result.success).toBe(false)
      expect(result.error).toContain('Trade buttons not found')
    })
  })

  describe('getCurrentBalance', () => {
    it('should return null when balance element not found', () => {
      expect(executor.getCurrentBalance()).toBeNull()
    })
  })
})
