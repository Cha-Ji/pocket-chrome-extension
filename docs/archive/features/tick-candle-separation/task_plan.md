# Tick/Candle 분리 + Timestamp 정규화

## 목표
- tick은 ticks 테이블, 캔들은 candles_1m 캐시 테이블에 저장 (책임 분리)
- 백테스트는 candles_1m 캐시 우선, 없으면 ticks에서 생성
- DB timestamp를 ms 정수(ts_ms)로 통일

## 체크리스트

### Prompt 1: Tick/Candle 테이블 분리
- [x] SQLite에 ticks 테이블 추가 (symbol, ts_ms, price, source)
- [x] SQLite에 candles_1m 테이블 추가 (symbol, ts_ms, OHLCV, source)
- [x] 기존 candles 테이블 유지 (하위 호환)
- [x] 수집 서버: 입력 데이터를 ticks + candles(레거시) 이중 저장
- [x] 수집 서버: 페이아웃 데이터 필터링 (ticks에 저장 안 함)
- [x] 리샘플링 캐시 생성 로직 (ticks → candles_1m, 증분 방식)
- [x] 백테스트: candles_1m 우선 → ticks 폴백 → candles(레거시) 폴백
- [x] 백테스트: CLI 옵션 추가 (--symbol, --source, --start, --end)
- [x] 신규 API: POST /api/tick, POST /api/ticks/bulk
- [x] 신규 API: GET /api/candles_1m (자동 캐시 생성)
- [x] 신규 API: POST /api/candles_1m/resample (캐시 트리거)
- [x] 신규 API: POST /api/migrate/candles-to-ticks (마이그레이션)
- [x] 통계 API: GET /api/ticks/stats, GET /api/candles_1m/stats

### Prompt 2: Timestamp 정규화
- [x] toEpochMs() 유틸 함수 (src/lib/utils/time.ts)
- [x] toEpochSec() 역변환 함수
- [x] isMilliseconds() 판별 함수
- [x] diagnoseTimestamps() 진단 함수
- [x] 수집 서버: 모든 insert 전에 toEpochMs() 적용
- [x] 백테스트: 레거시 candles 로드 시 toEpochMs() 적용
- [x] 진단/마이그레이션 스크립트 (scripts/diagnose-timestamps.ts)
- [x] 단위 테스트 32개 통과

### 테스트/검증
- [x] toEpochMs 유닛 테스트 32개 통과
- [x] tick-resampler 기존 테스트 33개 통과
- [x] 전체 테스트 스위트 (기존 테스트 깨지지 않음 확인)
