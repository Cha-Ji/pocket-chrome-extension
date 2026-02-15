// ============================================================
// Stochastic RSI Trading Strategies
// ============================================================
// Composite indicator combining RSI with Stochastic
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../types';
import { StochRSI, EMA } from '../../indicators';

/**
 * Stochastic RSI Crossover Strategy
 * - CALL when %K crosses above %D in oversold region
 * - PUT when %K crosses below %D in overbought region
 */
export const StochRSICrossover: Strategy = {
  id: 'stochrsi-crossover',
  name: 'Stochastic RSI Crossover',
  description: 'Trade K/D crossovers in extreme zones',
  params: {
    rsiPeriod: { default: 14, min: 7, max: 21, step: 1 },
    stochPeriod: { default: 14, min: 7, max: 21, step: 1 },
    kSmooth: { default: 3, min: 1, max: 5, step: 1 },
    dSmooth: { default: 3, min: 1, max: 5, step: 1 },
    oversold: { default: 20, min: 10, max: 30, step: 5 },
    overbought: { default: 80, min: 70, max: 90, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { rsiPeriod, stochPeriod, kSmooth, dSmooth, oversold, overbought } = params;

    const minDataNeeded = rsiPeriod + stochPeriod + kSmooth + dSmooth + 1;

    if (candles.length < minDataNeeded) return null;

    const closes = candles.map((c) => c.close);
    const stochRsiValues = StochRSI.calculate(closes, rsiPeriod, stochPeriod, kSmooth, dSmooth);

    if (stochRsiValues.length < 2) return null;

    const current = stochRsiValues[stochRsiValues.length - 1];
    const prev = stochRsiValues[stochRsiValues.length - 2];

    let direction: Direction | null = null;
    let confidence = 0;

    // Bullish crossover: K crosses above D in oversold zone
    if (prev.k <= prev.d && current.k > current.d && current.k < oversold + 10) {
      direction = 'CALL';
      confidence = Math.min(1, (oversold + 10 - current.k) / 20);
    }
    // Bearish crossover: K crosses below D in overbought zone
    else if (prev.k >= prev.d && current.k < current.d && current.k > overbought - 10) {
      direction = 'PUT';
      confidence = Math.min(1, (current.k - overbought + 10) / 20);
    }

    return {
      direction,
      confidence,
      indicators: {
        stochRsiK: current.k,
        stochRsiD: current.d,
        prevK: prev.k,
        prevD: prev.d,
      },
      reason: direction
        ? `StochRSI ${direction === 'CALL' ? 'bullish' : 'bearish'} crossover`
        : undefined,
    };
  },
};

/**
 * Stochastic RSI Extreme Strategy
 * - CALL when K and D both in oversold (<20) and turning up
 * - PUT when K and D both in overbought (>80) and turning down
 */
export const StochRSIExtreme: Strategy = {
  id: 'stochrsi-extreme',
  name: 'Stochastic RSI Extreme',
  description: 'Trade extreme oversold/overbought reversals',
  params: {
    rsiPeriod: { default: 14, min: 7, max: 21, step: 1 },
    stochPeriod: { default: 14, min: 7, max: 21, step: 1 },
    kSmooth: { default: 3, min: 1, max: 5, step: 1 },
    dSmooth: { default: 3, min: 1, max: 5, step: 1 },
    oversold: { default: 20, min: 10, max: 30, step: 5 },
    overbought: { default: 80, min: 70, max: 90, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { rsiPeriod, stochPeriod, kSmooth, dSmooth, oversold, overbought } = params;

    const minDataNeeded = rsiPeriod + stochPeriod + kSmooth + dSmooth + 2;

    if (candles.length < minDataNeeded) return null;

    const closes = candles.map((c) => c.close);
    const stochRsiValues = StochRSI.calculate(closes, rsiPeriod, stochPeriod, kSmooth, dSmooth);

    if (stochRsiValues.length < 3) return null;

    const current = stochRsiValues[stochRsiValues.length - 1];
    const prev = stochRsiValues[stochRsiValues.length - 2];
    const prev2 = stochRsiValues[stochRsiValues.length - 3];

    let direction: Direction | null = null;
    let confidence = 0;

    // Extreme oversold reversal: both K and D very low, now turning up
    if (prev.k < oversold && prev.d < oversold && current.k > prev.k && prev.k <= prev2.k) {
      direction = 'CALL';
      confidence = Math.min(1, (oversold - Math.min(prev.k, prev.d)) / oversold);
    }
    // Extreme overbought reversal: both K and D very high, now turning down
    else if (
      prev.k > overbought &&
      prev.d > overbought &&
      current.k < prev.k &&
      prev.k >= prev2.k
    ) {
      direction = 'PUT';
      confidence = Math.min(1, (Math.max(prev.k, prev.d) - overbought) / (100 - overbought));
    }

    return {
      direction,
      confidence,
      indicators: {
        stochRsiK: current.k,
        stochRsiD: current.d,
        prevK: prev.k,
        prevD: prev.d,
      },
      reason: direction
        ? `StochRSI extreme ${direction === 'CALL' ? 'oversold' : 'overbought'}`
        : undefined,
    };
  },
};

/**
 * Stochastic RSI Trend Strategy
 * - CALL when StochRSI > 50 and rising (bullish momentum)
 * - PUT when StochRSI < 50 and falling (bearish momentum)
 */
export const StochRSITrend: Strategy = {
  id: 'stochrsi-trend',
  name: 'Stochastic RSI Trend',
  description: 'Follow momentum using StochRSI above/below 50',
  params: {
    rsiPeriod: { default: 14, min: 7, max: 21, step: 1 },
    stochPeriod: { default: 14, min: 7, max: 21, step: 1 },
    kSmooth: { default: 3, min: 1, max: 5, step: 1 },
    dSmooth: { default: 3, min: 1, max: 5, step: 1 },
    threshold: { default: 10, min: 5, max: 20, step: 5 },
    confirmBars: { default: 3, min: 2, max: 5, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { rsiPeriod, stochPeriod, kSmooth, dSmooth, threshold, confirmBars } = params;

    const minDataNeeded = rsiPeriod + stochPeriod + kSmooth + dSmooth + confirmBars;

    if (candles.length < minDataNeeded) return null;

    const closes = candles.map((c) => c.close);
    const stochRsiValues = StochRSI.calculate(closes, rsiPeriod, stochPeriod, kSmooth, dSmooth);

    if (stochRsiValues.length < confirmBars) return null;

    const recentValues = stochRsiValues.slice(-confirmBars);
    const currentK = recentValues[recentValues.length - 1].k;

    // Check if K has been consistently above/below 50 + threshold
    const allAbove = recentValues.every((v) => v.k > 50 + threshold);
    const allBelow = recentValues.every((v) => v.k < 50 - threshold);

    // Check direction (rising/falling)
    const rising = recentValues.every((v, i) => i === 0 || v.k >= recentValues[i - 1].k - 2);
    const falling = recentValues.every((v, i) => i === 0 || v.k <= recentValues[i - 1].k + 2);

    let direction: Direction | null = null;
    let confidence = 0;

    if (allAbove && rising) {
      direction = 'CALL';
      confidence = Math.min(1, (currentK - 50) / 40);
    } else if (allBelow && falling) {
      direction = 'PUT';
      confidence = Math.min(1, (50 - currentK) / 40);
    }

    return {
      direction,
      confidence,
      indicators: {
        stochRsiK: currentK,
        stochRsiD: recentValues[recentValues.length - 1].d,
        rising: rising ? 1 : 0,
        falling: falling ? 1 : 0,
      },
      reason: direction
        ? `StochRSI trend ${direction === 'CALL' ? 'bullish' : 'bearish'}`
        : undefined,
    };
  },
};

/**
 * Stochastic RSI + Price EMA Strategy
 * - CALL: StochRSI oversold crossover + price above EMA
 * - PUT: StochRSI overbought crossover + price below EMA
 */
export const StochRSIWithEMA: Strategy = {
  id: 'stochrsi-ema',
  name: 'StochRSI + EMA',
  description: 'Combine StochRSI signals with EMA trend filter',
  params: {
    rsiPeriod: { default: 14, min: 7, max: 21, step: 1 },
    stochPeriod: { default: 14, min: 7, max: 21, step: 1 },
    kSmooth: { default: 3, min: 1, max: 5, step: 1 },
    dSmooth: { default: 3, min: 1, max: 5, step: 1 },
    emaPeriod: { default: 20, min: 10, max: 50, step: 5 },
    oversold: { default: 20, min: 10, max: 30, step: 5 },
    overbought: { default: 80, min: 70, max: 90, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { rsiPeriod, stochPeriod, kSmooth, dSmooth, emaPeriod, oversold, overbought } = params;

    const minDataNeeded = Math.max(rsiPeriod + stochPeriod + kSmooth + dSmooth, emaPeriod) + 1;

    if (candles.length < minDataNeeded) return null;

    const closes = candles.map((c) => c.close);
    const stochRsiValues = StochRSI.calculate(closes, rsiPeriod, stochPeriod, kSmooth, dSmooth);
    const ema = EMA.latest(closes, emaPeriod);

    if (stochRsiValues.length < 2 || ema === null) return null;

    const current = stochRsiValues[stochRsiValues.length - 1];
    const prev = stochRsiValues[stochRsiValues.length - 2];
    const currentClose = closes[closes.length - 1];

    // EMA trend filter
    const aboveEMA = currentClose > ema;
    const belowEMA = currentClose < ema;

    let direction: Direction | null = null;
    let confidence = 0;

    // Bullish: K crosses above D from oversold + price above EMA
    if (prev.k <= prev.d && current.k > current.d && current.k < oversold + 15 && aboveEMA) {
      direction = 'CALL';
      confidence = Math.min(1, (oversold + 15 - prev.k) / 30);
    }
    // Bearish: K crosses below D from overbought + price below EMA
    else if (prev.k >= prev.d && current.k < current.d && current.k > overbought - 15 && belowEMA) {
      direction = 'PUT';
      confidence = Math.min(1, (prev.k - overbought + 15) / 30);
    }

    return {
      direction,
      confidence,
      indicators: {
        stochRsiK: current.k,
        stochRsiD: current.d,
        ema,
        price: currentClose,
        aboveEma: aboveEMA ? 1 : 0,
      },
      reason: direction
        ? `StochRSI + EMA ${direction === 'CALL' ? 'bullish' : 'bearish'}`
        : undefined,
    };
  },
};

// Export all Stochastic RSI strategies
export const StochRSIStrategies = [
  StochRSICrossover,
  StochRSIExtreme,
  StochRSITrend,
  StochRSIWithEMA,
];
