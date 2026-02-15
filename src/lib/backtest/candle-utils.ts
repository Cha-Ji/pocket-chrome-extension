// ============================================================
// Candle Data Utilities
// ============================================================
// Gap detection, validation, deduplication, and preprocessing
// for real-world candle data with missing/irregular timestamps
// ============================================================

import { Candle } from './types';

/** Gap information between consecutive candles */
export interface CandleGap {
  /** Index of the candle BEFORE the gap (in sorted array) */
  beforeIndex: number;
  /** Index of the candle AFTER the gap (in sorted array) */
  afterIndex: number;
  /** Timestamp of candle before the gap */
  beforeTimestamp: number;
  /** Timestamp of candle after the gap */
  afterTimestamp: number;
  /** Number of expected candles missing */
  missingCount: number;
  /** Duration of the gap in ms */
  gapDurationMs: number;
}

/** Result of candle data analysis */
export interface CandleAnalysis {
  /** Total candles in the dataset */
  totalCandles: number;
  /** Detected candle interval in ms (most frequent interval) */
  detectedIntervalMs: number;
  /** Number of gaps found */
  gapCount: number;
  /** Total missing candles across all gaps */
  totalMissingCandles: number;
  /** Detailed gap information */
  gaps: CandleGap[];
  /** Number of duplicate timestamps removed */
  duplicatesRemoved: number;
  /** Number of invalid OHLC candles removed */
  invalidRemoved: number;
  /** Coverage percentage (actual candles / expected candles * 100) */
  coveragePercent: number;
  /** Time span from first to last candle in ms */
  timeSpanMs: number;
}

/**
 * Detect the most common interval between consecutive candles.
 * Uses frequency analysis to find the expected interval.
 */
export function detectInterval(candles: Candle[]): number {
  if (candles.length < 2) return 60000; // default 1min

  const intervals = new Map<number, number>();
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].timestamp - candles[i - 1].timestamp;
    if (diff > 0) {
      intervals.set(diff, (intervals.get(diff) || 0) + 1);
    }
  }

  if (intervals.size === 0) return 60000;

  // Return the most frequent interval
  let maxCount = 0;
  let bestInterval = 60000;
  for (const [interval, count] of intervals) {
    if (count > maxCount) {
      maxCount = count;
      bestInterval = interval;
    }
  }

  return bestInterval;
}

/**
 * Validate a single candle's OHLC data integrity.
 * Returns true if the candle has valid OHLC relationships.
 */
export function isValidCandle(candle: Candle): boolean {
  const { open, high, low, close, timestamp } = candle;

  // Check for NaN/Infinity
  if (!isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) {
    return false;
  }

  // Check positive prices
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
    return false;
  }

  // Check OHLC relationships: low <= min(open,close) and high >= max(open,close)
  if (low > Math.min(open, close) || high < Math.max(open, close)) {
    return false;
  }

  // Check low <= high
  if (low > high) {
    return false;
  }

  // Check valid timestamp
  if (!isFinite(timestamp) || timestamp <= 0) {
    return false;
  }

  return true;
}

/**
 * Remove duplicate candles (same timestamp), keeping the last occurrence.
 * Input must be sorted by timestamp.
 */
export function deduplicateCandles(sortedCandles: Candle[]): Candle[] {
  if (sortedCandles.length <= 1) return [...sortedCandles];

  const result: Candle[] = [sortedCandles[0]];
  for (let i = 1; i < sortedCandles.length; i++) {
    if (sortedCandles[i].timestamp !== sortedCandles[i - 1].timestamp) {
      result.push(sortedCandles[i]);
    } else {
      // Keep the later occurrence (overwrite)
      result[result.length - 1] = sortedCandles[i];
    }
  }

  return result;
}

/**
 * Detect gaps in candle data.
 * A gap is where the interval between consecutive candles exceeds
 * the expected interval by a tolerance factor.
 *
 * @param sortedCandles - Candles sorted by timestamp (oldest first)
 * @param expectedIntervalMs - Expected interval; auto-detected if 0
 * @param toleranceFactor - Gap threshold multiplier (default 1.5 = 50% over expected)
 */
export function detectGaps(
  sortedCandles: Candle[],
  expectedIntervalMs: number = 0,
  toleranceFactor: number = 1.5,
): CandleGap[] {
  if (sortedCandles.length < 2) return [];

  const interval = expectedIntervalMs > 0 ? expectedIntervalMs : detectInterval(sortedCandles);
  const threshold = interval * toleranceFactor;

  const gaps: CandleGap[] = [];
  for (let i = 1; i < sortedCandles.length; i++) {
    const diff = sortedCandles[i].timestamp - sortedCandles[i - 1].timestamp;
    if (diff > threshold) {
      const missingCount = Math.round(diff / interval) - 1;
      gaps.push({
        beforeIndex: i - 1,
        afterIndex: i,
        beforeTimestamp: sortedCandles[i - 1].timestamp,
        afterTimestamp: sortedCandles[i].timestamp,
        missingCount,
        gapDurationMs: diff,
      });
    }
  }

  return gaps;
}

