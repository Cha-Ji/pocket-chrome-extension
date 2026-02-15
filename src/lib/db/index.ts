import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Tick, Strategy, Session, Trade } from '../types';
import type { LeaderboardEntry } from '../backtest/leaderboard-types';

// ============================================================
// Candle Type (IndexedDB 저장용)
// ============================================================

export interface StoredCandle {
  ticker: string;
  interval: number; // seconds
  timestamp: number; // candle start time
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  source?: CandleSource; // 데이터 출처
  createdAt: number;
}

// ============================================================
// Candle Source Type
// ============================================================

export type CandleSource = 'websocket' | 'import' | 'api' | 'manual' | 'history';

// ============================================================
// Backtest Result Type (IndexedDB 저장용)
// ============================================================

export interface StoredBacktestResult {
  id?: number;
  strategyId: string;
  strategyName: string;
  strategyParams: Record<string, number>;
  symbol: string;
  startTime: number;
  endTime: number;
  candleCount: number;
  // 핵심 지표
  totalTrades: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  netProfit: number;
  netProfitPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  expectancy: number;
  sharpeRatio: number;
  sortinoRatio: number;
  // 데이터 퀄리티
  coveragePercent: number;
  gapCount: number;
  // 거래 내역 (JSON)
  trades: string; // JSON serialized BacktestTrade[]
  equityCurve: string; // JSON serialized {timestamp, balance}[]
  // 설정 (JSON)
  config: string; // JSON serialized BacktestConfig
  // 메타
  createdAt: number;
}

// ============================================================
// Candle Dataset Meta Type
// ============================================================

/**
 * CandleDataset — metadata about a candle collection for a given ticker+interval.
 *
 * **Upsert key policy (Option 2)**:
 *   Logical key = `[ticker, interval]`. One record per ticker+interval pair.
 *   The `source` field is informational only — it records the source of the
 *   *most recent* upsert (e.g. 'history', 'websocket'). It does NOT create
 *   separate records per source. Queries always use `[ticker+interval]`.
 */
export interface CandleDataset {
  id?: number;
  ticker: string;
  interval: number; // seconds
  startTime: number;
  endTime: number;
  candleCount: number;
  /** Source of the most recent update. Informational only — not part of the upsert key. */
  source: CandleSource;
  lastUpdated: number;
}

// ============================================================
// Database Schema using Dexie.js
// ============================================================

export class PocketDB extends Dexie {
  ticks!: EntityTable<Tick, 'id'>;
  strategies!: EntityTable<Strategy, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  trades!: EntityTable<Trade, 'id'>;
  candles!: Table<StoredCandle, [string, number, number]>;
  leaderboardEntries!: EntityTable<LeaderboardEntry, 'id'>;
  backtestResults!: EntityTable<StoredBacktestResult, 'id'>;
  candleDatasets!: EntityTable<CandleDataset, 'id'>;

