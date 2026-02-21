# Real Environment Findings

## Status: Not Started

This document will record observed characteristics of the Pocket Option **Real** (live) environment.
No data has been collected yet -- all entries below are **unknown** until verified.

## What We Do NOT Know

> **IMPORTANT**: Do not guess or hard-code Real formats. Everything below is a placeholder
> to be filled in once actual samples are collected with the instrumentation tool.

### URL Patterns
- [ ] Does the Real page use a different URL path? (e.g., `/quick-high-low/` without `/demo/`?)
- [ ] Are there additional URL parameters unique to Real?
- [ ] Same domains or different?

### DOM Characteristics
- [ ] Is `.is-chart-demo` absent, or replaced with another class?
- [ ] What does the balance label text say? ("Live"? "Real"? Just the currency?)
- [ ] Are the trading button selectors identical?
- [ ] Is the amount input the same?
- [ ] Are there additional UI elements (e.g., deposit prompts, risk warnings)?
- [ ] Is the payout list structure the same?

### WebSocket
- [ ] Same endpoint URL path or different?
- [ ] Same Socket.IO protocol version?
- [ ] Same event names (`updateStream`, `updateHistoryNewFast`, etc.)?
- [ ] Are there additional events (e.g., `orderResult`, `balanceUpdate`)?
- [ ] Different authentication handshake?
- [ ] Same binary payload format?
- [ ] Different heartbeat interval?

### Data Formats
- [ ] Are tick/candle array structures identical?
- [ ] Does `updateStream` use the same `[assetId, timestamp, price]` format?
- [ ] Are asset IDs the same between Demo and Real?
- [ ] Is the payout percentage format the same?

## Sample Skeleton (DOM Snapshot)

```json
{
  "environment": "real",
  "timestamp": 0,
  "url": {
    "path": "???",
    "hasDemoInPath": false
  },
  "selectors": {
    "callButton": { "exists": "???", "count": "???" },
    "putButton": { "exists": "???", "count": "???" },
    "amountInput": { "exists": "???", "count": "???" },
    "balanceDisplay": { "exists": "???", "count": "???" },
    "balanceLabel": { "exists": "???", "textSnippet": "???" },
    "demoChartClass": { "exists": "???", "count": "???" },
    "assetList": { "exists": "???", "count": "???" },
    "chartContainer": { "exists": "???", "count": "???" }
  }
}
```

## Sample Skeleton (WS Snapshot)

```json
{
  "environment": "real",
  "timestamp": 0,
  "connections": [],
  "messageSchemas": []
}
```

## Checklist

- [ ] Log in to Real account (with own funds -- never use someone else's)
- [ ] Enable instrumentation: `window.pqEnvDebug.enable()`
- [ ] Wait for page to fully load + WS connections to establish
- [ ] Capture DOM snapshot
- [ ] Capture WS snapshot (10 min session minimum)
- [ ] Export: `window.pqEnvDebug.export()`
- [ ] Save exported JSON locally (do NOT commit raw data)
- [ ] Fill in this README with redacted findings
- [ ] Compare with demo/README.md, note differences

## Security Reminder

When working with Real accounts:
- **Never** commit session tokens, account IDs, or balance amounts
- **Never** capture full WS message payloads (use schema-only mode)
- **Always** review exported JSON before sharing
- **Always** use the instrumentation's built-in redaction (it strips sensitive values automatically)
