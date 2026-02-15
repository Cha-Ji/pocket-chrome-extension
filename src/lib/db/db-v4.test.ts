import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  db,
  CandleRepository,
  BacktestResultRepository,
  CandleDatasetRepository,
} from './index'
import type { StoredBacktestResult, CandleDataset, StoredCandle } from './index'

describe('Database V4 — New Tables & Fields', () => {
  beforeEach(async () => {
    await db.candles.clear()
    await db.backtestResults.clear()
    await db.candleDatasets.clear()
  })

  afterEach(async () => {
    await db.candles.clear()
    await db.backtestResults.clear()
    await db.candleDatasets.clear()
  })

  // ============================================================
  // StoredCandle source field
  // ============================================================
  describe('StoredCandle — source field', () => {
    it('should store candle with source field', async () => {
      const candle: StoredCandle = {
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000000000,
        open: 1.085,
        high: 1.086,
        low: 1.084,
        close: 1.0855,
        volume: 100,
        source: 'websocket',
        createdAt: Date.now(),
      }

      await db.candles.put(candle)
      const stored = await db.candles.get([candle.ticker, candle.interval, candle.timestamp])
      expect(stored?.source).toBe('websocket')
    })

    it('should store candle without source (backward compat)', async () => {
      const candle: StoredCandle = {
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000060000,
        open: 1.085,
        high: 1.086,
        low: 1.084,
        close: 1.0855,
        createdAt: Date.now(),
      }

      await db.candles.put(candle)
      const stored = await db.candles.get([candle.ticker, candle.interval, candle.timestamp])
      expect(stored?.source).toBeUndefined()
    })

    it('should bulk add candles with source parameter', async () => {
      const candles = [
        { ticker: 'EURUSD_OTC', interval: 60, timestamp: 1700000000000, open: 1.085, high: 1.086, low: 1.084, close: 1.0855 },
        { ticker: 'EURUSD_OTC', interval: 60, timestamp: 1700000060000, open: 1.0855, high: 1.087, low: 1.085, close: 1.086 },
      ]

      const added = await CandleRepository.bulkAdd(candles, 'websocket')
      expect(added).toBe(2)

      const stored = await db.candles.toArray()
      expect(stored[0].source).toBe('websocket')
      expect(stored[1].source).toBe('websocket')
    })
  })

  // ============================================================
  // BacktestResultRepository
  // ============================================================
  describe('BacktestResultRepository', () => {
    const sampleResult: Omit<StoredBacktestResult, 'id' | 'createdAt'> = {
      strategyId: 'rsi-ob-os',
      strategyName: 'RSI Overbought/Oversold',
      strategyParams: { period: 14, oversold: 30, overbought: 70 },
      symbol: 'EURUSD_OTC',
      startTime: 1700000000000,
      endTime: 1700050000000,
      candleCount: 500,
      totalTrades: 42,
      wins: 25,
      losses: 16,
      ties: 1,
      winRate: 59.52,
      netProfit: 350,
      netProfitPercent: 3.5,
      maxDrawdown: 200,
      maxDrawdownPercent: 1.95,
      profitFactor: 1.72,
      expectancy: 8.33,
      sharpeRatio: 1.2,
      sortinoRatio: 1.5,
      coveragePercent: 98.5,
      gapCount: 2,
      trades: JSON.stringify([{ entryTime: 1700000100000, direction: 'CALL', result: 'WIN' }]),
      equityCurve: JSON.stringify([{ timestamp: 1700000000000, balance: 10000 }]),
      config: JSON.stringify({ symbol: 'EURUSD_OTC', initialBalance: 10000 }),
    }

    it('should save a backtest result', async () => {
      const id = await BacktestResultRepository.save(sampleResult)
      expect(id).toBeGreaterThan(0)
    })

    it('should retrieve by id', async () => {
      const id = await BacktestResultRepository.save(sampleResult)
      const result = await BacktestResultRepository.getById(id!)
      expect(result).toBeDefined()
      expect(result?.strategyId).toBe('rsi-ob-os')
      expect(result?.winRate).toBe(59.52)
      expect(result?.totalTrades).toBe(42)
    })

    it('should retrieve by strategy', async () => {
      await BacktestResultRepository.save(sampleResult)
      await BacktestResultRepository.save({ ...sampleResult, strategyId: 'macd-cross' })

      const rsiResults = await BacktestResultRepository.getByStrategy('rsi-ob-os')
      expect(rsiResults).toHaveLength(1)
      expect(rsiResults[0].strategyId).toBe('rsi-ob-os')
    })

    it('should retrieve by symbol', async () => {
      await BacktestResultRepository.save(sampleResult)
      await BacktestResultRepository.save({ ...sampleResult, symbol: 'GBPUSD_OTC' })

      const eurResults = await BacktestResultRepository.getBySymbol('EURUSD_OTC')
      expect(eurResults).toHaveLength(1)
    })

    it('should retrieve recent results', async () => {
      for (let i = 0; i < 5; i++) {
        await BacktestResultRepository.save({ ...sampleResult, winRate: 50 + i })
      }

      const recent = await BacktestResultRepository.getRecent(3)
      expect(recent).toHaveLength(3)
    })

    it('should delete a result', async () => {
      const id = await BacktestResultRepository.save(sampleResult)
      await BacktestResultRepository.delete(id!)

      const result = await BacktestResultRepository.getById(id!)
      expect(result).toBeUndefined()
    })

    it('should deserialize trades and equity curve', async () => {
      const id = await BacktestResultRepository.save(sampleResult)
      const result = await BacktestResultRepository.getById(id!)

      const trades = JSON.parse(result!.trades)
      expect(trades[0].direction).toBe('CALL')

      const curve = JSON.parse(result!.equityCurve)
      expect(curve[0].balance).toBe(10000)
    })

    it('should count results', async () => {
      await BacktestResultRepository.save(sampleResult)
      await BacktestResultRepository.save({ ...sampleResult, strategyId: 'bb-bounce' })

      const count = await BacktestResultRepository.count()
      expect(count).toBe(2)
    })

    it('should clear all results', async () => {
      await BacktestResultRepository.save(sampleResult)
      await BacktestResultRepository.clear()

      const count = await BacktestResultRepository.count()
      expect(count).toBe(0)
    })
  })

  // ============================================================
  // CandleDatasetRepository
  // ============================================================
  describe('CandleDatasetRepository', () => {
    const sampleDataset: Omit<CandleDataset, 'id'> = {
      ticker: 'EURUSD_OTC',
      interval: 60,
      startTime: 1700000000000,
      endTime: 1700050000000,
      candleCount: 833,
      source: 'websocket',
      lastUpdated: Date.now(),
    }

    it('should upsert a new dataset', async () => {
      await CandleDatasetRepository.upsert(sampleDataset)

      const all = await CandleDatasetRepository.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].ticker).toBe('EURUSD_OTC')
      expect(all[0].candleCount).toBe(833)
    })

    it('should merge on upsert for same ticker+interval', async () => {
      await CandleDatasetRepository.upsert(sampleDataset)

      // Upsert with expanded range
      await CandleDatasetRepository.upsert({
        ...sampleDataset,
        startTime: 1699990000000, // earlier
        endTime: 1700060000000,   // later
        candleCount: 1200,
      })

      const all = await CandleDatasetRepository.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].startTime).toBe(1699990000000) // merged to earlier
      expect(all[0].endTime).toBe(1700060000000)   // merged to later
      expect(all[0].candleCount).toBe(1200)
    })

    it('should get by ticker', async () => {
      await CandleDatasetRepository.upsert(sampleDataset)
      await CandleDatasetRepository.upsert({ ...sampleDataset, ticker: 'GBPUSD_OTC' })

      const eurDatasets = await CandleDatasetRepository.getByTicker('EURUSD_OTC')
      expect(eurDatasets).toHaveLength(1)
    })

    it('should get specific dataset', async () => {
      await CandleDatasetRepository.upsert(sampleDataset)

      const dataset = await CandleDatasetRepository.get('EURUSD_OTC', 60)
      expect(dataset).toBeDefined()
      expect(dataset?.candleCount).toBe(833)
    })

    it('should return undefined for non-existent dataset', async () => {
      const dataset = await CandleDatasetRepository.get('NONEXIST', 60)
      expect(dataset).toBeUndefined()
    })

    it('should delete a dataset', async () => {
      await CandleDatasetRepository.upsert(sampleDataset)
      const all = await CandleDatasetRepository.getAll()
      await CandleDatasetRepository.delete(all[0].id!)

      const count = await CandleDatasetRepository.count()
      expect(count).toBe(0)
    })

    it('should count datasets', async () => {
      await CandleDatasetRepository.upsert(sampleDataset)
      await CandleDatasetRepository.upsert({ ...sampleDataset, ticker: 'GBPUSD_OTC' })
      await CandleDatasetRepository.upsert({ ...sampleDataset, interval: 300 })

      const count = await CandleDatasetRepository.count()
      expect(count).toBe(3)
    })
  })

  // ============================================================
  // E2E: StoredCandle → Candle 파이프라인
  // ============================================================
  describe('E2E: CandleRepository → BacktestEngine data flow', () => {
    it('should store and retrieve candles in backtest-ready format', async () => {
      // 1. Pocket Option 형태의 캔들 데이터 생성
      const poCandles = Array.from({ length: 100 }, (_, i) => ({
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000000000 + i * 60000,
        open: 1.085 + Math.random() * 0.002,
        high: 1.087 + Math.random() * 0.001,
        low: 1.083 + Math.random() * 0.001,
        close: 1.085 + Math.random() * 0.002,
        volume: Math.floor(Math.random() * 1000),
      }))

      // 2. DB에 저장 (source: websocket)
      const added = await CandleRepository.bulkAdd(poCandles, 'websocket')
      expect(added).toBe(100)

      // 3. 시간 범위로 조회
      const retrieved = await CandleRepository.getByTimeRange(
        'EURUSD_OTC',
        60,
        1700000000000,
        1700000000000 + 99 * 60000
      )
      expect(retrieved.length).toBe(100)

      // 4. BacktestEngine에 필요한 Candle 형식으로 변환 확인
      const backtestCandles = retrieved.map(sc => ({
        timestamp: sc.timestamp,
        open: sc.open,
        high: sc.high,
        low: sc.low,
        close: sc.close,
        volume: sc.volume,
      }))

      // 5. OHLCV 무결성 검증
      for (const c of backtestCandles) {
        expect(c.timestamp).toBeGreaterThan(0)
        expect(c.open).toBeGreaterThan(0)
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close))
        expect(c.close).toBeGreaterThan(0)
      }

      // 6. 시간순 정렬 검증
      for (let i = 1; i < backtestCandles.length; i++) {
        expect(backtestCandles[i].timestamp).toBeGreaterThan(backtestCandles[i - 1].timestamp)
      }

      // 7. source 필드 검증
      expect(retrieved[0].source).toBe('websocket')
    })

    it('should deduplicate on bulk add', async () => {
      const candle = {
        ticker: 'EURUSD_OTC',
        interval: 60,
        timestamp: 1700000000000,
        open: 1.085,
        high: 1.087,
        low: 1.083,
        close: 1.086,
      }

      const first = await CandleRepository.bulkAdd([candle], 'websocket')
      const second = await CandleRepository.bulkAdd([candle], 'websocket')

      expect(first).toBe(1)
      expect(second).toBe(0) // 중복 무시

      const count = await CandleRepository.count('EURUSD_OTC', 60)
      expect(count).toBe(1)
    })

    it('should support dataset meta tracking alongside candle storage', async () => {
      // 1. 캔들 저장
      const candles = Array.from({ length: 50 }, (_, i) => ({
        ticker: 'GBPJPY_OTC',
        interval: 300,
        timestamp: 1700000000000 + i * 300000,
        open: 185.5 + Math.random(),
        high: 186.0 + Math.random(),
        low: 185.0 + Math.random(),
        close: 185.7 + Math.random(),
      }))

      await CandleRepository.bulkAdd(candles, 'import')

      // 2. 데이터셋 메타 기록
      await CandleDatasetRepository.upsert({
        ticker: 'GBPJPY_OTC',
        interval: 300,
        startTime: candles[0].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        candleCount: candles.length,
        source: 'import',
        lastUpdated: Date.now(),
      })

      // 3. 메타로 빠른 조회
      const dataset = await CandleDatasetRepository.get('GBPJPY_OTC', 300)
      expect(dataset).toBeDefined()
      expect(dataset?.candleCount).toBe(50)
      expect(dataset?.source).toBe('import')

      // 4. 실제 캔들 카운트와 일치 확인
      const actualCount = await CandleRepository.count('GBPJPY_OTC', 300)
      expect(actualCount).toBe(dataset?.candleCount)
    })
  })
})
