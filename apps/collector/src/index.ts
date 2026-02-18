import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs';
import { toEpochMs } from './utils/time.js';

// ============================================================
// Data Collector Server
// ============================================================
// 역할: 익스텐션에서 보내주는 tick/캔들 데이터를 받아 SQLite에 저장
//
// 데이터 흐름:
//   수집 → ticks 테이블 (원본, ts_ms 정수)
//   백테스트 요청 시 → candles_1m 캐시 확인 → 없으면 ticks에서 리샘플 → 캐시 저장
// ============================================================

const PORT = Number(process.env.PORT) || 3001;
const DB_PATH = process.env.DB_PATH || '/data/market-data.db';
const DB_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize Database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -1000000'); // 1GB 캐시
db.pragma('busy_timeout = 5000');

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
`);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// ============================================================
// Helpers
// ============================================================

const REQUIRED_FIELDS = ['symbol', 'interval', 'timestamp', 'open', 'high', 'low', 'close'];
const TICK_REQUIRED_FIELDS = ['symbol', 'timestamp', 'price'];

function validateCandle(candle: any) {
  const missingFields = REQUIRED_FIELDS.filter(
    (field) => candle[field] === undefined || candle[field] === null || candle[field] === ''
  );
  if (missingFields.length > 0) {
    return {
      isValid: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
    };
  }
  return { isValid: true };
}

function validateTick(tick: any) {
  const missingFields = TICK_REQUIRED_FIELDS.filter(
    (field) => tick[field] === undefined || tick[field] === null || tick[field] === ''
  );
  if (missingFields.length > 0) {
    return {
      isValid: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
    };
  }
  return { isValid: true };
}

function isOhlcPayload(data: any): boolean {
  return (
    data.open !== undefined && data.high !== undefined && data.low !== undefined && data.close !== undefined
  );
}

function ohlcToPrice(data: any): number {
  return data.close;
}

function isPayoutData(data: { open: number; high: number; low: number; close: number }): boolean {
  const { open, high, low, close } = data;
  const allEqual = open === high && high === low && low === close;
  return allEqual && open >= 0 && open <= 100;
}

// ============================================================
// Prepared Statements (성능 최적화)
// ============================================================

const insertTick = db.prepare(`
  INSERT INTO ticks (symbol, ts_ms, price, source)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(symbol, ts_ms, source) DO UPDATE SET
    price = excluded.price
`);

const insertCandle1m = db.prepare(`
  INSERT INTO candles_1m (symbol, ts_ms, open, high, low, close, volume, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(symbol, ts_ms, source) DO UPDATE SET
    open = excluded.open,
    high = excluded.high,
    low = excluded.low,
    close = excluded.close,
    volume = excluded.volume
`);

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
`);

// ============================================================
// API Endpoints
// ============================================================

