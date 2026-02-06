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

## 아키텍처 개선 과제 (2026-02-06 코드 리뷰)

### P0 — 즉시 해결 (코드 품질/안전성)

**1. `any` 타입 제거**
- `content-script/index.ts:28` — `let wsInterceptor: any = null`
- `lib/data-sender.ts` — `candle: any`, `candles: any[]`, `error: any`
- `lib/notifications/telegram.ts` — `signal: any`, `trade: any`
- `content-script/websocket-parser.ts` — `raw: any`, `data: any`

**2. DOM 셀렉터 중복 제거 (DRY 위반)**
- `lib/types/index.ts`의 `DEFAULT_SELECTORS`와 `content-script/selector-resolver.ts`의 `ROBUST_SELECTORS`가 같은 셀렉터 이중 관리
- `content-script/payout-monitor.ts`에도 자체 SELECTORS 상수 보유
- → 단일 소스(`lib/types/dom-selectors.ts`)로 통합 필요

**3. auto-trader.ts / signal-generator-v2.ts 테스트 부재**
- 핵심 거래/신호 로직에 단위 테스트 없음
- auto-trader: 리스크 관리 6단계 체크, 포지션 사이징 로직
- signal-generator-v2: 투표/RSI+BB/3중 확인 전략

### P1 — 이번 스프린트

**4. 에러 핸들링 일관성**
- 3가지 패턴 혼재: (A) `errorHandler.handle()`, (B) `console.warn/error`, (C) 직접 `try/catch`
- executor.ts에 10+ console 문, data-sender.ts에 catch 블록에서 직접 로깅
- → 중앙 에러 래퍼 `handleError(error, context)` 도입

**5. 설정 관리 분산**
- 4곳에 독립 Config 타입: content-script의 `TradingConfigV2`, auto-trader의 `AutoTraderConfig`, telegram의 `TelegramConfig`, backtest의 `BacktestConfig`
- → `lib/config/index.ts`로 통합 AppConfig + `chrome.storage` 기반 영속화

**6. WebSocket 순환 의존**
- `websocket-parser.ts` ↔ `websocket-interceptor.ts` 양방향 import
- → `websocket-types.ts` 분리

**7. 상대 경로 → `@/` alias 통일**
- 103개 상대 경로 import vs 5개 `@/` alias 사용
- tsconfig에 `@/*` 정의되어 있으나 대부분 미사용
- `@lib/*`, `@content-script/*` 등 세분화된 alias 추가 권장

### P2 — 다음 스프린트

**8. 로깅 일관성**
- `lib/logger` 모듈 존재하나, executor/data-collector/selector-resolver 등 8+ 파일이 `console.*` 직접 사용
- → 전체 모듈을 `loggers.*`로 마이그레이션

**9. 누락 barrel exports**
- `notifications/`, `db/`, `logger/`, `backtest/strategies/`에 index.ts 없음

**10. 레이어 경계 정리**
- `lib/data-sender.ts`는 content-script에서만 사용 → content-script로 이동 검토
- `lib/diagnostics.ts`, `lib/deep-analyzer.ts`, `lib/verification.ts`는 디버깅 전용 → `lib/dev-tools/`로 그룹화

### 심층 아키텍처 분석 (2026-02-06 2차 리뷰)

#### S0 — CRITICAL

**11. ExtensionMessage 타입 안전성 부재**
- `ExtensionMessage<T = unknown>`로 payload 타입이 사라짐 → 모든 핸들러에서 `as Tick`, `as Partial<TradingStatus>` 등 unsafe cast
- 45+ 메시지 타입이 단순 string union, payload와 연결 안 됨
- switch 문에 exhaustiveness check 없음 → 새 메시지 타입 추가 시 누락 가능
- → discriminated union으로 리팩터링:
  ```ts
  type ExtensionMessage =
    | { type: 'TICK_DATA'; payload: Tick }
    | { type: 'STATUS_UPDATE'; payload: Partial<TradingStatus> }
    | { type: 'START_TRADING'; payload: undefined }
    // ...
  ```
- 관련 파일: `lib/types/index.ts:94-149`, `background/index.ts:97-131`, `content-script/index.ts:226-240`

**12. 상태 동기화 레이스 컨디션**
- `background/index.ts`의 `tradingStatus`가 let 변수 — 동시 메시지 처리 시 업데이트 유실 가능
- Content Script의 `tradingConfig`와 Background의 `tradingStatus`가 독립적 — CS 크래시 시 Background는 여전히 isRunning: true
- Side Panel은 초기 fetch 후 push 업데이트 의존 — fetch와 첫 update 사이 stale 윈도우 존재
- → 상태 머신(state machine) 패턴 도입, 또는 최소한 `chrome.storage` 기반 single source of truth

