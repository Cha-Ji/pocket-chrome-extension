---
name: three-file-docs
description: 복잡한 작업에서 3-File Documentation Strategy(Planning with Files)를 강제 적용해 `task_plan.md`, `findings.md`, `progress.md`를 생성·유지·갱신하는 스킬. 사용자가 3-File 방식/문서화 전략을 요청했거나, 다단계 계획·조사·구현이 필요한 작업을 진행할 때 사용.
---

# Three File Docs

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

## 참고 자료

- `references/file-templates.md`: 각 파일의 기본 템플릿과 형식 규칙
