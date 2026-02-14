import Dexie, { type EntityTable } from 'dexie'
import type { Tick, Strategy, Session, Trade } from '../types'
import type { LeaderboardEntry } from '../backtest/leaderboard-types'

// ============================================================
// Candle Type (IndexedDB 저장용)
// ============================================================

export interface StoredCandle {
  id?: number
  ticker: string
  interval: number // seconds
  timestamp: number // candle start time
  open: number
  high: number
  low: number
  close: number
  volume?: number
  source?: CandleSource // 데이터 출처
  createdAt: number
}

// ============================================================
// Candle Source Type
// ============================================================

export type CandleSource = 'websocket' | 'import' | 'api' | 'manual'

// ============================================================
// Backtest Result Type (IndexedDB 저장용)
// ============================================================

export interface StoredBacktestResult {
  id?: number
  strategyId: string
  strategyName: string
  strategyParams: Record<string, number>
  symbol: string
  startTime: number
  endTime: number
  candleCount: number
  // 핵심 지표
  totalTrades: number
  wins: number
  losses: number
  ties: number
  winRate: number
  netProfit: number
  netProfitPercent: number
  maxDrawdown: number
  maxDrawdownPercent: number
  profitFactor: number
  expectancy: number
  sharpeRatio: number
  sortinoRatio: number
  // 데이터 퀄리티
  coveragePercent: number
  gapCount: number
  // 거래 내역 (JSON)
  trades: string // JSON serialized BacktestTrade[]
  equityCurve: string // JSON serialized {timestamp, balance}[]
  // 설정 (JSON)
  config: string // JSON serialized BacktestConfig
  // 메타
  createdAt: number
}

// ============================================================
// Candle Dataset Meta Type
// ============================================================

export interface CandleDataset {
  id?: number
  ticker: string
  interval: number // seconds
  startTime: number
  endTime: number
  candleCount: number
  source: CandleSource
  lastUpdated: number
}

// ============================================================
// Database Schema using Dexie.js
// ============================================================

export class PocketDB extends Dexie {
  ticks!: EntityTable<Tick, 'id'>
  strategies!: EntityTable<Strategy, 'id'>
  sessions!: EntityTable<Session, 'id'>
  trades!: EntityTable<Trade, 'id'>
  candles!: EntityTable<StoredCandle, 'id'>
  leaderboardEntries!: EntityTable<LeaderboardEntry, 'id'>
  backtestResults!: EntityTable<StoredBacktestResult, 'id'>
  candleDatasets!: EntityTable<CandleDataset, 'id'>

  constructor() {
    super('PocketQuantTrader')

    // Version 1: 기본 테이블
    this.version(1).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
    })

    // Version 2: 캔들 테이블 추가
    this.version(2).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles: '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp]',
    })

    // Version 3: 리더보드 테이블 추가
    this.version(3).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles: '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp]',
      leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
    })

    // Version 4: 백테스트 결과 + 캔들 데이터셋 메타 + source 필드
    this.version(4).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles: '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp], source',
      leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
      backtestResults: '++id, strategyId, symbol, createdAt, winRate, netProfit',
      candleDatasets: '++id, ticker, interval, source, [ticker+interval], lastUpdated',
    })

    // Version 5: 캔들 중복 데이터 정리 (unique 인덱스 적용 준비)
    this.version(5).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles: '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp], source',
      leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
      backtestResults: '++id, strategyId, symbol, createdAt, winRate, netProfit',
      candleDatasets: '++id, ticker, interval, source, [ticker+interval], lastUpdated',
    }).upgrade(async tx => {
      const table = tx.table('candles')
      const all = await table.toArray()
      const seen = new Map<string, number>()
      const toDelete: number[] = []
      for (const c of all) {
        const key = `${c.ticker}|${c.interval}|${c.timestamp}`
        if (seen.has(key)) {
          toDelete.push(c.id)
        } else {
          seen.set(key, c.id)
        }
      }
      if (toDelete.length > 0) {
        await table.bulkDelete(toDelete)
      }
    })

    // Version 6: ticker+interval+timestamp 유니크 복합 인덱스 적용
    this.version(6).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles: '++id, ticker, interval, timestamp, [ticker+interval], &[ticker+interval+timestamp], source',
      leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
      backtestResults: '++id, strategyId, symbol, createdAt, winRate, netProfit',
      candleDatasets: '++id, ticker, interval, source, [ticker+interval], lastUpdated',
    })
  }
}

