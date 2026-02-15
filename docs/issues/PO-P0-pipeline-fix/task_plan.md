# P0 Bug Fix + Pipeline Stabilization Task Plan

## P0: 즉시 수정 (Critical)

- [x] P0-1: TickRepository.bulkPut() 논리 확인 → 이미 정상 (기존 코드 검증 완료)
- [x] P0-2: handleNewSignal() onlyRSI 필터 → evaluateSignalGates() 순수 함수 사용으로 교체
  - [x] StrategyFilter(allowlist/denylist) 지원
  - [x] 테스트 7개 추가 (기존 5 + 신규 7 = 12)
- [x] P0-3: pendingTrades 누수 제거 — settleTrade에서 clearTimeout + 즉시 delete
  - [x] 테스트 2개 추가 (timer clear + idempotent)
- [x] P0-4: WS_PRICE_UPDATE 폭주/ERROR 로깅 해결
  - [x] RELAY_MESSAGE_TYPES에 WS_PRICE_UPDATE/WS_MESSAGE/WS_CONNECTION 추가
  - [x] THROTTLE_CONFIG에 WS_PRICE_UPDATE: 500ms 추가
  - [x] 테스트 7개 추가 (port-channel.test.ts)

## P1: 고도화

- [x] P1-1: saveHistoryCandlesToDB — candleCount를 total로 수정
  - [x] CandleRepository.count(symbol, interval) 사용
  - [x] 테스트 3개 추가 (candle-dataset.test.ts)
- [x] P1-2: sendResponse 누락 방지
  - [x] background/index.ts: .catch() + errorHandler.handle + sendResponse({error})
  - [x] message-handler.ts: .catch() + console.error + sendResponse({error})
  - [x] 테스트 1개 추가
- [x] P1-3: SET_CONFIG_V2 검증/정규화
  - [x] validateConfigUpdate() 순수 함수 추출
  - [x] tradeAmount, minPayout, maxDrawdown, maxConsecutiveLosses 범위 검증
  - [x] 잘못된 값은 strip, valid 값만 적용
  - [x] 테스트 9개 추가

## 테스트 결과

- 전체: 855 tests passed (45 suites), 0 failures
- 신규: 27 tests 추가
- TypeScript: 컴파일 에러 0건
