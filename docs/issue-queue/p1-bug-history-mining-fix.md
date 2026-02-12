---
type: bug
title: "히스토리 데이터 수집 파싱 오류 수정"
labels: ["bug"]
priority: p1
related_files: ["src/content-script/websocket-parser.ts", "src/content-script/websocket-interceptor.ts", "src/content-script/auto-miner.ts"]
created_by: cloud-llm
created_at: "2026-02-12"
jira_origin: PO-16
---

## 증상

WebSocket 히스토리 패킷의 캔들 데이터 수집이 실패함.

## 원인 (파악된 경우)

1. 리스너 연결 누락 — 히스토리 응답을 수신하지 못함
2. 파서가 배열 형태의 데이터를 처리하지 못함 (blind to array data)

## 해결 방안

Phase 1: 파서 엔진 개선
- 배열 데이터 파싱 지원
- 리스너 연결 확인 및 수정

## 영향 범위

- `src/content-script/websocket-parser.ts`
- `src/content-script/websocket-interceptor.ts`
- `src/content-script/auto-miner.ts`
