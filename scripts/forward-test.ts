// ============================================================
// Forward Test Runner V2
// ============================================================
// V2 업그레이드:
// - V2 전략만 사용 (RSI V2, EMA Cross V2)
// - Stochastic 제외 (실전 25% 실패)
// - 로컬 데이터 파일 지원 (Binance API 대안)
// - 상세 전략별 통계
// ============================================================

import { SignalGeneratorV2 } from '../src/lib/signals/signal-generator-v2'
import { detectRegime } from '../src/lib/signals/strategies-v2'
import { Candle, MarketRegime } from '../src/lib/signals/types'
import * as fs from 'fs'
import * as path from 'path'

interface ForwardTestResult {
  timestamp: string
  symbol: string
  direction: 'CALL' | 'PUT'
  strategy: string
  regime: MarketRegime
  entryPrice: number
  exitPrice: number
  result: 'WIN' | 'LOSS' | 'TIE'
  profit: number
  confidence: number
  indicators: Record<string, number>
}

interface ForwardTestReportV2 {
  testInfo: {
    version: string
    startTime: string
    endTime: string
    durationMinutes: number
    symbol: string
    dataSource: string
    initialBalance: number
    riskPerTrade: string
  }
  summary: {
    totalTrades: number
    wins: number
    losses: number
    ties: number
    winRate: string
    netProfit: string
    finalBalance: string
    profitFactor: string
    maxConsecutiveLosses: number
  }
  strategyBreakdown: Array<{
    name: string
    trades: number
    wins: number
    losses: number
    winRate: string
    recommendation: string
  }>
  regimeBreakdown: Array<{
    regime: MarketRegime
    trades: number
    wins: number
    winRate: string
  }>
  trades: ForwardTestResult[]
}

// ============================================================
// Binance API 호출 (네트워크 가능시)
// ============================================================

async function fetchCandlesFromAPI(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`)
  }
  
  const data = await response.json()
  
  return data.map((kline: unknown[]) => ({
    timestamp: kline[0] as number,
    open: parseFloat(kline[1] as string),
    high: parseFloat(kline[2] as string),
    low: parseFloat(kline[3] as string),
    close: parseFloat(kline[4] as string),
    volume: parseFloat(kline[5] as string),
  }))
}

// ============================================================
// 로컬 데이터 파일 로드
// ============================================================

function loadCandlesFromFile(symbol: string): Candle[] {
  const dataDir = path.join(__dirname, '..', 'data')
  const fileName = `${symbol}_1m.json`
  const filePath = path.join(dataDir, fileName)
  
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Data file not found: ${filePath}`)
    return []
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  console.log(`📁 Loaded ${data.length} candles from ${fileName}`)
  return data
}

// ============================================================
// Forward Test Runner V2
// ============================================================

