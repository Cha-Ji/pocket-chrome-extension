// ============================================================
// Technical Indicators for Trading Analysis
// ============================================================

/**
 * Simple Moving Average (SMA)
 * @param data - Array of prices
 * @param period - Number of periods
 * @returns SMA value or null if insufficient data
 */
export function calculateSMA(data: number[], period: number): number | null {
  if (data.length < period || period <= 0) return null;

  const slice = data.slice(-period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return sum / period;
}

/**
 * Exponential Moving Average (EMA)
 * @param data - Array of prices
 * @param period - Number of periods
 * @returns EMA value or null if insufficient data
 */
export function calculateEMA(data: number[], period: number): number | null {
  if (data.length < period || period <= 0) return null;

  const multiplier = 2 / (period + 1);

  // Start with SMA for first EMA value
  let ema = calculateSMA(data.slice(0, period), period);
  if (ema === null) return null;

  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Relative Strength Index (RSI)
 * @param data - Array of prices
 * @param period - Number of periods (typically 14)
 * @returns RSI value (0-100) or null if insufficient data
 */
export function calculateRSI(data: number[], period: number = 14): number | null {
  if (data.length < period + 1 || period <= 0) return null;

  const changes: number[] = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  // First average
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smoothed averages
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Bollinger Bands
 * @param data - Array of prices
 * @param period - Number of periods (typically 20)
 * @param stdDev - Standard deviation multiplier (typically 2)
 * @returns { upper, middle, lower } or null if insufficient data
 */
export function calculateBollingerBands(
  data: number[],
  period: number = 20,
  stdDev: number = 2,
): { upper: number; middle: number; lower: number } | null {
  if (data.length < period || period <= 0) return null;

  const slice = data.slice(-period);
  const middle = slice.reduce((acc, val) => acc + val, 0) / period;

  // Calculate standard deviation
  const squaredDiffs = slice.map((val) => Math.pow(val - middle, 2));
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
  const sd = Math.sqrt(variance);

  return {
    upper: middle + stdDev * sd,
    middle,
    lower: middle - stdDev * sd,
  };
}

/**
 * MACD (Moving Average Convergence Divergence)
 * @param data - Array of prices
 * @param fastPeriod - Fast EMA period (typically 12)
 * @param slowPeriod - Slow EMA period (typically 26)
 * @param signalPeriod - Signal line period (typically 9)
 * @returns { macd, signal, histogram } or null if insufficient data
 */
export function calculateMACD(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): { macd: number; signal: number; histogram: number } | null {
  if (data.length < slowPeriod + signalPeriod || fastPeriod <= 0 || slowPeriod <= 0) return null;

  // Calculate MACD line for each point
  const macdLine: number[] = [];
  for (let i = slowPeriod; i <= data.length; i++) {
    const slice = data.slice(0, i);
    const fastEMA = calculateEMA(slice, fastPeriod);
    const slowEMA = calculateEMA(slice, slowPeriod);
    if (fastEMA !== null && slowEMA !== null) {
      macdLine.push(fastEMA - slowEMA);
    }
  }

  if (macdLine.length < signalPeriod) return null;

  const signal = calculateEMA(macdLine, signalPeriod);
  if (signal === null) return null;

  const macd = macdLine[macdLine.length - 1];

  return {
    macd,
    signal,
    histogram: macd - signal,
  };
}

/**
 * Stochastic Oscillator
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of close prices
 * @param kPeriod - %K period (typically 14)
 * @param dPeriod - %D period (typically 3)
 * @returns { k, d } or null if insufficient data
 */
export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
): { k: number; d: number } | null {
  const minLength = Math.min(highs.length, lows.length, closes.length);
  if (minLength < kPeriod + dPeriod - 1 || kPeriod <= 0 || dPeriod <= 0) return null;

  const kValues: number[] = [];

  // Calculate %K for each point
  for (let i = kPeriod - 1; i < minLength; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const close = closes[i];

    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);

    const range = highestHigh - lowestLow;
    const k = range === 0 ? 50 : ((close - lowestLow) / range) * 100;
    kValues.push(k);
  }

  if (kValues.length < dPeriod) return null;

  // %K is the latest raw stochastic value
  const k = kValues[kValues.length - 1];

  // %D is SMA of %K
  const dSlice = kValues.slice(-dPeriod);
  const d = dSlice.reduce((sum, val) => sum + val, 0) / dPeriod;

  return { k, d };
}

/**
 * Fast Stochastic (using close prices only, approximation)
 * Useful when only close prices are available
 * @param data - Array of close prices
 * @param kPeriod - %K period (typically 14)
 * @param dPeriod - %D period (typically 3)
 */
export function calculateStochasticFromCloses(
  data: number[],
  kPeriod: number = 14,
  dPeriod: number = 3,
): { k: number; d: number } | null {
  // Use close prices as proxy for high/low (simplified)
  return calculateStochastic(data, data, data, kPeriod, dPeriod);
}

/**
 * Triple Stochastic (고승덕 3스토캐스틱)
 * 단기/중기/장기 3개의 스토캐스틱을 동시에 계산
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of close prices
 * @param shortParams - 단기 [kPeriod, dPeriod] (default: [5, 3])
 * @param midParams - 중기 [kPeriod, dPeriod] (default: [10, 6])
 * @param longParams - 장기 [kPeriod, dPeriod] (default: [20, 12])
 * @returns { short, mid, long } 각각 { k, d } 값
 */
export function calculateTripleStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  shortParams: [number, number] = [5, 3],
  midParams: [number, number] = [10, 6],
  longParams: [number, number] = [20, 12],
): {
  short: { k: number; d: number } | null;
  mid: { k: number; d: number } | null;
  long: { k: number; d: number } | null;
} {
  return {
    short: calculateStochastic(highs, lows, closes, shortParams[0], shortParams[1]),
    mid: calculateStochastic(highs, lows, closes, midParams[0], midParams[1]),
    long: calculateStochastic(highs, lows, closes, longParams[0], longParams[1]),
  };
}

