// ============================================================
// SQLite 백테스트 파이프라인
// ============================================================
// SQLite DB에 수집된 tick 데이터를 1분봉으로 리샘플링한 후
// SignalGeneratorV2로 백테스트를 실행하는 메인 스크립트.
//
// 실행: npx tsx scripts/backtest-from-sqlite.ts
// ============================================================

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { SignalGeneratorV2 } from '../src/lib/signals/signal-generator-v2'
import { Candle } from '../src/lib/signals/types'
import {
  resampleTicks,
  normalizeSymbol,
  type TickRow,
  type ResampledCandle,
} from '../src/lib/backtest/tick-resampler'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================
// 설정
// ============================================================

/** DB 파일 경로 */
const DB_PATH = path.join(__dirname, '../data/market-data.db')

/** 결과 리포트 저장 경로 */
const REPORT_DIR = path.join(__dirname, '../data/results')
const REPORT_PATH = path.join(REPORT_DIR, 'sqlite-backtest-report.md')

/** SignalGeneratorV2 초기화에 필요한 최소 캔들 수 */
const INIT_CANDLE_COUNT = 50

/** 리샘플링 interval (초) */
const RESAMPLE_INTERVAL_SEC = 60

// ============================================================
// 타입
// ============================================================

interface BacktestResult {
  symbol: string
  totalTicks: number
  totalCandles: number
  coverageDays: number
  totalSignals: number
  wins: number
  losses: number
  winRate: string
  byStrategy: Record<string, StrategyStats>
  byRegime: Record<string, StrategyStats>
}

interface StrategyStats {
  count: number
  wins: number
  losses: number
}

// ============================================================
// DB 접근 함수
// ============================================================

/**
 * DB에서 자산 목록을 조회한다.
 * history 소스를 우선 사용하고, 없으면 realtime 소스 사용.
 */
function loadSymbols(db: Database.Database): { symbols: string[]; source: string } {
  // 1순위: history 소스 자산
  const historySymbols = db
    .prepare(`SELECT DISTINCT symbol FROM candles WHERE source = 'history'`)
    .all() as { symbol: string }[]

  if (historySymbols.length > 0) {
    return {
      symbols: historySymbols.map(r => r.symbol),
      source: 'history',
    }
  }

  // 2순위: realtime 소스 자산 (history가 없을 때 폴백)
  const realtimeSymbols = db
    .prepare(`SELECT DISTINCT symbol FROM candles WHERE source = 'realtime'`)
    .all() as { symbol: string }[]

  if (realtimeSymbols.length > 0) {
    return {
      symbols: realtimeSymbols.map(r => r.symbol),
      source: 'realtime',
    }
  }

  return { symbols: [], source: 'none' }
}

/**
 * 자산별 tick 데이터를 DB에서 로드한다.
 *
 * DB의 timestamp는 ms 단위이므로, tick-resampler가 기대하는
 * 초 단위로 변환하여 반환한다.
 */
function loadTicks(db: Database.Database, symbol: string, source: string): TickRow[] {
  const rows = db
    .prepare(
      `SELECT symbol, timestamp, open, high, low, close, volume, source
       FROM candles
       WHERE symbol = ? AND source = ?
       ORDER BY timestamp ASC`
    )
    .all(symbol, source) as Array<{
      symbol: string
      timestamp: number
      open: number
      high: number
      low: number
      close: number
      volume: number
      source: string
    }>

  // DB timestamp(ms) → tick-resampler 기대값(초) 변환
  return rows.map(row => ({
    symbol: row.symbol,
    timestamp: row.timestamp > 1e12 ? row.timestamp / 1000 : row.timestamp,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    source: row.source,
  }))
}

// ============================================================
// 백테스트 실행
// ============================================================

/**
 * 리샘플링된 캔들로 SignalGeneratorV2 백테스트를 실행한다.
 * quick-backtest-v2.ts의 로직을 그대로 따름.
 */
