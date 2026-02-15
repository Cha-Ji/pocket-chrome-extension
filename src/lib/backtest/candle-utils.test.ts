// ============================================================
// Tests for Candle Data Utilities
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  detectInterval,
  isValidCandle,
  deduplicateCandles,
  detectGaps,
  analyzeCandles,
  fillGaps,
  preprocessCandles,
  splitAtGaps,
} from './candle-utils';
import { Candle } from './types';

// Helper: generate contiguous candles
function makeCandles(
  count: number,
  intervalMs: number = 60000,
  startTime: number = 1700000000000,
  startPrice: number = 100,
): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price + (Math.random() - 0.5) * 2;
    candles.push({
      timestamp: startTime + i * intervalMs,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 1000,
    });
    price = close;
  }
  return candles;
}

// Helper: remove candles at specific indices to create gaps
function removeIndices(candles: Candle[], indices: number[]): Candle[] {
  return candles.filter((_, i) => !indices.includes(i));
}

describe('detectInterval', () => {
  it('should detect 1-minute interval', () => {
    const candles = makeCandles(100, 60000);
    expect(detectInterval(candles)).toBe(60000);
  });

  it('should detect 5-minute interval', () => {
    const candles = makeCandles(100, 300000);
    expect(detectInterval(candles)).toBe(300000);
  });

  it('should return default for single candle', () => {
    const candles = makeCandles(1);
    expect(detectInterval(candles)).toBe(60000);
  });

  it('should detect interval even with some gaps', () => {
    const candles = makeCandles(100, 60000);
    // Remove a few candles (creating minor gaps)
    const gapped = removeIndices(candles, [10, 20, 30]);
    // The most frequent interval should still be 60000
    expect(detectInterval(gapped)).toBe(60000);
  });
});

describe('isValidCandle', () => {
  it('should accept valid candle', () => {
    expect(
      isValidCandle({
        timestamp: 1700000000000,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
      }),
    ).toBe(true);
  });

  it('should reject candle with NaN price', () => {
    expect(
      isValidCandle({
        timestamp: 1700000000000,
        open: NaN,
        high: 105,
        low: 95,
        close: 102,
      }),
    ).toBe(false);
  });

  it('should reject candle with negative price', () => {
    expect(
      isValidCandle({
        timestamp: 1700000000000,
        open: -100,
        high: 105,
        low: 95,
        close: 102,
      }),
    ).toBe(false);
  });

  it('should reject candle with zero price', () => {
    expect(
      isValidCandle({
        timestamp: 1700000000000,
        open: 0,
        high: 105,
        low: 95,
        close: 102,
      }),
    ).toBe(false);
  });

  it('should reject candle where low > high', () => {
    expect(
      isValidCandle({
        timestamp: 1700000000000,
        open: 100,
        high: 95,
        low: 105,
        close: 102,
      }),
    ).toBe(false);
  });

  it('should reject candle where high < max(open, close)', () => {
    expect(
      isValidCandle({
        timestamp: 1700000000000,
        open: 100,
        high: 99, // less than open
        low: 95,
        close: 98,
      }),
    ).toBe(false);
  });

  it('should reject candle where low > min(open, close)', () => {
    expect(
      isValidCandle({
        timestamp: 1700000000000,
        open: 100,
        high: 105,
        low: 101, // greater than close
        close: 99,
      }),
    ).toBe(false);
  });

  it('should reject candle with invalid timestamp', () => {
    expect(
      isValidCandle({
        timestamp: -1,
        open: 100,
        high: 105,
        low: 95,
        close: 102,
      }),
    ).toBe(false);
  });

  it('should accept candle where open == close == high == low (doji)', () => {
    expect(
      isValidCandle({
        timestamp: 1700000000000,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
      }),
    ).toBe(true);
  });
});