// 1. 단일 tick 수집
app.post('/api/tick', (req, res) => {
  const validation = validateTick(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.message });
  }

  const { symbol, timestamp, price, source } = req.body;

  try {
    const tsMs = toEpochMs(timestamp);
    insertTick.run(symbol, tsMs, price, source || 'realtime');
    console.log(`[${new Date().toLocaleTimeString()}] Saved tick: ${symbol} @ ${tsMs}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving tick:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. 단일 캔들 수집 (실시간) — 하위 호환 + ticks 이중 저장
app.post('/api/candle', (req, res) => {
  const validation = validateCandle(req.body);
  if (!validation.isValid) {
    return res.status(400).json({ error: validation.message });
  }

  const { symbol, interval, timestamp, open, high, low, close, volume, source } = req.body;

  try {
    const tsMs = toEpochMs(timestamp);

    insertLegacyCandle.run(symbol, interval, tsMs, open, high, low, close, volume || 0, source || 'realtime');

    if (!isPayoutData({ open, high, low, close })) {
      insertTick.run(symbol, tsMs, ohlcToPrice({ open, high, low, close }), source || 'realtime');
    }

    console.log(`[${new Date().toLocaleTimeString()}] Saved candle+tick: ${symbol} ${interval} @ ${tsMs}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving candle:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 3. 다중 캔들 수집 (과거 데이터 Bulk)
app.post('/api/candles/bulk', (req, res) => {
  const bodySize = req.headers['content-length'] || 'unknown';
  console.log(`[Bulk] Request received (${bodySize} bytes)`);

  if (!req.body || typeof req.body !== 'object') {
    console.error(
      `[Bulk] Empty or invalid body. Content-Type: ${req.headers['content-type']}, body type: ${typeof req.body}`
    );
    return res.status(400).json({ error: 'Empty or invalid request body' });
  }

  const { candles } = req.body;

  if (!Array.isArray(candles)) {
    console.error(
      `[Bulk] Invalid format: candles is ${typeof candles}, keys: ${Object.keys(req.body).join(',')}`
    );
    return res.status(400).json({ error: 'Invalid data format: candles must be an array' });
  }

  if (candles.length === 0) {
    console.error('[Bulk] Empty candles array received');
    return res.status(400).json({ error: 'Empty candles array' });
  }

  console.log(`[Bulk] Received ${candles.length} candles. First: ${JSON.stringify(candles[0])}`);

  const failures: { index: number; message: string }[] = [];
  for (let i = 0; i < candles.length; i++) {
    const validation = validateCandle(candles[i]);
    if (!validation.isValid) {
      failures.push({ index: i, message: validation.message! });
      if (failures.length >= 5) break;
    }
  }

  if (failures.length > 0) {
    console.error(
      `[Bulk] Validation failed for ${failures.length}+ candles. First failure: index ${failures[0].index} - ${failures[0].message}. Candle: ${JSON.stringify(candles[failures[0].index])}`
    );
    return res.status(400).json({
      error: `Validation failed at index ${failures[0].index}: ${failures[0].message}`,
      failedIndex: failures[0].index,
      failureCount: failures.length,
      candle: candles[failures[0].index],
    });
  }

  try {
    let tickCount = 0;

    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) {
        row.volume = row.volume ?? 0;
        row.source = row.source || 'history';

        const tsMs = toEpochMs(row.timestamp);

        insertLegacyCandle.run(
          row.symbol,
          row.interval,
          tsMs,
          row.open,
          row.high,
          row.low,
          row.close,
          row.volume,
          row.source
        );

        if (!isPayoutData(row)) {
          insertTick.run(row.symbol, tsMs, ohlcToPrice(row), row.source);
          tickCount++;
        }
      }
      return rows.length;
    });

    const count = insertMany(candles);
    console.log(
      `[${new Date().toLocaleTimeString()}] Bulk saved: ${count} candles + ${tickCount} ticks (symbol: ${candles[0].symbol})`
    );
    res.json({ success: true, count, tickCount });
  } catch (error: any) {
    console.error(`[Bulk] DB error: ${error.message}. First candle: ${JSON.stringify(candles[0])}`);
    res.status(500).json({ error: error.message });
  }
});

