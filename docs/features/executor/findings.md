# 발견사항 — Executor (거래 실행)

## 결정 사항

- (2026-01-26) 진입 조건 충족 시 CALL/PUT 주문 실행
- (2026-02-06) 2단계 실행 체계: `TradeExecutor`(DOM 클릭) + `AutoTrader`(신호→실행 루프)
- (2026-02-06) 데모 모드 검증은 `getAccountType()` 기반 — URL/CSS 클래스/라벨 텍스트 3중 체크

## 제약/가정

- (2026-01-26) 슬리피지 방지 및 일일 손실 한도 적용
- (2026-02-06) React SPA 특성상 표준 `click()` 이벤트가 작동하지 않을 수 있음 → `simulateClick()` 사용
- (2026-02-06) 라이브 계정에서의 실행은 `enableLiveTrading(true)` 명시 호출 필수 (기본 차단)

## 핵심 정보

### 구현체 1: TradeExecutor (`content-script/executor.ts`)

DOM 수준의 거래 실행을 담당하는 클래스:

- **안전 체크**: `executeTrade()` / `startAutoTrading()` 시작 시 `getAccountInfo()` 호출
  - `accountType !== 'DEMO'` && `!_allowLiveTrading` → `POError(TRADE_NOT_DEMO)` throw
  - severity: `CRITICAL` → 텔레그램 알림 자동 발송
- **버튼 해결**: `SelectorResolver`를 통해 CALL/PUT 버튼 탐색 (primary → fallback 다단계)
- **금액 설정**: `setTradeAmount()` — input value 변경 후 `input`+`change` 이벤트 dispatch (React 반응성 트리거)
- **잔액 조회**: `getCurrentBalance()` — DOM에서 잔액 텍스트 파싱

### 구현체 2: AutoTrader (`lib/trading/auto-trader.ts`)

신호 기반 자동매매 루프를 담당하는 클래스:

- **포지션 사이징**: `usePercentage` 모드(잔액의 N%) 또는 고정 금액, min/max 제한
- **리스크 관리** (tick마다 6단계 체크):
  1. 일일 거래 횟수 한도 (`maxDailyTrades`)
  2. 일일 손실 금액 한도 (`maxDailyLoss`)
  3. 일일 손실 비율 한도 (`maxDailyLossPercent`)
  4. 최대 드로다운 (`maxDrawdown`) — 고점 대비 하락률
  5. 연속 손실 횟수 (`maxConsecutiveLosses`)
  6. 쿨다운 시간 (`cooldownMs`) — 거래 간 최소 대기
- **실행 흐름**: `tick()` → 리스크 체크 → `fetchCandles()` → `generator.addCandle()` → 신호 발생 시 `executeSignal()`
- **결과 처리**: 만기 시간 후 현재가 조회 → WIN/LOSS/TIE 판정 → 통계 업데이트

### 마틴게일/고정진입
- (2026-01-26) 마틴게일 설정 옵션 필요 — **현재 미구현**, `usePercentage` + 고정 금액 선택만 가능
- (2026-01-26) 신호-현재가 차이 클 경우 주문 취소 — **현재 미구현**

## 코드 스니펫

```typescript
// 리스크 관리 6단계 체크 패턴 (AutoTrader.tick())
if (this.stats.todayTrades >= this.config.maxDailyTrades) return this.haltTrading('Daily trade limit')
if (this.stats.todayProfit <= -this.config.maxDailyLoss) return this.haltTrading('Daily loss limit')
if (this.stats.currentDrawdown >= this.config.maxDrawdown) return this.haltTrading('Max drawdown')
if (this.stats.consecutiveLosses >= this.config.maxConsecutiveLosses) return this.haltTrading('Consecutive losses')

// 포지션 사이징
const amount = this.config.usePercentage
  ? (this.stats.currentBalance * this.config.riskPerTrade) / 100
  : this.config.fixedAmount || 10
```
