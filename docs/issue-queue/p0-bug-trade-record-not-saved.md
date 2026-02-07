---
type: bug
title: "Background에서 거래 기록 미저장 (TODO 미구현)"
labels: ["bug"]
priority: p0
related_files:
  - src/background/index.ts
  - src/lib/db/
created_by: cloud-llm
created_at: "2026-02-07"
---

## 증상

거래 실행 후 결과가 DB에 기록되지 않아 거래 내역 추적 불가. 통계, 수익률 분석 등 후속 기능이 모두 동작하지 않음.

## 원인 (파악된 경우)

- `src/background/index.ts` ~248행: `// TODO: Record trade in database` 주석만 존재
- 실제 DB 저장 로직 미구현

## 해결 방안

- `TradeRepository`를 사용하여 `handleTradeResult` 핸들러에서 거래 결과 저장
- 저장 실패 시 retry 로직 또는 에러 알림 추가
- 최소한 `console.error`로 에러 로깅

## 영향 범위

- `src/background/index.ts`
- `src/lib/db/` (TradeRepository)
