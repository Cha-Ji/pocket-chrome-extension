// ============================================================
// Bollinger Bands Trading Strategies
// ============================================================
// Band touch, breakout, and squeeze-based strategies
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../types';
import { BollingerBands, RSI } from '../../indicators';

/**
 * Bollinger Band Bounce Strategy
 * - CALL when price touches lower band and bounces up
 * - PUT when price touches upper band and bounces down
 */
export const BollingerBounce: Strategy = {
  id: 'bollinger-bounce',
  name: 'Bollinger Band Bounce',
  description: 'Trade reversals when price bounces off Bollinger Bands',
  params: {
    period: { default: 20, min: 10, max: 30, step: 2 },
    stdDev: { default: 2, min: 1.5, max: 3, step: 0.25 },
    touchThreshold: { default: 0.001, min: 0.0005, max: 0.005, step: 0.0005 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, stdDev, touchThreshold } = params;

    if (candles.length < period + 2) return null;

    const closes = candles.map((c) => c.close);
    const bbValues = BollingerBands.calculate(closes, period, stdDev);

    if (bbValues.length < 2) return null;

    const currentBB = bbValues[bbValues.length - 1];
    const prevBB = bbValues[bbValues.length - 2];
    const currentClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];

    let direction: Direction | null = null;
    let confidence = 0;

    // Bullish bounce: touched lower band, now bouncing up
    if (prevClose <= prevBB.lower * (1 + touchThreshold) && currentClose > prevClose) {
      direction = 'CALL';
      confidence = Math.min(
        1,
        ((currentClose - prevClose) / (currentBB.middle - currentBB.lower)) * 2,
      );
    }
    // Bearish bounce: touched upper band, now bouncing down
    else if (prevClose >= prevBB.upper * (1 - touchThreshold) && currentClose < prevClose) {
      direction = 'PUT';
      confidence = Math.min(
        1,
        ((prevClose - currentClose) / (currentBB.upper - currentBB.middle)) * 2,
      );
    }

    return {
      direction,
      confidence,
      indicators: {
        bbUpper: currentBB.upper,
        bbMiddle: currentBB.middle,
        bbLower: currentBB.lower,
        price: currentClose,
        bandwidth: (currentBB.upper - currentBB.lower) / currentBB.middle,
      },
      reason: direction
        ? `Bollinger ${direction === 'CALL' ? 'lower' : 'upper'} band bounce`
        : undefined,
    };
  },
};

/**
 * Bollinger Band Breakout Strategy
 * - CALL when price breaks above upper band (momentum breakout)
 * - PUT when price breaks below lower band (momentum breakout)
 */
export const BollingerBreakout: Strategy = {
  id: 'bollinger-breakout',
  name: 'Bollinger Band Breakout',
  description: 'Trade momentum when price breaks outside Bollinger Bands',
  params: {
    period: { default: 20, min: 10, max: 30, step: 2 },
    stdDev: { default: 2, min: 1.5, max: 3, step: 0.25 },
    confirmBars: { default: 2, min: 1, max: 3, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, stdDev, confirmBars } = params;

    if (candles.length < period + confirmBars + 1) return null;

    const closes = candles.map((c) => c.close);
    const bbValues = BollingerBands.calculate(closes, period, stdDev);

    if (bbValues.length < confirmBars + 1) return null;

    // Check recent bars for breakout confirmation
    const recentBB = bbValues.slice(-confirmBars - 1);
    const recentCloses = closes.slice(-confirmBars - 1);

    // Check if price was inside bands and now breaking out
    const prevInside = recentCloses[0] > recentBB[0].lower && recentCloses[0] < recentBB[0].upper;

    if (!prevInside) {
      return {
        direction: null,
        confidence: 0,
        indicators: {
          bbUpper: recentBB[recentBB.length - 1].upper,
          bbMiddle: recentBB[recentBB.length - 1].middle,
          bbLower: recentBB[recentBB.length - 1].lower,
          price: recentCloses[recentCloses.length - 1],
        },
      };
    }

    // Check for consistent breakout over confirmBars
    let bullishBreakout = true;
    let bearishBreakout = true;

    for (let i = 1; i <= confirmBars; i++) {
      if (recentCloses[i] <= recentBB[i].upper) bullishBreakout = false;
      if (recentCloses[i] >= recentBB[i].lower) bearishBreakout = false;
    }

    const currentBB = recentBB[recentBB.length - 1];
    const currentClose = recentCloses[recentCloses.length - 1];

    let direction: Direction | null = null;
    let confidence = 0;

    if (bullishBreakout) {
      direction = 'CALL';
      confidence = Math.min(
        1,
        (currentClose - currentBB.upper) / (currentBB.upper - currentBB.middle),
      );
    } else if (bearishBreakout) {
      direction = 'PUT';
      confidence = Math.min(
        1,
        (currentBB.lower - currentClose) / (currentBB.middle - currentBB.lower),
      );
    }

    return {
      direction,
      confidence,
      indicators: {
        bbUpper: currentBB.upper,
        bbMiddle: currentBB.middle,
        bbLower: currentBB.lower,
        price: currentClose,
      },
      reason: direction
        ? `Bollinger ${direction === 'CALL' ? 'bullish' : 'bearish'} breakout`
        : undefined,
    };
  },
};

/**
 * Bollinger Band Squeeze Strategy
 * - Detect low volatility (squeeze) periods
 * - Trade breakout direction after squeeze
 */
