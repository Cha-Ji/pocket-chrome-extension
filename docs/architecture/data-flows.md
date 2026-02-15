# Data Flow Architecture

> Mermaid diagrams for the three primary data flows in the extension.

---

## 1. Tick Flow (Real-time Price → DB)

```mermaid
sequenceDiagram
    participant TM as Tampermonkey<br/>(Main World)
    participant CS as Content Script
    participant BG as Background<br/>(Service Worker)
    participant TB as TickBuffer
    participant DB as IndexedDB<br/>(ticks table)

    TM->>CS: window.postMessage<br/>(pq-bridge, ws-message)
    CS->>CS: WebSocketInterceptor<br/>→ WebSocketParser
    CS->>CS: CandleCollector.addTickFromWebSocket()
    CS->>BG: chrome.runtime.sendMessage<br/>(TICK_DATA)
    BG->>TB: ingest(tick)

    alt Sampling Gate Pass
        TB->>TB: buffer.push(tick)
        alt Buffer Full (batchSize)
            TB->>DB: TickRepository.bulkPut(batch)
        else Timer Flush (flushIntervalMs)
            TB->>DB: TickRepository.bulkPut(batch)
        end
    else Dropped (too recent)
        TB-->>TB: stats.dropped++
    end

    Note over TB,DB: Retention sweep (every 30s):<br/>1. deleteOlderThan(maxAgeMs)<br/>2. deleteOldestToLimit(maxTicks)
```

---

## 2. Trade Flow (Signal → Execution → Settlement)

```mermaid
sequenceDiagram
    participant SG as SignalGeneratorV2
    participant CS as Content Script
    participant EX as TradeExecutor
    participant BG as Background
    participant DB as IndexedDB<br/>(trades/sessions)
    participant SP as Side Panel

    SG->>CS: onSignal(signal)
    CS->>CS: handleNewSignal()<br/>• minPayout gate<br/>• cooldown check<br/>• race guard
    CS->>EX: executeTrade(direction, amount)
    EX->>EX: DOM click simulation<br/>(demo mode 3x check)
    EX-->>CS: {success, error?}

    CS->>BG: TRADE_EXECUTED
    BG->>DB: TradeRepository.create()
    BG->>SP: TRADE_LOGGED (broadcast)

    Note over CS: setTimeout(expirySeconds + 800ms)

    CS->>CS: settleTrade()<br/>• get exitPrice<br/>• WIN/LOSS/TIE判定<br/>• PnL = amount × (payout/100)
    CS->>BG: FINALIZE_TRADE
    BG->>DB: TradeRepository.finalize()<br/>(idempotent)

    alt First finalization
        BG->>SP: TRADE_SETTLED (broadcast)
    else Already finalized
        BG-->>BG: {updated: false} — skip
    end
```

---

## 3. Storage Flow (History Candles → IndexedDB + Server)

```mermaid
sequenceDiagram
    participant WS as WebSocket<br/>(via Tampermonkey)
    participant CS as Content Script
    participant IDB as IndexedDB<br/>(candles table)
    participant SRV as Local Server<br/>(localhost:3001)
    participant AM as AutoMiner

    WS->>CS: onHistoryReceived(candles[])
    CS->>CS: Normalize symbols<br/>& timestamps

    par Local DB Storage (chunked)
        CS->>IDB: CandleRepository.bulkAdd()<br/>(1000/chunk, idle-aware)
        CS->>IDB: CandleDatasetRepository.upsert()<br/>(metadata)
    and Remote Server Send (with retry)
        CS->>SRV: DataSender.sendHistory()<br/>/api/candles/bulk
        alt Network error
            CS->>CS: Retry (3x, exp. backoff)
            CS-->>SRV: Retry attempt
        end
    end

    CS->>CS: Seed SignalGeneratorV2
    CS->>AM: onHistoryResponse(candles)
    AM->>AM: Update progress<br/>→ requestNextChunk()
```

---

## 4. TickBuffer / Candle Statistics (Observability)

```mermaid
flowchart LR
    SP[Side Panel<br/>DBMonitorDashboard] -->|GET_TICK_BUFFER_STATS| BG[Background]
    BG -->|tickBuffer.getStats()| TB[TickBuffer]
    BG -->|TickRepository.getStats()| DB[(IndexedDB)]
    BG -->|Response| SP

    SP -->|FLUSH_TICK_BUFFER| BG
    SP -->|RUN_TICK_RETENTION| BG

    SP -->|GET_DB_MONITOR_STATUS| CS[Content Script]
    CS -->|DataSender.getStats()| DS[DataSender]
    CS -->|Response| SP

    SP -->|Direct Dexie access| DB
    SP -->|fetch /health| SRV[localhost:3001]
```