/**
 * Analyze candle data for quality and gaps.
 */
export function analyzeCandles(candles: Candle[], expectedIntervalMs: number = 0): CandleAnalysis {
  // Sort
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

  // Remove invalid
  const valid = sorted.filter(isValidCandle);
  const invalidRemoved = sorted.length - valid.length;

  // Deduplicate
  const deduped = deduplicateCandles(valid);
  const duplicatesRemoved = valid.length - deduped.length;

  // Detect interval
  const interval = expectedIntervalMs > 0 ? expectedIntervalMs : detectInterval(deduped);

  // Detect gaps
  const gaps = detectGaps(deduped, interval);
  const totalMissingCandles = gaps.reduce((sum, g) => sum + g.missingCount, 0);

  // Calculate coverage
  const timeSpanMs =
    deduped.length >= 2 ? deduped[deduped.length - 1].timestamp - deduped[0].timestamp : 0;
  const expectedCandles = timeSpanMs > 0 ? Math.round(timeSpanMs / interval) + 1 : deduped.length;
  const coveragePercent = expectedCandles > 0 ? (deduped.length / expectedCandles) * 100 : 100;

  return {
    totalCandles: deduped.length,
    detectedIntervalMs: interval,
    gapCount: gaps.length,
    totalMissingCandles,
    gaps,
    duplicatesRemoved,
    invalidRemoved,
    coveragePercent: Math.min(100, coveragePercent),
    timeSpanMs,
  };
}

/**
 * Fill gaps with interpolated candles.
 * Uses linear interpolation between the candle before and after each gap.
 * Useful for indicators that assume contiguous data.
 *
 * @param sortedCandles - Candles sorted by timestamp (oldest first), already deduplicated
 * @param expectedIntervalMs - Expected interval; auto-detected if 0
 */
export function fillGaps(sortedCandles: Candle[], expectedIntervalMs: number = 0): Candle[] {
  if (sortedCandles.length < 2) return [...sortedCandles];

  const interval = expectedIntervalMs > 0 ? expectedIntervalMs : detectInterval(sortedCandles);

  const gaps = detectGaps(sortedCandles, interval);
  if (gaps.length === 0) return [...sortedCandles];

  const result: Candle[] = [];
  let lastInsertedIndex = -1;

  for (const gap of gaps) {
    // Copy candles from lastInsertedIndex+1 to beforeIndex (inclusive)
    for (let i = lastInsertedIndex + 1; i <= gap.beforeIndex; i++) {
      result.push(sortedCandles[i]);
    }

    // Interpolate missing candles
    const before = sortedCandles[gap.beforeIndex];
    const after = sortedCandles[gap.afterIndex];
    const steps = gap.missingCount + 1; // total intervals from before to after

    for (let j = 1; j <= gap.missingCount; j++) {
      const ratio = j / steps;
      const timestamp = before.timestamp + j * interval;
      const open = before.close + (after.open - before.close) * ((j - 1) / steps);
      const close = before.close + (after.open - before.close) * ratio;
      const high = Math.max(open, close) * (1 + 0.0001); // minimal spread
      const low = Math.min(open, close) * (1 - 0.0001);

      result.push({
        timestamp,
        open,
        high,
        low,
        close,
        volume: 0, // synthetic candles have no real volume
      });
    }

    lastInsertedIndex = gap.beforeIndex;
  }

  // Copy remaining candles
  for (let i = lastInsertedIndex + 1; i < sortedCandles.length; i++) {
    result.push(sortedCandles[i]);
  }

  return result;
}

/** Strategy for handling gaps in candle data */
export type GapStrategy = 'skip' | 'fill' | 'split';

/** Options for preprocessing candle data */
export interface PreprocessOptions {
  /** How to handle gaps: 'skip' (ignore), 'fill' (interpolate), 'split' (break into segments) */
  gapStrategy: GapStrategy;
  /** Expected candle interval in ms. 0 = auto-detect. */
  expectedIntervalMs: number;
  /** Maximum allowed gap (in number of candles) before splitting segments. Only for 'split' strategy. */
  maxGapCandles: number;
  /** Remove candles with invalid OHLC data */
  removeInvalid: boolean;
  /** Remove duplicate timestamps */
  removeDuplicates: boolean;
}

const DEFAULT_PREPROCESS_OPTIONS: PreprocessOptions = {
  gapStrategy: 'skip',
  expectedIntervalMs: 0,
  maxGapCandles: 10,
  removeInvalid: true,
  removeDuplicates: true,
};

