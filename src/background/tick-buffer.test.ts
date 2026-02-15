import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db, TickRepository } from '../lib/db';
import { TickBuffer, DEFAULT_TICK_POLICY } from './tick-buffer';

describe('TickBuffer', () => {
  let buffer: TickBuffer;

  beforeEach(async () => {
    await db.ticks.clear();
  });

  afterEach(async () => {
    // stop() clears timers and flushes — safe with real timers
    if (buffer) await buffer.stop();
    await db.ticks.clear();
  });

  // ============================================================
  // Sampling gate
  // ============================================================
  describe('sampling', () => {
    it('should accept the first tick for a ticker', () => {
      buffer = new TickBuffer({ sampleIntervalMs: 500, batchSize: 1000, flushIntervalMs: 99999 });
      const accepted = buffer.ingest({ ticker: 'EURUSD', timestamp: 1000, price: 1.08 });
      expect(accepted).toBe(true);
    });

    it('should drop a tick that arrives within sampleIntervalMs', () => {
      buffer = new TickBuffer({ sampleIntervalMs: 500, batchSize: 1000, flushIntervalMs: 99999 });
      buffer.ingest({ ticker: 'EURUSD', timestamp: 1000, price: 1.08 });
      const accepted = buffer.ingest({ ticker: 'EURUSD', timestamp: 1200, price: 1.081 });
      expect(accepted).toBe(false);
    });

    it('should accept a tick after sampleIntervalMs has elapsed', () => {
      buffer = new TickBuffer({ sampleIntervalMs: 500, batchSize: 1000, flushIntervalMs: 99999 });
      buffer.ingest({ ticker: 'EURUSD', timestamp: 1000, price: 1.08 });
      const accepted = buffer.ingest({ ticker: 'EURUSD', timestamp: 1600, price: 1.082 });
      expect(accepted).toBe(true);
    });

    it('should sample independently per ticker', () => {
      buffer = new TickBuffer({ sampleIntervalMs: 500, batchSize: 1000, flushIntervalMs: 99999 });
      buffer.ingest({ ticker: 'EURUSD', timestamp: 1000, price: 1.08 });
      const accepted = buffer.ingest({ ticker: 'GBPUSD', timestamp: 1100, price: 1.26 });
      expect(accepted).toBe(true);
    });

    it('should drop ticks with missing fields', () => {
      buffer = new TickBuffer({ sampleIntervalMs: 500, batchSize: 1000, flushIntervalMs: 99999 });
      expect(buffer.ingest({ ticker: '', timestamp: 1000, price: 1.0 })).toBe(false);
      expect(buffer.ingest({ ticker: 'X', timestamp: 0, price: 1.0 })).toBe(false);
    });
  });

  // ============================================================
  // Batch flush (manual)
  // ============================================================
  describe('batch flush', () => {
    it('should auto-flush when batchSize is reached', async () => {
      buffer = new TickBuffer({
        sampleIntervalMs: 0,
        batchSize: 3,
        flushIntervalMs: 99999,
      });

      buffer.ingest({ ticker: 'A', timestamp: 100, price: 1 });
      buffer.ingest({ ticker: 'A', timestamp: 200, price: 2 });
      buffer.ingest({ ticker: 'A', timestamp: 300, price: 3 });

      // Flush is fire-and-forget from ingest; wait for its microtask
      await new Promise((r) => setTimeout(r, 50));

      expect(await TickRepository.count()).toBe(3);
    });

    it('manual flush() should write all buffered ticks', async () => {
      buffer = new TickBuffer({
        sampleIntervalMs: 0,
        batchSize: 1000,
        flushIntervalMs: 99999,
      });

      buffer.ingest({ ticker: 'A', timestamp: 100, price: 1 });
      buffer.ingest({ ticker: 'A', timestamp: 200, price: 2 });

      const flushed = await buffer.flush();
      expect(flushed).toBe(2);
      expect(await TickRepository.count()).toBe(2);
    });

    it('flush() on empty buffer returns 0', async () => {
      buffer = new TickBuffer({ flushIntervalMs: 99999 });
      const flushed = await buffer.flush();
      expect(flushed).toBe(0);
    });

    it('should flush on timer when batchSize is not reached', async () => {
      // Use a short flushIntervalMs to test timer-based flush
      buffer = new TickBuffer({
        sampleIntervalMs: 0,
        batchSize: 1000,
        flushIntervalMs: 50,
      });

      buffer.ingest({ ticker: 'A', timestamp: 100, price: 1 });
      buffer.ingest({ ticker: 'A', timestamp: 200, price: 2 });

      // Not yet flushed
      expect(await TickRepository.count()).toBe(0);

      // Wait for the flush timer to fire
      await new Promise((r) => setTimeout(r, 120));

      expect(await TickRepository.count()).toBe(2);
    });
  });

  // ============================================================
  // Retention
  // ============================================================
  describe('retention', () => {
    it('should delete ticks older than maxAgeMs', async () => {
      buffer = new TickBuffer({
        sampleIntervalMs: 0,
        batchSize: 1000,
        flushIntervalMs: 99999,
        maxAgeMs: 1000,
        maxTicks: 100000,
      });

      const now = Date.now();
      await TickRepository.bulkPut([
        { ticker: 'A', timestamp: now - 5000, price: 1 },
        { ticker: 'A', timestamp: now - 2000, price: 2 },
        { ticker: 'A', timestamp: now - 500, price: 3 },
        { ticker: 'A', timestamp: now, price: 4 },
      ]);

      const result = await buffer.runRetention();
      expect(result.ageDeleted).toBe(2);
      expect(await TickRepository.count()).toBe(2);
    });

    it('should enforce maxTicks cap', async () => {
      buffer = new TickBuffer({
        sampleIntervalMs: 0,
        batchSize: 1000,
        flushIntervalMs: 99999,
        maxAgeMs: 999999999,
        maxTicks: 3,
      });

      const now = Date.now();
      await TickRepository.bulkPut([
        { ticker: 'A', timestamp: now - 400, price: 1 },
        { ticker: 'A', timestamp: now - 300, price: 2 },
        { ticker: 'A', timestamp: now - 200, price: 3 },
        { ticker: 'A', timestamp: now - 100, price: 4 },
        { ticker: 'A', timestamp: now, price: 5 },
      ]);

      const result = await buffer.runRetention();
      expect(result.capDeleted).toBe(2);
      expect(await TickRepository.count()).toBe(3);
    });

    it('should not delete when within limits', async () => {
      buffer = new TickBuffer({
        sampleIntervalMs: 0,
        batchSize: 1000,
        flushIntervalMs: 99999,
        maxAgeMs: 999999999,
        maxTicks: 1000,
      });

      const now = Date.now();
      await TickRepository.bulkPut([{ ticker: 'A', timestamp: now, price: 1 }]);

      const result = await buffer.runRetention();
      expect(result.ageDeleted).toBe(0);
      expect(result.capDeleted).toBe(0);
      expect(await TickRepository.count()).toBe(1);
    });
  });

  // ============================================================
  // stop()
  // ============================================================
  describe('stop', () => {
    it('should flush remaining buffer on stop', async () => {
      buffer = new TickBuffer({
        sampleIntervalMs: 0,
        batchSize: 1000,
        flushIntervalMs: 99999,
        retentionIntervalMs: 99999,
      });
      buffer.start();

      buffer.ingest({ ticker: 'A', timestamp: 100, price: 1 });
      buffer.ingest({ ticker: 'A', timestamp: 200, price: 2 });

      await buffer.stop();
      expect(await TickRepository.count()).toBe(2);
    });
  });

  // ============================================================
  // getStats (observability)
  // ============================================================
  describe('getStats', () => {
    it('should track accepted/dropped/flushed counts', async () => {
      buffer = new TickBuffer({
        sampleIntervalMs: 500,
        batchSize: 1000,
        flushIntervalMs: 99999,
      });

      buffer.ingest({ ticker: 'A', timestamp: 1000, price: 1 }); // accepted
      buffer.ingest({ ticker: 'A', timestamp: 1100, price: 2 }); // dropped (within 500ms)
      buffer.ingest({ ticker: 'A', timestamp: 1600, price: 3 }); // accepted

      await buffer.flush();

      const stats = buffer.getStats();
      expect(stats.accepted).toBe(2);
      expect(stats.dropped).toBe(1);
      expect(stats.flushed).toBe(2);
      expect(stats.flushErrors).toBe(0);
      expect(stats.bufferSize).toBe(0);
    });
  });

  // ============================================================
  // Error handling
  // ============================================================
  describe('error handling', () => {
    it('should call onFlushError and retain ticks on DB failure', async () => {
      const errors: unknown[] = [];
      buffer = new TickBuffer(
        { sampleIntervalMs: 0, batchSize: 1000, flushIntervalMs: 99999 },
        { onFlushError: (err) => errors.push(err) },
      );

      buffer.ingest({ ticker: 'A', timestamp: 100, price: 1 });
      buffer.ingest({ ticker: 'A', timestamp: 200, price: 2 });

      // Mock bulkPut to fail
      const original = TickRepository.bulkPut;
      TickRepository.bulkPut = async () => {
        throw new Error('DB write failed');
      };

      await buffer.flush();

      expect(errors).toHaveLength(1);
      const stats = buffer.getStats();
      expect(stats.flushErrors).toBe(1);
      expect(stats.bufferSize).toBe(2);

      // Restore so afterEach stop() can flush
      TickRepository.bulkPut = original;
    });
  });

  // ============================================================
  // Default policy
  // ============================================================
  describe('default policy', () => {
    it('should use sensible defaults', () => {
      buffer = new TickBuffer();
      expect(DEFAULT_TICK_POLICY.sampleIntervalMs).toBe(500);
      expect(DEFAULT_TICK_POLICY.batchSize).toBe(100);
      expect(DEFAULT_TICK_POLICY.flushIntervalMs).toBe(500);
      expect(DEFAULT_TICK_POLICY.maxTicks).toBe(5000);
      expect(DEFAULT_TICK_POLICY.maxAgeMs).toBe(2 * 60 * 60 * 1000);
      expect(DEFAULT_TICK_POLICY.retentionIntervalMs).toBe(30000);
    });
  });
});
