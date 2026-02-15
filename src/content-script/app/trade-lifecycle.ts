// ============================================================
// trade-lifecycle.ts — Signal handling, trade execution, settlement
// ============================================================

import { Signal } from '../../lib/signals/types'
import { normalizeSymbol } from '../../lib/utils/normalize'
import { ContentScriptContext, PendingTrade, TRADE_COOLDOWN_MS, SETTLEMENT_GRACE_MS } from './context'

export async function handleNewSignal(ctx: ContentScriptContext, signal: Signal): Promise<void> {
  if (!ctx.tradingConfig.enabled) return

  // minPayout gate: use current chart asset payout (not bestAsset)
  const currentPayout = ctx.payoutMonitor?.getCurrentAssetPayout()
  if (!currentPayout) {
    console.warn('[PO] Cannot determine current asset payout — blocking trade (conservative)')
    return
  }
  if (currentPayout.payout < ctx.tradingConfig.minPayout) {
    console.log(`[PO] Current asset payout ${currentPayout.payout}% < minPayout ${ctx.tradingConfig.minPayout}% — skipping`)
    return
  }

  if (ctx.tradingConfig.onlyRSI && !(signal.strategyId || signal.strategy).includes('RSI')) return
  await executeSignal(ctx, signal)
}

export async function executeSignal(ctx: ContentScriptContext, signal: Signal): Promise<void> {
  if (!ctx.tradeExecutor) return

  // [#46] Race Condition Guard: 동시 거래 실행 방지
  if (ctx.isExecutingTrade) {
    console.warn(`[PO] ⚠️ Trade skipped (already executing): ${signal.direction} (${signal.strategy})`)
    return
  }
  const timeSinceLastTrade = Date.now() - ctx.lastTradeExecutedAt
  if (timeSinceLastTrade < TRADE_COOLDOWN_MS) {
    console.warn(`[PO] ⚠️ Trade skipped (cooldown ${TRADE_COOLDOWN_MS - timeSinceLastTrade}ms remaining): ${signal.direction} (${signal.strategy})`)
    return
  }

  ctx.isExecutingTrade = true
  console.log(`[PO] 🚀 Executing: ${signal.direction} (${signal.strategy})`)
  try {
    const result = await ctx.tradeExecutor.executeTrade(signal.direction, ctx.tradingConfig.tradeAmount)
    ctx.lastTradeExecutedAt = Date.now()

    if (result.success) {
      // P0: entryPrice 결정
      const ticker = normalizeSymbol(signal.symbol)
      let entryPrice = ctx.candleCollector?.getLatestTickPrice(ticker) ?? 0
      if (!entryPrice || entryPrice <= 0) entryPrice = signal.entryPrice
      if (!entryPrice || entryPrice <= 0) {
        console.error(`[PO] ❌ Cannot determine entryPrice for ${ticker} — aborting trade record`)
        ctx.isExecutingTrade = false
        return
      }

      // Capture payout at entry time for accurate PnL calculation
      const currentPayout = ctx.payoutMonitor?.getCurrentAssetPayout()
      const payoutPercent = currentPayout?.payout ?? 0
      if (payoutPercent <= 0) {
        console.warn(`[PO] ⚠️ Cannot determine payout for ${ticker} — PnL will default to 0 on WIN`)
      }

      ctx.telegramService?.sendMessage(`🚀 [PO] <b>Trade Executed</b>\n${signal.direction} on ${signal.symbol} @ ${entryPrice} (payout: ${payoutPercent}%)`)
      const expirySeconds = signal.expiry || 60
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'TRADE_EXECUTED',
          payload: {
            signalId: signal.id,
            result: true,
            timestamp: Date.now(),
            direction: signal.direction,
            amount: ctx.tradingConfig.tradeAmount,
            ticker,
            entryPrice,
          }
        }) as { success: boolean; tradeId?: number } | undefined

        if (response?.success && response.tradeId) {
          scheduleSettlement(ctx, {
            tradeId: response.tradeId,
            signalId: signal.id,
            ticker,
            direction: signal.direction,
            entryTime: Date.now(),
            entryPrice,
            expirySeconds,
            amount: ctx.tradingConfig.tradeAmount,
            payoutPercent,
          })
        }
      } catch {
        console.warn('[PO] Failed to send TRADE_EXECUTED to background')
      }
    } else {
      console.warn(`[PO] ⚠️ Trade failed: ${result.error ?? 'unknown error'}`)
      try { chrome.runtime.sendMessage({ type: 'TRADE_EXECUTED', payload: { signalId: signal.id, result: false, timestamp: Date.now(), direction: signal.direction, error: result.error } }).catch(() => {}) } catch {}
    }
  } catch (error) {
    console.error('[PO] Trade execution error:', error)
  } finally {
    ctx.isExecutingTrade = false
  }
}

export function scheduleSettlement(ctx: ContentScriptContext, params: Omit<PendingTrade, 'timerId'>): void {
  const delayMs = params.expirySeconds * 1000 + SETTLEMENT_GRACE_MS
  console.log(`[PO] ⏱️ Settlement scheduled for tradeId=${params.tradeId} in ${delayMs}ms`)

  const timerId = setTimeout(() => {
    settleTrade(ctx, params.tradeId)
  }, delayMs)

  ctx.pendingTrades.set(params.tradeId, { ...params, timerId })
}

export async function settleTrade(ctx: ContentScriptContext, tradeId: number): Promise<void> {
  const pending = ctx.pendingTrades.get(tradeId)
  if (!pending) return
  ctx.pendingTrades.delete(tradeId)

  const exitPrice = ctx.candleCollector?.getLatestTickPrice(pending.ticker) ?? 0
  if (!exitPrice || exitPrice <= 0) {
    console.warn(`[PO] ⚠️ Cannot get exit price for ${pending.ticker} — marking as LOSS (conservative)`)
  }

  let result: 'WIN' | 'LOSS' | 'TIE'
  if (exitPrice <= 0) {
    result = 'LOSS'
  } else if (pending.direction === 'CALL') {
    result = exitPrice > pending.entryPrice ? 'WIN' : exitPrice < pending.entryPrice ? 'LOSS' : 'TIE'
  } else {
    result = exitPrice < pending.entryPrice ? 'WIN' : exitPrice > pending.entryPrice ? 'LOSS' : 'TIE'
  }

  const profit = result === 'WIN'
    ? pending.amount * (pending.payoutPercent / 100)
    : result === 'LOSS'
      ? -pending.amount
      : 0

  console.log(`[PO] 📊 Settlement: tradeId=${tradeId} ${pending.direction} entry=${pending.entryPrice} exit=${exitPrice} => ${result} (profit=${profit})`)

  try {
    await chrome.runtime.sendMessage({
      type: 'FINALIZE_TRADE',
      payload: {
        tradeId,
        signalId: pending.signalId,
        exitPrice,
        result,
        profit,
      }
    })
  } catch {
    console.warn(`[PO] Failed to send FINALIZE_TRADE for tradeId=${tradeId}`)
  }

  if (pending.signalId && ctx.signalGenerator) {
    const signalResult = result === 'WIN' ? 'win' : result === 'LOSS' ? 'loss' : 'tie'
    ctx.signalGenerator.updateSignalResult(pending.signalId, signalResult)
    console.log(`[PO] 📈 Signal ${pending.signalId} updated: ${signalResult}`)
  }
}
