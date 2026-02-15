import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleTradeExecuted,
  handleFinalizeTrade,
  handleGetTrades,
  type TradeRepo,
  type TradeHandlerDeps,
} from './trade-handlers';
import type { Trade, TradingStatus } from '../../lib/types';

// ============================================================
// Mocks
// ============================================================

function makeMockRepo(): TradeRepo {
  return {
    create: vi.fn().mockResolvedValue(42),
    finalize: vi.fn().mockResolvedValue({ updated: true, trade: { exitTime: 1000 } }),
    getBySession: vi.fn().mockResolvedValue([]),
    getRecent: vi.fn().mockResolvedValue([]),
  };
}

function makeDeps(overrides: Partial<TradeHandlerDeps> = {}): TradeHandlerDeps {
  return {
    tradeRepo: makeMockRepo(),
    tradingStatus: { isRunning: true, sessionId: 1, currentTicker: 'EURUSD' },
    broadcast: vi.fn(),
    ...overrides,
  };
}

// ============================================================
// handleTradeExecuted
// ============================================================

describe('handleTradeExecuted', () => {
  it('should skip DB write when execution failed (result=false)', async () => {
    const deps = makeDeps();
    const result = await handleTradeExecuted(
      { signalId: 'sig1', result: false, timestamp: 1000, error: 'fail' },
      deps,
    );
    expect(result.success).toBe(false);
    expect(result.ignored).toBe(true);
    expect(deps.tradeRepo.create).not.toHaveBeenCalled();
  });

  it('should create trade in DB and broadcast TRADE_LOGGED', async () => {
    const deps = makeDeps();
    const result = await handleTradeExecuted(
      {
        signalId: 'sig1',
        result: true,
        timestamp: 5000,
        direction: 'CALL',
        amount: 10,
        ticker: 'BTCUSDT',
        entryPrice: 50000,
      },
      deps,
    );

    expect(result.success).toBe(true);
    expect(result.tradeId).toBe(42);
    expect(deps.tradeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'BTCUSDT',
        direction: 'CALL',
        entryPrice: 50000,
        amount: 10,
        result: 'PENDING',
      }),
    );
    expect(deps.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TRADE_LOGGED',
        payload: expect.objectContaining({ id: 42, ticker: 'BTCUSDT' }),
      }),
    );
  });

  it('should use tradingStatus fallbacks for missing fields', async () => {
    const deps = makeDeps({
      tradingStatus: { isRunning: true, sessionId: 7, currentTicker: 'GBPJPY' },
    });
    await handleTradeExecuted({ result: true, timestamp: 1000 }, deps);

    expect(deps.tradeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 7,
        ticker: 'GBPJPY',
        direction: 'CALL',
        entryPrice: 0,
        amount: 0,
      }),
    );
  });
});

// ============================================================
// handleFinalizeTrade
// ============================================================

describe('handleFinalizeTrade', () => {
  it('should finalize trade and broadcast TRADE_SETTLED', async () => {
    const deps = makeDeps();
    const result = await handleFinalizeTrade(
      { tradeId: 42, exitPrice: 1.1234, result: 'WIN', profit: 9.2 },
      deps,
    );

    expect(result.success).toBe(true);
    expect(deps.tradeRepo.finalize).toHaveBeenCalledWith(42, 1.1234, 'WIN', 9.2);
    expect(deps.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TRADE_SETTLED',
        payload: expect.objectContaining({ tradeId: 42, result: 'WIN', profit: 9.2 }),
      }),
    );
  });

  it('should skip broadcast when trade is already finalized (idempotent)', async () => {
    const repo = makeMockRepo();
    (repo.finalize as ReturnType<typeof vi.fn>).mockResolvedValue({ updated: false });
    const deps = makeDeps({ tradeRepo: repo });

    const result = await handleFinalizeTrade(
      { tradeId: 42, exitPrice: 1.1234, result: 'WIN', profit: 9.2 },
      deps,
    );

    expect(result.success).toBe(true);
    expect(deps.broadcast).not.toHaveBeenCalled();
  });
});

// ============================================================
// handleGetTrades
// ============================================================

describe('handleGetTrades', () => {
  it('should get trades by session when sessionId is provided', async () => {
    const deps = makeDeps();
    await handleGetTrades({ sessionId: 5 }, deps);
    expect(deps.tradeRepo.getBySession).toHaveBeenCalledWith(5);
  });

  it('should get recent trades when sessionId is not provided', async () => {
    const deps = makeDeps();
    await handleGetTrades({ limit: 20 }, deps);
    expect(deps.tradeRepo.getRecent).toHaveBeenCalledWith(20);
  });

  it('should default to limit 50', async () => {
    const deps = makeDeps();
    await handleGetTrades({}, deps);
    expect(deps.tradeRepo.getRecent).toHaveBeenCalledWith(50);
  });
});
