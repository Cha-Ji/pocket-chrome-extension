// ============================================================
// Quick Backtest Runner for Strategy V3
// ============================================================

import { getBacktestEngine } from './engine'
import { StrategyV3 } from '../signals/strategies-v3'
import { Candle, BacktestConfig } from './types'
import * as fs from 'fs'

async function run() {
  const engine = getBacktestEngine()
  const v3 = new StrategyV3()
  engine.registerStrategy(v3)

  // Generate Dummy Data (1000 candles)
  const candles: Candle[] = []
  let price = 100
  const now = Date.now()
  
  for (let i = 0; i < 1000; i++) {
    const change = (Math.random() - 0.5) * 0.5
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.random() * 0.1
    const low = Math.min(open, close) - Math.random() * 0.1
    
    candles.push({
      timestamp: now - (1000 - i) * 60000,
      open,
      high,
      low,
      close,
    })
    price = close
  }

  const config: BacktestConfig = {
    symbol: 'BTC/USD',
    startTime: candles[0].timestamp,
    endTime: candles[999].timestamp,
    initialBalance: 1000,
    betAmount: 10,
    betType: 'fixed',
    payout: 92,
    expirySeconds: 60,
    strategyId: 'strategy-v3',
    strategyParams: {
      smmaFast: 5,
      smmaMid: 12,
      smmaSlow: 25,
      stochK: 5,
      stochD: 3,
      rsiPeriod: 14,
    },
    slippage: 0.0001,
    latencyMs: 50
  }

  console.log('--- Running Backtest: Strategy V3 ---')
  const result = engine.run(config, candles)

  console.log(`Total Trades: ${result.totalTrades}`)
  console.log(`Win Rate: ${result.winRate.toFixed(2)}%`)
  console.log(`Net Profit: $${result.netProfit.toFixed(2)} (${result.netProfitPercent.toFixed(2)}%)`)
  console.log(`Max Drawdown: $${result.maxDrawdown.toFixed(2)}`)
  console.log(`Profit Factor: ${result.profitFactor.toFixed(2)}`)
  
  // Optimization Test (Mini)
  console.log('\n--- Running Optimization (Parameters Search) ---')
  const optResults = engine.optimize(config, candles, {
    smmaFast: { min: 3, max: 10, step: 1 },
    smmaMid: { min: 10, max: 20, step: 2 },
    stochK: { min: 5, max: 14, step: 3 }
  })

  console.log(`Top 5 Param Combinations (out of ${optResults.length}):`)
  optResults.slice(0, 5).forEach((res, i) => {
    console.log(`${i+1}. Profit: $${res.netProfit.toFixed(2)} | WinRate: ${res.winRate.toFixed(1)}% | Trades: ${res.totalTrades} | Params: ${JSON.stringify(res.config.strategyParams)}`)
  })
}

run().catch(console.error)
