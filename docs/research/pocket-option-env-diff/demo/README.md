# Demo Environment Findings

## Status: Collecting

This document records observed characteristics of the Pocket Option **Demo** environment.
Findings here serve as the baseline for comparison with Real.

## Known Facts (from existing codebase)

### URL Patterns
- Demo trading page contains `/demo/` in the URL path
- Known domains: `pocketoption.com`, `po.trade`, `po2.trade`

### DOM Characteristics
- `.is-chart-demo` class present on chart container
- Balance label (`.balance-info-block__label`) contains text "Demo"
- Trading buttons: `.switch-state-block__item:first-child` (CALL), `:last-child` (PUT)
- Amount input: `#put-call-buttons-chart-1 input[type="text"]`
- Asset list: `.assets-block__alist.alist`

### WebSocket
- Connects via Socket.IO protocol (prefix `42[...]`, `451-[...]`)
- Key event names observed:
  - `updateStream` -- real-time price ticks (array: `[assetId, timestamp, price]`)
  - `updateHistoryNewFast` -- candle history response
  - `signals/stats` -- signal statistics
  - `changeSymbol` -- asset switch confirmation
- Binary payloads: Socket.IO binary placeholder pattern (`451-["event", {_placeholder:true}]`)
- Heartbeat: Standard Socket.IO ping/pong

## Sample Skeleton (DOM Snapshot)

```json
{
  "environment": "demo",
  "timestamp": 0,
  "url": {
    "path": "/demo/quick-high-low/",
    "hasDemoInPath": true
  },
  "selectors": {
    "callButton": { "exists": true, "count": 0 },
    "putButton": { "exists": true, "count": 0 },
    "amountInput": { "exists": true, "count": 0 },
    "balanceDisplay": { "exists": true, "count": 0 },
    "balanceLabel": { "exists": true, "textSnippet": "" },
    "demoChartClass": { "exists": true, "count": 0 },
    "assetList": { "exists": true, "count": 0 },
    "chartContainer": { "exists": true, "count": 0 }
  }
}
```

## Sample Skeleton (WS Snapshot)

```json
{
  "environment": "demo",
  "timestamp": 0,
  "connections": [
    {
      "urlPath": "/socket.io/",
      "queryParamsRedacted": true,
      "transportType": "websocket"
    }
  ],
  "messageSchemas": [
    {
      "eventName": "updateStream",
      "payloadShape": "array",
      "sampleKeyMap": null,
      "frequency": 0
    }
  ]
}
```

## Checklist

- [ ] Capture full DOM snapshot with instrumentation tool
- [ ] Capture WS snapshot (10 min session)
- [ ] Document WS endpoint URL path (redacted)
- [ ] Count distinct event names
- [ ] Record binary vs text frame ratio
- [ ] Note any demo-only events or selectors