async function runForwardTestV2(options: {
  durationMs?: number
  useLocalData?: boolean
  symbol?: string
} = {}) {
  const {
    durationMs = 180000,
    useLocalData = false,
    symbol = 'BTCUSDT',
  } = options

  console.log('🚀 Forward Test V2 Started')
  console.log('═'.repeat(60))
  console.log(`Version: 2.0 (RSI V2 + EMA Cross V2, No Stochastic)`)
  console.log(`Symbol: ${symbol}`)
  console.log(`Duration: ${durationMs / 60000} minutes`)
  console.log(`Data Source: ${useLocalData ? 'Local File' : 'Binance API'}`)
  console.log('═'.repeat(60))

  const generator = new SignalGeneratorV2({
    symbols: [symbol],
    minConfidence: 0.3,
    expirySeconds: 60,
  })

  const initialBalance = 1000
  const riskPercent = 1
  let balance = initialBalance
  const trades: ForwardTestResult[] = []
  const startTime = Date.now()

  // 데이터 소스 선택
  let candles: Candle[] = []
  let dataSource = 'None'

  if (useLocalData) {
    candles = loadCandlesFromFile(symbol)
    dataSource = 'Local File'
  } else {
    try {
      candles = await fetchCandlesFromAPI(symbol, '1m', 100)
      dataSource = 'Binance API'
      console.log(`📊 Loaded ${candles.length} candles from API\n`)
    } catch (error) {
      console.warn(`⚠️ API failed, falling back to local data: ${error}`)
      candles = loadCandlesFromFile(symbol)
      dataSource = 'Local File (fallback)'
    }
  }

  if (candles.length === 0) {
    console.error('❌ No candle data available')
    return null
  }

  // 히스토리 설정
  generator.setHistory(symbol, candles.slice(-100))

  const checkInterval = 10000 // 10초마다 체크
  let lastCheck = 0
  let candleIndex = candles.length > 100 ? 100 : candles.length - 1

  while (Date.now() - startTime < durationMs) {
    const now = Date.now()
    
    if (now - lastCheck < checkInterval) {
      await new Promise(r => setTimeout(r, 1000))
      continue
    }
    lastCheck = now

    try {
      // 로컬 데이터 모드: 순차적으로 캔들 추가
      let latestCandle: Candle
      let regimeCandles: Candle[]

      if (useLocalData && candleIndex < candles.length) {
        latestCandle = candles[candleIndex]
        regimeCandles = candles.slice(Math.max(0, candleIndex - 100), candleIndex + 1)
        candleIndex++
      } else if (!useLocalData) {
        // 실시간 API 모드
        const newCandles = await fetchCandlesFromAPI(symbol, '1m', 5)
        latestCandle = newCandles[newCandles.length - 1]
        regimeCandles = await fetchCandlesFromAPI(symbol, '1m', 100)
      } else {
        // 로컬 데이터 소진
        console.log('\n📊 Local data exhausted, ending test...')
        break
      }

      const regimeInfo = detectRegime(regimeCandles)
      const signal = generator.addCandle(symbol, latestCandle)

      const time = new Date().toLocaleTimeString()
      console.log(`[${time}] ${symbol} $${latestCandle.close.toFixed(2)} | ${regimeInfo.regime} (ADX: ${regimeInfo.adx.toFixed(1)})`)

      if (signal) {
        const amount = (balance * riskPercent) / 100
        console.log(`\n🎯 SIGNAL: ${signal.direction} via ${signal.strategy}`)
        console.log(`   Entry: $${signal.entryPrice.toFixed(2)}`)
        console.log(`   Confidence: ${(signal.confidence * 100).toFixed(0)}%`)
        console.log(`   Amount: $${amount.toFixed(2)} (${riskPercent}% of $${balance.toFixed(0)})`)

        // 결과 대기 (60초 또는 다음 캔들)
        let exitPrice: number

        if (useLocalData && candleIndex < candles.length) {
          // 로컬: 다음 캔들의 close를 exit price로 사용
          exitPrice = candles[candleIndex].close
          console.log(`   (Using next candle for exit)`)
        } else if (!useLocalData) {
          // 실시간: 60초 대기
          console.log(`   Waiting 60s for result...`)
          await new Promise(r => setTimeout(r, 60000))
          const exitCandles = await fetchCandlesFromAPI(symbol, '1m', 1)
          exitPrice = exitCandles[0].close
        } else {
          exitPrice = latestCandle.close
        }

        // 결과 판정
        let result: 'WIN' | 'LOSS' | 'TIE'
        if (Math.abs(exitPrice - signal.entryPrice) < 0.01) {
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
          regime: signal.regime,
          entryPrice: signal.entryPrice,
          exitPrice,
          result,
          profit,
          confidence: signal.confidence,
          indicators: signal.indicators,
        })
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  // ============================================================
  // 결과 분석
  // ============================================================

  const endTime = Date.now()
  const wins = trades.filter(t => t.result === 'WIN').length
  const losses = trades.filter(t => t.result === 'LOSS').length
  const ties = trades.filter(t => t.result === 'TIE').length
  const netProfit = trades.reduce((sum, t) => sum + t.profit, 0)
  const totalGains = trades.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0)
  const totalLosses = Math.abs(trades.filter(t => t.profit < 0).reduce((s, t) => s + t.profit, 0))
  const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? Infinity : 0

  // 연속 손실 계산
  let maxConsecutiveLosses = 0
  let currentLosses = 0
  for (const trade of trades) {
    if (trade.result === 'LOSS') {
      currentLosses++
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses)
    } else {
      currentLosses = 0
    }
  }

  // 전략별 통계
  const strategyStats = new Map<string, { wins: number; losses: number }>()
  for (const trade of trades) {
    if (!strategyStats.has(trade.strategy)) {
      strategyStats.set(trade.strategy, { wins: 0, losses: 0 })
    }
    const stats = strategyStats.get(trade.strategy)!
    if (trade.result === 'WIN') stats.wins++
    if (trade.result === 'LOSS') stats.losses++
  }

  const strategyBreakdown = Array.from(strategyStats.entries()).map(([name, stats]) => {
    const total = stats.wins + stats.losses
    const winRate = total > 0 ? (stats.wins / total) * 100 : 0
    let recommendation = '⚠️ 검토 필요'
    if (winRate >= 55) recommendation = '✅ 사용 권장'
    else if (winRate < 45) recommendation = '❌ 사용 자제'
    return {
      name,
      trades: total,
      wins: stats.wins,
      losses: stats.losses,
      winRate: `${winRate.toFixed(1)}%`,
      recommendation,
    }
  })

  // 시장 상태별 통계
  const regimeStats = new Map<MarketRegime, { wins: number; losses: number }>()
  for (const trade of trades) {
    if (!regimeStats.has(trade.regime)) {
      regimeStats.set(trade.regime, { wins: 0, losses: 0 })
    }
    const stats = regimeStats.get(trade.regime)!
    if (trade.result === 'WIN') stats.wins++
    if (trade.result === 'LOSS') stats.losses++
  }

  const regimeBreakdown = Array.from(regimeStats.entries()).map(([regime, stats]) => {
    const total = stats.wins + stats.losses
    return {
      regime,
      trades: total,
      wins: stats.wins,
      winRate: `${total > 0 ? ((stats.wins / total) * 100).toFixed(1) : 0}%`,
    }
  })

  // ============================================================
  // 리포트 생성
  // ============================================================

  const report: ForwardTestReportV2 = {
    testInfo: {
      version: '2.0',
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationMinutes: Math.round((endTime - startTime) / 60000),
      symbol,
      dataSource,
      initialBalance,
      riskPerTrade: `${riskPercent}%`,
    },
    summary: {
      totalTrades: trades.length,
      wins,
      losses,
      ties,
      winRate: trades.length > 0 ? `${((wins / (trades.length - ties)) * 100).toFixed(1)}%` : '0%',
      netProfit: `$${netProfit.toFixed(2)}`,
      finalBalance: `$${balance.toFixed(2)}`,
      profitFactor: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2),
      maxConsecutiveLosses,
    },
    strategyBreakdown,
    regimeBreakdown,
    trades,
  }

  // 파일 저장
  const reportPath = './forward-test-results.json'
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  // 결과 출력
  console.log('\n' + '═'.repeat(60))
  console.log('📊 FORWARD TEST V2 RESULTS')
  console.log('═'.repeat(60))
  console.log(`Duration: ${report.testInfo.durationMinutes} minutes`)
  console.log(`Data Source: ${dataSource}`)
  console.log(`Total Trades: ${trades.length}`)
  console.log(`Win Rate: ${report.summary.winRate}`)
  console.log(`Net P/L: ${report.summary.netProfit}`)
  console.log(`Final Balance: ${report.summary.finalBalance}`)
  console.log(`Profit Factor: ${report.summary.profitFactor}`)
  console.log(`Max Consecutive Losses: ${maxConsecutiveLosses}`)
  
  console.log('\n📈 Strategy Breakdown:')
  for (const s of strategyBreakdown) {
    console.log(`   ${s.name}: ${s.winRate} (${s.wins}W/${s.losses}L) ${s.recommendation}`)
  }
  
  console.log('\n🌍 Regime Breakdown:')
  for (const r of regimeBreakdown) {
    console.log(`   ${r.regime}: ${r.winRate} (${r.trades} trades)`)
  }
  
  console.log('═'.repeat(60))
  console.log(`Results saved to: ${reportPath}`)

  return report
}

// ============================================================
// CLI Arguments
// ============================================================

const args = process.argv.slice(2)
const durationMinutes = args.find(a => !a.startsWith('--'))
  ? parseInt(args.find(a => !a.startsWith('--'))!)
  : 60
const useLocalData = args.includes('--local')
const symbol = args.find(a => a.startsWith('--symbol='))?.split('=')[1] || 'BTCUSDT'

console.log(`\n⏱️  Forward Test V2 configured:`)
console.log(`   Duration: ${durationMinutes} minutes`)
console.log(`   Local Data: ${useLocalData}`)
console.log(`   Symbol: ${symbol}\n`)

runForwardTestV2({
  durationMs: durationMinutes * 60 * 1000,
  useLocalData,
  symbol,
}).catch(console.error)
