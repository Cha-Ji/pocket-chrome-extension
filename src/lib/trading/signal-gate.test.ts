import { describe, it, expect } from 'vitest'
import { evaluateSignalGates, resolveStrategyFilter, type GateContext } from './signal-gate'
import type { TradingConfigV2 } from '../types'

// ============================================================
// Helper: create a valid GateContext with sane defaults
// ============================================================

function makeConfig(overrides: Partial<TradingConfigV2> = {}): TradingConfigV2 {
  return {
    enabled: true,
    autoAssetSwitch: true,
    minPayout: 92,
    tradeAmount: 10,
    maxDrawdown: 20,
    maxConsecutiveLosses: 5,
    onlyRSI: false,
    ...overrides,
  }
}

function makeCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    config: makeConfig(),
    currentPayout: { payout: 95, name: 'EURUSD-OTC' },
    strategyId: 'RSI-BB',
    strategyName: 'RSI+BB Bounce',
    isExecuting: false,
    lastTradeAt: 0,
    cooldownMs: 3000,
    now: 10000,
    ...overrides,
  }
}

// ============================================================
// Tests
// ============================================================

describe('evaluateSignalGates', () => {
  describe('Gate 1: enabled', () => {
    it('should reject when trading is disabled', () => {
      const result = evaluateSignalGates(
        makeCtx({ config: makeConfig({ enabled: false }) }),
      )
      expect(result.allowed).toBe(false)
      expect(result.gate).toBe('disabled')
    })

    it('should pass when trading is enabled', () => {
      const result = evaluateSignalGates(makeCtx())
      expect(result.allowed).toBe(true)
    })
  })

  describe('Gate 2: payout', () => {
    it('should reject when payout is null (unknown)', () => {
      const result = evaluateSignalGates(
        makeCtx({ currentPayout: null }),
      )
      expect(result.allowed).toBe(false)
      expect(result.gate).toBe('payout')
      expect(result.reason).toContain('Cannot determine')
    })

    it('should reject when payout is below minimum', () => {
      const result = evaluateSignalGates(
        makeCtx({ currentPayout: { payout: 88, name: 'GBPJPY' } }),
      )
      expect(result.allowed).toBe(false)
      expect(result.gate).toBe('payout')
      expect(result.reason).toContain('88%')
    })

    it('should pass when payout meets minimum', () => {
      const result = evaluateSignalGates(
        makeCtx({ currentPayout: { payout: 92, name: 'EURUSD-OTC' } }),
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('Gate 3: strategy filter', () => {
    it('should reject when strategy not in allowlist', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({
            strategyFilter: { mode: 'allowlist', patterns: ['SBB-120'] },
          }),
          strategyId: 'RSI-BB',
          strategyName: 'RSI+BB Bounce',
        }),
      )
      expect(result.allowed).toBe(false)
      expect(result.gate).toBe('strategy')
      expect(result.reason).toContain('not in allowlist')
    })

    it('should pass when strategy IS in allowlist', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({
            strategyFilter: { mode: 'allowlist', patterns: ['RSI'] },
          }),
          strategyId: 'RSI-BB',
          strategyName: 'RSI+BB Bounce',
        }),
      )
      expect(result.allowed).toBe(true)
    })

    it('should reject when strategy is in denylist', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({
            strategyFilter: { mode: 'denylist', patterns: ['TIF-60'] },
          }),
          strategyId: 'TIF-60',
          strategyName: 'Tick Imbalance Fade',
        }),
      )
      expect(result.allowed).toBe(false)
      expect(result.gate).toBe('strategy')
      expect(result.reason).toContain('denylist')
    })

    it('should pass when strategy is NOT in denylist', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({
            strategyFilter: { mode: 'denylist', patterns: ['TIF-60'] },
          }),
          strategyId: 'RSI-BB',
          strategyName: 'RSI+BB Bounce',
        }),
      )
      expect(result.allowed).toBe(true)
    })

    it('should pass all strategies when mode is all', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({
            strategyFilter: { mode: 'all', patterns: [] },
          }),
          strategyId: 'ANY-STRATEGY',
          strategyName: 'Anything',
        }),
      )
      expect(result.allowed).toBe(true)
    })

    it('should match patterns case-insensitively', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({
            strategyFilter: { mode: 'allowlist', patterns: ['rsi'] },
          }),
          strategyId: 'RSI-BB',
          strategyName: 'RSI+BB Bounce',
        }),
      )
      expect(result.allowed).toBe(true)
    })

    it('should match against strategyName as well', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({
            strategyFilter: { mode: 'allowlist', patterns: ['Bounce'] },
          }),
          strategyId: 'RSI-BB',
          strategyName: 'RSI+BB Bounce',
        }),
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('Gate 3 (legacy): onlyRSI fallback', () => {
    it('should reject non-RSI when onlyRSI=true and no strategyFilter', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({ onlyRSI: true }),
          strategyId: 'SBB-120',
          strategyName: 'Squeeze Bollinger',
        }),
      )
      expect(result.allowed).toBe(false)
      expect(result.gate).toBe('strategy')
    })

    it('should pass RSI strategy when onlyRSI=true', () => {
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({ onlyRSI: true }),
          strategyId: 'RSI-BB',
          strategyName: 'RSI+BB Bounce',
        }),
      )
      expect(result.allowed).toBe(true)
    })

    it('should ignore onlyRSI when strategyFilter is set', () => {
      // strategyFilter takes precedence
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({
            onlyRSI: true,
            strategyFilter: { mode: 'all', patterns: [] },
          }),
          strategyId: 'SBB-120',
          strategyName: 'Squeeze Bollinger',
        }),
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('Gate 4: executing', () => {
    it('should reject when a trade is already executing', () => {
      const result = evaluateSignalGates(
        makeCtx({ isExecuting: true }),
      )
      expect(result.allowed).toBe(false)
      expect(result.gate).toBe('executing')
    })
  })

  describe('Gate 5: cooldown', () => {
    it('should reject when within cooldown period', () => {
      const result = evaluateSignalGates(
        makeCtx({ lastTradeAt: 9000, cooldownMs: 3000, now: 10000 }),
      )
      expect(result.allowed).toBe(false)
      expect(result.gate).toBe('cooldown')
      expect(result.reason).toContain('2000ms remaining')
    })

    it('should pass when cooldown has elapsed', () => {
      const result = evaluateSignalGates(
        makeCtx({ lastTradeAt: 5000, cooldownMs: 3000, now: 10000 }),
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('gate ordering', () => {
    it('should check gates in order: disabled > payout > strategy > executing > cooldown', () => {
      // All gates would fail — first gate (disabled) should be the one reported
      const result = evaluateSignalGates(
        makeCtx({
          config: makeConfig({ enabled: false, minPayout: 99 }),
          currentPayout: { payout: 50, name: 'TEST' },
          isExecuting: true,
          lastTradeAt: 9999,
          now: 10000,
          cooldownMs: 3000,
        }),
      )
      expect(result.gate).toBe('disabled')
    })
  })
})

describe('resolveStrategyFilter', () => {
  it('should return strategyFilter when defined', () => {
    const filter = resolveStrategyFilter(
      makeConfig({ strategyFilter: { mode: 'denylist', patterns: ['X'] } }),
    )
    expect(filter.mode).toBe('denylist')
    expect(filter.patterns).toEqual(['X'])
  })

  it('should fall back to onlyRSI when strategyFilter is undefined', () => {
    const filter = resolveStrategyFilter(makeConfig({ onlyRSI: true }))
    expect(filter.mode).toBe('allowlist')
    expect(filter.patterns).toEqual(['RSI'])
  })

  it('should return mode=all when neither is set', () => {
    const filter = resolveStrategyFilter(makeConfig({ onlyRSI: false }))
    expect(filter.mode).toBe('all')
  })
})