export const db = new PocketDB()

// ============================================================
// Database Operations
// ============================================================

export const TickRepository = {
  async add(tick: Omit<Tick, 'id'>): Promise<number | undefined> {
    return await db.ticks.add(tick)
  },

  async bulkAdd(ticks: Omit<Tick, 'id'>[]): Promise<void> {
    await db.ticks.bulkAdd(ticks)
  },

  async getByTicker(ticker: string, limit = 1000): Promise<Tick[]> {
    return await db.ticks
      .where('ticker')
      .equals(ticker)
      .reverse()
      .limit(limit)
      .toArray()
  },

  async getByTimeRange(ticker: string, start: number, end: number): Promise<Tick[]> {
    return await db.ticks
      .where('[ticker+timestamp]')
      .between([ticker, start], [ticker, end])
      .toArray()
  },

  async deleteOlderThan(timestamp: number): Promise<number | undefined> {
    return await db.ticks.where('timestamp').below(timestamp).delete()
  },

  async count(): Promise<number | undefined> {
    return await db.ticks.count()
  },
}

export const StrategyRepository = {
  async create(strategy: Omit<Strategy, 'id'>): Promise<number | undefined> {
    return await db.strategies.add(strategy)
  },

  async update(id: number, updates: Partial<Strategy>): Promise<void> {
    await db.strategies.update(id, { ...updates, updatedAt: Date.now() })
  },

  async getById(id: number): Promise<Strategy | undefined> {
    return await db.strategies.get(id)
  },

  async getAll(): Promise<Strategy[]> {
    return await db.strategies.toArray()
  },

  async delete(id: number): Promise<void> {
    await db.strategies.delete(id)
  },
}

export const SessionRepository = {
  async create(session: Omit<Session, 'id'>): Promise<number | undefined> {
    return await db.sessions.add(session)
  },

  async update(id: number, updates: Partial<Session>): Promise<void> {
    await db.sessions.update(id, updates)
  },

  async getById(id: number): Promise<Session | undefined> {
    return await db.sessions.get(id)
  },

  async getByType(type: Session['type']): Promise<Session[]> {
    return await db.sessions.where('type').equals(type).toArray()
  },

  async getRecent(limit = 10): Promise<Session[]> {
    return await db.sessions.orderBy('startTime').reverse().limit(limit).toArray()
  },

  async finalize(id: number, finalBalance: number): Promise<void> {
    const session = await db.sessions.get(id)
    if (!session) return

    const winRate = session.totalTrades > 0
      ? (session.wins / session.totalTrades) * 100
      : 0

    await db.sessions.update(id, {
      endTime: Date.now(),
      finalBalance,
      winRate,
    })
  },
}

export const TradeRepository = {
  async create(trade: Omit<Trade, 'id'>): Promise<number | undefined> {
    return await db.trades.add(trade)
  },

  async update(id: number, updates: Partial<Trade>): Promise<void> {
    await db.trades.update(id, updates)
  },

  async getById(id: number): Promise<Trade | undefined> {
    return await db.trades.get(id)
  },

  async getBySession(sessionId: number): Promise<Trade[]> {
    return await db.trades.where('sessionId').equals(sessionId).toArray()
  },

  async getPending(): Promise<Trade[]> {
    return await db.trades.where('result').equals('PENDING').toArray()
  },

  async finalize(id: number, exitPrice: number, result: Trade['result'], profit: number): Promise<void> {
    await db.trades.update(id, {
      exitTime: Date.now(),
      exitPrice,
      result,
      profit,
    })

    // Update session stats
    const trade = await db.trades.get(id)
    if (trade) {
      const session = await db.sessions.get(trade.sessionId)
      if (session) {
        await db.sessions.update(trade.sessionId, {
          totalTrades: session.totalTrades + 1,
          wins: result === 'WIN' ? session.wins + 1 : session.wins,
          losses: result === 'LOSS' ? session.losses + 1 : session.losses,
        })
      }
    }
  },
}

// ============================================================
// Candle Repository - 과거 데이터 저장/조회
// ============================================================

