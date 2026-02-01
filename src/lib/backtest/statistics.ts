// ============================================================
// Backtest Statistics Module
// ============================================================
// Comprehensive statistics for backtest results
// ============================================================

import { BacktestTrade, TradeResult, Direction } from './types'

export interface DetailedStatistics {
  // Basic Stats
  totalTrades: number
  wins: number
  losses: number
  ties: number
  winRate: number
  lossRate: number

  // Profit Stats
  grossProfit: number
  grossLoss: number
  netProfit: number
  netProfitPercent: number
  profitFactor: number
  expectancy: number
  averageWin: number
  averageLoss: number
  largestWin: number
  largestLoss: number
  
  // Risk Stats
  maxDrawdown: number
  maxDrawdownPercent: number
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
  recoveryFactor: number
  
  // Direction Stats
  callTrades: number
  putTrades: number
  callWinRate: number
  putWinRate: number
  callProfit: number
  putProfit: number
  
  // Time Stats
  tradesPerHour: number
  averageTradeGapMs: number
  tradingDurationMs: number
  busiestHour: number
  quietestHour: number
  
  // Hourly Breakdown
  hourlyStats: HourlyStats[]
  
  // Streak Analysis
  currentStreak: { type: 'win' | 'loss' | 'none'; count: number }
  streaks: StreakInfo[]
  
  // Advanced Metrics
  sharpeRatio: number
  sortinoRatio: number
  calmarRatio: number
  
  // Trade Distribution
  winDistribution: { range: string; count: number }[]
  lossDistribution: { range: string; count: number }[]
}

export interface HourlyStats {
  hour: number
  trades: number
  wins: number
  losses: number
  winRate: number
  profit: number
}

export interface StreakInfo {
  type: 'win' | 'loss'
  count: number
  startIndex: number
  endIndex: number
  profit: number
}

/**
 * Calculate comprehensive statistics from backtest trades
 */
export function calculateDetailedStatistics(
  trades: BacktestTrade[],
  initialBalance: number,
  riskFreeRate: number = 0.02 // Annual risk-free rate
): DetailedStatistics {
  if (trades.length === 0) {
    return getEmptyStatistics()
  }

  // Basic counts
  const wins = trades.filter(t => t.result === 'WIN')
  const losses = trades.filter(t => t.result === 'LOSS')
  const ties = trades.filter(t => t.result === 'TIE')
  
  const totalTrades = trades.length
  const winCount = wins.length
  const lossCount = losses.length
  const tieCount = ties.length

  // Profit calculations
  const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0))
  const netProfit = grossProfit - grossLoss
  
  // Direction breakdown
  const callTrades = trades.filter(t => t.direction === 'CALL')
  const putTrades = trades.filter(t => t.direction === 'PUT')
  const callWins = callTrades.filter(t => t.result === 'WIN').length
  const putWins = putTrades.filter(t => t.result === 'WIN').length

  // Time analysis
  const timestamps = trades.map(t => t.entryTime)
  const tradingDurationMs = timestamps.length > 1 
    ? timestamps[timestamps.length - 1] - timestamps[0] 
    : 0
  
  const hourlyStats = calculateHourlyStats(trades)
  const busiestHour = hourlyStats.reduce((max, h) => h.trades > max.trades ? h : max, hourlyStats[0])
  const quietestHour = hourlyStats.reduce((min, h) => h.trades < min.trades ? h : min, hourlyStats[0])

  // Streak analysis
  const streaks = calculateStreaks(trades)
  const winStreaks = streaks.filter(s => s.type === 'win')
  const lossStreaks = streaks.filter(s => s.type === 'loss')
  
  // Calculate max drawdown
  const { maxDrawdown, maxDrawdownPercent } = calculateDrawdown(trades, initialBalance)

  // Calculate returns for Sharpe/Sortino
  const returns = trades.map(t => t.profit / initialBalance)
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
  const stdDev = calculateStdDev(returns)
  const downstdDev = calculateDownsideStdDev(returns)

  // Risk-adjusted ratios (annualized assuming ~250 trading days)
  const annualizationFactor = Math.sqrt(250 * 24) // trades per year approximation
  const sharpeRatio = stdDev !== 0 ? (avgReturn - riskFreeRate / (250 * 24)) / stdDev * annualizationFactor : 0
  const sortinoRatio = downstdDev !== 0 ? (avgReturn - riskFreeRate / (250 * 24)) / downstdDev * annualizationFactor : 0
  const calmarRatio = maxDrawdownPercent !== 0 ? (netProfit / initialBalance * 100) / maxDrawdownPercent : 0

  // Trade distributions
  const winDistribution = calculateProfitDistribution(wins.map(t => t.profit))
  const lossDistribution = calculateProfitDistribution(losses.map(t => Math.abs(t.profit)))

  // Current streak
  const currentStreak = getCurrentStreak(trades)

  return {
    // Basic Stats
    totalTrades,
    wins: winCount,
    losses: lossCount,
    ties: tieCount,
    winRate: totalTrades > 0 ? (winCount / totalTrades) * 100 : 0,
    lossRate: totalTrades > 0 ? (lossCount / totalTrades) * 100 : 0,

    // Profit Stats
    grossProfit,
    grossLoss,
    netProfit,
    netProfitPercent: (netProfit / initialBalance) * 100,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    expectancy: totalTrades > 0 ? netProfit / totalTrades : 0,
    averageWin: winCount > 0 ? grossProfit / winCount : 0,
    averageLoss: lossCount > 0 ? grossLoss / lossCount : 0,
    largestWin: wins.length > 0 ? Math.max(...wins.map(t => t.profit)) : 0,
    largestLoss: losses.length > 0 ? Math.max(...losses.map(t => Math.abs(t.profit))) : 0,

    // Risk Stats
    maxDrawdown,
    maxDrawdownPercent,
    maxConsecutiveWins: winStreaks.length > 0 ? Math.max(...winStreaks.map(s => s.count)) : 0,
    maxConsecutiveLosses: lossStreaks.length > 0 ? Math.max(...lossStreaks.map(s => s.count)) : 0,
    recoveryFactor: maxDrawdown > 0 ? netProfit / maxDrawdown : netProfit > 0 ? Infinity : 0,

    // Direction Stats
    callTrades: callTrades.length,
    putTrades: putTrades.length,
    callWinRate: callTrades.length > 0 ? (callWins / callTrades.length) * 100 : 0,
    putWinRate: putTrades.length > 0 ? (putWins / putTrades.length) * 100 : 0,
    callProfit: callTrades.reduce((sum, t) => sum + t.profit, 0),
    putProfit: putTrades.reduce((sum, t) => sum + t.profit, 0),

    // Time Stats
    tradesPerHour: tradingDurationMs > 0 ? totalTrades / (tradingDurationMs / 3600000) : 0,
    averageTradeGapMs: totalTrades > 1 ? tradingDurationMs / (totalTrades - 1) : 0,
    tradingDurationMs,
    busiestHour: busiestHour?.hour ?? 0,
    quietestHour: quietestHour?.hour ?? 0,

    // Hourly Breakdown
    hourlyStats,

    // Streak Analysis
    currentStreak,
    streaks,

    // Advanced Metrics
    sharpeRatio,
    sortinoRatio,
    calmarRatio,

    // Trade Distribution
    winDistribution,
    lossDistribution,
  }
}

