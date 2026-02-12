---
type: refactor
title: "백테스트 mock 데이터 테스트 로직 제거 — Pocket Option 실데이터 전환"
labels: ["refactor"]
priority: p1
related_files:
  - src/lib/backtest/__tests__/real-data.test.ts
  - src/lib/backtest/__tests__/__mocks__/binance-api.ts
created_by: cloud-llm
created_at: "2026-02-12"
---

## 목표

백테스트 테스트에서 mock 데이터로 테스트하는 로직을 제거.
Pocket Option 실데이터 기반 테스트로 전환.
Binance API 코드 자체는 유지하되, mock 기반 테스트 분리.

## 요구사항

- `real-data.test.ts`에서 binance-api mock 의존 제거
- mock 데이터로 실행되는 테스트 케이스 제거
- Pocket Option WebSocket 캔들 데이터 기반 테스트 구조 준비
- `__mocks__/binance-api.ts`는 파일 유지 (삭제하지 않음)

## 완료 조건

- [x] `real-data.test.ts` mock 의존 테스트 제거
- [x] Pocket Option 데이터 기반 테스트 헬퍼 준비
- [ ] 기존 전략 테스트들의 mock 의존도 검토
