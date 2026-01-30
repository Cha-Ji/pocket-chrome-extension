// ============================================================
// Adaptive Strategy
// ============================================================
// Switches between strategies based on market regime
// - Ranging: RSI reversal strategy
// - Trending: MACD/SMA trend following
// ============================================================

import { Candle } from '../types'
import { RSI, MACD, Stochastic, calculateSMA } from '../../indicators'
import { calculateRegimeSeries, RegimeResult, isTrending, isRanging } from './market-regime'

export interface AdaptiveTrade {
  entryIdx: number
  exitIdx: number
  entryPrice: number
  exitPrice: number
  direction: 'CALL' | 'PUT'
  result: 'WIN' | 'LOSS' | 'TIE'
  profit: number
  regime: string
  strategy: string
}

export interface AdaptiveStats {
  totalTrades: number
  wins: number
  winRate: number
  netProfit: number
  profitFactor: number
  byRegime: Record<string, { trades: number; wins: number; winRate: number; profit: number }>
  byStrategy: Record<string, { trades: number; wins: number; winRate: number; profit: number }>
}

interface PrecomputedIndicators {
  rsi: number[]
  macd: { macd: number; signal: number; histogram: number }[]
  stoch: { k: number; d: number }[]
  smaFast: number[]
  smaSlow: number[]
  regimes: (RegimeResult | null)[]
}

/**
 * Precompute all indicators once
 */
function precompute(candles: Candle[]): PrecomputedIndicators {
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)

  // SMA calculations
  const smaFast: number[] = []
  const smaSlow: number[] = []
  for (let i = 20; i <= closes.length; i++) {
    smaFast.push(calculateSMA(closes.slice(0, i), 10) || 0)
    smaSlow.push(calculateSMA(closes.slice(0, i), 20) || 0)
  }

  return {
    rsi: RSI.calculate(closes, 14),
    macd: MACD.calculate(closes, 12, 26, 9),
    stoch: Stochastic.calculate(highs, lows, closes, 14, 3),
    smaFast,
    smaSlow,
    regimes: calculateRegimeSeries(candles, 14),
  }
}

/**
 * RSI Strategy for ranging markets
 */
function getRSISignal(
  idx: number,
  rsi: number[],
  oversold: number = 30,
  overbought: number = 70
): 'CALL' | 'PUT' | null {
  const rsiIdx = idx - 15 // RSI offset
  if (rsiIdx < 1 || rsiIdx >= rsi.length) return null

  const curr = rsi[rsiIdx]
  const prev = rsi[rsiIdx - 1]

  // Cross above oversold → CALL
  if (prev < oversold && curr >= oversold) return 'CALL'
  // Cross below overbought → PUT
  if (prev > overbought && curr <= overbought) return 'PUT'

  return null
}

/**
 * MACD Strategy for trending markets
 */
function getMACDSignal(
  idx: number,
  macd: { macd: number; signal: number; histogram: number }[],
  regime: RegimeResult | null
): 'CALL' | 'PUT' | null {
  const macdIdx = idx - 35 // MACD offset
  if (macdIdx < 1 || macdIdx >= macd.length) return null

  const curr = macd[macdIdx]
  const prev = macd[macdIdx - 1]

  // Only trade in direction of trend
  const trendDir = regime?.trendDirection || 0

  // MACD crosses above signal
  if (prev.macd < prev.signal && curr.macd >= curr.signal) {
    // In uptrend or neutral, take CALL
    if (trendDir >= 0) return 'CALL'
  }
  // MACD crosses below signal
  if (prev.macd > prev.signal && curr.macd <= curr.signal) {
    // In downtrend or neutral, take PUT
    if (trendDir <= 0) return 'PUT'
  }

  return null
}

/**
 * SMA Crossover for strong trends
 */
function getSMACrossSignal(
  idx: number,
  smaFast: number[],
  smaSlow: number[],
  regime: RegimeResult | null
): 'CALL' | 'PUT' | null {
  const smaIdx = idx - 20 // SMA offset
  if (smaIdx < 1 || smaIdx >= smaFast.length) return null

  const currFast = smaFast[smaIdx]
  const currSlow = smaSlow[smaIdx]
  const prevFast = smaFast[smaIdx - 1]
  const prevSlow = smaSlow[smaIdx - 1]

  const trendDir = regime?.trendDirection || 0

  // Fast crosses above slow
  if (prevFast < prevSlow && currFast >= currSlow && trendDir >= 0) {
    return 'CALL'
  }
  // Fast crosses below slow
  if (prevFast > prevSlow && currFast <= currSlow && trendDir <= 0) {
    return 'PUT'
  }

  return null
}

/**
 * Run adaptive strategy backtest
 */
