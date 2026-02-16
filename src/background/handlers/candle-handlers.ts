// ============================================================
// Background Candle Handlers (single DB owner for candle data)
// ============================================================
// All candle writes go through Background to ensure a single
// IndexedDB writer for candle data — preventing origin/ownership
// ambiguity between Content Script and Side Panel.
// ============================================================

import type { MessagePayloadMap } from '../../lib/types';
import type { CandleSource, StoredCandle, CandleDataset } from '../../lib/db';

/** Minimal CandleRepository interface for DI/testing */
export interface CandleRepo {
  add(candle: Omit<StoredCandle, 'createdAt'>): Promise<void>;
  bulkAdd(candles: Omit<StoredCandle, 'createdAt'>[], source?: CandleSource): Promise<number>;
  count(ticker?: string, interval?: number): Promise<number>;
  getStats(): Promise<{
    totalCandles: number;
    tickers: { ticker: string; interval: number; count: number }[];
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }>;
}

/** Minimal CandleDatasetRepository interface for DI/testing */
export interface CandleDatasetRepo {
  upsert(dataset: Omit<CandleDataset, 'id'>): Promise<void>;
  getAll(): Promise<CandleDataset[]>;
}

/** Dependencies injected by background/index.ts */
export interface CandleHandlerDeps {
  candleRepo: CandleRepo;
  datasetRepo: CandleDatasetRepo;
}

// ============================================================
// CANDLE_FINALIZED handler — single confirmed candle
// ============================================================

export async function handleCandleFinalized(
  payload: MessagePayloadMap['CANDLE_FINALIZED'],
  deps: CandleHandlerDeps,
): Promise<{ success: boolean }> {
  await deps.candleRepo.add({
    ticker: payload.ticker,
    interval: payload.interval,
    timestamp: payload.timestamp,
    open: payload.open,
    high: payload.high,
    low: payload.low,
    close: payload.close,
    volume: payload.volume,
    source: (payload.source as CandleSource) || 'websocket',
  });

  return { success: true };
}

// ============================================================
// CANDLE_HISTORY_CHUNK handler — batch of history candles
// ============================================================

export async function handleCandleHistoryChunk(
  payload: MessagePayloadMap['CANDLE_HISTORY_CHUNK'],
  deps: CandleHandlerDeps,
): Promise<{ success: boolean; added: number }> {
  const { symbol, interval, candles, source } = payload;

  if (!candles || candles.length === 0) {
    return { success: true, added: 0 };
  }

  // Filter out invalid candles
  const validCandles = candles.filter((c) => c.timestamp > 0 && c.open > 0 && c.close > 0);
  if (validCandles.length === 0) {
    return { success: true, added: 0 };
  }

  const storedCandles: Omit<StoredCandle, 'createdAt'>[] = validCandles.map((c) => ({
    ticker: symbol,
    interval,
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume ?? 0,
    source: (source as CandleSource) || 'history',
  }));

  const added = await deps.candleRepo.bulkAdd(storedCandles, (source as CandleSource) || 'history');

  // Update dataset metadata on final chunk (or always, since upsert is idempotent)
  if (payload.isFinal !== false) {
    // Compute min/max timestamps using a loop (safe for large arrays)
    let minTs = validCandles[0].timestamp;
    let maxTs = validCandles[0].timestamp;
    for (let i = 1; i < validCandles.length; i++) {
      const ts = validCandles[i].timestamp;
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
    }

    // Use actual DB count for accurate metadata
    const actualTotal = await deps.candleRepo.count(symbol, interval);

    await deps.datasetRepo.upsert({
      ticker: symbol,
      interval,
      startTime: minTs,
      endTime: maxTs,
      candleCount: actualTotal,
      source: (source as CandleSource) || 'history',
      lastUpdated: Date.now(),
    });
  }

  return { success: true, added };
}

// ============================================================
// GET_CANDLE_DB_STATS handler — stats for monitoring dashboard
// ============================================================

export interface CandleDBStatsResponse {
  candles: {
    totalCandles: number;
    tickers: { ticker: string; interval: number; count: number }[];
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  };
  datasets: CandleDataset[];
}

export async function handleGetCandleDBStats(
  deps: CandleHandlerDeps,
): Promise<CandleDBStatsResponse> {
  const [candleStats, datasets] = await Promise.all([
    deps.candleRepo.getStats(),
    deps.datasetRepo.getAll(),
  ]);

  return {
    candles: candleStats,
    datasets,
  };
}