/**
 * Triple Stochastic from closes only (간편 버전)
 */
export function calculateTripleStochasticFromCloses(
  data: number[],
  shortParams: [number, number] = [5, 3],
  midParams: [number, number] = [10, 6],
  longParams: [number, number] = [20, 12],
): {
  short: { k: number; d: number } | null;
  mid: { k: number; d: number } | null;
  long: { k: number; d: number } | null;
} {
  return calculateTripleStochastic(data, data, data, shortParams, midParams, longParams);
}

/**
 * Check Triple Stochastic zone (과매수/과매도 영역 체크)
 * @param triple - Triple stochastic result
 * @param overbought - 과매수 기준 (default: 80)
 * @param oversold - 과매도 기준 (default: 20)
 */
export function getTripleStochasticZone(
  triple: ReturnType<typeof calculateTripleStochastic>,
  overbought: number = 80,
  oversold: number = 20,
): {
  short: 'overbought' | 'oversold' | 'neutral';
  mid: 'overbought' | 'oversold' | 'neutral';
  long: 'overbought' | 'oversold' | 'neutral';
  allOverbought: boolean;
  allOversold: boolean;
} {
  const getZone = (stoch: { k: number; d: number } | null) => {
    if (!stoch) return 'neutral';
    if (stoch.k >= overbought) return 'overbought';
    if (stoch.k <= oversold) return 'oversold';
    return 'neutral';
  };

  const shortZone = getZone(triple.short);
  const midZone = getZone(triple.mid);
  const longZone = getZone(triple.long);

  return {
    short: shortZone,
    mid: midZone,
    long: longZone,
    allOverbought:
      shortZone === 'overbought' && midZone === 'overbought' && longZone === 'overbought',
    allOversold: shortZone === 'oversold' && midZone === 'oversold' && longZone === 'oversold',
  };
}

/**
 * Check if indicator crosses above a threshold
 */
export function crossAbove(current: number, previous: number, threshold: number): boolean {
  return previous < threshold && current >= threshold;
}

/**
 * Check if indicator crosses below a threshold
 */
export function crossBelow(current: number, previous: number, threshold: number): boolean {
  return previous > threshold && current <= threshold;
}

// ============================================================
// Indicator Cache Infrastructure
// ============================================================
// 백테스트 엔진에서 동일 캔들 데이터에 대해 지표를 반복 계산하는 것을 방지.
// 캐시가 활성화되면 전체 데이터에 대해 1회 계산 후 prefix를 반환.

export interface IIndicatorCacheStore {
  cache: Map<string, unknown>;
  fullCloses: number[];
  fullHighs: number[];
  fullLows: number[];
}

let _activeCache: IIndicatorCacheStore | null = null;

/**
 * 백테스트 엔진이 호출 — 캐시 활성화/비활성화
 * 캐시가 활성화되면 .calculate() 메서드가 전체 데이터 기준으로 1회 계산 후 prefix를 반환
 */
export function setActiveIndicatorCache(cache: IIndicatorCacheStore | null): void {
  _activeCache = cache;
}

// ============================================================
// O(n) Incremental Series Computation Functions
// ============================================================
// 기존 O(n²) slice-per-position 방식 대신 단일 패스로 전체 시리즈를 계산

/** RSI 시리즈: O(n) Wilder 스무딩 */
function _computeRSISeries(data: number[], period: number): number[] {
  if (data.length < period + 1 || period <= 0) return [];

  const results: number[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  // 초기 평균 (changes[0..period-1])
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // 첫 RSI 값
  if (avgLoss === 0) results.push(100);
  else results.push(100 - 100 / (1 + avgGain / avgLoss));

  // 이후 RSI: Wilder's smoothing (증분)
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
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

  return results; // length: data.length - period
}

/** EMA 시리즈: O(n) 순차 계산 */
function _computeEMASeries(data: number[], period: number): number[] {
  if (data.length < period || period <= 0) return [];

  const results: number[] = [];
  const multiplier = 2 / (period + 1);

  // 첫 EMA = SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let ema = sum / period;
  results.push(ema);

  // 이후 EMA: 순차 계산
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    results.push(ema);
  }

  return results; // length: data.length - period + 1
}

