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

## 코드 스니펫

````text
// 필요한 경우 최소한의 예시만 기록
````
