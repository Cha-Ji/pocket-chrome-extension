import express from 'express'
import Database from 'better-sqlite3'
import cors from 'cors'
import bodyParser from 'body-parser'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { toEpochMs } from '../src/lib/utils/time.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================
// Data Collector Server
// ============================================================
// 역할: 익스텐션에서 보내주는 tick/캔들 데이터를 받아 SQLite에 저장
//
// 데이터 흐름:
//   수집 → ticks 테이블 (원본, ts_ms 정수)
//   백테스트 요청 시 → candles_1m 캐시 확인 → 없으면 ticks에서 리샘플 → 캐시 저장
// ============================================================

const PORT = 3001
// Use environment variable or relative path for portability
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..')
const DB_PATH = process.env.DB_PATH || path.join(PROJECT_ROOT, 'data', 'market-data.db')
const DB_DIR = path.dirname(DB_PATH)

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

// Initialize Database
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL') // [PO-17] 성능 향상
db.pragma('cache_size = -1000000') // [PO-17] 1GB 캐시 (대용량 대응)
db.pragma('busy_timeout = 5000') // [PO-17] 잠금 대기 시간 증가

// ============================================================
// Create Tables
// ============================================================

db.exec(`
  -- 기존 candles 테이블 유지 (하위 호환)
  CREATE TABLE IF NOT EXISTS candles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL,
    source TEXT DEFAULT 'realtime',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_unique
  ON candles(symbol, interval, timestamp);

  -- 신규: ticks 테이블 (원본 고빈도 데이터, ts_ms 정수)
  CREATE TABLE IF NOT EXISTS ticks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    ts_ms INTEGER NOT NULL,
    price REAL NOT NULL,
    source TEXT DEFAULT 'realtime',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_ticks_unique
  ON ticks(symbol, ts_ms, source);
  CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts
  ON ticks(symbol, ts_ms);

  -- 신규: candles_1m 테이블 (리샘플 결과 캐시)
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

  CREATE UNIQUE INDEX IF NOT EXISTS idx_c1m_unique
  ON candles_1m(symbol, ts_ms, source);
  CREATE INDEX IF NOT EXISTS idx_c1m_symbol_ts
  ON candles_1m(symbol, ts_ms);
`)

const app = express()
app.use(cors())
app.use(bodyParser.json({ limit: '50mb' })) // [PO-17] 벌크 데이터 수집을 위해 용량 대폭 상향

// ============================================================
// Helpers
// ============================================================

const REQUIRED_FIELDS = ['symbol', 'interval', 'timestamp', 'open', 'high', 'low', 'close']
const TICK_REQUIRED_FIELDS = ['symbol', 'timestamp', 'price']

function validateCandle(candle: any) {
  const missingFields = REQUIRED_FIELDS.filter(field => candle[field] === undefined || candle[field] === null || candle[field] === '')
  if (missingFields.length > 0) {
    return {
      isValid: false,
      message: `Missing required fields: ${missingFields.join(', ')}`
    }
  }
  return { isValid: true }
}

function validateTick(tick: any) {
  const missingFields = TICK_REQUIRED_FIELDS.filter(field => tick[field] === undefined || tick[field] === null || tick[field] === '')
  if (missingFields.length > 0) {
    return {
      isValid: false,
      message: `Missing required fields: ${missingFields.join(', ')}`
    }
  }
  return { isValid: true }
}

/**
 * OHLC tick인지 판별한다 (candle 형태 payload).
 * open/high/low/close가 모두 존재하면 OHLC tick으로 간주.
 */
function isOhlcPayload(data: any): boolean {
  return data.open !== undefined && data.high !== undefined
    && data.low !== undefined && data.close !== undefined
}

/**
 * OHLC payload에서 단일 가격(close)을 추출하여 tick으로 변환한다.
 * OHLC가 모두 동일하면 tick 성격의 데이터.
 */
function ohlcToPrice(data: any): number {
  return data.close
}

