# Data Pipeline Stabilization — Findings

**Created:** 2026-02-15

## F-1: bulkRetryCount Double-Counting (WS-A)

**Problem:**
`DataSender._sendWithRetry()` had two places that incremented `bulkRetryCount`:
1. In the retry path (HTTP retriable / network error): `bulkRetryCount++`
2. On success after retries: `bulkRetryCount += attempt`

For a request that fails twice then succeeds on attempt 2:
- Old: retryCount = 1 (catch) + 1 (catch) + 2 (success path) = **4** (wrong)
- New: retryCount = 1 (attempt=1) + 1 (attempt=2) = **2** (correct)

**Decision:**
- `bulkRetryCount` counts each retry attempt exactly once
- Increment at the start of each loop iteration where `attempt > 0`
- No increment on the success or failure exit paths

**Verification:** 4 unit tests covering:
1. 0 retries → count = 0
2. 2 retries then success → count = 2
3. All retries exhausted → count = maxRetries
4. 1 HTTP retriable then success → count = 1

## F-2: CandleDataset Upsert Key Policy (WS-B)

**Problem:**
`candleDatasets` has a `source` field but upserts by `[ticker+interval]` only.
Different sources (history, websocket) don't create separate records.

**Decision:** Option 2 — `source` is informational (lastSource semantic).
- Logical key = `[ticker, interval]`. One record per pair.
- `source` records the most recent upsert source. Not part of the key.
- Removed unused `source` index from schema (Dexie v10).
- No data migration needed — field is kept, just index dropped.

**Verification:** 1 new test confirming single-record-per-ticker-interval invariant.

## F-3: tickHistory Duplicate Memory (WS-C)

**Problem:**
`CandleCollector` maintained both:
- `tickHistory: TickData[]` — all ticks, flat array
- `ticksByTicker: Map<string, TickData[]>` — per-ticker

Same data stored twice. For 10k ticks × 2 = ~2x memory overhead.

**Decision:**
- Removed `tickHistory` array.
- `getTickHistory()` now synthesizes from `ticksByTicker` (merge + sort).
- Per-ticker cap (2000) still enforced.
- Added stale ticker cleanup (5-min inactivity → buffer deleted).

**Impact:** ~50% memory reduction for tick storage. Slightly higher CPU for
`getTickHistory()` calls (merge+sort), but this is rarely called and not
on the hot path.

## F-4: Notify Throttle (WS-C)

**Problem:**
`CandleCollector.notifyBackground()` sent `chrome.runtime.sendMessage` on every tick.
Background's `TickBuffer` already samples at 500ms, so most messages were wasted.

**Decision:**
- Added per-ticker `notifyThrottleMs` (default 500ms) in `notifyBackground()`.
- Ticks are still recorded locally at full frequency (strategy calculations need them).
- Only the IPC to background is throttled.
- Stats: `notifySent` and `notifyThrottled` counters for observability.

## F-5: Retry Queue Drain UX (WS-A)

**Decision:**
- New message type: `DRAIN_SENDER_RETRY_QUEUE { maxRetries?: number }`
- Handler added to content-script message-handler.
- "Drain Queue" button added to DBMonitorDashboard.
- Button is disabled when queue is empty. Shows result for 3s after click.
