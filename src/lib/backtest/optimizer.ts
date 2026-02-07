// ============================================================
// Strategy Optimizer - Automated Parameter Search
// ============================================================
// Finds optimal parameters for maximum win rate and profit
// Supports: Grid Search, Bayesian Optimization, Genetic Algorithm
// ============================================================

import { BacktestEngine, getBacktestEngine } from './engine'
import { generatePatternedData, generateTestCandles } from './data-generator'
import { BacktestConfig, BacktestResult, Candle } from './types'
import { RSIStrategies } from './strategies/rsi-strategy'

// ============================================================
// Type Definitions
// ============================================================

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

/** Parameter range definition */
export interface ParamRange {
  min: number
  max: number
  step: number
}

export type ParamRanges = Record<string, ParamRange>

/** Optimizer type selection */
export type OptimizerType = 'grid' | 'bayesian' | 'genetic'

/** Base optimizer options */
export interface BaseOptimizerOptions {
  type: OptimizerType
  /** Metric to optimize: 'netProfit', 'winRate', 'profitFactor', 'expectancy' */
  objective?: 'netProfit' | 'winRate' | 'profitFactor' | 'expectancy'
  /** Minimum trades required for valid result */
  minTrades?: number
  /** Show progress logs */
  verbose?: boolean
}

/** Bayesian optimization options */
export interface BayesianOptimizerOptions extends BaseOptimizerOptions {
  type: 'bayesian'
  /** Maximum iterations (default: 50) */
  maxIterations?: number
  /** Initial random samples before modeling (default: 10) */
  initialSamples?: number
  /** Exploration vs exploitation trade-off (default: 0.1) */
  explorationWeight?: number
}

/** Genetic algorithm options */
export interface GeneticOptimizerOptions extends BaseOptimizerOptions {
  type: 'genetic'
  /** Population size (default: 50) */
  populationSize?: number
  /** Number of generations (default: 20) */
  generations?: number
  /** Mutation rate 0-1 (default: 0.1) */
  mutationRate?: number
  /** Tournament size for selection (default: 3) */
  tournamentSize?: number
  /** Elitism count - top individuals to keep (default: 2) */
  elitismCount?: number
}

/** Grid search options */
export interface GridOptimizerOptions extends BaseOptimizerOptions {
  type: 'grid'
  /** Maximum combinations to test (default: unlimited) */
  maxCombinations?: number
}

export type OptimizerOptions = BayesianOptimizerOptions | GeneticOptimizerOptions | GridOptimizerOptions

/** Unified optimization result with metadata */
export interface UnifiedOptimizationResult {
  params: Record<string, number>
  result: BacktestResult
  score: number
  iteration?: number
  generation?: number
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

// ============================================================
// Utility Functions for Optimization
// ============================================================

/**
 * Extract score from backtest result based on objective
 */
function getScore(result: BacktestResult, objective: string): number {
  switch (objective) {
    case 'winRate':
      return result.winRate
    case 'profitFactor':
      return result.profitFactor === Infinity ? 1000 : result.profitFactor
    case 'expectancy':
      return result.expectancy
    case 'netProfit':
    default:
      return result.netProfit
  }
}

/**
 * Normalize parameter to [0, 1] range
 */
function normalizeParam(value: number, range: ParamRange): number {
  return (value - range.min) / (range.max - range.min)
}

/**
 * Generate random parameters within ranges
 */
function generateRandomParams(paramRanges: ParamRanges): Record<string, number> {
  const params: Record<string, number> = {}
  for (const [key, range] of Object.entries(paramRanges)) {
    const steps = Math.floor((range.max - range.min) / range.step)
    const randomSteps = Math.floor(Math.random() * (steps + 1))
    params[key] = range.min + randomSteps * range.step
  }
  return params
}

/**
 * Run single backtest and return result with score
 */
function evaluateParams(
  engine: BacktestEngine,
  config: BacktestConfig,
  candles: Candle[],
  params: Record<string, number>,
  objective: string,
  minTrades: number
): { result: BacktestResult; score: number } | null {
  try {
    const testConfig = { ...config, strategyParams: params }
    const result = engine.run(testConfig, candles)

    if (result.totalTrades < minTrades) {
      return null
    }

    return {
      result,
      score: getScore(result, objective)
    }
  } catch {
    return null
  }
}

// ============================================================
// Bayesian Optimization
// ============================================================
// Uses a simplified Gaussian Process surrogate model with
// Expected Improvement acquisition function

/** Data point for GP model */
interface GPDataPoint {
  x: number[]  // Normalized params [0, 1]
  y: number    // Score
}

/**
 * Simplified Gaussian Process for surrogate modeling
 * Uses RBF kernel with fixed hyperparameters
 */
class SimpleGaussianProcess {
  private data: GPDataPoint[] = []
  private lengthScale: number = 0.5
  private noiseVariance: number = 0.01

