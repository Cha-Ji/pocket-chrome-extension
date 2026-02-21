# Pocket Option Demo/Real Protocol Diff Research

## Why Demo/Real Separation Matters

Pocket Option provides two distinct environments: **Demo** (practice) and **Real** (live money).
Our extension was built and tested exclusively against the Demo environment.
Before supporting Real accounts, we must understand all protocol-level differences to avoid:

1. **Data corruption** -- mixing demo ticks/candles with real data makes backtests meaningless
2. **Silent execution failures** -- if DOM selectors or WS message formats differ in Real mode, trades may fail silently
3. **Safety regressions** -- the 3-layer demo check (`isDemoMode()`) must be validated against Real pages; a false positive could allow live trading when the user thinks they're on demo
4. **Security exposure** -- Real accounts carry authentication tokens, session keys, and PII that must never leak into logs, snapshots, or commits

## Research Goals

- **Catalog** every observable difference between Demo and Real (DOM structure, WS endpoints, WS message schema, URL patterns)
- **Instrument** the extension to collect structured snapshots (schema-only, no sensitive data) from both environments
- **Tag** all collected data with `source: 'demo' | 'real' | 'unknown'` so nothing is ambiguous
- **Document** findings incrementally in this folder as samples are collected

## Scope & Non-Goals

| In Scope | Out of Scope |
|----------|--------------|
| DOM selector existence/absence mapping | Auto-trading logic changes |
| WS message key-shape capture (no values) | Real-format hard-coding or guessing |
| URL/cookie/class-based env detection heuristics | Safety guard modifications |
| Redaction rules for tokens/PII | Performance optimization |

## Data Collection Approach

### DOM Snapshot

For each environment, capture:

- [ ] URL pattern (`/demo/`, `/quick-high-low/`, etc.)
- [ ] Presence of `.is-chart-demo` class
- [ ] Balance label text pattern (e.g., "Demo" vs "Real" vs other)
- [ ] Trading button selectors (`.switch-state-block__item`)
- [ ] Amount input selector
- [ ] Asset/pair display selector
- [ ] Chart container structure
- [ ] Payout list selectors (`.assets-block__alist`)
- [ ] Any Real-only or Demo-only DOM elements

### WebSocket Snapshot

For each environment, capture:

- [ ] WS endpoint URLs (scheme + host + path; redact query params containing tokens)
- [ ] Connection count and purpose (price feed, order feed, etc.)
- [ ] Message event names (Socket.IO event strings like `updateStream`, `updateHistoryNewFast`)
- [ ] Message schema shapes (key names + value types, **never raw values**)
- [ ] Binary vs text frame ratio
- [ ] Heartbeat/ping patterns
- [ ] Any authentication handshake sequence (schema only, redact tokens)

### Data Tagging

Every tick, candle, and trade record must carry:

```typescript
source: 'demo' | 'real' | 'unknown'
```

**Why `unknown`?** Detection can fail (page not fully loaded, selectors missing, new page layout). `unknown` ensures we never silently misclassify data. Records tagged `unknown` should be flagged for manual review and excluded from production strategies.

## Security: Redaction Principles

### What MUST be redacted

| Category | Examples | Redaction |
|----------|----------|-----------|
| Auth tokens | `session_id`, `token`, `jwt`, `api_key` | Replace value with `[REDACTED]` |
| Account identifiers | `user_id`, `account_id`, `email` | Replace with `[REDACTED]` |
| Financial data | Exact balance amounts, deposit/withdrawal info | Replace with `[REDACTED]` |
| Session keys | WS URL query parameters (`?session=...`) | Strip query string entirely |
| IP addresses | Any IP in logs or headers | Replace with `[REDACTED]` |

### What CAN be captured

- DOM element existence (boolean)
- CSS class names
- Element counts
- WS message key names and value types (`string`, `number`, `boolean`, `array`, `object`)
- WS message array lengths
- Event name strings (e.g., `updateStream`)
- URL paths (without query strings)

### Enforcement

- The `EnvInstrumentation` module strips all values from WS frames before storage
- DOM snapshots capture only selector match counts and text patterns (first 50 chars, after PII regex scrub)
- No raw WS frame is ever persisted (memory-only ring buffer, capped at 200 schema entries)
- `.gitignore` includes `docs/research/pocket-option-env-diff/demo/samples/` and `real/samples/`
- Runtime snapshots live in `localStorage` (key: `pq-env-snapshot`), never committed

## Instrumentation Toggle

All instrumentation is **OFF by default** and activated via:

```javascript
// Browser console
window.pqEnvDebug.enable()   // Start collecting
window.pqEnvDebug.disable()  // Stop + clear
window.pqEnvDebug.export()   // Copy JSON to clipboard
window.pqEnvDebug.status()   // Show current state
```

When disabled, the instrumentation adds zero overhead (early return on all hooks).

## File Structure

```
docs/research/pocket-option-env-diff/
  README.md             <-- this file (overview + checklist)
  demo/
    README.md           <-- demo-specific findings + sample skeletons
  real/
    README.md           <-- real-specific findings + sample skeletons
```

Source code:
```
src/lib/instrumentation/
  env-detect.ts         <-- PocketOptionEnvironment type + detectEnvironment()
  dom-snapshot.ts       <-- DOM selector presence/count capture
  ws-snapshot.ts        <-- WS message schema capture
  env-instrumentation.ts <-- Orchestrator (debug flag, export, console API)
  index.ts              <-- Public API re-exports
  __tests__/
    env-detect.test.ts
    dom-snapshot.test.ts
    ws-snapshot.test.ts
```
