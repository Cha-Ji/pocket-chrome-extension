---
type: refactor
title: "Signal Generator 중복 버전 정리 (v1/v2/v3 통합)"
labels: ["refactor"]
priority: p1
related_files:
  - src/lib/signals/signal-generator.ts
  - src/lib/signals/signal-generator-v2.ts
  - src/lib/signals/strategies-v2.ts
  - src/lib/signals/strategies-v3.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 현재 문제

4개의 시그널 생성기 파일이 공존하여 어떤 것이 활성 버전인지 불분명:
- `signal-generator.ts` (v1)
- `signal-generator-v2.ts`
- `strategies-v2.ts`
- `strategies-v3.ts`

유지보수 부담 증가, 신규 전략 추가 시 어디에 넣어야 할지 혼란.

## 개선 목표

- 활성 버전 하나로 통합
- 미사용 버전은 삭제 (git history에 보존)
- 전략 등록 패턴을 Strategy Pattern으로 통일

## 영향 범위

- `src/lib/signals/` 디렉토리 전체
- `src/content-script/index.ts`, `src/background/index.ts` (참조)

## 롤백 계획

- 기존 파일은 git history에 보존
- 통합 전 테스트 커버리지 확보
