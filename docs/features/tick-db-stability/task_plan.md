# Tick DB Stability — Task Plan

## 목표
고빈도 tick 데이터 하에서 IndexedDB(ticks) 안정성 확보:
- 배치 저장 + 샘플링 + 강제 retention

## 체크리스트

### 1. TickRepository 강화
- [x] `bulkPut()` — upsert 기반 bulk write, 중복 timestamp 에러 방지
- [x] `deleteOldestToLimit(maxCount)` — count 기반 강제 삭제
- [x] `getStats()` — count/oldest/newest 관측성

### 2. TickStoragePolicy 타입
- [x] `src/lib/types/index.ts`에 `TickStoragePolicy` 인터페이스 추가

### 3. TickBuffer (배치 + 샘플링)
- [x] `src/background/tick-buffer.ts` 모듈 생성
- [x] 티커별 샘플링 (sampleIntervalMs)
- [x] batchSize 또는 flushIntervalMs 기준 flush
- [x] flush 실패 시 buffer 재큐잉 + onFlushError 콜백

### 4. Retention 정책
- [x] maxAgeMs 기반 오래된 tick 삭제
- [x] maxTicks 기반 count cap 삭제
- [x] 주기적 retention sweep (retentionIntervalMs)

### 5. Background 통합
- [x] `handleTickData` → TickBuffer.ingest() 교체
- [x] cleanup alarm → TickBuffer.runRetention() 사용
- [x] GET_TICK_BUFFER_STATS 핸들러 추가

### 6. 테스트
- [x] TickRepository 신규 API 테스트 (10개)
- [x] TickBuffer 테스트 (16개)
- [x] 기존 테스트 752개 전체 통과
