// ============================================================
// Forward Test Runner
// ============================================================

import { SignalGenerator, fetchCandles } from '../src/lib/signals/signal-generator'
import { detectRegime } from '../src/lib/signals/strategies'
import * as fs from 'fs'

interface ForwardTestResult {
  timestamp: string
  symbol: string
  direction: 'CALL' | 'PUT'
  strategy: string
  regime: string
  entryPrice: number
  exitPrice: number
  result: 'WIN' | 'LOSS' | 'TIE'
  profit: number
}

interface ForwardTestReport {
  testInfo: {
    startTime: string
    endTime: string
    durationMinutes: number
    symbol: string
    initialBalance: number
    riskPerTrade: string
  }
  summary: {
    totalTrades: number
    wins: number
    losses: number
    winRate: string
    netProfit: string
    finalBalance: string
  }
  trades: ForwardTestResult[]
}

async function runForwardTest(durationMs: number = 180000) {
  console.log('🚀 Forward Test Started')
  console.log(`Duration: ${durationMs / 60000} minutes`)
  console.log('═'.repeat(50))

  const generator = new SignalGenerator()
  const symbol = 'BTCUSDT'
  const initialBalance = 1000
  const riskPercent = 1
  let balance = initialBalance
  const trades: ForwardTestResult[] = []
  const startTime = Date.now()

  // Load initial history
  const history = await fetchCandles(symbol, '1m', 100)
  generator.setHistory(symbol, history)
  console.log(`📊 Loaded ${history.length} candles\n`)

  const checkInterval = 10000 // Check every 10 seconds
  let lastCheck = 0

  while (Date.now() - startTime < durationMs) {
    const now = Date.now()
    
    // Check every interval
    if (now - lastCheck < checkInterval) {
      await new Promise(r => setTimeout(r, 1000))
      continue
    }
    lastCheck = now

    try {
      // Fetch latest candles
      const candles = await fetchCandles(symbol, '1m', 5)
      const latestCandle = candles[candles.length - 1]
      
      // Check regime
      const allCandles = await fetchCandles(symbol, '1m', 100)
      const regimeInfo = detectRegime(allCandles)
      
      // Add candle and check for signal
      const signal = generator.addCandle(symbol, latestCandle)

      const time = new Date().toLocaleTimeString()
      console.log(`[${time}] ${symbol} $${latestCandle.close.toFixed(2)} | ${regimeInfo.regime} (ADX: ${regimeInfo.adx.toFixed(1)})`)

      if (signal) {
        const amount = (balance * riskPercent) / 100
        console.log(`\n🎯 SIGNAL: ${signal.direction} via ${signal.strategy}`)
        console.log(`   Entry: $${signal.entryPrice.toFixed(2)}`)
        console.log(`   Amount: $${amount.toFixed(2)} (${riskPercent}% of $${balance.toFixed(0)})`)

        // Wait for expiry (60 seconds)
        console.log(`   Waiting 60s for result...`)
        await new Promise(r => setTimeout(r, 60000))

        // Get exit price
        const exitCandles = await fetchCandles(symbol, '1m', 1)
        const exitPrice = exitCandles[0].close

        // Determine result
        let result: 'WIN' | 'LOSS' | 'TIE'
        if (exitPrice === signal.entryPrice) {
          result = 'TIE'
        } else if (signal.direction === 'CALL') {
          result = exitPrice > signal.entryPrice ? 'WIN' : 'LOSS'
        } else {
          result = exitPrice < signal.entryPrice ? 'WIN' : 'LOSS'
        }

        const profit = result === 'WIN' ? amount * 0.92 : result === 'LOSS' ? -amount : 0
        balance += profit

        const icon = result === 'WIN' ? '🟢' : result === 'LOSS' ? '🔴' : '⚪'
        console.log(`${icon} Result: ${result} | Exit: $${exitPrice.toFixed(2)} | P/L: $${profit.toFixed(2)}`)
        console.log(`   Balance: $${balance.toFixed(2)}\n`)

        trades.push({
          timestamp: new Date().toISOString(),
          symbol,
          direction: signal.direction,
          strategy: signal.strategy,
          regime: regimeInfo.regime,
          entryPrice: signal.entryPrice,
          exitPrice,
          result,
          profit,
        })
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const endTime = Date.now()
  const wins = trades.filter(t => t.result === 'WIN').length
  const losses = trades.filter(t => t.result === 'LOSS').length
  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0)

  const report: ForwardTestReport = {
    testInfo: {
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationMinutes: Math.round((endTime - startTime) / 60000),
      symbol,
      initialBalance,
      riskPerTrade: `${riskPercent}%`,
    },
    summary: {
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length > 0 ? `${((wins / trades.length) * 100).toFixed(1)}%` : '0%',
      netProfit: `$${netProfit.toFixed(2)}`,
      finalBalance: `$${balance.toFixed(2)}`,
    },
    trades,
  }

  // Save report
  const reportPath = './forward-test-results.json'
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log('\n' + '═'.repeat(50))
  console.log('📊 FORWARD TEST RESULTS')
  console.log('═'.repeat(50))
  console.log(`Duration: ${report.testInfo.durationMinutes} minutes`)
  console.log(`Total Trades: ${trades.length}`)
  console.log(`Win Rate: ${report.summary.winRate}`)
  console.log(`Net P/L: ${report.summary.netProfit}`)
  console.log(`Final Balance: ${report.summary.finalBalance}`)
  console.log('═'.repeat(50))
  console.log(`Results saved to: ${reportPath}`)

  return report
}

// Run for 3 minutes
runForwardTest(180000).catch(console.error)
