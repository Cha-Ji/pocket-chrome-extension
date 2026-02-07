---
type: refactor
title: "에러 처리 패턴 통일 (throw/return/silent 혼재 정리)"
labels: ["refactor"]
priority: p2
related_files:
  - src/background/index.ts
  - src/lib/platform/adapters/pocket-option/executor.ts
  - src/lib/trading/auto-trader.ts
  - src/lib/errors/
created_by: cloud-llm
created_at: "2026-02-07"
---

## 현재 문제

에러 처리 방식이 혼재:
- 일부: `throw new Error()` / `throw new POError()`
- 일부: `return { success: false, error: ... }`
- 일부: `.catch(() => {})` (silent fail)

디버깅 어렵고, 에러 전파 경로 예측 불가.

## 개선 목표

- `Result<T, E>` 패턴 또는 일관된 에러 처리 규칙 정의
- Silent fail 전면 제거
- `POError` 클래스를 모든 에러에 통일 적용

## 영향 범위

- 전체 `src/` 디렉토리
- 특히 `background/index.ts`, `executor.ts`, `auto-trader.ts`

## 롤백 계획

- 모듈별 점진적 교체, 각 모듈 교체 후 테스트 검증
