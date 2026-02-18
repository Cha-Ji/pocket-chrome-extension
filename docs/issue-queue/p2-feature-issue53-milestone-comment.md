---
type: feature
title: "Issue #53 코멘트: 테스트 커버리지 80% 달성을 위한 단계별 마일스톤"
labels: ["test"]
priority: p2
related_files:
  - src/content-script/websocket-parser.test.ts
  - src/content-script/websocket-interceptor.test.ts
created_by: cloud-llm
created_at: "2026-02-18"
---

## 목표

Issue #53에 아래 코멘트를 추가합니다. (GitHub API 접근 불가로 issue-queue에 저장)

## Issue #53 코멘트 내용

### 80% 커버리지 달성을 위한 단계별 마일스톤

80%는 장기 목표로 유지하되, 다음과 같이 단계별로 접근합니다:

#### Phase 1: websocket-parser / interceptor / dispatcher coverage ✅
- websocket-parser.ts: 88.83% → **97.73%** stmts, 81.16% → **85.25%** branches
- websocket-interceptor.ts: 0% → **100%** stmts, 0% → **92%** branches
- PR: `claude/test-websocket-parser-coverage-ZSTMY`

#### Phase 2: executor DOM mocking
- TradeExecutor의 DOM 조작 (CALL/PUT 클릭, 금액 설정) 테스트
- 데모 모드 3중 체크 검증 강화
- jsdom 기반 DOM fixture 구축

#### Phase 3: auto-trader 제한적 E2E
- AutoTrader 리스크 관리 로직 (일일 한도, 드로다운, 연속손실) 단위 테스트
- 포지션 사이징 (고정/%) 로직 테스트
- 쿨다운 메커니즘 테스트

#### Phase 4: background 메시지 핸들러 단위
- Background index.ts 메시지 라우터 테스트
- TRADE_EXECUTED → TRADE_LOGGED 흐름 테스트
- FINALIZE_TRADE idempotent 동작 테스트
- 알람 기반 데이터 정리 테스트

## 완료 조건

- [x] Phase 1 PR 생성 완료
- [ ] Issue #53에 코멘트 추가 (로컬 LLM이 process-issues 시 처리)
