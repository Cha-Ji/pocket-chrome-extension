// ============================================================
// Additional Trading Strategies
// ============================================================

import { Candle } from '../types';
import { calculateSMA, calculateRSI } from '../../indicators';

// ============================================================
// Williams %R
// ============================================================

export function calculateWilliamsR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number[] {
  const results: number[] = [];

  for (let i = period - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice = lows.slice(i - period + 1, i + 1);

    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    const close = closes[i];

    const range = highestHigh - lowestLow;
    const wr = range === 0 ? -50 : ((highestHigh - close) / range) * -100;
    results.push(wr);
  }

  return results;
}

export function createWilliamsRStrategy(
  period: number = 14,
  oversold: number = -80,
  overbought: number = -20,
) {
  return {
    name: `Williams%R(${period})`,
    precompute: (candles: Candle[]) => {
      return calculateWilliamsR(
        candles.map((c) => c.high),
        candles.map((c) => c.low),
        candles.map((c) => c.close),
        period,
      );
    },
    signal: (candles: Candle[], idx: number, wr: number[]): 'CALL' | 'PUT' | null => {
      const wrIdx = idx - period + 1;
      if (wrIdx < 1 || wrIdx >= wr.length) return null;

      const curr = wr[wrIdx];
      const prev = wr[wrIdx - 1];

      // Cross above oversold → CALL
      if (prev < oversold && curr >= oversold) return 'CALL';
      // Cross below overbought → PUT
      if (prev > overbought && curr <= overbought) return 'PUT';

      return null;
    },
  };
}

// ============================================================
// CCI (Commodity Channel Index)
// ============================================================

export function calculateCCI(candles: Candle[], period: number = 20): number[] {
  const results: number[] = [];

  // Typical Price = (High + Low + Close) / 3
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);

  for (let i = period - 1; i < tp.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;

    // Mean Deviation
    const meanDev = slice.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period;

    // CCI = (TP - SMA) / (0.015 * Mean Deviation)
    const cci = meanDev === 0 ? 0 : (tp[i] - sma) / (0.015 * meanDev);
    results.push(cci);
  }

  return results;
}

export function createCCIStrategy(
  period: number = 20,
  oversold: number = -100,
  overbought: number = 100,
) {
  return {
    name: `CCI(${period})`,
    precompute: (candles: Candle[]) => calculateCCI(candles, period),
    signal: (candles: Candle[], idx: number, cci: number[]): 'CALL' | 'PUT' | null => {
      const cciIdx = idx - period + 1;
      if (cciIdx < 1 || cciIdx >= cci.length) return null;

      const curr = cci[cciIdx];
      const prev = cci[cciIdx - 1];

      // Cross above oversold → CALL
      if (prev < oversold && curr >= oversold) return 'CALL';
      // Cross below overbought → PUT
      if (prev > overbought && curr <= overbought) return 'PUT';

      return null;
    },
  };
}

// ============================================================
// ATR (Average True Range) for volatility
// ============================================================

export function calculateATR(candles: Candle[], period: number = 14): number[] {
  if (candles.length < 2) return [];

  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    trueRanges.push(tr);
  }

  // First ATR is simple average
  const results: number[] = [];
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  results.push(atr);

  // Subsequent ATRs use smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    results.push(atr);
  }

  return results;
}

export function createATRBreakoutStrategy(period: number = 14, multiplier: number = 1.5) {
  return {
    name: `ATR Breakout(${period}, ${multiplier})`,
    precompute: (candles: Candle[]) => {
      const atr = calculateATR(candles, period);
      const sma = candles.map((_, i) => {
        if (i < 20) return null;
        const slice = candles.slice(i - 19, i + 1).map((c) => c.close);
        return slice.reduce((a, b) => a + b, 0) / 20;
      });
      return { atr, sma };
    },
    signal: (
      candles: Candle[],
      idx: number,
      data: { atr: number[]; sma: (number | null)[] },
    ): 'CALL' | 'PUT' | null => {
      const atrIdx = idx - period;
      if (atrIdx < 1 || atrIdx >= data.atr.length) return null;

      const sma = data.sma[idx];
      if (!sma) return null;

      const atr = data.atr[atrIdx];
      const close = candles[idx].close;
      const prevClose = candles[idx - 1].close;

      // Breakout above SMA + ATR threshold
      if (prevClose <= sma && close > sma + atr * multiplier * 0.5) return 'CALL';
      // Breakout below SMA - ATR threshold
      if (prevClose >= sma && close < sma - atr * multiplier * 0.5) return 'PUT';

      return null;
    },
  };
}

// ============================================================
// Triple Stochastic (고승덕 3스토캐스틱)
// ============================================================

interface TripleStochResult {
  short: { k: number; d: number }[];
  mid: { k: number; d: number }[];
  long: { k: number; d: number }[];
}

function calculateStochSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number,
  dPeriod: number,
): { k: number; d: number }[] {
  const results: { k: number; d: number }[] = [];
  const kValues: number[] = [];

  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);

    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    const range = highestHigh - lowestLow;

    const k = range === 0 ? 50 : ((closes[i] - lowestLow) / range) * 100;
    kValues.push(k);

    if (kValues.length >= dPeriod) {
      const d = kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
      results.push({ k, d });
    }
  }

  return results;
}