  constructor() {
    super('PocketQuantTrader');

    // Version 1: 기본 테이블
    this.version(1).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
    });

    // Version 2: 캔들 테이블 추가
    this.version(2).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles: '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp]',
    });

    // Version 3: 리더보드 테이블 추가
    this.version(3).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles: '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp]',
      leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
    });

    // Version 4: 백테스트 결과 + 캔들 데이터셋 메타 + source 필드
    this.version(4).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles:
        '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp], source',
      leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
      backtestResults: '++id, strategyId, symbol, createdAt, winRate, netProfit',
      candleDatasets: '++id, ticker, interval, source, [ticker+interval], lastUpdated',
    });

    // Version 5: 캔들 중복 데이터 정리 (unique 인덱스 적용 준비)
    this.version(5)
      .stores({
        ticks: '++id, ticker, timestamp, [ticker+timestamp]',
        strategies: '++id, name, createdAt',
        sessions: '++id, type, strategyId, startTime',
        trades: '++id, sessionId, ticker, entryTime, result',
        candles:
          '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp], source',
        leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
        backtestResults: '++id, strategyId, symbol, createdAt, winRate, netProfit',
        candleDatasets: '++id, ticker, interval, source, [ticker+interval], lastUpdated',
      })
      .upgrade(async (tx) => {
        const table = tx.table('candles');
        const all = await table.toArray();
        const seen = new Map<string, number>();
        const toDelete: number[] = [];
        for (const c of all) {
          const key = `${c.ticker}|${c.interval}|${c.timestamp}`;
          if (seen.has(key)) {
            toDelete.push(c.id);
          } else {
            seen.set(key, c.id);
          }
        }
        if (toDelete.length > 0) {
          await table.bulkDelete(toDelete);
        }
      });

    // Version 6: ticker+interval+timestamp 유니크 복합 인덱스 적용
    this.version(6).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      strategies: '++id, name, createdAt',
      sessions: '++id, type, strategyId, startTime',
      trades: '++id, sessionId, ticker, entryTime, result',
      candles:
        '++id, ticker, interval, timestamp, [ticker+interval], &[ticker+interval+timestamp], source',
      leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
      backtestResults: '++id, strategyId, symbol, createdAt, winRate, netProfit',
      candleDatasets: '++id, ticker, interval, source, [ticker+interval], lastUpdated',
    });

    // Version 7: 캔들 PK 변경 준비 — 기존 데이터를 임시 테이블에 백업
    this.version(7)
      .stores({
        _candleBackup: '[ticker+interval+timestamp]',
      })
      .upgrade(async (tx) => {
        const candles = await tx.table('candles').toArray();
        if (candles.length === 0) return;
        const items = candles.map((c: Record<string, unknown>) => ({
          ticker: c.ticker,
          interval: c.interval,
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          source: c.source,
          createdAt: c.createdAt,
        }));
        await tx.table('_candleBackup').bulkPut(items);
      });

    // Version 8: 캔들 PK를 [ticker+interval+timestamp] 복합키로 변경
    // (Dexie가 PK 변경 시 기존 objectStore를 삭제 후 재생성하므로 백업에서 복원)
    this.version(8)
      .stores({
        candles:
          '[ticker+interval+timestamp], ticker, interval, timestamp, [ticker+interval], source',
      })
      .upgrade(async (tx) => {
        const backup = await tx.table('_candleBackup').toArray();
        if (backup.length > 0) {
          await tx.table('candles').bulkAdd(backup);
        }
      });

    // Version 9: 임시 백업 테이블 제거
    this.version(9).stores({
      _candleBackup: null,
    });

    // Version 10: candleDatasets — remove unused `source` index.
    // The `source` field is informational (lastSource semantic), not part of the logical key.
    // Logical key remains [ticker+interval]. See CandleDataset JSDoc.
    this.version(10).stores({
      candleDatasets: '++id, ticker, interval, [ticker+interval], lastUpdated',
    });
  }
}

export const db = new PocketDB();

// ============================================================
// Database Operations
// ============================================================

