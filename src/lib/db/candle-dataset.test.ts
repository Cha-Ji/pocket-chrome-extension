import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, CandleRepository, CandleDatasetRepository } from './index';

describe('CandleDatasetRepository — candleCount total (P1-1)', () => {
  beforeEach(async () => {
    await db.candles.clear();
    await db.candleDatasets.clear();
  });
  afterEach(async () => {
    await db.candles.clear();
    await db.candleDatasets.clear();
  });

  it('should store candleCount as total when passed actual total', async () => {
    const symbol = 'EURUSD_OTC';
    const interval = 60;

    // Insert some candles
    for (let i = 0; i < 5; i++) {
      await CandleRepository.add({
        ticker: symbol,
        interval,
        timestamp: 1000000 + i * 60000,
        open: 1.08,
        high: 1.09,
        low: 1.07,
        close: 1.085,
        volume: 100,
        source: 'history',
      });
    }

    const actualCount = await CandleRepository.count(symbol, interval);
    await CandleDatasetRepository.upsert({
      ticker: symbol,
      interval,
      startTime: 1000000,
      endTime: 1000000 + 4 * 60000,
      candleCount: actualCount,
      source: 'history',
      lastUpdated: Date.now(),
    });

    const ds = await CandleDatasetRepository.get(symbol, interval);
    expect(ds).toBeDefined();
    expect(ds!.candleCount).toBe(5); // total, not delta
  });

  it('should maintain total candleCount after second history insert (P1-1)', async () => {
    const symbol = 'GBPUSD_OTC';
    const interval = 60;

    // First batch: 3 candles
    for (let i = 0; i < 3; i++) {
      await CandleRepository.add({
        ticker: symbol,
        interval,
        timestamp: 1000000 + i * 60000,
        open: 1.26,
        high: 1.27,
        low: 1.25,
        close: 1.265,
        volume: 50,
        source: 'history',
      });
    }

    let total = await CandleRepository.count(symbol, interval);
    await CandleDatasetRepository.upsert({
      ticker: symbol,
      interval,
      startTime: 1000000,
      endTime: 1000000 + 2 * 60000,
      candleCount: total,
      source: 'history',
      lastUpdated: Date.now(),
    });

    let ds = await CandleDatasetRepository.get(symbol, interval);
    expect(ds!.candleCount).toBe(3);

    // Second batch: 4 more candles (non-overlapping timestamps)
    for (let i = 0; i < 4; i++) {
      await CandleRepository.add({
        ticker: symbol,
        interval,
        timestamp: 2000000 + i * 60000,
        open: 1.27,
        high: 1.28,
        low: 1.26,
        close: 1.275,
        volume: 60,
        source: 'history',
      });
    }

    total = await CandleRepository.count(symbol, interval);
    await CandleDatasetRepository.upsert({
      ticker: symbol,
      interval,
      startTime: 2000000,
      endTime: 2000000 + 3 * 60000,
      candleCount: total,
      source: 'history',
      lastUpdated: Date.now(),
    });

    ds = await CandleDatasetRepository.get(symbol, interval);
    expect(ds!.candleCount).toBe(7); // 3 + 4 = total 7, not just 4 (the delta)
    expect(ds!.startTime).toBe(1000000); // merged min
    expect(ds!.endTime).toBe(2000000 + 3 * 60000); // merged max
  });

  it('upsert with different source keeps single record per ticker+interval (Option 2)', async () => {
    const symbol = 'USDJPY_OTC';
    const interval = 60;

    // First upsert with 'history' source
    await CandleDatasetRepository.upsert({
      ticker: symbol,
      interval,
      startTime: 1000,
      endTime: 5000,
      candleCount: 10,
      source: 'history',
      lastUpdated: Date.now(),
    });

    // Second upsert with 'websocket' source — same ticker+interval
    await CandleDatasetRepository.upsert({
      ticker: symbol,
      interval,
      startTime: 4000,
      endTime: 8000,
      candleCount: 15,
      source: 'websocket',
      lastUpdated: Date.now(),
    });

    // Should have exactly 1 record (not 2)
    const all = await CandleDatasetRepository.getByTicker(symbol);
    expect(all).toHaveLength(1);

    const ds = all[0];
    expect(ds.source).toBe('websocket'); // last source wins
    expect(ds.startTime).toBe(1000); // merged min
    expect(ds.endTime).toBe(8000); // merged max
    expect(ds.candleCount).toBe(15); // latest total
  });

  it('should merge startTime/endTime across multiple inserts', async () => {
    const symbol = 'AAPL_OTC';
    const interval = 60;

    await CandleDatasetRepository.upsert({
      ticker: symbol,
      interval,
      startTime: 5000,
      endTime: 10000,
      candleCount: 10,
      source: 'history',
      lastUpdated: Date.now(),
    });

    await CandleDatasetRepository.upsert({
      ticker: symbol,
      interval,
      startTime: 3000,
      endTime: 8000,
      candleCount: 15,
      source: 'history',
      lastUpdated: Date.now(),
    });

    const ds = await CandleDatasetRepository.get(symbol, interval);
    expect(ds!.startTime).toBe(3000); // min(5000, 3000)
    expect(ds!.endTime).toBe(10000); // max(10000, 8000)
    expect(ds!.candleCount).toBe(15); // latest total
  });
});
