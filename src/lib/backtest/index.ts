// ============================================================
// Backtest Module - Main Entry Point
// ============================================================

export * from './types'
export * from './engine'
export * from './data-generator'
export * from './statistics'
export { RSIStrategies, RSIOverboughtOversold, RSIDivergence, RSIBollingerBands, RSIStochastic, RSITrend } from './strategies/rsi-strategy'
export { SMMAStrategies, SMMAStochasticStrategy, SMMAStochasticAggressiveStrategy } from './strategies/smma-stochastic'

// Initialize engine with default strategies
import { getBacktestEngine } from './engine'
import { RSIStrategies } from './strategies/rsi-strategy'
import { SMMAStrategies } from './strategies/smma-stochastic'

export function initializeBacktest(): void {
  const engine = getBacktestEngine()
  
  // Register all strategies
  RSIStrategies.forEach(strategy => {
    engine.registerStrategy(strategy)
  })
  
  SMMAStrategies.forEach(strategy => {
    engine.registerStrategy(strategy)
  })

  console.log('[Backtest] Initialized with', RSIStrategies.length + SMMAStrategies.length, 'strategies')
}
