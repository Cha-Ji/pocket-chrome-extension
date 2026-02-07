---
type: bug
title: "WebSocket Bridge 메시지 출처 검증 부재"
labels: ["bug", "security"]
priority: p1
related_files:
  - src/content-script/websocket-interceptor.ts
  - scripts/tampermonkey/inject-websocket.user.js
created_by: cloud-llm
created_at: "2026-02-07"
---

## 증상

`window.postMessage`로 수신하는 WebSocket 데이터의 `event.origin` 검증이 없어, 동일 페이지에 주입된 악성 스크립트가 가짜 가격 데이터를 보낼 수 있음. 조작된 가격으로 잘못된 시그널 발생 → 잘못된 거래 실행 가능.

## 원인 (파악된 경우)

- `websocket-interceptor.ts`의 `handleBridgeMessage()`에서 `event.source`, `event.origin` 검증 누락
- `source: 'pq-bridge'` 필드만 체크하는데, 이는 누구나 위조 가능

## 해결 방안

```typescript
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.source !== 'pq-bridge') return;
  // ... 기존 로직
});
```

## 영향 범위

- `src/content-script/websocket-interceptor.ts`
- `scripts/tampermonkey/inject-websocket.user.js`
