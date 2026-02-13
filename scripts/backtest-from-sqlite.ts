// ============================================================
// SQLite 백테스트 파이프라인
// ============================================================
// 데이터 로딩 우선순위:
//   1. candles_1m 캐시 (가장 빠름)
//   2. ticks → 1m resample → candles_1m 캐시 저장 (2회차부터 캐시 사용)
//   3. 레거시 candles → tick-resampler (하위 호환)
//
// 모든 timestamp는 ms 정수로 통일 (toEpochMs 사용).
//
// 실행: npx tsx scripts/backtest-from-sqlite.ts [--symbol AAPL] [--source history]
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
import { toEpochMs } from '../src/lib/utils/time'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================
// 설정
// ============================================================

/** DB 파일 경로 */
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/market-data.db')

/** 결과 리포트 저장 경로 */
const REPORT_DIR = path.join(__dirname, '../data/results')
const REPORT_PATH = path.join(REPORT_DIR, 'sqlite-backtest-report.md')

/** SignalGeneratorV2 초기화에 필요한 최소 캔들 수 */
const INIT_CANDLE_COUNT = 50

/** 리샘플링 interval (초) */
const RESAMPLE_INTERVAL_SEC = 60

// ============================================================
// CLI 옵션 파싱
// ============================================================

function parseCliArgs(): {
  symbol?: string
  source?: string
  start?: number
  end?: number
} {
  const args = process.argv.slice(2)
  const opts: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      opts[args[i].slice(2)] = args[i + 1]
      i++
    }
  }

  return {
    symbol: opts.symbol,
    source: opts.source,
    start: opts.start ? Number(opts.start) : undefined,
    end: opts.end ? Number(opts.end) : undefined,
  }
}

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
  dataSource: string
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
 * candles_1m 캐시에서 1분봉을 로드한다.
 * 캐시가 있으면 즉시 사용 가능 (리샘플링 불필요).
 */
function loadFromCache(
  db: Database.Database,
  symbol: string,
  startTs: number,
  endTs: number
): Candle[] {
  const rows = db.prepare(`
    SELECT ts_ms, open, high, low, close, volume
    FROM candles_1m
    WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
    ORDER BY ts_ms ASC
  `).all(symbol, startTs, endTs) as Array<{
    ts_ms: number; open: number; high: number
    low: number; close: number; volume: number
  }>

  return rows.map(r => ({
    timestamp: r.ts_ms,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }))
}

/**
 * ticks 테이블에서 tick을 로드 → 1분봉 리샘플 → candles_1m 캐시 저장.
 * 증분 방식: 마지막 캐시 이후의 tick만 처리.
 */
function loadFromTicksAndCache(
  db: Database.Database,
  symbol: string,
  source: string,
  startTs: number,
  endTs: number
): { candles: Candle[]; tickCount: number } {
  // 마지막 캐시 시점 확인
  const lastCache = db.prepare(`
    SELECT MAX(ts_ms) as last_ts FROM candles_1m WHERE symbol = ?
  `).get(symbol) as { last_ts: number | null }

  const effectiveStart = lastCache.last_ts
    ? Math.max(startTs, lastCache.last_ts)
    : startTs

  // ticks 로드
  const ticks = db.prepare(`
    SELECT ts_ms, price FROM ticks
    WHERE symbol = ? AND source = ? AND ts_ms >= ? AND ts_ms <= ?
    ORDER BY ts_ms ASC
  `).all(symbol, source, effectiveStart, endTs) as Array<{
    ts_ms: number; price: number
  }>

  if (ticks.length > 0) {
    // 1분(60000ms) 버킷으로 리샘플링 → 캐시 저장
    const INTERVAL_MS = 60000
    const buckets = new Map<number, Array<{ ts_ms: number; price: number }>>()

    for (const tick of ticks) {
      const bucketStart = Math.floor(tick.ts_ms / INTERVAL_MS) * INTERVAL_MS
      const bucket = buckets.get(bucketStart)
      if (bucket) {
        bucket.push(tick)
      } else {
        buckets.set(bucketStart, [tick])
      }
    }

    const insertCandle1m = db.prepare(`
      INSERT INTO candles_1m (symbol, ts_ms, open, high, low, close, volume, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'resampled')
      ON CONFLICT(symbol, ts_ms, source) DO UPDATE SET
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume
    `)

    const upsertTransaction = db.transaction(() => {
      for (const [bucketStart, bucketTicks] of buckets) {
        const firstPrice = bucketTicks[0].price
        const lastPrice = bucketTicks[bucketTicks.length - 1].price
        let high = -Infinity
        let low = Infinity
        for (const t of bucketTicks) {
          if (t.price > high) high = t.price
          if (t.price < low) low = t.price
        }
        insertCandle1m.run(symbol, bucketStart, firstPrice, high, low, lastPrice, bucketTicks.length)
      }
    })

    upsertTransaction()
  }

  // 전체 범위 캐시 반환
  const candles = loadFromCache(db, symbol, startTs, endTs)
  return { candles, tickCount: ticks.length }
}

