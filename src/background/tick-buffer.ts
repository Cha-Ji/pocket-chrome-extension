/**
 * TickBuffer — batches, samples, and enforces retention for high-frequency tick data.
 *
 * Design:
 *   1. Sampling: per-ticker, at most one tick stored per `sampleIntervalMs`.
 *   2. Batching: accumulates ticks in memory, flushes to DB when
 *      buffer hits `batchSize` OR `flushIntervalMs` elapses.
 *   3. Retention: periodically enforces maxTicks + maxAgeMs caps.
 *
 * All DB writes use bulkPut (upsert) so duplicate timestamps don't
 * cause ConstraintError failures.
 */

import type { Tick, TickStoragePolicy } from '../lib/types';
import { TickRepository } from '../lib/db';

export const DEFAULT_TICK_POLICY: TickStoragePolicy = {
  sampleIntervalMs: 500,
  batchSize: 100,
  flushIntervalMs: 500,
  maxTicks: 5000,
  maxAgeMs: 2 * 60 * 60 * 1000, // 2 hours
  retentionIntervalMs: 30_000,
};

export class TickBuffer {
  private buffer: Omit<Tick, 'id'>[] = [];
  private lastSavedAt = new Map<string, number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retentionTimer: ReturnType<typeof setInterval> | null = null;
  private policy: TickStoragePolicy;
  private onFlushError?: (error: unknown, tickCount: number) => void;

  /** Counters for observability */
  private _stats = {
    accepted: 0,
    dropped: 0,
    flushed: 0,
    flushErrors: 0,
    retentionRuns: 0,
    retentionDeleted: 0,
  };

  constructor(
    policy?: Partial<TickStoragePolicy>,
    options?: { onFlushError?: (error: unknown, tickCount: number) => void },
  ) {
    this.policy = { ...DEFAULT_TICK_POLICY, ...policy };
    this.onFlushError = options?.onFlushError;
  }

  /** Start periodic retention sweep. Call once at init. */
  start(): void {
    if (this.retentionTimer) return;
    this.retentionTimer = setInterval(
      () => void this.runRetention(),
      this.policy.retentionIntervalMs,
    );
  }

  /** Stop timers and flush remaining buffer. */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
    await this.flush();
  }

  /**
   * Ingest a tick. Returns true if the tick was accepted into the buffer
   * (passed sampling gate), false if it was dropped.
   */
  ingest(tick: Omit<Tick, 'id'>): boolean {
    if (!tick || !tick.ticker || !tick.timestamp) {
      this._stats.dropped++;
      return false;
    }

    // Sampling gate: skip if last stored tick for this ticker is too recent
    const lastTs = this.lastSavedAt.get(tick.ticker) ?? 0;
    if (tick.timestamp - lastTs < this.policy.sampleIntervalMs) {
      this._stats.dropped++;
      return false;
    }

    this.lastSavedAt.set(tick.ticker, tick.timestamp);
    this.buffer.push(tick);
    this._stats.accepted++;

    // Flush if batch is full
    if (this.buffer.length >= this.policy.batchSize) {
      void this.flush();
    } else if (!this.flushTimer) {
      // Schedule a timer-based flush
      this.flushTimer = setTimeout(() => void this.flush(), this.policy.flushIntervalMs);
    }

    return true;
  }

  /** Flush the in-memory buffer to IndexedDB. */
  async flush(): Promise<number> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.buffer.splice(0);
    if (batch.length === 0) return 0;

    try {
      await TickRepository.bulkPut(batch);
      this._stats.flushed += batch.length;
      return batch.length;
    } catch (error) {
      this._stats.flushErrors++;
      // Put ticks back into the buffer front (up to batchSize to avoid unbounded growth)
      const spaceLeft = this.policy.batchSize - this.buffer.length;
      if (spaceLeft > 0) {
        this.buffer.unshift(...batch.slice(0, spaceLeft));
      }
      this.onFlushError?.(error, batch.length);
      return 0;
    }
  }

  /** Run retention: delete by age, then enforce count cap. */
  async runRetention(): Promise<{ ageDeleted: number; capDeleted: number }> {
    this._stats.retentionRuns++;
    let ageDeleted = 0;
    let capDeleted = 0;

    try {
      // 1. Delete ticks older than maxAgeMs
      const ageCutoff = Date.now() - this.policy.maxAgeMs;
      ageDeleted = (await TickRepository.deleteOlderThan(ageCutoff)) ?? 0;

      // 2. Enforce hard cap
      capDeleted = await TickRepository.deleteOldestToLimit(this.policy.maxTicks);

      this._stats.retentionDeleted += ageDeleted + capDeleted;
    } catch {
      // Retention errors are non-fatal; will retry on next interval
    }

    return { ageDeleted, capDeleted };
  }

  /** Get buffer and lifetime stats for observability. */
  getStats() {
    return {
      bufferSize: this.buffer.length,
      ...this._stats,
      policy: { ...this.policy },
    };
  }

  /** Get the current policy (read-only copy). */
  getPolicy(): TickStoragePolicy {
    return { ...this.policy };
  }
}
