# 문서화 운영 규칙

이 문서는 프로젝트 문서화의 기본 규칙을 요약합니다.

## 기본 구조

- `docs/head/plan.md`: 헤드 인덱스(요약 + 링크)
- `docs/head/task_plan.md`: 상위 체크리스트
- `docs/head/findings.md`: 핵심 발견사항/결정/제약
- `docs/head/progress.md`: 진행 로그(역순)
- `docs/head/map.md`: 아키텍처 ↔ 기능 매핑
- `docs/head/parallel-work.md`: 병렬 작업 분류 및 상태

## 3-file 규칙

모든 작업 폴더는 아래 3개 파일을 반드시 포함합니다.

- `task_plan.md`: 체크리스트(항목은 진행 시 체크)
- `findings.md`: 결정 사항, 제약/가정, 핵심 정보, 코드 스니펫
- `progress.md`: 날짜별 진행 로그(최신이 위)

## 폴더 체계

- 아키텍처: `docs/architecture/`
  - `content-script/`
  - `background-service-worker/`
  - `side-panel-ui/`
  - `local-database/`
- 기능: `docs/features/`
  - `data-collector/`
  - `navigator/`
  - `executor/`
  - `technical-analyst/`
  - `backtester-logger/`

각 하위 폴더도 3-file 규칙을 적용합니다.

## 병렬 작업 상태 규칙

`docs/head/parallel-work.md`의 체크박스 상태는 다음과 같이 사용합니다.

- `- [ ]` 시작 전
- `- [~]` 진행 중
- `- [x]` 완료

## 작성 원칙

- 중복 기록 금지, 나중에 재참조 가치가 높은 정보 위주
- 변경 시 즉시 문서 반영(요약은 `head`, 상세는 해당 폴더)