function calculateHourlyStats(trades: BacktestTrade[]): HourlyStats[] {
  const hourly = new Array(24).fill(null).map((_, hour) => ({
    hour,
    trades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    profit: 0,
  }))

  for (const trade of trades) {
    const hour = new Date(trade.entryTime).getHours()
    hourly[hour].trades++
    hourly[hour].profit += trade.profit
    if (trade.result === 'WIN') hourly[hour].wins++
    if (trade.result === 'LOSS') hourly[hour].losses++
  }

  for (const h of hourly) {
    h.winRate = h.trades > 0 ? (h.wins / h.trades) * 100 : 0
  }

  return hourly
}

function calculateStreaks(trades: BacktestTrade[]): StreakInfo[] {
  const streaks: StreakInfo[] = []
  let currentStreak: StreakInfo | null = null

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i]
    const type = trade.result === 'WIN' ? 'win' : trade.result === 'LOSS' ? 'loss' : null

    if (type === null) continue

    if (currentStreak && currentStreak.type === type) {
      currentStreak.count++
      currentStreak.endIndex = i
      currentStreak.profit += trade.profit
    } else {
      if (currentStreak) streaks.push(currentStreak)
      currentStreak = {
        type,
        count: 1,
        startIndex: i,
        endIndex: i,
        profit: trade.profit,
      }
    }
  }

  if (currentStreak) streaks.push(currentStreak)

  return streaks
}

function getCurrentStreak(trades: BacktestTrade[]): { type: 'win' | 'loss' | 'none'; count: number } {
  if (trades.length === 0) return { type: 'none', count: 0 }

  let count = 0
  let type: 'win' | 'loss' | 'none' = 'none'

  for (let i = trades.length - 1; i >= 0; i--) {
    const result = trades[i].result
    if (result === 'TIE') continue

    const currentType = result === 'WIN' ? 'win' : 'loss'
    
    if (type === 'none') {
      type = currentType
      count = 1
    } else if (type === currentType) {
      count++
    } else {
      break
    }
  }

  return { type, count }
}

function calculateDrawdown(trades: BacktestTrade[], initialBalance: number): { maxDrawdown: number; maxDrawdownPercent: number } {
  let balance = initialBalance
  let peak = initialBalance
  let maxDrawdown = 0
  let maxDrawdownPercent = 0

  for (const trade of trades) {
    balance += trade.profit
    if (balance > peak) {
      peak = balance
    }
    const drawdown = peak - balance
    const drawdownPercent = (drawdown / peak) * 100
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
      maxDrawdownPercent = drawdownPercent
    }
  }

  return { maxDrawdown, maxDrawdownPercent }
}

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length)
}

