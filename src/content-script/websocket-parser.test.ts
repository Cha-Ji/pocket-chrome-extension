// ============================================================
// WebSocket Parser Unit Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WebSocketParser,
  getWebSocketParser,
  registerPocketOptionPattern,
} from './websocket-parser';

describe('WebSocketParser', () => {
  let parser: WebSocketParser;

  beforeEach(() => {
    parser = new WebSocketParser();
  });

  describe('Pattern: simple_price', () => {
    it('should parse { symbol, price } format', () => {
      const data = { symbol: 'BTCUSDT', price: 50000.5 };
      const result = parser.parse(data);

      expect(result.type).toBe('price_update');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.data).toMatchObject({
        symbol: 'BTCUSDT',
        price: 50000.5,
        source: 'websocket',
      });
    });

    it('should parse { asset, value } format', () => {
      const data = { asset: 'EUR/USD', value: 1.0854 };
      const result = parser.parse(data);

      expect(result.type).toBe('price_update');
      expect(result.data).toMatchObject({
        symbol: 'EUR/USD',
        price: 1.0854,
      });
    });

    it('should parse { pair, rate } format', () => {
      const data = { pair: 'BTC/USD', rate: 49999, timestamp: 1706745600000 };
      const result = parser.parse(data);

      expect(result.type).toBe('price_update');
      expect(result.data).toMatchObject({
        symbol: 'BTC/USD',
        price: 49999,
        timestamp: 1706745600000,
      });
    });
  });

  describe('Pattern: bid_ask', () => {
    it('should parse orderbook data', () => {
      const data = { symbol: 'ETHUSDT', bid: 3000.1, ask: 3000.5 };
      const result = parser.parse(data);

      expect(result.type).toBe('orderbook');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.data).toMatchObject({
        symbol: 'ETHUSDT',
        bid: 3000.1,
        ask: 3000.5,
      });
    });
  });

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
      };
      const result = parser.parse(data);

      expect(result.type).toBe('candle_data');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.data).toMatchObject({
        open: 50000,
        high: 50500,
        low: 49500,
        close: 50200,
        volume: 1000,
      });
    });
  });

  describe('Pattern: array_price', () => {
    it('should parse [timestamp, price] format', () => {
      const data = [1706745600000, 50000.5];
      const result = parser.parse(data);

      expect(result.type).toBe('price_update');
      expect(result.data).toMatchObject({
        symbol: 'CURRENT',
        price: 50000.5,
        timestamp: 1706745600000,
      });
    });

    it('should parse [price] format', () => {
      const data = [50000.5];
      const result = parser.parse(data);

      expect(result.type).toBe('price_update');
      expect(result.data?.price).toBe(50000.5);
    });
  });

  describe('Pattern: nested_data', () => {
    it('should parse nested data structure', () => {
      const data = {
        data: {
          symbol: 'BTCUSDT',
          price: 50000.5,
        },
      };
      const result = parser.parse(data);

      expect(result.type).toBe('price_update');
      expect(result.data).toMatchObject({
        symbol: 'BTCUSDT',
        price: 50000.5,
      });
    });
  });

  describe('Pattern: pocket_option_action', () => {
    it('should parse action-based message with price', () => {
      const data = {
        action: 'tick_update',
        data: {
          symbol: 'EUR/USD',
          price: 1.0855,
        },
      };
      const result = parser.parse(data);

      expect(result.type).toBe('price_update');
      expect(result.data).toMatchObject({
        symbol: 'EUR/USD',
        price: 1.0855,
      });
    });

    it('should detect heartbeat messages', () => {
      const data = { action: 'ping' };
      const result = parser.parse(data);

      expect(result.type).toBe('heartbeat');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('extractPrice', () => {
    it('should extract price from price_update', () => {
      const data = { symbol: 'BTCUSDT', price: 50000.5 };
      const priceUpdate = parser.extractPrice(data);

      expect(priceUpdate).not.toBeNull();
      expect(priceUpdate?.price).toBe(50000.5);
      expect(priceUpdate?.symbol).toBe('BTCUSDT');
      expect(priceUpdate?.source).toBe('websocket');
    });

    it('should extract mid price from orderbook', () => {
      const data = { symbol: 'ETHUSDT', bid: 3000, ask: 3002 };
      const priceUpdate = parser.extractPrice(data);

      expect(priceUpdate).not.toBeNull();
      expect(priceUpdate?.price).toBe(3001); // mid price
      expect(priceUpdate?.symbol).toBe('ETHUSDT');
    });

    it('should extract close price from candle', () => {
      const data = { open: 100, high: 110, low: 90, close: 105, symbol: 'TEST' };
      const priceUpdate = parser.extractPrice(data);

      expect(priceUpdate).not.toBeNull();
      expect(priceUpdate?.price).toBe(105);
    });

    it('should return null for unknown message', () => {
      const data = { foo: 'bar' };
      const priceUpdate = parser.extractPrice(data);

      expect(priceUpdate).toBeNull();
    });
  });

  describe('JSON string parsing', () => {
    it('should parse JSON string', () => {
      const jsonStr = JSON.stringify({ symbol: 'BTCUSDT', price: 50000 });
      const result = parser.parse(jsonStr);

      expect(result.type).toBe('price_update');
      expect(result.data?.price).toBe(50000);
    });

    it('should handle invalid JSON gracefully', () => {
      const result = parser.parse('not valid json');

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('Socket.IO prefix stripping', () => {
    it('should strip "42" prefix and parse Socket.IO event array', () => {
      const msg = '42["updateStream",[["#EURUSD_otc",1707123456,1.23456]]]';
      const result = parser.parse(msg);

      expect(result.type).toBe('price_update');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should strip "451-" prefix and parse Socket.IO binary placeholder (no actual data)', () => {
      const msg = '451-["updateHistoryNewFast",{"_placeholder":true,"num":0}]';
      const result = parser.parse(msg);

      // placeholder 프레임은 실제 히스토리 데이터가 아님 — 다음 바이너리 프레임에 데이터가 있음
      // JSON.parse는 성공하지만 _placeholder에는 캔들 데이터가 없으므로 unknown이 정상
      expect(result.type).toBe('unknown');
    });

    it('should parse history event with candle data from "42" prefix', () => {
      const candles = [
        { open: 1.085, high: 1.086, low: 1.084, close: 1.0855, time: 1707100000 },
        { open: 1.0855, high: 1.087, low: 1.085, close: 1.086, time: 1707100060 },
      ];
      const msg = `42["updateHistoryNewFast",{"asset":"#EURUSD_otc","data":${JSON.stringify(candles)}}]`;
      const result = parser.parse(msg);

      expect(result.type).toBe('candle_history');
      expect(result.confidence).toBeGreaterThan(0.9);
      const parsed = result.data as any[];
      expect(parsed.length).toBe(2);
    });

    it('should parse history event with array-format candles', () => {
      // [timestamp, open, close, high, low, volume]
      const candles = [
        [1707100000, 1.085, 1.0855, 1.086, 1.084, 100],
        [1707100060, 1.0855, 1.086, 1.087, 1.085, 150],
      ];
      const msg = `42["updateHistoryNewFast",${JSON.stringify(candles)}]`;
      const result = parser.parse(msg);

      expect(result.type).toBe('candle_history');
      const parsed = result.data as any[];
      expect(parsed.length).toBe(2);
      expect(parsed[0].timestamp).toBe(1707100000);
    });

    it('should handle plain number prefix without hyphen', () => {
      const msg = '2'; // Socket.IO probe
      const result = parser.parse(msg);
      expect(result.type).toBe('unknown');
    });
  });

  describe('Utility methods', () => {
    it('should return pattern list', () => {
      const patterns = parser.getPatterns();

      expect(patterns).toContain('simple_price');
      expect(patterns).toContain('bid_ask');
      expect(patterns).toContain('ohlc_candle');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should track unknown message types', () => {
      parser.parse({ unknownField: 'test' });
      const unknowns = parser.getUnknownMessageTypes();

      expect(unknowns.length).toBeGreaterThan(0);
    });

    it('should clear unknown message types', () => {
      parser.parse({ unknownField: 'test' });
      parser.clearUnknownMessageTypes();
      const unknowns = parser.getUnknownMessageTypes();

      expect(unknowns.length).toBe(0);
    });
  });
});

describe('Singleton getWebSocketParser', () => {
  it('should return same instance', () => {
    const parser1 = getWebSocketParser();
    const parser2 = getWebSocketParser();

    expect(parser1).toBe(parser2);
  });
});

// ============================================================
// Extended coverage: validation, edge cases, history parsing
// ============================================================
describe('WebSocketParser - extended coverage', () => {
  let parser: WebSocketParser;

  beforeEach(() => {
    parser = new WebSocketParser();
  });

  describe('validation edge cases', () => {
    it('should reject price_update with non-string symbol via custom pattern', () => {
      parser.registerPattern({
        name: 'bad_symbol',
        detect: (d) => d?._badSymbol,
        parse: () => ({
          type: 'price_update' as const,
          data: {
            symbol: 123 as any,
            price: 50000,
            timestamp: Date.now(),
            source: 'websocket' as const,
          },
          raw: {},
          confidence: 0.9,
        }),
      });
      const result = parser.parse({ _badSymbol: true });
      expect(result.type).toBe('unknown');
    });

    it('should reject candle_data with non-number OHLC', () => {
      parser.registerPattern({
        name: 'bad_candle',
        detect: (d) => d?._badCandle,
        parse: () => ({
          type: 'candle_data' as const,
          data: { symbol: 'X', open: 'bad' as any, high: 1, low: 1, close: 1, timestamp: 1 },
          raw: {},
          confidence: 0.9,
        }),
      });
      const result = parser.parse({ _badCandle: true });
      expect(result.type).toBe('unknown');
    });

    it('should reject orderbook with non-number bid', () => {
      parser.registerPattern({
        name: 'bad_ob',
        detect: (d) => d?._badOB,
        parse: () => ({
          type: 'orderbook' as const,
          data: { symbol: 'X', bid: 'bad' as any, ask: 100, timestamp: 1 },
          raw: {},
          confidence: 0.9,
        }),
      });
      const result = parser.parse({ _badOB: true });
      expect(result.type).toBe('unknown');
    });

    it('should reject trade with non-number price', () => {
      parser.registerPattern({
        name: 'bad_trade',
        detect: (d) => d?._badTrade,
        parse: () => ({
          type: 'trade' as const,
          data: {
            symbol: 'X',
            price: 'bad' as any,
            quantity: 1,
            side: 'buy' as const,
            timestamp: 1,
          },
          raw: {},
          confidence: 0.9,
        }),
      });
      const result = parser.parse({ _badTrade: true });
      expect(result.type).toBe('unknown');
    });

    it('should pass heartbeat with null data', () => {
      const result = parser.parse({ action: 'heartbeat' });
      expect(result.type).toBe('heartbeat');
    });
  });

  describe('candle_history data validation', () => {
    it('should handle candles with NaN timestamp in history', () => {
      const result = parser.parse([
        'updateHistoryNewFast',
        {
          data: [
            { open: 100, high: 110, low: 90, close: 105, timestamp: NaN },
            { open: 100, high: 110, low: 90, close: 105, timestamp: 1700000000000 },
          ],
        },
      ]);
      expect(result.type).toBe('candle_history');
      const data = result.data as any[];
      // The valid candle with timestamp 1700000000000 should be present
      expect(data.some((c: any) => c.timestamp === 1700000000000)).toBe(true);
    });

    it('should handle history with zero timestamp candles', () => {
      const result = parser.parse([
        'history',
        {
          history: [{ open: 100, high: 110, low: 90, close: 105, timestamp: 0 }],
        },
      ]);
      // Zero timestamp candle is filtered by timestamp > 0 condition
      // If no valid candles remain, result falls through but event was still recognized
      expect(['candle_history', 'unknown']).toContain(result.type);
    });

    it('should parse candles with alternate field names (o, h, l, c)', () => {
      const result = parser.parse([
        'history',
        {
          data: [{ o: 100, h: 110, l: 90, c: 105, t: 1700000000000 }],
        },
      ]);
      expect(result.type).toBe('candle_history');
      const data = result.data as any[];
      expect(data[0].open).toBe(100);
      expect(data[0].high).toBe(110);
    });
  });

  describe('registerPattern priority', () => {
    it('custom patterns run before defaults', () => {
      parser.registerPattern({
        name: 'override',
        detect: (d) => d?.symbol === 'OVERRIDE',
        parse: (d) => ({
          type: 'heartbeat' as const,
          data: null,
          raw: d,
          confidence: 1.0,
        }),
      });
      // Even though it has symbol+price, custom pattern intercepts first
      const result = parser.parse({ symbol: 'OVERRIDE', price: 100 });
      expect(result.type).toBe('heartbeat');
    });
  });

  describe('action pattern with rate field in payload', () => {
    it('extracts price from rate field', () => {
      const result = parser.parse({
        action: 'stream',
        payload: { rate: 1.0856 },
      });
      expect(result.type).toBe('price_update');
    });

    it('extracts price from last field', () => {
      const result = parser.parse({
        cmd: 'price_update',
        body: { last: 50000 },
      });
      expect(result.type).toBe('price_update');
    });
  });

  describe('signals/stats event', () => {
    it('parses multi-asset stats', () => {
      const result = parser.parse([
        'signals/stats',
        [
          [
            1700000,
            [
              ['#aapl_otc', 175.5],
              ['#goog_otc', 140.0],
            ],
          ],
          [1700001, [['#msft_otc', 380.0]]],
        ],
      ]);
      expect(result.type).toBe('candle_history');
      const data = result.data as any[];
      expect(data).toHaveLength(3);
      expect(data[0].symbol).toBe('AAPL-OTC');
      expect(data[1].symbol).toBe('GOOG-OTC');
      expect(data[2].symbol).toBe('MSFT-OTC');
    });
  });

  describe('binary_payload with ArrayBuffer', () => {
    it('decodes JSON from ArrayBuffer', () => {
      const candles = [{ open: 50, high: 55, low: 48, close: 52, timestamp: 1700000000000 }];
      const uint8 = new TextEncoder().encode(JSON.stringify(candles));

      const result = parser.parse({
        type: 'binary_payload',
        event: 'updateHistoryNewFast',
        data: uint8,
      });
      expect(result.type).toBe('candle_history');
    });

    it('handles non-JSON binary as raw data', () => {
      const uint8 = new Uint8Array([0x00, 0x01, 0x02]);
      const result = parser.parse({
        type: 'binary_payload',
        event: 'someEvent',
        data: uint8,
      });
      expect(result.type).toBe('unknown');
    });
  });

  describe('edge cases', () => {
    it('null input returns unknown', () => {
      expect(parser.parse(null).type).toBe('unknown');
    });

    it('undefined input returns unknown', () => {
      expect(parser.parse(undefined).type).toBe('unknown');
    });

    it('numeric input returns unknown', () => {
      expect(parser.parse(42).type).toBe('unknown');
    });

    it('boolean input returns unknown', () => {
      expect(parser.parse(true).type).toBe('unknown');
    });

    it('empty string returns unknown', () => {
      expect(parser.parse('').type).toBe('unknown');
    });

    it('Socket.IO probe "2" returns unknown', () => {
      expect(parser.parse('2').type).toBe('unknown');
    });
  });
});

// ============================================================
// registerPocketOptionPattern
// ============================================================
describe('registerPocketOptionPattern', () => {
  it('registers custom pattern that returns price_update', () => {
    registerPocketOptionPattern(
      'test_po',
      (d) => d?._testPO === true,
      (d) => ({ symbol: d.s, price: d.p, timestamp: 1700000000000 }),
    );
    const p = getWebSocketParser();
    const result = p.parse({ _testPO: true, s: 'ETH', p: 3000 });
    expect(result.type).toBe('price_update');
  });

  it('returns unknown when extractPrice returns null', () => {
    registerPocketOptionPattern(
      'test_null',
      (d) => d?._testNull === true,
      () => null,
    );
    const p = getWebSocketParser();
    const result = p.parse({ _testNull: true });
    expect(result.type).toBe('unknown');
  });
});