  addPoint(x: number[], y: number): void {
    this.data.push({ x, y })
  }

  /**
   * RBF (Radial Basis Function) kernel
   */
  private kernel(x1: number[], x2: number[]): number {
    let sqDist = 0
    for (let i = 0; i < x1.length; i++) {
      sqDist += (x1[i] - x2[i]) ** 2
    }
    return Math.exp(-sqDist / (2 * this.lengthScale ** 2))
  }

  /**
   * Predict mean and variance at point x
   */
  predict(x: number[]): { mean: number; variance: number } {
    if (this.data.length === 0) {
      return { mean: 0, variance: 1 }
    }

    const n = this.data.length

    // Compute kernel vectors
    const kStar: number[] = this.data.map(d => this.kernel(x, d.x))

    // Compute kernel matrix K + noise
    const K: number[][] = []
    for (let i = 0; i < n; i++) {
      K[i] = []
      for (let j = 0; j < n; j++) {
        K[i][j] = this.kernel(this.data[i].x, this.data[j].x)
        if (i === j) K[i][j] += this.noiseVariance
      }
    }

    // Solve K^-1 * y using Cholesky decomposition (simplified: use pseudo-inverse)
    const y = this.data.map(d => d.y)
    const KInvY = this.solveLinear(K, y)

    // Mean: k* . K^-1 . y
    let mean = 0
    for (let i = 0; i < n; i++) {
      mean += kStar[i] * KInvY[i]
    }

    // Variance: k** - k* . K^-1 . k*
    const kStarStar = this.kernel(x, x) + this.noiseVariance
    const KInvKStar = this.solveLinear(K, kStar)
    let variance = kStarStar
    for (let i = 0; i < n; i++) {
      variance -= kStar[i] * KInvKStar[i]
    }
    variance = Math.max(0.0001, variance) // Ensure positive

    return { mean, variance }
  }

  /**
   * Simple linear solver using Gauss-Jordan elimination
   */
  private solveLinear(A: number[][], b: number[]): number[] {
    const n = A.length
    const aug: number[][] = A.map((row, i) => [...row, b[i]])

    // Forward elimination
    for (let col = 0; col < n; col++) {
      // Find pivot
      let maxRow = col
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
          maxRow = row
        }
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]

      const pivot = aug[col][col]
      if (Math.abs(pivot) < 1e-10) continue

      for (let row = col + 1; row < n; row++) {
        const factor = aug[row][col] / pivot
        for (let j = col; j <= n; j++) {
          aug[row][j] -= factor * aug[col][j]
        }
      }
    }

    // Back substitution
    const x = new Array(n).fill(0)
    for (let row = n - 1; row >= 0; row--) {
      if (Math.abs(aug[row][row]) < 1e-10) continue
      x[row] = aug[row][n]
      for (let col = row + 1; col < n; col++) {
        x[row] -= aug[row][col] * x[col]
      }
      x[row] /= aug[row][row]
    }

