# Dexie (IndexedDB) 캔들 저장/조회 성능 최적화

## 목표
대용량(수만~수십만) 캔들 데이터에서 성능 유지되도록 Dexie 레이어 개선

## 체크리스트

### 스키마/인덱스
- [x] Version 5: 기존 중복 캔들 데이터 정리 (migration)
- [x] Version 6: `&[ticker+interval+timestamp]` 유니크 복합 인덱스 적용

### 저장 최적화
- [x] `bulkAdd()`: 캔들마다 중복체크+add → 배치 키 조회 + 단일 트랜잭션 bulkAdd
- [x] `add()`: ConstraintError 핸들링 (중복 무시)

### 조회 최적화
- [x] `getTickers()`: `toArray()` → `orderBy('ticker').uniqueKeys()`
- [x] `getStats()`: `toArray()` 전체 로드 → 인덱스 기반 count/uniqueKeys/first/last

### 테스트
- [x] 기존 22개 테스트 통과 (db-v4.test.ts)
- [x] 신규 20개 테스트 추가 (db-perf.test.ts)
- [x] 벤치마크 결과 확인

### 문서화
- [x] task_plan.md
- [x] findings.md
- [x] progress.md
