import express from 'express'
import Database from 'better-sqlite3'
import cors from 'cors'
import bodyParser from 'body-parser'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================
// Data Collector Server
// ============================================================
// 역할: 익스텐션에서 보내주는 캔들 데이터를 받아 SQLite에 저장
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

// Create Tables
db.exec(`
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
    source TEXT DEFAULT 'realtime', -- 'realtime' or 'history'
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_unique 
  ON candles(symbol, interval, timestamp);
`)

const app = express()
app.use(cors())
app.use(bodyParser.json({ limit: '50mb' })) // [PO-17] 벌크 데이터 수집을 위해 용량 대폭 상향

// ============================================================
// Helpers
// ============================================================

const REQUIRED_FIELDS = ['symbol', 'interval', 'timestamp', 'open', 'high', 'low', 'close']

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

// ============================================================
// API Endpoints
// ============================================================

// 1. 단일 캔들 수집 (실시간)
app.post('/api/candle', (req, res) => {
  const validation = validateCandle(req.body)
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.message })
  }

  const { symbol, interval, timestamp, open, high, low, close, volume, source } = req.body

  try {
    const stmt = db.prepare(`
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

    stmt.run(symbol, interval, timestamp, open, high, low, close, volume || 0, source || 'realtime')
    console.log(`[${new Date().toLocaleTimeString()}] Saved candle: ${symbol} ${interval} @ ${timestamp}`)
    res.json({ success: true })
  } catch (error: any) {
    console.error('Error saving candle:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// 2. 다중 캔들 수집 (과거 데이터 Bulk)
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
    const insert = db.prepare(`
      INSERT INTO candles (symbol, interval, timestamp, open, high, low, close, volume, source)
      VALUES (@symbol, @interval, @timestamp, @open, @high, @low, @close, @volume, @source)
      ON CONFLICT(symbol, interval, timestamp) DO UPDATE SET
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        source = excluded.source
    `)

    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) {
        // volume/source 누락 시 기본값 보정
        row.volume = row.volume ?? 0
        row.source = row.source || 'history'
        insert.run(row)
      }
      return rows.length
    })

    const count = insertMany(candles)
    console.log(`[${new Date().toLocaleTimeString()}] Bulk saved: ${count} candles (symbol: ${candles[0].symbol})`)
    res.json({ success: true, count })
  } catch (error: any) {
    console.error(`[Bulk] DB error: ${error.message}. First candle: ${JSON.stringify(candles[0])}`)
    res.status(500).json({ error: error.message })
  }
})

// 3. 데이터 조회 (백테스트용)
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

// 4. 상태 확인
app.get('/health', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM candles').get() as { count: number }
  res.json({ status: 'ok', totalCandles: count.count })
})

// 5. 자산별 수집 통계
app.get('/api/candles/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT symbol,
             COUNT(*) as count,
             MIN(timestamp) as oldest,
             MAX(timestamp) as newest,
             ROUND((MAX(timestamp) - MIN(timestamp)) / 86400.0, 1) as days
      FROM candles
      WHERE interval = '1m'
      GROUP BY symbol
      ORDER BY count DESC
    `).all()
    res.json(stats)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ============================================================
// 6. 리샘플링된 캔들 조회 (tick → 1분봉 변환)
// ============================================================
// raw tick 데이터를 지정 interval로 리샘플링하여 반환
// 페이아웃 데이터(source='realtime', OHLC 0~100 범위)는 자동 필터링
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
    // 1단계: DB에서 raw tick 조회 (source='history'만)
    const stmt = db.prepare(`
      SELECT timestamp, open, high, low, close, volume
      FROM candles
      WHERE symbol = ? AND source = 'history'
      AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `)

    const startTs = Number(start || 0)
    const endTs = Number(end || 9999999999999)
    const rows = stmt.all(symbol, startTs, endTs) as Array<{
      timestamp: number
      open: number
      high: number
      low: number
      close: number
      volume: number
    }>

    if (rows.length === 0) {
      return res.json({ candles: [], meta: { symbol, interval: intervalStr, rawTickCount: 0 } })
    }

    // 2단계: 페이아웃 데이터 필터링 (OHLC가 모두 0~100 범위인 데이터는 페이아웃 의심)
    const filtered = rows.filter(row => {
      const isPayoutRange = row.open >= 0 && row.open <= 100
        && row.high >= 0 && row.high <= 100
        && row.low >= 0 && row.low <= 100
        && row.close >= 0 && row.close <= 100
      return !isPayoutRange
    })

    // 3단계: timestamp 단위 자동 감지 (초 vs 밀리초)
    // tick 간 평균 간격이 1000 이상이면 밀리초로 판단
    const tsUnit = detectTimestampUnit(filtered)

    // 4단계: 리샘플링 (JS에서 처리, DB 부하 방지)
    const resampled = resampleTicks(filtered, intervalSeconds, tsUnit)

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
        timeRange: filtered.length > 0
          ? { start: filtered[0].timestamp, end: filtered[filtered.length - 1].timestamp }
          : null
      }
    })
  } catch (error: any) {
    console.error('[Resampled] 조회 오류:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================
// 7. 상세 수집 통계 (데이터 품질 진단 포함)
// ============================================================
app.get('/api/candles/stats/detailed', (req, res) => {
  try {
    // source별 통계
    const bySource = db.prepare(`
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(timestamp) as oldest,
             MAX(timestamp) as newest
      FROM candles
      GROUP BY symbol, source
      ORDER BY symbol, source
    `).all() as Array<{
      symbol: string
      source: string
      count: number
      oldest: number
      newest: number
    }>

    // 심볼별 상세 정보
    const symbols = db.prepare(`
      SELECT DISTINCT symbol FROM candles ORDER BY symbol
    `).all() as Array<{ symbol: string }>

    const detailed = symbols.map(({ symbol }) => {
      // 해당 심볼의 전체 행
      const allRows = db.prepare(`
        SELECT timestamp, open, high, low, close, source
        FROM candles
        WHERE symbol = ?
        ORDER BY timestamp ASC
      `).all(symbol) as Array<{
        timestamp: number
        open: number
        high: number
        low: number
        close: number
        source: string
      }>

      // source별 분류
      const historyRows = allRows.filter(r => r.source === 'history')
      const realtimeRows = allRows.filter(r => r.source === 'realtime')

      // OHLC 범위 (history 데이터 기준)
      const priceRows = historyRows.length > 0 ? historyRows : allRows
      const ohlcRange = priceRows.length > 0 ? {
        minLow: Math.min(...priceRows.map(r => r.low)),
        maxHigh: Math.max(...priceRows.map(r => r.high)),
        minOpen: Math.min(...priceRows.map(r => r.open)),
        maxClose: Math.max(...priceRows.map(r => r.close))
      } : null

      // 시간 범위 및 밀도 계산
      const oldest = allRows.length > 0 ? allRows[0].timestamp : 0
      const newest = allRows.length > 0 ? allRows[allRows.length - 1].timestamp : 0
      const tsUnit = detectTimestampUnit(allRows)
      const timeRangeSeconds = tsUnit === 'ms'
        ? (newest - oldest) / 1000
        : (newest - oldest)

      const tickDensity = timeRangeSeconds > 0
        ? allRows.length / timeRangeSeconds
        : 0

      const expected1mCandles = timeRangeSeconds > 0
        ? Math.floor(timeRangeSeconds / 60)
        : 0

      // 데이터 품질 경고
      const warnings: string[] = []

      // 페이아웃 의심 데이터 (OHLC 0~100 범위)
      const payoutSuspect = allRows.filter(r =>
        r.open >= 0 && r.open <= 100
        && r.high >= 0 && r.high <= 100
        && r.low >= 0 && r.low <= 100
        && r.close >= 0 && r.close <= 100
      ).length

      if (payoutSuspect > 0) {
        warnings.push(`페이아웃 의심 데이터 ${payoutSuspect}건 (OHLC 0~100 범위)`)
      }

      // timestamp 단위 혼재 감지
      if (allRows.length >= 2) {
        const diffs: number[] = []
        for (let i = 1; i < Math.min(allRows.length, 100); i++) {
          diffs.push(allRows[i].timestamp - allRows[i - 1].timestamp)
        }
        const hasSmallDiffs = diffs.some(d => d > 0 && d < 10) // 초 단위 간격
        const hasLargeDiffs = diffs.some(d => d > 10000) // 밀리초 단위 간격
        if (hasSmallDiffs && hasLargeDiffs) {
          warnings.push('timestamp 단위 혼재 의심 (초/밀리초 혼합)')
        }
      }

      // tick 밀도가 비정상적으로 낮은 경우
      if (timeRangeSeconds > 3600 && tickDensity < 0.1) {
        warnings.push(`tick 밀도가 매우 낮음 (${tickDensity.toFixed(4)}/초, 정상: 1~2/초)`)
      }

      // 소스별 통계 추출
      const sourceStats = bySource
        .filter(s => s.symbol === symbol)
        .map(s => ({
          source: s.source,
          count: s.count,
          oldest: s.oldest,
          newest: s.newest
        }))

      return {
        symbol,
        totalRows: allRows.length,
        sourceBreakdown: sourceStats,
        historyCount: historyRows.length,
        realtimeCount: realtimeRows.length,
        timestampUnit: tsUnit,
        timeRange: {
          oldest,
          newest,
          durationSeconds: Math.round(timeRangeSeconds),
          durationHours: Math.round(timeRangeSeconds / 3600 * 10) / 10,
          durationDays: Math.round(timeRangeSeconds / 86400 * 10) / 10
        },
        tickDensity: Math.round(tickDensity * 10000) / 10000,
        expected1mCandles,
        ohlcRange,
        payoutSuspectCount: payoutSuspect,
        warnings
      }
    })

    res.json({
      totalSymbols: symbols.length,
      totalRows: bySource.reduce((sum, s) => sum + s.count, 0),
      symbols: detailed
    })
  } catch (error: any) {
    console.error('[Stats/Detailed] 조회 오류:', error.message)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================
// 리샘플링 헬퍼 함수
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

/** timestamp 단위 자동 감지 (초 vs 밀리초) */
function detectTimestampUnit(rows: Array<{ timestamp: number }>): 's' | 'ms' {
  if (rows.length < 2) {
    // 단일 행이면 크기로 판단 (10자리=초, 13자리=밀리초)
    if (rows.length === 1) {
      return rows[0].timestamp > 9999999999 ? 'ms' : 's'
    }
    return 's' // 기본값
  }

  // 처음 몇 개의 간격을 분석
  const sampleSize = Math.min(rows.length - 1, 20)
  let totalDiff = 0
  for (let i = 0; i < sampleSize; i++) {
    totalDiff += Math.abs(rows[i + 1].timestamp - rows[i].timestamp)
  }
  const avgDiff = totalDiff / sampleSize

  // 평균 간격이 1000 이상이면 밀리초로 판단
  // (tick 간격이 0.2~0.7초라면 밀리초 기준 200~700, 초 기준 0.2~0.7)
  return avgDiff > 100 ? 'ms' : 's'
}

/** tick 배열을 지정 interval로 리샘플링 */
function resampleTicks(
  ticks: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>,
  intervalSeconds: number,
  tsUnit: 's' | 'ms'
): Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> {
  if (ticks.length === 0) return []

  // 모든 timestamp를 초 단위로 정규화
  const toSeconds = tsUnit === 'ms' ? (ts: number) => Math.floor(ts / 1000) : (ts: number) => ts

  const result: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = []

  // 버킷 맵: 버킷 시작 시간(초) → tick 배열
  const buckets = new Map<number, typeof ticks>()

  for (const tick of ticks) {
    const tsSec = toSeconds(tick.timestamp)
    // 버킷 시작 시간 = interval의 배수로 내림
    const bucketStart = Math.floor(tsSec / intervalSeconds) * intervalSeconds
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, [])
    }
    buckets.get(bucketStart)!.push(tick)
  }

  // 버킷을 시간순으로 정렬 후 OHLCV 생성
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b)

  for (const bucketStart of sortedKeys) {
    const bucketTicks = buckets.get(bucketStart)!
    // open = 첫 tick의 open, close = 마지막 tick의 close
    // high = 모든 tick의 high 중 최대, low = 모든 tick의 low 중 최소
    const candle = {
      timestamp: bucketStart, // 초 단위 버킷 시작 시간
      open: bucketTicks[0].open,
      high: Math.max(...bucketTicks.map(t => t.high)),
      low: Math.min(...bucketTicks.map(t => t.low)),
      close: bucketTicks[bucketTicks.length - 1].close,
      volume: bucketTicks.length // tick 수를 volume으로 사용
    }
    result.push(candle)
  }

  return result
}

app.listen(PORT, () => {
  console.log(`
🚀 Data Collector Server running at http://localhost:${PORT}
📁 Database: ${DB_PATH}
  `)
})