/** SMA 시리즈: O(n) 슬라이딩 윈도우 */
function _computeSMASeries(data: number[], period: number): number[] {
  if (data.length < period || period <= 0) return [];

  const results: number[] = [];

  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  results.push(sum / period);

  for (let i = period; i < data.length; i++) {
    sum += data[i] - data[i - period];
    results.push(sum / period);
  }

  return results; // length: data.length - period + 1
}

/** Bollinger Bands 시리즈: O(n * period) — period가 상수이므로 실질 O(n) */
function _computeBBSeries(
  data: number[],
  period: number,
  stdDevMult: number,
): { upper: number; middle: number; lower: number }[] {
  if (data.length < period || period <= 0) return [];

  const results: { upper: number; middle: number; lower: number }[] = [];

  for (let i = 0; i < data.length - period + 1; i++) {
    let sum = 0;
    for (let j = i; j < i + period; j++) sum += data[j];
    const middle = sum / period;

    let sqDiffSum = 0;
    for (let j = i; j < i + period; j++) {
      const diff = data[j] - middle;
      sqDiffSum += diff * diff;
    }
    const sd = Math.sqrt(sqDiffSum / period);

    results.push({
      upper: middle + stdDevMult * sd,
      middle,
      lower: middle - stdDevMult * sd,
    });
  }

  return results; // length: data.length - period + 1
}

/** MACD 시리즈: O(n) — EMA 기반 증분 */
function _computeMACDSeries(
  data: number[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number,
): { macd: number; signal: number; histogram: number }[] {
  if (data.length < slowPeriod + signalPeriod || fastPeriod <= 0 || slowPeriod <= 0) return [];

  // fast/slow EMA 시리즈 (각 O(n))
  const fastEMAs = _computeEMASeries(data, fastPeriod);
  const slowEMAs = _computeEMASeries(data, slowPeriod);

  // MACD 라인: slowEMAs와 정렬된 fastEMAs의 차이
  const offset = slowPeriod - fastPeriod;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEMAs.length; i++) {
    macdLine.push(fastEMAs[i + offset] - slowEMAs[i]);
  }

  if (macdLine.length < signalPeriod) return [];

  // Signal 라인: MACD 라인의 EMA
  const signalEMAs = _computeEMASeries(macdLine, signalPeriod);

  // 결과: signalEMAs[1]부터 시작 (원본 calculateMACD 동작과 일치)
  // signalEMAs[0] = SMA(macdLine[0..signal-1])로, 원본에서는 생성되지 않는 값
  const results: { macd: number; signal: number; histogram: number }[] = [];
  for (let i = 1; i < signalEMAs.length; i++) {
    const macdIdx = i + signalPeriod - 1;
    const macdVal = macdLine[macdIdx];
    const signalVal = signalEMAs[i];
    results.push({
      macd: macdVal,
      signal: signalVal,
      histogram: macdVal - signalVal,
    });
  }

  return results; // length: data.length - slowPeriod - signalPeriod + 1
}

/** Stochastic 시리즈: O(n * kPeriod) — kPeriod 상수이므로 실질 O(n) */
function _computeStochasticSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number,
  dPeriod: number,
): { k: number; d: number }[] {
  const minLen = Math.min(highs.length, lows.length, closes.length);
  if (minLen < kPeriod + dPeriod - 1 || kPeriod <= 0 || dPeriod <= 0) return [];

  // 전체 %K 값 계산
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < minLen; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    const range = hh - ll;
    kValues.push(range === 0 ? 50 : ((closes[i] - ll) / range) * 100);
  }

  // {k, d} 쌍 생성
  const results: { k: number; d: number }[] = [];
  for (let i = dPeriod - 1; i < kValues.length; i++) {
    const k = kValues[i];
    let dSum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) dSum += kValues[j];
    results.push({ k, d: dSum / dPeriod });
  }

  return results; // length: minLen - kPeriod - dPeriod + 2
}

/** ATR 시리즈: O(n) Wilder 스무딩 */
function _computeATRSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): number[] {
  const minLen = Math.min(highs.length, lows.length, closes.length);
  if (minLen < period + 1 || period <= 0) return [];

  // TR 계산
  const trValues: number[] = [];
  for (let i = 1; i < minLen; i++) {
    trValues.push(calculateTrueRange(highs[i], lows[i], closes[i - 1]));
  }

  if (trValues.length < period) return [];

  const results: number[] = [];

  // 첫 ATR = SMA of TR
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trValues[i];
  atr /= period;
  results.push(atr);

  // 이후 ATR: Wilder 스무딩
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
    results.push(atr);
  }

  return results; // length: minLen - period
}

