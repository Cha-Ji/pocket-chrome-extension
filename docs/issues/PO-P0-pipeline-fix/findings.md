# P0 Bug Fix Findings

## 2026-02-15

### P0-1: TickRepository.bulkPut() — 이미 정상

**코드 경로**: `src/lib/db/index.ts:237-240`

기존 progress.md에서 "이미 정상" 확인. 현재 코드:
```typescript
async bulkPut(ticks: Omit<Tick, 'id'>[]): Promise<void> {
  if (ticks.length === 0) return
  await db.ticks.bulkPut(ticks)
}
```
이전 세션에서 이미 수정 완료된 상태. 추가 변경 불필요.

### P0-2: handleNewSignal() — evaluateSignalGates로 교체

**결정**: 인라인 onlyRSI 체크 → `evaluateSignalGates()` 순수 함수 위임

**이유**:
1. `signal-gate.ts`가 이미 존재하나 `trade-lifecycle.ts`에서 사용하지 않았음
2. 인라인 코드가 `StrategyFilter` (allowlist/denylist) 무시
3. `signal-gate.ts`는 22개 테스트로 검증 완료
4. Gate가 enabled/payout/strategy/executing/cooldown 모두 체크하므로 중복 로직 감소

**변경**: `handleNewSignal` 함수 전체를 `evaluateSignalGates` 호출로 교체. `executeSignal`의 내부 가드(isExecuting/cooldown)는 defense-in-depth로 유지.

### P0-3: pendingTrades — clearTimeout 추가

**문제**: `settleTrade`에서 `pendingTrades.delete(tradeId)` 후 timer가 여전히 활성화 가능
**수정**: delete 직후 `clearTimeout(pending.timerId)` 호출
**이유**: 수동 settlement나 recovery에 의해 timer가 이미 fired되기 전에 호출될 경우, 원래 timer가 이후 다시 fire하면 no-op(이미 deleted)이지만 불필요한 함수 호출. 명시적 clear가 안전.

### P0-4: WS_PRICE_UPDATE — RELAY_MESSAGE_TYPES 등록

**문제**: content-script이 `WS_PRICE_UPDATE`, `WS_MESSAGE`, `WS_CONNECTION` 메시지를 background에 전송하나, background의 switch문에 해당 case 없음 → default로 빠져 `MSG_INVALID_TYPE` 에러 스팸

**선택한 해결책**: Option B — RELAY_MESSAGE_TYPES에 등록 + 500ms throttle
- background에 별도 switch case 불필요 (relay-only)
- side panel이 필요시 실시간 가격 표시 가능
- throttle로 고빈도 메시지 제한

### P1-1: candleCount — 델타→총량 전환

**변경 경로**: `src/content-script/app/ws-handlers.ts:saveHistoryCandlesToDB()`

`CandleRepository.count(symbol, 60)`으로 실제 DB 총량을 조회한 후 `CandleDatasetRepository.upsert`에 전달. 기존에는 `totalAdded` (이번 배치에서 추가된 수)를 전달해서 두 번째 히스토리 로드 시 덮어씌워졌음.

### P1-2: sendResponse 누락 방지

**background/index.ts**: `handleMessage().then(sendResponse)` → `.catch(err => sendResponse({error}))`
**message-handler.ts**: 동일 패턴 적용

### P1-3: validateConfigUpdate 순수 함수

**범위 제한**:
- tradeAmount: (0, 10000]
- minPayout: [0, 100]
- maxDrawdown: [0, 100]
- maxConsecutiveLosses: [1, 100]

잘못된 필드는 sanitized에서 제거, 유효한 필드만 적용. 응답에 validationErrors 배열 포함.