// 4. Bulk tick 수집
app.post('/api/ticks/bulk', (req, res) => {
  const { ticks } = req.body;

  if (!Array.isArray(ticks) || ticks.length === 0) {
    return res.status(400).json({ error: 'ticks must be a non-empty array' });
  }

  try {
    const insertMany = db.transaction((rows: any[]) => {
      for (const row of rows) {
        const tsMs = toEpochMs(row.timestamp || row.ts_ms);
        insertTick.run(row.symbol, tsMs, row.price, row.source || 'realtime');
      }
      return rows.length;
    });

    const count = insertMany(ticks);
    console.log(
      `[${new Date().toLocaleTimeString()}] Bulk ticks saved: ${count} (symbol: ${ticks[0].symbol})`
    );
    res.json({ success: true, count });
  } catch (error: any) {
    console.error(`[Bulk Ticks] DB error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// 5. 데이터 조회 — candles 레거시 (하위 호환)
app.get('/api/candles', (req, res) => {
  const { symbol, interval, start, end } = req.query;

  try {
    const stmt = db.prepare(`
      SELECT * FROM candles
      WHERE symbol = ? AND interval = ?
      AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(symbol, interval, Number(start || 0), Number(end || 9999999999999));
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Tick 조회
app.get('/api/ticks', (req, res) => {
  const { symbol, start, end, source } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' });
  }

  try {
    let query = `
      SELECT * FROM ticks
      WHERE symbol = ?
      AND ts_ms >= ? AND ts_ms <= ?
    `;
    const params: any[] = [symbol, Number(start || 0), Number(end || 9999999999999)];

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    query += ' ORDER BY ts_ms ASC';

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. 캐시된 1분봉 조회/생성
app.get('/api/candles_1m', (req, res) => {
  const { symbol, start, end, force_resample } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' });
  }

  const startTs = Number(start || 0);
  const endTs = Number(end || 9999999999999);

  try {
    if (!force_resample) {
      const cached = db
        .prepare(
          `
        SELECT ts_ms, open, high, low, close, volume, source
        FROM candles_1m
        WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
        ORDER BY ts_ms ASC
      `
        )
        .all(symbol as string, startTs, endTs) as Array<{
        ts_ms: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
        source: string;
      }>;

      if (cached.length > 0) {
        // Verify cache covers the requested range by checking tick boundaries
        const tickRange = db
          .prepare(
            `SELECT MIN(ts_ms) as min_ts, MAX(ts_ms) as max_ts FROM ticks WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?`
          )
          .get(symbol as string, startTs, endTs) as { min_ts: number | null; max_ts: number | null };

        const cacheMin = cached[0].ts_ms;
        const cacheMax = cached[cached.length - 1].ts_ms;
        const INTERVAL_MS = 60000;

        // Cache is considered complete if it covers the tick data boundaries (within 1 interval tolerance)
        const coversStart = !tickRange.min_ts || cacheMin <= tickRange.min_ts + INTERVAL_MS;
        const coversEnd = !tickRange.max_ts || cacheMax >= tickRange.max_ts - INTERVAL_MS;

        if (coversStart && coversEnd) {
          return res.json({
            candles: cached,
            meta: { symbol, count: cached.length, source: 'cache' },
          });
        }
        // Cache incomplete — fall through to resample
      }
    }

    const result = resampleAndCache(symbol as string, startTs, endTs);

    res.json({
      candles: result.candles,
      meta: {
        symbol,
        count: result.candles.length,
        tickCount: result.tickCount,
        source: result.candles.length > 0 ? 'resampled' : 'empty',
      },
    });
  } catch (error: any) {
    console.error('[candles_1m] 오류:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 8. 상태 확인
app.get('/health', (_req, res) => {
  const candleCount = db.prepare('SELECT COUNT(*) as count FROM candles').get() as { count: number };
  const tickCount = db.prepare('SELECT COUNT(*) as count FROM ticks').get() as { count: number };
  const cache1mCount = db.prepare('SELECT COUNT(*) as count FROM candles_1m').get() as { count: number };
  res.json({
    status: 'ok',
    totalCandles: candleCount.count,
    totalTicks: tickCount.count,
    totalCandles1m: cache1mCount.count,
  });
});

// 9. 자산별 수집 통계
app.get('/api/candles/stats', (_req, res) => {
  try {
    const stats = db
      .prepare(
        `
      SELECT symbol,
             COUNT(*) as count,
             MIN(timestamp) as oldest,
             MAX(timestamp) as newest,
             ROUND((MAX(timestamp) - MIN(timestamp)) / 86400000.0, 1) as days
      FROM candles
      GROUP BY symbol
      ORDER BY count DESC
    `
      )
      .all();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Tick 통계
app.get('/api/ticks/stats', (_req, res) => {
  try {
    const stats = db
      .prepare(
        `
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(ts_ms) as oldest_ms,
             MAX(ts_ms) as newest_ms,
             ROUND((MAX(ts_ms) - MIN(ts_ms)) / 86400000.0, 1) as days
      FROM ticks
      GROUP BY symbol, source
      ORDER BY count DESC
    `
      )
      .all();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. candles_1m 캐시 통계
app.get('/api/candles_1m/stats', (_req, res) => {
  try {
    const stats = db
      .prepare(
        `
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(ts_ms) as oldest_ms,
             MAX(ts_ms) as newest_ms,
             ROUND((MAX(ts_ms) - MIN(ts_ms)) / 86400000.0, 1) as days
      FROM candles_1m
      GROUP BY symbol, source
      ORDER BY count DESC
    `
      )
      .all();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12. 리샘플링된 캔들 조회 (tick → 1분봉 변환)
app.get('/api/candles/resampled', (req, res) => {
  const { symbol, interval, start, end } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' });
  }

  const intervalStr = (interval as string) || '1m';
  const intervalSeconds = parseIntervalToSeconds(intervalStr);
  if (intervalSeconds === null) {
    return res
      .status(400)
      .json({ error: `지원하지 않는 interval: ${intervalStr}. 사용 가능: 1m, 5m, 15m, 30m, 1h` });
  }

  try {
    const startTs = Number(start || 0);
    const endTs = Number(end || 9999999999999);

    const tickRows = db
      .prepare(
        `
      SELECT ts_ms, price FROM ticks
      WHERE symbol = ? AND source = 'history'
      AND ts_ms >= ? AND ts_ms <= ?
      ORDER BY ts_ms ASC
    `
      )
      .all(symbol, startTs, endTs) as Array<{ ts_ms: number; price: number }>;

    if (tickRows.length > 0) {
      const resampled = resampleTickRows(tickRows, intervalSeconds);
      return res.json({
        candles: resampled,
        meta: {
          symbol,
          interval: intervalStr,
          rawTickCount: tickRows.length,
          resampledCount: resampled.length,
          dataSource: 'ticks',
        },
      });
    }

    const rows = db
      .prepare(
        `
      SELECT timestamp, open, high, low, close, volume
      FROM candles
      WHERE symbol = ? AND source = 'history'
      AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `
      )
      .all(symbol, startTs, endTs) as Array<{
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;

    if (rows.length === 0) {
      return res.json({ candles: [], meta: { symbol, interval: intervalStr, rawTickCount: 0 } });
    }

    const filtered = rows.filter((row) => !isPayoutData(row));
    const tsUnit = detectTimestampUnit(filtered);
    const resampled = resampleTicksLegacy(filtered, intervalSeconds, tsUnit);

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
      },
    });
  } catch (error: any) {
    console.error('[Resampled] 조회 오류:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 13. 상세 수집 통계
app.get('/api/candles/stats/detailed', (_req, res) => {
  try {
    const tickStats = db
      .prepare(
        `
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(ts_ms) as oldest,
             MAX(ts_ms) as newest
      FROM ticks
      GROUP BY symbol, source
      ORDER BY symbol, source
    `
      )
      .all() as Array<{
      symbol: string;
      source: string;
      count: number;
      oldest: number;
      newest: number;
    }>;

    const cacheStats = db
      .prepare(
        `
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(ts_ms) as oldest,
             MAX(ts_ms) as newest
      FROM candles_1m
      GROUP BY symbol, source
      ORDER BY symbol, source
    `
      )
      .all() as Array<{
      symbol: string;
      source: string;
      count: number;
      oldest: number;
      newest: number;
    }>;

    const legacyStats = db
      .prepare(
        `
      SELECT symbol, source,
             COUNT(*) as count,
             MIN(timestamp) as oldest,
             MAX(timestamp) as newest
      FROM candles
      GROUP BY symbol, source
      ORDER BY symbol, source
    `
      )
      .all() as Array<{
      symbol: string;
      source: string;
      count: number;
      oldest: number;
      newest: number;
    }>;

    res.json({
      ticks: tickStats,
      candles_1m: cacheStats,
      candles_legacy: legacyStats,
      totals: {
        ticks: tickStats.reduce((sum, s) => sum + s.count, 0),
        candles_1m: cacheStats.reduce((sum, s) => sum + s.count, 0),
        candles_legacy: legacyStats.reduce((sum, s) => sum + s.count, 0),
      },
    });
  } catch (error: any) {
    console.error('[Stats/Detailed] 조회 오류:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 14. 기존 candles → ticks 마이그레이션
app.post('/api/migrate/candles-to-ticks', (_req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT symbol, timestamp, close, source
      FROM candles
      WHERE NOT (open = high AND high = low AND low = close AND open >= 0 AND open <= 100)
    `
      )
      .all() as Array<{
      symbol: string;
      timestamp: number;
      close: number;
      source: string;
    }>;

    let migrated = 0;
    const migrateMany = db.transaction((dataRows: typeof rows) => {
      for (const row of dataRows) {
        const tsMs = toEpochMs(row.timestamp);
        try {
          insertTick.run(row.symbol, tsMs, row.close, row.source);
          migrated++;
        } catch {
          // 중복은 무시 (UNIQUE constraint)
        }
      }
    });

    migrateMany(rows);

    console.log(`[Migration] candles → ticks: ${migrated}/${rows.length} migrated`);
    res.json({
      success: true,
      totalRows: rows.length,
      migrated,
      skipped: rows.length - migrated,
    });
  } catch (error: any) {
    console.error('[Migration] 오류:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 15. 증분 캐시 생성 트리거
app.post('/api/candles_1m/resample', (req, res) => {
  const { symbol } = req.body;

  if (!symbol) {
    return res.status(400).json({ error: 'symbol 파라미터가 필요합니다' });
  }

  try {
    const result = resampleAndCache(symbol, 0, 9999999999999);
    res.json({
      success: true,
      symbol,
      candlesCreated: result.candles.length,
      ticksProcessed: result.tickCount,
    });
  } catch (error: any) {
    console.error('[Resample] 오류:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// 리샘플링 + 캐시 저장 함수
// ============================================================

function resampleAndCache(
  symbol: string,
  startTs: number,
  endTs: number
): {
  candles: Array<{
    ts_ms: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  tickCount: number;
} {
  // Always read ticks from the original startTs to allow backfilling earlier ranges.
  // The INSERT ON CONFLICT in upsertTransaction handles already-cached buckets safely.
  const ticks = db
    .prepare(
      `
    SELECT ts_ms, price FROM ticks
    WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
    ORDER BY ts_ms ASC
  `
    )
    .all(symbol, startTs, endTs) as Array<{ ts_ms: number; price: number }>;

  if (ticks.length === 0) {
    const existing = db
      .prepare(
        `
      SELECT ts_ms, open, high, low, close, volume
      FROM candles_1m
      WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
      ORDER BY ts_ms ASC
    `
      )
      .all(symbol, startTs, endTs) as Array<{
      ts_ms: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
    return { candles: existing, tickCount: 0 };
  }

  const INTERVAL_MS = 60000;
  const buckets = new Map<number, Array<{ ts_ms: number; price: number }>>();

  for (const tick of ticks) {
    const bucketStart = Math.floor(tick.ts_ms / INTERVAL_MS) * INTERVAL_MS;
    const bucket = buckets.get(bucketStart);
    if (bucket) {
      bucket.push(tick);
    } else {
      buckets.set(bucketStart, [tick]);
    }
  }

  const newCandles: Array<{
    ts_ms: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];

  const upsertTransaction = db.transaction(() => {
    for (const [bucketStart, bucketTicks] of buckets) {
      const firstPrice = bucketTicks[0].price;
      const lastPrice = bucketTicks[bucketTicks.length - 1].price;
      let high = -Infinity;
      let low = Infinity;
      for (const t of bucketTicks) {
        if (t.price > high) high = t.price;
        if (t.price < low) low = t.price;
      }

      const candle = {
        ts_ms: bucketStart,
        open: firstPrice,
        high,
        low,
        close: lastPrice,
        volume: bucketTicks.length,
      };

      insertCandle1m.run(symbol, bucketStart, firstPrice, high, low, lastPrice, bucketTicks.length, 'resampled');
      newCandles.push(candle);
    }
  });

  upsertTransaction();

  const allCandles = db
    .prepare(
      `
    SELECT ts_ms, open, high, low, close, volume
    FROM candles_1m
    WHERE symbol = ? AND ts_ms >= ? AND ts_ms <= ?
    ORDER BY ts_ms ASC
  `
    )
    .all(symbol, startTs, endTs) as Array<{
    ts_ms: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;

  console.log(`[Cache] ${symbol}: ${newCandles.length} new candles cached from ${ticks.length} ticks`);
  return { candles: allCandles, tickCount: ticks.length };
}

function resampleTickRows(
  ticks: Array<{ ts_ms: number; price: number }>,
  intervalSeconds: number
): Array<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  if (ticks.length === 0) return [];

  const intervalMs = intervalSeconds * 1000;
  const buckets = new Map<number, Array<{ ts_ms: number; price: number }>>();

  for (const tick of ticks) {
    const bucketStart = Math.floor(tick.ts_ms / intervalMs) * intervalMs;
    const bucket = buckets.get(bucketStart);
    if (bucket) {
      bucket.push(tick);
    } else {
      buckets.set(bucketStart, [tick]);
    }
  }

  const result: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

  for (const bucketStart of sortedKeys) {
    const bucketTicks = buckets.get(bucketStart)!;
    let high = -Infinity;
    let low = Infinity;
    for (const t of bucketTicks) {
      if (t.price > high) high = t.price;
      if (t.price < low) low = t.price;
    }

    result.push({
      timestamp: bucketStart,
      open: bucketTicks[0].price,
      high,
      low,
      close: bucketTicks[bucketTicks.length - 1].price,
      volume: bucketTicks.length,
    });
  }

  return result;
}

// ============================================================
// 레거시 리샘플링 헬퍼 함수
// ============================================================

function parseIntervalToSeconds(interval: string): number | null {
  const match = interval.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return null;
  }
}

function detectTimestampUnit(rows: Array<{ timestamp: number }>): 's' | 'ms' {
  if (rows.length < 2) {
    if (rows.length === 1) {
      return rows[0].timestamp > 9999999999 ? 'ms' : 's';
    }
    return 's';
  }

  const sampleSize = Math.min(rows.length - 1, 20);
  let totalDiff = 0;
  for (let i = 0; i < sampleSize; i++) {
    totalDiff += Math.abs(rows[i + 1].timestamp - rows[i].timestamp);
  }
  const avgDiff = totalDiff / sampleSize;
  return avgDiff > 100 ? 'ms' : 's';
}

function resampleTicksLegacy(
  ticks: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>,
  intervalSeconds: number,
  tsUnit: 's' | 'ms'
): Array<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}> {
  if (ticks.length === 0) return [];

  const toSeconds = tsUnit === 'ms' ? (ts: number) => Math.floor(ts / 1000) : (ts: number) => ts;
  const result: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
  const buckets = new Map<number, typeof ticks>();

  for (const tick of ticks) {
    const tsSec = toSeconds(tick.timestamp);
    const bucketStart = Math.floor(tsSec / intervalSeconds) * intervalSeconds;
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, []);
    }
    buckets.get(bucketStart)!.push(tick);
  }

  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

  for (const bucketStart of sortedKeys) {
    const bucketTicks = buckets.get(bucketStart)!;
    result.push({
      timestamp: bucketStart,
      open: bucketTicks[0].open,
      high: Math.max(...bucketTicks.map((t) => t.high)),
      low: Math.min(...bucketTicks.map((t) => t.low)),
      close: bucketTicks[bucketTicks.length - 1].close,
      volume: bucketTicks.length,
    });
  }

  return result;
}

// ============================================================
// Start Server
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
Data Collector Server running at http://0.0.0.0:${PORT}
Database: ${DB_PATH}

Tables:
  - ticks:      raw tick data (ts_ms normalized)
  - candles_1m:  1m candle cache (resampled from ticks)
  - candles:     legacy (backward compatible)
  `);
});
