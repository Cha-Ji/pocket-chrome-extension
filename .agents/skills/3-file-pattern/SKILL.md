---
name: 3-file-pattern
description: 복잡한 작업에서 3-File Documentation Strategy(Planning with Files)를 강제 적용해 `task_plan.md`, `findings.md`, `progress.md`를 생성·유지·갱신하는 스킬. 사용자가 3-File 방식/문서화 전략을 요청했거나, 다단계 계획·조사·구현이 필요한 작업을 진행할 때 사용.
---

# 3-File Pattern

## 개요

복잡한 작업을 수행할 때 `task_plan.md`, `findings.md`, `progress.md` 3개 파일을 중심으로 계획·지식·진행 상황을 관리하도록 강제한다.

## 핵심 규칙

- 시작 전에 `task_plan.md`, `progress.md`를 반드시 읽어 현재 맥락을 파악하라.
- 3개 파일이 없으면 즉시 생성하라(기본 템플릿은 `references/file-templates.md` 참고).
- 새로운 사실/제약/결정은 발견 즉시 `findings.md`에 기록하라.
- 하위 작업을 완료할 때마다 `task_plan.md` 체크박스를 갱신하라.
- 작업 중간 상태와 다음 행동을 `progress.md`에 기록하라.
- 응답 종료 시 어떤 파일을 업데이트했는지 명시하라.

## 워크플로

1. 작업 시작 시 `task_plan.md`와 `progress.md`를 읽고, 현재 진행 상태를 요약하라.
2. 3개 파일이 누락되어 있으면 `references/file-templates.md`에 따라 생성하라.
3. 실행 중 발견한 정보는 `findings.md`에 즉시 추가하라.
4. 완료된 하위 작업은 `task_plan.md`에서 체크하라.
5. 현재 세션의 상태와 즉시 다음 행동은 `progress.md` 최상단에 기록하라.
6. 최종 응답에 업데이트한 파일명을 명시하라.

## 헬스체크 로깅

매 턴마다, 자신이 사용한 컨텍스트와 행동을 요약한 헬스체크 로그 블록을 답변 마지막에 추가하라.
이 블록은 사용자가 원할 경우 파싱해서 따로 저장할 수 있도록, 명확한 마크업 형식으로 작성한다.

```text
--- healthcheck ---
context_used:
  task_plan_tokens: 대략적인 토큰 수 혹은 줄 수
  findings_tokens: 대략적인 토큰 수 혹은 줄 수
  progress_tokens: 대략적인 토큰 수 혹은 줄 수
  extra_context: (있다면) 외부 문서/툴 결과의 간단한 설명
actions:
  - type: update_task_plan | update_findings | update_progress | no_update
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
2. `findings.md`에 기록해야 할 "장기적으로 재사용 가능한 인사이트"는 무엇인지
3. `progress.md`에 남길 "이번 시도에 특화된 로그"는 무엇인지

요약은 리스트·섹션·테이블 등 구조화된 형태를 선호하여, 나중에 다시 읽을 때 빠르게 스캔할 수 있도록 하라.

## A/B 테스트 컨텍스트 변형 처리

이 스킬은 같은 태스크에 대해 여러 가지 "컨텍스트 전략"을 A/B 테스트할 수 있다.
시스템이 `ab_test_variant`를 지시하면, 다음과 같이 행동하라:

### variant_a
- `task_plan.md`의 전체를 읽되, `findings.md`는 최근 항목(예: 최근 N개의 발견)만 우선적으로 사용하라.
- 컨텍스트를 길게 유지하되, 요약보다는 "많이 읽기"에 치우친 전략이다.

### variant_b
- `task_plan.md`와 `progress.md`를 간단히 요약한 뒤, `findings.md`에서 현재 질문과 의미적으로 가장 관련 있는 부분만 선택해 사용하라.
- "최소 충분 컨텍스트"를 더 엄격하게 추구하는 전략이다.

### variant_c
- 시스템이 제공한 추가 외부 컨텍스트(예: RAG 결과)를 우선 사용하고, 3파일은 필요할 때만 부분적으로 참조한다.
- 외부 지식 비중이 높은 태스크를 위한 전략이다.

어떤 변형을 사용하든, 헬스체크 블록의 `ab_test_variant` 필드에 현재 변형 이름을 반드시 기록하라.

## 응답 포맷

사용자에게 보내는 최종 응답은 다음 구조를 따른다:

1. 이번 턴의 결론/결과를 한두 문장으로 요약
2. 필요한 경우, 구체적인 설명·코드·리스트
3. (옵션) `task_plan.md`, `findings.md`, `progress.md`에 적용할 변경 내용을 요약한 섹션
4. 맨 마지막에 `--- healthcheck ---` 블록

## 참고 자료

- `references/file-templates.md`: 각 파일의 기본 템플릿과 형식 규칙
