import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, TickRepository } from './index';

describe('TickRepository — enhanced API', () => {
  beforeEach(async () => {
    await db.ticks.clear();
  });
  afterEach(async () => {
    await db.ticks.clear();
  });

  // ============================================================
  // bulkPut (upsert-friendly)
  // ============================================================
  describe('bulkPut', () => {
    it('should insert ticks via bulkPut', async () => {
      const now = Date.now();
      await TickRepository.bulkPut([
        { ticker: 'EURUSD', timestamp: now - 1000, price: 1.08 },
        { ticker: 'EURUSD', timestamp: now, price: 1.09 },
      ]);
      expect(await TickRepository.count()).toBe(2);
    });

    it('should handle duplicate timestamps without throwing', async () => {
      const now = Date.now();
      const tick = { ticker: 'EURUSD', timestamp: now, price: 1.08 };
      await TickRepository.bulkPut([tick]);
      // Insert same timestamp again — should not throw
      await TickRepository.bulkPut([{ ...tick, price: 1.09 }]);
      // The auto-increment id means both rows exist (ticks table uses ++id, not unique on timestamp)
      const count = await TickRepository.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should be a no-op for empty array', async () => {
      await TickRepository.bulkPut([]);
      expect(await TickRepository.count()).toBe(0);
    });

    it('should handle large batch without failure', async () => {
      const now = Date.now();
      const ticks = Array.from({ length: 500 }, (_, i) => ({
        ticker: 'GBPUSD',
        timestamp: now + i,
        price: 1.26 + i * 0.0001,
      }));
      await TickRepository.bulkPut(ticks);
      expect(await TickRepository.count()).toBe(500);
    });
  });

  // ============================================================
  // deleteOldestToLimit
  // ============================================================
  describe('deleteOldestToLimit', () => {
    it('should delete nothing when count <= maxCount', async () => {
      const now = Date.now();
      await TickRepository.bulkPut([
        { ticker: 'EURUSD', timestamp: now - 100, price: 1.0 },
        { ticker: 'EURUSD', timestamp: now, price: 1.1 },
      ]);

      const deleted = await TickRepository.deleteOldestToLimit(10);
      expect(deleted).toBe(0);
      expect(await TickRepository.count()).toBe(2);
    });

    it('should delete oldest ticks to enforce the limit', async () => {
      const now = Date.now();
      // Insert 10 ticks
      const ticks = Array.from({ length: 10 }, (_, i) => ({
        ticker: 'EURUSD',
        timestamp: now + i * 100,
        price: 1.0 + i * 0.001,
      }));
      await TickRepository.bulkPut(ticks);
      expect(await TickRepository.count()).toBe(10);

      // Enforce limit of 5
      const deleted = await TickRepository.deleteOldestToLimit(5);
      expect(deleted).toBe(5);
      expect(await TickRepository.count()).toBe(5);

      // Verify the remaining are the newest ones
      const remaining = await TickRepository.getByTicker('EURUSD', 10);
      const timestamps = remaining.map((t) => t.timestamp);
      for (const ts of timestamps) {
        expect(ts).toBeGreaterThanOrEqual(now + 5 * 100);
      }
    });

    it('should handle maxCount=0 by deleting everything', async () => {
      const now = Date.now();
      await TickRepository.bulkPut([{ ticker: 'EURUSD', timestamp: now, price: 1.0 }]);
      const deleted = await TickRepository.deleteOldestToLimit(0);
      expect(deleted).toBe(1);
      expect(await TickRepository.count()).toBe(0);
    });
  });

  // ============================================================
  // getStats
  // ============================================================
  describe('getStats', () => {
    it('should return zeroes for empty table', async () => {
      const stats = await TickRepository.getStats();
      expect(stats).toEqual({
        count: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      });
    });

    it('should return correct oldest/newest', async () => {
      const t1 = 1000000;
      const t2 = 2000000;
      const t3 = 3000000;
      await TickRepository.bulkPut([
        { ticker: 'A', timestamp: t2, price: 1 },
        { ticker: 'B', timestamp: t1, price: 2 },
        { ticker: 'A', timestamp: t3, price: 3 },
      ]);

      const stats = await TickRepository.getStats();
      expect(stats.count).toBe(3);
      expect(stats.oldestTimestamp).toBe(t1);
      expect(stats.newestTimestamp).toBe(t3);
    });
  });

  // ============================================================
  // count (return type changed from number|undefined to number)
  // ============================================================
  describe('count', () => {
    it('should return 0 for empty table', async () => {
      const c = await TickRepository.count();
      expect(c).toBe(0);
      expect(typeof c).toBe('number');
    });
  });

  // ============================================================
  // TickBuffer flush → DB integration test
  // ============================================================
  describe('TickBuffer flush integration', () => {
    it('should increase tick count after TickBuffer flush', async () => {
      // Dynamic import to avoid circular dependency issues
      const { TickBuffer } = await import('../../background/tick-buffer');

      const buf = new TickBuffer({
        sampleIntervalMs: 0, // accept every tick
        batchSize: 1000, // don't auto-flush
        flushIntervalMs: 99999, // don't timer-flush
      });

      const baseCount = await TickRepository.count();
      expect(baseCount).toBe(0);

      // Ingest 5 ticks with different timestamps
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        buf.ingest({ ticker: 'EURUSD', timestamp: now + i * 1000, price: 1.08 + i * 0.001 });
      }

      // Before flush — DB should still be empty
      expect(await TickRepository.count()).toBe(0);

      // Flush
      const flushed = await buf.flush();
      expect(flushed).toBe(5);

      // After flush — DB should have 5 ticks
      expect(await TickRepository.count()).toBe(5);

      await buf.stop();
    });

    it('should persist ticks correctly across multiple flushes', async () => {
      const { TickBuffer } = await import('../../background/tick-buffer');

      const buf = new TickBuffer({
        sampleIntervalMs: 0,
        batchSize: 1000,
        flushIntervalMs: 99999,
      });

      const now = Date.now();

      // First batch
      for (let i = 0; i < 3; i++) {
        buf.ingest({ ticker: 'GBPUSD', timestamp: now + i * 1000, price: 1.26 });
      }
      await buf.flush();
      expect(await TickRepository.count()).toBe(3);

      // Second batch
      for (let i = 0; i < 4; i++) {
        buf.ingest({ ticker: 'GBPUSD', timestamp: now + (10 + i) * 1000, price: 1.27 });
      }
      await buf.flush();
      expect(await TickRepository.count()).toBe(7);

      await buf.stop();
    });
  });
});
