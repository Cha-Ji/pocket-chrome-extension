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
  createdAt: number
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
   * 캔들 저장
   */
  async add(candle: Omit<StoredCandle, 'id'>): Promise<number | undefined> {
    return await db.candles.add({
      ...candle,
      createdAt: Date.now()
    })
  },

  /**
   * 캔들 bulk 저장 (중복 무시)
   */
  async bulkAdd(candles: Omit<StoredCandle, 'id' | 'createdAt'>[]): Promise<number> {
    const withCreatedAt = candles.map(c => ({
      ...c,
      createdAt: Date.now()
    }))

    let added = 0
    for (const candle of withCreatedAt) {
      // 중복 체크
      const existing = await db.candles
        .where('[ticker+interval+timestamp]')
        .equals([candle.ticker, candle.interval, candle.timestamp])
        .first()

      if (!existing) {
        await db.candles.add(candle)
        added++
      }
    }
    return added
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
   */
  async getTickers(): Promise<string[]> {
    const candles = await db.candles.toArray()
    return [...new Set(candles.map(c => c.ticker))]
  },

  /**
   * 캔들 통계 조회
   */
  async getStats(): Promise<{
    totalCandles: number
    tickers: { ticker: string; interval: number; count: number }[]
    oldestTimestamp: number | null
    newestTimestamp: number | null
  }> {
    const candles = await db.candles.toArray()

    // 티커별 카운트
    const tickerMap = new Map<string, { interval: number; count: number }>()
    let oldest: number | null = null
    let newest: number | null = null

    for (const c of candles) {
      const key = `${c.ticker}-${c.interval}`
      const existing = tickerMap.get(key)
      if (existing) {
        existing.count++
      } else {
        tickerMap.set(key, { interval: c.interval, count: 1 })
      }

      if (!oldest || c.timestamp < oldest) oldest = c.timestamp
      if (!newest || c.timestamp > newest) newest = c.timestamp
    }

    const tickers = Array.from(tickerMap.entries()).map(([key, val]) => ({
      ticker: key.split('-')[0],
      interval: val.interval,
      count: val.count
    }))

    return {
      totalCandles: candles.length,
      tickers,
      oldestTimestamp: oldest,
      newestTimestamp: newest
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
