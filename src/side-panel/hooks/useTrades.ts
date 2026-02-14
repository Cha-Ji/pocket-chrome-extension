
import { useState, useEffect, useCallback, useRef } from 'react'
import { Trade } from '../../lib/types'
import { sendRuntimeMessage } from '../infrastructure/extension-client'
import { usePortSubscription } from './usePortSubscription'

/** Maximum trades kept in memory (most-recent first). */
const MAX_TRADES = 200

/**
 * High-performance trade list hook.
 *
 * Design:
 *  - Internal Map<tradeId, Trade> for O(1) upsert/lookup.
 *  - Rendering array derived on every Map mutation (sorted by entryTime desc).
 *  - Listens for TRADE_LOGGED (new pending trade) and TRADE_SETTLED (finalized trade)
 *    via the port channel — no polling, no refetch.
 *  - Idempotent: duplicate messages with the same tradeId are merged, not appended.
 *  - Out-of-order tolerant: if TRADE_SETTLED arrives before TRADE_LOGGED, a stub is
 *    created and later merged when the LOGGED message arrives.
 */
export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Internal map is a ref so message handlers always see the latest snapshot
  // without causing re-renders on their own.
  const mapRef = useRef<Map<number, Trade>>(new Map())

  /** Rebuild the sorted array from the map and push to state. */
  const flush = useCallback(() => {
    const arr = Array.from(mapRef.current.values())
      .sort((a, b) => (b.entryTime ?? 0) - (a.entryTime ?? 0))
      .slice(0, MAX_TRADES)
    setTrades(arr)
  }, [])

  /** Upsert a single trade into the internal map.  */
  const upsertTrade = useCallback(
    (incoming: Partial<Trade> & { id?: number }) => {
      if (incoming.id == null) return
      const existing = mapRef.current.get(incoming.id)
      if (existing) {
        // Merge: apply incoming, but never downgrade a settled result to PENDING
        const merged = { ...existing, ...incoming }
        if (existing.result !== 'PENDING' && incoming.result === 'PENDING') {
          merged.result = existing.result
          merged.exitPrice = existing.exitPrice
          merged.exitTime = existing.exitTime
          merged.profit = existing.profit
        }
        mapRef.current.set(incoming.id, merged)
      } else {
        // Insert: fill defaults for stub scenario
        mapRef.current.set(incoming.id, {
          sessionId: 0,
          ticker: 'UNKNOWN',
          direction: 'CALL',
          entryTime: 0,
          entryPrice: 0,
          result: 'PENDING',
          amount: 0,
          ...incoming,
        } as Trade)
      }
      // Prune if over limit
      if (mapRef.current.size > MAX_TRADES * 1.5) {
        const sorted = Array.from(mapRef.current.entries())
          .sort((a, b) => (b[1].entryTime ?? 0) - (a[1].entryTime ?? 0))
        mapRef.current = new Map(sorted.slice(0, MAX_TRADES))
      }
      flush()
    },
    [flush],
  )

  // ── Initial load ──────────────────────────────────────────
  const fetchTrades = useCallback(async () => {
    try {
      const response = await sendRuntimeMessage('GET_TRADES', { limit: MAX_TRADES })
      if (Array.isArray(response)) {
        mapRef.current.clear()
        for (const t of response as Trade[]) {
          if (t.id != null) mapRef.current.set(t.id, t)
        }
        flush()
      }
    } catch {
      // Background may not be ready yet
    } finally {
      setIsLoading(false)
    }
  }, [flush])

  useEffect(() => {
    fetchTrades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Port-based real-time listeners ────────────────────────

  // TRADE_LOGGED: new pending trade (or late-arriving full trade)
  usePortSubscription('TRADE_LOGGED', useCallback(
    (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      upsertTrade(payload as Trade)
    },
    [upsertTrade],
  ))

  // TRADE_SETTLED: settlement update (result, exitPrice, profit, exitTime)
  usePortSubscription('TRADE_SETTLED', useCallback(
    (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const settled = payload as {
        tradeId: number
        result: Trade['result']
        exitPrice: number
        profit: number
        exitTime?: number
      }
      upsertTrade({
        id: settled.tradeId,
        result: settled.result,
        exitPrice: settled.exitPrice,
        profit: settled.profit,
        exitTime: settled.exitTime ?? Date.now(),
      })
    },
    [upsertTrade],
  ))

  return { trades, isLoading, refetch: fetchTrades }
}
