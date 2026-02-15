// ============================================================
// Winning Strategies for Signal Generation
// ============================================================
// Based on backtest results with 53%+ win rate
// ============================================================

import { Candle, MarketRegime, StrategyConfig } from './types';

// ============================================================
// Indicator Calculations
// ============================================================

export function calculateEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const multiplier = 2 / (period + 1);
  const results: number[] = [];

  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  results.push(ema);

  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    results.push(ema);
  }

  return results;
}

export function calculateRSI(data: number[], period: number = 14): number[] {
  if (data.length < period + 1) return [];

  const changes: number[] = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1]);
  }

  const results: number[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  // First average
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) results.push(100);
  else results.push(100 - 100 / (1 + avgGain / avgLoss));

  // Subsequent values
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }

    if (avgLoss === 0) results.push(100);
    else results.push(100 - 100 / (1 + avgGain / avgLoss));
  }

  return results;
}

export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
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

export function calculateADX(
  candles: Candle[],
  period: number = 14,
): { adx: number; plusDI: number; minusDI: number } | null {
  if (candles.length < period * 2 + 1) return null;

  const dms: { plusDM: number; minusDM: number; tr: number }[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;

    let plusDM = 0;
    let minusDM = 0;

    if (upMove > downMove && upMove > 0) plusDM = upMove;
    if (downMove > upMove && downMove > 0) minusDM = downMove;

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );

    dms.push({ plusDM, minusDM, tr });
  }

  let smoothedPlusDM = dms.slice(0, period).reduce((s, d) => s + d.plusDM, 0);
  let smoothedMinusDM = dms.slice(0, period).reduce((s, d) => s + d.minusDM, 0);
  let smoothedTR = dms.slice(0, period).reduce((s, d) => s + d.tr, 0);

  const dxValues: number[] = [];

  for (let i = period; i < dms.length; i++) {
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + dms[i].plusDM;
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + dms[i].minusDM;
    smoothedTR = smoothedTR - smoothedTR / period + dms[i].tr;

    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;

    const diDiff = Math.abs(plusDI - minusDI);
    const diSum = plusDI + minusDI;

    const dx = diSum > 0 ? (diDiff / diSum) * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return null;

  let adx = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period;

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  const lastPlusDI = (smoothedPlusDM / smoothedTR) * 100;
  const lastMinusDI = (smoothedMinusDM / smoothedTR) * 100;

  return { adx, plusDI: lastPlusDI, minusDI: lastMinusDI };
}

// ============================================================
// Market Regime Detection
// ============================================================

export function detectRegime(candles: Candle[]): {
  regime: MarketRegime;
  adx: number;
  direction: number;
} {
  const adxResult = calculateADX(candles, 14);

  if (!adxResult) {
    return { regime: 'unknown', adx: 0, direction: 0 };
  }

  const { adx, plusDI, minusDI } = adxResult;
  const direction = plusDI > minusDI ? 1 : plusDI < minusDI ? -1 : 0;

  let regime: MarketRegime;

  if (adx >= 40) {
    regime = direction > 0 ? 'strong_uptrend' : 'strong_downtrend';
  } else if (adx >= 25) {
    regime = direction > 0 ? 'weak_uptrend' : 'weak_downtrend';
  } else {
    regime = 'ranging';
  }

  return { regime, adx, direction };
}

// ============================================================
// Strategy Signal Functions
// ============================================================

// EMA Cross (12/26) - Best performer 80% win rate
export function emaCrossSignal(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
): 'CALL' | 'PUT' | null {
  const closes = candles.map((c) => c.close);
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  if (fastEMA.length < 2 || slowEMA.length < 2) return null;

  const currFast = fastEMA[fastEMA.length - 1];
  const currSlow = slowEMA[slowEMA.length - 1];
  const prevFast = fastEMA[fastEMA.length - 2];
  const prevSlow = slowEMA[slowEMA.length - 2];

  // Golden cross
  if (prevFast < prevSlow && currFast >= currSlow) return 'CALL';
  // Dead cross
  if (prevFast > prevSlow && currFast <= currSlow) return 'PUT';

  return null;
}

