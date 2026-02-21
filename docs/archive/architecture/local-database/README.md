# Local Database 아키텍처 — IndexedDB (Dexie.js)

> **범위**: 브라우저 내 IndexedDB. 외부 수집 서버(SQLite)는 [`../local-collector/`](../local-collector/README.md) 참조.

## 역할

| 구분 | 설명 |
|------|------|
| **목적** | 실시간 트레이딩 세션에 필요한 데이터를 브라우저 내부에 영구 저장 |
| **기술** | IndexedDB — [Dexie.js](https://dexie.org/) v4 래퍼 |
| **소스** | `src/lib/db/index.ts` |
| **접근 주체** | Background Worker(단일 DB 오너), Content Script(메시지 경유), Side Panel(메시지 경유) |

```
┌──────────────────────────────────────────────────────────────┐
│              Chrome Extension (Origin)                        │
│                                                              │
│  Content Script ──(CANDLE_FINALIZED)──▶ Background ──▶ DB   │
│  Content Script ──(CANDLE_HISTORY_CHUNK)──▶ Background──▶ DB │
│  Content Script ──(TICK_DATA)──▶ Background(TickBuffer)──▶ DB│
│                                                              │
│  Side Panel ──(GET_CANDLE_DB_STATS)──▶ Background ──▶ DB    │
│  Side Panel ──(GET_TICK_BUFFER_STATS)──▶ Background──▶ DB   │
│                                                              │
│              IndexedDB (Dexie.js)                            │
│              8 Tables, v10 Schema                            │
└──────────────────────────────────────────────────────────────┘
```

### DB 오너십 모델

| 데이터 | 단일 Writer | 읽기 |
|--------|:-----------:|:----:|
| **Ticks** | Background (TickBuffer) | Background → Side Panel (메시지) |
| **Candles** | Background (candle-handlers.ts) | Background → Side Panel (GET_CANDLE_DB_STATS), Side Panel (직접 읽기는 leaderboard 등 read-only) |
| **Trades** | Background (trade-handlers.ts) | Background → Side Panel (메시지) |
| **CandleDatasets** | Background (candle-handlers.ts) | Background → Side Panel (GET_CANDLE_DB_STATS) |
| **Strategies, Sessions, Backtest, Leaderboard** | 각 모듈에서 직접 | 각 모듈에서 직접 |

> **핵심 원칙**: Candle과 Tick의 **쓰기(write)**는 반드시 Background를 경유한다. Content Script는 `CANDLE_FINALIZED`, `CANDLE_HISTORY_CHUNK` 메시지로 Background에 전달하고, Background가 DB에 저장한다. 이를 통해 다중 컨텍스트 동시 쓰기로 인한 데이터 정합성 문제를 방지한다.

## 저장 대상 — "무엇을 저장하는가?"

| 데이터 | IndexedDB | Local Collector (SQLite) |
|--------|:---------:|:------------------------:|
| 실시간 Tick (DOM/WS) | ✅ | ✅ (DataSender 경유) |
| OHLCV 캔들 | ✅ (최근 버퍼) | ✅ (전량 보관) |
| 전략 설정 | ✅ | — |
| 거래 세션 | ✅ | — |
| 개별 거래 기록 | ✅ | — |
| 백테스트 결과 | ✅ | — |
| 리더보드 | ✅ | — |
| 리샘플된 1분봉 캐시 | — | ✅ |

> **핵심 차이**: IndexedDB는 *트레이딩 상태*(전략, 거래, 세션)를 소유하고, Local Collector는 *시장 데이터 아카이브*(틱, 캔들 전량)를 소유한다.

## DB 스키마 (v10)

```mermaid
erDiagram
    ticks {
        int id PK "auto-increment"
        string ticker
        int timestamp
        float price
        int serverTime
    }
    candles {
        composite_pk "[ticker+interval+timestamp]" "unique composite PK"
        string ticker
        int interval
        int timestamp
        float open
        float high
        float low
        float close
        float volume
        string source "websocket|import|api|manual|history"
    }
    strategies {
        int id PK "auto-increment"
        string name
        int createdAt
        object config
        string description
    }
    sessions {
        int id PK "auto-increment"
        string type "backtest|forward|live"
        int strategyId FK
        int startTime
        int endTime
        float initialBalance
        float finalBalance
        float winRate
    }
    trades {
        int id PK "auto-increment"
        int sessionId FK
        string ticker
        string direction "CALL|PUT"
        int entryTime
        int exitTime
        float entryPrice
        float exitPrice
        string result "WIN|LOSS|TIE|PENDING"
        float profit
    }
    leaderboardEntries {
        int id PK "auto-increment"
        int strategyId FK
        float compositeScore
        float winRate
        int rank
        int createdAt
    }
    backtestResults {
        int id PK "auto-increment"
        int strategyId FK
        string symbol
        int createdAt
        int totalTrades
        int wins
        int losses
        int ties
        float netProfit
        float maxDrawdown
        float winRate
    }
    candleDatasets {
        int id PK "auto-increment"
        string ticker
        int interval
        string source "informational, not indexed"
        int startTime
        int endTime
        int candleCount
        int lastUpdated
    }

    sessions ||--o{ trades : "has"
    strategies ||--o{ sessions : "used in"
    strategies ||--o{ leaderboardEntries : "ranked by"
    strategies ||--o{ backtestResults : "evaluated by"
```

### 버전 히스토리

| 버전 | 변경 내용 |
|------|-----------|
| v1 | ticks, strategies, sessions, trades |
| v2 | + candles (OHLCV) |
| v3 | + leaderboardEntries |
| v4 | + backtestResults, candleDatasets, candles.source 필드 |
| v5 | 중복 캔들 제거 마이그레이션 |
| v6 | `[ticker+interval+timestamp]` 유니크 인덱스 적용 |
| v7 | `_candleBackup` 테이블 생성 (마이그레이션 백업) |
| v8 | candles PK를 `[ticker+interval+timestamp]` 복합키로 변경 |
| v9 | `_candleBackup` 임시 테이블 제거 |
| v10 | candleDatasets에서 미사용 `source` 인덱스 제거 (source는 정보용 필드만) |

### 주요 인덱스

| 테이블 | 인덱스 | 용도 |
|--------|--------|------|
| ticks | `[ticker+timestamp]` | 시간 범위 조회 |
| candles | `[ticker+interval+timestamp]` (unique composite PK) | 중복 방지 + 범위 조회 |
| candles | `[ticker+interval]` | 자산+타임프레임 범위 쿼리 |
| trades | `sessionId`, `ticker`, `entryTime` | 세션별/자산별 거래 검색 |
| leaderboardEntries | `compositeScore`, `winRate` | 순위 정렬 |
| candleDatasets | `[ticker+interval]` (unique) | 자산+타임프레임별 메타데이터 조회 |

## Repository 패턴

각 테이블은 `XxxRepository` 객체로 CRUD를 노출한다.

| Repository | 핵심 메서드 |
|-----------|-------------|
| **TickRepository** | `add()`, `bulkPut()`, `getByTicker()`, `getByTimeRange()`, `deleteOlderThan()`, `deleteOldestToLimit()` |
| **CandleRepository** | `add()`, `bulkAdd()` (배치 중복 제거), `getByTicker()`, `getRecent()`, `getStats()`, `count()`, `getTickers()`, `export()`, `import()` |
| **TradeRepository** | `create()`, `finalize()` (idempotent), `getBySession()`, `getRecent()`, `getPending()` |
| **SessionRepository** | `create()`, `update()`, `finalize()`, `getByType()` |
| **LeaderboardRepository** | `saveResults()`, `getTop()`, `getByStrategy()`, `getAll()` |
| **BacktestResultRepository** | `save()`, `getByStrategy()`, `getBySymbol()` |
| **CandleDatasetRepository** | `upsert()`, `getByTicker()`, `getAll()`, `get()`, `count()`, `delete()` |

## 보관(Retention) 정책

| 데이터 | 정책 | 메커니즘 |
|--------|------|----------|
| **Ticks** | maxAge=2시간, maxCount=5000 | `TickBuffer.runRetention()` (Background, 30초 주기) |
| **Candles** | 무기한 (디스크 허용 범위) | 유니크 인덱스로 중복 방지, 수동 삭제 가능 |
| **Trades / Sessions** | 무기한 | — |
| **Backtest Results** | 무기한 | `clear()` 수동 호출 |

> **용량 참고**: IndexedDB 한도는 브라우저/디스크에 따라 다름. Chrome은 디스크의 ~80%까지 사용 가능하나, 대용량 히스토리 데이터는 Local Collector(SQLite)에 보관하는 것이 권장됨.

## 메시지 기반 Candle 저장 흐름

```
[Content Script] ─── CANDLE_FINALIZED ───▶ [Background]
  (실시간 캔들 확정)                         candleRepo.add()

[Content Script] ─── CANDLE_HISTORY_CHUNK ──▶ [Background]
  (히스토리 수신, 1000개 chunk)               candleRepo.bulkAdd()
                                              datasetRepo.upsert() (isFinal)

[Side Panel] ─── GET_CANDLE_DB_STATS ──▶ [Background]
  (모니터링 대시보드)                         candleRepo.getStats()
                                              datasetRepo.getAll()
```

## 제약사항

- IndexedDB는 **동기 API가 없다** — 모든 작업이 async/Promise 기반.
- Dexie v4의 `liveQuery`를 사용하면 반응형 구독이 가능하나, 현재 직접 사용하지 않음.
- Service Worker 비활성화 시 주기적 정리 알람이 실행되지 않을 수 있음.
- 브라우저 간 데이터 이동 불가 — export/import JSON으로 대응.
- Side Panel에서 CandleRepository.getTickers() / getByTicker()를 직접 호출하는 경우가 있음 (leaderboard backtest). 이는 read-only이므로 허용되지만, 향후 Background 메시지 경유로 전환 권장.

## 관련 문서

- **Local Collector (SQLite)**: [`../local-collector/README.md`](../local-collector/README.md)
- **데이터 흐름 전체도**: [`../../head/map.md`](../../head/map.md) → "데이터 저장소" 섹션
- **소스 코드**: `src/lib/db/index.ts`
- **Candle Handlers**: `src/background/handlers/candle-handlers.ts`
- **TickBuffer**: `src/background/tick-buffer.ts`