describe('deduplicateCandles', () => {
  it('should remove duplicate timestamps, keeping last occurrence', () => {
    const candles: Candle[] = [
      { timestamp: 1000, open: 10, high: 11, low: 9, close: 10.5 },
      { timestamp: 1000, open: 10.5, high: 12, low: 10, close: 11 },
      { timestamp: 2000, open: 11, high: 12, low: 10, close: 11.5 },
    ];
    const result = deduplicateCandles(candles);
    expect(result.length).toBe(2);
    expect(result[0].close).toBe(11); // kept the second one
    expect(result[1].timestamp).toBe(2000);
  });

  it('should not modify array with no duplicates', () => {
    const candles = makeCandles(5);
    const result = deduplicateCandles(candles);
    expect(result.length).toBe(5);
  });

  it('should handle empty array', () => {
    expect(deduplicateCandles([])).toEqual([]);
  });

  it('should handle single candle', () => {
    const candles = makeCandles(1);
    const result = deduplicateCandles(candles);
    expect(result.length).toBe(1);
  });
});

describe('detectGaps', () => {
  it('should detect no gaps in contiguous data', () => {
    const candles = makeCandles(100, 60000);
    const gaps = detectGaps(candles, 60000);
    expect(gaps.length).toBe(0);
  });

  it('should detect a single gap', () => {
    const candles = makeCandles(100, 60000);
    // Remove candles 20-24 (5 candles gap)
    const gapped = removeIndices(candles, [20, 21, 22, 23, 24]);
    const gaps = detectGaps(gapped, 60000);
    expect(gaps.length).toBe(1);
    expect(gaps[0].missingCount).toBe(5);
  });

  it('should detect multiple gaps', () => {
    const candles = makeCandles(100, 60000);
    // Create two gaps
    const gapped = removeIndices(candles, [10, 11, 12, 50, 51, 52, 53]);
    const gaps = detectGaps(gapped, 60000);
    expect(gaps.length).toBe(2);
    expect(gaps[0].missingCount).toBe(3);
    expect(gaps[1].missingCount).toBe(4);
  });

  it('should auto-detect interval when not specified', () => {
    const candles = makeCandles(100, 60000);
    const gapped = removeIndices(candles, [50, 51, 52]);
    const gaps = detectGaps(gapped); // no interval specified
    expect(gaps.length).toBe(1);
    expect(gaps[0].missingCount).toBe(3);
  });

  it('should handle empty array', () => {
    expect(detectGaps([])).toEqual([]);
  });

  it('should handle single candle', () => {
    expect(detectGaps(makeCandles(1))).toEqual([]);
  });

  it('should include correct before/after timestamps', () => {
    const candles = makeCandles(10, 60000, 1700000000000);
    // Remove index 5
    const gapped = removeIndices(candles, [5]);
    const gaps = detectGaps(gapped, 60000);
    expect(gaps.length).toBe(1);
    expect(gaps[0].beforeTimestamp).toBe(1700000000000 + 4 * 60000);
    expect(gaps[0].afterTimestamp).toBe(1700000000000 + 6 * 60000);
  });
});

describe('analyzeCandles', () => {
  it('should analyze clean data with full coverage', () => {
    const candles = makeCandles(100, 60000);
    const analysis = analyzeCandles(candles, 60000);
    expect(analysis.totalCandles).toBe(100);
    expect(analysis.gapCount).toBe(0);
    expect(analysis.totalMissingCandles).toBe(0);
    expect(analysis.duplicatesRemoved).toBe(0);
    expect(analysis.invalidRemoved).toBe(0);
    expect(analysis.coveragePercent).toBeCloseTo(100, 0);
  });

  it('should report gaps correctly', () => {
    const candles = makeCandles(100, 60000);
    const gapped = removeIndices(candles, [20, 21, 22]);
    const analysis = analyzeCandles(gapped, 60000);
    expect(analysis.totalCandles).toBe(97);
    expect(analysis.gapCount).toBe(1);
    expect(analysis.totalMissingCandles).toBe(3);
    expect(analysis.coveragePercent).toBeLessThan(100);
  });

  it('should detect and report invalid candles', () => {
    const candles = makeCandles(10, 60000);
    candles[3] = { ...candles[3], open: NaN };
    candles[7] = { ...candles[7], low: -5 };
    const analysis = analyzeCandles(candles, 60000);
    expect(analysis.invalidRemoved).toBe(2);
    expect(analysis.totalCandles).toBe(8);
  });

  it('should detect and report duplicates', () => {
    const candles = makeCandles(10, 60000);
    // Create a valid duplicate (exact copy preserves OHLC integrity)
    const withDupes = [...candles, { ...candles[5] }];
    // Sort to put duplicate next to original
    withDupes.sort((a, b) => a.timestamp - b.timestamp);
    const analysis = analyzeCandles(withDupes, 60000);
    expect(analysis.duplicatesRemoved).toBe(1);
    expect(analysis.totalCandles).toBe(10);
  });
});