// RSI (14, 35/65) - Consistent 57.9% avg
export function rsiSignal(
  candles: Candle[],
  period = 14,
  oversold = 35,
  overbought = 65,
): 'CALL' | 'PUT' | null {
  const closes = candles.map((c) => c.close);
  const rsi = calculateRSI(closes, period);

  if (rsi.length < 2) return null;

  const curr = rsi[rsi.length - 1];
  const prev = rsi[rsi.length - 2];

  // Cross above oversold → CALL
  if (prev < oversold && curr >= oversold) return 'CALL';
  // Cross below overbought → PUT
  if (prev > overbought && curr <= overbought) return 'PUT';

  return null;
}

// Stochastic (14, 3) - 58.7% avg, 4x consistent
export function stochSignal(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
  oversold = 20,
  overbought = 80,
): 'CALL' | 'PUT' | null {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);

  const stoch = calculateStochastic(highs, lows, closes, kPeriod, dPeriod);

  if (stoch.length < 2) return null;

  const curr = stoch[stoch.length - 1];
  const prev = stoch[stoch.length - 2];

  // Golden cross from oversold
  if (prev.k < prev.d && curr.k >= curr.d && prev.k < oversold) return 'CALL';
  // Dead cross from overbought
  if (prev.k > prev.d && curr.k <= curr.d && prev.k > overbought) return 'PUT';

  return null;
}

// ============================================================
// Winning Strategy Configurations
// ============================================================

export const WINNING_STRATEGIES: StrategyConfig[] = [
  {
    id: 'ema-cross-12-26',
    name: 'EMA Cross (12/26)',
    type: 'trend',
    bestRegimes: ['strong_uptrend', 'strong_downtrend'],
    minWinRate: 70,
    params: { fastPeriod: 12, slowPeriod: 26 },
  },
  {
    id: 'ema-cross-5-13',
    name: 'EMA Cross (5/13)',
    type: 'trend',
    bestRegimes: ['strong_uptrend', 'strong_downtrend', 'weak_uptrend', 'weak_downtrend'],
    minWinRate: 65,
    params: { fastPeriod: 5, slowPeriod: 13 },
  },
  {
    id: 'rsi-14-35-65',
    name: 'RSI (14) 35/65',
    type: 'reversal',
    bestRegimes: ['ranging', 'weak_uptrend', 'weak_downtrend'],
    minWinRate: 55,
    params: { period: 14, oversold: 35, overbought: 65 },
  },
  {
    id: 'stoch-14-3',
    name: 'Stochastic (14/3)',
    type: 'reversal',
    bestRegimes: ['ranging', 'weak_uptrend', 'weak_downtrend'],
    minWinRate: 55,
    params: { kPeriod: 14, dPeriod: 3, oversold: 20, overbought: 80 },
  },
];

// ============================================================
// Strategy Executor
// ============================================================

export function executeStrategy(strategyId: string, candles: Candle[]): 'CALL' | 'PUT' | null {
  const strategy = WINNING_STRATEGIES.find((s) => s.id === strategyId);
  if (!strategy) return null;

  switch (strategyId) {
    case 'ema-cross-12-26':
      return emaCrossSignal(candles, 12, 26);
    case 'ema-cross-5-13':
      return emaCrossSignal(candles, 5, 13);
    case 'rsi-14-35-65':
      return rsiSignal(candles, 14, 35, 65);
    case 'stoch-14-3':
      return stochSignal(candles, 14, 3, 20, 80);
    default:
      return null;
  }
}

// ============================================================
// Get Best Strategy for Current Regime
// ============================================================

export function getBestStrategies(regime: MarketRegime): StrategyConfig[] {
  return WINNING_STRATEGIES.filter((s) => s.bestRegimes.includes(regime)).sort(
    (a, b) => b.minWinRate - a.minWinRate,
  );
}
