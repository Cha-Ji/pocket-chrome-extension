import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createContext, ContentScriptContext } from './context'
import { handleMessage, getSystemStatus } from './message-handler'

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  },
})

describe('message-handler', () => {
  let ctx: ContentScriptContext

  beforeEach(() => {
    ctx = createContext()
  })

  describe('getSystemStatus', () => {
    it('should return status with all modules null', () => {
      const status = getSystemStatus(ctx) as any
      expect(status.initialized).toBe(false)
      expect(status.modules.dataCollector).toBe(false)
      expect(status.modules.candleCollector).toBe(false)
      expect(status.modules.payoutMonitor).toBe(false)
      expect(status.modules.indicatorReader).toBe(false)
      expect(status.modules.wsInterceptor).toBeNull()
      expect(status.config).toEqual(ctx.tradingConfig)
      expect(status.highPayoutAssets).toBe(0)
      expect(status.candleCount).toEqual([])
    })

    it('should reflect initialized state', () => {
      ctx.isInitialized = true
      const status = getSystemStatus(ctx) as any
      expect(status.initialized).toBe(true)
    })
  })

  describe('handleMessage', () => {
    it('should handle GET_STATUS_V2', async () => {
      const result = await handleMessage(ctx, { type: 'GET_STATUS_V2' } as any)
      expect(result).toHaveProperty('initialized')
      expect(result).toHaveProperty('modules')
      expect(result).toHaveProperty('config')
    })

    it('should handle SET_CONFIG_V2', async () => {
      const result = await handleMessage(ctx, { type: 'SET_CONFIG_V2', payload: { tradeAmount: 25 } } as any) as any
      expect(result.success).toBe(true)
      expect(result.config.tradeAmount).toBe(25)
      expect(ctx.tradingConfig.tradeAmount).toBe(25)
    })

    it('should handle START_TRADING_V2', async () => {
      expect(ctx.tradingConfig.enabled).toBe(false)
      const result = await handleMessage(ctx, { type: 'START_TRADING_V2' } as any) as any
      expect(result.success).toBe(true)
      expect(ctx.tradingConfig.enabled).toBe(true)
    })

    it('should handle STOP_TRADING_V2', async () => {
      ctx.tradingConfig.enabled = true
      const result = await handleMessage(ctx, { type: 'STOP_TRADING_V2' } as any) as any
      expect(result.success).toBe(true)
      expect(ctx.tradingConfig.enabled).toBe(false)
    })

    it('should handle GET_SIGNALS with signalGenerator', async () => {
      const mockSignals = [{ id: 'sig-1', direction: 'CALL' }]
      ctx.signalGenerator = { getSignals: vi.fn().mockReturnValue(mockSignals) } as any
      const result = await handleMessage(ctx, { type: 'GET_SIGNALS', payload: { limit: 5 } } as any)
      expect(ctx.signalGenerator!.getSignals).toHaveBeenCalledWith(5)
      expect(result).toEqual(mockSignals)
    })

    it('should handle GET_SIGNALS without signalGenerator', async () => {
      ctx.signalGenerator = null
      const result = await handleMessage(ctx, { type: 'GET_SIGNALS', payload: { limit: 5 } } as any)
      expect(result).toEqual([])
    })

    it('should handle GET_HIGH_PAYOUT_ASSETS', async () => {
      const assets = [{ name: 'EURUSD', payout: 95 }]
      ctx.payoutMonitor = { getHighPayoutAssets: vi.fn().mockReturnValue(assets) } as any
      const result = await handleMessage(ctx, { type: 'GET_HIGH_PAYOUT_ASSETS' } as any)
      expect(result).toEqual(assets)
    })

    it('should return null for unknown message type', async () => {
      const result = await handleMessage(ctx, { type: 'UNKNOWN_TYPE' } as any)
      expect(result).toBeNull()
    })
  })
})
