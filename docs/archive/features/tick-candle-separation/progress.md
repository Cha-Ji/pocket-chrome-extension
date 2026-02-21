# Progress: Tick/Candle 분리 + Timestamp 정규화

## (2026-02-12) 구현 완료

### 완료 내용
1. **src/lib/utils/time.ts** — toEpochMs, toEpochSec, isMilliseconds, diagnoseTimestamps
2. **src/lib/utils/time.test.ts** — 32개 테스트 통과
3. **scripts/data-collector-server.ts** — 대폭 리팩토링
   - ticks, candles_1m 테이블 추가
   - 모든 입력에 toEpochMs() 적용
   - ticks + candles 이중 저장
   - resampleAndCache() 증분 캐시 함수
   - 신규 API 9개 추가
4. **scripts/backtest-from-sqlite.ts** — 대폭 리팩토링
   - candles_1m 캐시 우선 로딩
   - ticks → resample → cache 폴백
   - 레거시 candles 폴백
   - CLI 옵션 (--symbol, --source, --start, --end)
   - toEpochMs()로 timestamp 정규화
5. **scripts/diagnose-timestamps.ts** — 신규 진단/마이그레이션 스크립트

### 테스트 결과
- time.test.ts: 32/32 통과
- tick-resampler.test.ts: 33/33 통과
- 전체 테스트 스위트: 기존 테스트 깨지지 않음

### 다음 행동
- 실환경에서 데이터 수집 서버 실행하여 ticks 테이블에 데이터 쌓이는지 확인
- `npx tsx scripts/diagnose-timestamps.ts --migrate`로 기존 데이터 마이그레이션
- 백테스트 2회 실행하여 2회차 캐시 성능 개선 확인
