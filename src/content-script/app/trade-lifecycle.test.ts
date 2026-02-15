import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createContext, ContentScriptContext, TRADE_COOLDOWN_MS } from './context'
import { handleNewSignal, executeSignal, scheduleSettlement, settleTrade } from './trade-lifecycle'
import { Signal } from '../../lib/signals/types'

// Mock chrome.runtime.sendMessage
const mockSendMessage = vi.fn().mockResolvedValue({ success: true, tradeId: 42 })
vi.stubGlobal('chrome', {
  runtime: { sendMessage: mockSendMessage },
})

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-1',
    timestamp: Date.now(),
    symbol: 'EURUSD_OTC',
    direction: 'CALL',
    strategyId: 'RSI+BB',
    strategy: 'RSI Bounce',
    regime: 'ranging',
    confidence: 0.7,
    expiry: 60,
    entryPrice: 1.1234,
    indicators: {},
    status: 'pending',
    ...overrides,
  }
}

describe('trade-lifecycle', () => {
  let ctx: ContentScriptContext

  beforeEach(() => {
    ctx = createContext()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Clear pending trade timers
    for (const pending of ctx.pendingTrades.values()) {
      clearTimeout(pending.timerId)
    }
    vi.useRealTimers()
  })

  describe('handleNewSignal', () => {
    it('should skip if trading is disabled', async () => {
      ctx.tradingConfig.enabled = false
      await handleNewSignal(ctx, makeSignal())
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should skip if current payout is unavailable', async () => {
      ctx.tradingConfig.enabled = true
      ctx.payoutMonitor = { getCurrentAssetPayout: () => null } as any
      await handleNewSignal(ctx, makeSignal())
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should skip if payout below minPayout', async () => {
      ctx.tradingConfig.enabled = true
      ctx.tradingConfig.minPayout = 92
      ctx.payoutMonitor = { getCurrentAssetPayout: () => ({ name: 'EURUSD_OTC', payout: 85 }) } as any
      await handleNewSignal(ctx, makeSignal())
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should skip non-RSI strategy when onlyRSI is true', async () => {
      ctx.tradingConfig.enabled = true
      ctx.tradingConfig.onlyRSI = true
      ctx.payoutMonitor = { getCurrentAssetPayout: () => ({ name: 'EURUSD_OTC', payout: 95 }) } as any
      const signal = makeSignal({ strategyId: 'MACD-Cross', strategy: 'MACD Crossover' })
      await handleNewSignal(ctx, signal)
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should allow RSI strategy when onlyRSI is true', async () => {
      ctx.tradingConfig.enabled = true
      ctx.tradingConfig.onlyRSI = true
      ctx.payoutMonitor = { getCurrentAssetPayout: () => ({ name: 'EURUSD_OTC', payout: 95 }) } as any
      ctx.tradeExecutor = { executeTrade: vi.fn().mockResolvedValue({ success: true }) } as any
      ctx.candleCollector = { getLatestTickPrice: () => 1.1234 } as any
      await handleNewSignal(ctx, makeSignal({ strategyId: 'RSI+BB', strategy: 'RSI Bounce' }))
      expect(ctx.tradeExecutor!.executeTrade).toHaveBeenCalled()
    })

    it('should allow all strategies when onlyRSI is false and no strategyFilter', async () => {
      ctx.tradingConfig.enabled = true
      ctx.tradingConfig.onlyRSI = false
      ctx.payoutMonitor = { getCurrentAssetPayout: () => ({ name: 'EURUSD_OTC', payout: 95 }) } as any
      ctx.tradeExecutor = { executeTrade: vi.fn().mockResolvedValue({ success: true }) } as any
      ctx.candleCollector = { getLatestTickPrice: () => 1.1234 } as any
      await handleNewSignal(ctx, makeSignal({ strategyId: 'MACD-Cross', strategy: 'MACD Crossover' }))
      expect(ctx.tradeExecutor!.executeTrade).toHaveBeenCalled()
    })

    it('should use strategyFilter allowlist over legacy onlyRSI', async () => {
      ctx.tradingConfig.enabled = true
      ctx.tradingConfig.onlyRSI = true // legacy would block TIF-60
      ctx.tradingConfig.strategyFilter = { mode: 'allowlist', patterns: ['TIF-60'] }
      ctx.payoutMonitor = { getCurrentAssetPayout: () => ({ name: 'EURUSD_OTC', payout: 95 }) } as any
      ctx.tradeExecutor = { executeTrade: vi.fn().mockResolvedValue({ success: true }) } as any
      ctx.candleCollector = { getLatestTickPrice: () => 1.1234 } as any
      await handleNewSignal(ctx, makeSignal({ strategyId: 'TIF-60', strategy: 'Tick Imbalance Fade' }))
      expect(ctx.tradeExecutor!.executeTrade).toHaveBeenCalled()
    })

    it('should block strategy via denylist filter', async () => {
      ctx.tradingConfig.enabled = true
      ctx.tradingConfig.onlyRSI = false
      ctx.tradingConfig.strategyFilter = { mode: 'denylist', patterns: ['TIF-60'] }
      ctx.payoutMonitor = { getCurrentAssetPayout: () => ({ name: 'EURUSD_OTC', payout: 95 }) } as any
      const signal = makeSignal({ strategyId: 'TIF-60', strategy: 'Tick Imbalance Fade' })
      await handleNewSignal(ctx, signal)
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should block when isExecutingTrade is true (gate check)', async () => {
      ctx.tradingConfig.enabled = true
      ctx.tradingConfig.onlyRSI = false
      ctx.payoutMonitor = { getCurrentAssetPayout: () => ({ name: 'EURUSD_OTC', payout: 95 }) } as any
      ctx.isExecutingTrade = true
      await handleNewSignal(ctx, makeSignal())
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should block during cooldown period (gate check)', async () => {
      ctx.tradingConfig.enabled = true
      ctx.tradingConfig.onlyRSI = false
      ctx.payoutMonitor = { getCurrentAssetPayout: () => ({ name: 'EURUSD_OTC', payout: 95 }) } as any
      ctx.lastTradeExecutedAt = Date.now() - 500 // 500ms ago, cooldown is 3000ms
      await handleNewSignal(ctx, makeSignal())
      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('executeSignal', () => {
    it('should skip if tradeExecutor is null', async () => {
      ctx.tradeExecutor = null
      await executeSignal(ctx, makeSignal())
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should skip if already executing (race condition guard)', async () => {
      ctx.tradeExecutor = { executeTrade: vi.fn() } as any
      ctx.isExecutingTrade = true
      await executeSignal(ctx, makeSignal())
      expect(ctx.tradeExecutor!.executeTrade).not.toHaveBeenCalled()
    })

    it('should skip if within cooldown period', async () => {
      ctx.tradeExecutor = { executeTrade: vi.fn() } as any
      ctx.lastTradeExecutedAt = Date.now() - 1000 // 1s ago, cooldown is 3s
      await executeSignal(ctx, makeSignal())
      expect(ctx.tradeExecutor!.executeTrade).not.toHaveBeenCalled()
    })

    it('should reset isExecutingTrade after execution', async () => {
      ctx.tradeExecutor = { executeTrade: vi.fn().mockResolvedValue({ success: false, error: 'test' }) } as any
      ctx.lastTradeExecutedAt = 0
      await executeSignal(ctx, makeSignal())
      expect(ctx.isExecutingTrade).toBe(false)
    })

    it('should reset isExecutingTrade even on error', async () => {
      ctx.tradeExecutor = { executeTrade: vi.fn().mockRejectedValue(new Error('boom')) } as any
      ctx.lastTradeExecutedAt = 0
      await executeSignal(ctx, makeSignal())
      expect(ctx.isExecutingTrade).toBe(false)
    })
  })

  describe('scheduleSettlement', () => {
    it('should add trade to pendingTrades map', () => {
      scheduleSettlement(ctx, {
        tradeId: 1,
        ticker: 'EURUSD_OTC',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
      })
      expect(ctx.pendingTrades.size).toBe(1)
      expect(ctx.pendingTrades.has(1)).toBe(true)
    })

    it('should set timer for expiry + grace period', () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout')
      scheduleSettlement(ctx, {
        tradeId: 2,
        ticker: 'EURUSD_OTC',
        direction: 'PUT',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
      })
      // 60*1000 + 800 = 60800ms
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60800)
    })
  })

  describe('settleTrade', () => {
    it('should do nothing if tradeId not in pendingTrades', async () => {
      await settleTrade(ctx, 999)
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should determine WIN for CALL when exit > entry', async () => {
      ctx.candleCollector = { getLatestTickPrice: () => 1.1300 } as any
      ctx.pendingTrades.set(1, {
        tradeId: 1,
        ticker: 'EURUSD_OTC',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
        timerId: setTimeout(() => {}, 0),
      })

      await settleTrade(ctx, 1)
      const call = mockSendMessage.mock.calls[0][0]
      expect(call.type).toBe('FINALIZE_TRADE')
      expect(call.payload.result).toBe('WIN')
      expect(call.payload.profit).toBeCloseTo(9.2, 5)
      expect(ctx.pendingTrades.size).toBe(0)
    })

    it('should determine LOSS for CALL when exit < entry', async () => {
      ctx.candleCollector = { getLatestTickPrice: () => 1.1200 } as any
      ctx.pendingTrades.set(2, {
        tradeId: 2,
        ticker: 'EURUSD_OTC',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
        timerId: setTimeout(() => {}, 0),
      })

      await settleTrade(ctx, 2)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FINALIZE_TRADE',
          payload: expect.objectContaining({ result: 'LOSS', profit: -10 }),
        })
      )
    })

    it('should determine WIN for PUT when exit < entry', async () => {
      ctx.candleCollector = { getLatestTickPrice: () => 1.1200 } as any
      ctx.pendingTrades.set(3, {
        tradeId: 3,
        ticker: 'EURUSD_OTC',
        direction: 'PUT',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
        timerId: setTimeout(() => {}, 0),
      })

      await settleTrade(ctx, 3)
      const call = mockSendMessage.mock.calls[0][0]
      expect(call.type).toBe('FINALIZE_TRADE')
      expect(call.payload.result).toBe('WIN')
      expect(call.payload.profit).toBeCloseTo(9.2, 5)
    })

    it('should determine TIE when exit == entry', async () => {
      ctx.candleCollector = { getLatestTickPrice: () => 1.1234 } as any
      ctx.pendingTrades.set(4, {
        tradeId: 4,
        ticker: 'EURUSD_OTC',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
        timerId: setTimeout(() => {}, 0),
      })

      await settleTrade(ctx, 4)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FINALIZE_TRADE',
          payload: expect.objectContaining({ result: 'TIE', profit: 0 }),
        })
      )
    })

    it('should default to LOSS when exitPrice is 0', async () => {
      ctx.candleCollector = { getLatestTickPrice: () => 0 } as any
      ctx.pendingTrades.set(5, {
        tradeId: 5,
        ticker: 'EURUSD_OTC',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
        timerId: setTimeout(() => {}, 0),
      })

      await settleTrade(ctx, 5)
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FINALIZE_TRADE',
          payload: expect.objectContaining({ result: 'LOSS', profit: -10 }),
        })
      )
    })

    it('should clear timer and remove entry from pendingTrades (P0-3 leak fix)', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      const timerId = setTimeout(() => {}, 99999)
      ctx.candleCollector = { getLatestTickPrice: () => 1.1300 } as any
      ctx.pendingTrades.set(10, {
        tradeId: 10,
        ticker: 'EURUSD_OTC',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
        timerId,
      })

      await settleTrade(ctx, 10)

      expect(ctx.pendingTrades.has(10)).toBe(false)
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId)
    })

    it('should be idempotent — second call is a no-op (P0-3)', async () => {
      ctx.candleCollector = { getLatestTickPrice: () => 1.1300 } as any
      ctx.pendingTrades.set(11, {
        tradeId: 11,
        ticker: 'EURUSD_OTC',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
        timerId: setTimeout(() => {}, 0),
      })

      await settleTrade(ctx, 11)
      expect(mockSendMessage).toHaveBeenCalledTimes(1)

      // Second call — should be no-op
      mockSendMessage.mockClear()
      await settleTrade(ctx, 11)
      expect(mockSendMessage).not.toHaveBeenCalled()
      expect(ctx.pendingTrades.size).toBe(0)
    })

    it('should update signalGenerator result if signalId provided', async () => {
      const updateSignalResult = vi.fn()
      ctx.signalGenerator = { updateSignalResult } as any
      ctx.candleCollector = { getLatestTickPrice: () => 1.1300 } as any
      ctx.pendingTrades.set(6, {
        tradeId: 6,
        signalId: 'sig-abc',
        ticker: 'EURUSD_OTC',
        direction: 'CALL',
        entryTime: Date.now(),
        entryPrice: 1.1234,
        expirySeconds: 60,
        amount: 10,
        payoutPercent: 92,
        timerId: setTimeout(() => {}, 0),
      })

      await settleTrade(ctx, 6)
      expect(updateSignalResult).toHaveBeenCalledWith('sig-abc', 'win')
    })
  })
})
