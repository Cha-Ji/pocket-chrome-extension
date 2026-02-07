---
type: refactor
title: "Content Script 관심사 분리"
labels: ["refactor"]
priority: p2
related_files:
  - src/content-script/index.ts
  - src/content-script/
created_by: cloud-llm
created_at: "2026-02-07"
---

## 현재 문제

`src/content-script/index.ts`에 여러 책임이 혼재:
- 데이터 수집 (DOM 파싱)
- WebSocket 핸들링
- 거래 실행
- 시그널 처리
- 상태 관리

단일 파일에 과도한 책임이 집중되어 테스트, 디버깅, 유지보수 어려움.

## 개선 목표

- 각 책임을 독립 모듈로 분리
- 명확한 의존성 그래프 구성
- 초기화 순서를 dependency injection 패턴으로 관리

## 영향 범위

- `src/content-script/` 전체

## 롤백 계획

- 리팩토링 전 테스트 커버리지 확보 (테스트 커버리지 이슈 선행)
