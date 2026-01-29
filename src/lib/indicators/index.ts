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
  if (data.length < period || period <= 0) return null
  
  const slice = data.slice(-period)
  const sum = slice.reduce((acc, val) => acc + val, 0)
  return sum / period
}

/**
 * Exponential Moving Average (EMA)
 * @param data - Array of prices
 * @param period - Number of periods
 * @returns EMA value or null if insufficient data
 */
export function calculateEMA(data: number[], period: number): number | null {
  if (data.length < period || period <= 0) return null
  
  const multiplier = 2 / (period + 1)
  
  // Start with SMA for first EMA value
  let ema = calculateSMA(data.slice(0, period), period)
  if (ema === null) return null
  
  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema
  }
  
  return ema
}

/**
 * Relative Strength Index (RSI)
 * @param data - Array of prices
 * @param period - Number of periods (typically 14)
 * @returns RSI value (0-100) or null if insufficient data
 */
export function calculateRSI(data: number[], period: number = 14): number | null {
  if (data.length < period + 1 || period <= 0) return null
  
  const changes: number[] = []
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1])
  }
  
  let avgGain = 0
  let avgLoss = 0
  
  // First average
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }
  avgGain /= period
  avgLoss /= period
  
  // Smoothed averages
  for (let i = period; i < changes.length; i++) {
    const change = changes[i]
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period
      avgLoss = (avgLoss * (period - 1)) / period
    } else {
      avgGain = (avgGain * (period - 1)) / period
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period
    }
  }
  
  if (avgLoss === 0) return 100
  
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
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
  stdDev: number = 2
): { upper: number; middle: number; lower: number } | null {
  if (data.length < period || period <= 0) return null
  
  const slice = data.slice(-period)
  const middle = slice.reduce((acc, val) => acc + val, 0) / period
  
  // Calculate standard deviation
  const squaredDiffs = slice.map(val => Math.pow(val - middle, 2))
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period
  const sd = Math.sqrt(variance)
  
  return {
    upper: middle + stdDev * sd,
    middle,
    lower: middle - stdDev * sd,
  }
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
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } | null {
  if (data.length < slowPeriod + signalPeriod || fastPeriod <= 0 || slowPeriod <= 0) return null
  
  // Calculate MACD line for each point
  const macdLine: number[] = []
  for (let i = slowPeriod; i <= data.length; i++) {
    const slice = data.slice(0, i)
    const fastEMA = calculateEMA(slice, fastPeriod)
    const slowEMA = calculateEMA(slice, slowPeriod)
    if (fastEMA !== null && slowEMA !== null) {
      macdLine.push(fastEMA - slowEMA)
    }
  }
  
  if (macdLine.length < signalPeriod) return null
  
  const signal = calculateEMA(macdLine, signalPeriod)
  if (signal === null) return null
  
  const macd = macdLine[macdLine.length - 1]
  
  return {
    macd,
    signal,
    histogram: macd - signal,
  }
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
  dPeriod: number = 3
): { k: number; d: number } | null {
  const minLength = Math.min(highs.length, lows.length, closes.length)
  if (minLength < kPeriod + dPeriod - 1 || kPeriod <= 0 || dPeriod <= 0) return null

  const kValues: number[] = []

  // Calculate %K for each point
  for (let i = kPeriod - 1; i < minLength; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1)
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1)
    const close = closes[i]

    const highestHigh = Math.max(...highSlice)
    const lowestLow = Math.min(...lowSlice)

    const range = highestHigh - lowestLow
    const k = range === 0 ? 50 : ((close - lowestLow) / range) * 100
    kValues.push(k)
  }

  if (kValues.length < dPeriod) return null

  // %K is the latest raw stochastic value
  const k = kValues[kValues.length - 1]

  // %D is SMA of %K
  const dSlice = kValues.slice(-dPeriod)
  const d = dSlice.reduce((sum, val) => sum + val, 0) / dPeriod

  return { k, d }
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
  dPeriod: number = 3
): { k: number; d: number } | null {
  // Use close prices as proxy for high/low (simplified)
  return calculateStochastic(data, data, data, kPeriod, dPeriod)
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
  longParams: [number, number] = [20, 12]
): {
  short: { k: number; d: number } | null
  mid: { k: number; d: number } | null
  long: { k: number; d: number } | null
} {
  return {
    short: calculateStochastic(highs, lows, closes, shortParams[0], shortParams[1]),
    mid: calculateStochastic(highs, lows, closes, midParams[0], midParams[1]),
    long: calculateStochastic(highs, lows, closes, longParams[0], longParams[1]),
  }
}

/**
 * Triple Stochastic from closes only (간편 버전)
 */
export function calculateTripleStochasticFromCloses(
  data: number[],
  shortParams: [number, number] = [5, 3],
  midParams: [number, number] = [10, 6],
  longParams: [number, number] = [20, 12]
): {
  short: { k: number; d: number } | null
  mid: { k: number; d: number } | null
  long: { k: number; d: number } | null
} {
  return calculateTripleStochastic(data, data, data, shortParams, midParams, longParams)
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
  oversold: number = 20
): {
  short: 'overbought' | 'oversold' | 'neutral'
  mid: 'overbought' | 'oversold' | 'neutral'
  long: 'overbought' | 'oversold' | 'neutral'
  allOverbought: boolean
  allOversold: boolean
} {
  const getZone = (stoch: { k: number; d: number } | null) => {
    if (!stoch) return 'neutral'
    if (stoch.k >= overbought) return 'overbought'
    if (stoch.k <= oversold) return 'oversold'
    return 'neutral'
  }

  const shortZone = getZone(triple.short)
  const midZone = getZone(triple.mid)
  const longZone = getZone(triple.long)

  return {
    short: shortZone,
    mid: midZone,
    long: longZone,
    allOverbought: shortZone === 'overbought' && midZone === 'overbought' && longZone === 'overbought',
    allOversold: shortZone === 'oversold' && midZone === 'oversold' && longZone === 'oversold',
  }
}