/**
 * 레거시 candles 테이블에서 로드 → tick-resampler로 리샘플링.
 * ticks 테이블이 비어있을 때의 폴백 경로.
 */
function loadFromLegacyCandles(
  db: Database.Database,
  symbol: string,
  source: string
): { candles: Candle[]; tickCount: number } {
  const rows = db.prepare(
    `SELECT symbol, timestamp, open, high, low, close, volume, source
     FROM candles
     WHERE symbol = ? AND source = ?
     ORDER BY timestamp ASC`
  ).all(symbol, source) as Array<{
    symbol: string; timestamp: number; open: number; high: number
    low: number; close: number; volume: number; source: string
  }>

  if (rows.length === 0) {
    return { candles: [], tickCount: 0 }
  }

  // timestamp 정규화 → tick-resampler용 초 단위로 변환
  const tickRows: TickRow[] = rows.map(row => {
    const tsMs = toEpochMs(row.timestamp)
    return {
      symbol: row.symbol,
      timestamp: tsMs / 1000,  // tick-resampler는 초 단위 기대
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      source: row.source,
    }
  })

  const resampled = resampleTicks(tickRows, {
    intervalSeconds: RESAMPLE_INTERVAL_SEC,
    filterPayout: true,
  })

  const candles: Candle[] = resampled.map(c => ({
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }))

  return { candles, tickCount: rows.length }
}

/**
 * DB에서 자산 목록을 조회한다.
 * 우선순위: candles_1m > ticks > candles(legacy)
 */
function loadSymbols(db: Database.Database, preferSource?: string): {
  symbols: string[]
  source: string
  dataSource: 'candles_1m' | 'ticks' | 'candles_legacy'
} {
  // 1순위: candles_1m 캐시
  const cachedSymbols = db.prepare(
    `SELECT DISTINCT symbol FROM candles_1m`
  ).all() as { symbol: string }[]

  if (cachedSymbols.length > 0) {
    return {
      symbols: cachedSymbols.map(r => r.symbol),
      source: 'resampled',
      dataSource: 'candles_1m',
    }
  }

  // 2순위: ticks 테이블
  const tickSource = preferSource || 'history'
  const tickSymbols = db.prepare(
    `SELECT DISTINCT symbol FROM ticks WHERE source = ?`
  ).all(tickSource) as { symbol: string }[]

  if (tickSymbols.length > 0) {
    return {
      symbols: tickSymbols.map(r => r.symbol),
      source: tickSource,
      dataSource: 'ticks',
    }
  }

  // ticks에 realtime만 있는 경우
  if (tickSource === 'history') {
    const realtimeTickSymbols = db.prepare(
      `SELECT DISTINCT symbol FROM ticks WHERE source = 'realtime'`
    ).all() as { symbol: string }[]

    if (realtimeTickSymbols.length > 0) {
      return {
        symbols: realtimeTickSymbols.map(r => r.symbol),
        source: 'realtime',
        dataSource: 'ticks',
      }
    }
  }

  // 3순위: 레거시 candles
  const historySymbols = db.prepare(
    `SELECT DISTINCT symbol FROM candles WHERE source = 'history'`
  ).all() as { symbol: string }[]

  if (historySymbols.length > 0) {
    return {
      symbols: historySymbols.map(r => r.symbol),
      source: 'history',
      dataSource: 'candles_legacy',
    }
  }

  const realtimeSymbols = db.prepare(
    `SELECT DISTINCT symbol FROM candles WHERE source = 'realtime'`
  ).all() as { symbol: string }[]

  if (realtimeSymbols.length > 0) {
    return {
      symbols: realtimeSymbols.map(r => r.symbol),
      source: 'realtime',
      dataSource: 'candles_legacy',
    }
  }

  return { symbols: [], source: 'none', dataSource: 'candles_legacy' }
}

