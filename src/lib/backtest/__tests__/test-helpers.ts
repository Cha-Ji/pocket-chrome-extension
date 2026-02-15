// ============================================================
// Backtest Test Helpers
// ============================================================
// Shared utilities for fast backtesting
// Uses pre-computation to avoid O(n²) indicator recalculation
// ============================================================

import { Candle } from '../types';
import { SMMA, Stochastic } from '../../indicators';
import { generatePatternedData } from '../data-generator';

// Strategy constants
export const SHORT_MA_PERIODS = [3, 5, 7, 9, 11, 13];
export const LONG_MA_PERIODS = [30, 35, 40, 45, 50];

export interface PrecomputedIndicators {
  shortMAs: Map<number, number[]>;
  longMAs: Map<number, number[]>;
  stoch: { k: number; d: number }[];
}

export interface Trade {
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
  direction: 'CALL' | 'PUT';
  result: 'WIN' | 'LOSS' | 'TIE';
  profit: number;
}

export interface BacktestStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netProfit: number;
  profitFactor: number;
  callTrades: number;
  putTrades: number;
  callWinRate: number;
  putWinRate: number;
}

/**
 * Pre-compute all indicators once (O(n) instead of O(n²))
 */
export function precomputeIndicators(candles: Candle[]): PrecomputedIndicators {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  return {
    shortMAs: new Map(SHORT_MA_PERIODS.map((p) => [p, SMMA.calculate(closes, p)])),
    longMAs: new Map(LONG_MA_PERIODS.map((p) => [p, SMMA.calculate(closes, p)])),
    stoch: Stochastic.calculate(highs, lows, closes, 14, 3),
  };
}

/**
 * Get MA values at a specific candle index
 */
export function getMAsAtIndex(
  indicators: PrecomputedIndicators,
  candleIdx: number,
): { short: number[]; long: number[] } | null {
  const shortVals: number[] = [];
  const longVals: number[] = [];

  for (const period of SHORT_MA_PERIODS) {
    const arr = indicators.shortMAs.get(period)!;
    const idx = candleIdx - period + 1;
    if (idx < 0 || idx >= arr.length) return null;
    shortVals.push(arr[idx]);
  }

  for (const period of LONG_MA_PERIODS) {
    const arr = indicators.longMAs.get(period)!;
    const idx = candleIdx - period + 1;
    if (idx < 0 || idx >= arr.length) return null;
    longVals.push(arr[idx]);
  }

  return { short: shortVals, long: longVals };
}

/**
 * Fast SMMA+Stochastic backtest runner
 */
export function runFastBacktest(
  candles: Candle[],
  config: {
    trendStrength?: number;
    oversold?: number;
    overbought?: number;
    payout?: number;
    betAmount?: number;
    expiryCandles?: number;
  } = {},
): { trades: Trade[]; stats: BacktestStats } {
  const {
    trendStrength = 4,
    oversold = 30,
    overbought = 70,
    payout = 0.92,
    betAmount = 100,
    expiryCandles = 4,
  } = config;

  const indicators = precomputeIndicators(candles);
  const trades: Trade[] = [];
  const stochOffset = candles.length - indicators.stoch.length;

  // Start after longest MA has enough data
  const startIdx = Math.max(...LONG_MA_PERIODS) + 10;

  for (let i = startIdx; i < candles.length - expiryCandles; i++) {
    const mas = getMAsAtIndex(indicators, i);
    if (!mas) continue;

    const stochIdx = i - stochOffset;
    if (stochIdx < 1 || stochIdx >= indicators.stoch.length) continue;

    const currStoch = indicators.stoch[stochIdx];
    const prevStoch = indicators.stoch[stochIdx - 1];

    // Trend detection
    const longMax = Math.max(...mas.long);
    const longMin = Math.min(...mas.long);
    const shortAbove = mas.short.filter((s) => s > longMax).length;
    const shortBelow = mas.short.filter((s) => s < longMin).length;

    const isUptrend = shortAbove >= trendStrength;
    const isDowntrend = shortBelow >= trendStrength;

    // Stochastic cross detection
    const goldenCross = prevStoch.k < prevStoch.d && currStoch.k >= currStoch.d;
    const deadCross = prevStoch.k > prevStoch.d && currStoch.k <= currStoch.d;
    const fromOversold = prevStoch.k < oversold;
    const fromOverbought = prevStoch.k > overbought;

    let direction: 'CALL' | 'PUT' | null = null;

    if (isUptrend && goldenCross && fromOversold) direction = 'CALL';
    else if (isDowntrend && deadCross && fromOverbought) direction = 'PUT';

    if (direction) {
      const entryPrice = candles[i].close;
      const exitIdx = i + expiryCandles;
      const exitPrice = candles[exitIdx].close;

      let result: 'WIN' | 'LOSS' | 'TIE';
      if (entryPrice === exitPrice) result = 'TIE';
      else if (direction === 'CALL') result = exitPrice > entryPrice ? 'WIN' : 'LOSS';
      else result = exitPrice < entryPrice ? 'WIN' : 'LOSS';

      const profit = result === 'WIN' ? betAmount * payout : result === 'LOSS' ? -betAmount : 0;

      trades.push({
        entryIdx: i,
        exitIdx,
        entryPrice,
        exitPrice,
        direction,
        result,
        profit,
      });

      i = exitIdx; // Skip to exit (no overlapping trades)
    }
  }

  return { trades, stats: calculateStats(trades, betAmount) };
}

/**
 * Calculate statistics from trades
 */
export function calculateStats(trades: Trade[], betAmount: number = 100): BacktestStats {
  const wins = trades.filter((t) => t.result === 'WIN').length;
  const losses = trades.filter((t) => t.result === 'LOSS').length;
  const total = trades.length;

  const callTrades = trades.filter((t) => t.direction === 'CALL');
  const putTrades = trades.filter((t) => t.direction === 'PUT');
  const callWins = callTrades.filter((t) => t.result === 'WIN').length;
  const putWins = putTrades.filter((t) => t.result === 'WIN').length;

  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0);
  const grossProfit = trades.filter((t) => t.profit > 0).reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.profit < 0).reduce((s, t) => s + t.profit, 0));

  return {
    totalTrades: total,
    wins,
    losses,
    winRate: total > 0 ? (wins / total) * 100 : 0,
    netProfit,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    callTrades: callTrades.length,
    putTrades: putTrades.length,
    callWinRate: callTrades.length > 0 ? (callWins / callTrades.length) * 100 : 0,
    putWinRate: putTrades.length > 0 ? (putWins / putTrades.length) * 100 : 0,
  };
}

/**
 * Format stats for console output
 */
export function formatStats(stats: BacktestStats, label: string = ''): string {
  const status = stats.winRate >= 53 ? '✅' : '❌';
  const pf = stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2);
  return `${label.padEnd(25)} | ${String(stats.totalTrades).padStart(3)} trades | Win ${stats.winRate.toFixed(1).padStart(5)}% | PF ${pf.padStart(5)} | $${stats.netProfit.toFixed(0).padStart(6)} ${status}`;
}

/**
 * Generate small test data (for unit tests)
 */
export function generateSmallTestData(
  pattern: 'uptrend' | 'downtrend' | 'ranging' | 'volatile' = 'ranging',
  count: number = 200,
): Candle[] {
  return generatePatternedData(pattern, count);
}

/**
 * Generate medium test data (for integration tests)
 */
export function generateMediumTestData(
  pattern: 'uptrend' | 'downtrend' | 'ranging' | 'volatile' = 'ranging',
  count: number = 500,
): Candle[] {
  return generatePatternedData(pattern, count);
}