export function runAdaptiveBacktest(
  candles: Candle[],
  config: {
    payout?: number
    betAmount?: number
    expiryCandles?: number
    trendThreshold?: number
    rangeThreshold?: number
  } = {}
): { trades: AdaptiveTrade[]; stats: AdaptiveStats } {
  const {
    payout = 0.92,
    betAmount = 100,
    expiryCandles = 4,
    trendThreshold = 25,
    rangeThreshold = 20,
  } = config

  const ind = precompute(candles)
  const trades: AdaptiveTrade[] = []

  const startIdx = 50 // Allow indicators to warm up

  for (let i = startIdx; i < candles.length - expiryCandles; i++) {
    const regime = ind.regimes[i]
    let direction: 'CALL' | 'PUT' | null = null
    let strategy = ''

    if (isRanging(regime, rangeThreshold)) {
      // Use RSI in ranging market
      direction = getRSISignal(i, ind.rsi)
      strategy = 'RSI (Ranging)'
    } else if (isTrending(regime, trendThreshold)) {
      // Use MACD or SMA in trending market
      if (regime && regime.adx >= 35) {
        // Strong trend: use SMA crossover
        direction = getSMACrossSignal(i, ind.smaFast, ind.smaSlow, regime)
        strategy = 'SMA Cross (Strong Trend)'
      } else {
        // Moderate trend: use MACD
        direction = getMACDSignal(i, ind.macd, regime)
        strategy = 'MACD (Moderate Trend)'
      }
    } else {
      // Neutral zone (ADX 20-25): use conservative RSI
      direction = getRSISignal(i, ind.rsi, 25, 75) // Stricter levels
      strategy = 'RSI (Neutral)'
    }

    if (direction) {
      const entryPrice = candles[i].close
      const exitIdx = i + expiryCandles
      const exitPrice = candles[exitIdx].close

      let result: 'WIN' | 'LOSS' | 'TIE'
      if (entryPrice === exitPrice) result = 'TIE'
      else if (direction === 'CALL') result = exitPrice > entryPrice ? 'WIN' : 'LOSS'
      else result = exitPrice < entryPrice ? 'WIN' : 'LOSS'

      const profit = result === 'WIN' ? betAmount * payout : result === 'LOSS' ? -betAmount : 0

      trades.push({
        entryIdx: i,
        exitIdx,
        entryPrice,
        exitPrice,
        direction,
        result,
        profit,
        regime: regime?.regime || 'unknown',
        strategy,
      })

      i = exitIdx // Skip to exit
    }
  }

  return { trades, stats: calculateAdaptiveStats(trades, betAmount) }
}

/**
 * Calculate detailed stats with regime and strategy breakdown
 */
function calculateAdaptiveStats(trades: AdaptiveTrade[], betAmount: number = 100): AdaptiveStats {
  const wins = trades.filter(t => t.result === 'WIN').length
  const total = trades.length
  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0)
  const grossProfit = trades.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0)
  const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((s, t) => s + t.profit, 0))

  // Group by regime
  const byRegime: Record<string, { trades: number; wins: number; winRate: number; profit: number }> = {}
  const regimes = [...new Set(trades.map(t => t.regime))]
  for (const regime of regimes) {
    const regimeTrades = trades.filter(t => t.regime === regime)
    const regimeWins = regimeTrades.filter(t => t.result === 'WIN').length
    byRegime[regime] = {
      trades: regimeTrades.length,
      wins: regimeWins,
      winRate: regimeTrades.length > 0 ? (regimeWins / regimeTrades.length) * 100 : 0,
      profit: regimeTrades.reduce((s, t) => s + t.profit, 0),
    }
  }

  // Group by strategy
  const byStrategy: Record<string, { trades: number; wins: number; winRate: number; profit: number }> = {}
  const strategies = [...new Set(trades.map(t => t.strategy))]
  for (const strat of strategies) {
    const stratTrades = trades.filter(t => t.strategy === strat)
    const stratWins = stratTrades.filter(t => t.result === 'WIN').length
    byStrategy[strat] = {
      trades: stratTrades.length,
      wins: stratWins,
      winRate: stratTrades.length > 0 ? (stratWins / stratTrades.length) * 100 : 0,
      profit: stratTrades.reduce((s, t) => s + t.profit, 0),
    }
  }

  return {
    totalTrades: total,
    wins,
    winRate: total > 0 ? (wins / total) * 100 : 0,
    netProfit,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    byRegime,
    byStrategy,
  }
}

/**
 * Format adaptive stats for display
 */
export function formatAdaptiveStats(stats: AdaptiveStats): string {
  let output = ''
  
  const pf = stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)
  const status = stats.winRate >= 53 ? '✅' : '❌'
  
  output += `\n📊 Overall: ${stats.totalTrades} trades | ${stats.winRate.toFixed(1)}% | PF ${pf} | $${stats.netProfit.toFixed(0)} ${status}\n`
  
  output += `\n📈 By Regime:\n`
  for (const [regime, data] of Object.entries(stats.byRegime)) {
    const s = data.winRate >= 53 ? '✅' : '❌'
    output += `   ${regime.padEnd(18)} | ${String(data.trades).padStart(3)} | ${data.winRate.toFixed(1).padStart(5)}% | $${data.profit.toFixed(0).padStart(6)} ${s}\n`
  }
  
  output += `\n🎯 By Strategy:\n`
  for (const [strat, data] of Object.entries(stats.byStrategy)) {
    const s = data.winRate >= 53 ? '✅' : '❌'
    output += `   ${strat.padEnd(25)} | ${String(data.trades).padStart(3)} | ${data.winRate.toFixed(1).padStart(5)}% | $${data.profit.toFixed(0).padStart(6)} ${s}\n`
  }
  
  return output
}
