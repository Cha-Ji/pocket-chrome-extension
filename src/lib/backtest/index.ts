// ============================================================
// Backtest Module - Main Entry Point
// ============================================================

export * from './types'
export * from './engine'
export * from './data-generator'
export { RSIStrategies, RSIOverboughtOversold, RSIDivergence, RSIBollingerBands, RSIStochastic, RSITrend } from './strategies/rsi-strategy'

// Initialize engine with default strategies
import { getBacktestEngine } from './engine'
import { RSIStrategies } from './strategies/rsi-strategy'

export function initializeBacktest(): void {
  const engine = getBacktestEngine()
  
  // Register all RSI strategies
  RSIStrategies.forEach(strategy => {
    engine.registerStrategy(strategy)
  })

  console.log('[Backtest] Initialized with', RSIStrategies.length, 'strategies')
}
