---
type: feature
title: "Demo Mode 안전 체크 강화"
labels: ["enhancement", "security"]
priority: p2
related_files:
  - src/lib/platform/adapters/pocket-option/safety.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 목표

데모 모드 확인 로직을 강화하여 실제 거래 방지를 더 확실히 보장.

## 요구사항

현재 3중 체크가 모두 DOM 기반이라 스푸핑 가능성 있음. 추가 검증 필요:

- 서버 응답(WebSocket 메시지)에서 계정 타입 확인 추가
- 체크 실패 시 자동 거래 즉시 중단 + 알림
- 주기적 재검증 (30초마다)
- 체크 결과 로깅

## 완료 조건

- [ ] WebSocket 기반 계정 타입 확인 추가
- [ ] 주기적 재검증 타이머 구현
- [ ] 실패 시 자동 중단 + 알림 구현
- [ ] 테스트 작성