export const TickRepository = {
  async add(tick: Omit<Tick, 'id'>): Promise<number | undefined> {
    return await db.ticks.add(tick);
  },

  async bulkAdd(ticks: Omit<Tick, 'id'>[]): Promise<void> {
    await db.ticks.bulkAdd(ticks);
  },

  /**
   * Upsert-friendly bulk write using put (insert-or-replace).
   * Duplicate [ticker+timestamp] entries are silently overwritten
   * instead of causing a ConstraintError that fails the whole batch.
   */
  async bulkPut(ticks: Omit<Tick, 'id'>[]): Promise<void> {
    if (ticks.length === 0) return;
    await db.ticks.bulkPut(ticks);
  },

  async getByTicker(ticker: string, limit = 1000): Promise<Tick[]> {
    return await db.ticks.where('ticker').equals(ticker).reverse().limit(limit).toArray();
  },

  async getByTimeRange(ticker: string, start: number, end: number): Promise<Tick[]> {
    return await db.ticks
      .where('[ticker+timestamp]')
      .between([ticker, start], [ticker, end])
      .toArray();
  },

  async deleteOlderThan(timestamp: number): Promise<number | undefined> {
    return await db.ticks.where('timestamp').below(timestamp).delete();
  },

  /**
   * Enforce a hard cap on total tick rows.
   * If count > maxCount, deletes the oldest ticks (by timestamp)
   * until count <= maxCount.
   * Returns the number of rows deleted.
   */
  async deleteOldestToLimit(maxCount: number): Promise<number> {
    const total = await db.ticks.count();
    if (total <= maxCount) return 0;

    const excess = total - maxCount;
    const oldestKeys = await db.ticks.orderBy('timestamp').limit(excess).primaryKeys();

    await db.ticks.bulkDelete(oldestKeys);
    return oldestKeys.length;
  },

  async count(): Promise<number> {
    return await db.ticks.count();
  },

  /**
   * Observability: returns tick table stats for monitoring dashboards.
   */
  async getStats(): Promise<{
    count: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }> {
    const count = await db.ticks.count();
    if (count === 0) {
      return { count: 0, oldestTimestamp: null, newestTimestamp: null };
    }
    const oldest = await db.ticks.orderBy('timestamp').first();
    const newest = await db.ticks.orderBy('timestamp').last();
    return {
      count,
      oldestTimestamp: oldest?.timestamp ?? null,
      newestTimestamp: newest?.timestamp ?? null,
    };
  },
};

export const StrategyRepository = {
  async create(strategy: Omit<Strategy, 'id'>): Promise<number | undefined> {
    return await db.strategies.add(strategy);
  },

  async update(id: number, updates: Partial<Strategy>): Promise<void> {
    await db.strategies.update(id, { ...updates, updatedAt: Date.now() });
  },

  async getById(id: number): Promise<Strategy | undefined> {
    return await db.strategies.get(id);
  },

  async getAll(): Promise<Strategy[]> {
    return await db.strategies.toArray();
  },

  async delete(id: number): Promise<void> {
    await db.strategies.delete(id);
  },
};

export const SessionRepository = {
  async create(session: Omit<Session, 'id'>): Promise<number | undefined> {
    return await db.sessions.add(session);
  },

  async update(id: number, updates: Partial<Session>): Promise<void> {
    await db.sessions.update(id, updates);
  },

  async getById(id: number): Promise<Session | undefined> {
    return await db.sessions.get(id);
  },

  async getByType(type: Session['type']): Promise<Session[]> {
    return await db.sessions.where('type').equals(type).toArray();
  },

  async getRecent(limit = 10): Promise<Session[]> {
    return await db.sessions.orderBy('startTime').reverse().limit(limit).toArray();
  },

  async finalize(id: number, finalBalance: number): Promise<void> {
    const session = await db.sessions.get(id);
    if (!session) return;

    // Policy A: winRate = wins / (wins + losses), ties excluded from denominator
    const decided = session.wins + session.losses;
    const winRate = decided > 0 ? (session.wins / decided) * 100 : 0;

    await db.sessions.update(id, {
      endTime: Date.now(),
      finalBalance,
      winRate,
    });
  },
};