/**
 * 페이아웃 데이터인지 판별한다.
 * OHLC가 모두 동일하고 0~100 범위이면 페이아웃 의심.
 */
function isPayoutData(data: { open: number; high: number; low: number; close: number }): boolean {
  const { open, high, low, close } = data
  const allEqual = open === high && high === low && low === close
  // payout은 항상 정수 (예: 82, 90, 92). FX 환율(0.86xxx) 오탐 방지
  return allEqual && Number.isInteger(open) && open >= 0 && open <= 100
}

// ============================================================
// Prepared Statements (성능 최적화)
// ============================================================

const insertTick = db.prepare(`
  INSERT INTO ticks (symbol, ts_ms, price, source)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(symbol, ts_ms, source) DO UPDATE SET
    price = excluded.price
`)

const insertCandle1m = db.prepare(`
  INSERT INTO candles_1m (symbol, ts_ms, open, high, low, close, volume, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(symbol, ts_ms, source) DO UPDATE SET
    open = excluded.open,
    high = excluded.high,
    low = excluded.low,
    close = excluded.close,
    volume = excluded.volume
`)

const insertLegacyCandle = db.prepare(`
  INSERT INTO candles (symbol, interval, timestamp, open, high, low, close, volume, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(symbol, interval, timestamp) DO UPDATE SET
    open = excluded.open,
    high = excluded.high,
    low = excluded.low,
    close = excluded.close,
    volume = excluded.volume,
    source = excluded.source
`)

// ============================================================
// API Endpoints
// ============================================================

// 1. 단일 tick 수집 (신규)
app.post('/api/tick', (req, res) => {
  const validation = validateTick(req.body)
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.message })
  }

  const { symbol, timestamp, price, source } = req.body

  try {
    const tsMs = toEpochMs(timestamp)
    insertTick.run(symbol, tsMs, price, source || 'realtime')
    console.log(`[${new Date().toLocaleTimeString()}] Saved tick: ${symbol} @ ${tsMs}`)
    res.json({ success: true })
  } catch (error: any) {
    console.error('Error saving tick:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// 2. 단일 캔들 수집 (실시간) — 하위 호환 + ticks 이중 저장
app.post('/api/candle', (req, res) => {
  const validation = validateCandle(req.body)
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.message })
  }

  const { symbol, interval, timestamp, open, high, low, close, volume, source } = req.body

  try {
    const tsMs = toEpochMs(timestamp)

    // 레거시 candles 테이블에도 저장 (하위 호환)
    insertLegacyCandle.run(symbol, interval, tsMs, open, high, low, close, volume || 0, source || 'realtime')

    // 페이아웃 데이터가 아니면 ticks 테이블에도 저장
    if (!isPayoutData({ open, high, low, close })) {
      insertTick.run(symbol, tsMs, ohlcToPrice({ open, high, low, close }), source || 'realtime')
    }

    console.log(`[${new Date().toLocaleTimeString()}] Saved candle+tick: ${symbol} ${interval} @ ${tsMs}`)
    res.json({ success: true })
  } catch (error: any) {
    console.error('Error saving candle:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// 3. 다중 캔들 수집 (과거 데이터 Bulk) — 하위 호환 + ticks 이중 저장
app.post('/api/candles/bulk', (req, res) => {
  const bodySize = req.headers['content-length'] || 'unknown'
  console.log(`[Bulk] Request received (${bodySize} bytes)`)

  if (!req.body || typeof req.body !== 'object') {
    console.error(`[Bulk] Empty or invalid body. Content-Type: ${req.headers['content-type']}, body type: ${typeof req.body}`)
    return res.status(400).json({ error: 'Empty or invalid request body' })
  }

  const { candles } = req.body // Array of candle objects

  if (!Array.isArray(candles)) {
    console.error(`[Bulk] Invalid format: candles is ${typeof candles}, keys: ${Object.keys(req.body).join(',')}`)
    return res.status(400).json({ error: 'Invalid data format: candles must be an array' })
  }

  if (candles.length === 0) {
    console.error('[Bulk] Empty candles array received')
    return res.status(400).json({ error: 'Empty candles array' })
  }

  console.log(`[Bulk] Received ${candles.length} candles. First: ${JSON.stringify(candles[0])}`)

  // Validate all candles, collect failures instead of failing on first
  const failures: { index: number; message: string }[] = []
  for (let i = 0; i < candles.length; i++) {
    const validation = validateCandle(candles[i])
    if (!validation.isValid) {
      failures.push({ index: i, message: validation.message! })
      if (failures.length >= 5) break // Log first 5 failures max
    }
  }

  if (failures.length > 0) {
    console.error(`[Bulk] Validation failed for ${failures.length}+ candles. First failure: index ${failures[0].index} - ${failures[0].message}. Candle: ${JSON.stringify(candles[failures[0].index])}`)
    return res.status(400).json({
      error: `Validation failed at index ${failures[0].index}: ${failures[0].message}`,
      failedIndex: failures[0].index,
      failureCount: failures.length,
      candle: candles[failures[0].index]
    })
  }

  try {
    let tickCount = 0

    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) {
        // volume/source 누락 시 기본값 보정
        row.volume = row.volume ?? 0
        row.source = row.source || 'history'

        // timestamp 정규화
        const tsMs = toEpochMs(row.timestamp)

        // 레거시 candles 테이블
        insertLegacyCandle.run(
          row.symbol, row.interval, tsMs,
          row.open, row.high, row.low, row.close,
          row.volume, row.source
        )

        // 페이아웃 데이터가 아니면 ticks 테이블에도 저장
        if (!isPayoutData(row)) {
          insertTick.run(row.symbol, tsMs, ohlcToPrice(row), row.source)
          tickCount++
        }
      }
      return rows.length
    })

    const count = insertMany(candles)
    console.log(`[${new Date().toLocaleTimeString()}] Bulk saved: ${count} candles + ${tickCount} ticks (symbol: ${candles[0].symbol})`)
    res.json({ success: true, count, tickCount })
  } catch (error: any) {
    console.error(`[Bulk] DB error: ${error.message}. First candle: ${JSON.stringify(candles[0])}`)
    res.status(500).json({ error: error.message })
  }
})