/** CCI 시리즈: O(n * period) — period 상수이므로 실질 O(n) */
function _computeCCISeries(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): number[] {
  const minLen = Math.min(highs.length, lows.length, closes.length);
  if (minLen < period || period <= 0) return [];

  const results: number[] = [];

  for (let i = 0; i < minLen - period + 1; i++) {
    const typicalPrices: number[] = [];
    for (let j = i; j < i + period; j++) {
      typicalPrices.push((highs[j] + lows[j] + closes[j]) / 3);
    }

    const smaTP = typicalPrices.reduce((sum, tp) => sum + tp, 0) / period;
    const meanDeviation =
      typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - smaTP), 0) / period;
    const currentTP = typicalPrices[typicalPrices.length - 1];

    if (meanDeviation === 0) results.push(0);
    else results.push((currentTP - smaTP) / (0.015 * meanDeviation));
  }

  return results; // length: minLen - period + 1
}

/** Williams %R 시리즈: O(n * period) — period 상수이므로 실질 O(n) */
function _computeWilliamsRSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): number[] {
  const minLen = Math.min(highs.length, lows.length, closes.length);
  if (minLen < period || period <= 0) return [];

  const results: number[] = [];

  for (let i = period - 1; i < minLen; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    const range = hh - ll;
    if (range === 0) results.push(-50);
    else results.push(((hh - closes[i]) / range) * -100);
  }

  return results; // length: minLen - period + 1
}

// ============================================================
// Class-style Wrappers for Backtest Module
// ============================================================
// 캐시 활성 시: 전체 데이터에 대해 1회 계산 → prefix 반환 (O(1) per call)
// 캐시 비활성 시: O(n) 증분 계산 (기존 O(n²) 대비 개선)

export const RSI = {
  /**
   * Calculate RSI for entire series
   * 캐시 활성 시 O(1) prefix, 비활성 시 O(n) 증분
   */
  calculate(data: number[], period: number = 14): number[] {
    if (_activeCache) {
      const key = `rsi:${period}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(key, _computeRSISeries(_activeCache.fullCloses, period));
      }
      const full = _activeCache.cache.get(key) as number[];
      const prefixLen = data.length - period;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeRSISeries(data, period);
  },

  /**
   * Get latest RSI value
   */
  latest(data: number[], period: number = 14): number | null {
    return calculateRSI(data, period);
  },
};

export const SMA = {
  calculate(data: number[], period: number): number[] {
    if (_activeCache) {
      const key = `sma:${period}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(key, _computeSMASeries(_activeCache.fullCloses, period));
      }
      const full = _activeCache.cache.get(key) as number[];
      const prefixLen = data.length - period + 1;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeSMASeries(data, period);
  },

  latest(data: number[], period: number): number | null {
    return calculateSMA(data, period);
  },
};

export const EMA = {
  calculate(data: number[], period: number): number[] {
    if (_activeCache) {
      const key = `ema:${period}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(key, _computeEMASeries(_activeCache.fullCloses, period));
      }
      const full = _activeCache.cache.get(key) as number[];
      const prefixLen = data.length - period + 1;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeEMASeries(data, period);
  },

  latest(data: number[], period: number): number | null {
    return calculateEMA(data, period);
  },
};

export const BollingerBands = {
  calculate(
    data: number[],
    period: number = 20,
    stdDev: number = 2,
  ): { upper: number; middle: number; lower: number }[] {
    if (_activeCache) {
      const key = `bb:${period}:${stdDev}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(key, _computeBBSeries(_activeCache.fullCloses, period, stdDev));
      }
      const full = _activeCache.cache.get(key) as { upper: number; middle: number; lower: number }[];
      const prefixLen = data.length - period + 1;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeBBSeries(data, period, stdDev);
  },

  latest(
    data: number[],
    period: number = 20,
    stdDev: number = 2,
  ): { upper: number; middle: number; lower: number } | null {
    return calculateBollingerBands(data, period, stdDev);
  },
};