export const TradeRepository = {
  async create(trade: Omit<Trade, 'id'>): Promise<number> {
    const id = await db.trades.add(trade);
    if (id === undefined) throw new Error('Failed to create trade: no id returned');
    return id;
  },

  async update(id: number, updates: Partial<Trade>): Promise<void> {
    await db.trades.update(id, updates);
  },

  async getById(id: number): Promise<Trade | undefined> {
    return await db.trades.get(id);
  },

  async getBySession(sessionId: number): Promise<Trade[]> {
    return await db.trades.where('sessionId').equals(sessionId).toArray();
  },

  async getRecent(limit = 50): Promise<Trade[]> {
    return await db.trades.orderBy('entryTime').reverse().limit(limit).toArray();
  },

  async getPending(): Promise<Trade[]> {
    return await db.trades.where('result').equals('PENDING').toArray();
  },

  /**
   * Idempotent trade finalization.
   *
   * If the trade is already settled (result !== 'PENDING'), returns
   * `{ updated: false }` without touching the DB — preventing duplicate
   * session stat increments.
   *
   * On success returns `{ updated: true, trade }` with the full updated Trade.
   */
  async finalize(
    id: number,
    exitPrice: number,
    result: Trade['result'],
    profit: number,
  ): Promise<{ updated: boolean; trade?: Trade }> {
    return await db.transaction('rw', [db.trades, db.sessions], async () => {
      const trade = await db.trades.get(id);
      if (!trade) return { updated: false };

      // Idempotency: already finalized → no-op
      if (trade.result !== 'PENDING') return { updated: false };

      const exitTime = Date.now();
      await db.trades.update(id, { exitTime, exitPrice, result, profit });

      // Update session stats (within the same transaction)
      const session = await db.sessions.get(trade.sessionId);
      if (session) {
        await db.sessions.update(trade.sessionId, {
          totalTrades: session.totalTrades + 1,
          wins: result === 'WIN' ? session.wins + 1 : session.wins,
          losses: result === 'LOSS' ? session.losses + 1 : session.losses,
          ties: result === 'TIE' ? (session.ties ?? 0) + 1 : (session.ties ?? 0),
        });
      }

      const updatedTrade: Trade = { ...trade, exitTime, exitPrice, result, profit };
      return { updated: true, trade: updatedTrade };
    });
  },
};

// ============================================================
// Candle Repository - 과거 데이터 저장/조회
// ============================================================

