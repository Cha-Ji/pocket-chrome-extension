import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTrades } from './useTrades'
import type { Trade, ExtensionMessage } from '../../lib/types'

// --- chrome.runtime mock ---
type MessageListener = (message: ExtensionMessage) => void
let messageListeners: MessageListener[] = []
const mockSendMessage = vi.fn()

const chromeMock = {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: (fn: MessageListener) => { messageListeners.push(fn) },
      removeListener: (fn: MessageListener) => {
        messageListeners = messageListeners.filter(l => l !== fn)
      },
    },
  },
}

vi.stubGlobal('chrome', chromeMock)

function simulateMessage(message: ExtensionMessage) {
  for (const listener of messageListeners) {
    listener(message)
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
})

describe('useTrades', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    messageListeners = []
  })

  afterEach(() => {
    messageListeners = []
  })

  it('should load trades from DB on mount via GET_TRADES', async () => {
    const dbTrades = [makeTrade({ id: 1 }), makeTrade({ id: 2, ticker: 'GBPUSD' })]
    mockSendMessage.mockResolvedValueOnce(dbTrades)

    const { result } = renderHook(() => useTrades())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'GET_TRADES',
      payload: { limit: 50 },
    })
    expect(result.current.trades).toEqual(dbTrades)
  })

  it('should handle GET_TRADES failure gracefully', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('No background'))

    const { result } = renderHook(() => useTrades())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.trades).toEqual([])
  })

  it('should append trade on TRADE_LOGGED message', async () => {
    mockSendMessage.mockResolvedValueOnce([])

    const { result } = renderHook(() => useTrades())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const newTrade = makeTrade({ id: 10, ticker: 'BTCUSD' })

    act(() => {
      simulateMessage({ type: 'TRADE_LOGGED', payload: newTrade })
    })

    expect(result.current.trades).toHaveLength(1)
    expect(result.current.trades[0]).toEqual(newTrade)
  })

  it('should deduplicate trades by id', async () => {
    const existing = makeTrade({ id: 5 })
    mockSendMessage.mockResolvedValueOnce([existing])

    const { result } = renderHook(() => useTrades())

    await waitFor(() => {
      expect(result.current.trades).toHaveLength(1)
    })

    // Send same id again
    act(() => {
      simulateMessage({ type: 'TRADE_LOGGED', payload: existing })
    })

    expect(result.current.trades).toHaveLength(1)
  })

  it('should not react to TRADE_EXECUTED messages (old path)', async () => {
    mockSendMessage.mockResolvedValueOnce([])

    const { result } = renderHook(() => useTrades())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    act(() => {
      simulateMessage({
        type: 'TRADE_EXECUTED',
        payload: { signalId: 'sig-1', timestamp: Date.now() },
      })
    })

    expect(result.current.trades).toHaveLength(0)
  })

  it('should expose refetch to reload trades from DB', async () => {
    mockSendMessage.mockResolvedValueOnce([])

    const { result } = renderHook(() => useTrades())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const updatedTrades = [makeTrade({ id: 1, result: 'WIN', profit: 92 })]
    mockSendMessage.mockResolvedValueOnce(updatedTrades)

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.trades).toEqual(updatedTrades)
  })

  it('should receive full Trade object without casting from TRADE_LOGGED', async () => {
    mockSendMessage.mockResolvedValueOnce([])

    const { result } = renderHook(() => useTrades())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const fullTrade = makeTrade({
      id: 20,
      sessionId: 3,
      ticker: 'EURUSD',
      direction: 'PUT',
      entryTime: 1700000000000,
      entryPrice: 1.0500,
      result: 'PENDING',
      amount: 50,
    })

    act(() => {
      simulateMessage({ type: 'TRADE_LOGGED', payload: fullTrade })
    })

    const trade = result.current.trades[0]
    // All Trade fields are present — no undefined from missing fields
    expect(trade.id).toBe(20)
    expect(trade.sessionId).toBe(3)
    expect(trade.ticker).toBe('EURUSD')
    expect(trade.direction).toBe('PUT')
    expect(trade.entryTime).toBe(1700000000000)
    expect(trade.entryPrice).toBe(1.05)
    expect(trade.result).toBe('PENDING')
    expect(trade.amount).toBe(50)
  })
})
