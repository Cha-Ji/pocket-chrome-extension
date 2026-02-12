// ============================================================
// Timestamp 진단 + 마이그레이션 스크립트
// ============================================================
// 기존 candles 테이블의 timestamp 단위 혼재를 감지하고,
// 필요 시 ticks 테이블로 정규화하여 마이그레이션한다.
//
// 사용법:
//   npx tsx scripts/diagnose-timestamps.ts              # 진단만
//   npx tsx scripts/diagnose-timestamps.ts --migrate    # 진단 + 마이그레이션
// ============================================================

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { toEpochMs, diagnoseTimestamps } from '../src/lib/utils/time'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/market-data.db')
const doMigrate = process.argv.includes('--migrate')

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`DB 파일을 찾을 수 없습니다: ${DB_PATH}`)
    process.exit(1)
  }

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

  console.log('='.repeat(60))
  console.log('  Timestamp 진단 스크립트')
  console.log('='.repeat(60))
  console.log(`\nDB: ${DB_PATH}`)

  // 1. candles 테이블 진단
  console.log('\n--- candles 테이블 (레거시) ---')
  const symbols = db.prepare(
    `SELECT DISTINCT symbol FROM candles ORDER BY symbol`
  ).all() as { symbol: string }[]

  if (symbols.length === 0) {
    console.log('  (데이터 없음)')
  }

  let totalMixed = 0
  let totalRows = 0

  for (const { symbol } of symbols) {
    const timestamps = db.prepare(
      `SELECT timestamp FROM candles WHERE symbol = ? ORDER BY timestamp ASC`
    ).all(symbol) as { timestamp: number }[]

    const tsArray = timestamps.map(r => r.timestamp)
    const diag = diagnoseTimestamps(tsArray)
    totalRows += diag.totalCount

    const statusIcon = diag.isMixed ? '[MIXED]' : '[OK]'
    console.log(`  ${statusIcon} ${symbol}: ${diag.totalCount} rows | ms:${diag.msCount} sec:${diag.secCount} float:${diag.secFloatCount}`)

    if (diag.isMixed) {
      totalMixed++
      console.log(`       -> ${diag.recommendation}`)
    }
  }

  console.log(`\n  합계: ${totalRows} rows, ${symbols.length} symbols, ${totalMixed} mixed`)

  // 2. ticks 테이블 진단
  console.log('\n--- ticks 테이블 ---')
  const tickSymbols = db.prepare(
    `SELECT DISTINCT symbol FROM ticks ORDER BY symbol`
  ).all() as { symbol: string }[]

  if (tickSymbols.length === 0) {
    console.log('  (데이터 없음)')
  }

  let tickTotalRows = 0
  for (const { symbol } of tickSymbols) {
    const count = (db.prepare(
      `SELECT COUNT(*) as cnt FROM ticks WHERE symbol = ?`
    ).get(symbol) as { cnt: number }).cnt
    tickTotalRows += count

    const range = db.prepare(
      `SELECT MIN(ts_ms) as oldest, MAX(ts_ms) as newest FROM ticks WHERE symbol = ?`
    ).get(symbol) as { oldest: number; newest: number }

    console.log(`  ${symbol}: ${count} ticks | range: ${range.oldest} ~ ${range.newest}`)
  }
  console.log(`  합계: ${tickTotalRows} ticks`)

  // 3. candles_1m 캐시 진단
  console.log('\n--- candles_1m 캐시 ---')
  const cacheSymbols = db.prepare(
    `SELECT DISTINCT symbol FROM candles_1m ORDER BY symbol`
  ).all() as { symbol: string }[]

  if (cacheSymbols.length === 0) {
    console.log('  (데이터 없음)')
  }

  let cacheTotalRows = 0
  for (const { symbol } of cacheSymbols) {
    const count = (db.prepare(
      `SELECT COUNT(*) as cnt FROM candles_1m WHERE symbol = ?`
    ).get(symbol) as { cnt: number }).cnt
    cacheTotalRows += count
    console.log(`  ${symbol}: ${count} candles`)
  }
  console.log(`  합계: ${cacheTotalRows} candles_1m`)

  // 4. 마이그레이션
  if (doMigrate) {
    console.log('\n' + '='.repeat(60))
    console.log('  마이그레이션 실행: candles → ticks')
    console.log('='.repeat(60))

    const insertTick = db.prepare(`
      INSERT INTO ticks (symbol, ts_ms, price, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(symbol, ts_ms, source) DO UPDATE SET
        price = excluded.price
    `)

    let migrated = 0
    let skipped = 0
    let errors = 0

    const allCandles = db.prepare(`
      SELECT symbol, timestamp, open, high, low, close, source
      FROM candles
      WHERE NOT (open = high AND high = low AND low = close AND open >= 0 AND open <= 100)
      ORDER BY symbol, timestamp
    `).all() as Array<{
      symbol: string; timestamp: number
      open: number; high: number; low: number; close: number
      source: string
    }>

    console.log(`  대상: ${allCandles.length} rows (페이아웃 제외)`)

    const migrateTransaction = db.transaction(() => {
      for (const row of allCandles) {
        try {
          const tsMs = toEpochMs(row.timestamp)
          insertTick.run(row.symbol, tsMs, row.close, row.source)
          migrated++
        } catch {
          skipped++
        }
      }
    })

    migrateTransaction()

    console.log(`  완료: migrated=${migrated}, skipped(중복)=${skipped}, errors=${errors}`)
    console.log(`  ticks 테이블 최종 행 수: ${(db.prepare('SELECT COUNT(*) as cnt FROM ticks').get() as { cnt: number }).cnt}`)
  } else {
    console.log('\n마이그레이션을 실행하려면 --migrate 플래그를 추가하세요:')
    console.log('  npx tsx scripts/diagnose-timestamps.ts --migrate')
  }

  db.close()
  console.log('\n' + '='.repeat(60))
}

main()
