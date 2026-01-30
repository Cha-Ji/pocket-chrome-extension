import Dexie, { type EntityTable } from 'dexie'
import type { Tick, Strategy, Session, Trade } from '../types'

// ============================================================
// Database Schema using Dexie.js
// ============================================================

export class PocketDB extends Dexie {
  ticks!: EntityTable<Tick, 'id'>
  strategies!: EntityTable<Strategy, 'id'>
  sessions!: EntityTable<Session, 'id'>
  trades!: EntityTable<Trade, 'id'>

  constructor() {
    super('PocketQuantTrader')
    
    this.version(1).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
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