export const MACD = {
  calculate(
    data: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
  ): { macd: number; signal: number; histogram: number }[] {
    if (_activeCache) {
      const key = `macd:${fastPeriod}:${slowPeriod}:${signalPeriod}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(
          key,
          _computeMACDSeries(_activeCache.fullCloses, fastPeriod, slowPeriod, signalPeriod),
        );
      }
      const full = _activeCache.cache.get(key) as {
        macd: number;
        signal: number;
        histogram: number;
      }[];
      const prefixLen = data.length - slowPeriod - signalPeriod + 1;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeMACDSeries(data, fastPeriod, slowPeriod, signalPeriod);
  },

  latest(
    data: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
  ): { macd: number; signal: number; histogram: number } | null {
    return calculateMACD(data, fastPeriod, slowPeriod, signalPeriod);
  },
};

export const Stochastic = {
  calculate(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number = 14,
    dPeriod: number = 3,
    _smooth: number = 1,
  ): { k: number; d: number }[] {
    if (_activeCache) {
      const key = `stoch:${kPeriod}:${dPeriod}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(
          key,
          _computeStochasticSeries(
            _activeCache.fullHighs,
            _activeCache.fullLows,
            _activeCache.fullCloses,
            kPeriod,
            dPeriod,
          ),
        );
      }
      const full = _activeCache.cache.get(key) as { k: number; d: number }[];
      const minLen = Math.min(highs.length, lows.length, closes.length);
      const prefixLen = minLen - kPeriod - dPeriod + 2;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeStochasticSeries(highs, lows, closes, kPeriod, dPeriod);
  },

  latest(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number = 14,
    dPeriod: number = 3,
  ): { k: number; d: number } | null {
    return calculateStochastic(highs, lows, closes, kPeriod, dPeriod);
  },
};

// ============================================================
// CCI (Commodity Channel Index)
// ============================================================

/**
 * Calculate CCI (Commodity Channel Index)
 * CCI = (Typical Price - SMA of TP) / (0.015 * Mean Deviation)
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of close prices
 * @param period - Number of periods (typically 20)
 * @returns CCI value or null if insufficient data
 */
export function calculateCCI(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 20,
): number | null {
  const minLength = Math.min(highs.length, lows.length, closes.length);
  if (minLength < period || period <= 0) return null;

  // Calculate Typical Prices for the period
  const typicalPrices: number[] = [];
  for (let i = minLength - period; i < minLength; i++) {
    typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
  }

  // Calculate SMA of Typical Prices
  const smaTP = typicalPrices.reduce((sum, tp) => sum + tp, 0) / period;

  // Calculate Mean Deviation
  const meanDeviation = typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - smaTP), 0) / period;

  // Current Typical Price
  const currentTP = typicalPrices[typicalPrices.length - 1];

  // Avoid division by zero
  if (meanDeviation === 0) return 0;

  // CCI = (TP - SMA(TP)) / (0.015 * Mean Deviation)
  return (currentTP - smaTP) / (0.015 * meanDeviation);
}

export const CCI = {
  /**
   * Calculate CCI for entire series
   */
  calculate(highs: number[], lows: number[], closes: number[], period: number = 20): number[] {
    if (_activeCache) {
      const key = `cci:${period}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(
          key,
          _computeCCISeries(
            _activeCache.fullHighs,
            _activeCache.fullLows,
            _activeCache.fullCloses,
            period,
          ),
        );
      }
      const full = _activeCache.cache.get(key) as number[];
      const minLen = Math.min(highs.length, lows.length, closes.length);
      const prefixLen = minLen - period + 1;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeCCISeries(highs, lows, closes, period);
  },

  /**
   * Get latest CCI value
   */
  latest(highs: number[], lows: number[], closes: number[], period: number = 20): number | null {
    return calculateCCI(highs, lows, closes, period);
  },
};

// ============================================================
// Williams %R
// ============================================================

/**
 * Calculate Williams %R
 * %R = (Highest High - Close) / (Highest High - Lowest Low) * -100
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of close prices
 * @param period - Number of periods (typically 14)
 * @returns Williams %R value (-100 to 0) or null if insufficient data
 */
export function calculateWilliamsR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number | null {
  const minLength = Math.min(highs.length, lows.length, closes.length);
  if (minLength < period || period <= 0) return null;

  const highSlice = highs.slice(-period);
  const lowSlice = lows.slice(-period);
  const currentClose = closes[closes.length - 1];

  const highestHigh = Math.max(...highSlice);
  const lowestLow = Math.min(...lowSlice);

  const range = highestHigh - lowestLow;
  if (range === 0) return -50; // Neutral when no range

  // Williams %R = (Highest High - Close) / (Highest High - Lowest Low) * -100
  return ((highestHigh - currentClose) / range) * -100;
}

export const WilliamsR = {
  /**
   * Calculate Williams %R for entire series
   */
  calculate(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
    if (_activeCache) {
      const key = `wr:${period}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(
          key,
          _computeWilliamsRSeries(
            _activeCache.fullHighs,
            _activeCache.fullLows,
            _activeCache.fullCloses,
            period,
          ),
        );
      }
      const full = _activeCache.cache.get(key) as number[];
      const minLen = Math.min(highs.length, lows.length, closes.length);
      const prefixLen = minLen - period + 1;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeWilliamsRSeries(highs, lows, closes, period);
  },

  /**
   * Get latest Williams %R value
   */
  latest(highs: number[], lows: number[], closes: number[], period: number = 14): number | null {
    return calculateWilliamsR(highs, lows, closes, period);
  },
};

// ============================================================
// SMMA (Smoothed Moving Average)
// Used in 비트신옵션 SMMA+Stochastic strategy
// ============================================================