#### S1 — HIGH

**13. WebSocket 이벤트 리스너 메모리 누수 (버그)**
- `websocket-interceptor.ts`의 `setupEventListener()`가 인라인 arrow 함수로 `window.addEventListener` 등록
- `stop()`은 `this.handleEvent`를 제거 시도 — **다른 함수 참조**이므로 리스너가 실제로 제거되지 않음
- → `this.handleEvent = this.handleEvent.bind(this)` 후 같은 참조로 add/remove

**14. PayoutMonitor setInterval 에러 미처리**
- `payout-monitor.ts:37` — `setInterval(() => this.fetchPayouts(), ...)` 내부에 try/catch 없음
- `fetchPayouts()` 예외 시 interval은 계속 실행되며 연쇄 에러 발생 가능
- → async interval 래퍼 또는 try/catch 추가

**15. 텔레그램 봇 토큰 평문 저장**
- `SettingsPanel.tsx` → `chrome.storage.local.set({ telegramConfig })` 로 봇 토큰 평문 저장
- 동일 브라우저의 다른 확장이 storage 접근 가능 (같은 origin은 아니지만 취약점 존재)
- → `chrome.storage.session` 사용 또는 토큰 암호화 고려

**16. WebSocket 데이터 무검증 전달**
- `content-script/index.ts` — WS onPriceUpdate 콜백이 외부 데이터를 검증 없이 `chrome.runtime.sendMessage`로 전달
- 악의적 WS 데이터가 Background까지 도달 가능
- → 최소한 schema validation (zod 등) 또는 필드 존재 체크

#### S2 — MEDIUM

**17. 빌드 최적화 미흡**
- `tsconfig.json`에 `noUnusedLocals: false`, `noUnusedParameters: false` → 데드 코드 누적
- `package.json`에 `better-sqlite3`, `express` 등 서버 전용 의존성이 extension과 같은 프로젝트에 존재
- `manifest.json`의 `web_accessible_resources`가 `<all_urls>` — 불필요하게 넓음

**18. 콜백 리스너 누적 (CandleCollector)**
- `candle-collector.ts`의 `onCandle()` 구독자가 unsubscribe 호출 안 하면 무한 축적
- → WeakRef 기반 리스너 또는 max listener 경고

**19. 타입 시스템 강화 기회**
- 심볼명이 plain `string` → `Map<string, Candle[]>`에 아무 문자열이나 키로 사용 가능
- TelegramConfig의 botToken/chatId도 plain `string` → branded type으로 검증 가능
- TradingConfig의 enabled가 boolean → state machine enum이 더 안전

## 병렬 작업 실행 계획 (2026-02-06)

파일 충돌 분석 기반으로 4단계 배치 실행 계획 수립.

### Batch 1 — 병렬 5세션 (즉시)
| 세션 | 항목 | 수정 파일 |
|------|------|-----------|
| A | #3 테스트 추가 | NEW test files only |
| B | #6+#13+#16 WebSocket 정비 | ws-interceptor, ws-parser, NEW ws-types |
| C | #14+#18 리소스 라이프사이클 | payout-monitor, candle-collector |
| D | #5+#15 설정/보안 | NEW lib/config/, SettingsPanel, telegram |
| E | #17+#9+#10 빌드+정리 | tsconfig, package.json, vite.config, manifest, barrel, file moves |

### Batch 2 — 2세션 동시 (Batch 1 merge 후)
| 세션 | 항목 | 수정 파일 |
|------|------|-----------|
| F | #1+#11+#19 타입 시스템 | types/index.ts 전면, background handler, content-script handler |
| G | #2 DOM 셀렉터 통합 | NEW dom-selectors.ts, selector-resolver, payout-monitor |

### Batch 3 — 2세션 동시 (Batch 2 merge 후)
| 세션 | 항목 | 수정 파일 |
|------|------|-----------|
| H | #4+#8 에러/로깅 통일 | errors/, executor, data-collector 외 8+파일 |
| I | #12+#16 상태 동기화 | NEW lib/state/, background, content-script, useTradingStatus |

### Batch 4 — 단독 (전체 merge 후 마지막)
| 세션 | 항목 | 수정 파일 |
|------|------|-----------|
| J | #7 Import alias 통일 | 전체 .ts/.tsx (103건 교체) |

## 코드 스니펫

````text
// 필요한 경우 최소한의 예시만 기록
````