// ============================================================
// 백테스트 실행
// ============================================================

/**
 * 리샘플링된 캔들로 SignalGeneratorV2 백테스트를 실행한다.
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
    totalTicks: 0,
    totalCandles: candles.length,
    coverageDays: 0,
    totalSignals: results.length,
    wins,
    losses,
    winRate: results.length > 0 ? `${((wins / results.length) * 100).toFixed(1)}%` : 'N/A',
    byStrategy,
    byRegime,
    candles,
    dataSource: '',
  }
}

// ============================================================
// 결과 출력
// ============================================================

function printResampleStats(
  symbol: string,
  tickCount: number,
  candleCount: number,
  coverageDays: number,
  dataSource: string
): void {
  console.log(
    `  ${normalizeSymbol(symbol).padEnd(20)} | ` +
    `ticks: ${String(tickCount).padStart(8)} | ` +
    `candles: ${String(candleCount).padStart(6)} | ` +
    `coverage: ${coverageDays.toFixed(1)}일 | ` +
    `source: ${dataSource}`
  )
}

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
  dataSourceLabel: string,
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
  lines.push(`> 데이터 소스: \`${dataSourceLabel}\``)
  lines.push(`> SignalGeneratorV2 (minConfidence=0.6, trendFilter=ON)`)
  lines.push('')

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

  lines.push('## 자산별 성과')
  lines.push('')
  lines.push('| 자산 | tick 수 | 캔들 수 | 커버(일) | 시그널 | 승률 | W/L | 소스 |')
  lines.push('|------|---------|---------|----------|--------|------|-----|------|')

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
      `| ${r.wins}/${r.losses} ` +
      `| ${r.dataSource} |`
    )
  }
  lines.push('')

  // 전략/레짐 통계
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

  return lines.join('\n')
}

// ============================================================
// 메인 함수
// ============================================================

async function main(): Promise<void> {
  const startTime = new Date()
  const cliArgs = parseCliArgs()

  console.log('='.repeat(60))
  console.log('  SQLite 백테스트 파이프라인')
  console.log('  SignalGeneratorV2 | 1분봉 | candles_1m 캐시 우선')
  console.log('='.repeat(60))

  // 1. DB 존재 확인
  if (!fs.existsSync(DB_PATH)) {
    console.error(`\n[오류] DB 파일을 찾을 수 없습니다: ${DB_PATH}`)
    console.error('  - 데이터 수집 서버를 실행하여 데이터를 먼저 수집하세요.')
    console.error('  - 실행 방법: npx tsx scripts/data-collector-server.ts')
    process.exit(1)
  }

  // 2. DB 연결 (읽기+쓰기 — 캐시 저장을 위해)
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  // ticks/candles_1m 테이블이 없으면 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      ts_ms INTEGER NOT NULL,
      price REAL NOT NULL,
      source TEXT DEFAULT 'realtime',
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ticks_unique ON ticks(symbol, ts_ms, source);
    CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON ticks(symbol, ts_ms);

    CREATE TABLE IF NOT EXISTS candles_1m (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      ts_ms INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL DEFAULT 0,
      source TEXT DEFAULT 'resampled',
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_c1m_unique ON candles_1m(symbol, ts_ms, source);
    CREATE INDEX IF NOT EXISTS idx_c1m_symbol_ts ON candles_1m(symbol, ts_ms);
  `)

  console.log(`\n[DB] ${DB_PATH}`)

  // 테이블별 행 수 표시
  const totalLegacy = (db.prepare('SELECT COUNT(*) as cnt FROM candles').get() as { cnt: number }).cnt
  const totalTicks = (db.prepare('SELECT COUNT(*) as cnt FROM ticks').get() as { cnt: number }).cnt
  const totalCache = (db.prepare('SELECT COUNT(*) as cnt FROM candles_1m').get() as { cnt: number }).cnt
  console.log(`[DB] candles(legacy): ${totalLegacy.toLocaleString()} | ticks: ${totalTicks.toLocaleString()} | candles_1m(cache): ${totalCache.toLocaleString()}`)

  // 3. 자산 목록 조회
  const { symbols: allSymbols, source: dataSourceType, dataSource } = loadSymbols(db, cliArgs.source)

  // CLI 필터 적용
  const symbols = cliArgs.symbol
    ? allSymbols.filter(s => normalizeSymbol(s) === normalizeSymbol(cliArgs.symbol!) || s === cliArgs.symbol)
    : allSymbols

  if (symbols.length === 0) {
    console.error('\n[오류] DB에 데이터가 없습니다.')
    if (cliArgs.symbol) {
      console.error(`  - --symbol ${cliArgs.symbol} 에 해당하는 데이터가 없습니다.`)
    }
    db.close()
    process.exit(1)
  }

  console.log(`[소스] ${dataSource} / ${dataSourceType} (${symbols.length}개 자산)`)

  // 4. 데이터 로딩 + 리샘플링
  console.log(`\n${'='.repeat(60)}`)
  console.log('  데이터 로딩 (candles_1m 캐시 우선)')
  console.log('='.repeat(60))

  interface AssetData {
    symbol: string
    tickCount: number
    candles: Candle[]
    coverageDays: number
    usedDataSource: string
  }

  const assetDataList: AssetData[] = []
  const startTs = cliArgs.start || 0
  const endTs = cliArgs.end || 9999999999999

  for (const symbol of symbols) {
    let candles: Candle[] = []
    let tickCount = 0
    let usedDataSource = ''

    // 우선순위 1: candles_1m 캐시
    if (dataSource === 'candles_1m') {
      candles = loadFromCache(db, symbol, startTs, endTs)
      usedDataSource = 'cache'
    }

    // 우선순위 2: ticks → resample → cache
    if (candles.length === 0 && dataSource !== 'candles_legacy') {
      // ticks에서 시도
      const tickSource = dataSourceType
      const tickResult = loadFromTicksAndCache(db, symbol, tickSource, startTs, endTs)
      candles = tickResult.candles
      tickCount = tickResult.tickCount
      usedDataSource = tickCount > 0 ? 'ticks→cache' : 'cache'
    }

    // 우선순위 3: 레거시 candles
    if (candles.length === 0) {
      const legacyResult = loadFromLegacyCandles(db, symbol, dataSourceType)
      candles = legacyResult.candles
      tickCount = legacyResult.tickCount
      usedDataSource = 'legacy'
    }

    if (candles.length === 0) {
      console.log(`  ${normalizeSymbol(symbol).padEnd(20)} | (데이터 없음)`)
      continue
    }

    // 커버리지 기간 계산 (timestamp는 모두 ms)
    const firstTs = candles[0].timestamp
    const lastTs = candles[candles.length - 1].timestamp
    const coverageDays = (lastTs - firstTs) / (1000 * 60 * 60 * 24)

    printResampleStats(symbol, tickCount, candles.length, coverageDays, usedDataSource)

    assetDataList.push({
      symbol,
      tickCount,
      candles,
      coverageDays,
      usedDataSource,
    })
  }

  db.close()

  // 5. 백테스트 대상 필터링
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
    process.exit(1)
  }

  // 6. 백테스트 실행
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  백테스트 실행 (${testable.length}개 자산)`)
  console.log('='.repeat(60))

  const allResults: BacktestResult[] = []

  for (const asset of testable) {
    try {
      const result = runBacktest(asset.symbol, asset.candles)
      result.totalTicks = asset.tickCount
      result.coverageDays = asset.coverageDays
      result.dataSource = asset.usedDataSource

      allResults.push(result)
      printBacktestResult(result)
    } catch (error) {
      console.error(`  [에러] ${normalizeSymbol(asset.symbol)}:`, error)
    }
  }

  // 스킵된 자산도 결과에 포함
  for (const asset of skipped) {
    allResults.push({
      symbol: asset.symbol,
      totalTicks: asset.tickCount,
      totalCandles: asset.candles.length,
      coverageDays: asset.coverageDays,
      totalSignals: 0,
      wins: 0,
      losses: 0,
      winRate: 'N/A',
      byStrategy: {},
      byRegime: {},
      dataSource: asset.usedDataSource,
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
  console.log(`  데이터 소스:   ${dataSource}`)

  if (overallWinRate !== 'N/A') {
    const status = parseFloat(overallWinRate) >= 52.1 ? 'TARGET MET' : 'BELOW TARGET'
    console.log(`  상태:          ${status}`)
  }

  // 8. 마크다운 리포트 저장
  try {
    if (!fs.existsSync(REPORT_DIR)) {
      fs.mkdirSync(REPORT_DIR, { recursive: true })
    }

    const report = generateMarkdownReport(allResults, `${dataSource}/${dataSourceType}`, startTime)
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
