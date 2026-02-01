import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataCollector } from './data-collector'
import { DEFAULT_SELECTORS } from '../lib/types'

// Mock chrome API
const mockChrome = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
}
// @ts-ignore
globalThis.chrome = mockChrome

describe('DataCollector', () => {
  let collector: DataCollector

  beforeEach(() => {
    vi.clearAllMocks()
    collector = new DataCollector(DEFAULT_SELECTORS)
  })

  describe('initialization', () => {
    it('should initialize with isCollecting false', () => {
      expect(collector.isCollecting).toBe(false)
    })

    it('should initialize with null current price', () => {
      expect(collector.getCurrentPrice()).toBeNull()
    })

    it('should initialize with empty price history', () => {
      expect(collector.getPriceHistory()).toHaveLength(0)
    })
  })

  describe('start/stop', () => {
    it('should set isCollecting to true when started', () => {
      collector.start()
      expect(collector.isCollecting).toBe(true)
    })

    it('should set isCollecting to false when stopped', () => {
      collector.start()
      collector.stop()
      expect(collector.isCollecting).toBe(false)
    })

    it('should not start twice', () => {
      collector.start()
      collector.start() // Should not throw or duplicate
      expect(collector.isCollecting).toBe(true)
    })

    it('should not stop if not started', () => {
      collector.stop() // Should not throw
      expect(collector.isCollecting).toBe(false)
    })
  })

  describe('getRecentPrices', () => {
    it('should return empty array when no prices', () => {
      expect(collector.getRecentPrices(10)).toHaveLength(0)
    })
  })
})
