// ============================================================
// WebSocket Parser Unit Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { WebSocketParser, getWebSocketParser } from './websocket-parser'

describe('WebSocketParser', () => {
  let parser: WebSocketParser

  beforeEach(() => {
    parser = new WebSocketParser()
  })

  describe('Pattern: simple_price', () => {
    it('should parse { symbol, price } format', () => {
      const data = { symbol: 'BTCUSDT', price: 50000.5 }
      const result = parser.parse(data)

      expect(result.type).toBe('price_update')
      expect(result.confidence).toBeGreaterThan(0.8)
      expect(result.data).toMatchObject({
        symbol: 'BTCUSDT',
        price: 50000.5,
        source: 'websocket',
      })
    })

    it('should parse { asset, value } format', () => {
      const data = { asset: 'EUR/USD', value: 1.0854 }
      const result = parser.parse(data)

      expect(result.type).toBe('price_update')
      expect(result.data).toMatchObject({
        symbol: 'EUR/USD',
        price: 1.0854,
      })
    })

    it('should parse { pair, rate } format', () => {
      const data = { pair: 'BTC/USD', rate: 49999, timestamp: 1706745600000 }
      const result = parser.parse(data)

      expect(result.type).toBe('price_update')
      expect(result.data).toMatchObject({
        symbol: 'BTC/USD',
        price: 49999,
        timestamp: 1706745600000,
      })
    })
  })

  describe('Pattern: bid_ask', () => {
    it('should parse orderbook data', () => {
      const data = { symbol: 'ETHUSDT', bid: 3000.1, ask: 3000.5 }
      const result = parser.parse(data)

      expect(result.type).toBe('orderbook')
      expect(result.confidence).toBeGreaterThan(0.8)
      expect(result.data).toMatchObject({
        symbol: 'ETHUSDT',
        bid: 3000.1,
        ask: 3000.5,
      })
    })
  })

  describe('Pattern: ohlc_candle', () => {
    it('should parse OHLC candle data', () => {
      // OHLC without symbol/price to avoid simple_price pattern matching first
      const data = {
        open: 50000,
        high: 50500,
        low: 49500,
        close: 50200,
        volume: 1000,
        time: 1706745600000,
      }
      const result = parser.parse(data)

      expect(result.type).toBe('candle_data')
      expect(result.confidence).toBeGreaterThan(0.9)
      expect(result.data).toMatchObject({
        open: 50000,
        high: 50500,
        low: 49500,
        close: 50200,
        volume: 1000,
      })
    })
  })

  describe('Pattern: array_price', () => {
    it('should parse [timestamp, price] format', () => {
      const data = [1706745600000, 50000.5]
      const result = parser.parse(data)

      expect(result.type).toBe('price_update')
      expect(result.data).toMatchObject({
        symbol: 'CURRENT',
        price: 50000.5,
        timestamp: 1706745600000,
      })
    })

    it('should parse [price] format', () => {
      const data = [50000.5]
      const result = parser.parse(data)

      expect(result.type).toBe('price_update')
      expect(result.data?.price).toBe(50000.5)
    })
  })

  describe('Pattern: nested_data', () => {
    it('should parse nested data structure', () => {
      const data = {
        data: {
          symbol: 'BTCUSDT',
          price: 50000.5,
        },
      }
      const result = parser.parse(data)

      expect(result.type).toBe('price_update')
      expect(result.data).toMatchObject({
        symbol: 'BTCUSDT',
        price: 50000.5,
      })
    })
  })

  describe('Pattern: pocket_option_action', () => {
    it('should parse action-based message with price', () => {
      const data = {
        action: 'tick_update',
        data: {
          symbol: 'EUR/USD',
          price: 1.0855,
        },
      }
      const result = parser.parse(data)

      expect(result.type).toBe('price_update')
      expect(result.data).toMatchObject({
        symbol: 'EUR/USD',
        price: 1.0855,
      })
    })

    it('should detect heartbeat messages', () => {
      const data = { action: 'ping' }
      const result = parser.parse(data)

      expect(result.type).toBe('heartbeat')
      expect(result.confidence).toBe(1.0)
    })
  })

  describe('extractPrice', () => {
    it('should extract price from price_update', () => {
      const data = { symbol: 'BTCUSDT', price: 50000.5 }
      const priceUpdate = parser.extractPrice(data)

      expect(priceUpdate).not.toBeNull()
      expect(priceUpdate?.price).toBe(50000.5)
      expect(priceUpdate?.symbol).toBe('BTCUSDT')
      expect(priceUpdate?.source).toBe('websocket')
    })

    it('should extract mid price from orderbook', () => {
      const data = { symbol: 'ETHUSDT', bid: 3000, ask: 3002 }
      const priceUpdate = parser.extractPrice(data)

      expect(priceUpdate).not.toBeNull()
      expect(priceUpdate?.price).toBe(3001) // mid price
      expect(priceUpdate?.symbol).toBe('ETHUSDT')
    })

    it('should extract close price from candle', () => {
      const data = { open: 100, high: 110, low: 90, close: 105, symbol: 'TEST' }
      const priceUpdate = parser.extractPrice(data)

      expect(priceUpdate).not.toBeNull()
      expect(priceUpdate?.price).toBe(105)
    })

    it('should return null for unknown message', () => {
      const data = { foo: 'bar' }
      const priceUpdate = parser.extractPrice(data)

      expect(priceUpdate).toBeNull()
    })
  })

  describe('JSON string parsing', () => {
    it('should parse JSON string', () => {
      const jsonStr = JSON.stringify({ symbol: 'BTCUSDT', price: 50000 })
      const result = parser.parse(jsonStr)

      expect(result.type).toBe('price_update')
      expect(result.data?.price).toBe(50000)
    })

    it('should handle invalid JSON gracefully', () => {
      const result = parser.parse('not valid json')

      expect(result.type).toBe('unknown')
      expect(result.confidence).toBe(0)
    })
  })

  describe('Utility methods', () => {
    it('should return pattern list', () => {
      const patterns = parser.getPatterns()

      expect(patterns).toContain('simple_price')
      expect(patterns).toContain('bid_ask')
      expect(patterns).toContain('ohlc_candle')
      expect(patterns.length).toBeGreaterThan(0)
    })

    it('should track unknown message types', () => {
      parser.parse({ unknownField: 'test' })
      const unknowns = parser.getUnknownMessageTypes()

      expect(unknowns.length).toBeGreaterThan(0)
    })

    it('should clear unknown message types', () => {
      parser.parse({ unknownField: 'test' })
      parser.clearUnknownMessageTypes()
      const unknowns = parser.getUnknownMessageTypes()

      expect(unknowns.length).toBe(0)
    })
  })
})

describe('Singleton getWebSocketParser', () => {
  it('should return same instance', () => {
    const parser1 = getWebSocketParser()
    const parser2 = getWebSocketParser()

    expect(parser1).toBe(parser2)
  })
})
