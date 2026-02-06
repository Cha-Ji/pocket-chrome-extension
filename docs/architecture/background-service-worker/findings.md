# 발견사항 — Background Service Worker

## 결정 사항

- (2026-01-26) Background Service Worker는 자동 매매 루프와 탭 상태 관리를 담당
- (2026-02-06) 중앙 메시지 라우터 역할 확정 — Content Script/Side Panel 간 모든 통신의 허브

## 제약/가정

- (2026-01-26) 브라우저 상태 변화(탭 전환/종료)에 대한 안정적 관리가 필요
- (2026-02-06) Service Worker는 비활성 시 자동 종료됨 → `chrome.alarms`로 주기적 작업 보장
- (2026-02-06) JSON만 전송 가능 → POError는 `toJSON()`으로 직렬화하여 전달

## 핵심 정보

- (2026-01-26) 장기 실행 프로세스 관리가 핵심 역할
- (2026-01-26) 자동 매매 루프 제어(시작/정지/중단) 책임

### 진입점: `src/background/index.ts`

**상태 관리**:
- `tradingStatus` 객체로 전역 거래 상태 관리 (isRunning, currentTicker, balance, sessionId)
- 상태 변경 시 Side Panel에 `STATUS_UPDATE` 브로드캐스트

**메시지 핸들링** (`chrome.runtime.onMessage`):
- `TICK_DATA` → `TickRepository.add()`로 IndexedDB에 저장, 10000건 초과 시 24시간 이전 데이터 자동 삭제
- `TRADE_EXECUTED` → 거래 기록 (TODO: DB 저장 미구현)
- `GET_STATUS` → 현재 `tradingStatus` 반환
- `START_TRADING` → 활성 탭에 `chrome.tabs.sendMessage`로 시작 명령 전달
- `STOP_TRADING` → 활성 탭에 중지 명령 전달
- `GET_ERROR_STATS` / `GET_ERROR_HISTORY` → 에러 핸들러 통계/히스토리 반환

**에러 → 텔레그램 연동**:
- `errorHandler.onError()` 구독 — `ErrorSeverity.ERROR` 이상일 때 `TelegramService.notifyError()` 자동 호출
- 시작 시 `notifyStatus('Extension Service Worker Started')` 전송

**주기적 작업** (`chrome.alarms`):
- `cleanup` 알람: 매 60분마다 7일 이상 오래된 Tick 데이터 삭제

### 의존하는 라이브러리
- `lib/db` — TickRepository (Tick CRUD)
- `lib/errors` — POError, errorHandler, tryCatchAsync, ignoreError
- `lib/notifications/telegram` — getTelegramService (싱글턴)
- `lib/types` — ExtensionMessage, Tick, TradingStatus

## 코드 스니펫

```typescript
// 메시지 라우팅 핵심 패턴
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse)
  return true // 비동기 응답 허용
})

// 에러 → 텔레그램 알림 연동
errorHandler.onError(async (error) => {
  if (error.isSeverityAtLeast(ErrorSeverity.ERROR)) {
    const telegram = await getTelegramService()
    await telegram.notifyError(error.toShortString())
  }
})
```
