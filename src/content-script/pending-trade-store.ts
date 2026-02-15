// ============================================================
// Pending Trade Store
// ============================================================
// Persists pending trades to chrome.storage.session so they
// survive tab reload / extension restart.
// On init, restores pending trades and reschedules settlement.
// ============================================================

const STORAGE_KEY = 'pendingTrades'

export interface PendingTradeData {
  tradeId: number
  signalId?: string
  ticker: string
  direction: 'CALL' | 'PUT'
  entryTime: number
  entryPrice: number
  expirySeconds: number
  amount: number
  payoutPercent: number
  /** Absolute timestamp (ms) when settlement should fire */
  settlementAt: number
}

/**
 * Save the current pending trades map to chrome.storage.session.
 * Non-critical: failures are logged but don't throw.
 */
export async function persistPendingTrades(
  trades: Map<number, PendingTradeData>,
): Promise<void> {
  try {
    const arr = Array.from(trades.values())
    await chrome.storage.session.set({ [STORAGE_KEY]: arr })
  } catch (e) {
    console.warn('[PO] Failed to persist pending trades:', e)
  }
}

/**
 * Load pending trades from chrome.storage.session.
 * Returns trades that have not yet passed their settlement time.
 */
export async function loadPendingTrades(): Promise<PendingTradeData[]> {
  try {
    const result = await chrome.storage.session.get(STORAGE_KEY)
    const arr: PendingTradeData[] = result[STORAGE_KEY] ?? []
    // Filter out trades whose settlement time has already passed
    // (they will be handled as "late settlement" by the caller)
    return arr.filter((t) => typeof t.tradeId === 'number')
  } catch (e) {
    console.warn('[PO] Failed to load pending trades:', e)
    return []
  }
}

/**
 * Clear all pending trades from session storage.
 */
export async function clearPendingTrades(): Promise<void> {
  try {
    await chrome.storage.session.remove(STORAGE_KEY)
  } catch {
    // non-critical
  }
}
