---
type: refactor
title: "글로벌 뮤터블 상태 → 상태 관리 시스템 도입"
labels: ["refactor"]
priority: p3
related_files:
  - src/background/
  - src/content-script/
created_by: cloud-llm
created_at: "2026-02-07"
---

## 현재 문제

`minerState`, `tradingStatus`, `tradingConfig` 등이 모듈 레벨 전역 변수로 관리:
- 상태 변경 추적 어려움
- 동시 접근 시 race condition 위험
- 테스트 시 상태 격리 어려움

## 개선 목표

- Zustand 또는 간단한 Store 패턴 도입
- 상태 변경을 이벤트로 추적 가능
- 테스트에서 상태 격리 용이하게

## 영향 범위

- `src/background/` (상태 관리)
- `src/content-script/` (상태 참조)

## 롤백 계획

- 기존 전역 변수를 Store 래퍼로 감싸는 방식으로 점진적 전환
