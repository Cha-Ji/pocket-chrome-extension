// ============================================================
// Quick Backtest V2 - Offline Validation
// ============================================================
// 로컬 데이터를 사용해 V2 전략 성능을 빠르게 검증
// ============================================================

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { SignalGeneratorV2 } from '../src/lib/signals/signal-generator-v2'
import { Candle } from '../src/lib/signals/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface BacktestResult {
  symbol: string
  totalSignals: number
  wins: number
  losses: number
  winRate: string
  byStrategy: Record<string, { count: number; wins: number; losses: number }>
  byRegime: Record<string, { count: number; wins: number; losses: number }>
}

function loadCandles(filename: string): Candle[] {
  const filepath = path.join(__dirname, '../data', filename)
  const fileContent = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
  
  // Handle both array format and object format with candles property
  const data = Array.isArray(fileContent) ? fileContent : fileContent.candles
  
  if (!Array.isArray(data)) {
    throw new Error(`Invalid data format in ${filename}`)
  }
  
  return data.map((k: any) => ({
    timestamp: k.timestamp || k[0],
    open: typeof k.open === 'number' ? k.open : parseFloat(k[1]),
    high: typeof k.high === 'number' ? k.high : parseFloat(k[2]),
    low: typeof k.low === 'number' ? k.low : parseFloat(k[3]),
    close: typeof k.close === 'number' ? k.close : parseFloat(k[4]),
    volume: typeof k.volume === 'number' ? k.volume : parseFloat(k[5] || 0),
  }))
}

function runBacktest(symbol: string, candles: Candle[]): BacktestResult {
  const generator = new SignalGeneratorV2({
    minConfidence: 0.6,
    useTrendFilter: true,
    minVotesForSignal: 2,
  })

  const results: Array<{
    direction: 'CALL' | 'PUT'
    strategy: string
    regime: string
    entryPrice: number
    exitPrice: number
    result: 'WIN' | 'LOSS'
  }> = []

  // Initialize with first 50 candles
  const initCandles = candles.slice(0, 50)
  generator.setHistory(symbol, initCandles)

  // Process remaining candles
  for (let i = 50; i < candles.length - 1; i++) {
    const candle = candles[i]
    const nextCandle = candles[i + 1]

    const signal = generator.addCandle(symbol, candle)

    if (signal) {
      // Determine result based on next candle
      const entryPrice = candle.close
      const exitPrice = nextCandle.close

      let result: 'WIN' | 'LOSS'
      if (signal.direction === 'CALL') {
        result = exitPrice > entryPrice ? 'WIN' : 'LOSS'
      } else {
        result = exitPrice < entryPrice ? 'WIN' : 'LOSS'
      }

      results.push({
        direction: signal.direction,
        strategy: signal.strategy,
        regime: signal.regime,
        entryPrice,
        exitPrice,
        result,
      })

      // Update signal result
      generator.updateSignalResult(signal.id, result === 'WIN' ? 'win' : 'loss')
    }
  }

  // Calculate statistics
  const wins = results.filter(r => r.result === 'WIN').length
  const losses = results.filter(r => r.result === 'LOSS').length

  const byStrategy: Record<string, { count: number; wins: number; losses: number }> = {}
  const byRegime: Record<string, { count: number; wins: number; losses: number }> = {}

  results.forEach(r => {
    const stratKey = r.strategy.split(':')[0].trim()
    if (!byStrategy[stratKey]) byStrategy[stratKey] = { count: 0, wins: 0, losses: 0 }
    byStrategy[stratKey].count++
    if (r.result === 'WIN') byStrategy[stratKey].wins++
    else byStrategy[stratKey].losses++

    if (!byRegime[r.regime]) byRegime[r.regime] = { count: 0, wins: 0, losses: 0 }
    byRegime[r.regime].count++
    if (r.result === 'WIN') byRegime[r.regime].wins++
    else byRegime[r.regime].losses++
  })

  return {
    symbol,
    totalSignals: results.length,
    wins,
    losses,
    winRate: results.length > 0 ? `${((wins / results.length) * 100).toFixed(1)}%` : 'N/A',
    byStrategy,
    byRegime,
  }
}

async function main() {
  console.log('═'.repeat(60))
  console.log('📊 Quick Backtest V2 - High Win Rate Strategy Validation')
  console.log('═'.repeat(60))

  const dataFiles = [
    { file: 'BTCUSDT_1m.json', symbol: 'BTCUSDT' },
    { file: 'ETHUSDT_1m.json', symbol: 'ETHUSDT' },
  ]

  const allResults: BacktestResult[] = []

  for (const { file, symbol } of dataFiles) {
    try {
      console.log(`\n📈 Testing ${symbol}...`)
      const candles = loadCandles(file)
      console.log(`   Loaded ${candles.length} candles`)

      const result = runBacktest(symbol, candles)
      allResults.push(result)

      console.log(`   Total Signals: ${result.totalSignals}`)
      console.log(`   Win Rate: ${result.winRate} (${result.wins}/${result.wins + result.losses})`)

      if (Object.keys(result.byStrategy).length > 0) {
        console.log('   By Strategy:')
        Object.entries(result.byStrategy).forEach(([strat, stats]) => {
          const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 'N/A'
          console.log(`     - ${strat}: ${wr}% (${stats.wins}/${stats.count})`)
        })
      }

      if (Object.keys(result.byRegime).length > 0) {
        console.log('   By Regime:')
        Object.entries(result.byRegime).forEach(([regime, stats]) => {
          const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 'N/A'
          console.log(`     - ${regime}: ${wr}% (${stats.wins}/${stats.count})`)
        })
      }
    } catch (error) {
      console.error(`   Error testing ${symbol}:`, error)
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60))
  console.log('📊 SUMMARY')
  console.log('═'.repeat(60))

  const totalSignals = allResults.reduce((sum, r) => sum + r.totalSignals, 0)
  const totalWins = allResults.reduce((sum, r) => sum + r.wins, 0)
  const totalLosses = allResults.reduce((sum, r) => sum + r.losses, 0)
  const overallWinRate = totalSignals > 0 ? ((totalWins / totalSignals) * 100).toFixed(1) : 'N/A'

  console.log(`Total Signals: ${totalSignals}`)
  console.log(`Overall Win Rate: ${overallWinRate}% (${totalWins}/${totalWins + totalLosses})`)
  console.log(`Target: 52.1%`)
  console.log(`Status: ${parseFloat(overallWinRate) >= 52.1 ? '✅ TARGET MET' : '⚠️ BELOW TARGET'}`)
  console.log('═'.repeat(60))
}

main().catch(console.error)
