// Simple SMMA test
import { describe, it, expect, beforeEach } from 'vitest'
import { BacktestEngine } from './engine'
import { SMMAStrategies } from './strategies/smma-stochastic'
import { generateTestCandles, generatePatternedData } from './data-generator'
import { calculateDetailedStatistics, formatStatisticsReport } from './statistics'
import { BacktestConfig } from './types'

describe('SMMA Strategy Quick Test', () => {
  let engine: BacktestEngine

  beforeEach(() => {
    engine = new BacktestEngine()
    SMMAStrategies.forEach(s => engine.registerStrategy(s))
  })

  it('should run SMMA backtest with more data and trending market', () => {
    // Use trending data to trigger more signals
    const candles = generatePatternedData('uptrend', 1000)
    
    // Test both strategies
    const strategies = [
      { id: 'smma-stoch-bitshin', name: 'Conservative', trendStrength: 4 },
      { id: 'smma-stoch-aggressive', name: 'Aggressive', trendStrength: 3 },
    ]

    console.log('\n═══════════════════════════════════════════════════════')
    console.log('           SMMA + STOCHASTIC BACKTEST RESULTS           ')
    console.log('═══════════════════════════════════════════════════════')

    for (const strat of strategies) {
      const config: BacktestConfig = {
        symbol: 'APPLE-OTC',
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        initialBalance: 10000,
        betAmount: 100,
        betType: 'fixed',
        payout: 92,
        expirySeconds: 60,
        strategyId: strat.id,
        strategyParams: {
          trendStrength: strat.trendStrength, // Less strict
          overlapTolerance: 1, // Allow some overlap
        },
      }

      const result = engine.run(config, candles)
      const stats = calculateDetailedStatistics(result.trades, config.initialBalance)

      console.log(`\n[${strat.name}] trendStrength=${strat.trendStrength}`)
      console.log('───────────────────────────────────────────────────────')
      console.log(`   Trades: ${stats.totalTrades}`)
      console.log(`   Win Rate: ${stats.winRate.toFixed(1)}%`)
      console.log(`   Profit Factor: ${stats.profitFactor.toFixed(2)}`)
      console.log(`   Net Profit: $${stats.netProfit.toFixed(2)}`)
      console.log(`   Max Drawdown: ${stats.maxDrawdownPercent.toFixed(1)}%`)
      console.log(`   CALL: ${stats.callTrades} (${stats.callWinRate.toFixed(1)}%)`)
      console.log(`   PUT: ${stats.putTrades} (${stats.putWinRate.toFixed(1)}%)`)
      
      if (stats.winRate >= 53) {
        console.log(`   ✅ PROFITABLE (${stats.winRate.toFixed(1)}% >= 53%)`)
      } else {
        console.log(`   ❌ NOT PROFITABLE (${stats.winRate.toFixed(1)}% < 53%)`)
      }
    }

    console.log('\n═══════════════════════════════════════════════════════')
  })

  it('should test in ranging market (best for reversal strategies)', () => {
    const candles = generatePatternedData('ranging', 1000)
    
    const config: BacktestConfig = {
      symbol: 'TEST',
      startTime: candles[0].timestamp,
      endTime: candles[candles.length - 1].timestamp,
      initialBalance: 10000,
      betAmount: 100,
      betType: 'fixed',
      payout: 92,
      expirySeconds: 60,
      strategyId: 'smma-stoch-aggressive',
      strategyParams: {
        trendStrength: 3,
        overlapTolerance: 2,
      },
    }

    const result = engine.run(config, candles)
    const stats = calculateDetailedStatistics(result.trades, config.initialBalance)

    console.log('\n[RANGING MARKET - Aggressive Settings]')
    console.log(formatStatisticsReport(stats))

    expect(result).toBeDefined()
  })
})
