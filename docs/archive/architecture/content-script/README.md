# Content Script 아키텍처

**역할**: 실시간 가격/차트 캡처, UI 이벤트 시뮬레이션, WebSocket 데이터 수신

## 핵심 정보
- MutationObserver로 가격 변화 감지
- WebSocket 인터셉트 (Tampermonkey Bridge 경유)
- 매수/매도/티커 변경 버튼 클릭 시뮬레이션

## 제약사항
- DOM 구조 변경 시 셀렉터 유지보수 필요
- Isolated World에서 실행 → Main World 접근 불가 (Bridge 필요)

## 진입점 구조 (`src/content-script/`)

`index.ts`는 공유 컨텍스트를 생성하고 `start()`만 호출하는 얇은 진입점이다.
실제 로직은 `app/` 하위 모듈로 분리되어 있다.

```
index.ts                    ← manifest.json 진입점 (start() 호출만)
app/
├── context.ts              ← 공유 상태 (ContentScriptContext) 정의 + 팩토리
├── bootstrap.ts            ← initialize, loadSelectors, waitForElement, Telegram 리스너
├── ws-handlers.ts          ← WebSocket/candle/payout/indicator/signal 핸들러, TIF-60
├── trade-lifecycle.ts      ← handleNewSignal, executeSignal, scheduleSettlement, settleTrade
└── message-handler.ts      ← chrome.runtime.onMessage 디스패치, getSystemStatus
```

### 모듈별 책임

| 모듈 | 파일 | 책임 |
|------|------|------|
| context | `app/context.ts` | `ContentScriptContext` 인터페이스, `createContext()` 팩토리, 상수 (`TRADE_COOLDOWN_MS`, `SETTLEMENT_GRACE_MS`), `PendingTrade` 타입 |
| bootstrap | `app/bootstrap.ts` | 초기화 시퀀스 (`initialize`), DOM 대기 (`waitForElement`), 셀렉터 로딩, Telegram 스토리지 리스너 |
| ws-handlers | `app/ws-handlers.ts` | `setupAllHandlers()` — 5개 핸들러 등록 (candle, payout, indicator, signal, websocket), TIF-60 틱 전략 평가 |
| trade-lifecycle | `app/trade-lifecycle.ts` | 신호 필터링 (`handleNewSignal`), 거래 실행 (`executeSignal`), 만기 정산 (`scheduleSettlement`, `settleTrade`) |
| message-handler | `app/message-handler.ts` | `chrome.runtime.onMessage` 리스너 등록, 메시지 타입별 디스패치, 시스템 상태 조회 |

### 데이터 흐름

```
index.ts
  │
  ├── createContext()                    ← 공유 상태 생성
  ├── registerMessageListener(ctx)       ← 메시지 리스너 등록
  ├── setupTelegramStorageListener(ctx)  ← Telegram 설정 변경 감지
  └── start()
       └── initialize(ctx)               ← 모듈 초기화
            ├── loadSelectors()
            ├── 모듈 인스턴스 생성 → ctx에 저장
            ├── setupAllHandlers(ctx)     ← 5개 핸들러 등록
            └── 백그라운드 모니터 시작
```

### 공유 컨텍스트 패턴

모든 모듈은 `ContentScriptContext` 객체를 첫 번째 인자로 받는다.
이 패턴으로 모듈 간 상태 공유 + 테스트 시 독립적인 컨텍스트 주입이 가능하다.

```typescript
// 각 모듈 함수의 시그니처
async function initialize(ctx: ContentScriptContext): Promise<void>
async function handleNewSignal(ctx: ContentScriptContext, signal: Signal): Promise<void>
async function handleMessage(ctx: ContentScriptContext, message: ExtensionMessage): Promise<unknown>
```

## 하위 모듈 (기능별)

| 모듈 | 설명 | 문서 |
|------|------|------|
| dom-selectors | DOM 셀렉터 카탈로그, 데모 모드 감지 | [상세 문서](dom-selectors/) |
| data-capture | MutationObserver 기반 가격 캡처 | 구현체: `src/content-script/data-collector.ts` |
| ui-simulation | CALL/PUT 버튼 클릭, 자산 전환 | 구현체: `src/content-script/executor.ts` |

## 관련 소스
- `src/content-script/index.ts` (진입점 — start()만 호출)
- `src/content-script/app/` (핵심 로직 모듈)
- `src/content-script/websocket-interceptor.ts` (WS 수신)
- `src/content-script/data-collector.ts` (가격 캡처)
- `src/content-script/executor.ts` (거래 실행)
