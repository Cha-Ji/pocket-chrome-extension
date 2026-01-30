// ============================================================
// Multi-Strategy Backtest Framework
// ============================================================
// Compare multiple strategies on the same data
// ============================================================

import { Candle } from '../types'
import { 
  RSI, 
  BollingerBands, 
  MACD, 
  Stochastic,
  calculateSMA,
} from '../../indicators'

export interface StrategyResult {
  name: string
  trades: StrategyTrade[]
  stats: StrategyStats
}

export interface StrategyTrade {
  entryIdx: number
  exitIdx: number
  direction: 'CALL' | 'PUT'
  result: 'WIN' | 'LOSS' | 'TIE'
  profit: number
}

export interface StrategyStats {
  totalTrades: number
  wins: number
  winRate: number
  netProfit: number
  profitFactor: number
}

type SignalFn = (candles: Candle[], idx: number, precomputed: any) => 'CALL' | 'PUT' | null

// ============================================================
// Strategy Definitions
// ============================================================

/**
 * RSI Overbought/Oversold Strategy
 * CALL: RSI crosses above oversold (30)
 * PUT: RSI crosses below overbought (70)
 */
export function createRSIStrategy(period: number = 14, oversold: number = 30, overbought: number = 70) {
  return {
    name: `RSI(${period}) OS=${oversold} OB=${overbought}`,
    precompute: (candles: Candle[]) => {
      const closes = candles.map(c => c.close)
      return RSI.calculate(closes, period)
    },
    signal: (candles: Candle[], idx: number, rsiValues: number[]): 'CALL' | 'PUT' | null => {
      const rsiIdx = idx - period
      if (rsiIdx < 1 || rsiIdx >= rsiValues.length) return null

      const curr = rsiValues[rsiIdx]
      const prev = rsiValues[rsiIdx - 1]

      // Cross above oversold → CALL
      if (prev < oversold && curr >= oversold) return 'CALL'
      // Cross below overbought → PUT
      if (prev > overbought && curr <= overbought) return 'PUT'

      return null
    },
  }
}

/**
 * Bollinger Bands Bounce Strategy
 * CALL: Price touches lower band
 * PUT: Price touches upper band
 */
export function createBBStrategy(period: number = 20, stdDev: number = 2) {
  return {
    name: `BB(${period}, ${stdDev})`,
    precompute: (candles: Candle[]) => {
      const closes = candles.map(c => c.close)
      return BollingerBands.calculate(closes, period, stdDev)
    },
    signal: (candles: Candle[], idx: number, bbValues: { upper: number; middle: number; lower: number }[]): 'CALL' | 'PUT' | null => {
      const bbIdx = idx - period
      if (bbIdx < 0 || bbIdx >= bbValues.length) return null

      const bb = bbValues[bbIdx]
      const price = candles[idx].close
      const prevPrice = candles[idx - 1]?.close

      if (!prevPrice) return null

      // Touch lower band and bounce → CALL
      if (prevPrice <= bb.lower && price > bb.lower) return 'CALL'
      // Touch upper band and bounce → PUT
      if (prevPrice >= bb.upper && price < bb.upper) return 'PUT'

      return null
    },
  }
}

/**
 * MACD Crossover Strategy
 * CALL: MACD crosses above signal
 * PUT: MACD crosses below signal
 */
export function createMACDStrategy(fast: number = 12, slow: number = 26, signal: number = 9) {
  return {
    name: `MACD(${fast},${slow},${signal})`,
    precompute: (candles: Candle[]) => {
      const closes = candles.map(c => c.close)
      return MACD.calculate(closes, fast, slow, signal)
    },
    signal: (candles: Candle[], idx: number, macdValues: { macd: number; signal: number; histogram: number }[]): 'CALL' | 'PUT' | null => {
      const macdIdx = idx - slow - signal
      if (macdIdx < 1 || macdIdx >= macdValues.length) return null

      const curr = macdValues[macdIdx]
      const prev = macdValues[macdIdx - 1]

      // MACD crosses above signal → CALL
      if (prev.macd < prev.signal && curr.macd >= curr.signal) return 'CALL'
      // MACD crosses below signal → PUT
      if (prev.macd > prev.signal && curr.macd <= curr.signal) return 'PUT'

      return null
    },
  }
}

/**
 * Stochastic Crossover Strategy (Simpler version)
 * CALL: %K crosses above %D from oversold
 * PUT: %K crosses below %D from overbought
 */
