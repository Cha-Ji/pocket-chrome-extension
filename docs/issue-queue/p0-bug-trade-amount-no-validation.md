---
type: bug
title: "거래 실행 시 금액 입력값 검증 누락"
labels: ["bug"]
priority: p0
related_files:
  - src/lib/platform/adapters/pocket-option/executor.ts
  - src/lib/trading/auto-trader.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 증상

`executor.ts`의 `execute(direction, amount)` 함수에 금액 검증 로직이 없어서 `NaN`, 음수, 또는 비정상적으로 큰 금액이 전달될 수 있음. 데모 모드에서도 비정상 금액으로 거래가 실행될 수 있으며, 실제 모드 전환 시 치명적 손실 위험.

## 원인 (파악된 경우)

- `execute()` 함수에 amount 파라미터 검증 없음
- 상위 호출 체인(`auto-trader.ts` → `executor.ts`)에서도 검증 누락

## 해결 방안

```typescript
// executor.ts - execute() 시작부에 추가
if (!Number.isFinite(amount) || amount <= 0) {
  throw new POError('INVALID_TRADE_AMOUNT', { amount });
}
if (amount > MAX_TRADE_AMOUNT) {
  throw new POError('TRADE_AMOUNT_EXCEEDS_LIMIT', { amount, limit: MAX_TRADE_AMOUNT });
}
```

## 영향 범위

- `src/lib/platform/adapters/pocket-option/executor.ts`
- `src/lib/trading/auto-trader.ts`
