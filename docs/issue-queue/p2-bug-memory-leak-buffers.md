---
type: bug
title: "메모리 누수 - WebSocket 버퍼/캔들 맵 무한 성장"
labels: ["bug", "performance"]
priority: p2
related_files:
  - src/content-script/websocket-interceptor.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 증상

장시간 실행 시 메모리 사용량이 지속 증가. Service Worker 또는 Content Script가 비정상 종료될 수 있음.

## 원인 (파악된 경우)

1. `WebSocketInterceptor.messageBuffer`: `maxBufferSize=1000`이지만 정리 로직 미구현
2. `candleCollector.candles`: Map이 무한 성장, 오래된 캔들 정리 없음
3. `websocket-interceptor.connections`: Map 정리 없음

## 해결 방안

- Ring buffer 패턴 도입 (FIFO, 최대 크기 초과 시 오래된 항목 제거)
- 캔들 맵에 TTL 또는 최대 크기 적용
- WebSocket 연결 종료 시 connections Map에서 제거

## 영향 범위

- `src/content-script/websocket-interceptor.ts`
- candle collector 관련 모듈
