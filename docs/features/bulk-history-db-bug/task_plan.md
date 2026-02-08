# Bulk History DB 미저장 버그 수정 계획

## 수정 항목

- [x] **Fix 1**: websocket-interceptor.ts - `binary_payload` 타입을 파서로 재전달
- [x] **Fix 2**: websocket-parser.ts - Socket.IO 프리픽스 제거 후 JSON 파싱
- [ ] **Fix 3** (선택): tampermonkey extractPayload - `42[...]` 형식 지원
- [x] 빌드 확인 (8.74s)
- [x] 단위 테스트 25/25 통과 (Socket.IO prefix 5케이스 추가)

## 실환경 검증

- [x] 파이프라인 독립 검증 (콘솔 postMessage 테스트)
  - [x] 테스트 A: 가짜 히스토리 2개 캔들 → **성공**
    - Parser: `✅ History parsed: 2 candles from event 'updateHistoryNewFast'`
    - Interceptor: `Candle History Detected! Count: 2`
    - DataSender: `✅ Bulk saved: 2 candles (symbol: #EURUSD_OTC)`
  - Fix 1 (VALID_PARSED_TYPES) + Fix 2 (Socket.IO prefix) 모두 실환경 정상 동작 확인
- [ ] Miner 자동 수집 E2E 테스트 (자산 전환 버그 해결 후)

## 별도 이슈: 자산 전환 실패

- [x] **Fix 3**: payout-monitor.ts — 자산 전환 unavailable 오탐 수정
  - [x] 고정 대기(4s) → 폴링 기반 대기(15s) 전환
  - [x] `.asset-inactive` 탐색을 차트 영역으로 스코프 제한
  - [x] `getBoundingClientRect()` 추가 가시성 체크
  - [x] `findChartInactiveEl()` 헬퍼 추출
  - [x] 디버그 로깅 강화
- [x] 빌드 성공 (8.66s)
- [x] 단위 테스트 25/25 통과
- [ ] Miner 자동 수집 E2E 테스트 (실환경 검증)