export const CandleRepository = {
  /**
   * 캔들 저장 (중복 시 upsert)
   */
  async add(candle: Omit<StoredCandle, 'createdAt'>): Promise<void> {
    await db.candles.put({
      ...candle,
      createdAt: Date.now(),
    });
  },

  /**
   * 캔들 bulk 저장 (bulkPut upsert — 중복은 자동 덮어쓰기)
   *
   * 복합 PK [ticker+interval+timestamp] 덕분에 per-group exists 체크 불필요.
   * 배치 내 중복 제거 → 단일 bulkPut → count 차이로 신규 건수 반환.
   */
  async bulkAdd(
    candles: Omit<StoredCandle, 'createdAt'>[],
    source?: CandleSource,
  ): Promise<number> {
    if (candles.length === 0) return 0;

    const now = Date.now();

    // 배치 내 중복 제거 (같은 ticker+interval+timestamp → 첫 번째만 유지)
    const dedup = new Map<string, StoredCandle>();
    for (const c of candles) {
      const key = `${c.ticker}|${c.interval}|${c.timestamp}`;
      if (!dedup.has(key)) {
        dedup.set(key, { ...c, source: c.source || source, createdAt: now });
      }
    }

    const items = Array.from(dedup.values());

    // P1-1 최적화: bulkGet으로 기존 키 존재 여부 확인 (O(batch) vs 기존 O(table))
    const keys = items.map((c) => [c.ticker, c.interval, c.timestamp] as [string, number, number]);

    return await db.transaction('rw', db.candles, async () => {
      const existing = await db.candles.bulkGet(keys);
      const newCount = existing.filter((e) => e === undefined).length;
      await db.candles.bulkPut(items);
      return newCount;
    });
  },

  /**
   * 티커의 캔들 조회
   */
  async getByTicker(ticker: string, interval: number, limit = 500): Promise<StoredCandle[]> {
    return await db.candles
      .where('[ticker+interval]')
      .equals([ticker, interval])
      .reverse()
      .limit(limit)
      .toArray()
      .then((candles) => candles.reverse()); // oldest first
  },

  /**
   * 시간 범위로 캔들 조회
   */
  async getByTimeRange(
    ticker: string,
    interval: number,
    startTime: number,
    endTime: number,
  ): Promise<StoredCandle[]> {
    return await db.candles
      .where('[ticker+interval+timestamp]')
      .between([ticker, interval, startTime], [ticker, interval, endTime], true, true)
      .toArray();
  },

  /**
   * 최신 캔들 N개 조회 (백테스트용)
   */
  async getRecent(ticker: string, interval: number, count: number): Promise<StoredCandle[]> {
    return await db.candles
      .where('[ticker+interval]')
      .equals([ticker, interval])
      .reverse()
      .limit(count)
      .toArray()
      .then((candles) => candles.reverse());
  },

  /**
   * 캔들 개수 조회
   */
  async count(ticker?: string, interval?: number): Promise<number> {
    if (ticker && interval) {
      return await db.candles.where('[ticker+interval]').equals([ticker, interval]).count();
    }
    return await db.candles.count();
  },

  /**
   * 오래된 캔들 삭제
   */
  async deleteOlderThan(ticker: string, interval: number, timestamp: number): Promise<number> {
    return await db.candles
      .where('[ticker+interval+timestamp]')
      .between([ticker, interval, 0], [ticker, interval, timestamp])
      .delete();
  },

  /**
   * 특정 티커의 모든 캔들 삭제
   */
  async deleteTicker(ticker: string): Promise<number> {
    return await db.candles.where('ticker').equals(ticker).delete();
  },

  /**
   * 모든 티커 목록 조회
   *
   * Before: toArray() 전체 로드 → Set 변환 = O(N)
   * After:  인덱스 uniqueKeys() = O(K) (K=고유 티커 수)
   */
  async getTickers(): Promise<string[]> {
    const keys = await db.candles.orderBy('ticker').uniqueKeys();
    return keys as string[];
  },

  /**
   * 캔들 통계 조회
   *
   * Before: toArray() 전체 로드 + 순회 = O(N) 메모리/CPU
   * After:  count() + uniqueKeys() + 그룹별 count = O(K) 쿼리 (K=고유 ticker+interval 쌍)
   */
  async getStats(): Promise<{
    totalCandles: number;
    tickers: { ticker: string; interval: number; count: number }[];
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }> {
    const totalCandles = await db.candles.count();

    if (totalCandles === 0) {
      return { totalCandles: 0, tickers: [], oldestTimestamp: null, newestTimestamp: null };
    }

    // 유니크 [ticker+interval] 쌍 조회 (인덱스 키만, 레코드 로드 X)
    const uniquePairs = await db.candles.orderBy('[ticker+interval]').uniqueKeys();

    const tickers: { ticker: string; interval: number; count: number }[] = [];
    for (const pair of uniquePairs) {
      const [ticker, interval] = pair as unknown as [string, number];
      const count = await db.candles.where('[ticker+interval]').equals([ticker, interval]).count();
      tickers.push({ ticker, interval, count });
    }

    // 가장 오래된/최신 타임스탬프 (인덱스 활용)
    const oldest = await db.candles.orderBy('timestamp').first();
    const newest = await db.candles.orderBy('timestamp').last();

    return {
      totalCandles,
      tickers,
      oldestTimestamp: oldest?.timestamp ?? null,
      newestTimestamp: newest?.timestamp ?? null,
    };
  },

  /**
   * 캔들 내보내기 (JSON)
   */
  async export(ticker: string, interval: number): Promise<string> {
    const candles = await this.getByTicker(ticker, interval, 10000);
    return JSON.stringify({
      version: '1.0',
      ticker,
      interval,
      exportTime: Date.now(),
      count: candles.length,
      candles: candles.map((c) => ({
        t: c.timestamp,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume,
      })),
    });
  },

  /**
   * 캔들 가져오기 (JSON)
   */
  async import(json: string): Promise<number> {
    const data = JSON.parse(json);
    if (!data.ticker || !data.interval || !Array.isArray(data.candles)) {
      throw new Error('Invalid candle data format');
    }

    const candles = data.candles.map((c: any) => ({
      ticker: data.ticker,
      interval: data.interval,
      timestamp: c.t,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
      volume: c.v,
    }));

    return await this.bulkAdd(candles);
  },
};

// ============================================================
// Leaderboard Repository - 리더보드 결과 저장/조회
// ============================================================

