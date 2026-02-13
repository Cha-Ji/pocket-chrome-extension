---
type: feature
title: "backtestResults 테이블 추가 — 백테스트 결과 영속화"
labels: ["enhancement", "feat"]
priority: p1
related_files:
  - src/lib/db/index.ts
  - src/lib/backtest/engine.ts
  - src/lib/backtest/types.ts
created_by: cloud-llm
created_at: "2026-02-12"
---

## 목표

백테스트 실행 결과를 IndexedDB에 영속 저장하는 `backtestResults` 테이블 추가.
현재 `BacktestResult`는 메모리에서만 존재하고 리더보드 엔트리에 요약만 저장됨.
개별 백테스트의 전체 결과(거래 목록, 에퀴티 커브, 데이터 퀄리티)가 유실되는 문제 해결.

## 요구사항

- `StoredBacktestResult` 인터페이스 정의
- Dexie v4 마이그레이션 (DB 버전 업)
- `BacktestResultRepository` CRUD 구현
- 기존 `BacktestEngine.run()` 결과를 저장할 수 있는 변환 유틸

## 완료 조건

- [x] `StoredBacktestResult` 타입 정의
- [x] DB 스키마 v4 마이그레이션
- [x] `BacktestResultRepository` 구현 (save, getById, getByStrategy, getRecent, delete)
- [ ] 단위 테스트 작성
