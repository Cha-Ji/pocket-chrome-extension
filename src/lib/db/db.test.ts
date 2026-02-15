import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  db,
  TickRepository,
  StrategyRepository,
  SessionRepository,
  TradeRepository,
} from './index';
import type { Tick, Strategy, Session, Trade } from '../types';

describe('Database Operations', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await db.ticks.clear();
    await db.strategies.clear();
    await db.sessions.clear();
    await db.trades.clear();
  });

  afterEach(async () => {
    // Ensure cleanup
    await db.ticks.clear();
    await db.strategies.clear();
    await db.sessions.clear();
    await db.trades.clear();
  });

  // ============================================================
  // Tick Repository Tests
  // ============================================================
  describe('TickRepository', () => {
    const sampleTick: Omit<Tick, 'id'> = {
      ticker: 'EURUSD',
      timestamp: Date.now(),
      price: 1.085,
    };

    it('should add a tick', async () => {
      const id = await TickRepository.add(sampleTick);
      expect(id).toBeGreaterThan(0);
    });

    it('should bulk add ticks', async () => {
      const now = Date.now();
      const ticks = [
        { ticker: 'EURUSD', timestamp: now - 2000, price: 1.085 },
        { ticker: 'EURUSD', timestamp: now - 1000, price: 1.0851 },
        { ticker: 'EURUSD', timestamp: now, price: 1.0852 },
      ];
      await TickRepository.bulkAdd(ticks);

      const count = await TickRepository.count();
      expect(count).toBe(3);
    });

    it('should get ticks by ticker', async () => {
      const now = Date.now();
      await TickRepository.add({ ticker: 'EURUSD', timestamp: now, price: 1.085 });
      await TickRepository.add({ ticker: 'GBPUSD', timestamp: now + 1, price: 1.265 });

      const eurTicks = await TickRepository.getByTicker('EURUSD');
      expect(eurTicks).toHaveLength(1);
      expect(eurTicks[0].ticker).toBe('EURUSD');
    });

    it('should delete old ticks', async () => {
      const oldTimestamp = Date.now() - 100000;
      const newTimestamp = Date.now();

      await TickRepository.add({ ticker: 'EURUSD', timestamp: oldTimestamp, price: 1.085 });
      await TickRepository.add({ ticker: 'EURUSD', timestamp: newTimestamp, price: 1.0851 });

      const deleted = await TickRepository.deleteOlderThan(oldTimestamp + 1);
      expect(deleted).toBe(1);

      const remaining = await TickRepository.count();
      expect(remaining).toBe(1);
    });
  });

  // ============================================================
  // Strategy Repository Tests
  // ============================================================
  describe('StrategyRepository', () => {
    const sampleStrategy: Omit<Strategy, 'id'> = {
      name: 'RSI Overbought/Oversold',
      description: 'Trade on RSI extremes',
      config: {
        indicators: [{ type: 'RSI', params: { period: 14 } }],
        entryConditions: [
          { indicator: 'RSI', operator: 'lt', value: 30, direction: 'CALL' },
          { indicator: 'RSI', operator: 'gt', value: 70, direction: 'PUT' },
        ],
        exitDuration: 60,
        riskPerTrade: 2,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('should create a strategy', async () => {
      const id = await StrategyRepository.create(sampleStrategy);
      expect(id).toBeGreaterThan(0);
    });

    it('should get strategy by id', async () => {
      const id = await StrategyRepository.create(sampleStrategy);
      const strategy = await StrategyRepository.getById(id);

      expect(strategy).toBeDefined();
      expect(strategy?.name).toBe(sampleStrategy.name);
    });

    it('should update strategy', async () => {
      const id = await StrategyRepository.create(sampleStrategy);
      await StrategyRepository.update(id, { name: 'Updated Strategy' });

      const strategy = await StrategyRepository.getById(id);
      expect(strategy?.name).toBe('Updated Strategy');
    });

    it('should delete strategy', async () => {
      const id = await StrategyRepository.create(sampleStrategy);
      await StrategyRepository.delete(id);

      const strategy = await StrategyRepository.getById(id);
      expect(strategy).toBeUndefined();
    });
  });

  // ============================================================
  // Session Repository Tests
  // ============================================================
  describe('SessionRepository', () => {
    const sampleSession: Omit<Session, 'id'> = {
      type: 'BACKTEST',
      strategyId: 1,
      startTime: Date.now(),
      initialBalance: 10000,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      ties: 0,
    };

    it('should create a session', async () => {
      const id = await SessionRepository.create(sampleSession);
      expect(id).toBeGreaterThan(0);
    });

    it('should finalize session with stats', async () => {
      const id = await SessionRepository.create({
        ...sampleSession,
        totalTrades: 10,
        wins: 6,
        losses: 4,
        ties: 0,
      });

      await SessionRepository.finalize(id, 10500);

      const session = await SessionRepository.getById(id);
      expect(session?.finalBalance).toBe(10500);
      expect(session?.winRate).toBe(60);
      expect(session?.endTime).toBeDefined();
    });
  });

  // ============================================================
  // Trade Repository Tests
  // ============================================================
  describe('TradeRepository', () => {
    it('should create and finalize a trade', async () => {
      // Create session first
      const sessionId = await SessionRepository.create({
        type: 'LIVE',
        strategyId: 1,
        startTime: Date.now(),
        initialBalance: 10000,
        totalTrades: 0,
        wins: 0,
        losses: 0,
      });

      // Create trade
      const tradeId = await TradeRepository.create({
        sessionId,
        ticker: 'EURUSD',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.085,
        result: 'PENDING',
        amount: 100,
      });

      expect(tradeId).toBeGreaterThan(0);

      // Finalize trade
      const result = await TradeRepository.finalize(tradeId, 1.086, 'WIN', 85);
      expect(result.updated).toBe(true);
      expect(result.trade?.result).toBe('WIN');
      expect(result.trade?.profit).toBe(85);
      expect(result.trade?.exitPrice).toBe(1.086);
      expect(result.trade?.exitTime).toBeDefined();

      const trade = await TradeRepository.getById(tradeId);
      expect(trade?.result).toBe('WIN');
      expect(trade?.profit).toBe(85);
      expect(trade?.exitPrice).toBe(1.086);
    });

    it('should be idempotent — second finalize returns updated=false', async () => {
      const sessionId = await SessionRepository.create({
        type: 'LIVE',
        strategyId: 1,
        startTime: Date.now(),
        initialBalance: 10000,
        totalTrades: 0,
        wins: 0,
        losses: 0,
      });

      const tradeId = await TradeRepository.create({
        sessionId,
        ticker: 'EURUSD',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.085,
        result: 'PENDING',
        amount: 100,
      });

      // First finalize
      const first = await TradeRepository.finalize(tradeId, 1.086, 'WIN', 85);
      expect(first.updated).toBe(true);

      // Second finalize — should be no-op
      const second = await TradeRepository.finalize(tradeId, 1.087, 'LOSS', -100);
      expect(second.updated).toBe(false);

      // Trade should still have first result
      const trade = await TradeRepository.getById(tradeId);
      expect(trade?.result).toBe('WIN');
      expect(trade?.profit).toBe(85);
    });

    it('should not double-count session stats on duplicate finalize', async () => {
      const sessionId = await SessionRepository.create({
        type: 'LIVE',
        strategyId: 1,
        startTime: Date.now(),
        initialBalance: 10000,
        totalTrades: 0,
        wins: 0,
        losses: 0,
      });

      const tradeId = await TradeRepository.create({
        sessionId,
        ticker: 'EURUSD',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.085,
        result: 'PENDING',
        amount: 100,
      });

      // Finalize twice
      await TradeRepository.finalize(tradeId, 1.086, 'WIN', 85);
      await TradeRepository.finalize(tradeId, 1.086, 'WIN', 85);

      // Session should only have 1 trade, 1 win
      const session = await SessionRepository.getById(sessionId);
      expect(session?.totalTrades).toBe(1);
      expect(session?.wins).toBe(1);
      expect(session?.losses).toBe(0);
    });

    it('should correctly track TIE in session stats', async () => {
      const sessionId = await SessionRepository.create({
        type: 'LIVE',
        strategyId: 1,
        startTime: Date.now(),
        initialBalance: 10000,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        ties: 0,
      });

      const tradeId = await TradeRepository.create({
        sessionId,
        ticker: 'EURUSD',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.085,
        result: 'PENDING',
        amount: 100,
      });

      // Finalize as TIE
      const result = await TradeRepository.finalize(tradeId, 1.085, 'TIE', 0);
      expect(result.updated).toBe(true);
      expect(result.trade?.result).toBe('TIE');
      expect(result.trade?.profit).toBe(0);

      // Session should show 1 trade, 0 wins, 0 losses, 1 tie
      const session = await SessionRepository.getById(sessionId);
      expect(session?.totalTrades).toBe(1);
      expect(session?.wins).toBe(0);
      expect(session?.losses).toBe(0);
      expect(session?.ties).toBe(1);
    });

    it('should return updated=false for non-existent trade', async () => {
      const result = await TradeRepository.finalize(99999, 1.086, 'WIN', 85);
      expect(result.updated).toBe(false);
    });
  });
});
