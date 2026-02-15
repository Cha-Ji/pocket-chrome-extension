// ============================================================
// Williams %R Trading Strategy
// ============================================================
// %R >= -20: Overbought → PUT
// %R <= -80: Oversold → CALL
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../types';
import { WilliamsR } from '../../indicators';

/**
 * Basic Williams %R Overbought/Oversold Strategy
 * - CALL when %R <= oversold threshold (default -80)
 * - PUT when %R >= overbought threshold (default -20)
 */
export const WilliamsROverboughtOversold: Strategy = {
  id: 'williams-r-ob-os',
  name: 'Williams %R Overbought/Oversold',
  description: 'Trade reversals when Williams %R reaches extreme levels',
  params: {
    period: { default: 14, min: 7, max: 28, step: 1 },
    overbought: { default: -20, min: -30, max: -10, step: 5 },
    oversold: { default: -80, min: -90, max: -70, step: 5 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, overbought, oversold } = params;

    if (candles.length < period + 1) return null;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    const wrValues = WilliamsR.calculate(highs, lows, closes, period);

    if (wrValues.length < 2) return null;

    const currentWR = wrValues[wrValues.length - 1];
    const prevWR = wrValues[wrValues.length - 2];

    let direction: Direction | null = null;
    let confidence = 0;

    // Williams %R crossing up from oversold (reversal up)
    if (prevWR < oversold && currentWR >= oversold) {
      direction = 'CALL';
      confidence = Math.min(1, Math.abs(prevWR - oversold) / 20);
    }
    // Williams %R crossing down from overbought (reversal down)
    else if (prevWR > overbought && currentWR <= overbought) {
      direction = 'PUT';
      confidence = Math.min(1, Math.abs(prevWR - overbought) / 20);
    }

    return {
      direction,
      confidence,
      indicators: { williamsR: currentWR, prevWilliamsR: prevWR },
      reason: direction
        ? `Williams %R ${direction === 'CALL' ? 'oversold reversal' : 'overbought reversal'}`
        : undefined,
    };
  },
};

/**
 * Williams %R Middle Line Cross Strategy
 * - CALL when %R crosses above -50 (bullish momentum)
 * - PUT when %R crosses below -50 (bearish momentum)
 */
export const WilliamsRMiddleCross: Strategy = {
  id: 'williams-r-middle-cross',
  name: 'Williams %R Middle Cross',
  description: 'Trade momentum when Williams %R crosses the -50 line',
  params: {
    period: { default: 14, min: 7, max: 28, step: 1 },
    middleLine: { default: -50, min: -60, max: -40, step: 5 },
    confirmBars: { default: 2, min: 1, max: 5, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, middleLine, confirmBars } = params;

    if (candles.length < period + confirmBars) return null;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    const wrValues = WilliamsR.calculate(highs, lows, closes, period);

    if (wrValues.length < confirmBars + 1) return null;

    const recentWR = wrValues.slice(-(confirmBars + 1));
    const prevWR = recentWR[0];
    const currentWR = recentWR[recentWR.length - 1];

    let direction: Direction | null = null;
    let confidence = 0;

    // Cross above middle line with confirmation
    if (prevWR < middleLine && recentWR.slice(1).every((v) => v >= middleLine)) {
      direction = 'CALL';
      confidence = Math.min(1, (currentWR - middleLine) / 30);
    }
    // Cross below middle line with confirmation
    else if (prevWR > middleLine && recentWR.slice(1).every((v) => v <= middleLine)) {
      direction = 'PUT';
      confidence = Math.min(1, Math.abs(currentWR - middleLine) / 30);
    }

    return {
      direction,
      confidence,
      indicators: { williamsR: currentWR, prevWilliamsR: prevWR },
      reason: direction
        ? `Williams %R ${direction === 'CALL' ? 'bullish' : 'bearish'} middle cross`
        : undefined,
    };
  },
};

/**
 * Williams %R Extreme Zone Strategy
 * Stay in trade direction while in extreme zone
 * - CALL while %R < -80 (strong oversold momentum)
 * - PUT while %R > -20 (strong overbought momentum)
 */
export const WilliamsRExtremeZone: Strategy = {
  id: 'williams-r-extreme',
  name: 'Williams %R Extreme Zone',
  description: 'Trade continuation while Williams %R stays in extreme zones',
  params: {
    period: { default: 14, min: 7, max: 28, step: 1 },
    overbought: { default: -20, min: -30, max: -10, step: 5 },
    oversold: { default: -80, min: -90, max: -70, step: 5 },
    minBarsInZone: { default: 2, min: 1, max: 5, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, overbought, oversold, minBarsInZone } = params;

    if (candles.length < period + minBarsInZone) return null;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    const wrValues = WilliamsR.calculate(highs, lows, closes, period);

    if (wrValues.length < minBarsInZone) return null;

    const recentWR = wrValues.slice(-minBarsInZone);
    const currentWR = recentWR[recentWR.length - 1];

    let direction: Direction | null = null;
    let confidence = 0;

    // Consistently in oversold zone
    if (recentWR.every((v) => v <= oversold)) {
      direction = 'CALL';
      confidence = Math.min(1, Math.abs(currentWR + 100) / 20);
    }
    // Consistently in overbought zone
    else if (recentWR.every((v) => v >= overbought)) {
      direction = 'PUT';
      confidence = Math.min(1, Math.abs(currentWR) / 20);
    }

    return {
      direction,
      confidence,
      indicators: { williamsR: currentWR, barsInZone: minBarsInZone },
      reason: direction
        ? `Williams %R ${direction === 'CALL' ? 'oversold' : 'overbought'} zone continuation`
        : undefined,
    };
  },
};

// Export all Williams %R strategies
export const WilliamsRStrategies = [
  WilliamsROverboughtOversold,
  WilliamsRMiddleCross,
  WilliamsRExtremeZone,
];
