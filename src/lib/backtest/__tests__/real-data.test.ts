// ============================================================
// Real Data Backtest Tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { fetchBinanceData, fetchMultipleSymbols } from './real-data-fetcher'
import { detectRegime, calculateRegimeSeries } from './market-regime'
import { runAdaptiveBacktest, formatAdaptiveStats } from './adaptive-strategy'
import { runFastBacktest, formatStats } from './test-helpers'
import {
  createRSIStrategy,
  createMACDStrategy,
  createBBStrategy,
  compareStrategies,
  formatComparison,
} from './multi-strategy'

describe('Real Data - Market Regime Detection', () => {
  it('should detect current market regime', async () => {
    const candles = await fetchBinanceData('BTCUSDT', '1m', 200)
    
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║           BTCUSDT MARKET REGIME DETECTION              ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    
    const regime = detectRegime(candles)
    
    if (regime) {
      console.log(`\n🎯 Current Regime: ${regime.regime.toUpperCase()}`)
      console.log(`   ADX: ${regime.adx.toFixed(1)} (>25 = trending)`)
      console.log(`   BB Width: ${regime.bbWidth.toFixed(2)}%`)
      console.log(`   Trend Direction: ${regime.trendDirection > 0 ? '📈 UP' : regime.trendDirection < 0 ? '📉 DOWN' : '↔️ NEUTRAL'}`)
      console.log(`   Confidence: ${(regime.confidence * 100).toFixed(0)}%`)
    }
    
    expect(candles.length).toBeGreaterThan(0)
  }, 15000)

  it('should show regime distribution', async () => {
    const candles = await fetchBinanceData('BTCUSDT', '1m', 500)
    const regimes = calculateRegimeSeries(candles)
    
    console.log('\n═══════════════════════════════════════════════════════')
    console.log('           REGIME DISTRIBUTION (Last 500 candles)')
    console.log('═══════════════════════════════════════════════════════')
    
    const counts: Record<string, number> = {}
    regimes.forEach(r => {
      if (r) {
        counts[r.regime] = (counts[r.regime] || 0) + 1
      }
    })
    
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    
    for (const [regime, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      const pct = ((count / total) * 100).toFixed(1)
      const bar = '█'.repeat(Math.round(count / total * 30))
      console.log(`${regime.padEnd(18)} ${bar} ${pct}% (${count})`)
    }
    
    expect(total).toBeGreaterThan(0)
  }, 15000)
})

describe('Real Data - Strategy Comparison', () => {
  it('should compare strategies on BTCUSDT', async () => {
    const candles = await fetchBinanceData('BTCUSDT', '1m', 500)
    
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║        BTCUSDT STRATEGY COMPARISON (Real Data)         ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    
    const strategies = [
      createRSIStrategy(14, 30, 70),
      createRSIStrategy(7, 25, 75),
      createMACDStrategy(12, 26, 9),
      createMACDStrategy(8, 17, 9),
      createBBStrategy(20, 2),
    ]
    
    const results = compareStrategies(candles, strategies)
    
    console.log('    Strategy                  | Trades | Win % |   PF   | Profit')
    console.log('─'.repeat(70))
    console.log(formatComparison(results))
    
    expect(results.length).toBe(strategies.length)
  }, 15000)

  it('should compare on multiple symbols', async () => {
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║        MULTI-SYMBOL COMPARISON (Real Data)             ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']
    const dataMap = await fetchMultipleSymbols(symbols, '1m', 400)
    
    const rsiStrategy = createRSIStrategy(14, 30, 70)
    
    for (const [symbol, candles] of dataMap) {
      const results = compareStrategies(candles, [rsiStrategy])
      const r = results[0]
      const status = r.stats.winRate >= 53 ? '✅' : '❌'
      console.log(`${symbol.padEnd(10)} | ${String(r.stats.totalTrades).padStart(3)} trades | ${r.stats.winRate.toFixed(1).padStart(5)}% | $${r.stats.netProfit.toFixed(0).padStart(6)} ${status}`)
    }
    
    expect(dataMap.size).toBeGreaterThan(0)
  }, 30000)
})

describe('Real Data - Adaptive Strategy', () => {
  it('should run adaptive strategy on BTCUSDT', async () => {
    const candles = await fetchBinanceData('BTCUSDT', '1m', 500)
    
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║        ADAPTIVE STRATEGY BACKTEST (BTCUSDT)            ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    
    const { stats } = runAdaptiveBacktest(candles)
    console.log(formatAdaptiveStats(stats))
    
    expect(stats.totalTrades).toBeGreaterThanOrEqual(0)
  }, 15000)

  it('should compare adaptive vs single strategies', async () => {
    const candles = await fetchBinanceData('BTCUSDT', '1m', 500)
    
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║     ADAPTIVE vs SINGLE STRATEGY COMPARISON             ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    
    // Run adaptive
    const adaptive = runAdaptiveBacktest(candles)
    
    // Run single strategies
    const rsi = compareStrategies(candles, [createRSIStrategy(14, 30, 70)])[0]
    const macd = compareStrategies(candles, [createMACDStrategy(12, 26, 9)])[0]
    
    console.log('\n📊 Results:')
    console.log('─'.repeat(60))
    
    const format = (name: string, trades: number, wr: number, pf: number, profit: number) => {
      const status = wr >= 53 ? '✅' : '❌'
      const pfStr = pf === Infinity ? '∞' : pf.toFixed(2)
      console.log(`${name.padEnd(20)} | ${String(trades).padStart(3)} | ${wr.toFixed(1).padStart(5)}% | PF ${pfStr.padStart(5)} | $${profit.toFixed(0).padStart(6)} ${status}`)
    }
    
    format('🎯 Adaptive', adaptive.stats.totalTrades, adaptive.stats.winRate, adaptive.stats.profitFactor, adaptive.stats.netProfit)
    format('RSI(14) 30/70', rsi.stats.totalTrades, rsi.stats.winRate, rsi.stats.profitFactor, rsi.stats.netProfit)
    format('MACD(12,26,9)', macd.stats.totalTrades, macd.stats.winRate, macd.stats.profitFactor, macd.stats.netProfit)
    
    expect(true).toBe(true)
  }, 15000)

  it('should test on multiple timeframes', async () => {
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║        ADAPTIVE STRATEGY - MULTIPLE TIMEFRAMES         ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    
    const timeframes = ['1m', '5m', '15m']
    
    for (const tf of timeframes) {
      try {
        const candles = await fetchBinanceData('BTCUSDT', tf, 300)
        const { stats } = runAdaptiveBacktest(candles, { expiryCandles: tf === '1m' ? 4 : 2 })
        
        const status = stats.winRate >= 53 ? '✅' : '❌'
        const pf = stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)
        console.log(`${tf.padEnd(5)} | ${String(stats.totalTrades).padStart(3)} trades | ${stats.winRate.toFixed(1).padStart(5)}% | PF ${pf.padStart(5)} | $${stats.netProfit.toFixed(0).padStart(6)} ${status}`)
        
        await new Promise(r => setTimeout(r, 200)) // Rate limit
      } catch (e) {
        console.log(`${tf}: Error fetching data`)
      }
    }
    
    expect(true).toBe(true)
  }, 45000)
})

describe('Real Data - SMMA Strategy on Real Data', () => {
  it('should test SMMA on BTCUSDT', async () => {
    const candles = await fetchBinanceData('BTCUSDT', '1m', 500)
    
    console.log('\n╔════════════════════════════════════════════════════════╗')
    console.log('║        SMMA+STOCHASTIC on BTCUSDT (Real Data)          ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    
    const configs = [
      { trendStrength: 3, label: 'Aggressive (3/6)' },
      { trendStrength: 4, label: 'Moderate (4/6)' },
      { trendStrength: 5, label: 'Conservative (5/6)' },
    ]
    
    for (const cfg of configs) {
      const { stats } = runFastBacktest(candles, { trendStrength: cfg.trendStrength })
      console.log(formatStats(stats, cfg.label))
    }
    
    expect(candles.length).toBeGreaterThan(0)
  }, 15000)
})
