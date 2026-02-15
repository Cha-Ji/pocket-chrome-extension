// ============================================================
// CCI (Commodity Channel Index) Trading Strategy
// ============================================================
// CCI > +100: Overbought → PUT
// CCI < -100: Oversold → CALL
// ============================================================

import { Candle, Strategy, StrategySignal, Direction } from '../types';
import { CCI } from '../../indicators';

/**
 * Basic CCI Overbought/Oversold Strategy
 * - CALL when CCI < oversold threshold (default -100)
 * - PUT when CCI > overbought threshold (default +100)
 */
export const CCIOverboughtOversold: Strategy = {
  id: 'cci-ob-os',
  name: 'CCI Overbought/Oversold',
  description: 'Trade reversals when CCI reaches extreme levels',
  params: {
    period: { default: 20, min: 10, max: 40, step: 2 },
    overbought: { default: 100, min: 80, max: 200, step: 10 },
    oversold: { default: -100, min: -200, max: -80, step: 10 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, overbought, oversold } = params;

    if (candles.length < period + 1) return null;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    const cciValues = CCI.calculate(highs, lows, closes, period);

    if (cciValues.length < 2) return null;

    const currentCCI = cciValues[cciValues.length - 1];
    const prevCCI = cciValues[cciValues.length - 2];

    let direction: Direction | null = null;
    let confidence = 0;

    // CCI crossing up from oversold (reversal up)
    if (prevCCI < oversold && currentCCI >= oversold) {
      direction = 'CALL';
      confidence = Math.min(1, Math.abs(prevCCI - oversold) / 50);
    }
    // CCI crossing down from overbought (reversal down)
    else if (prevCCI > overbought && currentCCI <= overbought) {
      direction = 'PUT';
      confidence = Math.min(1, Math.abs(prevCCI - overbought) / 50);
    }

    return {
      direction,
      confidence,
      indicators: { cci: currentCCI, prevCci: prevCCI },
      reason: direction
        ? `CCI ${direction === 'CALL' ? 'oversold reversal' : 'overbought reversal'}`
        : undefined,
    };
  },
};

/**
 * CCI Zero Line Cross Strategy
 * - CALL when CCI crosses above 0 (bullish momentum)
 * - PUT when CCI crosses below 0 (bearish momentum)
 */
export const CCIZeroCross: Strategy = {
  id: 'cci-zero-cross',
  name: 'CCI Zero Line Cross',
  description: 'Trade momentum when CCI crosses the zero line',
  params: {
    period: { default: 20, min: 10, max: 40, step: 2 },
    confirmBars: { default: 2, min: 1, max: 5, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, confirmBars } = params;

    if (candles.length < period + confirmBars) return null;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    const cciValues = CCI.calculate(highs, lows, closes, period);

    if (cciValues.length < confirmBars + 1) return null;

    const recentCCI = cciValues.slice(-(confirmBars + 1));
    const prevCCI = recentCCI[0];
    const currentCCI = recentCCI[recentCCI.length - 1];

    let direction: Direction | null = null;
    let confidence = 0;

    // Cross above zero with confirmation
    if (prevCCI < 0 && recentCCI.slice(1).every((v) => v >= 0)) {
      direction = 'CALL';
      confidence = Math.min(1, currentCCI / 100);
    }
    // Cross below zero with confirmation
    else if (prevCCI > 0 && recentCCI.slice(1).every((v) => v <= 0)) {
      direction = 'PUT';
      confidence = Math.min(1, Math.abs(currentCCI) / 100);
    }

    return {
      direction,
      confidence,
      indicators: { cci: currentCCI, prevCci: prevCCI },
      reason: direction
        ? `CCI ${direction === 'CALL' ? 'bullish' : 'bearish'} zero cross`
        : undefined,
    };
  },
};

/**
 * CCI Trend Following Strategy
 * - CALL when CCI > +100 and rising (strong bullish trend)
 * - PUT when CCI < -100 and falling (strong bearish trend)
 */
export const CCITrendFollowing: Strategy = {
  id: 'cci-trend',
  name: 'CCI Trend Following',
  description: 'Follow strong trends when CCI is in extreme zones and moving further',
  params: {
    period: { default: 20, min: 10, max: 40, step: 2 },
    threshold: { default: 100, min: 80, max: 150, step: 10 },
    lookback: { default: 3, min: 2, max: 5, step: 1 },
  },

  generateSignal(candles: Candle[], params: Record<string, number>): StrategySignal | null {
    const { period, threshold, lookback } = params;

    if (candles.length < period + lookback) return null;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    const cciValues = CCI.calculate(highs, lows, closes, period);

    if (cciValues.length < lookback) return null;

    const recentCCI = cciValues.slice(-lookback);
    const currentCCI = recentCCI[recentCCI.length - 1];

    // Check if CCI is rising or falling
    const isRising = recentCCI.every((v, i) => i === 0 || v >= recentCCI[i - 1] - 5);
    const isFalling = recentCCI.every((v, i) => i === 0 || v <= recentCCI[i - 1] + 5);

    let direction: Direction | null = null;
    let confidence = 0;

    // Strong bullish trend: CCI > threshold and rising
    if (currentCCI > threshold && isRising) {
      direction = 'CALL';
      confidence = Math.min(1, (currentCCI - threshold) / 100);
    }
    // Strong bearish trend: CCI < -threshold and falling
    else if (currentCCI < -threshold && isFalling) {
      direction = 'PUT';
      confidence = Math.min(1, (Math.abs(currentCCI) - threshold) / 100);
    }

    return {
      direction,
      confidence,
      indicators: { cci: currentCCI, rising: isRising ? 1 : 0, falling: isFalling ? 1 : 0 },
      reason: direction
        ? `CCI ${direction === 'CALL' ? 'bullish' : 'bearish'} trend continuation`
        : undefined,
    };
  },
};

// Export all CCI strategies
export const CCIStrategies = [CCIOverboughtOversold, CCIZeroCross, CCITrendFollowing];
