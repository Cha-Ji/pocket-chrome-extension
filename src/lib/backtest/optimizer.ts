// ============================================================
// Strategy Optimizer - Automated Parameter Search
// ============================================================
// Finds optimal parameters for maximum win rate and profit
// ============================================================

import { BacktestEngine, getBacktestEngine } from './engine'
import { generatePatternedData, generateTestCandles } from './data-generator'
import { BacktestConfig, BacktestResult, Strategy } from './types'
import { RSIStrategies } from './strategies/rsi-strategy'

export interface OptimizationResult {
  strategyId: string
  strategyName: string
  bestParams: Record<string, number>
  winRate: number
  profitFactor: number
  netProfit: number
  totalTrades: number
  marketCondition: string
}

export interface OptimizationReport {
  timestamp: number
  duration: number
  totalCombinations: number
  results: OptimizationResult[]
  bestOverall: OptimizationResult | null
  recommendations: string[]
}

/**
 * Run comprehensive optimization across all strategies
 */
export async function runFullOptimization(
  candleCount: number = 2000,
  payout: number = 92
): Promise<OptimizationReport> {
  const startTime = Date.now()
  const engine = getBacktestEngine()
  
  // Register strategies
  RSIStrategies.forEach(s => engine.registerStrategy(s))
  
  const results: OptimizationResult[] = []
  const marketConditions = ['uptrend', 'downtrend', 'ranging', 'volatile'] as const
  
  let totalCombinations = 0
  
  for (const strategy of RSIStrategies) {
    for (const condition of marketConditions) {
      console.log(`[Optimizer] Testing ${strategy.name} in ${condition} market...`)
      
      const candles = generatePatternedData(condition, candleCount)
      
      // Build param ranges from strategy definition
      const paramRanges: Record<string, { min: number; max: number; step: number }> = {}
      for (const [key, param] of Object.entries(strategy.params)) {
        paramRanges[key] = { min: param.min, max: param.max, step: param.step }
      }
      
      // Calculate combinations
      let combinations = 1
      for (const range of Object.values(paramRanges)) {
        combinations *= Math.floor((range.max - range.min) / range.step) + 1
      }
      totalCombinations += combinations
      
      const baseConfig: BacktestConfig = {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout,
        expirySeconds: 60,
        strategyId: strategy.id,
        strategyParams: {},
      }
      
      try {
        const optimized = engine.optimize(baseConfig, candles, paramRanges)
        
        if (optimized.length > 0) {
          const best = optimized[0]
          results.push({
            strategyId: strategy.id,
            strategyName: strategy.name,
            bestParams: best.config.strategyParams,
            winRate: best.winRate,
            profitFactor: best.profitFactor,
            netProfit: best.netProfit,
            totalTrades: best.totalTrades,
            marketCondition: condition,
          })
        }
      } catch (error) {
        console.error(`[Optimizer] Error optimizing ${strategy.name}:`, error)
      }
    }
  }
  
  // Sort by profit
  results.sort((a, b) => b.netProfit - a.netProfit)
  
  // Generate recommendations
  const recommendations: string[] = []
  
  // Best overall strategy
  const bestOverall = results.length > 0 ? results[0] : null
  if (bestOverall) {
    recommendations.push(
      `Best strategy: ${bestOverall.strategyName} in ${bestOverall.marketCondition} market`
    )
    recommendations.push(
      `Optimal params: ${JSON.stringify(bestOverall.bestParams)}`
    )
    recommendations.push(
      `Expected win rate: ${bestOverall.winRate.toFixed(1)}%, Profit factor: ${bestOverall.profitFactor.toFixed(2)}`
    )
  }
  
  // Find best for each market condition
  for (const condition of marketConditions) {
    const bestForCondition = results.find(r => r.marketCondition === condition)
    if (bestForCondition && bestForCondition.winRate > 50) {
      recommendations.push(
        `For ${condition}: Use ${bestForCondition.strategyName} (${bestForCondition.winRate.toFixed(1)}% win rate)`
      )
    }
  }
  
  // Win rate threshold warning
  const profitableStrategies = results.filter(r => r.winRate >= 53)
  if (profitableStrategies.length === 0) {
    recommendations.push('⚠️ No strategy achieved 53%+ win rate needed for profitability')
    recommendations.push('Consider: Lower timeframe, different indicators, or market condition filters')
  } else {
    recommendations.push(`✅ ${profitableStrategies.length} configurations achieved 53%+ win rate`)
  }
  
  return {
    timestamp: Date.now(),
    duration: Date.now() - startTime,
    totalCombinations,
    results,
    bestOverall,
    recommendations,
  }
}

