---
type: bug
title: "Side Panel 블랙 스크린 현상"
labels: ["bug"]
priority: p1
related_files: ["src/side-panel/App.tsx", "scripts/tampermonkey/inject-websocket.user.js"]
created_by: cloud-llm
created_at: "2026-02-12"
jira_origin: PO-14
---

## 증상

inject-websocket.js 수정 후 Side Panel이 블랙 스크린으로 표시됨.

## 원인 (파악된 경우)

App.tsx 렌더링 로직 문제로 추정. 아직 근본 원인 분석 미착수.

## 해결 방안

1. DevTools로 Side Panel 렌더링 디버깅
2. App.tsx 에러 바운더리 확인
3. inject-websocket.js 변경사항과의 상관관계 분석

## 영향 범위

- `src/side-panel/App.tsx`
- `scripts/tampermonkey/inject-websocket.user.js`