function calculateDownsideStdDev(values: number[]): number {
  const negativeReturns = values.filter(v => v < 0)
  if (negativeReturns.length < 2) return 0
  return calculateStdDev(negativeReturns)
}

function calculateProfitDistribution(profits: number[]): { range: string; count: number }[] {
  if (profits.length === 0) return []
  
  const max = Math.max(...profits)
  const ranges = [
    { min: 0, max: max * 0.25, label: '0-25%' },
    { min: max * 0.25, max: max * 0.5, label: '25-50%' },
    { min: max * 0.5, max: max * 0.75, label: '50-75%' },
    { min: max * 0.75, max: max * 1.01, label: '75-100%' },
  ]

  return ranges.map(r => ({
    range: r.label,
    count: profits.filter(p => p >= r.min && p < r.max).length,
  }))
}

function getEmptyStatistics(): DetailedStatistics {
  return {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    winRate: 0,
    lossRate: 0,
    grossProfit: 0,
    grossLoss: 0,
    netProfit: 0,
    netProfitPercent: 0,
    profitFactor: 0,
    expectancy: 0,
    averageWin: 0,
    averageLoss: 0,
    largestWin: 0,
    largestLoss: 0,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    recoveryFactor: 0,
    callTrades: 0,
    putTrades: 0,
    callWinRate: 0,
    putWinRate: 0,
    callProfit: 0,
    putProfit: 0,
    tradesPerHour: 0,
    averageTradeGapMs: 0,
    tradingDurationMs: 0,
    busiestHour: 0,
    quietestHour: 0,
    hourlyStats: [],
    currentStreak: { type: 'none', count: 0 },
    streaks: [],
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    winDistribution: [],
    lossDistribution: [],
  }
}

/**
 * Format statistics as human-readable text
 */
export function formatStatisticsReport(stats: DetailedStatistics): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════',
    '                   BACKTEST REPORT                      ',
    '═══════════════════════════════════════════════════════',
    '',
    '📊 OVERVIEW',
    `   Total Trades:     ${stats.totalTrades}`,
    `   Win Rate:         ${stats.winRate.toFixed(2)}%`,
    `   Profit Factor:    ${stats.profitFactor.toFixed(2)}`,
    `   Net Profit:       $${stats.netProfit.toFixed(2)} (${stats.netProfitPercent.toFixed(2)}%)`,
    '',
    '💰 PROFIT/LOSS',
    `   Gross Profit:     $${stats.grossProfit.toFixed(2)}`,
    `   Gross Loss:       $${stats.grossLoss.toFixed(2)}`,
    `   Average Win:      $${stats.averageWin.toFixed(2)}`,
    `   Average Loss:     $${stats.averageLoss.toFixed(2)}`,
    `   Largest Win:      $${stats.largestWin.toFixed(2)}`,
    `   Largest Loss:     $${stats.largestLoss.toFixed(2)}`,
    `   Expectancy:       $${stats.expectancy.toFixed(2)}/trade`,
    '',
    '📈 WIN/LOSS BREAKDOWN',
    `   Wins:             ${stats.wins}`,
    `   Losses:           ${stats.losses}`,
    `   Ties:             ${stats.ties}`,
    '',
    '📉 RISK METRICS',
    `   Max Drawdown:     $${stats.maxDrawdown.toFixed(2)} (${stats.maxDrawdownPercent.toFixed(2)}%)`,
    `   Max Win Streak:   ${stats.maxConsecutiveWins}`,
    `   Max Loss Streak:  ${stats.maxConsecutiveLosses}`,
    `   Recovery Factor:  ${stats.recoveryFactor.toFixed(2)}`,
    '',
    '🎯 DIRECTION ANALYSIS',
    `   CALL Trades:      ${stats.callTrades} (${stats.callWinRate.toFixed(1)}% win)`,
    `   PUT Trades:       ${stats.putTrades} (${stats.putWinRate.toFixed(1)}% win)`,
    `   CALL Profit:      $${stats.callProfit.toFixed(2)}`,
    `   PUT Profit:       $${stats.putProfit.toFixed(2)}`,
    '',
    '⏰ TIME ANALYSIS',
    `   Trades/Hour:      ${stats.tradesPerHour.toFixed(2)}`,
    `   Busiest Hour:     ${stats.busiestHour}:00`,
    `   Quietest Hour:    ${stats.quietestHour}:00`,
    '',
    '📐 ADVANCED METRICS',
    `   Sharpe Ratio:     ${stats.sharpeRatio.toFixed(2)}`,
    `   Sortino Ratio:    ${stats.sortinoRatio.toFixed(2)}`,
    `   Calmar Ratio:     ${stats.calmarRatio.toFixed(2)}`,
    '',
    '═══════════════════════════════════════════════════════',
  ]

  // Add profitable check
  if (stats.winRate >= 53) {
    lines.push('✅ WIN RATE >= 53% - POTENTIALLY PROFITABLE')
  } else {
    lines.push(`⚠️ WIN RATE ${stats.winRate.toFixed(1)}% < 53% - NOT PROFITABLE`)
  }
  lines.push('═══════════════════════════════════════════════════════')

  return lines.join('\n')
}
