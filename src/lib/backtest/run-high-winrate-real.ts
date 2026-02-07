// ============================================================
// High Win-Rate Strategies - Real Data Backtest Runner
// ============================================================

import {
  rsiMacdStrategy,
  rsiBBBounceStrategy,
  adxFilteredRsiStrategy,
  tripleConfirmationStrategy,
  emaTrendRsiPullbackStrategy,
  voteStrategy,
  HighWinRateConfig
} from './strategies/high-winrate'
import { Candle } from '../signals/types'
import * as fs from 'fs'

// ============================================================
// Backtest Runner
// ============================================================

interface BacktestResult {
  strategy: string
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number
  netProfit: number
}

function runBacktest(
  strategyFn: (candles: Candle[], config?: Partial<HighWinRateConfig>) => any,
  allCandles: Candle[],
  strategyName: string,
  payout: number = 0.92,
  expiryCandles: number = 5,
  config?: Partial<HighWinRateConfig>
): BacktestResult {
  let wins = 0
  let losses = 0
  let totalProfit = 0
  let totalLoss = 0
  const betAmount = 10

  for (let i = 50; i < allCandles.length - expiryCandles; i++) {
    const lookback = allCandles.slice(0, i + 1)
    const result = strategyFn(lookback, config)

    if (result.signal) {
      const entryPrice = allCandles[i].close
      const expiryPrice = allCandles[i + expiryCandles].close

      const isWin =
        (result.signal === 'CALL' && expiryPrice > entryPrice) ||
        (result.signal === 'PUT' && expiryPrice < entryPrice)

      if (isWin) {
        wins++
        totalProfit += betAmount * payout
      } else {
        losses++
        totalLoss += betAmount
      }
    }
  }

  const totalTrades = wins + losses
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0
  const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0
  const netProfit = totalProfit - totalLoss

  return {
    strategy: strategyName,
    totalTrades,
    wins,
    losses,
    winRate,
    profitFactor,
    netProfit
  }
}

async function main() {
  const dataPath = '/Users/kong-bee/Documents/pocket-chrome-extension/data/BTCUSDT_1m.json'
  if (!fs.existsSync(dataPath)) {
    console.error('Data file not found:', dataPath)
    return
  }

  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  const candles: Candle[] = rawData.candles
  console.log(`\n📊 Loaded ${candles.length} candles from ${rawData.symbol} (${rawData.interval})\n`)

  const allStrategies = [
    { name: 'RSI+MACD', fn: rsiMacdStrategy },
    { name: 'RSI+BB', fn: rsiBBBounceStrategy },
    { name: 'ADX+RSI', fn: adxFilteredRsiStrategy },
    { name: 'Triple', fn: tripleConfirmationStrategy },
    { name: 'EMA Pullback', fn: emaTrendRsiPullbackStrategy },
    { name: 'Vote(2)', fn: (c: Candle[]) => voteStrategy(c, 2) },
    { name: 'Vote(3)', fn: (c: Candle[]) => voteStrategy(c, 3) },
    { name: 'Vote(4)', fn: (c: Candle[]) => voteStrategy(c, 4) },
  ]

  const allResults: BacktestResult[] = []

  console.log('🎯 52.1% TARGET TEST - REAL DATA')
  console.log('=' .repeat(70))
  console.log(`${'STRATEGY'.padEnd(15)} | ${'TRADES'.padStart(6)} | ${'WINRATE'.padStart(8)} | ${'PF'.padStart(5)} | ${'PROFIT'.padStart(8)}`)
  console.log('-' .repeat(70))

  allStrategies.forEach(s => {
    const result = runBacktest(s.fn, candles, s.name)
    allResults.push(result)

    const status = result.winRate >= 52.1 ? '✅' : '❌'
    console.log(`${status} ${s.name.padEnd(13)} | ${result.totalTrades.toString().padStart(6)} | ${result.winRate.toFixed(2).padStart(7)}% | ${result.profitFactor.toFixed(2).padStart(5)} | $${result.netProfit.toFixed(1).padStart(7)}`)
  })

  console.log('=' .repeat(70))

  const passing = allResults.filter(r => r.winRate >= 52.1)

  if (passing.length > 0) {
    console.log(`\n🎉 ${passing.length} strategies achieved 52.1%+ target!`)
    passing.sort((a, b) => b.winRate - a.winRate).forEach(r => {
      console.log(`   🏆 ${r.strategy}: ${r.winRate.toFixed(2)}% (${r.totalTrades} trades, PF: ${r.profitFactor.toFixed(2)})`)
    })
  } else {
    console.log('\n⚠️ No strategy achieved 52.1% target on this data set.')
    console.log('Trying parameter variations for Triple Confirmation...')
    
    // Quick variation test for Triple
    for (const rsiP of [7, 14]) {
      for (const oversold of [20, 25, 30]) {
        const name = `Triple (RSI ${rsiP}, OS ${oversold})`
        const res = runBacktest(tripleConfirmationStrategy, candles, name, 0.92, 5, {
          rsiPeriod: rsiP,
          rsiOversold: oversold,
          rsiOverbought: 100 - oversold
        })
        if (res.winRate >= 52.1 && res.totalTrades > 20) {
          console.log(`   ✨ FOUND: ${res.strategy} -> ${res.winRate.toFixed(2)}% (${res.totalTrades} trades)`)
        }
      }
    }
  }
}

main().catch(console.error)
