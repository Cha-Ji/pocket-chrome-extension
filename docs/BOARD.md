# BOARD.md — Agent Status Board

> 모든 에이전트는 세션 시작 시 이 파일을 **첫 번째로** 읽는다.
> 작업 완료/중단 시 자기 행을 업데이트한다.
> `docs/head/*`는 2026-02-18부터 운영 중단. 상태/진행/결정은 BOARD.md에만 기록한다.
> Wiki 원본 저장소: `../pocket-chrome-extension.wiki` (편의 경로: `docs/wiki` symlink)

## Active Tasks

| ID | Owner | Branch | Status | Summary | Updated |
|----|-------|--------|--------|---------|---------|
| codex-headless-switch-20260221 | Codex | fix/backtest-data-sufficiency | idle | 완료: PM2 장기 실행 전환 완료(`data-collector`,`headless-collector` online), EURUSD 1m 적재 속도 기반 ETA 산정 | 2026-02-21 15:38 KST |

## Recent Decisions (최근 5개, 이전 항목은 Wiki [[Key-Decisions]]로 이동)

| Date | Decision | Reason |
|------|----------|--------|
| 2026-02-21 | 기본 headless 수집 경로를 `pocketoption-1m-collector`로 통일 | extension 기반 `headless-collector`는 headed 강제라 창 팝업이 발생하고, 실제 headless 요구를 충족하지 못함 |
| 2026-02-18 | Wiki Worklog 계층 아카이브 도입 (Daily→Weekly→Monthly) | BOARD는 실시간 상태만 유지하고 작업 이력은 wiki로 장기 보존 |
| 2026-02-18 | `docs/head` 완전 흡수, BOARD 단일 운영 확정 | 핸드오프 진입점 단일화, 문서 중복/충돌 제거 |
| 2026-02-18 | 에이전트 팀 구조 도입 (planning/dev/qa) | 멀티 에이전트 동시 작업을 위한 inbox 기반 소통 |
| 2026-02-18 | 문서 하이브리드 전략 채택 | 메인 레포(BOARD.md+teams/)=실시간, Wiki=참조/아카이브 |

## Blocked / Needs Attention

- **docs 정리 미완료 항목** (다음 세션에서 이어서):
  - [ ] `docs/archive/` 내 불필요 파일 최종 검토 후 삭제 여부 결정
  - [ ] `~/.claude/CLAUDE.md` (글로벌)와 프로젝트 `CLAUDE.md` 이중 관리 문제 — 하나로 통합 검토
  - [ ] Wiki `Home.md`의 Phase 상태 최신화 (Phase 3~4 세부 체크박스 갱신)
  - [ ] `docs/SETUP_GUIDE.md`를 Wiki `Setup-Guide.md`와 중복 여부 확인 후 정리
  - [ ] `ask-gemini`/`ask-codex`/`codex-review` skill 실제 동작 테스트 (Gemini 429 해소 후)
  - [ ] 에이전트 팀 실제 운영 테스트 — inbox.md 기반 소통 흐름 검증

## Execution Backlog (from former `docs/head/*`)

### Collector DB 통합 (레거시 정리 + Docker 일원화)
- [ ] `apps/collector/src/index.ts` DB_PATH 기본값 로컬 실행 기준으로 조정
- [ ] `npm run collector`를 `apps/collector` 실행 기준으로 통합
- [ ] `scripts/data-collector-server.ts` 삭제
- [ ] `scripts/ecosystem.config.cjs` 확인 및 정리
- [ ] `git rm --cached -r data/`로 로컬 DB 추적 해제
- [ ] `backtest-from-sqlite.ts` 기본 DB 경로와 통합 경로 일치 검증
- [ ] Binance JSON 데이터 유지/삭제 정책 결정
- [ ] collector 관련 npm scripts 정리 (`collector:start/stop/logs` 정리)

### Telegram 연동 후속
- [ ] Side Panel에서 Bot Token + Chat ID 저장 후 Enable 상태 실거동 검증
- [ ] `notifyErrors` 토글 UI 노출 필요성 검토

### Operational Risk Notes
- WSL2 `/mnt/c` + SQLite WAL + `synchronous=NORMAL` 조합에서 강제 종료 시 데이터 손실 위험이 큼
- 권장 대안: WSL2 네이티브 경로 사용, `synchronous=FULL`, Docker 볼륨, 주기적 체크포인트

## Team Inboxes

| Team | Inbox | Role |
|------|-------|------|
| Planning | `docs/teams/planning/inbox.md` | 요구사항, 스펙, 우선순위 |
| Dev | `docs/teams/dev/inbox.md` | 설계 메모, 기술 결정, 구현 |
| QA | `docs/teams/qa/inbox.md` | 테스트 결과, 버그 리포트 |

> 다른 팀에 전달할 사항 → 해당 팀의 inbox.md에 append.
> 처리 완료 → 수신 팀이 항목 삭제.

---

## Worklog Policy

- 실시간 상태/할당/차단 사항은 `docs/BOARD.md`에서만 관리
- 일간/주간/월간 작업 기록은 `../pocket-chrome-extension.wiki`의 `Worklog`에서 관리
- Daily 기록은 7일 경과 시 Weekly로 롤업, Weekly 기록은 1개월 경과 시 Monthly로 롤업
- 자동화 명령: `npm run wiki:daily`, `npm run wiki:rollup`

---

## 사용 규칙

1. **에이전트는 자기 행만 수정한다** (다른 에이전트 행 수정 금지)
2. **Status 값**: `idle` | `researching` | `coding` | `testing` | `reviewing` | `blocked`
3. **작업 시작**: idle 행을 가져와 자기 정보로 채움
4. **작업 완료**: 행을 idle로 되돌리거나 삭제
5. **Decisions**: 새 결정은 맨 위에 추가, 5개 초과 시 오래된 것은 Wiki로 이동
6. **Blocked**: 사람 승인/다른 에이전트 대기 등 차단 사항 기록
7. **팀간 소통**: 직접 파일 수정 대신 inbox.md 경유