function runBacktest(symbol: string, candles: Candle[]): BacktestResult & { candles: Candle[] } {
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

  // 처음 50개 캔들로 히스토리 초기화
  const initCandles = candles.slice(0, INIT_CANDLE_COUNT)
  generator.setHistory(symbol, initCandles)

  // 나머지 캔들 순회하며 시그널 생성
  for (let i = INIT_CANDLE_COUNT; i < candles.length - 1; i++) {
    const candle = candles[i]
    const nextCandle = candles[i + 1]

    const signal = generator.addCandle(symbol, candle)

    if (signal) {
      // 다음 캔들 close로 승패 판정
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

      // 시그널 결과 업데이트 (통계 누적용)
      generator.updateSignalResult(signal.id, result === 'WIN' ? 'win' : 'loss')
    }
  }

  // 통계 집계
  const wins = results.filter(r => r.result === 'WIN').length
  const losses = results.filter(r => r.result === 'LOSS').length

  const byStrategy: Record<string, StrategyStats> = {}
  const byRegime: Record<string, StrategyStats> = {}

  results.forEach(r => {
    // 전략명에서 키 추출 (콜론 앞부분)
    const stratKey = r.strategy.split(':')[0].trim()
    if (!byStrategy[stratKey]) byStrategy[stratKey] = { count: 0, wins: 0, losses: 0 }
    byStrategy[stratKey].count++
    if (r.result === 'WIN') byStrategy[stratKey].wins++
    else byStrategy[stratKey].losses++

    // 레짐별
    if (!byRegime[r.regime]) byRegime[r.regime] = { count: 0, wins: 0, losses: 0 }
    byRegime[r.regime].count++
    if (r.result === 'WIN') byRegime[r.regime].wins++
    else byRegime[r.regime].losses++
  })

  return {
    symbol,
    totalTicks: 0,  // 호출자가 설정
    totalCandles: candles.length,
    coverageDays: 0, // 호출자가 설정
    totalSignals: results.length,
    wins,
    losses,
    winRate: results.length > 0 ? `${((wins / results.length) * 100).toFixed(1)}%` : 'N/A',
    byStrategy,
    byRegime,
    candles,
  }
}

// ============================================================
// 결과 출력
// ============================================================

/** 콘솔에 리샘플링 통계를 출력한다 */
function printResampleStats(
  symbol: string,
  tickCount: number,
  candleCount: number,
  coverageDays: number
): void {
  console.log(
    `  ${normalizeSymbol(symbol).padEnd(20)} | ` +
    `ticks: ${String(tickCount).padStart(8)} | ` +
    `candles: ${String(candleCount).padStart(6)} | ` +
    `coverage: ${coverageDays.toFixed(1)}일`
  )
}

/** 콘솔에 백테스트 결과를 출력한다 */
function printBacktestResult(result: BacktestResult): void {
  const normalized = normalizeSymbol(result.symbol)
  console.log(`\n  [${normalized}]`)
  console.log(`    시그널: ${result.totalSignals}개`)
  console.log(`    승률: ${result.winRate} (${result.wins}W / ${result.losses}L)`)

  if (Object.keys(result.byStrategy).length > 0) {
    console.log('    전략별:')
    Object.entries(result.byStrategy).forEach(([strat, stats]) => {
      const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 'N/A'
      console.log(`      - ${strat}: ${wr}% (${stats.wins}/${stats.count})`)
    })
  }

  if (Object.keys(result.byRegime).length > 0) {
    console.log('    레짐별:')
    Object.entries(result.byRegime).forEach(([regime, stats]) => {
      const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 'N/A'
      console.log(`      - ${regime}: ${wr}% (${stats.wins}/${stats.count})`)
    })
  }
}

/**
 * 마크다운 리포트를 생성한다.
 */
