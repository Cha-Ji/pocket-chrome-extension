---
type: feature
title: "테스트 커버리지 확대 - 현재 ~34% → 목표 80%"
labels: ["enhancement", "testing"]
priority: p2
related_files:
  - src/content-script/
  - src/lib/trading/auto-trader.ts
  - src/background/index.ts
created_by: cloud-llm
created_at: "2026-02-07"
---

## 목표

핵심 모듈의 테스트 커버리지를 80% 이상으로 향상.

## 요구사항

| 모듈 | 현재 상태 | 필요한 테스트 |
|------|-----------|--------------|
| `content-script/` | 5개 파일 | 통합 테스트, WebSocket 파서 |
| `auto-trader.ts` | 제한적 | E2E 거래 플로우 |
| `executor.ts` | 미흡 | DOM 인터랙션 모킹 |
| `background/index.ts` | 미흡 | 메시지 핸들러 단위 |
| `websocket-interceptor.ts` | 미흡 | 메시지 파싱/디스패치 |

## 기술 스택

- Vitest (기존)
- jsdom (DOM 모킹)

## 완료 조건

- [ ] content-script 통합 테스트 추가
- [ ] auto-trader E2E 테스트 추가
- [ ] executor DOM 모킹 테스트 추가
- [ ] background 메시지 핸들러 테스트 추가
- [ ] WebSocket 파서 comprehensive 테스트
- [ ] `npm run test:coverage` 80% 이상
