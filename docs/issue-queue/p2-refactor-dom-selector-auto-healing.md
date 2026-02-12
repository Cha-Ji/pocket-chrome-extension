---
type: refactor
title: "DOM 셀렉터 자동 복구(Auto-healing) 로직 구현"
labels: ["refactor"]
priority: p2
related_files: ["src/content-script/selector-resolver.ts", "src/content-script/executor.ts", "src/lib/types/index.ts"]
created_by: cloud-llm
created_at: "2026-02-12"
jira_origin: PO-3
---

## 현재 문제

Pocket Option 사이트의 UI 구조 변경 시 셀렉터가 깨져서 수동 업데이트가 필요함.

## 개선 목표

- SelectorResolver 클래스로 multi-layer fallback 셀렉터 지원
- 셀렉터 유효성 검사 및 대안 자동 선택
- 성공 이력 저장 및 최적화
- Content Script 모듈들이 SelectorResolver를 사용하도록 리팩토링

## 영향 범위

- `src/content-script/selector-resolver.ts` (구현 완료)
- `src/content-script/executor.ts` (리팩토링 필요)
- `src/content-script/data-collector.ts` (리팩토링 필요)
- `src/lib/types/index.ts` (셀렉터 스키마 변경)

## 현재 진행 상태

- [x] SelectorResolver 클래스 구현
- [x] 캐싱 로직 추가
- [ ] Content Script 모듈 리팩토링
- [ ] 이슈 상태 업데이트 및 Merge

## 롤백 계획

기존 단일 셀렉터 방식으로 복원 (types/index.ts의 DOMSelectors)