function generateMarkdownReport(
  allResults: BacktestResult[],
  dataSource: string,
  startTime: Date
): string {
  const endTime = new Date()
  const elapsed = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(1)

  const totalSignals = allResults.reduce((sum, r) => sum + r.totalSignals, 0)
  const totalWins = allResults.reduce((sum, r) => sum + r.wins, 0)
  const totalLosses = allResults.reduce((sum, r) => sum + r.losses, 0)
  const overallWinRate = totalSignals > 0
    ? ((totalWins / totalSignals) * 100).toFixed(1)
    : 'N/A'
  const totalTicks = allResults.reduce((sum, r) => sum + r.totalTicks, 0)
  const totalCandles = allResults.reduce((sum, r) => sum + r.totalCandles, 0)

  const lines: string[] = []

  lines.push('# SQLite 백테스트 리포트')
  lines.push('')
  lines.push(`> 생성 시각: ${endTime.toISOString()}`)
  lines.push(`> 소요 시간: ${elapsed}초`)
  lines.push(`> 데이터 소스: \`${dataSource}\``)
  lines.push(`> SignalGeneratorV2 (minConfidence=0.6, trendFilter=ON)`)
  lines.push('')

  // 전체 요약
  lines.push('## 전체 요약')
  lines.push('')
  lines.push('| 항목 | 값 |')
  lines.push('|------|-----|')
  lines.push(`| 자산 수 | ${allResults.length} |`)
  lines.push(`| 총 tick 수 | ${totalTicks.toLocaleString()} |`)
  lines.push(`| 총 캔들 수 | ${totalCandles.toLocaleString()} |`)
  lines.push(`| 총 시그널 수 | ${totalSignals} |`)
  lines.push(`| 승리 | ${totalWins} |`)
  lines.push(`| 패배 | ${totalLosses} |`)
  lines.push(`| **전체 승률** | **${overallWinRate}%** |`)
  lines.push(`| 목표 승률 | 52.1% |`)
  lines.push(`| 상태 | ${overallWinRate !== 'N/A' && parseFloat(overallWinRate) >= 52.1 ? 'TARGET MET' : 'BELOW TARGET'} |`)
  lines.push('')

  // 자산별 성과
  lines.push('## 자산별 성과')
  lines.push('')
  lines.push('| 자산 | tick 수 | 캔들 수 | 커버(일) | 시그널 | 승률 | W/L |')
  lines.push('|------|---------|---------|----------|--------|------|-----|')

  // 시그널이 있는 자산을 승률 내림차순으로 정렬
  const sortedResults = [...allResults].sort((a, b) => {
    const wrA = a.totalSignals > 0 ? a.wins / a.totalSignals : -1
    const wrB = b.totalSignals > 0 ? b.wins / b.totalSignals : -1
    return wrB - wrA
  })

  for (const r of sortedResults) {
    const normalized = normalizeSymbol(r.symbol)
    lines.push(
      `| ${normalized} ` +
      `| ${r.totalTicks.toLocaleString()} ` +
      `| ${r.totalCandles.toLocaleString()} ` +
      `| ${r.coverageDays.toFixed(1)} ` +
      `| ${r.totalSignals} ` +
      `| ${r.winRate} ` +
      `| ${r.wins}/${r.losses} |`
    )
  }
  lines.push('')

  // 최고/최저 승률 자산
  const withSignals = allResults.filter(r => r.totalSignals > 0)
  if (withSignals.length > 0) {
    const best = withSignals.reduce((a, b) =>
      (a.wins / a.totalSignals) >= (b.wins / b.totalSignals) ? a : b
    )
    const worst = withSignals.reduce((a, b) =>
      (a.wins / a.totalSignals) <= (b.wins / b.totalSignals) ? a : b
    )

    lines.push('## 최고/최저 승률')
    lines.push('')
    lines.push(`- **최고**: ${normalizeSymbol(best.symbol)} - ${best.winRate} (${best.totalSignals} signals)`)
    lines.push(`- **최저**: ${normalizeSymbol(worst.symbol)} - ${worst.winRate} (${worst.totalSignals} signals)`)
    lines.push('')
  }

  // 전체 전략별 통계
  const globalStrategy: Record<string, StrategyStats> = {}
  const globalRegime: Record<string, StrategyStats> = {}

  allResults.forEach(r => {
    Object.entries(r.byStrategy).forEach(([key, stats]) => {
      if (!globalStrategy[key]) globalStrategy[key] = { count: 0, wins: 0, losses: 0 }
      globalStrategy[key].count += stats.count
      globalStrategy[key].wins += stats.wins
      globalStrategy[key].losses += stats.losses
    })
    Object.entries(r.byRegime).forEach(([key, stats]) => {
      if (!globalRegime[key]) globalRegime[key] = { count: 0, wins: 0, losses: 0 }
      globalRegime[key].count += stats.count
      globalRegime[key].wins += stats.wins
      globalRegime[key].losses += stats.losses
    })
  })

  if (Object.keys(globalStrategy).length > 0) {
    lines.push('## 전략별 성과')
    lines.push('')
    lines.push('| 전략 | 시그널 | 승률 | W/L |')
    lines.push('|------|--------|------|-----|')
    Object.entries(globalStrategy)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([strat, stats]) => {
        const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 'N/A'
        lines.push(`| ${strat} | ${stats.count} | ${wr}% | ${stats.wins}/${stats.losses} |`)
      })
    lines.push('')
  }

  if (Object.keys(globalRegime).length > 0) {
    lines.push('## 레짐별 성과')
    lines.push('')
    lines.push('| 레짐 | 시그널 | 승률 | W/L |')
    lines.push('|------|--------|------|-----|')
    Object.entries(globalRegime)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([regime, stats]) => {
        const wr = stats.count > 0 ? ((stats.wins / stats.count) * 100).toFixed(1) : 'N/A'
        lines.push(`| ${regime} | ${stats.count} | ${wr}% | ${stats.wins}/${stats.losses} |`)
      })
    lines.push('')
  }

  // 시그널 없는 자산 목록
  const noSignals = allResults.filter(r => r.totalSignals === 0)
  if (noSignals.length > 0) {
    lines.push('## 시그널 없는 자산')
    lines.push('')
    lines.push(`총 ${noSignals.length}개 자산에서 시그널이 생성되지 않았습니다:`)
    lines.push('')
    noSignals.forEach(r => {
      lines.push(`- ${normalizeSymbol(r.symbol)} (${r.totalCandles} candles, ${r.coverageDays.toFixed(1)}일)`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================
// 메인 함수
// ============================================================

async function main(): Promise<void> {
  const startTime = new Date()

  console.log('='.repeat(60))
  console.log('  SQLite 백테스트 파이프라인')
  console.log('  SignalGeneratorV2 | 1분봉 리샘플링')
  console.log('='.repeat(60))

  // 1. DB 존재 확인
  if (!fs.existsSync(DB_PATH)) {
    console.error(`\n[오류] DB 파일을 찾을 수 없습니다: ${DB_PATH}`)
    console.error('  - 데이터 수집 서버를 실행하여 데이터를 먼저 수집하세요.')
    console.error('  - 실행 방법: npx tsx scripts/data-collector-server.ts')
    process.exit(1)
  }

  // 2. DB 연결
  const db = new Database(DB_PATH, { readonly: true })
  db.pragma('journal_mode = WAL')

  console.log(`\n[DB] ${DB_PATH}`)
  const totalRows = (db.prepare('SELECT COUNT(*) as cnt FROM candles').get() as { cnt: number }).cnt
  console.log(`[DB] 전체 행 수: ${totalRows.toLocaleString()}`)

  // 3. 자산 목록 조회
  const { symbols, source: dataSource } = loadSymbols(db)

  if (symbols.length === 0) {
    console.error('\n[오류] DB에 데이터가 없습니다.')
    console.error('  - 데이터 수집 서버를 실행하고 익스텐션에서 데이터를 전송하세요.')
    db.close()
    process.exit(1)
  }

  console.log(`[소스] ${dataSource} (${symbols.length}개 자산)`)
  if (dataSource === 'realtime') {
    console.log('[주의] history 데이터가 없어 realtime 데이터를 사용합니다.')
    console.log('       realtime 데이터에는 페이아웃 데이터가 포함될 수 있습니다.')
  }

  // 4. 리샘플링 통계
  console.log(`\n${'='.repeat(60)}`)
  console.log('  리샘플링 통계 (tick -> 1분봉)')
  console.log('='.repeat(60))

  interface AssetData {
    symbol: string
    ticks: TickRow[]
    candles: ResampledCandle[]
    coverageDays: number
  }

  const assetDataList: AssetData[] = []

  for (const symbol of symbols) {
    const ticks = loadTicks(db, symbol, dataSource)

    if (ticks.length === 0) {
      console.log(`  ${normalizeSymbol(symbol).padEnd(20)} | (데이터 없음)`)
      continue
    }

    const candles = resampleTicks(ticks, {
      intervalSeconds: RESAMPLE_INTERVAL_SEC,
      filterPayout: true,
    })

    if (candles.length === 0) {
      console.log(`  ${normalizeSymbol(symbol).padEnd(20)} | ticks: ${String(ticks.length).padStart(8)} | (리샘플링 후 캔들 없음 - 페이아웃 데이터만 존재 가능)`)
      continue
    }

    // 커버리지 기간 계산
    const firstTs = candles[0].timestamp
    const lastTs = candles[candles.length - 1].timestamp
    const coverageDays = (lastTs - firstTs) / (1000 * 60 * 60 * 24)

    printResampleStats(symbol, ticks.length, candles.length, coverageDays)

    assetDataList.push({
      symbol,
      ticks,
      candles,
      coverageDays,
    })
  }

  db.close()

  // 5. 백테스트 대상 필터링 (최소 캔들 수 확인)
  const testable = assetDataList.filter(d => d.candles.length > INIT_CANDLE_COUNT + 1)
  const skipped = assetDataList.filter(d => d.candles.length <= INIT_CANDLE_COUNT + 1)

  if (skipped.length > 0) {
    console.log(`\n[스킵] ${skipped.length}개 자산 (캔들 수 < ${INIT_CANDLE_COUNT + 2}):`)
    skipped.forEach(d => {
      console.log(`  - ${normalizeSymbol(d.symbol)} (${d.candles.length} candles)`)
    })
  }

  if (testable.length === 0) {
    console.error(`\n[오류] 백테스트 가능한 자산이 없습니다. (최소 ${INIT_CANDLE_COUNT + 2}개 캔들 필요)`)
    console.error('  데이터를 더 수집한 후 다시 시도하세요.')
    process.exit(1)
  }

  // 6. 백테스트 실행
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  백테스트 실행 (${testable.length}개 자산)`)
  console.log('='.repeat(60))

  const allResults: BacktestResult[] = []

  for (const asset of testable) {
    try {
      // ResampledCandle -> Candle 변환
      const candles: Candle[] = asset.candles.map(c => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }))

      const result = runBacktest(asset.symbol, candles)

      // tick 수와 커버리지 설정
      result.totalTicks = asset.ticks.length
      result.coverageDays = asset.coverageDays

      allResults.push(result)
      printBacktestResult(result)
    } catch (error) {
      console.error(`  [에러] ${normalizeSymbol(asset.symbol)}:`, error)
    }
  }

  // 시그널 없는 자산도 결과에 포함 (통계용)
  for (const asset of skipped) {
    allResults.push({
      symbol: asset.symbol,
      totalTicks: asset.ticks.length,
      totalCandles: asset.candles.length,
      coverageDays: asset.coverageDays,
      totalSignals: 0,
      wins: 0,
      losses: 0,
      winRate: 'N/A',
      byStrategy: {},
      byRegime: {},
    })
  }

  // 7. 전체 요약
  console.log(`\n${'='.repeat(60)}`)
  console.log('  전체 요약')
  console.log('='.repeat(60))

  const totalSignals = allResults.reduce((sum, r) => sum + r.totalSignals, 0)
  const totalWins = allResults.reduce((sum, r) => sum + r.wins, 0)
  const totalLosses = allResults.reduce((sum, r) => sum + r.losses, 0)
  const overallWinRate = totalSignals > 0
    ? ((totalWins / totalSignals) * 100).toFixed(1)
    : 'N/A'

  console.log(`  자산 수:       ${allResults.length} (테스트: ${testable.length}, 스킵: ${skipped.length})`)
  console.log(`  총 tick:       ${allResults.reduce((s, r) => s + r.totalTicks, 0).toLocaleString()}`)
  console.log(`  총 캔들:       ${allResults.reduce((s, r) => s + r.totalCandles, 0).toLocaleString()}`)
  console.log(`  총 시그널:     ${totalSignals}`)
  console.log(`  전체 승률:     ${overallWinRate}% (${totalWins}W / ${totalLosses}L)`)
  console.log(`  목표 승률:     52.1%`)

  if (overallWinRate !== 'N/A') {
    const status = parseFloat(overallWinRate) >= 52.1 ? 'TARGET MET' : 'BELOW TARGET'
    console.log(`  상태:          ${status}`)
  }

  // 8. 마크다운 리포트 저장
  try {
    if (!fs.existsSync(REPORT_DIR)) {
      fs.mkdirSync(REPORT_DIR, { recursive: true })
    }

    const report = generateMarkdownReport(allResults, dataSource, startTime)
    fs.writeFileSync(REPORT_PATH, report, 'utf-8')
    console.log(`\n[리포트] ${REPORT_PATH}`)
  } catch (error) {
    console.error('\n[경고] 리포트 저장 실패:', error)
  }

  console.log('\n' + '='.repeat(60))
}

main().catch(error => {
  console.error('[치명적 오류]', error)
  process.exit(1)
})
