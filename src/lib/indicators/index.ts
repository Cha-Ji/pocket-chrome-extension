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
// Class-style Wrappers for Backtest Module
// ============================================================

export const RSI = {
  /**
   * Calculate RSI for entire series
   */
  calculate(data: number[], period: number = 14): number[] {
    const results: number[] = [];
    for (let i = period + 1; i <= data.length; i++) {
      const slice = data.slice(0, i);
      const rsi = calculateRSI(slice, period);
      if (rsi !== null) results.push(rsi);
    }
    return results;
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
    const results: number[] = [];
    for (let i = period; i <= data.length; i++) {
      const slice = data.slice(0, i);
      const sma = calculateSMA(slice, period);
      if (sma !== null) results.push(sma);
    }
    return results;
  },

  latest(data: number[], period: number): number | null {
    return calculateSMA(data, period);
  },
};

export const EMA = {
  calculate(data: number[], period: number): number[] {
    const results: number[] = [];
    for (let i = period; i <= data.length; i++) {
      const slice = data.slice(0, i);
      const ema = calculateEMA(slice, period);
      if (ema !== null) results.push(ema);
    }
    return results;
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
    const results: { upper: number; middle: number; lower: number }[] = [];
    for (let i = period; i <= data.length; i++) {
      const slice = data.slice(0, i);
      const bb = calculateBollingerBands(slice, period, stdDev);
      if (bb !== null) results.push(bb);
    }
    return results;
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
    const results: { macd: number; signal: number; histogram: number }[] = [];
    for (let i = slowPeriod + signalPeriod; i <= data.length; i++) {
      const slice = data.slice(0, i);
      const macd = calculateMACD(slice, fastPeriod, slowPeriod, signalPeriod);
      if (macd !== null) results.push(macd);
    }
    return results;
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
    const results: { k: number; d: number }[] = [];
    const minLen = Math.min(highs.length, lows.length, closes.length);

    for (let i = kPeriod + dPeriod - 1; i <= minLen; i++) {
      const h = highs.slice(0, i);
      const l = lows.slice(0, i);
      const c = closes.slice(0, i);
      const stoch = calculateStochastic(h, l, c, kPeriod, dPeriod);
      if (stoch !== null) results.push(stoch);
    }
    return results;
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
    const results: number[] = [];
    const minLen = Math.min(highs.length, lows.length, closes.length);

    for (let i = period; i <= minLen; i++) {
      const h = highs.slice(0, i);
      const l = lows.slice(0, i);
      const c = closes.slice(0, i);
      const cci = calculateCCI(h, l, c, period);
      if (cci !== null) results.push(cci);
    }
    return results;
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
    const results: number[] = [];
    const minLen = Math.min(highs.length, lows.length, closes.length);

    for (let i = period; i <= minLen; i++) {
      const h = highs.slice(0, i);
      const l = lows.slice(0, i);
      const c = closes.slice(0, i);
      const wr = calculateWilliamsR(h, l, c, period);
      if (wr !== null) results.push(wr);
    }
    return results;
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

export const SMMA = {
  /**
   * Calculate SMMA for entire series
   */
  calculate(data: number[], period: number): number[] {
    if (data.length < period) return [];

    const results: number[] = [];

    // First value is SMA
    let smma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    results.push(smma);

    // Subsequent values
    for (let i = period; i < data.length; i++) {
      smma = (smma * (period - 1) + data[i]) / period;
      results.push(smma);
    }

    return results;
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
    const results: number[] = [];
    const minLen = Math.min(highs.length, lows.length, closes.length);

    for (let i = period + 1; i <= minLen; i++) {
      const h = highs.slice(0, i);
      const l = lows.slice(0, i);
      const c = closes.slice(0, i);
      const atr = calculateATR(h, l, c, period);
      if (atr !== null) results.push(atr);
    }
    return results;
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

  // Calculate RSI series
  const rsiValues: number[] = [];
  for (let i = rsiPeriod + 1; i <= data.length; i++) {
    const rsi = calculateRSI(data.slice(0, i), rsiPeriod);
    if (rsi !== null) rsiValues.push(rsi);
  }

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
    const results: { k: number; d: number }[] = [];
    const minDataNeeded = rsiPeriod + stochPeriod + kSmooth + dSmooth;

    for (let i = minDataNeeded; i <= data.length; i++) {
      const slice = data.slice(0, i);
      const stochRsi = calculateStochRSI(slice, rsiPeriod, stochPeriod, kSmooth, dSmooth);
      if (stochRsi !== null) results.push(stochRsi);
    }
    return results;
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

    for (let i = 1; i <= minLen; i++) {
      const h = highs.slice(0, i);
      const l = lows.slice(0, i);
      const c = closes.slice(0, i);
      const v = volumes.slice(0, i);
      const vwap = calculateVWAP(h, l, c, v);
      if (vwap !== null) results.push(vwap);
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
