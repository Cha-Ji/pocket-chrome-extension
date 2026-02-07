// Fast SMMA backtest - pre-calculate indicators once
import { generatePatternedData } from './data-generator'
import { SMMA, Stochastic } from '../indicators'
import { Candle } from './types'

const SHORT_MA_PERIODS = [3, 5, 7, 9, 11, 13]
const LONG_MA_PERIODS = [30, 35, 40, 45, 50]

interface PrecomputedIndicators {
  shortMAs: Map<number, number[]>
  longMAs: Map<number, number[]>
  stoch: { k: number; d: number }[]
}

function precompute(candles: Candle[]): PrecomputedIndicators {
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)

  return {
    shortMAs: new Map(SHORT_MA_PERIODS.map(p => [p, SMMA.calculate(closes, p)])),
    longMAs: new Map(LONG_MA_PERIODS.map(p => [p, SMMA.calculate(closes, p)])),
    stoch: Stochastic.calculate(highs, lows, closes, 14, 3),
  }
}

interface Trade {
  entry: number
  exit: number
  direction: 'CALL' | 'PUT'
  result: 'WIN' | 'LOSS' | 'TIE'
  profit: number
}

function runBacktest(candles: Candle[], trendStrength: number = 4): { trades: Trade[]; stats: any } {
  const ind = precompute(candles)
  const trades: Trade[] = []
  const payout = 0.92
  const betAmount = 100

  // Start after longest MA has enough data
  const startIdx = 60 // After SMMA 50 has warmed up
  const stochOffset = candles.length - ind.stoch.length

  for (let i = startIdx; i < candles.length - 5; i++) {
    // Get indicator values at this point
    const shortVals = SHORT_MA_PERIODS.map(p => {
      const arr = ind.shortMAs.get(p)!
      const idx = i - p + 1
      return idx >= 0 && idx < arr.length ? arr[idx] : null
    }).filter(v => v !== null) as number[]

    const longVals = LONG_MA_PERIODS.map(p => {
      const arr = ind.longMAs.get(p)!
      const idx = i - p + 1
      return idx >= 0 && idx < arr.length ? arr[idx] : null
    }).filter(v => v !== null) as number[]

    if (shortVals.length < 6 || longVals.length < 5) continue

    const stochIdx = i - stochOffset
    if (stochIdx < 1 || stochIdx >= ind.stoch.length) continue

    const currStoch = ind.stoch[stochIdx]
    const prevStoch = ind.stoch[stochIdx - 1]

    // Trend detection
    const longMin = Math.min(...longVals)
    const longMax = Math.max(...longVals)

    const shortAbove = shortVals.filter(s => s > longMax).length
    const shortBelow = shortVals.filter(s => s < longMin).length

    const isUptrend = shortAbove >= trendStrength
    const isDowntrend = shortBelow >= trendStrength

    // Stochastic cross
    const goldenCross = prevStoch.k < prevStoch.d && currStoch.k >= currStoch.d
    const deadCross = prevStoch.k > prevStoch.d && currStoch.k <= currStoch.d
    const fromOversold = prevStoch.k < 30
    const fromOverbought = prevStoch.k > 70

    let direction: 'CALL' | 'PUT' | null = null

    if (isUptrend && goldenCross && fromOversold) direction = 'CALL'
    else if (isDowntrend && deadCross && fromOverbought) direction = 'PUT'

    if (direction) {
      const entryPrice = candles[i].close
      const exitIdx = Math.min(i + 4, candles.length - 1)
      const exitPrice = candles[exitIdx].close

      let result: 'WIN' | 'LOSS' | 'TIE'
      if (entryPrice === exitPrice) result = 'TIE'
      else if (direction === 'CALL') result = exitPrice > entryPrice ? 'WIN' : 'LOSS'
      else result = exitPrice < entryPrice ? 'WIN' : 'LOSS'

      const profit = result === 'WIN' ? betAmount * payout : result === 'LOSS' ? -betAmount : 0

      trades.push({ entry: entryPrice, exit: exitPrice, direction, result, profit })
      i = exitIdx // Skip to exit
    }
  }

  const wins = trades.filter(t => t.result === 'WIN').length
  const total = trades.length
  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0)
  const grossProfit = trades.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0)
  const grossLoss = Math.abs(trades.filter(t => t.profit < 0).reduce((s, t) => s + t.profit, 0))

  return {
    trades,
    stats: {
      total,
      wins,
      winRate: total > 0 ? (wins / total * 100).toFixed(1) : '0.0',
      netProfit: netProfit.toFixed(0),
      profitFactor: grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : '∞',
      calls: trades.filter(t => t.direction === 'CALL').length,
      puts: trades.filter(t => t.direction === 'PUT').length,
    }
  }
}

// Run tests
console.log('\n╔════════════════════════════════════════════════════════╗')
console.log('║      SMMA + STOCHASTIC BACKTEST (FAST VERSION)        ║')
console.log('╚════════════════════════════════════════════════════════╝')

const markets = [
  { type: 'uptrend', name: '📈 Uptrend' },
  { type: 'downtrend', name: '📉 Downtrend' },
  { type: 'ranging', name: '↔️ Ranging' },
] as const

const configs = [
  { name: 'Conservative (6/6)', strength: 6 },
  { name: 'Moderate (5/6)', strength: 5 },
  { name: 'Aggressive (4/6)', strength: 4 },
  { name: 'Very Aggressive (3/6)', strength: 3 },
]

for (const market of markets) {
  console.log(`\n${market.name} (1000 candles)`)
  console.log('─'.repeat(58))
  
  const candles = generatePatternedData(market.type, 1000)
  
  for (const cfg of configs) {
    const { stats } = runBacktest(candles, cfg.strength)
    const status = parseFloat(stats.winRate) >= 53 ? '✅' : '❌'
    console.log(`  ${cfg.name.padEnd(22)} | ${String(stats.total).padStart(3)} trades | Win ${stats.winRate.padStart(5)}% | PF ${stats.profitFactor.padStart(5)} | $${stats.netProfit.padStart(6)} ${status}`)
  }
}

console.log('\n════════════════════════════════════════════════════════')
console.log('🎯 Target: Win Rate >= 53% (for 92% payout breakeven)')
console.log('════════════════════════════════════════════════════════\n')
