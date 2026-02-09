// ============================================================
// Backtest Module - Main Entry Point
// ============================================================

export * from './types'
export * from './engine'
export * from './data-generator'
export * from './candle-utils'
export * from './statistics'
export * from './leaderboard-types'
export { runLeaderboard, scoreAndRankEntries, formatLeaderboardReport } from './leaderboard'
export { RSIStrategies, RSIOverboughtOversold, RSIDivergence, RSIBollingerBands, RSIStochastic, RSITrend } from './strategies/rsi-strategy'
export { SMMAStrategies, SMMAStochasticStrategy, SMMAStochasticAggressiveStrategy } from './strategies/smma-stochastic'
export { CCIStrategies, CCIOverboughtOversold, CCIZeroCross, CCITrendFollowing } from './strategies/cci-strategy'
export { WilliamsRStrategies, WilliamsROverboughtOversold, WilliamsRMiddleCross, WilliamsRExtremeZone } from './strategies/williams-r-strategy'

// Initialize engine with default strategies
import { getBacktestEngine } from './engine'
import { RSIStrategies } from './strategies/rsi-strategy'
import { SMMAStrategies } from './strategies/smma-stochastic'
import { CCIStrategies } from './strategies/cci-strategy'
import { WilliamsRStrategies } from './strategies/williams-r-strategy'

export function initializeBacktest(): void {
  const engine = getBacktestEngine()

  // Register all strategies
  RSIStrategies.forEach(strategy => {
    engine.registerStrategy(strategy)
  })

  SMMAStrategies.forEach(strategy => {
    engine.registerStrategy(strategy)
  })

  CCIStrategies.forEach(strategy => {
    engine.registerStrategy(strategy)
  })

  WilliamsRStrategies.forEach(strategy => {
    engine.registerStrategy(strategy)
  })

  const totalStrategies = RSIStrategies.length + SMMAStrategies.length + CCIStrategies.length + WilliamsRStrategies.length
  console.log('[Backtest] Initialized with', totalStrategies, 'strategies')
}
