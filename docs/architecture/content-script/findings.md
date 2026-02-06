# 발견사항 — Content Script

## 결정 사항

- (2026-01-26) Content Script는 실시간 가격/차트 캡처와 UI 이벤트 시뮬레이션을 담당
- (2026-02-06) WebSocket 인터셉트를 주력 데이터 수집 경로로 확정 (DOM 파싱은 보조)
- (2026-02-06) Tampermonkey 브릿지 경유 방식 채택 — Extension 자체 스크립트 주입은 CSP 제약으로 비활성화

## 제약/가정

- (2026-01-26) DOM 구조 변경에 따라 셀렉터 유지보수 필요
- (2026-02-06) Pocket Option은 React 기반 SPA → 일반 `click()` 이벤트가 동작하지 않는 경우 있음
- (2026-02-06) `forceClick()` 또는 React 내부 `__reactProps` 접근으로 우회 필요
- (2026-02-06) Content Script는 Isolated World에서 실행 → 페이지 JS 변수 접근 불가 → `window.postMessage` 브릿지 사용

## 핵심 정보

- (2026-01-26) MutationObserver로 가격 변화 감지
- (2026-01-26) WebSocket 인터셉트 방식은 고급 옵션으로 검토 → **(2026-02-06) 현재 주력으로 승격**
- (2026-01-26) 매수/매도/티커 변경 버튼 클릭 시뮬레이션 필요

### 진입점: `src/content-script/index.ts`

10개 이상의 하위 모듈을 초기화하고 조합하는 오케스트레이터:

**데이터 수집 모듈**:
- `DataCollector` — MutationObserver 기반 DOM 가격 캡처, Tick 생성 후 Background 전송
- `CandleCollector` — DOM에서 OHLCV 캔들 수집, 틱→캔들 변환, IndexedDB 직접 저장
- `WebSocketInterceptor` — Tampermonkey `pq-bridge` 경유 WebSocket 메시지 수신, `pq-content`로 직접 전송
- `WebSocketParser` — 원시 WS 메시지 → ParsedMessage 변환 (price_update, candle_data, candle_history, heartbeat)

**실행 모듈**:
- `TradeExecutor` — CALL/PUT 버튼 `simulateClick()`, 데모 모드 3중 체크 (⚠️ 안전 최우선), 금액 설정
- `SelectorResolver` — primary/fallback 셀렉터 다단계 시도 + 캐싱 (CALL/PUT 버튼, 가격, 잔액)

**모니터링 모듈**:
- `PayoutMonitor` — 자산 목록 DOM 파싱으로 페이아웃 비율 추적, 고페이아웃(≥92%) 자산 필터링, `switchAsset()` 자산 전환
- `IndicatorReader` — 페이지 DOM에서 RSI/Stochastic/MACD/BB 인디케이터 값 직접 읽기 (다중 셀렉터 패턴)

**신호 & 자동화 모듈**:
- `SignalGeneratorV2` — 캔들 버퍼에서 시장 레짐 감지 → 고승률 전략 실행 → CALL/PUT 신호
- `AutoMiner` — 고페이아웃 자산 순회, WS `loadHistoryPeriod` 요청, DataSender로 로컬 서버 전송
- `DataSender` — `localhost:3001`로 캔들 HTTP POST (실시간 단건 + 벌크)

### 통신 흐름

```
Tampermonkey (Main World)
  ↓ window.postMessage (source: pq-bridge)
Content Script (Isolated World)
  ↓ WebSocketInterceptor → WebSocketParser
  ↓ chrome.runtime.sendMessage
Background Service Worker
```

## 코드 스니펫

```typescript
// WebSocket 브릿지 수신 패턴
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'pq-bridge') return;
  if (event.data.type === 'ws-message') {
    this.handleMessage(message, message.timestamp);
  }
});

// 데모 모드 안전 체크 (executor.ts 핵심 패턴)
const accountInfo = this.getAccountInfo()
if (accountInfo.type !== 'DEMO' && !this._allowLiveTrading) {
  throw new POError({ code: ErrorCode.TRADE_NOT_DEMO, ... })
}
```
