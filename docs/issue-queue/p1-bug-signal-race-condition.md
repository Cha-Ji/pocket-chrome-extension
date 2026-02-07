---
type: bug
title: "Signal 실행 시 Race Condition - 동시 거래 가능"
labels: ["bug"]
priority: p1
related_files:
  - src/content-script/index.ts
  - src/lib/trading/auto-trader.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 증상

`setupSignalHandler()`에서 `executeSignal()`이 await 없이 호출되어, 빠르게 연속 시그널이 발생하면 복수 거래가 동시 실행될 수 있음. 의도치 않은 중복 거래로 자금 손실 위험.

## 원인 (파악된 경우)

- Signal 실행이 비동기지만 동시 실행 제어(mutex/lock)가 없음
- Content script에서 시그널 핸들러의 await 누락

## 해결 방안

- 거래 실행 중 플래그(`isExecuting`) 또는 mutex 패턴 도입
- 동시 실행 시도 시 큐잉 또는 무시 처리

```typescript
let isExecuting = false;

async function executeSignal(signal: Signal) {
  if (isExecuting) {
    logger.warn('거래 실행 중 - 시그널 무시:', signal);
    return;
  }
  isExecuting = true;
  try {
    await executor.execute(signal.direction, signal.amount);
  } finally {
    isExecuting = false;
  }
}
```

## 영향 범위

- `src/content-script/index.ts`
- `src/lib/trading/auto-trader.ts`
