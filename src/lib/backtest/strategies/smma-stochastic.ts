// ============================================================
// SMMA + Stochastic Strategy (비트신옵션)
// ============================================================
// Source: https://www.youtube.com/watch?v=8uCDh1wfRhc
//
// Settings:
// - Candle: 15 seconds
// - Expiry: 1 minute
// - SMMA Short: 3, 5, 7, 9, 11, 13 (green)
// - SMMA Long: 30, 35, 40, 45, 50 (red)
// - Stochastic: default (14, 3, 3)
//
// Entry:
// - CALL: short MAs > long MAs + stoch golden cross from oversold
// - PUT: short MAs < long MAs + stoch dead cross from overbought
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../types';
import { SMMA, Stochastic } from '../../indicators';

// Default periods from 비트신옵션
const SHORT_MA_PERIODS = [3, 5, 7, 9, 11, 13];
const LONG_MA_PERIODS = [30, 35, 40, 45, 50];

/**
 * SMMA + Stochastic Strategy
 * Trend following with stochastic confirmation
 */
export const SMMAStochasticStrategy: Strategy = {
  id: 'smma-stoch-bitshin',
  name: 'SMMA + Stochastic (비트신옵션)',
  description: '11개 SMMA로 추세 판단 + 스토캐스틱 크로스로 진입',
  params: {
    // Stochastic settings
    stochK: { default: 14, min: 5, max: 21, step: 1 },
    stochD: { default: 3, min: 2, max: 5, step: 1 },
    stochSmooth: { default: 3, min: 1, max: 5, step: 1 },

    // Oversold/Overbought levels
    oversold: { default: 20, min: 10, max: 30, step: 5 },
    overbought: { default: 80, min: 70, max: 90, step: 5 },

    // Trend strength (how many short MAs must be above/below long MAs)
    trendStrength: { default: 6, min: 3, max: 6, step: 1 }, // 6 = all short MAs

    // MA overlap tolerance (0 = no overlap allowed)
    overlapTolerance: { default: 0, min: 0, max: 2, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { stochK, stochD, stochSmooth, oversold, overbought, trendStrength, overlapTolerance } =
      params;

    // Need enough data for longest MA
    const maxPeriod = Math.max(...LONG_MA_PERIODS);
    if (candles.length < maxPeriod + 5) return null;

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    // Calculate all SMAs
    const shortMAs = SHORT_MA_PERIODS.map((p) => SMMA.latest(closes, p));
    const longMAs = LONG_MA_PERIODS.map((p) => SMMA.latest(closes, p));

    // Check if any MA is null
    if (shortMAs.some((m) => m === null) || longMAs.some((m) => m === null)) {
      return null;
    }

    // Calculate stochastic
    const stochValues = Stochastic.calculate(highs, lows, closes, stochK, stochD, stochSmooth);
    if (stochValues.length < 2) return null;

    const currentStoch = stochValues[stochValues.length - 1];
    const prevStoch = stochValues[stochValues.length - 2];

    // Determine trend
    const shortMAValues = shortMAs as number[];
    const longMAValues = longMAs as number[];

    const shortMin = Math.min(...shortMAValues);
    const shortMax = Math.max(...shortMAValues);
    const longMin = Math.min(...longMAValues);
    const longMax = Math.max(...longMAValues);

    // Count how many short MAs are above all long MAs
    const shortAboveLongCount = shortMAValues.filter((s) => s > longMax).length;
    const shortBelowLongCount = shortMAValues.filter((s) => s < longMin).length;

    // Check overlap
    const hasOverlap = shortMin < longMax && shortMax > longMin;
    const overlapAmount = hasOverlap
      ? Math.min(shortMax, longMax) - Math.max(shortMin, longMin)
      : 0;
    const avgPrice = closes[closes.length - 1];
    const overlapPercent = (overlapAmount / avgPrice) * 100;

    // Trend determination
    const isUptrend = shortAboveLongCount >= trendStrength && overlapPercent <= overlapTolerance;
    const isDowntrend = shortBelowLongCount >= trendStrength && overlapPercent <= overlapTolerance;

    // Stochastic cross detection
    const goldenCross = prevStoch.k < prevStoch.d && currentStoch.k >= currentStoch.d;
    const deadCross = prevStoch.k > prevStoch.d && currentStoch.k <= currentStoch.d;
    const fromOversold = prevStoch.k < oversold || currentStoch.k < oversold + 10;
    const fromOverbought = prevStoch.k > overbought || currentStoch.k > overbought - 10;

    let direction: Direction | null = null;
    let confidence = 0;
    let reason = '';

    // CALL: Uptrend + Stochastic golden cross from oversold
    if (isUptrend && goldenCross && fromOversold) {
      direction = 'CALL';
      confidence = Math.min(
        1,
        (shortAboveLongCount / 6) * 0.5 +
          ((oversold - Math.min(prevStoch.k, currentStoch.k)) / 40) * 0.5,
      );
      reason = `Uptrend (${shortAboveLongCount}/6 MAs above) + Stoch golden cross from ${prevStoch.k.toFixed(1)}`;
    }
    // PUT: Downtrend + Stochastic dead cross from overbought
    else if (isDowntrend && deadCross && fromOverbought) {
      direction = 'PUT';
      confidence = Math.min(
        1,
        (shortBelowLongCount / 6) * 0.5 +
          ((Math.max(prevStoch.k, currentStoch.k) - overbought) / 40) * 0.5,
      );
      reason = `Downtrend (${shortBelowLongCount}/6 MAs below) + Stoch dead cross from ${prevStoch.k.toFixed(1)}`;
    }

    return {
      direction,
      confidence,
      indicators: {
        stochK: currentStoch.k,
        stochD: currentStoch.d,
        prevStochK: prevStoch.k,
        prevStochD: prevStoch.d,
        shortAboveLong: shortAboveLongCount,
        shortBelowLong: shortBelowLongCount,
        overlapPercent,
        shortMAAvg: shortMAValues.reduce((a, b) => a + b, 0) / shortMAValues.length,
        longMAAvg: longMAValues.reduce((a, b) => a + b, 0) / longMAValues.length,
      },
      reason: reason || undefined,
    };
  },
};

// Alternative version with more aggressive entry (less strict trend requirement)
export const SMMAStochasticAggressiveStrategy: Strategy = {
  ...SMMAStochasticStrategy,
  id: 'smma-stoch-aggressive',
  name: 'SMMA + Stochastic (Aggressive)',
  description: '더 적극적인 진입 - 4/6 MA만 추세 확인',
  params: {
    ...SMMAStochasticStrategy.params,
    trendStrength: { default: 4, min: 3, max: 6, step: 1 },
    overlapTolerance: { default: 1, min: 0, max: 3, step: 1 },
  },
};

// Export all strategies
export const SMMAStrategies = [SMMAStochasticStrategy, SMMAStochasticAggressiveStrategy];
