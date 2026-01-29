// ============================================================
// SMMA + Stochastic Strategy Backtest Test
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { BacktestEngine } from './engine'
import { SMMAStrategies, SMMAStochasticStrategy } from './strategies/smma-stochastic'
import { generateTestCandles, generatePatternedData } from './data-generator'
import { calculateDetailedStatistics, formatStatisticsReport } from './statistics'
import { BacktestConfig } from './types'

describe('SMMA + Stochastic Strategy', () => {
  let engine: BacktestEngine

  beforeEach(() => {
    engine = new BacktestEngine()
    SMMAStrategies.forEach(s => engine.registerStrategy(s))
  })

  it('should register SMMA strategies', () => {
    expect(engine.getStrategies()).toHaveLength(2)
    expect(engine.getStrategies().map(s => s.id)).toContain('smma-stoch-bitshin')
  })

  describe('Backtest Execution', () => {
    it('should run backtest with SMMA strategy', () => {
      const candles = generateTestCandles({ count: 500, volatility: 0.015 })
      const config: BacktestConfig = {
        symbol: 'APPLE-OTC',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60, // 1 minute as per 비트신옵션
        strategyId: 'smma-stoch-bitshin',
        strategyParams: {
          stochK: 14,
          stochD: 3,
          stochSmooth: 3,
          oversold: 20,
          overbought: 80,
          trendStrength: 6,
          overlapTolerance: 0,
        },
      }

      const result = engine.run(config, candles)

      expect(result).toBeDefined()
      expect(result.totalTrades).toBeGreaterThanOrEqual(0)

      // Calculate detailed statistics
      const stats = calculateDetailedStatistics(result.trades, config.initialBalance)
      
      console.log('\n' + formatStatisticsReport(stats))
      console.log('\nStrategy: SMMA + Stochastic (비트신옵션)')
      console.log(`Settings: 15s candles, 1m expiry, 92% payout`)
    })

    it('should test in different market conditions', () => {
      const conditions = ['uptrend', 'downtrend', 'ranging', 'volatile'] as const
      const results: { condition: string; winRate: number; trades: number; profit: number }[] = []

      for (const condition of conditions) {
        const candles = generatePatternedData(condition, 500)
        const config: BacktestConfig = {
          symbol: 'TEST',
          startTime: candles[0].timestamp,
          endTime: candles[candles.length - 1].timestamp,
          initialBalance: 10000,
          betAmount: 100,
          betType: 'fixed',
          payout: 92,
          expirySeconds: 60,
          strategyId: 'smma-stoch-bitshin',
          strategyParams: {
            stochK: 14,
            stochD: 3,
            stochSmooth: 3,
            oversold: 20,
            overbought: 80,
            trendStrength: 6,
            overlapTolerance: 0,
          },
        }

        const result = engine.run(config, candles)
        results.push({
          condition,
          winRate: result.winRate,
          trades: result.totalTrades,
          profit: result.netProfit,
        })
      }

      console.log('\n═══════════════════════════════════════')
      console.log('SMMA Strategy - Market Condition Analysis')
      console.log('═══════════════════════════════════════')
      results.forEach(r => {
        const profitable = r.winRate >= 53 ? '✅' : '❌'
        console.log(`${profitable} ${r.condition.padEnd(10)}: ${r.winRate.toFixed(1)}% win rate, ${r.trades} trades, $${r.profit.toFixed(2)} profit`)
      })
      console.log('═══════════════════════════════════════')
    })

    it('should compare with aggressive version', () => {
      const candles = generateTestCandles({ count: 500 })
      
      const configs = [
        { id: 'smma-stoch-bitshin', name: 'Conservative (6/6 MAs)' },
        { id: 'smma-stoch-aggressive', name: 'Aggressive (4/6 MAs)' },
      ]

      console.log('\n═══════════════════════════════════════')
      console.log('Strategy Comparison')
      console.log('═══════════════════════════════════════')

      for (const c of configs) {
        const config: BacktestConfig = {
          symbol: 'TEST',
          startTime: candles[0].timestamp,
          endTime: candles[candles.length - 1].timestamp,
          initialBalance: 10000,
          betAmount: 100,
          betType: 'fixed',
          payout: 92,
          expirySeconds: 60,
          strategyId: c.id,
          strategyParams: {},
        }

        const result = engine.run(config, candles)
        const profitable = result.winRate >= 53 ? '✅' : '❌'
        console.log(`${profitable} ${c.name}: ${result.winRate.toFixed(1)}% (${result.totalTrades} trades, $${result.netProfit.toFixed(2)})`)
      }
    })
  })

  describe('Detailed Statistics', () => {
    it('should generate comprehensive statistics', () => {
      const candles = generateTestCandles({ count: 500 })
      const config: BacktestConfig = {
        symbol: 'TEST',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60,
        strategyId: 'smma-stoch-bitshin',
        strategyParams: {},
      }

      const result = engine.run(config, candles)
      const stats = calculateDetailedStatistics(result.trades, config.initialBalance)

      // Verify all stats are calculated
      expect(stats.totalTrades).toBe(result.totalTrades)
      expect(stats.wins + stats.losses + stats.ties).toBe(stats.totalTrades)
      expect(stats.winRate).toBeGreaterThanOrEqual(0)
      expect(stats.winRate).toBeLessThanOrEqual(100)
      expect(stats.hourlyStats).toHaveLength(24)

      // Print full report
      console.log('\n' + formatStatisticsReport(stats))
    })
  })
})
