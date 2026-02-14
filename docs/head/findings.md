# 발견사항

## 결정 사항

- (2026-01-26) Chrome Extension Manifest V3 + TypeScript 기반으로 구현
- (2026-01-26) UI는 React + Tailwind CSS, Side Panel 중심으로 구성
- (2026-01-26) 데이터 저장은 IndexedDB(Dexie.js)로 설계

## 제약/가정

- (2026-01-26) 브라우저 자동화 감지로 계정 제재 위험이 존재
- (2026-01-26) DOM 구조 변경에 따라 셀렉터 유지보수 필요
- (2026-01-26) 틱 데이터는 대용량이므로 주기적 정리/압축 필요

## 핵심 정보

- (2026-01-26) 목표: 데이터 수집, 분석, 백테스트, 자동 매매를 수행하는 크롬 익스텐션
- (2026-01-26) 핵심 철학: 감정 배제, 기계적 원칙 매매, 데이터 기반 의사결정
- (2026-01-26) 주요 구성 요소
  - Content Script: DOM 감시로 실시간 가격/차트 캡처, 버튼 클릭 시뮬레이션
  - Background Service Worker: 자동 매매 루프 및 탭 상태 관리
  - Side Panel UI: 시작/정지, 로그, 백테스트 결과 표시
  - Local DB: 티커 히스토리/거래/백테스트 결과 저장
- (2026-01-26) 핵심 기능
  - 데이터 수집: MutationObserver 또는 WebSocket 인터셉트
  - 티커 이동 자동화: 자산 선택 UI 제어 또는 URL 파라미터 조작
  - 자동 매매: 진입 조건 만족 시 CALL/PUT 주문, 슬리피지 및 리스크 관리
  - 지표 오버레이: 차트 위 캔버스 레이어, RSI/BB/MA 계산
  - 백테스팅/로깅: 로컬 데이터 기반 리플레이, 승률/손익 리포트
- (2026-01-26) DB 스키마 요약
  - ticks: ticker, timestamp, price, serverTime
  - strategies: name, config, description
  - sessions: type, startTime, endTime, initialBalance, finalBalance, winRate
  - trades: sessionId, ticker, direction, entry/exit time/price, result, profit, snapshot
- (2026-01-26) 백테스트 흐름: 데이터 로드 -> 시간 재생 -> 신호 -> 가상 주문 -> 결과 판정
- (2026-01-26) 포워드 테스트 흐름: 실시간 수집 -> 가상 주문 -> 만기 결과 업데이트
- (2026-01-26) 로드맵(요약): 기반 구축 -> 데이터 파이프라인 -> 분석/시각화 -> 자동화 -> 안정화/최적화

## 자동매매 안정성 수정 (2026-02-14)

### symbol 정규화 규칙
- `normalizeSymbol()` (src/lib/utils/normalize.ts) 도입
- 규칙: trim → '#' 제거 → spaces/underscores → '-' → suffix '_otc' → '-OTC' → uppercase
- 예: `'#eurusd_otc'` → `'EURUSD-OTC'`
- 적용 대상: candle-collector.addTickFromWebSocket, index.ts onPriceUpdate, onHistoryReceived, evaluateTIF60

### ws timestamp 통일
- `normalizeTimestampMs()` (src/lib/utils/normalize.ts) 도입
- ts < 1e12 이면 초 단위로 간주하여 ×1000, 그 외 ms 그대로
- 적용 대상: candle-collector.addTickFromWebSocket, index.ts onPriceUpdate/onHistoryReceived seed

### TRADE_EXECUTED 단일 발행
- executor.ts 내부의 `chrome.runtime.sendMessage({ type: 'TRADE_EXECUTED' })` 제거
- executeSignal() (index.ts)에서만 발행하며, signalId를 포함
- 실패 시에도 `result: false` + error 메시지를 포함하여 background에 전달

### V2 신호 필터 단일화
- V2 신호(signalGenerator.onSignal)도 handleNewSignal() 경유
- minPayout, onlyRSI, enabled 체크가 모든 신호 소스에 동일하게 적용

### selectStrategy() 레짐 조건 명확화
- `if (regime !== 'ranging' && adx >= 25)` → `if (regime !== 'ranging')` 로 단순화
- detectRegime()은 ADX < 25를 'ranging'으로 정의하므로 regime 비교만으로 충분

## 전략 실행 아키텍처 (2026-02-14)

### SBB-120 최소 캔들 요구량
- SBB-120은 `bbPeriod(20) + lookbackSqueeze(120) = 최소 140 candles` 필요
- SignalGeneratorV2의 candleBuffer 상한을 250으로 설정 (`MAX_CANDLE_BUFFER`)
- 100개 제한 시 SBB-120은 절대 발동 불가

### V2 히스토리 시딩
- WebSocket history 수신 시 `signalGenerator.setHistory(symbol, candles)` 호출
- 이를 통해 초기 50~140분 대기 없이 즉시 전략 평가 가능
- symbol 키 정규화는 `onHistoryReceived` 내 3-level fallback 로직 재사용

### V2 신호 실행 경로 단일화
- V2 신호: `addCandle()` → 내부 `onSignal` 리스너 → `handleNewSignal()` → `executeSignal()`
- TIF-60 외부 신호: `evaluateTIF60()` → `handleNewSignal()` → `executeSignal()`
- 모든 신호가 `handleNewSignal()`을 경유하여 minPayout/onlyRSI/enabled 필터를 공유

### TIF-60 평가 타이밍
- 기존: 캔들 이벤트(1분 1회) → 개선: 틱 이벤트(wsInterceptor.onPriceUpdate)에서 300ms throttle
- `now` 계산: `ticks[last].timestamp` → `Math.max(all timestamps)` (비순서 틱 대응)

### Signal.strategyId 구조
- `strategyId`: 기계 집계용 고정 문자열 (e.g. 'SBB-120', 'RSI-BB', 'ZMR-60', 'TIF-60')
- `strategy`: 사람이 읽는 reason 텍스트 (기존 필드, 하위 호환)
- `generateLLMReport`는 `strategyId` 기준 집계 (기존 `split(':')` 휴리스틱 제거)

### 백테스트 latency 반영
- `latencyMs`가 entryTime과 entryPrice 모두에 영향
- 진입 시점(signal + latency)에서 가장 가까운 캔들의 close를 entryPrice로 사용
- 만기(expiry) 기준도 latency-adjusted entryTime 기준으로 계산
- optimize 정렬: 'netProfit'(기본), 'expectancy', 'scorecard'(복합 점수) 옵션 추가

## 관련 참조

| 주제 | 문서 위치 |
|------|----------|
| DOM 셀렉터 카탈로그 | [architecture/content-script/dom-selectors/](../architecture/content-script/dom-selectors/) |
| Forward Test 분석 | [issues/PO-13/](../issues/PO-13/) |
| 실시간 데이터 수집 | [issues/PO-11/](../issues/PO-11/) |
| 에러 처리 모듈 | [features/error-handling/](../features/error-handling/) |
| Bitshin 전략 | [strategies/bitshin-option/](../strategies/bitshin-option/) |
| WS 후킹 리서치 | [research/tampermonkey-integration/](../research/tampermonkey-integration/) |
