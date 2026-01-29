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
