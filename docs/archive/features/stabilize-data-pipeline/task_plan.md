# Data Pipeline Stabilization — Task Plan

**Created:** 2026-02-15

## WS-A: DataSender Stats/Retry Logic + Operational UX

- [x] A-1: Fix bulkRetryCount double-counting in `_sendWithRetry`
- [x] A-2: Add `DRAIN_SENDER_RETRY_QUEUE` message type + content-script handler
- [x] A-2: Add "Drain Queue" button to DBMonitorDashboard
- [x] A-2: Show retry queue size and retry count in Transfer Stats section
- [x] A-1: Add `_resetForTesting()` method for deterministic test state
- [x] A-1: Add 4 unit tests for bulkRetryCount accuracy
- [x] A-1: Add drainRetryQueue unit tests
- [ ] A-3: (Optional) retryQueue IndexedDB persistence — deferred

## WS-B: CandleDataset Upsert Key Design

- [x] B-2: Chose Option 2 (source = informational/lastSource)
- [x] B-2: Added JSDoc documenting upsert key policy
- [x] B-3: Dexie v10 migration — remove unused `source` index from candleDatasets
- [x] B-3: Added upsert key policy test (different source, single record)

## WS-C: Tick Pipeline Performance/Memory

- [x] C-1: Added `notifyThrottleMs` to AdaptivePollingConfig
- [x] C-1: Implemented per-ticker notify throttle in `notifyBackground()`
- [x] C-1: Added `notifySent`/`notifyThrottled` observability counters
- [x] C-2: Removed `tickHistory` duplicate array
- [x] C-2: `getTickHistory()` now synthesizes from `ticksByTicker`
- [x] C-3: Added stale ticker cleanup (5-min inactivity)
- [x] C-3: Added `activeTickers`/`totalTicksInMemory` to collector stats
- [x] Updated tests for new behavior

## WS-D: CI/Format/Test Hardening

- [x] D-1: Added `format:check` step to `.github/workflows/ci.yml`

## WS-E: Documentation

- [x] E-1: Created `docs/features/stabilize-data-pipeline/` 3-file pattern
- [x] E-2: Updated `docs/head/progress.md`

## Verification

- [x] `npm run type-check` — 0 errors
- [x] `npm run lint` — warnings only (pre-existing)
- [x] `npm run test:unit` — 907 tests passed (46 suites)
- [x] `npm run test:backtest:smoke` — 56 tests passed (4 suites)
- [x] `npm run build` — success
- [x] `npm run format:check` — clean
