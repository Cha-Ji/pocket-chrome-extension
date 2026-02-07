---
type: feature
title: "DOM 셀렉터 자동 검증 및 알림 시스템"
labels: ["enhancement"]
priority: p3
related_files:
  - src/lib/platform/adapters/pocket-option/selectors.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 목표

Pocket Option 사이트 업데이트로 DOM 셀렉터가 깨질 때 즉시 감지하고 알림.

## 요구사항

- 확장 로드 시 모든 필수 셀렉터 검증
- 셀렉터 실패 시 UI 경고 표시
- 셀렉터 버전 관리 (fallback 체인 개선)
- Telegram 알림 옵션

## 기술 스택

- 기존 `selectors.ts` 확장
- MutationObserver 활용

## 완료 조건

- [ ] 셀렉터 헬스체크 함수 구현
- [ ] 로드 시 자동 검증
- [ ] UI 경고 컴포넌트
- [ ] 선택적 Telegram 알림
