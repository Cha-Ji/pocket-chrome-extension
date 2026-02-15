import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, CandleRepository, CandleDatasetRepository } from './index';
import type { StoredCandle } from './index';

// 캔들 생성 헬퍼
function makeCandles(
  ticker: string,
  interval: number,
  count: number,
  startTs = 1700000000000,
): Omit<StoredCandle, 'createdAt'>[] {
  return Array.from({ length: count }, (_, i) => ({
    ticker,
    interval,
    timestamp: startTs + i * interval * 1000,
    open: 1.085 + Math.random() * 0.002,
    high: 1.087 + Math.random() * 0.001,
    low: 1.083 + Math.random() * 0.001,
    close: 1.085 + Math.random() * 0.002,
    volume: Math.floor(Math.random() * 1000),
  }));
}

describe('Dexie Performance Optimizations (V6)', () => {
  beforeEach(async () => {
    await db.candles.clear();
    await db.candleDatasets.clear();
  });

  afterEach(async () => {
    await db.candles.clear();
    await db.candleDatasets.clear();
  });

  // ============================================================
  // bulkAdd 최적화
  // ============================================================
  describe('bulkAdd — batch dedup + single transaction', () => {
    it('should add all candles when none exist', async () => {
      const candles = makeCandles('EURUSD_OTC', 60, 100);
      const added = await CandleRepository.bulkAdd(candles, 'websocket');
      expect(added).toBe(100);

      const count = await CandleRepository.count('EURUSD_OTC', 60);
      expect(count).toBe(100);
    });

    it('should skip all duplicates when all exist', async () => {
      const candles = makeCandles('EURUSD_OTC', 60, 50);
      await CandleRepository.bulkAdd(candles, 'websocket');

      // 동일한 데이터 재입력
      const added = await CandleRepository.bulkAdd(candles, 'websocket');
      expect(added).toBe(0);

      const count = await CandleRepository.count('EURUSD_OTC', 60);
      expect(count).toBe(50);
    });

    it('should add only new candles when partial overlap', async () => {
      const first = makeCandles('EURUSD_OTC', 60, 100);
      await CandleRepository.bulkAdd(first, 'websocket');

      // 50개 중복 + 50개 신규
      const overlap = makeCandles('EURUSD_OTC', 60, 100, 1700000000000 + 50 * 60000);
      const added = await CandleRepository.bulkAdd(overlap, 'websocket');
      expect(added).toBe(50); // 후반 50개만 신규

      const count = await CandleRepository.count('EURUSD_OTC', 60);
      expect(count).toBe(150);
    });

    it('should deduplicate within the same batch', async () => {
      const candles = makeCandles('EURUSD_OTC', 60, 10);
      // 같은 캔들을 3번 반복
      const tripled = [...candles, ...candles, ...candles];
      const added = await CandleRepository.bulkAdd(tripled, 'websocket');
      expect(added).toBe(10); // 중복 제거 후 10개만 추가

      const count = await CandleRepository.count('EURUSD_OTC', 60);
      expect(count).toBe(10);
    });

    it('should handle multiple tickers in one batch', async () => {
      const eur = makeCandles('EURUSD_OTC', 60, 50);
      const gbp = makeCandles('GBPUSD_OTC', 60, 30);
      const jpy = makeCandles('USDJPY_OTC', 300, 20);

      const added = await CandleRepository.bulkAdd([...eur, ...gbp, ...jpy], 'websocket');
      expect(added).toBe(100); // 50 + 30 + 20

      expect(await CandleRepository.count('EURUSD_OTC', 60)).toBe(50);
      expect(await CandleRepository.count('GBPUSD_OTC', 60)).toBe(30);
      expect(await CandleRepository.count('USDJPY_OTC', 300)).toBe(20);
    });

    it('should apply source parameter to candles without source', async () => {
      const candles = makeCandles('EURUSD_OTC', 60, 5);
      await CandleRepository.bulkAdd(candles, 'import');

      const stored = await db.candles.toArray();
      for (const c of stored) {
        expect(c.source).toBe('import');
      }
    });

    it('should return 0 for empty array', async () => {
      const added = await CandleRepository.bulkAdd([], 'websocket');
      expect(added).toBe(0);
    });
  });

  // ============================================================
  // add() — unique index 기반 중복 무시
  // ============================================================
  describe('add — put upsert', () => {
    it('should add a single candle', async () => {
      await CandleRepository.add({
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000000000,
        open: 1.085,
        high: 1.087,
        low: 1.083,
        close: 1.086,
      });
      const count = await CandleRepository.count('EURUSD_OTC', 60);
      expect(count).toBe(1);
    });

    it('should upsert duplicate candle without error', async () => {
      const candle: Omit<StoredCandle, 'createdAt'> = {
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000000000,
        open: 1.085,
        high: 1.087,
        low: 1.083,
        close: 1.086,
      };

      await CandleRepository.add(candle);
      await CandleRepository.add(candle); // duplicate → upsert

      const count = await CandleRepository.count('EURUSD_OTC', 60);
      expect(count).toBe(1);
    });
  });

  // ============================================================
  // getTickers() — uniqueKeys 최적화
  // ============================================================
  describe('getTickers — uniqueKeys optimization', () => {
    it('should return empty array when no candles', async () => {
      const tickers = await CandleRepository.getTickers();
      expect(tickers).toEqual([]);
    });

    it('should return unique tickers', async () => {
      await CandleRepository.bulkAdd(makeCandles('EURUSD_OTC', 60, 10), 'websocket');
      await CandleRepository.bulkAdd(makeCandles('GBPUSD_OTC', 60, 5), 'websocket');
      await CandleRepository.bulkAdd(makeCandles('EURUSD_OTC', 300, 3), 'websocket');

      const tickers = await CandleRepository.getTickers();
      expect(tickers.sort()).toEqual(['EURUSD_OTC', 'GBPUSD_OTC']);
    });
  });

  // ============================================================
  // getStats() — 인덱스 기반 통계
  // ============================================================
  describe('getStats — index-based statistics', () => {
    it('should return zero stats when empty', async () => {
      const stats = await CandleRepository.getStats();
      expect(stats.totalCandles).toBe(0);
      expect(stats.tickers).toEqual([]);
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
    });

    it('should return correct stats for single ticker+interval', async () => {
      const candles = makeCandles('EURUSD_OTC', 60, 100);
      await CandleRepository.bulkAdd(candles, 'websocket');

      const stats = await CandleRepository.getStats();
      expect(stats.totalCandles).toBe(100);
      expect(stats.tickers).toHaveLength(1);
      expect(stats.tickers[0]).toEqual({
        ticker: 'EURUSD_OTC',
        interval: 60,
        count: 100,
      });
      expect(stats.oldestTimestamp).toBe(candles[0].timestamp);
      expect(stats.newestTimestamp).toBe(candles[99].timestamp);
    });

    it('should return stats for multiple ticker+interval pairs', async () => {
      await CandleRepository.bulkAdd(makeCandles('EURUSD_OTC', 60, 50), 'websocket');
      await CandleRepository.bulkAdd(makeCandles('GBPUSD_OTC', 60, 30), 'websocket');
      await CandleRepository.bulkAdd(makeCandles('EURUSD_OTC', 300, 20), 'websocket');

      const stats = await CandleRepository.getStats();
      expect(stats.totalCandles).toBe(100);
      expect(stats.tickers).toHaveLength(3);

      const eurM1 = stats.tickers.find((t) => t.ticker === 'EURUSD_OTC' && t.interval === 60);
      const gbpM1 = stats.tickers.find((t) => t.ticker === 'GBPUSD_OTC' && t.interval === 60);
      const eurM5 = stats.tickers.find((t) => t.ticker === 'EURUSD_OTC' && t.interval === 300);

      expect(eurM1?.count).toBe(50);
      expect(gbpM1?.count).toBe(30);
      expect(eurM5?.count).toBe(20);
    });
  });

  // ============================================================
  // unique compound index — DB-level integrity
  // ============================================================
  describe('Compound PK [ticker+interval+timestamp]', () => {
    it('should prevent direct duplicate insert at DB level', async () => {
      await db.candles.put({
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000000000,
        open: 1.085,
        high: 1.087,
        low: 1.083,
        close: 1.086,
        createdAt: Date.now(),
      });

      // Direct .add() should throw ConstraintError for duplicate PK
      await expect(
        db.candles.add({
          ticker: 'EURUSD_OTC',
          interval: 60,
          timestamp: 1700000000000,
          open: 9.999,
          high: 9.999,
          low: 9.999,
          close: 9.999,
          createdAt: Date.now(),
        }),
      ).rejects.toThrow();

      // Verify only 1 record
      const count = await db.candles.count();
      expect(count).toBe(1);
    });

    it('should allow same timestamp for different ticker or interval', async () => {
      const ts = 1700000000000;
      await db.candles.put({
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: ts,
        open: 1.085,
        high: 1.087,
        low: 1.083,
        close: 1.086,
        createdAt: Date.now(),
      });
      await db.candles.put({
        ticker: 'GBPUSD_OTC',
        interval: 60,
        timestamp: ts,
        open: 1.285,
        high: 1.287,
        low: 1.283,
        close: 1.286,
        createdAt: Date.now(),
      });
      await db.candles.put({
        ticker: 'EURUSD_OTC',
        interval: 300,
        timestamp: ts,
        open: 1.085,
        high: 1.087,
        low: 1.083,
        close: 1.086,
        createdAt: Date.now(),
      });

      const count = await db.candles.count();
      expect(count).toBe(3); // 3개 모두 고유
    });

    it('should upsert with put on same compound PK', async () => {
      await db.candles.put({
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000000000,
        open: 1.085,
        high: 1.087,
        low: 1.083,
        close: 1.086,
        createdAt: Date.now(),
      });
      await db.candles.put({
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000000000,
        open: 9.999,
        high: 9.999,
        low: 9.999,
        close: 9.999,
        createdAt: Date.now(),
      });

      const count = await db.candles.count();
      expect(count).toBe(1);

      const stored = await db.candles.get(['EURUSD_OTC', 60, 1700000000000]);
      expect(stored?.open).toBe(9.999); // upsert 확인
    });
  });

  // ============================================================
  // 대량 데이터 성능 검증 (벤치마크 참조용)
  // ============================================================
  describe('Bulk performance benchmarks', () => {
    it('should handle 500 candles in bulkAdd efficiently', async () => {
      const candles = makeCandles('EURUSD_OTC', 60, 500);

      const start = performance.now();
      const added = await CandleRepository.bulkAdd(candles, 'websocket');
      const elapsed = performance.now() - start;

      expect(added).toBe(500);
      console.log(`[PERF] bulkAdd 500 candles: ${elapsed.toFixed(1)}ms`);
      expect(elapsed).toBeLessThan(10000);
    }, 15000);

    it('should handle 500 duplicate candles without performance degradation', async () => {
      const candles = makeCandles('EURUSD_OTC', 60, 500);
      await CandleRepository.bulkAdd(candles, 'websocket');

      const start = performance.now();
      const added = await CandleRepository.bulkAdd(candles, 'websocket');
      const elapsed = performance.now() - start;

      expect(added).toBe(0);
      console.log(`[PERF] bulkAdd 500 duplicates: ${elapsed.toFixed(1)}ms`);
      expect(elapsed).toBeLessThan(20000);
    }, 30000);

    it('should getStats efficiently on 500+ candles', async () => {
      await CandleRepository.bulkAdd(makeCandles('EURUSD_OTC', 60, 250), 'websocket');
      await CandleRepository.bulkAdd(makeCandles('GBPUSD_OTC', 60, 150), 'websocket');
      await CandleRepository.bulkAdd(makeCandles('USDJPY_OTC', 300, 100), 'websocket');

      const start = performance.now();
      const stats = await CandleRepository.getStats();
      const elapsed = performance.now() - start;

      expect(stats.totalCandles).toBe(500);
      expect(stats.tickers).toHaveLength(3);
      console.log(`[PERF] getStats on 500 candles (3 pairs): ${elapsed.toFixed(1)}ms`);
      expect(elapsed).toBeLessThan(5000);
    }, 15000);

    it('should getTickers efficiently on multi-ticker data', async () => {
      const tickers = ['EURUSD_OTC', 'GBPUSD_OTC', 'USDJPY_OTC', 'AAPL_OTC', 'BTCUSD'];
      for (const t of tickers) {
        await CandleRepository.bulkAdd(makeCandles(t, 60, 100), 'websocket');
      }

      const start = performance.now();
      const result = await CandleRepository.getTickers();
      const elapsed = performance.now() - start;

      expect(result.sort()).toEqual(tickers.sort());
      console.log(`[PERF] getTickers on 5 tickers (500 candles): ${elapsed.toFixed(1)}ms`);
      expect(elapsed).toBeLessThan(5000);
    }, 15000);
  });
});
