# 발견사항

## 결정 사항

- (2026-01-26) Chrome Extension Manifest V3 + TypeScript 기반으로 구현
- (2026-01-26) UI는 React + Tailwind CSS, Side Panel 중심으로 구성
- (2026-01-26) 데이터 저장은 IndexedDB(Dexie.js)로 설계
- (2026-02-14) **이중 저장소 아키텍처 문서화**: IndexedDB(트레이딩 상태)와 Local Collector/SQLite(시장 데이터 아카이브)의 역할 분리를 명확히 문서화. `docs/architecture/local-database/`와 `docs/architecture/local-collector/`로 분리, `docs/head/map.md`에 교차참조 추가

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

## 전략 실행 게이트 구조 개선 (2026-02-15)

### StrategyFilter: onlyRSI 대체
- `TradingConfigV2.onlyRSI: boolean`을 `strategyFilter: StrategyFilter`로 대체
- 3가지 모드: `'all'` (필터 없음), `'allowlist'` (허용 목록), `'denylist'` (차단 목록)
- `patterns: string[]`로 strategyId 또는 strategyName에 대한 부분 문자열 매칭 (대소문자 무관)
- 하위 호환: `strategyFilter` 미설정 시 `onlyRSI=true`는 `{ mode: 'allowlist', patterns: ['RSI'] }`로 변환
- 소스: `src/lib/trading/signal-gate.ts`

### 게이트 평가 순서 명확화
1. **disabled**: `config.enabled === false`
2. **payout**: 현재 자산 payout < minPayout 또는 payout 확인 불가
3. **strategy**: strategyFilter (allowlist/denylist) 매칭
4. **executing**: 동시 거래 방지 (isExecutingTrade)
5. **cooldown**: 최소 간격 미충족
- 각 단계에서 차단 시 `gate` + `reason` 로그 남김

### 결정: 게이트 로직을 순수 함수로 분리
- **이유**: content-script/index.ts의 handleNewSignal()에 혼재된 필터 로직을 테스트 불가능했음
- **방안**: `evaluateSignalGates(ctx: GateContext): GateResult` 순수 함수 추출
- **효과**: 22개 unit test로 모든 게이트 조합 검증 가능

## Pending Trade 정산 신뢰성 개선 (2026-02-15)

### 문제: 탭 리로드 시 pending trade 유실
- 기존: `Map<number, PendingTrade>` + `setTimeout`으로만 관리
- 페이지 리로드/확장 재시작 시 모든 pending trade와 타이머 소실

### 해결: chrome.storage.session 기반 복구
- `pending-trade-store.ts` 모듈 도입
- `scheduleSettlement()` 시 `settlementAt` (절대 타임스탬프) 저장
- `restorePendingTrades()`: 초기화 시 저장소에서 복원, 미래 건은 재스케줄, 과거 건은 즉시 정산
- `settleTrade()` 후 즉시 스냅샷 갱신

## 백테스트 Scoring 프로필 (2026-02-15)

### 문제: 단일 가중치로 다양한 트레이딩 스타일 대응 불가
### 해결: 3가지 프로필 제공
| 프로필 | 특징 | 대상 |
|--------|------|------|
| `default` | 균형 (문서 기준표 일치) | 일반 사용 |
| `stability` | MDD/연속손실/안정성 비중↑ | 소액/보수적 |
| `growth` | EV/이익팩터/거래횟수 비중↑ | 대액/적극적 |

### 리더보드 가중치 정렬
- `leaderboard-types.ts`의 `DEFAULT_WEIGHTS` 조정: winRate 0.35→0.30, recoveryFactor 0.10→0.15
- 리더보드(상대 비교)와 scoring.ts(절대 평가)의 역할 구분을 주석으로 명확화

## Background 핸들러 분리 (2026-02-15)

### 목적: 0% 커버리지 구간 테스트 가능화
- `src/background/handlers/trade-handlers.ts`: TRADE_EXECUTED, FINALIZE_TRADE, GET_TRADES 핸들러 추출
- 의존성 주입 패턴(`TradeHandlerDeps`) 사용으로 Chrome API 없이 테스트 가능
- 8개 unit test 추가 (idempotent finalize, fallback 값, broadcast 검증)
- **(2026-02-15 추가)** `background/index.ts`의 인라인 핸들러를 추출 함수로 교체 완료
  - `getTradeHandlerDeps()` 브릿지로 `TradeRepository`, `tradingStatus`, `broadcast` 주입
  - 에러 핸들링(POError/errorHandler)은 `*WithErrorHandling` 래퍼에서 유지

## P0 버그 수정 (2026-02-15)

### entryPrice 검증 순서 (content-script/index.ts executeSignal)
- **문제**: `tradeExecutor.executeTrade()` (DOM 클릭, 비가역)이 entryPrice 검증보다 먼저 실행됨
  - entryPrice=0이면 `return`으로 빠져나가 DB에 미기록 → 거래는 실행되었지만 추적 불가
- **수정**: entryPrice를 거래 실행 전에 결정 (candleCollector → signal.entryPrice → 0 fallback)
  - 실행 후에도 최신 tick으로 entryPrice 갱신 시도
  - entryPrice=0이어도 DB에 반드시 기록 (추적 > 정확도)

### exitPrice=0 무조건 LOSS 판정 (content-script/index.ts settleTrade)
- **문제**: 정산 시 exitPrice를 1회만 조회, 실패 시 즉시 LOSS 판정
  - WebSocket 지연이나 심볼 불일치로 팬텀 LOSS 발생 → 통계 왜곡
- **수정**: `getExitPriceWithRetry(ticker, 3, 500ms)` 도입
  - 3회 재시도, 500ms 간격
  - tick 데이터 없으면 최신 캔들 close를 fallback으로 사용
  - 최종 불가 시 TIE (중립, profit=0) 판정 → LOSS보다 보수적이면서도 공정
- **결정 이유**: LOSS는 실제 결과를 왜곡하고 전략 평가에 부정적 영향. TIE는 중립적이며 통계에 미치는 영향 최소화

## 관련 참조

| 주제 | 문서 위치 |
|------|----------|
| DOM 셀렉터 카탈로그 | [architecture/content-script/dom-selectors/](../architecture/content-script/dom-selectors/) |
| Forward Test 분석 | [issues/PO-13/](../issues/PO-13/) |
| 실시간 데이터 수집 | [issues/PO-11/](../issues/PO-11/) |
| 에러 처리 모듈 | [features/error-handling/](../features/error-handling/) |
| Bitshin 전략 | [strategies/bitshin-option/](../strategies/bitshin-option/) |
| WS 후킹 리서치 | [research/tampermonkey-integration/](../research/tampermonkey-integration/) |
