// ============================================================
// Technical Indicator Types
// ============================================================

import type { Candle } from '../backtest/types';

// Re-export Candle for convenience
export type { Candle };

/**
 * OHLCV data arrays for indicator calculations
 */
export interface OHLCVArrays {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes?: number[];
}

/**
 * Oscillator result with value between fixed bounds (e.g., 0-100)
 */
export interface OscillatorResult {
  value: number;
}

/**
 * Stochastic oscillator result
 */
export interface StochasticResult {
  k: number;
  d: number;
}

/**
 * MACD indicator result
 */
export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * Bollinger Bands result
 */
export interface BollingerBandsResult {
  upper: number;
  middle: number;
  lower: number;
}

/**
 * ADX indicator result
 */
export interface ADXResult {
  adx: number;
  plusDI: number;
  minusDI: number;
}

/**
 * Stochastic RSI result
 */
export interface StochasticRSIResult {
  k: number;
  d: number;
  rsi?: number;
}

/**
 * Triple Stochastic result
 */
export interface TripleStochasticResult {
  short: StochasticResult | null;
  mid: StochasticResult | null;
  long: StochasticResult | null;
}

/**
 * Stochastic zone classification
 */
export type ZoneType = 'overbought' | 'oversold' | 'neutral';

/**
 * Triple Stochastic zone analysis result
 */
export interface TripleStochasticZone {
  short: ZoneType;
  mid: ZoneType;
  long: ZoneType;
  allOverbought: boolean;
  allOversold: boolean;
}

/**
 * Generic indicator series result
 * Used for indicators that return an array of values
 */
export interface IndicatorSeries<T> {
  values: T[];
  period: number;
}

/**
 * Indicator calculation options
 */
export interface IndicatorOptions {
  /** Number of periods for calculation */
  period?: number;
  /** Standard deviation multiplier (for Bollinger Bands) */
  stdDev?: number;
  /** Smoothing factor */
  smoothing?: number;
}

/**
 * Utility function to extract OHLCV arrays from candles
 */
export function candlesToOHLCV(candles: Candle[]): OHLCVArrays {
  return {
    opens: candles.map((c) => c.open),
    highs: candles.map((c) => c.high),
    lows: candles.map((c) => c.low),
    closes: candles.map((c) => c.close),
    volumes: candles.map((c) => c.volume ?? 0),
  };
}

/**
 * Utility function to get closes from candles
 */
export function candlesToCloses(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}