export const CandleRepository = {
  /**
   * 캔들 저장 (중복 시 무시)
   */
  async add(candle: Omit<StoredCandle, 'id'>): Promise<number | undefined> {
    try {
      return await db.candles.add({
        ...candle,
        createdAt: Date.now()
      })
    } catch (error: unknown) {
      // unique 인덱스 위반 — 중복 캔들, 무시
      if (error instanceof Error && error.name === 'ConstraintError') {
        return undefined
      }
      throw error
    }
  },

  /**
   * 캔들 bulk 저장 (중복 무시)
   *
   * 최적화: 배치 내 중복 제거 → ticker+interval 그룹별 기존 키 일괄 조회
   * → 신규 캔들만 bulkAdd (단일 트랜잭션)
   *
   * Before: O(N) DB reads + O(N) DB writes (캔들마다 중복 체크 + add)
   * After:  O(G) 키 조회 + O(M) bulkAdd (G=그룹 수, M=신규 캔들 수)
   */
  async bulkAdd(candles: Omit<StoredCandle, 'id' | 'createdAt'>[], source?: CandleSource): Promise<number> {
    if (candles.length === 0) return 0

    const now = Date.now()

    // 1) 배치 내 중복 제거 (같은 ticker+interval+timestamp → 첫 번째만 유지)
    const dedup = new Map<string, Omit<StoredCandle, 'id'>>()
    for (const c of candles) {
      const key = `${c.ticker}|${c.interval}|${c.timestamp}`
      if (!dedup.has(key)) {
        dedup.set(key, { ...c, source: c.source || source, createdAt: now })
      }
    }

    const items = Array.from(dedup.values())

    // 2) ticker+interval 그룹별 기존 키 일괄 조회 → 신규만 bulkAdd
    const groups = new Map<string, Omit<StoredCandle, 'id'>[]>()
    for (const c of items) {
      const gk = `${c.ticker}|${c.interval}`
      if (!groups.has(gk)) groups.set(gk, [])
      groups.get(gk)!.push(c)
    }

    let totalAdded = 0

    await db.transaction('rw', db.candles, async () => {
      for (const [, group] of groups) {
        const { ticker, interval } = group[0]
        const timestamps = group.map(c => c.timestamp)
        const minTs = Math.min(...timestamps)
        const maxTs = Math.max(...timestamps)

        // 기존 캔들의 인덱스 키만 조회 (전체 레코드 로드 X)
        const existingKeys = await db.candles
          .where('[ticker+interval+timestamp]')
          .between([ticker, interval, minTs], [ticker, interval, maxTs], true, true)
          .keys()

        const existingTs = new Set<number>()
        for (const k of existingKeys) {
          if (Array.isArray(k)) existingTs.add((k as unknown as [string, number, number])[2])
        }

        const newItems = group.filter(c => !existingTs.has(c.timestamp))

        if (newItems.length > 0) {
          await db.candles.bulkAdd(newItems)
          totalAdded += newItems.length
        }
      }
    })

    return totalAdded
  },

  /**
   * 티커의 캔들 조회
   */
  async getByTicker(
    ticker: string,
    interval: number,
    limit = 500
  ): Promise<StoredCandle[]> {
    return await db.candles
      .where('[ticker+interval]')
      .equals([ticker, interval])
      .reverse()
      .limit(limit)
      .toArray()
      .then(candles => candles.reverse()) // oldest first
  },

  /**
   * 시간 범위로 캔들 조회
   */
  async getByTimeRange(
    ticker: string,
    interval: number,
    startTime: number,
    endTime: number
  ): Promise<StoredCandle[]> {
    return await db.candles
      .where('[ticker+interval+timestamp]')
      .between(
        [ticker, interval, startTime],
        [ticker, interval, endTime],
        true, true
      )
      .toArray()
  },

  /**
   * 최신 캔들 N개 조회 (백테스트용)
   */
  async getRecent(
    ticker: string,
    interval: number,
    count: number
  ): Promise<StoredCandle[]> {
    return await db.candles
      .where('[ticker+interval]')
      .equals([ticker, interval])
      .reverse()
      .limit(count)
      .toArray()
      .then(candles => candles.reverse())
  },

  /**
   * 캔들 개수 조회
   */
  async count(ticker?: string, interval?: number): Promise<number> {
    if (ticker && interval) {
      return await db.candles
        .where('[ticker+interval]')
        .equals([ticker, interval])
        .count()
    }
    return await db.candles.count()
  },

  /**
   * 오래된 캔들 삭제
   */
  async deleteOlderThan(ticker: string, interval: number, timestamp: number): Promise<number> {
    const toDelete = await db.candles
      .where('[ticker+interval+timestamp]')
      .below([ticker, interval, timestamp])
      .primaryKeys()

    await db.candles.bulkDelete(toDelete)
    return toDelete.length
  },

  /**
   * 특정 티커의 모든 캔들 삭제
   */
  async deleteTicker(ticker: string): Promise<number> {
    const toDelete = await db.candles
      .where('ticker')
      .equals(ticker)
      .primaryKeys()

    await db.candles.bulkDelete(toDelete)
    return toDelete.length
  },

  /**
   * 모든 티커 목록 조회
   *
   * Before: toArray() 전체 로드 → Set 변환 = O(N)
   * After:  인덱스 uniqueKeys() = O(K) (K=고유 티커 수)
   */
  async getTickers(): Promise<string[]> {
    const keys = await db.candles.orderBy('ticker').uniqueKeys()
    return keys as string[]
  },

  /**
   * 캔들 통계 조회
   *
   * Before: toArray() 전체 로드 + 순회 = O(N) 메모리/CPU
   * After:  count() + uniqueKeys() + 그룹별 count = O(K) 쿼리 (K=고유 ticker+interval 쌍)
   */
  async getStats(): Promise<{
    totalCandles: number
    tickers: { ticker: string; interval: number; count: number }[]
    oldestTimestamp: number | null
    newestTimestamp: number | null
  }> {
    const totalCandles = await db.candles.count()

    if (totalCandles === 0) {
      return { totalCandles: 0, tickers: [], oldestTimestamp: null, newestTimestamp: null }
    }

    // 유니크 [ticker+interval] 쌍 조회 (인덱스 키만, 레코드 로드 X)
    const uniquePairs = await db.candles
      .orderBy('[ticker+interval]')
      .uniqueKeys()

    const tickers: { ticker: string; interval: number; count: number }[] = []
    for (const pair of uniquePairs) {
      const [ticker, interval] = pair as unknown as [string, number]
      const count = await db.candles
        .where('[ticker+interval]')
        .equals([ticker, interval])
        .count()
      tickers.push({ ticker, interval, count })
    }

    // 가장 오래된/최신 타임스탬프 (인덱스 활용)
    const oldest = await db.candles.orderBy('timestamp').first()
    const newest = await db.candles.orderBy('timestamp').last()

    return {
      totalCandles,
      tickers,
      oldestTimestamp: oldest?.timestamp ?? null,
      newestTimestamp: newest?.timestamp ?? null,
    }
  },

  /**
   * 캔들 내보내기 (JSON)
   */
  async export(ticker: string, interval: number): Promise<string> {
    const candles = await this.getByTicker(ticker, interval, 10000)
    return JSON.stringify({
      version: '1.0',
      ticker,
      interval,
      exportTime: Date.now(),
      count: candles.length,
      candles: candles.map(c => ({
        t: c.timestamp,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume
      }))
    })
  },

  /**
   * 캔들 가져오기 (JSON)
   */
  async import(json: string): Promise<number> {
    const data = JSON.parse(json)
    if (!data.ticker || !data.interval || !Array.isArray(data.candles)) {
      throw new Error('Invalid candle data format')
    }

    const candles = data.candles.map((c: any) => ({
      ticker: data.ticker,
      interval: data.interval,
      timestamp: c.t,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
      volume: c.v
    }))

    return await this.bulkAdd(candles)
  }
}