/** Result of preprocessing candle data */
export interface PreprocessResult {
  /** Preprocessed candles (single array for 'skip'/'fill', largest segment for 'split') */
  candles: Candle[];
  /** All segments when using 'split' strategy */
  segments: Candle[][];
  /** Analysis of the original data */
  analysis: CandleAnalysis;
  /** Warnings generated during preprocessing */
  warnings: string[];
}

/**
 * Preprocess candle data for backtesting.
 * Sorts, validates, deduplicates, and handles gaps based on the chosen strategy.
 */
export function preprocessCandles(
  rawCandles: Candle[],
  options: Partial<PreprocessOptions> = {},
): PreprocessResult {
  const opts = { ...DEFAULT_PREPROCESS_OPTIONS, ...options };
  const warnings: string[] = [];

  // 1. Sort by timestamp
  let candles = [...rawCandles].sort((a, b) => a.timestamp - b.timestamp);

  // 2. Remove invalid candles
  let invalidRemovedCount = 0;
  if (opts.removeInvalid) {
    const beforeCount = candles.length;
    candles = candles.filter(isValidCandle);
    invalidRemovedCount = beforeCount - candles.length;
    if (invalidRemovedCount > 0) {
      warnings.push(`Removed ${invalidRemovedCount} invalid candle(s) with bad OHLC data`);
    }
  }

  // 3. Deduplicate
  let duplicatesRemovedCount = 0;
  if (opts.removeDuplicates) {
    const beforeCount = candles.length;
    candles = deduplicateCandles(candles);
    duplicatesRemovedCount = beforeCount - candles.length;
    if (duplicatesRemovedCount > 0) {
      warnings.push(`Removed ${duplicatesRemovedCount} duplicate timestamp(s)`);
    }
  }

  // 4. Analyze the cleaned data, then patch in removal counts from steps 2-3
  const analysis = analyzeCandles(candles, opts.expectedIntervalMs);
  analysis.invalidRemoved = invalidRemovedCount;
  analysis.duplicatesRemoved = duplicatesRemovedCount;
  const interval =
    opts.expectedIntervalMs > 0 ? opts.expectedIntervalMs : analysis.detectedIntervalMs;

  if (analysis.gapCount > 0) {
    warnings.push(
      `Detected ${analysis.gapCount} gap(s) with ${analysis.totalMissingCandles} missing candle(s). ` +
        `Coverage: ${analysis.coveragePercent.toFixed(1)}%`,
    );
  }

  // 5. Handle gaps
  let resultCandles: Candle[];
  let segments: Candle[][] = [];

  switch (opts.gapStrategy) {
    case 'fill':
      resultCandles = fillGaps(candles, interval);
      segments = [resultCandles];
      if (analysis.totalMissingCandles > 0) {
        warnings.push(`Filled ${analysis.totalMissingCandles} candle(s) with linear interpolation`);
      }
      break;

    case 'split':
      segments = splitAtGaps(candles, interval, opts.maxGapCandles);
      if (segments.length > 1) {
        warnings.push(
          `Split data into ${segments.length} contiguous segments. ` +
            `Largest segment: ${segments[0].length} candles`,
        );
      }
      // Use the largest segment for backtesting
      resultCandles = segments[0] || [];
      break;

    case 'skip':
    default:
      resultCandles = candles;
      segments = [candles];
      break;
  }

  return {
    candles: resultCandles,
    segments,
    analysis,
    warnings,
  };
}

/**
 * Split candle data into contiguous segments at large gaps.
 * Returns segments sorted by size (largest first).
 *
 * @param sortedCandles - Candles sorted by timestamp
 * @param intervalMs - Expected candle interval
 * @param maxGapCandles - Maximum allowed missing candles before splitting
 */
export function splitAtGaps(
  sortedCandles: Candle[],
  intervalMs: number,
  maxGapCandles: number = 10,
): Candle[][] {
  if (sortedCandles.length === 0) return [];
  if (sortedCandles.length === 1) return [[...sortedCandles]];

  const segments: Candle[][] = [];
  let currentSegment: Candle[] = [sortedCandles[0]];

  for (let i = 1; i < sortedCandles.length; i++) {
    const diff = sortedCandles[i].timestamp - sortedCandles[i - 1].timestamp;
    const missingCandles = Math.round(diff / intervalMs) - 1;

    if (missingCandles > maxGapCandles) {
      // Large gap — start new segment
      segments.push(currentSegment);
      currentSegment = [sortedCandles[i]];
    } else {
      currentSegment.push(sortedCandles[i]);
    }
  }

  // Push the last segment
  segments.push(currentSegment);

  // Sort segments by size (largest first)
  segments.sort((a, b) => b.length - a.length);

  return segments;
}
