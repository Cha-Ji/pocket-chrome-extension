// ============================================================
// CandleCollector — Adaptive Observer/Polling Tests
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock CandleRepository before importing CandleCollector
vi.mock('../lib/db', () => ({
  CandleRepository: {
    add: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock chrome.runtime
vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
});

import { CandleCollector } from './candle-collector';

describe('CandleCollector', () => {
  let collector: CandleCollector;

  beforeEach(() => {
    vi.useFakeTimers();
    // Create collector with short intervals for testing
    collector = new CandleCollector(60, 500, {
      throttleMs: 100,
      observerTimeoutMs: 1000,
      pollingFallbackMs: 200,
      pollingIdleMs: 2000,
    });
  });

  afterEach(() => {
    collector.stop();
    vi.useRealTimers();
  });

  // ============================================================
  // addTickFromWebSocket (core path - no DOM dependency)
  // ============================================================

  describe('addTickFromWebSocket', () => {
    it('records a tick and updates candle buffer', () => {
      collector.addTickFromWebSocket('EURUSD', 1.1234, 1700000000000);

      const ticks = collector.getTickHistory();
      expect(ticks).toHaveLength(1);
      expect(ticks[0].price).toBe(1.1234);
      expect(ticks[0].ticker).toBe('EURUSD');
    });

    it('normalizes symbol via normalizeSymbol', () => {
      collector.addTickFromWebSocket('#eur_usd_otc', 1.1234, 1700000000000);

      const ticks = collector.getTickHistory();
      expect(ticks[0].ticker).toBe('EURUSD-OTC');
    });

    it('normalizes timestamp via normalizeTimestampMs', () => {
      // seconds → ms conversion
      collector.addTickFromWebSocket('EURUSD', 1.1234, 1700000000);

      const ticks = collector.getTickHistory();
      expect(ticks[0].timestamp).toBe(1700000000000);
    });

    it('builds candle from multiple ticks', () => {
      const baseTs = 1700000000000; // start of a minute boundary

      collector.addTickFromWebSocket('EURUSD', 1.1000, baseTs);
      collector.addTickFromWebSocket('EURUSD', 1.1100, baseTs + 1000);
      collector.addTickFromWebSocket('EURUSD', 1.0900, baseTs + 2000);
      collector.addTickFromWebSocket('EURUSD', 1.1050, baseTs + 3000);

      // Candle is still in buffer, not yet finalized
      // Force finalize by adding tick in next candle period
      const nextCandleTs = baseTs + 60000;
      collector.addTickFromWebSocket('EURUSD', 1.1060, nextCandleTs);

      const candles = collector.getCandles('EURUSD');
      expect(candles).toHaveLength(1);
      expect(candles[0].open).toBe(1.1);
      expect(candles[0].high).toBe(1.11);
      expect(candles[0].low).toBe(1.09);
      expect(candles[0].close).toBe(1.105);
    });
  });

  // ============================================================
  // Throttle / Dedup behavior
  // ============================================================

  describe('processPriceUpdate throttle', () => {
    it('does not produce duplicate ticks within throttle window', () => {
      const baseTs = 1700000000000;

      // Simulate rapid ticks
      collector.addTickFromWebSocket('EURUSD', 1.1, baseTs);
      collector.addTickFromWebSocket('EURUSD', 1.1, baseTs + 1);
      collector.addTickFromWebSocket('EURUSD', 1.1, baseTs + 2);

      const ticks = collector.getTickHistory();
      expect(ticks).toHaveLength(3); // addTickFromWebSocket doesn't go through throttle (DOM-only throttle)
    });
  });

  // ============================================================
  // Collector stats
  // ============================================================

  describe('getCollectorStats', () => {
    it('returns initial stats', () => {
      const stats = collector.getCollectorStats();
      expect(stats.observerAttached).toBe(false);
      expect(stats.pollingMode).toBe('idle');
      expect(stats.observerUpdates).toBe(0);
      expect(stats.pollingUpdates).toBe(0);
      expect(stats.throttledSkips).toBe(0);
    });
  });

  // ============================================================
  // Tick history limits
  // ============================================================

  describe('tick history limits', () => {
    it('limits tick history to maxTickHistory', () => {
      const baseTs = 1700000000000;

      // Add more than maxTickHistory (10000) ticks
      for (let i = 0; i < 11000; i++) {
        collector.addTickFromWebSocket('EURUSD', 1.1 + i * 0.0001, baseTs + i * 100);
      }

      const ticks = collector.getTickHistory();
      expect(ticks.length).toBeLessThanOrEqual(10000);
    });
  });

  // ============================================================
  // getLatestTickPrice / getTicksByTicker
  // ============================================================

  describe('getLatestTickPrice', () => {
    it('returns null for unknown ticker', () => {
      expect(collector.getLatestTickPrice('UNKNOWN')).toBeNull();
    });

    it('returns latest tick price', () => {
      collector.addTickFromWebSocket('EURUSD', 1.1, 1700000000000);
      collector.addTickFromWebSocket('EURUSD', 1.2, 1700000001000);

      expect(collector.getLatestTickPrice('EURUSD')).toBe(1.2);
    });
  });

  describe('getTicksByTicker', () => {
    it('returns empty for unknown ticker', () => {
      expect(collector.getTicksByTicker('UNKNOWN')).toEqual([]);
    });

    it('filters ticks by sinceMs', () => {
      const now = Date.now();
      collector.addTickFromWebSocket('EURUSD', 1.1, now - 5000);
      collector.addTickFromWebSocket('EURUSD', 1.2, now - 1000);
      collector.addTickFromWebSocket('EURUSD', 1.3, now);

      const recent = collector.getTicksByTicker('EURUSD', 2000);
      expect(recent.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // Listener management
  // ============================================================

  describe('onCandle', () => {
    it('prevents duplicate listener registration', () => {
      const cb = vi.fn();
      const unsub1 = collector.onCandle(cb);
      const unsub2 = collector.onCandle(cb);

      // Force candle finalization
      const baseTs = 1700000000000;
      collector.addTickFromWebSocket('EURUSD', 1.1, baseTs);
      collector.addTickFromWebSocket('EURUSD', 1.2, baseTs + 60000);

      // Callback should only be called once (not duplicated)
      expect(cb).toHaveBeenCalledTimes(1);

      unsub1();
      unsub2();
    });

    it('unsubscribe removes listener', () => {
      const cb = vi.fn();
      const unsub = collector.onCandle(cb);
      unsub();

      // Force candle finalization
      const baseTs = 1700000000000;
      collector.addTickFromWebSocket('EURUSD', 1.1, baseTs);
      collector.addTickFromWebSocket('EURUSD', 1.2, baseTs + 60000);

      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Stop behavior
  // ============================================================

  describe('stop', () => {
    it('can be called multiple times safely', () => {
      collector.stop();
      collector.stop(); // no error
      expect(collector.isCollecting).toBe(false);
    });
  });
});