/**
 * Calculate SMMA (Smoothed Moving Average)
 * SMMA = (SMMA_prev * (period - 1) + close) / period
 * First value is SMA
 */
export function calculateSMMA(data: number[], period: number): number | null {
  if (data.length < period || period <= 0) return null;

  // First SMMA value is SMA
  let smma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Calculate subsequent SMMA values
  for (let i = period; i < data.length; i++) {
    smma = (smma * (period - 1) + data[i]) / period;
  }

  return smma;
}

/** SMMA 시리즈: 이미 O(n) — 캐시만 추가 */
function _computeSMMASeries(data: number[], period: number): number[] {
  if (data.length < period || period <= 0) return [];

  const results: number[] = [];
  let smma = 0;
  for (let i = 0; i < period; i++) smma += data[i];
  smma /= period;
  results.push(smma);

  for (let i = period; i < data.length; i++) {
    smma = (smma * (period - 1) + data[i]) / period;
    results.push(smma);
  }

  return results;
}

export const SMMA = {
  /**
   * Calculate SMMA for entire series
   */
  calculate(data: number[], period: number): number[] {
    if (_activeCache) {
      const key = `smma:${period}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(key, _computeSMMASeries(_activeCache.fullCloses, period));
      }
      const full = _activeCache.cache.get(key) as number[];
      const prefixLen = data.length - period + 1;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeSMMASeries(data, period);
  },

  /**
   * Calculate multiple SMMA lines at once
   */
  calculateMultiple(data: number[], periods: number[]): Map<number, number[]> {
    const result = new Map<number, number[]>();
    for (const period of periods) {
      result.set(period, this.calculate(data, period));
    }
    return result;
  },

  /**
   * Get latest SMMA value
   */
  latest(data: number[], period: number): number | null {
    return calculateSMMA(data, period);
  },

  /**
   * Get latest values for multiple periods
   */
  latestMultiple(data: number[], periods: number[]): Map<number, number | null> {
    const result = new Map<number, number | null>();
    for (const period of periods) {
      result.set(period, this.latest(data, period));
    }
    return result;
  },
};

// ============================================================
// ATR (Average True Range)
// ============================================================

/**
 * Calculate True Range
 * TR = max(high - low, |high - prevClose|, |low - prevClose|)
 */
export function calculateTrueRange(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

/**
 * Calculate ATR (Average True Range)
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of close prices
 * @param period - Number of periods (typically 14)
 * @returns ATR value or null if insufficient data
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): number | null {
  const minLength = Math.min(highs.length, lows.length, closes.length);
  if (minLength < period + 1 || period <= 0) return null;

  // Calculate True Range for each candle
  const trValues: number[] = [];
  for (let i = 1; i < minLength; i++) {
    trValues.push(calculateTrueRange(highs[i], lows[i], closes[i - 1]));
  }

  if (trValues.length < period) return null;

  // First ATR is simple average
  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Subsequent ATRs use smoothing (Wilder's method)
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  return atr;
}

export const ATR = {
  /**
   * Calculate ATR for entire series
   */
  calculate(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
    if (_activeCache) {
      const key = `atr:${period}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(
          key,
          _computeATRSeries(
            _activeCache.fullHighs,
            _activeCache.fullLows,
            _activeCache.fullCloses,
            period,
          ),
        );
      }
      const full = _activeCache.cache.get(key) as number[];
      const minLen = Math.min(highs.length, lows.length, closes.length);
      const prefixLen = minLen - period;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeATRSeries(highs, lows, closes, period);
  },

  /**
   * Get latest ATR value
   */
  latest(highs: number[], lows: number[], closes: number[], period: number = 14): number | null {
    return calculateATR(highs, lows, closes, period);
  },
};

// ============================================================
// Stochastic RSI
// ============================================================

/**
 * Calculate Stochastic RSI
 * StochRSI = (RSI - RSI Low) / (RSI High - RSI Low)
 * @param data - Array of close prices
 * @param rsiPeriod - RSI period (typically 14)
 * @param stochPeriod - Stochastic period for RSI (typically 14)
 * @param kSmooth - %K smoothing period (typically 3)
 * @param dSmooth - %D smoothing period (typically 3)
 * @returns { k, d } values (0-100) or null if insufficient data
 */