export const BollingerSqueeze: Strategy = {
  id: 'bollinger-squeeze',
  name: 'Bollinger Band Squeeze',
  description: 'Trade after volatility contraction (squeeze) ends',
  params: {
    period: { default: 20, min: 10, max: 30, step: 2 },
    stdDev: { default: 2, min: 1.5, max: 3, step: 0.25 },
    squeezeLookback: { default: 20, min: 10, max: 30, step: 5 },
    squeezeThreshold: { default: 0.5, min: 0.3, max: 0.8, step: 0.1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, stdDev, squeezeLookback, squeezeThreshold } = params;

    if (candles.length < period + squeezeLookback + 1) return null;

    const closes = candles.map((c) => c.close);
    const bbValues = BollingerBands.calculate(closes, period, stdDev);

    if (bbValues.length < squeezeLookback + 1) return null;

    // Calculate bandwidth series
    const bandwidths = bbValues.map((bb) => (bb.upper - bb.lower) / bb.middle);
    const recentBandwidths = bandwidths.slice(-squeezeLookback - 1);

    // Find min/max bandwidth for squeeze detection
    const avgBandwidth = recentBandwidths.slice(0, -1).reduce((a, b) => a + b, 0) / squeezeLookback;
    const currentBandwidth = recentBandwidths[recentBandwidths.length - 1];
    const prevBandwidth = recentBandwidths[recentBandwidths.length - 2];

    // Squeeze ending: bandwidth was low, now expanding
    const wasSqueeze = prevBandwidth < avgBandwidth * squeezeThreshold;
    const isExpanding = currentBandwidth > prevBandwidth * 1.1;

    if (!wasSqueeze || !isExpanding) {
      return {
        direction: null,
        confidence: 0,
        indicators: {
          bandwidth: currentBandwidth,
          avgBandwidth,
          squeeze: wasSqueeze ? 1 : 0,
        },
      };
    }

    // Determine direction based on price movement
    const currentClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const currentBB = bbValues[bbValues.length - 1];

    let direction: Direction | null = null;
    let confidence = 0;

    // Price moving up after squeeze
    if (currentClose > prevClose && currentClose > currentBB.middle) {
      direction = 'CALL';
      confidence = Math.min(1, (currentBandwidth - prevBandwidth) / prevBandwidth);
    }
    // Price moving down after squeeze
    else if (currentClose < prevClose && currentClose < currentBB.middle) {
      direction = 'PUT';
      confidence = Math.min(1, (currentBandwidth - prevBandwidth) / prevBandwidth);
    }

    return {
      direction,
      confidence,
      indicators: {
        bbUpper: currentBB.upper,
        bbMiddle: currentBB.middle,
        bbLower: currentBB.lower,
        bandwidth: currentBandwidth,
        avgBandwidth,
        price: currentClose,
      },
      reason: direction
        ? `Bollinger squeeze ${direction === 'CALL' ? 'bullish' : 'bearish'} breakout`
        : undefined,
    };
  },
};

/**
 * Bollinger + RSI Combined Strategy
 * - CALL: price at lower band + RSI oversold
 * - PUT: price at upper band + RSI overbought
 */
export const BollingerRSI: Strategy = {
  id: 'bollinger-rsi',
  name: 'Bollinger + RSI',
  description: 'Combine Bollinger Band touches with RSI extremes',
  params: {
    bbPeriod: { default: 20, min: 10, max: 30, step: 2 },
    bbStdDev: { default: 2, min: 1.5, max: 3, step: 0.25 },
    rsiPeriod: { default: 14, min: 7, max: 21, step: 1 },
    rsiOversold: { default: 30, min: 20, max: 40, step: 5 },
    rsiOverbought: { default: 70, min: 60, max: 80, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { bbPeriod, bbStdDev, rsiPeriod, rsiOversold, rsiOverbought } = params;

    if (candles.length < Math.max(bbPeriod, rsiPeriod + 1) + 1) return null;

    const closes = candles.map((c) => c.close);
    const bbValues = BollingerBands.calculate(closes, bbPeriod, bbStdDev);
    const rsiValues = RSI.calculate(closes, rsiPeriod);

    if (bbValues.length === 0 || rsiValues.length === 0) return null;

    const currentBB = bbValues[bbValues.length - 1];
    const currentRSI = rsiValues[rsiValues.length - 1];
    const currentClose = closes[closes.length - 1];

    // Calculate band position (0 = lower, 1 = upper)
    const bandPosition = (currentClose - currentBB.lower) / (currentBB.upper - currentBB.lower);

    let direction: Direction | null = null;
    let confidence = 0;

    // Bullish: near lower band + RSI oversold
    if (bandPosition < 0.1 && currentRSI < rsiOversold) {
      direction = 'CALL';
      confidence = Math.min(1, ((rsiOversold - currentRSI) / 20 + (0.1 - bandPosition)) / 0.2);
    }
    // Bearish: near upper band + RSI overbought
    else if (bandPosition > 0.9 && currentRSI > rsiOverbought) {
      direction = 'PUT';
      confidence = Math.min(1, ((currentRSI - rsiOverbought) / 20 + (bandPosition - 0.9)) / 0.2);
    }

    return {
      direction,
      confidence,
      indicators: {
        bbUpper: currentBB.upper,
        bbMiddle: currentBB.middle,
        bbLower: currentBB.lower,
        rsi: currentRSI,
        bandPosition,
        price: currentClose,
      },
      reason: direction
        ? `Bollinger + RSI ${direction === 'CALL' ? 'oversold' : 'overbought'}`
        : undefined,
    };
  },
};

// Export all Bollinger strategies
export const BollingerStrategies = [
  BollingerBounce,
  BollingerBreakout,
  BollingerSqueeze,
  BollingerRSI,
];
