---
name: 3-file-pattern
description: 현재 문서 운영 모델(BOARD.md + Wiki)에 맞춰 세션 핸드오프/상태 기록/결정 기록을 일관되게 수행하고, 필요 시에만 레거시 3-file 문서를 참조·갱신하는 스킬.
---

# BOARD-First Documentation Pattern

## 개요

문서 운영 기준이 `docs/BOARD.md` + `../pocket-chrome-extension.wiki`로 전환되었으므로,
이 스킬은 상태판 중심의 작업 추적을 강제한다.

`task_plan.md`, `findings.md`, `progress.md`는 기본 운영 대상이 아니라 **레거시 아카이브(`docs/archive/`)**로 취급한다.

## 핵심 규칙

- 코드/문서 수정이 필요하면 항상 `git-worktree` 스킬로 분리 브랜치를 만든 뒤 해당 worktree에서 작업한다.
- 메인 체크아웃 경로에서 직접 수정하지 않는다.
- 작업 종료 기준은 `commit` + `push` + `PR 생성`까지 완료하는 것이다.
- 세션 시작 시 항상 `docs/BOARD.md`를 먼저 읽는다.
- `docs/head/*`는 운영 중단 경로이므로 새 기록을 남기지 않는다.
- 실시간 상태/차단/결정은 `docs/BOARD.md`에만 기록한다.
- 장기 참조/아카이브/작업 이력은 `docs/wiki`(=`../pocket-chrome-extension.wiki`)를 사용한다.
- 팀 간 전달 사항은 `docs/teams/{planning|dev|qa}/inbox.md`에 append 한다.
- 응답 종료 시 업데이트한 파일을 명시한다.

## 워크플로

1. `git-worktree`로 작업 브랜치를 분리 생성하고, 생성된 worktree 경로로 이동한다.
2. `docs/BOARD.md` 확인:
   - Active Tasks(누가 무엇을 하는지)
   - Recent Decisions(최근 기술 결정)
   - Blocked / Needs Attention
3. 필요 시 자기 작업 상태를 `BOARD.md`의 자기 행에 반영한다.
   - Status: `idle|researching|coding|testing|reviewing|blocked`
   - 충돌 방지를 위해 자기 행만 수정한다.
4. 구현/조사 중 새 기술 결정이 생기면 `Recent Decisions` 맨 위에 추가한다.
   - 5개 초과 시 오래된 항목은 Wiki `[[Key-Decisions]]`로 이동한다.
5. 세션 종료/중단 시 자기 행의 상태와 요약을 최신화한다.
6. 최종 응답에 이번 턴의 문서 반영 내역을 명시한다.

## Wiki 연동 규칙

- Wiki 원본 저장소: `../pocket-chrome-extension.wiki`
- 레포 내 편의 경로: `docs/wiki` (symlink)
- Worklog 정책:
  - 실시간 상태는 `BOARD.md`
  - 이력/회고는 Wiki `Worklog/`
  - 자동화 명령: `npm run wiki:daily`, `npm run wiki:rollup`

## 레거시 3-file 처리 (예외)

다음 경우에만 3-file 문서를 다룬다.

1. 사용자가 명시적으로 `task_plan.md/findings.md/progress.md` 업데이트를 요청한 경우
2. `docs/archive/`의 과거 작업을 복원/분석하는 경우

규칙:
- 새 기능을 위해 `docs/` 루트에 3-file 구조를 재생성하지 않는다.
- 기존 아카이브 문서는 필요 최소 범위로만 읽고 갱신한다.

## 헬스체크 로깅

매 턴마다, 자신이 사용한 컨텍스트와 행동을 요약한 헬스체크 로그 블록을 답변 마지막에 추가하라.
이 블록은 사용자가 원할 경우 파싱해서 따로 저장할 수 있도록, 명확한 마크업 형식으로 작성한다.

```text
--- healthcheck ---
context_used:
  board_tokens: 대략적인 토큰 수 혹은 줄 수
  wiki_tokens: 대략적인 토큰 수 혹은 줄 수
  inbox_tokens: 대략적인 토큰 수 혹은 줄 수
  extra_context: (있다면) 외부 문서/툴 결과의 간단한 설명
actions:
  - type: update_board | update_wiki | update_inbox | update_legacy_3file | no_update
    details: 어떤 업데이트를 했는지 한 줄 설명
ab_test_variant: <현재 사용 중인 변형 이름 또는 ID> (예: "variant_a" / "short_context" 등)
notes: 모델 입장에서 느낀 컨텍스트 품질이나 문제점이 있다면 짧게 남긴다.
--- end_healthcheck ---
```

- `context_used`에는 "무엇을 얼마나 참고했는지"를 대략적으로 적어라 (정확한 토큰 수가 아니라도 된다).
- `actions`에는 이번 턴에서 실제로 파일에 반영해야 할 변경 사항을 요약해서 나열하라.
- `ab_test_variant`는 시스템에서 주입한 변형 이름이 있다면 그대로, 없다면 "default"로 적어라.
- 사용자가 헬스체크 블록을 숨기거나 끄라고 명시적으로 요청한 경우를 제외하고, 항상 포함하라.

## 도구를 맥락 생산자로 취급하기

코드 실행, 웹 검색, DB 조회 등 모든 도구 호출은 새로운 컨텍스트 조각을 생성하는 과정으로 생각하라.

각 도구 호출 후에는, 결과를 곧바로 그대로 쓰지 말고 다음 기준으로 요약하라:

1. 이 결과가 이번 작업의 목표와 어떻게 연결되는지
2. `BOARD.md` 또는 Wiki에 기록해야 할 "재사용 가능한 인사이트/결정"은 무엇인지
3. 팀 inbox 전달이 필요한 의존/요청 사항이 있는지

요약은 리스트·섹션·테이블 등 구조화된 형태를 선호하여, 나중에 다시 읽을 때 빠르게 스캔할 수 있도록 하라.

## A/B 테스트 컨텍스트 변형 처리

이 스킬은 같은 태스크에 대해 여러 가지 "컨텍스트 전략"을 A/B 테스트할 수 있다.
시스템이 `ab_test_variant`를 지시하면, 다음과 같이 행동하라:

### variant_a
- `docs/BOARD.md`를 전체 확인하고, Wiki 관련 페이지를 폭넓게 읽어 문맥을 최대한 보존한다.

### variant_b
- `docs/BOARD.md` 핵심 섹션만 요약하고, 필요한 Wiki 섹션만 선택적으로 읽는다.
- "최소 충분 컨텍스트"를 엄격하게 추구한다.

### variant_c
- 시스템이 제공한 추가 외부 컨텍스트(예: RAG 결과)를 우선 사용하고, BOARD/Wiki는 검증용으로만 참조한다.
- 외부 지식 비중이 높은 태스크를 위한 전략이다.

어떤 변형을 사용하든, 헬스체크 블록의 `ab_test_variant` 필드에 현재 변형 이름을 반드시 기록하라.

## 응답 포맷

사용자에게 보내는 최종 응답은 다음 구조를 따른다:

1. 이번 턴의 결론/결과를 한두 문장으로 요약
2. 필요한 경우, 구체적인 설명·코드·리스트
3. (옵션) `docs/BOARD.md` / Wiki / inbox에 반영한 변경 요약
4. 맨 마지막에 `--- healthcheck ---` 블록

## 참고 자료

- `references/file-templates.md`: BOARD/Wiki/inbox 기본 템플릿과 레거시 3-file 예외 규칙
