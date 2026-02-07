---
type: bug
title: "Selector Cache 무효화 누락 - DOM 변경 시 stale 셀렉터"
labels: ["bug"]
priority: p2
related_files:
  - src/lib/platform/adapters/pocket-option/executor.ts
  - src/lib/platform/adapters/pocket-option/selectors.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 증상

Pocket Option 사이트의 DOM 구조 변경 시, 캐시된 셀렉터가 무효화되지 않아 거래 버튼을 찾지 못하고 실행 실패.

## 원인 (파악된 경우)

- `PocketOptionExecutor.selectorCache`가 한번 설정되면 영구 유지
- DOM 변경 감지 메커니즘 없음

## 해결 방안

- 셀렉터 사용 전 요소 존재 여부 재확인
- MutationObserver로 주요 컨테이너 변경 감지 시 캐시 무효화
- 또는 TTL 기반 캐시 (예: 30초마다 갱신)

## 영향 범위

- `src/lib/platform/adapters/pocket-option/executor.ts`
- `src/lib/platform/adapters/pocket-option/selectors.ts`