export function createStochStrategy(kPeriod: number = 14, dPeriod: number = 3, oversold: number = 20, overbought: number = 80) {
  return {
    name: `Stoch(${kPeriod},${dPeriod})`,
    precompute: (candles: Candle[]) => {
      const highs = candles.map(c => c.high)
      const lows = candles.map(c => c.low)
      const closes = candles.map(c => c.close)
      return Stochastic.calculate(highs, lows, closes, kPeriod, dPeriod)
    },
    signal: (candles: Candle[], idx: number, stochValues: { k: number; d: number }[]): 'CALL' | 'PUT' | null => {
      const stochIdx = idx - kPeriod - dPeriod + 1
      if (stochIdx < 1 || stochIdx >= stochValues.length) return null

      const curr = stochValues[stochIdx]
      const prev = stochValues[stochIdx - 1]

      // Golden cross from oversold → CALL
      if (prev.k < prev.d && curr.k >= curr.d && prev.k < oversold) return 'CALL'
      // Dead cross from overbought → PUT
      if (prev.k > prev.d && curr.k <= curr.d && prev.k > overbought) return 'PUT'

      return null
    },
  }
}

/**
 * SMA Crossover Strategy
 * CALL: Fast SMA crosses above Slow SMA
 * PUT: Fast SMA crosses below Slow SMA
 */
export function createSMACrossStrategy(fastPeriod: number = 10, slowPeriod: number = 20) {
  return {
    name: `SMA Cross(${fastPeriod}/${slowPeriod})`,
    precompute: (candles: Candle[]) => {
      const closes = candles.map(c => c.close)
      const fast: number[] = []
      const slow: number[] = []
      
      for (let i = slowPeriod; i <= closes.length; i++) {
        const slice = closes.slice(0, i)
        fast.push(calculateSMA(slice, fastPeriod) || 0)
        slow.push(calculateSMA(slice, slowPeriod) || 0)
      }
      
      return { fast, slow }
    },
    signal: (candles: Candle[], idx: number, smas: { fast: number[]; slow: number[] }): 'CALL' | 'PUT' | null => {
      const smaIdx = idx - slowPeriod
      if (smaIdx < 1 || smaIdx >= smas.fast.length) return null

      const currFast = smas.fast[smaIdx]
      const currSlow = smas.slow[smaIdx]
      const prevFast = smas.fast[smaIdx - 1]
      const prevSlow = smas.slow[smaIdx - 1]

      // Fast crosses above slow → CALL
      if (prevFast < prevSlow && currFast >= currSlow) return 'CALL'
      // Fast crosses below slow → PUT
      if (prevFast > prevSlow && currFast <= currSlow) return 'PUT'

      return null
    },
  }
}

// ============================================================
// Backtest Runner
// ============================================================

export function runStrategyBacktest(
  candles: Candle[],
  strategy: { name: string; precompute: (c: Candle[]) => any; signal: SignalFn },
  config: { payout?: number; betAmount?: number; expiryCandles?: number } = {}
): StrategyResult {
  const { payout = 0.92, betAmount = 100, expiryCandles = 4 } = config

  const precomputed = strategy.precompute(candles)
  const trades: StrategyTrade[] = []

  const startIdx = 60 // Allow indicators to warm up

  for (let i = startIdx; i < candles.length - expiryCandles; i++) {
    const direction = strategy.signal(candles, i, precomputed)

    if (direction) {
      const entryPrice = candles[i].close
      const exitIdx = i + expiryCandles
      const exitPrice = candles[exitIdx].close

      let result: 'WIN' | 'LOSS' | 'TIE'
      if (entryPrice === exitPrice) result = 'TIE'
      else if (direction === 'CALL') result = exitPrice > entryPrice ? 'WIN' : 'LOSS'
      else result = exitPrice < entryPrice ? 'WIN' : 'LOSS'

      const profit = result === 'WIN' ? betAmount * payout : result === 'LOSS' ? -betAmount : 0

      trades.push({ entryIdx: i, exitIdx, direction, result, profit })
      i = exitIdx // Skip to exit
    }
  }

  const wins = trades.filter(t => t.result === 'WIN').length
  const total = trades.length
  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0)
  const grossProfit = trades.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0)
  const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((s, t) => s + t.profit, 0))

  return {
    name: strategy.name,
    trades,
    stats: {
      totalTrades: total,
      wins,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      netProfit,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    },
  }
}

/**
 * Compare multiple strategies on the same data
 */
export function compareStrategies(
  candles: Candle[],
  strategies: { name: string; precompute: (c: Candle[]) => any; signal: SignalFn }[],
  config?: { payout?: number; betAmount?: number; expiryCandles?: number }
): StrategyResult[] {
  return strategies.map(s => runStrategyBacktest(candles, s, config))
}

/**
 * Format comparison results
 */
export function formatComparison(results: StrategyResult[]): string {
  const sorted = [...results].sort((a, b) => b.stats.profitFactor - a.stats.profitFactor)
  
  let output = ''
  sorted.forEach((r, i) => {
    const status = r.stats.winRate >= 53 ? '✅' : '❌'
    const pf = r.stats.profitFactor === Infinity ? '∞' : r.stats.profitFactor.toFixed(2)
    output += `${(i + 1).toString().padStart(2)}. ${r.name.padEnd(25)} | ${String(r.stats.totalTrades).padStart(3)} | ${r.stats.winRate.toFixed(1).padStart(5)}% | PF ${pf.padStart(5)} | $${r.stats.netProfit.toFixed(0).padStart(6)} ${status}\n`
  })
  
  return output
}
