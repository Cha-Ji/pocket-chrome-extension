import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTrades } from './useTrades';
import type { Trade, ExtensionMessage } from '../../lib/types';

// --- chrome.runtime mock ---
type MessageListener = (message: ExtensionMessage) => void;
let messageListeners: MessageListener[] = [];
const mockSendMessage = vi.fn();

// --- Port mock ---
type PortMessageHandler = (msg: { type: string; payload?: unknown }) => void;
let portMessageHandlers: PortMessageHandler[] = [];
const mockPort = {
  onMessage: {
    addListener: (fn: PortMessageHandler) => {
      portMessageHandlers.push(fn);
    },
    removeListener: (fn: PortMessageHandler) => {
      portMessageHandlers = portMessageHandlers.filter((l) => l !== fn);
    },
  },
  onDisconnect: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  postMessage: vi.fn(),
  disconnect: vi.fn(),
  name: 'side-panel',
};

const chromeMock = {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: (fn: MessageListener) => {
        messageListeners.push(fn);
      },
      removeListener: (fn: MessageListener) => {
        messageListeners = messageListeners.filter((l) => l !== fn);
      },
    },
    connect: vi.fn(() => mockPort),
  },
};

vi.stubGlobal('chrome', chromeMock);

function simulatePortMessage(msg: { type: string; payload?: unknown }) {
  for (const handler of portMessageHandlers) {
    handler(msg);
  }
}

const makeTrade = (overrides: Partial<Trade> = {}): Trade => ({
  id: 1,
  sessionId: 0,
  ticker: 'EURUSD',
  direction: 'CALL',
  entryTime: 1700000000000,
  entryPrice: 1.1234,
  result: 'PENDING',
  amount: 100,
  ...overrides,
});

describe('useTrades', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageListeners = [];
    portMessageHandlers = [];
  });

  afterEach(() => {
    messageListeners = [];
    portMessageHandlers = [];
  });

  it('should load trades from DB on mount via GET_TRADES', async () => {
    const dbTrades = [makeTrade({ id: 1 }), makeTrade({ id: 2, ticker: 'GBPUSD' })];
    mockSendMessage.mockResolvedValueOnce(dbTrades);

    const { result } = renderHook(() => useTrades());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'GET_TRADES',
      payload: { limit: 200 },
    });
    expect(result.current.trades).toHaveLength(2);
  });

  it('should handle GET_TRADES failure gracefully', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('No background'));

    const { result } = renderHook(() => useTrades());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.trades).toEqual([]);
  });

  it('should upsert trade on TRADE_LOGGED via port', async () => {
    mockSendMessage.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useTrades());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const newTrade = makeTrade({ id: 10, ticker: 'BTCUSD' });

    act(() => {
      simulatePortMessage({ type: 'TRADE_LOGGED', payload: newTrade });
    });

    expect(result.current.trades).toHaveLength(1);
    expect(result.current.trades[0]).toMatchObject({ id: 10, ticker: 'BTCUSD', result: 'PENDING' });
  });

  it('should deduplicate trades by id (idempotent upsert)', async () => {
    const existing = makeTrade({ id: 5 });
    mockSendMessage.mockResolvedValueOnce([existing]);

    const { result } = renderHook(() => useTrades());

    await waitFor(() => {
      expect(result.current.trades).toHaveLength(1);
    });

    // Send same id again
    act(() => {
      simulatePortMessage({ type: 'TRADE_LOGGED', payload: existing });
    });

    expect(result.current.trades).toHaveLength(1);
  });

  it('should update trade on TRADE_SETTLED via port', async () => {
    const pendingTrade = makeTrade({ id: 7, result: 'PENDING' });
    mockSendMessage.mockResolvedValueOnce([pendingTrade]);

    const { result } = renderHook(() => useTrades());

    await waitFor(() => {
      expect(result.current.trades).toHaveLength(1);
    });

    act(() => {
      simulatePortMessage({
        type: 'TRADE_SETTLED',
        payload: {
          tradeId: 7,
          result: 'WIN',
          exitPrice: 1.13,
          profit: 92,
          exitTime: 1700000060000,
        },
      });
    });

    expect(result.current.trades).toHaveLength(1);
    expect(result.current.trades[0].result).toBe('WIN');
    expect(result.current.trades[0].exitPrice).toBe(1.13);
    expect(result.current.trades[0].profit).toBe(92);
    expect(result.current.trades[0].exitTime).toBe(1700000060000);
  });

  it('should handle TRADE_SETTLED arriving before TRADE_LOGGED (out-of-order)', async () => {
    mockSendMessage.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useTrades());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Settlement arrives first → creates stub
    act(() => {
      simulatePortMessage({
        type: 'TRADE_SETTLED',
        payload: {
          tradeId: 99,
          result: 'LOSS',
          exitPrice: 1.05,
          profit: -100,
          exitTime: 1700000060000,
        },
      });
    });

    expect(result.current.trades).toHaveLength(1);
    expect(result.current.trades[0].result).toBe('LOSS');
    expect(result.current.trades[0].id).toBe(99);

    // Now the LOGGED message arrives → merges
    act(() => {
      simulatePortMessage({
        type: 'TRADE_LOGGED',
        payload: makeTrade({
          id: 99,
          ticker: 'GBPUSD',
          entryTime: 1700000000000,
          entryPrice: 1.06,
          amount: 100,
        }),
      });
    });

    // Still one trade — merged, not duplicated
    expect(result.current.trades).toHaveLength(1);
    expect(result.current.trades[0].ticker).toBe('GBPUSD');
    expect(result.current.trades[0].result).toBe('LOSS');
    expect(result.current.trades[0].profit).toBe(-100);
  });

  it('should handle duplicate TRADE_SETTLED without side effects', async () => {
    const pendingTrade = makeTrade({ id: 11, result: 'PENDING' });
    mockSendMessage.mockResolvedValueOnce([pendingTrade]);

    const { result } = renderHook(() => useTrades());

    await waitFor(() => {
      expect(result.current.trades).toHaveLength(1);
    });

    const settledPayload = {
      type: 'TRADE_SETTLED',
      payload: {
        tradeId: 11,
        result: 'WIN' as const,
        exitPrice: 1.13,
        profit: 92,
        exitTime: 1700000060000,
      },
    };

    // Send settlement twice
    act(() => {
      simulatePortMessage(settledPayload);
      simulatePortMessage(settledPayload);
    });

    expect(result.current.trades).toHaveLength(1);
    expect(result.current.trades[0].result).toBe('WIN');
  });

  it('should expose refetch to reload trades from DB', async () => {
    mockSendMessage.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useTrades());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const updatedTrades = [makeTrade({ id: 1, result: 'WIN', profit: 92 })];
    mockSendMessage.mockResolvedValueOnce(updatedTrades);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.trades).toEqual(updatedTrades);
  });
});
