// ============================================================
// Backtest Engine
// ============================================================
// Core backtesting logic for binary options strategies
// Simulates trades on historical data
// ============================================================

import {
  Candle,
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  Strategy,
  StrategySignal,
  Direction,
  TradeResult,
} from './types'

export class BacktestEngine {
  private strategies: Map<string, Strategy> = new Map()

  /**
   * Register a strategy for backtesting
   */
  registerStrategy(strategy: Strategy): void {
    this.strategies.set(strategy.id, strategy)
    console.log(`[BacktestEngine] Registered strategy: ${strategy.name}`)
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): Strategy[] {
    return Array.from(this.strategies.values())
  }

  /**
   * Run backtest with given config and data
   */
  run(config: BacktestConfig, candles: Candle[]): BacktestResult {
    const startTs = Date.now()

    // Validate
    const strategy = this.strategies.get(config.strategyId)
    if (!strategy) {
      throw new Error(`Strategy not found: ${config.strategyId}`)
    }

    if (candles.length < 50) {
      throw new Error('Not enough candles for backtest (minimum 50)')
    }

    // Sort candles by timestamp (oldest first)
    const sortedCandles = [...candles].sort((a, b) => a.timestamp - b.timestamp)

    // Filter by time range
    const filteredCandles = sortedCandles.filter(
      c => c.timestamp >= config.startTime && c.timestamp <= config.endTime
    )

    // Initialize
    let balance = config.initialBalance
    const trades: BacktestTrade[] = []
    const equityCurve: { timestamp: number; balance: number }[] = [
      { timestamp: config.startTime, balance }
    ]
    let maxBalance = balance
    let maxDrawdown = 0

    // Walk through candles
    const lookback = 50 // candles needed for indicators
    
    for (let i = lookback; i < filteredCandles.length; i++) {
      const historicalCandles = filteredCandles.slice(0, i + 1)
      const currentCandle = filteredCandles[i]
      
      // Generate signal
      const signal = strategy.generateSignal(historicalCandles, config.strategyParams)
      
      if (signal && signal.direction) {
        // Calculate bet amount
        const betAmount = config.betType === 'fixed' 
          ? config.betAmount 
          : balance * (config.betAmount / 100)

        // Skip if not enough balance
        if (betAmount > balance) continue

        // Find exit candle (based on expiry)
        const expiryTime = currentCandle.timestamp + config.expirySeconds * 1000
        const exitCandleIndex = filteredCandles.findIndex(
          c => c.timestamp >= expiryTime
        )

        if (exitCandleIndex === -1) continue // No exit candle found

        const exitCandle = filteredCandles[exitCandleIndex]

        // Determine result
        const result = this.determineResult(
          signal.direction,
          currentCandle.close,
          exitCandle.close
        )

        // Calculate profit
        const profit = this.calculateProfit(result, betAmount, config.payout)
        balance += profit

        // Track trade
        const trade: BacktestTrade = {
          entryTime: currentCandle.timestamp,
          entryPrice: currentCandle.close,
          exitTime: exitCandle.timestamp,
          exitPrice: exitCandle.close,
          direction: signal.direction,
          result,
          payout: config.payout,
          profit,
          strategySignal: signal.indicators,
        }
        trades.push(trade)

        // Update equity curve
        equityCurve.push({ timestamp: exitCandle.timestamp, balance })

        // Track drawdown
        if (balance > maxBalance) {
          maxBalance = balance
        }
        const drawdown = maxBalance - balance
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown
        }

        // Skip ahead to exit (no overlapping trades for now)
        i = exitCandleIndex
      }
    }

    // Calculate stats
    const wins = trades.filter(t => t.result === 'WIN').length
    const losses = trades.filter(t => t.result === 'LOSS').length
    const ties = trades.filter(t => t.result === 'TIE').length
    const totalTrades = trades.length

    const grossProfit = trades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0)
    const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((sum, t) => sum + t.profit, 0))

    const result: BacktestResult = {
      config,
      totalTrades,
      wins,
      losses,
      ties,
      winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
      initialBalance: config.initialBalance,
      finalBalance: balance,
      netProfit: balance - config.initialBalance,
      netProfitPercent: ((balance - config.initialBalance) / config.initialBalance) * 100,
      maxDrawdown,
      maxDrawdownPercent: (maxDrawdown / maxBalance) * 100,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      expectancy: totalTrades > 0 ? (balance - config.initialBalance) / totalTrades : 0,
      startTime: config.startTime,
      endTime: config.endTime,
      durationMs: Date.now() - startTs,
      trades,
      equityCurve,
    }

    return result
  }

  /**
   * Run multiple backtests with different parameters (optimization)
   */
  optimize(
    baseConfig: BacktestConfig,
    candles: Candle[],
    paramRanges: Record<string, { min: number; max: number; step: number }>
  ): BacktestResult[] {
    const results: BacktestResult[] = []
    const paramCombinations = this.generateParamCombinations(paramRanges)

    console.log(`[BacktestEngine] Optimizing with ${paramCombinations.length} combinations...`)

    for (const params of paramCombinations) {
      const config = { ...baseConfig, strategyParams: params }
      try {
        const result = this.run(config, candles)
        results.push(result)
      } catch (error) {
        // Skip failed runs
      }
    }

    // Sort by net profit
    results.sort((a, b) => b.netProfit - a.netProfit)

    return results
  }

  /**
   * Determine trade result
   */
  private determineResult(
    direction: Direction,
    entryPrice: number,
    exitPrice: number
  ): TradeResult {
    if (entryPrice === exitPrice) return 'TIE'

    if (direction === 'CALL') {
      return exitPrice > entryPrice ? 'WIN' : 'LOSS'
    } else {
      return exitPrice < entryPrice ? 'WIN' : 'LOSS'
    }
  }

  /**
   * Calculate profit/loss for a trade
   */
  private calculateProfit(
    result: TradeResult,
    betAmount: number,
    payout: number
  ): number {
    switch (result) {
      case 'WIN':
        return betAmount * (payout / 100) // e.g., $1 bet * 92% = $0.92 profit
      case 'LOSS':
        return -betAmount // lose entire bet
      case 'TIE':
        return 0 // money back
    }
  }

  /**
   * Generate all parameter combinations for optimization
   */
  private generateParamCombinations(
    paramRanges: Record<string, { min: number; max: number; step: number }>
  ): Record<string, number>[] {
    const keys = Object.keys(paramRanges)
    if (keys.length === 0) return [{}]

    const combinations: Record<string, number>[] = []
    
    const generate = (index: number, current: Record<string, number>) => {
      if (index === keys.length) {
        combinations.push({ ...current })
        return
      }

      const key = keys[index]
      const { min, max, step } = paramRanges[key]
      
      for (let value = min; value <= max; value += step) {
        current[key] = value
        generate(index + 1, current)
      }
    }

    generate(0, {})
    return combinations
  }
}

// Singleton instance
let engineInstance: BacktestEngine | null = null

export function getBacktestEngine(): BacktestEngine {
  if (!engineInstance) {
    engineInstance = new BacktestEngine()
  }
  return engineInstance
}
