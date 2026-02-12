/**
 * 종합 백테스트 리포트 생성기
 * 실행: npx tsx scripts/run-backtest-report.ts
 *
 * O(n²) 엔진 특성상 캔들 수를 제한하여 실행 시간을 관리합니다.
 * 300캔들 × 28전략 × 7데이터셋 ≈ 5~10분 예상
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 전략 임포트
import { getBacktestEngine } from '../src/lib/backtest/engine'
import { runLeaderboard } from '../src/lib/backtest/leaderboard'
import { RSIStrategies } from '../src/lib/backtest/strategies/rsi-strategy'
import { BollingerStrategies } from '../src/lib/backtest/strategies/bollinger-strategy'
import { MACDStrategies } from '../src/lib/backtest/strategies/macd-strategy'
import { StochRSIStrategies } from '../src/lib/backtest/strategies/stochastic-rsi-strategy'
import { SMMAStrategies } from '../src/lib/backtest/strategies/smma-stochastic'
import { ATRStrategies } from '../src/lib/backtest/strategies/atr-breakout-strategy'
import { CCIStrategies } from '../src/lib/backtest/strategies/cci-strategy'
import { WilliamsRStrategies } from '../src/lib/backtest/strategies/williams-r-strategy'
import type { Candle } from '../src/lib/backtest/types'

// ─── 설정 ───
const MAX_CANDLES = 300  // O(n²) 엔진 → 300개가 현실적 상한
const INITIAL_BALANCE = 10000
const BET_AMOUNT = 100
const PAYOUT = 92
const MIN_TRADES = 5  // 300캔들에선 거래가 적으므로 하한 낮춤
const BREAKEVEN_WR = 52.1

// ─── 전략 등록 (console.log 억제) ───
const engine = getBacktestEngine()
const allGroups = [
  RSIStrategies, BollingerStrategies, MACDStrategies, StochRSIStrategies,
  SMMAStrategies, ATRStrategies, CCIStrategies, WilliamsRStrategies,
]
const origLog = console.log
console.log = () => {}
const existingIds = new Set(engine.getStrategies().map(s => s.id))
for (const group of allGroups) {
  for (const s of group) {
    if (!existingIds.has(s.id)) {
      engine.registerStrategy(s)
      existingIds.add(s.id)
    }
  }
}
console.log = origLog
console.log(`✅ 등록된 전략: ${engine.getStrategies().length}개`)

// ─── 데이터 로드 ───
const dataDir = path.join(__dirname, '..', 'data')
const resDir = path.join(dataDir, 'results')
if (!fs.existsSync(resDir)) fs.mkdirSync(resDir, { recursive: true })

const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'))
console.log(`📁 데이터 파일: ${files.length}개\n`)

interface DatasetResult {
  sym: string
  tf: string
  count: number
  elapsed: number
  result: ReturnType<typeof runLeaderboard>
}

const results: DatasetResult[] = []
const totalStart = Date.now()

// ─── 각 데이터셋에 대해 리더보드 실행 ───
for (let fi = 0; fi < files.length; fi++) {
  const f = files[fi]
  const raw = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'))
  const arr = raw.candles || raw
  if (!Array.isArray(arr) || arr.length < 100) {
    console.log(`⏭ ${f}: 데이터 부족 (${Array.isArray(arr) ? arr.length : 0}개)`)
    continue
  }

  // 캔들 변환
  const candles: Candle[] = arr.map((k: any) => ({
    timestamp: k.timestamp || k[0],
    open: +k.open || parseFloat(k[1]),
    high: +k.high || parseFloat(k[2]),
    low: +k.low || parseFloat(k[3]),
    close: +k.close || parseFloat(k[4]),
    volume: +k.volume || parseFloat(k[5] || '0'),
  })).filter((c: Candle) => c.close > 0 && !isNaN(c.close)).slice(-MAX_CANDLES)

  // 심볼/타임프레임 파싱
  const m = f.match(/^(\w+)_(\w+)\.json$/)
  const sym = m ? m[1] : f.replace('.json', '')
  const tf = m ? m[2] : '1m'
  const exSec = tf === '5m' ? 300 : 60

  console.log(`━━━ [${fi + 1}/${files.length}] ${sym} / ${tf} (${candles.length} candles) ━━━`)
  const t0 = Date.now()

  // 엔진 내부 로그 억제
  console.log = () => {}

  const r = runLeaderboard(candles, {
    symbol: sym,
    startTime: candles[0].timestamp,
    endTime: candles[candles.length - 1].timestamp,
    initialBalance: INITIAL_BALANCE,
    betAmount: BET_AMOUNT,
    betType: 'fixed',
    payout: PAYOUT,
    expirySeconds: exSec,
    volumeMultiplier: 100,
    minTrades: MIN_TRADES,
  })

  console.log = origLog
  const elapsed = Date.now() - t0
  results.push({ sym, tf, count: candles.length, elapsed, result: r })

  console.log(`  📊 ${r.entries.length}/${r.totalStrategies} 전략 통과 (${elapsed}ms)`)
  for (const e of r.entries.slice(0, 3)) {
    console.log(`     #${e.rank} ${e.strategyName}: 승률=${e.winRate.toFixed(1)}% PF=${e.profitFactor.toFixed(2)}`)
  }
  console.log('')
}

const totalElapsed = Date.now() - totalStart
console.log(`\n⏱ 총 실행 시간: ${(totalElapsed / 1000).toFixed(1)}초`)

// ─── 마크다운 리포트 생성 ───
const dt = new Date().toISOString().split('T')[0]
let md = `# Pocket Quant 종합 백테스트 리포트\n\n`
md += `> 생성일: ${dt} | 전략 수: ${engine.getStrategies().length}개 | 최대 캔들: ${MAX_CANDLES}개/데이터셋\n\n`
md += `## 설정\n`
md += `| 항목 | 값 |\n|---|---|\n`
md += `| 초기자금 | $${INITIAL_BALANCE.toLocaleString()} |\n`
md += `| 거래금액 | $${BET_AMOUNT} (고정) |\n`
md += `| 페이아웃 | ${PAYOUT}% |\n`
md += `| 손익분기 승률 | ${BREAKEVEN_WR}% |\n`
md += `| 최소 거래 수 | ${MIN_TRADES}회 |\n`
md += `| 최대 캔들 | ${MAX_CANDLES}개 |\n\n`

for (const r of results) {
  md += `## ${r.sym} (${r.tf}, ${r.count} candles, ${r.elapsed}ms)\n\n`
  if (!r.result.entries.length) {
    md += `_통과 전략 없음_\n\n`
    continue
  }
  md += `| # | 전략 | 점수 | 승률 | PF | 순이익 | MDD% | 거래 | 연손 | Kelly |\n`
  md += `|--:|---|---:|---:|---:|---:|---:|---:|---:|---:|\n`
  for (const e of r.result.entries) {
    const bold = e.winRate >= BREAKEVEN_WR ? '**' : ''
    md += `| ${e.rank} | ${bold}${e.strategyName}${bold} | ${e.compositeScore.toFixed(1)} | ${e.winRate.toFixed(1)}% | ${e.profitFactor.toFixed(2)} | $${e.netProfit.toFixed(0)} | ${e.maxDrawdownPercent.toFixed(1)}% | ${e.totalTrades} | ${e.maxConsecutiveLosses} | ${e.kellyFraction.toFixed(1)}% |\n`
  }
  md += '\n'
}

// ─── 종합 분석 ───
const allEntries = results.flatMap(r =>
  r.result.entries.map(e => ({ ...e, sym: r.sym, tf: r.tf }))
)
const profitable = allEntries.filter(e => e.winRate >= BREAKEVEN_WR && e.totalTrades >= 10)
const avgWR = allEntries.length
  ? allEntries.reduce((s, e) => s + e.winRate, 0) / allEntries.length
  : 0

md += `## 종합 분석\n\n`
md += `- 총 통과 전략: **${allEntries.length}개** (전체 ${results.reduce((s, r) => s + r.result.totalStrategies, 0)}개 중)\n`
md += `- 평균 승률: **${avgWR.toFixed(1)}%**\n`
md += `- 수익성 전략 (승률≥${BREAKEVEN_WR}%, 거래≥10): **${profitable.length}개**\n`
md += `- 총 실행 시간: ${(totalElapsed / 1000).toFixed(1)}초\n\n`

if (profitable.length) {
  md += `### 수익성 전략 랭킹\n\n`
  md += `| 전략 | 심볼 | TF | 승률 | PF | 순이익 | MDD% | 거래 |\n`
  md += `|---|---|---|---:|---:|---:|---:|---:|\n`
  for (const w of profitable.sort((a, b) => b.winRate - a.winRate)) {
    md += `| **${w.strategyName}** | ${w.sym} | ${w.tf} | ${w.winRate.toFixed(1)}% | ${w.profitFactor.toFixed(2)} | $${w.netProfit.toFixed(0)} | ${w.maxDrawdownPercent.toFixed(1)}% | ${w.totalTrades} |\n`
  }
  md += '\n'
}

// ─── 크로스 데이터셋 일관성 ───
const stratMap = new Map<string, typeof allEntries>()
for (const e of allEntries) {
  if (!stratMap.has(e.strategyName)) stratMap.set(e.strategyName, [])
  stratMap.get(e.strategyName)!.push(e)
}

const consistent = [...stratMap.entries()]
  .filter(([, entries]) => entries.length >= 3)
  .map(([name, entries]) => ({
    name,
    datasets: entries.length,
    avgWR: entries.reduce((s, e) => s + e.winRate, 0) / entries.length,
    avgPF: entries.reduce((s, e) => s + e.profitFactor, 0) / entries.length,
    profitableCount: entries.filter(e => e.winRate >= BREAKEVEN_WR).length,
  }))
  .sort((a, b) => b.profitableCount - a.profitableCount || b.avgWR - a.avgWR)

if (consistent.length) {
  md += `### 크로스 데이터셋 일관성 (3개+ 데이터셋 통과)\n\n`
  md += `| 전략 | 데이터셋 | 수익 | 평균승률 | 평균PF |\n`
  md += `|---|---:|---:|---:|---:|\n`
  for (const c of consistent) {
    const icon = c.profitableCount === c.datasets ? '🟢' : c.profitableCount > 0 ? '🟡' : '🔴'
    md += `| ${icon} ${c.name} | ${c.datasets} | ${c.profitableCount}/${c.datasets} | ${c.avgWR.toFixed(1)}% | ${c.avgPF.toFixed(2)} |\n`
  }
  md += '\n'
}

md += `---\n_v1.0 ${dt} | Pocket Quant Backtest Engine_\n`

// ─── 파일 저장 ───
fs.writeFileSync(path.join(resDir, `backtest-report-${dt}.md`), md)
fs.writeFileSync(path.join(resDir, 'backtest-report-latest.md'), md)

// JSON 요약
const jsonReport = {
  generatedAt: new Date().toISOString(),
  config: {
    initialBalance: INITIAL_BALANCE,
    betAmount: BET_AMOUNT,
    payout: PAYOUT,
    maxCandles: MAX_CANDLES,
    minTrades: MIN_TRADES,
    breakEvenWinRate: BREAKEVEN_WR,
  },
  totalStrategies: engine.getStrategies().length,
  totalElapsedMs: totalElapsed,
  datasets: results.map(r => ({
    symbol: r.sym,
    timeframe: r.tf,
    candles: r.count,
    elapsedMs: r.elapsed,
    passedStrategies: r.result.entries.length,
    totalStrategies: r.result.totalStrategies,
    entries: r.result.entries.map(e => ({
      rank: e.rank,
      name: e.strategyName,
      id: e.strategyId,
      winRate: +e.winRate.toFixed(1),
      profitFactor: +e.profitFactor.toFixed(2),
      netProfit: +e.netProfit.toFixed(0),
      trades: e.totalTrades,
      mdd: +e.maxDrawdownPercent.toFixed(1),
      maxConsLosses: e.maxConsecutiveLosses,
      kelly: +e.kellyFraction.toFixed(1),
      compositeScore: +e.compositeScore.toFixed(1),
    })),
  })),
  summary: {
    totalPassedEntries: allEntries.length,
    averageWinRate: +avgWR.toFixed(1),
    profitableStrategies: profitable.length,
    crossDatasetConsistency: consistent,
  },
}

fs.writeFileSync(path.join(resDir, 'backtest-report-latest.json'), JSON.stringify(jsonReport, null, 2))

console.log(`\n✅ 리포트 저장 완료: ${resDir}`)
console.log(`   📄 backtest-report-${dt}.md`)
console.log(`   📄 backtest-report-latest.md`)
console.log(`   📄 backtest-report-latest.json`)
