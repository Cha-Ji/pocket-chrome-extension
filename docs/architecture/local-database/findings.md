# 발견사항 — Local Database

## 결정 사항

- (2026-01-26) 로컬 저장은 IndexedDB(Dexie.js) 기반으로 설계
- (2026-02-06) Dexie v3 스키마 마이그레이션 방식 채택 — `this.version(N).stores(...)` 체인
- (2026-02-06) Repository 패턴으로 테이블별 CRUD 함수 분리

## 제약/가정

- (2026-01-26) 틱 데이터는 대용량이므로 주기적 정리/압축 필요
- (2026-02-06) Background의 `cleanup` 알람이 7일 초과 Tick 자동 삭제
- (2026-02-06) IndexedDB 용량 제한은 브라우저별 다름 (Chrome: origin당 ~60% 디스크)
- (2026-02-06) `src/database/index.ts`는 레거시 — 현재 `src/lib/db/index.ts`가 활성 모듈

## 핵심 정보

### DB 스키마 진화

**Version 1** (초기):
- `ticks` — `++id, ticker, timestamp, [ticker+timestamp]`
- `strategies` — `++id, name, createdAt`
- `sessions` — `++id, type, strategyId, startTime`
- `trades` — `++id, sessionId, ticker, entryTime, result`

**Version 2** (캔들 추가):
- `candles` — `++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp]`

**Version 3** (리더보드 추가):
- `leaderboardEntries` — `++id, strategyId, compositeScore, winRate, rank, createdAt`

### 테이블별 타입 정의

| 테이블 | 주요 필드 | 용도 |
|---|---|---|
| `ticks` | ticker, timestamp, price, serverTime | 실시간 가격 틱 기록 |
| `candles` | ticker, interval, timestamp, OHLCV, createdAt | 캔들스틱 데이터 저장 (DOM/WS 수집) |
| `strategies` | name, config(JSON), description | 전략 설정 저장 |
| `sessions` | type(backtest/forward/live), strategyId, startTime, endTime, winRate | 매매 세션 기록 |
| `trades` | sessionId, ticker, direction, entryTime, exitTime, entryPrice, exitPrice, result, profit | 개별 거래 기록 |
| `leaderboardEntries` | strategyId, compositeScore, winRate, rank | 백테스트 전략 순위 |

### Repository 패턴

각 테이블에 대해 정적 객체로 CRUD 함수 제공:
- `TickRepository` — add, bulkAdd, count, deleteOlderThan, getByTicker
- `CandleRepository` — add, bulkAdd, getAll, getByTickerAndInterval
- `LeaderboardRepository` — getAll, saveAll

### 인덱스 전략
- 복합 인덱스 `[ticker+timestamp]` / `[ticker+interval+timestamp]`로 자산별+시간순 쿼리 최적화
- auto-increment ID (`++id`)로 삽입 성능 보장

## 코드 스니펫

```typescript
// Dexie 스키마 마이그레이션 패턴
export class PocketDB extends Dexie {
  ticks!: EntityTable<Tick, 'id'>
  candles!: EntityTable<StoredCandle, 'id'>
  leaderboardEntries!: EntityTable<LeaderboardEntry, 'id'>

  constructor() {
    super('PocketQuantTrader')
    this.version(3).stores({
      ticks: '++id, ticker, timestamp, [ticker+timestamp]',
      candles: '++id, ticker, interval, timestamp, [ticker+interval], [ticker+interval+timestamp]',
      leaderboardEntries: '++id, strategyId, compositeScore, winRate, rank, createdAt',
      // ... 기타 테이블
    })
  }
}

// 스키마 버전 추가 시: version 번호만 올리면 Dexie가 자동 마이그레이션
```
