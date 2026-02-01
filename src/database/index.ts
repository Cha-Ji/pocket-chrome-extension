/**
 * Local Database
 * IndexedDB with Dexie.js
 */

import Dexie, { type Table } from 'dexie';

// 데이터 타입 정의
export interface Tick {
  id?: number;
  ticker: string;
  timestamp: number;
  price: number;
  serverTime?: number;
}

export interface Strategy {
  id?: number;
  name: string;
  config: Record<string, unknown>;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id?: number;
  type: 'backtest' | 'forward' | 'live';
  strategyId: number;
  startTime: number;
  endTime?: number;
  initialBalance: number;
  finalBalance?: number;
  winRate?: number;
}

export interface Trade {
  id?: number;
  sessionId: number;
  ticker: string;
  direction: 'call' | 'put';
  entryTime: number;
  entryPrice: number;
  exitTime?: number;
  exitPrice?: number;
  result?: 'win' | 'loss' | 'pending';
  profit?: number;
  snapshot?: Record<string, unknown>;
}

// Database 클래스
export class TradingDatabase extends Dexie {
  ticks!: Table<Tick>;
  strategies!: Table<Strategy>;
  sessions!: Table<Session>;
  trades!: Table<Trade>;

  constructor() {
    super('PocketOptionTradingDB');

    this.version(1).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
    });
  }
}

// 싱글톤 인스턴스
export const db = new TradingDatabase();

// 유틸리티 함수
export async function saveTick(tick: Omit<Tick, 'id'>): Promise<number> {
  return await db.ticks.add(tick as Tick);
}

export async function getTicksByTicker(
  ticker: string,
  startTime?: number,
  endTime?: number
): Promise<Tick[]> {
  let query = db.ticks.where('ticker').equals(ticker);

  if (startTime !== undefined && endTime !== undefined) {
    query = db.ticks
      .where('[ticker+timestamp]')
      .between([ticker, startTime], [ticker, endTime]);
  }

  return await query.toArray();
}

export async function cleanOldTicks(olderThan: number): Promise<number> {
  return await db.ticks.where('timestamp').below(olderThan).delete();
}