export function calculateStochRSI(
  data: number[],
  rsiPeriod: number = 14,
  stochPeriod: number = 14,
  kSmooth: number = 3,
  dSmooth: number = 3,
): { k: number; d: number } | null {
  // Need enough data for RSI calculation plus stochastic period
  if (data.length < rsiPeriod + stochPeriod + kSmooth + dSmooth) return null;

  // Calculate RSI series (증분 사용)
  const rsiValues = _computeRSISeries(data, rsiPeriod);

  if (rsiValues.length < stochPeriod + kSmooth + dSmooth - 1) return null;

  // Calculate raw Stochastic RSI values
  const rawStochRSI: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const rsiSlice = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const rsiHigh = Math.max(...rsiSlice);
    const rsiLow = Math.min(...rsiSlice);
    const range = rsiHigh - rsiLow;

    if (range === 0) {
      rawStochRSI.push(50); // Neutral when no range
    } else {
      rawStochRSI.push(((rsiValues[i] - rsiLow) / range) * 100);
    }
  }

  if (rawStochRSI.length < kSmooth + dSmooth - 1) return null;

  // Apply %K smoothing (SMA)
  const kValues: number[] = [];
  for (let i = kSmooth - 1; i < rawStochRSI.length; i++) {
    const kSlice = rawStochRSI.slice(i - kSmooth + 1, i + 1);
    kValues.push(kSlice.reduce((a, b) => a + b, 0) / kSmooth);
  }

  if (kValues.length < dSmooth) return null;

  // Calculate %D (SMA of %K)
  const dSlice = kValues.slice(-dSmooth);
  const d = dSlice.reduce((a, b) => a + b, 0) / dSmooth;
  const k = kValues[kValues.length - 1];

  return { k, d };
}

/** StochRSI 시리즈: RSI 시리즈를 재활용하여 전체 계산 */
function _computeStochRSISeries(
  data: number[],
  rsiPeriod: number,
  stochPeriod: number,
  kSmooth: number,
  dSmooth: number,
): { k: number; d: number }[] {
  const minDataNeeded = rsiPeriod + stochPeriod + kSmooth + dSmooth;
  if (data.length < minDataNeeded) return [];

  // RSI 전체 시리즈 (O(n))
  const rsiValues = _computeRSISeries(data, rsiPeriod);

  // Raw StochRSI
  const rawStochRSI: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    let rsiHigh = -Infinity;
    let rsiLow = Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsiValues[j] > rsiHigh) rsiHigh = rsiValues[j];
      if (rsiValues[j] < rsiLow) rsiLow = rsiValues[j];
    }
    const range = rsiHigh - rsiLow;
    rawStochRSI.push(range === 0 ? 50 : ((rsiValues[i] - rsiLow) / range) * 100);
  }

  // %K smoothing (SMA)
  const kValues: number[] = [];
  for (let i = kSmooth - 1; i < rawStochRSI.length; i++) {
    let sum = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) sum += rawStochRSI[j];
    kValues.push(sum / kSmooth);
  }

  // {k, d} 쌍 생성
  // dSmooth + 1에서 시작: calculateStochRSI의 minDataNeeded guard와 동일한 결과 개수 보장
  // (dSmooth - 1에서 시작하면 2개 초과 생성됨)
  const results: { k: number; d: number }[] = [];
  for (let i = dSmooth + 1; i < kValues.length; i++) {
    const k = kValues[i];
    let dSum = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) dSum += kValues[j];
    results.push({ k, d: dSum / dSmooth });
  }

  return results;
}

export const StochRSI = {
  /**
   * Calculate Stochastic RSI for entire series
   */
  calculate(
    data: number[],
    rsiPeriod: number = 14,
    stochPeriod: number = 14,
    kSmooth: number = 3,
    dSmooth: number = 3,
  ): { k: number; d: number }[] {
    if (_activeCache) {
      const key = `stochrsi:${rsiPeriod}:${stochPeriod}:${kSmooth}:${dSmooth}`;
      if (!_activeCache.cache.has(key)) {
        _activeCache.cache.set(
          key,
          _computeStochRSISeries(
            _activeCache.fullCloses,
            rsiPeriod,
            stochPeriod,
            kSmooth,
            dSmooth,
          ),
        );
      }
      const full = _activeCache.cache.get(key) as { k: number; d: number }[];
      const minDataNeeded = rsiPeriod + stochPeriod + kSmooth + dSmooth;
      const prefixLen = data.length - minDataNeeded + 1;
      return prefixLen <= 0 ? [] : full.slice(0, prefixLen);
    }
    return _computeStochRSISeries(data, rsiPeriod, stochPeriod, kSmooth, dSmooth);
  },

  /**
   * Get latest Stochastic RSI value
   */
  latest(
    data: number[],
    rsiPeriod: number = 14,
    stochPeriod: number = 14,
    kSmooth: number = 3,
    dSmooth: number = 3,
  ): { k: number; d: number } | null {
    return calculateStochRSI(data, rsiPeriod, stochPeriod, kSmooth, dSmooth);
  },
};

// Alias for compatibility
export const calculateStochasticRSI = calculateStochRSI;
export const StochasticRSI = StochRSI;

// ============================================================
// ADX (Average Directional Index)
// ============================================================

/**
 * Calculate +DI and -DI (internal helper)
 */