// ============================================================
// Leaderboard Repository - 리더보드 결과 저장/조회
// ============================================================

export const LeaderboardRepository = {
  /**
   * 리더보드 엔트리 일괄 저장 (기존 데이터 교체)
   */
  async saveResults(entries: LeaderboardEntry[]): Promise<void> {
    await db.leaderboardEntries.clear()
    await db.leaderboardEntries.bulkAdd(entries)
  },

  /**
   * 전체 리더보드 조회 (순위순)
   */
  async getAll(): Promise<LeaderboardEntry[]> {
    return await db.leaderboardEntries
      .orderBy('rank')
      .toArray()
  },

  /**
   * 상위 N개 엔트리 조회
   */
  async getTop(limit: number): Promise<LeaderboardEntry[]> {
    return await db.leaderboardEntries
      .orderBy('rank')
      .limit(limit)
      .toArray()
  },

  /**
   * 특정 전략의 리더보드 엔트리 조회
   */
  async getByStrategy(strategyId: string): Promise<LeaderboardEntry | undefined> {
    return await db.leaderboardEntries
      .where('strategyId')
      .equals(strategyId)
      .first()
  },

  /**
   * 리더보드 데이터 삭제
   */
  async clear(): Promise<void> {
    await db.leaderboardEntries.clear()
  },

  /**
   * 리더보드 엔트리 개수
   */
  async count(): Promise<number> {
    return await db.leaderboardEntries.count()
  },
}

