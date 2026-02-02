import express from 'express'
import Database from 'better-sqlite3'
import cors from 'cors'
import bodyParser from 'body-parser'
import path from 'path'
import fs from 'fs'

// ============================================================
// Data Collector Server
// ============================================================
// 역할: 익스텐션에서 보내주는 캔들 데이터를 받아 SQLite에 저장
// ============================================================

const PORT = 3001
const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'market-data.db')

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR)
}

// Initialize Database
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

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
app.use(bodyParser.json({ limit: '10mb' }))

// ============================================================
// API Endpoints
// ============================================================

// 1. 단일 캔들 수집 (실시간)
app.post('/api/candle', (req, res) => {
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
        volume = excluded.volume
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
  const { candles } = req.body // Array of candle objects

  if (!Array.isArray(candles)) {
    return res.status(400).json({ error: 'Invalid data format' })
  }

  try {
    const insert = db.prepare(`
      INSERT INTO candles (symbol, interval, timestamp, open, high, low, close, volume, source)
      VALUES (@symbol, @interval, @timestamp, @open, @high, @low, @close, @volume, @source)
      ON CONFLICT(symbol, interval, timestamp) DO IGNORE
    `)

    const insertMany = db.transaction((rows) => {
      let count = 0
      for (const row of rows) insert.run(row)
      return rows.length
    })

    const count = insertMany(candles)
    console.log(`[${new Date().toLocaleTimeString()}] Bulk saved: ${count} candles`)
    res.json({ success: true, count })
  } catch (error: any) {
    console.error('Error bulk saving:', error.message)
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

app.listen(PORT, () => {
  console.log(`
🚀 Data Collector Server running at http://localhost:${PORT}
📁 Database: ${DB_PATH}
  `)
})
