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

  describe('Socket.IO prefix stripping', () => {
    it('should strip "42" prefix and parse Socket.IO event array', () => {
      const msg = '42["updateStream",[["#EURUSD_otc",1707123456,1.23456]]]'
      const result = parser.parse(msg)

      expect(result.type).toBe('price_update')
      expect(result.confidence).toBeGreaterThan(0.9)
    })

    it('should strip "451-" prefix and parse Socket.IO binary placeholder (no actual data)', () => {
      const msg = '451-["updateHistoryNewFast",{"_placeholder":true,"num":0}]'
      const result = parser.parse(msg)

      // placeholder 프레임은 실제 히스토리 데이터가 아님 — 다음 바이너리 프레임에 데이터가 있음
      // JSON.parse는 성공하지만 _placeholder에는 캔들 데이터가 없으므로 unknown이 정상
      expect(result.type).toBe('unknown')
    })

    it('should parse history event with candle data from "42" prefix', () => {
      const candles = [
        { open: 1.085, high: 1.086, low: 1.084, close: 1.0855, time: 1707100000 },
        { open: 1.0855, high: 1.087, low: 1.085, close: 1.086, time: 1707100060 },
      ]
      const msg = `42["updateHistoryNewFast",{"asset":"#EURUSD_otc","data":${JSON.stringify(candles)}}]`
      const result = parser.parse(msg)

      expect(result.type).toBe('candle_history')
      expect(result.confidence).toBeGreaterThan(0.9)
      const parsed = result.data as any[]
      expect(parsed.length).toBe(2)
    })

    it('should parse history event with array-format candles', () => {
      // [timestamp, open, close, high, low, volume]
      const candles = [
        [1707100000, 1.085, 1.0855, 1.086, 1.084, 100],
        [1707100060, 1.0855, 1.086, 1.087, 1.085, 150],
      ]
      const msg = `42["updateHistoryNewFast",${JSON.stringify(candles)}]`
      const result = parser.parse(msg)

      expect(result.type).toBe('candle_history')
      const parsed = result.data as any[]
      expect(parsed.length).toBe(2)
      expect(parsed[0].timestamp).toBe(1707100000)
    })

    it('should handle plain number prefix without hyphen', () => {
      const msg = '2'  // Socket.IO probe
      const result = parser.parse(msg)
      expect(result.type).toBe('unknown')
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