function calculateDI(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): { plusDI: number; minusDI: number } | null {
  const minLength = Math.min(highs.length, lows.length, closes.length);
  if (minLength < period + 1) return null;

  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  const trueRanges: number[] = [];

  for (let i = 1; i < minLength; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    if (upMove > downMove && upMove > 0) {
      plusDMs.push(upMove);
      minusDMs.push(0);
    } else if (downMove > upMove && downMove > 0) {
      plusDMs.push(0);
      minusDMs.push(downMove);
    } else {
      plusDMs.push(0);
      minusDMs.push(0);
    }

    trueRanges.push(calculateTrueRange(highs[i], lows[i], closes[i - 1]));
  }

  if (plusDMs.length < period) return null;

  let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);

  for (let i = period; i < plusDMs.length; i++) {
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i];
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
  }

  const plusDI = smoothedTR === 0 ? 0 : (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = smoothedTR === 0 ? 0 : (smoothedMinusDM / smoothedTR) * 100;

  return { plusDI, minusDI };
}

/**
 * Calculate ADX (Average Directional Index)
 * Measures trend strength regardless of direction
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of close prices
 * @param period - Number of periods (typically 14)
 * @returns { adx, plusDI, minusDI } or null if insufficient data
 */
export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14,
): { adx: number; plusDI: number; minusDI: number } | null {
  const minLength = Math.min(highs.length, lows.length, closes.length);
  if (minLength < period * 2 || period <= 0) return null;

  const dxValues: number[] = [];

  for (let i = period + 1; i <= minLength; i++) {
    const h = highs.slice(0, i);
    const l = lows.slice(0, i);
    const c = closes.slice(0, i);
    const di = calculateDI(h, l, c, period);

    if (di) {
      const diSum = di.plusDI + di.minusDI;
      const dx = diSum === 0 ? 0 : (Math.abs(di.plusDI - di.minusDI) / diSum) * 100;
      dxValues.push(dx);
    }
  }

  if (dxValues.length < period) return null;

  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  const latestDI = calculateDI(highs, lows, closes, period);
  if (!latestDI) return null;

  return {
    adx,
    plusDI: latestDI.plusDI,
    minusDI: latestDI.minusDI,
  };
}

export const ADX = {
  /**
   * Calculate ADX for entire series
   */
  calculate(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14,
  ): { adx: number; plusDI: number; minusDI: number }[] {
    const results: { adx: number; plusDI: number; minusDI: number }[] = [];
    const minLen = Math.min(highs.length, lows.length, closes.length);

    for (let i = period * 2; i <= minLen; i++) {
      const h = highs.slice(0, i);
      const l = lows.slice(0, i);
      const c = closes.slice(0, i);
      const adx = calculateADX(h, l, c, period);
      if (adx !== null) results.push(adx);
    }
    return results;
  },

  /**
   * Get latest ADX value
   */
  latest(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14,
  ): { adx: number; plusDI: number; minusDI: number } | null {
    return calculateADX(highs, lows, closes, period);
  },
};

// ============================================================
// VWAP (Volume Weighted Average Price)
// ============================================================

/**
 * Calculate VWAP (Volume Weighted Average Price)
 * VWAP = Cumulative(Typical Price * Volume) / Cumulative(Volume)
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of close prices
 * @param volumes - Array of volumes
 * @returns VWAP value or null if insufficient data
 */
export function calculateVWAP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): number | null {
  const minLength = Math.min(highs.length, lows.length, closes.length, volumes.length);
  if (minLength === 0) return null;

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < minLength; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    cumulativeTPV += typicalPrice * volumes[i];
    cumulativeVolume += volumes[i];
  }

  if (cumulativeVolume === 0) return null;

  return cumulativeTPV / cumulativeVolume;
}

/**
 * Calculate VWAP from candles
 */
export function calculateVWAPFromCandles(
  candles: Array<{ high: number; low: number; close: number; volume?: number }>,
): number | null {
  if (candles.length === 0) return null;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume ?? 0);

  return calculateVWAP(highs, lows, closes, volumes);
}

export const VWAP = {
  /**
   * Calculate VWAP for entire series (cumulative)
   */
  calculate(highs: number[], lows: number[], closes: number[], volumes: number[]): number[] {
    const results: number[] = [];
    const minLen = Math.min(highs.length, lows.length, closes.length, volumes.length);

    let cumulativeTPV = 0;
    let cumulativeVolume = 0;

    for (let i = 0; i < minLen; i++) {
      const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
      cumulativeTPV += typicalPrice * volumes[i];
      cumulativeVolume += volumes[i];
      if (cumulativeVolume > 0) {
        results.push(cumulativeTPV / cumulativeVolume);
      }
    }
    return results;
  },

  /**
   * Get latest VWAP value
   */
  latest(highs: number[], lows: number[], closes: number[], volumes: number[]): number | null {
    return calculateVWAP(highs, lows, closes, volumes);
  },

  /**
   * Calculate from candles
   */
  fromCandles(
    candles: Array<{ high: number; low: number; close: number; volume?: number }>,
  ): number | null {
    return calculateVWAPFromCandles(candles);
  },
};

// ============================================================
// Export Types
// ============================================================
export * from './types';
