# Dexie 성능 최적화 — Findings

## 병목 지점 분석

### 1. `CandleRepository.bulkAdd()` — CRITICAL
- **Before**: N개 캔들에 대해 `for` 루프 → `.where().equals().first()` + `.add()` = **2N개 IDB 트랜잭션**
- **복잡도**: O(N) DB reads + O(N) DB writes
- **After**: 배치 내 중복 제거 → ticker+interval 그룹별 `.keys()` 일괄 조회 → `.bulkAdd()` 단일 트랜잭션
- **복잡도**: O(G) 키 조회 + O(1) bulkAdd (G = ticker+interval 그룹 수, 보통 1~3)

### 2. `CandleRepository.getTickers()` — HIGH
- **Before**: `db.candles.toArray()` → 전체 테이블 메모리 로드 → `Set` 변환
- **복잡도**: O(N) 메모리 + O(N) CPU
- **After**: `db.candles.orderBy('ticker').uniqueKeys()`
- **복잡도**: O(K) (K = 고유 티커 수, 보통 5~20)

### 3. `CandleRepository.getStats()` — HIGH
- **Before**: `db.candles.toArray()` → 전체 테이블 순회하며 Map 집계
- **복잡도**: O(N) 메모리 + O(N) CPU
- **After**: `count()` + `orderBy('[ticker+interval]').uniqueKeys()` + 그룹별 `count()` + `orderBy('timestamp').first()/last()`
- **복잡도**: O(K) 쿼리 (K = 고유 ticker+interval 쌍)

### 4. DBMonitorDashboard 10초 폴링 — MEDIUM
- **Before**: 매 10초마다 `getStats()` 호출 → 전체 테이블 O(N) 로드
- **After**: `getStats()` 자체가 O(K)로 개선되어 자동으로 해결됨

## 스키마 마이그레이션 전략

### 문제: 유니크 인덱스 적용 시 기존 중복 데이터
- IndexedDB에서 유니크 인덱스 생성 시 기존 데이터에 중복이 있으면 실패
- Dexie의 upgrade 함수는 스키마 변경 후 실행되므로 같은 버전에서 dedup 불가

### 해결: 2단계 버전 업그레이드
1. **Version 5**: 동일 스키마 + upgrade 함수에서 중복 제거 (`toArray` → `Map` dedup → `bulkDelete`)
2. **Version 6**: `&[ticker+interval+timestamp]` 유니크 인덱스 적용 (중복 이미 제거됨)

## 벤치마크 결과 (fake-indexeddb, Vitest)

| 작업 | 시간 |
|------|------|
| bulkAdd 1000 신규 캔들 | ~214ms |
| bulkAdd 1000 중복 캔들 (skip) | ~3646ms |
| getStats 1000 캔들 (3 pairs) | ~12ms |
| getTickers 500 캔들 (5 tickers) | ~0.9ms |

## Dexie v4 API 참고

- `Table.orderBy(index).uniqueKeys()`: 인덱스의 고유 키 반환 (레코드 로드 없음)
- `Collection.keys()`: 인덱스 키 반환 (compound index는 배열)
- `db.transaction('rw', table, fn)`: 단일 트랜잭션으로 묶기
- `Table.bulkAdd(items)`: 배치 insert (ConstraintError 시 BulkError)
- `&[compound+index]`: 유니크 복합 인덱스 선언

## 검증 방법 (개발자 도구)

### Chrome DevTools에서 확인할 지표:
1. **Application → IndexedDB → PocketQuantTrader → candles**
   - 레코드 수 확인
   - `[ticker+interval+timestamp]` 인덱스가 unique로 표시되는지 확인
2. **Performance 탭**
   - `bulkAdd` 호출 시 IDB 트랜잭션 수 확인 (이전 2N → 현재 ~2-3)
3. **Console에서 직접 측정**:
   ```js
   const t0 = performance.now();
   await CandleRepository.getStats();
   console.log(`getStats: ${performance.now() - t0}ms`);
   ```
