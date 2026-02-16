import { describe, it, expect, vi } from 'vitest';
import {
  handleCandleFinalized,
  handleCandleHistoryChunk,
  handleGetCandleDBStats,
  type CandleRepo,
  type CandleDatasetRepo,
  type CandleHandlerDeps,
} from './candle-handlers';

// ============================================================
// Mocks
// ============================================================

function makeMockCandleRepo(): CandleRepo {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    bulkAdd: vi.fn().mockResolvedValue(5),
    count: vi.fn().mockResolvedValue(100),
    getStats: vi.fn().mockResolvedValue({
      totalCandles: 500,
      tickers: [{ ticker: 'EURUSD_OTC', interval: 60, count: 500 }],
      oldestTimestamp: 1000,
      newestTimestamp: 9000,
    }),
  };
}

function makeMockDatasetRepo(): CandleDatasetRepo {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([
      {
        id: 1,
        ticker: 'EURUSD_OTC',
        interval: 60,
        startTime: 1000,
        endTime: 9000,
        candleCount: 500,
        source: 'history',
        lastUpdated: Date.now(),
      },
    ]),
  };
}

function makeDeps(overrides: Partial<CandleHandlerDeps> = {}): CandleHandlerDeps {
  return {
    candleRepo: makeMockCandleRepo(),
    datasetRepo: makeMockDatasetRepo(),
    ...overrides,
  };
}

// ============================================================
// handleCandleFinalized
// ============================================================

describe('handleCandleFinalized', () => {
  it('should save a single candle to DB', async () => {
    const deps = makeDeps();
    const result = await handleCandleFinalized(
      {
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 5000,
        open: 1.1,
        high: 1.2,
        low: 1.0,
        close: 1.15,
        volume: 42,
        source: 'websocket',
      },
      deps,
    );

    expect(result.success).toBe(true);
    expect(deps.candleRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 5000,
        open: 1.1,
        high: 1.2,
        low: 1.0,
        close: 1.15,
        volume: 42,
        source: 'websocket',
      }),
    );
  });

  it('should default source to websocket when not provided', async () => {
    const deps = makeDeps();
    await handleCandleFinalized(
      {
        ticker: 'BTCUSDT',
        interval: 300,
        timestamp: 6000,
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
      },
      deps,
    );

    expect(deps.candleRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
      }),
    );
  });
});

// ============================================================
// handleCandleHistoryChunk
// ============================================================

describe('handleCandleHistoryChunk', () => {
  it('should bulk-add valid candles and update dataset metadata', async () => {
    const deps = makeDeps();
    const candles = [
      { timestamp: 1000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 },
      { timestamp: 2000, open: 1.15, high: 1.25, low: 1.05, close: 1.2, volume: 20 },
      { timestamp: 3000, open: 1.2, high: 1.3, low: 1.1, close: 1.25, volume: 30 },
    ];

    const result = await handleCandleHistoryChunk(
      {
        symbol: 'EURUSD_OTC',
        interval: 60,
        candles,
        source: 'history',
        isFinal: true,
      },
      deps,
    );

    expect(result.success).toBe(true);
    expect(result.added).toBe(5); // Mocked return value
    expect(deps.candleRepo.bulkAdd).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ ticker: 'EURUSD_OTC', timestamp: 1000 }),
        expect.objectContaining({ ticker: 'EURUSD_OTC', timestamp: 2000 }),
        expect.objectContaining({ ticker: 'EURUSD_OTC', timestamp: 3000 }),
      ]),
      'history',
    );

    // Dataset metadata should be updated
    expect(deps.datasetRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'EURUSD_OTC',
        interval: 60,
        startTime: 1000,
        endTime: 3000,
        candleCount: 100, // From mocked count()
        source: 'history',
      }),
    );
  });

  it('should skip empty candle arrays', async () => {
    const deps = makeDeps();
    const result = await handleCandleHistoryChunk(
      { symbol: 'EURUSD_OTC', interval: 60, candles: [] },
      deps,
    );

    expect(result.success).toBe(true);
    expect(result.added).toBe(0);
    expect(deps.candleRepo.bulkAdd).not.toHaveBeenCalled();
  });

  it('should filter out invalid candles (timestamp=0, open=0)', async () => {
    const deps = makeDeps();
    const candles = [
      { timestamp: 0, open: 1.1, high: 1.2, low: 1.0, close: 1.15 }, // Invalid: timestamp=0
      { timestamp: 1000, open: 0, high: 1.2, low: 1.0, close: 1.15 }, // Invalid: open=0
      { timestamp: 2000, open: 1.1, high: 1.2, low: 1.0, close: 0 }, // Invalid: close=0
      { timestamp: 3000, open: 1.1, high: 1.2, low: 1.0, close: 1.15 }, // Valid
    ];

    await handleCandleHistoryChunk({ symbol: 'EURUSD_OTC', interval: 60, candles }, deps);

    expect(deps.candleRepo.bulkAdd).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ timestamp: 3000 })]),
      'history',
    );
    // Only 1 valid candle should be passed
    const callArg = (deps.candleRepo.bulkAdd as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg).toHaveLength(1);
  });

  it('should compute min/max timestamps correctly with loop (no Math.min/max spread)', async () => {
    const deps = makeDeps();
    // Generate a large number of candles to verify we don't hit stack overflow
    const candles = Array.from({ length: 2000 }, (_, i) => ({
      timestamp: 1000 + i * 60,
      open: 1.1 + i * 0.001,
      high: 1.2 + i * 0.001,
      low: 1.0 + i * 0.001,
      close: 1.15 + i * 0.001,
    }));

    await handleCandleHistoryChunk(
      { symbol: 'EURUSD_OTC', interval: 60, candles, isFinal: true },
      deps,
    );

    expect(deps.datasetRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: 1000, // First candle
        endTime: 1000 + 1999 * 60, // Last candle
      }),
    );
  });

  it('should default source to history when not provided', async () => {
    const deps = makeDeps();
    await handleCandleHistoryChunk(
      {
        symbol: 'EURUSD_OTC',
        interval: 60,
        candles: [{ timestamp: 1000, open: 1.1, high: 1.2, low: 1.0, close: 1.15 }],
      },
      deps,
    );

    expect(deps.candleRepo.bulkAdd).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ source: 'history' })]),
      'history',
    );
  });
});

// ============================================================
// handleGetCandleDBStats
// ============================================================

describe('handleGetCandleDBStats', () => {
  it('should return both candle stats and dataset metadata', async () => {
    const deps = makeDeps();
    const result = await handleGetCandleDBStats(deps);

    expect(result.candles).toEqual({
      totalCandles: 500,
      tickers: [{ ticker: 'EURUSD_OTC', interval: 60, count: 500 }],
      oldestTimestamp: 1000,
      newestTimestamp: 9000,
    });

    expect(result.datasets).toHaveLength(1);
    expect(result.datasets[0]).toEqual(
      expect.objectContaining({
        ticker: 'EURUSD_OTC',
        candleCount: 500,
      }),
    );
  });

  it('should call both repos in parallel', async () => {
    const deps = makeDeps();
    await handleGetCandleDBStats(deps);

    expect(deps.candleRepo.getStats).toHaveBeenCalledTimes(1);
    expect(deps.datasetRepo.getAll).toHaveBeenCalledTimes(1);
  });
});
