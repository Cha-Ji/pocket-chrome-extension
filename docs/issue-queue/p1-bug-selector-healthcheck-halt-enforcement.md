---
type: bug
title: "Selector healthcheck halt enforcement + transition broadcast"
labels: ["bug", "p1"]
priority: p1
related_files:
  - src/lib/platform/adapters/pocket-option/selector-healthcheck.ts
  - src/background/index.ts
  - src/lib/platform/adapters/pocket-option/selector-healthcheck.test.ts
  - src/background/handlers/healthcheck-halt.test.ts
created_by: cloud-llm
created_at: "2026-02-18"
---

## 증상

PR #108 머지 후 Codex 코드 리뷰에서 2가지 안전 이슈가 지적됨:

1. **상태 변화 감지 누락**: `scheduleRevalidation()`이 `tradingHalted` + `criticalFailures` + `nonCriticalFailures`만 비교하고 있어, environment 변경(demo→real), version 변경, passed 상태 변화 등이 누락됨. Side-panel/background가 stale한 healthcheck 결과를 보유하게 됨.

2. **halt 미보장**: healthcheck가 `tradingHalted=true`를 보고해도 background의 `stopTrading()` 호출이 실패하면(active tab 없음, 네트워크 오류 등) `isRunning`이 `true`로 유지됨. Selector가 깨진 상태에서 거래 시도가 가능해지는 안전 위험.

**재현 조건**:
- 리얼 환경에서 PO 플랫폼이 DOM 구조를 변경할 때
- demo → real 전환 시 environment가 바뀌지만 selector는 그대로인 경우
- Service Worker가 tab reference를 잃은 상태에서 healthcheck failure 수신

## 원인 (파악된 경우)

1. `scheduleRevalidation()`의 비교 로직이 3개 차원(halted, critical, non-critical)만 체크:
   ```typescript
   // 기존 코드 — environment, passed, version 변화 미감지
   const statusChanged =
     result.tradingHalted !== prevHalted ||
     result.criticalFailures.join(',') !== prevCritical ||
     result.nonCriticalFailures.join(',') !== prevNonCritical;
   ```

2. background의 halt 처리가 `stopTrading()` 성공에 의존:
   ```typescript
   // 기존 코드 — stopTrading() 실패 시 isRunning 유지
   if (backgroundStore.getState().tradingStatus.isRunning) {
     await stopTrading(); // ← tab 없으면 throw → isRunning 그대로
   }
   ```

## 해결 방안

1. **`hasResultChanged()` 함수 도입**: 모든 차원(tradingHalted, passed, environment, version, criticalFailures, nonCriticalFailures) 비교. prev=null이면 항상 "변경됨"으로 판단.

2. **Forced state transition**: `tradingHalted=true` 수신 시 tab 통신은 best-effort로 시도하되, `ignoreError`로 감싸고, 이후 unconditionally `isRunning=false` 설정.

3. **Unit test 추가**: hasResultChanged 11개 + scheduleRevalidation broadcast 3개 + halt enforcement 6개 = 총 20개 신규 테스트.

## 영향 범위

- `src/lib/platform/adapters/pocket-option/selector-healthcheck.ts` — hasResultChanged 추가, scheduleRevalidation 수정
- `src/background/index.ts` — handleSelectorHealthcheckResult halt enforcement 로직 수정
- `src/lib/platform/adapters/pocket-option/selector-healthcheck.test.ts` — 14개 테스트 추가
- `src/background/handlers/healthcheck-halt.test.ts` — 6개 테스트 신규 파일