export function createTripleStochStrategy(
  shortParams: [number, number] = [5, 3],
  midParams: [number, number] = [10, 6],
  longParams: [number, number] = [20, 12],
  oversold: number = 20,
  overbought: number = 80,
) {
  return {
    name: `TripleStoch(${shortParams[0]}/${midParams[0]}/${longParams[0]})`,
    precompute: (candles: Candle[]): TripleStochResult => {
      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      const closes = candles.map((c) => c.close);

      return {
        short: calculateStochSeries(highs, lows, closes, shortParams[0], shortParams[1]),
        mid: calculateStochSeries(highs, lows, closes, midParams[0], midParams[1]),
        long: calculateStochSeries(highs, lows, closes, longParams[0], longParams[1]),
      };
    },
    signal: (candles: Candle[], idx: number, data: TripleStochResult): 'CALL' | 'PUT' | null => {
      // Align indices (long stoch has largest offset)
      const longOffset = longParams[0] + longParams[1] - 2;
      const midOffset = midParams[0] + midParams[1] - 2;
      const shortOffset = shortParams[0] + shortParams[1] - 2;

      const longIdx = idx - longOffset;
      const midIdx = idx - midOffset - (longOffset - midOffset);
      const shortIdx = idx - shortOffset - (longOffset - shortOffset);

      if (longIdx < 1 || longIdx >= data.long.length) return null;
      if (midIdx < 1 || midIdx >= data.mid.length) return null;
      if (shortIdx < 1 || shortIdx >= data.short.length) return null;

      const currShort = data.short[shortIdx];
      const currMid = data.mid[midIdx];
      const currLong = data.long[longIdx];

      const prevShort = data.short[shortIdx - 1];
      const prevMid = data.mid[midIdx - 1];
      const prevLong = data.long[longIdx - 1];

      // All three in oversold zone + short golden cross
      const allOversold =
        currShort.k < oversold + 10 && currMid.k < oversold + 15 && currLong.k < oversold + 20;
      const shortGoldenCross = prevShort.k < prevShort.d && currShort.k >= currShort.d;

      // All three in overbought zone + short dead cross
      const allOverbought =
        currShort.k > overbought - 10 &&
        currMid.k > overbought - 15 &&
        currLong.k > overbought - 20;
      const shortDeadCross = prevShort.k > prevShort.d && currShort.k <= currShort.d;

      if (allOversold && shortGoldenCross) return 'CALL';
      if (allOverbought && shortDeadCross) return 'PUT';

      return null;
    },
  };
}

// ============================================================
// RSI Divergence (more advanced)
// ============================================================

export function createRSIDivergenceStrategy(period: number = 14, lookback: number = 10) {
  return {
    name: `RSI Divergence(${period})`,
    precompute: (candles: Candle[]) => {
      const closes = candles.map((c) => c.close);
      const rsi: number[] = [];

      for (let i = period + 1; i <= closes.length; i++) {
        const slice = closes.slice(0, i);
        const r = calculateRSI(slice, period);
        if (r !== null) rsi.push(r);
      }

      return { rsi, closes };
    },
    signal: (
      candles: Candle[],
      idx: number,
      data: { rsi: number[]; closes: number[] },
    ): 'CALL' | 'PUT' | null => {
      const rsiIdx = idx - period - 1;
      if (rsiIdx < lookback || rsiIdx >= data.rsi.length) return null;

      // Look for divergence in last N candles
      const recentRSI = data.rsi.slice(rsiIdx - lookback, rsiIdx + 1);
      const recentClose = data.closes.slice(idx - lookback, idx + 1);

      // Find local min/max
      const rsiMin = Math.min(...recentRSI);
      const rsiMax = Math.max(...recentRSI);
      const priceMin = Math.min(...recentClose);
      const priceMax = Math.max(...recentClose);

      const currRSI = recentRSI[recentRSI.length - 1];
      const currPrice = recentClose[recentClose.length - 1];

      // Bullish divergence: price makes lower low, RSI makes higher low
      if (currPrice <= priceMin * 1.001 && currRSI > rsiMin + 5 && currRSI < 40) {
        return 'CALL';
      }

      // Bearish divergence: price makes higher high, RSI makes lower high
      if (currPrice >= priceMax * 0.999 && currRSI < rsiMax - 5 && currRSI > 60) {
        return 'PUT';
      }

      return null;
    },
  };
}

// ============================================================
// EMA Cross with Momentum Filter
// ============================================================

function calculateEMASeries(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const multiplier = 2 / (period + 1);
  const results: number[] = [];

  // First EMA is SMA
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  results.push(ema);

  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    results.push(ema);
  }

  return results;
}

export function createEMACrossStrategy(fastPeriod: number = 9, slowPeriod: number = 21) {
  return {
    name: `EMA Cross(${fastPeriod}/${slowPeriod})`,
    precompute: (candles: Candle[]) => {
      const closes = candles.map((c) => c.close);
      return {
        fast: calculateEMASeries(closes, fastPeriod),
        slow: calculateEMASeries(closes, slowPeriod),
      };
    },
    signal: (
      candles: Candle[],
      idx: number,
      data: { fast: number[]; slow: number[] },
    ): 'CALL' | 'PUT' | null => {
      const fastIdx = idx - fastPeriod;
      const slowIdx = idx - slowPeriod;

      if (slowIdx < 1 || slowIdx >= data.slow.length) return null;
      if (fastIdx < 1 || fastIdx >= data.fast.length) return null;

      // Align to slow EMA
      const offset = slowPeriod - fastPeriod;
      const currFast = data.fast[fastIdx + offset];
      const currSlow = data.slow[slowIdx];
      const prevFast = data.fast[fastIdx + offset - 1];
      const prevSlow = data.slow[slowIdx - 1];

      if (currFast === undefined || prevFast === undefined) return null;

      // Golden cross
      if (prevFast < prevSlow && currFast >= currSlow) return 'CALL';
      // Dead cross
      if (prevFast > prevSlow && currFast <= currSlow) return 'PUT';

      return null;
    },
  };
}