/**
 * Quick optimization for a single strategy
 */
export function quickOptimize(
  strategyId: string,
  candleCount: number = 1000,
  payout: number = 92
): OptimizationResult | null {
  const engine = getBacktestEngine()
  RSIStrategies.forEach(s => engine.registerStrategy(s))
  
  const strategy = RSIStrategies.find(s => s.id === strategyId)
  if (!strategy) return null
  
  const candles = generateTestCandles({ count: candleCount })
  
  const paramRanges: Record<string, { min: number; max: number; step: number }> = {}
  for (const [key, param] of Object.entries(strategy.params)) {
    paramRanges[key] = { min: param.min, max: param.max, step: param.step }
  }
  
  const baseConfig: BacktestConfig = {
    symbol: 'TEST',
    startTime: candles[0].timestamp,
    endTime: candles[candles.length - 1].timestamp,
    initialBalance: 10000,
    betAmount: 100,
    betType: 'fixed',
    payout,
    expirySeconds: 60,
    strategyId: strategy.id,
    strategyParams: {},
  }
  
  const optimized = engine.optimize(baseConfig, candles, paramRanges)
  
  if (optimized.length === 0) return null
  
  const best = optimized[0]
  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    bestParams: best.config.strategyParams,
    winRate: best.winRate,
    profitFactor: best.profitFactor,
    netProfit: best.netProfit,
    totalTrades: best.totalTrades,
    marketCondition: 'mixed',
  }
}

/**
 * Find strategies that achieve target win rate
 */
export function findProfitableStrategies(
  targetWinRate: number = 53,
  payout: number = 92,
  candleCount: number = 1000
): OptimizationResult[] {
  const engine = getBacktestEngine()
  RSIStrategies.forEach(s => engine.registerStrategy(s))
  
  const profitable: OptimizationResult[] = []
  const conditions = ['ranging', 'volatile'] as const // These are typically better for mean reversion
  
  for (const strategy of RSIStrategies) {
    for (const condition of conditions) {
      const candles = generatePatternedData(condition, candleCount)
      
      const paramRanges: Record<string, { min: number; max: number; step: number }> = {}
      for (const [key, param] of Object.entries(strategy.params)) {
        // Use narrower range for speed
        const range = param.max - param.min
        paramRanges[key] = { 
          min: param.default - range * 0.3, 
          max: param.default + range * 0.3, 
          step: param.step * 2 
        }
      }
      
      const baseConfig: BacktestConfig = {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout,
        expirySeconds: 60,
        strategyId: strategy.id,
        strategyParams: {},
      }
      
      try {
        const optimized = engine.optimize(baseConfig, candles, paramRanges)
        
        for (const result of optimized) {
          if (result.winRate >= targetWinRate) {
            profitable.push({
              strategyId: strategy.id,
              strategyName: strategy.name,
              bestParams: result.config.strategyParams,
              winRate: result.winRate,
              profitFactor: result.profitFactor,
              netProfit: result.netProfit,
              totalTrades: result.totalTrades,
              marketCondition: condition,
            })
          }
        }
      } catch (error) {
        // Skip errors
      }
    }
  }
  
  return profitable.sort((a, b) => b.winRate - a.winRate)
}
