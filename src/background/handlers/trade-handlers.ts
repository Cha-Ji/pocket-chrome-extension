// ============================================================
// Background Trade Handlers (extracted for testability)
// ============================================================
// Pure-ish functions that handle trade-related messages.
// Dependencies are injected via the Deps interface.
// ============================================================

import type { MessagePayloadMap, Trade, TradingStatus } from '../../lib/types';

/** Minimal repository interface for testing */
export interface TradeRepo {
  create(trade: Omit<Trade, 'id'>): Promise<number>;
  finalize(
    tradeId: number,
    exitPrice: number,
    result: string,
    profit: number,
  ): Promise<{ updated: boolean; trade?: Trade }>;
  getBySession(sessionId: number): Promise<Trade[]>;
  getRecent(limit: number): Promise<Trade[]>;
}

/** Dependencies injected by background/index.ts */
export interface TradeHandlerDeps {
  tradeRepo: TradeRepo;
  tradingStatus: TradingStatus;
  broadcast: (message: { type: string; payload?: unknown }) => void;
}

// ============================================================
// TRADE_EXECUTED handler
// ============================================================

export async function handleTradeExecuted(
  payload: MessagePayloadMap['TRADE_EXECUTED'],
  deps: TradeHandlerDeps,
): Promise<{ success: boolean; tradeId?: number; ignored?: boolean }> {
  // Skip failed executions
  if (payload.result === false) {
    return { success: false, ignored: true };
  }

  const trade: Omit<Trade, 'id'> = {
    sessionId: deps.tradingStatus.sessionId ?? 0,
    ticker: payload.ticker ?? deps.tradingStatus.currentTicker ?? 'unknown',
    direction: payload.direction ?? 'CALL',
    entryTime: payload.timestamp,
    entryPrice: payload.entryPrice ?? 0,
    result: 'PENDING',
    amount: payload.amount ?? 0,
  };

  const id = await deps.tradeRepo.create(trade);

  // Broadcast TRADE_LOGGED to UI
  const savedTrade: Trade = { ...trade, id };
  deps.broadcast({ type: 'TRADE_LOGGED', payload: savedTrade });

  return { success: true, tradeId: id };
}

// ============================================================
// FINALIZE_TRADE handler
// ============================================================

export async function handleFinalizeTrade(
  payload: MessagePayloadMap['FINALIZE_TRADE'],
  deps: TradeHandlerDeps,
): Promise<{ success: boolean }> {
  const finalizeResult = await deps.tradeRepo.finalize(
    payload.tradeId,
    payload.exitPrice,
    payload.result,
    payload.profit,
  );

  // Idempotency: if already finalized, skip broadcast
  if (!finalizeResult.updated) {
    return { success: true };
  }

  const exitTime = finalizeResult.trade?.exitTime ?? Date.now();
  deps.broadcast({
    type: 'TRADE_SETTLED',
    payload: {
      tradeId: payload.tradeId,
      signalId: payload.signalId,
      result: payload.result,
      exitPrice: payload.exitPrice,
      profit: payload.profit,
      exitTime,
    },
  });

  return { success: true };
}

// ============================================================
// GET_TRADES handler
// ============================================================

export async function handleGetTrades(
  payload: { sessionId?: number; limit?: number },
  deps: TradeHandlerDeps,
): Promise<Trade[]> {
  if (payload.sessionId !== undefined) {
    return deps.tradeRepo.getBySession(payload.sessionId);
  }
  return deps.tradeRepo.getRecent(payload.limit ?? 50);
}