// 4. Bulk tick 수집 (신규)
app.post('/api/ticks/bulk', (req, res) => {
  const { ticks } = req.body

  if (!Array.isArray(ticks) || ticks.length === 0) {
    return res.status(400).json({ error: 'ticks must be a non-empty array' })
  }

  try {
    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) {
        const tsMs = toEpochMs(row.timestamp || row.ts_ms)
        insertTick.run(row.symbol, tsMs, row.price, row.source || 'realtime')
      }
      return rows.length
    })

    const count = insertMany(ticks)
    console.log(`[${new Date().toLocaleTimeString()}] Bulk ticks saved: ${count} (symbol: ${ticks[0].symbol})`)
    res.json({ success: true, count })
  } catch (error: any) {
    console.error(`[Bulk Ticks] DB error: ${error.message}`)
    res.status(500).json({ error: error.message })
  }
})

// 5. 데이터 조회 — candles 레거시 (하위 호환)
app.get('/api/candles', (req, res) => {
  const { symbol, interval, start, end } = req.query

  try {
    const stmt = db.prepare(`
      SELECT * FROM candles
      WHERE symbol = ? AND interval = ?
      AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `)

    const rows = stmt.all(symbol, interval, Number(start || 0), Number(end || 9999999999999))
    res.json(rows)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// 6. Tick 조회 (신규)
app.get('/api/ticks', (req, res) => {
  const { symbol, start, end, source } = req.query

  if (!symbol) {
    return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' })
  }

  try {
    let query = `
      SELECT * FROM ticks
      WHERE symbol = ?
      AND ts_ms >= ? AND ts_ms <= ?
    `
    const params: any[] = [symbol, Number(start || 0), Number(end || 9999999999999)]

    if (source) {
      query += ' AND source = ?'
      params.push(source)
    }

    query += ' ORDER BY ts_ms ASC'

    const rows = db.prepare(query).all(...params)
    res.json(rows)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// 7. 캐시된 1분봉 조회/생성 (핵심 신규 기능)
app.get('/api/candles_1m', (req, res) => {
  const { symbol, start, end, force_resample } = req.query

  if (!symbol) {
    return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' })
  }

  const startTs = Number(start || 0)
  const endTs = Number(end || 9999999999999)

  try {
    // force_resample이 아니면 캐시 먼저 확인
    if (!force_resample) {
      const cached = db.prepare(`
        SELECT ts_ms, open, high, low, close, volume, source
        FROM candles_1m
        WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
        ORDER BY ts_ms ASC
      `).all(symbol as string, startTs, endTs) as Array<{
        ts_ms: number; open: number; high: number; low: number
        close: number; volume: number; source: string
      }>

      if (cached.length > 0) {
        return res.json({
          candles: cached,
          meta: { symbol, count: cached.length, source: 'cache' }
        })
      }
    }

    // 캐시가 없으면 ticks에서 리샘플링 → 캐시 저장
    const result = resampleAndCache(symbol as string, startTs, endTs)

    res.json({
      candles: result.candles,
      meta: {
        symbol,
        count: result.candles.length,
        tickCount: result.tickCount,
        source: result.candles.length > 0 ? 'resampled' : 'empty'
      }
    })
  } catch (error: any) {
    console.error('[candles_1m] 오류:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// 8. 상태 확인
app.get('/health', (req, res) => {
  const candleCount = db.prepare('SELECT COUNT(*) as count FROM candles').get() as { count: number }
  const tickCount = db.prepare('SELECT COUNT(*) as count FROM ticks').get() as { count: number }
  const cache1mCount = db.prepare('SELECT COUNT(*) as count FROM candles_1m').get() as { count: number }
  res.json({
    status: 'ok',
    totalCandles: candleCount.count,
    totalTicks: tickCount.count,
    totalCandles1m: cache1mCount.count,
  })
})

// 9. 자산별 수집 통계
app.get('/api/candles/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT symbol,
             COUNT(*) as count,
             MIN(timestamp) as oldest,
             MAX(timestamp) as newest,
             ROUND((MAX(timestamp) - MIN(timestamp)) / 86400000.0, 1) as days
      FROM candles
      GROUP BY symbol
      ORDER BY count DESC
    `).all()
    res.json(stats)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// 10. Tick 통계 (신규)
app.get('/api/ticks/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(ts_ms) as oldest_ms,
             MAX(ts_ms) as newest_ms,
             ROUND((MAX(ts_ms) - MIN(ts_ms)) / 86400000.0, 1) as days
      FROM ticks
      GROUP BY symbol, source
      ORDER BY count DESC
    `).all()
    res.json(stats)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// 11. candles_1m 캐시 통계 (신규)
app.get('/api/candles_1m/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(ts_ms) as oldest_ms,
             MAX(ts_ms) as newest_ms,
             ROUND((MAX(ts_ms) - MIN(ts_ms)) / 86400000.0, 1) as days
      FROM candles_1m
      GROUP BY symbol, source
      ORDER BY count DESC
    `).all()
    res.json(stats)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// 12. 리샘플링된 캔들 조회 (tick → 1분봉 변환) — 레거시 호환
app.get('/api/candles/resampled', (req, res) => {
  const { symbol, interval, start, end } = req.query

  if (!symbol) {
    return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' })
  }

  // interval 파싱 (기본 '1m', 지원: '1m', '5m', '15m', '1h' 등)
  const intervalStr = (interval as string) || '1m'
  const intervalSeconds = parseIntervalToSeconds(intervalStr)
  if (intervalSeconds === null) {
    return res.status(400).json({ error: `지원하지 않는 interval: ${intervalStr}. 사용 가능: 1m, 5m, 15m, 30m, 1h` })
  }

  try {
    // ticks 테이블에서 먼저 시도
    const startTs = Number(start || 0)
    const endTs = Number(end || 9999999999999)

    const tickRows = db.prepare(`
      SELECT ts_ms, price FROM ticks
      WHERE symbol = ? AND source = 'history'
      AND ts_ms >= ? AND ts_ms <= ?
      ORDER BY ts_ms ASC
    `).all(symbol, startTs, endTs) as Array<{ ts_ms: number; price: number }>

    if (tickRows.length > 0) {
      // ticks 테이블에서 리샘플링
      const resampled = resampleTickRows(tickRows, intervalSeconds)
      return res.json({
        candles: resampled,
        meta: {
          symbol,
          interval: intervalStr,
          rawTickCount: tickRows.length,
          resampledCount: resampled.length,
          dataSource: 'ticks',
        }
      })
    }

    // ticks가 없으면 레거시 candles 테이블에서 폴백
    const rows = db.prepare(`
      SELECT timestamp, open, high, low, close, volume
      FROM candles
      WHERE symbol = ? AND source = 'history'
      AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `).all(symbol, startTs, endTs) as Array<{
      timestamp: number; open: number; high: number
      low: number; close: number; volume: number
    }>

    if (rows.length === 0) {
      return res.json({ candles: [], meta: { symbol, interval: intervalStr, rawTickCount: 0 } })
    }

    // 페이아웃 데이터 필터링
    const filtered = rows.filter(row => !isPayoutData(row))

    // timestamp 단위 자동 감지 (초 vs 밀리초)
    const tsUnit = detectTimestampUnit(filtered)

    // 리샘플링
    const resampled = resampleTicksLegacy(filtered, intervalSeconds, tsUnit)

    res.json({
      candles: resampled,
      meta: {
        symbol,
        interval: intervalStr,
        rawTickCount: rows.length,
        filteredTickCount: filtered.length,
        payoutFiltered: rows.length - filtered.length,
        resampledCount: resampled.length,
        timestampUnit: tsUnit,
        dataSource: 'candles_legacy',
      }
    })
  } catch (error: any) {
    console.error('[Resampled] 조회 오류:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// 13. 상세 수집 통계 (데이터 품질 진단 포함)
app.get('/api/candles/stats/detailed', (req, res) => {
  try {
    // ticks 테이블 통계
    const tickStats = db.prepare(`
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(ts_ms) as oldest,
             MAX(ts_ms) as newest
      FROM ticks
      GROUP BY symbol, source
      ORDER BY symbol, source
    `).all() as Array<{
      symbol: string; source: string
      count: number; oldest: number; newest: number
    }>

    // candles_1m 캐시 통계
    const cacheStats = db.prepare(`
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(ts_ms) as oldest,
             MAX(ts_ms) as newest
      FROM candles_1m
      GROUP BY symbol, source
      ORDER BY symbol, source
    `).all() as Array<{
      symbol: string; source: string
      count: number; oldest: number; newest: number
    }>

    // 레거시 candles 통계
    const legacyStats = db.prepare(`
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(timestamp) as oldest,
             MAX(timestamp) as newest
      FROM candles
      GROUP BY symbol, source
      ORDER BY symbol, source
    `).all() as Array<{
      symbol: string; source: string
      count: number; oldest: number; newest: number
    }>

    res.json({
      ticks: tickStats,
      candles_1m: cacheStats,
      candles_legacy: legacyStats,
      totals: {
        ticks: tickStats.reduce((sum, s) => sum + s.count, 0),
        candles_1m: cacheStats.reduce((sum, s) => sum + s.count, 0),
        candles_legacy: legacyStats.reduce((sum, s) => sum + s.count, 0),
      }
    })
  } catch (error: any) {
    console.error('[Stats/Detailed] 조회 오류:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// 14. 기존 candles → ticks 마이그레이션 (신규)
app.post('/api/migrate/candles-to-ticks', (req, res) => {
  try {
    // 기존 candles에서 페이아웃이 아닌 데이터를 ticks로 복사
    const rows = db.prepare(`
      SELECT symbol, timestamp, close, source
      FROM candles
      WHERE NOT (open = high AND high = low AND low = close AND open = CAST(open AS INTEGER) AND open >= 0 AND open <= 100)
    `).all() as Array<{
      symbol: string; timestamp: number; close: number; source: string
    }>

    let migrated = 0
    const migrateMany = db.transaction((dataRows: typeof rows) => {
      for (const row of dataRows) {
        const tsMs = toEpochMs(row.timestamp)
        try {
          insertTick.run(row.symbol, tsMs, row.close, row.source)
          migrated++
        } catch {
          // 중복은 무시 (UNIQUE constraint)
        }
      }
    })

    migrateMany(rows)

    console.log(`[Migration] candles → ticks: ${migrated}/${rows.length} migrated`)
    res.json({
      success: true,
      totalRows: rows.length,
      migrated,
      skipped: rows.length - migrated,
    })
  } catch (error: any) {
    console.error('[Migration] 오류:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// 15. 증분 캐시 생성 트리거 (신규)
app.post('/api/candles_1m/resample', (req, res) => {
  const { symbol } = req.body

  if (!symbol) {
    return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' })
  }

  try {
    const result = resampleAndCache(symbol, 0, 9999999999999)
    res.json({
      success: true,
      symbol,
      candlesCreated: result.candles.length,
      ticksProcessed: result.tickCount,
    })
  } catch (error: any) {
    console.error('[Resample] 오류:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================
// 리샘플링 + 캐시 저장 함수
// ============================================================

/**
 * ticks 테이블에서 데이터를 로드하여 1분봉으로 리샘플링하고
 * candles_1m 캐시에 저장한다. 증분 방식: 마지막 캐시 이후만 처리.
 */
function resampleAndCache(
  symbol: string,
  startTs: number,
  endTs: number
): { candles: Array<{ ts_ms: number; open: number; high: number; low: number; close: number; volume: number }>; tickCount: number } {
  // 마지막 캐시 시점 확인 (증분 생성)
  const lastCache = db.prepare(`
    SELECT MAX(ts_ms) as last_ts FROM candles_1m WHERE symbol = ?
  `).get(symbol) as { last_ts: number | null }

  const effectiveStart = lastCache.last_ts
    ? Math.max(startTs, lastCache.last_ts)
    : startTs

  // ticks 로드
  const ticks = db.prepare(`
    SELECT ts_ms, price FROM ticks
    WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
    ORDER BY ts_ms ASC
  `).all(symbol, effectiveStart, endTs) as Array<{ ts_ms: number; price: number }>

  if (ticks.length === 0) {
    // 캐시에서 기존 데이터 반환
    const existing = db.prepare(`
      SELECT ts_ms, open, high, low, close, volume
      FROM candles_1m
      WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
      ORDER BY ts_ms ASC
    `).all(symbol, startTs, endTs) as Array<{
      ts_ms: number; open: number; high: number; low: number; close: number; volume: number
    }>
    return { candles: existing, tickCount: 0 }
  }

  // 1분(60000ms) 버킷으로 리샘플링
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

  // 캔들 생성 + 캐시 저장
  const newCandles: Array<{ ts_ms: number; open: number; high: number; low: number; close: number; volume: number }> = []

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

      const candle = {
        ts_ms: bucketStart,
        open: firstPrice,
        high,
        low,
        close: lastPrice,
        volume: bucketTicks.length,
      }

      insertCandle1m.run(symbol, bucketStart, firstPrice, high, low, lastPrice, bucketTicks.length, 'resampled')
      newCandles.push(candle)
    }
  })

  upsertTransaction()

  // 전체 범위 결과 반환
  const allCandles = db.prepare(`
    SELECT ts_ms, open, high, low, close, volume
    FROM candles_1m
    WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
    ORDER BY ts_ms ASC
  `).all(symbol, startTs, endTs) as Array<{
    ts_ms: number; open: number; high: number; low: number; close: number; volume: number
  }>

  console.log(`[Cache] ${symbol}: ${newCandles.length} new candles cached from ${ticks.length} ticks`)
  return { candles: allCandles, tickCount: ticks.length }
}

/**
 * tick rows (ts_ms + price) 를 지정 interval로 리샘플링한다.
 * ticks 테이블 전용 (ts_ms는 이미 ms 정수).
 */
function resampleTickRows(
  ticks: Array<{ ts_ms: number; price: number }>,
  intervalSeconds: number
): Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> {
  if (ticks.length === 0) return []

  const intervalMs = intervalSeconds * 1000
  const buckets = new Map<number, Array<{ ts_ms: number; price: number }>>()

  for (const tick of ticks) {
    const bucketStart = Math.floor(tick.ts_ms / intervalMs) * intervalMs
    const bucket = buckets.get(bucketStart)
    if (bucket) {
      bucket.push(tick)
    } else {
      buckets.set(bucketStart, [tick])
    }
  }

  const result: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = []
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b)

  for (const bucketStart of sortedKeys) {
    const bucketTicks = buckets.get(bucketStart)!
    let high = -Infinity
    let low = Infinity
    for (const t of bucketTicks) {
      if (t.price > high) high = t.price
      if (t.price < low) low = t.price
    }

    result.push({
      timestamp: bucketStart,
      open: bucketTicks[0].price,
      high,
      low,
      close: bucketTicks[bucketTicks.length - 1].price,
      volume: bucketTicks.length,
    })
  }

  return result
}

// ============================================================
// 레거시 리샘플링 헬퍼 함수
// ============================================================

/** interval 문자열을 초 단위로 변환 */
function parseIntervalToSeconds(interval: string): number | null {
  const match = interval.match(/^(\d+)(m|h|d)$/)
  if (!match) return null

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'm': return value * 60
    case 'h': return value * 3600
    case 'd': return value * 86400
    default: return null
  }
}

/** timestamp 단위 자동 감지 (초 vs 밀리초) — 레거시 candles용 */
function detectTimestampUnit(rows: Array<{ timestamp: number }>): 's' | 'ms' {
  if (rows.length < 2) {
    if (rows.length === 1) {
      return rows[0].timestamp > 9999999999 ? 'ms' : 's'
    }
    return 's'
  }

  const sampleSize = Math.min(rows.length - 1, 20)
  let totalDiff = 0
  for (let i = 0; i < sampleSize; i++) {
    totalDiff += Math.abs(rows[i + 1].timestamp - rows[i].timestamp)
  }
  const avgDiff = totalDiff / sampleSize
  return avgDiff > 100 ? 'ms' : 's'
}

/** tick 배열을 지정 interval로 리샘플링 — 레거시 candles용 */
function resampleTicksLegacy(
  ticks: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>,
  intervalSeconds: number,
  tsUnit: 's' | 'ms'
): Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> {
  if (ticks.length === 0) return []

  const toSeconds = tsUnit === 'ms' ? (ts: number) => Math.floor(ts / 1000) : (ts: number) => ts
  const result: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = []
  const buckets = new Map<number, typeof ticks>()

  for (const tick of ticks) {
    const tsSec = toSeconds(tick.timestamp)
    const bucketStart = Math.floor(tsSec / intervalSeconds) * intervalSeconds
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, [])
    }
    buckets.get(bucketStart)!.push(tick)
  }

  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b)

  for (const bucketStart of sortedKeys) {
    const bucketTicks = buckets.get(bucketStart)!
    result.push({
      timestamp: bucketStart,
      open: bucketTicks[0].open,
      high: Math.max(...bucketTicks.map(t => t.high)),
      low: Math.min(...bucketTicks.map(t => t.low)),
      close: bucketTicks[bucketTicks.length - 1].close,
      volume: bucketTicks.length,
    })
  }

  return result
}

app.listen(PORT, () => {
  console.log(`
Data Collector Server running at http://localhost:${PORT}
Database: ${DB_PATH}

Tables:
  - ticks:      raw tick data (ts_ms normalized)
  - candles_1m:  1m candle cache (resampled from ticks)
  - candles:     legacy (backward compatible)
  `)
})