describe('fillGaps', () => {
  it('should not modify data without gaps', () => {
    const candles = makeCandles(10, 60000);
    const filled = fillGaps(candles, 60000);
    expect(filled.length).toBe(10);
  });

  it('should fill a single gap with interpolated candles', () => {
    const candles = makeCandles(10, 60000, 1700000000000, 100);
    // Remove indices 4, 5, 6 (3 candle gap)
    const gapped = removeIndices(candles, [4, 5, 6]);
    expect(gapped.length).toBe(7);

    const filled = fillGaps(gapped, 60000);
    expect(filled.length).toBe(10);

    // Check that timestamps are now contiguous
    for (let i = 1; i < filled.length; i++) {
      expect(filled[i].timestamp - filled[i - 1].timestamp).toBe(60000);
    }
  });

  it('should fill multiple gaps', () => {
    const candles = makeCandles(20, 60000, 1700000000000, 100);
    // Two gaps
    const gapped = removeIndices(candles, [5, 6, 14, 15, 16]);
    expect(gapped.length).toBe(15);

    const filled = fillGaps(gapped, 60000);
    expect(filled.length).toBe(20);

    // Verify contiguous timestamps
    for (let i = 1; i < filled.length; i++) {
      expect(filled[i].timestamp - filled[i - 1].timestamp).toBe(60000);
    }
  });

  it('should produce synthetic candles with zero volume', () => {
    const candles = makeCandles(10, 60000, 1700000000000, 100);
    const gapped = removeIndices(candles, [5]);
    const filled = fillGaps(gapped, 60000);

    // Find the synthetic candle (index 5)
    const synthetic = filled[5];
    expect(synthetic.volume).toBe(0);
  });

  it('should handle empty array', () => {
    expect(fillGaps([])).toEqual([]);
  });
});

describe('splitAtGaps', () => {
  it('should return single segment for contiguous data', () => {
    const candles = makeCandles(100, 60000);
    const segments = splitAtGaps(candles, 60000, 5);
    expect(segments.length).toBe(1);
    expect(segments[0].length).toBe(100);
  });

  it('should split at large gap', () => {
    const candles = makeCandles(100, 60000);
    // Remove 15 candles in the middle (large gap)
    const indicesToRemove = Array.from({ length: 15 }, (_, i) => 40 + i);
    const gapped = removeIndices(candles, indicesToRemove);

    const segments = splitAtGaps(gapped, 60000, 10);
    expect(segments.length).toBe(2);
    // Sorted by size, largest first
    expect(segments[0].length).toBeGreaterThanOrEqual(segments[1].length);
  });

  it('should not split at small gaps within threshold', () => {
    const candles = makeCandles(100, 60000);
    // Remove 3 candles (within maxGapCandles=10 threshold)
    const gapped = removeIndices(candles, [50, 51, 52]);
    const segments = splitAtGaps(gapped, 60000, 10);
    expect(segments.length).toBe(1);
  });

  it('should create multiple segments for multiple large gaps', () => {
    const candles = makeCandles(100, 60000);
    // Two large gaps
    const gap1 = Array.from({ length: 12 }, (_, i) => 20 + i);
    const gap2 = Array.from({ length: 12 }, (_, i) => 60 + i);
    const gapped = removeIndices(candles, [...gap1, ...gap2]);

    const segments = splitAtGaps(gapped, 60000, 10);
    expect(segments.length).toBe(3);
  });

  it('should handle empty array', () => {
    expect(splitAtGaps([], 60000)).toEqual([]);
  });
});

