# Findings: Tick/Candle 분리

## F1: 기존 timestamp 혼재 현황
- candles 테이블의 timestamp가 ms/sec 혼재 가능
- 수집 서버의 `detectTimestampUnit()`이 자동 감지하지만, 100% 정확하지 않음
- toEpochMs()로 입력 시점에 강제 정규화하면 감지 로직 자체가 불필요해짐

## F2: OHLC 동일 tick = 페이아웃 판별 기준
- PO OTC 자산의 tick은 OHLC가 모두 동일 (가격 1개)
- OHLC 동일 + 0~100 범위 → 페이아웃 데이터
- ticks 테이블에는 close만 저장 (price 컬럼)
- 페이아웃 데이터는 ticks에 저장하지 않음

## F3: 증분 캐시 전략
- candles_1m 캐시는 MAX(ts_ms) 이후의 tick만 처리
- UPSERT로 중복 방지
- 전체 재생성은 force_resample 쿼리 파라미터로 가능

## F4: 부동소수점 정밀도
- `Math.floor(1.001 * 1000)` = 1000 (IEEE 754 한계)
- 실제 10자리 timestamp (1770566065.342)에서는 문제 없음
- 작은 소수 timestamp는 실무에서 발생하지 않으므로 무시 가능

## F5: 하위 호환 전략
- 기존 candles 테이블 유지 (삭제하지 않음)
- 모든 수집 엔드포인트에서 candles + ticks 이중 저장
- 백테스트는 candles_1m → ticks → candles 순으로 폴백
- 마이그레이션 엔드포인트와 스크립트 제공