export const LeaderboardRepository = {
  /**
   * 리더보드 엔트리 일괄 저장 (기존 데이터 교체)
   */
  async saveResults(entries: LeaderboardEntry[]): Promise<void> {
    await db.leaderboardEntries.clear();
    await db.leaderboardEntries.bulkAdd(entries);
  },

  /**
   * 전체 리더보드 조회 (순위순)
   */
  async getAll(): Promise<LeaderboardEntry[]> {
    return await db.leaderboardEntries.orderBy('rank').toArray();
  },

  /**
   * 상위 N개 엔트리 조회
   */
  async getTop(limit: number): Promise<LeaderboardEntry[]> {
    return await db.leaderboardEntries.orderBy('rank').limit(limit).toArray();
  },

  /**
   * 특정 전략의 리더보드 엔트리 조회
   */
  async getByStrategy(strategyId: string): Promise<LeaderboardEntry | undefined> {
    return await db.leaderboardEntries.where('strategyId').equals(strategyId).first();
  },

  /**
   * 리더보드 데이터 삭제
   */
  async clear(): Promise<void> {
    await db.leaderboardEntries.clear();
  },

  /**
   * 리더보드 엔트리 개수
   */
  async count(): Promise<number> {
    return await db.leaderboardEntries.count();
  },
};

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
    });
  },

  /**
   * ID로 조회
   */
  async getById(id: number): Promise<StoredBacktestResult | undefined> {
    return await db.backtestResults.get(id);
  },

  /**
   * 전략별 결과 조회
   */
  async getByStrategy(strategyId: string): Promise<StoredBacktestResult[]> {
    return await db.backtestResults.where('strategyId').equals(strategyId).reverse().toArray();
  },

  /**
   * 최근 결과 조회
   */
  async getRecent(limit = 20): Promise<StoredBacktestResult[]> {
    return await db.backtestResults.orderBy('createdAt').reverse().limit(limit).toArray();
  },

  /**
   * 심볼별 결과 조회
   */
  async getBySymbol(symbol: string): Promise<StoredBacktestResult[]> {
    return await db.backtestResults.where('symbol').equals(symbol).reverse().toArray();
  },

  /**
   * 결과 삭제
   */
  async delete(id: number): Promise<void> {
    await db.backtestResults.delete(id);
  },

  /**
   * 전체 삭제
   */
  async clear(): Promise<void> {
    await db.backtestResults.clear();
  },

  /**
   * 결과 개수
   */
  async count(): Promise<number> {
    return await db.backtestResults.count();
  },
};

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
      .first();

    if (existing) {
      await db.candleDatasets.update(existing.id!, {
        startTime: Math.min(existing.startTime, dataset.startTime),
        endTime: Math.max(existing.endTime, dataset.endTime),
        candleCount: dataset.candleCount,
        source: dataset.source,
        lastUpdated: Date.now(),
      });
    } else {
      await db.candleDatasets.add({
        ...dataset,
        lastUpdated: Date.now(),
      });
    }
  },

  /**
   * 모든 데이터셋 조회
   */
  async getAll(): Promise<CandleDataset[]> {
    return await db.candleDatasets.orderBy('lastUpdated').reverse().toArray();
  },

  /**
   * 티커별 데이터셋 조회
   */
  async getByTicker(ticker: string): Promise<CandleDataset[]> {
    return await db.candleDatasets.where('ticker').equals(ticker).toArray();
  },

  /**
   * 특정 데이터셋 조회
   */
  async get(ticker: string, interval: number): Promise<CandleDataset | undefined> {
    return await db.candleDatasets.where('[ticker+interval]').equals([ticker, interval]).first();
  },

  /**
   * 데이터셋 삭제
   */
  async delete(id: number): Promise<void> {
    await db.candleDatasets.delete(id);
  },

  /**
   * 전체 삭제
   */
  async clear(): Promise<void> {
    await db.candleDatasets.clear();
  },

  /**
   * 데이터셋 개수
   */
  async count(): Promise<number> {
    return await db.candleDatasets.count();
  },
};