describe('preprocessCandles', () => {
  it('should sort, validate, and deduplicate with skip strategy', () => {
    const candles = makeCandles(100, 60000);
    // Shuffle
    const shuffled = [...candles].sort(() => Math.random() - 0.5);

    const result = preprocessCandles(shuffled, { gapStrategy: 'skip' });
    expect(result.candles.length).toBe(100);

    // Verify sorted
    for (let i = 1; i < result.candles.length; i++) {
      expect(result.candles[i].timestamp).toBeGreaterThan(result.candles[i - 1].timestamp);
    }
  });

  it('should fill gaps with fill strategy', () => {
    const candles = makeCandles(100, 60000);
    const gapped = removeIndices(candles, [30, 31, 32]);

    const result = preprocessCandles(gapped, {
      gapStrategy: 'fill',
      expectedIntervalMs: 60000,
    });

    expect(result.candles.length).toBe(100);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.analysis.gapCount).toBe(1);
  });

  it('should split data with split strategy', () => {
    const candles = makeCandles(100, 60000);
    // Large gap
    const indicesToRemove = Array.from({ length: 20 }, (_, i) => 40 + i);
    const gapped = removeIndices(candles, indicesToRemove);

    const result = preprocessCandles(gapped, {
      gapStrategy: 'split',
      expectedIntervalMs: 60000,
      maxGapCandles: 10,
    });

    expect(result.segments.length).toBe(2);
    // candles should be the largest segment
    expect(result.candles.length).toBe(Math.max(...result.segments.map((s) => s.length)));
  });

  it('should remove invalid candles', () => {
    const candles = makeCandles(100, 60000);
    candles[10] = { ...candles[10], open: NaN };
    candles[20] = { ...candles[20], high: -1 };

    const result = preprocessCandles(candles, { removeInvalid: true });
    expect(result.analysis.invalidRemoved).toBe(2);
    expect(result.candles.length).toBe(98);
  });

  it('should remove duplicates', () => {
    const candles = makeCandles(100, 60000);
    const withDupes = [...candles, { ...candles[50] }];

    const result = preprocessCandles(withDupes, { removeDuplicates: true });
    expect(result.analysis.duplicatesRemoved).toBe(1);
  });

  it('should produce warnings for gaps', () => {
    const candles = makeCandles(100, 60000);
    const gapped = removeIndices(candles, [50, 51, 52]);

    const result = preprocessCandles(gapped, { gapStrategy: 'skip' });
    const hasGapWarning = result.warnings.some((w) => w.includes('gap'));
    expect(hasGapWarning).toBe(true);
  });

  it('should work with default options', () => {
    const candles = makeCandles(100, 60000);
    const result = preprocessCandles(candles);
    expect(result.candles.length).toBe(100);
    expect(result.analysis.gapCount).toBe(0);
  });
});

describe('Integration: BacktestEngine with gapped data', () => {
  it('should report data quality in backtest results', async () => {
    // This is a smoke test — detailed engine tests are in backtest.test.ts
    const { BacktestEngine } = await import('./engine');
    const { RSIOverboughtOversold } = await import('./strategies/rsi-strategy');

    const engine = new BacktestEngine();
    engine.registerStrategy(RSIOverboughtOversold);

    const candles = makeCandles(200, 60000);
    // Remove some candles to create a gap
    const gapped = removeIndices(candles, [100, 101, 102]);

    const result = engine.run(
      {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 1000,
        betAmount: 10,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60,
        strategyId: RSIOverboughtOversold.id,
        strategyParams: { period: 14, overbought: 70, oversold: 30 },
        gapStrategy: 'skip',
      },
      gapped,
    );

    expect(result.dataQuality).toBeDefined();
    expect(result.dataQuality!.gapCount).toBe(1);
    expect(result.dataQuality!.totalMissingCandles).toBe(3);
    expect(result.dataQuality!.gapStrategy).toBe('skip');
    expect(result.dataQuality!.coveragePercent).toBeLessThan(100);
  });
});