// ============================================================
// Backtest Result Repository - 백테스트 결과 영속화
// ============================================================

export const BacktestResultRepository = {
  /**
   * 백테스트 결과 저장
   */
  async save(result: Omit<StoredBacktestResult, 'id'>): Promise<number | undefined> {
    return await db.backtestResults.add({
      ...result,
      createdAt: Date.now(),
    })
  },

  /**
   * ID로 조회
   */
  async getById(id: number): Promise<StoredBacktestResult | undefined> {
    return await db.backtestResults.get(id)
  },

  /**
   * 전략별 결과 조회
   */
  async getByStrategy(strategyId: string): Promise<StoredBacktestResult[]> {
    return await db.backtestResults
      .where('strategyId')
      .equals(strategyId)
      .reverse()
      .toArray()
  },

  /**
   * 최근 결과 조회
   */
  async getRecent(limit = 20): Promise<StoredBacktestResult[]> {
    return await db.backtestResults
      .orderBy('createdAt')
      .reverse()
      .limit(limit)
      .toArray()
  },

  /**
   * 심볼별 결과 조회
   */
  async getBySymbol(symbol: string): Promise<StoredBacktestResult[]> {
    return await db.backtestResults
      .where('symbol')
      .equals(symbol)
      .reverse()
      .toArray()
  },

  /**
   * 결과 삭제
   */
  async delete(id: number): Promise<void> {
    await db.backtestResults.delete(id)
  },

  /**
   * 전체 삭제
   */
  async clear(): Promise<void> {
    await db.backtestResults.clear()
  },

  /**
   * 결과 개수
   */
  async count(): Promise<number> {
    return await db.backtestResults.count()
  },
}

// ============================================================
// Candle Dataset Repository - 캔들 데이터셋 메타 관리
// ============================================================

export const CandleDatasetRepository = {
  /**
   * 데이터셋 메타 추가/갱신 (upsert)
   */
  async upsert(dataset: Omit<CandleDataset, 'id'>): Promise<void> {
    const existing = await db.candleDatasets
      .where('[ticker+interval]')
      .equals([dataset.ticker, dataset.interval])
      .first()

    if (existing) {
      await db.candleDatasets.update(existing.id!, {
        startTime: Math.min(existing.startTime, dataset.startTime),
        endTime: Math.max(existing.endTime, dataset.endTime),
        candleCount: dataset.candleCount,
        source: dataset.source,
        lastUpdated: Date.now(),
      })
    } else {
      await db.candleDatasets.add({
        ...dataset,
        lastUpdated: Date.now(),
      })
    }
  },

  /**
   * 모든 데이터셋 조회
   */
  async getAll(): Promise<CandleDataset[]> {
    return await db.candleDatasets
      .orderBy('lastUpdated')
      .reverse()
      .toArray()
  },

  /**
   * 티커별 데이터셋 조회
   */
  async getByTicker(ticker: string): Promise<CandleDataset[]> {
    return await db.candleDatasets
      .where('ticker')
      .equals(ticker)
      .toArray()
  },

  /**
   * 특정 데이터셋 조회
   */
  async get(ticker: string, interval: number): Promise<CandleDataset | undefined> {
    return await db.candleDatasets
      .where('[ticker+interval]')
      .equals([ticker, interval])
      .first()
  },

  /**
   * 데이터셋 삭제
   */
  async delete(id: number): Promise<void> {
    await db.candleDatasets.delete(id)
  },

  /**
   * 전체 삭제
   */
  async clear(): Promise<void> {
    await db.candleDatasets.clear()
  },

  /**
   * 데이터셋 개수
   */
  async count(): Promise<number> {
    return await db.candleDatasets.count()
  },
}
