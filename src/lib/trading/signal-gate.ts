// ============================================================
// Signal Gate - Pure function for trade signal filtering
// ============================================================
// Determines whether a signal should be executed.
// Extracted from content-script/index.ts for testability.
// ============================================================

import type { StrategyFilter, TradingConfigV2 } from '../types'

/** Reason a signal was rejected */
export interface GateResult {
  allowed: boolean
  /** Human-readable reason for rejection (undefined when allowed) */
  reason?: string
  /** Machine-readable gate that rejected the signal */
  gate?: 'disabled' | 'payout' | 'strategy' | 'cooldown' | 'executing'
}

export interface GateContext {
  /** Current trading config */
  config: TradingConfigV2
  /** Current asset payout info (null if unknown) */
  currentPayout: { payout: number; name: string } | null
  /** Signal's strategy identifier (e.g. 'RSI-BB', 'TIF-60') */
  strategyId: string
  /** Signal's human-readable strategy name */
  strategyName: string
  /** Whether a trade is currently being executed */
  isExecuting: boolean
  /** Timestamp of last trade execution */
  lastTradeAt: number
  /** Minimum ms between trades */
  cooldownMs: number
  /** Current timestamp */
  now: number
}

/**
 * Evaluate all gates in order: enabled → payout → strategy → executing → cooldown.
 * Returns { allowed: true } or { allowed: false, reason, gate }.
 */
export function evaluateSignalGates(ctx: GateContext): GateResult {
  // Gate 1: Trading enabled
  if (!ctx.config.enabled) {
    return { allowed: false, reason: 'Trading is disabled', gate: 'disabled' }
  }

  // Gate 2: Minimum payout check
  if (!ctx.currentPayout) {
    return {
      allowed: false,
      reason: 'Cannot determine current asset payout — blocking trade (conservative)',
      gate: 'payout',
    }
  }
  if (ctx.currentPayout.payout < ctx.config.minPayout) {
    return {
      allowed: false,
      reason: `Current asset payout ${ctx.currentPayout.payout}% < minPayout ${ctx.config.minPayout}%`,
      gate: 'payout',
    }
  }

  // Gate 3: Strategy filter
  const strategyResult = evaluateStrategyFilter(
    ctx.config,
    ctx.strategyId,
    ctx.strategyName,
  )
  if (!strategyResult.allowed) {
    return strategyResult
  }

  // Gate 4: Race condition guard
  if (ctx.isExecuting) {
    return {
      allowed: false,
      reason: 'Trade skipped (already executing)',
      gate: 'executing',
    }
  }

  // Gate 5: Cooldown
  const elapsed = ctx.now - ctx.lastTradeAt
  if (elapsed < ctx.cooldownMs) {
    return {
      allowed: false,
      reason: `Trade skipped (cooldown ${ctx.cooldownMs - elapsed}ms remaining)`,
      gate: 'cooldown',
    }
  }

  return { allowed: true }
}

/**
 * Resolve the effective StrategyFilter from config.
 * If strategyFilter is defined, use it. Otherwise fall back to onlyRSI legacy.
 */
export function resolveStrategyFilter(config: TradingConfigV2): StrategyFilter {
  if (config.strategyFilter) {
    return config.strategyFilter
  }
  // Legacy: onlyRSI → allowlist with 'RSI' pattern
  if (config.onlyRSI) {
    return { mode: 'allowlist', patterns: ['RSI'] }
  }
  return { mode: 'all', patterns: [] }
}

/**
 * Check whether a signal's strategy passes the filter.
 */
function evaluateStrategyFilter(
  config: TradingConfigV2,
  strategyId: string,
  strategyName: string,
): GateResult {
  const filter = resolveStrategyFilter(config)

  if (filter.mode === 'all') {
    return { allowed: true }
  }

  // Match against either strategyId or strategyName (case-insensitive substring)
  const matchesAny = filter.patterns.some((pattern) => {
    const p = pattern.toLowerCase()
    return (
      strategyId.toLowerCase().includes(p) ||
      strategyName.toLowerCase().includes(p)
    )
  })

  if (filter.mode === 'allowlist' && !matchesAny) {
    return {
      allowed: false,
      reason: `Strategy '${strategyId}' not in allowlist [${filter.patterns.join(', ')}]`,
      gate: 'strategy',
    }
  }

  if (filter.mode === 'denylist' && matchesAny) {
    return {
      allowed: false,
      reason: `Strategy '${strategyId}' is in denylist [${filter.patterns.join(', ')}]`,
      gate: 'strategy',
    }
  }

  return { allowed: true }
}