    return x
  }
}

/**
 * Expected Improvement acquisition function
 */
function expectedImprovement(
  gp: SimpleGaussianProcess,
  x: number[],
  bestY: number,
  xi: number = 0.01
): number {
  const { mean, variance } = gp.predict(x)
  const std = Math.sqrt(variance)

  if (std < 1e-10) return 0

  const z = (mean - bestY - xi) / std
  const cdf = 0.5 * (1 + erf(z / Math.sqrt(2)))
  const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)

  return (mean - bestY - xi) * cdf + std * pdf
}

/**
 * Error function approximation
 */
function erf(x: number): number {
  const a1 =  0.254829592
  const a2 = -0.284496736
  const a3 =  1.421413741
  const a4 = -1.453152027
  const a5 =  1.061405429
  const p  =  0.3275911

  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const t = 1 / (1 + p * absX)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX)

  return sign * y
}

/**
 * Bayesian Optimization
 * Uses Gaussian Process surrogate model with Expected Improvement acquisition
 */
export function bayesianOptimize(
  engine: BacktestEngine,
  config: BacktestConfig,
  candles: Candle[],
  paramRanges: ParamRanges,
  options: Partial<BayesianOptimizerOptions> = {}
): UnifiedOptimizationResult[] {
  const {
    maxIterations = 50,
    initialSamples = 10,
    explorationWeight = 0.1,
    objective = 'netProfit',
    minTrades = 5,
    verbose = false
  } = options

  const paramKeys = Object.keys(paramRanges)
  const gp = new SimpleGaussianProcess()
  const results: UnifiedOptimizationResult[] = []
  let bestScore = -Infinity

  if (verbose) {
    console.log(`[Bayesian] Starting optimization with ${maxIterations} iterations`)
  }

  // Phase 1: Initial random sampling
  for (let i = 0; i < initialSamples; i++) {
    const params = generateRandomParams(paramRanges)
    const normalized = paramKeys.map(k => normalizeParam(params[k], paramRanges[k]))

    const evaluation = evaluateParams(engine, config, candles, params, objective, minTrades)
    if (evaluation) {
      gp.addPoint(normalized, evaluation.score)
      results.push({
        params,
        result: evaluation.result,
        score: evaluation.score,
        iteration: i
      })
      if (evaluation.score > bestScore) {
        bestScore = evaluation.score
      }
    }
  }

  if (verbose) {
    console.log(`[Bayesian] Initial sampling complete. Best score: ${bestScore.toFixed(2)}`)
  }

  // Phase 2: Bayesian optimization loop
  for (let i = initialSamples; i < maxIterations; i++) {
    // Find next point by maximizing Expected Improvement
    let bestEI = -Infinity
    let bestNextParams: Record<string, number> | null = null
    let bestNormalized: number[] = []

    // Sample random candidates and evaluate EI
    const numCandidates = 100
    for (let c = 0; c < numCandidates; c++) {
      const candidateParams = generateRandomParams(paramRanges)
      const normalized = paramKeys.map(k => normalizeParam(candidateParams[k], paramRanges[k]))
      const ei = expectedImprovement(gp, normalized, bestScore, explorationWeight)

      if (ei > bestEI) {
        bestEI = ei
        bestNextParams = candidateParams
        bestNormalized = normalized
      }
    }

    if (!bestNextParams) continue

    // Evaluate the best candidate
    const evaluation = evaluateParams(engine, config, candles, bestNextParams, objective, minTrades)
    if (evaluation) {
      gp.addPoint(bestNormalized, evaluation.score)
      results.push({
        params: bestNextParams,
        result: evaluation.result,
        score: evaluation.score,
        iteration: i
      })
      if (evaluation.score > bestScore) {
        bestScore = evaluation.score
        if (verbose) {
          console.log(`[Bayesian] Iteration ${i}: New best score ${bestScore.toFixed(2)}`)
        }
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  if (verbose) {
    console.log(`[Bayesian] Optimization complete. Best score: ${results[0]?.score.toFixed(2) ?? 'N/A'}`)
  }

  return results
}

// ============================================================
// Genetic Algorithm Optimization
// ============================================================
// Uses tournament selection, single-point crossover, random mutation

/** Individual in the population */
interface Individual {
  params: Record<string, number>
  score: number
  result?: BacktestResult
}

/**
 * Tournament selection - select best from random subset
 */
function tournamentSelect(population: Individual[], tournamentSize: number): Individual {
  let best: Individual | null = null
  for (let i = 0; i < tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length)
    const candidate = population[idx]
    if (!best || candidate.score > best.score) {
      best = candidate
    }
  }
  return best!
}

/**
 * Single-point crossover between two parents
 */
function crossover(
  parent1: Record<string, number>,
  parent2: Record<string, number>,
  paramKeys: string[]
): Record<string, number> {
  const child: Record<string, number> = {}
  const crossPoint = Math.floor(Math.random() * paramKeys.length)

  for (let i = 0; i < paramKeys.length; i++) {
    const key = paramKeys[i]
    child[key] = i < crossPoint ? parent1[key] : parent2[key]
  }

  return child
}

/**
 * Random mutation with given probability
 */
function mutate(
  params: Record<string, number>,
  paramRanges: ParamRanges,
  mutationRate: number
): Record<string, number> {
  const mutated = { ...params }

  for (const [key, range] of Object.entries(paramRanges)) {
    if (Math.random() < mutationRate) {
      const steps = Math.floor((range.max - range.min) / range.step)
      const randomSteps = Math.floor(Math.random() * (steps + 1))
      mutated[key] = range.min + randomSteps * range.step
    }
  }

  return mutated
}

/**
 * Genetic Algorithm Optimization
 * Uses tournament selection, single-point crossover, random mutation
 */
export function geneticOptimize(
  engine: BacktestEngine,
  config: BacktestConfig,
  candles: Candle[],
  paramRanges: ParamRanges,
  options: Partial<GeneticOptimizerOptions> = {}
): UnifiedOptimizationResult[] {
  const {
    populationSize = 50,
    generations = 20,
    mutationRate = 0.1,
    tournamentSize = 3,
    elitismCount = 2,
    objective = 'netProfit',
    minTrades = 5,
    verbose = false
  } = options

  const paramKeys = Object.keys(paramRanges)
  const allResults: UnifiedOptimizationResult[] = []

  if (verbose) {
    console.log(`[Genetic] Starting with population=${populationSize}, generations=${generations}`)
  }

  // Initialize population
  let population: Individual[] = []
  for (let i = 0; i < populationSize; i++) {
    const params = generateRandomParams(paramRanges)
    const evaluation = evaluateParams(engine, config, candles, params, objective, minTrades)

    if (evaluation) {
      population.push({
        params,
        score: evaluation.score,
        result: evaluation.result
      })
      allResults.push({
        params,
        result: evaluation.result,
        score: evaluation.score,
        generation: 0
      })
    } else {
      population.push({
        params,
        score: -Infinity
      })
    }
  }

  // Sort initial population
  population.sort((a, b) => b.score - a.score)

  if (verbose) {
    console.log(`[Genetic] Generation 0: Best score ${population[0]?.score.toFixed(2) ?? 'N/A'}`)
  }

  // Evolution loop
  for (let gen = 1; gen <= generations; gen++) {
    const newPopulation: Individual[] = []

    // Elitism: carry over top individuals
    for (let i = 0; i < Math.min(elitismCount, population.length); i++) {
      if (population[i].score > -Infinity) {
        newPopulation.push(population[i])
      }
    }

    // Generate rest of new population
    while (newPopulation.length < populationSize) {
      // Selection
      const parent1 = tournamentSelect(population, tournamentSize)
      const parent2 = tournamentSelect(population, tournamentSize)

      // Crossover
      let childParams = crossover(parent1.params, parent2.params, paramKeys)

      // Mutation
      childParams = mutate(childParams, paramRanges, mutationRate)

      // Evaluate child
      const evaluation = evaluateParams(engine, config, candles, childParams, objective, minTrades)

      if (evaluation) {
        newPopulation.push({
          params: childParams,
          score: evaluation.score,
          result: evaluation.result
        })
        allResults.push({
          params: childParams,
          result: evaluation.result,
          score: evaluation.score,
          generation: gen
        })
      } else {
        newPopulation.push({
          params: childParams,
          score: -Infinity
        })
      }
    }

    // Sort new population
    population = newPopulation.sort((a, b) => b.score - a.score)

    if (verbose && gen % 5 === 0) {
      console.log(`[Genetic] Generation ${gen}: Best score ${population[0]?.score.toFixed(2) ?? 'N/A'}`)
    }
  }

  if (verbose) {
    console.log(`[Genetic] Evolution complete. Best score: ${population[0]?.score.toFixed(2) ?? 'N/A'}`)
  }

  // Return all valid results sorted by score
  return allResults
    .filter(r => r.score > -Infinity)
    .sort((a, b) => b.score - a.score)
}

// ============================================================
// Grid Search Optimization
// ============================================================

/**
 * Grid Search Optimization (wrapper for existing engine.optimize)
 * Exhaustively searches all parameter combinations
 */
export function gridOptimize(
  engine: BacktestEngine,
  config: BacktestConfig,
  candles: Candle[],
  paramRanges: ParamRanges,
  options: Partial<GridOptimizerOptions> = {}
): UnifiedOptimizationResult[] {
  const {
    objective = 'netProfit',
    minTrades = 5,
    maxCombinations,
    verbose = false
  } = options

  // Use engine's built-in optimizer
  const results = engine.optimize(config, candles, paramRanges)

  if (verbose) {
    console.log(`[Grid] Tested ${results.length} combinations`)
  }

  // Convert to unified format and filter by minTrades
  const unifiedResults: UnifiedOptimizationResult[] = results
    .filter(r => r.totalTrades >= minTrades)
    .map(result => ({
      params: result.config.strategyParams,
      result,
      score: getScore(result, objective)
    }))

  // Apply maxCombinations limit
  const limited = maxCombinations
    ? unifiedResults.slice(0, maxCombinations)
    : unifiedResults

  // Sort by score
  return limited.sort((a, b) => b.score - a.score)
}

// ============================================================
// Unified Optimization Interface
// ============================================================

/**
 * Unified optimization function supporting multiple algorithms
 *
 * @example
 * // Grid search (exhaustive)
 * const results = optimize(engine, config, candles, paramRanges, { type: 'grid' })
 *
 * // Bayesian optimization (efficient for expensive evaluations)
 * const results = optimize(engine, config, candles, paramRanges, {
 *   type: 'bayesian',
 *   maxIterations: 100,
 *   explorationWeight: 0.1
 * })
 *
 * // Genetic algorithm (good for large search spaces)
 * const results = optimize(engine, config, candles, paramRanges, {
 *   type: 'genetic',
 *   populationSize: 100,
 *   generations: 50,
 *   mutationRate: 0.15
 * })
 */
export function optimize(
  engine: BacktestEngine,
  config: BacktestConfig,
  candles: Candle[],
  paramRanges: ParamRanges,
  options: OptimizerOptions
): UnifiedOptimizationResult[] {
  switch (options.type) {
    case 'bayesian':
      return bayesianOptimize(engine, config, candles, paramRanges, options)

    case 'genetic':
      return geneticOptimize(engine, config, candles, paramRanges, options)

    case 'grid':
    default:
      return gridOptimize(engine, config, candles, paramRanges, options)
  }
}
