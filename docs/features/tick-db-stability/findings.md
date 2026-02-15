# Tick DB Stability — Findings

## F1: 기존 문제 분석

### 직접 저장 방식의 문제점
- `handleTickData`가 매 tick마다 `TickRepository.add()` 호출 → 고빈도에서 IDB write 과부하
- `bulkAdd()`는 중복 key시 전체 배치 실패 (ConstraintError)
- retention이 count>10000일 때만 24시간 이전 삭제 → 단시간 폭증 방어 불가

### 설계 결정
- **bulkPut > bulkAdd**: Dexie의 `bulkPut`은 insert-or-replace 시맨틱으로 ConstraintError 없음
- **ticks 테이블 PK가 `++id`**: unique compound index가 없어 동일 ticker+timestamp 중복 가능하나,
  샘플링으로 입력 빈도를 제한하므로 실질적 문제 없음
- **flushIntervalMs 500ms**: WebSocket tick 빈도(~100ms)와 DB write 비용 사이 균형점

## F2: 기본 정책 값

| 파라미터 | 기본값 | 근거 |
|----------|--------|------|
| sampleIntervalMs | 500ms | 1초 2틱이면 충분한 가격 해상도 |
| batchSize | 100 | IDB bulkPut 최적 범위 (50~200) |
| flushIntervalMs | 500ms | 반응성과 배치 효율 균형 |
| maxTicks | 5000 | ~42분 분량 (2틱/초 기준), IDB 부하 적정 |
| maxAgeMs | 2시간 | 최근 데이터만 유지, 장기 데이터는 candles 테이블 |
| retentionIntervalMs | 30초 | 삭제 빈도 vs 오버헤드 균형 |

## F3: TickBuffer 에러 복구 전략

- flush 실패시 tick은 buffer 앞에 재삽입 (batchSize까지만, 무한 성장 방지)
- onFlushError 콜백으로 Background의 errorHandler에 전달
- 연속 실패해도 서비스 크래시 없이 최신 tick만 buffer에 보존
