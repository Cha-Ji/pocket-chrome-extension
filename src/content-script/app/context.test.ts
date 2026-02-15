import { describe, it, expect } from 'vitest'
import { createContext, DEFAULT_CONFIG, TRADE_COOLDOWN_MS, SETTLEMENT_GRACE_MS } from './context'

describe('ContentScriptContext', () => {
  it('should create context with all null module instances', () => {
    const ctx = createContext()
    expect(ctx.dataCollector).toBeNull()
    expect(ctx.tradeExecutor).toBeNull()
    expect(ctx.candleCollector).toBeNull()
    expect(ctx.payoutMonitor).toBeNull()
    expect(ctx.indicatorReader).toBeNull()
    expect(ctx.signalGenerator).toBeNull()
    expect(ctx.telegramService).toBeNull()
    expect(ctx.wsInterceptor).toBeNull()
  })

  it('should create context with default state flags', () => {
    const ctx = createContext()
    expect(ctx.isInitialized).toBe(false)
    expect(ctx.isExecutingTrade).toBe(false)
    expect(ctx.lastTradeExecutedAt).toBe(0)
  })

  it('should create context with DEFAULT_CONFIG as trading config', () => {
    const ctx = createContext()
    expect(ctx.tradingConfig).toEqual(DEFAULT_CONFIG)
    expect(ctx.tradingConfig.enabled).toBe(false)
    expect(ctx.tradingConfig.minPayout).toBe(92)
    expect(ctx.tradingConfig.tradeAmount).toBe(10)
    expect(ctx.tradingConfig.onlyRSI).toBe(true)
  })

  it('should create context with empty pendingTrades map', () => {
    const ctx = createContext()
    expect(ctx.pendingTrades).toBeInstanceOf(Map)
    expect(ctx.pendingTrades.size).toBe(0)
  })

  it('should create independent context instances (no shared state)', () => {
    const ctx1 = createContext()
    const ctx2 = createContext()

    ctx1.isInitialized = true
    ctx1.tradingConfig.enabled = true
    ctx1.pendingTrades.set(1, {} as any)

    expect(ctx2.isInitialized).toBe(false)
    expect(ctx2.tradingConfig.enabled).toBe(false)
    expect(ctx2.pendingTrades.size).toBe(0)
  })

  it('should export correct constants', () => {
    expect(TRADE_COOLDOWN_MS).toBe(3000)
    expect(SETTLEMENT_GRACE_MS).toBe(800)
  })
})