/**
 * Check if indicator crosses above a threshold
 */
export function crossAbove(current: number, previous: number, threshold: number): boolean {
  return previous < threshold && current >= threshold
}

/**
 * Check if indicator crosses below a threshold
 */
export function crossBelow(current: number, previous: number, threshold: number): boolean {
  return previous > threshold && current <= threshold
}

// ============================================================
// Class-style Wrappers for Backtest Module
// ============================================================

export const RSI = {
  /**
   * Calculate RSI for entire series
   */
  calculate(data: number[], period: number = 14): number[] {
    const results: number[] = []
    for (let i = period + 1; i <= data.length; i++) {
      const slice = data.slice(0, i)
      const rsi = calculateRSI(slice, period)
      if (rsi !== null) results.push(rsi)
    }
    return results
  },

  /**
   * Get latest RSI value
   */
  latest(data: number[], period: number = 14): number | null {
    return calculateRSI(data, period)
  },
}

export const SMA = {
  calculate(data: number[], period: number): number[] {
    const results: number[] = []
    for (let i = period; i <= data.length; i++) {
      const slice = data.slice(0, i)
      const sma = calculateSMA(slice, period)
      if (sma !== null) results.push(sma)
    }
    return results
  },

  latest(data: number[], period: number): number | null {
    return calculateSMA(data, period)
  },
}

export const EMA = {
  calculate(data: number[], period: number): number[] {
    const results: number[] = []
    for (let i = period; i <= data.length; i++) {
      const slice = data.slice(0, i)
      const ema = calculateEMA(slice, period)
      if (ema !== null) results.push(ema)
    }
    return results
  },

  latest(data: number[], period: number): number | null {
    return calculateEMA(data, period)
  },
}

export const BollingerBands = {
  calculate(data: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number }[] {
    const results: { upper: number; middle: number; lower: number }[] = []
    for (let i = period; i <= data.length; i++) {
      const slice = data.slice(0, i)
      const bb = calculateBollingerBands(slice, period, stdDev)
      if (bb !== null) results.push(bb)
    }
    return results
  },

  latest(data: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number } | null {
    return calculateBollingerBands(data, period, stdDev)
  },
}

export const MACD = {
  calculate(data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: number; signal: number; histogram: number }[] {
    const results: { macd: number; signal: number; histogram: number }[] = []
    for (let i = slowPeriod + signalPeriod; i <= data.length; i++) {
      const slice = data.slice(0, i)
      const macd = calculateMACD(slice, fastPeriod, slowPeriod, signalPeriod)
      if (macd !== null) results.push(macd)
    }
    return results
  },

  latest(data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: number; signal: number; histogram: number } | null {
    return calculateMACD(data, fastPeriod, slowPeriod, signalPeriod)
  },
}

export const Stochastic = {
  calculate(highs: number[], lows: number[], closes: number[], kPeriod: number = 14, dPeriod: number = 3, _smooth: number = 1): { k: number; d: number }[] {
    const results: { k: number; d: number }[] = []
    const minLen = Math.min(highs.length, lows.length, closes.length)
    
    for (let i = kPeriod + dPeriod - 1; i <= minLen; i++) {
      const h = highs.slice(0, i)
      const l = lows.slice(0, i)
      const c = closes.slice(0, i)
      const stoch = calculateStochastic(h, l, c, kPeriod, dPeriod)
      if (stoch !== null) results.push(stoch)
    }
    return results
  },

  latest(highs: number[], lows: number[], closes: number[], kPeriod: number = 14, dPeriod: number = 3): { k: number; d: number } | null {
    return calculateStochastic(highs, lows, closes, kPeriod, dPeriod)
  },
}

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
  if (data.length < period || period <= 0) return null
  
  // First SMMA value is SMA
  let smma = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  
  // Calculate subsequent SMMA values
  for (let i = period; i < data.length; i++) {
    smma = (smma * (period - 1) + data[i]) / period
  }
  
  return smma
}

export const SMMA = {
  /**
   * Calculate SMMA for entire series
   */
  calculate(data: number[], period: number): number[] {
    if (data.length < period) return []
    
    const results: number[] = []
    
    // First value is SMA
    let smma = data.slice(0, period).reduce((a, b) => a + b, 0) / period
    results.push(smma)
    
    // Subsequent values
    for (let i = period; i < data.length; i++) {
      smma = (smma * (period - 1) + data[i]) / period
      results.push(smma)
    }
    
    return results
  },

  /**
   * Calculate multiple SMMA lines at once
   */
  calculateMultiple(data: number[], periods: number[]): Map<number, number[]> {
    const result = new Map<number, number[]>()
    for (const period of periods) {
      result.set(period, this.calculate(data, period))
    }
    return result
  },

  /**
   * Get latest SMMA value
   */
  latest(data: number[], period: number): number | null {
    return calculateSMMA(data, period)
  },

  /**
   * Get latest values for multiple periods
   */
  latestMultiple(data: number[], periods: number[]): Map<number, number | null> {
    const result = new Map<number, number | null>()
    for (const period of periods) {
      result.set(period, this.latest(data, period))
    }
    return result
  },
}
